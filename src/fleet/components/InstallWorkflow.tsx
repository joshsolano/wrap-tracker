import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useFleetAuth } from '../context/FleetAuthContext'
import { F } from '../lib/fleetColors'
import type { FleetVehicle, FleetVehiclePhoto, FleetTimeLog, PhotoType } from '../lib/fleetTypes'
import { PHOTO_LABEL, REQUIRED_AFTER } from '../lib/fleetTypes'

const AFTER_PHOTOS: PhotoType[] = ['after_front', 'after_driver', 'after_passenger', 'after_rear', 'vin_sticker', 'tire_size']

function fmtSecs(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

interface Props {
  vehicle: FleetVehicle
  jobId: string
  onStatusChange: (status: FleetVehicle['status']) => void
}

export default function InstallWorkflow({ vehicle, jobId, onStatusChange }: Props) {
  const { fleetUser } = useFleetAuth()
  const [photos, setPhotos] = useState<FleetVehiclePhoto[]>([])
  const [timelog, setTimelog] = useState<FleetTimeLog | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<PhotoType | null>(null)
  const [, setTick] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingType = useRef<PhotoType | null>(null)

  const isRunning = !!timelog?.start_ts && !timelog?.end_ts

  useEffect(() => {
    if (!isRunning) return
    const id = setInterval(() => setTick(t => t + 1), 500)
    return () => clearInterval(id)
  }, [isRunning])

  async function loadData() {
    const [{ data: photoData }, { data: logData }] = await Promise.all([
      supabase.from('fleet_vehicle_photos').select('*').eq('vehicle_id', vehicle.id)
        .in('photo_type', AFTER_PHOTOS).order('created_at'),
      supabase.from('fleet_vehicle_time_logs').select('*')
        .eq('vehicle_id', vehicle.id).eq('log_type', 'install')
        .order('created_at', { ascending: false }).limit(1),
    ])

    const rawPhotos = (photoData ?? []) as FleetVehiclePhoto[]
    setPhotos(rawPhotos.map(p => ({
      ...p,
      publicUrl: supabase.storage.from('fleet-photos').getPublicUrl(p.storage_path).data.publicUrl,
    })))

    const log = logData?.[0] as FleetTimeLog | undefined
    if (log) { setTimelog(log); setNotes(log.notes ?? '') }
  }

  useEffect(() => { loadData() }, [vehicle.id])

  function openUpload(type: PhotoType) { pendingType.current = type; fileRef.current?.click() }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const type = pendingType.current
    if (!file || !type) return
    setUploading(type)
    const path = `${jobId}/${vehicle.id}/${type}-${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('fleet-photos').upload(path, file)
    if (upErr) { alert('Upload failed: ' + upErr.message); setUploading(null); e.target.value = ''; return }
    const { error: dbErr } = await supabase.from('fleet_vehicle_photos').insert({
      vehicle_id: vehicle.id, fleet_job_id: jobId, photo_type: type,
      storage_path: path, uploaded_by: fleetUser?.id ?? null,
    })
    if (dbErr) { alert('Save failed: ' + dbErr.message); setUploading(null); e.target.value = ''; return }
    await loadData()
    setUploading(null)
    e.target.value = ''
  }

  async function startTimer() {
    setSaving(true)
    const { data, error } = await supabase.from('fleet_vehicle_time_logs').insert({
      vehicle_id: vehicle.id, fleet_user_id: fleetUser?.id ?? null,
      log_type: 'install', start_ts: new Date().toISOString(),
    }).select('*').single()
    if (error) { alert(error.message); setSaving(false); return }
    setTimelog(data as FleetTimeLog)
    await supabase.from('fleet_vehicles').update({ status: 'installing' }).eq('id', vehicle.id)
    onStatusChange('installing')
    setSaving(false)
  }

  async function stopTimer() {
    if (!timelog?.id) return
    setSaving(true)
    const now = new Date().toISOString()
    await supabase.from('fleet_vehicle_time_logs').update({ end_ts: now }).eq('id', timelog.id)
    setTimelog(t => t ? { ...t, end_ts: now } : t)
    setSaving(false)
  }

  async function saveNotes() {
    if (!timelog?.id) return
    await supabase.from('fleet_vehicle_time_logs').update({ notes }).eq('id', timelog.id)
  }

  async function markComplete() {
    const allUploaded = REQUIRED_AFTER.every(pt => photos.some(p => p.photo_type === pt))
    if (!allUploaded) {
      const missing = REQUIRED_AFTER.filter(pt => !photos.some(p => p.photo_type === pt))
        .map(pt => PHOTO_LABEL[pt]).join(', ')
      alert(`Missing required photos: ${missing}`)
      return
    }
    setSaving(true)
    await supabase.from('fleet_vehicles').update({ status: 'install_complete' }).eq('id', vehicle.id)
    onStatusChange('install_complete')
    setSaving(false)
  }

  const elapsed = isRunning
    ? Math.floor((Date.now() - new Date(timelog!.start_ts!).getTime()) / 1000)
    : timelog?.start_ts && timelog.end_ts
      ? Math.floor((new Date(timelog.end_ts).getTime() - new Date(timelog.start_ts!).getTime()) / 1000)
      : 0

  const photoFor = (type: PhotoType) => photos.find(p => p.photo_type === type)
  const allRequired = REQUIRED_AFTER.every(pt => photos.some(p => p.photo_type === pt))
  const canStart = ['ready_for_install', 'installing'].includes(vehicle.status)

  const sectionStyle: React.CSSProperties = {
    background: F.surface, border: `1px solid ${F.border}`, borderRadius: 16, padding: 18, marginBottom: 12,
  }

  if (!canStart && !['install_complete', 'qc', 'completed'].includes(vehicle.status)) {
    return (
      <div style={{ ...sectionStyle, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: F.text, marginBottom: 6 }}>Waiting for Removal</div>
        <div style={{ fontSize: 13, color: F.textSec }}>This vehicle must complete removal before install can begin.</div>
      </div>
    )
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />

      {/* Timer */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: F.text, marginBottom: 14 }}>Install Timer</div>
        {timelog?.start_ts ? (
          <div>
            <div style={{ fontSize: 40, fontWeight: 900, color: isRunning ? F.purple : F.text, fontFamily: 'monospace', textAlign: 'center', marginBottom: 4 }}>
              {fmtSecs(elapsed)}
            </div>
            <div style={{ fontSize: 12, color: F.textSec, textAlign: 'center', marginBottom: 14 }}>
              {isRunning ? `Started ${new Date(timelog.start_ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Stopped'}
            </div>
            {isRunning && (
              <button onClick={stopTimer} disabled={saving}
                style={{ width: '100%', padding: 18, borderRadius: 14, background: F.red, color: '#fff', border: 'none', fontSize: 17, fontWeight: 800, cursor: 'pointer' }}>
                Stop Install
              </button>
            )}
          </div>
        ) : (
          <button onClick={startTimer} disabled={saving}
            style={{ width: '100%', padding: 22, borderRadius: 14, background: F.purple, color: '#fff', border: 'none', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>
            Start Install
          </button>
        )}
      </div>

      {/* After Photos */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: F.text, marginBottom: 14 }}>
          After Photos {allRequired && <span style={{ color: F.green }}>✓</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {AFTER_PHOTOS.map(type => {
            const photo = photoFor(type)
            const isUploading = uploading === type
            const required = REQUIRED_AFTER.includes(type)
            return (
              <div key={type}>
                {photo ? (
                  <div style={{ position: 'relative' }}>
                    <img
                      src={photo.publicUrl}
                      alt={PHOTO_LABEL[type]}
                      style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, border: `1px solid ${F.green}44` }}
                    />
                    <div style={{ position: 'absolute', bottom: 4, left: 4, right: 4, fontSize: 9, color: '#fff', background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '2px 4px', textAlign: 'center' }}>
                      {PHOTO_LABEL[type]}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => openUpload(type)}
                    disabled={isUploading}
                    style={{ width: '100%', aspectRatio: '1', borderRadius: 10, border: `2px dashed ${required ? F.cyan + '88' : F.border}`, background: F.surface2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 4 }}
                  >
                    {isUploading ? (
                      <span style={{ fontSize: 11, color: F.textSec }}>…</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 22 }}>📷</span>
                        <span style={{ fontSize: 10, color: required ? F.cyan : F.textTer }}>{PHOTO_LABEL[type]}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Notes */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: F.text, marginBottom: 10 }}>Notes</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          placeholder="Notes about the install…"
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: F.surface2, color: F.text, border: `1px solid ${F.border}`, fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      {/* Complete */}
      {['ready_for_install', 'installing', 'install_complete'].includes(vehicle.status) && (
        <button
          onClick={markComplete}
          disabled={saving || !allRequired}
          style={{ width: '100%', padding: 22, borderRadius: 16, background: saving || !allRequired ? F.surface2 : F.cyan, color: saving || !allRequired ? F.textTer : '#fff', border: 'none', fontSize: 17, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', marginTop: 4 }}
        >
          {!allRequired ? 'Upload all after photos to complete' : 'Mark Install Complete →'}
        </button>
      )}
    </div>
  )
}
