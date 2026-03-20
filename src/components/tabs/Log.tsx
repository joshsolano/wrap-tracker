import { useState } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { useAuth } from '../../context/AuthContext'
import { WarnModal } from '../ui/WarnModal'
import { Toast } from '../ui/Toast'
import { B, CC, fmtDate, fmtClock, fmtTime } from '../../lib/utils'
import type { Log, WarnConfig } from '../../lib/types'
import ManualEntryModal from './ManualEntryModal'

const PAGE_SIZE = 50

export default function LogTab() {
  const { logs, installers, deleteLog } = useAppData()
  const { isAdmin, isGuest } = useAuth()
  const [filter, setFilter] = useState('All')
  const [page, setPage] = useState(0)
  const [warn, setWarn] = useState<WarnConfig | null>(null)
  const [toast, setToast] = useState('')
  const [showManual, setShowManual] = useState(false)

  const filtered = logs.filter(
    r => filter === 'All' || (r.installer_name ?? r.installer?.name ?? '').split(' ')[0] === filter
  )
  const visible = filtered.slice(0, (page + 1) * PAGE_SIZE)

  function confirmDelete(log: Log) {
    if (!isAdmin) return
    setWarn({
      title: 'Delete this entry?',
      body: `${log.panel_name} · ${log.project_name} · ${fmtDate(log.start_ts)}`,
      ok: 'Delete',
      cancel: 'Cancel',
      danger: true,
      onOk: async () => {
        const { error } = await deleteLog(log.id)
        if (error) setToast('Error: ' + error)
        else setToast('Entry deleted')
      },
    })
  }

  function initials(name: string) {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
  }

  return (
    <div>
      <WarnModal modal={warn} onClose={() => setWarn(null)} />
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      {showManual && (
        <ManualEntryModal
          onClose={() => setShowManual(false)}
          onSave={() => {
            setShowManual(false)
            setToast('Manual entry saved')
          }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, flex: 1 }}>
          {['All', ...installers.map(i => i.name.split(' ')[0])].map(f => (
            <button
              key={f}
              onClick={() => {
                setFilter(f)
                setPage(0)
              }}
              style={{
                padding: '7px 14px',
                borderRadius: 20,
                border: `1.5px solid ${filter === f ? B.yellow : B.border}`,
                background: filter === f ? B.yellow + '18' : 'transparent',
                color: filter === f ? B.yellow : B.textSec,
                fontWeight: filter === f ? 700 : 400,
                fontSize: 13,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {f}
            </button>
          ))}
        </div>
        {!isGuest && (
          <button
            onClick={() => setShowManual(true)}
            style={{
              marginLeft: 8,
              background: B.surface2,
              color: B.textSec,
              border: `1px solid ${B.border}`,
              borderRadius: 10,
              padding: '7px 12px',
              fontSize: 12,
              fontWeight: 600,
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            + Manual
          </button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          background: B.surface,
          borderRadius: 16,
          overflow: 'hidden',
          border: `1px solid ${B.border}`,
        }}
      >
        {visible.map((r, i) => {
          const instName = r.installer_name ?? r.installer?.name ?? 'Former'
          const instColor = r.installer?.color ?? B.surface3
          return (
            <div
              key={r.id}
              style={{
                padding: '13px 16px',
                borderBottom: i < visible.length - 1 ? `1px solid ${B.border}` : 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: instColor,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: 9,
                      fontWeight: 800,
                      color: B.bg,
                    }}
                  >
                    {initials(instName)}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.panel_name}
                  </span>
                  <span style={{ fontSize: 11, color: B.textTer, flexShrink: 0 }}>{r.job_type}</span>
                  {r.is_color_change && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: CC,
                        background: CC + '22',
                        padding: '1px 6px',
                        borderRadius: 8,
                        flexShrink: 0,
                      }}
                    >
                      CC
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: B.textTer }}>
                  {r.project_name} · {fmtDate(r.start_ts)}
                  {r.start_ts && r.finish_ts ? ` · ${fmtClock(r.start_ts)} – ${fmtClock(r.finish_ts)}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: r.sqft ? B.yellow : B.red }}>
                  {r.sqft?.toFixed(1) ?? '--'}
                  <span style={{ fontSize: 11, fontWeight: 400, color: B.textTer }}> sqft</span>
                </div>
                <div style={{ fontSize: 11, color: B.textTer }}>{fmtTime(r.mins)}</div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => confirmDelete(r)}
                  style={{
                    background: 'none',
                    border: `1px solid ${B.border}`,
                    borderRadius: 8,
                    color: B.textTer,
                    fontSize: 12,
                    padding: '5px 8px',
                    flexShrink: 0,
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
        {!filtered.length && <div style={{ padding: 24, textAlign: 'center', color: B.textTer, fontSize: 13 }}>No logs yet.</div>}
      </div>

      {visible.length < filtered.length && (
        <button
          onClick={() => setPage(p => p + 1)}
          style={{
            width: '100%',
            marginTop: 10,
            background: B.surface,
            border: `1px solid ${B.border}`,
            borderRadius: 12,
            padding: 13,
            fontSize: 14,
            color: B.textSec,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Load more ({filtered.length - visible.length} remaining)
        </button>
      )}
    </div>
  )
}