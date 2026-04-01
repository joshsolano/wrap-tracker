import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { enrichLog } from '../lib/utils'
import type { Log } from '../lib/types'

export function useLogs() {
  const [allLogs, setAllLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Non-voided logs — used everywhere except the Log tab itself
  const logs = allLogs.filter(l => !l.voided)
  const fetch = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('logs')
      .select('*, installer:installers(id,name,color,birthday,role,active,created_at,user_id)')
      .order('start_ts', { ascending: false })
      .limit(3000)
    if (err) { setError(err.message); return }
    setAllLogs((data ?? []).map(r => enrichLog(r as Record<string, unknown>)))
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function voidLog(id: string, voided: boolean): Promise<{ error: string | null }> {
    setAllLogs(prev => prev.map(l => l.id === id ? { ...l, voided } : l))
    const { error: err } = await supabase.from('logs').update({ voided }).eq('id', id)
    if (err) { await fetch(); return { error: err.message } }
    return { error: null }
  }

  async function deleteLog(id: string): Promise<{ error: string | null }> {
    // Optimistic remove
    setAllLogs(prev => prev.filter(l => l.id !== id))
    const { error: err } = await supabase.from('logs').delete().eq('id', id)
    if (err) {
      // Await the refetch so UI is correct before returning
      await fetch()
      return { error: err.message }
    }
    return { error: null }
  }

  async function updateLogTimes(id: string, startTs: Date, finishTs: Date): Promise<{ error: string | null }> {
    const { error: err } = await supabase
      .from('logs')
      .update({ start_ts: startTs.toISOString(), finish_ts: finishTs.toISOString() })
      .eq('id', id)
    if (err) return { error: err.message }
    // Refetch so enriched sqft/mins recompute
    await fetch()
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

  return { logs, allLogs, loading, error, fetch, deleteLog, voidLog, insertManualLog, updateLogTimes }
}
