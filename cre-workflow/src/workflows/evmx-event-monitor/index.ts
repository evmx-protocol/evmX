// ==========================================================================
// evmX Event Monitor CRE Workflow
// ==========================================================================
// This CRE workflow uses EVM Log Triggers to react to on-chain events:
// - PoolAllocated → logs winner info for dashboards and analytics
//
// Provides real-time event processing for the evmX reward protocol,
// enabling automated notifications and analytics.
// ==========================================================================

import {
  type Runtime,
  type EVMLog,
  EVMClient,
  handler,
} from '@chainlink/cre-sdk'

// ── Configuration ────────────────────────────────────────────────────────

type Config = {
  evmxContractAddress: string
}

// ── Base Sepolia chain selector ──────────────────────────────────────────
const BASE_SEPOLIA_SELECTOR = EVMClient.SUPPORTED_CHAIN_SELECTORS['ethereum-testnet-sepolia-base-1']

// ── Helper: bytes to hex ─────────────────────────────────────────────────
function toHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Event Signatures (keccak256 hashes) ──────────────────────────────────
// PoolAllocated(uint8 indexed poolType, address indexed recipient, uint256 amount, uint256 cycleId)
const POOL_ALLOCATED_TOPIC =
  '0x24c8111ef1a268c2ff62267f4885d8f9308cfab83074791a7bf83e18318c135d'

// ── Log Trigger Callback ─────────────────────────────────────────────────

const onAllocationEvent = (
  runtime: Runtime<Config>,
  log: EVMLog
): string => {
  runtime.log('=== evmX Event Monitor: PoolAllocated ===')
  runtime.log(`TX Hash: ${toHex(log.txHash)}`)
  runtime.log(`Contract: ${toHex(log.address)}`)

  const topics = log.topics
  if (topics.length < 3) {
    runtime.log('[WARN] Log missing required topics')
    return 'error: insufficient topics'
  }

  // Decode event data
  try {
    const poolType = Number(BigInt(toHex(topics[1])))
    const poolNames = ['Micro', 'Mid', 'Mega']
    const poolName = poolNames[poolType] || 'Unknown'

    // Winner address from indexed topic (last 20 bytes of 32-byte topic)
    const winnerHex = toHex(topics[2])
    const winnerAddress = '0x' + winnerHex.slice(-40)

    // Non-indexed data: amount (uint256) + cycleId (uint256)
    const dataHex = toHex(log.data)
    // First 32 bytes = amount, next 32 bytes = cycleId
    const amountHex = '0x' + dataHex.slice(2, 66)
    const cycleIdHex = '0x' + dataHex.slice(66, 130)
    const amount = BigInt(amountHex)
    const cycleId = BigInt(cycleIdHex)
    const amountETH = Number(amount) / 1e18

    runtime.log(`[WINNER] Pool: ${poolName} (Cycle #${cycleId})`)
    runtime.log(`[WINNER] Address: ${winnerAddress}`)
    runtime.log(`[WINNER] Amount: ${amountETH.toFixed(4)} ETH`)

    return `winner: ${poolName} ${winnerAddress} ${amountETH.toFixed(4)} ETH cycle#${cycleId}`
  } catch (error) {
    runtime.log(`[ERROR] Failed to decode event: ${error}`)
    return `error: ${error}`
  }
}

// ── Workflow Initialization ──────────────────────────────────────────────

const initWorkflow = (config: Config) => {
  const evmClient = new EVMClient(BASE_SEPOLIA_SELECTOR)

  // Convert address to base64 for the filter
  const addressHex = config.evmxContractAddress.replace('0x', '')
  const addressBytes = new Uint8Array(addressHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
  const addressBase64 = btoa(String.fromCharCode(...addressBytes))

  // Convert topic to base64
  const topicHex = POOL_ALLOCATED_TOPIC.replace('0x', '')
  const topicBytes = new Uint8Array(topicHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)))
  const topicBase64 = btoa(String.fromCharCode(...topicBytes))

  return [
    handler(
      evmClient.logTrigger({
        addresses: [addressBase64],
        topics: [{ values: [topicBase64] }],
      }),
      onAllocationEvent
    ),
  ]
}

// ── Runner Entry Point (CRE CLI v1.2.0+) ────────────────────────────────
import { Runner } from '@chainlink/cre-sdk'
import { z } from 'zod'

const configSchema = z.object({
  evmxContractAddress: z.string(),
})

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}

main()
