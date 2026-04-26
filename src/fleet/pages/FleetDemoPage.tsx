import { useState } from 'react'
import { F } from '../lib/fleetColors'
import { printVehiclePDF } from '../lib/vehiclePDF'
import type { FleetVehicle, FleetTimeLog, FleetUser, FleetVehiclePhoto, PhotoType } from '../lib/fleetTypes'
import { PHOTO_LABEL } from '../lib/fleetTypes'

type DemoTab = 'daily' | 'fleet' | 'vehicle'

// ── Hardcoded demo data matching the seeded vehicles ──────────────

const DAILY_ROWS = [
  { date: 'Apr 14, 2025', dateKey: 'apr14', completed: 0,  removed: 4,  installed: 0,  flagged: 0, inProgress: 4,  avgRemoval: '1h 05m', avgInstall: '—' },
  { date: 'Apr 15, 2025', dateKey: 'apr15', completed: 4,  removed: 8,  installed: 5,  flagged: 0, inProgress: 3,  avgRemoval: '38m',    avgInstall: '22m' },
  { date: 'Apr 16, 2025', dateKey: 'apr16', completed: 4,  removed: 6,  installed: 8,  flagged: 1, inProgress: 5,  avgRemoval: '42m',    avgInstall: '24m' },
  { date: 'Apr 17, 2025', dateKey: 'apr17', completed: 0,  removed: 4,  installed: 4,  flagged: 1, inProgress: 8,  avgRemoval: '48m',    avgInstall: '26m' },
]

const FLEET_ROWS = [
  { vin:'1FTYE2CM2PKA12301', unit:'T-101', type:'Van',    status:'Complete',      removal:'1h 10m', install:'28m',  remover:'Mike R.',   installer:'Carlos V.', before:'✓', after:'✓', vin_s:'✓', tire:'✓', notes:'' },
  { vin:'1FTYE2CM4PKA12302', unit:'T-102', type:'Van',    status:'Complete',      removal:'1h 25m', install:'26m',  remover:'Mike R.',   installer:'Carlos V.', before:'✓', after:'✓', vin_s:'✓', tire:'✓', notes:'Wrap came off clean' },
  { vin:'1FTFW1ET3NFA12303', unit:'F-201', type:'Pickup', status:'Complete',      removal:'32m',    install:'18m',  remover:'Derek T.',  installer:'James K.',  before:'✓', after:'✓', vin_s:'✓', tire:'✓', notes:'' },
  { vin:'1C6RR7FT4NS512304', unit:'R-301', type:'Pickup', status:'Complete',      removal:'28m',    install:'22m',  remover:'Derek T.',  installer:'James K.',  before:'✓', after:'✓', vin_s:'✓', tire:'✓', notes:'' },
  { vin:'1FTYE2CM6PKA12305', unit:'T-103', type:'Van',    status:'Complete',      removal:'1h 45m', install:'30m',  remover:'Mike R.',   installer:'Carlos V.', before:'✓', after:'✓', vin_s:'✓', tire:'✓', notes:'Adhesive heavy on rear panel' },
  { vin:'1FTFW1ET5NFA12306', unit:'F-202', type:'Pickup', status:'Complete',      removal:'25m',    install:'20m',  remover:'Derek T.',  installer:'James K.',  before:'✓', after:'✓', vin_s:'✓', tire:'✓', notes:'' },
  { vin:'1C6RR6FT2NS512307', unit:'R-302', type:'Pickup', status:'Complete',      removal:'35m',    install:'22m',  remover:'Derek T.',  installer:'James K.',  before:'✓', after:'✓', vin_s:'✓', tire:'✓', notes:'' },
  { vin:'1FMCU9GD3MUA12308', unit:'E-401', type:'SUV',    status:'Complete',      removal:'22m',    install:'17m',  remover:'Derek T.',  installer:'James K.',  before:'✓', after:'✓', vin_s:'✓', tire:'✓', notes:'' },
  { vin:'1FTYE2CM8PKA12309', unit:'T-104', type:'Van',    status:'Install Done',  removal:'1h 05m', install:'27m',  remover:'Mike R.',   installer:'Carlos V.', before:'✓', after:'✓', vin_s:'✓', tire:'✓', notes:'' },
  { vin:'1FTFW1ET7NFA12311', unit:'F-203', type:'Pickup', status:'Install Done',  removal:'40m',    install:'21m',  remover:'Derek T.',  installer:'James K.',  before:'✓', after:'✓', vin_s:'✓', tire:'✓', notes:'Minor paint lift on driver door' },
  { vin:'1FTYE2CMCPKA12314', unit:'T-106', type:'Van',    status:'Installing',    removal:'1h 05m', install:'—',    remover:'Mike R.',   installer:'Carlos V.', before:'✓', after:'⚠ 2/6', vin_s:'—', tire:'—', notes:'' },
  { vin:'1FTFW1ET9NFA12315', unit:'F-204', type:'Pickup', status:'Installing',    removal:'32m',    install:'—',    remover:'Derek T.',  installer:'James K.',  before:'✓', after:'⚠ 1/6', vin_s:'—', tire:'—', notes:'' },
  { vin:'1FTYE2CMEPKA12318', unit:'T-107', type:'Van',    status:'Ready Install', removal:'1h 15m', install:'—',    remover:'Mike R.',   installer:'—',         before:'✓', after:'—',    vin_s:'—', tire:'—', notes:'' },
  { vin:'1C6RR7FT0NS512320', unit:'R-305', type:'Pickup', status:'Ready Install', removal:'1h 05m', install:'—',    remover:'Derek T.',  installer:'—',         before:'✓', after:'—',    vin_s:'—', tire:'—', notes:'Toolbox section took longer' },
  { vin:'1FTYE2CMGPKA12322', unit:'T-108', type:'Van',    status:'Removing',      removal:'—',      install:'—',    remover:'Mike R.',   installer:'—',         before:'⚠ 2/4', after:'—', vin_s:'—', tire:'—', notes:'' },
  { vin:'1FMCU0GD9MUA12325', unit:'E-405', type:'SUV',    status:'Not Started',   removal:'—',      install:'—',    remover:'—',         installer:'—',         before:'—', after:'—',    vin_s:'—', tire:'—', notes:'' },
  { vin:'1FTFW1ET5NFA12327', unit:'F-207', type:'Pickup', status:'⚠ Flagged',     removal:'40m',    install:'—',    remover:'Derek T.',  installer:'—',         before:'⚠ 2/4', after:'—', vin_s:'—', tire:'—', notes:'Paint damage on hood — customer sign-off required' },
  { vin:'1FTYE2CMKPKA12328', unit:'T-110', type:'Van',    status:'⚠ Flagged',     removal:'—',      install:'—',    remover:'Mike R.',   installer:'—',         before:'✓', after:'—',    vin_s:'—', tire:'—', notes:'Adhesive not releasing on roof section' },
]

// Per-day vehicle slices for demo
const DEMO_DAY_VEHICLES: Record<string, typeof FLEET_ROWS> = {
  apr14: FLEET_ROWS.slice(0, 4),
  apr15: FLEET_ROWS.slice(0, 10),
  apr16: FLEET_ROWS.slice(2, 16),
  apr17: FLEET_ROWS.slice(6, 18),
}

const SAMPLE_VEHICLE = {
  vin: '1FTYE2CM2PKA12301', unit: 'T-101',
  year: '2022', make: 'Ford', model: 'Transit',
  type: 'Van', department: 'Field Ops', status: 'Complete',
  removal: { worker: 'Mike Rodriguez', start: 'Apr 14  8:00 AM', end: 'Apr 14  9:10 AM', duration: '1h 10m', notes: '' },
  install:  { worker: 'Carlos Vega',    start: 'Apr 14 11:00 AM', end: 'Apr 14 11:28 AM', duration: '28m',    notes: '' },
  photos: {
    before: ['before_front ✓', 'before_driver ✓', 'before_passenger ✓', 'before_rear ✓'],
    after:  ['after_front ✓', 'after_driver ✓', 'after_passenger ✓', 'after_rear ✓', 'vin_sticker ✓', 'tire_size ✓'],
  },
  qc: 'Approved',
}

// ── Download helpers ──────────────────────────────────────────────

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function makeDemoPhoto(label: string, phase: 'before' | 'after' | 'doc'): string {
  const canvas = document.createElement('canvas')
  canvas.width = 800; canvas.height = 600
  const ctx = canvas.getContext('2d')!

  const bg    = { before: '#0c1c3a', after: '#071f14', doc: '#1c1206' }[phase]
  const accent = { before: '#3b82f6', after: '#22c55e', doc: '#f59e0b' }[phase]
  const dim   = { before: '#1e3a6e', after: '#14432a', doc: '#3b2608' }[phase]

  // Background
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 800, 600)

  // Subtle diagonal lines
  ctx.strokeStyle = dim
  ctx.lineWidth = 1.5
  for (let i = -600; i < 1400; i += 50) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 600, 600); ctx.stroke()
  }

  // Radial glow
  const grd = ctx.createRadialGradient(400, 280, 40, 400, 280, 320)
  grd.addColorStop(0, accent + '28'); grd.addColorStop(1, accent + '00')
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 800, 600)

  // Rounded card
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.beginPath(); ctx.roundRect(260, 160, 280, 210, 14); ctx.fill()
  ctx.strokeStyle = accent + '50'; ctx.lineWidth = 1.5; ctx.stroke()

  // Camera body
  ctx.fillStyle = accent + 'bb'
  ctx.beginPath(); ctx.roundRect(310, 195, 180, 110, 10); ctx.fill()
  // Lens ring
  ctx.fillStyle = bg
  ctx.beginPath(); ctx.arc(400, 250, 36, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = accent + 'dd'
  ctx.beginPath(); ctx.arc(400, 250, 26, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.beginPath(); ctx.arc(392, 242, 9, 0, Math.PI * 2); ctx.fill()
  // Viewfinder bump
  ctx.fillStyle = accent + 'bb'
  ctx.beginPath(); ctx.roundRect(348, 183, 44, 18, 5); ctx.fill()

  // Checkmark badge
  ctx.fillStyle = accent
  ctx.beginPath(); ctx.roundRect(344, 394, 112, 32, 8); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'
  ctx.fillText('✓  UPLOADED', 400, 415)

  // Label
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 24px -apple-system, Helvetica, sans-serif'
  ctx.fillText(label.toUpperCase(), 400, 464)

  // Caption
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.font = '13px sans-serif'
  ctx.fillText('SPIRE FLEET DEMO  •  SAMPLE PHOTO', 400, 492)

  return canvas.toDataURL('image/jpeg', 0.85)
}

function makeDemoPhotos(): FleetVehiclePhoto[] {
  const slots: { type: PhotoType; phase: 'before' | 'after' | 'doc' }[] = [
    { type: 'before_front',     phase: 'before' },
    { type: 'before_driver',    phase: 'before' },
    { type: 'before_passenger', phase: 'before' },
    { type: 'before_rear',      phase: 'before' },
    { type: 'before_damage',    phase: 'before' },
    { type: 'after_front',      phase: 'after'  },
    { type: 'after_driver',     phase: 'after'  },
    { type: 'after_passenger',  phase: 'after'  },
    { type: 'after_rear',       phase: 'after'  },
    { type: 'vin_sticker',      phase: 'doc'    },
    { type: 'tire_size',        phase: 'doc'    },
  ]
  return slots.map(s => ({
    id: `demo-${s.type}`, vehicle_id: 'demo-T101', fleet_job_id: 'demo-job',
    photo_type: s.type, storage_path: `demo/${s.type}`, uploaded_by: null,
    created_at: '2025-04-14T10:00:00Z',
    publicUrl: makeDemoPhoto(PHOTO_LABEL[s.type], s.phase),
  }))
}

async function printDemoVehiclePDF() {
  const vehicle: FleetVehicle = {
    id: 'demo-T101', fleet_job_id: 'demo-job',
    vin: SAMPLE_VEHICLE.vin, unit_number: SAMPLE_VEHICLE.unit,
    year: SAMPLE_VEHICLE.year, make: SAMPLE_VEHICLE.make, model: SAMPLE_VEHICLE.model,
    vehicle_type: SAMPLE_VEHICLE.type, department: SAMPLE_VEHICLE.department,
    location: null, notes: null, status: 'completed', flagged: false, flag_reason: null,
    created_at: '2025-04-14T08:00:00Z',
  }
  const remover: FleetUser = { id: 'demo-mike', user_id: null, email: null, name: 'Mike Rodriguez', phone: null, role: 'remover', active: true, created_at: '2025-04-01T00:00:00Z' }
  const installer: FleetUser = { id: 'demo-carlos', user_id: null, email: null, name: 'Carlos Vega', phone: null, role: 'installer', active: true, created_at: '2025-04-01T00:00:00Z' }
  const timelogs: FleetTimeLog[] = [
    { id: 'demo-r', vehicle_id: 'demo-T101', fleet_user_id: 'demo-mike', log_type: 'removal', start_ts: '2025-04-14T08:00:00', end_ts: '2025-04-14T09:10:00', notes: null, created_at: '2025-04-14T08:00:00Z' },
    { id: 'demo-i', vehicle_id: 'demo-T101', fleet_user_id: 'demo-carlos', log_type: 'install', start_ts: '2025-04-14T11:00:00', end_ts: '2025-04-14T11:28:00', notes: null, created_at: '2025-04-14T11:00:00Z' },
  ]
  await printVehiclePDF({
    jobName: 'Spire Fleet Demo', customer: 'Spire Energy',
    vehicle, photos: makeDemoPhotos(), timelogs,
    fleetUsers: new Map([['demo-mike', remover], ['demo-carlos', installer]]),
  })
}

function downloadJSON(filename: string, data: object) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function handleFleetCSV() {
  downloadCSV('spire-fleet-full-export.csv', [
    ['VIN', 'Unit #', 'Type', 'Status', 'Removal Time', 'Install Time', 'Remover', 'Installer', 'Before Photos', 'After Photos', 'VIN Sticker', 'Tire Photo', 'Notes'],
    ...FLEET_ROWS.map(r => [r.vin, r.unit, r.type, r.status, r.removal, r.install, r.remover, r.installer, r.before, r.after, r.vin_s, r.tire, r.notes]),
  ])
}

function handleVehicleJSON() {
  downloadJSON('spire-fleet-T101-vehicle-report.json', {
    meta: { exported: new Date().toISOString(), system: 'Wrap GFX Fleet Operations', job: 'Spire Fleet Demo', customer: 'Spire Energy' },
    vehicle: { vin: SAMPLE_VEHICLE.vin, unit_number: SAMPLE_VEHICLE.unit, year: SAMPLE_VEHICLE.year, make: SAMPLE_VEHICLE.make, model: SAMPLE_VEHICLE.model, vehicle_type: SAMPLE_VEHICLE.type, department: SAMPLE_VEHICLE.department, status: SAMPLE_VEHICLE.status },
    removal: SAMPLE_VEHICLE.removal,
    install: SAMPLE_VEHICLE.install,
    photos: SAMPLE_VEHICLE.photos,
    qc: { result: SAMPLE_VEHICLE.qc, checklist: { before_photos: true, removal_done: true, after_photos: true, vin_sticker: true, tire_photo: true, branding_correct: true, no_adhesive: true } },
  })
}

function esc(s: string | number): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function printDailyPDF(dayKey: string) {
  const day = DAILY_ROWS.find(r => r.dateKey === dayKey) ?? DAILY_ROWS[3]
  const vehicles = DEMO_DAY_VEHICLES[dayKey] ?? []
  const win = window.open('', '_blank', 'width=1050,height=780')
  if (!win) { alert('Allow popups to export PDF.'); return }
  const now = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  const tableRows = vehicles.map(v => {
    const photosOk = v.before === '✓' && v.after === '✓' && v.vin_s === '✓' && v.tire === '✓'
    const statusColor = v.status === 'Complete' ? '#16a34a' : v.status.includes('Flagged') ? '#dc2626' : '#374151'
    return `
      <tr>
        <td><strong>${esc(v.unit)}</strong><br/><span style="font-size:10px;color:#6b7280;font-family:monospace">${esc(v.vin.slice(-10))}</span></td>
        <td>${esc(v.type)}</td>
        <td style="color:${statusColor};font-weight:600">${esc(v.status)}</td>
        <td>${esc(v.removal)}${v.remover !== '—' ? `<br/><span style="font-size:10px;color:#6b7280">${esc(v.remover)}</span>` : ''}</td>
        <td>${esc(v.install)}${v.installer !== '—' ? `<br/><span style="font-size:10px;color:#6b7280">${esc(v.installer)}</span>` : ''}</td>
        <td>${photosOk ? '<span style="color:#16a34a;font-weight:700">✓ All</span>' : `<span style="color:#b45309">Incomplete</span>`}</td>
        <td style="color:#6b7280;font-size:11px">${esc(v.notes || '—')}</td>
      </tr>`
  }).join('')

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Daily Report — Spire Fleet Demo — ${esc(day.date)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px 48px; color: #111827; font-size: 13px; line-height: 1.4; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563EB; padding-bottom: 18px; margin-bottom: 28px; }
  .brand { font-size: 10px; font-weight: 900; letter-spacing: 0.15em; color: #2563EB; text-transform: uppercase; margin-bottom: 6px; }
  .title { font-size: 22px; font-weight: 900; color: #111827; margin-bottom: 3px; }
  .meta { font-size: 12px; color: #6b7280; }
  .gen { font-size: 10px; color: #9ca3af; text-align: right; line-height: 1.7; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
  .stat { background: #f0f6ff; border: 1px solid #dbeafe; border-radius: 10px; padding: 16px; }
  .stat-val { font-size: 32px; font-weight: 900; line-height: 1; }
  .stat-label { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 6px; }
  .avg-row { display: flex; gap: 12px; margin-bottom: 28px; }
  .avg-card { flex: 1; background: #fafafa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 18px; }
  .avg-val { font-size: 20px; font-weight: 800; }
  .avg-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }
  .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #374151; margin-bottom: 12px; }
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
      <div class="title">Spire Fleet Demo</div>
      <div class="meta">Spire Energy &bull; Denver, CO &bull; Daily Report &bull; ${esc(day.date)}</div>
    </div>
    <div class="gen">DAILY OPERATIONS REPORT<br/>Generated ${esc(now)}</div>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-val" style="color:${day.completed > 0 ? '#16a34a' : '#111827'}">${day.completed}</div><div class="stat-label">Completed</div></div>
    <div class="stat"><div class="stat-val" style="color:${day.removed > 0 ? '#2563eb' : '#111827'}">${day.removed}</div><div class="stat-label">Removals</div></div>
    <div class="stat"><div class="stat-val" style="color:${day.installed > 0 ? '#0891b2' : '#111827'}">${day.installed}</div><div class="stat-label">Installs</div></div>
    <div class="stat"><div class="stat-val" style="color:${day.flagged > 0 ? '#dc2626' : '#111827'}">${day.flagged}</div><div class="stat-label">Flagged</div></div>
  </div>

  <div class="avg-row">
    <div class="avg-card"><div class="avg-val" style="color:#ea580c">${esc(day.avgRemoval)}</div><div class="avg-label">Avg Removal Time</div></div>
    <div class="avg-card"><div class="avg-val" style="color:#7c3aed">${esc(day.avgInstall)}</div><div class="avg-label">Avg Install Time</div></div>
    <div class="avg-card"><div class="avg-val" style="color:#374151">${day.inProgress}</div><div class="avg-label">In Progress</div></div>
  </div>

  <div class="section-title">Vehicle Activity — ${vehicles.length} vehicle${vehicles.length !== 1 ? 's' : ''}</div>
  <table>
    <thead>
      <tr>
        <th>Unit / VIN</th><th>Type</th><th>Status</th><th>Removal</th><th>Install</th><th>Photos</th><th>Notes</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="footer">
    <span>Wrap GFX Fleet Operations System &bull; Confidential</span>
    <span>Spire Fleet Demo &bull; Apr 14–25, 2025</span>
  </div>
</body>
</html>`)
  win.document.close()
  setTimeout(() => { win.focus(); win.print() }, 500)
}

// ── Component ─────────────────────────────────────────────────────

const sec: React.CSSProperties = { background: F.surface, border: `1px solid ${F.border}`, borderRadius: 14, padding: 16, marginBottom: 12 }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: F.textTer, textTransform: 'uppercase' as const, letterSpacing: '0.06em', whiteSpace: 'nowrap' as const, borderBottom: `1px solid ${F.border}` }
const td: React.CSSProperties = { padding: '9px 10px', fontSize: 12, color: F.text, borderBottom: `1px solid ${F.border}22`, whiteSpace: 'nowrap' as const }

export default function FleetDemoPage() {
  const [tab, setTab] = useState<DemoTab>('daily')
  const [selectedDayKey, setSelectedDayKey] = useState('apr17')
  const [pdfLoading, setPdfLoading] = useState(false)

  const selectedDay = DAILY_ROWS.find(r => r.dateKey === selectedDayKey) ?? DAILY_ROWS[3]
  const dayVehicles = DEMO_DAY_VEHICLES[selectedDayKey] ?? []

  const dlBtn = (label: string, onClick: () => void) => (
    <button onClick={onClick}
      style={{ background: F.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '13px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
      ⬇ {label}
    </button>
  )

  return (
    <div>
      {/* Demo banner */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2040 100%)', border: `1px solid ${F.accentLight}44`, borderRadius: 18, padding: '20px 20px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ background: F.accent, color: '#fff', fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', padding: '3px 8px', borderRadius: 6 }}>DEMO</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: F.text }}>Spire Fleet Demo</span>
        </div>
        <div style={{ fontSize: 12, color: F.textSec, marginBottom: 14 }}>Spire Energy · Denver, CO · Apr 14–25, 2025</div>
        <div style={{ background: F.surface3, borderRadius: 8, height: 6, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ width: '46%', height: '100%', background: `linear-gradient(90deg, ${F.accent}, ${F.cyan})`, borderRadius: 8 }} />
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[{ label: 'Total', val: 28, color: F.text }, { label: 'Complete', val: 8, color: F.green }, { label: 'QC Pending', val: 5, color: F.purple }, { label: 'Active', val: 11, color: F.accentLight }, { label: 'Not Started', val: 2, color: F.textSec }, { label: 'Flagged', val: 2, color: F.red }].map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: F.textTer, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: F.surface, borderRadius: 12, padding: 3, marginBottom: 14 }}>
        {([['daily', 'Daily Report'], ['fleet', 'Full Fleet CSV'], ['vehicle', 'Vehicle Detail']] as [DemoTab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ flex: 1, padding: '10px 4px', border: 'none', borderRadius: 9, background: tab === k ? F.accent : 'transparent', color: tab === k ? '#fff' : F.textSec, fontWeight: tab === k ? 700 : 400, fontSize: 13, cursor: 'pointer' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Daily Report ── */}
      {tab === 'daily' && (
        <div>
          {/* Day selector */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {DAILY_ROWS.map(r => (
              <button key={r.dateKey} onClick={() => setSelectedDayKey(r.dateKey)}
                style={{ flex: 1, padding: '8px 4px', borderRadius: 10, border: `1px solid ${selectedDayKey === r.dateKey ? F.accentLight : F.border}`, background: selectedDayKey === r.dateKey ? F.accentLight + '22' : F.surface, color: selectedDayKey === r.dateKey ? F.accentLight : F.textSec, fontSize: 11, fontWeight: selectedDayKey === r.dateKey ? 700 : 400, cursor: 'pointer', textAlign: 'center' }}>
                {r.date.replace(', 2025', '')}
              </button>
            ))}
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'Completed',   val: selectedDay.completed,  color: selectedDay.completed > 0  ? F.green       : F.text },
              { label: 'Removals',    val: selectedDay.removed,    color: selectedDay.removed > 0    ? F.accentLight : F.text },
              { label: 'Installs',    val: selectedDay.installed,  color: selectedDay.installed > 0  ? F.cyan        : F.text },
              { label: 'In Progress', val: selectedDay.inProgress, color: F.text },
              { label: 'Flagged',     val: selectedDay.flagged,    color: selectedDay.flagged > 0    ? F.red         : F.text },
              { label: 'Vehicles',    val: dayVehicles.length,     color: F.textSec },
            ].map(s => (
              <div key={s.label} style={{ background: F.surface2, borderRadius: 12, padding: '14px 12px' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: 10, color: F.textTer, marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Avg times */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1, background: F.surface, border: `1px solid ${F.border}`, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: F.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Avg Removal</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: F.orange }}>{selectedDay.avgRemoval}</div>
            </div>
            <div style={{ flex: 1, background: F.surface, border: `1px solid ${F.border}`, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: F.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Avg Install</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: F.purple }}>{selectedDay.avgInstall}</div>
            </div>
          </div>

          {/* Vehicle activity */}
          <div style={{ ...sec, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${F.border}`, display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: F.text }}>Vehicle Activity</div>
              <div style={{ fontSize: 11, color: F.textTer }}>{dayVehicles.length} vehicles</div>
            </div>
            {dayVehicles.map((v, i) => {
              const photosOk = v.before === '✓' && v.after === '✓'
              return (
                <div key={i} style={{ padding: '12px 16px', borderBottom: `1px solid ${F.border}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: F.text }}>{v.unit}</span>
                      <span style={{ fontSize: 11, color: v.status === 'Complete' ? F.green : v.status.includes('Flagged') ? F.red : F.textSec, fontWeight: 600 }}>{v.status}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {v.removal !== '—' && <span style={{ fontSize: 12, color: F.textSec }}><span style={{ color: F.orange, fontWeight: 700 }}>R</span> {v.removal} · {v.remover}</span>}
                      {v.install !== '—' && <span style={{ fontSize: 12, color: F.textSec }}><span style={{ color: F.purple, fontWeight: 700 }}>I</span> {v.install} · {v.installer}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: photosOk ? F.green : F.yellow, fontWeight: 600, flexShrink: 0 }}>
                    {photosOk ? '✓' : '⚠'} Photos
                  </span>
                </div>
              )
            })}
          </div>

          {/* Export buttons */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            <button onClick={() => printDailyPDF(selectedDayKey)}
              style={{ flex: 1, padding: '14px 16px', borderRadius: 12, background: F.accent, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              📄 Print Daily PDF
            </button>
            <button onClick={() => {
              const day = DAILY_ROWS.find(r => r.dateKey === selectedDayKey)!
              const vehicles = DEMO_DAY_VEHICLES[selectedDayKey] ?? []
              downloadCSV(`spire-fleet-daily-${selectedDayKey}.csv`, [
                ['Date', 'Completed', 'Removed', 'Installed', 'In Progress', 'Flagged', 'Avg Removal', 'Avg Install'],
                [day.date, day.completed, day.removed, day.installed, day.inProgress, day.flagged, day.avgRemoval, day.avgInstall].map(String),
                [],
                ['Unit', 'Type', 'Status', 'Removal', 'Install', 'Remover', 'Installer', 'Notes'],
                ...vehicles.map(v => [v.unit, v.type, v.status, v.removal, v.install, v.remover, v.installer, v.notes]),
              ])
            }}
              style={{ padding: '14px 16px', borderRadius: 12, background: F.surface2, color: F.accentLight, border: `1px solid ${F.border}`, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              ⬇ CSV
            </button>
          </div>
        </div>
      )}

      {/* ── Full Fleet CSV ── */}
      {tab === 'fleet' && (
        <div>
          <div style={sec}>
            <div style={{ fontSize: 14, fontWeight: 700, color: F.text, marginBottom: 14 }}>All Vehicles — Spire Fleet Demo</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['VIN (last 8)', 'Unit', 'Type', 'Status', 'Removal', 'Install', 'Photos', 'Notes'].map(h => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {FLEET_ROWS.map((r, i) => (
                    <tr key={i}>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{r.vin.slice(-8)}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{r.unit}</td>
                      <td style={{ ...td, color: F.textSec }}>{r.type}</td>
                      <td style={{ ...td, fontSize: 11, color: r.status.includes('Flagged') ? F.red : r.status === 'Complete' ? F.green : F.text, fontWeight: 600 }}>{r.status}</td>
                      <td style={{ ...td, color: F.textSec }}>{r.removal}</td>
                      <td style={{ ...td, color: F.textSec }}>{r.install}</td>
                      <td style={{ ...td, color: r.before === '✓' && r.after === '✓' ? F.green : F.yellow, fontSize: 11 }}>B:{r.before} A:{r.after}</td>
                      <td style={{ ...td, color: F.textSec, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11, color: F.textTer, marginTop: 10 }}>Showing {FLEET_ROWS.length} of 28 vehicles</div>
          </div>
          <div style={{ ...sec, background: F.surface2 }}>
            <div style={{ fontSize: 12, color: F.textSec, marginBottom: 14, lineHeight: 1.5 }}>
              <strong style={{ color: F.text }}>Full export includes:</strong> Every vehicle with VIN, unit #, type, department, status, removal/install times + workers, photo completeness, and notes. One row per vehicle.
            </div>
            {dlBtn('Download Full Fleet CSV (28 vehicles)', handleFleetCSV)}
          </div>
        </div>
      )}

      {/* ── Vehicle Detail ── */}
      {tab === 'vehicle' && (
        <div>
          <div style={sec}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: F.textTer, marginBottom: 2 }}>SAMPLE VEHICLE REPORT</div>
                <div style={{ fontSize: 17, fontWeight: 900, fontFamily: 'monospace', color: F.text }}>{SAMPLE_VEHICLE.vin}</div>
              </div>
              <div style={{ padding: '5px 10px', borderRadius: 8, background: F.green + '22', fontSize: 12, fontWeight: 700, color: F.green, border: `1px solid ${F.green}44` }}>✓ {SAMPLE_VEHICLE.status}</div>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[['Unit #', SAMPLE_VEHICLE.unit], ['Vehicle', `${SAMPLE_VEHICLE.year} ${SAMPLE_VEHICLE.make} ${SAMPLE_VEHICLE.model}`], ['Type', SAMPLE_VEHICLE.type], ['Dept', SAMPLE_VEHICLE.department]].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: 10, color: F.textTer, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: F.text }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...sec, borderLeft: `3px solid ${F.orange}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: F.orange, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Removal</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[['Worker', SAMPLE_VEHICLE.removal.worker], ['Start', SAMPLE_VEHICLE.removal.start], ['End', SAMPLE_VEHICLE.removal.end], ['Duration', SAMPLE_VEHICLE.removal.duration]].map(([l, v]) => (
                <div key={l}><div style={{ fontSize: 10, color: F.textTer, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div><div style={{ fontSize: 14, fontWeight: 600, color: F.text }}>{v}</div></div>
              ))}
            </div>
          </div>

          <div style={{ ...sec, borderLeft: `3px solid ${F.purple}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: F.purple, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Install</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[['Worker', SAMPLE_VEHICLE.install.worker], ['Start', SAMPLE_VEHICLE.install.start], ['End', SAMPLE_VEHICLE.install.end], ['Duration', SAMPLE_VEHICLE.install.duration]].map(([l, v]) => (
                <div key={l}><div style={{ fontSize: 10, color: F.textTer, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div><div style={{ fontSize: 14, fontWeight: 600, color: F.text }}>{v}</div></div>
              ))}
            </div>
          </div>

          {/* Before photos grid */}
          <div style={{ background: F.surface, border: `1px solid ${F.border}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: F.text }}>Before (Removal)</div>
              <div style={{ fontSize: 11, color: F.green, fontWeight: 600 }}>✓ All uploaded</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[['Front','before_front'],['Driver Side','before_driver'],['Pass. Side','before_passenger'],['Rear','before_rear']].map(([label, key]) => (
                <div key={key} style={{ aspectRatio: '1', borderRadius: 10, background: F.green + '15', border: `1px solid ${F.green}44`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span style={{ fontSize: 20, color: F.green, opacity: 0.7 }}>✓</span>
                  <span style={{ fontSize: 9, color: F.green, fontWeight: 700, textAlign: 'center', padding: '0 4px' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Damage photos */}
          <div style={{ background: F.surface, border: `1px solid ${F.border}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: F.text }}>Damage Photos</div>
              <div style={{ fontSize: 11, color: F.red, fontWeight: 600 }}>1 photo</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <div style={{ aspectRatio: '1', borderRadius: 10, background: F.red + '12', border: `1px solid ${F.red}33`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 6px' }}>
                <span style={{ fontSize: 18, opacity: 0.5 }}>🔴</span>
                <span style={{ fontSize: 9, color: F.textSec, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>Minor door scratch</span>
              </div>
            </div>
          </div>

          {/* After photos grid */}
          <div style={{ background: F.surface, border: `1px solid ${F.border}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: F.text }}>After + Documentation (Install)</div>
              <div style={{ fontSize: 11, color: F.green, fontWeight: 600 }}>✓ All uploaded</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[['Front','after_front'],['Driver Side','after_driver'],['Pass. Side','after_passenger'],['Rear','after_rear'],['VIN Sticker','vin_sticker'],['Tire Size','tire_size']].map(([label, key]) => (
                <div key={key} style={{ aspectRatio: '1', borderRadius: 10, background: F.green + '15', border: `1px solid ${F.green}44`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span style={{ fontSize: 20, color: F.green, opacity: 0.7 }}>✓</span>
                  <span style={{ fontSize: 9, color: F.green, fontWeight: 700, textAlign: 'center', padding: '0 4px' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '10px 14px', borderRadius: 10, background: F.green + '12', border: `1px solid ${F.green}33`, fontSize: 12, color: F.green, fontWeight: 700, marginBottom: 12 }}>
            ✓ QC Approved — all 7 checks passed
          </div>

          <div style={{ ...sec, background: F.surface2 }}>
            <div style={{ fontSize: 12, color: F.textSec, marginBottom: 14, lineHeight: 1.5 }}>
              <strong style={{ color: F.text }}>Individual vehicle report:</strong> Each vehicle gets a print-ready PDF with full timestamps, worker names, photos embedded, notes, and QC result. Generated from the vehicle page.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={async () => { setPdfLoading(true); await printDemoVehiclePDF(); setPdfLoading(false) }}
                disabled={pdfLoading}
                style={{ flex: 1, background: F.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '13px 16px', fontSize: 14, fontWeight: 700, cursor: pdfLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {pdfLoading ? '⏳ Preparing…' : '📄 Print Vehicle PDF'}
              </button>
              {dlBtn('Download Sample JSON', handleVehicleJSON)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
