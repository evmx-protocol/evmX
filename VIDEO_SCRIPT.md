# evmX Demo Video Script
# Duration: 3-4 minutes | No voiceover needed — text overlays + background music

---

## SCENE 1: Title Card (0:00 - 0:15)
**[Dark background with slow fade-in]**

Text overlay:
```
evmX
Autonomous Community Reward Protocol

Built on Base L2 | Powered by Chainlink
```

---

## SCENE 2: Problem & Solution (0:15 - 0:45)
**[Show the architecture diagram from README or a simple slide]**

Text overlay (show one by one):
```
THE PROBLEM:
DeFi reward systems rely on centralized keepers
and opaque random selection

THE SOLUTION:
evmX uses 3 Chainlink services for fully
autonomous, verifiably fair reward distribution
```

Then show:
```
Chainlink VRF v2.5 — Provably fair winner selection
Chainlink CRE    — Autonomous pool monitoring & execution
Chainlink Data Feeds — ETH/USD price reference
```

---

## SCENE 3: How It Works (0:45 - 1:15)
**[Simple animation or slide showing the flow]**

Text overlay:
```
HOW IT WORKS

1. Users buy/sell evmX tokens
2. 3% tax fills three reward pools:
   - Micro Pool (fast, small rewards)
   - Mid Pool (medium rewards)
   - Mega Pool (weekly jackpot)
3. CRE Workflows monitor pool thresholds
4. When ready → Chainlink VRF selects random winner
5. Winner receives ETH reward automatically
```

---

## SCENE 4: Live Demo — Frontend (1:15 - 2:00)
**[Screen record: open index.html in browser]**

Steps to show:
1. Open the dApp — show the cosmic UI design
2. Show the three pool cards (Micro, Mid, Mega)
3. Show live pool balances and timers
4. Show the "Recent Winners" section
5. Show wallet connection (MetaMask)

Text overlay:
```
LIVE ON BASE SEPOLIA
Contract: 0x4AfdC83DC87193f7915429c0eBb99d11A77408d1
```

---

## SCENE 5: Smart Contract (2:00 - 2:30)
**[Screen record: BaseScan contract page]**

Steps to show:
1. Open BaseScan — show verified contract
2. Show contract name: ETERNAL VIRTUAL MACHINE (evmX)
3. Show total supply: 100,000,000 tokens
4. Quick scroll through contract code
5. Show VRF subscription page

Text overlay:
```
VERIFIED SMART CONTRACT
Solidity 0.8.28 | 1,385 lines
Anti-whale protection | Same-block trade protection
Emergency fallback with on-chain entropy
```

---

## SCENE 6: CRE Workflows (2:30 - 3:00)
**[Screen record: VS Code with CRE workflow files]**

Steps to show:
1. Show evmx-autonomous-rewards/index.ts — quick scroll
2. Show evmx-event-monitor/index.ts — quick scroll
3. Show config.json with contract address

Text overlay:
```
2 CRE WORKFLOWS

Autonomous Rewards:
- Cron-triggered pool monitoring
- Reads on-chain state via callContract
- Submits writeReport when pools are ready

Event Monitor:
- EVM Log Trigger on PoolAllocated events
- Real-time winner notifications
- Decodes event data for analytics
```

---

## SCENE 7: Testing & Security (3:00 - 3:30)
**[Screen record: terminal running tests]**

Run in terminal:
```bash
npx hardhat test test/LaunchStress.test.js
```

Then show Foundry test results (or screenshot).

Text overlay:
```
174 TESTS — ALL PASSING

Foundry (121 tests):
- Attack resistance (reentrancy, flash loan, sandwich)
- Fuzz testing (1000 runs per test)
- Invariant testing (stateful properties)
- Economic stress testing

Hardhat (53 tests):
- Unit & integration tests
- 50-bot stress simulation
- Base Mainnet fork tests
```

---

## SCENE 8: Launch Plan (3:30 - 3:50)
**[Dark background with bold text — this is KEY for judges]**

Text overlay (show one by one with emphasis):
```
FROM HACKATHON TO MAINNET

Hackathon prize → 100% allocated to
Uniswap V2 liquidity on Base Mainnet

LP tokens permanently burned
→ No rug pull possible

Ownership renounced
→ Unstoppable autonomous protocol

This isn't just a demo.
evmX is ready to launch.
```

---

## SCENE 9: Closing (3:50 - 4:05)
**[Dark background, fade in]**

Text overlay:
```
evmX
Autonomous Community Reward Protocol

GitHub: github.com/evmx-protocol/evmX
Network: Base Sepolia (Chain ID: 84532)
Contract: 0x4AfdC83DC87193f7915429c0eBb99d11A77408d1

Hackathon Prize = Initial Liquidity = Real Launch

Built for Chainlink Convergence Hackathon 2026
DeFi & Tokenization Track
```

---

## PRODUCTION TIPS

### Background Music
- Use royalty-free music from:
  - YouTube Audio Library (free)
  - Pixabay Music (free)
  - Uppbeat (free with credit)
- Style: Electronic / Ambient / Tech — low volume

### Recording
- Use OBS Studio (free): obsproject.com
- Resolution: 1920x1080 (Full HD)
- Record each scene separately, then combine in editor

### Editing
- CapCut Desktop (free) — best for text overlays
- OR Clipchamp (built into Windows 11)
- Add smooth transitions between scenes (fade, slide)
- Text animation: fade-in, typewriter effect

### Upload
- Upload to YouTube (unlisted or public)
- Title: "evmX — Autonomous Community Reward Protocol | Chainlink Hackathon 2026"
- Description: Include GitHub link and contract address
