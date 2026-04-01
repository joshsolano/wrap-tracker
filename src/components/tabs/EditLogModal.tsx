import { useState } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { B } from '../../lib/utils'
import type { Log } from '../../lib/types'

interface Props {
  log: Log
  onClose: () => void
  onSave: () => void
}

function toLocalDateStr(ts: string) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toLocalTimeStr(ts: string) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function EditLogModal({ log, onClose, onSave }: Props) {
  const { updateLogTimes } = useAppData()

  const [date, setDate] = useState(toLocalDateStr(log.start_ts))
  const [startT, setStartT] = useState(toLocalTimeStr(log.start_ts))
  const [endT, setEndT] = useState(toLocalTimeStr(log.finish_ts))
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    setErr(null)
    const startTs = new Date(`${date}T${startT}:00`)
    const finishTs = new Date(`${date}T${endT}:00`)
    if (isNaN(startTs.getTime()) || isNaN(finishTs.getTime())) return setErr('Invalid date or time.')
    if (finishTs <= startTs) return setErr('End time must be after start time.')
    setSaving(true)
    const { error } = await updateLogTimes(log.id, startTs, finishTs)
    setSaving(false)
    if (error) { setErr(error); return }
    onSave()
  }

  const instName = log.installer_name ?? log.installer?.name ?? 'Unknown'

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.82)', padding: 20,
      }}
    >
      <div
        style={{
          background: B.surface, borderRadius: 20, padding: 24,
          width: '100%', maxWidth: 380, border: `1px solid ${B.border}`,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Edit Log Times</div>
        <div style={{ fontSize: 12, color: B.textTer, marginBottom: 20 }}>
          {instName} · {log.panel_name} · {log.project_name}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Date', type: 'date', value: date, onChange: setDate },
            { label: 'Start', type: 'time', value: startT, onChange: setStartT },
            { label: 'End', type: 'time', value: endT, onChange: setEndT },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize: 12, color: B.textSec, fontWeight: 600, marginBottom: 6 }}>{f.label}</div>
              <input
                type={f.type}
                value={f.value}
                onChange={e => f.onChange(e.target.value)}
                style={{
                  padding: '10px 8px', fontSize: 13, borderRadius: 10,
                  background: B.surface2, color: B.text, border: 'none',
                  outline: 'none', width: '100%', colorScheme: 'dark',
                }}
              />
            </div>
          ))}
        </div>

        {err && (
          <div style={{ fontSize: 13, color: B.red, marginBottom: 12, padding: '8px 12px', background: B.red + '15', borderRadius: 8 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, background: B.surface2, color: B.text, border: 'none', borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{ flex: 1, background: B.yellow, color: B.bg, border: 'none', borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
