# evmX (ETERNAL VIRTUAL MACHINE) - Full Internal Security Verification Report

> Scope Notice: This file is an internal technical verification record based on self-executed tests and maintainer review.
> It is not an independent third-party security certification and must not be presented as legal assurance.


**Author**: Internal Project Maintainer
**Date**: 2025-02-18
**Contract**: evmX_Testable.sol / evmX.sol (identical logic)
**Solidity**: 0.8.28
**Target**: Base Mainnet (Chain ID 8453)
**Lines of Code**: ~1,435
**Scope Context**: Internal repository verification run

---

# PHASE 1 â€” MANUAL CODE REVIEW & THREAT MODEL

## 1.1 FULL THREAT MODEL

### Attack Surfaces

| # | Surface | Entry Point | Trust Boundary |
|---|---------|-------------|----------------|
| AS-1 | Token transfers (buy/sell/wallet) | `_update()` override | Any EOA/contract |
| AS-2 | Autonomous cycle | `runAutonomousCycle()` | Any caller, `nonReentrant` |
| AS-3 | Emergency force allocation cycle | `emergencyForceDraw()` | Any caller after 24h timeout |
| AS-4 | VRF callback | `rawFulfillRandomWords()` | VRF Coordinator only |
| AS-5 | ETH receive | `receive()` | Any ETH sender |
| AS-6 | ETH accounting sync | `syncETHAccounting()` | Any caller |
| AS-7 | Owner admin functions | `updateTrafficWhitelist()`, `setMarketingWallet()` | Owner only |
| AS-8 | eligibility entry cleanup | `runTicketCleanup()` | Any caller |
| AS-9 | Uniswap swap path | `swapTokensForEth()` internal | Triggered by threshold |
| AS-10 | Marketing wallet payout | `.call{value}` in `swapAndDistribute` | Marketing address |

### All State Transitions

| State Machine | States | Transitions |
|---|---|---|
| **reward pool Cycle (Micro/Mid)** | Accumulating â†’ DrawPending â†’ VRFFulfilling â†’ WinnerSelected â†’ CycleReset | Threshold or time triggers allocation cycle. VRF fulfillment or 24h emergency completes it. |
| **Mega pool Cycle** | Accumulating (7d) â†’ DrawPending â†’ VRFFulfilling â†’ WinnerSelected â†’ CycleReset | Fixed 7-day timer. Same VRF/emergency path. |
| **Swap State** | Idle â†’ Swapping (`inSwap=true`) â†’ Distributing â†’ Idle | Threshold (120k tokens) triggers. `lockTheSwap` mutex. |
| **VRF Funding** | PendingVrfEth accumulates â†’ Fund attempt â†’ Success/Reroute | After swap or standalone. 7-day stale reroute fallback. |
| **Threshold Ladder (Micro)** | Current threshold doubles on fast-fill allocation cycle, halves on time-expiry allocation cycle. Bounded [0.01, 100 ETH]. | |
| **Threshold Ladder (Mid)** | Current threshold doubles on fast-fill allocation cycle, halves on time-expiry allocation cycle. Bounded [0.05, 500 ETH]. | |
| **Ownership** | Active â†’ Renounced (`owner = 0x0`). Irreversible. | |
| **Emergency allocation cycle** | VRF request stale 24h â†’ anyone can trigger emergency allocation cycle with on-chain randomness | |

### Trust Assumptions

| # | Assumption | Risk Level |
|---|---|---|
| TA-1 | Uniswap V2 Router at hardcoded address is legitimate and functional | Critical â€” if compromised, swap drains tokens |
| TA-2 | Chainlink VRF Coordinator delivers random words honestly | High â€” biased VRF could game recipient selection |
| TA-3 | VRF Coordinator address does not change on Base | Medium â€” hardcoded immutable |
| TA-4 | Owner does not whitelist malicious addresses before renouncing | High â€” can bypass all limits/fees |
| TA-5 | Marketing wallet is not a contract that reverts on ETH receive | Low â€” fallback sends to mega pool |
| TA-6 | Base block.prevrandao provides sufficient entropy for emergency allocation cycles | Medium â€” validators can influence |
| TA-7 | Uniswap pair maintains sufficient liquidity | Medium â€” zero liquidity breaks price oracle |
| TA-8 | Gas costs on Base remain reasonable | Low â€” L2 gas is cheap |
| TA-9 | No protocol upgrade changes Uniswap V2 Router behavior | Medium â€” immutable dependency |

---

## 1.2 FINDING CLASSIFICATION

### CRITICAL FINDINGS

**[C-1] Emergency allocation cycle Randomness is Miner/Validator-Influenceable**

**Severity**: Critical
**Location**: `_deriveEmergencyRandom()` lines 535-560

The emergency allocation cycle fallback uses `block.prevrandao`, `block.timestamp`, `tx.gasprice`, `gasleft()`, and `blockhash()` as entropy sources. On Base (an L2 with a single sequencer), the sequencer can:
- Choose `block.timestamp` within drift bounds
- Control `block.prevrandao` (which is the L1 RANDAO on L2, but the sequencer picks which L1 block to reference)
- Control transaction ordering (which affects `gasleft()` at execution)

**Impact**: A colluding Base sequencer (or an L2 with decentralized sequencing that includes the attacker) could influence emergency allocation cycle outcomes to direct pool payouts to a specific address.

**Mitigation already present**: Emergency allocation cycles only trigger after 24h VRF failure. Under normal VRF operation, this path is never taken. The complexity of influencing all entropy sources simultaneously is non-trivial.

**Residual risk**: MEDIUM after mitigation. The 24h timeout + multi-source entropy makes exploitation expensive but theoretically possible for a sequencer-level attacker.

---

**[C-2] Potential Permanent VRF Deadlock with Coordinator Upgrade**

**Severity**: Critical (conditional)
**Location**: `rawFulfillRandomWords()` line 1131, `vrfCoordinatorAddress` immutable

If Chainlink upgrades the VRF Coordinator on Base to a new address, the immutable `vrfCoordinatorAddress` will reject all callbacks from the new coordinator (`OnlyCoordinator` revert). New VRF requests to the old coordinator will also fail.

**Impact**: All three pool cycle mechanisms permanently stall. The 24h emergency fallback using on-chain randomness activates, but this degrades to the C-1 vulnerability permanently.

**Mitigation**: The `_requestOrFallbackDraw` mechanism with `_markVrfRequestFailure` â†’ `_executeNoPendingEmergencyDraw` provides fallback after EMERGENCY_DRAW_TIMEOUT. pools will still execute allocation cycles, but with degraded randomness.

**Residual risk**: HIGH. Chainlink has historically upgraded coordinators (V1 â†’ V2 â†’ V2.5). No contract upgrade path exists.

---

### HIGH FINDINGS

**[H-1] Tax Split BPS Don't Sum to BUY_TAX / SELL_TAX â€” Rounding Remainder Goes to VRF**

**Severity**: High (Informational / Design Review)
**Location**: Lines 660-667 (buy), 673-678 (sell)

Buy tax split: `MICRO_POT_BPS(100) + MID_POT_BPS(150) + BUY_MARKETING_BPS(40) = 290`. BUY_TAX = 300.
The VRF portion is `fees - microTokens - midTokens - marketingTokens` = remainder.

Let's verify: `fees = (amount * 300) / 10000`. Then:
- `microTokens = (fees * 100) / 300` = fees/3
- `midTokens = (fees * 150) / 300` = fees/2
- `marketingTokens = (fees * 40) / 300` = 2*fees/15
- `vrfTokens = fees - fees/3 - fees/2 - 2*fees/15`

For `fees = 300 wei`:
- micro = 100, mid = 150, marketing = 40, vrf = 10

The math is correct for exact multiples, but for small fee amounts rounding accumulates in VRF. This is **by design** â€” VRF gets the dust. No issue.

Similarly for sell: `MEGA_POT_BPS(190) + SELL_MARKETING_BPS(100) = 290`, VRF gets remainder (10/300 = ~3.33%).

**Verdict**: Not a bug. Design is intentional. **Reclassified as Informational.**

---

**[H-2] `swapAndDistribute` Scaling Can Cause Token Accounting Drift**

**Severity**: High
**Location**: Lines 920-929

When `contractTokenBalance < totalTokens` (accumulated tracking exceeds actual balance), a proportional scale-down occurs:
```solidity
uint256 scale = (contractTokenBalance * BASIS_POINTS) / totalTokens;
microTokens = (microTokens * scale) / BASIS_POINTS;
// ... etc
vrfTokens = contractTokenBalance - microTokens - midTokens - megaTokens - marketingTokens;
```

**Issue**: This scaling only occurs when there's a discrepancy between accumulated token counts and actual contract balance. How can this happen?

If someone directly transfers evmX tokens to the contract address (not via buy/sell), those tokens are added to `balanceOf(address(this))` but NOT to any accumulated counter. The accumulators only track tax-derived tokens. So `contractTokenBalance > totalTokens` is the normal case (excess tokens), and the `if` branch is never triggered.

Conversely, if a bug or edge case causes accumulators to over-count, the scaling prevents swapping more than available. This is a safety mechanism.

**Can accumulators over-count?** Each accumulator is only incremented in `_update` when `takeFee` is true, alongside an actual `super._update(from, address(this), fees)` that transfers exactly `fees` tokens. So accumulated totals should exactly match fee-derived tokens.

**Edge case**: After a `swapAndDistribute()` call, accumulators are reset to 0 (lines 956-960). But what if new fees accumulate during the swap itself? The `lockTheSwap` modifier sets `inSwap = true`, which makes `takeFee = false` in `_update` (line 653). So no fees accumulate during swap. **This is safe.**

**Verdict**: The safety mechanism works correctly. **Reclassified as Low.**

---

**[H-3] `_selectAndPayWinner` Removes Candidates During Iteration**

**Severity**: High
**Location**: Lines 1176-1206

The recipient selection loop:
1. Picks random index into participant array
2. Checks eligibility
3. If ineligible or payout fails, removes participant (swap-and-pop)
4. Recalculates `participantCount`
5. Reshuffles entropy

**Concern**: When a participant is removed via swap-and-pop, the last participant moves to the removed position. This means:
- The moved participant could be selected again with different entropy
- The entropy reshuffling `keccak256(abi.encodePacked(entropy, candidate, i))` changes the distribution

**Is this exploitable?** An attacker would need to:
1. Know the VRF random word (impossible â€” Chainlink VRF)
2. Control which candidates are in the array (partially possible via timing buys)
3. Predict the cascade of removals

**Practical exploitability**: Very low. The VRF word is the primary entropy source, and the attacker cannot predict it. The removal cascade is deterministic given the random word, but the word itself is unknown until fulfillment.

**However**: In the emergency allocation cycle path (C-1), the random word is derived from on-chain data. A sequencer-level attacker who can influence the emergency random word AND control participant positions could theoretically select a specific selected participant.

**Verdict**: **Medium** â€” only exploitable in combination with C-1.

---

**[H-4] Owner Pre-Renounce Trust Window**

**Severity**: High
**Location**: `updateTrafficWhitelist()`, `setMarketingWallet()`

Before ownership is renounced, the owner can:
1. **Whitelist any address** â†’ bypass all fees AND limits (no max wallet, no max tx, no same-block check)
2. **Set marketing wallet** to any address â†’ receives ETH from swap distribution

**Attack scenario**:
- Owner whitelists a fresh address
- Fresh address buys unlimited tokens (no max wallet, no fee)
- Owner renounces
- Fresh address dumps, capturing maximum value

**Mitigation**: Post-renounce, no further whitelisting is possible. Community can verify whitelist state before trading.

**Verdict**: This is a standard centralization risk. **High** until renounced, **None** after.

---

### MEDIUM FINDINGS

**[M-1] Spot Price Oracle Manipulation for Eligibility Gaming**

**Severity**: Medium
**Location**: `_getTokenValueInETHFromReserves()` lines 889-901, `checkAndUpdateEligibility()` line 740

Eligibility uses Uniswap V2 spot reserves for price calculation. An attacker can:
1. Flash-loan large amount of WETH
2. Swap WETH â†’ evmX on Uniswap (massive buy) to pump spot price
3. Trigger a small buy to earn eligibility at inflated price
4. Unwind the flash loan

**Impact**: Attacker gains pool eligibility with fewer tokens than intended.

**Mitigations present**:
- The 3% buy tax on the large pump buy makes it expensive
- `requiredTokenHold` is computed from reserves AT TIME OF ELIGIBILITY GRANT, and the user must hold those tokens until allocation cycle
- `_isEligibleCandidate` re-checks balance at allocation cycle time
- Flash loans can't persist across transactions, so the pump-buy and eligibility-buy must be separate txs (or same-block via different accounts)

**Residual risk**: Low in practice. The attacker pays 3% on the pump capital, and still needs to hold tokens until allocation cycle. The eligibility requirement is a minimum hold, not a temporary condition.

---

**[M-2] `megaExternalInflowPendingForEntry` Drift After Cycle Reset**

**Severity**: Medium
**Location**: Line 1297, line 201, line 821-824

`megaExternalInflowPendingForEntry` tracks direct ETH deposits to mega pool (via `receive()`). It's reset to 0 at cycle reset (line 1297). The `_megaPotEntryBaseBalance()` function subtracts it from `megaPotBalance` for entry calculation.

**Issue**: If external ETH is deposited DURING a pending allocation cycle (between VRF request and fulfillment), `megaExternalInflowPendingForEntry` increases but is NOT considered in the current allocation cycle. This is correct â€” it should only affect the NEXT cycle's entry requirement.

But after cycle reset, `megaExternalInflowPendingForEntry = 0`. Any external ETH deposited during the previous cycle's pending allocation cycle window is now baked into `megaPotBalance` without tracking. Future entry calculations treat ALL `megaPotBalance` as tax-derived.

**Impact**: Entry requirements may be slightly higher than intended after large external deposits during allocation cycle windows. This benefits existing participants (higher barrier to entry for new participants).

**Verdict**: Minor economic distortion. Not exploitable for value extraction.

---

**[M-3] eligibility entry Array Never Shrinks â€” Long-Term Gas Degradation**

**Severity**: Medium
**Location**: `microPotTotalTickets`, `midPotTotalTickets`, `megaPotTotalTickets` â€” monotonically increasing

eligibility entry indices are global and never decrease. The `_cleanupTickets` function only deletes mapping entries below `roundStartIndex`, but the indices keep growing. After millions of trades, `microPotTotalTickets` could reach O(10^6), and the `roundStartIndex` tracks the current valid range.

**Impact**:
- No direct gas issue for recipient selection (which uses the participant array, not the eligibility entry array)
- Cleanup costs grow linearly with activity
- Storage slots for deleted eligibility entries are refunded, but the total slots used grows

**Verdict**: Not a security issue but a long-term operational concern. The `runTicketCleanup()` function mitigates but doesn't eliminate growth.

---

**[M-4] `SameBlockTrade` Protection Doesn't Apply to LP-Involved Transfers**

**Severity**: Medium
**Location**: Lines 641-644, 639

`limitsApply = !isExcludedFromLimits[from] && !isExcludedFromLimits[to]`

For buys: `from = pair` (excluded from limits), so `limitsApply = false`.
For sells: `to = pair` (excluded from limits), so `limitsApply = false`.

**Impact**: The `SameBlockTrade` check NEVER triggers for Uniswap buys or sells. It only applies to wallet-to-wallet transfers between non-excluded addresses.

This means a user CAN buy AND sell in the same block via the router (paying 6% total tax). The SameBlockTrade protection as documented is misleading â€” it doesn't prevent same-block MEV on the Uniswap pair.

**Verdict**: The 6% double-tax is the actual MEV protection, not the SameBlockTrade check. The check is vestigial for LP trades. **Medium** â€” documentation/intent mismatch, but economically sound.

---

**[M-5] Threshold Can Be Permanently Maxed After Sustained High Volume**

**Severity**: Medium
**Location**: `_raiseThreshold()`, `checkAndDrawMicroPot()` lines 1049-1055

If the micro pool fills before the 2-hour time limit repeatedly, the threshold doubles each time. After 13 consecutive fast-fills: `0.01 * 2^13 = 81.92 ETH`, which is still under `MICRO_MAX_THRESHOLD = 100 ETH`. After 14: `163.84` â†’ capped to `100 ETH`.

**Issue**: Once at 100 ETH, the threshold can only decrease if a force allocation cycle (time-expiry) occurs. But if volume sustains high enough to fill 100 ETH micro pools before 2 hours, the threshold stays at max.

**Impact**: During very high volume periods, the micro pool threshold could reach 100 ETH, meaning small users see very infrequent allocation cycles. When volume drops, the 2-hour timer forces allocation cycles and halves the threshold, so it self-corrects.

**Verdict**: Working as designed. The self-correcting mechanism prevents permanent maxing.

---

**[M-6] Rounding in `_requiredTokensFromKnownReserves` Can Under/Over-Estimate Requirements**

**Severity**: Medium
**Location**: Lines 853-860

```solidity
uint256 numerator = tokenReserve * requiredETH * 1000;
uint256 denominator = (wethReserve - requiredETH) * 997;
return (numerator / denominator) + 1;
```

The `+1` ensures rounding up (conservative â€” user needs slightly more tokens). But when `requiredETH` approaches `wethReserve`, the denominator shrinks rapidly, making the required tokens explode toward infinity. This is the correct AMM behavior (you can't buy more ETH than the pool holds).

**Edge case**: If `requiredETH >= wethReserve`, returns `type(uint256).max`, making the user ineligible. This is correct.

**Verdict**: Safe. The math correctly models AMM behavior with appropriate overflow protection.

---

### LOW FINDINGS

**[L-1] No `isLiquidityPool` Setter â€” Only Initial Pair is Tracked**

**Severity**: Low
**Location**: Line 360, no external setter

Only the Uniswap pair created in the constructor is marked as `isLiquidityPool`. If additional pairs are created (e.g., on different DEXes or V3 pools), trades through them won't be detected as buys/sells and won't be taxed.

**Impact**: Tax avoidance through alternative liquidity pools. However, the token would need sufficient liquidity on those pools, which requires someone providing liquidity (at their own financial risk).

---

**[L-2] `setMarketingWallet` Removes Fee Exclusion from Previous Wallet**

**Severity**: Low
**Location**: Lines 423-424

When marketing wallet changes, the old wallet loses fee exclusion. If the old marketing wallet holds evmX tokens and trades, it will now be subject to fees. This is intentional but could surprise the old marketing wallet operator.

---

**[L-3] `PAYOUT_GAS_LIMIT` (300k) May Fail for Complex Receiver Contracts**

**Severity**: Low
**Location**: Lines 950, 1192

recipient payouts and marketing ETH sends use a 300k gas limit. While `_isEligibleCandidate` rejects contract addresses (code.length > 0), the marketing wallet IS allowed to be a contract. If it's a complex multisig (Gnosis Safe), 300k gas might not be enough.

**Impact**: Marketing ETH would be redirected to mega pool. Not a loss, but disrupts marketing operations.

---

**[L-4] `syncETHAccounting()` Can Be Front-Run**

**Severity**: Low
**Location**: Lines 401-409

After `selfdestruct` force-sends ETH, anyone can call `syncETHAccounting()` to absorb it into mega pool. An attacker could:
1. Force-send ETH via selfdestruct
2. Front-run any sync call to not be the caller (no benefit â€” sync is free)

No actual attack vector. The sync is a pure accounting reconciliation.

---

**[L-5] Event Emission After External Call in `swapAndDistribute`**

**Severity**: Low
**Location**: Lines 949-954

The `SwapAndDistribute` event is emitted after the marketing wallet ETH call. While reentrancy is prevented by `lockTheSwap`, this is a minor deviation from checks-effects-interactions. The marketing call has a gas cap (300k), limiting reentrancy risk further.

---

**[L-6] `_deriveEmergencyRandom` Uses `blockhash` for Old Blocks That May Be Zero**

**Severity**: Low
**Location**: Lines 543-546

`blockhash(currentBlock - N)` returns 0 for blocks older than 256. On L2 with fast blocks, blocks -100 and -200 could easily be > 256 blocks old, returning `bytes32(0)`. This reduces entropy in emergency allocation cycles.

**Impact**: Slightly reduced entropy in emergency allocation cycles. Combined with C-1.

---

**[L-7] No Minimum Liquidity Check Before Swaps**

**Severity**: Low
**Location**: `swapTokensForEth()`

There's `SWAP_MIN_OUTPUT_ETH = 0.0001 ether` as a floor, and `SWAP_SLIPPAGE_BPS = 9400` (94%) for slippage. But no explicit check that the pool has sufficient liquidity to absorb the swap without massive price impact. In low-liquidity situations, the 94% slippage floor could still result in large price impact.

**Mitigation**: `LIQUIDITY_GRACE_PERIOD` and `MIN_WETH_LIQUIDITY` checks exist for eligibility, but not for swap execution.

---

**[L-8] Accumulated Token Counters Reset Atomically â€” No Partial Swap**

**Severity**: Low
**Location**: Lines 956-960

All five accumulators are reset to 0 after swap, even if the swap partially failed (it only checks `swapOk || ethReceived == 0`, returning early). If the swap succeeds but with less ETH than expected, all accumulators reset. This means the token-to-ETH ratio for the next swap starts fresh, which is correct behavior.

---

### INFORMATIONAL

**[I-1]** `inEmergencyDraw` flag prevents recursive auto-resolution but is never externally accessible for monitoring.

**[I-2]** The `receive()` function distinguishes VRF coordinator refunds from donations, but a VRF coordinator contract that self-destructs would bypass the `msg.sender` check (depositing to mega pool instead of pendingVrf). This is a theoretical non-issue.

**[I-3]** `DRAW_CLEANUP_BATCH = 50` and `SWAP_CLEANUP_BATCH = 100` are hardcoded. In a scenario with millions of historical eligibility entries, cleanup could take many transactions.

**[I-4]** The `maxTxAmount` (1.5% of supply = 1.5M tokens) and `maxWalletAmount` (4% of supply = 4M tokens) are immutable. No governance mechanism to adjust these post-deployment.

**[I-5]** String event parameters ("Micro", "Mid", "Mega", "UP", "DOWN") consume more gas than uint8 or bytes1 alternatives.

**[I-6]** The production evmX.sol hardcodes Base Mainnet addresses. If deployed on a different chain by mistake, the constructor will fail at `createPair`.

---

# PHASE 2 â€” EXPLOIT ATTEMPTS

## Exploit 1: Reentrancy via recipient payout

**Target**: `_selectAndPayWinner()` â†’ `.call{value: reward payout, gas: PAYOUT_GAS_LIMIT}("")`

**Attack**: Deploy a contract that, upon receiving ETH, calls back into `emergencyForceDraw` or `runAutonomousCycle`.

**Analysis**:
- `rawFulfillRandomWords` â†’ `_fulfillRandomWords` has `nonReentrant`
- `runAutonomousCycle` has `nonReentrant`
- `emergencyForceDraw` has `nonReentrant`
- recipient payout happens inside `_finalizeDraw`, called from `_fulfillRandomWords` (which holds the reentrancy lock)
- The 300k gas limit further restricts what the receiving contract can do

**Result**: NOT EXPLOITABLE. Triple defense: nonReentrant lock + PAYOUT_GAS_LIMIT + contract addresses rejected by `_isEligibleCandidate`.

## Exploit 2: Flash Loan Eligibility Manipulation

**Target**: Gain eligibility with minimal capital via price manipulation

**Attack**:
1. Flash borrow 100 ETH of WETH
2. Swap 99 ETH â†’ evmX (pumps price massively)
3. With remaining 1 ETH, buy small amount of evmX â†’ gains eligibility at pumped price
4. Repay flash loan, unwind pump

**Analysis**:
- Step 2: Attacker pays 3% buy tax on 99 ETH worth of evmX = 2.97 ETH in tax
- Step 3: Small buy gets eligibility computed at pumped reserves
- The `requiredTokenHold` is calculated from the pumped reserves and stored
- After unwinding, price returns to normal
- At allocation cycle time, `_isEligibleCandidate` checks: `balance >= requiredTokenHold`
- The required hold was computed at pumped price, meaning FEWER tokens were required
- If attacker holds those fewer tokens at allocation cycle time, they're eligible

**BUT**: The attacker had to actually BUY tokens in step 3 (through the router, paying tax). They need to HOLD those tokens until allocation cycle. If they sell, eligibility is revoked (`_revokeEligibilityOnSell`).

**Cost-benefit**: 2.97 ETH tax loss for eligibility into a micro pool (0.01 ETH threshold). Heavily unprofitable.

**Result**: NOT ECONOMICALLY EXPLOITABLE. Tax cost exceeds expected value of pool participation.

## Exploit 3: Force VRF Failure to Use Emergency allocation cycle

**Target**: Intentionally prevent VRF from delivering, then exploit on-chain randomness

**Attack**:
1. Drain VRF subscription balance (if attacker is subscription owner â€” they're not)
2. Wait for VRF request to time out (24h)
3. Call `emergencyForceDraw` with carefully chosen gas price / timing to influence `block.prevrandao` outcome

**Analysis**:
- Attacker cannot drain VRF subscription (not the sub owner)
- VRF fund mechanism auto-refills from tax proceeds
- Even if VRF fails for 24h, the emergency allocation cycle uses multi-source entropy
- Controlling `block.prevrandao` on Base requires sequencer-level access
- `gasleft()` in the hash adds unpredictability

**Result**: NOT PRACTICALLY EXPLOITABLE for non-sequencer attackers. Theoretical risk for sequencer (see C-1).

## Exploit 4: Threshold Manipulation to Delay allocation cycles Indefinitely

**Target**: Keep pools accumulating without allocation cycles to extract maximum value

**Attack**:
1. Buy enough to become eligible
2. Continuously buy to push micro pool balance just below threshold
3. When threshold approaches, stop buying so pool decays via time

**Analysis**:
- The attacker can't control the threshold â€” it's based on all trading activity
- Even if no activity occurs, the 2-hour (micro) or 6-hour (mid) time limit forces an allocation cycle
- The 7-day mega pool timer is unconditional
- `runAutonomousCycle` can be called by anyone to trigger allocation cycles

**Result**: NOT EXPLOITABLE. Time-based triggers prevent indefinite delay.

## Exploit 5: `syncETHAccounting` as Value Extraction

**Target**: Abuse the sync mechanism to redirect ETH

**Analysis**:
- `syncETHAccounting` only adds excess ETH to mega pool
- It can never reduce pool balances
- It can never send ETH out
- The only source of "excess" is selfdestruct or pre-deployment ETH

**Result**: NOT EXPLOITABLE. The function is strictly additive.

## Exploit 6: Marketing Wallet Griefing via Revert

**Target**: Marketing wallet set to a contract that always reverts on ETH receive

**Analysis**:
- If marketing wallet reverts, the ETH goes to mega pool (line 951)
- This benefits all pool participants, not the attacker
- The owner could fix by calling `setMarketingWallet` (before renounce)
- After renounce, marketing wallet is permanent

**Result**: MINOR GRIEFING at best, but self-healing (ETH goes to mega pool).

## Exploit 7: Sandwich the Auto-Swap

**Target**: Front-run `swapAndDistribute` to profit from price impact

**Analysis**:
- Attacker buys evmX before the large swap (which sells evmX â†’ ETH)
- Wait no â€” the swap SELLS tokens. So attacker should:
  1. Sell evmX (before the large sell pushes price down)
  2. Wait for auto-swap
  3. Buy back at lower price

- BUT: Step 1 costs 3% sell tax. Step 3 costs 3% buy tax. Total 6% cost.
- The auto-swap has 94% slippage protection, limiting price impact
- The swap amount is capped at accumulated tokens (which resets to 0 after swap)

**Result**: NOT ECONOMICALLY PROFITABLE due to 6% round-trip tax.

---

# PHASE 3 â€” SYSTEMIC LIVENESS verification

## 3.1 Can the System Enter a Non-Progressing State?

**Analysis**:

The system progresses through three independent pool cycles. Each can be blocked if:
1. `participantCount == 0` â€” allocation cycles are skipped, but pools continue accumulating
2. `balance == 0` â€” allocation cycles are skipped, but buys add tax
3. VRF permanently fails â€” 24h emergency fallback activates
4. All participants become ineligible at allocation cycle time â€” `NoEligibleWinner`, pool balance preserved, cycle resets

**Conclusion**: The system CANNOT permanently stall. The worst case is:
- No participants â†’ pools accumulate indefinitely â†’ anyone can buy to become a participant â†’ allocation cycles resume
- VRF fails â†’ emergency allocation cycle after 24h
- All selected participants ineligible â†’ cycle resets, pool rolls to next cycle

**PROVEN: System cannot enter a permanently non-progressing state.**

## 3.2 Can the VRF Lifecycle Permanently Stall?

| State | Resolution |
|---|---|
| VRF request sent, no callback | 24h emergency timeout â†’ `emergencyForceDraw` or `_autoResolveTimedOutDraws` |
| VRF coordinator address changes | Request fails â†’ `_markVrfRequestFailure` â†’ after EMERGENCY_DRAW_TIMEOUT â†’ `_executeNoPendingEmergencyDraw` |
| VRF subscription depleted | Same as above â€” request reverts â†’ failure tracking â†’ emergency fallback |
| VRF callback with empty words | `revert UnknownRequest` â€” request stays pending â†’ 24h timeout â†’ emergency |

**PROVEN: VRF lifecycle cannot permanently stall. All paths lead to emergency resolution within 24h.**

**HOWEVER**: A subtle issue exists. If `rawFulfillRandomWords` is called with `randomWords.length == 0`, it reverts with `UnknownRequest`. This means the allocation cycle request is NOT deleted and NOT resolved. The 24h emergency timeout will eventually resolve it. But the VRF coordinator's callback reverted, which means the VRF request is "consumed" (Chainlink won't retry). So the request sits in `drawRequests` until emergency timeout. **This is correct behavior.**

## 3.3 Can Autonomous Execution Brick?

`runAutonomousCycle()` is protected by `nonReentrant` and catches all errors internally via try/catch. The only way it can revert is:
1. Reentrancy (blocked by modifier)
2. Out of gas (possible if gas limit is too low)

**PROVEN: Cannot brick. Worst case is a no-op due to insufficient gas.**

## 3.4 Can pools Grow Without Eventual Distribution?

For pools to grow without distribution:
- Micro/Mid: Need `participantCount == 0` AND continued trading â†’ pool grows, but threshold eventually forces an allocation cycle when participants join
- Mega: 7-day timer is unconditional IF `participantCount > 0 && balance > 0`

**Edge case**: Mega pool with large balance but 0 participants. The 7-day timer expires, but `checkAndDrawMegaPot` returns early because `participantCount == 0`. The pool accumulates indefinitely until someone buys and becomes eligible.

**Is this an absorbing state?** No â€” anyone can buy tokens and join the mega pool. The pool is not locked.

**PROVEN: pools cannot permanently trap value. Human action (buying tokens) unlocks distribution.**

## 3.5 Absorbing States Analysis

| State | Absorbing? | Resolution |
|---|---|---|
| `owner == address(0)` | Yes (by design) | Irreversible renounce |
| Mega pool with 0 participants | Semi-absorbing | Any buy resolves it |
| Threshold at MICRO_MAX_THRESHOLD (100 ETH) | No | Time-based decay halves it |
| Marketing wallet set to reverting contract | Semi-absorbing (post-renounce) | ETH reroutes to mega pool |

---

# PHASE 4 â€” ECONOMIC SECURITY

## 4.1 Attacker Incentive Analysis

### Griefing Cost vs Impact

| Attack | Cost | Impact | Ratio |
|---|---|---|---|
| Spam `runAutonomousCycle` | Gas only (~50k per call on Base) | None â€” cycle is permissionless by design | âž cost, 0 impact |
| Spam `syncETHAccounting` | Gas only | None â€” adds excess to mega pool | âž cost, 0 impact |
| Force-send ETH via selfdestruct | ETH is lost to mega pool | Inflates mega pool (benefits users) | Negative impact for attacker |
| Buy + immediate sell | 6% tax loss | Adds tax to pools | Self-harming |
| Sell all tokens to crash price | Attacker loses token value | Reduces eligibility for all | Self-harming |

**Conclusion**: All griefing vectors are self-harming. The tax mechanism is the primary economic defense.

### Blocking Distribution

| Vector | Cost | Duration |
|---|---|---|
| Prevent all buys | Impossible â€” permissionless | N/A |
| Buy all tokens to prevent others from qualifying | Max wallet (4%) limits this | Temporary â€” tokens can be sold |
| Drain VRF subscription | Impossible â€” attacker is not sub owner | N/A |

**Conclusion**: Distribution cannot be economically blocked.

### Timing Manipulation

| Vector | Feasibility | Impact |
|---|---|---|
| Buy just before threshold hit | Requires predicting exact threshold timing | Gets eligibility entry â€” normal behavior |
| Sell just before allocation cycle to revoke others' eligibility | Selling revokes YOUR eligibility, not others' | Self-harming |
| Call `emergencyForceDraw` at optimal time for gas-based entropy | Sequencer-only attack | See C-1 |

### Threshold Oscillation

Can an attacker oscillate the threshold to delay swaps?

The swap threshold (`AUTO_SWAP_THRESHOLD = 120k tokens`) is not the same as the pool threshold. Swap is triggered by accumulated contract tokens, not pool balance. An attacker cannot directly control contract token accumulation â€” it's a function of all trading activity.

**pool threshold oscillation**: An attacker could theoretically:
1. Buy heavily to fill micro pool quickly â†’ threshold doubles
2. Wait 2h for time limit â†’ threshold halves
3. Repeat

But this costs 3% on each buy, and the oscillation only affects allocation cycle frequency, not pool value. It's economically irrational.

### Gas Scaling Degradation

| Component | Scaling Factor | Risk |
|---|---|---|
| recipient selection loop | O(participantCount), max 130 attempts | Low â€” bounded by MAX_WINNER_ATTEMPTS |
| eligibility entry cleanup | O(batch_size), user-specified | Low â€” bounded by batch parameter |
| Auto-resolve timed-out allocation cycles | O(3) â€” fixed 3 pool types | None |
| `_update` transfer function | O(1) + possible swap + possible allocation cycle trigger | Medium â€” a single transfer can cascade |

**Cascade risk in `_update`**: A single buy can trigger:
1. Fee calculation + transfer (O(1))
2. `swapAndDistribute` if threshold met (external call to Uniswap)
3. VRF funding (external call to VRF coordinator)
4. Auto-resolve timed-out allocation cycles (up to 3 emergency allocation cycles!)
5. `checkAndDrawMicroPot` â†’ VRF request
6. `checkAndDrawMidPot` â†’ VRF request
7. `checkAndDrawMegaPot` â†’ VRF request
8. Eligibility update â†’ getReserves, eligibility entry issuance

**Worst case gas**: A single transfer could consume significant gas if it triggers swap + 3 allocation cycles + eligibility. The `MIN_DRAW_EXECUTION_GAS = 900_000` check prevents executing allocation cycles with insufficient gas.

**Verdict**: The gas guards are sufficient for Base L2 (30M block gas limit). On L1, this would be concerning.

---

# PHASE 5 â€” FORMAL PROPERTY LIST

## 25+ Formal Properties That Must Always Hold

### Supply Properties
1. `totalSupply() == 100_000_000 * 1e18` â€” Supply is constant after construction
2. `sum_of_all_balances == totalSupply()` â€” Token conservation

### ETH Accounting Properties
3. `microPotBalance + midPotBalance + megaPotBalance + pendingVrfEth <= address(this).balance` â€” Tracked ETH never exceeds actual
4. `microPotBalance >= 0` â€” pool balances are non-negative (enforced by uint256)
5. `midPotBalance >= 0`
6. `megaPotBalance >= 0`
7. `pendingVrfEth >= 0`

### Threshold Properties
8. `microPotCurrentThreshold >= MICRO_BASE_THRESHOLD (0.01 ether)`
9. `microPotCurrentThreshold <= MICRO_MAX_THRESHOLD (100 ether)`
10. `midPotCurrentThreshold >= MID_BASE_THRESHOLD (0.05 ether)`
11. `midPotCurrentThreshold <= MID_MAX_THRESHOLD (500 ether)`

### Cycle Properties
12. `microPotCycleId >= 1` â€” Cycle IDs start at 1 and never decrease
13. `midPotCycleId >= 1`
14. `megaPotCycleId >= 1`
15. `microPotCycleId_at_t2 >= microPotCycleId_at_t1` for t2 > t1 (monotonic)

### Access Control Properties
16. `owner() == address(0)` after `renounceOwnership()` â€” Irreversible
17. After renounce: `updateTrafficWhitelist()` always reverts
18. After renounce: `setMarketingWallet()` always reverts
19. `rawFulfillRandomWords()` reverts if `msg.sender != vrfCoordinatorAddress`

### Transfer Properties
20. `balanceOf(user) <= maxWalletAmount` for non-excluded users (after any buy)
21. Transfer amount `<= maxTxAmount` for non-excluded users
22. Buy + sell tax = exactly 3% (300 BPS) each, minus rounding dust
23. Fee-excluded addresses pay 0% tax

### Eligibility Properties
24. Contract addresses (`code.length > 0`) are never eligible candidates
25. Users with `balanceOf < MIN_TOKENS_FOR_REWARDS (10k)` are never eligible
26. Users with `balanceOf > MICRO_MAX_WHALE_TOKENS` are ineligible for micro pool
27. Selling revokes eligibility for current cycle of all pools

### VRF Properties
28. A pending allocation cycle request blocks new allocation cycle requests for that pool type
29. Emergency allocation cycle is only available after `EMERGENCY_DRAW_TIMEOUT (24h)`
30. VRF callback from non-coordinator always reverts

### Economic Properties
31. Marketing wallet payout failure redirects to mega pool (no value lost)
32. Swap remainder (rounding dust) goes to mega pool (no value lost)
33. VRF funding exceeding cap is rerouted to pools equally (no value lost)
34. `syncETHAccounting` can only INCREASE mega pool, never decrease any pool

### Liveness Properties
35. For any state S, there exists a sequence of user actions leading to a pool cycle
36. VRF failure always resolves within 24h via emergency mechanism
37. Threshold decay ensures allocation cycles occur within time limits even without threshold fill

---

# PHASE 6 â€” RESIDUAL RISK REPORT

## Executive Summary

The evmX contract is a well-architected DeFi incentives ERC-20 with a three-tier reward pool system on Base Mainnet. Based on the documented internal review and test evidence, no known critical code defects were observed under normal operating conditions within the tested scope. The code demonstrates strong defensive programming with try/catch wrappers, gas guards, reentrancy protection, and time-based fallbacks.

The primary risks are:
1. **VRF coordinator deprecation** (C-2) â€” an operational risk that requires monitoring
2. **Emergency allocation cycle randomness quality** (C-1) â€” theoretical sequencer-level attack
3. **Pre-renounce owner trust** (H-4) â€” standard centralization risk that vanishes on renounce

## Critical Findings (2)

| ID | Finding | Exploitable? | Residual Risk |
|---|---|---|---|
| C-1 | Emergency allocation cycle uses miner-influenceable entropy | Only by Base sequencer | Medium after mitigation |
| C-2 | VRF coordinator upgrade would break callbacks | No attack needed â€” operational risk | High â€” monitor Chainlink announcements |

## High Findings (1)

| ID | Finding | Exploitable? | Residual Risk |
|---|---|---|---|
| H-4 | Pre-renounce owner can whitelist malicious addresses | Yes, by owner | None after renounce |

## Medium Findings (6)

| ID | Finding | Exploitable? | Residual Risk |
|---|---|---|---|
| M-1 | Spot price manipulation for eligibility | Not economically viable (3% tax) | Low |
| M-2 | megaExternalInflowPendingForEntry drift | Minor economic distortion | Low |
| M-3 | eligibility entry array unbounded growth | Long-term gas concern | Low |
| M-4 | SameBlockTrade doesn't apply to LP trades | Documentation mismatch | Low |
| M-5 | Threshold can reach max during high volume | Self-correcting via time decay | Low |
| M-6 | Rounding in _requiredTokensFromKnownReserves | Correct AMM behavior | None |

## Low Findings (8)

| ID | Finding |
|---|---|
| L-1 | No isLiquidityPool setter â€” only initial pair tracked |
| L-2 | setMarketingWallet removes old wallet's fee exclusion |
| L-3 | PAYOUT_GAS_LIMIT may fail for complex multisig marketing wallets |
| L-4 | syncETHAccounting can be front-run (no impact) |
| L-5 | Event emission after external call in swapAndDistribute |
| L-6 | blockhash returns 0 for old blocks in emergency random |
| L-7 | No minimum liquidity check before swaps |
| L-8 | Accumulated token counters reset atomically |

## Informational (6)

I-1 through I-6 as listed in Phase 1.

## Design-Level Risks

1. **Immutable architecture**: No upgrade path. Any discovered vulnerability post-deployment is permanent. This is intentional for trust but eliminates bug-fix capability.

2. **Single-pair dependency**: All price oracle and tax collection depends on one Uniswap V2 pair. If that pair's liquidity is drained (LP token burn/removal), the system degrades but doesn't fail.

3. **Chainlink VRF as single randomness source**: No alternative oracle integration. VRF failure falls back to on-chain randomness.

## Economic Design Risks

1. **3% tax creates price friction**: Arbitrage bots won't maintain tight price spreads, potentially leading to wider bid-ask on DEX aggregators.

2. **single-recipient pool design**: Large pools may attract sophisticated participants who optimize entry timing (buying just above eligibility threshold near expected allocation cycle time). This is game-theoretic design, not a bug.

3. **Mega pool 7-day cycle**: Large amounts can accumulate (external deposits + sell tax). A single selected participant receiving potentially hundreds of ETH may cause sell pressure.

## Long-Term Operational Risks

1. **VRF subscription maintenance**: After ownership renounce, the VRF subscription must still be funded. The contract auto-funds from tax, but if trading volume drops to near-zero, VRF funding dries up.

2. **Keeper bot dependency**: `runAutonomousCycle()` must be called periodically. Without a keeper, swaps and allocation cycles only trigger on user transfers. A keeper is recommended but not required (any user transaction triggers cycle checks).

3. **Gas cost growth**: Over years of operation, the accumulated eligibility entry indices and participant arrays grow. While cleanup mitigates this, very long-running deployments may see increased gas costs per transaction.

## Gas Sustainability Notes

- Base L2 gas costs are currently very low (~0.001 gwei L2, plus L1 data cost)
- The contract's gas-heaviest path (swap + allocation cycle + eligibility in single _update) is estimated at ~2M gas
- At current Base gas prices, this costs < $0.10
- The `VRF_CALLBACK_GAS_LIMIT = 2,500,000` is sufficient for recipient selection with up to 130 attempts

## Trust Assumptions Summary

| Assumption | Risk if Violated | Likelihood |
|---|---|---|
| Uniswap V2 Router is honest | Complete loss of swap-derived value | Very Low |
| Chainlink VRF is unbiased | recipient selection can be gamed | Very Low |
| Base sequencer is honest | Emergency allocation cycle manipulation | Low |
| Owner renounces promptly | Pre-renounce whitelist abuse | Low (community pressure) |
| Liquidity persists | System degradation (no loss) | Medium |

---

## Final Assessment

**Internal status**: No critical code defects were observed in the tested scope. Operational risks remain (e.g., VRF dependency, fallback randomness) and require ongoing monitoring. Independent third-party review is recommended before production launch.

**Recommended actions before launch:**
1. Renounce ownership as soon as possible after deployment and initial configuration
2. Set up a monitoring system for Chainlink VRF Coordinator address changes on Base
3. Deploy a keeper bot for `runAutonomousCycle()` to ensure regular allocation cycles
4. Consider setting VRF subscription to auto-fund from a separate funding source as backup
5. Document the SameBlockTrade behavior accurately in user-facing materials

**Why breaking this system is difficult:**
- The 3% tax is an economic moat against MEV and arbitrage exploitation
- `nonReentrant` + `lockTheSwap` + `PAYOUT_GAS_LIMIT` provides triple reentrancy defense
- Time-based fallbacks (24h emergency, 2h/6h/7d pool timers) prevent deadlocks
- The `_isEligibleCandidate` contract-rejection prevents sophisticated reentrancy
- Value can only exit via pool payouts, marketing fee, or VRF funding â€” no admin withdrawal
- All external calls are try/catch wrapped with graceful degradation







