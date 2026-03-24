import { useState, useEffect, useCallback, useRef } from 'react'
import { ethers } from 'ethers'

export interface Trade {
  type: 'buy' | 'sell'
  address: string
  amountTokens: number
  txHash: string
  blockNumber: number
  timestamp: number // estimated from block
}

interface TradeStats {
  buyCount: number
  sellCount: number
  buyVolume: number   // tokens
  sellVolume: number  // tokens
  ratio: number       // buy/sell ratio (>1 = more buys)
  pressure: 'bullish' | 'bearish' | 'neutral'
  largestBuy: number
  largestSell: number
}

export interface HolderStats {
  uniqueBuyers: number
  uniqueSellers: number
  netBuyers: number       // buyers who haven't sold
  netSellers: number      // sellers who haven't bought
  repeatBuyers: number    // bought more than once
  whaleCount: number      // bought > 1M tokens
  topHolders: { address: string; netTokens: number; buys: number; sells: number }[]
  buyerDominance: number  // % of unique addresses that are net buyers
}

interface UseTradeHistoryOptions {
  getContract: () => ethers.Contract | null
  pairAddress: string | null
}

export function useTradeHistory({ getContract, pairAddress }: UseTradeHistoryOptions) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [holderStats, setHolderStats] = useState<HolderStats>({
    uniqueBuyers: 0, uniqueSellers: 0, netBuyers: 0, netSellers: 0,
    repeatBuyers: 0, whaleCount: 0, topHolders: [], buyerDominance: 50,
  })
  const [stats, setStats] = useState<TradeStats>({
    buyCount: 0, sellCount: 0, buyVolume: 0, sellVolume: 0,
    ratio: 1, pressure: 'neutral', largestBuy: 0, largestSell: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const loadedRef = useRef(false)
  const subscribedRef = useRef<ethers.Contract | null>(null)

  // Calculate stats from trades
  const calcStats = useCallback((tradeList: Trade[]): TradeStats => {
    const buys = tradeList.filter(t => t.type === 'buy')
    const sells = tradeList.filter(t => t.type === 'sell')
    const buyVol = buys.reduce((s, t) => s + t.amountTokens, 0)
    const sellVol = sells.reduce((s, t) => s + t.amountTokens, 0)
    const ratio = sellVol > 0 ? buyVol / sellVol : buyVol > 0 ? 10 : 1
    return {
      buyCount: buys.length,
      sellCount: sells.length,
      buyVolume: buyVol,
      sellVolume: sellVol,
      ratio,
      pressure: ratio > 1.3 ? 'bullish' : ratio < 0.7 ? 'bearish' : 'neutral',
      largestBuy: buys.length > 0 ? Math.max(...buys.map(t => t.amountTokens)) : 0,
      largestSell: sells.length > 0 ? Math.max(...sells.map(t => t.amountTokens)) : 0,
    }
  }, [])

  // Calculate holder stats from trades
  const calcHolders = useCallback((tradeList: Trade[]): HolderStats => {
    const addressMap = new Map<string, { buys: number; sells: number; netTokens: number }>()

    for (const t of tradeList) {
      const addr = t.address.toLowerCase()
      const entry = addressMap.get(addr) || { buys: 0, sells: 0, netTokens: 0 }
      if (t.type === 'buy') {
        entry.buys++
        entry.netTokens += t.amountTokens
      } else {
        entry.sells++
        entry.netTokens -= t.amountTokens
      }
      addressMap.set(addr, entry)
    }

    const allAddrs = Array.from(addressMap.entries())
    const buyers = allAddrs.filter(([, v]) => v.buys > 0)
    const sellers = allAddrs.filter(([, v]) => v.sells > 0)
    const netBuyers = allAddrs.filter(([, v]) => v.netTokens > 0)
    const netSellers = allAddrs.filter(([, v]) => v.netTokens < 0)
    const repeatBuyers = buyers.filter(([, v]) => v.buys >= 2)
    const whales = allAddrs.filter(([, v]) => v.netTokens > 1000000)

    // Top holders by net tokens (sorted desc)
    const topHolders = allAddrs
      .map(([addr, v]) => ({ address: addr, netTokens: v.netTokens, buys: v.buys, sells: v.sells }))
      .sort((a, b) => b.netTokens - a.netTokens)
      .slice(0, 10)

    const totalUnique = allAddrs.length
    const buyerDominance = totalUnique > 0 ? (netBuyers.length / totalUnique) * 100 : 50

    return {
      uniqueBuyers: buyers.length,
      uniqueSellers: sellers.length,
      netBuyers: netBuyers.length,
      netSellers: netSellers.length,
      repeatBuyers: repeatBuyers.length,
      whaleCount: whales.length,
      topHolders,
      buyerDominance,
    }
  }, [])

  // Load recent Transfer events
  const loadTrades = useCallback(async () => {
    const c = getContract()
    if (!c || isLoading || !pairAddress) return
    if (loadedRef.current) return

    setIsLoading(true)
    try {
      const prov = (c.runner as ethers.Signer)?.provider || c.runner as ethers.Provider
      const current = await prov.getBlockNumber()
      const fromBlock = Math.max(0, current - 50000) // last ~50k blocks
      const pair = pairAddress.toLowerCase()

      console.log('[Trades] Scanning Transfer events from block', fromBlock)

      const found: Trade[] = []
      try {
        const filter = c.filters.Transfer()
        const evs = await c.queryFilter(filter, fromBlock, current)

        for (const ev of evs) {
          const args = (ev as ethers.EventLog).args
          if (!args) continue

          const from = String(args[0]).toLowerCase()
          const to = String(args[1]).toLowerCase()
          const value = Number(ethers.formatEther(args[2]))

          // Skip tiny transfers and internal transfers
          if (value < 100) continue

          let type: 'buy' | 'sell' | null = null
          let address = ''

          if (from === pair) {
            // Tokens coming FROM pair = BUY
            type = 'buy'
            address = String(args[1])
          } else if (to === pair) {
            // Tokens going TO pair = SELL
            type = 'sell'
            address = String(args[0])
          }

          if (type) {
            found.push({
              type,
              address,
              amountTokens: value,
              txHash: ev.transactionHash,
              blockNumber: ev.blockNumber,
              timestamp: Date.now() - (current - ev.blockNumber) * 2000, // ~2s per block estimate
            })
          }
        }
      } catch (err) {
        console.warn('[Trades] queryFilter failed, trying smaller range:', err)
        // Fallback: smaller range
        try {
          const filter = c.filters.Transfer()
          const evs = await c.queryFilter(filter, Math.max(0, current - 5000), current)
          for (const ev of evs) {
            const args = (ev as ethers.EventLog).args
            if (!args) continue
            const from = String(args[0]).toLowerCase()
            const to = String(args[1]).toLowerCase()
            const value = Number(ethers.formatEther(args[2]))
            if (value < 100) continue
            let type: 'buy' | 'sell' | null = null
            let address = ''
            if (from === pair) { type = 'buy'; address = String(args[1]) }
            else if (to === pair) { type = 'sell'; address = String(args[0]) }
            if (type) {
              found.push({ type, address, amountTokens: value, txHash: ev.transactionHash, blockNumber: ev.blockNumber, timestamp: Date.now() - (current - ev.blockNumber) * 2000 })
            }
          }
        } catch { /* ignore */ }
      }

      // Sort newest first
      found.sort((a, b) => b.blockNumber - a.blockNumber)
      const latest = found.slice(0, 50)
      console.log(`[Trades] Found ${found.length} trades, showing ${latest.length}`)

      setTrades(latest)
      setStats(calcStats(latest))
      setHolderStats(calcHolders(latest))
      loadedRef.current = true
    } catch (e) {
      console.warn('[Trades] Load error:', e)
    } finally {
      setIsLoading(false)
    }
  }, [getContract, isLoading, pairAddress, calcStats])

  // Live event subscription for new trades
  useEffect(() => {
    const c = getContract()
    if (!c || !pairAddress) return
    if (subscribedRef.current === c) return

    if (subscribedRef.current) {
      try { subscribedRef.current.removeAllListeners('Transfer') } catch {}
    }

    const pair = pairAddress.toLowerCase()
    try {
      c.on('Transfer', (from: string, to: string, value: bigint) => {
        const amount = Number(ethers.formatEther(value))
        if (amount < 100) return

        const fromL = from.toLowerCase()
        const toL = to.toLowerCase()
        let type: 'buy' | 'sell' | null = null
        let address = ''

        if (fromL === pair) { type = 'buy'; address = to }
        else if (toL === pair) { type = 'sell'; address = from }

        if (type) {
          const newTrade: Trade = {
            type, address, amountTokens: amount,
            txHash: '', blockNumber: 0, timestamp: Date.now(),
          }
          setTrades(prev => {
            const updated = [newTrade, ...prev].slice(0, 50)
            setStats(calcStats(updated))
            setHolderStats(calcHolders(updated))
            return updated
          })
        }
      })
      subscribedRef.current = c
    } catch {
      subscribedRef.current = null
    }

    return () => {
      if (subscribedRef.current) {
        try { subscribedRef.current.removeAllListeners('Transfer') } catch {}
        subscribedRef.current = null
      }
    }
  }, [getContract, pairAddress, calcStats])

  // Initial load + periodic refresh
  useEffect(() => {
    loadTrades()
    const id = setInterval(() => {
      loadedRef.current = false
      loadTrades()
    }, 60000) // refresh every 60s
    return () => clearInterval(id)
  }, [loadTrades])

  return { trades, stats, holderStats, isLoading, loadTrades }
}
