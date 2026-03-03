// ==========================================================================
// evmX Autonomous Rewards CRE Workflow
// ==========================================================================
// This CRE workflow automates the evmX reward cycle by:
// 1. Monitoring pool thresholds and timer expirations via cron trigger
// 2. Reading on-chain pool state (Micro, Mid, Mega balances & timers)
// 3. Triggering runAutonomousCycle() when conditions are met via CRE Report
// 4. Logging allocation results for transparency
//
// Replaces centralized keepers with decentralized CRE orchestration,
// ensuring trustless, autonomous reward distribution on Base L2.
// ==========================================================================

import {
  type CronPayload,
  type Runtime,
  EVMClient,
  CronCapability,
  handler,
} from '@chainlink/cre-sdk'
import { encodeFunctionData, decodeFunctionResult } from 'viem'
import { EVMX_ABI } from './abi'

// ── Configuration Schema ─────────────────────────────────────────────────

type Config = {
  evmxContractAddress: string
  schedule: string
}

// ── Pool Type Constants ──────────────────────────────────────────────────
const POOL_MICRO = 0
const POOL_MID = 1
const POOL_MEGA = 2
const POOL_NAMES = ['Micro', 'Mid', 'Mega'] as const

// ── Base Sepolia chain selector ──────────────────────────────────────────
const BASE_SEPOLIA_SELECTOR = EVMClient.SUPPORTED_CHAIN_SELECTORS['ethereum-testnet-sepolia-base-1']

// ── Pool Info Type ───────────────────────────────────────────────────────
type PoolInfo = {
  balance: bigint
  threshold: bigint
  lastTriggerTime: bigint
  cooldownEnd: bigint
  totalEntries: bigint
  roundStartIndex: bigint
}

// ── Helper: Read Pool Info ───────────────────────────────────────────────

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

    // Convert contract address to base64 for CRE API
    const addrHex = runtime.config.evmxContractAddress.replace('0x', '')
    const addrBytes = new Uint8Array(addrHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
    const addrBase64 = btoa(String.fromCharCode(...addrBytes))

    // Convert callData to base64
    const dataHex = callData.replace('0x', '')
    const dataBytes = new Uint8Array(dataHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
    const dataBase64 = btoa(String.fromCharCode(...dataBytes))

    const response = evmClient.callContract(runtime, {
      call: {
        to: addrBase64,
        data: dataBase64,
      },
    })

    const result = response.result()

    if (!result.data || result.data.length === 0) {
      runtime.log(`[WARN] Empty result for ${POOL_NAMES[poolType]} pool`)
      return null
    }

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
      threshold: decoded[1],
      lastTriggerTime: decoded[2],
      cooldownEnd: decoded[3],
      totalEntries: decoded[4],
      roundStartIndex: decoded[5],
    }
  } catch (error) {
    runtime.log(`[ERROR] Failed to read ${POOL_NAMES[poolType]} pool: ${error}`)
    return null
  }
}

// ── Helper: Check if Pool is Ready for Allocation ────────────────────────

function isPoolReady(pool: PoolInfo, currentTime: bigint): boolean {
  const hasBalance = pool.balance >= pool.threshold && pool.threshold > 0n
  const cooldownExpired = currentTime >= pool.cooldownEnd
  const hasEntries = pool.totalEntries > pool.roundStartIndex
  return hasBalance && cooldownExpired && hasEntries
}

// ── Main Workflow Callback ───────────────────────────────────────────────

const onCronTrigger = (
  runtime: Runtime<Config>,
  _payload: CronPayload
): string => {
  const config = runtime.config
  runtime.log('=== evmX Autonomous Rewards CRE Workflow ===')
  runtime.log(`Contract: ${config.evmxContractAddress}`)

  // ── Step 1: Initialize EVM Client ──────────────────────────────────
  const evmClient = new EVMClient(BASE_SEPOLIA_SELECTOR)
  runtime.log(`[OK] Connected to Base Sepolia`)

  // ── Step 2: Read Pool States ───────────────────────────────────────
  runtime.log('--- Reading Pool States ---')

  const pools: (PoolInfo | null)[] = []
  for (let i = 0; i <= POOL_MEGA; i++) {
    const info = readPoolInfo(runtime, evmClient, i)
    pools.push(info)

    if (info) {
      const balanceETH = Number(info.balance) / 1e18
      const thresholdETH = Number(info.threshold) / 1e18
      const entries = Number(info.totalEntries - info.roundStartIndex)
      runtime.log(
        `  ${POOL_NAMES[i]}: ${balanceETH.toFixed(4)} ETH / ${thresholdETH.toFixed(4)} ETH threshold | ${entries} entries`
      )
    }
  }

  // ── Step 3: Check if Any Pool Needs Allocation ─────────────────────
  const currentTime = BigInt(Math.floor(Date.now() / 1000))
  const readyPools: string[] = []

  for (let i = 0; i <= POOL_MEGA; i++) {
    if (pools[i] && isPoolReady(pools[i]!, currentTime)) {
      readyPools.push(POOL_NAMES[i])
    }
  }

  if (readyPools.length === 0) {
    runtime.log('[INFO] No pools ready for allocation. Waiting...')
    return 'no_action: pools not ready'
  }

  // ── Step 4: Submit CRE Report for on-chain execution ───────────────
  runtime.log(`[ACTION] Pools ready: ${readyPools.join(', ')}`)
  runtime.log('[ACTION] Submitting CRE writeReport for runAutonomousCycle()...')

  // Convert contract address to bytes
  const addressHex = config.evmxContractAddress.replace('0x', '')
  const receiver = new Uint8Array(addressHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))

  evmClient.writeReport(runtime, {
    receiver: receiver,
    $report: true,
  })

  runtime.log(`[SUCCESS] CRE report submitted for runAutonomousCycle()`)
  runtime.log(`[SUCCESS] Ready pools: ${readyPools.join(', ')}`)
  return `success: triggered for ${readyPools.join(', ')}`
}

// ── Workflow Initialization ──────────────────────────────────────────────

const initWorkflow = (config: Config) => {
  const cron = new CronCapability()

  return [
    handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),
  ]
}

// ── Export ────────────────────────────────────────────────────────────────
export default { initWorkflow }
