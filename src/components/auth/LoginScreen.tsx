import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { B } from '../../lib/utils'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true); setError(null)
    const { error: err } = await signIn(email.trim(), password)
    setLoading(false)
    if (err) setError(err)
  }

  return (
    <div style={{ minHeight:'100vh',background:B.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
      <div style={{ width:'100%',maxWidth:380 }}>
        <div style={{ fontSize:28,fontWeight:800,marginBottom:4,letterSpacing:'-0.03em' }}>
          <span style={{ color:B.yellow }}>WRAP</span><span style={{ color:B.text }}> GFX</span>
        </div>
        <div style={{ fontSize:14,color:B.textTer,marginBottom:32 }}>Sign in to continue</div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:12 }}>
            <input
              type="email" placeholder="Email" value={email}
              onChange={e => setEmail(e.target.value)} autoComplete="email"
              style={{ padding:'14px 16px',fontSize:15,borderRadius:12,width:'100%',background:B.surface2,color:B.text,border:`1px solid ${B.border}`,outline:'none' }}
            />
          </div>
          <div style={{ marginBottom:20 }}>
            <input
              type="password" placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)} autoComplete="current-password"
              style={{ padding:'14px 16px',fontSize:15,borderRadius:12,width:'100%',background:B.surface2,color:B.text,border:`1px solid ${B.border}`,outline:'none' }}
            />
          </div>
          {error && (
            <div style={{ fontSize:13,color:B.red,marginBottom:16,padding:'10px 14px',background:B.red+'15',borderRadius:10 }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading || !email || !password}
            style={{ width:'100%',background:loading||!email||!password ? B.surface2 : B.yellow, color:loading||!email||!password ? B.textTer : B.bg, border:'none',borderRadius:14,padding:18,fontSize:16,fontWeight:800,cursor:loading?'wait':'pointer' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
