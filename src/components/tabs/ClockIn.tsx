import { useState, useEffect } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { useAuth } from '../../context/AuthContext'
import { Redacted } from '../ui/Redacted'
import { WarnModal } from '../ui/WarnModal'
import { Toast } from '../ui/Toast'
import { GroupHeader } from '../ui/GroupHeader'
import { B, CC, TYPE_OPTS, calcSqft, fmtClock, fmtTime } from '../../lib/utils'
import type { WarnConfig, JobType } from '../../lib/types'
import ManualEntryModal from './ManualEntryModal'

export default function ClockIn() {
  const { installer: me, isGuest } = useAuth()
  const { installers, projects, activeJobs, logs, clockIn, clockOut, discardSession } = useAppData()

  const [selectedInstallerId, setSelectedInstallerId] = useState<string | null>(me?.id ?? null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null)
  const [jobType, setJobType] = useState<JobType>('Wrap')
  const [projectSearch, setProjectSearch] = useState('')
  const [warn, setWarn] = useState<WarnConfig | null>(null)
  const [toast, setToast] = useState('')
  const [, setTick] = useState(0)
  const [celebProject, setCelebProject] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 500)
    return () => clearInterval(t)
  }, [])

  const activeJob = selectedInstallerId
    ? activeJobs.find(j => j.installer_id === selectedInstallerId) ?? null
    : null

  useEffect(() => {
    if (activeJob) {
      setSelectedProjectId(null)
      setSelectedPanelId(null)
    }
  }, [activeJob?.id])

  const elapsed = activeJob
    ? Math.max(0, Math.floor((Date.now() - new Date(activeJob.start_ts).getTime()) / 1000))
    : 0
  const elH = String(Math.floor(elapsed / 3600)).padStart(2, '0')
  const elM = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')
  const elS = String(elapsed % 60).padStart(2, '0')

  const selectedProject = selectedProjectId
    ? projects.find(p => p.id === selectedProjectId)
    : null
  const isCC = selectedProject?.project_type === 'colorchange'
  const accent = isCC ? CC : B.yellow

  const commercial = projects.filter(p =>
    !p.archived &&
    p.project_type === 'commercial' &&
    (!projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()))
  )
  const colorchange = projects.filter(p =>
    !p.archived &&
    p.project_type === 'colorchange' &&
    (!projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()))
  )

  const selectedPanelObj = selectedProject?.panels?.find(p => p.id === selectedPanelId)

  const todayStr = new Date().toDateString()
  const todayDone = logs.filter(r =>
    r.installer_id === selectedInstallerId &&
    r.finish_ts &&
    new Date(r.finish_ts).toDateString() === todayStr
  )

  async function handleClockIn() {
    if (!selectedInstallerId || !selectedProjectId || !selectedPanelId || busy) return
    setBusy(true)
    try {
      const { error } = await clockIn({
        installerId: selectedInstallerId,
        projectId: selectedProjectId,
        panelId: selectedPanelId,
        jobType,
        isColorChange: isCC,
      })
      if (error === 'panel_taken') {
        setWarn({ title: 'Panel already in use', body: 'Another installer is already working on this panel.', ok: 'OK' })
        return
      }
      if (error === 'already_active') {
        setWarn({ title: 'Already clocked in', body: 'You are already clocked in on another panel. Clock out first.', ok: 'OK' })
        return
      }
      if (error) {
        setWarn({ title: 'Cannot clock in', body: error, ok: 'OK' })
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleClockOut() {
    if (!selectedInstallerId || busy) return
    const projectName = activeJob?.project?.name ?? null
    setBusy(true)
    try {
      const { celebrated, error } = await clockOut(selectedInstallerId)
      if (error) {
        setWarn({ title: 'Clock out failed', body: error, ok: 'OK' })
        return
      }
      setToast('Clocked out — entry saved')
      if (celebrated) setCelebProject(projectName)
    } finally {
      setBusy(false)
    }
  }

  function handleDiscard() {
    if (!selectedInstallerId) return
    setWarn({
      title: 'Discard session?',
      body: 'This will remove the current clock-in without saving any time.',
      ok: 'Discard',
      cancel: 'Keep going',
      danger: true,
      onOk: async () => {
        const { error } = await discardSession(selectedInstallerId)
        if (error) setToast('Error: ' + error)
        else setToast('Session discarded')
      },
    })
  }

  return (
    <div>
      <WarnModal modal={warn} onClose={() => setWarn(null)} />
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      {showManual && (
        <ManualEntryModal
          onClose={() => setShowManual(false)}
          onSave={() => {
            setShowManual(false)
            setToast('Manual entry saved')
          }}
        />
      )}

      {celebProject && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.92)' }}>
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: 24, background: B.surface, borderRadius: 24, maxWidth: 400, border: `2px solid ${B.yellow}66` }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: B.yellow, marginBottom: 8 }}>You fucking did it!</div>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 20 }}>{celebProject}</div>
            <button onClick={() => setCelebProject(null)} style={{ background: B.yellow, color: B.bg, border: 'none', borderRadius: 14, padding: '14px 32px', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
              Let's go! ✨
            </button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Who's wrapping?</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${installers.length},1fr)`, gap: 8 }}>
          {installers.map(i => {
            const isActive = !!activeJobs.find(j => j.installer_id === i.id)
            const sel = selectedInstallerId === i.id
            return (
              <button
                key={i.id}
                onClick={() => {
                  setSelectedInstallerId(i.id)
                  setSelectedProjectId(null)
                  setSelectedPanelId(null)
                  setProjectSearch('')
                }}
                style={{ padding: '12px 8px', borderRadius: 12, border: `1.5px solid ${sel ? i.color : isActive ? B.orange : B.border}`, background: sel ? i.color + '18' : isActive ? B.orange + '0D' : 'transparent', color: sel ? i.color : isActive ? B.orange : B.textSec, fontWeight: sel ? 700 : 400, fontSize: 15, cursor: 'pointer', position: 'relative' }}
              >
                {isGuest ? <Redacted>{i.name.split(' ')[0]}</Redacted> : i.name.split(' ')[0]}
                {isActive && (
                  <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: B.orange, border: `1.5px solid ${B.bg}` }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {activeJob ? (
        <div>
          <div style={{ background: B.surface, borderRadius: 20, padding: 24, border: `1.5px solid ${activeJob.is_color_change ? CC + '66' : B.yellow + '44'}`, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: B.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>In progress</div>
                  {activeJob.is_color_change && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: CC, background: CC + '22', padding: '2px 8px', borderRadius: 10 }}>COLOR CHANGE</span>
                  )}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{activeJob.panel?.name ?? '—'}</div>
                <div style={{ fontSize: 14, color: B.textSec, marginTop: 3 }}>{isGuest ? <Redacted>{activeJob.project?.name ?? '—'}</Redacted> : (activeJob.project?.name ?? '—')}</div>
              </div>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: activeJob.installer?.color ?? B.surface3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: B.bg }}>
                {(activeJob.installer?.name ?? '?').charAt(0)}
              </div>
            </div>

            <div style={{ textAlign: 'center', padding: '20px 0', borderTop: `1px solid ${B.border}`, borderBottom: `1px solid ${B.border}`, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: B.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Elapsed</div>
              <div style={{ fontSize: 54, fontWeight: 800, color: activeJob.is_color_change ? CC : B.yellow, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {elH}:{elM}:{elS}
              </div>
              <div style={{ fontSize: 12, color: B.textTer, marginTop: 8 }}>Started {fmtClock(activeJob.start_ts)}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
              {[
                { l: 'Type', v: activeJob.job_type },
                { l: 'Size', v: activeJob.panel?.height_in && activeJob.panel?.width_in ? `${activeJob.panel.height_in}"×${activeJob.panel.width_in}"` : '--' },
                { l: 'SQFT', v: activeJob.panel?.height_in && activeJob.panel?.width_in ? (calcSqft(activeJob.panel.height_in, activeJob.panel.width_in)?.toFixed(2) ?? '--') : '--' },
              ].map(m => (
                <div key={m.l} style={{ background: B.surface2, borderRadius: 12, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{m.l}</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{m.v}</div>
                </div>
              ))}
            </div>

            {isGuest ? (
              <div style={{ padding: '12px 14px', background: B.surface2, borderRadius: 12, fontSize: 13, color: B.textTer, textAlign: 'center' }}>
                View-only mode — sign in to clock out
              </div>
            ) : (
              <>
                <button
                  onClick={handleClockOut}
                  disabled={busy}
                  style={{ width: '100%', background: activeJob.is_color_change ? CC : B.yellow, color: activeJob.is_color_change ? B.text : B.bg, border: 'none', borderRadius: 14, padding: 18, fontSize: 17, fontWeight: 800, marginBottom: 10, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
                >
                  {busy ? 'Clocking out…' : 'Clock Out'}
                </button>
                <button
                  onClick={handleDiscard}
                  style={{ width: '100%', background: 'transparent', color: B.textTer, border: `1px solid ${B.border}`, borderRadius: 14, padding: 13, fontSize: 14, cursor: 'pointer' }}
                >
                  Discard session
                </button>
              </>
            )}
          </div>

          {todayDone.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Today</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {todayDone
                  .slice()
                  .sort((a, b) => new Date(b.finish_ts).getTime() - new Date(a.finish_ts).getTime())
                  .map(r => (
                    <div key={r.id} style={{ background: B.surface, borderRadius: 14, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${r.is_color_change ? CC + '33' : B.border}` }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{r.panel_name}</div>
                          {r.is_color_change && <span style={{ fontSize: 10, fontWeight: 700, color: CC, background: CC + '22', padding: '2px 6px', borderRadius: 8 }}>CC</span>}
                        </div>
                        <div style={{ fontSize: 12, color: B.textTer, marginTop: 2 }}>
                          {isGuest ? <Redacted>{r.project_name ?? ''}</Redacted> : r.project_name} · {fmtClock(r.start_ts)} → {fmtClock(r.finish_ts)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 17, fontWeight: 800, color: B.yellow }}>{r.sqft?.toFixed(2) ?? '--'}</div>
                        <div style={{ fontSize: 11, color: B.textTer }}>{fmtTime(r.mins)}</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Project</div>
            {selectedProject ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderRadius: 12, background: isCC ? CC + '14' : B.yellow + '14', border: `1.5px solid ${accent}` }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: accent }}>{isGuest ? <Redacted>{selectedProject.name}</Redacted> : selectedProject.name}</div>
                  {isCC && <div style={{ fontSize: 11, color: CC, marginTop: 2 }}>Color Change</div>}
                </div>
                <button
                  onClick={() => {
                    setSelectedProjectId(null)
                    setSelectedPanelId(null)
                    setProjectSearch('')
                  }}
                  style={{ background: 'none', border: 'none', color: B.textTer, fontSize: 20, cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
            ) : (
              <div>
                <input
                  placeholder="Search projects…"
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)}
                  style={{ padding: '12px 14px', fontSize: 15, borderRadius: 10, background: B.surface2, color: B.text, border: 'none', outline: 'none', width: '100%', marginBottom: 8 }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                  {commercial.length > 0 && (
                    <>
                      <GroupHeader label="Commercial" color={B.yellow} />
                      {commercial.map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedProjectId(p.id)
                            setSelectedPanelId(null)
                            setProjectSearch('')
                          }}
                          style={{ padding: '12px 16px', borderRadius: 12, border: 'none', background: B.surface2, color: B.text, fontSize: 14, textAlign: 'left', cursor: 'pointer' }}
                        >
                          {isGuest ? <Redacted>{p.name}</Redacted> : p.name}
                        </button>
                      ))}
                    </>
                  )}
                  {colorchange.length > 0 && (
                    <>
                      <GroupHeader label="Color Change" color={CC} />
                      {colorchange.map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedProjectId(p.id)
                            setSelectedPanelId(null)
                            setProjectSearch('')
                          }}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 12, border: 'none', background: B.surface2, color: B.text, fontSize: 14, textAlign: 'left', cursor: 'pointer', width: '100%' }}
                        >
                          <span>{isGuest ? <Redacted>{p.name}</Redacted> : p.name}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: CC, background: CC + '22', padding: '2px 7px', borderRadius: 8 }}>CC</span>
                        </button>
                      ))}
                    </>
                  )}
                  {!commercial.length && !colorchange.length && (
                    <div style={{ fontSize: 13, color: B.textTer, padding: '8px 2px' }}>No projects found.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {selectedProject && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Panel</div>
              {(selectedProject.panels ?? []).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(selectedProject.panels ?? []).map(pnl => {
                    const sel = selectedPanelId === pnl.id
                    const activeOnPanel = activeJobs.find(j => j.panel_id === pnl.id)
                    const isDone = logs.some(r => r.panel_id === pnl.id && r.project_id === selectedProject.id && r.status === 'Complete')
                    const blocked = !!activeOnPanel || isDone
                    const ipInst = activeOnPanel ? installers.find(i => i.id === activeOnPanel.installer_id) : null
                    const sqft = pnl.height_in && pnl.width_in ? calcSqft(pnl.height_in, pnl.width_in) : null
                    return (
                      <button
                        key={pnl.id}
                        onClick={() => !blocked && setSelectedPanelId(sel ? null : pnl.id)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${sel ? accent : 'transparent'}`, background: sel ? accent + '14' : blocked ? B.surface2 + '80' : B.surface2, color: sel ? accent : blocked ? B.textTer : B.text, fontWeight: sel ? 700 : 400, fontSize: 14, textAlign: 'left', cursor: blocked ? 'default' : 'pointer', opacity: blocked ? 0.5 : 1, width: '100%' }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {pnl.name}
                          {activeOnPanel && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: B.orange, background: B.orange + '22', padding: '2px 7px', borderRadius: 8 }}>
                              IN PROGRESS{ipInst ? <> — {isGuest ? <Redacted>{ipInst.name.split(' ')[0]}</Redacted> : ipInst.name.split(' ')[0]}</> : ''}
                            </span>
                          )}
                          {isDone && !activeOnPanel && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: B.green, background: B.green + '22', padding: '2px 7px', borderRadius: 8 }}>DONE</span>
                          )}
                        </span>
                        <span style={{ fontSize: 12, color: sel ? accent : B.textTer }}>
                          {sqft ? `${sqft.toFixed(1)} sqft` : 'no dims'}
                        </span>
                      </button>
                    )
                  })}
                  {(selectedProject.panels ?? []).every(
                    pnl =>
                      !!activeJobs.find(j => j.panel_id === pnl.id) ||
                      logs.some(r => r.panel_id === pnl.id && r.project_id === selectedProject.id && r.status === 'Complete')
                  ) && (
                    <div style={{ marginTop: 10, padding: '10px 14px', background: B.green + '0D', borderRadius: 10, border: `1px solid ${B.green}33`, fontSize: 13, color: B.green }}>
                      All panels are complete or in progress.
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: B.textTer }}>No panels for this project yet.</div>
              )}
            </div>
          )}

          {selectedProject && selectedPanelId && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Type</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TYPE_OPTS.map(t => (
                  <button
                    key={t}
                    onClick={() => setJobType(t)}
                    style={{ padding: '10px 16px', borderRadius: 22, border: `1.5px solid ${jobType === t ? B.yellow : B.border}`, background: jobType === t ? B.yellow + '18' : 'transparent', color: jobType === t ? B.yellow : B.textSec, fontWeight: jobType === t ? 700 : 400, fontSize: 14, cursor: 'pointer' }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedInstallerId && selectedProject && selectedPanelObj && (
            <div style={{ background: B.surface, borderRadius: 14, padding: '14px 16px', marginBottom: 20, border: `1px solid ${isCC ? CC + '55' : B.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedPanelObj.name}</div>
                    {isCC && <span style={{ fontSize: 10, fontWeight: 700, color: CC, background: CC + '22', padding: '2px 8px', borderRadius: 10 }}>COLOR CHANGE</span>}
                  </div>
                  <div style={{ fontSize: 13, color: B.textSec, marginTop: 2 }}>
                    {isGuest ? <Redacted>{selectedProject.name}</Redacted> : selectedProject.name} · {jobType}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: B.textTer }}>
                  {selectedPanelObj.height_in && selectedPanelObj.width_in ? (
                    <span style={{ color: B.yellow, fontWeight: 700 }}>
                      {calcSqft(selectedPanelObj.height_in, selectedPanelObj.width_in)?.toFixed(2)} sqft
                    </span>
                  ) : (
                    'dims not set'
                  )}
                </div>
              </div>
            </div>
          )}

          {isGuest ? (
            <div style={{ padding: '14px 16px', background: B.surface2, borderRadius: 14, fontSize: 13, color: B.textTer, textAlign: 'center' }}>
              View-only mode — sign in to clock in
            </div>
          ) : (
            <>
              <button
                onClick={handleClockIn}
                disabled={!selectedInstallerId || !selectedProjectId || !selectedPanelId || busy}
                style={{ width: '100%', background: !selectedInstallerId || !selectedProjectId || !selectedPanelId || busy ? B.surface2 : isCC ? CC : B.yellow, color: !selectedInstallerId || !selectedProjectId || !selectedPanelId || busy ? B.textTer : isCC ? B.text : B.bg, border: 'none', borderRadius: 14, padding: 18, fontSize: 17, fontWeight: 800, marginBottom: 12, cursor: busy ? 'default' : 'pointer' }}
              >
                {busy ? 'Clocking in…' : !selectedInstallerId || !selectedProjectId || !selectedPanelId ? 'Select installer, project & panel' : `Clock In${isCC ? ' — Color Change' : ''}`}
              </button>
              <button
                onClick={() => setShowManual(true)}
                style={{ width: '100%', background: 'transparent', color: B.textTer, border: `1px solid ${B.border}`, borderRadius: 14, padding: 13, fontSize: 14, cursor: 'pointer' }}
              >
                + Manual entry
              </button>
            </>
          )}

          {activeJobs.filter(j => j.installer_id !== selectedInstallerId).length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Other active jobs</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeJobs
                  .filter(j => j.installer_id !== selectedInstallerId)
                  .map(j => {
                    const el = Math.max(0, Math.floor((Date.now() - new Date(j.start_ts).getTime()) / 1000))
                    return (
                      <div key={j.id} style={{ background: B.surface, borderRadius: 14, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${B.orange}33` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: j.installer?.color ?? B.surface3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: B.bg }}>
                            {(j.installer?.name ?? '?').charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{j.panel?.name}</div>
                            <div style={{ fontSize: 12, color: B.textTer, marginTop: 1 }}>{isGuest ? <Redacted>{j.project?.name ?? ''}</Redacted> : j.project?.name}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: B.orange, fontVariantNumeric: 'tabular-nums' }}>
                            {String(Math.floor(el / 3600)).padStart(2, '0')}:{String(Math.floor((el % 3600) / 60)).padStart(2, '0')}:{String(el % 60).padStart(2, '0')}
                          </div>
                          <div style={{ fontSize: 11, color: B.textTer }}>{isGuest ? <Redacted>{j.installer?.name.split(' ')[0] ?? ''}</Redacted> : j.installer?.name.split(' ')[0]}</div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}