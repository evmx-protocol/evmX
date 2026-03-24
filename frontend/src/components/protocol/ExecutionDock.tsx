import { cn } from '@/lib/utils'
import { Surface } from '@/components/system/Surface'
import { DataTag } from '@/components/system/DataTag'
import type { VrfStatus } from '@/lib/types'
import { CONTRACTS, chain } from '@/config'
import { fmtAddr } from '@/lib/utils'

type ExecutionState = 'idle' | 'preflight' | 'sending' | 'confirming' | 'success' | 'error'

interface ExecutionDockProps {
  executionState: ExecutionState
  error: string | null
  canExecute: boolean
  readyPools: string[]
  execute: () => void
  isConnected: boolean
  vrfStatus: VrfStatus | null
  nearestTrigger: string
  nearestPool: string
}

export function ExecutionDock({
  executionState, error, canExecute, readyPools, execute,
  isConnected, vrfStatus, nearestTrigger, nearestPool,
}: ExecutionDockProps) {
  const isProcessing = executionState !== 'idle' && executionState !== 'success' && executionState !== 'error'

  const blockingReason = !isConnected
    ? 'Connect wallet to execute'
    : !canExecute
      ? 'No pools ready — accumulating'
      : null

  const vrfPending = vrfStatus && (vrfStatus.microPending || vrfStatus.midPending || vrfStatus.megaPending)
  const vrfPools = vrfStatus
    ? [vrfStatus.microPending && 'Micro', vrfStatus.midPending && 'Mid', vrfStatus.megaPending && 'Mega'].filter(Boolean).join(', ')
    : null

  return (
    <Surface depth="dock" className="col-span-full mt-6 rounded-lg overflow-hidden shadow-[0_-6px_40px_rgba(0,0,0,.5)]">
      {/* Top accent — execution-specific color based on readiness */}
      <div className={cn(
        'h-[2px]',
        canExecute ? 'bg-gradient-to-r from-mid via-ok to-mid' : 'bg-gradient-to-r from-text-ghost/30 via-text-ghost/50 to-text-ghost/30',
      )} />

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-0 max-[900px]:grid-cols-1 p-0">

        {/* LEFT: Readiness */}
        <div className="p-6 max-[900px]:pb-3">
          <div className="text-[9px] font-extrabold uppercase tracking-[3px] text-text-ghost font-mono mb-3">Readiness</div>

          {blockingReason ? (
            <div className="text-sm text-text-ghost font-mono">{blockingReason}</div>
          ) : (
            <>
              <div className="flex items-baseline gap-2 mb-1">
                <span className={cn(
                  'font-mono text-2xl font-extrabold',
                  nearestTrigger === 'READY NOW' ? 'text-ok' : 'text-text-primary',
                )}>
                  {nearestTrigger}
                </span>
                <DataTag source="estimate" label="linear est." />
              </div>
              <div className="text-xs text-text-dim font-mono">{nearestPool}</div>
              {readyPools.length > 0 && (
                <div className="flex gap-1.5 mt-2">
                  {readyPools.map(p => (
                    <span key={p} className={cn(
                      'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm',
                      p === 'Micro' ? 'bg-micro/10 text-micro' :
                      p === 'Mid' ? 'bg-mid/10 text-mid' :
                      'bg-mega/10 text-mega',
                    )}>{p}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* CENTER: The Button */}
        <div className="px-8 py-6 flex flex-col items-center max-[900px]:px-6 max-[900px]:py-4">
          <button
            onClick={execute}
            disabled={!canExecute || isProcessing}
            className={cn(
              'font-mono font-extrabold uppercase tracking-wider transition-all min-w-[240px]',
              'px-8 py-4 rounded-md text-base',
              canExecute && executionState === 'idle'
                ? 'bg-mid/15 text-mid shadow-[0_0_20px_rgba(48,192,168,.1)] hover:bg-mid/25 hover:shadow-[0_0_30px_rgba(48,192,168,.15)] hover:text-text-primary cursor-pointer'
                : executionState === 'success'
                  ? 'bg-ok/15 text-ok shadow-[0_0_20px_rgba(60,224,136,.1)]'
                  : executionState === 'error'
                    ? 'bg-danger/15 text-danger'
                    : isProcessing
                      ? 'bg-mid/8 text-mid/60 animate-pulse cursor-wait'
                      : 'bg-raised/50 text-text-ghost cursor-not-allowed',
            )}
          >
            {executionState === 'idle' && '⚡ Execute Cycle'}
            {executionState === 'preflight' && 'Simulating...'}
            {executionState === 'sending' && 'Sending TX...'}
            {executionState === 'confirming' && 'Confirming...'}
            {executionState === 'success' && '✓ Executed'}
            {executionState === 'error' && '✗ Failed'}
          </button>
          {error && <div className="text-[11px] text-danger mt-2 font-mono max-w-[240px] text-center">{error}</div>}
          {executionState === 'preflight' && (
            <div className="text-[10px] text-text-ghost mt-1 font-mono">staticCall preflight</div>
          )}
        </div>

        {/* RIGHT: System status */}
        <div className="p-6 max-[900px]:pt-3">
          <div className="text-[9px] font-extrabold uppercase tracking-[3px] text-text-ghost font-mono mb-3">System</div>
          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-text-ghost">VRF</span>
              <span className={vrfPending ? 'text-warn' : 'text-ok'}>
                {vrfPending ? `${vrfPools} pending` : vrfStatus ? 'Idle' : '--'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-ghost">Buffer</span>
              <span className="text-text-dim">{vrfStatus ? `${vrfStatus.bufferEth.toFixed(4)} ETH` : '--'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-ghost">CRE</span>
              <span className="text-text-ghost">Configured <DataTag source="static-config" /></span>
            </div>
          </div>
          <div className="mt-3 pt-2">
            <a
              href={`${chain.scan}/address/${CONTRACTS.evmX}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-mid hover:text-text-primary transition-colors"
            >
              {fmtAddr(CONTRACTS.evmX)}
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(CONTRACTS.evmX).catch(() => {})}
              className="ml-2 text-[10px] text-text-ghost hover:text-text-primary transition-colors cursor-pointer font-mono"
            >
              copy
            </button>
          </div>
        </div>
      </div>
    </Surface>
  )
}
