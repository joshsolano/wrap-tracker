import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useFleetAuth } from '../context/FleetAuthContext'
import { useFleetNav } from '../FleetApp'
import { F } from '../lib/fleetColors'
import type { FleetVehicle, FleetUser } from '../lib/fleetTypes'
import { STATUS_LABEL, STATUS_COLOR, REQUIRED_BEFORE, REQUIRED_AFTER } from '../lib/fleetTypes'
import ImportVehicles from '../components/ImportVehicles'
import DailySummary from '../components/DailySummary'
import { exportJobCSV } from '../lib/vehiclePDF'

interface Props {
  jobId: string
  jobName: string
  customer: string
}

type PageTab = 'vehicles' | 'daily' | 'export'

function StatusChip({ status }: { status: FleetVehicle['status'] }) {
  const color = STATUS_COLOR[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 8, background: color + '22', fontSize: 11, fontWeight: 700, color }}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export default function FleetJobPage({ jobId, jobName, customer }: Props) {
  const { isFleetManager } = useFleetAuth()
  const { go } = useFleetNav()
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [photoCounts, setPhotoCounts] = useState<Map<string, Set<string>>>(new Map())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [pageTab, setPageTab] = useState<PageTab>('vehicles')
  const [statusFilter, setStatusFilter] = useState<FleetVehicle['status'] | 'all'>('all')

  async function loadVehicles() {
    const [{ data: vData }, { data: pData }] = await Promise.all([
      supabase.from('fleet_vehicles').select('*').eq('fleet_job_id', jobId).order('created_at'),
      supabase.from('fleet_vehicle_photos').select('vehicle_id,photo_type').eq('fleet_job_id', jobId),
    ])
    setVehicles((vData ?? []) as FleetVehicle[])

    const pMap = new Map<string, Set<string>>()
    for (const p of (pData ?? []) as Array<{ vehicle_id: string; photo_type: string }>) {
      if (!pMap.has(p.vehicle_id)) pMap.set(p.vehicle_id, new Set())
      pMap.get(p.vehicle_id)!.add(p.photo_type)
    }
    setPhotoCounts(pMap)
    setLoading(false)
  }

  useEffect(() => { loadVehicles() }, [jobId])

  const existingVins = useMemo(() => new Set(vehicles.map(v => v.vin)), [vehicles])

  function hasMissingPhotos(v: FleetVehicle): boolean {
    const pts = photoCounts.get(v.id) ?? new Set()
    if (['removing', 'removal_complete', 'ready_for_install', 'installing', 'install_complete', 'qc', 'completed'].includes(v.status)) {
      if (REQUIRED_BEFORE.some(pt => !pts.has(pt))) return true
    }
    if (['install_complete', 'qc', 'completed'].includes(v.status)) {
      if (REQUIRED_AFTER.some(pt => !pts.has(pt))) return true
    }
    return false
  }

  const filtered = useMemo(() => {
    let list = vehicles
    if (statusFilter !== 'all') list = list.filter(v => v.status === statusFilter)
    if (!search.trim()) return list
    const q = search.trim().toLowerCase()
    return list.filter(v =>
      v.vin.toLowerCase().includes(q) ||
      v.vin.slice(-6).toLowerCase() === q ||
      (v.unit_number?.toLowerCase().includes(q)) ||
      (v.make?.toLowerCase().includes(q)) ||
      (v.model?.toLowerCase().includes(q))
    )
  }, [vehicles, search, statusFilter])

  // Status breakdown counts
  const statusCounts = useMemo(() => {
    const counts: Partial<Record<FleetVehicle['status'], number>> = {}
    for (const v of vehicles) counts[v.status] = (counts[v.status] ?? 0) + 1
    return counts
  }, [vehicles])

  const completed = vehicles.filter(v => v.status === 'completed').length
  const total = vehicles.length
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)
  const missing = vehicles.filter(v => hasMissingPhotos(v)).length
  const flagged = vehicles.filter(v => v.flagged).length

  async function exportCSV() {
    const [{ data: logs }, { data: photos }, { data: users }] = await Promise.all([
      supabase.from('fleet_vehicle_time_logs').select('*').in('vehicle_id', vehicles.map(v => v.id)),
      supabase.from('fleet_vehicle_photos').select('vehicle_id,photo_type').eq('fleet_job_id', jobId),
      supabase.from('fleet_users').select('*'),
    ])
    const userMap = new Map<string, FleetUser>()
    for (const u of (users ?? []) as FleetUser[]) userMap.set(u.id, u)
    exportJobCSV(vehicles, logs as any ?? [], photos as any ?? [], userMap, jobName)
  }

  const pageTabs: { key: PageTab; label: string }[] = [
    { key: 'vehicles', label: `Vehicles (${total})` },
    { key: 'daily', label: 'Daily' },
    { key: 'export', label: 'Export' },
  ]

  return (
    <div>
      {/* Job header */}
      <div style={{ background: F.surface, border: `1px solid ${F.border}`, borderRadius: 18, padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: F.text }}>{jobName}</div>
            <div style={{ fontSize: 13, color: F.textSec }}>{customer}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: completed === total && total > 0 ? F.green : F.text, lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontSize: 11, color: F.textSec }}>{completed}/{total}</div>
          </div>
        </div>

        {total > 0 && (
          <div style={{ background: F.surface3, borderRadius: 6, height: 6, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: completed === total ? F.green : F.accent, borderRadius: 6, transition: 'width 0.3s' }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {flagged > 0 && <span style={{ fontSize: 12, color: F.red, fontWeight: 700 }}>⚠ {flagged} flagged</span>}
          {missing > 0 && <span style={{ fontSize: 12, color: F.yellow, fontWeight: 600 }}>📷 {missing} missing photos</span>}
          <span style={{ fontSize: 12, color: F.textSec }}>{total} vehicles</span>
        </div>
      </div>

      {/* Status breakdown pills */}
      {total > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
          <button onClick={() => setStatusFilter('all')}
            style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 20, border: `1px solid ${statusFilter === 'all' ? F.accentLight : F.border}`, background: statusFilter === 'all' ? F.accentLight + '22' : F.surface, color: statusFilter === 'all' ? F.accentLight : F.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            All {total}
          </button>
          {(Object.entries(statusCounts) as [FleetVehicle['status'], number][]).map(([s, count]) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 20, border: `1px solid ${statusFilter === s ? STATUS_COLOR[s] : F.border}`, background: statusFilter === s ? STATUS_COLOR[s] + '22' : F.surface, color: statusFilter === s ? STATUS_COLOR[s] : F.textSec, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {STATUS_LABEL[s]} {count}
            </button>
          ))}
        </div>
      )}

      {/* Page tabs */}
      <div style={{ display: 'flex', gap: 4, background: F.surface, borderRadius: 12, padding: 3, marginBottom: 14 }}>
        {pageTabs.map(t => (
          <button key={t.key} onClick={() => setPageTab(t.key)}
            style={{ flex: 1, padding: '9px 4px', border: 'none', borderRadius: 9, background: pageTab === t.key ? F.accent : 'transparent', color: pageTab === t.key ? '#fff' : F.textSec, fontWeight: pageTab === t.key ? 700 : 400, fontSize: 13, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Vehicles tab */}
      {pageTab === 'vehicles' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              type="search"
              placeholder="Search VIN, last 6, unit #, make/model…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, padding: '12px 16px', borderRadius: 12, background: F.surface2, color: F.text, border: `1px solid ${F.border}`, fontSize: 14, outline: 'none' }}
            />
            {isFleetManager && (
              <button onClick={() => setShowImport(true)}
                style={{ flexShrink: 0, padding: '12px 16px', borderRadius: 12, background: F.surface2, color: F.accentLight, border: `1px solid ${F.border}`, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Import
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ color: F.textSec, textAlign: 'center', padding: 40 }}>Loading…</div>
          ) : vehicles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 56, color: F.textSec }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🚘</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: F.text, marginBottom: 8 }}>No vehicles yet</div>
              {isFleetManager && (
                <button onClick={() => setShowImport(true)}
                  style={{ background: F.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '14px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                  Import CSV
                </button>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: F.textSec }}>No vehicles match your search.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(v => {
                const missing = hasMissingPhotos(v)
                return (
                  <button key={v.id}
                    onClick={() => go({ page: 'vehicle', vehicleId: v.id, jobId, jobName })}
                    style={{ background: F.surface, border: `1px solid ${v.flagged ? F.red + '44' : F.border}`, borderRadius: 14, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: F.text, fontFamily: 'monospace' }}>
                            {v.vin.slice(-8)}
                          </span>
                          {v.unit_number && <span style={{ fontSize: 12, color: F.textSec }}>#{v.unit_number}</span>}
                          {v.flagged && <span style={{ fontSize: 11, color: F.red, fontWeight: 700 }}>⚠ Flagged</span>}
                        </div>
                        <div style={{ fontSize: 12, color: F.textSec }}>
                          {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown vehicle'}
                          {v.department && ` · ${v.department}`}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <StatusChip status={v.status} />
                        {missing && <span style={{ fontSize: 10, color: F.yellow }}>📷 photos</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Daily tab */}
      {pageTab === 'daily' && <DailySummary jobId={jobId} jobName={jobName} customer={customer} />}

      {/* Export tab */}
      {pageTab === 'export' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: F.text, marginBottom: 4 }}>Export</div>

          <button onClick={exportCSV}
            style={{ width: '100%', padding: 20, borderRadius: 14, background: F.surface, border: `1px solid ${F.border}`, color: F.text, fontSize: 15, fontWeight: 700, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>📊</span>
            <div>
              <div style={{ fontWeight: 700 }}>CSV Export — All Vehicles</div>
              <div style={{ fontSize: 12, color: F.textSec, marginTop: 2 }}>Times, workers, photo status, notes</div>
            </div>
          </button>

          <div style={{ padding: 16, background: F.surface2, borderRadius: 12, border: `1px solid ${F.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: F.text, marginBottom: 6 }}>Individual Vehicle PDFs</div>
            <div style={{ fontSize: 12, color: F.textSec }}>Open any vehicle and tap "Print / PDF Report" to generate a client-ready PDF with all photos, times, and notes.</div>
          </div>

          <div style={{ padding: 16, background: F.surface2, borderRadius: 12, border: `1px solid ${F.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: F.text, marginBottom: 6 }}>Job Summary</div>
            <div style={{ fontSize: 12, color: F.textSec, marginBottom: 10 }}>
              {total} vehicles · {completed} completed · {flagged} flagged
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(Object.entries(statusCounts) as [FleetVehicle['status'], number][]).map(([s, count]) => (
                <div key={s} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: STATUS_COLOR[s] + '22', color: STATUS_COLOR[s], fontWeight: 600 }}>
                  {STATUS_LABEL[s]}: {count}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportVehicles
          jobId={jobId}
          existingVins={existingVins}
          onClose={() => setShowImport(false)}
          onImport={newVehicles => {
            setVehicles(prev => [...prev, ...newVehicles])
            setShowImport(false)
          }}
        />
      )}
    </div>
  )
}
