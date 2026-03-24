import { cn } from '@/lib/utils'
import { DataTag } from '@/components/system/DataTag'
import type { UserStatus } from '@/lib/types'
import { CONTRACTS, chain } from '@/config'

interface ActionRailProps {
  isConnected: boolean
  userStatus: UserStatus | null
  children?: React.ReactNode
}

/**
 * Operator edge strip — NOT a sidebar card.
 * Bare content, no Surface wrapper. Parent controls the container.
 */
export function ActionRail({ isConnected, userStatus, children }: ActionRailProps) {
  const totalEntries = userStatus
    ? userStatus.microEntries + userStatus.midEntries + userStatus.megaEntries
    : 0

  return (
    <div>
      <div className="text-[7px] font-mono uppercase tracking-[3px] text-text-ghost mb-3">Operator</div>

      {/* Position */}
      {isConnected && userStatus ? (
        <div className="mb-4">
          <div className="font-mono text-base font-extrabold leading-tight">
            {userStatus.tokenBalanceFormatted.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            <span className="text-[9px] text-text-dim ml-0.5">evmX</span>
          </div>
          <div className="flex gap-3 mt-1 text-[10px]">
            <span className="font-mono font-bold">{[userStatus.microEligible, userStatus.midEligible, userStatus.megaEligible].filter(Boolean).length}/3 <span className="text-text-ghost font-normal">pools</span></span>
            <span className="font-mono font-bold">{totalEntries}/9 <span className="text-text-ghost font-normal">entries</span></span>
          </div>

          {/* Entry dots — ultra compact */}
          <div className="mt-2 space-y-0.5">
            {([
              { name: 'Mi', entries: userStatus.microEntries, eligible: userStatus.microEligible, color: 'bg-micro' },
              { name: 'Md', entries: userStatus.midEntries, eligible: userStatus.midEligible, color: 'bg-mid' },
              { name: 'Mg', entries: userStatus.megaEntries, eligible: userStatus.megaEligible, color: 'bg-mega' },
            ]).map(p => (
              <div key={p.name} className="flex items-center gap-1.5 text-[9px] font-mono">
                <span className="text-text-ghost w-3">{p.name}</span>
                <div className="flex gap-px">
                  {[1, 2, 3].map(i => (
                    <div key={i} className={cn('w-1.5 h-1.5 rounded-full', i <= p.entries ? p.color : 'bg-raised/60')} />
                  ))}
                </div>
                {!p.eligible && <span className="text-text-ghost/50">—</span>}
              </div>
            ))}
          </div>

          {totalEntries > 0 && (
            <div className="mt-2 text-[8px] text-danger/70 font-mono">⚠ sell = revoke {totalEntries}</div>
          )}
        </div>
      ) : (
        <div className="mb-4 text-[10px] text-text-ghost font-mono">No wallet</div>
      )}

      {/* Tiers — minimal */}
      <div className="mb-3">
        <div className="text-[7px] text-text-ghost uppercase tracking-wider mb-1">Tiers <DataTag source="static-config" /></div>
        <div className="flex gap-2 text-[9px] font-mono">
          <span className="text-ok font-bold">1×</span>
          <span className="text-warn font-bold">2×</span>
          <span className="text-mega font-bold">3×</span>
          <span className="text-text-ghost">10K+ / cum×req</span>
        </div>
      </div>

      {/* Buy */}
      <a
        href={`https://app.uniswap.org/swap?outputCurrency=${CONTRACTS.evmX}&chain=${(chain.id as number) === 8453 ? 'base' : 'base_sepolia'}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center font-mono text-[8px] font-bold py-2 uppercase tracking-[2px] text-mid hover:text-text-primary transition-colors"
      >
        Buy →
      </a>

      {/* Children (simulator etc) */}
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}
