import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SCENE } from './config'

// Extremely subtle pointer-driven camera parallax
export function usePointerParallax(
  groupRef: React.RefObject<THREE.Group | null>,
  enabled: boolean = true,
) {
  const target = useRef({ x: 0, y: 0 })
  const current = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!enabled) return
    const onMove = (e: MouseEvent) => {
      // Normalize to -1..1
      target.current.x = (e.clientX / window.innerWidth - 0.5) * 2
      target.current.y = -(e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [enabled])

  useFrame(() => {
    if (!groupRef.current || !enabled) return
    const amp = SCENE.parallax.amplitude
    const smooth = SCENE.parallax.smoothing

    current.current.x += (target.current.x * amp - current.current.x) * smooth
    current.current.y += (target.current.y * amp - current.current.y) * smooth

    groupRef.current.rotation.y = current.current.x * 0.02
    groupRef.current.rotation.x = current.current.y * 0.015
  })
}
