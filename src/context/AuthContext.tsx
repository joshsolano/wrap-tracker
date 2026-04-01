import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Installer, Manager, ContentUser } from '../lib/types'

interface AuthCtx {
  session: Session | null
  installer: Installer | null
  manager: Manager | null
  contentUser: ContentUser | null
  isAdmin: boolean
  isGuest: boolean
  isContent: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  enterGuestMode: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [installer, setInstaller] = useState<Installer | null>(null)
  const [manager, setManager] = useState<Manager | null>(null)
  const [contentUser, setContentUser] = useState<ContentUser | null>(null)
  const [isGuest, setIsGuest] = useState(false)
  const [loading, setLoading] = useState(true)

  async function fetchUser(userId: string) {
    // 1. Check installers
    const { data: instData } = await supabase
      .from('installers')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .single()
    if (instData) {
      setInstaller(instData as Installer)
      setManager(null)
      setContentUser(null)
      setLoading(false)
      return
    }
    // 2. Check managers
    const { data: mgrData } = await supabase
      .from('managers')
      .select('*')
      .eq('user_id', userId)
      .single()
    if (mgrData) {
      setInstaller(null)
      setManager(mgrData as Manager)
      setContentUser(null)
      setLoading(false)
      return
    }
    // 3. Check content users
    const { data: ctData } = await supabase
      .from('content_users')
      .select('*')
      .eq('user_id', userId)
      .single()
    setInstaller(null)
    setManager(null)
    setContentUser(ctData as ContentUser | null)
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s) {
        if (s.user.is_anonymous) {
          setIsGuest(true)
          setInstaller(null)
          setLoading(false)
        } else {
          fetchUser(s.user.id)
        }
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) {
        if (s.user.is_anonymous) {
          setIsGuest(true)
          setInstaller(null)
          setLoading(false)
        } else {
          setIsGuest(false)
          fetchUser(s.user.id)
        }
      } else {
        setInstaller(null)
        setManager(null)
        setContentUser(null)
        setIsGuest(false)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    setIsGuest(false)
    await supabase.auth.signOut()
    setInstaller(null); setManager(null); setContentUser(null); setSession(null)
  }

  async function enterGuestMode() {
    setLoading(true)
    setIsGuest(true)
    await supabase.auth.signInAnonymously()
  }

  return (
    <AuthContext.Provider value={{
      session, installer, manager, contentUser,
      isAdmin: installer?.role === 'admin' || !!manager,
      isGuest,
      isContent: !!contentUser,
      loading, signIn, signOut, enterGuestMode,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
