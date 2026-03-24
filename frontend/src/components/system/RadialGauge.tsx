import { cn } from '@/lib/utils'

interface RadialGaugeProps {
  value: number // 0-100
  size?: number
  strokeWidth?: number
  color: 'micro' | 'mid' | 'mega' | 'ok' | 'warn' | 'danger'
  label?: string
  children?: React.ReactNode
  className?: string
}

const COLOR_MAP = {
  micro: { stroke: '#e040c0', glow: 'drop-shadow(0 0 6px rgba(224,64,192,.5))' },
  mid: { stroke: '#a040ff', glow: 'drop-shadow(0 0 6px rgba(160,64,255,.5))' },
  mega: { stroke: '#ff40a0', glow: 'drop-shadow(0 0 8px rgba(255,64,160,.5))' },
  ok: { stroke: '#00f0ff', glow: 'drop-shadow(0 0 6px rgba(0,240,255,.5))' },
  warn: { stroke: '#e040c0', glow: 'drop-shadow(0 0 6px rgba(224,64,192,.4))' },
  danger: { stroke: '#ff2080', glow: 'drop-shadow(0 0 6px rgba(255,32,128,.4))' },
}

export function RadialGauge({ value, size = 80, strokeWidth = 4, color, label, children, className }: RadialGaugeProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(value, 100) / 100) * circumference
  const colors = COLOR_MAP[color]

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" style={{ filter: value > 50 ? colors.glow : undefined }}>
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(100,120,200,.08)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
        {/* Gradient overlay for high values */}
        {value > 75 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={strokeWidth + 2}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            opacity={0.15}
          />
        )}
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children ?? (
          <>
            <span className="font-mono text-sm font-bold" style={{ color: colors.stroke }}>
              {value.toFixed(0)}%
            </span>
            {label && <span className="text-[8px] text-text-ghost uppercase tracking-wider">{label}</span>}
          </>
        )}
      </div>
    </div>
  )
}
