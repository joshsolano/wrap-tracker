import { useState, useMemo, useRef } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { useAuth } from '../../context/AuthContext'
import { useBounties } from '../../hooks/useBounties'
import { Toast } from '../ui/Toast'
import { WarnModal } from '../ui/WarnModal'
import { B, fmtDate } from '../../lib/utils'
import type { Bounty, BountyCondition, ConditionType, Installer, Log, WarnConfig } from '../../lib/types'

// ── CSS animations ────────────────────────────────────────────────────────────

const BOUNTY_CSS = `
  @keyframes progress-shimmer {
    0% { left: -80%; }
    100% { left: 180%; }
  }
  @keyframes glow-pulse {
    0%, 100% { box-shadow: 0 0 10px var(--glow-color, rgba(245,196,0,0.3)); }
    50% { box-shadow: 0 0 28px var(--glow-color, rgba(245,196,0,0.7)); }
  }
  @keyframes urgency-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }
  .bounty-shimmer {
    position: relative;
    overflow: hidden;
  }
  .bounty-shimmer::after {
    content: '';
    position: absolute;
    top: 0;
    left: -80%;
    width: 60%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
    animation: progress-shimmer 2.2s ease-in-out infinite;
    border-radius: inherit;
  }
  .bounty-glow-pulse {
    animation: glow-pulse 2s ease-in-out infinite;
  }
  .bounty-urgency {
    animation: urgency-pulse 1.4s ease-in-out infinite;
  }
  @keyframes winner-entrance {
    0%   { transform: scale(0.6) translateY(40px); opacity: 0; }
    70%  { transform: scale(1.05) translateY(-5px); opacity: 1; }
    100% { transform: scale(1) translateY(0); opacity: 1; }
  }
  @keyframes trophy-bounce {
    0%, 100% { transform: translateY(0) rotate(-5deg); }
    50%       { transform: translateY(-10px) rotate(5deg); }
  }
  @keyframes confetti-drift {
    0%   { transform: translateY(-10px) rotate(0deg);   opacity: 1; }
    100% { transform: translateY(110px) rotate(720deg); opacity: 0; }
  }
  .bounty-winner-card {
    animation: winner-entrance 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
  .bounty-trophy {
    display: inline-block;
    animation: trophy-bounce 1.3s ease-in-out infinite;
  }
  @keyframes modal-slide-up {
    from { transform: translateY(40px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  .bounty-modal-sheet {
    animation: modal-slide-up 0.24s cubic-bezier(0.32, 0.72, 0, 1) forwards;
  }
  .bounty-active-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 12px;
  }
  @media (max-width: 540px) {
    .bounty-active-grid { grid-template-columns: 1fr; }
  }
`

// ── helpers ───────────────────────────────────────────────────────────────────

function minsToTime(m: number) {
  const h = Math.floor(m / 60) % 12 || 12
  const mm = String(m % 60).padStart(2, '0')
  const ap = Math.floor(m / 60) >= 12 ? 'PM' : 'AM'
  return `${h}:${mm} ${ap}`
}

function parseMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function condLabel(type: ConditionType, value: number, opt?: { social_action_type?: string | null }): string {
  switch (type) {
    case 'sqft_total':       return `${value.toFixed(0)} commercial sqft`
    case 'sqft_cc':          return `${value.toFixed(0)} CC sqft`
    case 'panels':           return `${value} commercial panels`
    case 'panels_cc':        return `${value} CC panels`
    case 'sqft_per_hr':      return `${value} sqft/hr average`
    case 'total_hours':      return `${value}h total time on clock`
    case 'work_days':        return `${value} days worked`
    case 'sqft_single_day':  return `${value} sqft in one day`
    case 'panels_single_day':return `${value} panels in one day`
    case 'best_sqft_hr_day': return `${value} sqft/hr in one day`
    case 'early_clock_in':   return `Clock in before ${minsToTime(value)}`
    case 'first_clock_in':   return `First to clock in ${value === 1 ? 'once' : value + ' days'}`
    case 'social_action':    return opt?.social_action_type === 'buy_coffee' ? 'Buy coffee for the crew ☕' : 'Buy lunch for the crew 🍔'
    case 'panels_early':   return `${value} panel${value !== 1 ? 's' : ''} finished before project due date`
  }
}

function condValueStr(type: ConditionType, value: number): string {
  switch (type) {
    case 'sqft_total':
    case 'sqft_cc':
    case 'sqft_single_day':   return value.toFixed(1) + ' sqft'
    case 'panels':
    case 'panels_cc':
    case 'panels_single_day': return value + ' panels'
    case 'sqft_per_hr':
    case 'best_sqft_hr_day':  return value.toFixed(1) + ' sqft/hr'
    case 'total_hours':       return value.toFixed(1) + 'h'
    case 'work_days':         return value + (value === 1 ? ' day' : ' days')
    case 'early_clock_in':    return value + (value === 1 ? ' early start' : ' early starts')
    case 'first_clock_in':    return value + (value === 1 ? ' first-in day' : ' first-in days')
    case 'social_action':     return 'committed'
    case 'panels_early':    return value + (value === 1 ? ' panel early' : ' panels early')
  }
}

function condTargetStr(cond: BountyCondition): string {
  const t = cond.condition_type as ConditionType
  switch (t) {
    case 'sqft_total':
    case 'sqft_cc':
    case 'sqft_single_day':   return cond.value.toFixed(0)
    case 'panels':
    case 'panels_cc':
    case 'panels_single_day': return String(cond.value)
    case 'sqft_per_hr':
    case 'best_sqft_hr_day':  return cond.value.toFixed(1)
    case 'total_hours':       return cond.value.toFixed(1) + 'h'
    case 'work_days':         return cond.value + ' days'
    case 'early_clock_in':    return 'before ' + minsToTime(cond.value)
    case 'first_clock_in':    return cond.value + (cond.value === 1 ? ' day' : ' days')
    case 'social_action':     return cond.confirmed_by_installer_id ? '✓ committed' : 'pending'
    case 'panels_early':    return String(cond.value) + (cond.value === 1 ? ' panel' : ' panels')
  }
}

function condRemainingStr(type: ConditionType, remaining: number): string {
  if (remaining <= 0) return ''
  switch (type) {
    case 'sqft_total':
    case 'sqft_cc':
    case 'sqft_single_day':   return `${remaining.toFixed(1)} sqft to go`
    case 'panels':
    case 'panels_cc':
    case 'panels_single_day': return `${Math.ceil(remaining)} panel${Math.ceil(remaining) !== 1 ? 's' : ''} to go`
    case 'sqft_per_hr':
    case 'best_sqft_hr_day':  return `need +${remaining.toFixed(1)} sqft/hr`
    case 'total_hours':       return `${remaining.toFixed(1)}h to go`
    case 'work_days':         return `${Math.ceil(remaining)} day${Math.ceil(remaining) !== 1 ? 's' : ''} to go`
    case 'early_clock_in':    return 'clock in early once'
    case 'first_clock_in':    return `be first to clock in ${Math.ceil(remaining)} more day${Math.ceil(remaining) !== 1 ? 's' : ''}`
    case 'social_action':     return 'claim this commitment'
    case 'panels_early':    return `${Math.ceil(remaining)} more panel${Math.ceil(remaining) !== 1 ? 's' : ''} before due date`
  }
}

function daysLeftFromEnd(endDate: string | null): number | null {
  if (!endDate) return null
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000)
}

function fmtTimeLeft(endDate: string | null): string {
  const d = daysLeftFromEnd(endDate)
  if (d == null) return 'Open ended'
  if (d < 0) return 'Ended'
  if (d === 0) return 'Ends today'
  if (d === 1) return '1 day left'
  return `${d} days left`
}

function timeLeftColor(endDate: string | null): string {
  const d = daysLeftFromEnd(endDate)
  if (d == null) return B.textTer
  if (d < 0) return B.textTer
  if (d <= 1) return B.red
  if (d <= 3) return B.orange
  return B.green
}

function sqftContext(sqft: number): string {
  if (sqft < 80)  return `${sqft.toFixed(0)} sqft — a solid small job`
  if (sqft < 200) return `${sqft.toFixed(0)} sqft ≈ one compact car`
  if (sqft < 400) return `${sqft.toFixed(0)} sqft ≈ one full sedan`
  if (sqft < 700) return `${sqft.toFixed(0)} sqft ≈ one full SUV`
  if (sqft < 1000) return `${sqft.toFixed(0)} sqft ≈ a van`
  return `${sqft.toFixed(0)} sqft ≈ ${(sqft / 9).toFixed(0)} parking spaces`
}

function isHotBounty(board: InstProg[]): boolean {
  if (board.length < 2) return false
  const [a, b] = board
  return a.overallPct > 0.6 && !a.allDone && (a.overallPct - b.overallPct) < 0.15
}

function genNextMoves(bounty: Bounty, board: InstProg[]): string[] {
  const conditions = bounty.conditions ?? []
  if (!board.length || !conditions.length || board[0].allDone) return []
  const moves: string[] = []
  const [leader, second] = board

  // Leader: bottleneck condition
  if (leader) {
    const bi = conditions.length > 1
      ? leader.conds.reduce((mi, c, i, arr) => c.pct < arr[mi].pct ? i : mi, 0)
      : 0
    const cond = conditions[bi]
    const prog = leader.conds[bi]
    if (cond && prog && !prog.done) {
      const type = cond.condition_type as ConditionType
      const rem  = (type === 'early_clock_in' ? 1 : cond.value) - prog.value
      const n    = leader.installer.name.split(' ')[0]
      if (rem > 0) {
        switch (type) {
          case 'sqft_total': case 'sqft_cc':
            moves.push(`${n}: ${rem.toFixed(1)} sqft to win`); break
          case 'panels': case 'panels_cc':
            moves.push(`${n}: ${Math.ceil(rem)} more panel${Math.ceil(rem)!==1?'s':''} to win`); break
          case 'sqft_single_day':
            moves.push(`${n}: hit ${rem.toFixed(1)} sqft in one day to win`); break
          case 'panels_single_day':
            moves.push(`${n}: ${Math.ceil(rem)} panels in one day to win`); break
          case 'work_days':
            moves.push(`${n}: ${Math.ceil(rem)} more day${Math.ceil(rem)!==1?'s':''} to win`); break
          case 'total_hours':
            moves.push(`${n}: ${rem.toFixed(1)}h more on clock to win`); break
          case 'best_sqft_hr_day':
            moves.push(`${n}: average ${cond.value.toFixed(1)} sqft/hr in one day to win`); break
          case 'sqft_per_hr':
            moves.push(`${n}: push avg to ${cond.value.toFixed(1)} sqft/hr to win`); break
          case 'early_clock_in':
            moves.push(`${n}: clock in before ${minsToTime(cond.value)} to win`); break
          case 'social_action':
            moves.push(`${n}: claim the social commitment to win`); break
          case 'panels_early': {
            const projRem = Math.ceil(cond.value - prog.value)
            if (projRem > 0) moves.push(`${n}: ${projRem} more panel${projRem !== 1 ? 's' : ''} before due date to win`); break
          }
        }
      }
    }
  }

  // 2nd: what to overtake leader
  if (second && leader && conditions[0]) {
    const type  = conditions[0].condition_type as ConditionType
    const leaderV = leader.conds[0]?.value ?? 0
    const secondV = second.conds[0]?.value ?? 0
    const gap   = leaderV - secondV
    const n     = second.installer.name.split(' ')[0]
    const ln    = leader.installer.name.split(' ')[0]
    if (gap > 0) {
      switch (type) {
        case 'sqft_total': case 'sqft_cc':
          moves.push(`${n}: ${(gap + 0.1).toFixed(1)} sqft to pass ${ln}`); break
        case 'panels': case 'panels_cc':
          moves.push(`${n}: ${Math.ceil(gap) + 1} panels to take the lead`); break
        case 'sqft_single_day':
          moves.push(`${n}: ${(gap + 0.1).toFixed(1)} sqft in one day to lead`); break
        case 'panels_single_day':
          moves.push(`${n}: ${Math.ceil(gap) + 1} panels in one day to lead`); break
        case 'work_days':
          moves.push(`${n}: ${Math.ceil(gap)} more day${Math.ceil(gap)!==1?'s':''} to tie ${ln}`); break
        case 'best_sqft_hr_day': case 'sqft_per_hr':
          moves.push(`${n}: beat ${leaderV.toFixed(1)} sqft/hr to lead`); break
        case 'early_clock_in':
          moves.push(`${n}: clock in early before ${ln} to catch up`); break
        case 'total_hours':
          moves.push(`${n}: ${(gap).toFixed(1)}h more than ${ln} to lead`); break
        case 'social_action': case 'first_clock_in': case 'panels_early':
          break
      }
    }
  }

  return moves.slice(0, 2)
}

function genMyNextMove(meId: string, bounty: Bounty, board: InstProg[]): string | null {
  const conditions = bounty.conditions ?? []
  if (!conditions.length || !board.length) return null
  const me = board.find(ip => ip.installer.id === meId)
  if (!me || me.allDone) return null
  const leader = board[0]
  const isLeading = me.installer.id === leader.installer.id

  // Find bottleneck condition for me
  const bi = conditions.length > 1
    ? me.conds.reduce((mi, c, i, arr) => c.pct < arr[mi].pct ? i : mi, 0)
    : 0
  const cond = conditions[bi]
  const prog = me.conds[bi]
  if (!cond || !prog || prog.done) return null

  const type   = cond.condition_type as ConditionType
  const target = type === 'early_clock_in' ? 1 : cond.value
  const rem    = target - prog.value

  if (isLeading) {
    if (rem <= 0) return null
    switch (type) {
      case 'sqft_total': case 'sqft_cc':
        return `${rem.toFixed(1)} sqft closes it out`
      case 'panels': case 'panels_cc':
        return `${Math.ceil(rem)} more panel${Math.ceil(rem) !== 1 ? 's' : ''} to win`
      case 'sqft_single_day':
        return `Hit ${cond.value.toFixed(0)} sqft in one day to win`
      case 'panels_single_day':
        return `${Math.ceil(rem)} panels in one day seals it`
      case 'work_days':
        return `${Math.ceil(rem)} more day${Math.ceil(rem) !== 1 ? 's' : ''} and you win`
      case 'total_hours':
        return `${rem.toFixed(1)}h more on clock to finish`
      case 'best_sqft_hr_day': case 'sqft_per_hr':
        return `Average ${cond.value.toFixed(1)} sqft/hr in one day to win`
      case 'early_clock_in':
        return `Clock in before ${minsToTime(cond.value)} to win`
      case 'first_clock_in':
        return `Be first in ${Math.ceil(rem)} more day${Math.ceil(rem) !== 1 ? 's' : ''} to win`
      case 'social_action':
        return 'Claim the social commitment in the bounty details to win'
      case 'panels_early': {
        const rem = Math.ceil(target - prog.value)
        return rem > 0 ? `Finish ${rem} more panel${rem !== 1 ? 's' : ''} before their project due date to win` : null
      }
    }
  } else {
    const leaderVal = leader?.conds[bi]?.value ?? 0
    const gap = leaderVal - prog.value
    const ln = leader?.installer.name.split(' ')[0] ?? 'leader'
    if (gap > 0) {
      switch (type) {
        case 'sqft_total': case 'sqft_cc':
          return `You need ${(gap + 1).toFixed(0)} sqft to pass ${ln}`
        case 'panels': case 'panels_cc':
          return `You need ${Math.ceil(gap) + 1} more panel${Math.ceil(gap) + 1 !== 1 ? 's' : ''} to take the lead`
        case 'sqft_single_day':
          return `One day over ${(leaderVal + 1).toFixed(0)} sqft flips this`
        case 'panels_single_day':
          return `You need ${Math.ceil(gap) + 1} panels in one day to take first`
        case 'work_days':
          return `Work ${Math.ceil(gap)} more day${Math.ceil(gap) !== 1 ? 's' : ''} to tie ${ln}`
        case 'total_hours':
          return `Clock ${gap.toFixed(1)}h more than ${ln} to take the lead`
        case 'best_sqft_hr_day': case 'sqft_per_hr':
          return `Beat ${ln}'s ${leaderVal.toFixed(1)} sqft/hr to take the lead`
        case 'early_clock_in':
          return `Clock in before ${minsToTime(cond.value)} once to catch up`
        case 'first_clock_in':
          return `You need ${Math.ceil(gap) + 1} more first-in days to pass ${ln}`
        case 'social_action':
          return `Claim the social commitment before ${ln} does`
        case 'panels_early': {
          const projGap = Math.ceil(gap) + 1
          return `Finish ${projGap} more panel${projGap !== 1 ? 's' : ''} before due date to take the lead`
        }
      }
    } else if (rem > 0) {
      switch (type) {
        case 'sqft_total': case 'sqft_cc':
          return `You're tied — ${rem.toFixed(0)} sqft to win`
        case 'panels': case 'panels_cc':
          return `Tied — ${Math.ceil(rem)} more panel${Math.ceil(rem) !== 1 ? 's' : ''} to win`
        default: {
          const s = condRemainingStr(type, rem)
          return s || null
        }
      }
    }
  }
  return null
}

// ── progress calculation ──────────────────────────────────────────────────────

interface CondProg { value: number; pct: number; done: boolean }
interface InstProg {
  installer: Installer
  conds: CondProg[]
  overallPct: number
  allDone: boolean
  latestTs: string | null  // most recent relevant log — used for tie-breaking
}

function groupByDay(logs: Log[], commercial: boolean): Map<string, Log[]> {
  const m = new Map<string, Log[]>()
  for (const r of logs) {
    if (commercial && r.is_color_change) continue
    if (!commercial && !r.is_color_change) continue
    const key = new Date(r.start_ts).toDateString()
    const arr = m.get(key) ?? []
    arr.push(r)
    m.set(key, arr)
  }
  return m
}

function calcInstProg(
  installerId: string,
  conditions: BountyCondition[],
  logs: Log[],
  bounty: Bounty,
  projects?: import('../../lib/types').Project[]
): CondProg[] {
  const start = new Date(bounty.start_date + 'T00:00:00')
  const end   = bounty.end_date ? new Date(bounty.end_date + 'T23:59:59') : new Date()

  const inRange = logs.filter(r =>
    r.installer_id === installerId &&
    r.status === 'Complete' &&
    r.start_ts &&
    new Date(r.start_ts) >= start &&
    new Date(r.start_ts) <= end
  )

  const commercial = inRange.filter(r => !r.is_color_change)
  const cc         = inRange.filter(r =>  r.is_color_change)

  return conditions.map(cond => {
    let value  = 0
    let target = cond.value

    switch (cond.condition_type) {
      case 'sqft_total':
        value = commercial.reduce((s, r) => s + (r.sqft ?? 0), 0)
        break

      case 'sqft_cc':
        value = cc.reduce((s, r) => s + (r.sqft ?? 0), 0)
        break

      case 'panels':
        value = commercial.length
        break

      case 'panels_cc':
        value = cc.length
        break

      case 'sqft_per_hr': {
        const withRate = commercial.filter(r => r.sqftHr != null)
        value = withRate.length > 0
          ? withRate.reduce((s, r) => s + (r.sqftHr ?? 0), 0) / withRate.length
          : 0
        break
      }

      case 'total_hours':
        value = inRange.reduce((s, r) => s + (r.mins ?? 0), 0) / 60
        break

      case 'work_days': {
        const days = new Set(inRange.map(r => new Date(r.start_ts).toDateString()))
        value = days.size
        break
      }

      case 'sqft_single_day': {
        const byDay = groupByDay(inRange, true)
        if (byDay.size > 0) {
          value = Math.max(...Array.from(byDay.values()).map(arr =>
            arr.reduce((s, r) => s + (r.sqft ?? 0), 0)
          ))
        }
        break
      }

      case 'panels_single_day': {
        const byDay = groupByDay(inRange, true)
        if (byDay.size > 0) {
          value = Math.max(...Array.from(byDay.values()).map(arr => arr.length))
        }
        break
      }

      case 'best_sqft_hr_day': {
        const byDay = groupByDay(inRange, true)
        for (const arr of byDay.values()) {
          const totalSqft = arr.reduce((s, r) => s + (r.sqft ?? 0), 0)
          const totalMins = arr.reduce((s, r) => s + (r.mins ?? 0), 0)
          if (totalMins > 0) value = Math.max(value, totalSqft / (totalMins / 60))
        }
        break
      }

      case 'early_clock_in': {
        const cutoff = cond.value
        const days = new Set<string>()
        for (const r of inRange) {
          const d = new Date(r.start_ts)
          if (d.getHours() * 60 + d.getMinutes() < cutoff) days.add(d.toDateString())
        }
        value  = days.size
        target = 1
        break
      }

      case 'first_clock_in': {
        // All installer logs in range (not filtered to this installer)
        const allInRange = logs.filter(r =>
          r.status === 'Complete' && r.start_ts &&
          new Date(r.start_ts) >= start && new Date(r.start_ts) <= end
        )
        // For each calendar day, find the earliest clock-in across all installers
        const earliestByDay = new Map<string, { installerId: string | null; ts: number }>()
        for (const r of allInRange) {
          const key = new Date(r.start_ts).toDateString()
          const ts  = new Date(r.start_ts).getTime()
          const cur = earliestByDay.get(key)
          if (!cur || ts < cur.ts) earliestByDay.set(key, { installerId: r.installer_id, ts })
        }
        // Count days where this installer was first
        for (const entry of earliestByDay.values()) {
          if (entry.installerId === installerId) value++
        }
        break
      }

      case 'social_action': {
        value  = cond.confirmed_by_installer_id === installerId ? 1 : 0
        target = 1
        break
      }

      case 'panels_early': {
        // Count each panel this installer personally finished before the project's due date.
        // Team projects are fair: you only get credit for panels YOU completed early.
        if (projects) {
          const projectMap = new Map(projects.map(p => [p.id, p]))
          for (const r of inRange) {
            if (!r.project_id || !r.finish_ts) continue
            const proj = projectMap.get(r.project_id)
            if (!proj?.due_date) continue
            const dueMs    = new Date(proj.due_date + 'T23:59:59').getTime()
            const finishMs = new Date(r.finish_ts).getTime()
            if (finishMs < dueMs) value++
          }
        }
        break
      }
    }

    const pct = target > 0 ? Math.min(1, value / target) : 0
    return { value, pct, done: pct >= 1 }
  })
}

function calcLeaderboard(bounty: Bounty, installers: Installer[], logs: Log[], projects?: import('../../lib/types').Project[]): InstProg[] {
  const conditions = bounty.conditions ?? []
  const start = new Date(bounty.start_date + 'T00:00:00')
  const end   = bounty.end_date ? new Date(bounty.end_date + 'T23:59:59') : new Date()
  return installers
    .map(inst => {
      const conds      = conditions.length > 0 ? calcInstProg(inst.id, conditions, logs, bounty, projects) : []
      const overallPct = conds.length > 0 ? Math.min(...conds.map(c => c.pct)) : 0
      const allDone    = conds.length > 0 && conds.every(c => c.done)
      const inRange    = logs.filter(r =>
        r.installer_id === inst.id && r.status === 'Complete' &&
        r.start_ts && new Date(r.start_ts) >= start && new Date(r.start_ts) <= end
      )
      const latestTs = inRange.reduce<string | null>((latest, r) => {
        const ts = r.finish_ts ?? r.start_ts
        return !latest || ts > latest ? ts : latest
      }, null)
      return { installer: inst, conds, overallPct, allDone, latestTs }
    })
    .filter(ip => ip.conds.some(c => c.value > 0) || ip.allDone)
    .sort((a, b) => {
      if (a.allDone && !b.allDone) return -1
      if (!a.allDone && b.allDone) return 1
      if (b.overallPct !== a.overallPct) return b.overallPct - a.overallPct
      // Tie-break: whoever got there first wins (earlier latest log = they crossed the line sooner)
      if (a.latestTs && b.latestTs) return a.latestTs < b.latestTs ? -1 : 1
      return 0
    })
}

// ── fun facts ─────────────────────────────────────────────────────────────────

function genFunFacts(bounty: Bounty, board: InstProg[], allLogs: Log[]): string[] {
  const facts: string[] = []
  if (!board.length) return facts

  const conditions  = bounty.conditions ?? []
  const leader      = board[0]
  const second      = board[1]
  const isParlay    = conditions.length > 1
  const dLeft       = daysLeftFromEnd(bounty.end_date)
  const firstCond   = conditions[0]
  const leaderCond0 = leader.conds[0]
  const secondCond0 = second?.conds[0]

  // ── today impact ──
  const todayStr = new Date().toDateString()
  const todayLogs = allLogs.filter(r =>
    r.status === 'Complete' && r.start_ts && new Date(r.start_ts).toDateString() === todayStr
  )
  if (todayLogs.length > 0 && firstCond && board.length >= 2) {
    const t = firstCond.condition_type as ConditionType
    if (t === 'sqft_total' || t === 'sqft_cc') {
      const leaderToday = todayLogs
        .filter(r => r.installer_id === leader.installer.id && (t === 'sqft_cc' ? r.is_color_change : !r.is_color_change))
        .reduce((s, r) => s + (r.sqft ?? 0), 0)
      const secondToday = todayLogs
        .filter(r => r.installer_id === board[1].installer.id && (t === 'sqft_cc' ? r.is_color_change : !r.is_color_change))
        .reduce((s, r) => s + (r.sqft ?? 0), 0)
      if (secondToday > leaderToday && secondToday > 0) {
        facts.push(`${board[1].installer.name.split(' ')[0]} is outpacing the leader today (${secondToday.toFixed(0)} sqft)`)
      } else if (leaderToday > 20) {
        facts.push(`${leader.installer.name.split(' ')[0]} added ${leaderToday.toFixed(0)} sqft today`)
      }
    }
  }

  // ── gap ──
  if (firstCond && leaderCond0 && secondCond0) {
    const gap  = leaderCond0.value - secondCond0.value
    const name = leader.installer.name.split(' ')[0]
    const t    = firstCond.condition_type as ConditionType
    if (gap > 0) {
      if (t === 'sqft_total' || t === 'sqft_cc' || t === 'sqft_single_day')
        facts.push(`${name} is ${gap.toFixed(1)} sqft ahead — one good job flips this`)
      else if (t === 'panels' || t === 'panels_cc' || t === 'panels_single_day')
        facts.push(`Only ${Math.round(gap)} panel${Math.round(gap) !== 1 ? 's' : ''} between 1st and 2nd`)
      else if (t === 'sqft_per_hr' || t === 'best_sqft_hr_day')
        facts.push(`${name} is ${gap.toFixed(1)} sqft/hr ahead — one fast session takes the lead`)
      else if (t === 'early_clock_in')
        facts.push(`${name} has ${Math.round(leaderCond0.value - secondCond0.value)} more early start${Math.round(leaderCond0.value - secondCond0.value) !== 1 ? 's' : ''}`)
    } else if (gap === 0 && leaderCond0.value > 0) {
      facts.push(`Dead heat — whoever shows up tomorrow takes it`)
    }
  }

  // ── distance to win ──
  if (firstCond && leaderCond0 && leader.overallPct > 0.45 && leader.overallPct < 1) {
    const t   = firstCond.condition_type as ConditionType
    const tgt = t === 'early_clock_in' ? 1 : firstCond.value
    const rem = tgt - leaderCond0.value
    const n   = leader.installer.name.split(' ')[0]
    if (rem > 0) {
      if (t === 'sqft_total' || t === 'sqft_cc')
        facts.push(`${n}: ${rem.toFixed(1)} sqft to close it out`)
      else if (t === 'panels' || t === 'panels_cc')
        facts.push(`${n} needs ${Math.ceil(rem)} more panel${Math.ceil(rem) !== 1 ? 's' : ''} to win`)
      else if (t === 'sqft_single_day')
        facts.push(`Hit ${rem.toFixed(1)} sqft in one day to cash`)
      else if (t === 'total_hours')
        facts.push(`${n} is ${rem.toFixed(1)}h away — within one shift`)
      else if (t === 'work_days')
        facts.push(`${Math.ceil(rem)} more day${Math.ceil(rem) !== 1 ? 's' : ''} and ${n} wins`)
    }
  }

  // ── wide open / leader vulnerable ──
  if (board.length >= 2 && leader.overallPct < 0.3) {
    facts.push('No one owns this yet — wide open')
  } else if (firstCond && leaderCond0 && secondCond0 && leader.overallPct > 0.5) {
    const gap = leaderCond0.value - secondCond0.value
    const t   = firstCond.condition_type as ConditionType
    if ((t === 'sqft_total' || t === 'sqft_cc') && gap > 0 && gap < 80) {
      facts.push(`Leader is vulnerable — gap is ${gap.toFixed(0)} sqft`)
    }
  }

  // ── "one good day" framing ──
  if (firstCond && leaderCond0) {
    const t = firstCond.condition_type as ConditionType
    if ((t === 'sqft_total' || t === 'sqft_cc') && leader.overallPct < 0.6) {
      const shopLogs = allLogs.filter(r => r.status === 'Complete' && !r.is_color_change && r.sqft && r.mins)
      if (shopLogs.length > 5) {
        const avgDay = shopLogs.reduce((s, r) => s + (r.sqft ?? 0), 0) /
          new Set(shopLogs.map(r => new Date(r.start_ts).toDateString())).size
        if (avgDay > 0 && avgDay / firstCond.value > 0.25) {
          facts.push(`One strong day (avg ${avgDay.toFixed(0)} sqft) could flip this`)
        }
      }
    }
    if (t === 'early_clock_in' && leaderCond0.value === 0) {
      facts.push(`First one in before ${minsToTime(firstCond.value)} takes an instant lead`)
    }
  }

  // ── parlay ──
  if (isParlay && leader) {
    const doneConds = leader.conds.filter(c => c.done).length
    const total     = conditions.length
    if (doneConds > 0 && doneConds < total - 1) {
      facts.push(`${doneConds} of ${total} legs locked — final stretch`)
    } else if (doneConds === 0) {
      facts.push(`Parlay still open — first mover has the advantage`)
    }
  }

  // ── urgency ──
  if (dLeft != null && dLeft <= 2 && dLeft >= 0 && leader.overallPct < 1) {
    facts.push(dLeft === 0
      ? 'Last day — someone step up'
      : '48 hours left — clock is running'
    )
  }

  // ── sqft context ──
  if (firstCond && (firstCond.condition_type === 'sqft_total' || firstCond.condition_type === 'sqft_single_day')) {
    facts.push(sqftContext(firstCond.value))
  }

  // ── early-start pressure ──
  if (firstCond?.condition_type === 'early_clock_in' && board.length > 1) {
    const behindCount = board.filter(ip => ip.conds[0]?.value === 0).length
    if (behindCount > 0)
      facts.push(`${behindCount} installer${behindCount > 1 ? 's have' : ' has'} zero early starts — wide open`)
  }

  return facts.slice(0, 2)
}

// ── sub-components ────────────────────────────────────────────────────────────

function SocialActionRow({
  cond,
  meInstaller,
  installers,
  isGuest,
  onConfirm,
}: {
  cond: BountyCondition
  meInstaller?: Installer | null
  installers: Installer[]
  isGuest: boolean
  onConfirm: (condId: string, installerId: string) => Promise<{ error: string | null }>
}) {
  const [loading, setLoading] = useState(false)
  const claimed = !!cond.confirmed_by_installer_id
  const claimer = claimed ? installers.find(i => i.id === cond.confirmed_by_installer_id) : null
  const iMyClaim = meInstaller && cond.confirmed_by_installer_id === meInstaller.id
  const canClaim = !isGuest && !!meInstaller && !claimed

  async function handleClaim() {
    if (!meInstaller || loading || claimed) return
    setLoading(true)
    await onConfirm(cond.id, meInstaller.id)
    setLoading(false)
  }

  const label = cond.social_action_type === 'buy_coffee' ? 'Buy coffee for the crew ☕' : 'Buy lunch for the crew 🍔'

  return (
    <div style={{
      background: claimed ? B.green + '0A' : B.surface2,
      border: `1px solid ${claimed ? B.green + '33' : B.border}`,
      borderRadius: 10,
      padding: '10px 14px',
      marginBottom: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: claimed ? B.green + '22' : B.surface3,
        border: `1px solid ${claimed ? B.green + '44' : B.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, flexShrink: 0,
      }}>
        {claimed ? '✓' : '🤝'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: claimed ? B.green : B.text, marginBottom: 2 }}>
          {label}
        </div>
        {claimed ? (
          <div style={{ fontSize: 11, color: B.textTer, display: 'flex', alignItems: 'center', gap: 6 }}>
            {claimer && (
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: claimer.color,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800, color: B.bg, flexShrink: 0,
              }}>
                {claimer.name.charAt(0)}
              </div>
            )}
            <span>{iMyClaim ? 'You committed' : `${claimer?.name.split(' ')[0] ?? 'Someone'} committed`}</span>
            {cond.confirmed_at && <span>· {new Date(cond.confirmed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: B.textTer }}>
            {isGuest ? 'Sign in to claim' : 'First to commit gets credit for this leg'}
          </div>
        )}
      </div>

      {canClaim && (
        <button
          onClick={handleClaim}
          disabled={loading}
          style={{
            fontSize: 11, fontWeight: 800, color: B.bg,
            background: B.yellow, border: 'none', borderRadius: 8,
            padding: '6px 12px', cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1, flexShrink: 0,
          }}
        >
          {loading ? '…' : "I'll do it"}
        </button>
      )}

      {!canClaim && !claimed && !isGuest && (
        <div style={{ fontSize: 10, color: B.textTer, fontStyle: 'italic', flexShrink: 0 }}>Available</div>
      )}
    </div>
  )
}

const MEDALS     = ['#F5C400', '#B0B8C1', '#CD7F32']
const MEDAL_GLOW = ['rgba(245,196,0,0.35)', 'rgba(176,184,193,0.25)', 'rgba(205,127,50,0.25)']

function ConditionRow({
  cond,
  prog,
  showRemaining,
}: {
  cond: BountyCondition
  prog?: CondProg
  showRemaining?: boolean
}) {
  const type    = cond.condition_type as ConditionType
  const label   = condLabel(type, cond.value)
  const pct     = prog?.pct ?? 0
  const done    = prog?.done ?? false
  const nearWin = pct >= 0.75 && !done
  const target  = type === 'early_clock_in' ? 1 : cond.value
  const remaining = prog ? target - prog.value : target

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{
          fontSize: 12,
          color: done ? B.green : B.textSec,
          display: 'flex',
          gap: 7,
          alignItems: 'center',
        }}>
          {done
            ? <span style={{ color: B.green, fontWeight: 900, fontSize: 14, lineHeight: 1 }}>✓</span>
            : <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: nearWin ? B.yellow : B.surface3,
                display: 'inline-block', flexShrink: 0,
                boxShadow: nearWin ? `0 0 6px ${B.yellow}88` : 'none',
              }}
              />
          }
          <span style={{ fontWeight: done ? 700 : 500 }}>{label}</span>
        </span>
        {prog && (
          <span style={{ fontSize: 11, fontWeight: 700, color: done ? B.green : nearWin ? B.yellow : B.textSec, flexShrink: 0 }}>
            {condValueStr(type, prog.value)} / {condTargetStr(cond)}
          </span>
        )}
      </div>

      <div style={{ height: 8, background: B.surface3, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
        <div
          className={nearWin ? 'bounty-shimmer' : ''}
          style={{
            height: '100%',
            width: `${Math.min(100, pct * 100)}%`,
            background: done
              ? B.green
              : nearWin
                ? `linear-gradient(90deg, ${B.yellow}, #FF9F0A)`
                : `linear-gradient(90deg, ${B.yellow}88, ${B.yellow})`,
            borderRadius: 4,
            transition: 'width 0.7s ease',
          }}
        />
      </div>

      {showRemaining && prog && !done && remaining > 0 && pct > 0.4 && (
        <div style={{ fontSize: 10, color: nearWin ? B.yellow : B.textTer, marginTop: 4, fontWeight: nearWin ? 700 : 400 }}>
          {condRemainingStr(type, remaining)}
        </div>
      )}
    </div>
  )
}

function MiniLeaderboard({
  board,
  conditions,
  winnerId,
  onAward,
  isAdmin,
}: {
  board: InstProg[]
  conditions: BountyCondition[]
  winnerId: string | null
  onAward?: (ip: InstProg) => void
  isAdmin: boolean
}) {
  const top = board.slice(0, 4)
  if (!top.length) return (
    <div style={{ fontSize: 12, color: B.textTer, padding: '8px 0', fontStyle: 'italic' }}>No activity yet — be first.</div>
  )

  const isCloseRace = top.length >= 2 &&
    top[0].overallPct > 0.15 &&
    (top[0].overallPct - top[1].overallPct) < 0.12

  return (
    <div>
      {isCloseRace && (
        <div style={{
          fontSize: 10, fontWeight: 800, color: B.orange,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          marginBottom: 8, padding: '5px 10px',
          background: B.orange + '0E', border: `1px solid ${B.orange}28`,
          borderRadius: 7,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span className="bounty-urgency" style={{ width: 6, height: 6, borderRadius: '50%', background: B.orange, display: 'inline-block', flexShrink: 0 }} />
          {top[0].installer.name.split(' ')[0]} vs {top[1].installer.name.split(' ')[0]} — neck and neck
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {top.map((ip, i) => {
          const isLeader = i === 0
          const isWinner = ip.installer.id === winnerId
          const nearWin  = ip.overallPct >= 0.8 && !ip.allDone

          return (
            <div
              key={ip.installer.id}
              className={nearWin && isLeader ? 'bounty-glow-pulse' : ''}
              style={{
                '--glow-color': MEDAL_GLOW[i] ?? 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 10,
                background: isWinner
                  ? `linear-gradient(90deg, ${B.yellow}14, ${B.yellow}06)`
                  : isLeader
                    ? `${B.yellow}08`
                    : isCloseRace && i === 1
                      ? `${B.orange}06`
                      : B.surface2,
                border: `1px solid ${isWinner ? B.yellow + '55' : isLeader ? B.yellow + '22' : isCloseRace && i === 1 ? B.orange + '22' : 'transparent'}`,
              } as React.CSSProperties}
            >
              <div style={{
                fontSize: 11, fontWeight: 800,
                color: MEDALS[i] ?? B.textTer,
                minWidth: 18, textAlign: 'center',
              }}>
                {i + 1}
              </div>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: ip.installer.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800, color: B.bg, flexShrink: 0,
                boxShadow: isLeader && ip.overallPct > 0
                  ? `0 0 12px ${ip.installer.color}55`
                  : 'none',
              }}>
                {ip.installer.name.charAt(0)}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: isLeader ? 700 : 500, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {ip.installer.name.split(' ')[0]}
                  {isWinner && <span style={{ fontSize: 11 }}>🏆</span>}
                  {ip.allDone && !isWinner && (
                    <span style={{ fontSize: 9, color: B.green, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', background: B.green + '18', padding: '1px 5px', borderRadius: 4 }}>
                      DONE
                    </span>
                  )}
                </div>
                {/* Per-condition progress for parlay */}
                {conditions.length > 1 ? (
                  <div style={{ display: 'flex', gap: 3 }}>
                    {conditions.map((_, ci) => {
                      const cp = ip.conds[ci]
                      return (
                        <div key={ci} style={{
                          flex: 1, height: 4, background: B.surface3, borderRadius: 2, overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.min(100, (cp?.pct ?? 0) * 100)}%`,
                            background: cp?.done ? B.green : ip.installer.color,
                            borderRadius: 2,
                          }} />
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ height: 4, background: B.surface3, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, ip.overallPct * 100)}%`,
                      background: ip.allDone ? B.green : ip.installer.color,
                      borderRadius: 2,
                      transition: 'width 0.7s',
                    }} />
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 44 }}>
                <div style={{
                  fontSize: 15, fontWeight: 800,
                  color: ip.allDone ? B.green : isLeader ? B.yellow : B.text,
                }}>
                  {(ip.overallPct * 100).toFixed(0)}%
                </div>
                {i > 0 && conditions[0] && top[0] && (() => {
                  const type = conditions[0].condition_type as ConditionType
                  const lv = top[0].conds[0]?.value ?? 0
                  const mv = ip.conds[0]?.value ?? 0
                  const gap = lv - mv
                  if (gap <= 0) return null
                  let label = ''
                  if (type === 'sqft_total' || type === 'sqft_cc' || type === 'sqft_single_day')
                    label = `${gap.toFixed(0)} sqft back`
                  else if (type === 'panels' || type === 'panels_cc' || type === 'panels_single_day')
                    label = `${Math.round(gap)} panel${Math.round(gap)!==1?'s':''} back`
                  else if (type === 'total_hours')
                    label = `${gap.toFixed(1)}h back`
                  else if (type === 'work_days')
                    label = `${Math.round(gap)} day${Math.round(gap)!==1?'s':''} back`
                  else
                    label = `${((top[0].overallPct - ip.overallPct) * 100).toFixed(0)}% back`
                  const isSecond = i === 1
                  return (
                    <div style={{
                      fontSize: 10, fontWeight: isSecond && isCloseRace ? 700 : 500,
                      color: isSecond && isCloseRace ? B.orange : B.textTer,
                      marginTop: 2,
                    }}>{label}</div>
                  )
                })()}
                {isAdmin && onAward && !winnerId && (
                  <button
                    onClick={e => { e.stopPropagation(); onAward(ip) }}
                    style={{
                      fontSize: 9, color: B.textTer, background: 'none',
                      border: `1px solid ${B.border}`, borderRadius: 5,
                      padding: '2px 5px', cursor: 'pointer', marginTop: 2, display: 'block',
                      letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600,
                    }}
                  >
                    Award
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FeaturedBountyCard({
  bounty,
  board,
  facts,
  isAdmin,
  onAward,
  onToggle,
  onDelete,
  meInstaller,
  onSelect,
}: {
  bounty: Bounty
  board: InstProg[]
  facts: string[]
  isAdmin: boolean
  onAward: (ip: InstProg) => void
  onToggle: () => void
  onDelete: () => void
  meInstaller?: Installer | null
  onSelect?: () => void
}) {
  const conditions = bounty.conditions ?? []
  const leader     = board[0]
  const tLeft      = fmtTimeLeft(bounty.end_date)
  const tColor     = timeLeftColor(bounty.end_date)
  const dLeft      = daysLeftFromEnd(bounty.end_date)
  const isParlay   = conditions.length > 1
  const winner     = board.find(ip => ip.installer.id === bounty.winner_installer_id)
  const isUrgent   = dLeft != null && dLeft <= 2 && dLeft >= 0 && !winner
  const doneConds  = leader?.conds.filter(c => c.done).length ?? 0
  const isHot      = !winner && isHotBounty(board)
  const nextMoves  = !winner ? genNextMoves(bounty, board) : []

  const meProgress = meInstaller ? board.find(ip => ip.installer.id === meInstaller.id) : null
  const myMove     = (!winner && meInstaller) ? genMyNextMove(meInstaller.id, bounty, board) : null
  const iAmLeading = meProgress ? meProgress.installer.id === leader?.installer.id : false


  return (
    <div
      className={isHot ? 'bounty-glow-pulse' : ''}
      onClick={onSelect}
      style={{
        '--glow-color': isHot ? `${B.orange}55` : `rgba(245,196,0,0.3)`,
        background: 'linear-gradient(145deg, #1C1C1E 0%, #222220 100%)',
        border: `1.5px solid ${isUrgent ? B.red + '55' : isHot ? B.orange + '44' : B.yellow + '33'}`,
        borderRadius: 18,
        padding: 15,
        marginBottom: 16,
        boxShadow: `0 0 48px rgba(245,196,0,0.06), 0 12px 40px rgba(0,0,0,0.55)`,
        position: 'relative',
        overflow: 'hidden',
        cursor: onSelect ? 'pointer' : 'default',
      } as React.CSSProperties}
    >
      {/* Background glow */}
      <div style={{
        position: 'absolute', top: -40, right: -40,
        width: 220, height: 220,
        background: `radial-gradient(circle, ${isUrgent ? B.red : B.yellow}0D 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, position: 'relative' }}>
        <div style={{ flex: 1, marginRight: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
            <div style={{
              fontSize: 9, fontWeight: 900, color: B.yellow,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              background: `${B.yellow}14`, border: `1px solid ${B.yellow}33`,
              borderRadius: 5, padding: '2px 7px',
            }}>
              {winner ? '🏆 Closed' : isParlay ? '⚡ Parlay' : '◆ Featured'}
            </div>
            {isParlay && !winner && leader && (
              <div style={{
                fontSize: 9, fontWeight: 800,
                color: doneConds === conditions.length ? B.green : B.textSec,
                background: doneConds === conditions.length ? B.green + '18' : B.surface3,
                border: `1px solid ${doneConds === conditions.length ? B.green + '44' : 'transparent'}`,
                borderRadius: 5, padding: '2px 7px', letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                {doneConds}/{conditions.length} done
              </div>
            )}
            {isHot && !winner && (
              <div style={{
                fontSize: 9, fontWeight: 900, color: B.orange,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                background: B.orange + '18', border: `1px solid ${B.orange}44`,
                borderRadius: 5, padding: '2px 7px',
              }}>
                🔥 Hot
              </div>
            )}
            {isAdmin && !winner && (
              <div style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
                <button onClick={e => { e.stopPropagation(); onToggle() }} style={{ fontSize: 10, color: B.textTer, background: 'none', border: `1px solid ${B.border}`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>Pause</button>
                <button onClick={e => { e.stopPropagation(); onDelete() }} style={{ fontSize: 10, color: B.red, background: 'none', border: `1px solid ${B.red}44`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>Delete</button>
              </div>
            )}
          </div>

          <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 10 }}>
            {bounty.title}
          </div>

          {/* Reward — prominent */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: `linear-gradient(90deg, ${B.yellow}20, ${B.yellow}10)`,
            border: `1px solid ${B.yellow}55`,
            borderRadius: 10, padding: '6px 14px',
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: B.yellow, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Prize</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: B.yellow }}>{bounty.reward}</span>
          </div>
          {!winner && (
            <div style={{ fontSize: 10, color: B.textTer, marginTop: 5 }}>Winner takes all · No splits</div>
          )}
        </div>

        {/* Time left */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
          <div
            className={isUrgent ? 'bounty-urgency' : ''}
            style={{
              fontSize: 12, fontWeight: 700, color: tColor,
              background: tColor + '18', border: `1px solid ${tColor}44`,
              borderRadius: 8, padding: '3px 8px', marginBottom: 3,
              whiteSpace: 'nowrap',
            }}
          >
            {tLeft}
          </div>
          <div style={{ fontSize: 10, color: B.textTer, whiteSpace: 'nowrap' }}>
            {fmtDate(bounty.start_date)}{bounty.end_date ? ` – ${fmtDate(bounty.end_date)}` : ''}
          </div>
        </div>
      </div>

      {/* Winner banner */}
      {winner && (
        <div style={{
          background: `linear-gradient(90deg, ${B.yellow}20, ${B.yellow}08)`,
          border: `1px solid ${B.yellow}55`, borderRadius: 12,
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
        }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: winner.installer.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: B.bg, boxShadow: `0 0 14px ${winner.installer.color}55` }}>
            {winner.installer.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontSize: 10, color: B.yellow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Winner</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{winner.installer.name}</div>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 24 }}>🏆</span>
        </div>
      )}


      {/* Conditions */}
      {conditions.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {isParlay && (
            <div style={{ fontSize: 9, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              All must be met · Parlay
            </div>
          )}
          {/* FINAL LEG callout */}
          {isParlay && doneConds === conditions.length - 1 && doneConds > 0 && (
            <div style={{
              background: `linear-gradient(90deg, ${B.orange}18, ${B.orange}08)`,
              border: `1.5px solid ${B.orange}66`,
              borderRadius: 10, padding: '10px 14px', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>⚡</span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 900, color: B.orange, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 2 }}>Final Leg</div>
                <div style={{ fontSize: 12, color: B.orange, fontWeight: 700 }}>One more condition to cash out</div>
              </div>
            </div>
          )}
          {conditions.map((cond, ci) => (
            <ConditionRow
              key={cond.id}
              cond={cond}
              prog={leader?.conds[ci]}
              showRemaining
            />
          ))}
        </div>
      )}

      {/* Leaderboard */}
      {board.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <MiniLeaderboard
            board={board}
            conditions={conditions}
            winnerId={bounty.winner_installer_id}
            onAward={onAward}
            isAdmin={isAdmin}
          />
        </div>
      )}

      {/* YOU VS LEADER block */}
      {meProgress && !winner && (() => {
        const bi = conditions.length > 1
          ? meProgress.conds.reduce((mi, c, i, arr) => c.pct < arr[mi].pct ? i : mi, 0)
          : 0
        const cond = conditions[bi]
        if (!cond) return null
        const type = cond.condition_type as ConditionType
        const myVal = meProgress.conds[bi]?.value ?? 0
        const leaderVal = leader?.conds[bi]?.value ?? 0

        let myStr = '', leaderStr = '', gapStr = ''
        if (type === 'sqft_total' || type === 'sqft_cc' || type === 'sqft_single_day') {
          myStr = `${myVal.toFixed(0)} sqft`
          leaderStr = `${leaderVal.toFixed(0)} sqft`
          gapStr = `${(leaderVal - myVal).toFixed(0)} sqft`
        } else if (type === 'panels' || type === 'panels_cc' || type === 'panels_single_day') {
          myStr = `${myVal} panels`
          leaderStr = `${leaderVal} panels`
          gapStr = `${Math.round(leaderVal - myVal)} panels`
        } else if (type === 'sqft_per_hr' || type === 'best_sqft_hr_day') {
          myStr = `${myVal.toFixed(1)} sqft/hr`
          leaderStr = `${leaderVal.toFixed(1)} sqft/hr`
          gapStr = `${(leaderVal - myVal).toFixed(1)} sqft/hr`
        } else if (type === 'total_hours') {
          myStr = `${myVal.toFixed(1)}h`
          leaderStr = `${leaderVal.toFixed(1)}h`
          gapStr = `${(leaderVal - myVal).toFixed(1)}h`
        } else if (type === 'work_days') {
          myStr = `${myVal} days`
          leaderStr = `${leaderVal} days`
          gapStr = `${Math.round(leaderVal - myVal)} days`
        } else {
          return null
        }

        if (iAmLeading) {
          return (
            <div style={{
              background: B.green + '0A', border: `1px solid ${B.green}33`,
              borderRadius: 10, padding: '10px 14px', marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: B.green }}>You're in the lead</span>
              <span style={{ fontSize: 12, color: B.textTer }}>{(meProgress.overallPct * 100).toFixed(0)}% complete</span>
            </div>
          )
        }

        return (
          <div style={{
            background: B.surface2, borderRadius: 10, padding: '10px 14px',
            marginBottom: 12, display: 'flex', gap: 1,
          }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, fontWeight: 700 }}>You</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: B.text }}>{myStr}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', borderLeft: `1px solid ${B.border}`, borderRight: `1px solid ${B.border}` }}>
              <div style={{ fontSize: 9, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, fontWeight: 700 }}>Leader</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: B.yellow }}>{leaderStr}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: B.orange, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, fontWeight: 700 }}>Gap</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: B.orange }}>{gapStr}</div>
            </div>
          </div>
        )
      })()}

      {/* MY NEXT MOVE — personal */}
      {myMove && (
        <div style={{
          background: `${B.yellow}0A`, border: `1px solid ${B.yellow}33`,
          borderRadius: 12, padding: '11px 14px', marginBottom: 12,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ color: B.yellow, fontSize: 13, flexShrink: 0, marginTop: 1 }}>→</span>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, color: B.yellow, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Your move</div>
            <div style={{ fontSize: 13, color: B.text, fontWeight: 700, lineHeight: 1.4 }}>{myMove}</div>
            {meProgress && iAmLeading && (
              <div style={{ fontSize: 11, color: B.green, fontWeight: 600, marginTop: 4 }}>You're leading — don't let up</div>
            )}
          </div>
        </div>
      )}

      {/* NEXT MOVE — generic, shown when not logged in */}
      {!myMove && nextMoves.length > 0 && (
        <div style={{
          background: `${B.yellow}08`, border: `1px solid ${B.yellow}22`,
          borderRadius: 12, padding: '11px 14px',
          marginBottom: facts.length > 0 ? 14 : 0,
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: B.yellow, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
            Next Move
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {nextMoves.map((move, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: B.yellow, fontSize: 11, flexShrink: 0, marginTop: 1 }}>→</span>
                <span style={{ fontSize: 12, color: B.text, fontWeight: 600, lineHeight: 1.4 }}>{move}</span>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Fun facts */}
      {facts.length > 0 && !winner && (
        <div style={{ borderTop: `1px solid ${B.border}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {facts.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: B.yellow, fontSize: 11, flexShrink: 0, marginTop: 1 }}>◆</span>
              <span style={{ fontSize: 12, color: B.textSec, lineHeight: 1.55 }}>{f}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActiveBountyCard({
  bounty,
  board,
  facts,
  isAdmin,
  onAward,
  onToggle,
  onDelete,
  onSelect,
  compact,
}: {
  bounty: Bounty
  board: InstProg[]
  facts: string[]
  isAdmin: boolean
  onAward: (ip: InstProg) => void
  onToggle: () => void
  onDelete: () => void
  onSelect?: () => void
  compact?: boolean
}) {
  const conditions = bounty.conditions ?? []
  const isParlay   = conditions.length > 1
  const tLeft      = fmtTimeLeft(bounty.end_date)
  const tColor     = timeLeftColor(bounty.end_date)
  const dLeft      = daysLeftFromEnd(bounty.end_date)
  const isUrgent   = dLeft != null && dLeft <= 2 && dLeft >= 0
  const leader     = board[0]
  const doneConds  = leader?.conds.filter(c => c.done).length ?? 0

  return (
    <div
      onClick={onSelect}
      style={{
        background: B.surface,
        border: `1px solid ${isUrgent ? B.red + '33' : B.border}`,
        borderRadius: 16,
        padding: '16px 18px',
        marginBottom: compact ? 0 : 12,
        cursor: onSelect ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1, marginRight: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            {isParlay && (
              <span style={{ fontSize: 9, fontWeight: 700, color: B.purple, letterSpacing: '0.1em', textTransform: 'uppercase', background: B.purple + '18', padding: '2px 6px', borderRadius: 4 }}>⚡ Parlay</span>
            )}
            {isParlay && leader && (
              <span style={{ fontSize: 9, fontWeight: 700, color: doneConds === conditions.length ? B.green : B.textTer, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {doneConds}/{conditions.length} done
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 3 }}>{bounty.title}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.yellow }}>{bounty.reward}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          <div
            className={isUrgent ? 'bounty-urgency' : ''}
            style={{ fontSize: 11, fontWeight: 700, color: tColor }}
          >
            {tLeft}
          </div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 5 }}>
              <button onClick={e => { e.stopPropagation(); onToggle() }} style={{ fontSize: 10, color: B.textTer, background: 'none', border: `1px solid ${B.border}`, borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}>Pause</button>
              <button onClick={e => { e.stopPropagation(); onDelete() }} style={{ fontSize: 10, color: B.red, background: 'none', border: `1px solid ${B.red}44`, borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}>×</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        {conditions.map((cond, ci) => (
          <ConditionRow
            key={cond.id}
            cond={cond}
            prog={leader?.conds[ci]}
            showRemaining
          />
        ))}
      </div>

      <MiniLeaderboard
        board={board}
        conditions={conditions}
        winnerId={bounty.winner_installer_id}
        onAward={onAward}
        isAdmin={isAdmin}
      />

      {facts.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${B.border}` }}>
          <span style={{ fontSize: 11, color: B.textTer, fontStyle: 'italic' }}>
            {facts[0]}
          </span>
        </div>
      )}
    </div>
  )
}

function CompletedCard({
  bounty, winner, isAdmin, onMarkPaid, onMarkUnpaid, onSelect,
}: {
  bounty: Bounty
  winner: Installer | null
  isAdmin: boolean
  onMarkPaid: () => void
  onMarkUnpaid: () => void
  onSelect?: () => void
}) {
  const [paid, setPaid] = useState(!!bounty.paid)
  const [paidAt, setPaidAt] = useState<string | null>(bounty.paid_at)
  const [confirming, setConfirming] = useState<'pay' | 'unpay' | null>(null)

  function confirmPay() {
    const now = new Date().toISOString()
    setPaid(true)
    setPaidAt(now)
    setConfirming(null)
    onMarkPaid()
  }

  function confirmUnpay() {
    setPaid(false)
    setPaidAt(null)
    setConfirming(null)
    onMarkUnpaid()
  }

  return (
    <div style={{
      background: B.surface,
      border: `1px solid ${winner ? B.yellow + '22' : B.border}`,
      borderRadius: 14,
      padding: '13px 16px',
      marginBottom: 8,
    }}>
      <div onClick={onSelect} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: onSelect ? 'pointer' : 'default' }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: winner ? `${B.yellow}18` : B.surface2,
          border: `1px solid ${winner ? B.yellow + '44' : B.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0,
        }}>🏆</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{bounty.title}</div>
          <div style={{ fontSize: 11, color: B.textTer }}>
            {bounty.reward} · {fmtDate(bounty.start_date)}{bounty.end_date ? ` – ${fmtDate(bounty.end_date)}` : ''}
          </div>
        </div>
        {winner ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: winner.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: B.bg, boxShadow: `0 0 10px ${winner.color}44` }}>
              {winner.name.charAt(0)}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: B.yellow }}>{winner.name.split(' ')[0]}</div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: B.textTer }}>No winner</div>
        )}
      </div>

      {/* Payout section — admin only */}
      {winner && isAdmin && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${B.border}` }}>

          {/* Payment log */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: confirming ? 10 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {paid ? (
                <>
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: B.green, textTransform: 'uppercase',
                    letterSpacing: '0.08em', background: B.green + '18',
                    border: `1px solid ${B.green}33`, borderRadius: 5, padding: '2px 7px',
                  }}>✓ Paid</span>
                  {paidAt && (
                    <span style={{ fontSize: 10, color: B.textTer }}>
                      {new Date(paidAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                </>
              ) : (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: B.orange, textTransform: 'uppercase',
                  letterSpacing: '0.08em', background: B.orange + '14',
                  border: `1px solid ${B.orange}33`, borderRadius: 5, padding: '2px 7px',
                }}>⚠ Unpaid</span>
              )}
            </div>
            {confirming ? (
              <button
                onClick={() => setConfirming(null)}
                style={{ fontSize: 11, color: B.textTer, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
              >
                Cancel
              </button>
            ) : paid ? (
              <button
                onClick={() => setConfirming('unpay')}
                style={{ fontSize: 11, fontWeight: 600, color: B.textTer, background: 'none', border: `1px solid ${B.border}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}
              >
                Mark as Unpaid
              </button>
            ) : (
              <button
                onClick={() => setConfirming('pay')}
                style={{ fontSize: 11, fontWeight: 700, color: B.green, background: B.green + '14', border: `1px solid ${B.green}33`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}
              >
                Mark as Paid
              </button>
            )}
          </div>

          {/* Inline confirmation */}
          {confirming === 'pay' && (
            <div style={{ background: B.green + '0C', border: `1px solid ${B.green}28`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 12, color: B.textSec, lineHeight: 1.4 }}>
                Confirm paying <strong style={{ color: B.text }}>{winner.name}</strong> <strong style={{ color: B.green }}>{bounty.reward}</strong>?
              </div>
              <button
                onClick={confirmPay}
                style={{ fontSize: 12, fontWeight: 800, color: B.bg, background: B.green, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', flexShrink: 0 }}
              >
                Yes, paid
              </button>
            </div>
          )}

          {confirming === 'unpay' && (
            <div style={{ background: B.orange + '0C', border: `1px solid ${B.orange}28`, borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 12, color: B.textSec, lineHeight: 1.4 }}>
                Clear the payment record for <strong style={{ color: B.text }}>{bounty.title}</strong>? Only do this if it was logged by mistake.
              </div>
              <button
                onClick={confirmUnpay}
                style={{ fontSize: 12, fontWeight: 800, color: B.bg, background: B.orange, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', flexShrink: 0 }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── win test overlay ──────────────────────────────────────────────────────────

function WinTestOverlay({
  installer, bountyTitle, reward, onClose,
}: {
  installer: Installer
  bountyTitle: string
  reward: string
  onClose: () => void
}) {
  const DOTS = [B.yellow, B.orange, B.green, '#FF6B6B', '#7B68EE', B.yellow, B.orange, '#4ECDC4']
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="bounty-winner-card"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(145deg, #1C1C1E 0%, #28271F 100%)',
          border: `2px solid ${B.yellow}55`,
          borderRadius: 24, padding: '44px 32px 36px',
          maxWidth: 360, width: '100%', textAlign: 'center',
          boxShadow: `0 0 80px ${B.yellow}18, 0 40px 80px rgba(0,0,0,0.85)`,
          position: 'relative', overflow: 'hidden',
        }}
      >
        {DOTS.map((clr, i) => (
          <div key={i} style={{
            position: 'absolute', width: 7, height: 7, borderRadius: '50%',
            background: clr, pointerEvents: 'none',
            top: `${8 + (i % 4) * 22}%`,
            left: `${4 + i * 12}%`,
            animation: `confetti-drift ${1.4 + i * 0.18}s ease-in ${i * 0.12}s infinite`,
          }} />
        ))}

        <div className="bounty-trophy" style={{ fontSize: 54, marginBottom: 14, lineHeight: 1 }}>🏆</div>
        <div style={{ fontSize: 9, fontWeight: 900, color: B.yellow, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 18 }}>
          Bounty Won
        </div>

        <div
          className="bounty-glow-pulse"
          style={{
            '--glow-color': `${installer.color}66`,
            width: 72, height: 72, borderRadius: '50%',
            background: installer.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 800, color: B.bg,
            margin: '0 auto 14px',
            boxShadow: `0 0 44px ${installer.color}55`,
          } as React.CSSProperties}
        >
          {installer.name.charAt(0)}
        </div>

        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
          {installer.name.split(' ')[0]}
        </div>
        <div style={{ fontSize: 13, color: B.textTer, marginBottom: 22 }}>{bountyTitle}</div>

        <div style={{
          background: `linear-gradient(90deg, ${B.yellow}22, ${B.yellow}10)`,
          border: `1.5px solid ${B.yellow}44`,
          borderRadius: 14, padding: '14px 20px', marginBottom: 28,
        }}>
          <div style={{ fontSize: 9, color: B.yellow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 5 }}>Prize</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: B.yellow }}>{reward}</div>
        </div>

        <button
          onClick={onClose}
          style={{
            background: B.surface2, color: B.textSec,
            border: `1px solid ${B.border}`, borderRadius: 12,
            padding: '11px 24px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', width: '100%',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ── redemption card ───────────────────────────────────────────────────────────

function RedemptionCard() {
  const [open, setOpen] = useState(false)
  const steps = [
    { n: '1', text: 'Hit all conditions before the deadline — progress updates in real time.' },
    { n: '2', text: 'Your name appears as winner on the board automatically.' },
    { n: '3', text: 'Admin awards the win and reaches out to arrange your prize.' },
    { n: '4', text: 'Prize paid out same week. No extra steps needed.' },
  ]
  return (
    <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 16, marginBottom: 20, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15 }}>📋</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: B.text }}>How to Redeem</span>
        </div>
        <span style={{
          fontSize: 10, color: B.textTer, fontWeight: 600,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s', display: 'inline-block',
        }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${B.border}` }}>
          {steps.map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 12, paddingTop: 14, alignItems: 'flex-start' }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: B.yellow, color: B.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1,
              }}>
                {s.n}
              </div>
              <div style={{ fontSize: 13, color: B.textSec, lineHeight: 1.6, paddingTop: 1 }}>{s.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── bounty detail modal ───────────────────────────────────────────────────────

function BountyDetailModal({
  bounty, board, facts, installers, logs, meInstaller, isAdmin, isGuest,
  onClose, onAward, onMarkPaid, onMarkUnpaid, onConfirmSocial,
}: {
  bounty: Bounty
  board: InstProg[]
  facts: string[]
  installers: Installer[]
  logs: Log[]
  meInstaller?: Installer | null
  isAdmin: boolean
  isGuest: boolean
  onClose: () => void
  onAward: (ip: InstProg) => void
  onMarkPaid: () => void
  onMarkUnpaid: () => void
  onConfirmSocial: (condId: string, installerId: string) => Promise<{ error: string | null }>
}) {
  const conditions  = bounty.conditions ?? []
  const leader      = board[0]
  const winnerInst  = bounty.winner_installer_id ? installers.find(i => i.id === bounty.winner_installer_id) ?? null : null
  const meProgress  = meInstaller ? board.find(ip => ip.installer.id === meInstaller.id) : null
  const myMove      = (!bounty.winner_installer_id && meInstaller) ? genMyNextMove(meInstaller.id, bounty, board) : null
  const iAmLeading  = meProgress ? meProgress.installer.id === leader?.installer.id : false
  const isHot       = !bounty.winner_installer_id && isHotBounty(board)
  const isParlay    = conditions.length > 1
  const tLeft       = fmtTimeLeft(bounty.end_date)
  const tColor      = timeLeftColor(bounty.end_date)
  const dLeft       = daysLeftFromEnd(bounty.end_date)
  const isUrgent    = dLeft != null && dLeft <= 2 && dLeft >= 0 && !bounty.winner_installer_id

  const todayStr = new Date().toDateString()
  const todayByInstaller = board.slice(0, 6).map(ip => {
    const instLogs = logs.filter(r =>
      r.installer_id === ip.installer.id && r.status === 'Complete' &&
      r.start_ts && new Date(r.start_ts).toDateString() === todayStr
    )
    const sqft   = instLogs.filter(r => !r.is_color_change).reduce((s, r) => s + (r.sqft ?? 0), 0)
    const panels = instLogs.filter(r => !r.is_color_change).length
    const mins   = instLogs.reduce((s, r) => s + (r.mins ?? 0), 0)
    return { ...ip, todaySqft: sqft, todayPanels: panels, todayMins: mins }
  }).filter(x => x.todaySqft > 0 || x.todayPanels > 0)

  const COND_EXPLAIN: Record<ConditionType, (v: number) => string> = {
    sqft_total:       () => 'Total sqft of commercial wraps installed in the period',
    sqft_cc:          () => 'Total sqft of color-change wraps installed',
    panels:           () => 'Number of commercial panels completed',
    panels_cc:        () => 'Number of color-change panels completed',
    sqft_per_hr:      () => 'Rolling average sqft/hr across all commercial jobs',
    total_hours:      () => 'Total clock time logged',
    work_days:        () => 'Distinct calendar days with any completed job',
    sqft_single_day:  () => 'Best single day sqft total — only your best day counts',
    panels_single_day:() => 'Best single day panel count',
    best_sqft_hr_day: () => 'Best single day sqft/hr rate',
    early_clock_in:   (v) => `Must clock in before ${minsToTime(v)} on at least one day`,
    first_clock_in:   () => 'Be the earliest installer to clock in on any given day',
    social_action:    () => 'Public commitment — first to claim and lock it in gets credit for this leg',
    panels_early:   () => 'Each panel you personally finished before its project due date counts — team projects are fair since you only get credit for your own work',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="bounty-modal-sheet"
        onClick={e => e.stopPropagation()}
        style={{ background: B.bg, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 780, maxHeight: '90vh', overflowY: 'auto', paddingBottom: 44 }}
      >
        {/* Pull handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: B.surface3 }} />
        </div>

        {/* Header */}
        <div style={{ padding: '10px 18px 14px', borderBottom: `1px solid ${B.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              {isHot && <span style={{ fontSize: 9, fontWeight: 900, color: B.orange, letterSpacing: '0.12em', textTransform: 'uppercase', background: B.orange + '18', border: `1px solid ${B.orange}44`, borderRadius: 5, padding: '2px 6px' }}>🔥 Hot</span>}
              {isParlay && <span style={{ fontSize: 9, fontWeight: 700, color: B.purple, textTransform: 'uppercase', background: B.purple + '18', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.08em' }}>⚡ Parlay</span>}
              {bounty.winner_installer_id && <span style={{ fontSize: 9, fontWeight: 800, color: B.yellow, textTransform: 'uppercase', background: B.yellow + '14', border: `1px solid ${B.yellow}33`, borderRadius: 5, padding: '2px 6px', letterSpacing: '0.1em' }}>🏆 Closed</span>}
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>{bounty.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `linear-gradient(90deg, ${B.yellow}20, ${B.yellow}10)`, border: `1px solid ${B.yellow}55`, borderRadius: 8, padding: '4px 12px' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: B.yellow, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Prize</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: B.yellow }}>{bounty.reward}</span>
              </div>
              {!bounty.winner_installer_id && <span style={{ fontSize: 10, color: B.textTer }}>Winner takes all · No splits</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            <div className={isUrgent ? 'bounty-urgency' : ''} style={{ fontSize: 12, fontWeight: 700, color: tColor, background: tColor + '18', border: `1px solid ${tColor}44`, borderRadius: 8, padding: '3px 8px', whiteSpace: 'nowrap' }}>{tLeft}</div>
            <div style={{ fontSize: 10, color: B.textTer, whiteSpace: 'nowrap' }}>{fmtDate(bounty.start_date)}{bounty.end_date ? ` – ${fmtDate(bounty.end_date)}` : ''}</div>
            <button onClick={onClose} style={{ fontSize: 14, color: B.textTer, background: B.surface2, border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', marginTop: 4 }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Winner banner */}
          {winnerInst && (
            <div style={{ background: `linear-gradient(90deg, ${B.yellow}20, ${B.yellow}08)`, border: `1px solid ${B.yellow}55`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: winnerInst.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: B.bg, boxShadow: `0 0 16px ${winnerInst.color}55` }}>{winnerInst.name.charAt(0)}</div>
              <div>
                <div style={{ fontSize: 10, color: B.yellow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Winner</div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{winnerInst.name}</div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 26 }}>🏆</span>
            </div>
          )}

          {/* Payout status */}
          {winnerInst && isAdmin && (
            <CompletedCard bounty={bounty} winner={winnerInst} isAdmin={isAdmin} onMarkPaid={onMarkPaid} onMarkUnpaid={onMarkUnpaid} />
          )}

          {/* YOU VS LEADER */}
          {meProgress && !bounty.winner_installer_id && (() => {
            const bi = conditions.length > 1 ? meProgress.conds.reduce((mi, c, i, arr) => c.pct < arr[mi].pct ? i : mi, 0) : 0
            const cond = conditions[bi]
            if (!cond) return null
            const type = cond.condition_type as ConditionType
            const myVal     = meProgress.conds[bi]?.value ?? 0
            const leaderVal = leader?.conds[bi]?.value ?? 0
            let myStr = '', leaderStr = '', gapStr = ''
            if (type === 'sqft_total' || type === 'sqft_cc' || type === 'sqft_single_day') {
              myStr = `${myVal.toFixed(0)} sqft`; leaderStr = `${leaderVal.toFixed(0)} sqft`; gapStr = `${(leaderVal - myVal).toFixed(0)} sqft`
            } else if (type === 'panels' || type === 'panels_cc' || type === 'panels_single_day') {
              myStr = `${myVal} panels`; leaderStr = `${leaderVal} panels`; gapStr = `${Math.round(leaderVal - myVal)} panels`
            } else if (type === 'sqft_per_hr' || type === 'best_sqft_hr_day') {
              myStr = `${myVal.toFixed(1)} sqft/hr`; leaderStr = `${leaderVal.toFixed(1)} sqft/hr`; gapStr = `${(leaderVal - myVal).toFixed(1)} sqft/hr`
            } else if (type === 'total_hours') {
              myStr = `${myVal.toFixed(1)}h`; leaderStr = `${leaderVal.toFixed(1)}h`; gapStr = `${(leaderVal - myVal).toFixed(1)}h`
            } else if (type === 'work_days') {
              myStr = `${myVal} days`; leaderStr = `${leaderVal} days`; gapStr = `${Math.round(leaderVal - myVal)} days`
            } else return null
            if (iAmLeading) {
              return <div style={{ background: B.green + '0A', border: `1px solid ${B.green}33`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: B.green }}>You're in the lead</span>
                <span style={{ fontSize: 12, color: B.textTer }}>{(meProgress.overallPct * 100).toFixed(0)}% complete</span>
              </div>
            }
            return (
              <div style={{ background: B.surface2, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 1 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3, fontWeight: 700 }}>You</div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{myStr}</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', borderLeft: `1px solid ${B.border}`, borderRight: `1px solid ${B.border}` }}>
                  <div style={{ fontSize: 9, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3, fontWeight: 700 }}>Leader</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: B.yellow }}>{leaderStr}</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: B.orange, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3, fontWeight: 700 }}>Gap</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: B.orange }}>{gapStr}</div>
                </div>
              </div>
            )
          })()}

          {/* MY NEXT MOVE */}
          {myMove && (
            <div style={{ background: `${B.yellow}0A`, border: `1px solid ${B.yellow}33`, borderRadius: 12, padding: '11px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: B.yellow, fontSize: 13, flexShrink: 0, marginTop: 1 }}>→</span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 800, color: B.yellow, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Your move</div>
                <div style={{ fontSize: 13, color: B.text, fontWeight: 700, lineHeight: 1.4 }}>{myMove}</div>
                {iAmLeading && <div style={{ fontSize: 11, color: B.green, fontWeight: 600, marginTop: 4 }}>You're leading — don't let up</div>}
              </div>
            </div>
          )}

          {/* Conditions */}
          {conditions.length > 0 && (
            <div style={{ background: B.surface, borderRadius: 12, padding: '14px 14px 6px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                {isParlay ? 'All conditions required · Parlay' : 'Condition'}
              </div>
              {isParlay && leader && leader.conds.filter(c => c.done).length === conditions.length - 1 && leader.conds.some(c => c.done) && (
                <div style={{ background: `${B.orange}18`, border: `1.5px solid ${B.orange}66`, borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⚡</span>
                  <div style={{ fontSize: 12, color: B.orange, fontWeight: 700 }}>Final Leg — one more condition to win</div>
                </div>
              )}
              {conditions.map((cond, ci) =>
                cond.condition_type === 'social_action' ? (
                  <SocialActionRow
                    key={cond.id}
                    cond={cond}
                    meInstaller={meInstaller}
                    installers={installers}
                    isGuest={isGuest}
                    onConfirm={onConfirmSocial}
                  />
                ) : (
                  <ConditionRow key={cond.id} cond={cond} prog={leader?.conds[ci]} showRemaining />
                )
              )}
            </div>
          )}

          {/* Full leaderboard */}
          <div style={{ background: B.surface, borderRadius: 12, padding: '14px 14px 10px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Standings</div>
            <MiniLeaderboard board={board} conditions={conditions} winnerId={bounty.winner_installer_id} onAward={onAward} isAdmin={isAdmin} />
          </div>

          {/* TODAY */}
          {todayByInstaller.length > 0 && (
            <div style={{ background: B.surface, borderRadius: 12, padding: '14px 14px 10px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Today</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {todayByInstaller.map(x => (
                  <div key={x.installer.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: x.installer.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: B.bg, flexShrink: 0 }}>{x.installer.name.charAt(0)}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{x.installer.name.split(' ')[0]}</div>
                    <div style={{ fontSize: 12, color: B.textSec, display: 'flex', gap: 8 }}>
                      {x.todaySqft > 0 && <span>{x.todaySqft.toFixed(0)} sqft</span>}
                      {x.todayPanels > 0 && <span>{x.todayPanels} panels</span>}
                      {x.todayMins > 0 && <span style={{ color: B.textTer }}>{(x.todayMins / 60).toFixed(1)}h</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fun facts */}
          {facts.length > 0 && !bounty.winner_installer_id && (
            <div style={{ background: B.surface, borderRadius: 12, padding: '14px 14px 10px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Analysis</div>
              {facts.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ color: B.yellow, fontSize: 11, flexShrink: 0, marginTop: 1 }}>◆</span>
                  <span style={{ fontSize: 13, color: B.textSec, lineHeight: 1.55 }}>{f}</span>
                </div>
              ))}
            </div>
          )}

          {/* How it works */}
          <div style={{ background: B.surface, borderRadius: 12, padding: '14px 14px 10px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>How it works</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {conditions.map((cond, i) => {
                const type = cond.condition_type as ConditionType
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    {conditions.length > 1 && <span style={{ fontSize: 10, fontWeight: 700, color: B.textTer, minWidth: 16, marginTop: 1 }}>{i + 1}.</span>}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: B.text, marginBottom: 2 }}>{condLabel(type, cond.value, cond)}</div>
                      <div style={{ fontSize: 11, color: B.textTer, lineHeight: 1.5 }}>{COND_EXPLAIN[type](cond.value)}</div>
                    </div>
                  </div>
                )
              })}
              {isParlay && (
                <div style={{ fontSize: 11, color: B.purple, fontWeight: 600, padding: '8px 10px', background: B.purple + '0C', borderRadius: 8 }}>
                  All conditions must be met to win. Highest overall progress wins if no one finishes.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── demo data ─────────────────────────────────────────────────────────────────

function generateDemoBounties(installers: Installer[]): Array<{
  bounty: Bounty & { conditions: BountyCondition[] }
  board: InstProg[]
  facts: string[]
}> {
  if (!installers.length) return []
  const [a, b, c] = installers

  const d = (n: number) => {
    const dt = new Date()
    dt.setDate(dt.getDate() + n)
    return dt.toISOString().slice(0, 10)
  }

  function mkCond(bountyId: string, idx: number, type: ConditionType, value: number): BountyCondition {
    return { id: `dc-${bountyId}-${idx}`, bounty_id: bountyId, condition_type: type, operator: '>=', value, created_at: '' }
  }

  function mkBoard(rows: Array<[Installer | undefined, CondProg[]]>): InstProg[] {
    return rows
      .filter((r): r is [Installer, CondProg[]] => r[0] != null)
      .map(([inst, conds]) => ({
        installer: inst, conds,
        overallPct: conds.length > 0 ? Math.min(...conds.map(c => c.pct)) : 0,
        allDone: conds.length > 0 && conds.every(c => c.done),
        latestTs: null,
      }))
  }

  // 1. Speed Demon — best sqft/hr in one day
  const db1: Bounty & { conditions: BountyCondition[] } = {
    id: 'demo-1', title: 'Speed Demon', reward: '$50 cash',
    start_date: d(-14), end_date: d(5), active: true,
    winner_installer_id: null, paid: false, paid_at: null, created_at: '',
    conditions: [mkCond('demo-1', 1, 'best_sqft_hr_day', 40)],
  }
  const bb1 = mkBoard([
    [a, [{ value: 34.8, pct: 0.87, done: false }]],
    [b, [{ value: 24.8, pct: 0.62, done: false }]],
    [c, [{ value: 16.4, pct: 0.41, done: false }]],
  ])

  // 2. Volume King — sqft total
  const db2: Bounty & { conditions: BountyCondition[] } = {
    id: 'demo-2', title: 'Volume King', reward: '$100 cash + Friday off',
    start_date: d(-10), end_date: d(12), active: true,
    winner_installer_id: null, paid: false, paid_at: null, created_at: '',
    conditions: [mkCond('demo-2', 1, 'sqft_total', 800)],
  }
  const bb2 = mkBoard([
    [a, [{ value: 520, pct: 0.65, done: false }]],
    [b, [{ value: 384, pct: 0.48, done: false }]],
    [c, [{ value: 248, pct: 0.31, done: false }]],
  ])

  // 3. Early Bird Parlay — early clock-in + days worked
  const db3: Bounty & { conditions: BountyCondition[] } = {
    id: 'demo-3', title: 'Early Bird Parlay', reward: '$75 gift card',
    start_date: d(-7), end_date: null, active: true,
    winner_installer_id: null, paid: false, paid_at: null, created_at: '',
    conditions: [mkCond('demo-3', 1, 'early_clock_in', 450), mkCond('demo-3', 2, 'work_days', 5)],
  }
  const bb3 = mkBoard([
    [a, [{ value: 1, pct: 1.0, done: true  }, { value: 3, pct: 0.60, done: false }]],
    [b, [{ value: 0, pct: 0.0, done: false }, { value: 2, pct: 0.40, done: false }]],
    [c, [{ value: 1, pct: 1.0, done: true  }, { value: 1, pct: 0.20, done: false }]],
  ])

  // 4. Panel Machine — panels in one day (urgent: 2 days left)
  const db4: Bounty & { conditions: BountyCondition[] } = {
    id: 'demo-4', title: 'Panel Machine', reward: '$60 cash',
    start_date: d(-20), end_date: d(2), active: true,
    winner_installer_id: null, paid: false, paid_at: null, created_at: '',
    conditions: [mkCond('demo-4', 1, 'panels_single_day', 5)],
  }
  const bb4 = mkBoard([
    [a, [{ value: 4, pct: 0.80, done: false }]],
    [b, [{ value: 3, pct: 0.60, done: false }]],
    [c, [{ value: 2, pct: 0.40, done: false }]],
  ])

  // 5. The Big Month — completed, unpaid
  const db5: Bounty & { conditions: BountyCondition[] } = {
    id: 'demo-5', title: 'The Big Month', reward: '$200 cash',
    start_date: d(-35), end_date: d(-5), active: false,
    winner_installer_id: a?.id ?? null, paid: false, paid_at: null, created_at: '',
    conditions: [mkCond('demo-5', 1, 'sqft_total', 1200)],
  }
  const bb5 = mkBoard([
    [a, [{ value: 1248, pct: 1.04, done: true }]],
    [b, [{ value: 744,  pct: 0.62, done: false }]],
    [c, [{ value: 456,  pct: 0.38, done: false }]],
  ])

  // 5b. Speed Week — completed, already paid
  const db5b: Bounty & { conditions: BountyCondition[] } = {
    id: 'demo-5b', title: 'Speed Week', reward: '$75 cash',
    start_date: d(-60), end_date: d(-30), active: false,
    winner_installer_id: b?.id ?? null, paid: true,
    paid_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: '',
    conditions: [mkCond('demo-5b', 1, 'sqft_per_hr', 28)],
  }
  const bb5b = mkBoard([
    [b, [{ value: 31.2, pct: 1.11, done: true }]],
    [a, [{ value: 26.4, pct: 0.94, done: false }]],
    [c, [{ value: 19.8, pct: 0.71, done: false }]],
  ])

  // 6. Hustle Parlay — sqft volume + efficiency
  const db6: Bounty & { conditions: BountyCondition[] } = {
    id: 'demo-6', title: 'Hustle Parlay', reward: '$150 cash + Monday off',
    start_date: d(-5), end_date: d(21), active: true,
    winner_installer_id: null, paid: false, paid_at: null, created_at: '',
    conditions: [mkCond('demo-6', 1, 'sqft_total', 600), mkCond('demo-6', 2, 'sqft_per_hr', 25)],
  }
  const bb6 = mkBoard([
    [a, [{ value: 420, pct: 0.70, done: false }, { value: 22.1, pct: 0.88, done: false }]],
    [b, [{ value: 300, pct: 0.50, done: false }, { value: 18.5, pct: 0.74, done: false }]],
    [c, [{ value: 180, pct: 0.30, done: false }, { value: 12.3, pct: 0.49, done: false }]],
  ])

  const all = [
    { bounty: db1, board: bb1 },
    { bounty: db2, board: bb2 },
    { bounty: db3, board: bb3 },
    { bounty: db4, board: bb4 },
    { bounty: db5, board: bb5 },
    { bounty: db5b, board: bb5b },
    { bounty: db6, board: bb6 },
  ]
  return all.map(e => ({
    ...e,
    facts: e.bounty.active ? genFunFacts(e.bounty, e.board, []) : [],
  }))
}

// ── form config ───────────────────────────────────────────────────────────────

interface CondRow { id: number; type: ConditionType; valueStr: string; socialActionType?: string }

interface StarterTemplate {
  title: string
  hint: string
  reward: string
  daysEnd: number | null
  conditions: { type: ConditionType; valueStr: string; socialActionType?: string }[]
}

const STARTER_TEMPLATES: StarterTemplate[] = [
  { title: 'First to 4,500 sqft', hint: '4,500 sqft commercial', reward: '$150 cash', daysEnd: 30, conditions: [{ type: 'sqft_total', valueStr: '4500' }] },
  { title: '50 Panels', hint: '50 commercial panels', reward: '$125 cash', daysEnd: 30, conditions: [{ type: 'panels', valueStr: '50' }] },
  { title: 'Early Bird Sprint', hint: 'Clock in before 7:30 AM', reward: '$75 gift card', daysEnd: 14, conditions: [{ type: 'early_clock_in', valueStr: '07:30' }] },
  { title: 'Speed + Volume Parlay', hint: '600 sqft + 25 sqft/hr avg', reward: '$200 cash', daysEnd: 30, conditions: [{ type: 'sqft_total', valueStr: '600' }, { type: 'sqft_per_hr', valueStr: '25' }] },
  { title: 'Project Grinder', hint: '20 days worked', reward: '$100 cash', daysEnd: 30, conditions: [{ type: 'work_days', valueStr: '20' }] },
  { title: 'First Mover Parlay', hint: 'First in 5 days + 500 sqft', reward: '$100 cash + Monday off', daysEnd: 30, conditions: [{ type: 'first_clock_in', valueStr: '5' }, { type: 'sqft_total', valueStr: '500' }] },
  { title: 'Speed Demon', hint: 'Best day: 40 sqft/hr', reward: '$50 cash', daysEnd: 14, conditions: [{ type: 'best_sqft_hr_day', valueStr: '40' }] },
  { title: 'Big Month', hint: '1,000 sqft commercial', reward: '$200 cash + Friday off', daysEnd: 30, conditions: [{ type: 'sqft_total', valueStr: '1000' }] },
  { title: 'Buy Lunch Parlay', hint: '30 panels + social commit', reward: '$75 cash', daysEnd: 30, conditions: [{ type: 'panels', valueStr: '30' }, { type: 'social_action', valueStr: '1', socialActionType: 'buy_lunch' }] },
  { title: 'CC Crusher', hint: '800 sqft color change', reward: '$100 cash', daysEnd: 30, conditions: [{ type: 'sqft_cc', valueStr: '800' }] },
]

const COND_GROUPS: { label: string; types: { type: ConditionType; label: string; placeholder: string; help: string }[] }[] = [
  {
    label: 'Volume',
    types: [
      { type: 'sqft_total',        label: 'Commercial SQFT',       placeholder: '500',  help: 'Total sqft installed (commercial)' },
      { type: 'sqft_cc',           label: 'Color Change SQFT',     placeholder: '200',  help: 'Total sqft installed (CC)' },
      { type: 'panels',            label: 'Commercial Panels',     placeholder: '10',   help: 'Total commercial panels completed' },
      { type: 'panels_cc',         label: 'Color Change Panels',   placeholder: '5',    help: 'Total CC panels completed' },
      { type: 'total_hours',       label: 'Hours on Clock',        placeholder: '40',   help: 'Total time logged (hours)' },
      { type: 'work_days',         label: 'Days Worked',           placeholder: '5',    help: 'Distinct calendar days with any activity' },
    ],
  },
  {
    label: 'Single Day Challenge',
    types: [
      { type: 'sqft_single_day',   label: 'SQFT in One Day',       placeholder: '200',  help: 'Hit this sqft total in a single day' },
      { type: 'panels_single_day', label: 'Panels in One Day',     placeholder: '4',    help: 'Hit this many panels in one day' },
      { type: 'best_sqft_hr_day',  label: 'Best Day SQFT/HR',      placeholder: '30',   help: 'Avg sqft/hr across any single work day' },
    ],
  },
  {
    label: 'Efficiency',
    types: [
      { type: 'sqft_per_hr',       label: 'Avg SQFT/HR (range)',   placeholder: '25',   help: 'Rolling average sqft/hr over full range' },
    ],
  },
  {
    label: 'Early Start',
    types: [
      { type: 'early_clock_in',  label: 'Clock In Before Time',   placeholder: '',  help: 'Clock in before this time on any day' },
      { type: 'first_clock_in',  label: 'First to Clock In (days)', placeholder: '5', help: 'Be the first installer to clock in on N different days' },
    ],
  },
  {
    label: 'Early Finish',
    types: [
      { type: 'panels_early', label: 'Panels Finished Before Due Date', placeholder: '10', help: 'Panels you personally completed before the project due date — fair for team jobs' },
    ],
  },
  {
    label: 'Social Commitment',
    types: [
      { type: 'social_action', label: 'Social Action', placeholder: '', help: 'Winner publicly commits to a social action (buy lunch/coffee)' },
    ],
  },
]

const ALL_COND_CONFIG = COND_GROUPS.flatMap(g => g.types)

// ── main component ────────────────────────────────────────────────────────────

export default function Bounties() {
  const { logs, installers, projects } = useAppData()
  const { isAdmin, installer: me, isGuest } = useAuth()
  const { bounties, loading, createBounty, deleteBounty, toggleActive, awardWin, markPaid, markUnpaid, confirmSocialAction } = useBounties()

  const condIdRef = useRef(0)
  function newCondRow(type: ConditionType = 'sqft_total'): CondRow {
    return { id: ++condIdRef.current, type, valueStr: '' }
  }

  const [showCreate,      setShowCreate]      = useState(false)
  const [testWinOpen,     setTestWinOpen]     = useState(false)
  const [showDemo,        setShowDemo]        = useState(true)
  const [toast,           setToast]           = useState('')
  const [selectedBountyId, setSelectedBountyId] = useState<string | null>(null)

  const demoBounties = useMemo(() => generateDemoBounties(installers), [installers])
  const [warn,       setWarn]       = useState<WarnConfig | null>(null)
  const [saving,     setSaving]     = useState(false)

  const [fTitle,       setFTitle]       = useState('')
  const [fReward,      setFReward]      = useState('')
  const [fStart,       setFStart]       = useState(new Date().toISOString().slice(0, 10))
  const [fEnd,         setFEnd]         = useState('')
  const [fConds,       setFConds]       = useState<CondRow[]>([newCondRow()])
  const [selectedTpl,  setSelectedTpl]  = useState<string | null>(null)

  const activeBounties    = useMemo(() => bounties.filter(b =>  b.active), [bounties])
  const completedBounties = useMemo(() => bounties.filter(b => !b.active), [bounties])

  const boardsByBounty = useMemo(() => {
    const m = new Map<string, { board: InstProg[]; facts: string[] }>()
    for (const b of bounties) {
      const board = calcLeaderboard(b, installers, logs, projects)
      const facts = genFunFacts(b, board, logs)
      m.set(b.id, { board, facts })
    }
    return m
  }, [bounties, installers, logs])

  const featured = activeBounties[0] ?? null

  const selectedEntry = useMemo(() => {
    if (!selectedBountyId) return null
    const real = bounties.find(b => b.id === selectedBountyId)
    if (real) {
      const { board, facts } = boardsByBounty.get(real.id) ?? { board: [], facts: [] }
      return { bounty: real, board, facts, isDemo: false }
    }
    const demo = demoBounties.find(e => e.bounty.id === selectedBountyId)
    if (demo) return { bounty: demo.bounty as Bounty, board: demo.board, facts: demo.facts, isDemo: true }
    return null
  }, [selectedBountyId, bounties, boardsByBounty, demoBounties])

  const todayStr = new Date().toDateString()

  const todayFirstClockIn = useMemo(() => {
    // Use all logs (complete or active jobs); pick earliest start_ts today
    const todayAll = logs.filter(r => r.start_ts && new Date(r.start_ts).toDateString() === todayStr)
    if (!todayAll.length) return null
    const earliest = todayAll.reduce((a, b) =>
      new Date(a.start_ts) < new Date(b.start_ts) ? a : b
    )
    const inst = installers.find(i => i.id === earliest.installer_id)
    if (!inst) return null
    const d = new Date(earliest.start_ts)
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return { name: inst.name.split(' ')[0], time: timeStr, color: inst.color }
  }, [logs, installers]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleAward(bounty: Bounty, ip: InstProg) {
    setWarn({
      title: `Award win to ${ip.installer.name.split(' ')[0]}?`,
      body: `This will close the bounty and mark ${ip.installer.name} as the winner.`,
      ok: '🏆 Award Win',
      cancel: 'Cancel',
      onOk: async () => {
        const { error } = await awardWin(bounty.id, ip.installer.id)
        if (error) setToast('Error: ' + error)
        else setToast(`Win awarded to ${ip.installer.name.split(' ')[0]}!`)
      },
    })
  }

  function handleDelete(bounty: Bounty) {
    setWarn({
      title: 'Delete this bounty?',
      body: `"${bounty.title}" will be permanently removed.`,
      ok: 'Delete', cancel: 'Cancel', danger: true,
      onOk: async () => {
        const { error } = await deleteBounty(bounty.id)
        if (error) setToast('Error: ' + error)
        else setToast('Bounty deleted')
      },
    })
  }

  function handleMarkPaid(bounty: Bounty) {
    const winnerName = bounty.winner_installer_id
      ? (installers.find(i => i.id === bounty.winner_installer_id)?.name ?? 'winner')
      : 'winner'
    setWarn({
      title: 'Confirm payout',
      body: `Pay ${winnerName} ${bounty.reward} for "${bounty.title}"? This cannot be undone without admin action.`,
      ok: '✓ Confirm Paid', cancel: 'Cancel',
      onOk: async () => {
        const { error } = await markPaid(bounty.id)
        if (error) setToast('Error: ' + error)
        else setToast(`Payout recorded for ${winnerName}`)
      },
    })
  }

  function handleMarkUnpaid(bounty: Bounty) {
    const winnerName = bounty.winner_installer_id
      ? (installers.find(i => i.id === bounty.winner_installer_id)?.name ?? 'winner')
      : 'winner'
    setWarn({
      title: 'Reverse payout record?',
      body: `This will mark "${bounty.title}" as unpaid and clear the payment date for ${winnerName}. Only do this if the payment was logged by mistake.`,
      ok: 'Yes, mark unpaid', cancel: 'Cancel',
      danger: true,
      onOk: async () => {
        const { error } = await markUnpaid(bounty.id)
        if (error) setToast('Error: ' + error)
        else setToast('Payout record cleared')
      },
    })
  }

  function handleToggle(bounty: Bounty) {
    setWarn({
      title: bounty.active ? 'Pause this bounty?' : 'Resume this bounty?',
      body: bounty.active ? 'Progress is preserved.' : 'Bounty goes back to active.',
      ok: bounty.active ? 'Pause' : 'Resume', cancel: 'Cancel',
      onOk: async () => {
        const { error } = await toggleActive(bounty.id, !bounty.active)
        if (error) setToast('Error: ' + error)
      },
    })
  }

  function condValidationError(type: ConditionType, valueStr: string, durationDays: number | null): string | null {
    const v = type === 'early_clock_in' ? 1 : parseFloat(valueStr)
    if (!valueStr && type !== 'social_action') return null // blank handled separately
    if (type === 'social_action') return null
    if (isNaN(v) || v <= 0) return 'Value must be greater than 0'
    if (durationDays !== null) {
      if (type === 'work_days' && v > durationDays)
        return `Window is only ${durationDays} day${durationDays !== 1 ? 's' : ''} — can't work ${v} days`
      if (type === 'first_clock_in' && v > durationDays)
        return `Window is only ${durationDays} day${durationDays !== 1 ? 's' : ''} — can't be first in ${v} times`
    }
    return null
  }

  async function handleCreate() {
    if (!fTitle.trim() || !fReward.trim() || !fStart) {
      setToast('Title, reward, and start date are required'); return
    }
    if (fConds.some(c => c.type !== 'social_action' && !c.valueStr)) {
      setToast('All conditions need a value'); return
    }
    const durDays = fEnd
      ? Math.round((new Date(fEnd).getTime() - new Date(fStart + 'T00:00:00').getTime()) / 86400000)
      : null
    const condErrors = fConds.map(c => condValidationError(c.type, c.valueStr, durDays)).filter(Boolean)
    if (condErrors.length) { setToast(condErrors[0]!); return }
    setSaving(true)
    const { error } = await createBounty({
      title:     fTitle.trim(),
      reward:    fReward.trim(),
      startDate: fStart,
      endDate:   fEnd || null,
      conditions: fConds.map(c => ({
        conditionType: c.type,
        operator: '>=',
        value: c.type === 'early_clock_in' ? parseMins(c.valueStr) : parseFloat(c.valueStr) || 1,
        socialActionType: c.type === 'social_action' ? (c.socialActionType ?? 'buy_lunch') : undefined,
      })),
    })
    setSaving(false)
    if (error) { setToast('Error: ' + error); return }
    setFTitle(''); setFReward(''); setFStart(new Date().toISOString().slice(0, 10))
    setFEnd(''); setFConds([newCondRow()]); setSelectedTpl(null); setShowCreate(false)
    setToast('Bounty created!')
  }

  const inp: React.CSSProperties = {
    padding: '10px 12px', fontSize: 13, borderRadius: 10,
    background: B.surface2, color: B.text, border: 'none', outline: 'none', width: '100%',
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: B.textTer, fontSize: 14 }}>Loading bounties…</div>
  )

  return (
    <div>
      <style>{BOUNTY_CSS}</style>
      <WarnModal modal={warn} onClose={() => setWarn(null)} />
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}

      {selectedEntry && (
        <BountyDetailModal
          bounty={selectedEntry.bounty}
          board={selectedEntry.board}
          facts={selectedEntry.facts}
          installers={installers}
          logs={selectedEntry.isDemo ? [] : logs}
          meInstaller={me}
          isAdmin={selectedEntry.isDemo ? false : isAdmin}
          isGuest={isGuest}
          onClose={() => setSelectedBountyId(null)}
          onAward={ip => { if (!selectedEntry.isDemo) handleAward(selectedEntry.bounty, ip) }}
          onMarkPaid={() => { if (!selectedEntry.isDemo) handleMarkPaid(selectedEntry.bounty) }}
          onMarkUnpaid={() => { if (!selectedEntry.isDemo) handleMarkUnpaid(selectedEntry.bounty) }}
          onConfirmSocial={confirmSocialAction}
        />
      )}

      {testWinOpen && installers.length > 0 && (
        <WinTestOverlay
          installer={installers[0]}
          bountyTitle={activeBounties[0]?.title ?? 'Speed Demon'}
          reward={activeBounties[0]?.reward ?? '$100 cash'}
          onClose={() => setTestWinOpen(false)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: B.yellow, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 3 }}>
            Admin · Phase 1
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>Bounties</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {installers.length > 0 && (
            <button
              onClick={() => setTestWinOpen(true)}
              style={{
                background: 'none', color: B.textTer,
                border: `1px solid ${B.border}`, borderRadius: 12,
                padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Test Win
            </button>
          )}
          <button
            onClick={() => { setShowCreate(v => !v); setSelectedTpl(null) }}
            style={{
              background: showCreate ? B.surface2 : B.yellow,
              color: showCreate ? B.textSec : B.bg,
              border: 'none', borderRadius: 12,
              padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {showCreate ? 'Cancel' : '+ New Bounty'}
          </button>
        </div>
      </div>

      {/* Today's First Clock-In */}
      {todayFirstClockIn && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: B.surface, border: `1px solid ${B.border}`,
          borderRadius: 12, padding: '10px 16px', marginBottom: 16,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: todayFirstClockIn.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: B.bg, flexShrink: 0,
          }}>
            {todayFirstClockIn.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Today's First Clock-In</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>
              {todayFirstClockIn.name} <span style={{ color: B.textTer, fontWeight: 500 }}>·</span> <span style={{ color: B.yellow }}>{todayFirstClockIn.time}</span>
            </div>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (() => {
        // Compute active duration from fEnd relative to fStart
        function getActiveDur(): '7d' | '14d' | '30d' | 'none' | 'custom' {
          if (!fEnd) return 'none'
          const days = Math.round((new Date(fEnd).getTime() - new Date(fStart + 'T00:00:00').getTime()) / 86400000)
          if (days === 7)  return '7d'
          if (days === 14) return '14d'
          if (days === 30) return '30d'
          return 'custom'
        }
        function setDur(dur: '7d' | '14d' | '30d' | 'none') {
          if (dur === 'none') { setFEnd(''); return }
          const days = dur === '7d' ? 7 : dur === '14d' ? 14 : 30
          const end = new Date(fStart + 'T00:00:00')
          end.setDate(end.getDate() + days)
          setFEnd(end.toISOString().slice(0, 10))
        }
        const activeDur = getActiveDur()
        const durBtnStyle = (active: boolean): React.CSSProperties => ({
          fontSize: 12, fontWeight: active ? 700 : 500,
          color: active ? B.bg : B.textSec,
          background: active ? B.yellow : B.surface2,
          border: `1px solid ${active ? B.yellow : B.border}`,
          borderRadius: 8, padding: '7px 12px', cursor: 'pointer', flexShrink: 0,
        })
        const rewardPresets = ['$50 cash', '$75 cash', '$100 cash', '$150 cash', '$200 cash']

        return (
          <div style={{
            background: B.surface, border: `1.5px solid ${B.yellow}28`,
            borderRadius: 16, padding: 20, marginBottom: 24,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: B.yellow, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
              New Bounty
            </div>

            {/* ── Template cards ── */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, color: B.textTer, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Start from template
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                {STARTER_TEMPLATES.map(tpl => {
                  const isSelected = selectedTpl === tpl.title
                  return (
                    <button
                      key={tpl.title}
                      onClick={() => {
                        const today = new Date().toISOString().slice(0, 10)
                        const endDate = tpl.daysEnd != null
                          ? new Date(Date.now() + tpl.daysEnd * 86400000).toISOString().slice(0, 10)
                          : ''
                        setFTitle(tpl.title)
                        setFReward(tpl.reward)
                        setFStart(today)
                        setFEnd(endDate)
                        setSelectedTpl(tpl.title)
                        setFConds(tpl.conditions.map(c => ({
                          id: ++condIdRef.current,
                          type: c.type,
                          valueStr: c.valueStr,
                          socialActionType: c.socialActionType,
                        })))
                      }}
                      style={{
                        textAlign: 'left', cursor: 'pointer',
                        background: isSelected ? `${B.yellow}12` : B.surface2,
                        border: `1.5px solid ${isSelected ? B.yellow + '77' : B.border}`,
                        borderRadius: 10, padding: '9px 11px',
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: isSelected ? B.yellow : B.text, marginBottom: 3, lineHeight: 1.3 }}>
                        {tpl.title}
                      </div>
                      <div style={{ fontSize: 10, color: B.textTer, marginBottom: 2 }}>{tpl.hint}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: isSelected ? B.yellow : B.textSec }}>
                        {tpl.reward}{tpl.daysEnd ? ` · ${tpl.daysEnd}d` : ''}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Title ── */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: B.textTer, fontWeight: 600, marginBottom: 5 }}>Title</div>
              <input
                placeholder="e.g. First to 500 sqft"
                value={fTitle}
                onChange={e => { setFTitle(e.target.value); setSelectedTpl(null) }}
                style={inp}
              />
            </div>

            {/* ── Reward ── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: B.textTer, fontWeight: 600, marginBottom: 7 }}>Reward</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 7 }}>
                {rewardPresets.map(p => (
                  <button
                    key={p}
                    onClick={() => setFReward(p)}
                    style={{
                      fontSize: 12, fontWeight: fReward === p ? 700 : 500,
                      color: fReward === p ? B.bg : B.textSec,
                      background: fReward === p ? B.yellow : B.surface2,
                      border: `1px solid ${fReward === p ? B.yellow : B.border}`,
                      borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                    }}
                  >
                    {p.replace(' cash', '')}
                  </button>
                ))}
              </div>
              <input
                placeholder="e.g. $100 cash, Friday off"
                value={fReward}
                onChange={e => setFReward(e.target.value)}
                style={inp}
              />
            </div>

            {/* ── Duration shortcuts ── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: B.textTer, fontWeight: 600, marginBottom: 7 }}>Duration</div>
              <div style={{ display: 'flex', gap: 5, marginBottom: activeDur === 'custom' ? 8 : 0, flexWrap: 'wrap' }}>
                {(['7d', '14d', '30d'] as const).map(d => (
                  <button key={d} onClick={() => setDur(d)} style={durBtnStyle(activeDur === d)}>
                    {d === '7d' ? '1 wk' : d === '14d' ? '2 wks' : '1 mo'}
                  </button>
                ))}
                <button onClick={() => setDur('none')} style={durBtnStyle(activeDur === 'none')}>No end</button>
                <button
                  onClick={() => { if (activeDur !== 'custom') setFEnd('') }}
                  style={durBtnStyle(activeDur === 'custom')}
                >
                  Custom
                </button>
              </div>
              {activeDur === 'custom' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: B.textTer, marginBottom: 4 }}>Start</div>
                    <input type="date" value={fStart} onChange={e => setFStart(e.target.value)} style={{ ...inp, colorScheme: 'dark' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: B.textTer, marginBottom: 4 }}>End</div>
                    <input type="date" value={fEnd} onChange={e => setFEnd(e.target.value)} style={{ ...inp, colorScheme: 'dark' }} />
                  </div>
                </div>
              )}
              {activeDur !== 'custom' && (
                <div style={{ fontSize: 10, color: B.textTer, marginTop: 5 }}>
                  {fEnd
                    ? `${fStart} → ${fEnd}`
                    : `Starts ${fStart} · no end date`}
                </div>
              )}
            </div>

            {/* ── Condition builder ── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: B.textTer, fontWeight: 600, marginBottom: 10 }}>
                Conditions
                {fConds.length > 1 && (
                  <span style={{ marginLeft: 8, color: B.purple, fontWeight: 700 }}>⚡ Parlay — all must be met</span>
                )}
              </div>

              {fConds.map((c, idx) => {
                const cfg = ALL_COND_CONFIG.find(x => x.type === c.type)
                return (
                  <div key={c.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <select
                        value={c.type}
                        onChange={e => setFConds(prev => prev.map((r, i) =>
                          i === idx ? { ...r, type: e.target.value as ConditionType, valueStr: '' } : r
                        ))}
                        style={{ ...inp, width: 'auto', flex: 1, padding: '9px 10px', cursor: 'pointer' }}
                      >
                        {COND_GROUPS.map(g => (
                          <optgroup key={g.label} label={`— ${g.label} —`}>
                            {g.types.map(t => (
                              <option key={t.type} value={t.type}>{t.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>

                      {c.type === 'social_action' ? (
                        <select
                          value={c.socialActionType ?? 'buy_lunch'}
                          onChange={e => setFConds(prev => prev.map((r, i) =>
                            i === idx ? { ...r, socialActionType: e.target.value, valueStr: '1' } : r
                          ))}
                          style={{ ...inp, width: 'auto', flex: 'none', padding: '9px 10px', cursor: 'pointer' }}
                        >
                          <option value="buy_lunch">Buy lunch 🍔</option>
                          <option value="buy_coffee">Buy coffee ☕</option>
                        </select>
                      ) : c.type === 'early_clock_in' ? (
                        <input
                          type="time"
                          value={c.valueStr}
                          onChange={e => setFConds(prev => prev.map((r, i) =>
                            i === idx ? { ...r, valueStr: e.target.value } : r
                          ))}
                          style={{ ...inp, width: 110, flex: 'none', colorScheme: 'dark' }}
                        />
                      ) : (
                        <input
                          type="number"
                          placeholder={cfg?.placeholder ?? '0'}
                          value={c.valueStr}
                          onChange={e => setFConds(prev => prev.map((r, i) =>
                            i === idx ? { ...r, valueStr: e.target.value } : r
                          ))}
                          style={{ ...inp, width: 88, flex: 'none' }}
                        />
                      )}

                      {fConds.length > 1 && (
                        <button
                          onClick={() => setFConds(prev => prev.filter((_, i) => i !== idx))}
                          style={{ background: 'none', border: 'none', color: B.textTer, fontSize: 18, cursor: 'pointer', padding: '8px 4px', flexShrink: 0 }}
                        >×</button>
                      )}
                    </div>
                    {(() => {
                      const durDays = fEnd
                        ? Math.round((new Date(fEnd).getTime() - new Date(fStart + 'T00:00:00').getTime()) / 86400000)
                        : null
                      const err = c.valueStr ? condValidationError(c.type, c.valueStr, durDays) : null
                      if (err) return (
                        <div style={{ fontSize: 11, color: B.red, marginTop: 4, marginLeft: 2, fontWeight: 600 }}>
                          ⚠ {err}
                        </div>
                      )
                      if (cfg && c.type !== 'social_action') return (
                        <div style={{ fontSize: 10, color: B.textTer, marginTop: 3, marginLeft: 2 }}>{cfg.help}</div>
                      )
                      return null
                    })()}
                  </div>
                )
              })}

              <button
                onClick={() => setFConds(prev => [...prev, newCondRow()])}
                style={{
                  background: 'transparent', border: `1px dashed ${B.border}`,
                  borderRadius: 8, padding: '7px 12px', fontSize: 12,
                  color: B.textTer, cursor: 'pointer', marginTop: 4, width: '100%',
                }}
              >
                + Add condition (makes it a Parlay)
              </button>
            </div>

            <button
              onClick={handleCreate}
              disabled={saving}
              style={{
                width: '100%', background: B.yellow, color: B.bg,
                border: 'none', borderRadius: 12, padding: 14,
                fontSize: 15, fontWeight: 800,
                cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Creating…' : 'Create Bounty'}
            </button>
          </div>
        )
      })()}

      {/* Empty state */}
      {!activeBounties.length && !completedBounties.length && (
        <div style={{
          textAlign: 'center', padding: '52px 20px',
          background: B.surface, borderRadius: 20, border: `1px solid ${B.border}`,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>◆</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No bounties yet</div>
          <div style={{ fontSize: 13, color: B.textTer }}>Create a bounty to start tracking performance.</div>
        </div>
      )}

      {/* Featured bounty */}
      {featured && (() => {
        const { board, facts } = boardsByBounty.get(featured.id) ?? { board: [], facts: [] }
        return (
          <FeaturedBountyCard
            bounty={featured}
            board={board}
            facts={facts}
            isAdmin={isAdmin}
            onAward={ip => handleAward(featured, ip)}
            onToggle={() => handleToggle(featured)}
            onDelete={() => handleDelete(featured)}
            meInstaller={me}
            onSelect={() => setSelectedBountyId(featured.id)}
          />
        )
      })()}

      {/* Remaining active bounties — 2-column grid */}
      {activeBounties.length > 1 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Active</div>
            <div style={{ flex: 1, height: 1, background: B.border }} />
          </div>
          <div className="bounty-active-grid">
            {activeBounties.slice(1).map(b => {
              const { board, facts } = boardsByBounty.get(b.id) ?? { board: [], facts: [] }
              return (
                <ActiveBountyCard
                  key={b.id}
                  bounty={b}
                  board={board}
                  facts={facts}
                  isAdmin={isAdmin}
                  onAward={ip => handleAward(b, ip)}
                  onToggle={() => handleToggle(b)}
                  onDelete={() => handleDelete(b)}
                  compact
                  onSelect={() => setSelectedBountyId(b.id)}
                />
              )
            })}
          </div>
        </>
      )}

      {/* Hall of Fame */}
      {completedBounties.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: activeBounties.length ? 8 : 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Hall of Fame</div>
            <div style={{ flex: 1, height: 1, background: B.border }} />
          </div>
          {completedBounties.map(b => {
            const w = b.winner_installer_id ? installers.find(i => i.id === b.winner_installer_id) ?? null : null
            return <CompletedCard key={b.id} bounty={b} winner={w} isAdmin={isAdmin} onMarkPaid={() => handleMarkPaid(b)} onMarkUnpaid={() => handleMarkUnpaid(b)} onSelect={() => setSelectedBountyId(b.id)} />
          })}
        </>
      )}

      {/* Redemption instructions */}
      <RedemptionCard />

      {/* Demo previews */}
      {demoBounties.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              ⚗ Demo Previews
            </div>
            <div style={{ flex: 1, height: 1, background: B.border }} />
            <button
              onClick={() => setShowDemo(v => !v)}
              style={{ fontSize: 10, color: B.textTer, background: 'none', border: `1px solid ${B.border}`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontWeight: 600 }}
            >
              {showDemo ? 'Hide' : 'Show'}
            </button>
          </div>

          {showDemo && (
            <>
              <div style={{
                background: `${B.orange}0A`, border: `1px dashed ${B.orange}28`,
                borderRadius: 10, padding: '9px 14px', marginBottom: 16,
                fontSize: 11, color: B.textTer, lineHeight: 1.6,
              }}>
                Example bounties showing UI previews — not connected to real data.
              </div>

              {/* Featured demo (Speed Demon) */}
              <FeaturedBountyCard
                bounty={demoBounties[0].bounty}
                board={demoBounties[0].board}
                facts={demoBounties[0].facts}
                isAdmin={false}
                onAward={() => {}}
                onToggle={() => {}}
                onDelete={() => {}}
                meInstaller={me}
                onSelect={() => setSelectedBountyId(demoBounties[0].bounty.id)}
              />

              {/* Active demos */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Active</div>
                <div style={{ flex: 1, height: 1, background: B.border }} />
              </div>
              <div className="bounty-active-grid">
                {demoBounties.slice(1).filter(e => e.bounty.active).map(e => (
                  <ActiveBountyCard
                    key={e.bounty.id}
                    bounty={e.bounty}
                    board={e.board}
                    facts={e.facts}
                    isAdmin={false}
                    onAward={() => {}}
                    onToggle={() => {}}
                    onDelete={() => {}}
                    compact
                    onSelect={() => setSelectedBountyId(e.bounty.id)}
                  />
                ))}
              </div>

              {/* Completed demo */}
              {demoBounties.some(e => !e.bounty.active) && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Hall of Fame</div>
                    <div style={{ flex: 1, height: 1, background: B.border }} />
                  </div>
                  {demoBounties.filter(e => !e.bounty.active).map(e => {
                    const w = e.bounty.winner_installer_id
                      ? installers.find(i => i.id === e.bounty.winner_installer_id) ?? null
                      : null
                    return <CompletedCard key={e.bounty.id} bounty={e.bounty} winner={w} isAdmin={true} onMarkPaid={() => {}} onMarkUnpaid={() => {}} onSelect={() => setSelectedBountyId(e.bounty.id)} />
                  })}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
