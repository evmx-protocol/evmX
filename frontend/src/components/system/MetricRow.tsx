import { cn } from '@/lib/utils'
import type { DataSource } from '@/lib/types'
import { DataTag } from './DataTag'

interface MetricRowProps {
  label: string
  value: string | number
  source?: DataSource
  valueColor?: string
  tooltip?: string
  className?: string
}

export function MetricRow({ label, value, source, valueColor, tooltip, className }: MetricRowProps) {
  return (
    <div className={cn('flex justify-between items-center py-1 text-sm', className)} title={tooltip}>
      <span className="text-text-dim font-medium flex items-center gap-1.5">
        {label}
        {source && <DataTag source={source} />}
      </span>
      <span className={cn('font-mono font-medium text-right max-w-[55%]', valueColor)}>
        {value}
      </span>
    </div>
  )
}
