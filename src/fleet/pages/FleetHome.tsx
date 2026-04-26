import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useFleetAuth } from '../context/FleetAuthContext'
import { useFleetNav } from '../FleetApp'
import { F } from '../lib/fleetColors'
import type { FleetJob } from '../lib/fleetTypes'

interface JobWithCounts extends FleetJob {
  total: number
  completed: number
  flagged: number
}

function CreateJobModal({ onClose, onCreate }: { onClose: () => void; onCreate: (j: FleetJob) => void }) {
  const { fleetUser } = useFleetAuth()
  const [form, setForm] = useState({ name: '', customer: '', location: '', start_date: '', target_end_date: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.customer.trim()) return
    setSaving(true)
    const { data, error: err } = await supabase.from('fleet_jobs').insert({
      name: form.name.trim(),
      customer: form.customer.trim(),
      location: form.location.trim() || null,
      start_date: form.start_date || null,
      target_end_date: form.target_end_date || null,
      notes: form.notes.trim() || null,
      created_by: fleetUser?.id ?? null,
    }).select('*').single()
    setSaving(false)
    if (err) { setError(err.message); return }
    onCreate(data as FleetJob)
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    padding: '14px 16px', fontSize: 15, borderRadius: 12, width: '100%',
    background: F.surface2, color: F.text, border: `1px solid ${F.border}`,
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }}>
      <div style={{ background: F.surface, borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxHeight: '92dvh', overflowY: 'auto' }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 20, color: F.text }}>New Fleet Job</div>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 10 }}>
            <input type="text" placeholder="Job name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <input type="text" placeholder="Customer *" value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <input type="text" placeholder="Location" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }} />
            <input type="date" value={form.target_end_date} onChange={e => setForm(f => ({ ...f, target_end_date: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <textarea placeholder="Notes" value={form.notes} rows={3}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          {error && <div style={{ color: F.red, fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: 18, borderRadius: 14, background: F.surface2, color: F.textSec, border: `1px solid ${F.border}`, fontSize: 16, cursor: 'pointer', fontWeight: 600 }}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !form.name || !form.customer}
              style={{ flex: 2, padding: 18, borderRadius: 14, background: saving || !form.name || !form.customer ? F.surface2 : F.accent, color: saving || !form.name || !form.customer ? F.textTer : '#fff', border: 'none', fontSize: 16, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Creating…' : 'Create Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function FleetHome() {
  const { isFleetManager, fleetUser } = useFleetAuth()
  const { go } = useFleetNav()
  const [jobs, setJobs] = useState<JobWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: jobData }, { data: vData }] = await Promise.all([
      supabase.from('fleet_jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('fleet_vehicles').select('id,fleet_job_id,status,flagged'),
    ])
    const vehicles = (vData ?? []) as Array<{ id: string; fleet_job_id: string; status: string; flagged: boolean }>
    const withCounts = ((jobData ?? []) as FleetJob[]).map(j => ({
      ...j,
      total: vehicles.filter(v => v.fleet_job_id === j.id).length,
      completed: vehicles.filter(v => v.fleet_job_id === j.id && v.status === 'completed').length,
      flagged: vehicles.filter(v => v.fleet_job_id === j.id && v.flagged).length,
    }))
    setJobs(withCounts)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const pct = (c: number, t: number) => t === 0 ? 0 : Math.round((c / t) * 100)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: F.text }}>Fleet Jobs</div>
          <div style={{ fontSize: 13, color: F.textSec, marginTop: 2 }}>
            {fleetUser?.name.split(' ')[0]} · {fleetUser?.role}
          </div>
        </div>
        {isFleetManager && (
          <button
            onClick={() => setShowCreate(true)}
            style={{ background: F.accent, color: '#fff', border: 'none', borderRadius: 14, padding: '12px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            + New Job
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ color: F.textSec, textAlign: 'center', padding: 48 }}>Loading…</div>
      ) : jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, color: F.textSec }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>🚛</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: F.text }}>No fleet jobs yet</div>
          {isFleetManager && <div style={{ fontSize: 14, marginTop: 8 }}>Create your first job above</div>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {jobs.map(j => {
            const p = pct(j.completed, j.total)
            const done = j.total > 0 && j.completed === j.total
            return (
              <button
                key={j.id}
                onClick={() => go({ page: 'job', jobId: j.id, jobName: j.name, customer: j.customer })}
                style={{ background: F.surface, border: `1px solid ${done ? F.green + '44' : F.border}`, borderRadius: 18, padding: 20, textAlign: 'left', cursor: 'pointer', width: '100%' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: F.text, marginBottom: 2 }}>{j.name}</div>
                    <div style={{ fontSize: 13, color: F.textSec }}>{j.customer}</div>
                    {j.location && <div style={{ fontSize: 12, color: F.textTer, marginTop: 1 }}>{j.location}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: done ? F.green : F.text, lineHeight: 1 }}>
                      {j.total > 0 ? `${p}%` : '—'}
                    </div>
                    <div style={{ fontSize: 11, color: F.textSec, marginTop: 2 }}>{j.completed}/{j.total} done</div>
                  </div>
                </div>

                {j.total > 0 && (
                  <div style={{ background: F.surface3, borderRadius: 6, height: 6, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ width: `${p}%`, height: '100%', background: done ? F.green : F.accent, borderRadius: 6, transition: 'width 0.3s' }} />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: F.textSec }}>{j.total} vehicles</span>
                  {j.flagged > 0 && (
                    <span style={{ fontSize: 12, color: F.red, fontWeight: 700 }}>⚠ {j.flagged} flagged</span>
                  )}
                  {j.target_end_date && (
                    <span style={{ fontSize: 12, color: F.textTer }}>Target: {j.target_end_date}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {isFleetManager && !loading && (
        <button
          onClick={() => go({ page: 'demo' })}
          style={{ width: '100%', marginTop: 8, background: 'transparent', border: `1px dashed ${F.border}`, borderRadius: 14, padding: '14px 20px', color: F.textTer, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <span style={{ fontSize: 16 }}>📊</span> Export Preview Demo
        </button>
      )}

      {showCreate && (
        <CreateJobModal
          onClose={() => setShowCreate(false)}
          onCreate={j => {
            setJobs(prev => [{ ...j, total: 0, completed: 0, flagged: 0 }, ...prev])
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}
