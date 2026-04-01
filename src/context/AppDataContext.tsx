import React, { createContext, useContext, useEffect, useRef, useMemo } from 'react'
import { useLogs }             from '../hooks/useLogs'
import { useActiveJobs }       from '../hooks/useActiveJobs'
import { useProjects }         from '../hooks/useProjects'
import { useInstallers }       from '../hooks/useInstallers'
import { supabase }            from '../lib/supabase'
import { notifyContent }       from '../lib/notifyContent'
import type { Log, ActiveJob, Project, Panel, Installer } from '../lib/types'

type AppData = {
  logs: Log[]; allLogs: Log[]; activeJobs: ActiveJob[]; projects: Project[]; installers: Installer[]
  loading: boolean; anyError: string | null
  getProject: (id: string) => Project | undefined
  getPanel: (id: string) => Panel | undefined
  getInstaller: (id: string) => Installer | undefined
  refetchAll: () => void
} & ReturnType<typeof useLogs>
  & ReturnType<typeof useActiveJobs>
  & ReturnType<typeof useProjects>
  & ReturnType<typeof useInstallers>

const Ctx = createContext<AppData | null>(null)

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const logsH    = useLogs()
  const jobsH    = useActiveJobs()
  const projsH   = useProjects()
  const instsH   = useInstallers()

  const loading  = logsH.loading || jobsH.loading || projsH.loading || instsH.loading

  // Auto-notify content team when a project newly becomes complete
  const prevCompletedRef = useRef<Set<string>>(new Set())
  const initialLoadDoneRef = useRef(false)

  useEffect(() => {
    if (loading) return
    const newCompleted = new Set<string>()
    for (const p of projsH.projects) {
      const panels = p.panels ?? []
      if (panels.length === 0) continue
      const donePanelIds = new Set(
        logsH.allLogs
          .filter(r => r.project_id === p.id && r.status === 'Complete' && r.panel_id)
          .map(r => r.panel_id!)
      )
      if (panels.every(pnl => donePanelIds.has(pnl.id))) newCompleted.add(p.id)
    }
    if (initialLoadDoneRef.current) {
      for (const id of newCompleted) {
        if (!prevCompletedRef.current.has(id)) {
          const project = projsH.projects.find(p => p.id === id)
          if (project) notifyContent({ projectName: project.name, type: 'after' })
        }
      }
    }
    prevCompletedRef.current = newCompleted
    initialLoadDoneRef.current = true
  }, [projsH.projects, logsH.allLogs, loading])
  const anyError = logsH.error || jobsH.error || projsH.error || instsH.error || null

  const projectMap  = useMemo(() => new Map(projsH.projects.map(p => [p.id, p])), [projsH.projects])
  const panelMap    = useMemo(() => new Map(projsH.projects.flatMap(p => p.panels ?? []).map(pnl => [pnl.id, pnl])), [projsH.projects])
  const installerMap = useMemo(() => new Map(instsH.installers.map(i => [i.id, i])), [instsH.installers])

  function refetchAll() {
    logsH.fetch(); jobsH.fetch(); projsH.fetch(); instsH.fetch()
  }

  // Single consolidated Realtime channel for all tables
  useEffect(() => {
    const channel = supabase
      .channel('app_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' },        () => logsH.fetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_jobs' }, () => jobsH.fetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' },    () => projsH.fetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'panels' },      () => projsH.fetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'installers' },  () => instsH.fetch())
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          setTimeout(refetchAll, 3000)
        }
      })
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Ctx.Provider value={{
      ...logsH, ...jobsH, ...projsH, ...instsH,
      loading, anyError, refetchAll,
      getProject:   (id) => projectMap.get(id),
      getPanel:     (id) => panelMap.get(id),
      getInstaller: (id) => installerMap.get(id),
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAppData() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppData must be inside AppDataProvider')
  return ctx
}
