import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Installer } from '../lib/types'

interface AuthCtx {
  session: Session | null
  installer: Installer | null
  isAdmin: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [installer, setInstaller] = useState<Installer | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchInstaller(userId: string) {
    const { data } = await supabase
      .from('installers')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .single()
    setInstaller(data as Installer | null)
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s) fetchInstaller(s.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) fetchInstaller(s.user.id)
      else { setInstaller(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setInstaller(null); setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session, installer, isAdmin: installer?.role === 'admin', loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
