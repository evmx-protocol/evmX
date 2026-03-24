import { cn } from '@/lib/utils'
import { motion } from 'motion/react'
import { RadialGauge } from '@/components/system/RadialGauge'
import { DataTag } from '@/components/system/DataTag'
import { Tooltip } from '@/components/system/Tooltip'
import { FillBar } from '@/components/system/FillBar'
import { fmtTimer } from '@/lib/utils'
import type { PoolState } from '@/lib/types'

interface PoolChamberProps {
  pool: 'micro' | 'mid' | 'mega'
  data: PoolState | null
  usdPrice: number
}

const CFG = {
  micro: {
    icon: '\u26A1', label: 'MICRO', hex: '#e040a0',
    glow: '0 0 20px rgba(224,64,160,.15), inset 0 0 30px rgba(224,64,160,.03)',
    border: '',
    cycleDur: '2h', taxShare: '1%',
  },
  mid: {
    icon: '\uD83D\uDD2E', label: 'MID', hex: '#f06030',
    glow: '0 0 20px rgba(240,96,48,.15), inset 0 0 30px rgba(240,96,48,.03)',
    border: '',
    cycleDur: '6h', taxShare: '1.5%',
  },
  mega: {
    icon: '\uD83D\uDD25', label: 'MEGA', hex: '#ff8800',
    glow: '0 0 25px rgba(255,136,0,.2), inset 0 0 40px rgba(255,136,0,.04)',
    border: '',
    cycleDur: '7d', taxShare: '1.9%',
  },
} as const

export function PoolChamber({ pool, data, usdPrice: _usdPrice }: PoolChamberProps) {
  const c = CFG[pool]

  if (!data) {
    return (
      <div className="rounded-lg p-4 animate-pulse" style={{ boxShadow: c.glow }}>
        <div className="h-16 bg-raised/30 rounded" />
      </div>
    )
  }

  const state = data.isReady ? 'ready' : data.isNearThreshold ? 'warning' : 'idle'
  const stateLabel = data.isReady ? 'READY' : data.isNearThreshold ? `${data.fillPct.toFixed(0)}%` : 'ACCUMULATING'

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: pool === 'micro' ? 0 : pool === 'mid' ? 0.1 : 0.2 }}
      className={cn('rounded-lg', pool === 'mega' ? 'p-5' : 'p-4')}
      style={{ boxShadow: c.glow }}
    >
      <div className="flex items-center gap-4">
        {/* Left: identity + balance */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-extrabold uppercase tracking-wider" style={{ color: c.hex, fontSize: pool === 'mega' ? 16 : 13 }}>
              {c.icon} {c.label}
            </span>
            <motion.span
              key={stateLabel}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                'text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full font-mono',
                state === 'ready' ? 'bg-ok/15 text-ok shadow-[0_0_6px_rgba(64,232,144,.3)]'
                  : state === 'warning' ? 'bg-warn/12 text-warn'
                  : 'bg-raised/40 text-text-dim',
              )}
            >
              {data.isReady && <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="mr-0.5">{'\u25CF'}</motion.span>}
              {stateLabel}
            </motion.span>
            <span className="text-[9px] font-mono text-text-ghost">#{data.cycleId}\u00B7{c.cycleDur}</span>
          </div>

          {/* Balance -- large, neon colored */}
          <motion.div
            key={data.balanceEth.toFixed(4)}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
            className="font-mono font-extrabold leading-none"
            style={{ color: c.hex, fontSize: pool === 'mega' ? 36 : pool === 'mid' ? 26 : 20 }}
          >
            {data.balanceEth.toFixed(4)} <span className="text-text-dim font-medium" style={{ fontSize: pool === 'mega' ? 16 : 13 }}>ETH</span>
          </motion.div>

          <div className="text-[10px] font-mono text-text-muted mt-1">
            Target \u2192 {data.thresholdEth.toFixed(4)} \u00B7 {data.participants}/{data.participants} players
          </div>
        </div>

        {/* Center: stats row */}
        <div className="flex gap-5 items-center max-[700px]:hidden">
          <Tooltip content="Unique addresses with at least 1 entry this cycle">
            <div className="text-center cursor-help">
              <div className="font-mono text-lg font-bold text-text-primary">{data.participants}</div>
              <div className="text-[9px] text-text-muted uppercase tracking-wider">Players</div>
            </div>
          </Tooltip>
          <Tooltip content="Range: worst (all 3\u00D7) to best (all 1\u00D7). True distribution unknown.">
            <div className="text-center cursor-help">
              <div className="font-mono text-lg font-bold" style={{ color: c.hex }}>
                {data.participants > 0 ? `${(100 / (data.participants * 3)).toFixed(0)}%` : '--'}
              </div>
              <div className="text-[9px] text-text-muted uppercase tracking-wider flex items-center gap-0.5 justify-center">
                Win % <DataTag source="estimate" label="b" />
              </div>
            </div>
          </Tooltip>
          <Tooltip content="0.7% of pool balance, clamped between floor and cap">
            <div className="text-center cursor-help">
              <div className="font-mono text-sm font-bold text-text-primary">{data.entryReqEth.toFixed(4)} <span className="text-text-muted text-xs">ETH</span></div>
              <div className="text-[9px] text-text-muted uppercase tracking-wider">Entry</div>
            </div>
          </Tooltip>
        </div>

        {/* Right: radial gauge */}
        <RadialGauge
          value={data.fillPct}
          size={pool === 'mega' ? 80 : 64}
          strokeWidth={pool === 'mega' ? 5 : 4}
          color={data.isReady ? 'ok' : pool}
        >
          <span className="font-mono font-bold" style={{ fontSize: pool === 'mega' ? 14 : 11, color: data.isReady ? '#40e890' : c.hex }}>
            {data.fillPct.toFixed(0)}%
          </span>
          <span className="text-[7px] text-text-ghost uppercase">{data.isReady ? 'ready' : 'fill'}</span>
        </RadialGauge>
      </div>

      {/* Bottom: fill bar + timer */}
      <div className="flex items-center gap-3 mt-3">
        <div className="flex-1">
          <FillBar pct={data.fillPct} color={pool} />
        </div>
        <motion.span
          className="font-mono text-xs font-bold tabular-nums shrink-0"
          animate={{ color: data.timeLeft <= 0 ? '#40e890' : data.timeLeft < 300 ? '#ff4060' : '#e8e0f0' }}
        >
          {data.timeLeft <= 0 ? '\u25CF READY' : fmtTimer(data.timeLeft)}
        </motion.span>
      </div>
    </motion.div>
  )
}
