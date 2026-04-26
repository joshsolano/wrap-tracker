import { useState, useEffect } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { useAuth } from '../../context/AuthContext'
import { WarnModal } from '../ui/WarnModal'
import { Toast } from '../ui/Toast'
import { B, CC, SWATCH_COLORS } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import type { WarnConfig, Installer, Manager, RewardProduct } from '../../lib/types'

type Tab = 'Clock In' | 'Dashboard' | 'Log' | 'Projects' | 'Leaderboard' | 'Bounties' | 'Profiles' | 'Panels' | 'Content' | 'Settings'
const TOGGLEABLE_TABS: Tab[] = ['Dashboard', 'Log', 'Projects', 'Leaderboard', 'Bounties', 'Profiles', 'Panels']

interface Props {
  onSignOut: () => void
  hiddenTabs?: Set<Tab>
  toggleTab?: (t: Tab) => void
}

export default function Settings({ onSignOut, hiddenTabs, toggleTab }: Props) {
  const { installers, logs, projects, activeJobs, updateInstaller, deactivateInstaller, addInstallerViaEdge, addManagerViaEdge } = useAppData()
  const { isAdmin, installer: me, isGuest } = useAuth()

  const [warn, setWarn] = useState<WarnConfig | null>(null)
  const [toast, setToast] = useState('')

  // Edit name
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameVal, setEditingNameVal] = useState('')

  // Edit birthday
  const [editingBdayId, setEditingBdayId] = useState<string | null>(null)
  const [editingBdayVal, setEditingBdayVal] = useState('')

  // Color picker
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)

  // New installer form
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(SWATCH_COLORS[0])
  const [newBirthday, setNewBirthday] = useState('')
  const [newRole, setNewRole] = useState<'installer'|'admin'>('installer')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Managers
  const [managers, setManagers] = useState<Manager[]>([])
  const [newMgrEmail, setNewMgrEmail] = useState('')
  const [newMgrPassword, setNewMgrPassword] = useState('')
  const [newMgrName, setNewMgrName] = useState('')
  const [creatingMgr, setCreatingMgr] = useState(false)
  const [mgrError, setMgrError] = useState<string | null>(null)

  // Reward products
  const [rewardProducts, setRewardProducts] = useState<RewardProduct[]>([])
  const [newProdName, setNewProdName] = useState('')
  const [newProdImageUrl, setNewProdImageUrl] = useState('')
  const [newProdBuyUrl, setNewProdBuyUrl] = useState('')
  const [creatingProd, setCreatingProd] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    supabase.from('managers').select('*').order('created_at').then(({ data }) => {
      if (data) setManagers(data as Manager[])
    })
    supabase.from('reward_products').select('*').order('created_at').then(({ data }) => {
      if (data) setRewardProducts(data as RewardProduct[])
    })
  }, [isAdmin])

  async function handleCreateManager(e: React.FormEvent) {
    e.preventDefault()
    if (!newMgrEmail.trim() || !newMgrPassword || !newMgrName.trim()) return
    setCreatingMgr(true); setMgrError(null)
    const { error } = await addManagerViaEdge({ email: newMgrEmail.trim(), password: newMgrPassword, name: newMgrName.trim() })
    setCreatingMgr(false)
    if (error) { setMgrError(error); return }
    setNewMgrEmail(''); setNewMgrPassword(''); setNewMgrName('')
    setToast(`${newMgrName.trim()} added as manager`)
    const { data } = await supabase.from('managers').select('*').order('created_at')
    if (data) setManagers(data as Manager[])
  }

  async function handleRemoveManager(mgr: Manager) {
    setWarn({
      title: 'Remove manager?',
      body: `${mgr.name} will lose access. Their auth account will remain but be unlinked.`,
      ok: 'Remove', cancel: 'Cancel', danger: true,
      onOk: async () => {
        await supabase.from('managers').delete().eq('id', mgr.id)
        setManagers(prev => prev.filter(m => m.id !== mgr.id))
        setToast(`${mgr.name} removed`)
      },
    })
  }

  // Export
  const [exportDateRange, setExportDateRange] = useState('all')
  const [exportInstallerIds, setExportInstallerIds] = useState<Record<string,boolean>>({})
  const [exportSections, setExportSections] = useState({ log:true, kpis:true, projects:true, totals:true })

  async function saveInstName(id: string) {
    if (!editingNameVal.trim()) return
    const { error } = await updateInstaller(id, { name: editingNameVal.trim() })
    if (error) setToast('Error: ' + error); else setToast('Name updated')
    setEditingNameId(null)
  }

  async function saveBday(id: string) {
    const { error } = await updateInstaller(id, { birthday: editingBdayVal.trim() || null } as any)
    if (error) setToast('Error: ' + error); else setToast('Birthday saved')
    setEditingBdayId(null)
  }

  async function saveColor(id: string, color: string) {
    const { error } = await updateInstaller(id, { color })
    if (error) setToast('Error: ' + error)
    setColorPickerId(null)
  }

  function handleDeactivate(inst: Installer) {
    if (!isAdmin) return
    if (inst.id === me?.id) { setWarn({ title:"Can't remove yourself", body:'You cannot deactivate your own account.', ok:'OK' }); return }
    const hasActive = !!activeJobs.find(j => j.installer_id === inst.id)
    if (hasActive) { setWarn({ title:'Currently clocked in', body:'Clock out first.', ok:'OK' }); return }
    const lc = logs.filter(r => r.installer_id === inst.id).length
    setWarn({
      title: 'Remove installer?',
      body: `${inst.name} has ${lc} log ${lc===1?'entry':'entries'}. History preserved as "Former Installer."`,
      ok: 'Remove', cancel: 'Cancel', danger: true,
      onOk: async () => {
        const { error } = await deactivateInstaller(inst.id)
        if (error) setToast('Error: ' + error); else setToast(inst.name + ' removed')
      },
    })
  }

  async function handleCreateInstaller(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail.trim() || !newPassword || !newName.trim()) return
    setCreating(true); setCreateError(null)
    const { error } = await addInstallerViaEdge({ email:newEmail.trim(), password:newPassword, name:newName.trim(), color:newColor, birthday:newBirthday, role:newRole })
    setCreating(false)
    if (error) { setCreateError(error); return }
    setNewEmail(''); setNewPassword(''); setNewName(''); setNewBirthday(''); setNewRole('installer')
    setToast(`${newName.trim()} added`)
  }

  function exportData() {
    if (!exportSections.log && !exportSections.kpis && !exportSections.projects && !exportSections.totals) {
      setWarn({ title:'Nothing to export', body:'Enable at least one section to export.', ok:'OK' }); return
    }
    const now = new Date()
    const filterInst = Object.values(exportInstallerIds).some(Boolean)
    const allowed = new Set(Object.entries(exportInstallerIds).filter(([,v])=>v).map(([k])=>k))

    function inRange(ts: string | null): boolean {
      if (!ts) return false
      if (exportDateRange === 'all') return true
      const d = new Date(ts)
      if (exportDateRange === 'thismonth') return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()
      if (exportDateRange === 'lastmonth') { const lm=new Date(now.getFullYear(),now.getMonth()-1,1); return d.getFullYear()===lm.getFullYear()&&d.getMonth()===lm.getMonth() }
      if (exportDateRange === 'thisyear') return d.getFullYear()===now.getFullYear()
      if (exportDateRange === 'lastyear') return d.getFullYear()===now.getFullYear()-1
      if (exportDateRange === 'lastweek') {
        const dow = now.getDay()
        const startOfThisWeek = new Date(now); startOfThisWeek.setDate(now.getDate() - ((dow + 6) % 7)); startOfThisWeek.setHours(0,0,0,0)
        const startOfLastWeek = new Date(startOfThisWeek); startOfLastWeek.setDate(startOfThisWeek.getDate() - 7)
        return d >= startOfLastWeek && d < startOfThisWeek
      }
      if (exportDateRange === 'last30') return new Date(ts).getTime() >= now.getTime()-30*86400000
      if (exportDateRange === 'last90') return new Date(ts).getTime() >= now.getTime()-90*86400000
      return true
    }
    function passInst(id: string|null): boolean { return !filterInst || !!allowed.has(id??'') }
    function cell(v: unknown): string { const s=String(v??''); return s.includes(',')||s.includes('"')||s.includes('\n')?`"${s.replace(/"/g,'""')}"`:s }
    function row(arr: unknown[]): string { return arr.map(cell).join(',') }

    const lines: string[] = []
    const filteredLogs = logs.filter(r => passInst(r.installer_id) && inRange(r.start_ts))

    if (exportSections.log) {
      lines.push(row(['Date','Project','Panel','Type','CC','Installer','Height','Width','SQFT','Duration (min)','SQFT/HR','Start','Finish','Status']))
      for (const r of [...filteredLogs].sort((a,b)=>new Date(a.start_ts).getTime()-new Date(b.start_ts).getTime())) {
        lines.push(row([new Date(r.start_ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),r.project_name,r.panel_name,r.job_type,r.is_color_change?'Yes':'No',r.installer_name??'Unknown',r.height_in??'',r.width_in??'',r.sqft?.toFixed(2)??'',r.mins?.toFixed(1)??'',r.sqftHr?.toFixed(2)??'',new Date(r.start_ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}),new Date(r.finish_ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}),r.status]))
      }
      lines.push('')
    }

    if (exportSections.kpis) {
      const comLogs = filteredLogs.filter(r => !r.is_color_change && r.status==='Complete' && r.sqft && r.sqft>0 && r.mins && r.mins>0)
      lines.push(row(['=== INSTALLER KPIs (Commercial) ===']))
      lines.push(row(['Installer','Panels','Total SQFT','Total Hours','Avg SQFT/HR','Avg Min/Panel','Projects']))
      const m = new Map<string,{ name:string; panels:number; sqft:number; mins:number; rates:number[]; projects:Set<string> }>()
      for (const r of comLogs) {
        const name = r.installer_name ?? 'Unknown'
        const id = r.installer_id ?? name
        const cur = m.get(id) ?? { name, panels:0, sqft:0, mins:0, rates:[], projects:new Set() }
        cur.panels++; cur.sqft+=r.sqft??0; cur.mins+=r.mins??0
        if (r.sqftHr!=null) cur.rates.push(r.sqftHr)
        if (r.project_id) cur.projects.add(r.project_id)
        m.set(id, cur)
      }
      for (const v of Array.from(m.values()).sort((a,b)=>b.sqft-a.sqft)) {
        const avg = v.rates.length ? v.rates.reduce((a,b)=>a+b,0)/v.rates.length : null
        lines.push(row([v.name,v.panels,v.sqft.toFixed(1),(v.mins/60).toFixed(1),avg?.toFixed(2)??'--',v.panels>0?(v.mins/v.panels).toFixed(1):'--',v.projects.size]))
      }
      lines.push('')
    }

    if (exportSections.projects) {
      lines.push(row(['=== PROJECT SUMMARY ===']))
      lines.push(row(['Project','Type','Panels Done','Total Panels','SQFT','Total Hours','Status','Due Date']))
      const allProjIds = new Set(filteredLogs.map(r => r.project_id).filter(Boolean))
      for (const proj of projects.filter(p => allProjIds.has(p.id) || filteredLogs.some(r => r.project_id === p.id))) {
        const pLogs = filteredLogs.filter(r => r.project_id === proj.id && r.status === 'Complete')
        const pnls = proj.panels ?? []
        const donePanelIds = new Set(pLogs.filter(r => r.panel_id).map(r => r.panel_id!))
        const doneCount = pnls.filter(pnl => donePanelIds.has(pnl.id)).length
        const sqft = pLogs.reduce((s,r) => s+(r.sqft??0), 0)
        const mins = pLogs.reduce((s,r) => s+(r.mins??0), 0)
        const isComplete = pnls.length > 0 && doneCount >= pnls.length
        lines.push(row([proj.name, proj.project_type === 'colorchange' ? 'Color Change' : 'Commercial', doneCount, pnls.length, sqft.toFixed(1), (mins/60).toFixed(1), isComplete ? 'Complete' : 'In Progress', proj.due_date ?? '']))
      }
      lines.push('')
    }

    if (exportSections.totals) {
      const comLogs = filteredLogs.filter(r => !r.is_color_change && r.status==='Complete' && r.sqft && r.sqft>0 && r.mins && r.mins>0)
      const tSqft = comLogs.reduce((s,r)=>s+(r.sqft??0),0)
      const tMins = comLogs.reduce((s,r)=>s+(r.mins??0),0)
      const ccLogs = filteredLogs.filter(r => r.is_color_change && r.status==='Complete' && r.mins && r.mins>0)
      const ccMins = ccLogs.reduce((s,r)=>s+(r.mins??0),0)
      lines.push(row(['=== SHOP TOTALS ===']))
      lines.push(row(['Type','Total SQFT','Total Panels','Total Hours','Avg SQFT/HR']))
      lines.push(row(['Commercial',tSqft.toFixed(1),comLogs.length,(tMins/60).toFixed(1),tMins>0?(tSqft/(tMins/60)).toFixed(2):'--']))
      lines.push(row(['Color Change','--',ccLogs.length,(ccMins/60).toFixed(1),'--']))
    }

    const blob = new Blob([lines.join('\n')], { type:'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`wrapgfx_export_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url); setToast('Export downloaded')
  }

  return (
    <div>
      <WarnModal modal={warn} onClose={() => setWarn(null)} />
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}

      <div style={{ fontSize:11,fontWeight:600,color:B.textTer,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:12 }}>Installers</div>
      <div style={{ background:B.surface,borderRadius:16,overflow:'hidden',border:`1px solid ${B.border}`,marginBottom:20 }}>
        {installers.map((inst, i) => (
          <div key={inst.id} style={{ borderBottom: i<installers.length-1 ? `1px solid ${B.border}` : 'none' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px' }}>
              <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                <div style={{ position:'relative' }}>
                  <div onClick={() => !isGuest && (isAdmin||inst.id===me?.id) && setColorPickerId(colorPickerId===inst.id?null:inst.id)}
                    style={{ width:32,height:32,borderRadius:'50%',background:inst.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:800,color:B.bg,cursor:(!isGuest&&(isAdmin||inst.id===me?.id))?'pointer':'default' }}>
                    {inst.name.charAt(0)}
                  </div>
                  {colorPickerId===inst.id && (
                    <div style={{ position:'absolute',top:38,left:0,zIndex:100,display:'flex',flexWrap:'wrap',gap:7,padding:'10px 12px',background:B.surface,border:`1px solid ${B.border}`,borderRadius:14,boxShadow:'0 8px 24px rgba(0,0,0,0.5)',alignItems:'center',maxWidth:220 }}>
                      {SWATCH_COLORS.map(clr => (
                        <button key={clr} onClick={e => { e.stopPropagation(); saveColor(inst.id, clr) }}
                          style={{ width:inst.color===clr?26:20,height:inst.color===clr?26:20,borderRadius:'50%',background:clr,border:inst.color===clr?'2.5px solid #fff':'2px solid transparent',cursor:'pointer',flexShrink:0,transition:'all 0.12s',boxShadow:inst.color===clr?`0 0 0 2px ${clr}`:'none' }} />
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  {editingNameId===inst.id ? (
                    <div style={{ display:'flex',gap:6,alignItems:'center' }}>
                      <input value={editingNameVal} onChange={e => setEditingNameVal(e.target.value)} onKeyDown={e => { if(e.key==='Enter')saveInstName(inst.id); if(e.key==='Escape')setEditingNameId(null) }}
                        style={{ padding:'6px 10px',fontSize:14,borderRadius:8,background:B.surface2,color:B.text,border:'none',outline:'none',width:160 }} autoFocus />
                      <button onClick={() => saveInstName(inst.id)} style={{ background:B.yellow,color:B.bg,border:'none',borderRadius:8,padding:'6px 12px',fontWeight:800,fontSize:13,cursor:'pointer' }}>Save</button>
                      <button onClick={() => setEditingNameId(null)} style={{ background:'transparent',color:B.textTer,border:`1px solid ${B.border}`,borderRadius:8,padding:'6px 10px',fontSize:13,cursor:'pointer' }}>×</button>
                    </div>
                  ) : (
                    <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                      <div style={{ fontSize:15,fontWeight:600 }}>{inst.name}</div>
                      {(isAdmin||inst.id===me?.id) && <button onClick={() => { setEditingNameId(inst.id); setEditingNameVal(inst.name) }} style={{ background:'none',border:'none',color:B.textTer,fontSize:12,cursor:'pointer',padding:0 }}>✎</button>}
                    </div>
                  )}
                  {isGuest ? (
                    <span style={{ fontSize:11, color:B.textTer }}>{`Birthday: ${inst.birthday||'not set'}`}</span>
                  ) : (
                    <button onClick={() => { setEditingBdayId(editingBdayId===inst.id?null:inst.id); setEditingBdayVal(inst.birthday??'') }}
                      style={{ background:'none',border:'none',padding:0,fontSize:11,color:editingBdayId===inst.id?B.yellow:B.textTer,textAlign:'left',cursor:'pointer' }}>
                      {editingBdayId===inst.id ? 'Editing birthday…' : `Birthday: ${inst.birthday||'not set'} ✎`}
                    </button>
                  )}
                </div>
              </div>
              {isAdmin && inst.id !== me?.id && (
                <button onClick={() => handleDeactivate(inst)} style={{ background:'none',border:'none',color:B.red,fontSize:13,fontWeight:600,cursor:'pointer' }}>Remove</button>
              )}
            </div>
            {editingBdayId===inst.id && (
              <div style={{ padding:'0 18px 14px',display:'flex',gap:8 }}>
                <input placeholder="MM/DD (e.g. 03/15)" value={editingBdayVal} onChange={e => setEditingBdayVal(e.target.value)} onKeyDown={e => { if(e.key==='Enter')saveBday(inst.id); if(e.key==='Escape')setEditingBdayId(null) }}
                  style={{ flex:1,padding:'9px 12px',fontSize:13,borderRadius:10,background:B.surface2,color:B.text,border:'none',outline:'none' }} autoFocus />
                <button onClick={() => saveBday(inst.id)} style={{ background:B.yellow,color:B.bg,border:'none',borderRadius:10,padding:'9px 14px',fontWeight:800,fontSize:13,whiteSpace:'nowrap',cursor:'pointer' }}>Save</button>
                <button onClick={() => setEditingBdayId(null)} style={{ background:'transparent',color:B.textTer,border:`1px solid ${B.border}`,borderRadius:10,padding:'9px 12px',fontSize:13,cursor:'pointer' }}>×</button>
              </div>
            )}
          </div>
        ))}

        {isAdmin && (
          <div style={{ padding:'14px 18px',borderTop:`1px solid ${B.border}` }}>
            <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:10 }}>Add new installer</div>
            <form onSubmit={handleCreateInstaller}>
              <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                <input placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)}
                  style={{ padding:'10px 12px',fontSize:14,borderRadius:10,background:B.surface2,color:B.text,border:'none',outline:'none' }} />
                <input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  style={{ padding:'10px 12px',fontSize:14,borderRadius:10,background:B.surface2,color:B.text,border:'none',outline:'none' }} />
                <input type="password" placeholder="Password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  style={{ padding:'10px 12px',fontSize:14,borderRadius:10,background:B.surface2,color:B.text,border:'none',outline:'none' }} />
                <input placeholder="Birthday MM/DD (optional)" value={newBirthday} onChange={e => setNewBirthday(e.target.value)}
                  style={{ padding:'10px 12px',fontSize:14,borderRadius:10,background:B.surface2,color:B.text,border:'none',outline:'none' }} />
                <div>
                  <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:6 }}>Color</div>
                  <div style={{ display:'flex',gap:7,flexWrap:'wrap' }}>
                    {SWATCH_COLORS.map(clr => (
                      <button type="button" key={clr} onClick={() => setNewColor(clr)}
                        style={{ width:newColor===clr?26:20,height:newColor===clr?26:20,borderRadius:'50%',background:clr,border:newColor===clr?'2.5px solid #fff':'2px solid transparent',cursor:'pointer',flexShrink:0,transition:'all 0.12s',boxShadow:newColor===clr?`0 0 0 2px ${clr}`:'none' }} />
                    ))}
                  </div>
                </div>
                <div style={{ display:'flex',gap:3,background:B.surface3,borderRadius:10,padding:3 }}>
                  <button type="button" onClick={() => setNewRole('installer')} style={{ flex:1,padding:'8px',border:'none',borderRadius:8,background:newRole==='installer'?B.yellow:'transparent',color:newRole==='installer'?B.bg:B.textSec,fontWeight:newRole==='installer'?700:400,fontSize:13,cursor:'pointer' }}>Installer</button>
                  <button type="button" onClick={() => setNewRole('admin')} style={{ flex:1,padding:'8px',border:'none',borderRadius:8,background:newRole==='admin'?B.orange:'transparent',color:newRole==='admin'?B.bg:B.textSec,fontWeight:newRole==='admin'?700:400,fontSize:13,cursor:'pointer' }}>Admin</button>
                </div>
                {createError && <div style={{ fontSize:13,color:B.red,padding:'8px 12px',background:B.red+'15',borderRadius:8 }}>{createError}</div>}
                <button type="submit" disabled={creating||!newName.trim()||!newEmail.trim()||!newPassword}
                  style={{ background:creating||!newName.trim()||!newEmail.trim()||!newPassword?B.surface3:B.yellow,color:creating||!newName.trim()||!newEmail.trim()||!newPassword?B.textTer:B.bg,border:'none',borderRadius:10,padding:11,fontWeight:800,fontSize:14,cursor:'pointer' }}>
                  {creating ? 'Creating…' : 'Add Installer'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {isAdmin && (
        <div style={{ background:B.surface,borderRadius:16,overflow:'hidden',border:`1px solid ${B.border}`,marginBottom:20 }}>
          <div style={{ padding:'14px 18px',borderBottom:`1px solid ${B.border}` }}>
            <div style={{ fontSize:11,fontWeight:600,color:B.textTer,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:2 }}>Managers</div>
            <div style={{ fontSize:12,color:B.textTer }}>Admin access without installer tracking</div>
          </div>
          {managers.length === 0 && (
            <div style={{ padding:'12px 18px', fontSize:13,color:B.textTer }}>No managers yet.</div>
          )}
          {managers.map((mgr, i) => (
            <div key={mgr.id} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 18px',borderBottom:i<managers.length-1?`1px solid ${B.border}`:'none' }}>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <div style={{ width:32,height:32,borderRadius:'50%',background:B.surface3,border:`1px solid ${B.yellow}44`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:B.yellow }}>
                  {mgr.name.charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize:14,fontWeight:600 }}>{mgr.name}</div>
                  <div style={{ fontSize:11,color:B.yellow,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em' }}>Manager</div>
                </div>
              </div>
              <button onClick={() => handleRemoveManager(mgr)} style={{ background:'none',border:'none',color:B.red,fontSize:13,fontWeight:600,cursor:'pointer' }}>Remove</button>
            </div>
          ))}
          <div style={{ padding:'14px 18px',borderTop:managers.length>0?`1px solid ${B.border}`:'none' }}>
            <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:10 }}>Add manager</div>
            <form onSubmit={handleCreateManager}>
              <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                <input placeholder="Full name" value={newMgrName} onChange={e => setNewMgrName(e.target.value)}
                  style={{ padding:'10px 12px',fontSize:14,borderRadius:10,background:B.surface2,color:B.text,border:'none',outline:'none' }} />
                <input type="email" placeholder="Email" value={newMgrEmail} onChange={e => setNewMgrEmail(e.target.value)}
                  style={{ padding:'10px 12px',fontSize:14,borderRadius:10,background:B.surface2,color:B.text,border:'none',outline:'none' }} />
                <input type="password" placeholder="Password" value={newMgrPassword} onChange={e => setNewMgrPassword(e.target.value)}
                  style={{ padding:'10px 12px',fontSize:14,borderRadius:10,background:B.surface2,color:B.text,border:'none',outline:'none' }} />
                {mgrError && <div style={{ fontSize:13,color:B.red,padding:'8px 12px',background:B.red+'15',borderRadius:8 }}>{mgrError}</div>}
                <button type="submit" disabled={creatingMgr||!newMgrName.trim()||!newMgrEmail.trim()||!newMgrPassword}
                  style={{ background:creatingMgr||!newMgrName.trim()||!newMgrEmail.trim()||!newMgrPassword?B.surface3:B.yellow,color:creatingMgr||!newMgrName.trim()||!newMgrEmail.trim()||!newMgrPassword?B.textTer:B.bg,border:'none',borderRadius:10,padding:11,fontWeight:800,fontSize:14,cursor:'pointer' }}>
                  {creatingMgr ? 'Creating…' : 'Add Manager'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAdmin && (
        <div style={{ background:B.surface,borderRadius:16,padding:16,border:`1px solid ${B.border}`,marginBottom:16 }}>
          <div style={{ fontSize:13,fontWeight:700,marginBottom:14 }}>Export data</div>

          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:8 }}>Date range</div>
            <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
              {[{ v:'all',l:'All time' },{ v:'lastweek',l:'Last week' },{ v:'thismonth',l:'This month' },{ v:'lastmonth',l:'Last month' },{ v:'last30',l:'Last 30 days' },{ v:'last90',l:'Last 90 days' },{ v:'thisyear',l:'This year' },{ v:'lastyear',l:'Last year' }].map(opt => (
                <button key={opt.v} onClick={() => setExportDateRange(opt.v)}
                  style={{ padding:'7px 13px',borderRadius:20,border:`1.5px solid ${exportDateRange===opt.v?B.yellow:B.border}`,background:exportDateRange===opt.v?B.yellow+'18':'transparent',color:exportDateRange===opt.v?B.yellow:B.textSec,fontWeight:exportDateRange===opt.v?700:400,fontSize:13,cursor:'pointer' }}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:8 }}>Installers</div>
            <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
              <button onClick={() => setExportInstallerIds({})}
                style={{ padding:'7px 13px',borderRadius:20,border:`1.5px solid ${!Object.values(exportInstallerIds).some(Boolean)?B.yellow:B.border}`,background:!Object.values(exportInstallerIds).some(Boolean)?B.yellow+'18':'transparent',color:!Object.values(exportInstallerIds).some(Boolean)?B.yellow:B.textSec,fontWeight:!Object.values(exportInstallerIds).some(Boolean)?700:400,fontSize:13,cursor:'pointer' }}>All</button>
              {installers.map(inst => {
                const sel = !!exportInstallerIds[inst.id]
                return (
                  <button key={inst.id} onClick={() => setExportInstallerIds(prev => { const u={...prev}; if(u[inst.id]) delete u[inst.id]; else u[inst.id]=true; return u })}
                    style={{ padding:'7px 13px',borderRadius:20,border:`1.5px solid ${sel?inst.color:B.border}`,background:sel?inst.color+'18':'transparent',color:sel?inst.color:B.textSec,fontWeight:sel?700:400,fontSize:13,cursor:'pointer' }}>
                    {inst.name.split(' ')[0]}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:8 }}>Include sections</div>
            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              {([{ k:'log' as const,l:'Log entries' },{ k:'kpis' as const,l:'Installer KPIs' },{ k:'projects' as const,l:'Project summary' },{ k:'totals' as const,l:'Shop totals' }]).map(sec => {
                const on = exportSections[sec.k]
                return (
                  <div key={sec.k} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:B.surface2,borderRadius:10 }}>
                    <span style={{ fontSize:13,color:on?B.text:B.textTer,fontWeight:on?600:400 }}>{sec.l}</span>
                    <button onClick={() => setExportSections(prev => ({ ...prev,[sec.k]:!prev[sec.k] }))}
                      style={{ width:38,height:22,borderRadius:11,border:'none',background:on?B.green:B.surface3,position:'relative',transition:'background 0.2s',flexShrink:0,cursor:'pointer' }}>
                      <span style={{ position:'absolute',top:3,left:on?18:3,width:16,height:16,borderRadius:'50%',background:B.text,transition:'left 0.2s',display:'block' }} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <button onClick={exportData} style={{ background:B.yellow,color:B.bg,border:'none',borderRadius:12,padding:'12px 20px',fontWeight:800,fontSize:14,width:'100%',cursor:'pointer' }}>Export to CSV</button>
        </div>
      )}

      {isAdmin && (
        <div style={{ background:B.surface,borderRadius:16,padding:16,border:`1px solid ${B.border}`,marginBottom:16 }}>
          <div style={{ fontSize:13,fontWeight:700,marginBottom:12 }}>Reward Products</div>
          <div style={{ fontSize:11,color:B.textSec,marginBottom:12,lineHeight:1.5 }}>
            Link real products to bounties — installers can tap "Check it out" to see what they're competing for.
          </div>

          {rewardProducts.length > 0 && (
            <div style={{ display:'flex',flexDirection:'column',gap:8,marginBottom:14 }}>
              {rewardProducts.map(p => (
                <div key={p.id} style={{ display:'flex',alignItems:'center',gap:10,background:B.surface2,borderRadius:10,padding:'10px 12px' }}>
                  {p.image_url ? (
                    <img src={p.image_url} style={{ width:36,height:36,borderRadius:8,objectFit:'cover',flexShrink:0 }} />
                  ) : (
                    <div style={{ width:36,height:36,borderRadius:8,background:B.surface3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0 }}>🔧</div>
                  )}
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:13,fontWeight:600,color:B.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.name}</div>
                    {p.buy_url && (
                      <a href={p.buy_url} target="_blank" rel="noopener noreferrer" style={{ fontSize:11,color:B.yellow,textDecoration:'none' }}>{p.buy_url.replace(/^https?:\/\//, '').split('/')[0]}</a>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      await supabase.from('reward_products').delete().eq('id', p.id)
                      setRewardProducts(prev => prev.filter(x => x.id !== p.id))
                    }}
                    style={{ fontSize:11,color:B.red,background:'none',border:`1px solid ${B.red}44`,borderRadius:7,padding:'4px 9px',cursor:'pointer',flexShrink:0 }}
                  >Remove</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display:'flex',flexDirection:'column',gap:7 }}>
            <input
              placeholder="Product name (e.g. Knifeless Tape Pro)"
              value={newProdName}
              onChange={e => setNewProdName(e.target.value)}
              style={{ padding:'9px 12px',fontSize:13,borderRadius:9,background:B.surface2,color:B.text,border:'none',outline:'none' }}
            />
            <input
              placeholder="Image URL (optional)"
              value={newProdImageUrl}
              onChange={e => setNewProdImageUrl(e.target.value)}
              style={{ padding:'9px 12px',fontSize:13,borderRadius:9,background:B.surface2,color:B.text,border:'none',outline:'none' }}
            />
            <input
              placeholder="Buy / product page URL (optional)"
              value={newProdBuyUrl}
              onChange={e => setNewProdBuyUrl(e.target.value)}
              style={{ padding:'9px 12px',fontSize:13,borderRadius:9,background:B.surface2,color:B.text,border:'none',outline:'none' }}
            />
            <button
              disabled={!newProdName.trim() || creatingProd}
              onClick={async () => {
                if (!newProdName.trim()) return
                setCreatingProd(true)
                const { data } = await supabase.from('reward_products')
                  .insert({ name: newProdName.trim(), image_url: newProdImageUrl.trim() || null, buy_url: newProdBuyUrl.trim() || null })
                  .select().single()
                setCreatingProd(false)
                if (data) {
                  setRewardProducts(prev => [...prev, data as RewardProduct])
                  setNewProdName(''); setNewProdImageUrl(''); setNewProdBuyUrl('')
                  setToast(`${(data as RewardProduct).name} added`)
                }
              }}
              style={{ background:newProdName.trim()?B.yellow:'transparent',color:newProdName.trim()?B.bg:B.textTer,border:`1px solid ${newProdName.trim()?B.yellow:B.border}`,borderRadius:9,padding:'9px 14px',fontSize:13,fontWeight:700,cursor:newProdName.trim()?'pointer':'default' }}
            >
              {creatingProd ? 'Adding…' : '+ Add Product'}
            </button>
          </div>
        </div>
      )}

      {!isAdmin && hiddenTabs && toggleTab && (
        <div style={{ background:B.surface,borderRadius:16,padding:16,border:`1px solid ${B.border}`,marginBottom:16 }}>
          <div style={{ fontSize:13,fontWeight:700,marginBottom:4 }}>Tab visibility</div>
          <div style={{ fontSize:12,color:B.textTer,marginBottom:12 }}>Choose which tabs appear in your navigation.</div>
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {TOGGLEABLE_TABS.map(t => {
              const visible = !hiddenTabs.has(t)
              return (
                <div key={t} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:B.surface2,borderRadius:10 }}>
                  <span style={{ fontSize:13,color:visible?B.text:B.textTer,fontWeight:visible?600:400 }}>{t}</span>
                  <button onClick={() => toggleTab(t)}
                    style={{ width:38,height:22,borderRadius:11,border:'none',background:visible?B.green:B.surface3,position:'relative',transition:'background 0.2s',flexShrink:0,cursor:'pointer' }}>
                    <span style={{ position:'absolute',top:3,left:visible?18:3,width:16,height:16,borderRadius:'50%',background:B.text,transition:'left 0.2s',display:'block' }} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ background:B.surface,borderRadius:16,padding:16,border:`1px solid ${B.border}`,marginBottom:16 }}>
        <div style={{ fontSize:13,fontWeight:700,marginBottom:10 }}>Data rules</div>
        <div style={{ fontSize:13,color:B.textSec,lineHeight:1.8 }}>
          Only <span style={{ color:B.text,fontWeight:600 }}>Complete</span> rows with valid dimensions and positive duration count toward stats.<br />
          <span style={{ color:CC,fontWeight:600 }}>Color Change</span> is excluded from the commercial leaderboard.<br />
          Removing an installer preserves their history as "Former Installer."<br />
          Project type changes reclassify all existing log entries.
        </div>
      </div>


      <button onClick={() => setWarn({ title:'Sign out?', body:'You will be returned to the login screen.', ok:'Sign out', cancel:'Cancel', onOk:onSignOut })}
        style={{ width:'100%',background:'transparent',color:B.red,border:`1px solid ${B.red}44`,borderRadius:14,padding:14,fontSize:14,fontWeight:600,cursor:'pointer' }}>
        Sign Out
      </button>
    </div>
  )
}
