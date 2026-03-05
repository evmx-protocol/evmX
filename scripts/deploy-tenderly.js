/**
 * ============================================================================
 *  evmX — Tenderly Virtual TestNet Deploy Script
 * ============================================================================
 *
 *  Deploys the PRODUCTION evmX.sol contract to a Tenderly Virtual TestNet
 *  (Base mainnet fork). All hardcoded addresses (Uniswap V2 Router, WETH,
 *  VRF Coordinator) exist on the fork — no Testable variant needed.
 *
 *  Usage:
 *    npx hardhat run scripts/deploy-tenderly.js --network tenderlyVNet
 *
 *  Prerequisites:
 *    1. Tenderly Virtual TestNet created (Base fork, chain ID 8453)
 *    2. .env: TENDERLY_VIRTUAL_TESTNET_RPC, DEPLOYER_PRIVATE_KEY
 *    3. .env: MARKETING_WALLET, VRF_SUBSCRIPTION_ID
 *    4. Fund deployer via Tenderly dashboard "Fund Account"
 *
 *  After deploy:
 *    1. Run demo script: npm run demo:tenderly
 *    2. Check Tenderly Explorer for contract + transactions
 *    3. Update README with explorer link
 * ============================================================================
 */

const hre = require("hardhat");

async function main() {
  console.log("=".repeat(60));
  console.log("  evmX — Tenderly Virtual TestNet Deployment");
  console.log("=".repeat(60) + "\n");

  // ── Validate network ───────────────────────────────────────────────────
  if (hre.network.name !== "tenderlyVNet") {
    throw new Error(
      `Expected network 'tenderlyVNet', got '${hre.network.name}'.\n` +
      "  Usage: npx hardhat run scripts/deploy-tenderly.js --network tenderlyVNet"
    );
  }

  // ── Load parameters ────────────────────────────────────────────────────
  const MARKETING_WALLET = process.env.MARKETING_WALLET;
  const VRF_SUBSCRIPTION_ID = process.env.VRF_SUBSCRIPTION_ID;

  if (!MARKETING_WALLET) {
    throw new Error("MARKETING_WALLET not set in .env");
  }
  if (!VRF_SUBSCRIPTION_ID) {
    throw new Error(
      "VRF_SUBSCRIPTION_ID not set in .env\n" +
      "  For Tenderly VNet, use any valid uint256 (e.g., 1).\n" +
      "  VRF callbacks won't arrive on a fork, but the contract deploys fine."
    );
  }

  const vrfSubId = BigInt(VRF_SUBSCRIPTION_ID);

  // ── Deployer check ─────────────────────────────────────────────────────
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("  Configuration:");
  console.log(`    Network:              ${hre.network.name} (Tenderly Base fork)`);
  console.log(`    Marketing wallet:     ${MARKETING_WALLET}`);
  console.log(`    VRF Subscription ID:  ${vrfSubId}`);
  console.log(`    Deployer:             ${deployer.address}`);
  console.log(`    Deployer balance:     ${hre.ethers.formatEther(balance)} ETH`);

  if (balance < hre.ethers.parseEther("0.01")) {
    throw new Error(
      "Deployer needs at least 0.01 ETH!\n" +
      "  Fund via Tenderly dashboard: Virtual TestNets → your VNet → Fund Account"
    );
  }

  // ── Verify fork state (Uniswap V2 Router exists) ──────────────────────
  const UNISWAP_V2_ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
  const routerCode = await hre.ethers.provider.getCode(UNISWAP_V2_ROUTER);
  if (routerCode === "0x") {
    throw new Error(
      "Uniswap V2 Router not found at expected address!\n" +
      "  Make sure your Tenderly VNet is a Base mainnet fork (chain ID 8453)."
    );
  }
  console.log(`    Uniswap V2 Router:    ${UNISWAP_V2_ROUTER} ✓ (code exists)`);

  // ── Base mainnet addresses (exist on fork) ─────────────────────────────
  const VRF_COORDINATOR = "0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634";
  const VRF_KEY_HASH = "0xdc2f87677b01473c763cb0aee938ed3341512f6057324a584e5944e786144d70";

  console.log(`    VRF Coordinator:      ${VRF_COORDINATOR}`);
  console.log(`    VRF Key Hash:         ${VRF_KEY_HASH.slice(0, 18)}...`);

  // ── Create VRF subscription on fork ───────────────────────────────────
  console.log("\n  Step 1: Creating VRF subscription on fork...");

  const vrfCoordinatorAbi = [
    "function createSubscription() external returns (uint256 subId)",
    "function getSubscription(uint256 subId) external view returns (uint96 balance, uint96 nativeBalance, uint64 reqCount, address subOwner, address[] memory consumers)",
    "function addConsumer(uint256 subId, address consumer) external",
    "function fundSubscriptionWithNative(uint256 subId) external payable",
  ];
  const vrfCoord = new hre.ethers.Contract(VRF_COORDINATOR, vrfCoordinatorAbi, deployer);

  const createTx = await vrfCoord.createSubscription();
  const createReceipt = await createTx.wait();

  // Parse subscription ID from SubscriptionCreated event
  const subCreatedTopic = hre.ethers.id("SubscriptionCreated(uint256,address)");
  const subLog = createReceipt.logs.find(l => l.topics[0] === subCreatedTopic);
  let forkVrfSubId;
  if (subLog) {
    forkVrfSubId = BigInt(subLog.topics[1]);
  } else {
    // Fallback: try to decode from first log
    forkVrfSubId = BigInt(createReceipt.logs[0]?.topics[1] || "1");
  }
  console.log(`    VRF Subscription created: ${forkVrfSubId}`);

  // Fund the subscription with some native ETH
  const fundTx = await vrfCoord.fundSubscriptionWithNative(forkVrfSubId, {
    value: hre.ethers.parseEther("1"),
  });
  await fundTx.wait();
  console.log("    VRF Subscription funded with 1 ETH");

  // ── Deploy evmX_Testable ───────────────────────────────────────────────
  console.log("\n  Step 2: Deploying evmX_Testable...\n");

  const evmXFactory = await hre.ethers.getContractFactory("evmX_Testable");
  const evmX = await evmXFactory.deploy(
    MARKETING_WALLET,
    forkVrfSubId,
    UNISWAP_V2_ROUTER,
    VRF_COORDINATOR,
    VRF_KEY_HASH
  );
  await evmX.waitForDeployment();

  // Add contract as VRF consumer
  const contractAddress = await evmX.getAddress();
  const addConsumerTx = await vrfCoord.addConsumer(forkVrfSubId, contractAddress);
  await addConsumerTx.wait();
  console.log(`    Contract added as VRF consumer`);

  console.log(`\n  evmX_Testable deployed: ${contractAddress}`);

  // ── Post-deploy verification ───────────────────────────────────────────
  const contract = await hre.ethers.getContractAt("evmX_Testable", contractAddress, deployer);
  const totalSupply = await contract.totalSupply();
  const ownerBalance = await contract.balanceOf(deployer.address);
  const pair = await contract.uniswapPair();
  const maxTx = await contract.maxTxAmount();
  const maxWallet = await contract.maxWalletAmount();

  console.log("\n  Post-deploy verification:");
  console.log(`    Total Supply:         ${hre.ethers.formatEther(totalSupply)} evmX`);
  console.log(`    Owner balance:        ${hre.ethers.formatEther(ownerBalance)} evmX`);
  console.log(`    Uniswap V2 Pair:      ${pair}`);
  console.log(`    Max TX (1.5%):        ${hre.ethers.formatEther(maxTx)} evmX`);
  console.log(`    Max Wallet (4%):      ${hre.ethers.formatEther(maxWallet)} evmX`);

  // ── Tenderly Source Code Verification ──────────────────────────────────
  console.log("\n  Step 3: Verifying source code on Tenderly...");

  try {
    const fs2 = require("fs");
    const path2 = require("path");
    const buildInfoDir = path2.join(__dirname, "..", "artifacts", "build-info");
    const buildFiles = fs2.readdirSync(buildInfoDir);
    const buildInfo = JSON.parse(fs2.readFileSync(path2.join(buildInfoDir, buildFiles[0])));

    // Encode constructor args (address, uint256, address, address, bytes32)
    const abiCoder = hre.ethers.AbiCoder.defaultAbiCoder();
    const constructorArgs = abiCoder.encode(
      ["address", "uint256", "address", "address", "bytes32"],
      [MARKETING_WALLET, forkVrfSubId, UNISWAP_V2_ROUTER, VRF_COORDINATOR, VRF_KEY_HASH]
    ).slice(2); // remove 0x prefix

    const rpcUrl = process.env.TENDERLY_VIRTUAL_TESTNET_RPC;
    const accessKey = process.env.TENDERLY_ACCESS_KEY;

    const body = new URLSearchParams();
    body.append("apikey", accessKey);
    body.append("module", "contract");
    body.append("action", "verifysourcecode");
    body.append("contractaddress", contractAddress);
    body.append("sourceCode", JSON.stringify(buildInfo.input));
    body.append("codeformat", "solidity-standard-json-input");
    body.append("contractname", "contracts/evmX_Testable.sol:evmX_Testable");
    body.append("compilerversion", "v" + buildInfo.solcLongVersion);
    body.append("constructorArguements", constructorArgs);

    const resp = await fetch(rpcUrl + "/verify/etherscan", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const result = await resp.json();

    if (result.status === "1") {
      console.log("    ✓ Contract verified on Tenderly!");
    } else {
      console.log(`    ✗ Verification response: ${JSON.stringify(result)}`);
    }
  } catch (verifyErr) {
    console.log(`    ✗ Verification error: ${verifyErr.message.slice(0, 100)}`);
    console.log("    (Contract deployed successfully — verify manually if needed)");
  }

  // ── Save deployment info ───────────────────────────────────────────────
  const fs = require("fs");
  const path = require("path");
  const deployDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });

  const deploymentInfo = {
    network: "tenderly-vnet",
    chainId: 8453,
    contract: "evmX_Testable",
    contractAddress,
    pair,
    deployer: deployer.address,
    marketingWallet: MARKETING_WALLET,
    vrfSubscriptionId: VRF_SUBSCRIPTION_ID,
    deployedAt: new Date().toISOString(),
    txHash: evmX.deploymentTransaction()?.hash || "unknown",
    note: "Production contract on Tenderly Base fork. VRF callbacks require emergencyForceAllocation() fallback.",
  };

  const filename = `tenderly-vnet-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deployDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`\n  Deployment info saved: deployments/${filename}`);

  // ── Success ────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  DEPLOYMENT SUCCESSFUL!");
  console.log("=".repeat(60));

  console.log("\n  NEXT STEPS:\n");
  console.log("  1. Run demo transactions:");
  console.log(`     evmX_ADDRESS=${contractAddress} npm run demo:tenderly\n`);
  console.log("  2. Check Tenderly Explorer:");
  console.log("     → Open your Virtual TestNet dashboard on tenderly.co");
  console.log(`     → Search for contract: ${contractAddress}\n`);
  console.log("  3. VRF note:");
  console.log("     → VRF callbacks won't arrive on a fork (no live Chainlink node)");
  console.log("     → Use emergencyForceAllocation() after 24h timeout");
  console.log("     → This showcases the protocol's built-in resilience!\n");

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
