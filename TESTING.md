# evmX - Testing Guide

> 174 passing tests | Foundry + Hardhat | Full security coverage

---

## One Command

```bash
npm run setup
```

This installs everything and runs all 174 tests. Nothing else needed.

---

## Test Overview

| Suite | Tests | Framework | What it tests |
|-------|------:|-----------|---------------|
| **Attack Simulations** | 12 | Foundry | Reentrancy, flash loan, sandwich, MEV, gas grief, VRF manipulation |
| **Fuzz Testing** | 14 | Foundry | Random inputs (1000 runs each), boundary conditions |
| **Core Invariants** | 11 | Foundry | Supply conservation, ETH solvency, cycle validity |
| **Post-Renounce** | 2 | Foundry | Owner = address(0), marketing immutable |
| **Formal Properties** | 41 | Foundry | 12 stateful invariants + 29 property unit tests |
| **Edge Cases** | 26 | Foundry | 6 edge invariants + 20 boundary tests |
| **Economic Stress** | 15 | Foundry | 90% crash, 10x pump, mega cycle, liquidity drain |
| **Local Integration** | 28 | Hardhat | Unit tests, gas benchmarks, 50-bot stress |
| **Base Mainnet Fork** | 25 | Hardhat | Real Uniswap V2, real WETH, real chain state |
| **Total** | **174** | | |

### Mutation Testing

Tests are verified via mutation testing -- intentionally breaking the contract proves tests catch real bugs:

| Mutation | What broke | Tests that caught it |
|----------|-----------|---------------------|
| Remove `buyAmountETH > 0` guard | Transfer/reEnroll grants entries | P38, G21, fuzz_reEnroll |
| `MAX_ENTRIES_PER_CYCLE` 3 -> 255 | Unlimited entries per cycle | P40, fuzz_buyToPlay |
| `EMERGENCY_COMMIT_DELAY` 5 -> 0 | No commit-reveal delay | P42 |

---

## Commands

```bash
# Full setup + all tests (first time)
npm run setup

# All tests (after initial setup)
npm run test:full

# Individual suites
npm run test              # Hardhat local (28)
npm run test:fork         # Base Mainnet fork (25)
npm run test:attacks      # Attack simulations (12)
npm run test:fuzz         # Fuzz testing (14)
npm run test:invariant    # Core invariants (13)
npm run test:economic     # Economic stress (15)
npm run test:properties   # Formal properties + edge cases (67)
```

---

## Fork Tests

### How they work

The 25 fork tests run against a Hardhat fork of **real Base Mainnet state** (block 25M).
They test evmX against the actual Uniswap V2 Router, real WETH, and real liquidity.

### Configuration

`npm run setup` creates a `.env` automatically with working defaults:

```env
BASE_RPC_URL=https://mainnet.base.org     # Public (rate-limited)
ROUTER_ADDRESS=0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24
WETH_ADDRESS=0x4200000000000000000000000000000000000006
VRF_KEY_HASH=0xdc2f...
FORK_BLOCK_NUMBER=25000000
```

For faster, more reliable fork tests, replace the RPC URL:

```env
# Free tier: https://www.alchemy.com or https://infura.io
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
```

### VRF Mock

If `VRF_COORDINATOR` is not set (default), a local mock is deployed automatically.
No Chainlink subscription needed. No real LINK or ETH required.

> **VRF Mode: LOCAL MOCK** -- deterministic, no real Chainlink calls. Verifies the same contract logic as production.

### Without .env

If `.env` is missing or incomplete, fork tests **gracefully skip** with clear diagnostics:

```
  FORK TEST CONFIGURATION ERRORS
  Variable: BASE_RPC_URL
  Purpose:  Base Mainnet RPC endpoint for fork testing
  ...
  0 passing, 25 pending (skipped)
```

No cryptic errors. No `null` assertions.

---

## Test Architecture

```
test/
  foundry/
    evmXBaseTest.sol             # Abstract base: deploys mocks, adds liquidity
    attacks/
      evmXAttacks.t.sol          # 12 exploit simulations
    fuzz/
      evmXFuzz.t.sol             # 14 fuzz tests (1000 runs, seed pinned)
    invariant/
      evmXHandler.sol            # Stateful handler (10 randomized actions)
      evmXInvariant.t.sol        # 11 core + 2 post-renounce invariants
      evmXFormalProperties.t.sol # 12 formal invariants + 29 properties
      evmXEdgeCaseProperties.t.sol # 6 edge invariants + 20 tests
    state_machine/
      evmXEconomic.t.sol         # 15 economic stress scenarios
    mocks/
      MockWETH9.sol
      MockUniswapV2.sol
      MockVRFCoordinatorV2Plus.sol

  LaunchStress.test.js           # 28 Hardhat local tests
  evmX_BaseFork.test.js          # 25 Hardhat fork tests
  helpers/
    requireEnv.js                # Fail-fast environment validation
```

### Invariant Handler Actions

The `evmXHandler` performs 10 randomized actions during invariant testing:

| Action | What it does |
|--------|-------------|
| `buy` | Buy tokens with random ETH amount |
| `sell` | Sell random percentage of holdings |
| `transfer` | Wallet-to-wallet transfer |
| `autonomousCycle` | Trigger autonomous cycle |
| `emergencyForceAllocation` | Attempt emergency allocation after timeout |
| `fulfillPendingVRF` | Fulfill pending VRF request |
| `sendEthToContract` | Direct ETH injection |
| `syncAccounting` | Trigger ETH accounting sync |
| `reEnrollUser` | Permissionless re-enrollment check |
| `warpForward` | Advance time 1-8 hours |

### Configuration

```toml
# foundry.toml
[fuzz]
runs = 1000        # 1000 runs per fuzz test
seed = "0x1"       # Deterministic

[invariant]
runs = 256         # 256 sequences
depth = 50         # 50 calls per sequence
```

---

## Reproducibility

**149 tests run with zero config** (no .env, no API keys):
- 121 Foundry tests -- deterministic seed, fully mocked
- 28 Hardhat local tests -- local mocks only

**25 fork tests require .env** (auto-created by `npm run setup`):
- Base Mainnet fork at pinned block 25000000
- Deterministic replay regardless of when you run them

Anyone can clone and verify independently:

```bash
git clone https://github.com/evmx-protocol/evmX.git
cd evmX
npm run setup
# -> 174 tests pass
```
