import { useState, useMemo, useRef } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { useAuth } from '../../context/AuthContext'
import { useBounties } from '../../hooks/useBounties'
import { Toast } from '../ui/Toast'
import { WarnModal } from '../ui/WarnModal'
import { B, fmtDate } from '../../lib/utils'
import type { Bounty, BountyCondition, ConditionType, Installer, Log, WarnConfig } from '../../lib/types'

// ── helpers ──────────────────────────────────────────────────────────────────

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


function condLabel(type: ConditionType, value: number): string {
  switch (type) {
    case 'sqft_total': return `${value.toFixed(0)} sqft total`
    case 'panels': return `${value} panels completed`
    case 'sqft_per_hr': return `${value} sqft/hr average`
    case 'early_clock_in': return `First in before ${minsToTime(value)}`
  }
}

function condValueDisplay(type: ConditionType, value: number): string {
  switch (type) {
    case 'sqft_total': return value.toFixed(1) + ' sqft'
    case 'panels': return value + ' panels'
    case 'sqft_per_hr': return value.toFixed(1) + '/hr'
    case 'early_clock_in': return value + (value === 1 ? ' early start' : ' early starts')
  }
}

function condTargetDisplay(cond: BountyCondition): string {
  switch (cond.condition_type as ConditionType) {
    case 'sqft_total': return cond.value.toFixed(0)
    case 'panels': return String(cond.value)
    case 'sqft_per_hr': return cond.value.toFixed(1)
    case 'early_clock_in': return '1 before ' + minsToTime(cond.value)
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

// ── progress calculation ──────────────────────────────────────────────────────

interface CondProg { value: number; pct: number; done: boolean }
interface InstProg {
  installer: Installer
  conds: CondProg[]
  overallPct: number
  allDone: boolean
}

function calcInstProg(
  installerId: string,
  conditions: BountyCondition[],
  logs: Log[],
  bounty: Bounty
): CondProg[] {
  const start = new Date(bounty.start_date + 'T00:00:00')
  const end = bounty.end_date ? new Date(bounty.end_date + 'T23:59:59') : new Date()
  const inRange = logs.filter(r =>
    r.installer_id === installerId &&
    r.status === 'Complete' &&
    r.start_ts &&
    new Date(r.start_ts) >= start &&
    new Date(r.start_ts) <= end
  )

  return conditions.map(cond => {
    let value = 0
    let target = cond.value

    if (cond.condition_type === 'sqft_total') {
      value = inRange.filter(r => !r.is_color_change).reduce((s, r) => s + (r.sqft ?? 0), 0)
    } else if (cond.condition_type === 'panels') {
      value = inRange.filter(r => !r.is_color_change).length
    } else if (cond.condition_type === 'sqft_per_hr') {
      const withRate = inRange.filter(r => !r.is_color_change && r.sqftHr != null)
      value = withRate.length > 0
        ? withRate.reduce((s, r) => s + (r.sqftHr ?? 0), 0) / withRate.length
        : 0
    } else if (cond.condition_type === 'early_clock_in') {
      const cutoff = cond.value
      const days = new Set<string>()
      for (const r of inRange) {
        const d = new Date(r.start_ts)
        if (d.getHours() * 60 + d.getMinutes() < cutoff) days.add(d.toDateString())
      }
      value = days.size
      target = 1
    }

    const pct = target > 0 ? Math.min(1, value / target) : 0
    return { value, pct, done: pct >= 1 }
  })
}

function calcLeaderboard(bounty: Bounty, installers: Installer[], logs: Log[]): InstProg[] {
  const conditions = bounty.conditions ?? []
  return installers
    .map(inst => {
      const conds = conditions.length > 0 ? calcInstProg(inst.id, conditions, logs, bounty) : []
      const overallPct = conds.length > 0 ? Math.min(...conds.map(c => c.pct)) : 0
      const allDone = conds.length > 0 && conds.every(c => c.done)
      return { installer: inst, conds, overallPct, allDone }
    })
    .filter(ip => ip.conds.some(c => c.value > 0) || ip.allDone)
    .sort((a, b) => {
      if (a.allDone && !b.allDone) return -1
      if (!a.allDone && b.allDone) return 1
      return b.overallPct - a.overallPct
    })
}

function genFunFacts(bounty: Bounty, board: InstProg[]): string[] {
  const facts: string[] = []
  if (!board.length) return facts
  const conditions = bounty.conditions ?? []
  const leader = board[0]
  const second = board[1]

  if (leader && second && conditions[0] && leader.conds[0] && second.conds[0]) {
    const cond = conditions[0]
    const gap = leader.conds[0].value - second.conds[0].value
    const name = leader.installer.name.split(' ')[0]
    if (gap > 0) {
      if (cond.condition_type === 'sqft_total')
        facts.push(`${name} leads by ${gap.toFixed(1)} sqft`)
      else if (cond.condition_type === 'panels')
        facts.push(`${name} leads by ${Math.round(gap)} panel${Math.round(gap) !== 1 ? 's' : ''}`)
      else if (cond.condition_type === 'sqft_per_hr')
        facts.push(`${name} is ${gap.toFixed(1)} sqft/hr faster than 2nd`)
    }
  }

  if (leader && conditions[0] && leader.conds[0] && leader.overallPct > 0.5 && leader.overallPct < 1) {
    const cond = conditions[0]
    const target = cond.condition_type === 'early_clock_in' ? 1 : cond.value
    const remaining = target - leader.conds[0].value
    const name = leader.installer.name.split(' ')[0]
    if (cond.condition_type === 'sqft_total' && remaining > 0)
      facts.push(`${name} needs ${remaining.toFixed(1)} more sqft to win`)
    else if (cond.condition_type === 'panels' && remaining > 0)
      facts.push(`${name} needs ${Math.ceil(remaining)} more panel${Math.ceil(remaining) !== 1 ? 's' : ''}`)
  }

  if (leader?.conds[0] && conditions[0]?.condition_type === 'sqft_total' && leader.conds[0].value > 100) {
    const sqft = leader.conds[0].value
    facts.push(`${sqft.toFixed(0)} sqft ≈ ${(sqft / 9).toFixed(0)} parking spaces`)
  }

  if (conditions.length > 1 && leader && leader.overallPct > 0) {
    facts.push(`Parlay is ${(leader.overallPct * 100).toFixed(0)}% complete`)
  }

  return facts.slice(0, 2)
}

// ── sub-components ────────────────────────────────────────────────────────────

const MEDALS = ['#F5C400', '#B0B8C1', '#CD7F32']

function ConditionRow({
  cond,
  prog,
}: {
  cond: BountyCondition
  prog?: CondProg
}) {
  const type = cond.condition_type as ConditionType
  const label = condLabel(type, cond.value)
  const pct = prog?.pct ?? 0
  const done = prog?.done ?? false

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: done ? B.green : B.textSec, display: 'flex', gap: 6, alignItems: 'center' }}>
          {done
            ? <span style={{ color: B.green, fontWeight: 800, fontSize: 13 }}>✓</span>
            : <span style={{ width: 8, height: 8, borderRadius: '50%', background: B.yellow, display: 'inline-block', flexShrink: 0 }} />
          }
          {label}
        </span>
        {prog && (
          <span style={{ fontSize: 11, fontWeight: 700, color: done ? B.green : B.yellow, flexShrink: 0 }}>
            {condValueDisplay(type, prog.value)} / {condTargetDisplay(cond)}
          </span>
        )}
      </div>
      <div style={{ height: 7, background: B.surface3, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, pct * 100)}%`,
          background: done ? B.green : `linear-gradient(90deg, ${B.yellow}, ${B.orange})`,
          borderRadius: 4,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  )
}

function MiniLeaderboard({
  board,
  winnerId,
  onAward,
  isAdmin,
}: {
  board: InstProg[]
  winnerId: string | null
  onAward?: (ip: InstProg) => void
  isAdmin: boolean
}) {
  const top = board.slice(0, 4)
  if (!top.length) return (
    <div style={{ fontSize: 12, color: B.textTer, padding: '8px 0' }}>No activity yet</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {top.map((ip, i) => {
        const isLeader = i === 0
        const isWinner = ip.installer.id === winnerId
        return (
          <div
            key={ip.installer.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 10,
              background: isWinner ? `${B.yellow}12` : isLeader ? `${B.yellow}08` : B.surface2,
              border: `1px solid ${isWinner ? B.yellow + '55' : isLeader ? B.yellow + '22' : 'transparent'}`,
            }}
          >
            <div style={{
              fontSize: 11,
              fontWeight: 800,
              color: MEDALS[i] ?? B.textTer,
              minWidth: 18,
              textAlign: 'center',
            }}>
              {i + 1}
            </div>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: ip.installer.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 800,
              color: B.bg,
              flexShrink: 0,
              boxShadow: isLeader && ip.overallPct > 0 ? `0 0 10px ${ip.installer.color}55` : 'none',
            }}>
              {ip.installer.name.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: isLeader ? 700 : 500, marginBottom: 3 }}>
                {ip.installer.name.split(' ')[0]}
                {isWinner && <span style={{ marginLeft: 6, fontSize: 12 }}>🏆</span>}
                {ip.allDone && !isWinner && <span style={{ marginLeft: 6, fontSize: 10, color: B.green, fontWeight: 700 }}>DONE</span>}
              </div>
              <div style={{ height: 4, background: B.surface3, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, ip.overallPct * 100)}%`,
                  background: ip.allDone ? B.green : ip.installer.color,
                  borderRadius: 2,
                  transition: 'width 0.6s',
                }} />
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontSize: 14,
                fontWeight: 800,
                color: ip.allDone ? B.green : isLeader ? B.yellow : B.text,
              }}>
                {(ip.overallPct * 100).toFixed(0)}%
              </div>
              {isAdmin && onAward && !winnerId && (
                <button
                  onClick={() => onAward(ip)}
                  style={{
                    fontSize: 10,
                    color: B.textTer,
                    background: 'none',
                    border: `1px solid ${B.border}`,
                    borderRadius: 6,
                    padding: '2px 6px',
                    cursor: 'pointer',
                    marginTop: 2,
                    display: 'block',
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
  )
}

function FeaturedBountyCard({
  bounty,
  board,
  isAdmin,
  onAward,
  onToggle,
  onDelete,
}: {
  bounty: Bounty
  board: InstProg[]
  isAdmin: boolean
  onAward: (ip: InstProg) => void
  onToggle: () => void
  onDelete: () => void
}) {
  const conditions = bounty.conditions ?? []
  const leader = board[0]
  const facts = genFunFacts(bounty, board)
  const tLeft = fmtTimeLeft(bounty.end_date)
  const tColor = timeLeftColor(bounty.end_date)
  const isParlay = conditions.length > 1
  const winner = board.find(ip => ip.installer.id === bounty.winner_installer_id)

  return (
    <div style={{
      background: 'linear-gradient(145deg, #1C1C1E 0%, #242420 100%)',
      border: `1.5px solid ${B.yellow}33`,
      borderRadius: 20,
      padding: 24,
      marginBottom: 20,
      boxShadow: `0 0 40px rgba(245,196,0,0.07), 0 8px 32px rgba(0,0,0,0.5)`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Glow accent */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 200,
        height: 200,
        background: `radial-gradient(circle, ${B.yellow}10 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, position: 'relative' }}>
        <div style={{ flex: 1, marginRight: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
              fontSize: 10,
              fontWeight: 800,
              color: B.yellow,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}>
              {winner ? '🏆 Closed' : isParlay ? '⚡ Parlay Bounty' : '◆ Featured'}
            </div>
            {isAdmin && !winner && (
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button
                  onClick={onToggle}
                  style={{ fontSize: 10, color: B.textTer, background: 'none', border: `1px solid ${B.border}`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
                >
                  Pause
                </button>
                <button
                  onClick={onDelete}
                  style={{ fontSize: 10, color: B.red, background: 'none', border: `1px solid ${B.red}44`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, marginBottom: 8, letterSpacing: '-0.02em' }}>
            {bounty.title}
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: `${B.yellow}18`,
            border: `1px solid ${B.yellow}44`,
            borderRadius: 10,
            padding: '5px 12px',
          }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: B.yellow }}>{bounty.reward}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: tColor,
            background: tColor + '18',
            border: `1px solid ${tColor}33`,
            borderRadius: 8,
            padding: '4px 10px',
            marginBottom: 4,
          }}>
            {tLeft}
          </div>
          <div style={{ fontSize: 10, color: B.textTer }}>
            {fmtDate(bounty.start_date)}{bounty.end_date ? ` – ${fmtDate(bounty.end_date)}` : ''}
          </div>
        </div>
      </div>

      {/* Winner banner */}
      {winner && (
        <div style={{
          background: `linear-gradient(90deg, ${B.yellow}22, ${B.yellow}08)`,
          border: `1px solid ${B.yellow}55`,
          borderRadius: 12,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
        }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: winner.installer.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: B.bg }}>
            {winner.installer.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontSize: 11, color: B.yellow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Winner</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{winner.installer.name}</div>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 22 }}>🏆</span>
        </div>
      )}

      {/* Leader highlight */}
      {!winner && leader && leader.overallPct > 0 && (
        <div style={{
          background: `${leader.installer.color}10`,
          border: `1px solid ${leader.installer.color}33`,
          borderRadius: 12,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
        }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: leader.installer.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: B.bg, boxShadow: `0 0 14px ${leader.installer.color}44` }}>
            {leader.installer.name.charAt(0)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: B.textTer, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Leading</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{leader.installer.name.split(' ')[0]}</div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: leader.installer.color }}>
            {(leader.overallPct * 100).toFixed(0)}%
          </div>
        </div>
      )}

      {/* Conditions */}
      {conditions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {isParlay && (
            <div style={{ fontSize: 10, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              All conditions must be met
            </div>
          )}
          {conditions.map(cond => (
            <ConditionRow
              key={cond.id}
              cond={cond}
              prog={leader?.conds[conditions.indexOf(cond)]}
            />
          ))}
        </div>
      )}

      {/* Leaderboard */}
      {board.length > 0 && (
        <div style={{ marginBottom: facts.length > 0 ? 16 : 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Standings
          </div>
          <MiniLeaderboard
            board={board}
            winnerId={bounty.winner_installer_id}
            onAward={onAward}
            isAdmin={isAdmin}
          />
        </div>
      )}

      {/* Fun facts */}
      {facts.length > 0 && !winner && (
        <div style={{ borderTop: `1px solid ${B.border}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {facts.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: B.yellow, fontSize: 12, flexShrink: 0, marginTop: 1 }}>◆</span>
              <span style={{ fontSize: 12, color: B.textSec, lineHeight: 1.5 }}>{f}</span>
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
  isAdmin,
  onAward,
  onToggle,
  onDelete,
}: {
  bounty: Bounty
  board: InstProg[]
  isAdmin: boolean
  onAward: (ip: InstProg) => void
  onToggle: () => void
  onDelete: () => void
}) {
  const conditions = bounty.conditions ?? []
  const isParlay = conditions.length > 1
  const tLeft = fmtTimeLeft(bounty.end_date)
  const tColor = timeLeftColor(bounty.end_date)
  const leader = board[0]

  return (
    <div style={{
      background: B.surface,
      border: `1px solid ${B.border}`,
      borderRadius: 16,
      padding: 18,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1, marginRight: 8 }}>
          {isParlay && (
            <div style={{ fontSize: 10, fontWeight: 700, color: B.purple, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>⚡ Parlay</div>
          )}
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{bounty.title}</div>
          <div style={{ fontSize: 12, color: B.yellow, fontWeight: 700 }}>{bounty.reward}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: tColor }}>{tLeft}</div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 5 }}>
              <button
                onClick={onToggle}
                style={{ fontSize: 10, color: B.textTer, background: 'none', border: `1px solid ${B.border}`, borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}
              >
                Pause
              </button>
              <button
                onClick={onDelete}
                style={{ fontSize: 10, color: B.red, background: 'none', border: `1px solid ${B.red}44`, borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Conditions */}
      <div style={{ marginBottom: 12 }}>
        {conditions.map(cond => (
          <ConditionRow
            key={cond.id}
            cond={cond}
            prog={leader?.conds[conditions.indexOf(cond)]}
          />
        ))}
      </div>

      {/* Standings */}
      {board.length > 0 && (
        <MiniLeaderboard
          board={board}
          winnerId={bounty.winner_installer_id}
          onAward={onAward}
          isAdmin={isAdmin}
        />
      )}
      {!board.length && (
        <div style={{ fontSize: 12, color: B.textTer, padding: '4px 0' }}>No activity yet — be first.</div>
      )}
    </div>
  )
}

function CompletedCard({ bounty, winner }: { bounty: Bounty; winner: Installer | null }) {
  return (
    <div style={{
      background: B.surface,
      border: `1px solid ${B.border}`,
      borderRadius: 14,
      padding: '14px 16px',
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{ fontSize: 20, flexShrink: 0 }}>🏆</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{bounty.title}</div>
        <div style={{ fontSize: 12, color: B.textTer }}>
          {bounty.reward} · {fmtDate(bounty.start_date)}
          {bounty.end_date ? ` – ${fmtDate(bounty.end_date)}` : ''}
        </div>
      </div>
      {winner && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: winner.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: B.bg }}>
            {winner.name.charAt(0)}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.yellow }}>{winner.name.split(' ')[0]}</div>
        </div>
      )}
      {!winner && (
        <div style={{ fontSize: 11, color: B.textTer }}>No winner set</div>
      )}
    </div>
  )
}

// ── form types ────────────────────────────────────────────────────────────────

interface CondRow {
  id: number
  type: ConditionType
  valueStr: string
}

const COND_TYPE_LABELS: Record<ConditionType, string> = {
  sqft_total: 'Total SQFT',
  panels: 'Panel Count',
  sqft_per_hr: 'Avg SQFT/HR',
  early_clock_in: 'Early Clock-In',
}

// ── main component ────────────────────────────────────────────────────────────

export default function Bounties() {
  const { logs, installers } = useAppData()
  const { isAdmin } = useAuth()
  const { bounties, loading, createBounty, deleteBounty, toggleActive, awardWin } = useBounties()

  const condIdRef = useRef(0)
  function newCondRow(type: ConditionType = 'sqft_total'): CondRow {
    return { id: ++condIdRef.current, type, valueStr: '' }
  }

  const [showCreate, setShowCreate] = useState(false)
  const [toast, setToast] = useState('')
  const [warn, setWarn] = useState<WarnConfig | null>(null)
  const [saving, setSaving] = useState(false)

  // Create form state
  const [fTitle, setFTitle] = useState('')
  const [fReward, setFReward] = useState('')
  const [fStart, setFStart] = useState(new Date().toISOString().slice(0, 10))
  const [fEnd, setFEnd] = useState('')
  const [fConds, setFConds] = useState<CondRow[]>([newCondRow()])

  const activeBounties = useMemo(() => bounties.filter(b => b.active), [bounties])
  const completedBounties = useMemo(() => bounties.filter(b => !b.active), [bounties])

  // Pre-calculate leaderboards for all bounties
  const boardsByBounty = useMemo(() => {
    const m = new Map<string, InstProg[]>()
    for (const b of bounties) {
      m.set(b.id, calcLeaderboard(b, installers, logs))
    }
    return m
  }, [bounties, installers, logs])

  const featured = activeBounties[0] ?? null

  function handleAward(bounty: Bounty, ip: InstProg) {
    setWarn({
      title: `Award win to ${ip.installer.name.split(' ')[0]}?`,
      body: `This will close the bounty and mark ${ip.installer.name} as the winner. This cannot be undone.`,
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
      ok: 'Delete',
      cancel: 'Cancel',
      danger: true,
      onOk: async () => {
        const { error } = await deleteBounty(bounty.id)
        if (error) setToast('Error: ' + error)
        else setToast('Bounty deleted')
      },
    })
  }

  function handleToggle(bounty: Bounty) {
    setWarn({
      title: bounty.active ? 'Pause this bounty?' : 'Resume this bounty?',
      body: bounty.active
        ? 'Progress is preserved. You can resume it later.'
        : 'This bounty will go back to active.',
      ok: bounty.active ? 'Pause' : 'Resume',
      cancel: 'Cancel',
      onOk: async () => {
        const { error } = await toggleActive(bounty.id, !bounty.active)
        if (error) setToast('Error: ' + error)
      },
    })
  }

  async function handleCreate() {
    if (!fTitle.trim() || !fReward.trim() || !fStart) {
      setToast('Title, reward, and start date are required')
      return
    }
    if (fConds.some(c => !c.valueStr)) {
      setToast('All conditions need a value')
      return
    }

    setSaving(true)
    const { error } = await createBounty({
      title: fTitle.trim(),
      reward: fReward.trim(),
      startDate: fStart,
      endDate: fEnd || null,
      conditions: fConds.map(c => ({
        conditionType: c.type,
        operator: '>=',
        value: c.type === 'early_clock_in' ? parseMins(c.valueStr) : parseFloat(c.valueStr),
      })),
    })
    setSaving(false)

    if (error) { setToast('Error: ' + error); return }

    setFTitle('')
    setFReward('')
    setFStart(new Date().toISOString().slice(0, 10))
    setFEnd('')
    setFConds([newCondRow()])
    setShowCreate(false)
    setToast('Bounty created!')
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px',
    fontSize: 13,
    borderRadius: 10,
    background: B.surface2,
    color: B.text,
    border: 'none',
    outline: 'none',
    width: '100%',
  }

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: B.textTer, fontSize: 14 }}>Loading bounties…</div>
  )

  return (
    <div>
      <WarnModal modal={warn} onClose={() => setWarn(null)} />
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: B.yellow, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Admin · Phase 1
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}>
            Bounties
          </div>
        </div>
        <button
          onClick={() => setShowCreate(v => !v)}
          style={{
            background: showCreate ? B.surface2 : B.yellow,
            color: showCreate ? B.textSec : B.bg,
            border: 'none',
            borderRadius: 12,
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {showCreate ? 'Cancel' : '+ New Bounty'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{
          background: B.surface,
          border: `1px solid ${B.yellow}33`,
          borderRadius: 16,
          padding: 20,
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.yellow, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
            New Bounty
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: B.textTer, fontWeight: 600, marginBottom: 5 }}>Title</div>
            <input
              placeholder="e.g. First to 500 sqft"
              value={fTitle}
              onChange={e => setFTitle(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: B.textTer, fontWeight: 600, marginBottom: 5 }}>Reward</div>
            <input
              placeholder="e.g. $100 bonus, Friday off"
              value={fReward}
              onChange={e => setFReward(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: B.textTer, fontWeight: 600, marginBottom: 5 }}>Start Date</div>
              <input
                type="date"
                value={fStart}
                onChange={e => setFStart(e.target.value)}
                style={{ ...inputStyle, colorScheme: 'dark' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: B.textTer, fontWeight: 600, marginBottom: 5 }}>End Date (optional)</div>
              <input
                type="date"
                value={fEnd}
                onChange={e => setFEnd(e.target.value)}
                style={{ ...inputStyle, colorScheme: 'dark' }}
              />
            </div>
          </div>

          {/* Condition builder */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: B.textTer, fontWeight: 600, marginBottom: 8 }}>
              Conditions {fConds.length > 1 && <span style={{ color: B.purple }}>— Parlay</span>}
            </div>
            {fConds.map((c, idx) => (
              <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6 }}>
                <select
                  value={c.type}
                  onChange={e => setFConds(prev => prev.map((r, i) =>
                    i === idx ? { ...r, type: e.target.value as ConditionType, valueStr: '' } : r
                  ))}
                  style={{
                    ...inputStyle,
                    width: 'auto',
                    flex: 1,
                    padding: '9px 10px',
                    cursor: 'pointer',
                  }}
                >
                  {(Object.keys(COND_TYPE_LABELS) as ConditionType[]).map(t => (
                    <option key={t} value={t}>{COND_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                {c.type === 'early_clock_in' ? (
                  <input
                    type="time"
                    value={c.valueStr}
                    onChange={e => setFConds(prev => prev.map((r, i) =>
                      i === idx ? { ...r, valueStr: e.target.value } : r
                    ))}
                    style={{ ...inputStyle, width: 110, flex: 'none', colorScheme: 'dark' }}
                  />
                ) : (
                  <input
                    type="number"
                    placeholder={c.type === 'sqft_total' ? '500' : c.type === 'panels' ? '10' : '25'}
                    value={c.valueStr}
                    onChange={e => setFConds(prev => prev.map((r, i) =>
                      i === idx ? { ...r, valueStr: e.target.value } : r
                    ))}
                    style={{ ...inputStyle, width: 90, flex: 'none' }}
                  />
                )}
                {fConds.length > 1 && (
                  <button
                    onClick={() => setFConds(prev => prev.filter((_, i) => i !== idx))}
                    style={{ background: 'none', border: 'none', color: B.textTer, fontSize: 18, cursor: 'pointer', padding: '8px 4px', flexShrink: 0 }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setFConds(prev => [...prev, newCondRow()])}
              style={{
                background: 'transparent',
                border: `1px dashed ${B.border}`,
                borderRadius: 8,
                padding: '7px 12px',
                fontSize: 12,
                color: B.textTer,
                cursor: 'pointer',
                marginTop: 2,
              }}
            >
              + Add condition (parlay)
            </button>
          </div>

          <button
            onClick={handleCreate}
            disabled={saving}
            style={{
              width: '100%',
              background: B.yellow,
              color: B.bg,
              border: 'none',
              borderRadius: 12,
              padding: 14,
              fontSize: 15,
              fontWeight: 800,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1,
              marginTop: 4,
            }}
          >
            {saving ? 'Creating…' : 'Create Bounty'}
          </button>
        </div>
      )}

      {/* Empty state */}
      {!activeBounties.length && !completedBounties.length && (
        <div style={{
          textAlign: 'center',
          padding: '48px 20px',
          background: B.surface,
          borderRadius: 20,
          border: `1px solid ${B.border}`,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>◆</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No bounties yet</div>
          <div style={{ fontSize: 13, color: B.textTer }}>Create your first bounty to start tracking performance.</div>
        </div>
      )}

      {/* Featured bounty (first active) */}
      {featured && (() => {
        const board = boardsByBounty.get(featured.id) ?? []
        return (
          <FeaturedBountyCard
            bounty={featured}
            board={board}
            isAdmin={isAdmin}
            onAward={ip => handleAward(featured, ip)}
            onToggle={() => handleToggle(featured)}
            onDelete={() => handleDelete(featured)}
          />
        )
      })()}

      {/* Remaining active bounties */}
      {activeBounties.length > 1 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Active Bounties
            </div>
            <div style={{ flex: 1, height: 1, background: B.border }} />
          </div>
          {activeBounties.slice(1).map(b => {
            const board = boardsByBounty.get(b.id) ?? []
            return (
              <ActiveBountyCard
                key={b.id}
                bounty={b}
                board={board}
                isAdmin={isAdmin}
                onAward={ip => handleAward(b, ip)}
                onToggle={() => handleToggle(b)}
                onDelete={() => handleDelete(b)}
              />
            )
          })}
        </>
      )}

      {/* Hall of fame */}
      {completedBounties.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: activeBounties.length ? 8 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: B.textTer, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Hall of Fame
            </div>
            <div style={{ flex: 1, height: 1, background: B.border }} />
          </div>
          {completedBounties.map(b => {
            const w = b.winner_installer_id ? installers.find(i => i.id === b.winner_installer_id) ?? null : null
            return <CompletedCard key={b.id} bounty={b} winner={w} />
          })}
        </>
      )}
    </div>
  )
}
