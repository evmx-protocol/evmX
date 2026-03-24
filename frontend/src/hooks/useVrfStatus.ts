import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import type { VrfStatus } from '@/lib/types'

interface UseVrfStatusOptions {
  getContract: () => ethers.Contract | null
  interval?: number
}

export function useVrfStatus({ getContract, interval = 15000 }: UseVrfStatusOptions) {
  const [status, setStatus] = useState<VrfStatus | null>(null)

  const refresh = useCallback(async () => {
    const c = getContract()
    if (!c) return
    try {
      const [micro, mid, mega, buffer] = await Promise.all([
        c.microPoolPendingRequestId(),
        c.midPoolPendingRequestId(),
        c.megaPoolPendingRequestId(),
        c.pendingVrfEth(),
      ])
      setStatus({
        microPending: Number(micro) > 0,
        midPending: Number(mid) > 0,
        megaPending: Number(mega) > 0,
        bufferEth: Number(ethers.formatEther(buffer)),
      })
    } catch (e) {
      console.warn('VRF status error:', e)
    }
  }, [getContract])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, interval)
    return () => clearInterval(id)
  }, [refresh, interval])

  return { status, refresh }
}
