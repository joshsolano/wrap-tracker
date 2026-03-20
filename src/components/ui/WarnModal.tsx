import { B } from '../../lib/utils'
import type { WarnConfig } from '../../lib/types'

export function WarnModal({ modal, onClose }: { modal: WarnConfig | null; onClose: () => void }) {
  if (!modal) return null
  return (
    <div style={{ position:'fixed',top:0,left:0,width:'100%',height:'100%',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.8)',padding:20 }}>
      <div style={{ background:B.surface,borderRadius:20,padding:24,width:'100%',maxWidth:420,border:`1px solid ${modal.danger ? B.red+'55' : B.border}` }}>
        <div style={{ fontSize:18,fontWeight:800,marginBottom:8 }}>{modal.title}</div>
        <div style={{ fontSize:14,color:B.textSec,lineHeight:1.65,marginBottom:20 }}>{modal.body}</div>
        <div style={{ display:'flex',gap:10 }}>
          {modal.cancel !== undefined && (
            <button onClick={onClose} style={{ flex:1,background:B.surface2,color:B.text,border:'none',borderRadius:12,padding:13,fontSize:14,fontWeight:600,cursor:'pointer' }}>
              {modal.cancel || 'Cancel'}
            </button>
          )}
          <button
            onClick={() => { modal.onOk?.(); onClose() }}
            style={{ flex: modal.cancel !== undefined ? 1 : 'none' as any, width: modal.cancel === undefined ? '100%' : 'auto', background: modal.danger ? B.red : B.yellow, color: modal.danger ? B.text : B.bg, border:'none',borderRadius:12,padding:13,fontSize:14,fontWeight:800,cursor:'pointer' }}>
            {modal.ok}
          </button>
        </div>
      </div>
    </div>
  )
}
