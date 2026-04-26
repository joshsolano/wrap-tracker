import type { FleetVehicle, FleetVehiclePhoto, FleetTimeLog, FleetUser } from './fleetTypes'
import { PHOTO_LABEL, STATUS_LABEL } from './fleetTypes'

function fmtDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const mins = (new Date(end).getTime() - new Date(start).getTime()) / 60000
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function fmtTs(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

async function fetchAsDataUrl(url: string): Promise<string> {
  if (!url) return ''
  // Already a data URL — use directly (e.g. canvas-generated demo photos)
  if (url.startsWith('data:')) return url

  // Try fetch + FileReader first
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (res.ok) {
      const blob = await res.blob()
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => resolve('')
        reader.readAsDataURL(blob)
      })
      if (dataUrl) return dataUrl
    }
  } catch { /* fall through to canvas approach */ }

  // Fallback: img element → canvas (handles some CORS configs fetch can't)
  return new Promise<string>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => resolve(''), 10000)
    img.onload = () => {
      clearTimeout(timer)
      try {
        const maxW = 1400
        const ratio = Math.min(1, maxW / Math.max(img.naturalWidth, 1))
        const w = Math.max(1, Math.round(img.naturalWidth * ratio))
        const h = Math.max(1, Math.round(img.naturalHeight * ratio))
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(''); return }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } catch { resolve('') }
    }
    img.onerror = () => { clearTimeout(timer); resolve('') }
    img.src = url
  })
}

interface PDFData {
  jobName: string
  customer: string
  vehicle: FleetVehicle
  photos: FleetVehiclePhoto[]
  timelogs: FleetTimeLog[]
  fleetUsers: Map<string, FleetUser>
}

export async function printVehiclePDF({ jobName, customer, vehicle, photos, timelogs, fleetUsers }: PDFData) {
  // Convert all photo URLs to embedded base64 data URLs so they render in the print window
  const dataUrlById = new Map<string, string>()
  await Promise.all(
    photos
      .filter(p => p.publicUrl)
      .map(async p => {
        const dataUrl = await fetchAsDataUrl(p.publicUrl!)
        if (dataUrl) dataUrlById.set(p.id, dataUrl)
      })
  )

  const removalLog = timelogs.find(l => l.log_type === 'removal')
  const installLog = timelogs.find(l => l.log_type === 'install')
  const remover = removalLog?.fleet_user_id ? fleetUsers.get(removalLog.fleet_user_id) : null
  const installer = installLog?.fleet_user_id ? fleetUsers.get(installLog.fleet_user_id) : null

  const photoUrl = (type: string) => {
    const p = photos.find(q => q.photo_type === type)
    return p ? (dataUrlById.get(p.id) ?? '') : ''
  }
  const damageDataUrls = photos
    .filter(p => p.photo_type === 'before_damage')
    .map(p => dataUrlById.get(p.id))
    .filter((url): url is string => !!url)

  const photoGrid = (types: string[]) => types.map(t => {
    const url = photoUrl(t)
    const label = PHOTO_LABEL[t as keyof typeof PHOTO_LABEL] ?? t
    return url
      ? `<div class="photo-slot"><img src="${url}" /><div class="photo-label">${label}</div></div>`
      : `<div class="photo-slot"><div class="photo-empty">No photo</div><div class="photo-label" style="color:#94a3b8">${label}</div></div>`
  }).join('')

  const beforeTypes = ['before_front', 'before_driver', 'before_passenger', 'before_rear']
  const afterTypes  = ['after_front',  'after_driver',  'after_passenger',  'after_rear']
  const docTypes    = ['vin_sticker', 'tire_size']

  const hasBeforePhotos = beforeTypes.some(t => photoUrl(t))
  const hasAfterPhotos  = afterTypes.some(t => photoUrl(t))
  const hasDocPhotos    = docTypes.some(t => photoUrl(t))

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Vehicle Report — ${vehicle.vin}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0f172a; background: #fff; padding: 36px 44px; font-size: 13px; line-height: 1.4; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 10px; font-weight: 900; letter-spacing: 0.14em; color: #2563eb; text-transform: uppercase; margin-bottom: 5px; }
  .job-title { font-size: 20px; font-weight: 900; color: #0f172a; margin-bottom: 2px; }
  .job-meta { font-size: 12px; color: #64748b; }
  .gen-date { font-size: 10px; color: #94a3b8; text-align: right; line-height: 1.7; }
  .section { margin-bottom: 20px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 10px; }
  .section-title { font-size: 11px; font-weight: 800; color: #1e40af; text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 14px; }
  .row { display: flex; gap: 20px; flex-wrap: wrap; }
  .field { flex: 1; min-width: 100px; }
  .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
  .value { font-size: 14px; font-weight: 600; color: #0f172a; }
  .status-badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #dbeafe; color: #1e40af; }
  .workflow-cols { display: flex; gap: 16px; margin-bottom: 20px; }
  .workflow-col { flex: 1; padding: 16px; border: 1px solid #e2e8f0; border-radius: 10px; }
  .workflow-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 12px; }
  .photo-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .photo-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .photo-slot img { width: 100%; height: 110px; object-fit: cover; border-radius: 7px; border: 1px solid #e2e8f0; display: block; }
  .photo-empty { width: 100%; height: 110px; background: #f1f5f9; border-radius: 7px; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #94a3b8; }
  .photo-label { font-size: 10px; color: #64748b; text-align: center; margin-top: 4px; font-weight: 600; }
  .doc-grid { display: flex; gap: 20px; }
  .doc-grid .photo-slot { flex: 1; max-width: 220px; }
  .doc-grid .photo-slot img { height: 160px; object-fit: contain; }
  .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
  .print-btn { text-align: center; margin-top: 20px; }
  .print-btn button { background: #2563eb; color: #fff; border: none; padding: 12px 36px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; }
  @media print {
    body { padding: 0; }
    .print-btn { display: none; }
    @page { margin: 0.65in; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Wrap GFX Fleet Operations</div>
      <div class="job-title">${jobName}</div>
      <div class="job-meta">${customer ? customer + ' &bull; ' : ''}Vehicle Report</div>
    </div>
    <div class="gen-date">Generated<br/>${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
  </div>

  <div class="section">
    <div class="section-title">Vehicle Info</div>
    <div class="row" style="margin-bottom:14px">
      <div class="field" style="flex:2">
        <div class="label">VIN</div>
        <div class="value" style="font-family:monospace;font-size:15px;letter-spacing:0.04em">${vehicle.vin}</div>
      </div>
      <div class="field">
        <div class="label">Unit #</div>
        <div class="value">${vehicle.unit_number ?? '—'}</div>
      </div>
      <div class="field">
        <div class="label">Status</div>
        <div class="status-badge">${STATUS_LABEL[vehicle.status]}</div>
      </div>
    </div>
    <div class="row">
      <div class="field">
        <div class="label">Year / Make / Model</div>
        <div class="value">${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || '—'}</div>
      </div>
      <div class="field">
        <div class="label">Type</div>
        <div class="value">${vehicle.vehicle_type ?? '—'}</div>
      </div>
      <div class="field">
        <div class="label">Department</div>
        <div class="value">${vehicle.department ?? '—'}</div>
      </div>
    </div>
    ${vehicle.notes ? `<div style="margin-top:12px;padding:10px 14px;background:#f8fafc;border-radius:7px;font-size:13px;color:#475569"><span style="font-weight:700;color:#0f172a">Notes: </span>${vehicle.notes}</div>` : ''}
    ${vehicle.flagged && vehicle.flag_reason ? `<div style="margin-top:10px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:7px;font-size:13px;color:#dc2626"><span style="font-weight:700">⚠ Flagged: </span>${vehicle.flag_reason}</div>` : ''}
  </div>

  <div class="workflow-cols">
    <div class="workflow-col">
      <div class="workflow-title" style="color:#ea580c">Removal</div>
      <div style="margin-bottom:10px"><div class="label">Worker</div><div class="value">${remover?.name ?? '—'}</div></div>
      <div class="row" style="gap:14px">
        <div><div class="label">Start</div><div class="value" style="font-size:12px">${fmtTs(removalLog?.start_ts ?? null)}</div></div>
        <div><div class="label">End</div><div class="value" style="font-size:12px">${fmtTs(removalLog?.end_ts ?? null)}</div></div>
        <div><div class="label">Duration</div><div class="value" style="color:#ea580c">${fmtDuration(removalLog?.start_ts ?? null, removalLog?.end_ts ?? null)}</div></div>
      </div>
      ${removalLog?.notes ? `<div style="margin-top:10px"><div class="label">Notes</div><div style="font-size:12px;color:#475569;margin-top:2px">${removalLog.notes}</div></div>` : ''}
    </div>
    <div class="workflow-col">
      <div class="workflow-title" style="color:#7c3aed">Install</div>
      <div style="margin-bottom:10px"><div class="label">Worker</div><div class="value">${installer?.name ?? '—'}</div></div>
      <div class="row" style="gap:14px">
        <div><div class="label">Start</div><div class="value" style="font-size:12px">${fmtTs(installLog?.start_ts ?? null)}</div></div>
        <div><div class="label">End</div><div class="value" style="font-size:12px">${fmtTs(installLog?.end_ts ?? null)}</div></div>
        <div><div class="label">Duration</div><div class="value" style="color:#7c3aed">${fmtDuration(installLog?.start_ts ?? null, installLog?.end_ts ?? null)}</div></div>
      </div>
      ${installLog?.notes ? `<div style="margin-top:10px"><div class="label">Notes</div><div style="font-size:12px;color:#475569;margin-top:2px">${installLog.notes}</div></div>` : ''}
    </div>
  </div>

  ${hasBeforePhotos ? `
  <div class="section">
    <div class="section-title">Before Photos</div>
    <div class="photo-grid">${photoGrid(beforeTypes)}</div>
  </div>` : ''}

  ${damageDataUrls.length > 0 ? `
  <div class="section">
    <div class="section-title">Damage Photos (${damageDataUrls.length})</div>
    <div class="photo-grid">${damageDataUrls.map(url => `<div class="photo-slot"><img src="${url}" /><div class="photo-label">Damage</div></div>`).join('')}</div>
  </div>` : ''}

  ${hasAfterPhotos ? `
  <div class="section">
    <div class="section-title">After Photos</div>
    <div class="photo-grid">${photoGrid(afterTypes)}</div>
  </div>` : ''}

  ${hasDocPhotos ? `
  <div class="section">
    <div class="section-title">Documentation</div>
    <div class="doc-grid">${photoGrid(docTypes)}</div>
  </div>` : ''}

  <div class="footer">
    <span>Wrap GFX Fleet Operations System</span>
    <span>${jobName} &bull; ${vehicle.vin} &bull; Confidential</span>
  </div>

  <div class="print-btn">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) { alert('Please allow popups to open the PDF.'); return }
  win.document.write(html)
  win.document.close()
}

export function exportJobCSV(
  vehicles: FleetVehicle[],
  timelogs: FleetTimeLog[],
  photos: Array<{ vehicle_id: string; photo_type: string }>,
  fleetUsers: Map<string, FleetUser>,
  jobName: string
) {
  const headers = [
    'VIN', 'Unit#', 'Year', 'Make', 'Model', 'Type', 'Department', 'Status', 'Flagged', 'Flag Reason',
    'Remover', 'Removal Start', 'Removal End', 'Removal Duration',
    'Installer', 'Install Start', 'Install End', 'Install Duration',
    'Before Photos', 'After Photos', 'VIN Sticker', 'Tire Photo', 'Notes',
  ]

  const rows = vehicles.map(v => {
    const removal = timelogs.find(l => l.vehicle_id === v.id && l.log_type === 'removal')
    const install = timelogs.find(l => l.vehicle_id === v.id && l.log_type === 'install')
    const vPhotos = photos.filter(p => p.vehicle_id === v.id)
    const beforeCount = vPhotos.filter(p => p.photo_type.startsWith('before_')).length
    const afterCount = vPhotos.filter(p => p.photo_type.startsWith('after_')).length

    return [
      v.vin, v.unit_number ?? '', v.year ?? '', v.make ?? '', v.model ?? '', v.vehicle_type ?? '',
      v.department ?? '', STATUS_LABEL[v.status], v.flagged ? 'Yes' : 'No', v.flag_reason ?? '',
      removal?.fleet_user_id ? (fleetUsers.get(removal.fleet_user_id)?.name ?? '') : '',
      removal?.start_ts ? new Date(removal.start_ts).toLocaleString() : '',
      removal?.end_ts ? new Date(removal.end_ts).toLocaleString() : '',
      fmtDuration(removal?.start_ts ?? null, removal?.end_ts ?? null),
      install?.fleet_user_id ? (fleetUsers.get(install.fleet_user_id)?.name ?? '') : '',
      install?.start_ts ? new Date(install.start_ts).toLocaleString() : '',
      install?.end_ts ? new Date(install.end_ts).toLocaleString() : '',
      fmtDuration(install?.start_ts ?? null, install?.end_ts ?? null),
      beforeCount, afterCount,
      vPhotos.some(p => p.photo_type === 'vin_sticker') ? 'Yes' : 'No',
      vPhotos.some(p => p.photo_type === 'tire_size') ? 'Yes' : 'No',
      v.notes ?? '',
    ]
  })

  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${jobName.replace(/\s+/g, '-')}-vehicles-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
