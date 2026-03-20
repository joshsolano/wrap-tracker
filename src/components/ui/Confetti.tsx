import { useRef, useEffect } from 'react'
import { B } from '../../lib/utils'

export function FullConfetti() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    function resize() { c.width = window.innerWidth; c.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)
    const colors = [B.yellow, '#FF453A', '#30D158', '#0A84FF', '#BF5AF2', '#FF9F0A']
    const pieces = Array.from({ length: 160 }, () => ({
      x: Math.random() * c.width,
      y: Math.random() * c.height - c.height,
      r: Math.random() * 7 + 3,
      color: colors[Math.floor(Math.random() * 6)],
      vx: (Math.random() - 0.5) * 2,
      vy: Math.random() * 3 + 1,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 4,
    }))
    let anim: number
    function draw() {
      ctx.clearRect(0, 0, c.width, c.height)
      for (const p of pieces) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180)
        ctx.fillStyle = p.color; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.8); ctx.restore()
        p.x += p.vx; p.y += p.vy; p.rot += p.vr
        if (p.y > c.height) { p.y = -10; p.x = Math.random() * c.width }
      }
      anim = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(anim); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={ref} style={{ position:'fixed',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0 }} />
}

export function MiniConfetti() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    c.width = c.offsetWidth; c.height = c.offsetHeight
    const colors = [B.yellow, '#FF453A', '#30D158', '#0A84FF', '#BF5AF2']
    const pieces = Array.from({ length: 60 }, () => ({
      x: Math.random() * c.width,
      y: Math.random() * c.height - c.height,
      r: Math.random() * 5 + 2,
      color: colors[Math.floor(Math.random() * 5)],
      vx: (Math.random() - 0.5) * 1.2,
      vy: Math.random() * 1.5 + 0.6,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 2.5,
    }))
    let anim: number
    function draw() {
      ctx.clearRect(0, 0, c.width, c.height)
      for (const p of pieces) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180)
        ctx.fillStyle = p.color; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); ctx.restore()
        p.x += p.vx; p.y += p.vy; p.rot += p.vr
        if (p.y > c.height) { p.y = -10; p.x = Math.random() * c.width }
      }
      anim = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(anim)
  }, [])

  return <canvas ref={ref} style={{ position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none',borderRadius:16,zIndex:0 }} />
}
