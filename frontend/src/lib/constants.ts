export const CONTRACT_ADDRESS = '0x4AfdC83DC87193f7915429c0eBb99d11A77408d1'
const _chainId: number = 84532
export const CHAIN_ID = _chainId
export const CHAIN_NAME = 'Base Sepolia'
export const BASE_RPC = 'https://sepolia.base.org'
export const FALLBACK_RPCS = ['https://base-sepolia-rpc.publicnode.com', 'https://sepolia.base.org']
export const PRICE_FEED_ADDRESS = '0x4Adc67d868764f6022B3CD50e6dB3c7AabC36578'
export const UNISWAP_FACTORY = CHAIN_ID === 8453
  ? '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6'
  : '0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e'
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'
export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD'
export const SCAN_BASE = CHAIN_ID === 8453 ? 'https://basescan.org' : 'https://sepolia.basescan.org'

export const SWAP_THRESHOLD = 120_000
export const MIN_TOKENS_FOR_REWARDS = 10_000
export const MAX_ENTRIES_PER_CYCLE = 3

export const POOL_NAMES = ['Micro', 'Mid', 'Mega'] as const
export type PoolType = 0 | 1 | 2
export type PoolName = typeof POOL_NAMES[number]
