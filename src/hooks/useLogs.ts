import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { enrichLog } from '../lib/utils'
import type { Log } from '../lib/types'

export function useLogs() {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Full fetch — only used on mount and reconnect
  const fetch = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('logs')
      .select('*, installer:installers(id,name,color,birthday,role,active,created_at,user_id)')
      .order('start_ts', { ascending: false })
      .limit(3000)
    if (err) { setError(err.message); return }
    setLogs((data ?? []).map(r => enrichLog(r as Record<string, unknown>)))
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch()

    channelRef.current = supabase
      .channel('logs_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'logs' },
        async (payload) => {
          // Fetch the single new row with installer join
          const { data } = await supabase
            .from('logs')
            .select('*, installer:installers(id,name,color,birthday,role,active,created_at,user_id)')
            .eq('id', payload.new.id)
            .single()
          if (data) {
            const enriched = enrichLog(data as Record<string, unknown>)
            setLogs(prev => {
              if (prev.find(l => l.id === enriched.id)) return prev
              // Insert in correct chronological position (newest first)
              const insertIdx = prev.findIndex(l => new Date(l.start_ts).getTime() < new Date(enriched.start_ts).getTime())
              if (insertIdx === -1) return [...prev, enriched]
              const next = [...prev]
              next.splice(insertIdx, 0, enriched)
              return next
            })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'logs' },
        (payload) => {
          setLogs(prev => prev.filter(l => l.id !== payload.old.id))
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          setTimeout(fetch, 2000)
        }
      })

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [fetch])

  async function deleteLog(id: string): Promise<{ error: string | null }> {
    // Optimistic remove
    setLogs(prev => prev.filter(l => l.id !== id))
    const { error: err } = await supabase.from('logs').delete().eq('id', id)
    if (err) {
      // Await the refetch so UI is correct before returning
      await fetch()
      return { error: err.message }
    }
    return { error: null }
  }

  async function insertManualLog(params: {
    installerId: string
    projectId: string
    panelId: string
    jobType: string
    isColorChange: boolean
    startTs: Date
    finishTs: Date
  }): Promise<{ error: string | null }> {
    const { error: err } = await supabase.rpc('insert_manual_log', {
      p_installer_id:    params.installerId,
      p_project_id:      params.projectId,
      p_panel_id:        params.panelId,
      p_job_type:        params.jobType,
      p_is_color_change: params.isColorChange,
      p_start_ts:        params.startTs.toISOString(),
      p_finish_ts:       params.finishTs.toISOString(),
    })
    if (err) return { error: err.message }
    // Realtime INSERT event will add the row incrementally — no manual fetch needed
    return { error: null }
  }

  return { logs, loading, error, fetch, deleteLog, insertManualLog }
}
