import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Installer } from '../lib/types'

export function useInstallers() {
  const [installers, setInstallers] = useState<Installer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchInstallers = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('installers')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true })

    if (err) {
      setError(err.message)
      return
    }

    setInstallers((data ?? []) as Installer[])
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchInstallers()

    channelRef.current = supabase
      .channel('installers_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'installers' }, fetchInstallers)
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          setTimeout(fetchInstallers, 2000)
        }
      })

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [fetchInstallers])

  async function updateInstaller(
    id: string,
    updates: Partial<Pick<Installer, 'name' | 'color' | 'birthday'>>
  ): Promise<{ error: string | null }> {
    setInstallers(prev => prev.map(i => (i.id === id ? { ...i, ...updates } : i)))
    const { error: err } = await supabase.from('installers').update(updates).eq('id', id)
    if (err) {
      await fetchInstallers()
      return { error: err.message }
    }
    return { error: null }
  }

  async function deactivateInstaller(id: string): Promise<{ error: string | null }> {
    const { error: err } = await supabase.from('installers').update({ active: false }).eq('id', id)
    if (err) return { error: err.message }

    const { error: activeJobErr } = await supabase.from('active_jobs').delete().eq('installer_id', id)
    if (activeJobErr) {
      await fetchInstallers()
      return { error: activeJobErr.message }
    }

    return { error: null }
  }

  async function addInstallerViaEdge(params: {
    email: string
    password: string
    name: string
    color: string
    birthday: string
    role: string
  }): Promise<{ installer: Installer | null; error: string | null }> {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) return { installer: null, error: 'Not authenticated' }

    const res = await window.fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-installer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(params),
    })

    const json = await res.json()

    if (!res.ok) {
      return { installer: null, error: json.error ?? 'Unknown error' }
    }

    return { installer: (json.installer as Installer) ?? null, error: null }
  }

  return {
    installers,
    loading,
    error,
    fetch: fetchInstallers,
    updateInstaller,
    deactivateInstaller,
    addInstallerViaEdge,
  }
}