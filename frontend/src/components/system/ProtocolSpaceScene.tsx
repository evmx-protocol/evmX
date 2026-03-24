import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { usePointerParallax } from './space/usePointerParallax'
import { getStarSprite } from './space/starSprite'
import { SCENE } from './space/config'

// ═══ STARFIELD LAYER ═══
function Starfield({
  count, spread, pointSize, minBright, maxBright,
  driftSpeed, independentAxis, centerCalm, twinkleRate,
}: {
  count: number; spread: number; pointSize: number
  minBright: number; maxBright: number
  driftSpeed: number; independentAxis: boolean
  centerCalm: number; twinkleRate: number
}) {
  const ref = useRef<THREE.Points>(null)
  const sprite = useMemo(() => getStarSprite(), [])
  const baseColors = useRef<Float32Array>(new Float32Array(0))
  const twinkleInfo = useRef<{ phase: number; speed: number }[]>([])

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const tw: { phase: number; speed: number }[] = []

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = spread * (0.08 + Math.random() * 0.92)

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi)

      const screenDist = Math.sqrt(pos[i * 3] ** 2 + pos[i * 3 + 1] ** 2) / spread
      const edge = Math.min(screenDist * 1.6, 1)
      const calm = 1 - centerCalm * (1 - edge)
      const b = (minBright + Math.random() * (maxBright - minBright)) * calm

      const pick = Math.random()
      if (pick < 0.5) { col[i*3]=b*0.95; col[i*3+1]=b*0.97; col[i*3+2]=b }
      else if (pick < 0.78) { col[i*3]=b*0.8; col[i*3+1]=b*0.85; col[i*3+2]=b }
      else if (pick < 0.92) { col[i*3]=b*0.88; col[i*3+1]=b*0.76; col[i*3+2]=b }
      else { col[i*3]=b; col[i*3+1]=b*0.9; col[i*3+2]=b*0.95 }

      tw.push({
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() < twinkleRate ? 0.3 + Math.random() * 0.7 : 0,
      })
    }

    baseColors.current = new Float32Array(col)
    twinkleInfo.current = tw
    return { pos, col }
  }, [count, spread, minBright, maxBright, centerCalm, twinkleRate])

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()

    if (driftSpeed > 0) {
      ref.current.rotation.y = t * driftSpeed
      if (independentAxis) {
        ref.current.rotation.x = Math.sin(t * driftSpeed * 0.35) * 0.005
        ref.current.rotation.z = Math.cos(t * driftSpeed * 0.25) * 0.004
      }
    }

    // Twinkle
    const colorAttr = ref.current.geometry.attributes.color
    if (colorAttr && baseColors.current.length > 0) {
      const arr = colorAttr.array as Float32Array
      const base = baseColors.current
      for (let i = 0; i < twinkleInfo.current.length; i++) {
        const tw = twinkleInfo.current[i]
        if (tw.speed === 0) continue
        const mod = 0.82 + Math.sin(t * tw.speed + tw.phase) * 0.18
        arr[i*3] = base[i*3] * mod
        arr[i*3+1] = base[i*3+1] * mod
        arr[i*3+2] = base[i*3+2] * mod
      }
      colorAttr.needsUpdate = true
    }
  })

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions.pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[positions.col, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={sprite}
        vertexColors
        size={pointSize}
        sizeAttenuation
        transparent
        alphaTest={0.01}
        opacity={0.95}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ═══ SPACECRAFT FLYBY SYSTEM ═══
interface FlybyState {
  active: boolean
  progress: number
  route: [number, number, number, number]
  speed: number
}

function SpacecraftFlyby({ reduced }: { reduced: boolean }) {
  const meshRef = useRef<THREE.Group>(null)
  const trailRef = useRef<THREE.Points>(null)
  const [flyby, setFlyby] = useState<FlybyState>({ active: false, progress: 0, route: [0,0,0,0], speed: 1 })
  const nextFlybyTime = useRef(SCENE.flyby.minInterval + Math.random() * (SCENE.flyby.maxInterval - SCENE.flyby.minInterval))
  const elapsed = useRef(0)

  // Trail positions
  const trailPositions = useMemo(() => new Float32Array(SCENE.flyby.trailLength * 3), [])
  const trailColors = useMemo(() => {
    const c = new Float32Array(SCENE.flyby.trailLength * 3)
    for (let i = 0; i < SCENE.flyby.trailLength; i++) {
      const fade = 1 - i / SCENE.flyby.trailLength
      c[i*3] = 0.6 * fade; c[i*3+1] = 0.3 * fade; c[i*3+2] = 0.8 * fade
    }
    return c
  }, [])

  const sprite = useMemo(() => getStarSprite(), [])

  useFrame((_, delta) => {
    if (reduced) return
    elapsed.current += delta

    if (!flyby.active) {
      if (elapsed.current > nextFlybyTime.current) {
        // Spawn new flyby
        const routes = SCENE.flyby.routes
        const route = routes[Math.floor(Math.random() * routes.length)]
        const speed = 0.8 + Math.random() * 0.4
        setFlyby({ active: true, progress: 0, route, speed })
        elapsed.current = 0
        nextFlybyTime.current = SCENE.flyby.minInterval + Math.random() * (SCENE.flyby.maxInterval - SCENE.flyby.minInterval)
      }
      return
    }

    // Update flyby position
    const newProgress = flyby.progress + delta / (SCENE.flyby.duration / flyby.speed)
    if (newProgress > 1) {
      setFlyby(prev => ({ ...prev, active: false, progress: 0 }))
      return
    }
    setFlyby(prev => ({ ...prev, progress: newProgress }))

    const [sx, sy, ex, ey] = flyby.route
    const t = newProgress
    // Smooth ease
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    const x = (sx + (ex - sx) * eased) * 25
    const y = (sy + (ey - sy) * eased) * 15
    const z = -20 - Math.sin(t * Math.PI) * 8

    if (meshRef.current) {
      meshRef.current.position.set(x, y, z)
      // Face movement direction
      const angle = Math.atan2(ey - sy, ex - sx)
      meshRef.current.rotation.z = angle
    }

    // Update trail
    if (trailRef.current) {
      const tArr = trailRef.current.geometry.attributes.position.array as Float32Array
      for (let i = SCENE.flyby.trailLength - 1; i > 0; i--) {
        tArr[i*3] = tArr[(i-1)*3]
        tArr[i*3+1] = tArr[(i-1)*3+1]
        tArr[i*3+2] = tArr[(i-1)*3+2]
      }
      tArr[0] = x; tArr[1] = y; tArr[2] = z
      trailRef.current.geometry.attributes.position.needsUpdate = true
    }
  })

  if (reduced || !flyby.active) return null

  const opacity = flyby.progress < 0.1
    ? flyby.progress / 0.1
    : flyby.progress > 0.85
    ? (1 - flyby.progress) / 0.15
    : 1

  return (
    <>
      {/* Spacecraft — sleek minimal silhouette */}
      <group ref={meshRef}>
        {/* Main hull — thin elongated shape */}
        <mesh>
          <boxGeometry args={[SCENE.flyby.scale * 3, SCENE.flyby.scale * 0.3, SCENE.flyby.scale * 0.15]} />
          <meshBasicMaterial
            color="#1a1a2e"
            transparent
            opacity={opacity * 0.9}
          />
        </mesh>
        {/* Engine glow — rear emissive point */}
        <mesh position={[-SCENE.flyby.scale * 1.2, 0, 0]}>
          <sphereGeometry args={[SCENE.flyby.scale * 0.12, 8, 8]} />
          <meshBasicMaterial
            color="#7B5EFF"
            transparent
            opacity={opacity * SCENE.flyby.brightness}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* Second engine — slightly offset */}
        <mesh position={[-SCENE.flyby.scale * 1.1, SCENE.flyby.scale * 0.08, 0]}>
          <sphereGeometry args={[SCENE.flyby.scale * 0.06, 6, 6]} />
          <meshBasicMaterial
            color="#8030d0"
            transparent
            opacity={opacity * SCENE.flyby.brightness * 0.6}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>

      {/* Engine trail */}
      <points ref={trailRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[trailPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[trailColors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={sprite}
          vertexColors
          size={0.08}
          sizeAttenuation
          transparent
          opacity={opacity * 0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  )
}

// ═══ MAIN SCENE ═══
export function ProtocolSpaceScene({ reduced = false }: { reduced?: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  usePointerParallax(groupRef, !reduced)

  const far = SCENE.farStars
  const near = SCENE.nearStars
  const micro = SCENE.microStars

  return (
    <group ref={groupRef}>
      <color attach="background" args={['#020308']} />

      {/* Layer 1: Far starfield — deep, dense, vast */}
      <Starfield
        count={reduced ? 3000 : far.count}
        spread={far.spread}
        pointSize={far.pointSize}
        minBright={far.minBright}
        maxBright={far.maxBright}
        driftSpeed={reduced ? 0 : far.driftSpeed}
        independentAxis={false}
        centerCalm={far.centerCalm}
        twinkleRate={0.08}
      />

      {/* Layer 2: Near starfield — spatial depth */}
      <Starfield
        count={reduced ? 100 : near.count}
        spread={near.spread}
        pointSize={near.pointSize}
        minBright={near.minBright}
        maxBright={near.maxBright}
        driftSpeed={reduced ? 0 : near.driftSpeed}
        independentAxis={true}
        centerCalm={near.centerCalm}
        twinkleRate={0.12}
      />

      {/* Layer 3: Very-near micro highlights — depth separation */}
      <Starfield
        count={reduced ? 8 : micro.count}
        spread={micro.spread}
        pointSize={micro.pointSize}
        minBright={micro.minBright}
        maxBright={micro.maxBright}
        driftSpeed={reduced ? 0 : micro.driftSpeed}
        independentAxis={true}
        centerCalm={micro.centerCalm}
        twinkleRate={0.2}
      />

      {/* Rare spacecraft flyby — environmental premium event */}
      <SpacecraftFlyby reduced={reduced ?? false} />
    </group>
  )
}
