# evmX — Autonomous Three-Speed Reward Protocol

> **An ERC-20 on Base with three reward cycles running at different speeds, where buying builds participation, holding preserves position, and execution requires no operator.**

[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636)](https://soliditylang.org/)
[![Base L2](https://img.shields.io/badge/Network-Base%20L2-0052FF)](https://base.org/)
[![Chainlink](https://img.shields.io/badge/Chainlink-CRE%20%2B%20VRF%20%2B%20Data%20Feed-375BD2)](https://docs.chain.link/cre)
[![Tenderly](https://img.shields.io/badge/Tenderly-Virtual%20TestNet-6F4CFF)](https://dashboard.tenderly.co/explorer/vnet/374547f2-47c6-4087-a785-507101cd004e/transactions)
[![Tests](https://img.shields.io/badge/Tests-174%20passing-brightgreen)](#test-suite)
[![License](https://img.shields.io/badge/License-Source--Available-red)](LICENSE)

**Convergence Hackathon 2026** | Tracks: **CRE & AI** + **Tenderly Virtual TestNets**

[**Demo Video**](https://youtu.be/hi5uvVxkVUA) | [**Tenderly Explorer**](https://dashboard.tenderly.co/explorer/vnet/374547f2-47c6-4087-a785-507101cd004e/transactions) | [**BaseScan**](https://sepolia.basescan.org/address/0x4AfdC83DC87193f7915429c0eBb99d11A77408d1)

### At a Glance

| | |
|---|---|
| **What** | 1,435-line reward protocol with 3 pools running at different speeds (2h / 6h / 7d), funded by buy/sell tax, winners selected via Chainlink VRF |
| **The game** | Randomness decides who wins. Timing, entry building, and holding discipline determine how well you're positioned when it fires. |
| **Execution** | Dual-trigger: every trade checks pool conditions automatically + Chainlink CRE calls every 2 min as redundancy |
| **Post-launch** | Ownership renounced, LP burned, no proxy, no admin keys |

---

## Table of Contents

- [The Game](#the-game)
- [How Entry Works](#how-entry-works)
- [The Reflexive Loop](#the-reflexive-loop)
- [Autonomous Execution](#autonomous-execution)
- [Chainlink Integration](#chainlink-integration)
- [Tenderly Virtual TestNet](#tenderly-virtual-testnet)
- [Token Mechanics](#token-mechanics)
- [Adaptive Mechanics](#adaptive-mechanics)
- [Test Suite](#test-suite)
- [Security](#security)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [Deployment](#deployment)
- [Tech Stack](#tech-stack)

---

## The Game

evmX runs three reward pools at different speeds. Each creates a different participation tempo and a different kind of decision-making around the same token.

| Pool | Cycle | Funded By | Character |
|------|-------|-----------|-----------|
| **Micro** | 2-hour Smart Ladder | 1% buy tax | Fast tactical cycle. Short windows. Timing pressure. Threshold range 0.01–100 ETH — doubles on fast fill, halves on timeout. |
| **Mid** | 6-hour Smart Ladder | 1.5% buy tax | Medium-speed cycle. More time to read pool state and compare entry cost against crowding. Threshold range 0.05–500 ETH. |
| **Mega** | Fixed 7-day cycle | 1.9% sell tax | Weekly cycle. Larger pot, longer positioning horizon. Primarily fed by sell-side tax over the full week. |

These are not three prize buckets. They are three participation tempos around one token — each rewarding a different kind of attention.

**The key distinction:**
- **Chainlink VRF decides WHO wins.** Provably fair, cryptographically verifiable. No party within the protocol can predict or influence the selection.
- **Strategy decides WHEN and HOW WELL you're positioned.** Entry timing, cycle awareness, cumulative buy commitment, holding discipline — these are analyzable and speculable.

The winner is random. The setup is not.

---

## How Entry Works

Eligibility and entries are separate concepts. Eligibility determines whether you're in the participant set for a cycle. Entries determine how many times your address appears in the draw.

### Eligibility

A wallet becomes eligible for a pool's current cycle when its token holdings meet the dynamic entry requirement for that pool. This check happens during buys and can also be triggered via `reEnroll(address)`, which is permissionless — anyone can call it for any address.

### Entries (Buy-to-Play)

Entries come **only from actual buys** on Uniswap. Not from transfers, not from re-enrollment. Once eligible, each buy accumulates toward entry thresholds:

| Entry | Requirement |
|-------|------------|
| 1st | Any qualifying buy (while eligible) |
| 2nd | Cumulative buy value reaches 1x the pool's entry requirement |
| 3rd (max) | Cumulative buy value reaches 2x the pool's entry requirement |

Maximum 3 entries per cycle per pool. More entries = better odds in the draw.

### Dynamic Entry Requirements

Each pool's entry requirement = **0.7% of the current pool balance**, bounded by per-pool floors and caps:

| Pool | Floor | Cap |
|------|-------|-----|
| **Micro** | 0.001 ETH | 0.05 ETH |
| **Mid** | 0.0025 ETH | 0.25 ETH |
| **Mega** | 0.0035 ETH | 1 ETH |

Early in a cycle, when the pool balance is small, the entry cost is lower. As the pool accumulates, the cost rises.

### Holding and Revocation

At entry time, the contract calculates each user's **required token hold** from Uniswap reserves at that moment. This pegs the hold requirement to the ETH value at entry — price movements afterward don't retroactively change what you need to hold.

- **Selling revokes participation** for the current active cycles across all three pools. If a pool has a pending allocation request, the next cycle is also affected.
- **Transferring below required hold** triggers automatic revocation for the affected pool and cycle.
- **Whale exclusion**: holders above 3% of total supply are excluded from the Micro pool — checked both at entry and at winner selection.

---

## The Reflexive Loop

The protocol creates feedback between trading activity, pool growth, and participation:

```
Buy/sell activity --> taxes feed reward pools --> growing pools attract attention
    --> attention attracts new participants --> new volume feeds pools further
```

Simultaneously:
- **Holding incentives reduce sell pressure.** Selling revokes eligibility for active cycles — participants with position in a near-triggering pool have a reason to hold.
- **Pool size affects entry barriers.** Larger pools require larger buys to enter, naturally filtering low-commitment participation during high-activity periods.

This is a reflexive system, not a guarantee. Whether the feedback loop sustains depends on real participation and real volume. The design creates conditions for reinforcement — it does not force any particular outcome.

---

## Autonomous Execution

After launch, ownership is permanently renounced and LP tokens are burned. No admin keys, no proxy, no upgrade path. The protocol runs on two independent trigger layers:

**Layer 1 — Trade triggers** (built into `_update()`): every buy/sell automatically checks all 3 pools and triggers allocations if conditions are met. Active trading keeps the protocol running with zero external dependency.

**Layer 2 — CRE triggers** (via `runAutonomousCycle()`): Chainlink CRE calls every 2 minutes regardless of trading activity. This covers the cases trade triggers cannot — idle periods where a pool is ready but no one is trading.

| Scenario | Without CRE | With CRE |
|----------|:-----------:|:--------:|
| Active trading | Pools trigger via trade flow | Same — CRE is idle |
| No trades for 2+ hours | Micro pool ready but no trigger | CRE triggers it |
| No trades for 6+ hours | Mid pool stuck | CRE triggers it |
| No trades on Mega day 7 | Weekly reward sits idle | CRE triggers it |
| Token swap needed, no sells | Tokens accumulate, no conversion | CRE runs swap |

| | Traditional DeFi | evmX |
|---|---|---|
| Admin key | Owner can pause/modify | Ownership renounced — no admin |
| Upgrade path | Proxy can change logic | No proxy — code is final |
| Keeper dependency | Bot must run 24/7 | CRE + trade triggers |
| Liquidity risk | Owner can pull LP | LP tokens burned |

> [!CAUTION]
> After renounce + LP burn, no party — including the deployer — can change parameters, drain funds, or halt reward cycles. The protocol operates as long as the underlying infrastructure (Base L2, Chainlink VRF, Uniswap V2) remains available.

---

## Chainlink Integration

evmX integrates **3 Chainlink services**: CRE for autonomous execution, VRF for winner selection, Data Feeds for pricing.

| Service | Role | Location |
|---------|------|----------|
| **CRE Workflow #1** | Pool monitoring + cycle triggering (cron every 2 min) | `cre-workflow/src/workflows/evmx-autonomous-rewards/` |
| **CRE Workflow #2** | Event monitoring — processes `PoolAllocated` events via EVM Log Trigger | `cre-workflow/src/workflows/evmx-event-monitor/` |
| **CRE Workflow #3** | Strategy advisor — EVM read + CoinGecko HTTP + OpenAI LLM in one pipeline, with local fallback scoring | `cre-workflow/src/workflows/evmx-ai-advisor/` |
| **VRF v2.5** | Provably fair random winner selection — native ETH payment, 3-block confirmations | `evmX.sol: fulfillRandomWords()` |
| **Data Feed (ETH/USD)** | Real-time USD pricing for frontend pool displays and analytics | `index.html: AggregatorV3Interface` |

<details>
<summary><b>CRE Workflow #1: Autonomous Rewards — code</b></summary>

```typescript
const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  const evmClient = new EVMClient(BASE_SEPOLIA_SELECTOR)

  // Read all 3 pool states via EVM callContract
  const pools = [POOL_MICRO, POOL_MID, POOL_MEGA]
    .map(poolType => readPoolInfo(runtime, evmClient, poolType))

  // Check which pools are ready for allocation
  const readyPools = pools.filter(p => p && isPoolReady(p, currentTime))

  if (readyPools.length > 0) {
    evmClient.writeReport(runtime, { receiver, $report: true })
  }

  return `triggered for ${readyPools.length} pools`
}
```

</details>

<details>
<summary><b>CRE Workflow #3: AI Strategy Advisor — pipeline</b></summary>

Combines 3 data sources in a single CRE pipeline:

1. **EVM Read** — Pool states from the smart contract
2. **HTTP Client** — Real-time ETH market data from CoinGecko
3. **Confidential HTTP** — OpenAI GPT for strategy recommendation
4. **Fallback** — Local scoring algorithm (odds 40%, fill 30%, size 30%) if LLM is unavailable

```
CRE Cron (5min) --> EVMClient.callContract() --> HTTPClient (CoinGecko)
                --> ConfidentialHTTPClient (OpenAI) --> Strategy Report
```

</details>

| Network | ETH/USD Price Feed |
|---------|-------------------|
| Base Mainnet | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` |
| Base Sepolia | `0x4aDC67D868764F6022B3cD50e6dB3c7aaBc36578` |

---

## Tenderly Virtual TestNet

> **[Open Public Explorer](https://dashboard.tenderly.co/explorer/vnet/374547f2-47c6-4087-a785-507101cd004e/transactions)**

| | |
|---|---|
| **Network** | Base mainnet fork (Chain ID 8453) |
| **Contract** | `0x06eABc6937C02B073e568695Ca2526D10B23c68E` (verified) |
| **Base Sepolia** | [`0x4AfdC83DC87193f7915429c0eBb99d11A77408d1`](https://sepolia.basescan.org/address/0x4AfdC83DC87193f7915429c0eBb99d11A77408d1) |
| **Transactions** | 60 — all successful (deploy, liquidity, swaps, sells, pool accumulation, autonomous cycles, re-enrollment) |

Full production protocol on a real Base mainnet fork — same Uniswap V2 Router, same WETH, same VRF Coordinator as mainnet. Every transaction is publicly inspectable with full state traces.

---

## Token Mechanics

| Direction | Total Tax | Breakdown |
|-----------|-----------|-----------|
| **Buy** | 3% | Micro (1%) + Mid (1.5%) + Marketing (0.4%) + VRF (0.1%) |
| **Sell** | 3% | Mega (1.9%) + Marketing (1%) + VRF (0.1%) |

| Pool | Cycle | Threshold | Entry Requirement | Tax Source |
|------|-------|-----------|-------------------|------------|
| **Micro** | 2h timer / Smart Ladder | 0.01–100 ETH | 0.7% of pool (floor 0.001, cap 0.05 ETH) | 1% buy tax |
| **Mid** | 6h timer / Smart Ladder | 0.05–500 ETH | 0.7% of pool (floor 0.0025, cap 0.25 ETH) | 1.5% buy tax |
| **Mega** | Fixed 7-day cycle | — | 0.7% of pool (floor 0.0035, cap 1 ETH) | 1.9% sell tax |

Additional constraints: 4% max wallet, 1.5% max TX.

---

## Adaptive Mechanics

<details>
<summary><b>Smart Ladder — thresholds that adjust based on demand</b></summary>

Pool trigger thresholds are not fixed. They adjust within defined ranges based on fill velocity:

| Condition | Action |
|-----------|--------|
| Pool fills before timer expires | Threshold doubles (up to max) |
| Timer expires before pool fills | Threshold halves (down to min) |

During high volume, pools accumulate larger rewards before triggering. During quiet periods, rewards fire faster at smaller amounts. The protocol finds its own equilibrium.

</details>

<details>
<summary><b>Fallback systems</b></summary>

| Mechanism | Trigger | Action |
|-----------|---------|--------|
| **VRF Emergency Fallback** | VRF unresponsive for 24h | Commit-reveal on-chain entropy with 5-block delay |
| **VRF Stale Reroute** | VRF subscription unfunded for 7 days | Pending VRF ETH redistributes to reward pools |
| **VRF Funding Cap** | Subscription reaches 2 ETH | Excess flows back to pools |
| **Marketing Wallet Fallback** | Marketing wallet rejects ETH | Funds redirect to Mega Pool |
| **Self-Healing Accounting** | Unexpected ETH arrives | `syncETHAccounting()` captures into Mega Pool |

</details>

<details>
<summary><b>Gas-aware operation</b></summary>

| System | Gas Reserve | Purpose |
|--------|-----------|---------|
| Recipient selection | 350,000 | Stops iteration if gas runs low |
| Allocation execution | 900,000 minimum | Won't start if insufficient gas |
| Entry cleanup | 30,000 batch limit | Incremental cleanup to avoid blocking |

</details>

<details>
<summary><b>Participant management</b></summary>

| Mechanism | How It Works |
|-----------|-------------|
| **Per-User Token Hold** | Minimum hold calculated from Uniswap reserves at entry time — adapts to price at moment of entry |
| **Transfer Balance Check** | Dropping below required hold triggers automatic revocation for affected pool/cycle |
| **Permissionless Re-enrollment** | `reEnroll(address)` — anyone can trigger eligibility re-check for any address |
| **Payout Failure Recovery** | If selected recipient can't receive ETH, next candidate is tried (up to 130 attempts) |
| **EOA Check at Selection** | `candidate.code.length > 0` — contract addresses are excluded at winner selection time |

</details>

---

## Test Suite

### 174 Tests — Dual Framework

| Category | Tests | Framework | What it verifies |
|----------|------:|-----------|-----------------|
| **Attack Simulations** | 12 | Foundry | Reentrancy, flash loan, sandwich, MEV, gas grief, VRF manipulation |
| **Fuzz Testing** | 14 | Foundry | Random inputs (1000 runs each), boundary conditions |
| **Core Invariants** | 11 | Foundry | Supply conservation, ETH solvency, cycle validity |
| **Post-Renounce** | 2 | Foundry | Owner = address(0), marketing immutable |
| **Formal Properties** | 41 | Foundry | 12 stateful invariants + 29 property unit tests |
| **Edge Cases** | 26 | Foundry | 6 edge invariants + 20 boundary tests |
| **Economic Stress** | 15 | Foundry | 90% crash, 10x pump, mega cycle, liquidity drain |
| **Hardhat Local** | 28 | Hardhat | Unit tests, gas benchmarks, 50-bot stress test |
| **Base Mainnet Fork** | 25 | Hardhat | Real Uniswap V2, real WETH, real Base state |
| **Total** | **174** | | |

<details>
<summary><b>Mutation Testing</b></summary>

| Mutation | What broke | Tests that caught it |
|----------|-----------|---------------------|
| Remove `buyAmountETH > 0` guard | Transfer/reEnroll grants entries | P38, G21, fuzz_reEnroll |
| `MAX_ENTRIES_PER_CYCLE` 3 to 255 | Unlimited entries per cycle | P40, fuzz_buyToPlay |
| `EMERGENCY_COMMIT_DELAY` 5 to 0 | No commit-reveal delay | P42 |

</details>

```bash
npm run test:full          # All 174 tests
npm run test:attacks       # Attack simulations
npm run test:fuzz          # Fuzz testing
npm run test:invariant     # Invariants
npm run test:economic      # Economic stress
npm run test:properties    # Formal properties
```

---

## Security

### 6-Phase Internal Assessment

| Phase | Scope |
|-------|-------|
| 1 | Structural analysis — control flow, access patterns, state transitions |
| 2 | Attack simulations — reentrancy, flash loan, sandwich, MEV, gas grief |
| 3 | Static analysis — invariant verification, formal properties |
| 4 | Economic stress — market crash, pump, liquidity drain |
| 5 | Edge case analysis — dust amounts, boundary values, timing |
| 6 | Deployment readiness — configuration review |

**Findings:** 0 critical, 2 high (external dependencies: VRF coordinator, L2 sequencer), 7 medium (design trade-offs, documented and accepted).

---

## Quick Start

```bash
git clone https://github.com/evmx-protocol/evmX.git
cd evmX
npm run setup    # Installs dependencies + runs all 174 tests
```

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| Foundry | Latest | Auto-installed by setup |
| Bun | 1.2+ | [bun.sh](https://bun.sh) (for CRE) |
| CRE CLI | 1.0+ | [docs.chain.link](https://docs.chain.link/cre/getting-started/cli-installation/windows) |

### CRE Workflow Simulation

```bash
cd cre-workflow && bun install
bun run typecheck
cre workflow simulate ./src/workflows/evmx-autonomous-rewards --target local-simulation
```

---

## Project Structure

<details>
<summary><b>Click to expand</b></summary>

```
evmX/
├── contracts/
│   ├── evmX.sol                    # Production contract (1,435 lines)
│   ├── evmX_Testable.sol           # Test variant (injectable dependencies)
│   └── mocks/                      # Mock contracts for testing
├── cre-workflow/
│   └── src/workflows/
│       ├── evmx-autonomous-rewards/  # Workflow #1: Pool monitoring + cycle trigger
│       ├── evmx-event-monitor/       # Workflow #2: Event processing
│       └── evmx-ai-advisor/         # Workflow #3: Strategy advisor
├── test/
│   ├── foundry/                    # 121 Foundry tests
│   │   ├── attacks/                #   12 exploit simulations
│   │   ├── fuzz/                   #   14 fuzz tests
│   │   ├── invariant/              #   80 invariant + formal + edge tests
│   │   └── state_machine/          #   15 economic stress tests
│   ├── LaunchStress.test.js        # 28 Hardhat local tests
│   └── evmX_BaseFork.test.js       # 25 Base mainnet fork tests
├── scripts/                        # Setup, deploy, demo scripts
├── index.html                      # Frontend dashboard
├── hardhat.config.js
├── foundry.toml
└── package.json
```

</details>

---

## Roadmap

### Phase 1: Hackathon (Current)
- [x] Smart contract finalized (1,435 lines, 174 tests)
- [x] Deployed to Base Sepolia with Chainlink VRF v2.5
- [x] 3 CRE Workflows (Autonomous Rewards + Event Monitor + AI Strategy Advisor)
- [x] Frontend dApp
- [x] 6-phase security assessment
- [x] Tenderly Virtual TestNet — 60 tx lifecycle demo (verified, public explorer)

### Phase 2: Mainnet Launch
- [ ] Hackathon prize funds launch — 60% to Uniswap V2 liquidity (LP burned), 40% for continued development
- [ ] Ownership renounced immediately after launch
- [ ] CRE Workflows deployed to production
- [ ] VRF subscription funded

### Phase 3: Autonomous Operation
- [ ] Protocol operates without human intervention
- [ ] CRE ensures 24/7 execution
- [ ] Community growth driven by reward mechanics

---

## Deployment

```bash
npm run deploy:tenderly    # Tenderly VNet + auto-verify
npm run demo:tenderly      # Full lifecycle demo
npm run deploy:sepolia     # Base Sepolia testnet
npm run deploy:base        # Base Mainnet
```

| Parameter | Value |
|-----------|-------|
| Chain ID | 8453 |
| Uniswap V2 Router | `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` |
| VRF Coordinator | `0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634` |
| Compiler | Solidity 0.8.28, via IR, 50 optimizer runs |

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contract | Solidity 0.8.28, OpenZeppelin, Hardhat + Foundry |
| CRE Workflows | TypeScript, @chainlink/cre-sdk, Bun |
| Randomness | Chainlink VRF v2.5 (native ETH) |
| Execution | Chainlink CRE |
| Price Data | Chainlink Data Feed (ETH/USD) |
| Frontend | Vanilla JS, ethers.js v6, Pure CSS |
| Network | Base L2 (Chain ID: 8453) |
| Testing | Tenderly Virtual TestNet (Base fork) |
| DEX | Uniswap V2 |

---

## License

**Source-Available — All Rights Reserved**

| Permission | Status |
|-----------|--------|
| View & read the code | Yes |
| Modify the code | No |
| Deploy to any chain | No |
| Commercial use | No |
| Any use without written permission | No |

See [LICENSE](LICENSE) for full terms.

---

**evmX** — Built with Chainlink CRE + VRF + Data Feeds on Base L2

*This software is provided "as is" without warranty of any kind. evmX has undergone a 6-phase internal security assessment with 174 automated tests including mutation testing, but no assessment guarantees zero bugs. Smart contracts are immutable once deployed. Users interact with decentralized protocols at their own risk.*
