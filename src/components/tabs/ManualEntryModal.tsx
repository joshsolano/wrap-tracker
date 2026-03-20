import { useState } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { B, CC, TYPE_OPTS, parseDim, calcSqft } from '../../lib/utils'
import type { JobType } from '../../lib/types'

interface Props { onClose: () => void; onSave: () => void }

export default function ManualEntryModal({ onClose, onSave }: Props) {
  const { installers, projects, insertManualLog } = useAppData()
  const [installerId, setInstallerId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [panelId, setPanelId] = useState<string | null>(null)
  const [jobType, setJobType] = useState<JobType>('Wrap')
  const todayStr = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(todayStr)
  const [startT, setStartT] = useState('09:00')
  const [endT, setEndT] = useState('10:00')
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const project = projectId ? projects.find(p => p.id === projectId) : null
  const isCC = project?.project_type === 'colorchange'
  const accent = isCC ? CC : B.yellow
  const panel = panelId ? project?.panels?.find(p => p.id === panelId) : null
  const sqft = panel?.height_in && panel?.width_in ? calcSqft(panel.height_in, panel.width_in) : null

  async function save() {
    setErr(null)
    if (!installerId) return setErr('Select an installer.')
    if (!projectId) return setErr('Select a project.')
    if (!panelId) return setErr('Select a panel.')
    const startTs = new Date(`${date}T${startT}:00`)
    const finishTs = new Date(`${date}T${endT}:00`)
    if (isNaN(startTs.getTime()) || isNaN(finishTs.getTime())) return setErr('Invalid date or time.')
    if (finishTs <= startTs) return setErr('End time must be after start time.')
    setSaving(true)
    const { error } = await insertManualLog({ installerId, projectId, panelId, jobType, isColorChange: isCC, startTs, finishTs })
    setSaving(false)
    if (error) { setErr(error); return }
    onSave()
  }

  return (
    <div style={{ position:'fixed',top:0,left:0,width:'100%',height:'100%',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.82)',padding:20 }}>
      <div style={{ background:B.surface,borderRadius:20,padding:24,width:'100%',maxWidth:440,border:`1px solid ${B.border}`,maxHeight:'90vh',overflowY:'auto' }}>
        <div style={{ fontSize:18,fontWeight:800,marginBottom:4 }}>Manual Entry</div>
        <div style={{ fontSize:12,color:B.textTer,marginBottom:20 }}>Add a completed panel retroactively.</div>

        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:6 }}>Installer</div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            {installers.map(i => (
              <button key={i.id} onClick={() => setInstallerId(i.id)}
                style={{ padding:'8px 14px',borderRadius:20,border:`1.5px solid ${installerId===i.id ? i.color : B.border}`,background: installerId===i.id ? i.color+'18' : 'transparent',color: installerId===i.id ? i.color : B.textSec,fontWeight: installerId===i.id ? 700 : 400,fontSize:13,cursor:'pointer' }}>
                {i.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:6 }}>Project</div>
          <select value={projectId ?? ''} onChange={e => { setProjectId(e.target.value || null); setPanelId(null) }}
            style={{ padding:'11px 12px',borderRadius:10,background:B.surface2,color:B.text,border:'none',width:'100%',fontSize:14 }}>
            <option value="">-- select --</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {project && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:6 }}>Panel</div>
            <select value={panelId ?? ''} onChange={e => setPanelId(e.target.value || null)}
              style={{ padding:'11px 12px',borderRadius:10,background:B.surface2,color:B.text,border:'none',width:'100%',fontSize:14 }}>
              <option value="">-- select --</option>
              {(project.panels ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:6 }}>Type</div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            {TYPE_OPTS.map(t => (
              <button key={t} onClick={() => setJobType(t)}
                style={{ padding:'7px 13px',borderRadius:18,border:`1.5px solid ${jobType===t ? B.yellow : B.border}`,background: jobType===t ? B.yellow+'18' : 'transparent',color: jobType===t ? B.yellow : B.textSec,fontWeight: jobType===t ? 700 : 400,fontSize:13,cursor:'pointer' }}>{t}</button>
            ))}
          </div>
        </div>

        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12 }}>
          {[{ label:'Date',type:'date',value:date,onChange:setDate,max:todayStr },
            { label:'Start',type:'time',value:startT,onChange:setStartT },
            { label:'End',type:'time',value:endT,onChange:setEndT }].map(f => (
            <div key={f.label}>
              <div style={{ fontSize:12,color:B.textSec,fontWeight:600,marginBottom:6 }}>{f.label}</div>
              <input type={f.type} value={f.value} onChange={e => f.onChange(e.target.value)} max={(f as any).max}
                style={{ padding:'10px 8px',fontSize:13,borderRadius:10,background:B.surface2,color:B.text,border:'none',outline:'none',width:'100%',colorScheme:'dark' }} />
            </div>
          ))}
        </div>

        {sqft && <div style={{ fontSize:12,color:accent,fontWeight:700,marginBottom:10 }}>{sqft.toFixed(2)} sqft preview</div>}
        {err && <div style={{ fontSize:13,color:B.red,marginBottom:12,padding:'8px 12px',background:B.red+'15',borderRadius:8 }}>{err}</div>}

        <div style={{ display:'flex',gap:10 }}>
          <button onClick={onClose} style={{ flex:1,background:B.surface2,color:B.text,border:'none',borderRadius:12,padding:13,fontSize:14,fontWeight:600,cursor:'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ flex:1,background:accent,color: isCC ? B.text : B.bg,border:'none',borderRadius:12,padding:13,fontSize:14,fontWeight:800,cursor:'pointer' }}>
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  )
}
