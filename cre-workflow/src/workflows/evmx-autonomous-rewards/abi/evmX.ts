// ==========================================================================
// evmX Contract ABI - Subset for CRE Workflow Interactions
// ==========================================================================
// Only includes functions and events needed by the CRE autonomous workflow:
// - Pool state reading (getPoolInfo, getUserStatus)
// - Cycle triggering (runAutonomousCycle)
// - Event monitoring (AllocationTriggered, AllocationCompleted, etc.)
// ==========================================================================

export const EVMX_ABI = [
  // ── View Functions ─────────────────────────────────────────────────────
  {
    inputs: [{ internalType: 'uint8', name: 'poolType', type: 'uint8' }],
    name: 'getPoolInfo',
    outputs: [
      { internalType: 'uint256', name: 'balance', type: 'uint256' },
      { internalType: 'uint256', name: 'threshold', type: 'uint256' },
      { internalType: 'uint256', name: 'lastTriggerTime', type: 'uint256' },
      { internalType: 'uint256', name: 'cooldownEnd', type: 'uint256' },
      { internalType: 'uint256', name: 'totalEntries', type: 'uint256' },
      { internalType: 'uint256', name: 'roundStartIndex', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'getUserStatus',
    outputs: [
      { internalType: 'bool', name: 'microEligible', type: 'bool' },
      { internalType: 'uint8', name: 'microEntries', type: 'uint8' },
      { internalType: 'bool', name: 'midEligible', type: 'bool' },
      { internalType: 'uint8', name: 'midEntries', type: 'uint8' },
      { internalType: 'bool', name: 'megaEligible', type: 'bool' },
      { internalType: 'uint8', name: 'megaEntries', type: 'uint8' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'pendingVrfEth',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'marketingWallet',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },

  // ── State-Changing Functions ───────────────────────────────────────────
  {
    inputs: [],
    name: 'runAutonomousCycle',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },

  // ── Events ─────────────────────────────────────────────────────────────
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint8', name: 'poolType', type: 'uint8' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'requestId', type: 'uint256' },
    ],
    name: 'AllocationTriggered',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint8', name: 'poolType', type: 'uint8' },
      { indexed: true, internalType: 'address', name: 'winner', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'AllocationCompleted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'buyer', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'ethAmount', type: 'uint256' },
      { indexed: false, internalType: 'uint8', name: 'poolType', type: 'uint8' },
      { indexed: false, internalType: 'uint8', name: 'entryCount', type: 'uint8' },
    ],
    name: 'EntryGranted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'from', type: 'address' },
      { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'Transfer',
    type: 'event',
  },
] as const
