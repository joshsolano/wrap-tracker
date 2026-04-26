import { useState, useRef, useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import { useAppData, AppDataProvider } from './context/AppDataContext'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ConnectionBanner } from './components/ui/ConnectionBanner'
import LoginScreen from './components/auth/LoginScreen'
import ContentShell from './components/content/ContentShell'
import ContentDashboard from './components/content/ContentDashboard'
import ClockIn from './components/tabs/ClockIn'
import Dashboard from './components/tabs/Dashboard'
import LogTab from './components/tabs/Log'
import Projects from './components/tabs/Projects'
import Leaderboard from './components/tabs/Leaderboard'
import Bounties from './components/tabs/Bounties'
import Profiles from './components/tabs/Profiles'
import Panels from './components/tabs/Panels'
import Settings from './components/tabs/Settings'
import { Redacted } from './components/ui/Redacted'
import { B, isBirthday } from './lib/utils'
import { useDemoFeatures } from './hooks/useDemoFeatures'

const ALL_TABS = ['Clock In', 'Dashboard', 'Log', 'Projects', 'Leaderboard', 'Bounties', 'Profiles', 'Panels', 'Content', 'Settings'] as const
type Tab = typeof ALL_TABS[number]

function AppShell() {
  const { signOut, installer: me, manager, isAdmin, isGuest } = useAuth()
  const { installers, activeJobs } = useAppData()
  const [tab, setTab] = useState<Tab>('Clock In')
  const [tabFade, setTabFade] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)

  const userId = me?.id || manager?.id || 'guest'
  const STORAGE_KEY = `tabHidden_${userId}`
  const [hiddenTabs, setHiddenTabs] = useState<Set<Tab>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? new Set(JSON.parse(saved) as Tab[]) : new Set()
    } catch { return new Set() }
  })
  function toggleTab(t: Tab) {
    setHiddenTabs(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      if (next.has(tab)) setTab('Clock In')
      return next
    })
  }

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  function switchTab(t: Tab) {
    if (t === tab) return
    setTabFade(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setTab(t)
      setTabFade(true)
    }, 120)
  }

  useDemoFeatures()

  const birthday = installers.find(i => isBirthday(i.birthday))
  const activeCount = activeJobs.length

  const tabs: Tab[] = ALL_TABS.filter(t => {
    if (t === 'Content' && !isAdmin) return false
    if (isAdmin) return true
    return !hiddenTabs.has(t)
  })

  const tabContent: Record<Tab, React.ReactElement> = {
    'Clock In': <ClockIn />,
    Dashboard: <Dashboard />,
    Log: <LogTab />,
    Projects: <Projects />,
    Leaderboard: <Leaderboard />,
    Bounties: <Bounties />,
    Profiles: <Profiles />,
    Panels: <Panels />,
    Content: <ContentDashboard />,
    Settings: <Settings onSignOut={signOut} hiddenTabs={hiddenTabs} toggleTab={toggleTab} />,
  }

  return (
    <div
      style={{
        background: B.bg,
        minHeight: '100dvh',
        fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
        color: B.text,
        fontSize: 15,
        paddingBottom: 48,
      }}
    >
      <ConnectionBanner />

      {birthday && !isGuest && (
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
              {isGuest ? <Redacted>{j.installer?.name.split(' ')[0] ?? 'Installer'}</Redacted> : (j.installer?.name.split(' ')[0] ?? 'Installer')} → {j.panel?.name}
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

          {isAdmin && (
            <a href="/fleet" style={{ fontSize: 11, color: '#3B82F6', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: '4px 10px', textDecoration: 'none', fontWeight: 700, flexShrink: 0 }}>
              Fleet →
            </a>
          )}

          {isGuest ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: B.textTer, background: B.surface, border: `1px solid ${B.border}`, borderRadius: 8, padding: '4px 10px', letterSpacing: '0.04em' }}>
                Viewing as Guest
              </div>
              <button
                onClick={signOut}
                style={{ fontSize: 11, color: B.yellow, background: 'none', border: `1px solid ${B.yellow}66`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
              >
                Sign in
              </button>
            </div>
          ) : me ? (
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
          ) : manager ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: B.surface3, border: `1px solid ${B.yellow}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: B.yellow, flexShrink: 0 }}>
                {manager.name.charAt(0)}
              </div>
              <div style={{ lineHeight: 1.25 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: B.text }}>{manager.name.split(' ')[0]}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: B.yellow, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Manager</div>
              </div>
              <button
                onClick={signOut}
                style={{ fontSize: 11, color: B.textTer, background: 'none', border: `1px solid ${B.border}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>

        <div style={{ padding: '14px 20px 0' }}>
          <div style={{ display: 'flex', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: 3, background: B.surface, borderRadius: 14, padding: 4 }}>
            {tabs.map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                style={{
                  flex: isMobile ? '1 1 22%' : 1,
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
  const { installer, manager, contentUser, isGuest, loading } = useAuth()

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

  if (!installer && !manager && !contentUser && !isGuest) {
    return <LoginScreen />
  }

  if (contentUser) {
    return <ContentShell />
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