import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useFleetAuth } from '../context/FleetAuthContext'
import { F } from '../lib/fleetColors'
import type { FleetVehicle, FleetVehiclePhoto, FleetTimeLog, PhotoType } from '../lib/fleetTypes'
import { PHOTO_LABEL, REQUIRED_BEFORE } from '../lib/fleetTypes'

const BEFORE_PHOTOS: PhotoType[] = ['before_front', 'before_driver', 'before_passenger', 'before_rear']

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

export default function RemovalWorkflow({ vehicle, jobId, onStatusChange }: Props) {
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
        .in('photo_type', [...BEFORE_PHOTOS, 'before_damage']).order('created_at'),
      supabase.from('fleet_vehicle_time_logs').select('*')
        .eq('vehicle_id', vehicle.id).eq('log_type', 'removal')
        .order('created_at', { ascending: false }).limit(1),
    ])

    const rawPhotos = (photoData ?? []) as FleetVehiclePhoto[]
    const withUrls = rawPhotos.map(p => ({
      ...p,
      publicUrl: supabase.storage.from('fleet-photos').getPublicUrl(p.storage_path).data.publicUrl,
    }))
    setPhotos(withUrls)

    const log = logData?.[0] as FleetTimeLog | undefined
    if (log) {
      setTimelog(log)
      setNotes(log.notes ?? '')
    }
  }

  useEffect(() => { loadData() }, [vehicle.id])

  function openUpload(type: PhotoType) {
    pendingType.current = type
    fileRef.current?.click()
  }

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
      log_type: 'removal', start_ts: new Date().toISOString(),
    }).select('*').single()
    if (error) { alert(error.message); setSaving(false); return }
    setTimelog(data as FleetTimeLog)
    await supabase.from('fleet_vehicles').update({ status: 'removing' }).eq('id', vehicle.id)
    onStatusChange('removing')
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
    const requiredUploaded = REQUIRED_BEFORE.every(pt => photos.some(p => p.photo_type === pt))
    if (!requiredUploaded) { alert('Please upload all required before photos first (front, driver, passenger, rear).'); return }
    setSaving(true)
    await supabase.from('fleet_vehicles').update({ status: 'ready_for_install' }).eq('id', vehicle.id)
    onStatusChange('ready_for_install')
    setSaving(false)
  }

  const elapsed = isRunning
    ? Math.floor((Date.now() - new Date(timelog!.start_ts!).getTime()) / 1000)
    : timelog?.start_ts && timelog.end_ts
      ? Math.floor((new Date(timelog.end_ts).getTime() - new Date(timelog.start_ts!).getTime()) / 1000)
      : 0

  const photoFor = (type: PhotoType) => photos.find(p => p.photo_type === type)
  const damagePhotos = photos.filter(p => p.photo_type === 'before_damage')
  const allRequired = REQUIRED_BEFORE.every(pt => photos.some(p => p.photo_type === pt))

  const sectionStyle: React.CSSProperties = {
    background: F.surface, border: `1px solid ${F.border}`, borderRadius: 16, padding: 18, marginBottom: 12,
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />

      {/* Before Photos */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: F.text, marginBottom: 14 }}>
          Before Photos {allRequired && <span style={{ color: F.green }}>✓</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {BEFORE_PHOTOS.map(type => {
            const photo = photoFor(type)
            const required = REQUIRED_BEFORE.includes(type)
            const isUploading = uploading === type
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
                    style={{ width: '100%', aspectRatio: '1', borderRadius: 10, border: `2px dashed ${required ? F.yellow + '88' : F.border}`, background: F.surface2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 4 }}
                  >
                    {isUploading ? (
                      <span style={{ fontSize: 11, color: F.textSec }}>…</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 22 }}>📷</span>
                        <span style={{ fontSize: 10, color: required ? F.yellow : F.textTer }}>{PHOTO_LABEL[type]}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Damage Photos */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: F.text, marginBottom: 14 }}>
          Damage Photos <span style={{ fontSize: 12, color: F.textSec, fontWeight: 400 }}>({damagePhotos.length})</span>
        </div>
        {damagePhotos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            {damagePhotos.map(photo => (
              <div key={photo.id} style={{ position: 'relative' }}>
                <img
                  src={photo.publicUrl}
                  alt="Damage"
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, border: `1px solid ${F.red}55` }}
                />
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => openUpload('before_damage')}
          disabled={uploading === 'before_damage'}
          style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: `2px dashed ${F.red}55`, background: F.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 8, color: F.textSec, fontSize: 13 }}
        >
          {uploading === 'before_damage' ? <span style={{ fontSize: 11 }}>…</span> : <><span style={{ fontSize: 18 }}>📷</span> Add Damage Photo</>}
        </button>
      </div>

      {/* Timer */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: F.text, marginBottom: 14 }}>Removal Timer</div>
        {timelog?.start_ts ? (
          <div>
            <div style={{ fontSize: 40, fontWeight: 900, color: isRunning ? F.orange : F.text, fontFamily: 'monospace', textAlign: 'center', marginBottom: 4 }}>
              {fmtSecs(elapsed)}
            </div>
            <div style={{ fontSize: 12, color: F.textSec, textAlign: 'center', marginBottom: 14 }}>
              {isRunning ? `Started ${new Date(timelog.start_ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Stopped'}
            </div>
            {isRunning && (
              <button onClick={stopTimer} disabled={saving}
                style={{ width: '100%', padding: 18, borderRadius: 14, background: F.red, color: '#fff', border: 'none', fontSize: 17, fontWeight: 800, cursor: 'pointer' }}>
                Stop Removal
              </button>
            )}
          </div>
        ) : (
          <button onClick={startTimer} disabled={saving}
            style={{ width: '100%', padding: 22, borderRadius: 14, background: F.orange, color: '#fff', border: 'none', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>
            Start Removal
          </button>
        )}
      </div>

      {/* Notes */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: F.text, marginBottom: 10 }}>Notes</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          placeholder="Damage, issues, observations…"
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: F.surface2, color: F.text, border: `1px solid ${F.border}`, fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      {/* Complete */}
      {['not_started', 'removing', 'removal_complete'].includes(vehicle.status) && (
        <button
          onClick={markComplete}
          disabled={saving || !allRequired}
          style={{ width: '100%', padding: 22, borderRadius: 16, background: saving || !allRequired ? F.surface2 : F.green, color: saving || !allRequired ? F.textTer : '#fff', border: 'none', fontSize: 17, fontWeight: 800, cursor: saving ? 'wait' : 'pointer', marginTop: 4 }}
        >
          {!allRequired ? 'Upload all 4 before photos to complete' : 'Mark Removal Complete →'}
        </button>
      )}
    </div>
  )
}
