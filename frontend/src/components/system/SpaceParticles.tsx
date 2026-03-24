import { motion } from 'motion/react'
import { useEffect, useState, useCallback } from 'react'

interface Meteor {
  id: number
  startX: number
  startY: number
  length: number
  duration: number
  angle: number
  brightness: number
}

/**
 * Vivid space effects — shooting stars, meteors, and floating particles.
 */
export function SpaceParticles() {
  const [meteors, setMeteors] = useState<Meteor[]>([])

  const spawnMeteor = useCallback(() => {
    const m: Meteor = {
      id: Date.now() + Math.random(),
      startX: Math.random() * 80 + 10,
      startY: Math.random() * 40,
      length: 80 + Math.random() * 200,
      duration: 0.8 + Math.random() * 1.5,
      angle: 20 + Math.random() * 40,
      brightness: 0.5 + Math.random() * 0.5,
    }
    setMeteors(prev => [...prev.slice(-5), m])
    setTimeout(() => {
      setMeteors(prev => prev.filter(x => x.id !== m.id))
    }, (m.duration + 0.5) * 1000)
  }, [])

  useEffect(() => {
    // Initial meteor
    const t1 = setTimeout(spawnMeteor, 2000)
    // Random interval
    const spawn = () => {
      spawnMeteor()
      const next = 3000 + Math.random() * 8000
      return setTimeout(spawn, next)
    }
    const t2 = setTimeout(spawn, 5000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [spawnMeteor])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* Shooting stars / meteors */}
      {meteors.map(m => (
        <motion.div
          key={m.id}
          className="absolute"
          style={{
            left: `${m.startX}%`,
            top: `${m.startY}%`,
            width: m.length,
            height: 2,
            borderRadius: 1,
            background: `linear-gradient(90deg, transparent, rgba(208,80,224,${m.brightness * 0.3}), rgba(224,160,255,${m.brightness}))`,
            boxShadow: `0 0 8px rgba(208,80,224,${m.brightness * 0.5}), 0 0 20px rgba(208,80,224,${m.brightness * 0.2})`,
            transformOrigin: 'right center',
            rotate: `${m.angle}deg`,
          }}
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: [0, 1, 1, 0], scaleX: [0, 1, 1, 0.3] }}
          transition={{ duration: m.duration, ease: 'easeOut' }}
        />
      ))}

      {/* Pulsing distant stars — larger, more visible */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={`star-${i}`}
          className="absolute rounded-full"
          style={{
            width: 1.5 + (i % 3),
            height: 1.5 + (i % 3),
            background: `rgba(${200 + (i % 3) * 20}, ${140 + (i % 4) * 30}, ${220 + (i % 2) * 35}, ${0.3 + (i % 4) * 0.1})`,
            boxShadow: i % 3 === 0 ? '0 0 4px rgba(208,128,240,.4)' : undefined,
            left: `${5 + i * 8}%`,
            top: `${8 + (i * 7) % 80}%`,
          }}
          animate={{
            opacity: [0.2, 0.7, 0.2],
            scale: [1, i % 3 === 0 ? 1.8 : 1.3, 1],
          }}
          transition={{
            duration: 3 + i * 0.7,
            repeat: Infinity,
            delay: i * 0.5,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Slow floating nebula wisps */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={`wisp-${i}`}
          className="absolute rounded-full"
          style={{
            width: 60 + i * 40,
            height: 60 + i * 40,
            background: `radial-gradient(circle, rgba(208,64,224,${0.03 + i * 0.01}) 0%, transparent 70%)`,
            left: `${20 + i * 25}%`,
            top: `${30 + i * 15}%`,
          }}
          animate={{
            x: [0, 30, -20, 0],
            y: [0, -20, 15, 0],
            scale: [1, 1.1, 0.95, 1],
          }}
          transition={{
            duration: 20 + i * 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}
