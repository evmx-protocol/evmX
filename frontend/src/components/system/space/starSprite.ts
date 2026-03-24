import * as THREE from 'three'

// Generate a circular star sprite texture via canvas — eliminates square artifacts
let _cachedTexture: THREE.Texture | null = null

export function getStarSprite(): THREE.Texture {
  if (_cachedTexture) return _cachedTexture

  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Radial gradient: bright center → transparent edge
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.15, 'rgba(255,255,255,0.85)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.3)')
  grad.addColorStop(0.7, 'rgba(255,255,255,0.05)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')

  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  _cachedTexture = texture
  return texture
}
