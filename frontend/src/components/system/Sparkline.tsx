import { ResponsiveContainer, AreaChart, Area } from 'recharts'

interface SparklineProps {
  data: number[]
  color?: string
  height?: number
  className?: string
}

export function Sparkline({ data, color = '#30c0a8', height = 24, className }: SparklineProps) {
  if (data.length < 2) {
    return (
      <div className={className} style={{ height }}>
        <div className="w-full h-full flex items-center">
          <div className="w-full h-px bg-text-ghost/20" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 4px, var(--color-text-ghost) 4px, var(--color-text-ghost) 8px)' }} />
        </div>
      </div>
    )
  }

  const chartData = data.map((v, i) => ({ i, v }))
  const up = data[data.length - 1] >= data[0]
  const lineColor = up ? '#3ce088' : '#e85858'
  const fillColor = up ? 'rgba(60,224,136,.06)' : 'rgba(232,88,88,.06)'

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillColor} />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={lineColor}
            strokeWidth={1.5}
            fill={`url(#spark-${color})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
