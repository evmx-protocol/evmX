/**
 * ============================================================================
 *  evmX - Base Sepolia Testnet Deploy Script
 * ============================================================================
 *
 *  Usage:
 *    npx hardhat run scripts/deploy-sepolia.js --network baseSepolia
 *
 *  Prerequisites:
 *    1. .env: DEPLOYER_PRIVATE_KEY, BASE_SEPOLIA_RPC_URL
 *    2. VRF subscription on Base Sepolia: https://vrf.chain.link/base-sepolia
 *    3. .env: MARKETING_WALLET, VRF_SUBSCRIPTION_ID
 *    4. Get test ETH from https://www.alchemy.com/faucets/base-sepolia
 *
 *  After deploy:
 *    1. Add contract as VRF consumer on subscription
 *    2. Update CRE workflow config with contract address
 *    3. Update index.html CONTRACT_ADDRESS
 * ============================================================================
 */

const hre = require("hardhat");

// ── Base Sepolia contract addresses ──────────────────────────────────────────
const BASE_SEPOLIA_ROUTER = "0x1689E7B1F10000AE47eBfE339a4f69dECd19F602";
const BASE_SEPOLIA_VRF_COORDINATOR = "0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE";
const BASE_SEPOLIA_VRF_KEY_HASH = "0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71";

async function main() {
  console.log("=".repeat(60));
  console.log("  evmX - Base Sepolia Testnet Deployment");
  console.log("=".repeat(60) + "\n");

  // -- Load parameters --
  const MARKETING_WALLET = process.env.MARKETING_WALLET;
  const VRF_SUBSCRIPTION_ID = process.env.VRF_SUBSCRIPTION_ID;

  if (!MARKETING_WALLET) {
    throw new Error("MARKETING_WALLET not set in .env");
  }
  if (!VRF_SUBSCRIPTION_ID) {
    throw new Error("VRF_SUBSCRIPTION_ID not set in .env");
  }

  const vrfSubId = BigInt(VRF_SUBSCRIPTION_ID);

  console.log("  Configuration:");
  console.log(`    Marketing wallet:     ${MARKETING_WALLET}`);
  console.log(`    VRF Subscription ID:  ${vrfSubId}`);
  console.log(`    Network:              ${hre.network.name}`);
  console.log(`    Router:               ${BASE_SEPOLIA_ROUTER}`);
  console.log(`    VRF Coordinator:      ${BASE_SEPOLIA_VRF_COORDINATOR}`);
  console.log(`    VRF Key Hash:         ${BASE_SEPOLIA_VRF_KEY_HASH.slice(0, 18)}...`);

  // -- Deployer check --
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`    Deployer:             ${deployer.address}`);
  console.log(`    Deployer balance:     ${hre.ethers.formatEther(balance)} ETH`);

  if (balance < hre.ethers.parseEther("0.01")) {
    throw new Error(
      "Deployer needs at least 0.01 ETH for gas!\n" +
      "  Get test ETH: https://www.alchemy.com/faucets/base-sepolia"
    );
  }

  console.log("\n  Deploying evmX_Testable (injectable addresses for testnet)...\n");

  // -- Deploy evmX_Testable (injectable Router + VRF for testnet) --
  const evmXFactory = await hre.ethers.getContractFactory("evmX_Testable");

  const evmX = await evmXFactory.deploy(
    MARKETING_WALLET,
    vrfSubId,
    BASE_SEPOLIA_ROUTER,
    BASE_SEPOLIA_VRF_COORDINATOR,
    BASE_SEPOLIA_VRF_KEY_HASH
  );
  await evmX.waitForDeployment();

  const contractAddress = await evmX.getAddress();
  console.log(`  evmX_Testable deployed: ${contractAddress}`);

  // -- Post-deploy checks --
  const totalSupply = await evmX.totalSupply();
  const ownerBalance = await evmX.balanceOf(deployer.address);
  const pair = await evmX.uniswapPair();

  console.log("\n  Post-deploy verification:");
  console.log(`    Total Supply:         ${hre.ethers.formatEther(totalSupply)} evmX`);
  console.log(`    Owner balance:        ${hre.ethers.formatEther(ownerBalance)} evmX`);
  console.log(`    Uniswap V2 Pair:      ${pair}`);

  // -- Save deployment info --
  console.log("\n" + "=".repeat(60));
  console.log("  DEPLOYMENT SUCCESSFUL!");
  console.log("=".repeat(60));

  console.log("\n  NEXT STEPS:\n");
  console.log("  1. Add VRF Consumer:");
  console.log(`     -> https://vrf.chain.link/base-sepolia/${VRF_SUBSCRIPTION_ID}`);
  console.log(`     -> "Add Consumer" -> ${contractAddress}\n`);
  console.log("  2. Update CRE workflow config:");
  console.log("     -> cre-workflow/src/workflows/evmx-autonomous-rewards/config.json");
  console.log(`     -> Set evmxContractAddress to: ${contractAddress}\n`);
  console.log("  3. Update frontend:");
  console.log("     -> index.html -> Change CONTRACT_ADDRESS");
  console.log(`     -> Set to: ${contractAddress}\n`);
  console.log("  4. Verify on BaseScan:");
  console.log(`     npx hardhat verify --network baseSepolia ${contractAddress} \\`);
  console.log(`       "${MARKETING_WALLET}" "${vrfSubId}" \\`);
  console.log(`       "${BASE_SEPOLIA_ROUTER}" "${BASE_SEPOLIA_VRF_COORDINATOR}" \\`);
  console.log(`       "${BASE_SEPOLIA_VRF_KEY_HASH}"\n`);

  const fs = require("fs");
  const path = require("path");
  const deployDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });

  const deploymentInfo = {
    network: "base-sepolia",
    chainId: 84532,
    contract: "evmX_Testable",
    contractAddress,
    pair,
    deployer: deployer.address,
    marketingWallet: MARKETING_WALLET,
    vrfSubscriptionId: VRF_SUBSCRIPTION_ID,
    router: BASE_SEPOLIA_ROUTER,
    vrfCoordinator: BASE_SEPOLIA_VRF_COORDINATOR,
    vrfKeyHash: BASE_SEPOLIA_VRF_KEY_HASH,
    deployedAt: new Date().toISOString(),
    txHash: evmX.deploymentTransaction()?.hash || "unknown",
  };

  const filename = `base-sepolia-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deployDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`  Deployment info saved: deployments/${filename}`);

  return deploymentInfo;
}

main()
  .then(() => {
    console.log("\n  Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n  Deploy ERROR:", error.message || error);
    process.exit(1);
  });
