# evmX â€” Phase 1: Structural Security Analysis

> Scope Notice: This file is an internal technical verification record based on self-executed tests and maintainer review.
> It is not an independent third-party security certification and must not be presented as legal assurance.

## pre-release Security Architecture Review

---

## 1. STATE-CHANGING FUNCTIONS

### External / Public (callable by anyone)
| Function | Access | Reentrancy Guard | State Changes |
|---|---|---|---|
| `transfer/transferFrom` | Anyone | No (uses `_update`) | Balances, fees, eligibility, pools, swaps, VRF allocation cycles |
| `runAutonomousCycle()` | Anyone | `nonReentrant` | Swap, VRF fund, allocation cycle resolution, pool cycles |
| `runTicketCleanup(uint8,uint256)` | Anyone | No | eligibility entry storage cleanup |
| `emergencyForceDraw(uint8)` | Anyone | `nonReentrant` | allocation cycle resolution, pool payout, cycle reset |
| `syncETHAccounting()` | Anyone | No | megaPotBalance |
| `receive()` | Anyone | No | pendingVrfEth or megaPotBalance |

### Owner-Only
| Function | State Changes |
|---|---|
| `updateTrafficWhitelist(address,bool)` | isExcludedFromFees, isExcludedFromLimits |
| `setMarketingWallet(address)` | marketingWallet, fee/limit exclusions |
| `renounceOwnership()` (inherited) | owner = address(0) |

### Private / Internal (triggered during transfers)
| Function | Trigger |
|---|---|
| `swapAndDistribute()` | AUTO_SWAP_THRESHOLD reached during transfer or autonomousCycle |
| `swapTokensForEth(uint256)` | Called by swapAndDistribute |
| `_attemptVrfFund()` | After swap or in autonomousCycle |
| `checkAndDrawMicroPot/MidPot/MegaPot()` | Every transfer + autonomousCycle |
| `_autoResolveTimedOutDraws()` | Every transfer + autonomousCycle |
| `checkAndUpdateEligibility(address)` | On buy with fee |
| `_revokeEligibilityOnSell(address)` | On sell |
| `_revokeIfBelowRequiredBalance(address,uint256)` | On wallet-to-wallet transfer |
| `_finalizeDraw(PotType,DrawRequest,uint256)` | VRF fulfillment or emergency allocation cycle |
| `_selectAndPayWinner(...)` | During allocation cycle finalization |
| `rawFulfillRandomWords(uint256,uint256[])` | VRF Coordinator callback (external, access-controlled) |

---

## 2. EXTERNAL CALLS (Attack Surface)

| Call | Target | Context | Risk |
|---|---|---|---|
| `uniswapRouter.swapExactTokensForETHSupportingFeeOnTransferTokens()` | Uniswap V2 Router | In `lockTheSwap` modifier | Medium â€” try/catch protected |
| `uniswapRouter.getAmountsOut()` | Uniswap V2 Router | View call in swap | Low â€” try/catch protected |
| `uniswapRouter.WETH()` | Uniswap V2 Router | Constructor only | Low |
| `uniswapRouter.factory()` | Uniswap V2 Router | Constructor only | Low |
| `vrfCoordinator.requestRandomWords()` | Chainlink VRF | In allocation cycle request | Medium â€” try/catch protected |
| `vrfCoordinator.getSubscription()` | Chainlink VRF | Constructor + view | Low â€” try/catch protected |
| `vrfCoordinator.fundSubscriptionWithNative()` | Chainlink VRF | In VRF funding | Medium â€” try/catch, value transfer |
| `candidate.call{value: reward payout, gas: 300k}("")` | selected participant EOA/contract | In `_selectAndPayWinner` | **HIGH** â€” ETH transfer to unknown address |
| `marketingWallet.call{value: marketingETH, gas: 300k}("")` | Marketing wallet | In `swapAndDistribute` | **HIGH** â€” ETH transfer, gas-limited |
| `IUniswapV2Pair(uniswapPair).getReserves()` | Uniswap pair | View, try/catch | Low |
| `IUniswapV2Pair(pair).token0()` | Uniswap pair | Constructor only | Low |

### Critical External Call Analysis:
1. **recipient payout** (`candidate.call{value}`) â€” Gas-limited to 300k, prevents deep reentrancy but still allows some execution. If all selected participants revert, pool stays funded (no loss).
2. **Marketing payout** â€” If marketing wallet reverts, ETH goes to megaPotBalance (safe fallback).
3. **All Uniswap/VRF calls** â€” Wrapped in try/catch with graceful degradation.

---

## 3. FUND FLOWS

### ETH Inflows
```
External ETH â†’ receive() â†’ megaPotBalance (+ megaExternalInflowPendingForEntry)
VRF Coordinator ETH â†’ receive() â†’ pendingVrfEth
Token Swap â†’ swapAndDistribute() â†’ microPotBalance, midPotBalance, megaPotBalance, pendingVrfEth, marketingWallet
selfdestruct â†’ NOT tracked (syncETHAccounting catches it)
```

### ETH Outflows
```
marketingWallet.call{value} â† swapAndDistribute() (marketing share)
candidate.call{value} â† _selectAndPayWinner() (pool reward payouts)
vrfCoordinator.fundSubscriptionWithNative{value} â† _attemptVrfFund()
```

### Token Flows
```
Mint â†’ owner (100M, constructor only)
Buy tax â†’ contract (3% of buy amount via super._update)
Sell tax â†’ contract (3% of sell amount via super._update)
Swap â†’ uniswapRouter (accumulated tokens â†’ ETH)
Transfer â†’ from â†’ to (net of fees)
```

### ETH Accounting Invariant
```
address(this).balance >= microPotBalance + midPotBalance + megaPotBalance + pendingVrfEth
```
Note: Can be `>` due to selfdestruct/coinbase. `syncETHAccounting()` corrects excess.

---

## 4. STATE MACHINES

### A) reward pool Cycle State Machine (per pool type)
```
IDLE (cycleId=N, pendingRequestId=0)
  â”‚
  â”śâ”€[balance >= threshold OR time expired]â”€â†’ VRF_REQUESTED (pendingRequestId != 0)
  â”‚                                              â”‚
  â”‚                                              â”śâ”€[VRF fulfillment]â”€â†’ DRAW_EXECUTING
  â”‚                                              â”‚                        â”‚
  â”‚                                              â”‚                        â””â”€â†’ PAYOUT â†’ RESET (cycleId=N+1) â†’ IDLE
  â”‚                                              â”‚
  â”‚                                              â”śâ”€[24h timeout]â”€â†’ EMERGENCY_DRAW â†’ PAYOUT â†’ RESET â†’ IDLE
  â”‚                                              â”‚
  â”‚                                              â””â”€[VRF fails + 24h]â”€â†’ ON_CHAIN_RANDOM â†’ PAYOUT â†’ RESET â†’ IDLE
  â”‚
  â””â”€[VRF request fails]â”€â†’ vrfRequestFailureSince set
                              â”‚
                              â””â”€[fails for 24h+]â”€â†’ _executeNoPendingEmergencyDraw â†’ RESET â†’ IDLE
```

### B) Swap Lifecycle
```
IDLE (accumulatedTokens < threshold)
  â”‚
  â””â”€[accumulatedTokens >= 120k]â”€â†’ SWAPPING (inSwap=true, lockTheSwap)
                                       â”‚
                                       â”śâ”€[swap success]â”€â†’ DISTRIBUTE ETH â†’ IDLE (accumulators reset)
                                       â”‚
                                       â””â”€[swap fails]â”€â†’ lastFailedSwapTime set â†’ COOLDOWN (30s) â†’ IDLE
```

### C) VRF Funding Lifecycle
```
pendingVrfEth accumulates
  â”‚
  â”śâ”€[>= 0.001 ETH + sub balance < 2 ETH cap]â”€â†’ fund subscription
  â”‚
  â”śâ”€[sub balance >= 2 ETH cap]â”€â†’ reroute to pools (1/3 each)
  â”‚
  â””â”€[7 days no successful fund]â”€â†’ reroute all pending to pools
```

### D) Threshold Ladder (Micro/Mid)
```
Base threshold â†’ [allocation cycle triggered fast (< time limit)]â”€â†’ threshold *= 2 (UP, max cap)
                â†’ [allocation cycle triggered slow (>= time limit)]â”€â†’ threshold /= 2 (DOWN, min base)
```

### E) Ownership Lifecycle
```
OWNER_ACTIVE â†’ [renounceOwnership()] â†’ OWNER_RENOUNCED (permanent)
  â”‚                                         â”‚
  â”śâ”€ updateTrafficWhitelist âś“               â”śâ”€ updateTrafficWhitelist âś— (reverts)
  â”śâ”€ setMarketingWallet âś“                   â”śâ”€ setMarketingWallet âś— (reverts)
  â””â”€ renounceOwnership âś“                    â””â”€ marketingWallet frozen
                                             â””â”€ whitelist frozen
                                             â””â”€ ALL other functions still work
```

---

## 5. TRUST ASSUMPTIONS

| Assumption | Risk if Violated |
|---|---|
| Uniswap V2 Router at 0x4752ba... is legitimate | Total fund loss (swap manipulation) |
| Chainlink VRF Coordinator at 0xd5D5... is legitimate | allocation cycle manipulation, fund loss |
| VRF provides unbiased randomness | allocation cycle bias (affects fairness, not funds) |
| Uniswap pair reserves reflect real market price | Eligibility manipulation |
| Marketing wallet is a cooperative EOA | Marketing ETH reverts â†’ goes to mega pool (safe) |
| block.prevrandao is unpredictable | Emergency allocation cycle bias (minor â€” fallback only) |
| Base L2 block production is honest | Same-block protection bypass if sequencer colludes |
| No flash loan oracle manipulation of pair reserves | Eligibility gaming |
| Gas costs prevent infinite loop attacks | _selectAndPayWinner bounded by MAX_WINNER_ATTEMPTS=130 |

---

## 6. ATTACK SURFACES

### CRITICAL
| # | Attack Vector | Impact | Mitigation in Contract | Residual Risk |
|---|---|---|---|---|
| C1 | Reentrancy via recipient payout | Drain pool ETH | Gas limit 300k, ReentrancyGuard on entry points | Low â€” gas cap prevents deep reentry |
| C2 | Reentrancy via marketing wallet | Drain during swap | lockTheSwap modifier, gas limit 300k | Low |
| C3 | Flash loan reserve manipulation | Game eligibility thresholds | Price checked against reserves at buy time | **Medium** â€” flash loan can inflate reserves briefly |

### HIGH
| # | Attack Vector | Impact | Mitigation | Residual Risk |
|---|---|---|---|---|
| H1 | Gas griefing in _selectAndPayWinner | All candidates revert, pool undrained | PAYOUT_GAS_LIMIT, MAX_WINNER_ATTEMPTS, WINNER_SELECTION_GAS_RESERVE | Low â€” pool stays, next cycle |
| H2 | Forced ETH via selfdestruct | Accounting desync | syncETHAccounting() | Low â€” anyone can call sync |
| H3 | Sandwich attack on swapAndDistribute | Extract MEV from auto-swap | SWAP_SLIPPAGE_BPS (6% max slippage), SWAP_MIN_OUTPUT_ETH | **Medium** â€” 6% slippage is exploitable |
| H4 | Emergency allocation cycle randomness manipulation | Bias recipient selection | Multi-source entropy (prevrandao, blockhash, balances) | Medium â€” on-chain randomness is weaker |

### MEDIUM
| # | Attack Vector | Impact | Mitigation | Residual Risk |
|---|---|---|---|---|
| M1 | Same-block exploitation | Double-buy to accumulate | lastBuyBlock/lastSellBlock check | Low â€” only for non-excluded |
| M2 | Token accumulation without sell tax | Bypass sell revocation | Transfer triggers _revokeIfBelowRequiredBalance | Low |
| M3 | Eligibility sniping | Buy just enough for eligibility, sell after allocation cycle | Sell revokes all eligibility + balance check at allocation cycle | Low |
| M4 | VRF subscription starvation | No allocation cycles possible | Auto-funding from tax, 7-day reroute, emergency fallback | Low |
| M5 | Swap threshold manipulation | Delay/trigger swap at bad prices | Cooldown, slippage protection | Medium |
| M6 | eligibility entry count inflation | Many eligibility entries -> higher selection probability | One eligibility entry per eligible address per cycle | Low |

### LOW / INFORMATIONAL
| # | Note |
|---|---|
| L1 | `syncETHAccounting()` has no access control â€” intentional, permissionless |
| L2 | `runTicketCleanup()` has no reentrancy guard â€” only deletes storage, no ETH movement |
| L3 | Mega pool external inflow tracking resets on cycle â€” intentional design |
| L4 | VRF callback gas limit 2.5M may be insufficient for extreme participant counts |
| L5 | `checkAndUpdateEligibility` skips contracts (code.length > 0) â€” intentional anti-bot |
| L6 | Threshold can reach max (100/500 ETH) and stay there if fast allocation cycles continue |
| L7 | No event emitted when swap fails silently (try/catch just sets cooldown) |
| L8 | `_cleanupTickets` bounded by gas â€” may not clean all in one pass (intentional) |





