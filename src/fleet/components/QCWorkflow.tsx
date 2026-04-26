import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { F } from '../lib/fleetColors'
import type { FleetVehicle, FleetVehiclePhoto } from '../lib/fleetTypes'

interface Props {
  vehicle: FleetVehicle
  onStatusChange: (status: FleetVehicle['status']) => void
}

interface CheckState {
  before_photos: boolean
  removal_done: boolean
  after_photos: boolean
  vin_sticker: boolean
  tire_photo: boolean
  branding_correct: boolean
  no_adhesive: boolean
}

const CHECK_LABELS: Record<keyof CheckState, string> = {
  before_photos: 'Before photos present',
  removal_done: 'Removal completed',
  after_photos: 'After photos present',
  vin_sticker: 'VIN door sticker photo',
  tire_photo: 'Tire size photo',
  branding_correct: 'Branding correct',
  no_adhesive: 'No adhesive remaining',
}

export default function QCWorkflow({ vehicle, onStatusChange }: Props) {
  const [photos, setPhotos] = useState<FleetVehiclePhoto[]>([])
  const [checks, setChecks] = useState<CheckState>({
    before_photos: false, removal_done: false, after_photos: false,
    vin_sticker: false, tire_photo: false, branding_correct: false, no_adhesive: false,
  })
  const [flagNote, setFlagNote] = useState('')
  const [showFlag, setShowFlag] = useState(false)
  const [saving, setSaving] = useState(false)

  async function loadData() {
    const { data } = await supabase.from('fleet_vehicle_photos').select('*').eq('vehicle_id', vehicle.id)
    const photoList = (data ?? []) as FleetVehiclePhoto[]
    setPhotos(photoList.map(p => ({
      ...p,
      publicUrl: supabase.storage.from('fleet-photos').getPublicUrl(p.storage_path).data.publicUrl,
    })))

    const hasBeforeFront = photoList.some(p => p.photo_type === 'before_front')
    const hasBeforeAll = ['before_front', 'before_driver', 'before_passenger', 'before_rear'].every(pt => photoList.some(p => p.photo_type === pt))
    const hasAfterAll = ['after_front', 'after_driver', 'after_passenger', 'after_rear'].every(pt => photoList.some(p => p.photo_type === pt))
    const hasVin = photoList.some(p => p.photo_type === 'vin_sticker')
    const hasTire = photoList.some(p => p.photo_type === 'tire_size')
    const removalDone = !['not_started', 'removing'].includes(vehicle.status)

    setChecks(c => ({
      ...c,
      before_photos: hasBeforeAll || hasBeforeFront,
      removal_done: removalDone,
      after_photos: hasAfterAll,
      vin_sticker: hasVin,
      tire_photo: hasTire,
    }))
  }

  useEffect(() => { loadData() }, [vehicle.id])

  async function approve() {
    setSaving(true)
    await supabase.from('fleet_vehicles').update({ status: 'completed', flagged: false, flag_reason: null }).eq('id', vehicle.id)
    onStatusChange('completed')
    setSaving(false)
  }

  async function sendBack() {
    setSaving(true)
    await supabase.from('fleet_vehicles').update({ status: 'ready_for_install' }).eq('id', vehicle.id)
    onStatusChange('ready_for_install')
    setSaving(false)
  }

  async function flagIssue() {
    if (!flagNote.trim()) { alert('Please describe the issue.'); return }
    setSaving(true)
    await supabase.from('fleet_vehicles').update({ status: 'flagged', flagged: true, flag_reason: flagNote.trim() }).eq('id', vehicle.id)
    onStatusChange('flagged')
    setSaving(false)
  }

  const allChecked = Object.values(checks).every(Boolean)
  const autoKeys: (keyof CheckState)[] = ['before_photos', 'removal_done', 'after_photos', 'vin_sticker', 'tire_photo']
  const manualKeys: (keyof CheckState)[] = ['branding_correct', 'no_adhesive']

  const sectionStyle: React.CSSProperties = {
    background: F.surface, border: `1px solid ${F.border}`, borderRadius: 16, padding: 18, marginBottom: 12,
  }

  const canQC = ['install_complete', 'qc', 'completed', 'flagged'].includes(vehicle.status)

  if (!canQC) {
    return (
      <div style={{ ...sectionStyle, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: F.text, marginBottom: 6 }}>Not Ready for QC</div>
        <div style={{ fontSize: 13, color: F.textSec }}>Vehicle must complete installation first.</div>
      </div>
    )
  }

  const beforePhotos = photos.filter(p => p.photo_type.startsWith('before_') && p.photo_type !== 'before_damage')
  const damagePhotos = photos.filter(p => p.photo_type === 'before_damage')
  const afterPhotos = photos.filter(p => p.photo_type.startsWith('after_') || p.photo_type === 'vin_sticker' || p.photo_type === 'tire_size')

  return (
    <div>
      {/* Checklist */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: F.text, marginBottom: 16 }}>
          QC Checklist {allChecked && <span style={{ color: F.green }}>✓ All clear</span>}
        </div>

        <div style={{ marginBottom: 6, fontSize: 11, color: F.textTer, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Auto-verified</div>
        {autoKeys.map(key => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${F.border}` }}>
            <div style={{ width: 20, height: 20, borderRadius: 6, background: checks[key] ? F.green : F.surface3, border: `2px solid ${checks[key] ? F.green : F.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>
              {checks[key] ? '✓' : ''}
            </div>
            <span style={{ fontSize: 14, color: checks[key] ? F.text : F.textSec }}>{CHECK_LABELS[key]}</span>
            {!checks[key] && <span style={{ fontSize: 11, color: F.red, marginLeft: 'auto' }}>Missing</span>}
          </div>
        ))}

        <div style={{ marginTop: 12, marginBottom: 6, fontSize: 11, color: F.textTer, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Manual checks</div>
        {manualKeys.map(key => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${F.border}`, cursor: 'pointer' }}
            onClick={() => setChecks(c => ({ ...c, [key]: !c[key] }))}>
            <div style={{ width: 20, height: 20, borderRadius: 6, background: checks[key] ? F.green : F.surface3, border: `2px solid ${checks[key] ? F.green : F.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>
              {checks[key] ? '✓' : ''}
            </div>
            <span style={{ fontSize: 14, color: F.text }}>{CHECK_LABELS[key]}</span>
          </div>
        ))}
      </div>

      {/* Photo Preview */}
      {(beforePhotos.length > 0 || damagePhotos.length > 0 || afterPhotos.length > 0) && (
        <div style={sectionStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: F.text, marginBottom: 12 }}>Photos</div>
          {beforePhotos.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: F.textTer, marginBottom: 6 }}>BEFORE</div>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                {beforePhotos.map(p => (
                  <img key={p.id} src={p.publicUrl} alt={p.photo_type} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                ))}
              </div>
            </div>
          )}
          {damagePhotos.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: F.red, marginBottom: 6 }}>DAMAGE ({damagePhotos.length})</div>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                {damagePhotos.map(p => (
                  <img key={p.id} src={p.publicUrl} alt="Damage" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: `1px solid ${F.red}55` }} />
                ))}
              </div>
            </div>
          )}
          {afterPhotos.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: F.textTer, marginBottom: 6 }}>AFTER</div>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                {afterPhotos.map(p => (
                  <img key={p.id} src={p.publicUrl} alt={p.photo_type} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Flag input */}
      {showFlag && (
        <div style={sectionStyle}>
          <div style={{ fontSize: 14, fontWeight: 700, color: F.red, marginBottom: 10 }}>Describe the issue</div>
          <textarea value={flagNote} onChange={e => setFlagNote(e.target.value)} rows={3} placeholder="What needs to be fixed?"
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: F.surface2, color: F.text, border: `1px solid ${F.red}44`, fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowFlag(false)} style={{ flex: 1, padding: 14, borderRadius: 12, background: F.surface2, color: F.textSec, border: `1px solid ${F.border}`, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            <button onClick={flagIssue} disabled={saving || !flagNote.trim()}
              style={{ flex: 2, padding: 14, borderRadius: 12, background: F.red, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Flag Issue
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {vehicle.status !== 'completed' && !showFlag && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          <button onClick={approve} disabled={saving || !allChecked}
            style={{ width: '100%', padding: 22, borderRadius: 16, background: saving || !allChecked ? F.surface2 : F.green, color: saving || !allChecked ? F.textTer : '#fff', border: 'none', fontSize: 17, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
            {!allChecked ? 'Complete checklist to approve' : 'Approve — Mark Complete ✓'}
          </button>
          <button onClick={sendBack} disabled={saving}
            style={{ width: '100%', padding: 16, borderRadius: 14, background: F.surface2, color: F.yellow, border: `1px solid ${F.yellow}44`, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Send Back to Install
          </button>
          <button onClick={() => setShowFlag(true)}
            style={{ width: '100%', padding: 16, borderRadius: 14, background: F.surface2, color: F.red, border: `1px solid ${F.red}44`, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Flag Issue
          </button>
        </div>
      )}

      {vehicle.status === 'completed' && (
        <div style={{ textAlign: 'center', padding: 24, background: F.green + '18', border: `1px solid ${F.green}44`, borderRadius: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: F.green }}>QC Approved</div>
        </div>
      )}
    </div>
  )
}
