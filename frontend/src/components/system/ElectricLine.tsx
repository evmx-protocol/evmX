import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

interface ElectricLineProps {
  width?: number
  height?: number
  color?: string
  className?: string
  speed?: number
}

/**
 * Animated SVG electric/lightning line that crackles.
 * Generates random zigzag paths and animates between them.
 */
export function ElectricLine({ width = 200, height = 20, color = '#e040a0', className, speed = 2 }: ElectricLineProps) {
  const [path, setPath] = useState('')

  const generatePath = () => {
    const points: string[] = [`M 0 ${height / 2}`]
    const segments = 12 + Math.floor(Math.random() * 8)
    const segWidth = width / segments

    for (let i = 1; i <= segments; i++) {
      const x = i * segWidth
      const y = height / 2 + (Math.random() - 0.5) * height * 0.8
      points.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`)
    }
    return points.join(' ')
  }

  useEffect(() => {
    setPath(generatePath())
    const interval = setInterval(() => {
      setPath(generatePath())
    }, speed * 1000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, speed])

  return (
    <svg width={width} height={height} className={className} style={{ overflow: 'visible' }}>
      {/* Glow layer */}
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.3}
        style={{ filter: `blur(4px) drop-shadow(0 0 8px ${color})` }}
        animate={{ d: path }}
        transition={{ duration: 0.15, ease: 'easeInOut' }}
      />
      {/* Main line */}
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        animate={{ d: path }}
        transition={{ duration: 0.15, ease: 'easeInOut' }}
      />
      {/* Bright core */}
      <motion.path
        d={path}
        fill="none"
        stroke="white"
        strokeWidth={0.5}
        strokeLinecap="round"
        opacity={0.6}
        animate={{ d: path }}
        transition={{ duration: 0.15, ease: 'easeInOut' }}
      />
    </svg>
  )
}

/**
 * Animated dot that pulses and moves along a horizontal track.
 */
export function ElectricDot({ color = '#e040a0', size = 4 }: { color?: string; size?: number }) {
  return (
    <motion.div
      className="rounded-full"
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow: `0 0 ${size * 2}px ${color}, 0 0 ${size * 4}px ${color}`,
      }}
      animate={{
        scale: [1, 1.5, 1],
        opacity: [1, 0.6, 1],
      }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

/**
 * Scanning line that moves vertically — adds sci-fi feel.
 */
export function ScanLine({ color = 'rgba(208,64,224,0.06)' }: { color?: string }) {
  return (
    <motion.div
      className="absolute left-0 right-0 h-px pointer-events-none z-10"
      style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      animate={{ top: ['0%', '100%'] }}
      transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
    />
  )
}
