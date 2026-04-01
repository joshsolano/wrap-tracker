import { useEffect, useRef, useState } from 'react'

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(
    navigator.onLine ? 'connected' : 'disconnected'
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleOnline() {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      setStatus('connected')
    }

    function handleOffline() {
      // Small grace period to avoid flicker from brief drops
      timerRef.current = setTimeout(() => {
        setStatus('disconnected')
        timerRef.current = null
      }, 4000)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return status
}
