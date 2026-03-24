import { chain } from './chain'

export const CONTRACTS = {
  evmX: '0x4AfdC83DC87193f7915429c0eBb99d11A77408d1',
  priceFeed: '0x4Adc67d868764f6022B3CD50e6dB3c7AabC36578',
  weth: '0x4200000000000000000000000000000000000006',
  dead: '0x000000000000000000000000000000000000dEaD',
  uniswapFactory: chain.uniswapFactory,
} as const

export const PROTOCOL_CONSTANTS = {
  swapThreshold: 120_000,
  minTokensForRewards: 10_000,
  maxEntriesPerCycle: 3,
  microCycleDuration: 7200,    // 2h in seconds
  midCycleDuration: 21600,     // 6h in seconds
  megaCycleDuration: 604800,   // 7d in seconds
  dynamicEntryBps: 70,         // 0.7%
  microFloor: 0.001,
  microCap: 0.05,
  midFloor: 0.0025,
  midCap: 0.25,
  megaFloor: 0.0035,
  megaCap: 1.0,
  microLadderMin: 0.01,
  microLadderMax: 100,
  midLadderMin: 0.05,
  midLadderMax: 500,
} as const
