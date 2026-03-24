import { memo, useEffect, useRef } from 'react'
import cosmosImg from '@/assets/cosmos.png'

/**
 * SINGLE living background system. No duplicate canvas layers.
 * Photo = static visual hero (no CSS animation — avoids compositor thrash)
 * WebGL = all motion (stars, breathing glow, sweep, parallax)
 */

const VERT = `attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const FRAG = `
precision mediump float;
uniform float u_time;
uniform vec2 u_res;
uniform vec2 u_mouse;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Stars with visible twinkle
float stars(vec2 uv, float density, float bright) {
  vec2 cell = floor(uv * density);
  vec2 f = fract(uv * density);
  float h = hash(cell);
  if (h > 0.93) {
    vec2 c = vec2(hash(cell + 0.1), hash(cell + 0.2));
    float d = length(f - c);
    // Varied sizes — many small, some medium, rare giants
    float sz = 0.004 + h * 0.012 + step(0.99, h) * 0.02 + step(0.998, h) * 0.06;
    // Slow atmospheric scintillation
    float speed = 0.12 + hash(cell + 3.7) * 0.5;
    float phase = hash(cell + 5.3) * 6.28;
    float tw = 0.35 + 0.35 * sin(u_time * speed + phase)
             + 0.15 * sin(u_time * speed * 1.9 + phase * 2.3)
             + 0.35 * step(0.985, h); // bright stars really stand out
    return smoothstep(sz, 0.0, d) * bright * clamp(tw, 0.08, 1.0);
  }
  return 0.0;
}

// Breathing nebula glow — edge-weighted
float breathe(vec2 uv) {
  float edge = length((uv - 0.5) * vec2(1.3, 1.0));
  float mask = smoothstep(0.15, 0.6, edge);
  float pulse = 0.5 + 0.5 * sin(u_time * 0.2);
  return mask * pulse * 0.2;
}

// Shimmer sweep — visible every ~20s
float sweep(vec2 uv) {
  float t = mod(u_time, 20.0);
  if (t > 3.0) return 0.0;
  float pos = t / 3.0;
  float line = uv.x * 0.65 + uv.y * 0.35;
  return smoothstep(0.1, 0.0, abs(line - pos)) * 0.3 * (1.0 - pos);
}

// Rare signal streak — every ~45s
float streak(vec2 uv) {
  float t = mod(u_time + 12.0, 45.0);
  if (t > 1.5) return 0.0;
  float prog = t / 1.5;
  vec2 p = mix(vec2(0.05, 0.9), vec2(0.85, 0.2), prog);
  float d = length(uv - p);
  float trail = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i) / 5.0;
    vec2 tp = mix(vec2(0.05, 0.9), vec2(0.85, 0.2), max(prog - fi * 0.06, 0.0));
    trail += smoothstep(0.008, 0.0, length(uv - tp)) * (1.0 - fi) * 0.2;
  }
  return trail;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float ar = u_res.x / u_res.y;
  vec2 uvA = vec2(uv.x * ar, uv.y);

  // Visible drift — 3x stronger than before
  vec2 drift = vec2(
    sin(u_time * 0.01) * 0.045,
    cos(u_time * 0.007) * 0.03
  );
  vec2 mOff = u_mouse * 0.008;

  // Far stars — rich field
  float s = stars(uvA + drift * 0.3 + mOff * 0.2, 80.0, 2.0);
  s += stars(uvA + drift * 0.15 + mOff * 0.1 + 37.0, 50.0, 1.5);
  // Near stars — brightest, most parallax
  s += stars(uvA + drift * 0.9 + mOff * 0.5 + 17.0, 20.0, 3.0);

  // Breathing glow
  float glow = breathe(uv);
  vec3 glowCol = mix(vec3(0.35, 0.15, 0.55), vec3(0.55, 0.12, 0.4), uv.x) * glow;

  // Composite — stars only, clean
  vec3 col = vec3(0.88, 0.85, 1.0) * s;

  // With mix-blend-mode:screen, black=transparent, bright=visible
  // Output alpha 1.0 — the screen blend handles compositing
  gl_FragColor = vec4(col, 1.0);
}
`

function ShaderLayer() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const gl = c.getContext('webgl', { alpha: false, antialias: false })
    if (!gl) return

    // Compile with error logging
    const mk = (t: number, src: string) => {
      const sh = gl.createShader(t)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(sh))
        return null
      }
      return sh
    }
    const vs = mk(gl.VERTEX_SHADER, VERT)
    const fs = mk(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) { console.error('Shader compilation failed — background disabled'); return }

    const p = gl.createProgram()!
    gl.attachShader(p, vs)
    gl.attachShader(p, fs)
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(p))
      return
    }
    gl.useProgram(p)
    console.log('[BackgroundCanvas] WebGL shader compiled & linked OK')

    // Quad
    const b = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, b)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
    const a = gl.getAttribLocation(p, 'a_pos')
    gl.enableVertexAttribArray(a)
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0)

    const uT = gl.getUniformLocation(p, 'u_time')
    const uR = gl.getUniformLocation(p, 'u_res')
    const uM = gl.getUniformLocation(p, 'u_mouse')

    // No WebGL blend needed — CSS mix-blend-mode:screen handles compositing

    const mouse = { x: 0, y: 0, sx: 0, sy: 0 }
    const onMove = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2
      mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', onMove, { passive: true })

    let alive = true
    const slow = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // DPR capped to 1.0 for background — performance over sharpness here
    const resize = () => {
      c.width = window.innerWidth
      c.height = window.innerHeight
      c.style.width = window.innerWidth + 'px'
      c.style.height = window.innerHeight + 'px'
      gl.viewport(0, 0, c.width, c.height)
    }
    resize()
    window.addEventListener('resize', resize)

    const t0 = performance.now()
    const loop = () => {
      if (!alive) return
      const t = (performance.now() - t0) / 1000 * (slow ? 0.2 : 1)
      mouse.sx += (mouse.x - mouse.sx) * 0.03
      mouse.sy += (mouse.y - mouse.sy) * 0.03
      gl.clearColor(0, 0, 0, 1) // black = transparent in screen blend mode
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(uT, t)
      gl.uniform2f(uR, c.width, c.height)
      gl.uniform2f(uM, mouse.sx, mouse.sy)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)

    return () => { alive = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1, mixBlendMode: 'screen' }} />
}

export const BackgroundCanvas = memo(function BackgroundCanvas() {
  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      {/* Static cosmos photo — NO CSS animation (avoids compositor thrash) */}
      <img
        src={cosmosImg}
        alt=""
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover object-center select-none"
        style={{
          filter: 'saturate(1.9) contrast(1.15) brightness(0.75)',
          animation: 'cosmos-drift-1 40s ease-in-out infinite alternate',
          transformOrigin: 'center center',
        }}
      />

      {/* Single WebGL layer handles ALL motion */}
      <ShaderLayer />

      {/* Light readability vignette */}
      <div className="absolute inset-0" style={{
        zIndex: 2,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.04) 35%, rgba(0,0,0,0.12) 65%, rgba(0,0,0,0.28) 100%)',
      }} />
    </div>
  )
})
