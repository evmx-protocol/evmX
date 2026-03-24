import { useState, useCallback } from 'react'
import { ethers } from 'ethers'
import type { PoolState } from '@/lib/types'

type ExecutionState = 'idle' | 'preflight' | 'sending' | 'confirming' | 'success' | 'error'

interface UseExecutionOptions {
  getContract: () => ethers.Contract | null
  isConnected: boolean
  pools: { micro: PoolState | null; mid: PoolState | null; mega: PoolState | null }
  onSuccess?: () => void
}

const REVERT_SELECTORS: Record<string, string> = {
  '0x1e4ec46b': 'NoCycleDue — no pool is ready to trigger',
  '0x9e87fac8': 'InAllocation — allocation already in progress',
  '0x82b42900': 'Unauthorized',
  '0x1f2a2005': 'SameBlockTrade',
}

function parseRevertReason(e: unknown): string | null {
  if (!e || typeof e !== 'object') return 'Unknown error'
  const err = e as { code?: number | string; reason?: string; shortMessage?: string; data?: string; message?: string }
  if (err.code === 4001 || err.code === 'ACTION_REJECTED') return null
  if (err.data && typeof err.data === 'string' && err.data.length >= 10) {
    const sel = err.data.slice(0, 10)
    if (REVERT_SELECTORS[sel]) return REVERT_SELECTORS[sel]
  }
  if (err.reason) return err.reason
  if (err.shortMessage) return err.shortMessage
  if (err.message?.includes('revert')) return err.message.split('revert')[1]?.trim().slice(0, 80) ?? 'Reverted'
  return err.message?.slice(0, 80) ?? 'Transaction failed'
}

export function useExecution({ getContract, isConnected, pools, onSuccess }: UseExecutionOptions) {
  const [state, setState] = useState<ExecutionState>('idle')
  const [error, setError] = useState<string | null>(null)

  const canExecute = isConnected && (pools.micro?.isReady || pools.mid?.isReady || pools.mega?.isReady)

  const readyPools: string[] = []
  if (pools.micro?.isReady) readyPools.push('Micro')
  if (pools.mid?.isReady) readyPools.push('Mid')
  if (pools.mega?.isReady) readyPools.push('Mega')

  const execute = useCallback(async () => {
    const c = getContract()
    if (!c || !canExecute) return

    setState('preflight')
    setError(null)

    try {
      // staticCall preflight — simulate before spending gas
      await c.runAutonomousCycle.staticCall()

      setState('sending')
      const tx = await c.runAutonomousCycle()

      setState('confirming')
      await tx.wait()

      setState('success')
      onSuccess?.()
      setTimeout(() => setState('idle'), 3000)
    } catch (e) {
      const reason = parseRevertReason(e)
      if (reason === null) {
        setState('idle') // user cancelled
      } else {
        setState('error')
        setError(reason)
        setTimeout(() => { setState('idle'); setError(null) }, 5000)
      }
    }
  }, [getContract, canExecute, onSuccess])

  return { state, error, canExecute, readyPools, execute }
}
