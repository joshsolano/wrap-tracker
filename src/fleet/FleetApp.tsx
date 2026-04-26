import { useState, createContext, useContext } from 'react'
import { useFleetAuth } from './context/FleetAuthContext'
import FleetLoginScreen from './FleetLoginScreen'
import FleetHome from './pages/FleetHome'
import FleetJobPage from './pages/FleetJobPage'
import FleetVehiclePage from './pages/FleetVehiclePage'
import FleetUserAdmin from './components/FleetUserAdmin'
import FleetDemoPage from './pages/FleetDemoPage'
import { F } from './lib/fleetColors'

export type FleetNavPage =
  | { page: 'home' }
  | { page: 'job'; jobId: string; jobName: string; customer: string }
  | { page: 'vehicle'; vehicleId: string; jobId: string; jobName: string }
  | { page: 'admin' }
  | { page: 'demo' }

interface FleetNavCtx {
  nav: FleetNavPage
  go: (p: FleetNavPage) => void
  back: () => void
}

const FleetNavContext = createContext<FleetNavCtx | null>(null)

export function useFleetNav() {
  const ctx = useContext(FleetNavContext)
  if (!ctx) throw new Error('useFleetNav must be inside FleetApp')
  return ctx
}

export default function FleetApp() {
  const { fleetUser, loading, noAccess, session, signOut, isFleetAdmin } = useFleetAuth()
  const [history, setHistory] = useState<FleetNavPage[]>([{ page: 'home' }])
  const nav = history[history.length - 1]

  function go(p: FleetNavPage) { setHistory(h => [...h, p]); window.scrollTo(0, 0) }
  function back() { setHistory(h => h.length > 1 ? h.slice(0, -1) : h); window.scrollTo(0, 0) }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: F.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: F.text, fontSize: 16, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif" }}>
        Loading…
      </div>
    )
  }

  if (!session || !fleetUser) {
    return <FleetLoginScreen noAccess={!!(session && noAccess)} />
  }

  function renderPage() {
    switch (nav.page) {
      case 'home': return <FleetHome />
      case 'job': return <FleetJobPage jobId={nav.jobId} jobName={nav.jobName} customer={nav.customer} />
      case 'vehicle': return <FleetVehiclePage vehicleId={nav.vehicleId} jobId={nav.jobId} jobName={nav.jobName} />
      case 'admin': return <FleetUserAdmin />
      case 'demo': return <FleetDemoPage />
    }
  }

  const breadcrumb = nav.page === 'job' ? nav.jobName
    : nav.page === 'vehicle' ? nav.jobName
    : nav.page === 'admin' ? 'Users'
    : nav.page === 'demo' ? 'Export Preview'
    : null

  return (
    <FleetNavContext.Provider value={{ nav, go, back }}>
      <div style={{ minHeight: '100dvh', background: F.bg, color: F.text, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif", fontSize: 15, paddingBottom: 40 }}>
        {/* Header */}
        <div style={{ background: F.surface, borderBottom: `1px solid ${F.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 50 }}>
          {history.length > 1 && (
            <button
              onClick={back}
              style={{ background: F.surface2, border: `1px solid ${F.border}`, borderRadius: 10, padding: '8px 14px', color: F.accentLight, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, fontWeight: 600 }}
            >
              ← Back
            </button>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.01em', color: F.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              FLEET TRACKER{breadcrumb && <span style={{ color: F.textSec, fontWeight: 400, fontSize: 13 }}> / {breadcrumb}</span>}
            </div>
            <div style={{ fontSize: 10, color: F.accentLight, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 1 }}>
              Powered by Wrap GFX
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: F.text }}>{fleetUser.name.split(' ')[0]}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: F.accentLight, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{fleetUser.role}</div>
            </div>
            {isFleetAdmin && nav.page !== 'admin' && (
              <button onClick={() => go({ page: 'admin' })} style={{ background: F.surface2, border: `1px solid ${F.border}`, borderRadius: 9, padding: '6px 11px', color: F.textSec, fontSize: 11, cursor: 'pointer' }}>Users</button>
            )}
            <button onClick={signOut} style={{ background: 'none', border: `1px solid ${F.border}`, borderRadius: 9, padding: '6px 11px', color: F.textTer, fontSize: 11, cursor: 'pointer' }}>Sign Out</button>
          </div>
        </div>

        <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px 0' }}>
          {renderPage()}
        </div>
      </div>
    </FleetNavContext.Provider>
  )
}
