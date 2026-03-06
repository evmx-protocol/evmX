// ==========================================================================
// evmX AI Strategy Advisor — CRE Workflow #3
// ==========================================================================
// Integrates on-chain pool data with external market APIs and LLM analysis
// to provide autonomous, AI-powered strategy recommendations.
//
// Data pipeline:
//   1. Cron trigger (every 5 minutes)
//   2. Read on-chain pool states via EVMClient (blockchain data)
//   3. Fetch ETH market data from CoinGecko API via HTTPClient (external API)
//   4. Analyze combined data with LLM (OpenAI) via ConfidentialHTTPClient
//   5. Return AI-generated strategy recommendation
//
// Demonstrates CRE's ability to orchestrate blockchain reads,
// external API calls, and LLM inference in a single workflow.
// ==========================================================================

import {
  type CronPayload,
  type Runtime,
  type NodeRuntime,
  EVMClient,
  HTTPClient,
  ConfidentialHTTPClient,
  CronCapability,
  handler,
} from '@chainlink/cre-sdk'
import { encodeFunctionData, decodeFunctionResult } from 'viem'
import { EVMX_ABI } from '../evmx-autonomous-rewards/abi'

// ── Configuration ───────────────────────────────────────────────────────

type Config = {
  evmxContractAddress: string
  schedule: string
  openaiModel: string
}

// ── Constants ───────────────────────────────────────────────────────────

const POOL_NAMES = ['Micro', 'Mid', 'Mega'] as const
const BASE_SEPOLIA_SELECTOR = EVMClient.SUPPORTED_CHAIN_SELECTORS['ethereum-testnet-sepolia-base-1']

// ── Types ───────────────────────────────────────────────────────────────

type PoolInfo = {
  balance: bigint
  entryRequirementETH: bigint
  currentThreshold: bigint
  timeUntilExpiry: bigint
  cycleId: bigint
  participantCount: bigint
}

type MarketData = {
  ethPrice: number
  priceChange24h: number
  volume24h: number
  marketTrend: 'bullish' | 'bearish' | 'neutral'
}

type PoolAnalysis = {
  name: string
  balanceETH: number
  balanceUSD: number
  thresholdETH: number
  fillPercent: number
  timeLeftSeconds: number
  participants: number
  entryRequirementETH: number
  odds: string
}

// ── Helper: Read Pool Info ──────────────────────────────────────────────

function readPoolInfo(
  runtime: Runtime<Config>,
  evmClient: EVMClient,
  poolType: number
): PoolInfo | null {
  try {
    const callData = encodeFunctionData({
      abi: EVMX_ABI,
      functionName: 'getPoolInfo',
      args: [poolType],
    })

    const addrHex = runtime.config.evmxContractAddress.replace('0x', '')
    const addrBytes = new Uint8Array(addrHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
    const addrBase64 = btoa(String.fromCharCode(...addrBytes))

    const dataHex = callData.replace('0x', '')
    const dataBytes = new Uint8Array(dataHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
    const dataBase64 = btoa(String.fromCharCode(...dataBytes))

    const response = evmClient.callContract(runtime, {
      call: { to: addrBase64, data: dataBase64 },
    })

    const result = response.result()
    if (!result.data || result.data.length === 0) return null

    const hexOutput = '0x' + Array.from(result.data)
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('')

    const decoded = decodeFunctionResult({
      abi: EVMX_ABI,
      functionName: 'getPoolInfo',
      data: hexOutput as `0x${string}`,
    }) as [bigint, bigint, bigint, bigint, bigint, bigint]

    return {
      balance: decoded[0],
      entryRequirementETH: decoded[1],
      currentThreshold: decoded[2],
      timeUntilExpiry: decoded[3],
      cycleId: decoded[4],
      participantCount: decoded[5],
    }
  } catch (error) {
    runtime.log(`[ERROR] Failed to read pool ${poolType}: ${error}`)
    return null
  }
}

// ── Helper: Decode UTF-8 from response bytes ────────────────────────────

function decodeResponseBody(body: Uint8Array): string {
  return Array.from(body).map(b => String.fromCharCode(b)).join('')
}

// ── Helper: Fetch Market Data from CoinGecko ────────────────────────────

function fetchMarketData(
  runtime: Runtime<Config>,
  httpClient: HTTPClient
): MarketData {
  const defaultData: MarketData = {
    ethPrice: 0,
    priceChange24h: 0,
    volume24h: 0,
    marketTrend: 'neutral',
  }

  try {
    runtime.log('[HTTP] Fetching ETH market data from CoinGecko API...')

    // HTTPClient.sendRequest node-level API for external HTTP calls
    const nodeRuntime = runtime as unknown as NodeRuntime<Config>
    const response = httpClient.sendRequest(nodeRuntime, {
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true',
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })

    const result = response.result()
    if (result.statusCode < 200 || result.statusCode >= 300) {
      runtime.log(`[WARN] CoinGecko API returned status ${result.statusCode}`)
      return defaultData
    }

    const bodyText = decodeResponseBody(result.body)
    const data = JSON.parse(bodyText) as {
      ethereum?: {
        usd?: number
        usd_24h_change?: number
        usd_24h_vol?: number
      }
    }

    const eth = data?.ethereum
    if (!eth) return defaultData

    const priceChange = eth.usd_24h_change ?? 0
    const marketTrend = priceChange > 2 ? 'bullish' : priceChange < -2 ? 'bearish' : 'neutral'

    const marketData: MarketData = {
      ethPrice: eth.usd ?? 0,
      priceChange24h: priceChange,
      volume24h: eth.usd_24h_vol ?? 0,
      marketTrend,
    }

    runtime.log(`[HTTP] ETH: $${marketData.ethPrice.toFixed(2)} | 24h: ${marketData.priceChange24h.toFixed(2)}% | Trend: ${marketData.marketTrend}`)
    return marketData
  } catch (error) {
    runtime.log(`[WARN] CoinGecko fetch failed: ${error}`)
    return defaultData
  }
}

// ── Helper: Build Analysis Context ──────────────────────────────────────

function buildPoolAnalyses(
  pools: (PoolInfo | null)[],
  market: MarketData
): PoolAnalysis[] {
  const analyses: PoolAnalysis[] = []

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i]
    if (!pool) continue

    const balanceETH = Number(pool.balance) / 1e18
    const thresholdETH = Number(pool.currentThreshold) / 1e18
    const entryETH = Number(pool.entryRequirementETH) / 1e18
    const participants = Number(pool.participantCount)
    const fillPercent = thresholdETH > 0 ? (balanceETH / thresholdETH) * 100 : 0

    analyses.push({
      name: POOL_NAMES[i],
      balanceETH,
      balanceUSD: balanceETH * market.ethPrice,
      thresholdETH,
      fillPercent: Math.min(fillPercent, 100),
      timeLeftSeconds: Number(pool.timeUntilExpiry),
      participants,
      entryRequirementETH: entryETH,
      odds: participants > 0 ? `1 in ${participants}` : 'no participants',
    })
  }

  return analyses
}

// ── Helper: Build LLM Prompt ────────────────────────────────────────────

function buildLLMPrompt(analyses: PoolAnalysis[], market: MarketData): string {
  const poolSummary = analyses.map(p =>
    `${p.name} Pool: ${p.balanceETH.toFixed(4)} ETH ($${p.balanceUSD.toFixed(2)}), ` +
    `${p.fillPercent.toFixed(1)}% filled, ${p.timeLeftSeconds}s until expiry, ` +
    `${p.participants} participants, entry: ${p.entryRequirementETH.toFixed(4)} ETH, odds: ${p.odds}`
  ).join('\n')

  return `You are an AI advisor for evmX, an autonomous DeFi reward protocol on Base L2.
Analyze the current protocol state and provide a brief strategy recommendation.

ETH Market:
- Price: $${market.ethPrice.toFixed(2)}
- 24h Change: ${market.priceChange24h.toFixed(2)}%
- Market Trend: ${market.marketTrend}

Pool States:
${poolSummary}

Rules:
- Micro Pool: 2-hour cycle, dynamic threshold, fast small rewards
- Mid Pool: 6-hour cycle, dynamic threshold, medium rewards
- Mega Pool: 7-day cycle, large weekly jackpot

Provide a 2-3 sentence strategy recommendation: which pool offers the best opportunity right now and why.
Consider fill percentage, odds, time remaining, and market conditions.
Be concise and actionable.`
}

// ── Helper: Call LLM via ConfidentialHTTP ────────────────────────────────

function callLLM(
  runtime: Runtime<Config>,
  confidentialHttp: ConfidentialHTTPClient,
  prompt: string
): string {
  try {
    runtime.log('[LLM] Requesting AI analysis via OpenAI API...')

    const requestBody = JSON.stringify({
      model: runtime.config.openaiModel || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a DeFi protocol analyst. Be concise.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 200,
      temperature: 0.7,
    })

    const response = confidentialHttp.sendRequest(runtime, {
      vaultDonSecrets: [
        { key: 'openai_api_key' },
      ],
      request: {
        url: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        multiHeaders: {
          'Content-Type': { values: ['application/json'] },
          'Authorization': { values: ['Bearer {{secrets.openai_api_key}}'] },
        },
        bodyString: requestBody,
      },
    })

    const result = response.result()
    const bodyText = decodeResponseBody(result.body)
    const parsed = JSON.parse(bodyText) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const aiResponse = parsed?.choices?.[0]?.message?.content
    if (aiResponse) {
      runtime.log(`[LLM] AI recommendation received (${aiResponse.length} chars)`)
      return aiResponse
    }

    runtime.log('[WARN] LLM returned empty response, using fallback analysis')
    return ''
  } catch (error) {
    runtime.log(`[WARN] LLM call failed: ${error}. Using fallback analysis.`)
    return ''
  }
}

// ── Helper: Fallback Local Analysis ─────────────────────────────────────

function localAnalysis(analyses: PoolAnalysis[], market: MarketData): string {
  if (analyses.length === 0) return 'No pool data available.'

  // Score each pool: higher = better opportunity
  const scored = analyses.map(p => {
    const fillScore = p.fillPercent * 0.3                          // closer to threshold = better
    const oddsScore = p.participants > 0 ? (100 / p.participants) * 0.4 : 0  // fewer = better
    const timeScore = p.timeLeftSeconds < 3600 ? 30 : 0            // expiring soon = urgent
    const sizeScore = p.balanceUSD * 0.001                         // bigger pool = bigger reward
    return { ...p, score: fillScore + oddsScore + timeScore + sizeScore }
  })

  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]

  const trendAdvice = market.marketTrend === 'bullish'
    ? 'ETH is trending up — pool values may increase further.'
    : market.marketTrend === 'bearish'
    ? 'ETH is declining — consider entering now before pool values drop.'
    : 'Market is stable — good conditions for predictable entries.'

  return `Best opportunity: ${best.name} Pool at ${best.fillPercent.toFixed(0)}% filled with ${best.odds} odds ` +
    `(${best.balanceETH.toFixed(4)} ETH / $${best.balanceUSD.toFixed(2)} reward). ` +
    `${trendAdvice} ` +
    `Entry requirement: ${best.entryRequirementETH.toFixed(4)} ETH.`
}

// ── Main Workflow ───────────────────────────────────────────────────────

const onCronTrigger = (
  runtime: Runtime<Config>,
  _payload: CronPayload
): string => {
  runtime.log('=== evmX AI Strategy Advisor ===')
  runtime.log(`Contract: ${runtime.config.evmxContractAddress}`)

  // ── Step 1: Initialize clients ────────────────────────────────────
  const evmClient = new EVMClient(BASE_SEPOLIA_SELECTOR)
  const httpClient = new HTTPClient()
  const confidentialHttp = new ConfidentialHTTPClient()
  runtime.log('[OK] Clients initialized (EVM + HTTP + ConfidentialHTTP)')

  // ── Step 2: Read on-chain pool states ─────────────────────────────
  runtime.log('--- Reading On-Chain Pool States ---')
  const pools: (PoolInfo | null)[] = []
  for (let i = 0; i <= 2; i++) {
    pools.push(readPoolInfo(runtime, evmClient, i))
  }

  // ── Step 3: Fetch external market data ────────────────────────────
  runtime.log('--- Fetching External Market Data (CoinGecko API) ---')
  const market = fetchMarketData(runtime, httpClient)

  // ── Step 4: Build analysis ────────────────────────────────────────
  const analyses = buildPoolAnalyses(pools, market)
  for (const a of analyses) {
    runtime.log(`  ${a.name}: ${a.balanceETH.toFixed(4)} ETH ($${a.balanceUSD.toFixed(2)}) | ${a.fillPercent.toFixed(1)}% | ${a.participants} entries | ${a.odds}`)
  }

  // ── Step 5: Get AI recommendation ─────────────────────────────────
  runtime.log('--- AI Analysis (OpenAI LLM) ---')
  const prompt = buildLLMPrompt(analyses, market)

  // Try LLM first, fall back to local scoring algorithm
  let recommendation = callLLM(runtime, confidentialHttp, prompt)
  const source = recommendation ? 'OpenAI GPT' : 'on-chain-scoring'
  if (!recommendation) {
    recommendation = localAnalysis(analyses, market)
  }

  runtime.log(`[AI] Source: ${source}`)
  runtime.log(`[AI] Recommendation: ${recommendation}`)

  // ── Step 6: Return strategy report ────────────────────────────────
  const report = JSON.stringify({
    timestamp: Date.now(),
    ethPrice: market.ethPrice,
    marketTrend: market.marketTrend,
    pools: analyses.map(a => ({
      name: a.name,
      balanceETH: a.balanceETH,
      fillPercent: a.fillPercent,
      participants: a.participants,
    })),
    recommendation,
    source,
  })

  runtime.log('=== AI Strategy Report Complete ===')
  return report
}

// ── Workflow Init ───────────────────────────────────────────────────────

const initWorkflow = (config: Config) => {
  const cron = new CronCapability()

  return [
    handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),
  ]
}

// ── Runner Entry Point (CRE CLI v1.2.0+) ────────────────────────────────
import { Runner } from '@chainlink/cre-sdk'
import { z } from 'zod'

const configSchema = z.object({
  evmxContractAddress: z.string(),
  schedule: z.string(),
  openaiModel: z.string(),
})

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}

main()
