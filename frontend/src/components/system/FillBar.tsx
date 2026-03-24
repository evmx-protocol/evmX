import { cn } from '@/lib/utils'
import { motion } from 'motion/react'

interface FillBarProps {
  pct: number
  color: 'micro' | 'mid' | 'mega'
  className?: string
  electric?: boolean
}

const COLORS = {
  micro: { core: '#A02068', bright: '#E850A0', glow: 'rgba(232,80,160,' },
  mid: { core: '#7020A0', bright: '#8830B8', glow: 'rgba(112,32,160,' },
  mega: { core: '#B01828', bright: '#D02038', glow: 'rgba(176,24,40,' },
}

export function FillBar({ pct, color, className, electric = true }: FillBarProps) {
  const c = COLORS[color]
  const v = Math.min(pct, 100)

  return (
    <div className={cn('relative', className)} style={{ minHeight: 14 }}>
      <svg className="w-full" viewBox="0 0 300 14" preserveAspectRatio="none" style={{ height: '100%', filter: v > 50 ? `drop-shadow(0 0 4px ${c.glow}0.15))` : undefined }}>
        <defs>
          <linearGradient id={`bar-fill-${color}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={c.core} stopOpacity={0.7} />
            <stop offset="100%" stopColor={c.bright} stopOpacity={0.9} />
          </linearGradient>
          <linearGradient id={`bar-stroke-${color}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={`${c.glow}0.2)`} />
            <stop offset="50%" stopColor={`${c.glow}0.45)`}>
              <animate attributeName="stop-opacity" values="0.3;0.55;0.3" dur="4s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor={`${c.glow}0.2)`} />
          </linearGradient>
        </defs>
        {/* Track frame — rounded rect with neon border */}
        <rect x="1" y="1" width="298" height="12" rx="3" ry="3"
          fill="rgba(0,5,15,0.4)"
          stroke={`url(#bar-stroke-${color})`} strokeWidth="1.5" />
        {/* Fill — glowing inner bar */}
        <rect x="3" y="3" width={Math.max(0, (v / 100) * 294)} height="8" rx="2" ry="2"
          fill={`url(#bar-fill-${color})`}>
          <animate attributeName="opacity" values="0.8;1;0.8" dur="4s" repeatCount="indefinite" />
        </rect>
        {/* Tick marks */}
        {[25, 50, 75].map(t => (
          <line key={t} x1={t * 3} y1="2" x2={t * 3} y2="12" stroke={`${c.glow}0.1)`} strokeWidth="0.5" />
        ))}
        {/* Top glow line */}
        {v > 20 && electric && (
          <line x1="4" y1="1.5" x2={Math.max(4, (v / 100) * 296)} y2="1.5"
            stroke={c.bright} strokeWidth="0.8" strokeOpacity="0.25" strokeLinecap="round">
            <animate attributeName="stroke-opacity" values="0.15;0.35;0.15" dur="4s" repeatCount="indefinite" />
          </line>
        )}
        {/* Notch at fill point */}
        {v > 5 && (
          <rect x={Math.max(3, (v / 100) * 294)} y="1" width="2" height="12" rx="1"
            fill={c.bright} opacity={0.6}>
            <animate attributeName="opacity" values="0.4;0.8;0.4" dur="4s" repeatCount="indefinite" />
          </rect>
        )}
      </svg>
    </div>
  )
}
