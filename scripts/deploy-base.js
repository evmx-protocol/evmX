/**
 * ============================================================================
 *  evmX — Base Mainnet Deploy Script
 * ============================================================================
 *
 *  Usage:
 *    npx hardhat run scripts/deploy-base.js --network base
 *
 *  Prerequisites:
 *    1. .env: DEPLOYER_PRIVATE_KEY, BASE_RPC_URL, BASESCAN_API_KEY
 *    2. VRF subscription must already exist at https://vrf.chain.link/
 *    3. .env: MARKETING_WALLET, VRF_SUBSCRIPTION_ID
 *    4. Deployer wallet must have ~0.01 ETH for gas (Base)
 *
 *  After deploy:
 *    1. Add contract as VRF consumer on subscription
 *    2. Verify: npx hardhat verify --network base <CONTRACT_ADDRESS> <MARKETING_WALLET> <VRF_SUB_ID>
 *    3. Add liquidity on Uniswap V2
 *    4. (Optional) Renounce ownership
 * ============================================================================
 */

const hre = require("hardhat");

async function main() {
  console.log("=".repeat(55));
  console.log("  evmX — Base Mainnet Deployment");
  console.log("=".repeat(55) + "\n");

  // ── Load parameters ────────────────────────────────────────────────────
  const MARKETING_WALLET = process.env.MARKETING_WALLET;
  const VRF_SUBSCRIPTION_ID = process.env.VRF_SUBSCRIPTION_ID;

  if (!MARKETING_WALLET) {
    throw new Error("MARKETING_WALLET not set in .env");
  }
  if (!VRF_SUBSCRIPTION_ID) {
    throw new Error("VRF_SUBSCRIPTION_ID not set in .env");
  }

  const vrfSubId = BigInt(VRF_SUBSCRIPTION_ID);

  console.log(`  Marketing wallet:     ${MARKETING_WALLET}`);
  console.log(`  VRF Subscription ID:  ${vrfSubId}`);
  console.log(`  Network:              ${hre.network.name}`);

  // ── Deployer check ─────────────────────────────────────────────────────
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`  Deployer:             ${deployer.address}`);
  console.log(`  Deployer balance:     ${hre.ethers.formatEther(balance)} ETH`);

  if (balance < hre.ethers.parseEther("0.003")) {
    throw new Error("Deployer needs at least 0.003 ETH for gas!");
  }

  console.log("\n--- Starting deployment... ---\n");

  // ── Deploy ─────────────────────────────────────────────────────────────
  const evmXFactory = await hre.ethers.getContractFactory("evmX");

  console.log("  Compiling & deploying evmX...");
  const evmX = await evmXFactory.deploy(MARKETING_WALLET, vrfSubId);
  await evmX.waitForDeployment();

  const contractAddress = await evmX.getAddress();
  console.log(`\n  evmX deployed: ${contractAddress}`);

  // ── Post-deploy verification ───────────────────────────────────────────
  const totalSupply = await evmX.totalSupply();
  const ownerBalance = await evmX.balanceOf(deployer.address);
  const pair = await evmX.uniswapPair();
  const maxTx = await evmX.maxTxAmount();
  const maxWallet = await evmX.maxWalletAmount();
  const vrfSubIdContract = await evmX.vrfSubscriptionId();

  console.log("\n--- Post-deploy verification ---\n");
  console.log(`  Total Supply:         ${hre.ethers.formatEther(totalSupply)} evmX`);
  console.log(`  Owner balance:        ${hre.ethers.formatEther(ownerBalance)} evmX`);
  console.log(`  Uniswap V2 Pair:      ${pair}`);
  console.log(`  Max TX (1.5%):        ${hre.ethers.formatEther(maxTx)} evmX`);
  console.log(`  Max Wallet (4%):      ${hre.ethers.formatEther(maxWallet)} evmX`);
  console.log(`  VRF Subscription ID:  ${vrfSubIdContract}`);

  // ── Success ────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(55));
  console.log("  DEPLOYMENT SUCCESSFUL!");
  console.log("=".repeat(55) + "\n");

  console.log("  NEXT STEPS:\n");
  console.log(`  1. Add VRF Consumer:`);
  console.log(`     -> Go to: https://vrf.chain.link/base/${VRF_SUBSCRIPTION_ID}`);
  console.log(`     -> "Add Consumer" -> ${contractAddress}\n`);

  console.log(`  2. Verify on BaseScan:`);
  console.log(`     npx hardhat verify --network base ${contractAddress} "${MARKETING_WALLET}" "${VRF_SUBSCRIPTION_ID}"\n`);

  console.log(`  3. Add Liquidity:`);
  console.log(`     -> Approve evmX token for Router`);
  console.log(`     -> Call router.addLiquidityETH()`);
  console.log(`     -> Or use the add-liquidity script\n`);

  console.log(`  4. (Optional) Renounce ownership:`);
  console.log(`     -> Only AFTER everything works!`);
  console.log(`     -> evmX.renounceOwnership()\n`);

  // ── Save deployment info ───────────────────────────────────────────────
  const deploymentInfo = {
    network: "base",
    chainId: 8453,
    contractAddress,
    pair,
    deployer: deployer.address,
    marketingWallet: MARKETING_WALLET,
    vrfSubscriptionId: VRF_SUBSCRIPTION_ID,
    deployedAt: new Date().toISOString(),
    txHash: evmX.deploymentTransaction()?.hash || "unknown",
  };

  const fs = require("fs");
  const path = require("path");
  const deployDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });

  const filename = `base-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deployDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`  Deployment info saved: deployments/${filename}`);

  return deploymentInfo;
}

main()
  .then((info) => {
    console.log("\n  Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n  Deploy ERROR:", error.message || error);
    process.exit(1);
  });
