# evmX — Autonomous Community Reward Protocol

> **An ERC-20 on Base designed to operate indefinitely without human intervention.**
> After ownership renounce and LP burn, no single party — including the deployer — can alter, pause, or stop the protocol.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636)](https://soliditylang.org/)
[![Base L2](https://img.shields.io/badge/Network-Base%20L2-0052FF)](https://base.org/)
[![Chainlink](https://img.shields.io/badge/Chainlink-CRE%20%2B%20VRF%20%2B%20Data%20Feed-375BD2)](https://docs.chain.link/cre)
[![Tenderly](https://img.shields.io/badge/Tenderly-Virtual%20TestNet-6F4CFF)](https://dashboard.tenderly.co/explorer/vnet/374547f2-47c6-4087-a785-507101cd004e/transactions)
[![Tests](https://img.shields.io/badge/Tests-174%20passing-brightgreen)](#-test-suite)
[![License](https://img.shields.io/badge/License-Source--Available-red)](LICENSE)

**🏆 Convergence Hackathon 2026** | Tracks: **CRE & AI** + **Tenderly Virtual TestNets**

📹 [**Demo Video**](https://youtu.be/hi5uvVxkVUA) | 🔍 [**Tenderly Explorer**](https://dashboard.tenderly.co/explorer/vnet/374547f2-47c6-4087-a785-507101cd004e/transactions) | 📄 [**BaseScan**](https://sepolia.basescan.org/address/0x4AfdC83DC87193f7915429c0eBb99d11A77408d1)

### At a Glance

| | |
|---|---|
| **What** | 1,435-line autonomous reward protocol — 3-tier reward pools funded by buy/sell tax, random winners selected via Chainlink VRF |
| **How** | Dual-trigger execution: trade-triggered (every buy/sell) + CRE-triggered (every 2 min) — two independent paths to the same outcome |
| **Proof** | 174 tests (attack, fuzz, invariant, economic stress, fork) · Base Sepolia deployed · Tenderly VNet 60 tx lifecycle · 6-phase security assessment |
| **Post-launch** | Ownership renounced, LP burned, no proxy, no admin keys — the contract is the only authority |

---

## Table of Contents

- [Chainlink Products Used](#-chainlink-products-used)
- [Tenderly Virtual TestNet](#-tenderly-virtual-testnet--live-demo)
- [Why This Matters](#-why-this-matters)
- [The Problem & Solution](#-the-problem)
- [Architecture](#-architecture)
- [Chainlink Integration](#-chainlink-integration)
- [Token Mechanics](#-token-mechanics)
- [Quick Start](#-quick-start)
- [Test Suite](#-test-suite)
- [Security](#-security)
- [Project Structure](#-project-structure)
- [Roadmap](#-roadmap--from-hackathon-to-mainnet)
- [Deployment](#-deployment)
- [Tech Stack](#-tech-stack)

---

## 🔗 Chainlink Products Used

> [!IMPORTANT]
> evmX integrates **3 Chainlink services**: CRE for autonomous execution, VRF for winner selection, and Data Feeds for frontend pricing and analytics.

| Product | Role in Protocol | Where |
|---------|-----------------|-------|
| 🔗 **Chainlink CRE** (3 Workflows) | Second execution path — keeps reward cycle checks active during **zero-volume periods**. Workflow #1 monitors pools + triggers cycle every 2 min. Workflow #2 streams `PoolAllocated` events. Workflow #3 is an AI Strategy Advisor (EVM + HTTP + LLM in one pipeline). | `cre-workflow/src/workflows/` |
| 🎲 **Chainlink VRF v2.5** | Provably fair random winner selection — on-chain verifiable, resistant to in-protocol manipulation. Native ETH payment. 3-block confirmation. | `evmX.sol: fulfillRandomWords()` |
| 📈 **Chainlink Data Feed** (ETH/USD) | Powers all USD price displays in the frontend + feeds the AI analytics engine (pool trend predictions, protocol health score, entry timing recommendations). | `index.html: AggregatorV3Interface` |

> [!NOTE]
> **Why CRE is the critical layer:**
> ```
> Without CRE:  trade triggers only → pools freeze if no one trades for hours
> With CRE:     redundant execution every 2 min → protocol runs independently of trading activity
> ```
> CRE extends the protocol's autonomous design by maintaining execution cadence during inactivity — it operates whether there are 1,000 trades/hour or zero trades for a week.

---

## 🔍 Tenderly Virtual TestNet — Live Demo

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

## 💡 Why This Matters

Most DeFi protocols rely on admin keys, upgrade proxies, or centralized keepers — any of which can be shut down. evmX is designed to eliminate all three.

By combining Chainlink CRE + VRF + Data Feeds with an immutable smart contract, evmX achieves **full post-launch autonomy**:

| | Traditional DeFi | evmX |
|---|---|---|
| Admin key | ✅ Owner can pause/modify | ❌ **Ownership renounced — no admin exists** |
| Upgrade path | ✅ Proxy can change logic | ❌ **No proxy — code is final** |
| Keeper dependency | ✅ Bot must run 24/7 | ❌ **CRE + trade triggers — dual-layer redundancy** |
| Liquidity risk | ✅ Owner can pull LP | ❌ **LP tokens burned — permanently locked** |
| If creator disappears | Protocol degrades or dies | **Protocol continues operating autonomously** |

---

## 🚨 The Problem

Many community reward systems rely on **centralized keepers** to trigger reward distributions. This creates:
- Single points of failure (keeper goes offline = no rewards)
- Trust assumptions (keeper can front-run or delay)
- Operational overhead (someone must maintain the bot)

## ✅ The Solution

evmX replaces centralized keepers with **Chainlink CRE (Runtime Environment)** for autonomous, onchain reward orchestration without an active human operator:

```
User buys evmX → 3% tax fills reward pools → CRE monitors thresholds
→ CRE triggers runAutonomousCycle() → VRF v2.5 selects random winner → ETH paid out
→ Data Feed shows real-time USD values → AI analytics predict optimal entry timing
```

**No active operator. No admin control loop. Ownership renounced. LP burned.**

---

## 🧠 Self-Regulating Protocol Intelligence

> [!IMPORTANT]
> evmX is **not a static token with fixed rules**. It is a mathematically self-calibrating system with **20 autonomous mechanisms** that adapt to market conditions, pool states, and network behavior in real time — no governance votes, no admin calls, no parameter updates. Every rule is enforced by math, not policy.

### Adaptive Economics — The Protocol Breathes (3 mechanisms)

<details>
<summary><b>Dynamic Entry Requirements — barriers that scale with pool size</b></summary>

Every pool's entry requirement is calculated as **0.7% of the current pool balance**, bounded by safety floors and caps:

| Pool State | Pool Balance | Entry Requirement | Effect |
|-----------|-------------|-------------------|--------|
| Early / Low activity | 0.1 ETH | 0.001 ETH (floor) | Low barrier → encourages early participation |
| Growing | 5 ETH | 0.035 ETH | Scales proportionally with pool growth |
| Peak / High activity | 50 ETH | 0.05 ETH (cap) | Cap prevents exclusion at scale |

As the protocol grows, barriers rise — naturally filtering dust and bot entries. As activity slows, barriers drop — encouraging new participants. **The protocol regulates its own accessibility.**

</details>

<details>
<summary><b>Smart Ladder — thresholds that double or halve based on demand</b></summary>

Pool trigger thresholds are **not fixed numbers**. The Smart Ladder algorithm adjusts them within defined ranges based on fill velocity:

| Condition | Action | Example (Micro Pool) |
|-----------|--------|---------------------|
| Pool fills **before** timer expires | Threshold **doubles** | 0.5 ETH → 1.0 ETH |
| Timer expires **before** pool fills | Threshold **halves** | 1.0 ETH → 0.5 ETH |

| Pool | Threshold Range | Timer | Behavior |
|------|----------------|-------|----------|
| **Micro** | 0.01 → 100 ETH | 2 hours | High demand = bigger rewards. Low demand = faster cycles. |
| **Mid** | 0.05 → 500 ETH | 6 hours | Same adaptive logic, medium timeframe |
| **Mega** | Fixed 7-day cycle | 7 days | Weekly reward — size determined entirely by sell volume |

**Result:** During high trading volume, pools accumulate larger rewards before triggering. During quiet periods, rewards fire quickly at smaller amounts. The protocol automatically finds its own equilibrium.

</details>

<details>
<summary><b>Anti-Whale as Economic Balancer — wealth distribution enforced by math</b></summary>

Whale protection in evmX isn't just a security feature — it's an **economic self-balancing mechanism**:

| Rule | Limit | Purpose |
|------|-------|---------|
| Max wallet | 4% of supply | Prevents concentration, forces distribution |
| Max TX | 1.5% of supply | Smooths price impact per trade |
| Micro whale exclusion | >3% supply holders excluded | Protects small-holder odds in the fastest pool |
| Sell = instant revocation | All pools, all cycles | Game theory: hold your tokens or lose your position |

The whale exclusion applies **both at entry AND at selection** — a holder who crosses 3% during a cycle is excluded even if they entered below the threshold. This is enforced at `_isEligibleCandidate()`, not just at enrollment.

</details>

### Degraded-Mode Resilience — Every Path Has a Fallback

<details>
<summary><b>5 fallback systems designed for degraded operating conditions</b></summary>

| Mechanism | Trigger | Action |
|-----------|---------|--------|
| **VRF Emergency Fallback** | VRF doesn't respond for 24h | Commit-reveal on-chain entropy with 5-block delay. If blockhash expires (>256 blocks), auto-recommits. |
| **VRF Stale Reroute** | VRF subscription unfunded for 7 days | All pending VRF ETH redistributes equally to the 3 reward pools |
| **VRF Funding Cap** | VRF subscription reaches 2 ETH | Excess ETH flows back to reward pools instead of over-funding |
| **Marketing Wallet Fallback** | Marketing wallet rejects ETH | Funds redirect to Mega Pool — nothing is lost |
| **Self-Healing Accounting** | Unexpected ETH arrives at contract | `syncETHAccounting()` captures untracked ETH into Mega Pool |

**Every internal ETH path includes a fallback or reroute mechanism.** The protocol is designed so that no ETH remains stuck within the contract's own logic.

</details>

### Intelligent Participant Management

<details>
<summary><b>6 mechanisms that maintain fair participation without admin intervention</b></summary>

| Mechanism | How It Works |
|-----------|-------------|
| **Per-User Required Token Hold** | Each user's minimum hold is calculated from Uniswap reserves at entry time. If the token price changes, the requirement adapts — users who entered at a higher price don't need to hold more tokens than their original ETH commitment. |
| **Transfer Balance Check** | If a user transfers tokens and drops below their required hold for any pool, they are **automatically revoked** — per user, per cycle, per pool. |
| **Buy-to-Play Multi-Entry** | Up to 3 entries per cycle per pool. Entry thresholds scale with the dynamic entry requirement — more commitment = more chances. |
| **Permissionless Re-enrollment** | `reEnroll(address)` — anyone can trigger an eligibility re-check for any address. Community-driven recovery without admin keys. |
| **Payout Failure Recovery** | If a selected recipient can't receive ETH (contract wallet, out of gas), they're marked ineligible and the next candidate is selected. Up to 130 attempts per cycle. |
| **EOA-Only Enforcement** | `candidate.code.length > 0` check at selection time. Smart contracts, MEV bots, and flash loan contracts are automatically excluded. |

</details>

### Gas-Aware Autonomous Operation

<details>
<summary><b>4 gas-management systems that prevent stuck transactions</b></summary>

| System | Gas Reserve | Purpose |
|--------|-----------|---------|
| Recipient selection | 350,000 gas | Stops trying if gas runs low — prevents out-of-gas reverts |
| Allocation execution | 900,000 gas minimum | Won't start allocation if insufficient gas available |
| Entry cleanup | 30,000 gas batch limit | Cleans old entries incrementally — designed to avoid blocking transactions |
| Auto-resolve timeout | Checks per pool | Only processes timed-out allocations when gas permits |

The contract is **designed to avoid reverts from gas exhaustion** during autonomous operations. Every gas-intensive loop includes a reserve check before proceeding.

</details>

### Dual-Layer Trigger Architecture

```
Layer 1 — Trade Triggers (built into _update()):
  Every buy/sell automatically checks all 3 pools and triggers if conditions met.
  Works during active trading. Zero external dependency.

Layer 2 — CRE Triggers (via runAutonomousCycle()):
  Chainlink CRE calls every 2 minutes, regardless of trading activity.
  Handles: pool checks, token→ETH swap, VRF funding, timeout resolution.
  Works even with zero trading volume.

Result: Two independent paths to the same outcome.
        If one is unavailable, the other provides execution.
```

> [!TIP]
> **The core insight:** Every parameter in evmX is either **dynamic** (scales with state), **range-bound** (floor/cap), or **has a fallback** (reroute/recovery). There are no magic numbers that work at one market cap but break at another. The protocol is designed to self-adjust across a wide range of pool sizes without manual retuning.

---

## 🏗 Architecture

<details>
<summary><b>Click to expand full architecture diagram</b></summary>

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

</details>

---

## 🔌 Chainlink Integration

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
| **No trades on Mega day 7** | Weekly reward cycle sits unclaimed | **CRE triggers it** |
| **Token→ETH swap needed, no sells** | 120k tokens accumulate but no swap | **CRE runs swapAndDistribute()** |
| **VRF needs funding, no swap** | pendingVrfEth accumulates, no funding | **CRE calls _attemptVrfFund() directly** |

> [!TIP]
> **Design philosophy:** The contract should not depend on a single trigger mechanism. Layer 1 handles the common case (active trading). Layer 2 (CRE) maintains execution cadence during inactivity. Together, they keep the protocol operating whether there are 1000 trades per hour or zero trades for a week.

<details>
<summary><b>CRE Workflow #1: Autonomous Rewards — code</b></summary>

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

</details>

<details>
<summary><b>CRE Workflow #2: Event Monitor</b></summary>

Processes `PoolAllocated` events in real-time via EVM Log Trigger:
- Decodes winner address, pool type, and payout amount
- Enables automated notifications and analytics dashboards
- Provides a real-time event stream for the frontend winner feed

</details>

<details>
<summary><b>CRE Workflow #3: AI Strategy Advisor — code</b></summary>

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

</details>

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

## 🎰 Token Mechanics

<details>
<summary><b>3-Tier Reward System</b></summary>

| Pool | Cycle | Threshold | Entry Requirement | Tax Source |
|------|-------|-----------|-------------------|------------|
| **Micro** | 2h timer / Smart Ladder | 0.01 - 100 ETH | 0.7% of pool (floor 0.001, cap 0.05 ETH) | 1% buy tax |
| **Mid** | 6h timer / Smart Ladder | 0.05 - 500 ETH | 0.7% of pool (floor 0.0025, cap 0.25 ETH) | 1.5% buy tax |
| **Mega** | Fixed 7-day cycle | — | 0.7% of pool (floor 0.0035, cap 1 ETH) | 1.9% sell tax |

</details>

<details>
<summary><b>Buy-to-Play Entry System</b></summary>

Entries are **only** granted from actual buys (not transfers or re-enrollment):

| Entry | Requirement |
|-------|------------|
| 1st entry | Buy qualifying amount of evmX |
| 2nd entry | Cumulative buy value reaches 2x threshold |
| 3rd entry (max) | Cumulative buy value reaches 3x threshold |

</details>

<details>
<summary><b>Tax Structure</b></summary>

| Direction | Total Tax | Breakdown |
|-----------|-----------|-----------|
| **Buy** | 3% | Micro (1%) + Mid (1.5%) + Marketing (0.4%) + VRF (0.1%) |
| **Sell** | 3% | Mega (1.9%) + Marketing (1%) + VRF (0.1%) |

</details>

### Fully Autonomous — No Admin Keys

After launch, **ownership is permanently renounced** and **LP tokens are burned**. The protocol is designed to operate autonomously with zero human intervention:

| Property | Description |
|----------|-------------|
| **Ownership Renounced** | `renounceOwnership()` permanently locks all admin functions. No party can modify taxes, thresholds, or any parameter. Irreversible. |
| **LP Burned** | Uniswap V2 LP tokens sent to dead address (`0x...dead`). Liquidity permanently locked. |
| **CRE Automated** | Chainlink CRE provides reliable execution even with zero trading volume — swap, VRF funding, and pool triggers operate without any human operator. |
| **VRF Provably Fair** | Chainlink VRF v2.5 provides cryptographically verifiable randomness. Winner selection cannot be predicted or influenced by any party within the protocol. |

> [!CAUTION]
> **After renounce + LP burn, no single party — including the deployer — can change any parameter, drain funds, or stop the reward cycles.** The protocol is designed to continue operating as long as the underlying infrastructure (Base L2, Chainlink VRF, Uniswap V2) remains available.

### Safety Features

- **Chainlink VRF v2.5** — Provably fair randomness (native ETH payment)
- **CRE Automation** — No centralized keeper dependency
- **Anti-whale** — 4% max wallet, 1.5% max TX, whale exclusion from micro pool
- **Smart contract exclusion** — Contract addresses are excluded from winner selection (`candidate.code.length > 0` → rejected). EOA-controlled automation is not fully preventable onchain.
- **Same-block trade protection** — Prevents buy-and-sell in the same block (anti-sandwich)
- **MIN_TOKENS_FOR_REWARDS** — Must hold 100+ tokens to be eligible (dust filter — real threshold is ETH-value-based entry)
- **24h Emergency Fallback** — Commit-reveal on-chain entropy if VRF fails
- **VRF Stale Reroute** — Unfunded VRF ETH redistributes to pools after 7 days
- **Permissionless reEnroll()** — Anyone can trigger eligibility re-check

---

## 🚀 Quick Start

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

## 🧪 Test Suite

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

<details>
<summary><b>Mutation Testing — Proof that tests catch real bugs</b></summary>

| Mutation | What broke | Tests that caught it |
|----------|-----------|---------------------|
| Remove `buyAmountETH > 0` guard | Transfer/reEnroll grants entries | P38, G21, fuzz_reEnroll |
| `MAX_ENTRIES_PER_CYCLE` 3 → 255 | Unlimited entries per cycle | P40, fuzz_buyToPlay |
| `EMERGENCY_COMMIT_DELAY` 5 → 0 | No commit-reveal delay | P42 |

</details>

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

## 🛡 Security

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

## 📁 Project Structure

<details>
<summary><b>Click to expand</b></summary>

```
evmX/
├── contracts/
│   ├── evmX.sol                    # Production contract (Base Mainnet)
│   ├── evmX_Testable.sol           # Test variant (injectable dependencies)
│   └── mocks/                      # Mock contracts for testing
│
├── cre-workflow/                   # Chainlink CRE Integration
│   ├── project.yaml                # CRE project configuration
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

</details>

---

## 🗺 Roadmap — From Hackathon to Mainnet

evmX is not just a hackathon demo — it's a **production-ready protocol** with a clear path to Base Mainnet launch.

### Phase 1: Hackathon (Current)
- [x] Smart contract finalized (1,435 lines, 174 tests)
- [x] Deployed to Base Sepolia with Chainlink VRF v2.5
- [x] 3 CRE Workflows (Autonomous Rewards + Event Monitor + AI Strategy Advisor)
- [x] Frontend dApp with AI Protocol Intelligence
- [x] 6-phase security assessment completed
- [x] Tenderly Virtual TestNet — full lifecycle demo (60 tx, verified, Public Explorer)

### Phase 2: Mainnet Launch (Post-Hackathon)
- [ ] **Hackathon prize funds launch** — 60% allocated to Uniswap V2 liquidity on Base Mainnet, 40% reserved for continued development (frontend, audit, CRE deployment)
- [ ] LP tokens permanently burned — liquidity locked
- [ ] Ownership renounced immediately after launch
- [ ] CRE Workflows deployed to production (Base Mainnet)
- [ ] VRF subscription funded for continuous operation

### Phase 3: Autonomous Operation
- [ ] Protocol operates autonomously — no human intervention required
- [ ] Community growth driven by reward mechanics
- [ ] CRE ensures 24/7 pool monitoring and execution
- [ ] Marketing wallet funds used for community initiatives

> [!NOTE]
> **Launch Strategy:** The hackathon prize is the catalyst for real-world deployment. 60% funds the initial Uniswap V2 liquidity pool (LP tokens burned — permanent, locked liquidity). 40% funds continued development: frontend, security audit, and CRE production deployment. Transparent and sustainable from day one.

---

## 📦 Deployment

### Tenderly Virtual TestNet

```bash
npm run deploy:tenderly    # Deploy to Tenderly VNet + auto-verify
npm run demo:tenderly      # Run demo transactions (full lifecycle)
```

> See **[Tenderly Virtual TestNet — Live Demo](#-tenderly-virtual-testnet--live-demo)** section above for full details, Public Explorer link, and transaction breakdown.

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

## ⚙ Tech Stack

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
