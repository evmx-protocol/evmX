import { cn } from '@/lib/utils'
import { DataTag } from './DataTag'
import type { DataSource } from '@/lib/types'

interface IntelItem {
  label: string
  value: string
  source: DataSource
  sourceLabel?: string
  color?: string
}

interface IntelStripProps {
  title: string
  items: IntelItem[]
  className?: string
}

/**
 * Compact tactical readout strip — NOT a spreadsheet row.
 * Shows key-value pairs inline with truth source tags.
 * Used for protocol metrics, state observations, forecasts.
 */
export function IntelStrip({ title, items, className }: IntelStripProps) {
  return (
    <div className={cn('py-3', className)}>
      <div className="text-[9px] font-extrabold uppercase tracking-[2px] text-text-ghost font-mono mb-2">
        {title}
      </div>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-text-dim flex items-center gap-1 min-w-0 shrink">
              {item.label}
              <DataTag source={item.source} label={item.sourceLabel} />
            </span>
            <span className={cn(
              'font-mono text-xs font-semibold text-right shrink-0',
              item.color ?? 'text-text-primary',
            )}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
