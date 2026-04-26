import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useFleetAuth } from '../context/FleetAuthContext'
import { F } from '../lib/fleetColors'
import type { BucketType, ExportStatusFilter, ExportProgress } from '../lib/fleetExport'
import { exportDailyCSV, exportFleetCSV, exportPhotosZip, estimateZipContents } from '../lib/fleetExport'

interface Props {
  jobId: string
  jobName: string
  customer?: string
}

const FILTER_OPTIONS: { value: ExportStatusFilter; label: string }[] = [
  { value: 'all', label: 'All Vehicles' },
  { value: 'completed', label: 'Completed Only' },
  { value: 'flagged', label: 'Flagged Only' },
]

const BUCKET_OPTIONS: { value: BucketType; label: string; sub: string }[] = [
  { value: 'public', label: 'Public URLs', sub: 'Never expires · bucket must be public' },
  { value: 'signed', label: 'Signed URLs', sub: 'Expires in 7 days · works with private bucket' },
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function fmtPhotoCount(n: number): string {
  if (n >= 1000) return `~${Math.round(n / 100) / 10}k`
  return String(n)
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: F.surface, border: `1px solid ${F.border}`, borderRadius: 16, padding: 18, marginBottom: 12 }}>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 14, fontWeight: 800, color: F.text, marginBottom: 14 }}>{children}</div>
}

function FilterSelect({ value, onChange }: { value: ExportStatusFilter; onChange: (v: ExportStatusFilter) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as ExportStatusFilter)}
      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: F.surface2, color: F.text, border: `1px solid ${F.border}`, fontSize: 14, outline: 'none', marginBottom: 10 }}
    >
      {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function BucketToggle({ value, onChange }: { value: BucketType; onChange: (v: BucketType) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
      {BUCKET_OPTIONS.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          title={o.sub}
          style={{
            flex: 1, padding: '8px 4px', borderRadius: 10,
            background: value === o.value ? F.accentLight + '22' : F.surface2,
            color: value === o.value ? F.accentLight : F.textSec,
            border: `1px solid ${value === o.value ? F.accentLight : F.border}`,
            fontSize: 12, fontWeight: value === o.value ? 700 : 400, cursor: 'pointer',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ExportButton({
  onClick, disabled, loading, label, icon,
}: { onClick: () => void; disabled: boolean; loading: boolean; label: string; icon: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '14px 0', borderRadius: 12,
        background: disabled ? F.surface2 : F.accent,
        color: disabled ? F.textTer : '#fff',
        border: 'none', fontSize: 15, fontWeight: 700,
        cursor: disabled ? 'wait' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
    >
      <span>{icon}</span>
      {loading ? 'Exporting…' : label}
    </button>
  )
}

function ErrorBanner({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  return (
    <div style={{ color: F.red, fontSize: 13, padding: '10px 14px', background: F.red + '18', borderRadius: 10, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <span>{msg}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: F.red, cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1, flexShrink: 0 }}>✕</button>
    </div>
  )
}

function ProgressBar({ progress }: { progress: ExportProgress | null }) {
  if (!progress || progress.phase === 'done') return null
  if (progress.phase === 'error') return null
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: F.textSec }}>{progress.message}</span>
        {progress.total > 0 && <span style={{ fontSize: 12, color: F.textTer }}>{pct}%</span>}
      </div>
      <div style={{ background: F.surface3, borderRadius: 6, height: 6, overflow: 'hidden' }}>
        <div style={{
          width: progress.total > 0 ? `${pct}%` : '100%',
          height: '100%', background: F.accent, borderRadius: 6,
          transition: 'width 0.2s',
          animation: progress.total === 0 ? 'pulse 1.5s infinite' : 'none',
        }} />
      </div>
    </div>
  )
}

export default function ExportPanel({ jobId, jobName, customer }: Props) {
  const { fleetUser } = useFleetAuth()

  // Daily CSV state
  const [dailyDate, setDailyDate] = useState(today())
  const [dailyBucket, setDailyBucket] = useState<BucketType>('public')
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dailyError, setDailyError] = useState<string | null>(null)

  // Fleet CSV state
  const [fleetFilter, setFleetFilter] = useState<ExportStatusFilter>('all')
  const [fleetBucket, setFleetBucket] = useState<BucketType>('public')
  const [fleetLoading, setFleetLoading] = useState(false)
  const [fleetError, setFleetError] = useState<string | null>(null)

  // ZIP state
  const [zipFilter, setZipFilter] = useState<ExportStatusFilter>('completed')
  const [zipBucket, setZipBucket] = useState<BucketType>('public')
  const [zipLoading, setZipLoading] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const [zipProgress, setZipProgress] = useState<ExportProgress | null>(null)
  const [estimate, setEstimate] = useState<{ vehicleCount: number; photoCount: number } | null>(null)
  const [estimating, setEstimating] = useState(false)

  const isAnyExporting = dailyLoading || fleetLoading || zipLoading

  useEffect(() => {
    if (!zipLoading) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'Export in progress. Leaving will cancel it.'
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [zipLoading])

  const baseMeta = {
    jobId,
    jobName,
    customer,
    exportedBy: fleetUser?.name ?? undefined,
  }

  async function handleDailyCSV() {
    setDailyLoading(true)
    setDailyError(null)
    try {
      await exportDailyCSV(supabase, { ...baseMeta, bucketType: dailyBucket, date: dailyDate })
    } catch (e) {
      setDailyError((e as Error).message)
    } finally {
      setDailyLoading(false)
    }
  }

  async function handleFleetCSV() {
    setFleetLoading(true)
    setFleetError(null)
    try {
      await exportFleetCSV(supabase, { ...baseMeta, bucketType: fleetBucket, statusFilter: fleetFilter })
    } catch (e) {
      setFleetError((e as Error).message)
    } finally {
      setFleetLoading(false)
    }
  }

  async function handleEstimate() {
    setEstimating(true)
    setEstimate(null)
    setZipError(null)
    try {
      const est = await estimateZipContents(supabase, jobId, zipFilter)
      setEstimate(est)
    } catch (e) {
      setZipError((e as Error).message)
    } finally {
      setEstimating(false)
    }
  }

  async function handleZipExport() {
    setZipLoading(true)
    setZipError(null)
    setZipProgress(null)
    try {
      await exportPhotosZip(
        supabase,
        { ...baseMeta, bucketType: zipBucket, statusFilter: zipFilter },
        p => setZipProgress(p),
      )
    } catch (e) {
      const raw = (e as Error).message ?? ''
      const lower = raw.toLowerCase()
      const msg = lower.includes('memory') || lower.includes('out of memory')
        ? 'Export too large for browser. Reduce selection and try again.'
        : lower.includes('timeout') || lower.includes('aborted')
          ? 'Some files failed to download (timeout). Check connection and retry.'
          : lower.includes('cancel')
            ? 'Export cancelled.'
            : raw
      setZipError(msg)
      setZipProgress(null)
    } finally {
      setZipLoading(false)
    }
  }

  const zipDone = zipProgress?.phase === 'done'
  const estimateMB = estimate ? Math.round((estimate.photoCount * 2.2)) : null

  return (
    <div>
      {/* Daily CSV */}
      <SectionCard>
        <SectionTitle>📅 Daily CSV</SectionTitle>
        <div style={{ fontSize: 12, color: F.textSec, marginBottom: 12 }}>
          All vehicles with time logs on a specific date. Includes photo links.
        </div>
        <input
          type="date"
          value={dailyDate}
          onChange={e => setDailyDate(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: F.surface2, color: F.text, border: `1px solid ${F.border}`, fontSize: 14, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
        />
        <BucketToggle value={dailyBucket} onChange={setDailyBucket} />
        {dailyError && <ErrorBanner msg={dailyError} onDismiss={() => setDailyError(null)} />}
        <ExportButton onClick={handleDailyCSV} disabled={isAnyExporting} loading={dailyLoading} label="Export Daily CSV" icon="📊" />
      </SectionCard>

      {/* Fleet CSV */}
      <SectionCard>
        <SectionTitle>📋 Full Fleet CSV</SectionTitle>
        <div style={{ fontSize: 12, color: F.textSec, marginBottom: 12 }}>
          Every vehicle in this job with times, workers, and photo links.
        </div>
        <FilterSelect value={fleetFilter} onChange={v => setFleetFilter(v)} />
        <BucketToggle value={fleetBucket} onChange={setFleetBucket} />
        {fleetError && <ErrorBanner msg={fleetError} onDismiss={() => setFleetError(null)} />}
        <ExportButton onClick={handleFleetCSV} disabled={isAnyExporting} loading={fleetLoading} label="Export Fleet CSV" icon="📊" />
      </SectionCard>

      {/* Photos ZIP */}
      <SectionCard>
        <SectionTitle>🗂 Photos ZIP</SectionTitle>
        <div style={{ fontSize: 12, color: F.textSec, marginBottom: 12 }}>
          All photos organized per vehicle. Includes manifest, missing photo report, and fleet CSV.
        </div>
        <FilterSelect value={zipFilter} onChange={v => { setZipFilter(v); setEstimate(null) }} />
        <BucketToggle value={zipBucket} onChange={setZipBucket} />

        {/* Size estimate */}
        <button
          onClick={handleEstimate}
          disabled={estimating || isAnyExporting}
          style={{ width: '100%', padding: '10px 0', borderRadius: 10, background: F.surface2, color: F.textSec, border: `1px solid ${F.border}`, fontSize: 13, cursor: 'pointer', marginBottom: 10 }}
        >
          {estimating ? 'Estimating…' : estimate ? '↻ Re-estimate Size' : '📏 Estimate Size Before Exporting'}
        </button>

        {estimate && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: F.surface2, border: `1px solid ${estimate.photoCount > 300 ? F.red : F.border}`, marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: F.text, fontWeight: 600 }}>
              {estimate.vehicleCount} vehicles · {fmtPhotoCount(estimate.photoCount)} photos
            </div>
            {estimate.photoCount > 300 ? (
              <div style={{ fontSize: 12, color: F.red, marginTop: 4, fontWeight: 600 }}>
                Too many photos for browser export. Apply a filter.
              </div>
            ) : (
              <div style={{ fontSize: 12, color: F.textSec, marginTop: 2 }}>
                Estimated ZIP size: ~{estimateMB}MB
              </div>
            )}
          </div>
        )}

        {zipError && <ErrorBanner msg={zipError} onDismiss={() => setZipError(null)} />}

        {zipDone && zipProgress && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: F.green + '18', border: `1px solid ${F.green}44`, marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: F.green, fontWeight: 600 }}>✓ {zipProgress.message}</div>
          </div>
        )}

        <ExportButton
          onClick={handleZipExport}
          disabled={isAnyExporting || (estimate !== null && estimate.photoCount > 300)}
          loading={zipLoading}
          label="Export Photos ZIP"
          icon="🗂"
        />

        <ProgressBar progress={zipLoading ? zipProgress : null} />
      </SectionCard>

      {/* Note about individual PDFs */}
      <div style={{ padding: '12px 14px', background: F.surface2, borderRadius: 12, border: `1px solid ${F.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: F.text, marginBottom: 4 }}>Individual Vehicle PDF</div>
        <div style={{ fontSize: 12, color: F.textSec }}>
          Open any vehicle and tap "Print / PDF Report" to generate a client-ready PDF with all photos, times, and notes.
        </div>
      </div>
    </div>
  )
}
