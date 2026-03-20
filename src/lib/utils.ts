export function parseDim(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return raw > 0 ? raw : null
  const s = String(raw).trim().toLowerCase()
  const ftIn = s.match(/^(\d+(?:\.\d+)?)\s*(?:ft|')\s*(\d+(?:\.\d+)?)\s*(?:in|")?$/)
  if (ftIn) return parseFloat(ftIn[1]) * 12 + parseFloat(ftIn[2])
  const ft = s.match(/^(\d+(?:\.\d+)?)\s*(?:ft|')$/)
  if (ft) return parseFloat(ft[1]) * 12
  const ins = s.match(/^(\d+(?:\.\d+)?)\s*(?:in|")$/)
  if (ins) return parseFloat(ins[1])
  const plain = parseFloat(s)
  return isNaN(plain) || plain <= 0 ? null : plain
}

export function calcSqft(h: number | null, w: number | null): number | null {
  if (!h || !w) return null
  return (h * w) / 144
}

export function calcMins(startTs: string, finishTs: string): number | null {
  const s = new Date(startTs).getTime()
  const f = new Date(finishTs).getTime()
  if (!s || !f) return null
  const d = (f - s) / 60000
  return d > 0 ? d : null
}

export function fmtTime(m: number | null): string {
  if (!m || m <= 0) return '--'
  const h = Math.floor(m / 60)
  const mn = Math.round(m % 60)
  return h > 0 ? `${h}h ${mn}m` : `${mn}m`
}

export function fmtDate(ts: string | null): string {
  if (!ts) return '--'
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtClock(ts: string | null): string {
  if (!ts) return '--'
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function fmtDue(ds: string | null): string {
  if (!ds) return 'No due date'
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function daysUntil(ds: string | null): number | null {
  if (!ds) return null
  return Math.ceil((new Date(ds + 'T23:59:59').getTime() - Date.now()) / 86400000)
}

export function isBirthday(b: string | null): boolean {
  if (!b) return false
  const t = new Date()
  const p = b.split('/')
  return parseInt(p[0]) - 1 === t.getMonth() && parseInt(p[1]) === t.getDate()
}

export function weekKey(ts: string): string | null {
  if (!ts) return null
  const d = new Date(ts)
  const s = new Date(d)
  s.setDate(d.getDate() - d.getDay())
  return s.toDateString()
}

export function enrichLog(raw: Record<string, unknown>): import('./types').Log {
  const h = raw.height_in as number | null
  const w = raw.width_in as number | null
  const sqft = calcSqft(h, w)
  const mins = raw.start_ts && raw.finish_ts
    ? calcMins(raw.start_ts as string, raw.finish_ts as string)
    : null
  const sqftHr = sqft && mins && mins > 0 ? sqft / (mins / 60) : null
  return { ...(raw as any), sqft, mins, sqftHr }
}

export const B = {
  yellow: '#F5C400', bg: '#000000', surface: '#1C1C1E', surface2: '#2C2C2E', surface3: '#3A3A3C',
  border: 'rgba(255,255,255,0.1)', text: '#FFFFFF', textSec: 'rgba(255,255,255,0.55)',
  textTer: 'rgba(255,255,255,0.3)', green: '#30D158', red: '#FF453A', blue: '#0A84FF',
  orange: '#FF9F0A', purple: '#BF5AF2',
}
export const CC = B.purple
export const SWATCH_COLORS = [
  '#F5C400','#FF9F0A','#FF6B35','#30D158','#4ECDC4',
  '#0A84FF','#40C8E0','#8AB4D4','#BF5AF2','#D4A84B','#A8D8A8','#F4A261',
]
export const TYPE_OPTS: import('./types').JobType[] = ['Wrap', 'Die-Cut', 'Removal', 'Other']
