import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { F } from '../lib/fleetColors'
import type { FleetVehicle } from '../lib/fleetTypes'

type ColKey = 'vin' | 'unit_number' | 'year' | 'make' | 'model' | 'vehicle_type' | 'department' | 'location' | 'notes'

const COL_LABELS: Record<ColKey, string> = {
  vin: 'VIN *', unit_number: 'Unit #', year: 'Year', make: 'Make',
  model: 'Model', vehicle_type: 'Type', department: 'Department', location: 'Location', notes: 'Notes',
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function autoDetectColumn(header: string): ColKey | '' {
  const h = normalizeHeader(header)
  if (['vin', 'vehiclevin', 'vinnumber', 'vinno'].includes(h)) return 'vin'
  if (['unit', 'unitnumber', 'unitno', 'unitnum', 'fleet', 'fleetnumber', 'unit#'].includes(h)) return 'unit_number'
  if (['year', 'yr', 'modelyear', 'vehyear'].includes(h)) return 'year'
  if (['make', 'manufacturer', 'brand', 'vehmake'].includes(h)) return 'make'
  if (['model', 'vehiclemodel', 'vehmodel'].includes(h)) return 'model'
  if (['type', 'vehicletype', 'class', 'bodytype', 'vehtype', 'vehclass'].includes(h)) return 'vehicle_type'
  if (['department', 'dept', 'division', 'div'].includes(h)) return 'department'
  if (['location', 'loc', 'site', 'yard'].includes(h)) return 'location'
  if (['notes', 'comments', 'description', 'desc', 'note'].includes(h)) return 'notes'
  return ''
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"' && !inQuotes) { inQuotes = true; continue }
      if (ch === '"' && inQuotes) { inQuotes = false; continue }
      if ((ch === ',' || ch === '\t') && !inQuotes) { cells.push(current.trim()); current = ''; continue }
      current += ch
    }
    cells.push(current.trim())
    rows.push(cells)
  }
  return rows
}

interface ImportRow {
  vin: string
  unit_number: string
  year: string
  make: string
  model: string
  vehicle_type: string
  department: string
  location: string
  notes: string
  _error?: string
}

interface Props {
  jobId: string
  existingVins: Set<string>
  onClose: () => void
  onImport: (vehicles: FleetVehicle[]) => void
}

export default function ImportVehicles({ jobId, existingVins, onClose, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<number, ColKey | ''>>({})
  const [rows, setRows] = useState<string[][]>([])
  const [preview, setPreview] = useState<ImportRow[]>([])
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const parsed = parseCSV(text)
      if (parsed.length < 2) { setError('File appears empty or has only headers.'); return }
      const hdrs = parsed[0]
      const dataRows = parsed.slice(1)
      const autoMap: Record<number, ColKey | ''> = {}
      hdrs.forEach((h, i) => { autoMap[i] = autoDetectColumn(h) })
      setHeaders(hdrs)
      setMapping(autoMap)
      setRows(dataRows)
      setStep('map')
      setError(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function buildPreview() {
    const vinCol = Object.entries(mapping).find(([, v]) => v === 'vin')?.[0]
    if (vinCol === undefined) { setError('You must map the VIN column.'); return }
    const seenVins = new Set<string>()
    const built = rows.map(row => {
      const get = (key: ColKey) => {
        const idx = Object.entries(mapping).find(([, v]) => v === key)?.[0]
        return idx !== undefined ? (row[parseInt(idx)] ?? '') : ''
      }
      const vin = get('vin').toUpperCase().trim()
      let _error = ''
      if (!vin) _error = 'Missing VIN'
      else if (existingVins.has(vin)) _error = 'VIN already in job'
      else if (seenVins.has(vin)) _error = 'Duplicate VIN in file'
      if (vin) seenVins.add(vin)
      return {
        vin, unit_number: get('unit_number'), year: get('year'), make: get('make'),
        model: get('model'), vehicle_type: get('vehicle_type'), department: get('department'),
        location: get('location'), notes: get('notes'), _error,
      }
    })
    setPreview(built)
    setStep('preview')
    setError(null)
  }

  async function doImport() {
    const valid = preview.filter(r => !r._error && r.vin)
    if (valid.length === 0) { setError('No valid rows to import.'); return }
    setImporting(true)
    const inserts = valid.map(r => ({
      fleet_job_id: jobId,
      vin: r.vin,
      unit_number: r.unit_number || null,
      year: r.year || null,
      make: r.make || null,
      model: r.model || null,
      vehicle_type: r.vehicle_type || null,
      department: r.department || null,
      location: r.location || null,
      notes: r.notes || null,
      status: 'not_started',
    }))
    const { data, error: err } = await supabase.from('fleet_vehicles').insert(inserts).select('*')
    setImporting(false)
    if (err) { setError(err.message); return }
    onImport(data as FleetVehicle[])
    setStep('done')
  }

  const valid = preview.filter(r => !r._error).length
  const invalid = preview.filter(r => r._error).length

  const sheetStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'flex-end', zIndex: 200,
  }
  const panelStyle: React.CSSProperties = {
    background: F.surface, borderRadius: '20px 20px 0 0', padding: 24,
    width: '100%', maxHeight: '92dvh', overflowY: 'auto',
  }

  if (step === 'done') {
    return (
      <div style={sheetStyle}>
        <div style={{ ...panelStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: F.text, marginBottom: 8 }}>Import Complete</div>
          <div style={{ fontSize: 15, color: F.textSec, marginBottom: 28 }}>{valid} vehicles added to this job.</div>
          <button onClick={onClose} style={{ background: F.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '16px 40px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <div style={sheetStyle}>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: F.text }}>
            {step === 'upload' ? 'Import Vehicles' : step === 'map' ? 'Map Columns' : 'Review Import'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: F.textSec, fontSize: 22, cursor: 'pointer', padding: '0 4px' }}>✕</button>
        </div>

        {error && <div style={{ color: F.red, fontSize: 13, marginBottom: 14, padding: '10px 14px', background: F.red + '18', borderRadius: 10 }}>{error}</div>}

        {step === 'upload' && (
          <div>
            <div style={{ textAlign: 'center', padding: '32px 16px', border: `2px dashed ${F.border}`, borderRadius: 16, marginBottom: 20, cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📄</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: F.text, marginBottom: 4 }}>Upload CSV file</div>
              <div style={{ fontSize: 13, color: F.textSec }}>CSV or TSV · VIN column required</div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFile} style={{ display: 'none' }} />
            <button onClick={onClose} style={{ width: '100%', padding: 16, borderRadius: 12, background: F.surface2, color: F.textSec, border: `1px solid ${F.border}`, fontSize: 15, cursor: 'pointer' }}>Cancel</button>
          </div>
        )}

        {step === 'map' && (
          <div>
            <div style={{ fontSize: 13, color: F.textSec, marginBottom: 16 }}>
              Match your CSV columns to vehicle fields. VIN is required.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {headers.map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 120, fontSize: 13, color: F.textSec, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h}</div>
                  <div style={{ fontSize: 13, color: F.textTer, flexShrink: 0 }}>→</div>
                  <select
                    value={mapping[i] ?? ''}
                    onChange={e => setMapping(m => ({ ...m, [i]: e.target.value as ColKey | '' }))}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: F.surface2, color: F.text, border: `1px solid ${F.border}`, fontSize: 14, outline: 'none' }}
                  >
                    <option value="">— skip —</option>
                    {(Object.entries(COL_LABELS) as [ColKey, string][]).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('upload')} style={{ flex: 1, padding: 16, borderRadius: 12, background: F.surface2, color: F.textSec, border: `1px solid ${F.border}`, fontSize: 15, cursor: 'pointer' }}>Back</button>
              <button onClick={buildPreview} style={{ flex: 2, padding: 16, borderRadius: 12, background: F.accent, color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                Preview ({rows.length} rows)
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ background: F.green + '22', border: `1px solid ${F.green}44`, borderRadius: 10, padding: '8px 14px' }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: F.green }}>{valid}</span>
                <span style={{ fontSize: 12, color: F.green, marginLeft: 6 }}>valid</span>
              </div>
              {invalid > 0 && (
                <div style={{ background: F.red + '22', border: `1px solid ${F.red}44`, borderRadius: 10, padding: '8px 14px' }}>
                  <span style={{ fontSize: 20, fontWeight: 900, color: F.red }}>{invalid}</span>
                  <span style={{ fontSize: 12, color: F.red, marginLeft: 6 }}>skipped</span>
                </div>
              )}
            </div>

            <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
              {preview.slice(0, 50).map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 10px', borderRadius: 8, marginBottom: 4, background: r._error ? F.red + '10' : F.surface2, alignItems: 'center' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: r._error ? F.red : F.text, flex: 1 }}>
                    {r.vin || '—'} {r.unit_number && `· ${r.unit_number}`} {r.year} {r.make} {r.model}
                  </div>
                  {r._error && <div style={{ fontSize: 11, color: F.red, flexShrink: 0 }}>{r._error}</div>}
                </div>
              ))}
              {preview.length > 50 && <div style={{ fontSize: 12, color: F.textTer, textAlign: 'center', padding: 8 }}>… and {preview.length - 50} more</div>}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('map')} style={{ flex: 1, padding: 16, borderRadius: 12, background: F.surface2, color: F.textSec, border: `1px solid ${F.border}`, fontSize: 15, cursor: 'pointer' }}>Back</button>
              <button onClick={doImport} disabled={importing || valid === 0}
                style={{ flex: 2, padding: 16, borderRadius: 12, background: importing || valid === 0 ? F.surface2 : F.accent, color: importing || valid === 0 ? F.textTer : '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: importing ? 'wait' : 'pointer' }}>
                {importing ? 'Importing…' : `Import ${valid} Vehicles`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
