export const CHAINS = {
  base: {
    id: 8453,
    name: 'Base',
    rpc: 'https://mainnet.base.org',
    fallbackRpcs: ['https://base-rpc.publicnode.com'],
    scan: 'https://basescan.org',
    uniswapFactory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
  },
  baseSepolia: {
    id: 84532,
    name: 'Base Sepolia',
    rpc: 'https://sepolia.base.org',
    fallbackRpcs: ['https://base-sepolia-rpc.publicnode.com', 'https://sepolia.base.org'],
    scan: 'https://sepolia.basescan.org',
    uniswapFactory: '0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e',
  },
} as const

export type ChainKey = keyof typeof CHAINS

// Active chain — change this ONE line to switch networks
export const ACTIVE_CHAIN: ChainKey = 'baseSepolia'

export const chain = CHAINS[ACTIVE_CHAIN]
