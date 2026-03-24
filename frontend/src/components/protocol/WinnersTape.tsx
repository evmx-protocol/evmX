import { cn } from '@/lib/utils'
import type { WinnerEvent } from '@/lib/types'
import { chain } from '@/config'

interface WinnersTapeProps {
  winners: WinnerEvent[]
}

const POOL_LABELS = ['MICRO', 'MID', 'MEGA'] as const
const POOL_COLORS = ['text-micro', 'text-mid', 'text-mega'] as const

export function WinnersTape({ winners }: WinnersTapeProps) {
  if (winners.length === 0) {
    return (
      <div className="h-7 flex items-center bg-stage overflow-hidden">
        <span className="text-[9px] font-mono font-extrabold text-text-primary px-3 shrink-0 uppercase tracking-widest">Winners</span>
        <span className="text-[10px] font-mono text-text-ghost animate-pulse">Awaiting first payout...</span>
      </div>
    )
  }

  const items = winners.slice(0, 12).map((w, i) => (
    <span key={i} className="inline-flex items-center gap-1.5 shrink-0">
      <span className={cn('font-extrabold text-[9px] uppercase tracking-wider', POOL_COLORS[w.poolType])}>{POOL_LABELS[w.poolType]}</span>
      <a
        href={`${chain.scan}/address/${w.recipient}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-text-muted hover:text-text-primary transition-colors"
      >
        {w.recipient.slice(0, 6)}..{w.recipient.slice(-4)}
      </a>
      <span className="text-ok font-bold">+{w.amount.toFixed(4)}</span>
    </span>
  ))

  return (
    <div className="h-7 flex items-center bg-stage overflow-hidden">
      <span className="text-[9px] font-mono font-extrabold text-text-primary px-3 shrink-0 uppercase tracking-widest bg-surface h-full flex items-center">Winners</span>
      <div className="flex-1 overflow-hidden relative" style={{ maskImage: 'linear-gradient(90deg, transparent, black 3%, black 97%, transparent)' }}>
        <div className="flex gap-5 animate-[tape_40s_linear_infinite] hover:[animation-play-state:paused] text-[10px] font-mono px-3 whitespace-nowrap w-max">
          {items}
          <span className="text-text-ghost/30">|</span>
          {items}
        </div>
      </div>
    </div>
  )
}
