import { useConnectionStatus } from '../../hooks/useConnectionStatus'
import { B } from '../../lib/utils'

export function ConnectionBanner() {
  const status = useConnectionStatus()
  if (status === 'connected') return null
  const isDisconnected = status === 'disconnected'
  return (
    <div style={{ background: isDisconnected ? B.red+'22' : B.orange+'22', borderBottom:`1px solid ${isDisconnected ? B.red+'44' : B.orange+'44'}`, padding:'8px 20px',textAlign:'center',fontSize:13,fontWeight:600,color: isDisconnected ? B.red : B.orange }}>
      {isDisconnected ? '⚠ Connection lost — changes may not sync' : '⟳ Connecting…'}
    </div>
  )
}
