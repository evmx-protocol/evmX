# evmX — Autonomous Community Reward Protocol

> **The first ERC-20 protocol designed to run forever without any human intervention.**
> After ownership renounce and LP burn, no one — not even the creator — can stop, pause, modify, or control it.

[![Solidity 0.8.28](https://img.shields.io/badge/Solidity-0.8.28-363636?logo=solidity)](https://soliditylang.org/)
[![Base L2](https://img.shields.io/badge/Network-Base-0052FF?logo=coinbase)](https://base.org/)
[![Chainlink CRE](https://img.shields.io/badge/Chainlink-CRE%20%2B%20VRF%20%2B%20Data%20Feed-375BD2)](https://docs.chain.link/cre)
[![Tenderly VNet](https://img.shields.io/badge/Tenderly-Virtual%20TestNet-6F4CFF)](https://dashboard.tenderly.co/explorer/vnet/374547f2-47c6-4087-a785-507101cd004e/transactions)
[![174 tests](https://img.shields.io/badge/Tests-174%20passing-brightgreen)](#test-suite)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

**Convergence Hackathon 2026** | Tracks: **CRE & AI** + **Tenderly Virtual TestNets**

---

## Chainlink Products Used

> evmX integrates **3 Chainlink services** as core, non-optional protocol infrastructure — not demos or wrappers.

| Product | Role in Protocol | Where |
|---------|-----------------|-------|
| 🔗 **Chainlink CRE** (3 Workflows) | Autonomous keeper layer — guarantees reward cycle execution even with **zero trading volume**. Workflow #1 monitors pools + triggers cycle every 2 min. Workflow #2 streams `PoolAllocated` events. Workflow #3 is an AI Strategy Advisor (EVM + HTTP + LLM in one pipeline). | `cre-workflow/src/workflows/` |
| 🎲 **Chainlink VRF v2.5** | Provably fair random winner selection — on-chain verifiable, manipulation-proof. Native ETH payment. 3-block confirmation. | `evmX.sol: fulfillRandomWords()` |
| 📈 **Chainlink Data Feed** (ETH/USD) | Powers all USD price displays in the frontend + feeds the AI analytics engine (pool trend predictions, protocol health score, entry timing recommendations). | `index.html: AggregatorV3Interface` |

**Why CRE is the critical layer:**

```
Without CRE:  trade triggers only → pools freeze if no one trades for hours
With CRE:     guaranteed execution every 2 min → protocol runs FOREVER, zero trades or not
```

This is the core innovation: CRE makes evmX **unconditionally autonomous** — it runs whether there are 1,000 trades/hour or zero trades for a week.

---

## Tenderly Virtual TestNet — Live Demo

> **[🔍 Open Public Explorer →](https://dashboard.tenderly.co/explorer/vnet/374547f2-47c6-4087-a785-507101cd004e/transactions)**

| | |
|---|---|
| **Network** | Base mainnet fork (Chain ID 8453) |
| **Contract** | `0x06eABc6937C02B073e568695Ca2526D10B23c68E` (evmX — verified) |
| **Base Sepolia** | [`0x4AfdC83DC87193f7915429c0eBb99d11A77408d1`](https://sepolia.basescan.org/address/0x4AfdC83DC87193f7915429c0eBb99d11A77408d1) (live testnet deploy) |
| **Transactions** | **60 — all successful** (deploy → liquidity → buy swaps → sells → pool accumulation → autonomous cycles → re-enrollment) |
| **CRE connection** | VNet demonstrates the exact on-chain state CRE workflows read and write to |

The Tenderly Virtual TestNet runs the **full production protocol** on a real Base mainnet fork — same Uniswap V2 Router, same WETH, same VRF Coordinator addresses as mainnet. Every transaction is publicly inspectable with full state traces.

---

### Why This Matters

Every DeFi protocol claims to be "decentralized" — but almost all of them have admin keys, upgrade proxies, or centralized keepers that can be shut down. **evmX proves this doesn't have to be the case.**

By combining Chainlink CRE + VRF + Data Feeds with an immutable smart contract, evmX achieves what we call **Unconditional Autonomy**:

| | Traditional DeFi | evmX |
|---|---|---|
| Admin key | ✅ Owner can pause/modify | ❌ **Ownership renounced — no admin exists** |
| Upgrade path | ✅ Proxy can change logic | ❌ **No proxy — code is final** |
| Keeper dependency | ✅ Bot must run 24/7 | ❌ **CRE + trade triggers — dual-layer redundancy** |
| Liquidity risk | ✅ Owner can pull LP | ❌ **LP tokens burned — locked forever** |
| If creator disappears | Protocol dies | **Protocol runs forever** |

---

## The Problem

Community reward tokens rely on **centralized keepers** to trigger reward distributions. This creates:
- Single points of failure (keeper goes offline = no rewards)
- Trust assumptions (keeper can front-run or delay)
- Operational overhead (someone must maintain the bot)

## The Solution

evmX replaces centralized keepers with **Chainlink CRE (Runtime Environment)** for fully autonomous, trustless reward orchestration:

```
User buys evmX → 3% tax fills reward pools → CRE monitors thresholds
→ CRE triggers runAutonomousCycle() → VRF v2.5 selects random winner → ETH paid out
→ Data Feed shows real-time USD values → AI analytics predict optimal entry timing
```

**No human intervention. No trust. Fully on-chain. Ownership renounced. LP burned.**

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        evmX Protocol                              │
│                                                                    │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                       │
│  │  Micro  │    │   Mid   │    │  Mega   │   ← 3 Reward Pools    │
│  │  Pool   │    │  Pool   │    │  Pool   │                        │
│  │ 2h/dyn  │    │ 6h/dyn  │    │ 7 days  │                        │
│  └────┬────┘    └────┬────┘    └────┬────┘                        │
│       └──────────────┼──────────────┘                              │
│                      ▼                                             │
│         ┌──────────────────────┐                                   │
│         │  runAutonomousCycle  │   ← Permissionless trigger        │
│         └──────────┬───────────┘                                   │
│                    ▼                                               │
│         ┌──────────────────────┐                                   │
│         │  Chainlink VRF v2.5  │   ← Random winner selection      │
│         └──────────┬───────────┘                                   │
│                    ▼                                               │
│         ┌──────────────────────┐                                   │
│         │   Winner Payout      │   ← ETH sent to winner           │
│         └──────────────────────┘                                   │
└──────────────────────────────────────────────────────────────────┘
          ▲                                        ▲
          │ Monitors + Triggers                    │ ETH/USD Price
┌─────────┴──────────────┐          ┌──────────────┴──────────────┐
│   Chainlink CRE Layer  │          │  Chainlink Data Feed        │
│                        │          │  ETH/USD on Base             │
│   (see below)          │          │  → USD values in frontend   │
│                        │          │  → AI Protocol Intelligence │
└────────────────────────┘          └─────────────────────────────┘
           ┌─────────────────────────────┐
           │    Chainlink CRE Layer      │
           │                              │
           │  ┌────────────────────────┐  │
           │  │ evmx-autonomous-rewards│  │  Cron Trigger → Read Pools
           │  │    (CRE Workflow #1)   │  │  → Check Thresholds
           │  └────────────────────────┘  │  → Trigger Cycle (EVM Write)
           │                              │
           │  ┌────────────────────────┐  │
           │  │  evmx-event-monitor    │  │  EVM Log Trigger
           │  │    (CRE Workflow #2)   │  │  → Monitor PoolAllocated
           │  └────────────────────────┘  │  → Log Winners
           │                              │
           │  ┌────────────────────────┐  │
           │  │  evmx-ai-advisor       │  │  Cron → Read Pools (EVM)
           │  │    (CRE Workflow #3)   │  │  → CoinGecko API (HTTP)
           │  └────────────────────────┘  │  → OpenAI LLM (Confidential)
           └──────────────────────────────┘     → AI Strategy Report
```

---

## Chainlink Integration

### Services Used

| Service | Purpose | Implementation |
|---------|---------|---------------|
| **CRE Workflow #1** | Autonomous pool monitoring & cycle triggering | `cre-workflow/src/workflows/evmx-autonomous-rewards/` |
| **CRE Workflow #2** | Real-time event monitoring & winner tracking | `cre-workflow/src/workflows/evmx-event-monitor/` |
| **CRE Workflow #3** | AI strategy advisor (external API + LLM) | `cre-workflow/src/workflows/evmx-ai-advisor/` |
| **VRF v2.5** | Provably fair random winner selection | Native ETH payment, 3-block confirmations |
| **Data Feed (ETH/USD)** | Real-time USD pricing for pools & AI analytics | `AggregatorV3Interface` on Base (frontend) |

### Why CRE? — Multi-Layer Trigger Architecture

evmX uses a **defense-in-depth trigger design**. The smart contract is intentionally built with two independent trigger paths:

**Layer 1 — Trade-triggered (built into `_update()`):**
During every buy/sell, the contract automatically checks all 3 pools and triggers allocations if conditions are met. It also runs `swapAndDistribute()` to convert accumulated tokens into ETH for the pools. This means active trading keeps the protocol running without any external dependency.

**Layer 2 — CRE-triggered (via `runAutonomousCycle()`):**
Chainlink CRE calls `runAutonomousCycle()` every 2 minutes, regardless of trading activity. This is critical because:

| Scenario | Without CRE | With CRE |
|----------|:-----------:|:--------:|
| Active trading | Pools trigger automatically via transfers | Same — CRE is idle |
| **No trades for 2+ hours** | Micro pool ready but stuck — no one calls it | **CRE triggers it** |
| **No trades for 6+ hours** | Mid pool ready but stuck | **CRE triggers it** |
| **No trades on Mega day 7** | Weekly jackpot sits unclaimed | **CRE triggers it** |
| **Token→ETH swap needed, no sells** | 120k tokens accumulate but no swap | **CRE runs swapAndDistribute()** |
| **VRF needs funding, no swap** | pendingVrfEth accumulates, no funding | **CRE calls _attemptVrfFund() directly** |

> **Design philosophy:** The contract should never depend on a single trigger mechanism. Layer 1 handles the common case (active trading). Layer 2 (CRE) guarantees execution under ALL conditions — including zero trading volume. Together, they make evmX **unconditionally autonomous**: it runs whether there are 1000 trades per hour or zero trades for a week.

This is analogous to how Aave and Compound use Chainlink Keepers — their contracts can be triggered manually, but Keepers provide the reliable, decentralized automation layer that makes them production-grade.

### CRE Workflow #1: Autonomous Rewards

The primary CRE workflow:

1. **Cron Trigger** — Executes every 2 minutes
2. **EVM Read** — Reads all 3 pool states (`getPoolInfo()`)
3. **Threshold Check** — Evaluates Smart Ladder thresholds and timers
4. **EVM Write** — Calls `runAutonomousCycle()` when any pool is ready
5. **Logging** — Records pool states and actions for transparency

```typescript
// Simplified workflow logic (CRE SDK is synchronous / WASM-compiled)
const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  const evmClient = new EVMClient(BASE_SEPOLIA_SELECTOR)

  // Read all 3 pool states via EVM callContract
  const pools = [POOL_MICRO, POOL_MID, POOL_MEGA]
    .map(poolType => readPoolInfo(runtime, evmClient, poolType))

  // Check which pools are ready for allocation
  const readyPools = pools.filter(p => p && isPoolReady(p, currentTime))

  if (readyPools.length > 0) {
    // Submit CRE writeReport → triggers runAutonomousCycle() on-chain
    evmClient.writeReport(runtime, { receiver, $report: true })
  }

  return `triggered for ${readyPools.length} pools`
}
```

### CRE Workflow #2: Event Monitor

Processes `PoolAllocated` events in real-time via EVM Log Trigger:
- Decodes winner address, pool type, and payout amount
- Enables automated notifications and analytics dashboards
- Provides a real-time event stream for the frontend winner feed

### CRE Workflow #3: AI Strategy Advisor

The AI-powered workflow combines **3 data sources** in a single CRE pipeline:

1. **EVM Read** — Reads all 3 pool states from the smart contract (on-chain data)
2. **HTTP Client** — Fetches real-time ETH market data from CoinGecko API (external API)
3. **Confidential HTTP** — Sends combined analysis to OpenAI GPT for strategy recommendation (LLM)
4. **Fallback** — If LLM is unavailable, uses local scoring algorithm (weighted: odds 40%, fill 30%, size 30%)

This workflow demonstrates CRE's ability to orchestrate **blockchain reads + external APIs + LLM inference** in a single, autonomous pipeline — the three pillars of modern AI-powered DeFi.

```
CRE Cron (5min) → EVMClient.callContract() → HTTPClient (CoinGecko)
                → ConfidentialHTTPClient (OpenAI) → AI Strategy Report
```

### Chainlink Data Feed: ETH/USD

The frontend reads the Chainlink ETH/USD price feed directly via `AggregatorV3Interface.latestRoundData()`:

- **Real-time USD conversion** — All pool balances and winner payouts displayed in both ETH and USD
- **AI Protocol Intelligence** — Predictive analytics powered by on-chain pool state + price data:
  - **Next Trigger Prediction** — Estimates when the next pool allocation will fire
  - **Pool Trend Analysis** — Tracks accumulation rate across all 3 pools
  - **Best Entry Recommendation** — Calculates optimal pool entry based on reward size, odds, and timing
  - **Protocol Health Score** — Composite metric combining pool activity, entry count, and data feed status

| Network | Price Feed Address |
|---------|-------------------|
| Base Mainnet | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` |
| Base Sepolia | `0x4aDC67D868764F6022B3cD50e6dB3c7aaBc36578` |

---

## Token Mechanics

### 3-Tier Reward System

| Pool | Cycle | Threshold | Entry Requirement | Tax Source |
|------|-------|-----------|-------------------|------------|
| **Micro** | 2h timer / Smart Ladder | 0.01 - 100 ETH | 0.7% of pool (floor 0.001, cap 0.05 ETH) | 1% buy tax |
| **Mid** | 6h timer / Smart Ladder | 0.05 - 500 ETH | 0.7% of pool (floor 0.0025, cap 0.25 ETH) | 1.5% buy tax |
| **Mega** | Fixed 7-day cycle | — | 0.7% of pool (floor 0.0035, cap 1 ETH) | 1.9% sell tax |

### Buy-to-Play Entry System

Entries are **only** granted from actual buys (not transfers or re-enrollment):

| Entry | Requirement |
|-------|------------|
| 1st entry | Buy qualifying amount of evmX |
| 2nd entry | Cumulative buy value reaches 2x threshold |
| 3rd entry (max) | Cumulative buy value reaches 3x threshold |

### Tax Structure

| Direction | Total Tax | Breakdown |
|-----------|-----------|-----------|
| **Buy** | 3% | Micro (1%) + Mid (1.5%) + Marketing (0.4%) + VRF (0.1%) |
| **Sell** | 3% | Mega (1.9%) + Marketing (1%) + VRF (0.1%) |

### Fully Autonomous — No Admin Keys

After launch, **ownership is permanently renounced** and **LP tokens are burned**. The protocol runs 100% autonomously with zero human intervention:

| Guarantee | Description |
|-----------|-------------|
| **Ownership Renounced** | `renounceOwnership()` permanently locks all admin functions. No one can modify taxes, thresholds, or any parameter. Irreversible. |
| **LP Burned** | Uniswap V2 LP tokens are sent to dead address (`0x...dead`). Liquidity is permanently locked — no rug pull possible. |
| **CRE Automated** | Chainlink CRE guarantees execution even with zero trading volume — swap, VRF funding, and pool triggers run 24/7 without any human operator. |
| **VRF Provably Fair** | Chainlink VRF v2.5 provides cryptographically verifiable randomness. No one can predict or manipulate winner selection. |

> **After renounce + LP burn, evmX becomes a self-sustaining, unstoppable protocol.** No entity — not even the deployer — can change any parameter, drain funds, or stop the reward cycles. The code runs forever.

### Safety Features

- **Chainlink VRF v2.5** — Provably fair randomness (native ETH payment)
- **CRE Automation** — No centralized keeper dependency
- **Anti-whale** — 4% max wallet, 1.5% max TX, whale exclusion from micro pool
- **Smart contract exclusion** — Only EOA wallets can win rewards (`candidate.code.length > 0` → rejected). Bot contracts, MEV bots, and flash loan contracts are automatically excluded from winner selection
- **Same-block trade protection** — Prevents buy-and-sell in the same block (anti-sandwich)
- **MIN_TOKENS_FOR_REWARDS** — Must hold 10,000+ tokens to be eligible (bots never hold)
- **24h Emergency Fallback** — Commit-reveal on-chain entropy if VRF fails
- **VRF Stale Reroute** — Unfunded VRF ETH redistributes to pools after 7 days
- **Permissionless reEnroll()** — Anyone can trigger eligibility re-check

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/evmx-protocol/evmX.git
cd evmX

# One-command setup (installs dependencies + runs all 174 tests)
npm run setup
```

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org) |
| **Foundry** | Latest | Auto-installed by setup |
| **Bun** | 1.2+ | [bun.sh](https://bun.sh) (for CRE workflow) |
| **CRE CLI** | 1.0+ | [docs.chain.link](https://docs.chain.link/cre/getting-started/cli-installation/windows) |

### Run CRE Workflow Simulation

```bash
# Install CRE dependencies
cd cre-workflow
bun install

# TypeScript verification
bun run typecheck

# Run simulation via CRE CLI (Linux/Mac)
cre workflow simulate ./src/workflows/evmx-autonomous-rewards --target local-simulation

# Or trigger via GitHub Actions:
# Actions → "CRE Workflow Simulate" → Run workflow
```

### Deploy to Base Sepolia

```bash
# Configure .env
cp .env.example .env
# Edit: DEPLOYER_PRIVATE_KEY, MARKETING_WALLET, VRF_SUBSCRIPTION_ID

# Deploy
npm run deploy:sepolia

# Update CRE config with deployed address
# Edit: cre-workflow/src/workflows/evmx-autonomous-rewards/config.json
```

---

## Test Suite

### 174 Tests — Dual Framework — Full Coverage

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

### Mutation Testing

Tests are verified via mutation testing — intentionally breaking the contract proves tests catch real bugs:

| Mutation | What broke | Tests that caught it |
|----------|-----------|---------------------|
| Remove `buyAmountETH > 0` guard | Transfer/reEnroll grants entries | P38, G21, fuzz_reEnroll |
| `MAX_ENTRIES_PER_CYCLE` 3 → 255 | Unlimited entries per cycle | P40, fuzz_buyToPlay |
| `EMERGENCY_COMMIT_DELAY` 5 → 0 | No commit-reveal delay | P42 |

```bash
# Run all tests
npm run test:full

# Individual suites
npm run test:attacks
npm run test:fuzz
npm run test:invariant
npm run test:economic
npm run test:properties
```

---

## Security

### 6-Phase Internal Security Assessment

| Phase | Scope |
|-------|-------|
| 1 | Structural analysis — control flow, access patterns, state transitions |
| 2 | Attack simulations — reentrancy, flash loan, sandwich, MEV, gas grief |
| 3 | Static analysis — invariant verification, formal properties |
| 4 | Economic stress — market crash, pump, liquidity drain |
| 5 | Edge case analysis — dust amounts, boundary values, timing |
| 6 | Deployment readiness — configuration review |

### Findings: 0 Critical, 0 Exploitable Bugs

| Severity | Count | Category |
|----------|------:|----------|
| Critical | 0 | — |
| High | 2 | External dependencies (VRF coordinator, L2 sequencer) |
| Medium | 7 | Design trade-offs (documented & accepted) |

---

## Project Structure

```
evmX/
├── contracts/
│   ├── evmX.sol                    # Production contract (Base Mainnet)
│   ├── evmX_Testable.sol           # Test variant (injectable dependencies)
│   └── mocks/                      # Mock contracts for testing
│
├── cre-workflow/                   # Chainlink CRE Integration
│   ├── project.yaml                # CRE project configuration
│   ├── secrets.yaml                # Secrets (simulation only)
│   ├── package.json                # CRE SDK dependencies
│   ├── tsconfig.json               # TypeScript configuration
│   └── src/workflows/
│       ├── evmx-autonomous-rewards/  # Workflow #1: Pool monitoring + cycle trigger
│       │   ├── index.ts              #   Main workflow logic
│       │   ├── config.json           #   Chain & contract configuration
│       │   ├── workflow.yaml         #   CRE workflow settings
│       │   └── abi/                  #   Contract ABI definitions
│       ├── evmx-event-monitor/       # Workflow #2: Event processing
│       │   ├── index.ts              #   Log trigger logic
│       │   ├── config.json           #   Configuration
│       │   └── workflow.yaml         #   CRE workflow settings
│       └── evmx-ai-advisor/         # Workflow #3: AI Strategy Advisor
│           ├── index.ts              #   EVMClient + HTTPClient + ConfidentialHTTPClient (OpenAI)
│           ├── config.json           #   Configuration
│           └── workflow.yaml         #   CRE workflow settings
│
├── test/
│   ├── foundry/                    # 121 Foundry tests
│   │   ├── attacks/                #   12 exploit simulations
│   │   ├── fuzz/                   #   14 fuzz tests (1000 runs each)
│   │   ├── invariant/              #   80 invariant + formal + edge case tests
│   │   ├── state_machine/          #   15 economic stress tests
│   │   └── mocks/                  #   Foundry-compatible mocks
│   ├── LaunchStress.test.js        # 28 Hardhat local tests
│   └── evmX_BaseFork.test.js       # 25 Base Mainnet fork tests
│
├── scripts/
│   ├── setup.js                    # One-command setup
│   ├── test-full.js                # Run all 174 tests
│   ├── deploy-base.js              # Deploy to Base Mainnet
│   ├── deploy-sepolia.js           # Deploy to Base Sepolia (testnet)
│   ├── deploy-tenderly.js          # Deploy to Tenderly VNet + auto-verify
│   ├── tenderly-demo.js            # Demo transactions on Tenderly
│   └── add-liquidity.js            # Add Uniswap V2 liquidity
│
├── index.html                      # Frontend dashboard (single-page dApp)
├── hardhat.config.js               # Hardhat configuration (Base + Sepolia)
├── foundry.toml                    # Foundry configuration
└── package.json                    # Project dependencies & scripts
```

---

## Roadmap — From Hackathon to Mainnet

evmX is not just a hackathon demo — it's a **production-ready protocol** with a clear path to Base Mainnet launch.

### Phase 1: Hackathon (Current)
- [x] Smart contract finalized (1,435 lines, 174 tests)
- [x] Deployed to Base Sepolia with Chainlink VRF v2.5
- [x] 3 CRE Workflows (Autonomous Rewards + Event Monitor + AI Strategy Advisor)
- [x] Frontend dApp with AI Protocol Intelligence
- [x] 6-phase security assessment completed
- [x] Tenderly Virtual TestNet — full lifecycle demo (60 tx, verified, Public Explorer)

### Phase 2: Mainnet Launch (Post-Hackathon)
- [ ] **Hackathon prize funds initial Uniswap V2 liquidity** — 100% of prize money allocated to ETH/evmX liquidity pool on Base Mainnet
- [ ] LP tokens permanently burned (no rug pull possible)
- [ ] Ownership renounced immediately after launch
- [ ] CRE Workflows deployed to production (Base Mainnet)
- [ ] VRF subscription funded for continuous operation

### Phase 3: Autonomous Operation
- [ ] Protocol runs 100% autonomously — no human intervention
- [ ] Community growth driven by reward mechanics
- [ ] CRE ensures 24/7 pool monitoring and execution
- [ ] Marketing wallet funds used for community initiatives

> **Liquidity Strategy:** The hackathon prize is the catalyst for real-world deployment. By allocating prize funds directly to the Uniswap V2 liquidity pool and immediately burning LP tokens, evmX launches with permanent, locked liquidity — creating a trustless, unstoppable reward protocol from day one.

---

## Deployment

### Tenderly Virtual TestNet

```bash
npm run deploy:tenderly    # Deploy to Tenderly VNet + auto-verify
npm run demo:tenderly      # Run demo transactions (full lifecycle)
```

> See **[Tenderly Virtual TestNet — Live Demo](#tenderly-virtual-testnet--live-demo)** section above for full details, Public Explorer link, and transaction breakdown.

### Base Sepolia Testnet (Hackathon Demo)

```bash
npm run deploy:sepolia
```

### Base Mainnet (Production)

| Parameter | Value |
|-----------|-------|
| Chain ID | 8453 |
| Uniswap V2 Router | `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` |
| VRF Coordinator | `0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634` |
| Compiler | Solidity 0.8.28, via IR, 50 optimizer runs |

```bash
npm run deploy:base
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contract | Solidity 0.8.28, OpenZeppelin, Hardhat + Foundry |
| CRE Workflows | TypeScript, @chainlink/cre-sdk, Bun |
| Randomness | Chainlink VRF v2.5 (native ETH) |
| Automation | Chainlink CRE (replaces centralized keepers) |
| Price Data | Chainlink Data Feed (ETH/USD) via AggregatorV3Interface |
| AI Analytics | On-chain data analysis + Chainlink price feed → predictive insights |
| Frontend | Vanilla JS, ethers.js v6, Pure CSS (no frameworks) |
| Network | Base L2 (Chain ID: 8453) |
| Testing | Tenderly Virtual TestNet (Base fork) |
| DEX | Uniswap V2 |

---

## License

MIT License

---

## Disclaimer

This software is provided "as is" without warranty of any kind. evmX has undergone a 6-phase internal security assessment with 174 automated tests including mutation testing, but **no assessment guarantees zero bugs**. Smart contracts are immutable once deployed. Users interact with decentralized protocols at their own risk.
