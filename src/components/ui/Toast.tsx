import { useEffect } from 'react'
import { B } from '../../lib/utils'

export function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div style={{ position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:B.surface,border:`1px solid ${B.border}`,borderRadius:14,padding:'11px 20px',fontSize:14,fontWeight:600,color:B.text,zIndex:1200,pointerEvents:'none',maxWidth:'calc(100vw - 48px)',textAlign:'center' }}>
      {msg}
    </div>
  )
}
