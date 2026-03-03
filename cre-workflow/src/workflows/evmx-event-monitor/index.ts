// ==========================================================================
// evmX Event Monitor CRE Workflow
// ==========================================================================
// This CRE workflow uses EVM Log Triggers to react to on-chain events:
// - AllocationCompleted → logs winner info for dashboards and analytics
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
// AllocationCompleted(uint8 indexed poolType, address indexed winner, uint256 amount)
const ALLOCATION_COMPLETED_TOPIC =
  '0x5e10276cd2dbd60edf572e88e81a404db1b1e74e42f8da140188e80960488754'

// ── Log Trigger Callback ─────────────────────────────────────────────────

const onAllocationEvent = (
  runtime: Runtime<Config>,
  log: EVMLog
): string => {
  runtime.log('=== evmX Event Monitor: AllocationCompleted ===')
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

    // Amount from non-indexed data
    const dataHex = toHex(log.data)
    const amount = BigInt(dataHex)
    const amountETH = Number(amount) / 1e18

    runtime.log(`[WINNER] Pool: ${poolName}`)
    runtime.log(`[WINNER] Address: ${winnerAddress}`)
    runtime.log(`[WINNER] Amount: ${amountETH.toFixed(4)} ETH`)

    return `winner: ${poolName} ${winnerAddress} ${amountETH.toFixed(4)} ETH`
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
  const topicHex = ALLOCATION_COMPLETED_TOPIC.replace('0x', '')
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

// ── Export ────────────────────────────────────────────────────────────────
export default { initWorkflow }
