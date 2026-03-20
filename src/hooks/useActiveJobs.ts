import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { ActiveJob } from '../lib/types'

export function useActiveJobs() {
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Full fetch — only used on mount and reconnect
  const fetch = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('active_jobs')
      .select('*, installer:installers(*), project:projects(*), panel:panels(*)')
    if (err) { setError(err.message); return }
    setActiveJobs((data ?? []) as ActiveJob[])
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch()

    channelRef.current = supabase
      .channel('active_jobs_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'active_jobs' },
        async (payload) => {
          // Fetch the single new row with joins — cheaper than full table fetch
          const { data } = await supabase
            .from('active_jobs')
            .select('*, installer:installers(*), project:projects(*), panel:panels(*)')
            .eq('id', payload.new.id)
            .single()
          if (data) {
            setActiveJobs(prev => {
              // Guard against duplicate if already present
              if (prev.find(j => j.id === data.id)) return prev
              return [...prev, data as ActiveJob]
            })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'active_jobs' },
        async (payload) => {
          const { data } = await supabase
            .from('active_jobs')
            .select('*, installer:installers(*), project:projects(*), panel:panels(*)')
            .eq('id', payload.new.id)
            .single()
          if (data) {
            setActiveJobs(prev => prev.map(j => j.id === data.id ? data as ActiveJob : j))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'active_jobs' },
        (payload) => {
          setActiveJobs(prev => prev.filter(j => j.id !== payload.old.id))
        }
      )
      .subscribe((status) => {
        // Only full-refetch on reconnect to recover from potential desync
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          setTimeout(fetch, 2000)
        }
      })

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [fetch])

  async function clockIn(params: {
    installerId: string
    projectId: string
    panelId: string
    jobType: string
    isColorChange: boolean
  }): Promise<{ error: string | null }> {
    const { error: err } = await supabase.from('active_jobs').insert({
      installer_id:    params.installerId,
      project_id:      params.projectId,
      panel_id:        params.panelId,
      job_type:        params.jobType,
      is_color_change: params.isColorChange,
      start_ts:        new Date().toISOString(),
    })

    if (err) {
      // Immediately refetch so UI reflects true DB state before returning error
      await fetch()

      if (err.code === '23505') {
        // Determine which constraint fired by checking current DB state
        const { data: panelJob } = await supabase
          .from('active_jobs')
          .select('installer_id')
          .eq('panel_id', params.panelId)
          .maybeSingle()

        if (panelJob) {
          return { error: 'panel_taken' }
        }
        return { error: 'already_active' }
      }
      return { error: err.message }
    }

    return { error: null }
  }

  async function clockOut(installerId: string): Promise<{ celebrated: boolean; error: string | null }> {
    const job = activeJobs.find(j => j.installer_id === installerId)
    if (!job) {
      // DB may still have the row even if local state lost it — try anyway
      const { error: err } = await supabase.rpc('clock_out', {
        p_installer_id: installerId,
        p_finish_ts:    new Date().toISOString(),
      })
      if (err) return { celebrated: false, error: err.message }
      return { celebrated: false, error: null }
    }

    const { error: err } = await supabase.rpc('clock_out', {
      p_installer_id: installerId,
      p_finish_ts:    new Date().toISOString(),
    })
    if (err) return { celebrated: false, error: err.message }

    const { data: didCelebrate } = await supabase.rpc('check_and_celebrate', {
      p_project_id: job.project_id,
    })
    return { celebrated: !!didCelebrate, error: null }
  }

  async function discardSession(installerId: string): Promise<{ error: string | null }> {
    const { error: err } = await supabase
      .from('active_jobs')
      .delete()
      .eq('installer_id', installerId)
    if (err) return { error: err.message }
    return { error: null }
  }

  return { activeJobs, loading, error, fetch, clockIn, clockOut, discardSession }
}
