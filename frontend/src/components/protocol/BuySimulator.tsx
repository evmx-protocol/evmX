import { useState } from 'react'
import { cn } from '@/lib/utils'
import { DataTag } from '@/components/system/DataTag'
import type { PoolState } from '@/lib/types'

interface BuySimulatorProps {
  pools: { micro: PoolState | null; mid: PoolState | null; mega: PoolState | null }
}

export function BuySimulator({ pools }: BuySimulatorProps) {
  const [amt, setAmt] = useState('')

  const ethAmt = parseFloat(amt) || 0
  const hasData = pools.micro && pools.mid && pools.mega

  const simulate = (pool: PoolState) => {
    const req = pool.entryReqEth
    let entries = 1
    if (ethAmt >= 2 * req) entries = 3
    else if (ethAmt >= req) entries = 2

    const newParts = pool.participants + 1
    const worstOdds = entries / (newParts * 3 - 3 + entries)
    const bestOdds = entries / (newParts - 1 + entries)

    return { entries, worstOdds, bestOdds, potential: pool.balanceEth }
  }

  return (
    <div>
      <div className="text-[9px] font-extrabold uppercase tracking-[2px] text-text-ghost font-mono mb-2 flex items-center gap-1">
        Buy Simulator <DataTag source="estimate" label="fresh cycle" />
      </div>
      <div className="flex gap-1 mb-2">
        <input
          type="number"
          value={amt}
          onChange={e => setAmt(e.target.value)}
          placeholder="ETH"
          step="0.001"
          min="0"
          className="flex-1 bg-pit text-text-primary font-mono text-xs px-2 py-1.5 rounded-sm outline-none placeholder:text-text-ghost focus:ring-1 focus:ring-micro/30"
        />
        <button
          onClick={() => setAmt('0.01')}
          className="text-[9px] font-mono text-text-ghost hover:text-micro transition-colors px-1.5 cursor-pointer"
        >
          0.01
        </button>
        <button
          onClick={() => setAmt('0.05')}
          className="text-[9px] font-mono text-text-ghost hover:text-micro transition-colors px-1.5 cursor-pointer"
        >
          0.05
        </button>
      </div>

      {ethAmt > 0 && hasData ? (
        <div className="space-y-1">
          {([
            { key: 'micro' as const, name: 'Mi', pool: pools.micro!, color: 'text-micro' },
            { key: 'mid' as const, name: 'Md', pool: pools.mid!, color: 'text-mid' },
            { key: 'mega' as const, name: 'Mg', pool: pools.mega!, color: 'text-mega' },
          ]).map(p => {
            const sim = simulate(p.pool)
            return (
              <div key={p.key} className="flex items-center gap-2 text-[10px] font-mono">
                <span className={cn('font-bold w-5', p.color)}>{p.name}</span>
                <span className="text-text-primary">{sim.entries}x</span>
                <span className="text-text-ghost">{(sim.worstOdds * 100).toFixed(1)}-{(sim.bestOdds * 100).toFixed(1)}%</span>
                <span className="text-ok ml-auto">+{sim.potential.toFixed(4)}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-[10px] text-text-ghost font-mono">Enter ETH to project entries</div>
      )}
    </div>
  )
}
