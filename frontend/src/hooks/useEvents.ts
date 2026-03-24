import { useState, useEffect, useCallback, useRef } from 'react'
import { ethers } from 'ethers'
import type { WinnerEvent } from '@/lib/types'

interface UseEventsOptions {
  getContract: () => ethers.Contract | null
  signerContract: ethers.Contract | null
  onPoolAllocated?: (poolType: number, recipient: string, amount: number) => void
  onAllocationRequested?: (poolType: number) => void
}

export function useEvents({ getContract, signerContract, onPoolAllocated, onAllocationRequested }: UseEventsOptions) {
  const [winners, setWinners] = useState<WinnerEvent[]>([])
  const [isLoadingWinners, setIsLoadingWinners] = useState(false)
  const subscribedRef = useRef<ethers.Contract | null>(null)
  const winnersLoadedRef = useRef(false)

  // Event subscriptions — only on signer-connected contract (BrowserProvider supports filters)
  useEffect(() => {
    if (!signerContract) return
    if (subscribedRef.current === signerContract) return

    // Teardown old listeners
    if (subscribedRef.current) {
      try {
        subscribedRef.current.removeAllListeners('PoolAllocated')
        subscribedRef.current.removeAllListeners('AllocationRequested')
      } catch {}
    }

    try {
      signerContract.on('PoolAllocated', (poolType: bigint, recipient: string, amount: bigint) => {
        const amt = Number(ethers.formatEther(amount))
        onPoolAllocated?.(Number(poolType), recipient, amt)
        winnersLoadedRef.current = false
        loadWinners()
      })
      signerContract.on('AllocationRequested', (_reqId: bigint, poolType: bigint) => {
        onAllocationRequested?.(Number(poolType))
      })
      subscribedRef.current = signerContract
    } catch {
      subscribedRef.current = null
    }

    return () => {
      if (subscribedRef.current) {
        try {
          subscribedRef.current.removeAllListeners('PoolAllocated')
          subscribedRef.current.removeAllListeners('AllocationRequested')
        } catch {}
        subscribedRef.current = null
      }
    }
  }, [signerContract, onPoolAllocated, onAllocationRequested])

  // Winner history via queryFilter — scans backwards from current block
  const loadWinners = useCallback(async () => {
    const c = getContract()
    if (!c || isLoadingWinners) return
    if (winnersLoadedRef.current) return

    setIsLoadingWinners(true)
    try {
      const prov = (c.runner as ethers.Signer)?.provider || c.runner as ethers.Provider
      const current = await prov.getBlockNumber()
      console.log('[Winners] Scanning from block', current)

      // Try large range first (most RPCs support this on testnets)
      const found: WinnerEvent[] = []

      // Strategy: try progressively smaller chunks if large ones fail
      const ranges = [
        // First try: last ~500k blocks in one shot
        { from: Math.max(0, current - 500000), to: current },
        // Fallback: smaller chunks
        ...(Array.from({ length: 20 }, (_, i) => ({
          from: Math.max(0, current - (i + 1) * 5000),
          to: current - i * 5000,
        }))),
      ]

      let success = false
      for (const range of ranges) {
        if (success || found.length >= 20) break
        if (range.to <= 0) break
        try {
          const evs = await c.queryFilter(c.filters.PoolAllocated(), range.from, range.to)
          if (evs.length > 0) {
            console.log(`[Winners] Found ${evs.length} events in blocks ${range.from}-${range.to}`)
            for (const ev of evs) {
              const args = (ev as ethers.EventLog).args
              if (!args) continue
              found.push({
                poolType: Number(args[0]),
                recipient: String(args[1]),
                amount: Number(ethers.formatEther(args[2])),
                cycleId: Number(args[3]),
                blockNumber: ev.blockNumber,
                txHash: ev.transactionHash,
              })
            }
            // If the large range worked, no need for small chunks
            if (range.to - range.from > 50000) success = true
          }
        } catch (err) {
          console.warn(`[Winners] queryFilter failed for blocks ${range.from}-${range.to}:`, err)
          // If the large range failed, the smaller chunks will try next
          continue
        }
      }

      // Sort by block number descending (newest first), take latest 20
      found.sort((a, b) => b.blockNumber - a.blockNumber)
      const unique = found.filter((w, i, arr) => arr.findIndex(x => x.blockNumber === w.blockNumber && x.recipient === w.recipient) === i)
      console.log(`[Winners] Total unique: ${unique.length}`)
      setWinners(unique.slice(0, 20))
      winnersLoadedRef.current = true
    } catch (e) {
      console.warn('[Winners] Load error:', e)
    } finally {
      setIsLoadingWinners(false)
    }
  }, [getContract, isLoadingWinners])

  // Initial load + periodic refresh
  useEffect(() => {
    loadWinners()
    const id = setInterval(() => {
      winnersLoadedRef.current = false
      loadWinners()
    }, 30000)
    return () => clearInterval(id)
  }, [loadWinners])

  return { winners, isLoadingWinners, loadWinners }
}
