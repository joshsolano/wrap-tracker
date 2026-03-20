import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Project, Panel, ProjectType } from '../lib/types'

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Full fetch — only used on mount and reconnect
  const fetch = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('projects')
      .select('*, panels(*)')
      .eq('archived', false)
      .order('updated_at', { ascending: false })
    if (err) { setError(err.message); return }
    const sorted = (data ?? []).map(p => ({
      ...p,
      panels: ((p.panels ?? []) as Panel[]).sort((a, b) => a.sort_order - b.sort_order),
    }))
    setProjects(sorted as Project[])
    setError(null)
    setLoading(false)
  }, [])

  // Fetch a single project with its panels — used for incremental updates
  const fetchOne = useCallback(async (projectId: string): Promise<Project | null> => {
    const { data } = await supabase
      .from('projects')
      .select('*, panels(*)')
      .eq('id', projectId)
      .eq('archived', false)
      .single()
    if (!data) return null
    return {
      ...data,
      panels: ((data.panels ?? []) as Panel[]).sort((a, b) => a.sort_order - b.sort_order),
    } as Project
  }, [])

  useEffect(() => {
    fetch()

    channelRef.current = supabase
      .channel('projects_panels_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'projects' },
        async (payload) => {
          const proj = await fetchOne(payload.new.id)
          if (!proj) return
          setProjects(prev => {
            if (prev.find(p => p.id === proj.id)) return prev
            return [proj, ...prev]
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'projects' },
        async (payload) => {
          // If archived, remove from list
          if (payload.new.archived) {
            setProjects(prev => prev.filter(p => p.id !== payload.new.id))
            return
          }
          const proj = await fetchOne(payload.new.id)
          if (!proj) return
          setProjects(prev => prev.map(p => p.id === proj.id ? proj : p))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'projects' },
        (payload) => {
          setProjects(prev => prev.filter(p => p.id !== payload.old.id))
        }
      )
      // Panels: re-fetch the parent project so panel list stays consistent
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'panels' },
        async (payload) => {
          const proj = await fetchOne(payload.new.project_id)
          if (!proj) return
          setProjects(prev => prev.map(p => p.id === proj.id ? proj : p))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'panels' },
        async (payload) => {
          const proj = await fetchOne(payload.new.project_id)
          if (!proj) return
          setProjects(prev => prev.map(p => p.id === proj.id ? proj : p))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'panels' },
        async (payload) => {
          // payload.old only has the id and project_id if replica identity is set;
          // fall back to patching state directly if project_id is available
          if (payload.old.project_id) {
            const proj = await fetchOne(payload.old.project_id)
            if (proj) { setProjects(prev => prev.map(p => p.id === proj.id ? proj : p)); return }
          }
          // Fallback: remove the panel from whichever project holds it
          setProjects(prev => prev.map(p => ({
            ...p,
            panels: (p.panels ?? []).filter(pnl => pnl.id !== payload.old.id),
          })))
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
  }, [fetch, fetchOne])

  async function createProject(params: { name: string; projectType: ProjectType; dueDate?: string }): Promise<{ error: string | null }> {
    const { error: err } = await supabase.from('projects').insert({
      name: params.name, project_type: params.projectType, due_date: params.dueDate ?? null,
    })
    if (err) return { error: err.message }
    return { error: null }
  }

  async function updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'project_type' | 'due_date'>>): Promise<{ error: string | null }> {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
    const { error: err } = await supabase.from('projects').update(updates).eq('id', id)
    if (err) { await fetch(); return { error: err.message } }
    return { error: null }
  }

  async function updateProjectType(id: string, projectType: ProjectType): Promise<{ error: string | null }> {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, project_type: projectType } : p))
    const { error: err } = await supabase.from('projects').update({ project_type: projectType }).eq('id', id)
    if (err) { await fetch(); return { error: err.message } }
    return { error: null }
  }

  async function updateDueDate(id: string, dueDate: string | null): Promise<{ error: string | null }> {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, due_date: dueDate } : p))
    const { error: err } = await supabase.from('projects').update({ due_date: dueDate }).eq('id', id)
    if (err) { await fetch(); return { error: err.message } }
    return { error: null }
  }

  async function archiveProject(id: string): Promise<{ error: string | null }> {
    const { error: err } = await supabase.from('projects').update({ archived: true }).eq('id', id)
    if (err) return { error: err.message }
    // Realtime UPDATE event handles removal from list
    return { error: null }
  }

  async function addPanel(params: { projectId: string; name: string; heightIn?: number | null; widthIn?: number | null; sortOrder?: number }): Promise<{ error: string | null }> {
    const { error: err } = await supabase.from('panels').insert({
      project_id: params.projectId, name: params.name.trim(),
      height_in: params.heightIn ?? null, width_in: params.widthIn ?? null,
      sort_order: params.sortOrder ?? 0,
    })
    if (err) {
      if (err.code === '23505') return { error: `Panel "${params.name}" already exists.` }
      return { error: err.message }
    }
    await supabase.rpc('reset_celebration_if_incomplete', { p_project_id: params.projectId })
    return { error: null }
  }

  async function addPanelsBulk(params: { projectId: string; panels: Array<{ name: string; heightIn?: number | null; widthIn?: number | null }> }): Promise<{ inserted: number; skipped: number; error: string | null }> {
    const rows = params.panels.map((p, i) => ({
      project_id: params.projectId, name: p.name.trim(),
      height_in: p.heightIn ?? null, width_in: p.widthIn ?? null, sort_order: i,
    }))
    const { data, error: err } = await supabase
      .from('panels')
      .upsert(rows, { onConflict: 'project_id,name', ignoreDuplicates: true })
      .select()
    if (err) return { inserted: 0, skipped: 0, error: err.message }
    const inserted = data?.length ?? 0
    if (inserted > 0) {
      await supabase.rpc('reset_celebration_if_incomplete', { p_project_id: params.projectId })
    }
    return { inserted, skipped: rows.length - inserted, error: null }
  }

  async function removePanel(panelId: string, projectId: string): Promise<{ error: string | null }> {
    const { error: err } = await supabase.from('panels').delete().eq('id', panelId)
    if (err) return { error: err.message }
    await supabase.rpc('reset_celebration_if_incomplete', { p_project_id: projectId })
    return { error: null }
  }

  return {
    projects, loading, error, fetch,
    createProject, updateProject, updateProjectType, updateDueDate, archiveProject,
    addPanel, addPanelsBulk, removePanel,
  }
}
