import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

interface FadeInProps {
  children: React.ReactNode
  className?: string
  delay?: number
}

export function FadeIn({ children, className, delay = 0 }: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

interface PulseValueProps {
  children: React.ReactNode
  trigger: string | number
  className?: string
}

/**
 * Briefly flashes when the trigger value changes.
 * Use for live-updating numbers (pool balances, timers).
 */
export function PulseValue({ children, trigger, className }: PulseValueProps) {
  return (
    <motion.span
      key={String(trigger)}
      initial={{ opacity: 0.6 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className={cn('inline-block', className)}
    >
      {children}
    </motion.span>
  )
}

interface PresenceProps {
  show: boolean
  children: React.ReactNode
  className?: string
}

export function Presence({ show, children, className }: PresenceProps) {
  if (!show) return null
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
