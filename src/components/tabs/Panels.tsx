import { useState, useMemo } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { useAuth } from '../../context/AuthContext'
import { WarnModal } from '../ui/WarnModal'
import { Toast } from '../ui/Toast'
import { GroupHeader } from '../ui/GroupHeader'
import { B, CC, calcSqft, parseDim, fmtDue, daysUntil } from '../../lib/utils'
import type { WarnConfig, ProjectType } from '../../lib/types'

let _bulkId = 0
interface BulkRow { id: number; name: string; h: string; w: string }

export default function Panels() {
  const { projects, logs, activeJobs, createProject, addPanel, addPanelsBulk, removePanel, archiveProject, updateDueDate, updateProjectType } = useAppData()
  const { isAdmin } = useAuth()

  const [libProjectId, setLibProjectId] = useState<string | null>(null)
  const [libNewProjectName, setLibNewProjectName] = useState('')
  const [libProjType, setLibProjType] = useState<ProjectType>('commercial')
  const [libDueDate, setLibDueDate] = useState('')
  const [libPanel, setLibPanel] = useState('')
  const [libH, setLibH] = useState('')
  const [libW, setLibW] = useState('')
  const [libHErr, setLibHErr] = useState('')
  const [libWErr, setLibWErr] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([{ id:++_bulkId,name:'',h:'',w:'' },{ id:++_bulkId,name:'',h:'',w:'' },{ id:++_bulkId,name:'',h:'',w:'' }])
  const [expanded, setExpanded] = useState<Record<string,boolean>>({})
  const [showCompleted, setShowCompleted] = useState(false)
  const [editingDue, setEditingDue] = useState<string | null>(null)
  const [editingDueVal, setEditingDueVal] = useState('')
  const [warn, setWarn] = useState<WarnConfig | null>(null)
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)

  const sortedProjects = useMemo(() => {
    const lastActivity = new Map<string,number>()
    for (const r of logs) { if (r.project_id) { const t = r.finish_ts ? new Date(r.finish_ts).getTime() : 0; if (!lastActivity.has(r.project_id) || t > lastActivity.get(r.project_id)!) lastActivity.set(r.project_id, t) } }
    return [...projects].sort((a,b) => (lastActivity.get(b.id)??0) - (lastActivity.get(a.id)??0))
  }, [projects, logs])

  function isProjComplete(projId: string): boolean {
    const proj = projects.find(p => p.id === projId)
    if (!proj || !(proj.panels?.length)) return false
    return (proj.panels ?? []).every(pnl => logs.some(r => r.panel_id === pnl.id && r.project_id === projId && r.status === 'Complete'))
  }

  const selectedProject = libProjectId ? projects.find(p => p.id === libProjectId) : null
  const accent = libProjType === 'colorchange' ? CC : B.yellow

  async function handleCreateProject() {
    if (!libNewProjectName.trim()) return
    setSaving(true)
    const { error } = await createProject({ name: libNewProjectName.trim(), projectType: libProjType, dueDate: libDueDate || undefined })
    setSaving(false)
    if (error) { setToast('Error: ' + error); return }
    setLibNewProjectName(''); setLibDueDate('')
    setToast('Project created')
  }

  async function handleAddPanel() {
    setLibHErr(''); setLibWErr('')
    if (!libProjectId || !libPanel.trim()) return
    if (libH && !parseDim(libH)) { setLibHErr('Use inches (48) or feet (4ft)'); return }
    if (libW && !parseDim(libW)) { setLibWErr('Use inches (72) or feet (6ft)'); return }
    setSaving(true)
    const { error } = await addPanel({ projectId: libProjectId, name: libPanel.trim(), heightIn: parseDim(libH), widthIn: parseDim(libW) })
    setSaving(false)
    if (error) { setToast('Error: ' + error); return }
    setLibPanel(''); setLibH(''); setLibW('')
    if (libDueDate) { await updateDueDate(libProjectId, libDueDate) }
    setToast(`"${libPanel.trim()}" added`)
  }

  async function handleBulkImport() {
    if (!libProjectId) return
    const valid = bulkRows.filter(r => r.name.trim()).map(r => ({ name:r.name.trim(), heightIn:parseDim(r.h), widthIn:parseDim(r.w) }))
    if (!valid.length) return
    setSaving(true)
    const { inserted, skipped, error } = await addPanelsBulk({ projectId: libProjectId, panels: valid })
    setSaving(false)
    if (error) { setToast('Error: ' + error); return }
    if (libDueDate) await updateDueDate(libProjectId, libDueDate)
    setBulkRows([{ id:++_bulkId,name:'',h:'',w:'' },{ id:++_bulkId,name:'',h:'',w:'' },{ id:++_bulkId,name:'',h:'',w:'' }])
    setShowBulk(false)
    setToast(skipped > 0 ? `${inserted} panels imported (${skipped} already existed, skipped)` : `${inserted} panels imported`)
  }

  function handleBulkPaste(e: React.ClipboardEvent<HTMLInputElement>, idx: number, field: 'name'|'h'|'w') {
    const t = e.clipboardData.getData('text')
    if (!t.includes('\t') && !t.includes('\n')) return
    e.preventDefault()
    const lines = t.trim().split('\n').map(l => l.split('\t').map(c => c.trim()))
    setBulkRows(prev => {
      const n = [...prev]
      lines.forEach((cols, li) => {
        const ri = idx + li
        if (ri >= n.length) n.push({ id:++_bulkId,name:'',h:'',w:'' })
        const nr = { ...n[ri] }
        if (field==='name') { nr.name=cols[0]||nr.name; nr.h=cols[1]||nr.h; nr.w=cols[2]||nr.w }
        else if (field==='h') { nr.h=cols[0]||nr.h; nr.w=cols[1]||nr.w }
        else { nr.w=cols[0]||nr.w }
        n[ri]=nr
      })
      return n
    })
  }

  function handleRemovePanel(panelId: string, panelName: string, projId: string) {
    if (!isAdmin) return
    const lc = logs.filter(r => r.panel_id === panelId).length
    const doRemove = async () => { const { error } = await removePanel(panelId, projId); if (error) setToast('Error: ' + error); else setToast(`"${panelName}" removed`) }
    if (lc > 0) {
      setWarn({ title:'Remove panel?', body:`"${panelName}" has ${lc} log ${lc===1?'entry':'entries'}. They'll stay in the log.`, ok:'Remove', cancel:'Cancel', danger:true, onOk:doRemove })
    } else { doRemove() }
  }

  function handleArchive(projId: string, projName: string) {
    if (!isAdmin) return
    const hasActive = activeJobs.some(j => j.project_id === projId)
    if (hasActive) { setWarn({ title:'Active job running', body:'Clock out of this project first.', ok:'OK' }); return }
    setWarn({ title:'Archive project?', body:`"${projName}" will be hidden. Log entries preserved.`, ok:'Archive', cancel:'Cancel', danger:true,
      onOk: async () => { const { error } = await archiveProject(projId); if (error) setToast('Error: ' + error); else setToast(`"${projName}" archived`) } })
  }

  function handleTypeChange(projId: string, projName: string, currentType: ProjectType) {
    if (!isAdmin) return
    const newType: ProjectType = currentType === 'colorchange' ? 'commercial' : 'colorchange'
    const logCount = logs.filter(r => r.project_id === projId && r.status === 'Complete').length
    const toLabel = newType === 'colorchange' ? 'Color Change' : 'Commercial'
    let body = `This will move "${projName}" to ${toLabel}.`
    if (logCount > 0) body += ` All ${logCount} historical log ${logCount===1?'entry':'entries'} will be reclassified.`
    setWarn({ title:'Change project type?', body, ok:`Change to ${toLabel}`, cancel:'Cancel', danger:true,
      onOk: async () => { const { error } = await updateProjectType(projId, newType); if (error) setToast('Error: ' + error) } })
  }

  async function saveDue(projId: string) {
    const { error } = await updateDueDate(projId, editingDueVal || null)
    if (error) setToast('Error: ' + error); else setToast('Due date saved')
    setEditingDue(null)
  }

  const sqftPreview = libH && libW && parseDim(libH) && parseDim(libW) ? calcSqft(parseDim(libH), parseDim(libW)) : null

  function renderProject(proj: typeof sortedProjects[0], pt: ProjectType) {
    const acc = pt === 'colorchange' ? CC : B.yellow
    const isExp = !!expanded[proj.id]
    const pnls = proj.panels ?? []
    const donePanelIds = new Set(logs.filter(r => r.project_id === proj.id && r.status === 'Complete' && r.panel_id).map(r => r.panel_id!))
    const donePnls = pnls.filter(pnl => donePanelIds.has(pnl.id))
    const pct = pnls.length > 0 ? donePnls.length / pnls.length : 0
    const due = proj.due_date
    const daysLeft = daysUntil(due)
    const dueColor = !due ? B.textTer : daysLeft!=null&&daysLeft<0 ? B.red : daysLeft!=null&&daysLeft<=2 ? B.red : daysLeft!=null&&daysLeft<=5 ? B.orange : B.green
    const dueLabel = !due ? 'No due date' : daysLeft!=null&&daysLeft<0 ? Math.abs(daysLeft)+'d overdue' : daysLeft===0 ? 'Due today' : 'Due '+fmtDue(due)
    return (
      <div key={proj.id} style={{ background:B.surface,borderRadius:16,marginBottom:8,border:`1px solid ${pt==='colorchange'?CC+'22':B.border}`,overflow:'hidden' }}>
        <button onClick={() => setExpanded(prev => ({ ...prev,[proj.id]:!prev[proj.id] }))}
          style={{ width:'100%',background:'none',border:'none',padding:'14px 16px',textAlign:'left',cursor:'pointer',color:B.text }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
            <div style={{ fontSize:15,fontWeight:700 }}>{proj.name}</div>
            <div style={{ display:'flex',alignItems:'center',gap:10 }}>
              <div style={{ fontSize:11,fontWeight:700,color:dueColor,background:dueColor+'18',padding:'3px 9px',borderRadius:10 }}>{dueLabel}</div>
              <span style={{ fontSize:14,color:B.textTer }}>{isExp?'▲':'▼'}</span>
            </div>
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <div style={{ flex:1,height:4,background:B.surface2,borderRadius:2,overflow:'hidden' }}>
              <div style={{ height:'100%',width:`${pct*100}%`,background:pct===1?B.green:acc,borderRadius:2 }} />
            </div>
            <span style={{ fontSize:11,color:B.textTer,flexShrink:0,fontWeight:600 }}>{donePnls.length}/{pnls.length} panels</span>
          </div>
        </button>

        {isExp && (
          <div style={{ borderTop:`1px solid ${B.border}`,padding:'12px 16px 14px' }}>
            {editingDue === proj.id ? (
              <div style={{ display:'flex',gap:6,alignItems:'center',marginBottom:12 }}>
                <input type="date" value={editingDueVal} onChange={e => setEditingDueVal(e.target.value)}
                  style={{ padding:'5px 8px',fontSize:12,borderRadius:8,background:B.surface2,color:B.text,border:'none',outline:'none',colorScheme:'dark' }} />
                <button onClick={() => saveDue(proj.id)} style={{ background:B.yellow,color:B.bg,border:'none',borderRadius:8,padding:'5px 10px',fontWeight:800,fontSize:12,cursor:'pointer' }}>Save</button>
                <button onClick={() => setEditingDue(null)} style={{ background:'transparent',color:B.textTer,border:`1px solid ${B.border}`,borderRadius:8,padding:'5px 8px',fontSize:12,cursor:'pointer' }}>×</button>
              </div>
            ) : (
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
                <button onClick={() => { setEditingDue(proj.id); setEditingDueVal(proj.due_date??'') }}
                  style={{ background:'none',border:'none',color:B.textTer,fontSize:12,cursor:'pointer',padding:0 }}>
                  {due ? 'Due: '+fmtDue(due) : 'Set due date'} ✎
                </button>
                {isAdmin && (
                  <div style={{ display:'flex',gap:8 }}>
                    <button onClick={() => handleTypeChange(proj.id, proj.name, proj.project_type)}
                      style={{ background:'none',border:`1px solid ${B.border}`,borderRadius:8,color:B.textTer,fontSize:11,padding:'3px 8px',fontWeight:600,cursor:'pointer' }}>
                      {pt==='colorchange'?'To Commercial':'To CC'}
                    </button>
                    <button onClick={() => handleArchive(proj.id, proj.name)} style={{ background:'none',border:'none',color:B.red,fontSize:13,fontWeight:600,padding:'2px 6px',cursor:'pointer' }}>Archive</button>
                  </div>
                )}
              </div>
            )}

            <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
              {pnls.map(pnl => {
                const isDone = donePanelIds.has(pnl.id)
                const sqft = pnl.height_in && pnl.width_in ? calcSqft(pnl.height_in, pnl.width_in) : null
                return (
                  <div key={pnl.id} style={{ display:'flex',alignItems:'center',gap:4,background: isDone ? B.green+'12' : B.surface2,borderRadius:20,padding:'6px 12px',border:`1px solid ${isDone?B.green+'33':'transparent'}` }}>
                    {isDone && <span style={{ fontSize:10,color:B.green }}>✓</span>}
                    <span style={{ fontSize:13,color: isDone ? B.green : B.text }}>{pnl.name}</span>
                    {sqft && <span style={{ fontSize:11,color: isDone ? B.green : acc }}>·{sqft.toFixed(1)}sqft</span>}
                    {isAdmin && <button onClick={() => handleRemovePanel(pnl.id, pnl.name, proj.id)} style={{ background:'none',border:'none',color:B.textTer,fontSize:14,padding:'0 0 0 2px',lineHeight:1,cursor:'pointer' }}>×</button>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <WarnModal modal={warn} onClose={() => setWarn(null)} />
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}

      {isAdmin && (
        <div style={{ background:B.surface,borderRadius:16,padding:16,marginBottom:20,border:`1px solid ${B.border}` }}>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:6 }}>Job type</div>
            <div style={{ display:'flex',gap:3,background:B.surface2,borderRadius:10,padding:3 }}>
              <button onClick={() => setLibProjType('commercial')} style={{ flex:1,padding:9,border:'none',borderRadius:8,background:libProjType==='commercial'?B.yellow:'transparent',color:libProjType==='commercial'?B.bg:B.textSec,fontWeight:libProjType==='commercial'?700:400,fontSize:13,cursor:'pointer' }}>Commercial</button>
              <button onClick={() => setLibProjType('colorchange')} style={{ flex:1,padding:9,border:'none',borderRadius:8,background:libProjType==='colorchange'?CC:'transparent',color:libProjType==='colorchange'?B.text:B.textSec,fontWeight:libProjType==='colorchange'?700:400,fontSize:13,cursor:'pointer' }}>Color Change</button>
            </div>
          </div>

          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:6 }}>Project</div>
            <select value={libProjectId??''} onChange={e => setLibProjectId(e.target.value||null)}
              style={{ padding:'11px 12px',borderRadius:10,background:B.surface2,color:B.text,border:'none',width:'100%',fontSize:14,marginBottom:6 }}>
              <option value="">-- existing project --</option>
              {sortedProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div style={{ display:'flex',gap:6 }}>
              <input placeholder="Or create new project…" value={libNewProjectName} onChange={e => setLibNewProjectName(e.target.value)}
                style={{ flex:1,padding:'10px 12px',fontSize:13,borderRadius:10,background:B.surface2,color:B.text,border:'none',outline:'none' }} />
              <button onClick={handleCreateProject} disabled={saving||!libNewProjectName.trim()}
                style={{ padding:'10px 14px',background:libNewProjectName.trim()?accent:B.surface3,color:libNewProjectName.trim()?(libProjType==='colorchange'?B.text:B.bg):B.textTer,border:'none',borderRadius:10,fontWeight:700,fontSize:13,cursor:'pointer' }}>Create</button>
            </div>
          </div>

          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:6 }}>Due date</div>
            <input type="date" value={libDueDate} onChange={e => setLibDueDate(e.target.value)}
              style={{ padding:'10px 12px',fontSize:13,borderRadius:10,background:B.surface2,color:B.text,border:'none',outline:'none',width:'100%',colorScheme:'dark' }} />
          </div>

          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:6 }}>Panel name</div>
            <input placeholder="e.g. Driver Door" value={libPanel} onChange={e => setLibPanel(e.target.value)} onKeyDown={e => { if (e.key==='Enter') handleAddPanel() }}
              style={{ padding:'10px 12px',fontSize:13,borderRadius:10,background:B.surface2,color:B.text,border:'none',outline:'none',width:'100%' }} />
          </div>

          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:4 }}>
            <div>
              <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:6 }}>Height (in)</div>
              <input placeholder="48 or 4ft" value={libH} onChange={e => { setLibH(e.target.value); setLibHErr('') }}
                style={{ padding:'10px 12px',fontSize:13,borderRadius:10,background:B.surface2,color:B.text,border:libHErr?`1px solid ${B.red}`:'none',outline:'none',width:'100%' }} />
              {libHErr && <div style={{ fontSize:11,color:B.red,marginTop:4 }}>{libHErr}</div>}
            </div>
            <div>
              <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:6 }}>Width (in)</div>
              <input placeholder="72 or 6ft" value={libW} onChange={e => { setLibW(e.target.value); setLibWErr('') }}
                style={{ padding:'10px 12px',fontSize:13,borderRadius:10,background:B.surface2,color:B.text,border:libWErr?`1px solid ${B.red}`:'none',outline:'none',width:'100%' }} />
              {libWErr && <div style={{ fontSize:11,color:B.red,marginTop:4 }}>{libWErr}</div>}
            </div>
          </div>
          {sqftPreview && <div style={{ fontSize:12,color:accent,fontWeight:700,marginBottom:10,marginTop:6 }}>{sqftPreview.toFixed(2)} sqft preview</div>}

          <button onClick={handleAddPanel} disabled={saving||!libProjectId||!libPanel.trim()}
            style={{ background:libProjectId&&libPanel.trim()?accent:B.surface3,color:libProjectId&&libPanel.trim()?(libProjType==='colorchange'?B.text:B.bg):B.textTer,border:'none',borderRadius:12,padding:12,fontWeight:800,fontSize:15,width:'100%',marginBottom:10,marginTop:8,cursor:'pointer' }}>
            {saving ? 'Saving…' : 'Add Panel'}
          </button>

          <button onClick={() => setShowBulk(v => !v)} style={{ background:'transparent',color:B.textSec,border:`1px solid ${B.border}`,borderRadius:12,padding:10,fontSize:13,width:'100%',cursor:'pointer' }}>
            {showBulk ? 'Hide bulk import' : 'Bulk import panels'}
          </button>

          {showBulk && (
            <div style={{ marginTop:10,background:B.surface2,borderRadius:12,padding:14,border:`1px solid rgba(255,255,255,0.1)` }}>
              <div style={{ fontSize:12,color:B.textTer,marginBottom:10,lineHeight:1.6 }}>Paste from a spreadsheet or enter manually.</div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 88px 88px 28px',gap:5,marginBottom:5 }}>
                {['Panel name','Height','Width',''].map((l,i) => <div key={i} style={{ fontSize:10,fontWeight:700,color:B.textTer,textTransform:'uppercase',letterSpacing:'0.06em',paddingLeft:2 }}>{l}</div>)}
              </div>
              <div style={{ display:'flex',flexDirection:'column',gap:5,marginBottom:10 }}>
                {bulkRows.map((row, idx) => {
                  const sq = parseDim(row.h) && parseDim(row.w) ? calcSqft(parseDim(row.h), parseDim(row.w)) : null
                  return (
                    <div key={row.id} style={{ display:'grid',gridTemplateColumns:'1fr 88px 88px 28px',gap:5,alignItems:'center' }}>
                      <input value={row.name} placeholder={`Panel ${idx+1}`} onChange={e => setBulkRows(prev => prev.map((r,i)=>i===idx?{...r,name:e.target.value}:r))} onPaste={e => handleBulkPaste(e,idx,'name')}
                        style={{ padding:'8px 10px',fontSize:13,borderRadius:8,background:B.surface3,color:B.text,border:'none',outline:'none' }} />
                      <input value={row.h} placeholder="48" onChange={e => setBulkRows(prev => prev.map((r,i)=>i===idx?{...r,h:e.target.value}:r))} onPaste={e => handleBulkPaste(e,idx,'h')}
                        style={{ padding:'8px 6px',fontSize:12,borderRadius:8,textAlign:'center',background:B.surface3,color:B.text,border:'none',outline:'none' }} />
                      <div style={{ position:'relative' }}>
                        <input value={row.w} placeholder="72" onChange={e => setBulkRows(prev => prev.map((r,i)=>i===idx?{...r,w:e.target.value}:r))} onPaste={e => handleBulkPaste(e,idx,'w')}
                          style={{ padding:'8px 6px',fontSize:12,borderRadius:8,textAlign:'center',background:B.surface3,color:B.text,border:'none',outline:'none',width:'100%' }} />
                        {sq && <div style={{ position:'absolute',top:-9,right:0,fontSize:9,fontWeight:700,color:accent,whiteSpace:'nowrap',pointerEvents:'none' }}>{sq.toFixed(1)}sqft</div>}
                      </div>
                      <button onClick={() => setBulkRows(prev => prev.filter((_,i)=>i!==idx))} style={{ background:'none',border:'none',color:B.textTer,fontSize:18,padding:0,lineHeight:1,cursor:'pointer' }}>×</button>
                    </div>
                  )
                })}
              </div>
              <button onClick={() => setBulkRows(prev => [...prev, { id:++_bulkId,name:'',h:'',w:'' }])}
                style={{ background:'transparent',border:`1px dashed rgba(255,255,255,0.15)`,borderRadius:8,padding:7,fontSize:12,color:B.textTer,width:'100%',marginBottom:12,cursor:'pointer' }}>+ Add row</button>
              <button onClick={handleBulkImport} disabled={saving||!libProjectId||!bulkRows.some(r=>r.name.trim())}
                style={{ background:libProjectId&&bulkRows.some(r=>r.name.trim())?accent:B.surface3,color:libProjectId&&bulkRows.some(r=>r.name.trim())?(libProjType==='colorchange'?B.text:B.bg):B.textTer,border:'none',borderRadius:10,padding:11,fontWeight:800,fontSize:14,width:'100%',cursor:'pointer' }}>
                {saving ? 'Importing…' : `Import ${bulkRows.filter(r=>r.name.trim()).length} panel${bulkRows.filter(r=>r.name.trim()).length!==1?'s':''}`}
              </button>
            </div>
          )}
        </div>
      )}

      {(['commercial','colorchange'] as ProjectType[]).map(pt => {
        const projs = sortedProjects.filter(p => p.project_type === pt)
        if (!projs.length) return null
        const acc = pt === 'colorchange' ? CC : B.yellow
        const activeProjs = projs.filter(p => !isProjComplete(p.id))
        const completedProjs = projs.filter(p => isProjComplete(p.id))
        return (
          <div key={pt}>
            <GroupHeader label={pt==='colorchange'?'Color Change':'Commercial'} color={acc} />
            <div style={{ marginBottom:16 }}>
              {activeProjs.map(p => renderProject(p, pt))}
              {!activeProjs.length && <div style={{ fontSize:13,color:B.textTer,padding:'8px 2px',marginBottom:8 }}>No active projects.</div>}
              {completedProjs.length > 0 && (
                <div style={{ marginTop:4 }}>
                  <button onClick={() => setShowCompleted(v => !v)} style={{ width:'100%',background:'transparent',border:`1px solid ${B.border}`,borderRadius:12,padding:10,fontSize:13,color:B.textTer,fontWeight:600,marginBottom:showCompleted?8:0,cursor:'pointer' }}>
                    {showCompleted ? `Hide completed (${completedProjs.length})` : `Show completed (${completedProjs.length})`}
                  </button>
                  {showCompleted && completedProjs.map(p => renderProject(p, pt))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
