import { useEffect, useRef, memo } from 'react'

/**
 * Stage 2: Rich transparent motion overlay — 3 star layers + rare peripheral events.
 * Far (4500) + Near (420) + Extra-near (70) + rare edge transits
 */

function makeSpriteCanvas(): HTMLCanvasElement {
  const size = 32
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.12, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.25)')
  g.addColorStop(0.65, 'rgba(255,255,255,0.04)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return c
}

interface Star {
  x: number; y: number
  size: number; brightness: number
  twSpeed: number; twPhase: number
  dx: number; dy: number
  r: number; g: number; b: number
}

const COLORS: [number,number,number][] = [
  [222,228,255],[202,216,255],[242,226,255],[196,208,255],
  [255,220,248],[218,202,255],[255,244,255],[188,204,255],
]

function makeLayer(
  n: number, w: number, h: number,
  szMin: number, szMax: number,
  bMin: number, bMax: number,
  dMin: number, dMax: number,
  calm: number, twRate: number,
): Star[] {
  const out: Star[] = []
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h
    const ex = Math.max(Math.abs(x/w-0.5), Math.abs(y/h-0.5)) * 2
    const cf = 1 - calm * (1 - Math.min(ex * 1.5, 1))
    const [r,g,b] = COLORS[Math.floor(Math.random() * COLORS.length)]
    out.push({
      x, y,
      size: szMin + Math.random() * (szMax - szMin),
      brightness: (bMin + Math.random() * (bMax - bMin)) * cf,
      twSpeed: Math.random() < twRate ? 0.15 + Math.random() * 0.4 : 0,
      twPhase: Math.random() * Math.PI * 2,
      dx: (Math.random() - 0.5) * (dMin + Math.random() * (dMax - dMin)),
      dy: (Math.random() - 0.5) * (dMin + Math.random() * (dMax - dMin)) * 0.65,
      r, g, b,
    })
  }
  return out
}

// ═══ RARE PERIPHERAL EVENTS ═══
interface Transit {
  x: number; y: number
  vx: number; vy: number
  size: number; brightness: number
  life: number; maxLife: number
  r: number; g: number; b: number
  trail: { x: number; y: number }[]
}

export const MotionOverlay = memo(function MotionOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const _ctx = canvas.getContext('2d', { alpha: true })
    if (!_ctx) return
    const ctx = _ctx

    let w = window.innerWidth, h = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = w * dpr; canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const sprite = makeSpriteCanvas()
    const ptr = { x: 0, y: 0, sx: 0, sy: 0 }
    const onMove = (e: MouseEvent) => {
      ptr.x = (e.clientX / w - 0.5) * 2
      ptr.y = -(e.clientY / h - 0.5) * 2
    }
    window.addEventListener('mousemove', onMove, { passive: true })

    let far: Star[] = [], near: Star[] = [], micro: Star[] = [], edgeStars: Star[] = []
    function gen() {
      far   = makeLayer(200,  w, h, 0.4, 1.0, 0.04, 0.12,  0.012, 0.035, 0.45, 0.03)
      near  = makeLayer(55,   w, h, 1.0, 2.2, 0.08, 0.22,  0.025, 0.06, 0.35, 0.05)
      micro = makeLayer(10,   w, h, 1.5, 2.8, 0.12, 0.3,   0.035, 0.09, 0.55, 0.07)
      // Stage 3: Edge-only enrichment stars — only in peripheral zones
      edgeStars = []
      for (let i = 0; i < 5; i++) {
        // Force spawn in edge corridors only
        let x: number, y: number
        const zone = Math.random()
        if (zone < 0.3) { x = Math.random() * w * 0.15; y = Math.random() * h } // left 15%
        else if (zone < 0.6) { x = w * 0.85 + Math.random() * w * 0.15; y = Math.random() * h } // right 15%
        else if (zone < 0.8) { x = Math.random() * w; y = Math.random() * h * 0.12 } // top 12%
        else { x = Math.random() * w; y = h * 0.88 + Math.random() * h * 0.12 } // bottom 12%
        const [r,g,b] = COLORS[Math.floor(Math.random() * COLORS.length)]
        edgeStars.push({
          x, y,
          size: 1.0 + Math.random() * 2.5,
          brightness: 0.15 + Math.random() * 0.35,
          twSpeed: Math.random() < 0.15 ? 0.2 + Math.random() * 0.3 : 0,
          twPhase: Math.random() * Math.PI * 2,
          dx: (Math.random() - 0.5) * 0.12,
          dy: (Math.random() - 0.5) * 0.08,
          r, g, b,
        })
      }
    }
    gen()

    // Rare transits — distant fast objects at edges
    const transits: Transit[] = []
    let nextTransit = 20000 + Math.random() * 40000

    function spawnTransit(t: number) {
      // Spawn at edge, travel across periphery
      const side = Math.random()
      let sx: number, sy: number, vx: number, vy: number
      if (side < 0.25) {
        // left edge, upper half
        sx = -10; sy = Math.random() * h * 0.4
        vx = 3 + Math.random() * 4; vy = (Math.random() - 0.3) * 1.5
      } else if (side < 0.5) {
        // right edge, lower half
        sx = w + 10; sy = h * 0.6 + Math.random() * h * 0.35
        vx = -(3 + Math.random() * 4); vy = (Math.random() - 0.5) * 1.2
      } else if (side < 0.75) {
        // top edge
        sx = Math.random() * w; sy = -10
        vx = (Math.random() - 0.5) * 3; vy = 2 + Math.random() * 3
      } else {
        // bottom edge
        sx = Math.random() * w; sy = h + 10
        vx = (Math.random() - 0.5) * 3; vy = -(2 + Math.random() * 3)
      }

      const colors: [number,number,number][] = [[220,180,255],[255,180,240],[200,200,255],[240,200,255]]
      const [r,g,b] = colors[Math.floor(Math.random() * colors.length)]

      transits.push({
        x: sx, y: sy, vx, vy,
        size: 2 + Math.random() * 2.5,
        brightness: 0.4 + Math.random() * 0.35,
        life: 0, maxLife: 120 + Math.random() * 80,
        r, g, b,
        trail: [],
      })
      nextTransit = t + 20000 + Math.random() * 40000
    }

    const onResize = () => {
      w = window.innerWidth; h = window.innerHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr)
      gen()
    }
    window.addEventListener('resize', onResize)

    let t0 = 0, animId = 0

    function drawLayer(stars: Star[], t: number, px: number, py: number, pStr: number) {
      for (const s of stars) {
        const mx = s.x + s.dx * t + px * pStr
        const my = s.y + s.dy * t + py * pStr
        const wx = ((mx % w) + w) % w
        const wy = ((my % h) + h) % h
        let a = s.brightness
        if (s.twSpeed > 0) a *= 0.75 + Math.sin(t * s.twSpeed * 0.001 + s.twPhase) * 0.25
        ctx.globalAlpha = a
        ctx.drawImage(sprite, wx - s.size/2, wy - s.size/2, s.size, s.size)
      }
    }

    function frame(ts: number) {
      if (!t0) t0 = ts
      const t = ts - t0

      ptr.sx += (ptr.x - ptr.sx) * 0.02
      ptr.sy += (ptr.y - ptr.sy) * 0.02
      const px = ptr.sx * 20
      const py = ptr.sy * 16

      ctx.clearRect(0, 0, w, h)

      // Stars — 3 depth layers + edge enrichment
      drawLayer(far,       t, px, py, 0.15)
      drawLayer(edgeStars, t, px, py, 0.4)
      drawLayer(near,      t, px, py, 0.6)
      drawLayer(micro,     t, px, py, 1.4)

      // Rare transits
      if (t > nextTransit) spawnTransit(t)
      for (let i = transits.length - 1; i >= 0; i--) {
        const tr = transits[i]
        tr.x += tr.vx; tr.y += tr.vy; tr.life++
        tr.trail.unshift({ x: tr.x, y: tr.y })
        if (tr.trail.length > 12) tr.trail.pop()

        if (tr.life > tr.maxLife || tr.x < -30 || tr.x > w + 30 || tr.y < -30 || tr.y > h + 30) {
          transits.splice(i, 1); continue
        }

        const prog = tr.life / tr.maxLife
        const fade = prog < 0.1 ? prog / 0.1 : prog > 0.8 ? (1 - prog) / 0.2 : 1

        // Trail
        for (let j = 1; j < tr.trail.length; j++) {
          const tp = tr.trail[j]
          const ta = fade * tr.brightness * (1 - j / tr.trail.length) * 0.4
          ctx.globalAlpha = ta
          const ts2 = tr.size * (1 - j / tr.trail.length * 0.6)
          ctx.drawImage(sprite, tp.x - ts2/2, tp.y - ts2/2, ts2, ts2)
        }

        // Head
        ctx.globalAlpha = fade * tr.brightness
        ctx.drawImage(sprite, tr.x - tr.size/2, tr.y - tr.size/2, tr.size, tr.size)
      }

      ctx.globalAlpha = 1
      animId = requestAnimationFrame(frame)
    }

    animId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    />
  )
})
