/**
 * ============================================================================
 *  evmX â€” Add Liquidity Script (Base Mainnet)
 * ============================================================================
 *
 *  HasznĂˇlat:
 *    evmX_ADDRESS=0x... LIQUIDITY_ETH=1.0 LIQUIDITY_TOKENS=50000000 \
 *      npx hardhat run scripts/add-liquidity.js --network base
 *
 *  Vagy .env fĂˇjlbĂłl:
 *    evmX_ADDRESS=0x...contractAddress...
 *    LIQUIDITY_ETH=1.0
 *    LIQUIDITY_TOKENS=50000000
 *
 *  FONTOS:
 *    - A deployer wallet-ben kell evmX token + ETH a liquidity-hez
 *    - Az owner (deployer) excluded from fees, tehĂˇt nincs tax a transfer-en
 *    - A pair is excluded from limits, tehĂˇt nincs maxTx/maxWallet limit
 * ============================================================================
 */

const hre = require("hardhat");

async function main() {
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  console.log("  evmX â€” Add Liquidity (Base Mainnet)");
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n");

  // â”€â”€ ParamĂ©terek â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const evmX_ADDRESS = process.env.evmX_ADDRESS;
  const LIQUIDITY_ETH = process.env.LIQUIDITY_ETH || "1.0";
  const LIQUIDITY_TOKENS = process.env.LIQUIDITY_TOKENS || "50000000"; // 50% of supply

  if (!evmX_ADDRESS) {
    throw new Error("âťŚ evmX_ADDRESS nincs beĂˇllĂ­tva!");
  }

  const ethAmount = hre.ethers.parseEther(LIQUIDITY_ETH);
  const tokenAmount = hre.ethers.parseEther(LIQUIDITY_TOKENS);

  const UNISWAP_V2_ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";

  console.log(`  evmX contract:  ${evmX_ADDRESS}`);
  console.log(`  ETH amount:     ${LIQUIDITY_ETH} ETH`);
  console.log(`  Token amount:   ${LIQUIDITY_TOKENS} evmX`);
  console.log(`  Router:         ${UNISWAP_V2_ROUTER}`);

  // â”€â”€ Deployer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [deployer] = await hre.ethers.getSigners();
  console.log(`  Deployer:       ${deployer.address}`);

  const ethBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`  ETH balance:    ${hre.ethers.formatEther(ethBalance)} ETH`);

  if (ethBalance < ethAmount + hre.ethers.parseEther("0.005")) {
    throw new Error(`âťŚ Nincs elĂ©g ETH! Kell: ${LIQUIDITY_ETH} ETH + gas`);
  }

  // â”€â”€ Contract-ok betĂ¶ltĂ©se â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const evmX = await hre.ethers.getContractAt("evmX", evmX_ADDRESS);
  const tokenBalance = await evmX.balanceOf(deployer.address);
  console.log(`  Token balance:  ${hre.ethers.formatEther(tokenBalance)} evmX`);

  if (tokenBalance < tokenAmount) {
    throw new Error(`âťŚ Nincs elĂ©g evmX! Kell: ${LIQUIDITY_TOKENS}, van: ${hre.ethers.formatEther(tokenBalance)}`);
  }

  // â”€â”€ Router ABI (csak ami kell) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const routerAbi = [
    "function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)",
    "function WETH() external pure returns (address)",
  ];
  const router = new hre.ethers.Contract(UNISWAP_V2_ROUTER, routerAbi, deployer);

  // â”€â”€ Approve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ”€â”€â”€ 1/2: Approve token a Router-nek â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n");
  const approveTx = await evmX.approve(UNISWAP_V2_ROUTER, tokenAmount);
  await approveTx.wait();
  console.log(`  âś… Approved ${hre.ethers.formatEther(tokenAmount)} evmX`);

  // â”€â”€ Add Liquidity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log("\nâ”€â”€â”€ 2/2: Add Liquidity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n");

  const block = await hre.ethers.provider.getBlock("latest");
  const deadline = block.timestamp + 600; // 10 perc

  const tx = await router.addLiquidityETH(
    evmX_ADDRESS,
    tokenAmount,
    (tokenAmount * 95n) / 100n, // 5% slippage token-re
    (ethAmount * 95n) / 100n,   // 5% slippage ETH-re
    deployer.address,           // LP token-ek a deployer-nek
    deadline,
    { value: ethAmount }
  );

  const receipt = await tx.wait();
  console.log(`  âś… Liquidity hozzĂˇadva!`);
  console.log(`  TX hash: ${receipt.hash}`);
  console.log(`  Gas used: ${receipt.gasUsed}`);

  // â”€â”€ Pair info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const pairAddress = await evmX.uniswapPair();
  console.log(`\n  Uniswap V2 Pair: ${pairAddress}`);
  console.log(`  DexScreener:     https://dexscreener.com/base/${pairAddress}`);
  console.log(`  BaseScan Pair:   https://basescan.org/address/${pairAddress}`);

  console.log("\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
  console.log("  LIQUIDITY HOZZĂADVA! đźŽ‰");
  console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n  âťŚ HIBA:", error.message || error);
    process.exit(1);
  });

