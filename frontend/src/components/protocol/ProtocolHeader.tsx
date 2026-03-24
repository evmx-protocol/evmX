import { cn } from '@/lib/utils'
import { motion } from 'motion/react'
import { fmtUsd } from '@/lib/utils'
import { DataTag } from '@/components/system'
import { RadialGauge } from '@/components/system/RadialGauge'
import type { PriceFeedStatus } from '@/hooks/usePriceFeed'

interface ProtocolHeaderProps {
  totalEth: number
  usdPrice: number
  priceStatus: PriceFeedStatus
  totalPayouts: number
  lastFetch: number
}

const PRICE_STATUS_MAP: Record<PriceFeedStatus, { text: string; tag: string; source: 'on-chain' | 'estimate' | 'unavailable' | 'error' | 'loading'; color: string }> = {
  'live':                  { text: '',           tag: 'chainlink',           source: 'on-chain',    color: '' },
  'stale':                 { text: '~',          tag: 'stale feed',          source: 'estimate',    color: 'text-warn' },
  'testnet-unavailable':   { text: 'USD N/A',   tag: 'testnet \u2014 no feed',   source: 'unavailable', color: 'text-text-ghost' },
  'no-feed':               { text: 'USD N/A',   tag: 'feed not found',      source: 'unavailable', color: 'text-text-ghost' },
  'rpc-error':             { text: 'USD N/A',   tag: 'RPC error',           source: 'error',       color: 'text-danger' },
  'loading':               { text: 'USD \u2026',     tag: 'loading',             source: 'loading',     color: 'text-text-ghost' },
}

export function ProtocolHeader({ totalEth, usdPrice, priceStatus, totalPayouts, lastFetch }: ProtocolHeaderProps) {
  const ago = lastFetch > 0 ? Math.floor((Date.now() - lastFetch) / 1000) : -1
  const ps = PRICE_STATUS_MAP[priceStatus]

  // Pool distribution gauge (total payouts as progress indicator)
  const payoutProgress = Math.min(totalPayouts / (totalEth + totalPayouts + 0.001) * 100, 100)

  return (
    <div className="flex items-start gap-5 py-5 px-1 max-[600px]:flex-col">
      {/* Left: text */}
      <div className="flex-1">
        <div className="text-[10px] font-extrabold uppercase tracking-[4px] text-text-ghost font-mono mb-2">
          evmX Protocol
        </div>
        <motion.div
          key={totalEth.toFixed(4)}
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 1 }}
          className="font-mono font-extrabold leading-none tracking-[-3px]"
          style={{
            fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
            background: 'linear-gradient(135deg, #e040a0, #f06030, #ff8800)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {totalEth.toFixed(4)} ETH
        </motion.div>
        <div className="flex items-center gap-3 mt-2 text-sm text-text-dim font-mono">
          {priceStatus === 'live' && usdPrice > 0 ? (
            <span>{fmtUsd(totalEth, usdPrice)} <DataTag source={ps.source} label={ps.tag} /></span>
          ) : priceStatus === 'stale' && usdPrice > 0 ? (
            <span className={ps.color}>~{fmtUsd(totalEth, usdPrice)} <DataTag source={ps.source} label={ps.tag} /></span>
          ) : (
            <span className={ps.color}>{ps.text} <DataTag source={ps.source} label={ps.tag} /></span>
          )}
          {totalPayouts > 0 && <span className="text-ok">Paid: {totalPayouts.toFixed(4)}</span>}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-text-muted">
          <div className={cn('w-1.5 h-1.5 rounded-full', ago > 60 ? 'bg-danger' : ago > 30 ? 'bg-warn' : 'bg-ok')} />
          {ago < 0 ? 'Loading\u2026' : ago > 60 ? `Stale (${ago}s)` : `${ago}s ago`}
        </div>
      </div>

      {/* Right: visual gauge cluster */}
      <div className="flex gap-3 items-center max-[600px]:w-full max-[600px]:justify-center">
        <RadialGauge value={payoutProgress} size={64} color="ok" strokeWidth={3} label="paid" />
        <div className="text-center">
          <div className="font-mono text-xl font-extrabold text-text-primary">{totalEth > 0 ? '3' : '0'}</div>
          <div className="text-[8px] text-text-ghost uppercase tracking-wider">pools</div>
        </div>
      </div>
    </div>
  )
}
