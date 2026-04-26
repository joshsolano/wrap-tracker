import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { F } from '../lib/fleetColors'
import type { FleetVehicle, FleetTimeLog } from '../lib/fleetTypes'
import { STATUS_LABEL, REQUIRED_BEFORE, REQUIRED_AFTER } from '../lib/fleetTypes'

interface Props {
  jobId: string
  jobName?: string
  customer?: string
}

interface VehicleRow {
  vehicle: FleetVehicle
  removalLog?: FleetTimeLog
  installLog?: FleetTimeLog
  removerName: string
  installerName: string
  photoCount: number
  photoTotal: number
}

interface DayStats {
  completed: number
  removed: number
  installed: number
  inProgress: number
  flagged: number
  missingPhotos: number
  avgRemovalMins: number | null
  avgInstallMins: number | null
}

function fmtLog(log: FleetTimeLog | undefined): string {
  if (!log?.start_ts) return '—'
  if (!log.end_ts) return 'In progress'
  const mins = (new Date(log.end_ts).getTime() - new Date(log.start_ts).getTime()) / 60000
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtAvg(mins: number | null): string {
  if (mins === null) return '—'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function printDailyPDF(
  date: string,
  jobName: string,
  customer: string,
  stats: DayStats,
  rows: VehicleRow[],
) {
  const win = window.open('', '_blank', 'width=1050,height=750')
  if (!win) { alert('Allow popups to export PDF.'); return }
  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const now = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  const tableRows = rows.map(r => {
    const veh = [r.vehicle.year, r.vehicle.make, r.vehicle.model].filter(Boolean).join(' ') || r.vehicle.vin.slice(-8)
    const unit = r.vehicle.unit_number || r.vehicle.vin.slice(-6)
    const photosOk = r.photoCount === r.photoTotal
    return `
      <tr>
        <td><strong>${esc(unit)}</strong><br/><span style="font-size:10px;color:#6b7280;font-family:monospace">${esc(r.vehicle.vin)}</span></td>
        <td>${esc(veh)}</td>
        <td>${esc(STATUS_LABEL[r.vehicle.status] ?? r.vehicle.status)}</td>
        <td>${esc(fmtLog(r.removalLog))}${r.removerName ? `<br/><span style="font-size:10px;color:#6b7280">${esc(r.removerName)}</span>` : ''}</td>
        <td>${esc(fmtLog(r.installLog))}${r.installerName ? `<br/><span style="font-size:10px;color:#6b7280">${esc(r.installerName)}</span>` : ''}</td>
        <td>${photosOk ? '<span style="color:#16a34a;font-weight:700">✓ All</span>' : `<span style="color:#b45309">${r.photoCount}/${r.photoTotal}</span>`}</td>
      </tr>`
  }).join('')

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Daily Report — ${esc(jobName)} — ${esc(date)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px 48px; color: #111827; font-size: 13px; line-height: 1.4; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563EB; padding-bottom: 18px; margin-bottom: 26px; }
  .brand { font-size: 10px; font-weight: 900; letter-spacing: 0.15em; color: #2563EB; text-transform: uppercase; margin-bottom: 6px; }
  .title { font-size: 22px; font-weight: 900; color: #111827; }
  .meta { font-size: 12px; color: #6b7280; margin-top: 3px; }
  .gen-date { font-size: 10px; color: #9ca3af; text-align: right; line-height: 1.7; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
  .stat { background: #f0f6ff; border: 1px solid #dbeafe; border-radius: 10px; padding: 14px 16px; }
  .stat-val { font-size: 30px; font-weight: 900; line-height: 1; }
  .stat-label { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 5px; }
  .avg-row { display: flex; gap: 10px; margin-bottom: 24px; }
  .avg-card { flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; }
  .avg-val { font-size: 20px; font-weight: 800; }
  .avg-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 3px; }
  .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #374151; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #eff6ff; padding: 9px 12px; text-align: left; font-size: 10px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.07em; border-bottom: 2px solid #bfdbfe; }
  td { padding: 9px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  tr:nth-child(even) td { background: #fafbff; }
  .footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
  @media print { @page { margin: 0.7in; } body { padding: 0; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Wrap GFX Fleet Operations</div>
      <div class="title">${esc(jobName)}</div>
      <div class="meta">${customer ? esc(customer) + ' &bull; ' : ''}Daily Operations Report &bull; ${esc(displayDate)}</div>
    </div>
    <div class="gen-date">Generated<br/>${esc(now)}</div>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-val" style="color:${stats.completed > 0 ? '#16a34a' : '#111827'}">${stats.completed}</div><div class="stat-label">Completed</div></div>
    <div class="stat"><div class="stat-val" style="color:${stats.removed > 0 ? '#2563eb' : '#111827'}">${stats.removed}</div><div class="stat-label">Removals</div></div>
    <div class="stat"><div class="stat-val" style="color:${stats.installed > 0 ? '#0891b2' : '#111827'}">${stats.installed}</div><div class="stat-label">Installs</div></div>
    <div class="stat"><div class="stat-val" style="color:${stats.flagged > 0 ? '#dc2626' : '#111827'}">${stats.flagged}</div><div class="stat-label">Flagged</div></div>
  </div>

  ${(stats.avgRemovalMins !== null || stats.avgInstallMins !== null) ? `
  <div class="avg-row">
    ${stats.avgRemovalMins !== null ? `<div class="avg-card"><div class="avg-val" style="color:#ea580c">${fmtAvg(stats.avgRemovalMins)}</div><div class="avg-label">Avg Removal Time</div></div>` : ''}
    ${stats.avgInstallMins !== null ? `<div class="avg-card"><div class="avg-val" style="color:#7c3aed">${fmtAvg(stats.avgInstallMins)}</div><div class="avg-label">Avg Install Time</div></div>` : ''}
  </div>` : ''}

  ${rows.length > 0 ? `
  <div class="section-title">Vehicle Activity — ${rows.length} vehicle${rows.length !== 1 ? 's' : ''} active today</div>
  <table>
    <thead>
      <tr>
        <th>Unit / VIN</th>
        <th>Vehicle</th>
        <th>Status</th>
        <th>Removal</th>
        <th>Install</th>
        <th>Photos</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>` : `<div style="text-align:center;padding:40px;color:#9ca3af;font-size:13px;background:#f9fafb;border-radius:8px;">No vehicle activity recorded on this date.</div>`}

  <div class="footer">
    <span>Wrap GFX Fleet Operations System</span>
    <span>${esc(jobName)} &bull; Confidential</span>
  </div>
</body>
</html>`)
  win.document.close()
  setTimeout(() => { win.focus(); win.print() }, 500)
}

export default function DailySummary({ jobId, jobName = 'Fleet Job', customer = '' }: Props) {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<VehicleRow[]>([])
  const [stats, setStats] = useState<DayStats>({
    completed: 0, removed: 0, installed: 0, inProgress: 0,
    flagged: 0, missingPhotos: 0, avgRemovalMins: null, avgInstallMins: null,
  })

  async function load() {
    setLoading(true)
    const { data: vData } = await supabase.from('fleet_vehicles').select('*').eq('fleet_job_id', jobId)
    const allVehicles = (vData ?? []) as FleetVehicle[]
    const vIds = allVehicles.map(v => v.id)

    if (vIds.length === 0) { setRows([]); setLoading(false); return }

    const [{ data: logData }, { data: photoData }, { data: userData }] = await Promise.all([
      supabase.from('fleet_vehicle_time_logs').select('*').in('vehicle_id', vIds),
      supabase.from('fleet_vehicle_photos').select('vehicle_id,photo_type').eq('fleet_job_id', jobId),
      supabase.from('fleet_users').select('id,name'),
    ])

    const allLogs = (logData ?? []) as FleetTimeLog[]
    const userMap = new Map<string, string>()
    for (const u of (userData ?? []) as Array<{ id: string; name: string }>) userMap.set(u.id, u.name)

    const photoMap = new Map<string, Set<string>>()
    for (const p of (photoData ?? []) as Array<{ vehicle_id: string; photo_type: string }>) {
      if (!photoMap.has(p.vehicle_id)) photoMap.set(p.vehicle_id, new Set())
      photoMap.get(p.vehicle_id)!.add(p.photo_type)
    }

    const dayLogs = allLogs.filter(l => l.start_ts?.slice(0, 10) === selectedDate)
    const dayVehicleIds = new Set(dayLogs.map(l => l.vehicle_id))
    const requiredAll = [...REQUIRED_BEFORE, ...REQUIRED_AFTER]

    const dayRows: VehicleRow[] = []
    for (const vid of dayVehicleIds) {
      const vehicle = allVehicles.find(v => v.id === vid)
      if (!vehicle) continue
      const vLogs = dayLogs.filter(l => l.vehicle_id === vid)
      const removalLog = vLogs.find(l => l.log_type === 'removal')
      const installLog = vLogs.find(l => l.log_type === 'install')
      const pts = photoMap.get(vid) ?? new Set()
      dayRows.push({
        vehicle,
        removalLog,
        installLog,
        removerName: removalLog?.fleet_user_id ? (userMap.get(removalLog.fleet_user_id) ?? '') : '',
        installerName: installLog?.fleet_user_id ? (userMap.get(installLog.fleet_user_id) ?? '') : '',
        photoCount: requiredAll.filter(pt => pts.has(pt)).length,
        photoTotal: requiredAll.length,
      })
    }

    const removedToday = new Set(dayLogs.filter(l => l.log_type === 'removal' && l.end_ts).map(l => l.vehicle_id))
    const installedToday = new Set(dayLogs.filter(l => l.log_type === 'install' && l.end_ts).map(l => l.vehicle_id))
    const removalTimeLogs = dayLogs.filter(l => l.log_type === 'removal' && l.start_ts && l.end_ts)
    const installTimeLogs = dayLogs.filter(l => l.log_type === 'install' && l.start_ts && l.end_ts)
    const avgMins = (ls: FleetTimeLog[]) =>
      ls.length === 0 ? null
        : ls.reduce((a, l) => a + (new Date(l.end_ts!).getTime() - new Date(l.start_ts!).getTime()) / 60000, 0) / ls.length

    const missingPhotos = allVehicles.filter(v => {
      const pts = photoMap.get(v.id) ?? new Set()
      if (['removing', 'removal_complete', 'ready_for_install', 'installing', 'install_complete', 'qc', 'completed'].includes(v.status)) {
        if (!pts.has('before_front')) return true
      }
      if (['install_complete', 'qc', 'completed'].includes(v.status)) {
        if (!pts.has('after_front') || !pts.has('vin_sticker')) return true
      }
      return false
    }).length

    setRows(dayRows)
    setStats({
      completed: allVehicles.filter(v => v.status === 'completed').length,
      removed: removedToday.size,
      installed: installedToday.size,
      inProgress: allVehicles.filter(v => ['removing', 'installing'].includes(v.status)).length,
      flagged: allVehicles.filter(v => v.flagged).length,
      missingPhotos,
      avgRemovalMins: avgMins(removalTimeLogs),
      avgInstallMins: avgMins(installTimeLogs),
    })
    setLoading(false)
  }

  useEffect(() => { load() }, [jobId, selectedDate])

  const STAT_TILES = [
    { label: 'Completed', value: stats.completed, color: stats.completed > 0 ? F.green : F.text },
    { label: 'Removals', value: stats.removed, color: stats.removed > 0 ? F.accentLight : F.text },
    { label: 'Installs', value: stats.installed, color: stats.installed > 0 ? F.cyan : F.text },
    { label: 'In Progress', value: stats.inProgress, color: F.text },
    { label: 'Flagged', value: stats.flagged, color: stats.flagged > 0 ? F.red : F.text },
    { label: 'Missing Photos', value: stats.missingPhotos, color: stats.missingPhotos > 0 ? F.yellow : F.text },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: F.text, flex: 1 }}>Daily Report</div>
        <input
          type="date" value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 10, background: F.surface2, color: F.text, border: `1px solid ${F.border}`, fontSize: 13, outline: 'none' }}
        />
      </div>

      {loading ? (
        <div style={{ color: F.textSec, padding: 32, textAlign: 'center' }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            {STAT_TILES.map(s => (
              <div key={s.label} style={{ background: F.surface2, borderRadius: 12, padding: '14px 12px' }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: F.textTer, marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {(stats.avgRemovalMins !== null || stats.avgInstallMins !== null) && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {stats.avgRemovalMins !== null && (
                <div style={{ flex: 1, background: F.surface, border: `1px solid ${F.border}`, borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: F.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Avg Removal</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: F.orange }}>{fmtAvg(stats.avgRemovalMins)}</div>
                </div>
              )}
              {stats.avgInstallMins !== null && (
                <div style={{ flex: 1, background: F.surface, border: `1px solid ${F.border}`, borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: F.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Avg Install</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: F.purple }}>{fmtAvg(stats.avgInstallMins)}</div>
                </div>
              )}
            </div>
          )}

          {rows.length > 0 ? (
            <div style={{ background: F.surface, border: `1px solid ${F.border}`, borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${F.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: F.text }}>Vehicle Activity</div>
                <div style={{ fontSize: 11, color: F.textTer }}>{rows.length} vehicle{rows.length !== 1 ? 's' : ''}</div>
              </div>
              {rows.map(r => {
                const veh = [r.vehicle.year, r.vehicle.make, r.vehicle.model].filter(Boolean).join(' ')
                const photosOk = r.photoCount === r.photoTotal
                return (
                  <div key={r.vehicle.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${F.border}22` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: F.text }}>{r.vehicle.unit_number ?? r.vehicle.vin.slice(-6)}</span>
                        {veh && <span style={{ fontSize: 12, color: F.textSec, marginLeft: 8 }}>{veh}</span>}
                      </div>
                      <span style={{ fontSize: 11, color: photosOk ? F.green : F.yellow, fontWeight: 600 }}>
                        {photosOk ? '✓ Photos' : `${r.photoCount}/${r.photoTotal} photos`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      {r.removalLog && (
                        <span style={{ fontSize: 12, color: F.textSec }}>
                          <span style={{ color: F.orange, fontWeight: 700 }}>Removal</span>{' '}
                          {fmtLog(r.removalLog)}{r.removerName ? ` · ${r.removerName}` : ''}
                        </span>
                      )}
                      {r.installLog && (
                        <span style={{ fontSize: 12, color: F.textSec }}>
                          <span style={{ color: F.purple, fontWeight: 700 }}>Install</span>{' '}
                          {fmtLog(r.installLog)}{r.installerName ? ` · ${r.installerName}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 32, color: F.textTer, fontSize: 13, background: F.surface2, borderRadius: 12, marginBottom: 12 }}>
              No activity recorded on this date.
            </div>
          )}

          <button
            onClick={() => printDailyPDF(selectedDate, jobName, customer, stats, rows)}
            style={{ width: '100%', padding: 16, borderRadius: 12, background: F.accent, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            📄 Print / Export Daily PDF
          </button>
        </>
      )}
    </div>
  )
}
