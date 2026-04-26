import { useState } from 'react'
import { useFleetAuth } from './context/FleetAuthContext'
import { F } from './lib/fleetColors'

export default function FleetLoginScreen({ noAccess }: { noAccess?: boolean }) {
  const { signIn, signOut } = useFleetAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError(null)
    const { error: err } = await signIn(email.trim(), password)
    setLoading(false)
    if (err) setError(err)
  }

  const inp = {
    padding: '16px 18px' as const,
    fontSize: 16,
    borderRadius: 14,
    width: '100%' as const,
    background: F.surface2,
    color: F.text,
    border: `1px solid ${F.border}`,
    outline: 'none' as const,
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ minHeight: '100dvh', background: F.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', color: F.text }}>
            FLEET
          </div>
          <div style={{ fontSize: 13, color: F.accentLight, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 6 }}>
            Operations Portal
          </div>
        </div>

        {noAccess ? (
          <div style={{ background: F.surface, borderRadius: 18, padding: 28, textAlign: 'center', border: `1px solid ${F.border}` }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: 17, color: F.text, fontWeight: 700, marginBottom: 8 }}>No Fleet Access</div>
            <div style={{ fontSize: 14, color: F.textSec, marginBottom: 24, lineHeight: 1.5 }}>
              Your account isn't assigned to a fleet role.<br />Contact your admin to get access.
            </div>
            <button
              onClick={signOut}
              style={{ width: '100%', background: F.surface2, color: F.textSec, border: `1px solid ${F.border}`, borderRadius: 12, padding: 16, fontSize: 15, cursor: 'pointer', fontWeight: 600 }}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" style={inp} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" style={inp} />
            </div>
            {error && (
              <div style={{ fontSize: 14, color: F.red, marginBottom: 16, padding: '12px 16px', background: F.red + '18', borderRadius: 10 }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{ width: '100%', background: loading || !email || !password ? F.surface2 : F.accent, color: loading || !email || !password ? F.textTer : '#fff', border: 'none', borderRadius: 16, padding: 22, fontSize: 17, fontWeight: 800, cursor: loading ? 'wait' : 'pointer' }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
