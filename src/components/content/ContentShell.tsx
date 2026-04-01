import { useAuth } from '../../context/AuthContext'
import { B } from '../../lib/utils'
import ContentDashboard from './ContentDashboard'

export default function ContentShell() {
  const { contentUser, signOut } = useAuth()

  return (
    <div style={{ background: B.bg, minHeight: '100dvh', fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif", color: B.text, fontSize: 15 }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ padding: '20px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em' }}>
              <span style={{ color: B.yellow }}>WRAP</span> GFX
            </div>
            <div style={{ fontSize: 12, color: B.textTer, marginTop: 2 }}>Content Portal</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{contentUser?.name ?? 'Content'}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: B.yellow, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Content</div>
            </div>
            <button
              onClick={signOut}
              style={{ fontSize: 11, color: B.textTer, background: 'none', border: `1px solid ${B.border}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontWeight: 600 }}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Section label */}
        <div style={{ padding: '18px 16px 4px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Project Shots</div>
        </div>

        <ContentDashboard />
      </div>
    </div>
  )
}
