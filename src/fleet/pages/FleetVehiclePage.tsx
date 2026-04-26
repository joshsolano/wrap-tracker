import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useFleetAuth } from '../context/FleetAuthContext'
import { F } from '../lib/fleetColors'
import type { FleetVehicle, FleetVehiclePhoto, FleetTimeLog, FleetUser, PhotoType } from '../lib/fleetTypes'
import { STATUS_LABEL, STATUS_COLOR, PHOTO_LABEL } from '../lib/fleetTypes'
import RemovalWorkflow from '../components/RemovalWorkflow'
import InstallWorkflow from '../components/InstallWorkflow'
import QCWorkflow from '../components/QCWorkflow'
import { printVehiclePDF } from '../lib/vehiclePDF'

interface Props {
  vehicleId: string
  jobId: string
  jobName: string
}

type WorkflowTab = 'removal' | 'install' | 'qc' | 'photos'

const BEFORE_TYPES: PhotoType[] = ['before_front', 'before_driver', 'before_passenger', 'before_rear']
const AFTER_TYPES: PhotoType[] = ['after_front', 'after_driver', 'after_passenger', 'after_rear', 'vin_sticker', 'tire_size']

function PhotosTab({ photos }: { photos: FleetVehiclePhoto[] }) {
  const photoFor = (type: PhotoType) => photos.find(p => p.photo_type === type)
  const damagePhotos = photos.filter(p => p.photo_type === 'before_damage')

  const Section = ({ types, label }: { types: PhotoType[]; label: string }) => {
    const present = types.filter(t => photoFor(t)).length
    return (
      <div style={{ background: F.surface, border: `1px solid ${F.border}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: F.text }}>{label}</div>
          <div style={{ fontSize: 11, color: present === types.length ? F.green : F.textTer, fontWeight: 600 }}>
            {present === types.length ? '✓ All uploaded' : `${present}/${types.length}`}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {types.map(type => {
            const photo = photoFor(type)
            return (
              <div key={type}>
                {photo?.publicUrl ? (
                  <a href={photo.publicUrl} target="_blank" rel="noreferrer" style={{ display: 'block', position: 'relative', textDecoration: 'none' }}>
                    <img
                      src={photo.publicUrl}
                      alt={PHOTO_LABEL[type]}
                      style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, border: `1px solid ${F.green}55`, display: 'block' }}
                    />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '14px 4px 4px', background: 'linear-gradient(transparent, rgba(0,0,0,0.65))', borderRadius: '0 0 10px 10px' }}>
                      <div style={{ fontSize: 9, color: '#fff', textAlign: 'center', fontWeight: 600 }}>{PHOTO_LABEL[type]}</div>
                    </div>
                  </a>
                ) : (
                  <div style={{ width: '100%', aspectRatio: '1', borderRadius: 10, border: `1px dashed ${F.border}`, background: F.surface2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span style={{ fontSize: 18, opacity: 0.2 }}>📷</span>
                    <span style={{ fontSize: 9, color: F.textTer, textAlign: 'center', padding: '0 4px', lineHeight: 1.3 }}>{PHOTO_LABEL[type]}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: F.textSec }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>📷</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: F.text, marginBottom: 6 }}>No photos yet</div>
        <div style={{ fontSize: 13 }}>Photos are uploaded during the removal and install steps.</div>
      </div>
    )
  }

  return (
    <div>
      <Section types={BEFORE_TYPES} label="Before (Removal)" />
      {damagePhotos.length > 0 && (
        <div style={{ background: F.surface, border: `1px solid ${F.border}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: F.text }}>Damage Photos</div>
            <div style={{ fontSize: 11, color: F.red, fontWeight: 600 }}>{damagePhotos.length} photo{damagePhotos.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {damagePhotos.map(photo => (
              <a key={photo.id} href={photo.publicUrl} target="_blank" rel="noreferrer" style={{ display: 'block', position: 'relative', textDecoration: 'none' }}>
                <img
                  src={photo.publicUrl}
                  alt="Damage"
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, border: `1px solid ${F.red}44`, display: 'block' }}
                />
              </a>
            ))}
          </div>
        </div>
      )}
      <Section types={AFTER_TYPES} label="After + Documentation (Install)" />
    </div>
  )
}

export default function FleetVehiclePage({ vehicleId, jobId, jobName }: Props) {
  const { fleetUser, canRemove, canInstall, canQC, isFleetManager } = useFleetAuth()
  const [vehicle, setVehicle] = useState<FleetVehicle | null>(null)
  const [photos, setPhotos] = useState<FleetVehiclePhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [tab, setTab] = useState<WorkflowTab>('photos')

  async function loadVehicle() {
    const [{ data: vData }, { data: photoData }] = await Promise.all([
      supabase.from('fleet_vehicles').select('*').eq('id', vehicleId).single(),
      supabase.from('fleet_vehicle_photos').select('*').eq('vehicle_id', vehicleId),
    ])
    setVehicle(vData as FleetVehicle)
    const photoList = (photoData ?? []) as FleetVehiclePhoto[]
    setPhotos(photoList.map(p => ({
      ...p,
      publicUrl: supabase.storage.from('fleet-photos').getPublicUrl(p.storage_path).data.publicUrl,
    })))
    setLoading(false)
  }

  useEffect(() => { loadVehicle() }, [vehicleId])

  useEffect(() => {
    if (!vehicle) return
    const role = fleetUser?.role
    if (role === 'remover') setTab('removal')
    else if (role === 'installer') setTab('install')
    else if (role === 'qc') setTab('qc')
    else setTab('photos')
  }, [vehicle?.id, fleetUser?.role])

  async function printPDF() {
    if (!vehicle) return
    setPdfLoading(true)
    const [{ data: logData }, { data: userData }] = await Promise.all([
      supabase.from('fleet_vehicle_time_logs').select('*').eq('vehicle_id', vehicleId),
      supabase.from('fleet_users').select('*'),
    ])
    const userMap = new Map<string, FleetUser>()
    for (const u of (userData ?? []) as FleetUser[]) userMap.set(u.id, u)
    await printVehiclePDF({
      jobName,
      customer: '',
      vehicle,
      photos,
      timelogs: (logData ?? []) as FleetTimeLog[],
      fleetUsers: userMap,
    })
    setPdfLoading(false)
  }

  if (loading) return <div style={{ color: F.textSec, padding: 32, textAlign: 'center' }}>Loading…</div>
  if (!vehicle) return <div style={{ color: F.red, padding: 32, textAlign: 'center' }}>Vehicle not found.</div>

  const status = vehicle.status

  const visibleTabs: { key: WorkflowTab; label: string }[] = [
    ...(canRemove ? [{ key: 'removal' as WorkflowTab, label: 'Removal' }] : []),
    ...(canInstall ? [{ key: 'install' as WorkflowTab, label: 'Install' }] : []),
    ...(canQC || isFleetManager ? [{ key: 'qc' as WorkflowTab, label: 'QC' }] : []),
    { key: 'photos', label: photos.length > 0 ? `Photos (${photos.length})` : 'Photos' },
  ]

  return (
    <div>
      {/* Vehicle Header */}
      <div style={{ background: F.surface, border: `1px solid ${F.border}`, borderRadius: 18, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: F.textTer, marginBottom: 2 }}>VIN</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: F.text, fontFamily: 'monospace', letterSpacing: '0.04em' }}>
              {vehicle.vin}
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: STATUS_COLOR[status] + '22', border: `1px solid ${STATUS_COLOR[status]}44` }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[status] }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[status] }}>{STATUS_LABEL[status]}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          {vehicle.unit_number && (
            <div>
              <div style={{ fontSize: 10, color: F.textTer, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Unit #</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: F.text }}>{vehicle.unit_number}</div>
            </div>
          )}
          {(vehicle.year || vehicle.make || vehicle.model) && (
            <div>
              <div style={{ fontSize: 10, color: F.textTer, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vehicle</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: F.text }}>
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
              </div>
            </div>
          )}
          {vehicle.vehicle_type && (
            <div>
              <div style={{ fontSize: 10, color: F.textTer, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: F.text }}>{vehicle.vehicle_type}</div>
            </div>
          )}
          {vehicle.department && (
            <div>
              <div style={{ fontSize: 10, color: F.textTer, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dept</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: F.text }}>{vehicle.department}</div>
            </div>
          )}
        </div>

        {vehicle.flagged && vehicle.flag_reason && (
          <div style={{ background: F.red + '18', border: `1px solid ${F.red}44`, borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
            <span style={{ color: F.red, fontSize: 13, fontWeight: 700 }}>⚠ Flagged: </span>
            <span style={{ color: F.red, fontSize: 13 }}>{vehicle.flag_reason}</span>
          </div>
        )}

        {vehicle.notes && (
          <div style={{ fontSize: 13, color: F.textSec, background: F.surface2, borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
            {vehicle.notes}
          </div>
        )}

        <button
          onClick={printPDF}
          disabled={pdfLoading}
          style={{ width: '100%', padding: '10px 0', borderRadius: 10, background: F.surface2, color: pdfLoading ? F.textTer : F.accentLight, border: `1px solid ${F.border}`, fontSize: 13, fontWeight: 600, cursor: pdfLoading ? 'wait' : 'pointer' }}
        >
          {pdfLoading ? '⏳ Preparing PDF…' : '📄 Print / PDF Report'}
        </button>
      </div>

      {/* Tabs */}
      {visibleTabs.length > 1 && (
        <div style={{ display: 'flex', gap: 4, background: F.surface, borderRadius: 14, padding: 4, marginBottom: 14 }}>
          {visibleTabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ flex: 1, padding: '10px 4px', border: 'none', borderRadius: 10, background: tab === t.key ? F.accent : 'transparent', color: tab === t.key ? '#fff' : F.textSec, fontWeight: tab === t.key ? 700 : 400, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'removal' && canRemove && (
        <RemovalWorkflow vehicle={vehicle} jobId={jobId} onStatusChange={s => setVehicle(v => v ? { ...v, status: s } : v)} />
      )}
      {tab === 'install' && canInstall && (
        <InstallWorkflow vehicle={vehicle} jobId={jobId} onStatusChange={s => setVehicle(v => v ? { ...v, status: s } : v)} />
      )}
      {tab === 'qc' && (canQC || isFleetManager) && (
        <QCWorkflow vehicle={vehicle} onStatusChange={s => setVehicle(v => v ? { ...v, status: s } : v)} />
      )}
      {tab === 'photos' && (
        <PhotosTab photos={photos} />
      )}
    </div>
  )
}
