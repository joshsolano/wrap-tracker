import { useRef, useEffect } from 'react'
import { B } from '../../lib/utils'

export function FullConfetti() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvasEl = ref.current
    if (!canvasEl) return

    const ctx2d = canvasEl.getContext('2d')
    if (!ctx2d) return

    const canvas: HTMLCanvasElement = canvasEl
    const context: CanvasRenderingContext2D = ctx2d

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    resize()
    window.addEventListener('resize', resize)

    const colors = [B.yellow, '#FF453A', '#30D158', '#0A84FF', '#BF5AF2', '#FF9F0A']
    const pieces = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 7 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 2,
      vy: Math.random() * 3 + 1,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 4,
    }))

    let anim = 0

    function draw() {
      context.clearRect(0, 0, canvas.width, canvas.height)

      for (const p of pieces) {
        context.save()
        context.translate(p.x, p.y)
        context.rotate((p.rot * Math.PI) / 180)
        context.fillStyle = p.color
        context.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.8)
        context.restore()

        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr

        if (p.y > canvas.height) {
          p.y = -10
          p.x = Math.random() * canvas.width
        }
      }

      anim = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(anim)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}

export function MiniConfetti() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvasEl = ref.current
    if (!canvasEl) return

    const ctx2d = canvasEl.getContext('2d')
    if (!ctx2d) return

    const canvas: HTMLCanvasElement = canvasEl
    const context: CanvasRenderingContext2D = ctx2d

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    const colors = [B.yellow, '#FF453A', '#30D158', '#0A84FF', '#BF5AF2']
    const pieces = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 5 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 1.2,
      vy: Math.random() * 1.5 + 0.6,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 2.5,
    }))

    let anim = 0

    function draw() {
      context.clearRect(0, 0, canvas.width, canvas.height)

      for (const p of pieces) {
        context.save()
        context.translate(p.x, p.y)
        context.rotate((p.rot * Math.PI) / 180)
        context.fillStyle = p.color
        context.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6)
        context.restore()

        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr

        if (p.y > canvas.height) {
          p.y = -10
          p.x = Math.random() * canvas.width
        }
      }

      anim = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(anim)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        borderRadius: 16,
        zIndex: 0,
      }}
    />
  )
}