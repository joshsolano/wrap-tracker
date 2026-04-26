import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { FleetUser } from '../lib/fleetTypes'

interface FleetAuthCtx {
  session: Session | null
  fleetUser: FleetUser | null
  loading: boolean
  noAccess: boolean
  canRemove: boolean
  canInstall: boolean
  canQC: boolean
  isFleetAdmin: boolean
  isFleetManager: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const FleetAuthContext = createContext<FleetAuthCtx | null>(null)

export function FleetAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [fleetUser, setFleetUser] = useState<FleetUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [noAccess, setNoAccess] = useState(false)

  async function fetchFleetUser(sess: Session) {
    const userId = sess.user.id
    const email = sess.user.email

    const { data: byId } = await supabase
      .from('fleet_users')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .single()
    if (byId) {
      setFleetUser(byId as FleetUser)
      setNoAccess(false)
      setLoading(false)
      return
    }

    if (email) {
      const { data: byEmail } = await supabase
        .from('fleet_users')
        .select('*')
        .eq('email', email)
        .is('user_id', null)
        .eq('active', true)
        .single()
      if (byEmail) {
        await supabase.from('fleet_users').update({ user_id: userId }).eq('id', byEmail.id)
        setFleetUser({ ...(byEmail as FleetUser), user_id: userId })
        setNoAccess(false)
        setLoading(false)
        return
      }
    }

    setFleetUser(null)
    setNoAccess(true)
    setLoading(false)
  }

  async function refreshUser() {
    if (session) await fetchFleetUser(session)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s && !s.user.is_anonymous) {
        fetchFleetUser(s)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s && !s.user.is_anonymous) {
        setLoading(true)
        fetchFleetUser(s)
      } else {
        setFleetUser(null)
        setNoAccess(false)
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
    await supabase.auth.signOut()
    setFleetUser(null)
    setNoAccess(false)
    setSession(null)
  }

  const role = fleetUser?.role
  return (
    <FleetAuthContext.Provider value={{
      session, fleetUser, loading, noAccess,
      canRemove: role === 'remover' || role === 'admin' || role === 'manager',
      canInstall: role === 'installer' || role === 'admin' || role === 'manager',
      canQC: role === 'qc' || role === 'admin' || role === 'manager',
      isFleetAdmin: role === 'admin',
      isFleetManager: role === 'admin' || role === 'manager',
      signIn, signOut, refreshUser,
    }}>
      {children}
    </FleetAuthContext.Provider>
  )
}

export function useFleetAuth() {
  const ctx = useContext(FleetAuthContext)
  if (!ctx) throw new Error('useFleetAuth must be inside FleetAuthProvider')
  return ctx
}
