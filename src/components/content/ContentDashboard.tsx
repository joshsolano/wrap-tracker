import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { B } from '../../lib/utils'
import type { Project, ProjectContentStatus } from '../../lib/types'

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
  const [loading, setLoading] = useState(true)
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'needs' | 'all'>('needs')

  useEffect(() => {
    load()
    // Realtime refresh on project changes
    const ch = supabase.channel('content_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_content_status' }, load)
      .subscribe()
    return () => { ch.unsubscribe() }
  }, [])

  async function load() {
    // Fetch all non-archived projects with panels
    const { data: projects } = await supabase
      .from('projects')
      .select('*, panels:panels(*)')
      .eq('archived', false)
      .order('created_at', { ascending: false })

    // Fetch all complete logs (to compute project completion)
    const { data: logs } = await supabase
      .from('logs')
      .select('project_id, panel_id, status, voided')
      .eq('status', 'Complete')

    // Fetch content statuses
    const { data: statuses } = await supabase
      .from('project_content_status')
      .select('*')

    if (!projects) { setLoading(false); return }

    // Compute completion per project (same logic as Projects tab)
    const donePanelsByProj = new Map<string, Set<string>>()
    for (const log of (logs ?? [])) {
      if (!log.panel_id) continue
      if (!donePanelsByProj.has(log.project_id)) donePanelsByProj.set(log.project_id, new Set())
      donePanelsByProj.get(log.project_id)!.add(log.panel_id)
    }

    const result: ProjectRow[] = (projects as Project[]).map(p => {
      const panels = p.panels ?? []
      const done = donePanelsByProj.get(p.id)
      const isComplete = panels.length > 0 && panels.every(pnl => done?.has(pnl.id))
      const status = (statuses ?? []).find(s => s.project_id === p.id) as ProjectContentStatus | null
      return { project: p, isComplete, status }
    })

    setRows(result)
    setLoading(false)
  }

  async function markStatus(
    projectId: string,
    field: 'before' | 'after',
    value: 'taken' | 'skipped',
    note: string
  ) {
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
      await supabase.from('project_content_status').insert({
        before_status: 'pending',
        after_status: 'pending',
        ...payload,
      })
    }
    setSaving(false)
    setNoteModal(null)
    await load()
  }

  const { needsAttention } = useMemo(() => {
    const needs: ProjectRow[] = []
    const finished: ProjectRow[] = []
    for (const r of rows) {
      const bs = r.status?.before_status ?? 'pending'
      const as_ = r.status?.after_status ?? 'pending'
      const needsBefore = bs === 'pending'
      const needsAfter = r.isComplete && as_ === 'pending'
      if (needsBefore || needsAfter) needs.push(r)
      else finished.push(r)
    }
    return { needsAttention: needs, done: finished }
  }, [rows])

  const visible = filter === 'needs' ? needsAttention : rows

  function StatusChip({ status }: { status: 'pending' | 'taken' | 'skipped' }) {
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color: STATUS_COLOR[status], background: STATUS_COLOR[status] + '20', borderRadius: 6, padding: '2px 7px', letterSpacing: '0.04em' }}>
        {STATUS_LABEL[status]}
      </span>
    )
  }

  function ActionButtons({ row, field }: { row: ProjectRow; field: 'before' | 'after' }) {
    const current = field === 'before' ? row.status?.before_status : row.status?.after_status
    if (current === 'taken') return <StatusChip status="taken" />
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {current !== 'pending' && <StatusChip status={current ?? 'pending'} />}
        <button
          onClick={() => setNoteModal({ projectId: row.project.id, projectName: row.project.name, field, action: 'taken', note: '' })}
          style={{ fontSize: 11, fontWeight: 700, color: B.green, background: B.green + '15', border: `1px solid ${B.green}44`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}
        >
          Mark Taken
        </button>
        <button
          onClick={() => setNoteModal({ projectId: row.project.id, projectName: row.project.name, field, action: 'skipped', note: '' })}
          style={{ fontSize: 11, fontWeight: 600, color: B.textTer, background: 'transparent', border: `1px solid ${B.border}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}
        >
          Skip
        </button>
      </div>
    )
  }

  return (
    <div style={{ background: B.bg, minHeight: '100dvh', padding: '0 0 48px' }}>
      {/* Note / reason modal */}
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
              <button
                onClick={() => setNoteModal(null)}
                style={{ flex: 1, background: B.surface2, color: B.text, border: 'none', borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
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
        {/* Filter toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {([['needs', `Needs Attention (${needsAttention.length})`], ['all', `All Projects (${rows.length})`]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${filter === val ? B.yellow : B.border}`, background: filter === val ? B.yellow + '18' : 'transparent', color: filter === val ? B.yellow : B.textSec, fontWeight: filter === val ? 700 : 400, fontSize: 13, cursor: 'pointer' }}
            >
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
              const bs = row.status?.before_status ?? 'pending'
              const as_ = row.status?.after_status ?? 'pending'
              const needsBefore = bs === 'pending'
              const needsAfter = row.isComplete && as_ === 'pending'
              const highlight = needsBefore || needsAfter
              return (
                <div
                  key={row.project.id}
                  style={{ background: B.surface, borderRadius: 16, border: `1px solid ${highlight ? B.yellow + '44' : B.border}`, padding: '16px' }}
                >
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

                  {/* Before */}
                  <div style={{ background: B.surface2, borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: B.textSec }}>📷 Before Photos</div>
                      <ActionButtons row={row} field="before" />
                    </div>
                    {row.status?.before_note && (
                      <div style={{ fontSize: 11, color: B.textTer, marginTop: 6, fontStyle: 'italic' }}>"{row.status.before_note}"</div>
                    )}
                  </div>

                  {/* After */}
                  <div style={{ background: B.surface2, borderRadius: 10, padding: '10px 12px', opacity: row.isComplete ? 1 : 0.45 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: B.textSec }}>🎬 After Photos/Video</div>
                      {row.isComplete
                        ? <ActionButtons row={row} field="after" />
                        : <span style={{ fontSize: 11, color: B.textTer }}>Available when complete</span>
                      }
                    </div>
                    {row.status?.after_note && (
                      <div style={{ fontSize: 11, color: B.textTer, marginTop: 6, fontStyle: 'italic' }}>"{row.status.after_note}"</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
