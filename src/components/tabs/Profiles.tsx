import { useMemo, useState } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { MiniConfetti } from '../ui/Confetti'
import { B, CC, isBirthday, fmtDate, fmtTime } from '../../lib/utils'
import type { Log } from '../../lib/types'

export default function Profiles() {
  const { installers, logs } = useAppData()
  const [profileId, setProfileId] = useState<string | null>(null)
  const [expandedProjects, setExpandedProjects] = useState<Record<string,boolean>>({})

  const installer = profileId ? installers.find(i => i.id === profileId) ?? null : null

  const completeLogs = useMemo(() =>
    logs.filter(r => r.status === 'Complete' && r.sqft && r.sqft > 0 && r.mins && r.mins > 0),
    [logs]
  )

  const boardSummary = useMemo(() => {
    const m = new Map<string, { sqft:number; panels:number; mins:number; rates:number[] }>()
    for (const inst of installers) m.set(inst.id, { sqft:0, panels:0, mins:0, rates:[] })
    for (const r of completeLogs.filter(l => !l.is_color_change)) {
      if (!r.installer_id) continue
      const row = m.get(r.installer_id)
      if (!row) continue
      row.sqft += r.sqft??0; row.mins += r.mins??0; row.panels++
      if (r.sqftHr != null) row.rates.push(r.sqftHr)
    }
    return m
  }, [completeLogs, installers])

  const topInstallerId = (() => {
    let topId = '', topSqft = -1
    boardSummary.forEach((v,id) => { if (v.sqft > topSqft) { topSqft = v.sqft; topId = id } })
    return topId
  })()

  const myComLogs   = useMemo(() =>
    installer ? completeLogs.filter(r => r.installer_id === installer.id && !r.is_color_change) : [],
    [completeLogs, installer])
  const myCCLogs    = useMemo(() =>
    installer ? completeLogs.filter(r => r.installer_id === installer.id && r.is_color_change) : [],
    [completeLogs, installer])

  if (!installer) {
    return (
      <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
        {installers.map((inst, i) => {
          const stats = boardSummary.get(inst.id) ?? { sqft:0, panels:0, mins:0, rates:[] }
          const avgSqftHr = stats.rates.length ? stats.rates.reduce((a,b)=>a+b,0)/stats.rates.length : null
          const isBday = isBirthday(inst.birthday)
          return (
            <button key={inst.id} onClick={() => setProfileId(inst.id)}
              style={{ background:B.surface,borderRadius:16,padding:'16px 18px',border:`1.5px solid ${isBday ? B.yellow+'88' : i===0 ? inst.color+'44' : B.border}`,display:'flex',alignItems:'center',gap:14,cursor:'pointer',textAlign:'left',position:'relative',overflow:'hidden',width:'100%',color:B.text }}>
              {isBday && <MiniConfetti />}
              <div style={{ position:'relative',zIndex:1,display:'flex',alignItems:'center',gap:14,width:'100%' }}>
                <div style={{ width:46,height:46,borderRadius:'50%',background:inst.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:B.bg,flexShrink:0 }}>{inst.name.charAt(0)}</div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:16,fontWeight:700 }}>{inst.name}{isBday ? ' 🎂' : ''}</div>
                  <div style={{ display:'flex',gap:12,marginTop:4 }}>
                    <span style={{ fontSize:12,color:B.textTer }}>{stats.sqft.toFixed(1)} sqft</span>
                    <span style={{ fontSize:12,color:B.textTer }}>{stats.panels} panels</span>
                    {avgSqftHr && <span style={{ fontSize:12,color: avgSqftHr>20 ? B.green : B.textTer }}>{avgSqftHr.toFixed(1)}/hr</span>}
                  </div>
                </div>
                <div style={{ fontSize:12,color:B.textTer,flexShrink:0 }}>View →</div>
              </div>
            </button>
          )
        })}
        {!installers.length && <div style={{ padding:32,textAlign:'center',color:B.textTer,fontSize:13 }}>No installers yet.</div>}
      </div>
    )
  }

  const isBday = isBirthday(installer.birthday)
  const isTop = installer.id === topInstallerId

  const comSqft  = myComLogs.reduce((s,r)=>s+(r.sqft??0),0)
  const comMins  = myComLogs.reduce((s,r)=>s+(r.mins??0),0)
  const comRates = myComLogs.map(r=>r.sqftHr).filter((v): v is number => v != null)
  const comAvg   = comRates.length ? comRates.reduce((a,b)=>a+b,0)/comRates.length : null
  const mpp      = myComLogs.length > 0 ? comMins/myComLogs.length : null

  const ccSqft = myCCLogs.reduce((s,r)=>s+(r.sqft??0),0)
  const ccMins = myCCLogs.reduce((s,r)=>s+(r.mins??0),0)
  const ccAvg  = ccMins > 0 ? ccSqft/(ccMins/60) : null

  const typeCount: Record<string,number> = {}
  for (const r of myComLogs) typeCount[r.job_type] = (typeCount[r.job_type]??0) + 1
  const favType = Object.keys(typeCount).sort((a,b) => typeCount[b]-typeCount[a])[0] ?? '--'

  const longestPanel = myComLogs.reduce<Log|null>((mx,r) => !mx || (r.mins??0)>(mx.mins??0) ? r : mx, null)
  const fastestPanel = myComLogs.filter(r=>r.sqftHr!=null).reduce<Log|null>((mx,r) => !mx || (r.sqftHr??0)>(mx.sqftHr??0) ? r : mx, null)

  const facts = [
    `Favorite type: ${favType}`,
    `Avg panel: ${myComLogs.length>0?(comSqft/myComLogs.length).toFixed(1):'--'} sqft`,
    `Avg time/panel: ${fmtTime(mpp)}`,
    `Projects: ${new Set(myComLogs.map(r=>r.project_id).filter(Boolean)).size}`,
    ...(longestPanel ? [`Longest: ${fmtTime(longestPanel.mins)} — ${longestPanel.panel_name} (${longestPanel.project_name})`] : []),
    ...(fastestPanel?.sqftHr ? [`Quickest: ${fastestPanel.sqftHr.toFixed(1)} sqft/hr — ${fastestPanel.panel_name}`] : []),
    ...(comAvg && comAvg > 20 ? [`Above 20 sqft/hr — above shop avg.`] : []),
    `Total hours: ${(comMins/60).toFixed(1)}h`,
  ]

  // Group projects by year+month
  const byProject = useMemo(() => {
    const m = new Map<string, { projName:string; projId:string|null; sqft:number; mins:number; panels:Log[] }>()
    for (const r of [...myComLogs,...myCCLogs].sort((a,b)=>new Date(b.start_ts).getTime()-new Date(a.start_ts).getTime())) {
      const key = r.project_id ?? r.project_name
      const cur = m.get(key) ?? { projName:r.project_name, projId:r.project_id, sqft:0, mins:0, panels:[] }
      cur.sqft += r.sqft??0; cur.mins += r.mins??0; cur.panels.push(r)
      m.set(key, cur)
    }
    return Array.from(m.values()).sort((a,b) => {
      const aLast = a.panels.reduce((mx,r)=>Math.max(mx,new Date(r.start_ts).getTime()),0)
      const bLast = b.panels.reduce((mx,r)=>Math.max(mx,new Date(r.start_ts).getTime()),0)
      return bLast-aLast
    })
  }, [myComLogs, myCCLogs])

  const groups = useMemo(() => {
    const m = new Map<string, { year:number; month:string; lastTs:number; projects:typeof byProject }>()
    for (const p of byProject) {
      const lastTs = p.panels.reduce((mx,r)=>Math.max(mx,new Date(r.start_ts).getTime()),0)
      const d = lastTs ? new Date(lastTs) : new Date()
      const year = d.getFullYear()
      const month = d.toLocaleString('en-US', { month:'long' })
      const key = `${year}||${month}`
      const cur = m.get(key) ?? { year, month, lastTs, projects:[] }
      cur.projects.push(p)
      m.set(key, cur)
    }
    return Array.from(m.values()).sort((a,b)=>b.lastTs-a.lastTs)
  }, [byProject])

  return (
    <div>
      <button onClick={() => setProfileId(null)} style={{ background:'none',border:'none',color:B.textSec,fontSize:13,padding:'0 0 16px 0',display:'flex',alignItems:'center',gap:6,cursor:'pointer' }}>← All installers</button>

      <div style={{ background:B.surface,borderRadius:18,padding:20,marginBottom:14,border:`1.5px solid ${isBday ? B.yellow+'88' : installer.color+'44'}`,position:'relative',overflow:'hidden' }}>
        {isBday && <MiniConfetti />}
        <div style={{ position:'relative',zIndex:1 }}>
          <div style={{ display:'flex',alignItems:'center',gap:14,marginBottom:16 }}>
            <div style={{ width:56,height:56,borderRadius:'50%',background:installer.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,fontWeight:800,color:B.bg,flexShrink:0 }}>{installer.name.charAt(0)}</div>
            <div>
              <div style={{ fontSize:20,fontWeight:800 }}>{installer.name}{isBday ? ' 🎂' : ''}</div>
              <div style={{ fontSize:12,color:B.textTer,marginTop:2 }}>
                {installer.birthday ? `Birthday: ${installer.birthday}` : 'No birthday set'}
                {isTop && <span style={{ marginLeft:8,color:B.yellow,fontWeight:700 }}>· Top performer</span>}
              </div>
            </div>
          </div>

          <div style={{ marginBottom:8,fontSize:11,color:B.textTer,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em' }}>Commercial</div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16 }}>
            {[{ l:'Total SQFT',v:comSqft.toFixed(1),c:installer.color },{ l:'Panels',v:myComLogs.length,c:null },{ l:'SQFT/HR',v:comAvg?.toFixed(1)??'--',c:null }].map(m => (
              <div key={m.l} style={{ background:B.surface2,borderRadius:10,padding:10,textAlign:'center' }}>
                <div style={{ fontSize:10,color:B.textTer,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4 }}>{m.l}</div>
                <div style={{ fontSize:15,fontWeight:800,color:m.c??B.text }}>{m.v}</div>
              </div>
            ))}
          </div>

          {myCCLogs.length > 0 && (
            <>
              <div style={{ marginBottom:8,fontSize:11,color:CC,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em' }}>Color Change</div>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16 }}>
                {[{ l:'Total SQFT',v:ccSqft.toFixed(1),c:CC },{ l:'Panels',v:myCCLogs.length,c:null },{ l:'SQFT/HR',v:ccAvg?.toFixed(1)??'--',c:null }].map(m => (
                  <div key={m.l} style={{ background:B.surface2,borderRadius:10,padding:10,textAlign:'center',border:`1px solid ${CC}22` }}>
                    <div style={{ fontSize:10,color:B.textTer,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4 }}>{m.l}</div>
                    <div style={{ fontSize:15,fontWeight:800,color:m.c??B.text }}>{m.v}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ fontSize:11,color:B.textTer,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10 }}>Insights</div>
          {facts.map((f,fi) => (
            <div key={fi} style={{ display:'flex',gap:10,marginBottom:fi<facts.length-1?8:0,paddingBottom:fi<facts.length-1?8:0,borderBottom:fi<facts.length-1?`1px solid ${B.border}`:'none' }}>
              <span style={{ color:installer.color,fontSize:13,flexShrink:0 }}>*</span>
              <span style={{ fontSize:13,color:B.textSec,lineHeight:1.5 }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {groups.length > 0 && (
        <div>
          <div style={{ fontSize:11,fontWeight:600,color:B.textTer,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:12 }}>Projects</div>
          <div style={{ display:'flex',flexDirection:'column',gap:20,marginBottom:20 }}>
            {groups.map(group => (
              <div key={`${group.year}${group.month}`}>
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:B.textTer,textTransform:'uppercase',letterSpacing:'0.1em' }}>{group.year}</div>
                  <div style={{ fontSize:20,fontWeight:800,color:B.text,lineHeight:1.1 }}>{group.month}</div>
                </div>
                <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                  {group.projects.map(p2 => {
                    const key = p2.projId ?? p2.projName
                    const isExp = !!expandedProjects[key]
                    return (
                      <div key={key} style={{ background:B.surface,borderRadius:14,overflow:'hidden',border:`1px solid ${B.border}` }}>
                        <button onClick={() => setExpandedProjects(prev => ({ ...prev,[key]:!prev[key] }))}
                          style={{ width:'100%',background:'none',border:'none',padding:'14px 16px',textAlign:'left',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',color:B.text }}>
                          <div>
                            <div style={{ fontSize:15,fontWeight:700 }}>{p2.projName}</div>
                            <div style={{ fontSize:12,color:B.textTer,marginTop:2 }}>{p2.panels.length} panel{p2.panels.length!==1?'s':''} · {p2.sqft.toFixed(1)} sqft · {fmtTime(p2.mins)}</div>
                          </div>
                          <span style={{ fontSize:13,color:B.textTer,marginLeft:8 }}>{isExp ? '▲' : '▼'}</span>
                        </button>
                        {isExp && (
                          <div style={{ borderTop:`1px solid ${B.border}`,display:'flex',flexDirection:'column',gap:1 }}>
                            {p2.panels.map(log => (
                              <div key={log.id} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 16px',background:B.surface2+'80' }}>
                                <div>
                                  <div style={{ fontSize:13,fontWeight:600 }}>{log.panel_name}</div>
                                  <div style={{ fontSize:11,color:B.textTer,marginTop:1 }}>{fmtDate(log.start_ts)} · {log.job_type}</div>
                                </div>
                                <div style={{ textAlign:'right' }}>
                                  <div style={{ fontSize:13,fontWeight:700,color:B.yellow }}>{(log.sqft?.toFixed(1)??'--')} sqft</div>
                                  <div style={{ fontSize:11,color:B.textTer }}>{fmtTime(log.mins)}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
