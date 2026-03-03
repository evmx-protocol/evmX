# evmX — Chainlink Convergence Hackathon 2026 Submission Guide

> **Deadline: March 8, 2026 @ 11:59 PM ET**
> **Track: DeFi & Tokenization** ($20K / $12K / $8K prizes)

---

## Step 1: GitHub Repository

### 1.1 Create GitHub Account (if needed)
- Go to https://github.com/join
- Create account

### 1.2 Create Repository
```bash
# Create a new PRIVATE repo (can make public before submission)
# Name: evmX or evmX-protocol

# From the project folder:
git remote add origin https://github.com/evmx-protocol/evmX.git
git branch -M main
git push -u origin main
```

### 1.3 Make Repository Public
- Go to Settings → Danger Zone → Change visibility → Public

---

## Step 2: Base Sepolia Deploy

### 2.1 Get Test ETH
- Faucet: https://www.alchemy.com/faucets/base-sepolia
- Need: ~0.05 ETH (deploy + test transactions)

### 2.2 Configure `.env`
```bash
# Copy and edit:
cp .env.example .env

# Fill in:
DEPLOYER_PRIVATE_KEY=0x...your_private_key...
MARKETING_WALLET=0x...your_wallet...
VRF_SUBSCRIPTION_ID=12345  # Create at vrf.chain.link (Base Sepolia)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASESCAN_API_KEY=...  # From basescan.org
```

### 2.3 Create VRF Subscription (Base Sepolia)
1. Go to https://vrf.chain.link
2. Switch to Base Sepolia network
3. Create new subscription → Fund with 0.01 ETH
4. Save the Subscription ID

### 2.4 Deploy
```bash
npm run deploy:sepolia
```
Record the contract address!

### 2.5 Add VRF Consumer
1. Go to VRF dashboard → Your subscription
2. Add Consumer → paste the deployed contract address

### 2.6 Verify Contract
```bash
npm run verify:sepolia -- CONTRACT_ADDRESS "MARKETING_WALLET" VRF_SUBSCRIPTION_ID
```

### 2.7 Update Frontend
Edit `index.html` → Change `CONTRACT_ADDRESS` to the deployed address.

---

## Step 3: Run CRE Simulate

### Option A: GitHub Actions (Recommended)
1. Push code to GitHub
2. Go to Actions → "CRE Workflow Simulate"
3. Click "Run workflow"
4. Download the simulation output artifact

### Option B: Local (Linux/Mac/WSL)
```bash
# Download CRE CLI
curl -sL https://github.com/smartcontractkit/cre-cli/releases/download/v1.2.0/cre_linux_amd64.tar.gz | tar -xz
chmod +x cre

# Run simulate
cd cre-workflow
../cre workflow simulate ./src/workflows/evmx-autonomous-rewards --target local-simulation
```

### Update CRE Config
After deploy, update `cre-workflow/src/workflows/evmx-autonomous-rewards/config.json`:
```json
{
  "evmxContractAddress": "0x...YOUR_DEPLOYED_ADDRESS..."
}
```

---

## Step 4: Record Demo Video (3-5 minutes)

### Recommended Structure:

**0:00 - 0:30 | Introduction**
- "evmX: Autonomous Community Reward Protocol on Base L2"
- "Built for Chainlink Convergence Hackathon 2026"
- "Uses 3 Chainlink services: CRE, VRF v2.5, and Data Feed"

**0:30 - 1:30 | The Problem & Solution**
- Problem: ERC-20 reward tokens use centralized keepers
- Solution: Chainlink CRE replaces keepers with trustless automation
- Show architecture diagram from README
- Highlight: multi-layer trigger design (trades + CRE)

**1:30 - 2:30 | Live Demo**
- Show the frontend dashboard (index.html)
- Connect wallet to Base Sepolia
- Show pool states (Micro, Mid, Mega) with **live USD prices from Chainlink Data Feed**
- Show **AI Protocol Intelligence** panel (predictions, trends, health score)
- Show entry dots and eligibility
- Click "Run Autonomous Cycle" button

**2:30 - 3:30 | Chainlink Integration Deep Dive**
- **CRE**: Show workflow code, CRE simulate output
- **VRF v2.5**: Provably fair random winner selection
- **Data Feed**: ETH/USD price powering USD displays + AI analytics
- Explain: Cron trigger → Read pools → Write report → on-chain execution

**3:30 - 4:30 | Security & Testing**
- Show 174 tests passing (CI screenshot)
- Mention: reentrancy, flash loan, sandwich, MEV, gas grief tests
- Mutation testing: all mutations caught
- Autonomy: Ownership renounced + LP burned

**4:30 - 5:00 | Conclusion**
- Recap: 3 Chainlink services, 3-tier rewards, unconditional autonomy
- "No admin. No keys. No human intervention. Runs forever."
- Show BaseScan verified contract

### Recording Tips:
- Use OBS Studio (free): https://obsproject.com
- Resolution: 1920x1080, 30fps
- Upload to YouTube (unlisted)
- Or use Loom: https://www.loom.com

---

## Step 5: Submit to Hackathon

### Submission Form: https://airtable.com/appkJIP2SmJYxlxqC/pagwE2zGZxYDsb0Fs/form

### Required Fields:
| Field | Value |
|-------|-------|
| **Project Name** | evmX — Autonomous Community Reward Protocol |
| **Track** | DeFi & Tokenization |
| **Description** | Autonomous 3-tier reward ERC-20 on Base L2 with multi-layer trigger architecture. Uses **3 Chainlink services**: CRE for guaranteed execution (even with zero trades), VRF v2.5 for provably fair randomness, and Data Feed (ETH/USD) for real-time USD pricing + AI-powered protocol analytics. Ownership renounced + LP burned = unconditionally autonomous. 174 tests, mutation-tested. |
| **GitHub URL** | https://github.com/evmx-protocol/evmX |
| **Demo Video** | https://youtube.com/watch?v=... |
| **Contract Address** | [0x4AfdC83DC87193f7915429c0eBb99d11A77408d1](https://sepolia.basescan.org/address/0x4AfdC83DC87193f7915429c0eBb99d11A77408d1) (Base Sepolia) |
| **CRE Workflow** | Yes — 2 workflows (Autonomous Rewards + Event Monitor) |
| **Chainlink Services** | CRE (2 workflows) + VRF v2.5 + Data Feed (ETH/USD) = **3 services** |
| **Additional Tracks** | Tenderly ($5K bonus track) |

---

## Checklist

- [ ] GitHub repo is **public**
- [ ] Base Sepolia contract is **deployed and verified**
- [ ] VRF subscription is **funded** and consumer **added**
- [ ] CRE simulate output is captured
- [ ] Frontend shows live pool data with **USD prices (Chainlink Data Feed)**
- [ ] Frontend shows **AI Protocol Intelligence** panel
- [ ] Demo video uploaded (3-5 min)
- [ ] Submission form completed
- [ ] README has all badges and documentation
- [ ] All 174 tests pass in CI

---

*Good luck! 🏆*
