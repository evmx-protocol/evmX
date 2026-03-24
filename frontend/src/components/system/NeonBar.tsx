interface NeonBarProps {
  pct: number
  color?: string // hex color
  height?: number
  className?: string
}

export function NeonBar({ pct, color = '#00D0FF', height = 12, className }: NeonBarProps) {
  const v = Math.min(Math.max(pct, 0), 100)
  const h = height
  const glowColor = color

  return (
    <div className={className}>
      <svg className="w-full" viewBox={`0 0 300 ${h}`} preserveAspectRatio="none" style={{ height: h, filter: v > 40 ? `drop-shadow(0 0 3px ${glowColor}25)` : undefined }}>
        <defs>
          <linearGradient id={`nb-fill-${color.replace('#','')}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity={0.6} />
            <stop offset="100%" stopColor={color} stopOpacity={0.9} />
          </linearGradient>
          <linearGradient id={`nb-stroke-${color.replace('#','')}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity={0.15} />
            <stop offset="50%" stopColor={color} stopOpacity={0.35}>
              <animate attributeName="stop-opacity" values="0.25;0.45;0.25" dur="4s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor={color} stopOpacity={0.15} />
          </linearGradient>
        </defs>
        {/* Track */}
        <rect x="1" y="1" width="298" height={h - 2} rx="2" ry="2"
          fill="rgba(0,5,15,0.4)"
          stroke={`url(#nb-stroke-${color.replace('#','')})`} strokeWidth="1.2" />
        {/* Fill */}
        <rect x="2.5" y="2.5" width={Math.max(0, (v / 100) * 295)} height={h - 5} rx="1.5" ry="1.5"
          fill={`url(#nb-fill-${color.replace('#','')})`}>
          <animate attributeName="opacity" values="0.8;1;0.8" dur="4s" repeatCount="indefinite" />
        </rect>
        {/* Top glow */}
        {v > 15 && (
          <line x1="3" y1="1.5" x2={Math.max(3, (v / 100) * 297)} y2="1.5"
            stroke={color} strokeWidth="0.6" strokeLinecap="round">
            <animate attributeName="stroke-opacity" values="0.1;0.3;0.1" dur="4s" repeatCount="indefinite" />
          </line>
        )}
      </svg>
    </div>
  )
}
