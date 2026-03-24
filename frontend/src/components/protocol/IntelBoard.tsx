import { IntelStrip } from '@/components/system/IntelStrip'
import { DataTag } from '@/components/system/DataTag'
import type { PoolState } from '@/lib/types'
import { fmtTimer } from '@/lib/utils'

interface IntelBoardProps {
  pools: { micro: PoolState | null; mid: PoolState | null; mega: PoolState | null }
  elapsed: number // seconds since last fetch, for timer interpolation
}

export function IntelBoard({ pools, elapsed }: IntelBoardProps) {
  const micro = pools.micro
  const mid = pools.mid
  const mega = pools.mega

  if (!micro || !mid || !mega) return null

  // Smart Ladder state
  const microThr = micro.thresholdEth
  const midThr = mid.thresholdEth
  const microFill = microThr > 0 ? (micro.balanceEth / microThr * 100).toFixed(0) : '--'
  const midFill = midThr > 0 ? (mid.balanceEth / midThr * 100).toFixed(0) : '--'

  // Fill rates (linear estimate from elapsed time in cycle)
  const microElapsed = 7200 - micro.timeLeft
  const midElapsed = 21600 - mid.timeLeft
  const microRate = microElapsed > 0 ? (micro.balanceEth / microElapsed * 3600) : 0
  const midRate = midElapsed > 0 ? (mid.balanceEth / midElapsed * 3600) : 0

  // Mega progress
  const megaDay = Math.min((604800 - mega.timeLeft) / 86400, 7)

  // Return ratios
  const microRatio = micro.entryReqEth > 0 ? micro.balanceEth / micro.entryReqEth : 0
  const midRatio = mid.entryReqEth > 0 ? mid.balanceEth / mid.entryReqEth : 0
  const megaRatio = mega.entryReqEth > 0 ? mega.balanceEth / mega.entryReqEth : 0

  // Simplified EV (balance/participants - entryCost, assumes 1 entry each)
  const evMicro = micro.participants > 0 && micro.entryReqEth > 0 ? micro.balanceEth / micro.participants - micro.entryReqEth : null
  const evMid = mid.participants > 0 && mid.entryReqEth > 0 ? mid.balanceEth / mid.participants - mid.entryReqEth : null
  const evMega = mega.participants > 0 && mega.entryReqEth > 0 ? mega.balanceEth / mega.participants - mega.entryReqEth : null

  // Live-interpolated timers
  const microLive = Math.max(0, micro.timeLeft - elapsed)
  const midLive = Math.max(0, mid.timeLeft - elapsed)
  const megaLive = Math.max(0, mega.timeLeft - elapsed)

  // Next-cycle ladder prediction
  const microLikelyUp = micro.balanceEth >= microThr || (microRate > 0 && microThr > 0 && (microThr - micro.balanceEth) / microRate < micro.timeLeft)
  const midLikelyUp = mid.balanceEth >= midThr || (midRate > 0 && midThr > 0 && (midThr - mid.balanceEth) / midRate < mid.timeLeft)

  return (
    <section className="mt-3 pt-3">
      <div className="text-[9px] font-extrabold uppercase tracking-[3px] text-text-ghost font-mono mb-1 flex items-center gap-2">
        Intelligence
        <DataTag source="on-chain" label="chain" />
        <DataTag source="estimate" label="est" />
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-x-6 gap-y-0 max-[900px]:grid-cols-1">
        {/* Left column: Protocol metrics */}
        <IntelStrip
          title="Protocol State"
          items={[
            { label: 'Micro Ladder', value: `${microThr.toFixed(3)} ETH (${microFill}%)`, source: 'on-chain' },
            { label: 'Mid Ladder', value: `${midThr.toFixed(3)} ETH (${midFill}%)`, source: 'on-chain' },
            { label: 'Micro Rate', value: microRate > 0 ? `${microRate.toFixed(4)} ETH/h` : '--', source: 'estimate', sourceLabel: 'linear' },
            { label: 'Mid Rate', value: midRate > 0 ? `${midRate.toFixed(4)} ETH/h` : '--', source: 'estimate', sourceLabel: 'linear' },
            { label: 'Mega Progress', value: `Day ${megaDay.toFixed(1)} · ${mega.balanceEth.toFixed(4)} ETH`, source: 'on-chain' },
          ]}
        />

        {/* Right column: Return metrics */}
        <IntelStrip
          title="Return Analysis"
          items={[
            { label: 'Return Ratio', value: `Mi:${microRatio.toFixed(0)}× Md:${midRatio.toFixed(0)}× Mg:${megaRatio.toFixed(0)}×`, source: 'derived' },
            { label: 'EV (Micro)', value: evMicro !== null ? `${evMicro >= 0 ? '+' : ''}${evMicro.toFixed(4)}` : 'No players', source: 'estimate', sourceLabel: '1-entry', color: evMicro !== null ? (evMicro >= 0 ? 'text-ok' : 'text-danger') : undefined },
            { label: 'EV (Mid)', value: evMid !== null ? `${evMid >= 0 ? '+' : ''}${evMid.toFixed(4)}` : 'No players', source: 'estimate', sourceLabel: '1-entry', color: evMid !== null ? (evMid >= 0 ? 'text-ok' : 'text-danger') : undefined },
            { label: 'EV (Mega)', value: evMega !== null ? `${evMega >= 0 ? '+' : ''}${evMega.toFixed(4)}` : 'No players', source: 'estimate', sourceLabel: '1-entry', color: evMega !== null ? (evMega >= 0 ? 'text-ok' : 'text-danger') : undefined },
            { label: 'Entry Formula', value: '0.7% of pool balance', source: 'static-config' },
          ]}
        />
      </div>

      {/* Live timers strip */}
      <div className="flex gap-4 mt-2 py-2 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-micro font-bold text-[9px]">Mi</span>
          <span className={microLive <= 0 ? 'text-ok font-bold' : microLive < 300 ? 'text-danger animate-pulse' : 'text-text-primary'}>
            {fmtTimer(microLive)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-mid font-bold text-[9px]">Md</span>
          <span className={midLive <= 0 ? 'text-ok font-bold' : midLive < 300 ? 'text-danger animate-pulse' : 'text-text-primary'}>
            {fmtTimer(midLive)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-mega font-bold text-[9px]">Mg</span>
          <span className={megaLive <= 0 ? 'text-ok font-bold' : 'text-text-primary'}>
            {fmtTimer(megaLive)}
          </span>
        </div>
        <DataTag source="on-chain" label="live countdown" />
      </div>

      {/* Ladder forecast */}
      <div className="flex gap-3 mt-1 text-[10px] font-mono">
        <span className="text-text-ghost">Next cycle:</span>
        <span className={microLikelyUp ? 'text-warn' : 'text-ok'}>
          Mi {microLikelyUp ? '▲ 2×' : '▼ ÷2'}
        </span>
        <span className={midLikelyUp ? 'text-warn' : 'text-ok'}>
          Md {midLikelyUp ? '▲ 2×' : '▼ ÷2'}
        </span>
        <span className="text-text-ghost">Mg: fixed 7d</span>
        <DataTag source="estimate" label="ladder est." />
      </div>
    </section>
  )
}
