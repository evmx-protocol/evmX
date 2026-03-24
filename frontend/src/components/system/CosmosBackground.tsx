import { useEffect, useRef } from 'react'
import cosmosImg from '@/assets/cosmos.png'

// Real nebula image background with multi-layer parallax animation + star/meteor canvas overlay
export function CosmosBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Star + meteor overlay canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const maybeCtx = canvas.getContext('2d')
    if (!maybeCtx) return
    const ctx = maybeCtx
    let animId = 0

    let w = window.innerWidth
    let h = window.innerHeight
    canvas.width = w
    canvas.height = h

    const onResize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w
      canvas.height = h
      genStars()
    }
    window.addEventListener('resize', onResize)

    // Stars
    interface Star { x: number; y: number; r: number; b: number; sp: number; ph: number; c: [number, number, number] }
    let stars: Star[] = []
    const SC: [number, number, number][] = [
      [255, 240, 255], [240, 210, 255], [255, 200, 240], [220, 190, 255],
      [200, 180, 255], [255, 255, 255], [255, 220, 250], [180, 160, 255],
    ]
    function genStars() {
      stars = []
      for (let i = 0; i < 200; i++) {
        const d = Math.random()
        stars.push({
          x: Math.random() * w, y: Math.random() * h,
          r: d < 0.6 ? 0.3 + Math.random() * 0.5 : 0.7 + Math.random() * 1.2,
          b: d < 0.6 ? 0.15 + Math.random() * 0.25 : 0.35 + Math.random() * 0.5,
          sp: 0.001 + Math.random() * 0.004,
          ph: Math.random() * Math.PI * 2,
          c: SC[Math.floor(Math.random() * SC.length)],
        })
      }
    }
    genStars()

    // Meteors
    interface Meteor { x: number; y: number; vx: number; vy: number; life: number; max: number; w: number; c: [number, number, number] }
    const meteors: Meteor[] = []
    let nextM = 1500

    let t0 = 0
    function frame(ts: number) {
      if (!t0) t0 = ts
      const t = ts - t0
      ctx.clearRect(0, 0, w, h)

      // Stars with twinkling
      for (const s of stars) {
        const tw = Math.sin(t * s.sp + s.ph) * 0.4 + 0.6
        const a = s.b * tw
        const [r, g, b] = s.c
        ctx.globalAlpha = a
        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
        // Glow
        if (s.r > 1.0) {
          ctx.globalAlpha = a * 0.08
          ctx.beginPath()
          ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1

      // Shooting stars
      if (t > nextM) {
        const angle = 0.2 + Math.random() * 0.6
        const speed = 4 + Math.random() * 5
        const mc: [number, number, number][] = [[255, 180, 240], [240, 150, 255], [255, 210, 230]]
        meteors.push({
          x: Math.random() * w * 1.2 - w * 0.1, y: -10,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 0, max: 45 + Math.random() * 50,
          w: 0.5 + Math.random() * 1.5,
          c: mc[Math.floor(Math.random() * mc.length)],
        })
        nextM = t + 2500 + Math.random() * 5000
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        m.x += m.vx; m.y += m.vy; m.life++
        if (m.life > m.max || m.y > h + 20) { meteors.splice(i, 1); continue }
        const prog = m.life / m.max
        const fade = prog < 0.1 ? prog / 0.1 : prog > 0.6 ? (1 - prog) / 0.4 : 1
        const spd = Math.sqrt(m.vx * m.vx + m.vy * m.vy)
        const tailLen = 35 + prog * 20
        const ex = m.x - (m.vx / spd) * tailLen
        const ey = m.y - (m.vy / spd) * tailLen
        const [mr, mg, mb] = m.c
        const grad = ctx.createLinearGradient(m.x, m.y, ex, ey)
        grad.addColorStop(0, `rgba(${mr},${mg},${mb},${(fade * 0.85).toFixed(2)})`)
        grad.addColorStop(0.4, `rgba(${mr},${mg},${mb},${(fade * 0.3).toFixed(2)})`)
        grad.addColorStop(1, `rgba(${mr},${mg},${mb},0)`)
        ctx.strokeStyle = grad
        ctx.lineWidth = m.w
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(m.x, m.y); ctx.lineTo(ex, ey)
        ctx.stroke()
        // Bright head
        ctx.globalAlpha = fade * 0.95
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(m.x, m.y, m.w + 0.8, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      animId = requestAnimationFrame(frame)
    }
    animId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <>
      {/* Layer 1: Main cosmos image — éles, sötétebb, lassú drift */}
      <div className="fixed inset-0 overflow-hidden" style={{ zIndex: -4 }}>
        <img
          src={cosmosImg}
          alt=""
          className="absolute pointer-events-none select-none"
          style={{
            top: '-8%',
            left: '-8%',
            width: '116%',
            height: '116%',
            objectFit: 'cover',
            objectPosition: 'center',
            opacity: 0.7,
            filter: 'saturate(1.4) contrast(1.2) brightness(0.55)',
            animation: 'cosmos-drift-1 50s ease-in-out infinite alternate',
            transformOrigin: '50% 50%',
          }}
        />
      </div>

      {/* Layer 2: Subtle edge vignette for readability */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: -3,
          background: 'radial-gradient(ellipse at 50% 40%, rgba(2,1,6,.05) 0%, rgba(2,1,6,.2) 45%, rgba(2,1,6,.55) 85%, rgba(2,1,6,.75) 100%)',
        }}
      />

      {/* Layer 4: Canvas stars + shooting stars */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: -1 }}
      />
    </>
  )
}
