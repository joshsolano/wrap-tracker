import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { B } from '../../lib/utils'
import type { Project, ProjectContentStatus, ProjectPhoto } from '../../lib/types'

const STATUS_COLOR = { pending: B.yellow, taken: B.green, skipped: B.textTer }
const STATUS_LABEL = { pending: 'Pending', taken: 'Taken ✓', skipped: 'Skipped' }

interface ProjectRow {
  project: Project
  isComplete: boolean
  status: ProjectContentStatus | null
}

interface NoteModalState {
  projectId: string
  projectName: string
  field: 'before' | 'after'
  action: 'taken' | 'skipped'
  note: string
}

export default function ContentDashboard() {
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [photos, setPhotos] = useState<Map<string, ProjectPhoto[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<{ projectId: string; type: 'before' | 'after' } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filter, setFilter] = useState<'needs' | 'all'>('needs')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingUpload = useRef<{ projectId: string; type: 'before' | 'after' } | null>(null)

  useEffect(() => {
    loadAll()
    const ch = supabase.channel('content_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_content_status' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_photos' }, loadPhotos)
      .subscribe()
    return () => { ch.unsubscribe() }
  }, [])

  async function loadAll() {
    const [projectsRes, logsRes, statusesRes] = await Promise.all([
      supabase.from('projects').select('*, panels:panels(*)').eq('archived', false).order('created_at', { ascending: false }),
      supabase.from('logs').select('project_id, panel_id, status').eq('status', 'Complete'),
      supabase.from('project_content_status').select('*'),
    ])

    if (!projectsRes.data) { setLoading(false); return }

    const donePanelsByProj = new Map<string, Set<string>>()
    for (const log of (logsRes.data ?? [])) {
      if (!log.panel_id) continue
      if (!donePanelsByProj.has(log.project_id)) donePanelsByProj.set(log.project_id, new Set())
      donePanelsByProj.get(log.project_id)!.add(log.panel_id)
    }

    const result: ProjectRow[] = (projectsRes.data as Project[]).map(p => {
      const panels = p.panels ?? []
      const done = donePanelsByProj.get(p.id)
      const isComplete = panels.length > 0 && panels.every(pnl => done?.has(pnl.id))
      const status = (statusesRes.data ?? []).find(s => s.project_id === p.id) as ProjectContentStatus | null
      return { project: p, isComplete, status }
    })

    setRows(result)
    setLoading(false)
    await loadPhotos()
  }

  async function loadPhotos() {
    const { data } = await supabase.from('project_photos').select('*').order('created_at')
    if (!data) return
    const map = new Map<string, ProjectPhoto[]>()
    for (const p of data as ProjectPhoto[]) {
      const url = supabase.storage.from('project-photos').getPublicUrl(p.storage_path).data.publicUrl
      const photo = { ...p, publicUrl: url }
      if (!map.has(p.project_id)) map.set(p.project_id, [])
      map.get(p.project_id)!.push(photo)
    }
    setPhotos(map)
  }

  function triggerUpload(projectId: string, type: 'before' | 'after') {
    pendingUpload.current = { projectId, type }
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const target = pendingUpload.current
    if (!files.length || !target) return
    e.target.value = ''

    setUploading(target)
    let anyUploaded = false
    for (const file of files) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${target.projectId}/${target.type}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from('project-photos').upload(path, file)
      if (upErr) { alert('Upload failed: ' + upErr.message); continue }
      const { error: dbErr } = await supabase.from('project_photos').insert({ project_id: target.projectId, type: target.type, storage_path: path })
      if (dbErr) { alert('Save failed: ' + dbErr.message); continue }
      anyUploaded = true
    }

    // Auto-mark as taken when a photo is uploaded
    if (anyUploaded) {
      await markStatus(target.projectId, target.type, 'taken', '')
    }

    setUploading(null)
    pendingUpload.current = null
    await loadPhotos()
  }

  async function handleDelete(photo: ProjectPhoto) {
    setDeleting(photo.id)
    await supabase.storage.from('project-photos').remove([photo.storage_path])
    await supabase.from('project_photos').delete().eq('id', photo.id)
    setDeleting(null)
    await loadPhotos()
  }

  async function markStatus(projectId: string, field: 'before' | 'after', value: 'taken' | 'skipped', note: string) {
    setSaving(true)
    const existing = rows.find(r => r.project.id === projectId)?.status
    const payload = {
      project_id: projectId,
      [`${field}_status`]: value,
      [`${field}_note`]: note || null,
      updated_at: new Date().toISOString(),
    }
    if (existing) {
      await supabase.from('project_content_status').update(payload).eq('project_id', projectId)
    } else {
      await supabase.from('project_content_status').insert({ before_status: 'pending', after_status: 'pending', ...payload })
    }
    setSaving(false)
    setNoteModal(null)
    await loadAll()
  }

  const { needsAttention } = useMemo(() => {
    const needs: ProjectRow[] = []
    for (const r of rows) {
      const needsBefore = (r.status?.before_status ?? 'pending') === 'pending'
      const needsAfter = r.isComplete && (r.status?.after_status ?? 'pending') === 'pending'
      if (needsBefore || needsAfter) needs.push(r)
    }
    return { needsAttention: needs }
  }, [rows])

  const visible = filter === 'needs' ? needsAttention : rows

  function StatusChip({ status }: { status: 'pending' | 'taken' | 'skipped' }) {
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[status], background: STATUS_COLOR[status] + '20', borderRadius: 6, padding: '2px 7px', letterSpacing: '0.04em' }}>
        {STATUS_LABEL[status]}
      </span>
    )
  }

  function PhotoRow({ projectId, type, enabled }: { projectId: string; type: 'before' | 'after'; enabled: boolean }) {
    const projectPhotos = (photos.get(projectId) ?? []).filter(p => p.type === type)
    const isUploading = uploading?.projectId === projectId && uploading?.type === type
    const label = type === 'before' ? '📷 Before Photos' : '🎬 After Photos/Video'
    const row = rows.find(r => r.project.id === projectId)
    const currentStatus = type === 'before' ? row?.status?.before_status : row?.status?.after_status
    const note = type === 'before' ? row?.status?.before_note : row?.status?.after_note

    return (
      <div style={{ background: B.surface2, borderRadius: 10, padding: '10px 12px', marginBottom: 8, opacity: enabled ? 1 : 0.45 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: projectPhotos.length > 0 ? 10 : 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.textSec }}>{label}</div>
          {enabled ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {currentStatus === 'taken' && <StatusChip status="taken" />}
              {currentStatus === 'skipped' && <StatusChip status="skipped" />}
              {/* Only show Mark Taken if no photos uploaded yet */}
              {currentStatus !== 'taken' && projectPhotos.length === 0 && (
                <button
                  onClick={() => setNoteModal({ projectId, projectName: row?.project.name ?? '', field: type, action: 'taken', note: '' })}
                  style={{ fontSize: 11, fontWeight: 700, color: B.green, background: B.green + '15', border: `1px solid ${B.green}44`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}
                >
                  Mark Taken
                </button>
              )}
              {currentStatus !== 'taken' && (
                <button
                  onClick={() => setNoteModal({ projectId, projectName: row?.project.name ?? '', field: type, action: 'skipped', note: '' })}
                  style={{ fontSize: 11, fontWeight: 600, color: B.textTer, background: 'transparent', border: `1px solid ${B.border}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}
                >
                  Skip
                </button>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 11, color: B.textTer }}>Available when complete</span>
          )}
        </div>

        {/* Photo thumbnails + upload */}
        {enabled && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: projectPhotos.length > 0 ? 0 : 8 }}>
            {projectPhotos.map(photo => (
              <div key={photo.id} style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
                <img
                  src={photo.publicUrl}
                  style={{ width: 72, height: 72, borderRadius: 9, objectFit: 'cover', display: 'block', border: `1px solid ${B.border}` }}
                  alt={type}
                />
                <button
                  onClick={() => handleDelete(photo)}
                  disabled={deleting === photo.id}
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: B.red, color: '#fff', border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
                >×</button>
              </div>
            ))}
            <button
              onClick={() => triggerUpload(projectId, type)}
              disabled={isUploading}
              style={{ width: 72, height: 72, borderRadius: 9, border: `1.5px dashed ${B.border}`, background: 'transparent', color: isUploading ? B.textTer : B.yellow, fontSize: isUploading ? 11 : 24, cursor: isUploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700 }}
            >
              {isUploading ? 'Uploading…' : '+'}
            </button>
          </div>
        )}

        {note && <div style={{ fontSize: 11, color: B.textTer, marginTop: 6, fontStyle: 'italic' }}>"{note}"</div>}
      </div>
    )
  }

  return (
    <div style={{ background: B.bg, minHeight: '100dvh', padding: '0 0 48px' }}>
      {/* Hidden file input shared across all upload buttons */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Note modal */}
      {noteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: B.surface, borderRadius: 20, padding: 24, width: '100%', maxWidth: 380, border: `1px solid ${B.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>
              {noteModal.action === 'taken' ? '✓ Mark as Taken' : 'Skip Photos'}
            </div>
            <div style={{ fontSize: 12, color: B.textTer, marginBottom: 16 }}>
              {noteModal.projectName} — {noteModal.field} photos
            </div>
            <textarea
              placeholder={noteModal.action === 'taken' ? 'Optional note…' : 'Reason for skipping…'}
              value={noteModal.note}
              onChange={e => setNoteModal(m => m ? { ...m, note: e.target.value } : m)}
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 10, background: B.surface2, color: B.text, border: 'none', outline: 'none', resize: 'vertical', minHeight: 80, marginBottom: 16, fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setNoteModal(null)} style={{ flex: 1, background: B.surface2, color: B.text, border: 'none', borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={() => markStatus(noteModal.projectId, noteModal.field, noteModal.action, noteModal.note)}
                disabled={saving}
                style={{ flex: 1, background: noteModal.action === 'taken' ? B.green : B.surface3, color: noteModal.action === 'taken' ? '#fff' : B.text, border: 'none', borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 0' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {([['needs', `Needs Attention (${needsAttention.length})`], ['all', `All Projects (${rows.length})`]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${filter === val ? B.yellow : B.border}`, background: filter === val ? B.yellow + '18' : 'transparent', color: filter === val ? B.yellow : B.textSec, fontWeight: filter === val ? 700 : 400, fontSize: 13, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: B.textTer, padding: 40 }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', color: B.textTer, padding: 48, fontSize: 14 }}>
            {filter === 'needs' ? '✓ All caught up!' : 'No projects yet.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visible.map(row => {
              const needsBefore = (row.status?.before_status ?? 'pending') === 'pending'
              const needsAfter = row.isComplete && (row.status?.after_status ?? 'pending') === 'pending'
              const highlight = needsBefore || needsAfter
              return (
                <div key={row.project.id} style={{ background: B.surface, borderRadius: 16, border: `1px solid ${highlight ? B.yellow + '44' : B.border}`, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{row.project.name}</div>
                      <div style={{ fontSize: 11, color: B.textTer, marginTop: 2 }}>
                        {row.isComplete ? <span style={{ color: B.green }}>✓ Complete</span> : <span style={{ color: B.yellow }}>In Progress</span>}
                        {row.project.project_type === 'colorchange' && <span style={{ color: '#A78BFA', marginLeft: 8 }}>CC</span>}
                      </div>
                    </div>
                    {highlight && (
                      <div style={{ fontSize: 10, fontWeight: 800, color: B.yellow, background: B.yellow + '18', borderRadius: 8, padding: '3px 10px', letterSpacing: '0.04em', flexShrink: 0 }}>
                        ACTION NEEDED
                      </div>
                    )}
                  </div>
                  <PhotoRow projectId={row.project.id} type="before" enabled={true} />
                  <PhotoRow projectId={row.project.id} type="after" enabled={row.isComplete} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
