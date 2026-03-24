import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { CONTRACTS } from '@/config'
import { LP_ABI } from '@/lib/abi'

interface ProtocolMeta {
  owner: string | null
  isRenounced: boolean
  totalPayouts: number
  swapBuffer: number
  swapBufferPct: number
  lpStatus: 'burned' | 'partial' | 'not-burned' | 'unknown'
  lpBurnPct: number
  pairAddress: string | null
}

interface UseProtocolMetaOptions {
  getContract: () => ethers.Contract | null
}

export function useProtocolMeta({ getContract }: UseProtocolMetaOptions) {
  const [meta, setMeta] = useState<ProtocolMeta>({
    owner: null, isRenounced: false, totalPayouts: 0,
    swapBuffer: 0, swapBufferPct: 0,
    lpStatus: 'unknown', lpBurnPct: 0, pairAddress: null,
  })

  const refresh = useCallback(async () => {
    const c = getContract()
    if (!c) return

    // Owner + totalPayouts + swap buffer
    try {
      const [owner, payouts, contractBal] = await Promise.all([
        c.owner(),
        c.totalPayouts(),
        c.balanceOf(CONTRACTS.evmX),
      ])
      const ownerAddr = owner as string
      const isRenounced = ownerAddr === '0x0000000000000000000000000000000000000000'
      const tokens = Number(ethers.formatEther(contractBal))
      const threshold = 120_000

      setMeta(prev => ({
        ...prev,
        owner: ownerAddr,
        isRenounced,
        totalPayouts: Number(ethers.formatEther(payouts)),
        swapBuffer: tokens,
        swapBufferPct: Math.min(tokens / threshold * 100, 100),
      }))
    } catch (e) {
      console.warn('Protocol meta error:', e)
    }

    // LP verification (separate try — uses external contracts)
    try {
      const prov = (c.runner as ethers.Signer)?.provider || c.runner as ethers.Provider
      const factory = new ethers.Contract(CONTRACTS.uniswapFactory, LP_ABI, prov)
      const pairAddr = await factory.getPair(CONTRACTS.evmX, CONTRACTS.weth)

      if (!pairAddr || pairAddr === '0x0000000000000000000000000000000000000000') {
        setMeta(prev => ({ ...prev, lpStatus: 'unknown', lpBurnPct: 0 }))
        return
      }

      const pair = new ethers.Contract(pairAddr, LP_ABI, prov)
      const [burned, total] = await Promise.all([
        pair.balanceOf(CONTRACTS.dead),
        pair.totalSupply(),
      ])
      const burnedN = Number(ethers.formatEther(burned))
      const totalN = Number(ethers.formatEther(total))
      const pct = totalN > 0 ? (burnedN / totalN * 100) : 0

      setMeta(prev => ({
        ...prev,
        lpBurnPct: pct,
        lpStatus: pct > 99 ? 'burned' : pct > 0 ? 'partial' : 'not-burned',
        pairAddress: pairAddr,
      }))
    } catch {
      setMeta(prev => ({ ...prev, lpStatus: 'unknown', lpBurnPct: 0 }))
    }
  }, [getContract])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { meta, refresh }
}
