import { useMemo, useState } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { useAuth } from '../../context/AuthContext'
import { MiniConfetti } from '../ui/Confetti'
import { Redacted } from '../ui/Redacted'
import { B, CC, fmtTime } from '../../lib/utils'
import type { Log, Installer } from '../../lib/types'

interface BoardRow {
  installer: Installer
  panels: number
  sqft: number
  mins: number
  avgSqftHr: number | null
  mpp: number | null
  pct: number
  projectCount: number
  favType: string
}

function buildBoard(logs: Log[], installers: Installer[]): BoardRow[] {
  const m = new Map<string, { inst: Installer; panels: number; sqft: number; mins: number; rates: number[]; types: Record<string,number>; projects: Set<string> }>()
  for (const inst of installers) {
    m.set(inst.id, { inst, panels:0, sqft:0, mins:0, rates:[], types:{}, projects: new Set() })
  }
  for (const r of logs) {
    if (!r.installer_id) continue
    const row = m.get(r.installer_id)
    if (!row) continue
    row.panels++
    row.sqft += r.sqft ?? 0
    row.mins += r.mins ?? 0
    if (r.sqftHr != null) row.rates.push(r.sqftHr)
    row.types[r.job_type] = (row.types[r.job_type] ?? 0) + 1
    if (r.project_id) row.projects.add(r.project_id)
  }
  const totalSqft = Array.from(m.values()).reduce((s, v) => s + v.sqft, 0) || 1
  return Array.from(m.values())
    .filter(v => v.panels > 0)
    .map(v => {
      const avg = v.rates.length ? v.rates.reduce((a,b) => a+b,0) / v.rates.length : null
      const typeKeys = Object.keys(v.types).sort((a,b) => v.types[b] - v.types[a])
      return {
        installer: v.inst,
        panels: v.panels,
        sqft: v.sqft,
        mins: v.mins,
        avgSqftHr: avg,
        mpp: v.panels > 0 ? v.mins / v.panels : null,
        pct: v.sqft / totalSqft * 100,
        projectCount: v.projects.size,
        favType: typeKeys[0] ?? '--',
      }
    })
    .sort((a,b) => b.sqft - a.sqft)
}

export default function Leaderboard() {
  const { logs, installers } = useAppData()
  const [ccExpanded, setCcExpanded] = useState(false)

  const commercial = useMemo(() => logs.filter(r => r.status === 'Complete' && !r.is_color_change && r.sqft && r.sqft > 0 && r.mins && r.mins > 0), [logs])
  const ccLogs     = useMemo(() => logs.filter(r => r.status === 'Complete' && r.is_color_change && r.sqft && r.sqft > 0 && r.mins && r.mins > 0), [logs])

  const board   = useMemo(() => buildBoard(commercial, installers), [commercial, installers])
  const ccBoard = useMemo(() => buildBoard(ccLogs, installers), [ccLogs, installers])

  const totalSqft = commercial.reduce((s,r) => s + (r.sqft??0), 0)
  const totalMins = commercial.reduce((s,r) => s + (r.mins??0), 0)
  const shopRate  = totalMins > 0 ? totalSqft / (totalMins/60) : 0

  const bySpeed   = board.filter(r => r.avgSqftHr != null).sort((a,b) => (b.avgSqftHr??0) - (a.avgSqftHr??0))
  const byPanels  = [...board].sort((a,b) => b.panels - a.panels)
  const byProj    = [...board].sort((a,b) => b.projectCount - a.projectCount)
  const byHours   = [...board].sort((a,b) => b.mins - a.mins)

  const { isGuest } = useAuth()

  const medals = ['#F5C400','#B0B8C1','#CD7F32']
  const mLabel = ['1ST','2ND','3RD']

  const funFacts: string[] = []
  if (board[0]) funFacts.push(`${board[0].installer.name.split(' ')[0]} has wrapped ${board[0].sqft.toFixed(0)} sqft — ${(board[0].sqft/9).toFixed(0)} parking spaces.`)
  if (board[0]?.avgSqftHr) funFacts.push(`At avg pace, ${board[0].installer.name.split(' ')[0]} wraps a 747 in ~${Math.round(4800/board[0].avgSqftHr)} hrs.`)
  if (totalSqft > 0) funFacts.push(`Shop total: ${totalSqft.toFixed(0)} sqft — ${(totalSqft/2700).toFixed(3)} basketball courts.`)
  if (bySpeed[0]) funFacts.push(`Fastest: ${bySpeed[0].installer.name.split(' ')[0]} at ${bySpeed[0].avgSqftHr!.toFixed(1)} sqft/hr.`)

  const podium = board.length >= 2 ? [board[1], board[0], board[2]].map((r,idx) => ({ r, ri: idx===0?1:idx===1?0:2 })) : []

  return (
    <div>
      <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:16 }}>
        <div style={{ fontSize:13,fontWeight:700,color:B.yellow }}>Commercial Wraps</div>
        <div style={{ flex:1,height:1,background:B.border }} />
      </div>

      {podium.length > 0 && (
        <div style={{ display:'flex',gap:8,marginBottom:20,alignItems:'flex-end' }}>
          {podium.map(({ r, ri }) => {
            if (!r) return <div key={ri} style={{ flex:1 }} />
            const isFirst = ri === 0
            return (
              <div key={r.installer.id} style={{ flex:1,background:B.surface,borderRadius:16,padding: isFirst?'22px 12px':'16px 12px',border:`1.5px solid ${medals[ri]}${isFirst?'66':'44'}`,textAlign:'center',position:'relative',overflow:'hidden' }}>
                {isFirst && <MiniConfetti />}
                <div style={{ position:'relative',zIndex:1 }}>
                  <div style={{ fontSize:11,fontWeight:800,color:medals[ri],letterSpacing:'0.1em',marginBottom:8 }}>{mLabel[ri]}</div>
                  <div style={{ width:isFirst?52:44,height:isFirst?52:44,borderRadius:'50%',background:r.installer.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:isFirst?22:16,fontWeight:800,color:B.bg,margin:'0 auto 8px' }}>
                    {r.installer.name.charAt(0)}
                  </div>
                  <div style={{ fontSize:isFirst?14:13,fontWeight:700,marginBottom:2 }}>{isGuest ? <Redacted>{r.installer.name.split(' ')[0]}</Redacted> : r.installer.name.split(' ')[0]}</div>
                  <div style={{ fontSize:isFirst?22:18,fontWeight:800,color:medals[ri] }}>{r.sqft.toFixed(1)}</div>
                  <div style={{ fontSize:10,color:B.textTer,marginTop:1 }}>sqft</div>
                  {isFirst && <div style={{ fontSize:11,color:B.textTer,marginTop:5 }}>{r.avgSqftHr?.toFixed(1) ?? '--'} sqft/hr</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ background:B.surface,borderRadius:14,padding:'14px 16px',marginBottom:16,border:`1px solid ${B.border}` }}>
        <div style={{ display:'flex',justifyContent:'space-between',marginBottom:10 }}>
          <span style={{ fontSize:12,color:B.textTer,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em' }}>Shop total</span>
          <span style={{ fontSize:17,fontWeight:800,color:B.yellow }}>{totalSqft.toFixed(1)} sqft</span>
        </div>
        <div style={{ height:10,borderRadius:5,overflow:'hidden',display:'flex',gap:1 }}>
          {board.map(r => <div key={r.installer.id} style={{ height:'100%',width:`${r.pct}%`,background:r.installer.color }} />)}
        </div>
        <div style={{ display:'flex',gap:12,marginTop:8,flexWrap:'wrap' }}>
          {board.map(r => (
            <span key={r.installer.id} style={{ display:'flex',alignItems:'center',gap:5,fontSize:11 }}>
              <span style={{ width:8,height:8,borderRadius:'50%',background:r.installer.color,display:'inline-block' }} />
              <span style={{ color:B.textTer }}>{isGuest ? <Redacted>{r.installer.name.split(' ')[0]}</Redacted> : r.installer.name.split(' ')[0]}</span>
              <span style={{ color:B.textSec,fontWeight:700 }}>{r.pct.toFixed(0)}%</span>
            </span>
          ))}
        </div>
      </div>

      <div style={{ display:'flex',flexDirection:'column',gap:8,marginBottom:20 }}>
        {board.map((r, i) => (
          <div key={r.installer.id} style={{ background:B.surface,borderRadius:14,padding:'14px 16px',border:`1px solid ${i===0 ? B.yellow+'44' : B.border}`,display:'flex',alignItems:'center',gap:14 }}>
            <div style={{ fontSize:13,fontWeight:800,color:medals[i]??B.textTer,minWidth:24,textAlign:'center' }}>{i+1}</div>
            <div style={{ width:38,height:38,borderRadius:'50%',background:r.installer.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:800,color:B.bg,flexShrink:0 }}>{r.installer.name.charAt(0)}</div>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:14,fontWeight:700 }}>{isGuest ? <Redacted>{r.installer.name}</Redacted> : r.installer.name}</div>
              <div style={{ display:'flex',gap:10,marginTop:3,flexWrap:'wrap' }}>
                <span style={{ fontSize:11,color:B.textTer }}>{r.panels} panels</span>
                <span style={{ fontSize:11,color:B.textTer }}>{fmtTime(r.mins)}</span>
                <span style={{ fontSize:11,color: r.avgSqftHr && r.avgSqftHr > 20 ? B.green : B.textTer }}>{r.avgSqftHr?.toFixed(1) ?? '--'}/hr</span>
              </div>
              <div style={{ marginTop:6,height:4,background:B.surface2,borderRadius:2,overflow:'hidden' }}>
                <div style={{ height:'100%',width:`${r.pct}%`,background:r.installer.color,borderRadius:2 }} />
              </div>
            </div>
            <div style={{ textAlign:'right',flexShrink:0 }}>
              <div style={{ fontSize:18,fontWeight:800,color: i===0 ? B.yellow : B.text }}>{r.sqft.toFixed(1)}</div>
              <div style={{ fontSize:10,color:B.textTer }}>sqft</div>
            </div>
          </div>
        ))}
        {!board.length && <div style={{ padding:24,textAlign:'center',color:B.textTer,fontSize:13 }}>No commercial data yet.</div>}
      </div>

      {([bySpeed[0] && { l:'Fastest pace',v:bySpeed[0],val:`${bySpeed[0].avgSqftHr!.toFixed(1)} sqft/hr` },
         byPanels[0] && { l:'Most panels',v:byPanels[0],val:`${byPanels[0].panels} panels` },
         byProj[0] && { l:'Most projects',v:byProj[0],val:`${byProj[0].projectCount} projects` },
         byHours[0] && { l:'Most hours',v:byHours[0],val:fmtTime(byHours[0].mins) }].filter(Boolean) as { l:string; v:BoardRow; val:string }[]).length > 0 && (
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:20 }}>
          {([bySpeed[0] && { l:'Fastest pace',v:bySpeed[0],val:`${bySpeed[0].avgSqftHr!.toFixed(1)} sqft/hr` },
             byPanels[0] && { l:'Most panels',v:byPanels[0],val:`${byPanels[0].panels} panels` },
             byProj[0] && { l:'Most projects',v:byProj[0],val:`${byProj[0].projectCount} projects` },
             byHours[0] && { l:'Most hours',v:byHours[0],val:fmtTime(byHours[0].mins) }].filter(Boolean) as { l:string; v:BoardRow; val:string }[]).map(c => (
            <div key={c.l} style={{ background:B.surface,borderRadius:14,padding:'14px 16px',border:`1px solid ${B.border}` }}>
              <div style={{ fontSize:10,color:B.textTer,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8 }}>{c.l}</div>
              <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                <div style={{ width:32,height:32,borderRadius:'50%',background:c.v.installer.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:B.bg,flexShrink:0 }}>{c.v.installer.name.charAt(0)}</div>
                <div>
                  <div style={{ fontSize:12,fontWeight:700 }}>{isGuest ? <Redacted>{c.v.installer.name.split(' ')[0]}</Redacted> : c.v.installer.name.split(' ')[0]}</div>
                  <div style={{ fontSize:14,fontWeight:800,color:B.yellow }}>{c.val}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isGuest && funFacts.length > 0 && (
        <div style={{ background:B.surface,borderRadius:14,padding:16,border:`1px solid ${B.border}`,marginBottom:20 }}>
          <div style={{ fontSize:11,color:B.textTer,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:12 }}>Fun facts</div>
          {funFacts.map((f,i) => (
            <div key={i} style={{ display:'flex',gap:10,marginBottom:i<funFacts.length-1?10:0,paddingBottom:i<funFacts.length-1?10:0,borderBottom:i<funFacts.length-1?`1px solid ${B.border}`:'none' }}>
              <span style={{ color:B.yellow,fontSize:14,flexShrink:0 }}>*</span>
              <span style={{ fontSize:13,color:B.textSec,lineHeight:1.5 }}>{f}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background:B.surface,borderRadius:14,padding:'14px 18px',marginBottom:12,border:`1px solid ${CC}44` }}>
        <button onClick={() => setCcExpanded(v => !v)} style={{ width:'100%',background:'none',border:'none',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',color:B.text }}>
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <div style={{ width:8,height:8,borderRadius:'50%',background:CC }} />
            <span style={{ fontSize:14,fontWeight:700,color:CC }}>Color Change Leaderboard</span>
            <span style={{ fontSize:12,color:B.textTer }}>{ccLogs.length} panels</span>
          </div>
          <span style={{ fontSize:16,color:B.textTer }}>{ccExpanded ? '▲' : '▼'}</span>
        </button>
        {ccExpanded && (
          <div style={{ marginTop:14 }}>
            <div style={{ fontSize:12,color:B.textTer,marginBottom:14,lineHeight:1.6 }}>Color change sqft/hr is naturally lower. Tracked separately.</div>
            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              {ccBoard.map((r,i) => (
                <div key={r.installer.id} style={{ background:B.surface2,borderRadius:12,padding:'12px 14px',display:'flex',alignItems:'center',gap:12,border:`1px solid ${i===0 ? CC+'44' : B.border}` }}>
                  <div style={{ fontSize:12,fontWeight:800,color:[CC,'#B0B8C1','#CD7F32'][i]??B.textTer,minWidth:20,textAlign:'center' }}>{i+1}</div>
                  <div style={{ width:32,height:32,borderRadius:'50%',background:r.installer.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:B.bg,flexShrink:0 }}>{r.installer.name.charAt(0)}</div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:13,fontWeight:700 }}>{isGuest ? <Redacted>{r.installer.name}</Redacted> : r.installer.name}</div>
                    <div style={{ display:'flex',gap:8,marginTop:2 }}>
                      <span style={{ fontSize:11,color:B.textTer }}>{r.panels} panels</span>
                      <span style={{ fontSize:11,color:B.textTer }}>{fmtTime(r.mins)}</span>
                      {r.avgSqftHr && <span style={{ fontSize:11,color:B.textTer }}>{r.avgSqftHr.toFixed(1)}/hr</span>}
                    </div>
                    <div style={{ marginTop:5,height:3,background:B.surface3,borderRadius:2,overflow:'hidden' }}>
                      <div style={{ height:'100%',width:`${r.pct}%`,background:CC,borderRadius:2,opacity:0.8 }} />
                    </div>
                  </div>
                  <div style={{ textAlign:'right',flexShrink:0 }}>
                    <div style={{ fontSize:16,fontWeight:800,color: i===0 ? CC : B.text }}>{r.sqft.toFixed(1)}</div>
                    <div style={{ fontSize:10,color:B.textTer }}>sqft</div>
                  </div>
                </div>
              ))}
              {!ccBoard.length && <div style={{ fontSize:13,color:B.textTer,padding:'8px 0' }}>No color change data yet.</div>}
            </div>
            {ccBoard.length > 0 && (() => {
              const ct = ccLogs.reduce((t,r) => ({ sqft:t.sqft+(r.sqft??0), mins:t.mins+(r.mins??0) }), { sqft:0, mins:0 })
              return (
                <div style={{ marginTop:14,paddingTop:14,borderTop:`1px solid ${B.border}`,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8 }}>
                  {[{ l:'Total SQFT',v:ct.sqft.toFixed(1) },{ l:'Panels',v:ccLogs.length },{ l:'Avg SQFT/HR',v:ct.mins>0?(ct.sqft/(ct.mins/60)).toFixed(1):'--' }].map(m => (
                    <div key={m.l} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:10,color:B.textTer,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4 }}>{m.l}</div>
                      <div style={{ fontSize:16,fontWeight:800,color:CC }}>{m.v}</div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}
      </div>

      <div style={{ background:B.surface,borderRadius:14,padding:'14px 16px',border:`1px solid ${B.border}` }}>
        <div style={{ fontSize:11,fontWeight:700,color:B.textTer,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8 }}>Shop avg</div>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8 }}>
          {[{ l:'Total SQFT',v:totalSqft.toFixed(1) },{ l:'Hours',v:(totalMins/60).toFixed(1)+'h' },{ l:'SQFT/HR',v:shopRate>0?shopRate.toFixed(1):'--' }].map(m => (
            <div key={m.l} style={{ textAlign:'center' }}>
              <div style={{ fontSize:10,color:B.textTer,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4 }}>{m.l}</div>
              <div style={{ fontSize:16,fontWeight:800,color:B.yellow }}>{m.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
