import type { SupabaseClient } from '@supabase/supabase-js'
import type { FleetVehicle, FleetTimeLog, FleetUser, PhotoType } from './fleetTypes'
import { REQUIRED_BEFORE, REQUIRED_AFTER, STATUS_LABEL } from './fleetTypes'

// ── Types ─────────────────────────────────────────────────────────────────────

export type BucketType = 'public' | 'signed'
export type ExportStatusFilter = FleetVehicle['status'] | 'all' | 'completed' | 'flagged'

export interface ExportMeta {
  jobId: string
  jobName: string
  customer?: string
  exportedBy?: string
  bucketType: BucketType
  signedUrlExpiry?: number  // seconds — default 7 days
  statusFilter?: ExportStatusFilter
}

export interface ExportProgress {
  phase: 'querying' | 'urls' | 'photos' | 'zipping' | 'done' | 'error'
  current: number
  total: number
  message: string
}

interface PhotoRow {
  id: string
  vehicle_id: string
  photo_type: PhotoType
  storage_path: string
  upload_state: string
  created_at: string
  uploaded_by: string | null
}

type PhotoSlotMap = Map<PhotoType, PhotoRow>  // latest complete photo per slot
type VehiclePhotoIndex = Map<string, PhotoSlotMap>  // vehicle_id → slot map
type PhotoUrlMap = Partial<Record<PhotoType, string>>

const PHOTO_TYPES: PhotoType[] = [
  'before_front', 'before_driver', 'before_passenger', 'before_rear',
  'after_front', 'after_driver', 'after_passenger', 'after_rear',
  'vin_sticker', 'tire_size',
]

const CSV_HEADERS = [
  'vin', 'unit_number', 'year', 'make', 'model', 'status',
  'removal_time', 'install_time', 'assigned_users', 'notes', 'flagged', 'flag_reason',
  'before_front_url', 'before_driver_url', 'before_passenger_url', 'before_rear_url',
  'after_front_url', 'after_driver_url', 'after_passenger_url', 'after_rear_url',
  'vin_sticker_url', 'tire_size_url',
  'export_generated_at', 'export_generated_by', 'photo_bucket_type', 'signed_url_expires_at',
]

const EXPIRY_DEFAULT = 60 * 60 * 24 * 7  // 7 days

// ── CSV helpers ───────────────────────────────────────────────────────────────

function esc(val: unknown): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function toCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.join(',')]
  for (const row of rows) lines.push(headers.map(h => esc(row[h])).join(','))
  return '﻿' + lines.join('\r\n')  // BOM ensures Excel opens correctly
}

export function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function fmtDuration(logs: FleetTimeLog[], logType: 'removal' | 'install'): string {
  const done = logs
    .filter(l => l.log_type === logType && l.start_ts && l.end_ts)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  if (!done.length) return ''
  const l = done[0]
  const mins = (new Date(l.end_ts!).getTime() - new Date(l.start_ts!).getTime()) / 60000
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function vehicleAssignedUsers(
  vehicleId: string,
  logs: FleetTimeLog[],
  users: Map<string, FleetUser>
): string {
  const vLogs = logs.filter(l => l.vehicle_id === vehicleId)
  const ids = [...new Set(vLogs.map(l => l.fleet_user_id).filter(Boolean) as string[])]
  return ids.map(id => users.get(id)?.name ?? id).join('; ')
}

function missingRequiredPhotos(v: FleetVehicle, slots: PhotoSlotMap | undefined): PhotoType[] {
  const have = slots ? [...slots.keys()] : []
  const missing: PhotoType[] = []
  const needsBefore = ['removing', 'removal_complete', 'ready_for_install', 'installing',
                       'install_complete', 'qc', 'completed'].includes(v.status)
  const needsAfter = ['install_complete', 'qc', 'completed'].includes(v.status)
  if (needsBefore) for (const pt of REQUIRED_BEFORE) if (!have.includes(pt)) missing.push(pt)
  if (needsAfter)  for (const pt of REQUIRED_AFTER)  if (!have.includes(pt)) missing.push(pt)
  return missing
}

// ── Data fetching ─────────────────────────────────────────────────────────────

interface JobData {
  vehicles: FleetVehicle[]
  photos: PhotoRow[]
  logs: FleetTimeLog[]
  users: Map<string, FleetUser>
}

async function fetchJobData(
  supabase: SupabaseClient,
  jobId: string,
  statusFilter: ExportStatusFilter = 'all'
): Promise<JobData> {
  let vq = supabase.from('fleet_vehicles').select('*').eq('fleet_job_id', jobId)
  if (statusFilter === 'completed') vq = vq.eq('status', 'completed')
  else if (statusFilter === 'flagged') vq = vq.eq('flagged', true)
  else if (statusFilter !== 'all') vq = vq.eq('status', statusFilter)

  const [{ data: vData, error: vErr }, { data: pData, error: pErr }, { data: uData }] =
    await Promise.all([
      vq.order('unit_number', { nullsFirst: false }).order('vin').limit(2000),
      supabase
        .from('fleet_vehicle_photos')
        .select('id, vehicle_id, photo_type, storage_path, upload_state, created_at, uploaded_by')
        .eq('fleet_job_id', jobId)
        .eq('upload_state', 'complete')
        .order('created_at', { ascending: false })
        .limit(10000),
      supabase.from('fleet_users').select('*').limit(500),
    ])

  if (vErr) throw new Error('Failed to load vehicles: ' + vErr.message)
  if (pErr) throw new Error('Failed to load photos: ' + pErr.message)

  const vehicles = (vData ?? []) as FleetVehicle[]
  const vehicleIds = vehicles.map(v => v.id)

  const { data: lData } = vehicleIds.length > 0
    ? await supabase
        .from('fleet_vehicle_time_logs')
        .select('*')
        .in('vehicle_id', vehicleIds)
        .limit(5000)
    : { data: [] }

  const users = new Map<string, FleetUser>()
  for (const u of (uData ?? []) as FleetUser[]) users.set(u.id, u)

  return {
    vehicles,
    photos: (pData ?? []) as PhotoRow[],
    logs: (lData ?? []) as FleetTimeLog[],
    users,
  }
}

// Returns only vehicles that had at least one time log on the given date (UTC)
function filterByDate(vehicles: FleetVehicle[], logs: FleetTimeLog[], date: string): FleetVehicle[] {
  const workedIds = new Set(
    logs
      .filter(l => l.start_ts?.startsWith(date))
      .map(l => l.vehicle_id)
  )
  return vehicles.filter(v => workedIds.has(v.id))
}

// ── Photo index ───────────────────────────────────────────────────────────────

// Photos are pre-sorted by created_at DESC — first match per slot is the latest
function buildPhotoIndex(photos: PhotoRow[]): VehiclePhotoIndex {
  const idx: VehiclePhotoIndex = new Map()
  for (const p of photos) {
    if (!idx.has(p.vehicle_id)) idx.set(p.vehicle_id, new Map())
    const slots = idx.get(p.vehicle_id)!
    if (!slots.has(p.photo_type)) slots.set(p.photo_type, p)
  }
  return idx
}

async function resolvePhotoUrls(
  supabase: SupabaseClient,
  slots: PhotoSlotMap | undefined,
  bucketType: BucketType,
  expirySecs: number
): Promise<PhotoUrlMap> {
  if (!slots?.size) return {}
  const entries = [...slots.entries()]
  const urls = await Promise.all(
    entries.map(([, p]) => {
      if (bucketType === 'public') {
        return Promise.resolve(
          supabase.storage.from('fleet-photos').getPublicUrl(p.storage_path).data.publicUrl
        )
      }
      return supabase.storage
        .from('fleet-photos')
        .createSignedUrl(p.storage_path, expirySecs)
        .then(({ data }) => data?.signedUrl ?? '')
    })
  )
  const result: PhotoUrlMap = {}
  entries.forEach(([type], i) => { result[type] = urls[i] })
  return result
}

// Batched to avoid hammering signed URL API
async function resolveAllPhotoUrls(
  supabase: SupabaseClient,
  vehicles: FleetVehicle[],
  idx: VehiclePhotoIndex,
  bucketType: BucketType,
  expirySecs: number
): Promise<Map<string, PhotoUrlMap>> {
  const result = new Map<string, PhotoUrlMap>()
  const BATCH = bucketType === 'signed' ? 10 : 50
  for (let i = 0; i < vehicles.length; i += BATCH) {
    const batch = vehicles.slice(i, i + BATCH)
    const maps = await Promise.all(
      batch.map(v => resolvePhotoUrls(supabase, idx.get(v.id), bucketType, expirySecs))
    )
    batch.forEach((v, j) => result.set(v.id, maps[j]))
  }
  return result
}

// ── CSV row builder ───────────────────────────────────────────────────────────

function buildCSVRow(
  v: FleetVehicle,
  urlMap: PhotoUrlMap,
  logs: FleetTimeLog[],
  users: Map<string, FleetUser>,
  meta: ExportMeta,
  now: string,
  expiresAt: string
): Record<string, unknown> {
  const vLogs = logs.filter(l => l.vehicle_id === v.id)
  return {
    vin:                  v.vin,
    unit_number:          v.unit_number ?? '',
    year:                 v.year ?? '',
    make:                 v.make ?? '',
    model:                v.model ?? '',
    status:               STATUS_LABEL[v.status],
    removal_time:         fmtDuration(vLogs, 'removal'),
    install_time:         fmtDuration(vLogs, 'install'),
    assigned_users:       vehicleAssignedUsers(v.id, logs, users),
    notes:                v.notes ?? '',
    flagged:              v.flagged ? 'Yes' : 'No',
    flag_reason:          v.flag_reason ?? '',
    before_front_url:     urlMap.before_front ?? '',
    before_driver_url:    urlMap.before_driver ?? '',
    before_passenger_url: urlMap.before_passenger ?? '',
    before_rear_url:      urlMap.before_rear ?? '',
    after_front_url:      urlMap.after_front ?? '',
    after_driver_url:     urlMap.after_driver ?? '',
    after_passenger_url:  urlMap.after_passenger ?? '',
    after_rear_url:       urlMap.after_rear ?? '',
    vin_sticker_url:      urlMap.vin_sticker ?? '',
    tire_size_url:        urlMap.tire_size ?? '',
    export_generated_at:  now,
    export_generated_by:  meta.exportedBy ?? '',
    photo_bucket_type:    meta.bucketType,
    signed_url_expires_at: meta.bucketType === 'signed' ? expiresAt : '',
  }
}

// ── Public CSV exports ────────────────────────────────────────────────────────

export async function exportDailyCSV(
  supabase: SupabaseClient,
  meta: ExportMeta & { date: string }
): Promise<void> {
  const expiry = meta.signedUrlExpiry ?? EXPIRY_DEFAULT
  const { vehicles: all, photos, logs, users } = await fetchJobData(supabase, meta.jobId)
  const vehicles = filterByDate(all, logs, meta.date)
  if (!vehicles.length) throw new Error('No vehicles worked on this date.')

  const idx = buildPhotoIndex(photos)
  const urlMaps = await resolveAllPhotoUrls(supabase, vehicles, idx, meta.bucketType, expiry)

  const now = new Date().toISOString()
  const expiresAt = meta.bucketType === 'signed'
    ? new Date(Date.now() + expiry * 1000).toISOString() : ''

  const rows = vehicles.map(v =>
    buildCSVRow(v, urlMaps.get(v.id) ?? {}, logs, users, meta, now, expiresAt)
  )
  const slug = meta.jobName.replace(/\s+/g, '-')
  downloadText(toCSV(CSV_HEADERS, rows), `${slug}_daily_${meta.date}.csv`)
}

export async function exportFleetCSV(
  supabase: SupabaseClient,
  meta: ExportMeta
): Promise<void> {
  const expiry = meta.signedUrlExpiry ?? EXPIRY_DEFAULT
  const { vehicles, photos, logs, users } =
    await fetchJobData(supabase, meta.jobId, meta.statusFilter ?? 'all')
  if (!vehicles.length) throw new Error('No vehicles match the selected filter.')

  const idx = buildPhotoIndex(photos)
  const urlMaps = await resolveAllPhotoUrls(supabase, vehicles, idx, meta.bucketType, expiry)

  const now = new Date().toISOString()
  const expiresAt = meta.bucketType === 'signed'
    ? new Date(Date.now() + expiry * 1000).toISOString() : ''

  const rows = vehicles.map(v =>
    buildCSVRow(v, urlMaps.get(v.id) ?? {}, logs, users, meta, now, expiresAt)
  )
  const slug = meta.jobName.replace(/\s+/g, '-')
  const suffix = meta.statusFilter && meta.statusFilter !== 'all' ? `_${meta.statusFilter}` : ''
  downloadText(toCSV(CSV_HEADERS, rows), `${slug}${suffix}_fleet.csv`)
}

export async function exportVehicleCSV(
  supabase: SupabaseClient,
  vehicle: FleetVehicle,
  meta: ExportMeta
): Promise<void> {
  const expiry = meta.signedUrlExpiry ?? EXPIRY_DEFAULT
  const [{ data: pData }, { data: lData }, { data: uData }] = await Promise.all([
    supabase
      .from('fleet_vehicle_photos')
      .select('id, vehicle_id, photo_type, storage_path, upload_state, created_at, uploaded_by')
      .eq('vehicle_id', vehicle.id)
      .eq('upload_state', 'complete')
      .order('created_at', { ascending: false }),
    supabase.from('fleet_vehicle_time_logs').select('*').eq('vehicle_id', vehicle.id),
    supabase.from('fleet_users').select('*').limit(500),
  ])

  const users = new Map<string, FleetUser>()
  for (const u of (uData ?? []) as FleetUser[]) users.set(u.id, u)

  const photos = (pData ?? []) as PhotoRow[]
  const slots: PhotoSlotMap = new Map()
  for (const p of photos) {
    if (!slots.has(p.photo_type)) slots.set(p.photo_type, p)
  }

  const urlMap = await resolvePhotoUrls(supabase, slots, meta.bucketType, expiry)
  const now = new Date().toISOString()
  const expiresAt = meta.bucketType === 'signed'
    ? new Date(Date.now() + expiry * 1000).toISOString() : ''

  const logs = (lData ?? []) as FleetTimeLog[]
  const row = buildCSVRow(vehicle, urlMap, logs, users, meta, now, expiresAt)
  const slug = vehicle.unit_number ?? vehicle.vin.slice(-8)
  downloadText(toCSV(CSV_HEADERS, [row]), `vehicle_${slug}.csv`)
}

// ── ZIP export ────────────────────────────────────────────────────────────────

const MANIFEST_HEADERS = [
  'vin', 'unit_number', 'year', 'make', 'model', 'status',
  'photo_type', 'file_name', 'included_in_zip', 'storage_path', 'uploaded_at',
]
const MISSING_HEADERS = ['vin', 'unit_number', 'status', 'missing_required_photos']
const FAILED_HEADERS  = ['vin', 'unit_number', 'photo_type', 'error_reason']

export async function exportPhotosZip(
  supabase: SupabaseClient,
  meta: ExportMeta,
  onProgress: (p: ExportProgress) => void
): Promise<void> {
  const prog = (phase: ExportProgress['phase'], current: number, total: number, message: string) =>
    onProgress({ phase, current, total, message })

  // ── 1. Load data ────────────────────────────────────────────────────────────
  prog('querying', 0, 0, 'Loading vehicle data…')
  const { vehicles, photos, logs, users } =
    await fetchJobData(supabase, meta.jobId, meta.statusFilter ?? 'all')
  if (!vehicles.length) throw new Error('No vehicles match the selected filter.')

  // ── 2. Resolve photo URLs ───────────────────────────────────────────────────
  prog('urls', 0, vehicles.length, `Resolving URLs for ${vehicles.length} vehicles…`)
  const expiry = meta.signedUrlExpiry ?? EXPIRY_DEFAULT
  const idx = buildPhotoIndex(photos)
  const urlMaps = await resolveAllPhotoUrls(supabase, vehicles, idx, meta.bucketType, expiry)

  // ── 3. Build download task list ─────────────────────────────────────────────
  interface PhotoTask {
    vehicle: FleetVehicle
    photoType: PhotoType
    url: string
    storagePath: string
    uploadedAt: string
    vehicleFolder: string  // e.g. "T-042 - 1HGBH41JXMN109186"
  }

  const tasks: PhotoTask[] = []
  for (const v of vehicles) {
    const slots = idx.get(v.id)
    const urlMap = urlMaps.get(v.id) ?? {}
    const label = sanitizeFolderName(v.unit_number ? `${v.unit_number} - ${v.vin}` : v.vin)
    for (const pt of PHOTO_TYPES) {
      const url = urlMap[pt]
      const slot = slots?.get(pt)
      if (url && slot) {
        tasks.push({
          vehicle: v,
          photoType: pt,
          url,
          storagePath: slot.storage_path,
          uploadedAt: slot.created_at,
          vehicleFolder: label,
        })
      }
    }
  }

  // ── 4. Download photos in batches and build ZIP ────────────────────────────
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const photosRoot = zip.folder('Fleet-Photos')!

  const failedDownloads: { vin: string; unit: string; photoType: string; error: string }[] = []
  let downloaded = 0
  const BATCH = 10

  for (let i = 0; i < tasks.length; i += BATCH) {
    const batch = tasks.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(t => fetch(t.url).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.arrayBuffer()
      }))
    )

    results.forEach((result, j) => {
      const task = batch[j]
      if (result.status === 'fulfilled') {
        photosRoot.folder(task.vehicleFolder)!.file(`${task.photoType}.jpg`, result.value)
        downloaded++
      } else {
        failedDownloads.push({
          vin:       task.vehicle.vin,
          unit:      task.vehicle.unit_number ?? '',
          photoType: task.photoType,
          error:     (result.reason as Error)?.message ?? 'Unknown error',
        })
      }
    })

    prog('photos', i + batch.length, tasks.length,
      `Downloading photos (${Math.min(i + BATCH, tasks.length)}/${tasks.length})…`)
  }

  // ── 5. Support files ────────────────────────────────────────────────────────
  prog('zipping', 0, 0, 'Building support files…')

  // manifest.csv — every photo slot for every vehicle
  const manifestRows: Record<string, unknown>[] = []
  for (const v of vehicles) {
    const slots = idx.get(v.id)
    for (const pt of PHOTO_TYPES) {
      const slot = slots?.get(pt)
      const inZip = slot !== undefined && !failedDownloads.some(
        f => f.vin === v.vin && f.photoType === pt
      )
      manifestRows.push({
        vin:             v.vin,
        unit_number:     v.unit_number ?? '',
        year:            v.year ?? '',
        make:            v.make ?? '',
        model:           v.model ?? '',
        status:          STATUS_LABEL[v.status],
        photo_type:      pt,
        file_name:       slot ? `${pt}.jpg` : '',
        included_in_zip: slot ? (inZip ? 'true' : 'false') : 'false',
        storage_path:    slot?.storage_path ?? '',
        uploaded_at:     slot?.created_at ?? '',
      })
    }
  }
  zip.file('manifest.csv', toCSV(MANIFEST_HEADERS, manifestRows))

  // missing_photos.csv — vehicles with missing required photos
  const missingRows: Record<string, unknown>[] = []
  for (const v of vehicles) {
    const missing = missingRequiredPhotos(v, idx.get(v.id))
    if (missing.length > 0) {
      missingRows.push({
        vin:                    v.vin,
        unit_number:            v.unit_number ?? '',
        status:                 STATUS_LABEL[v.status],
        missing_required_photos: missing.join('; '),
      })
    }
  }
  if (missingRows.length > 0) zip.file('missing_photos.csv', toCSV(MISSING_HEADERS, missingRows))

  // failed_downloads.csv — only included if there were failures
  if (failedDownloads.length > 0) {
    zip.file('failed_downloads.csv', toCSV(FAILED_HEADERS, failedDownloads.map(f => ({
      vin: f.vin, unit_number: f.unit, photo_type: f.photoType, error_reason: f.error,
    }))))
  }

  // ── 6. Generate and trigger download ────────────────────────────────────────
  prog('zipping', 0, 0, 'Compressing ZIP…')
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',  // JPEGs are already compressed — STORE is faster and same size
  })

  const slug = meta.jobName.replace(/\s+/g, '-')
  const suffix = meta.statusFilter && meta.statusFilter !== 'all' ? `_${meta.statusFilter}` : ''
  const filename = `${slug}${suffix}_photos.zip`

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 15000)

  // Also export a Fleet CSV alongside the ZIP (same data, easy reference)
  const now = new Date().toISOString()
  const expiresAt = meta.bucketType === 'signed'
    ? new Date(Date.now() + expiry * 1000).toISOString() : ''
  const csvRows = vehicles.map(v =>
    buildCSVRow(v, urlMaps.get(v.id) ?? {}, logs, users, meta, now, expiresAt)
  )
  downloadText(toCSV(CSV_HEADERS, csvRows), `${slug}${suffix}_fleet.csv`)

  prog('done', downloaded, tasks.length,
    `Done — ${downloaded} photos downloaded${failedDownloads.length > 0 ? `, ${failedDownloads.length} failed` : ''}`)
}

// ── Photo count estimate ───────────────────────────────────────────────────────

export async function estimateZipContents(
  supabase: SupabaseClient,
  jobId: string,
  statusFilter: ExportStatusFilter = 'all'
): Promise<{ vehicleCount: number; photoCount: number }> {
  let vq = supabase.from('fleet_vehicles').select('id', { count: 'exact', head: true })
    .eq('fleet_job_id', jobId)
  if (statusFilter === 'completed') vq = vq.eq('status', 'completed')
  else if (statusFilter === 'flagged') vq = vq.eq('flagged', true)
  else if (statusFilter !== 'all') vq = vq.eq('status', statusFilter)

  const [{ count: vCount }, { count: pCount }] = await Promise.all([
    vq,
    supabase
      .from('fleet_vehicle_photos')
      .select('id', { count: 'exact', head: true })
      .eq('fleet_job_id', jobId)
      .eq('upload_state', 'complete'),
  ])
  return { vehicleCount: vCount ?? 0, photoCount: pCount ?? 0 }
}
