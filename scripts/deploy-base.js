/**
 * ============================================================================
 *  evmX â€” Base Mainnet Deploy Script
 * ============================================================================
 *
 *  HasznĂˇlat:
 *    npx hardhat run scripts/deploy-base.js --network base
 *
 *  ElĹ‘feltĂ©telek:
 *    1. .env fĂˇjlban: DEPLOYER_PRIVATE_KEY, BASE_RPC_URL, BASESCAN_API_KEY
 *    2. VRF subscription mĂˇr lĂ©teznie kell a https://vrf.chain.link/ -en
 *    3. .env fĂˇjlban: MARKETING_WALLET, VRF_SUBSCRIPTION_ID
 *    4. Deployer wallet-ben legyen ~0.01 ETH gas-ra (Base)
 *
 *  Deploy utĂˇn:
 *    1. Add hozzĂˇ a contract-ot mint VRF consumer a subscription-hĂ¶z
 *    2. Verify: npx hardhat verify --network base <CONTRACT_ADDRESS> <MARKETING_WALLET> <VRF_SUB_ID>
 *    3. Add liquidity az Uniswap V2-n
 *    4. (OpcionĂˇlis) Renounce ownership
 * ============================================================================
 */

const hre = require("hardhat");

async function main() {
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  console.log("  evmX â€” Base Mainnet Deployment");
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n");

  // â”€â”€ ParamĂ©terek betĂ¶ltĂ©se â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const MARKETING_WALLET = process.env.MARKETING_WALLET;
  const VRF_SUBSCRIPTION_ID = process.env.VRF_SUBSCRIPTION_ID;

  if (!MARKETING_WALLET) {
    throw new Error("âťŚ MARKETING_WALLET nincs beĂˇllĂ­tva! Add hozzĂˇ a .env fĂˇjlhoz.");
  }
  if (!VRF_SUBSCRIPTION_ID) {
    throw new Error("âťŚ VRF_SUBSCRIPTION_ID nincs beĂˇllĂ­tva! Add hozzĂˇ a .env fĂˇjlhoz.");
  }

  const vrfSubId = BigInt(VRF_SUBSCRIPTION_ID);

  console.log(`  Marketing wallet:     ${MARKETING_WALLET}`);
  console.log(`  VRF Subscription ID:  ${vrfSubId}`);
  console.log(`  Network:              ${hre.network.name}`);

  // â”€â”€ Deployer ellenĹ‘rzĂ©s â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`  Deployer:             ${deployer.address}`);
  console.log(`  Deployer balance:     ${hre.ethers.formatEther(balance)} ETH`);

  if (balance < hre.ethers.parseEther("0.003")) {
    throw new Error("âťŚ Deployer-nek legalĂˇbb 0.003 ETH kell gas-ra!");
  }

  console.log("\nâ”€â”€â”€ Deploy indĂ­tĂˇsa... â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n");

  // â”€â”€ Deploy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const evmXFactory = await hre.ethers.getContractFactory("evmX");

  console.log("  Compiling & deploying evmX...");
  const evmX = await evmXFactory.deploy(MARKETING_WALLET, vrfSubId);
  await evmX.waitForDeployment();

  const contractAddress = await evmX.getAddress();
  console.log(`\n  âś… evmX deployed: ${contractAddress}`);

  // â”€â”€ Ăllapot ellenĹ‘rzĂ©s â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const totalSupply = await evmX.totalSupply();
  const ownerBalance = await evmX.balanceOf(deployer.address);
  const pair = await evmX.uniswapPair();
  const maxTx = await evmX.maxTxAmount();
  const maxWallet = await evmX.maxWalletAmount();
  const vrfSubIdContract = await evmX.vrfSubscriptionId();

  console.log("\nâ”€â”€â”€ Post-deploy ellenĹ‘rzĂ©s â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n");
  console.log(`  Total Supply:         ${hre.ethers.formatEther(totalSupply)} evmX`);
  console.log(`  Owner balance:        ${hre.ethers.formatEther(ownerBalance)} evmX`);
  console.log(`  Uniswap V2 Pair:      ${pair}`);
  console.log(`  Max TX (1.5%):        ${hre.ethers.formatEther(maxTx)} evmX`);
  console.log(`  Max Wallet (4%):      ${hre.ethers.formatEther(maxWallet)} evmX`);
  console.log(`  VRF Subscription ID:  ${vrfSubIdContract}`);

  // â”€â”€ VerifikĂˇciĂł parancs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  console.log("  DEPLOY SIKERES!");
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n");

  console.log("  KĂ–VETKEZĹ LĂ‰PĂ‰SEK:\n");
  console.log(`  1. VRF Consumer hozzĂˇadĂˇsa:`);
  console.log(`     â†’ Menj: https://vrf.chain.link/base/${VRF_SUBSCRIPTION_ID}`);
  console.log(`     â†’ "Add Consumer" â†’ ${contractAddress}\n`);

  console.log(`  2. Contract verify (BaseScan):`);
  console.log(`     npx hardhat verify --network base ${contractAddress} "${MARKETING_WALLET}" "${VRF_SUBSCRIPTION_ID}"\n`);

  console.log(`  3. Liquidity hozzĂˇadĂˇsa:`);
  console.log(`     â†’ Approve evmX token a Router-nek`);
  console.log(`     â†’ HĂ­vd a router.addLiquidityETH()-et`);
  console.log(`     â†’ Vagy hasznĂˇld az alĂˇbbi add-liquidity scriptet\n`);

  console.log(`  4. (OpcionĂˇlis) Ownership renounce:`);
  console.log(`     â†’ Csak HA minden mĹ±kĂ¶dik!`);
  console.log(`     â†’ evmX.renounceOwnership()\n`);

  // â”€â”€ Deployment info mentĂ©se â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  console.log(`  đź“„ Deployment info mentve: deployments/${filename}`);

  return deploymentInfo;
}

main()
  .then((info) => {
    console.log("\n  Done! âś…");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n  âťŚ Deploy HIBA:", error.message || error);
    process.exit(1);
  });

