/**
 * ============================================================================
 *  evmX — Add Liquidity Script (Base Mainnet)
 * ============================================================================
 *
 *  Usage:
 *    evmX_ADDRESS=0x... LIQUIDITY_ETH=1.0 LIQUIDITY_TOKENS=50000000 \
 *      npx hardhat run scripts/add-liquidity.js --network base
 *
 *  Or from .env file:
 *    evmX_ADDRESS=0x...contractAddress...
 *    LIQUIDITY_ETH=1.0
 *    LIQUIDITY_TOKENS=50000000
 *
 *  IMPORTANT:
 *    - Deployer wallet must hold evmX tokens + ETH for liquidity
 *    - Owner (deployer) is excluded from fees, so no tax on transfer
 *    - The pair is excluded from limits, so no maxTx/maxWallet restriction
 * ============================================================================
 */

const hre = require("hardhat");

async function main() {
  console.log("=".repeat(55));
  console.log("  evmX — Add Liquidity (Base Mainnet)");
  console.log("=".repeat(55) + "\n");

  // ── Parameters ────────────────────────────────────────────────────────
  const evmX_ADDRESS = process.env.evmX_ADDRESS;
  const LIQUIDITY_ETH = process.env.LIQUIDITY_ETH || "1.0";
  const LIQUIDITY_TOKENS = process.env.LIQUIDITY_TOKENS || "50000000"; // 50% of supply

  if (!evmX_ADDRESS) {
    throw new Error("evmX_ADDRESS not set in environment!");
  }

  const ethAmount = hre.ethers.parseEther(LIQUIDITY_ETH);
  const tokenAmount = hre.ethers.parseEther(LIQUIDITY_TOKENS);

  const UNISWAP_V2_ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";

  console.log(`  evmX contract:  ${evmX_ADDRESS}`);
  console.log(`  ETH amount:     ${LIQUIDITY_ETH} ETH`);
  console.log(`  Token amount:   ${LIQUIDITY_TOKENS} evmX`);
  console.log(`  Router:         ${UNISWAP_V2_ROUTER}`);

  // ── Deployer ──────────────────────────────────────────────────────────
  const [deployer] = await hre.ethers.getSigners();
  console.log(`  Deployer:       ${deployer.address}`);

  const ethBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`  ETH balance:    ${hre.ethers.formatEther(ethBalance)} ETH`);

  if (ethBalance < ethAmount + hre.ethers.parseEther("0.005")) {
    throw new Error(`Not enough ETH! Need: ${LIQUIDITY_ETH} ETH + gas`);
  }

  // ── Load contracts ────────────────────────────────────────────────────
  const evmX = await hre.ethers.getContractAt("evmX", evmX_ADDRESS);
  const tokenBalance = await evmX.balanceOf(deployer.address);
  console.log(`  Token balance:  ${hre.ethers.formatEther(tokenBalance)} evmX`);

  if (tokenBalance < tokenAmount) {
    throw new Error(`Not enough evmX! Need: ${LIQUIDITY_TOKENS}, have: ${hre.ethers.formatEther(tokenBalance)}`);
  }

  // ── Router ABI (minimal) ─────────────────────────────────────────────
  const routerAbi = [
    "function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)",
    "function WETH() external pure returns (address)",
  ];
  const router = new hre.ethers.Contract(UNISWAP_V2_ROUTER, routerAbi, deployer);

  // ── Approve ───────────────────────────────────────────────────────────
  console.log("\n--- 1/2: Approve tokens for Router ---\n");
  const approveTx = await evmX.approve(UNISWAP_V2_ROUTER, tokenAmount);
  await approveTx.wait();
  console.log(`  Approved ${hre.ethers.formatEther(tokenAmount)} evmX`);

  // ── Add Liquidity ─────────────────────────────────────────────────────
  console.log("\n--- 2/2: Add Liquidity ---\n");

  const block = await hre.ethers.provider.getBlock("latest");
  const deadline = block.timestamp + 600; // 10 minutes

  const tx = await router.addLiquidityETH(
    evmX_ADDRESS,
    tokenAmount,
    (tokenAmount * 95n) / 100n, // 5% slippage on tokens
    (ethAmount * 95n) / 100n,   // 5% slippage on ETH
    deployer.address,           // LP tokens to deployer
    deadline,
    { value: ethAmount }
  );

  const receipt = await tx.wait();
  console.log(`  Liquidity added successfully!`);
  console.log(`  TX hash: ${receipt.hash}`);
  console.log(`  Gas used: ${receipt.gasUsed}`);

  // ── Pair info ─────────────────────────────────────────────────────────
  const pairAddress = await evmX.uniswapPair();
  console.log(`\n  Uniswap V2 Pair: ${pairAddress}`);
  console.log(`  DexScreener:     https://dexscreener.com/base/${pairAddress}`);
  console.log(`  BaseScan Pair:   https://basescan.org/address/${pairAddress}`);

  console.log("\n" + "=".repeat(55));
  console.log("  LIQUIDITY ADDED SUCCESSFULLY!");
  console.log("=".repeat(55) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n  ERROR:", error.message || error);
    process.exit(1);
  });
