import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')

  useEffect(() => {
    const channel = supabase.channel('connection_probe')
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('connected')
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('disconnected')
        else setStatus('connecting')
      })

    return () => { supabase.removeChannel(channel) }
  }, [])

  return status
}
