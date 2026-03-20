import { useState, useRef } from 'react'
import { useAuth } from './context/AuthContext'
import { useAppData, AppDataProvider } from './context/AppDataContext'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ConnectionBanner } from './components/ui/ConnectionBanner'
import LoginScreen from './components/auth/LoginScreen'
import ClockIn from './components/tabs/ClockIn'
import Dashboard from './components/tabs/Dashboard'
import LogTab from './components/tabs/Log'
import Projects from './components/tabs/Projects'
import Leaderboard from './components/tabs/Leaderboard'
import Profiles from './components/tabs/Profiles'
import Panels from './components/tabs/Panels'
import Settings from './components/tabs/Settings'
import { B, isBirthday } from './lib/utils'

const TABS = ['Clock In', 'Dashboard', 'Log', 'Projects', 'Leaderboard', 'Profiles', 'Panels', 'Settings'] as const
type Tab = typeof TABS[number]

function AppShell() {
  const { signOut, installer: me, isAdmin } = useAuth()
  const { installers, activeJobs } = useAppData()
  const [tab, setTab] = useState<Tab>('Clock In')
  const [tabFade, setTabFade] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function switchTab(t: Tab) {
    if (t === tab) return
    setTabFade(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setTab(t)
      setTabFade(true)
    }, 120)
  }

  const birthday = installers.find(i => isBirthday(i.birthday))
  const activeCount = activeJobs.length

  const tabContent: Record<Tab, React.ReactElement> = {
    'Clock In': <ClockIn />,
    Dashboard: <Dashboard />,
    Log: <LogTab />,
    Projects: <Projects />,
    Leaderboard: <Leaderboard />,
    Profiles: <Profiles />,
    Panels: <Panels />,
    Settings: <Settings onSignOut={signOut} />,
  }

  return (
    <div
      style={{
        background: B.bg,
        minHeight: '100vh',
        fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
        color: B.text,
        fontSize: 15,
        paddingBottom: 48,
      }}
    >
      <ConnectionBanner />

      {birthday && (
        <div
          style={{
            background: '#1A0D00',
            borderBottom: `1px solid ${B.yellow}44`,
            padding: '10px 24px',
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 600,
            color: B.yellow,
          }}
        >
          🎂 Birthday — {birthday.name}!
        </div>
      )}

      {activeCount > 0 && tab !== 'Clock In' && (
        <div
          style={{
            background: B.orange + '12',
            borderBottom: `1px solid ${B.orange}33`,
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: B.orange,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              flexShrink: 0,
            }}
          >
            Active
          </span>
          {activeJobs.map(j => (
            <span
              key={j.id}
              style={{
                fontSize: 12,
                color: B.textSec,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: j.installer?.color ?? B.surface3,
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              {(j.installer?.name.split(' ')[0] ?? 'Installer')} → {j.panel?.name}
            </span>
          ))}
        </div>
      )}

      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <div
          style={{
            padding: '20px 20px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em' }}>
              <span style={{ color: B.yellow }}>WRAP</span> GFX
            </div>
            <div style={{ fontSize: 12, color: B.textTer, marginTop: 2 }}>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>

          {me && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: me.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: B.bg, flexShrink: 0 }}>
                {me.name.charAt(0)}
              </div>
              <div style={{ lineHeight: 1.25 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: B.text }}>{me.name.split(' ')[0]}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: isAdmin ? B.yellow : B.textTer, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {isAdmin ? 'Admin' : 'Installer'}
                </div>
              </div>
              <button
                onClick={signOut}
                style={{ fontSize: 11, color: B.textTer, background: 'none', border: `1px solid ${B.border}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 20px 0' }}>
          <div style={{ display: 'flex', gap: 3, background: B.surface, borderRadius: 14, padding: 4 }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                style={{
                  flex: 1,
                  padding: '9px 4px',
                  border: 'none',
                  borderRadius: 10,
                  background: tab === t ? B.yellow : 'transparent',
                  color: tab === t ? B.bg : B.textSec,
                  fontWeight: tab === t ? 700 : 400,
                  fontSize: 10.5,
                  transition: 'all 0.18s',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '20px 20px 0', opacity: tabFade ? 1 : 0, transition: 'opacity 0.15s ease' }}>
          <ErrorBoundary>{tabContent[tab]}</ErrorBoundary>
        </div>
      </div>
    </div>
  )
}

function AppGate() {
  const { installer, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: B.bg,
          color: B.text,
          fontSize: 16,
        }}
      >
        Loading…
      </div>
    )
  }

  if (!installer) {
    return <LoginScreen />
  }

  return (
    <AppDataProvider>
      <AppShell />
    </AppDataProvider>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppGate />
    </ErrorBoundary>
  )
}