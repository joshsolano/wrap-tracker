import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { ActiveJob } from '../lib/types'

const ACTIVE_JOBS_SELECT = '*, installer:installers(*), project:projects(*), panel:panels(*)'

export function useActiveJobs() {
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('active_jobs')
      .select(ACTIVE_JOBS_SELECT)
    if (err) { setError(err.message); return }
    setActiveJobs((data ?? []) as ActiveJob[])
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

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
      // Refetch so UI reflects true DB state
      await fetch()

      if (err.code === '23505') {
        const { data: panelJob } = await supabase
          .from('active_jobs')
          .select('installer_id')
          .eq('panel_id', params.panelId)
          .maybeSingle()

        if (panelJob) return { error: 'panel_taken' }
        return { error: 'already_active' }
      }
      return { error: err.message }
    }

    // Immediately load the new row with joins so the UI transitions
    // right away without waiting for the Realtime event (which can lag
    // 1-3s on mobile and causes the double-tap problem).
    const { data: newJob } = await supabase
      .from('active_jobs')
      .select(ACTIVE_JOBS_SELECT)
      .eq('installer_id', params.installerId)
      .maybeSingle()

    if (newJob) {
      setActiveJobs(prev => {
        if (prev.find(j => j.id === (newJob as ActiveJob).id)) return prev
        return [...prev, newJob as ActiveJob]
      })
    }

    return { error: null }
  }

  async function clockOut(installerId: string): Promise<{ celebrated: boolean; error: string | null }> {
    const job = activeJobs.find(j => j.installer_id === installerId)

    if (!job) {
      const { error: err } = await supabase.rpc('clock_out', {
        p_installer_id: installerId,
        p_finish_ts:    new Date().toISOString(),
      })
      if (err) return { celebrated: false, error: err.message }
      return { celebrated: false, error: null }
    }

    // If paused, finish at the pause time so pause duration isn't counted
    const finishTs = job.paused_at ?? new Date().toISOString()
    const { error: err } = await supabase.rpc('clock_out', {
      p_installer_id: installerId,
      p_finish_ts:    finishTs,
    })
    if (err) return { celebrated: false, error: err.message }

    // Immediately remove from local state so the UI transitions without
    // waiting for the Realtime DELETE event.
    setActiveJobs(prev => prev.filter(j => j.installer_id !== installerId))

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

    // Immediately remove from local state — don't wait for Realtime DELETE.
    setActiveJobs(prev => prev.filter(j => j.installer_id !== installerId))

    return { error: null }
  }

  async function pauseJob(installerId: string): Promise<{ error: string | null }> {
    const now = new Date().toISOString()
    const { error: err } = await supabase
      .from('active_jobs')
      .update({ paused_at: now })
      .eq('installer_id', installerId)
    if (err) return { error: err.message }
    setActiveJobs(prev => prev.map(j => j.installer_id === installerId ? { ...j, paused_at: now } : j))
    return { error: null }
  }

  async function resumeJob(installerId: string): Promise<{ error: string | null }> {
    const job = activeJobs.find(j => j.installer_id === installerId)
    if (!job?.paused_at) return { error: 'Not paused' }

    // Block resume if paused before today's midnight (overnight)
    const pausedAt = new Date(job.paused_at)
    const now = new Date()
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (pausedAt < todayMidnight) return { error: 'overnight' }

    // Shift start_ts forward by pause duration so elapsed stays correct
    const pausedMs = now.getTime() - pausedAt.getTime()
    const newStart = new Date(new Date(job.start_ts).getTime() + pausedMs).toISOString()

    const { error: err } = await supabase
      .from('active_jobs')
      .update({ paused_at: null, start_ts: newStart })
      .eq('installer_id', installerId)
    if (err) return { error: err.message }

    setActiveJobs(prev => prev.map(j =>
      j.installer_id === installerId ? { ...j, paused_at: null, start_ts: newStart } : j
    ))
    return { error: null }
  }

  return { activeJobs, loading, error, fetch, clockIn, clockOut, discardSession, pauseJob, resumeJob }
}
