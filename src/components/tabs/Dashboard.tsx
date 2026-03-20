import { useMemo } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { useAuth } from '../../context/AuthContext'
import { Redacted } from '../ui/Redacted'
import { B, weekKey } from '../../lib/utils'

export default function Dashboard() {
  const { logs, installers } = useAppData()
  const { isGuest } = useAuth()

  const completeLogs = useMemo(
    () => logs.filter(r => r.status === 'Complete' && r.sqft && r.sqft > 0 && r.mins && r.mins > 0),
    [logs]
  )
  const commercial = useMemo(() => completeLogs.filter(r => !r.is_color_change), [completeLogs])

  const todayStr = new Date().toDateString()
  const todayLogs = useMemo(
    () => completeLogs.filter(r => r.finish_ts && new Date(r.finish_ts).toDateString() === todayStr),
    [completeLogs]
  )
  const weekLogs = useMemo(
    () => commercial.filter(r => weekKey(r.start_ts) === weekKey(new Date().toISOString())),
    [commercial]
  )

  const todaySqft = todayLogs.reduce((s, r) => s + (r.sqft ?? 0), 0)
  const todayPanels = todayLogs.length
  const weekSqft = weekLogs.reduce((s, r) => s + (r.sqft ?? 0), 0)
  const weekPanels = weekLogs.length
  const totalSqft = commercial.reduce((s, r) => s + (r.sqft ?? 0), 0)
  const totalPanels = commercial.length
  const totalMins = commercial.reduce((s, r) => s + (r.mins ?? 0), 0)
  const shopRate = totalMins > 0 ? totalSqft / (totalMins / 60) : 0

  const totalSqftAll = commercial.reduce((s, r) => s + (r.sqft ?? 0), 0) || 1
  const byInstaller = useMemo(() => {
    const m = new Map<string, { sqft: number; name: string; color: string }>()
    for (const r of commercial) {
      const inst = installers.find(i => i.id === r.installer_id)
      if (!inst) continue
      const cur = m.get(inst.id) ?? { sqft: 0, name: inst.name, color: inst.color }
      cur.sqft += r.sqft ?? 0
      m.set(inst.id, cur)
    }
    return Array.from(m.values()).sort((a, b) => b.sqft - a.sqft)
  }, [commercial, installers])

  function StatCard({
    label,
    value,
    color,
    sub,
  }: {
    label: string
    value: string | number
    color?: string
    sub?: string
  }) {
    return (
      <div style={{ background: B.surface, borderRadius: 14, padding: 16, border: `1px solid ${B.border}` }}>
        <div
          style={{
            fontSize: 11,
            color: B.textTer,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            marginBottom: 6,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: color ?? B.text }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: B.textTer, marginTop: 3 }}>{sub}</div>}
      </div>
    )
  }

  function Label({ text }: { text: string }) {
    return (
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: B.textTer,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        {text}
      </div>
    )
  }

  return (
    <div>
      <Label text="Today" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <StatCard label="SQFT Today" value={todaySqft.toFixed(1)} color={B.yellow} />
        <StatCard label="Panels Today" value={todayPanels} />
      </div>

      <Label text="This week (commercial)" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <StatCard label="SQFT This Week" value={weekSqft.toFixed(1)} color={B.yellow} />
        <StatCard label="Panels This Week" value={weekPanels} />
      </div>

      <Label text="All time (commercial)" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <StatCard label="Total SQFT" value={totalSqft.toFixed(1)} color={B.yellow} sub="commercial" />
        <StatCard label="Total Panels" value={totalPanels} sub="commercial" />
        <StatCard label="Hours Logged" value={(totalMins / 60).toFixed(1) + 'h'} sub="commercial" />
        <StatCard label="Shop SQFT/HR" value={shopRate > 0 ? shopRate.toFixed(1) : '--'} sub="avg" />
      </div>

      <Label text="Installer share (commercial)" />
      <div style={{ background: B.surface, borderRadius: 16, padding: 16, border: `1px solid ${B.border}`, marginBottom: 20 }}>
        {byInstaller.map(r => (
          <div key={r.name} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, display: 'inline-block' }} />
                <span style={{ fontWeight: 500 }}>{isGuest ? <Redacted>{r.name}</Redacted> : r.name}</span>
              </span>
              <span style={{ color: B.textSec }}>
                {((r.sqft / totalSqftAll) * 100).toFixed(1)}% · {r.sqft.toFixed(1)} sqft
              </span>
            </div>
            <div style={{ height: 5, background: B.surface2, borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(r.sqft / totalSqftAll) * 100}%`,
                  background: r.color,
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        ))}
        {!byInstaller.length && <div style={{ fontSize: 13, color: B.textTer }}>No commercial data yet.</div>}
      </div>
    </div>
  )
}