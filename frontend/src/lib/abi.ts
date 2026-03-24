export const EVMX_ABI = [
  'function getPoolInfo(uint8) view returns (uint256 balance, uint256 entryRequirementETH, uint256 currentThreshold, uint256 timeUntilExpiry, uint256 cycleId, uint256 participantCount)',
  'function getUserStatus(address) view returns (bool microEligible, uint8 microEntries, bool midEligible, uint8 midEntries, bool megaEligible, uint8 megaEntries)',
  'function balanceOf(address) view returns (uint256)',
  'function runAutonomousCycle() external',
  'event PoolAllocated(uint8 indexed poolType, address indexed recipient, uint256 amount, uint256 cycleId)',
  'event AllocationRequested(uint256 indexed requestId, uint8 poolType, uint256 cycleId, uint256 poolAmount, bool forceAllocation)',
  'function microPoolPendingRequestId() view returns (uint256)',
  'function midPoolPendingRequestId() view returns (uint256)',
  'function megaPoolPendingRequestId() view returns (uint256)',
  'function pendingVrfEth() view returns (uint256)',
  'function owner() view returns (address)',
  'function totalPayouts() view returns (uint256)',
] as const

export const PRICE_ABI = [
  'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
  'function decimals() view returns (uint8)',
] as const

export const LP_ABI = [
  'function getPair(address,address) view returns (address)',
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
] as const
