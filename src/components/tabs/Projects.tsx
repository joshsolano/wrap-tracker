import { useState, useMemo } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { useAuth } from '../../context/AuthContext'
import { WarnModal } from '../ui/WarnModal'
import { Toast } from '../ui/Toast'
import { B, CC, fmtDate, fmtDue, fmtTime, daysUntil } from '../../lib/utils'
import type { WarnConfig, Project } from '../../lib/types'

export default function Projects() {
  const { projects, logs, activeJobs, installers, updateProject, updateProjectType, updateDueDate, archiveProject } = useAppData()
  const { isAdmin } = useAuth()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editingDue, setEditingDue] = useState<string | null>(null)
  const [editingDueVal, setEditingDueVal] = useState('')
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editingNameVal, setEditingNameVal] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [warn, setWarn] = useState<WarnConfig | null>(null)
  const [toast, setToast] = useState('')

  const projectsData = useMemo(() => {
    return projects.map(p => {
      const pnls = p.panels ?? []
      const total = pnls.length
      const ajForProj = activeJobs.filter(j => j.project_id === p.id)
      const donePanelIds = new Set(
        logs.filter(r => r.project_id === p.id && r.status === 'Complete' && r.panel_id).map(r => r.panel_id!)
      )
      const doneCount = pnls.filter(pnl => donePanelIds.has(pnl.id)).length
      const inProgressPanelIds = new Set(ajForProj.map(j => j.panel_id))
      const remaining = pnls.filter(pnl => !donePanelIds.has(pnl.id) && !inProgressPanelIds.has(pnl.id))
      const workedIds = new Set(logs.filter(r => r.project_id === p.id && r.status === 'Complete').map(r => r.installer_id).filter(Boolean))
      const workedBy = Array.from(workedIds).map(id => installers.find(i => i.id === id)).filter(Boolean)
      const projLogs = logs.filter(r => r.project_id === p.id && r.finish_ts)
      const lastTs = projLogs.reduce((mx, r) => Math.max(mx, new Date(r.finish_ts).getTime()), 0) || null
      const daysSince = lastTs ? Math.floor((Date.now() - lastTs) / 86400000) : null
      const due = p.due_date
      const daysLeft = daysUntil(due)
      const pct = total > 0 ? doneCount / total : 0
      const isComplete = doneCount >= total && total > 0
      let statusColor = B.green, statusLabel = 'On Track'
      if (isComplete) { statusColor = B.green; statusLabel = 'Complete' }
      else if (daysLeft == null) { statusColor = B.textTer; statusLabel = 'No Due Date' }
      else if (daysLeft < 0) { statusColor = B.red; statusLabel = 'Overdue' }
      else if (daysLeft <= 2) { statusColor = B.red; statusLabel = 'Due Soon' }
      else if (daysLeft <= 5) { statusColor = B.orange; statusLabel = 'At Risk' }
      let onTimeBadge: string | null = null
      if (isComplete && due && lastTs) {
        const dueTs = new Date(due + 'T23:59:59').getTime()
        const diff = Math.round((lastTs - dueTs) / 86400000)
        onTimeBadge = diff < -1 ? Math.abs(diff) + 'd early' : diff <= 0 ? 'On time' : diff === 1 ? '1d late' : diff + 'd late'
        statusColor = diff <= 0 ? B.green : B.red
      }
      const completionTs = isComplete && lastTs ? lastTs : null
      return { p, pnls, total, doneCount, donePanelIds, inProgressPanelIds, remaining, workedBy, lastTs, daysSince, due, daysLeft, pct, isComplete, statusColor, statusLabel, onTimeBadge, completionTs, ajForProj }
    }).sort((a, b) => {
      if (a.isComplete && !b.isComplete) return 1
      if (!a.isComplete && b.isComplete) return -1
      if (a.daysLeft == null && b.daysLeft != null) return 1
      if (a.daysLeft != null && b.daysLeft == null) return -1
      if (a.daysLeft != null && b.daysLeft != null) return a.daysLeft - b.daysLeft
      return 0
    })
  }, [projects, logs, activeJobs, installers])

  const visible = showCompleted ? projectsData : projectsData.filter(d => !d.isComplete)
  const completedCount = projectsData.filter(d => d.isComplete).length
  const overdueCount = projectsData.filter(d => !d.isComplete && d.daysLeft != null && d.daysLeft < 0).length
  const dueSoonCount = projectsData.filter(d => !d.isComplete && d.daysLeft != null && d.daysLeft >= 0 && d.daysLeft <= 2).length
  const atRiskCount = projectsData.filter(d => !d.isComplete && d.daysLeft != null && d.daysLeft > 2 && d.daysLeft <= 5).length

  function initials(name: string) { return name.split(' ').map(n => n[0]).join('').slice(0, 2) }

  function handleArchive(proj: Project) {
    const hasActive = activeJobs.some(j => j.project_id === proj.id)
    if (hasActive) { setWarn({ title: 'Active job running', body: 'Clock out of this project first.', ok: 'OK' }); return }
    setWarn({
      title: 'Archive project?', body: `"${proj.name}" will be hidden. Log entries are preserved.`,
      ok: 'Archive', cancel: 'Cancel', danger: true,
      onOk: async () => { const { error } = await archiveProject(proj.id); if (error) setToast('Error: ' + error); else setToast(`"${proj.name}" archived`) },
    })
  }

  function handleTypeChange(proj: Project, newType: 'commercial' | 'colorchange') {
    const logCount = logs.filter(r => r.project_id === proj.id && r.status === 'Complete').length
    const fromLabel = proj.project_type === 'colorchange' ? 'Color Change' : 'Commercial'
    const toLabel = newType === 'colorchange' ? 'Color Change' : 'Commercial'
    let body = `This will move "${proj.name}" from ${fromLabel} to ${toLabel}.`
    if (logCount > 0) body += ` All ${logCount} historical log ${logCount === 1 ? 'entry' : 'entries'} will be reclassified.`
    setWarn({
      title: 'Change project type?', body, ok: `Change to ${toLabel}`, cancel: 'Cancel', danger: true,
      onOk: async () => { const { error } = await updateProjectType(proj.id, newType); if (error) setToast('Error: ' + error) },
    })
  }

  async function saveDue(projId: string) {
    const { error } = await updateDueDate(projId, editingDueVal || null)
    if (error) setToast('Error: ' + error); else setToast('Due date saved')
    setEditingDue(null)
  }

  async function saveName(projId: string) {
    if (!editingNameVal.trim()) return
    const { error } = await updateProject(projId, { name: editingNameVal.trim() })
    if (error) setToast('Error: ' + error); else setToast('Project renamed')
    setEditingName(null)
  }

  return (
    <div>
      <WarnModal modal={warn} onClose={() => setWarn(null)} />
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}

      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:20 }}>
        {[{ l:'Overdue',v:overdueCount,c:B.red },{ l:'Due Soon',v:dueSoonCount,c:B.orange },{ l:'At Risk',v:atRiskCount,c:B.yellow },{ l:'Complete',v:completedCount,c:B.green }].map(m => (
          <div key={m.l} style={{ background:B.surface,borderRadius:12,padding:'12px 10px',textAlign:'center',border:`1px solid ${m.v > 0 && m.l !== 'Complete' ? m.c+'44' : B.border}` }}>
            <div style={{ fontSize:22,fontWeight:800,color: m.v > 0 ? m.c : B.textTer }}>{m.v}</div>
            <div style={{ fontSize:10,color:B.textTer,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginTop:3 }}>{m.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
        {visible.map(({ p, pnls, doneCount, donePanelIds, inProgressPanelIds, remaining, workedBy, daysLeft, pct, isComplete, statusColor, statusLabel, onTimeBadge, completionTs, ajForProj }) => {
          const isExp = expanded === p.id
          const pc = isComplete ? B.green : statusColor
          const isCC = p.project_type === 'colorchange'
          return (
            <div key={p.id} style={{ background:B.surface,borderRadius:16,border:`1px solid ${isComplete ? B.green+'33' : statusLabel === 'On Track' || statusLabel === 'No Due Date' ? B.border : statusColor+'44'}`,overflow:'hidden' }}>
              <button onClick={() => setExpanded(isExp ? null : p.id)} style={{ width:'100%',background:'none',border:'none',padding:16,textAlign:'left',cursor:'pointer',color:B.text }}>
                <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10 }}>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap' }}>
                      {editingName === p.id ? (
                        <div onClick={e => e.stopPropagation()} style={{ display:'flex',gap:6,alignItems:'center' }}>
                          <input value={editingNameVal} onChange={e => setEditingNameVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveName(p.id); if (e.key === 'Escape') setEditingName(null) }}
                            style={{ padding:'6px 10px',fontSize:14,borderRadius:8,background:B.surface2,color:B.text,border:'none',outline:'none',width:200 }} autoFocus />
                          <button onClick={() => saveName(p.id)} style={{ background:B.yellow,color:B.bg,border:'none',borderRadius:8,padding:'6px 12px',fontWeight:800,fontSize:12,cursor:'pointer' }}>Save</button>
                          <button onClick={() => setEditingName(null)} style={{ background:'transparent',color:B.textTer,border:`1px solid ${B.border}`,borderRadius:8,padding:'6px 10px',fontSize:12,cursor:'pointer' }}>×</button>
                        </div>
                      ) : (
                        <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                          <div style={{ fontSize:15,fontWeight:700 }}>{p.name}</div>
                          {isAdmin && <button onClick={e => { e.stopPropagation(); setEditingName(p.id); setEditingNameVal(p.name) }} style={{ background:'none',border:'none',color:B.textTer,fontSize:12,cursor:'pointer',padding:0 }}>✎</button>}
                        </div>
                      )}
                      {isCC && <span style={{ fontSize:10,fontWeight:700,color:CC,background:CC+'22',padding:'2px 7px',borderRadius:8 }}>CC</span>}
                    </div>
                    <div style={{ height:5,background:B.surface2,borderRadius:3,overflow:'hidden',marginBottom:8 }}>
                      <div style={{ height:'100%',width:`${pct*100}%`,background:pc,borderRadius:3 }} />
                    </div>
                    <div style={{ display:'flex',alignItems:'center',gap:12,flexWrap:'wrap' }}>
                      <span style={{ fontSize:12,color:B.textSec,fontWeight:600 }}><span style={{ color:B.text }}>{doneCount}</span>/{pnls.length} panels{ajForProj.length > 0 && <span style={{ color:B.orange }}> + {ajForProj.length} active</span>}</span>
                    </div>
                  </div>
                  <div style={{ flexShrink:0,textAlign:'right' }}>
                    <div style={{ fontSize:10,fontWeight:700,color:statusColor,background:statusColor+'18',padding:'3px 9px',borderRadius:10,marginBottom:4,display:'inline-block' }}>{statusLabel}</div>
                    {onTimeBadge && <div style={{ fontSize:10,fontWeight:700,color:pc,background:pc+'18',padding:'3px 9px',borderRadius:10,marginBottom:4,display:'block' }}>{onTimeBadge}</div>}
                    <div style={{ fontSize:11,color: daysLeft != null && daysLeft < 0 && !isComplete ? B.red : daysLeft != null && daysLeft <= 2 && !isComplete ? B.orange : B.textTer }}>
                      {p.due_date ? (isComplete ? (completionTs ? 'Completed ' + fmtDate(new Date(completionTs).toISOString()) : 'Completed') : daysLeft != null && daysLeft < 0 ? Math.abs(daysLeft) + 'd overdue' : daysLeft === 0 ? 'Due today' : 'Due ' + fmtDue(p.due_date)) : 'No due date'}
                    </div>
                    {workedBy.length > 0 && (
                      <div style={{ display:'flex',gap:4,marginTop:6,justifyContent:'flex-end' }}>
                        {workedBy.map(inst => inst && (
                          <div key={inst.id} style={{ width:20,height:20,borderRadius:'50%',background:inst.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:800,color:B.bg }}>{initials(inst.name)}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {isExp && (
                <div style={{ borderTop:`1px solid ${B.border}`,padding:'12px 16px 16px' }}>
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8 }}>
                    {editingDue === p.id ? (
                      <div style={{ display:'flex',gap:6,alignItems:'center' }}>
                        <input type="date" value={editingDueVal} onChange={e => setEditingDueVal(e.target.value)}
                          style={{ padding:'5px 8px',fontSize:12,borderRadius:8,background:B.surface2,color:B.text,border:'none',outline:'none',colorScheme:'dark' }} />
                        <button onClick={() => saveDue(p.id)} style={{ background:B.yellow,color:B.bg,border:'none',borderRadius:8,padding:'5px 10px',fontWeight:800,fontSize:12,cursor:'pointer' }}>Save</button>
                        <button onClick={() => setEditingDue(null)} style={{ background:'transparent',color:B.textTer,border:`1px solid ${B.border}`,borderRadius:8,padding:'5px 8px',fontSize:12,cursor:'pointer' }}>×</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingDue(p.id); setEditingDueVal(p.due_date ?? '') }}
                        style={{ background:'none',border:'none',color:B.textSec,fontSize:12,cursor:'pointer',padding:0 }}>
                        {p.due_date ? 'Due: ' + fmtDue(p.due_date) : 'Set due date'} ✎
                      </button>
                    )}
                    {isAdmin && (
                      <div style={{ display:'flex',gap:8 }}>
                        <button onClick={() => handleTypeChange(p, isCC ? 'commercial' : 'colorchange')}
                          style={{ background:'none',border:`1px solid ${B.border}`,borderRadius:8,color:B.textTer,fontSize:11,padding:'3px 8px',fontWeight:600,cursor:'pointer' }}>
                          {isCC ? 'To Commercial' : 'To CC'}
                        </button>
                        <button onClick={() => handleArchive(p)} style={{ background:'none',border:'none',color:B.red,fontSize:13,fontWeight:600,padding:'2px 6px',cursor:'pointer' }}>Archive</button>
                      </div>
                    )}
                  </div>

                  <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
                    {pnls.map(panel => {
                      const isDone = donePanelIds.has(panel.id)
                      const isIP = inProgressPanelIds.has(panel.id)
                      const aj = ajForProj.find(j => j.panel_id === panel.id)
                      const ipInst = aj ? installers.find(i => i.id === aj.installer_id) : null
                      const plog = logs.filter(r => r.panel_id === panel.id && r.project_id === p.id && r.status === 'Complete').sort((a, b) => new Date(b.finish_ts).getTime() - new Date(a.finish_ts).getTime())[0]
                      const worker = plog?.installer ?? null
                      return (
                        <div key={panel.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background: isDone ? B.green+'0D' : isIP ? B.orange+'0D' : B.surface2,borderRadius:9,border:`1px solid ${isDone ? B.green+'33' : isIP ? B.orange+'33' : 'transparent'}` }}>
                          <div style={{ width:18,height:18,borderRadius:'50%',background: isDone ? B.green : isIP ? B.orange : B.surface3,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:10,color:(isDone||isIP)?B.bg:B.textTer,fontWeight:800 }}>
                            {isDone ? '✓' : isIP ? '…' : ''}
                          </div>
                          <div style={{ flex:1,minWidth:0 }}>
                            <div style={{ fontSize:13,fontWeight:isDone||isIP?600:400,color: isDone ? B.text : isIP ? B.orange : B.textSec }}>{panel.name}</div>
                            {isDone && plog && <div style={{ fontSize:11,color:B.textTer,marginTop:1 }}>{fmtDate(plog.finish_ts)}{worker ? ' · ' + worker.name.split(' ')[0] : ''}</div>}
                            {isIP && <div style={{ fontSize:11,color:B.orange,marginTop:1 }}>In progress{ipInst ? ' — ' + ipInst.name.split(' ')[0] : ''}</div>}
                          </div>
                          {panel.height_in && panel.width_in && <div style={{ fontSize:11,color:B.textTer,flexShrink:0 }}>{panel.height_in}"×{panel.width_in}"</div>}
                        </div>
                      )
                    })}
                  </div>

                  {remaining.length > 0 && !isComplete && (
                    <div style={{ marginTop:12,padding:'10px 12px',background:B.red+'0D',borderRadius:9,border:`1px solid ${B.red}22`,fontSize:12,color:B.red }}>
                      {remaining.length} panel{remaining.length !== 1 ? 's' : ''} remaining: {remaining.map(p => p.name).join(', ')}
                    </div>
                  )}

                  {(() => {
                    const projLogs = logs.filter(r => r.project_id === p.id && r.status === 'Complete' && r.sqft && r.sqft > 0)
                    if (!projLogs.length) return null
                    const totalSqft = projLogs.reduce((s, r) => s + (r.sqft ?? 0), 0) || 1
                    const byInst = new Map<string, { name: string; color: string; sqft: number; mins: number; panels: number }>()
                    for (const r of projLogs) {
                      const inst = installers.find(i => i.id === r.installer_id)
                      if (!inst) continue
                      const cur = byInst.get(inst.id) ?? { name: inst.name, color: inst.color, sqft: 0, mins: 0, panels: 0 }
                      cur.sqft += r.sqft ?? 0; cur.mins += r.mins ?? 0; cur.panels++
                      byInst.set(inst.id, cur)
                    }
                    const rows = Array.from(byInst.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.sqft - a.sqft)
                    return (
                      <div style={{ marginTop:14,paddingTop:14,borderTop:`1px solid ${B.border}` }}>
                        <div style={{ fontSize:11,fontWeight:700,color:B.textTer,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10 }}>Installer breakdown</div>
                        <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                          {rows.map(row => {
                            const pct2 = row.sqft / totalSqft
                            return (
                              <div key={row.id} style={{ display:'flex',alignItems:'center',gap:10 }}>
                                <div style={{ width:24,height:24,borderRadius:'50%',background:row.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:B.bg,flexShrink:0 }}>{row.name.charAt(0)}</div>
                                <div style={{ flex:1,minWidth:0 }}>
                                  <div style={{ display:'flex',justifyContent:'space-between',marginBottom:3,fontSize:12 }}>
                                    <span style={{ fontWeight:600 }}>{row.name.split(' ')[0]}</span>
                                    <span style={{ display:'flex',gap:8,alignItems:'center' }}>
                                      <span style={{ fontWeight:700,color:row.color }}>{(pct2*100).toFixed(0)}%</span>
                                      <span style={{ color:B.textTer }}>{row.sqft.toFixed(1)} sqft · {row.panels} panel{row.panels!==1?'s':''} · {fmtTime(row.mins)}</span>
                                    </span>
                                  </div>
                                  <div style={{ height:4,background:B.surface3,borderRadius:2,overflow:'hidden' }}>
                                    <div style={{ height:'100%',width:`${pct2*100}%`,background:row.color,borderRadius:2 }} />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        })}

        {!visible.length && (
          <div style={{ padding:32,textAlign:'center',color:B.textTer,fontSize:13 }}>No active projects.</div>
        )}

        <button onClick={() => setShowCompleted(v => !v)}
          style={{ width:'100%',marginTop:4,background:'transparent',border:`1px solid ${B.border}`,borderRadius:12,padding:11,fontSize:13,color:B.textTer,fontWeight:600,cursor:'pointer' }}>
          {showCompleted ? `Hide completed (${completedCount})` : `Show completed (${completedCount})`}
        </button>
      </div>
    </div>
  )
}
