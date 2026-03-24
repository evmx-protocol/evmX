import { PoolChamber } from './PoolChamber'
import type { PoolState } from '@/lib/types'

interface PoolStageProps {
  pools: { micro: PoolState | null; mid: PoolState | null; mega: PoolState | null }
  usdPrice: number
}

export function PoolStage({ pools, usdPrice }: PoolStageProps) {
  return (
    <div className="space-y-3">
      <PoolChamber pool="micro" data={pools.micro} usdPrice={usdPrice} />
      <PoolChamber pool="mid" data={pools.mid} usdPrice={usdPrice} />
      <PoolChamber pool="mega" data={pools.mega} usdPrice={usdPrice} />
    </div>
  )
}
