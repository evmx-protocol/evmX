interface MiniBarProps {
  segments: { value: number; color: string }[]
  height?: number
  className?: string
}

export function MiniBar({ segments, height = 4, className }: MiniBarProps) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  return (
    <div className={className} style={{ height, display: 'flex', gap: 1, borderRadius: 2, overflow: 'hidden' }}>
      {segments.map((s, i) => (
        <div
          key={i}
          style={{
            width: `${(s.value / total) * 100}%`,
            background: s.color,
            minWidth: s.value > 0 ? 2 : 0,
          }}
        />
      ))}
    </div>
  )
}
