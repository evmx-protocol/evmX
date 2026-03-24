import { useState, useEffect, useCallback, useRef } from 'react'
import { ethers } from 'ethers'
import { CONTRACTS } from '@/config'
import { PRICE_ABI } from '@/lib/abi'

/**
 * Price feed status — explicit states, never fake certainty.
 *
 * States:
 * - 'live'                → Chainlink feed returned valid data
 * - 'stale'               → Feed returned data but updatedAt is old (>1 hour)
 * - 'testnet-unavailable'  → Feed contract exists but returns error (BAD_DATA/CALL_EXCEPTION)
 * - 'no-feed'             → No feed contract at this address
 * - 'rpc-error'           → Provider can't reach the feed (network issue)
 * - 'loading'             → Initial state, no data yet
 */
export type PriceFeedStatus = 'live' | 'stale' | 'testnet-unavailable' | 'no-feed' | 'rpc-error' | 'loading'

export interface PriceFeedState {
  price: number
  status: PriceFeedStatus
  updatedAt: number          // timestamp of last successful read (0 if never)
  roundTimestamp: number     // on-chain updatedAt from latestRoundData (0 if unavailable)
  failCount: number
}

interface UsePriceFeedOptions {
  getContract: () => ethers.Contract | null
  interval?: number
  staleThresholdSecs?: number  // how old the round can be before "stale" (default 3600 = 1h)
}

export function usePriceFeed({
  getContract,
  interval = 60000,
  staleThresholdSecs = 3600,
}: UsePriceFeedOptions): PriceFeedState {
  const [state, setState] = useState<PriceFeedState>({
    price: 0,
    status: 'loading',
    updatedAt: 0,
    roundTimestamp: 0,
    failCount: 0,
  })
  const failCountRef = useRef(0)
  const pausedRef = useRef(false)

  const refresh = useCallback(async () => {
    if (pausedRef.current) return
    const c = getContract()
    if (!c) return

    try {
      const prov = (c.runner as ethers.Signer)?.provider || c.runner as ethers.Provider
      const feed = new ethers.Contract(CONTRACTS.priceFeed, PRICE_ABI, prov)
      const [roundData, decimals] = await Promise.all([
        feed.latestRoundData(),
        feed.decimals(),
      ])

      const answer = Number(roundData[1])
      const roundUpdatedAt = Number(roundData[3])
      const price = answer / Math.pow(10, Number(decimals))
      const now = Math.floor(Date.now() / 1000)
      const age = now - roundUpdatedAt

      failCountRef.current = 0

      if (answer <= 0) {
        // Feed exists but returned 0 — bad data
        setState({
          price: 0,
          status: 'testnet-unavailable',
          updatedAt: Date.now(),
          roundTimestamp: roundUpdatedAt,
          failCount: 0,
        })
      } else if (age > staleThresholdSecs) {
        // Feed returned data but it's old
        setState({
          price,
          status: 'stale',
          updatedAt: Date.now(),
          roundTimestamp: roundUpdatedAt,
          failCount: 0,
        })
      } else {
        // Fresh valid data
        setState({
          price,
          status: 'live',
          updatedAt: Date.now(),
          roundTimestamp: roundUpdatedAt,
          failCount: 0,
        })
      }
    } catch (e: unknown) {
      failCountRef.current++
      const err = e as { code?: string }
      const code = err?.code ?? ''

      // Determine failure type
      let status: PriceFeedStatus
      if (code === 'BAD_DATA' || code === 'CALL_EXCEPTION' || code === 'INVALID_ARGUMENT') {
        status = 'testnet-unavailable'
      } else if (code === 'NETWORK_ERROR' || code === 'SERVER_ERROR' || code === 'TIMEOUT') {
        status = 'rpc-error'
      } else {
        status = 'no-feed'
      }

      // After 5 consecutive failures, pause for 5 minutes then retry
      if (failCountRef.current >= 5 && !pausedRef.current) {
        pausedRef.current = true
        setTimeout(() => {
          pausedRef.current = false
          failCountRef.current = 0
        }, 300000)
      }

      setState(prev => ({
        ...prev,
        price: 0,
        status,
        failCount: failCountRef.current,
      }))
    }
  }, [getContract, staleThresholdSecs])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, interval)
    return () => clearInterval(id)
  }, [refresh, interval])

  return state
}
