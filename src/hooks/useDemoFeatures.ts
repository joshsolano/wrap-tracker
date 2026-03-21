import { useState, useEffect } from 'react'

const KEY = 'wrapgfx_demo'
const EVT = 'wrapgfx:demo'

export function useDemoFeatures() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(KEY) !== 'false')

  useEffect(() => {
    const handler = () => setEnabled(localStorage.getItem(KEY) !== 'false')
    window.addEventListener(EVT, handler)
    return () => window.removeEventListener(EVT, handler)
  }, [])

  function toggle() {
    const next = !enabled
    localStorage.setItem(KEY, String(next))
    setEnabled(next)
    window.dispatchEvent(new CustomEvent(EVT))
  }

  return { demoEnabled: enabled, toggleDemo: toggle }
}
