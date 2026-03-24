export interface PoolData {
  balance: bigint
  entryRequirement: bigint
  threshold: bigint
  timeUntilExpiry: bigint
  cycleId: bigint
  participantCount: bigint
}

export interface PoolState {
  raw: PoolData
  balanceEth: number
  entryReqEth: number
  thresholdEth: number
  timeLeft: number
  cycleId: number
  participants: number
  fillPct: number
  isReady: boolean
  isNearThreshold: boolean
}

export interface UserStatus {
  microEligible: boolean
  microEntries: number
  midEligible: boolean
  midEntries: number
  megaEligible: boolean
  megaEntries: number
  tokenBalance: bigint
  tokenBalanceFormatted: number
}

export interface VrfStatus {
  microPending: boolean
  midPending: boolean
  megaPending: boolean
  bufferEth: number
}

export interface WinnerEvent {
  poolType: number
  recipient: string
  amount: number
  cycleId: number
  blockNumber: number
  txHash?: string
}

export type DataSource =
  | 'on-chain'       // Direct contract read
  | 'derived'        // Math from on-chain values
  | 'estimate'       // Heuristic / linear extrapolation
  | 'session-only'   // Collected since page load
  | 'static-config'  // Hardcoded protocol constant
  | 'unavailable'    // Runtime: data source exists but returned no data
  | 'error'          // Runtime: failed to reach data source
  | 'loading'        // Runtime: fetch in progress
