import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useAppData } from '../../context/AppDataContext'
import { useAuth } from '../../context/AuthContext'
import { B, weekKey } from '../../lib/utils'

export default function Dashboard() {
  const { logs, installers } = useAppData()
  const { isGuest } = useAuth()

  const completeLogs = useMemo(
    () => logs.filter(r => r.status === 'Complete' && r.sqft && r.sqft > 0 && r.mins && r.mins > 0),
    [logs]
  )
  const commercial = useMemo(() => completeLogs.filter(r => !r.is_color_change), [completeLogs])

  const now = new Date()
  const todayStr = now.toDateString()
  const yesterdayStr = useMemo(() => { const d = new Date(now); d.setDate(d.getDate() - 1); return d.toDateString() }, [])

  const todayLogs = useMemo(
    () => completeLogs.filter(r => r.finish_ts && new Date(r.finish_ts).toDateString() === todayStr),
    [completeLogs]
  )
  const yesterdayLogs = useMemo(
    () => completeLogs.filter(r => r.finish_ts && new Date(r.finish_ts).toDateString() === yesterdayStr),
    [completeLogs, yesterdayStr]
  )
  const weekLogs = useMemo(
    () => commercial.filter(r => weekKey(r.start_ts) === weekKey(now.toISOString())),
    [commercial]
  )
  const lastWeekLogs = useMemo(() => {
    const lw = new Date(now); lw.setDate(lw.getDate() - 7)
    return commercial.filter(r => weekKey(r.start_ts) === weekKey(lw.toISOString()))
  }, [commercial])
  const thisMonthLogs = useMemo(() => commercial.filter(r => {
    if (!r.start_ts) return false
    const d = new Date(r.start_ts)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }), [commercial])
  const lastMonthLogs = useMemo(() => commercial.filter(r => {
    if (!r.start_ts) return false
    const d = new Date(r.start_ts)
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth()
  }), [commercial])

  const todaySqft = todayLogs.reduce((s, r) => s + (r.sqft ?? 0), 0)
  const todayPanels = todayLogs.length
  const yesterdaySqft = yesterdayLogs.reduce((s, r) => s + (r.sqft ?? 0), 0)
  const yesterdayPanels = yesterdayLogs.length
  const weekSqft = weekLogs.reduce((s, r) => s + (r.sqft ?? 0), 0)
  const weekPanels = weekLogs.length
  const lastWeekSqft = lastWeekLogs.reduce((s, r) => s + (r.sqft ?? 0), 0)
  const lastWeekPanels = lastWeekLogs.length
  const totalSqft = commercial.reduce((s, r) => s + (r.sqft ?? 0), 0)
  const totalPanels = commercial.length
  const totalMins = commercial.reduce((s, r) => s + (r.mins ?? 0), 0)
  const shopRate = totalMins > 0 ? totalSqft / (totalMins / 60) : 0

  const thisMonthSqft = thisMonthLogs.reduce((s, r) => s + (r.sqft ?? 0), 0)
  const lastMonthSqft = lastMonthLogs.reduce((s, r) => s + (r.sqft ?? 0), 0)
  const thisMonthPanels = thisMonthLogs.length
  const lastMonthPanels = lastMonthLogs.length
  const thisMonthMins = thisMonthLogs.reduce((s, r) => s + (r.mins ?? 0), 0)
  const lastMonthMins = lastMonthLogs.reduce((s, r) => s + (r.mins ?? 0), 0)
  const thisMonthRate = thisMonthMins > 0 ? thisMonthSqft / (thisMonthMins / 60) : 0
  const lastMonthRate = lastMonthMins > 0 ? lastMonthSqft / (lastMonthMins / 60) : 0

  function pct(current: number, prev: number): number | null {
    if (prev === 0) return null
    return ((current - prev) / prev) * 100
  }

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

  // Daily sqft — days of current week (Sun–Sat)
  const dailyData = useMemo(() => {
    const now = new Date()
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const todayDow = now.getDay()
    // Build Sun–Sat for the current week
    const result = days.map((label, dow) => {
      const d = new Date(now)
      d.setDate(now.getDate() - todayDow + dow)
      return { label, dateStr: d.toDateString(), sqft: 0, mins: 0, panels: 0, isToday: dow === todayDow }
    })
    for (const r of completeLogs) {
      if (!r.finish_ts) continue
      const d = new Date(r.finish_ts)
      const entry = result.find(e => e.dateStr === d.toDateString())
      if (entry) { entry.sqft += r.sqft ?? 0; entry.mins += r.mins ?? 0; entry.panels += 1 }
    }
    return result.map(e => ({ ...e, sqft: parseFloat(e.sqft.toFixed(1)), hours: parseFloat((e.mins / 60).toFixed(2)) }))
  }, [completeLogs])

  // Weekly sqft — last 8 weeks
  const weeklyData = useMemo(() => {
    const now = new Date()
    const weeks: { label: string; sqft: number; key: string }[] = []
    for (let i = 7; i >= 0; i--) {
      const ref = new Date(now)
      ref.setDate(now.getDate() - i * 7)
      const sunday = new Date(ref)
      sunday.setDate(ref.getDate() - ref.getDay())
      const key = sunday.toDateString()
      const month = sunday.toLocaleString('default', { month: 'short' })
      const day = sunday.getDate()
      const label = i === 0 ? 'This wk' : `${month} ${day}`
      weeks.push({ label, key, sqft: 0 })
    }
    for (const r of commercial) {
      const k = weekKey(r.start_ts)
      const w = weeks.find(w => w.key === k)
      if (w) w.sqft += r.sqft ?? 0
    }
    return weeks.map(w => ({ label: w.label, sqft: parseFloat(w.sqft.toFixed(1)) }))
  }, [commercial])

  // Monthly sqft — last 6 months
  const monthlyData = useMemo(() => {
    const now = new Date()
    const months: { label: string; year: number; month: number; sqft: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        label: d.toLocaleString('default', { month: 'short' }),
        year: d.getFullYear(),
        month: d.getMonth(),
        sqft: 0,
      })
    }
    for (const r of commercial) {
      if (!r.start_ts) continue
      const d = new Date(r.start_ts)
      const m = months.find(m => m.year === d.getFullYear() && m.month === d.getMonth())
      if (m) m.sqft += r.sqft ?? 0
    }
    return months.map(m => ({ label: m.label, sqft: parseFloat(m.sqft.toFixed(1)) }))
  }, [commercial])

  // Per-installer weekly sqft (this week)
  const weeklyByInstaller = useMemo(() => {
    return byInstaller
      .map(r => ({ name: isGuest ? '—' : r.name, sqft: parseFloat(r.sqft.toFixed(1)), color: r.color }))
  }, [byInstaller, isGuest])

  function StatCard({
    label,
    value,
    color,
    sub,
    delta,
  }: {
    label: string
    value: string | number
    color?: string
    sub?: string
    delta?: number | null
  }) {
    const up = delta != null && delta >= 0
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: color ?? B.text }}>{value}</div>
          {delta != null && (
            <div style={{ fontSize: 12, fontWeight: 700, color: up ? B.green : B.red }}>
              {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
            </div>
          )}
        </div>
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

  function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div style={{ background: B.surface, borderRadius: 16, padding: 16, border: `1px solid ${B.border}`, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: B.textSec, marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    )
  }

  const tooltipStyle = {
    background: B.surface2,
    border: `1px solid ${B.border}`,
    borderRadius: 8,
    fontSize: 12,
    color: B.text,
  }

  return (
    <div>
      <Label text="Today" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <StatCard label="SQFT Today" value={todaySqft.toFixed(1)} color={B.yellow} delta={pct(todaySqft, yesterdaySqft)} />
        <StatCard label="Panels Today" value={todayPanels} delta={pct(todayPanels, yesterdayPanels)} />
      </div>

      <Label text="This week (commercial)" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <StatCard label="SQFT This Week" value={weekSqft.toFixed(1)} color={B.yellow} delta={pct(weekSqft, lastWeekSqft)} />
        <StatCard label="Panels This Week" value={weekPanels} delta={pct(weekPanels, lastWeekPanels)} />
      </div>

      <ChartCard title="This Week — Daily SQFT">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={dailyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: B.textTer }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: B.textTer }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: B.surface2 }}
              formatter={(v: unknown, _n: unknown, item: { payload?: { panels?: number } }) =>
                [`${v} sqft · ${item.payload?.panels ?? 0} panels`, '']
              }
            />
            <Bar dataKey="sqft" radius={[4, 4, 0, 0]}>
              {dailyData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.isToday ? B.yellow : B.textTer}
                  fillOpacity={d.isToday ? 1 : 0.5}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="This Week — Daily Hours">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={dailyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: B.textTer }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: B.textTer }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: B.surface2 }}
              formatter={(v: unknown) => [`${v}h`, 'Hours']}
            />
            <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
              {dailyData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.isToday ? B.yellow : B.textTer}
                  fillOpacity={d.isToday ? 1 : 0.5}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <Label text="All time (commercial)" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <StatCard label="Total SQFT" value={totalSqft.toFixed(1)} color={B.yellow} sub="commercial" delta={pct(thisMonthSqft, lastMonthSqft)} />
        <StatCard label="Total Panels" value={totalPanels} sub="commercial" delta={pct(thisMonthPanels, lastMonthPanels)} />
        <StatCard label="Hours Logged" value={(totalMins / 60).toFixed(1) + 'h'} sub="commercial" delta={pct(thisMonthMins, lastMonthMins)} />
        <StatCard label="Shop SQFT/HR" value={shopRate > 0 ? shopRate.toFixed(1) : '--'} sub="avg" delta={pct(thisMonthRate, lastMonthRate)} />
      </div>

      <Label text="Trends (commercial)" />

      <ChartCard title="Weekly SQFT — Last 8 Weeks">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={weeklyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: B.textTer }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: B.textTer }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: B.surface2 }}
              formatter={(v: unknown) => [`${v} sqft`, 'SQFT']}
            />
            <Bar dataKey="sqft" radius={[4, 4, 0, 0]}>
              {weeklyData.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === weeklyData.length - 1 ? B.yellow : B.textTer}
                  fillOpacity={i === weeklyData.length - 1 ? 1 : 0.5}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Monthly SQFT — Last 6 Months">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: B.textTer }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: B.textTer }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: B.surface2 }}
              formatter={(v: unknown) => [`${v} sqft`, 'SQFT']}
            />
            <Bar dataKey="sqft" radius={[4, 4, 0, 0]}>
              {monthlyData.map((_e, i) => (
                <Cell
                  key={i}
                  fill={i === monthlyData.length - 1 ? B.yellow : B.textTer}
                  fillOpacity={i === monthlyData.length - 1 ? 1 : 0.5}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {weeklyByInstaller.length > 0 && (
        <>
          <Label text="Installer share (commercial)" />
          <ChartCard title="Total SQFT per Installer">
            <ResponsiveContainer width="100%" height={Math.max(120, weeklyByInstaller.length * 36)}>
              <BarChart
                data={weeklyByInstaller}
                layout="vertical"
                margin={{ top: 4, right: 40, left: 8, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 10, fill: B.textTer }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: B.textSec }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: B.surface2 }}
                formatter={(v: unknown) => [`${v} sqft`, 'SQFT']}
                />
                <Bar dataKey="sqft" radius={[0, 4, 4, 0]}>
                  {weeklyByInstaller.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}
    </div>
  )
}
