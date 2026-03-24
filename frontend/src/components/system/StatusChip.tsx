import { cn } from '@/lib/utils'

type Status = 'ready' | 'active' | 'warning' | 'idle' | 'danger' | 'configured'

const STATUS_STYLES: Record<Status, { bg: string; text: string; glow?: string }> = {
  ready: { bg: 'bg-ok/15', text: 'text-ok font-bold', glow: 'shadow-[0_0_8px_rgba(60,224,136,.3)]' },
  active: { bg: 'bg-micro/12', text: 'text-micro' },
  warning: { bg: 'bg-warn/12', text: 'text-warn' },
  idle: { bg: 'bg-raised/40', text: 'text-text-dim' },
  danger: { bg: 'bg-danger/12', text: 'text-danger' },
  configured: { bg: 'bg-raised/30', text: 'text-text-ghost' },
}

interface StatusChipProps {
  status: Status
  children: React.ReactNode
  className?: string
}

export function StatusChip({ status, children, className }: StatusChipProps) {
  const s = STATUS_STYLES[status]
  return (
    <span className={cn(
      'inline-block text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full uppercase font-mono',
      s.bg, s.text, s.glow,
      className,
    )}>
      {children}
    </span>
  )
}
