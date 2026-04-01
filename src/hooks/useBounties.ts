import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Bounty, RewardProduct } from '../lib/types'

export function useBounties() {
  const [bounties, setBounties] = useState<Bounty[]>([])
  const [products, setProducts] = useState<RewardProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetch = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('bounties')
      .select('*, conditions:bounty_conditions(*), product:reward_products(*)')
      .order('created_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setBounties((data ?? []) as Bounty[])
    setLoading(false)
  }, [])

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase.from('reward_products').select('*').order('created_at')
    if (data) setProducts(data as RewardProduct[])
  }, [])

  useEffect(() => {
    fetch()
    fetchProducts()
    channelRef.current = supabase
      .channel('bounties_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bounties' }, () => fetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bounty_conditions' }, () => fetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reward_products' }, () => { fetchProducts(); fetch() })
      .subscribe()
    return () => { channelRef.current?.unsubscribe() }
  }, [fetch, fetchProducts])

  async function createBounty(params: {
    title: string
    reward: string
    startDate: string
    endDate: string | null
    productId?: string | null
    conditions: { conditionType: string; operator: string; value: number; socialActionType?: string }[]
  }) {
    const { data, error: err } = await supabase
      .from('bounties')
      .insert({
        title: params.title,
        reward: params.reward,
        start_date: params.startDate,
        end_date: params.endDate,
        product_id: params.productId ?? null,
      })
      .select()
      .single()
    if (err) return { error: err.message }
    if (params.conditions.length > 0) {
      const { error: cErr } = await supabase.from('bounty_conditions').insert(
        params.conditions.map(c => ({
          bounty_id: data.id,
          condition_type: c.conditionType,
          operator: c.operator,
          value: c.value,
          ...(c.socialActionType ? { social_action_type: c.socialActionType } : {}),
        }))
      )
      if (cErr) return { error: cErr.message }
    }
    await fetch()
    return { error: null }
  }

  async function deleteBounty(id: string) {
    const { error: err } = await supabase.from('bounties').delete().eq('id', id)
    if (err) return { error: err.message }
    setBounties(prev => prev.filter(b => b.id !== id))
    return { error: null }
  }

  async function toggleActive(id: string, active: boolean) {
    const { error: err } = await supabase.from('bounties').update({ active }).eq('id', id)
    if (err) return { error: err.message }
    setBounties(prev => prev.map(b => b.id === id ? { ...b, active } : b))
    return { error: null }
  }

  async function awardWin(bountyId: string, installerId: string) {
    const { error: err } = await supabase
      .from('bounties')
      .update({ winner_installer_id: installerId, active: false })
      .eq('id', bountyId)
    if (err) return { error: err.message }
    await fetch()
    return { error: null }
  }

  async function markPaid(id: string) {
    const now = new Date().toISOString()
    const { error: err } = await supabase
      .from('bounties')
      .update({ paid: true, paid_at: now })
      .eq('id', id)
    if (err) return { error: err.message }
    setBounties(prev => prev.map(b => b.id === id ? { ...b, paid: true, paid_at: now } : b))
    return { error: null }
  }

  async function markUnpaid(id: string) {
    const { error: err } = await supabase
      .from('bounties')
      .update({ paid: false, paid_at: null })
      .eq('id', id)
    if (err) return { error: err.message }
    setBounties(prev => prev.map(b => b.id === id ? { ...b, paid: false, paid_at: null } : b))
    return { error: null }
  }

  async function confirmSocialAction(conditionId: string, installerId: string) {
    const now = new Date().toISOString()
    const { error: err } = await supabase
      .from('bounty_conditions')
      .update({ confirmed_by_installer_id: installerId, confirmed_at: now })
      .eq('id', conditionId)
      .is('confirmed_by_installer_id', null)
    if (err) return { error: err.message }
    setBounties(prev => prev.map(b => ({
      ...b,
      conditions: b.conditions?.map(c =>
        c.id === conditionId
          ? { ...c, confirmed_by_installer_id: installerId, confirmed_at: now }
          : c
      ),
    })))
    return { error: null }
  }

  async function createProduct(name: string, imageUrl: string | null, buyUrl: string | null) {
    const { error: err } = await supabase.from('reward_products').insert({ name, image_url: imageUrl || null, buy_url: buyUrl || null })
    if (err) return { error: err.message }
    await fetchProducts()
    return { error: null }
  }

  async function deleteProduct(id: string) {
    const { error: err } = await supabase.from('reward_products').delete().eq('id', id)
    if (err) return { error: err.message }
    setProducts(prev => prev.filter(p => p.id !== id))
    return { error: null }
  }

  return { bounties, products, loading, error, createBounty, deleteBounty, toggleActive, awardWin, markPaid, markUnpaid, confirmSocialAction, createProduct, deleteProduct }
}
