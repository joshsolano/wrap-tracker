import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { B, fmtTime } from '../../lib/utils'
import type { Project, Log, Installer, ProjectPhoto } from '../../lib/types'

interface Props {
  project: Project
  projLogs: Log[]
  installers: Installer[]
  onTimeBadge: string | null
  completionTs: number | null
  totalPanelSqft: number | null
  isAdmin: boolean
  onClose: () => void
}

export function ProjectSummaryModal({ project, projLogs, installers, onTimeBadge, completionTs, isAdmin, onClose }: Props) {
  const [photos, setPhotos] = useState<ProjectPhoto[]>([])
  const [uploading, setUploading] = useState<'before' | 'after' | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const beforeRef = useRef<HTMLInputElement>(null)
  const afterRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadPhotos()
  }, [project.id])

  async function loadPhotos() {
    const { data } = await supabase
      .from('project_photos')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at')
    if (!data) return
    const withUrls = data.map((p: ProjectPhoto) => ({
      ...p,
      publicUrl: supabase.storage.from('project-photos').getPublicUrl(p.storage_path).data.publicUrl,
    }))
    setPhotos(withUrls)
  }

  async function handleUpload(type: 'before' | 'after', file: File) {
    setUploading(type)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${project.id}/${type}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('project-photos').upload(path, file, { upsert: false })
    if (upErr) { setUploading(null); alert('Upload failed: ' + upErr.message); return }
    const { error: dbErr } = await supabase.from('project_photos').insert({ project_id: project.id, type, storage_path: path })
    if (dbErr) { setUploading(null); alert('Save failed: ' + dbErr.message); return }
    setUploading(null)
    await loadPhotos()
  }

  async function handleDelete(photo: ProjectPhoto) {
    setDeleting(photo.id)
    await supabase.storage.from('project-photos').remove([photo.storage_path])
    await supabase.from('project_photos').delete().eq('id', photo.id)
    setPhotos(prev => prev.filter(p => p.id !== photo.id))
    setDeleting(null)
  }

  const stats = useMemo(() => {
    const validLogs = projLogs.filter(r => r.sqft && r.sqft > 0 && r.mins && r.mins > 0)
    const totalSqft = validLogs.reduce((s, r) => s + (r.sqft ?? 0), 0)
    const totalMins = validLogs.reduce((s, r) => s + (r.mins ?? 0), 0)
    const sqftHr = totalMins > 0 ? totalSqft / (totalMins / 60) : 0
    const panelCount = projLogs.length
    const starts = validLogs.map(r => new Date(r.start_ts).getTime())
    const finishes = validLogs.map(r => new Date(r.finish_ts).getTime())
    const firstStart = starts.length ? Math.min(...starts) : null
    const lastFinish = finishes.length ? Math.max(...finishes) : null
    const daysElapsed = firstStart && lastFinish ? Math.max(1, Math.ceil((lastFinish - firstStart) / 86400000)) : null
    const byInst = new Map<string, { name: string; color: string; sqft: number; mins: number }>()
    for (const r of validLogs) {
      const inst = installers.find(i => i.id === r.installer_id)
      if (!inst) continue
      const cur = byInst.get(inst.id) ?? { name: inst.name, color: inst.color, sqft: 0, mins: 0 }
      cur.sqft += r.sqft ?? 0; cur.mins += r.mins ?? 0
      byInst.set(inst.id, cur)
    }
    const team = Array.from(byInst.values()).sort((a, b) => b.sqft - a.sqft)
    const largestPanel = validLogs.reduce<Log | null>((best, r) => (!best || (r.sqft ?? 0) > (best.sqft ?? 0)) ? r : best, null)
    const fastestPanel = validLogs.reduce<Log | null>((best, r) => (!best || (r.mins ?? Infinity) < (best.mins ?? Infinity)) ? r : best, null)
    return { totalSqft, totalMins, sqftHr, panelCount, team, largestPanel, fastestPanel, daysElapsed }
  }, [projLogs, installers])

  const beforePhotos = photos.filter(p => p.type === 'before')
  const afterPhotos = photos.filter(p => p.type === 'after')

  const completedDate = completionTs
    ? new Date(completionTs).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Recently'

  function handlePrint() {
    const photoGridHTML = (list: ProjectPhoto[], label: string) => list.length === 0 ? '' : `
      <div>
        <div class="section-label">${label}</div>
        <div class="photo-grid">
          ${list.map(p => `<img src="${p.publicUrl}" class="photo" alt="${label}" />`).join('')}
        </div>
      </div>`

    const teamRows = stats.team.map(t => {
      const pct = stats.totalSqft > 0 ? Math.round((t.sqft / stats.totalSqft) * 100) : 0
      return `<div class="team-row">
        <div class="avatar" style="background:${t.color}">${t.name.charAt(0)}</div>
        <div class="team-name">${t.name.split(' ')[0]}</div>
        <div class="team-bar-wrap"><div class="team-bar" style="width:${pct}%;background:${t.color}"></div></div>
        <div class="team-stat">${t.sqft.toFixed(0)} sqft · ${pct}%</div>
      </div>`
    }).join('')

    const facts: string[] = []
    if (onTimeBadge) facts.push(`${onTimeBadge.includes('early') || onTimeBadge === 'On time' ? '🏁' : '⏰'} <strong>${onTimeBadge}</strong>${onTimeBadge.includes('early') ? ' — ahead of schedule' : onTimeBadge === 'On time' ? ' — right on schedule' : ''}`)
    if (stats.daysElapsed) facts.push(`📅 Completed in <strong>${stats.daysElapsed} day${stats.daysElapsed !== 1 ? 's' : ''}</strong>`)
    if (stats.totalSqft > 0) facts.push(`📐 <strong>${stats.totalSqft.toFixed(1)} sq ft</strong> of professional film applied`)
    if (stats.largestPanel) facts.push(`📏 Largest panel: <strong>${stats.largestPanel.panel_name}</strong> (${(stats.largestPanel.sqft ?? 0).toFixed(1)} sqft)`)
    if (stats.fastestPanel) facts.push(`⚡ Fastest install: <strong>${stats.fastestPanel.panel_name}</strong> in ${fmtTime(stats.fastestPanel.mins)}`)
    if (stats.sqftHr > 0) facts.push(`🚀 Average wrap speed: <strong>${stats.sqftHr.toFixed(1)} sqft/hr</strong>`)

    const hasBefore = beforePhotos.length > 0
    const hasAfter = afterPhotos.length > 0

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Wrap Summary — ${project.name}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: #fff; color: #111; padding: 48px 52px; max-width: 860px; margin: 0 auto; }
.print-btn { display: flex; align-items: center; gap: 10px; background: #111; color: #fff; border: none; border-radius: 12px; padding: 12px 24px; font-size: 15px; font-weight: 700; cursor: pointer; margin-bottom: 40px; }
.print-btn:hover { background: #333; }
.badge { display: inline-flex; align-items: center; gap: 7px; background: #FFB800; color: #111; border-radius: 30px; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; padding: 5px 14px; margin-bottom: 16px; }
.project-title { font-size: 36px; font-weight: 900; line-height: 1.1; letter-spacing: -0.02em; margin-bottom: 6px; }
.project-date { font-size: 14px; color: #888; margin-bottom: 36px; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 36px; }
.stat { background: #f7f7f7; border-radius: 14px; padding: 16px 14px; text-align: center; }
.stat-value { font-size: 28px; font-weight: 900; line-height: 1; margin-bottom: 4px; }
.stat-label { font-size: 10px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 0.08em; }
.stat-accent { color: #FFB800; }
.section-label { font-size: 11px; font-weight: 800; color: #999; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #eee; }
.facts { list-style: none; display: flex; flex-direction: column; gap: 10px; margin-bottom: 36px; }
.facts li { font-size: 14px; color: #444; line-height: 1.4; }
.facts strong { color: #111; }
.photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-bottom: 36px; }
.photo { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 12px; display: block; }
.before-after { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 36px; }
.before-after-col .col-label { font-size: 11px; font-weight: 800; color: #999; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
.before-after-col .photo { aspect-ratio: 4/3; }
.team { display: flex; flex-direction: column; gap: 12px; margin-bottom: 40px; }
.team-row { display: flex; align-items: center; gap: 12px; }
.avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: #fff; flex-shrink: 0; }
.team-name { width: 70px; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.team-bar-wrap { flex: 1; height: 8px; background: #eee; border-radius: 4px; overflow: hidden; }
.team-bar { height: 100%; border-radius: 4px; }
.team-stat { font-size: 12px; color: #888; flex-shrink: 0; width: 110px; text-align: right; }
.footer { border-top: 1px solid #eee; padding-top: 18px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center; }
.footer-left, .footer-right { font-size: 12px; color: #bbb; }
@media print {
  .print-btn { display: none !important; }
  body { padding: 32px 40px; }
  @page { margin: 0.4in; size: letter; }
}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
<div class="badge">✓ Wrap Complete</div>
<div class="project-title">${project.name}</div>
<div class="project-date">Completed ${completedDate}${onTimeBadge ? ' · ' + onTimeBadge : ''}</div>
<div class="stats">
  <div class="stat"><div class="stat-value stat-accent">${stats.panelCount}</div><div class="stat-label">Panels</div></div>
  <div class="stat"><div class="stat-value">${stats.totalSqft > 0 ? stats.totalSqft.toFixed(1) : '--'}</div><div class="stat-label">Sq Ft</div></div>
  <div class="stat"><div class="stat-value">${stats.totalMins > 0 ? (stats.totalMins / 60).toFixed(1) + 'h' : '--'}</div><div class="stat-label">Hours</div></div>
  <div class="stat"><div class="stat-value">${stats.sqftHr > 0 ? stats.sqftHr.toFixed(1) : '--'}</div><div class="stat-label">Sqft / Hr</div></div>
</div>
${facts.length > 0 ? `<div class="section-label">Highlights</div><ul class="facts">${facts.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
${hasBefore && hasAfter ? `
<div class="section-label">Before &amp; After</div>
<div class="before-after">
  <div class="before-after-col">
    <div class="col-label">Before</div>
    ${beforePhotos.map(p => `<img src="${p.publicUrl}" class="photo" style="margin-bottom:10px" alt="Before"/>`).join('')}
  </div>
  <div class="before-after-col">
    <div class="col-label">After</div>
    ${afterPhotos.map(p => `<img src="${p.publicUrl}" class="photo" style="margin-bottom:10px" alt="After"/>`).join('')}
  </div>
</div>` : `
${photoGridHTML(beforePhotos, 'Before')}
${photoGridHTML(afterPhotos, 'After')}`}
${stats.team.length > 0 ? `<div class="section-label">Your Wrap Team</div><div class="team">${teamRows}</div>` : ''}
<div class="footer">
  <div class="footer-left">Professionally wrapped</div>
  <div class="footer-right">${completedDate}</div>
</div>
</body>
</html>`

    const win = window.open('', '_blank', 'width=900,height=980,scrollbars=yes')
    if (!win) { alert('Allow popups to open the summary.'); return }
    win.document.write(html)
    win.document.close()
    win.focus()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: B.surface, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', padding: '24px 20px 32px' }}>
        <div style={{ width: 36, height: 4, background: B.border, borderRadius: 2, margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: B.yellow, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>✓ Wrap Complete</div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.01em' }}>{project.name}</div>
            <div style={{ fontSize: 12, color: B.textTer, marginTop: 3 }}>Completed {completedDate}{onTimeBadge ? ` · ${onTimeBadge}` : ''}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: B.textTer, fontSize: 20, cursor: 'pointer', padding: 4 }}>×</button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 22 }}>
          {[
            { label: 'Panels', value: String(stats.panelCount), accent: true },
            { label: 'Sq Ft', value: stats.totalSqft > 0 ? stats.totalSqft.toFixed(1) : '--' },
            { label: 'Hours', value: stats.totalMins > 0 ? (stats.totalMins / 60).toFixed(1) + 'h' : '--' },
            { label: 'Sqft/Hr', value: stats.sqftHr > 0 ? stats.sqftHr.toFixed(1) : '--' },
          ].map(s => (
            <div key={s.label} style={{ background: B.surface2, borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.accent ? B.yellow : B.text }}>{s.value}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Before / After photos */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 12 }}>Before &amp; After Photos</div>
          {(['before', 'after'] as const).map(type => (
            <div key={type} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: B.textSec, marginBottom: 8, textTransform: 'capitalize' }}>{type}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {photos.filter(p => p.type === type).map(photo => (
                  <div key={photo.id} style={{ position: 'relative', width: 76, height: 76 }}>
                    <img
                      src={photo.publicUrl}
                      style={{ width: 76, height: 76, borderRadius: 10, objectFit: 'cover', display: 'block', border: `1px solid ${B.border}` }}
                      alt={type}
                    />
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(photo)}
                        disabled={deleting === photo.id}
                        style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: B.red, color: '#fff', border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}
                      >×</button>
                    )}
                  </div>
                ))}
                {isAdmin && (
                  <>
                    <input
                      ref={type === 'before' ? beforeRef : afterRef}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={async e => {
                        const files = Array.from(e.target.files ?? [])
                        for (const file of files) await handleUpload(type, file)
                        e.target.value = ''
                      }}
                    />
                    <button
                      onClick={() => (type === 'before' ? beforeRef : afterRef).current?.click()}
                      disabled={uploading === type}
                      style={{ width: 76, height: 76, borderRadius: 10, border: `1.5px dashed ${B.border}`, background: 'transparent', color: B.textTer, fontSize: 22, cursor: uploading === type ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      {uploading === type ? <span style={{ fontSize: 11 }}>…</span> : '+'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Highlights */}
        {stats.daysElapsed && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10 }}>Highlights</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                onTimeBadge && `🏁 ${onTimeBadge}${onTimeBadge.includes('early') ? ' — ahead of schedule' : onTimeBadge === 'On time' ? ' — right on schedule' : ''}`,
                `📅 Completed in ${stats.daysElapsed} day${stats.daysElapsed !== 1 ? 's' : ''}`,
                stats.largestPanel && `📏 Largest: ${stats.largestPanel.panel_name} (${(stats.largestPanel.sqft ?? 0).toFixed(1)} sqft)`,
                stats.fastestPanel && `⚡ Fastest: ${stats.fastestPanel.panel_name} in ${fmtTime(stats.fastestPanel.mins)}`,
              ].filter(Boolean).map((f, i) => (
                <div key={i} style={{ fontSize: 13, color: B.textSec }}>{f as string}</div>
              ))}
            </div>
          </div>
        )}

        {/* Team */}
        {stats.team.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10 }}>Wrap Team</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stats.team.map(t => {
                const pct = stats.totalSqft > 0 ? (t.sqft / stats.totalSqft) * 100 : 0
                return (
                  <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{t.name.charAt(0)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                        <span style={{ fontWeight: 700 }}>{t.name.split(' ')[0]}</span>
                        <span style={{ color: B.textTer }}>{t.sqft.toFixed(0)} sqft · {pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 4, background: B.surface3, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: t.color, borderRadius: 2 }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Print */}
        <button
          onClick={handlePrint}
          style={{ width: '100%', background: B.yellow, color: B.bg, border: 'none', borderRadius: 14, padding: '14px 0', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          🖨️ Print / Save as PDF
        </button>
      </div>
    </div>
  )
}
