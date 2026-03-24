import { useState, useEffect, useCallback, useRef } from 'react'
import { ethers } from 'ethers'
import type { PoolState } from '@/lib/types'

interface UsePoolDataOptions {
  getContract: () => ethers.Contract | null
  interval?: number
}

function parsePool(data: ethers.Result, poolIdx: number): PoolState {
  const balance = data[0] as bigint
  const entryReq = data[1] as bigint
  const threshold = data[2] as bigint
  const timeUntilExpiry = data[3] as bigint
  const cycleId = data[4] as bigint
  const participantCount = data[5] as bigint

  const balanceEth = Number(ethers.formatEther(balance))
  const entryReqEth = Number(ethers.formatEther(entryReq))
  const thresholdEth = Number(ethers.formatEther(threshold))
  const timeLeft = Number(timeUntilExpiry)
  const participants = Number(participantCount)

  const fillPct = poolIdx !== 2 && thresholdEth > 0
    ? Math.min(balanceEth / thresholdEth * 100, 100)
    : poolIdx === 2
      ? Math.min(((7 * 86400 - timeLeft) / (7 * 86400)) * 100, 100)
      : 0

  const thresholdReached = poolIdx !== 2 && thresholdEth > 0 && balanceEth >= thresholdEth
  const timerExpired = timeLeft <= 0
  const isReady = (timerExpired || thresholdReached) && participants > 0 && balanceEth > 0
  const isNearThreshold = poolIdx !== 2 && thresholdEth > 0 && balanceEth / thresholdEth >= 0.8

  return {
    raw: { balance, entryRequirement: entryReq, threshold, timeUntilExpiry, cycleId, participantCount },
    balanceEth, entryReqEth, thresholdEth, timeLeft,
    cycleId: Number(cycleId), participants, fillPct,
    isReady, isNearThreshold,
  }
}

export function usePoolData({ getContract, interval = 15000 }: UsePoolDataOptions) {
  const [pools, setPools] = useState<{ micro: PoolState | null; mid: PoolState | null; mega: PoolState | null }>({
    micro: null, mid: null, mega: null,
  })
  const [lastFetch, setLastFetch] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const timerOffsetsRef = useRef({ micro: 0, mid: 0, mega: 0 })
  const lastFetchRef = useRef(0)

  const refresh = useCallback(async () => {
    const c = getContract()
    if (!c) return
    if (document.hidden && lastFetchRef.current > 0) return
    setIsLoading(true)
    try {
      const [micro, mid, mega] = await Promise.all([
        c.getPoolInfo(0), c.getPoolInfo(1), c.getPoolInfo(2),
      ])
      const now = Date.now()
      const parsed = {
        micro: parsePool(micro, 0),
        mid: parsePool(mid, 1),
        mega: parsePool(mega, 2),
      }
      timerOffsetsRef.current = {
        micro: parsed.micro.timeLeft,
        mid: parsed.mid.timeLeft,
        mega: parsed.mega.timeLeft,
      }
      setPools(parsed)
      lastFetchRef.current = now
      setLastFetch(now)
    } catch (e) {
      console.warn('Pool fetch error:', e)
    } finally {
      setIsLoading(false)
    }
  }, [getContract])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, interval)
    return () => clearInterval(id)
  }, [refresh, interval])

  const totalEth = (pools.micro?.balanceEth ?? 0) + (pools.mid?.balanceEth ?? 0) + (pools.mega?.balanceEth ?? 0)
  const anyReady = pools.micro?.isReady || pools.mid?.isReady || pools.mega?.isReady

  return { pools, totalEth, anyReady, lastFetch, isLoading, refresh, timerOffsets: timerOffsetsRef.current }
}
