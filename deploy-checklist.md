# evmX Deployment Checklist

## 1. Pre-Flight
- [ ] **Validate `.env` values:**
  - `DEPLOYER_PRIVATE_KEY` is set and funded with Base ETH.
  - `BASESCAN_API_KEY` is set for contract verification.
  - `MARKETING_WALLET` is correct and double-checked.
- [ ] **Prepare Chainlink VRF subscription:**
  - Create a new subscription at `vrf.chain.link`.
  - Fund it with at least `0.1 ETH` on Base Mainnet (cap: 2 ETH auto-managed by contract).
  - Save the `Subscription ID`.

## 2. Deployment
- [ ] Run:
  ```bash
  npm run deploy:base
  ```
- [ ] Record the deployed contract address (`evmX Address`).

## 3. Immediate Post-Deployment Configuration
- [ ] **Add VRF consumer:**
  - Go back to the Chainlink VRF dashboard.
  - Use **Add Consumer** and add the new `evmX` contract address.
  - If you skip this step, automated allocation cycles will fail.

## 4. Liquidity And Launch Preparation
- [ ] **Add liquidity:**
  ```bash
  npm run add-liquidity
  ```
  - Alternative: add liquidity manually on Uniswap V2 (`evmX + ETH`).
- [ ] **Update frontend config:**
  - Open `index.html`.
  - Update `CONTRACT_ADDRESS` to the newly deployed address.

## 5. Final Verification And Lockdown
- [ ] Confirm on BaseScan that the contract status is **Verified**.
- [ ] Execute a small test buy.
- [ ] Confirm the wallet shows as **Eligible** for the Micro pool.
- [ ] **Renounce ownership:**
  - Call `renounceOwnership()` from BaseScan under **Write Contract**.
  - After this step, control is fully decentralized and immutable.

## 6. Go-Live
- [ ] Publish the website and contract address.
- [ ] Monitor the first Micro pool cycle (typically around 2 hours or `0.01 ETH` threshold activity).


