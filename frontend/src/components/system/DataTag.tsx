import { cn } from '@/lib/utils'
import type { DataSource } from '@/lib/types'

const TAG_STYLES: Record<DataSource, string> = {
  'on-chain': 'text-text-ghost',
  'derived': 'text-text-ghost',
  'estimate': 'text-text-ghost',
  'session-only': 'text-text-ghost',
  'static-config': 'text-text-ghost',
  'unavailable': 'text-text-muted',
  'error': 'text-danger',
  'loading': 'text-text-ghost animate-pulse',
}

const TAG_LABELS: Record<DataSource, string> = {
  'on-chain': 'chain',
  'derived': 'derived',
  'estimate': 'est.',
  'session-only': 'session',
  'static-config': 'config',
  'unavailable': 'unavailable',
  'error': 'error',
  'loading': 'loading',
}

interface DataTagProps {
  source: DataSource
  label?: string
  className?: string
}

export function DataTag({ source, label, className }: DataTagProps) {
  return (
    <span className={cn(
      'inline-block text-[8px] font-medium tracking-widest px-1 py-px uppercase opacity-35',
      TAG_STYLES[source],
      className,
    )}>
      {label ?? TAG_LABELS[source]}
    </span>
  )
}
