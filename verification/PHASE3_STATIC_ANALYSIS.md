# evmX â€” Phase 3: Static Analysis Preparation

> Scope Notice: This file is an internal technical verification record based on self-executed tests and maintainer review.
> It is not an independent third-party security certification and must not be presented as legal assurance.


---

## Slither Configuration

### Install
```bash
pip3 install slither-analyzer
```

### Run
```bash
# Full analysis
slither contracts/evmX.sol --solc-remaps "@openzeppelin/=node_modules/@openzeppelin/" --solc-args "--via-ir --optimize --optimize-runs 50"

# With specific detectors focused on high-impact issues
slither contracts/evmX.sol \
  --solc-remaps "@openzeppelin/=node_modules/@openzeppelin/" \
  --solc-args "--via-ir --optimize --optimize-runs 50" \
  --detect reentrancy-eth,reentrancy-no-eth,reentrancy-benign,reentrancy-events,\
arbitrary-send-eth,arbitrary-send-erc20,suicidal,unprotected-upgrade,\
locked-ether,incorrect-equality,unchecked-transfer,divide-before-multiply,\
msg-value-loop,delegatecall-loop,controlled-delegatecall,\
tx-origin,shadowing-state,shadowing-local,tautology,\
weak-prng,encode-packed-collision

# JSON output for CI/CD
slither contracts/evmX.sol \
  --solc-remaps "@openzeppelin/=node_modules/@openzeppelin/" \
  --solc-args "--via-ir --optimize --optimize-runs 50" \
  --json slither-report.json

# Print human summary
slither contracts/evmX.sol \
  --solc-remaps "@openzeppelin/=node_modules/@openzeppelin/" \
  --solc-args "--via-ir --optimize --optimize-runs 50" \
  --print human-summary
```

---

## Detector Priority Matrix

### CRITICAL â€” Must be zero findings
| Detector | Why |
|---|---|
| `reentrancy-eth` | ETH reentrancy in payout/marketing calls |
| `arbitrary-send-eth` | Unauthorized ETH transfers |
| `suicidal` | Self-destruct capability |
| `unprotected-upgrade` | Proxy vulnerabilities |
| `controlled-delegatecall` | Arbitrary code execution |

### HIGH â€” Investigate every finding
| Detector | Expected Findings | Notes |
|---|---|---|
| `reentrancy-no-eth` | Possible FP on _update | lockTheSwap + nonReentrant should cover |
| `locked-ether` | None expected | Contract should always be able to distribute ETH |
| `incorrect-equality` | Possible FP | Check `==` comparisons for strict equality issues |
| `unchecked-transfer` | None expected | No raw ERC20 transfers |
| `divide-before-multiply` | Possible in tax calc | Verify precision loss is acceptable |
| `weak-prng` | Expected in emergency allocation cycle | Known limitation â€” emergency fallback uses on-chain entropy |

### MEDIUM â€” Review and document
| Detector | Expected | Action |
|---|---|---|
| `reentrancy-benign` | Multiple | Document why benign |
| `reentrancy-events` | Multiple | Events after external calls â€” review ordering |
| `tx-origin` | 1 in _deriveEmergencyRandom | Used only for entropy, not auth â€” safe |
| `shadowing-state` | None expected | |
| `shadowing-local` | Possible | Check constructor params |
| `encode-packed-collision` | Multiple in keccak | Review packed encoding for collision potential |
| `msg-value-loop` | None expected | |

### LOW / INFORMATIONAL â€” Acknowledge
| Detector | Expected | Notes |
|---|---|---|
| `too-many-digits` | Multiple (1e18 constants) | By design |
| `assembly` | None | No inline assembly used |
| `solc-version` | 0.8.28 | Recent, acceptable |
| `naming-convention` | Possible | SCREAMING_SNAKE for constants is correct |
| `dead-code` | None expected | |
| `costly-loop` | Possible in cleanup | Bounded by gas checks |

---

## Manual Review Checklist

### Access Control
- [ ] All `onlyOwner` functions verified
- [ ] `rawFulfillRandomWords` only callable by VRF_COORDINATOR_ADDRESS
- [ ] No unprotected state changes
- [ ] `renounceOwnership` makes owner changes permanent
- [ ] Marketing wallet change properly manages fee/limit exclusions

### Arithmetic
- [ ] Tax BPS calculations: micro(100)+mid(150)+marketing(40)+vrf(10) = 300 = BUY_TAX âś“
- [ ] Tax BPS calculations: mega(190)+marketing(100)+vrf(10) = 300 = SELL_TAX âś“
- [ ] No unchecked arithmetic on ETH balances (all checked)
- [ ] `unchecked` blocks only used for loop counters (safe)
- [ ] Division remainder handling in swapAndDistribute (goes to mega pool) âś“
- [ ] Scale-down logic when contractTokenBalance < totalTokens

### ETH Handling
- [ ] receive() correctly routes VRF coordinator vs external ETH
- [ ] inSwap flag prevents receive() from accounting during swap
- [ ] Marketing ETH fallback to megaPotBalance on failure
- [ ] recipient payout failure does NOT lose ETH (re-added to pool)
- [ ] syncETHAccounting only adds excess to mega (never subtracts)
- [ ] VRF funding try/catch preserves pendingVrfEth on failure

### Reentrancy
- [ ] `_selectAndPayWinner` â€” candidate.call before state changes? NO â€” balance decremented first, re-added on failure âś“
- [ ] `swapAndDistribute` â€” lockTheSwap prevents re-entry âś“
- [ ] `runAutonomousCycle` â€” nonReentrant âś“
- [ ] `emergencyForceDraw` â€” nonReentrant âś“
- [ ] `_fulfillRandomWords` â€” nonReentrant âś“
- [ ] Transfer â†’ swapAndDistribute â†’ marketing.call â€” protected by lockTheSwap âś“

### State Machine Integrity
- [ ] Pending allocation cycle blocks new allocation cycles for same pool (pendingRequestId check)
- [ ] Emergency allocation cycle properly cleans up request data
- [ ] Cycle ID always increments after allocation cycle
- [ ] Participant arrays properly cleaned via swap & remove pattern
- [ ] eligibility entry cleanup is progressive and gas-bounded

### Edge Cases
- [ ] Transfer to self (from == to)
- [ ] Transfer of 0 amount
- [ ] Buy/sell of 1 wei
- [ ] maxTxAmount boundary (exactly at limit)
- [ ] maxWalletAmount boundary (exactly at limit)
- [ ] Empty participant array during allocation cycle
- [ ] All participants ineligible during allocation cycle
- [ ] VRF returns 0 as random word
- [ ] Multiple emergency allocation cycles in sequence
- [ ] Swap when pool has extreme imbalance

### Gas Considerations
- [ ] _selectAndPayWinner loop bounded by MAX_WINNER_ATTEMPTS (130)
- [ ] recipient selection gas reserve (350k) prevents out-of-gas
- [ ] allocation cycle execution minimum gas check (900k)
- [ ] Cleanup bounded by MAX_CLEANUP_GAS (30k)
- [ ] Auto-resolve checks gasleft before each pool

---

## Additional Tools

### Mythril
```bash
myth analyze contracts/evmX.sol --solc-args "--via-ir --optimize --optimize-runs 50" --max-depth 24
```

### Aderyn (Rust-based)
```bash
aderyn contracts/evmX.sol
```

### Storage Layout Analysis
```bash
# Check for storage collision risks
slither contracts/evmX.sol --print variable-order
```

### Function Selectors (for bytecode analysis)
```bash
slither contracts/evmX.sol --print function-id
```





