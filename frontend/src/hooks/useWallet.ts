import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import type { UserStatus } from '@/lib/types'

interface UseWalletOptions {
  getContract: () => ethers.Contract | null
  userAddr: string | null
  interval?: number
}

export function useWallet({ getContract, userAddr, interval = 15000 }: UseWalletOptions) {
  const [status, setStatus] = useState<UserStatus | null>(null)

  const refresh = useCallback(async () => {
    const c = getContract()
    if (!c || !userAddr) return
    try {
      const [st, bal] = await Promise.all([
        c.getUserStatus(userAddr),
        c.balanceOf(userAddr),
      ])
      setStatus({
        microEligible: st[0],
        microEntries: Number(st[1]),
        midEligible: st[2],
        midEntries: Number(st[3]),
        megaEligible: st[4],
        megaEntries: Number(st[5]),
        tokenBalance: bal,
        tokenBalanceFormatted: Number(ethers.formatEther(bal)),
      })
    } catch (e) {
      console.warn('User status error:', e)
    }
  }, [getContract, userAddr])

  useEffect(() => {
    if (!userAddr) { setStatus(null); return }
    refresh()
    const id = setInterval(refresh, interval)
    return () => clearInterval(id)
  }, [userAddr, refresh, interval])

  return { status, refresh }
}
