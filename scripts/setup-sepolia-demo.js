/**
 * ============================================================================
 *  evmX — Sepolia Demo Setup (Liquidity + Test Trades)
 * ============================================================================
 *
 *  This script sets up a full working demo on Base Sepolia:
 *    1. Adds liquidity (0.04 ETH + 5M tokens) to Uniswap V2
 *    2. Creates a temp trader wallet
 *    3. Sends ETH to temp wallet
 *    4. Executes test buys (fills Micro + Mid pools via 3% buy tax)
 *    5. Executes test sells (fills Mega pool via 3% sell tax)
 *
 *  Usage:
 *    npx hardhat run scripts/setup-sepolia-demo.js --network baseSepolia
 *
 *  Requirements:
 *    - .env: DEPLOYER_PRIVATE_KEY (owner wallet)
 *    - Owner must have ETH + evmX tokens
 * ============================================================================
 */

const hre = require("hardhat");

// ── Configuration ───────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = "0x4AfdC83DC87193f7915429c0eBb99d11A77408d1";
const ROUTER_ADDRESS = "0x1689E7B1F10000AE47eBfE339a4f69dECd19F602";

const LIQUIDITY_ETH = "0.04";          // ETH for liquidity pool
const LIQUIDITY_TOKENS = "5000000";     // 5M tokens (5% of supply)
const TRADER_ETH = "0.03";             // ETH for test trader
const BUY_AMOUNT = "0.008";            // ETH per test buy
const NUM_BUYS = 3;                     // Number of test buys
const SELL_PERCENT = 30;                // Sell 30% of bought tokens

async function main() {
  console.log("=".repeat(60));
  console.log("  evmX — Sepolia Demo Setup");
  console.log("=".repeat(60) + "\n");

  const [deployer] = await hre.ethers.getSigners();
  const provider = deployer.provider;

  // ── Check deployer balance ──────────────────────────────────────────────
  const ethBalance = await provider.getBalance(deployer.address);
  console.log(`  Deployer:     ${deployer.address}`);
  console.log(`  ETH balance:  ${hre.ethers.formatEther(ethBalance)} ETH`);

  const totalNeeded = hre.ethers.parseEther(LIQUIDITY_ETH) +
                      hre.ethers.parseEther(TRADER_ETH) +
                      hre.ethers.parseEther("0.02"); // gas reserve
  if (ethBalance < totalNeeded) {
    throw new Error(`Need at least ${hre.ethers.formatEther(totalNeeded)} ETH, have ${hre.ethers.formatEther(ethBalance)}`);
  }

  // ── Load contract ───────────────────────────────────────────────────────
  const evmX = await hre.ethers.getContractAt("evmX_Testable", CONTRACT_ADDRESS);
  const tokenBalance = await evmX.balanceOf(deployer.address);
  console.log(`  Token balance: ${hre.ethers.formatEther(tokenBalance)} evmX\n`);

  // ── Router ABI ──────────────────────────────────────────────────────────
  const routerAbi = [
    "function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)",
    "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable",
    "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external",
    "function WETH() external pure returns (address)",
    "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)"
  ];
  const router = new hre.ethers.Contract(ROUTER_ADDRESS, routerAbi, deployer);
  const WETH = await router.WETH();

  // ═══════════════════════════════════════════════════════════════════════
  //  STEP 1: Add Liquidity
  // ═══════════════════════════════════════════════════════════════════════
  console.log("--- STEP 1/5: Add Liquidity ---\n");

  const liqEth = hre.ethers.parseEther(LIQUIDITY_ETH);
  const liqTokens = hre.ethers.parseEther(LIQUIDITY_TOKENS);
  const block = await provider.getBlock("latest");
  const deadline = block.timestamp + 600;

  // Approve router
  console.log(`  Approving ${LIQUIDITY_TOKENS} evmX for router...`);
  const approveTx = await evmX.approve(ROUTER_ADDRESS, liqTokens);
  await approveTx.wait();
  console.log("  Approved!\n");

  // Add liquidity
  console.log(`  Adding liquidity: ${LIQUIDITY_ETH} ETH + ${LIQUIDITY_TOKENS} evmX...`);
  const addLiqTx = await router.addLiquidityETH(
    CONTRACT_ADDRESS,
    liqTokens,
    (liqTokens * 90n) / 100n,  // 10% slippage on tokens
    (liqEth * 90n) / 100n,     // 10% slippage on ETH
    deployer.address,
    deadline,
    { value: liqEth }
  );
  const liqReceipt = await addLiqTx.wait();
  console.log(`  Liquidity added! Gas: ${liqReceipt.gasUsed}\n`);

  // ═══════════════════════════════════════════════════════════════════════
  //  STEP 2: Create Temp Trader
  // ═══════════════════════════════════════════════════════════════════════
  console.log("--- STEP 2/5: Create Temp Trader ---\n");

  const traderWallet = hre.ethers.Wallet.createRandom().connect(provider);
  console.log(`  Trader address: ${traderWallet.address}`);

  // Send ETH to trader
  console.log(`  Sending ${TRADER_ETH} ETH to trader...`);
  const sendTx = await deployer.sendTransaction({
    to: traderWallet.address,
    value: hre.ethers.parseEther(TRADER_ETH)
  });
  await sendTx.wait();
  const traderEth = await provider.getBalance(traderWallet.address);
  console.log(`  Trader ETH: ${hre.ethers.formatEther(traderEth)}\n`);

  // ═══════════════════════════════════════════════════════════════════════
  //  STEP 3: Test Buys (generates buy tax → Micro + Mid pools)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("--- STEP 3/5: Test Buys (fills Micro + Mid pools) ---\n");

  const traderRouter = new hre.ethers.Contract(ROUTER_ADDRESS, routerAbi, traderWallet);
  const buyAmount = hre.ethers.parseEther(BUY_AMOUNT);

  for (let i = 0; i < NUM_BUYS; i++) {
    const block2 = await provider.getBlock("latest");
    const dl = block2.timestamp + 300;
    console.log(`  Buy ${i + 1}/${NUM_BUYS}: ${BUY_AMOUNT} ETH → evmX...`);
    try {
      const buyTx = await traderRouter.swapExactETHForTokensSupportingFeeOnTransferTokens(
        0,  // accept any amount (testnet)
        [WETH, CONTRACT_ADDRESS],
        traderWallet.address,
        dl,
        { value: buyAmount }
      );
      const buyReceipt = await buyTx.wait();
      const traderTokens = await evmX.balanceOf(traderWallet.address);
      console.log(`  Got ${hre.ethers.formatEther(traderTokens)} evmX (gas: ${buyReceipt.gasUsed})\n`);
    } catch (e) {
      console.log(`  Buy failed: ${e.message.substring(0, 150)}\n`);
    }

    // Small delay between trades
    await new Promise(r => setTimeout(r, 2000));
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  STEP 4: Test Sell (generates sell tax → Mega pool)
  // ═══════════════════════════════════════════════════════════════════════
  console.log("--- STEP 4/5: Test Sell (fills Mega pool) ---\n");

  const traderTokenBalance = await evmX.balanceOf(traderWallet.address);
  const sellAmount = (traderTokenBalance * BigInt(SELL_PERCENT)) / 100n;

  if (sellAmount > 0n) {
    // Approve router for sell
    const traderEvmX = new hre.ethers.Contract(CONTRACT_ADDRESS, [
      "function approve(address,uint256) returns (bool)",
      "function balanceOf(address) view returns (uint256)"
    ], traderWallet);

    console.log(`  Approving ${hre.ethers.formatEther(sellAmount)} evmX for sell...`);
    const sellApproveTx = await traderEvmX.approve(ROUTER_ADDRESS, sellAmount);
    await sellApproveTx.wait();

    const block3 = await provider.getBlock("latest");
    console.log(`  Selling ${hre.ethers.formatEther(sellAmount)} evmX → ETH...`);
    try {
      const sellTx = await traderRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
        sellAmount,
        0,  // accept any amount (testnet)
        [CONTRACT_ADDRESS, WETH],
        traderWallet.address,
        block3.timestamp + 300
      );
      const sellReceipt = await sellTx.wait();
      console.log(`  Sold! Gas: ${sellReceipt.gasUsed}\n`);
    } catch (e) {
      console.log(`  Sell failed: ${e.message.substring(0, 150)}\n`);
    }
  } else {
    console.log("  No tokens to sell, skipping.\n");
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  STEP 5: Verify Pool States
  // ═══════════════════════════════════════════════════════════════════════
  console.log("--- STEP 5/5: Pool Status ---\n");

  const poolAbi = ["function getPoolInfo(uint8) view returns (uint256,uint256,uint256,uint256,uint256,uint256)"];
  const evmXRead = new hre.ethers.Contract(CONTRACT_ADDRESS, poolAbi, provider);
  const poolNames = ["MICRO", "MID", "MEGA"];

  for (let i = 0; i < 3; i++) {
    try {
      const info = await evmXRead.getPoolInfo(i);
      console.log(`  ${poolNames[i]} Pool:`);
      console.log(`    Balance:      ${hre.ethers.formatEther(info[0])} ETH`);
      console.log(`    Entry Req:    ${hre.ethers.formatEther(info[1])} ETH`);
      console.log(`    Threshold:    ${hre.ethers.formatEther(info[2])} ETH`);
      console.log(`    Time left:    ${info[3].toString()} sec`);
      console.log(`    Cycle:        ${info[4].toString()}`);
      console.log(`    Participants: ${info[5].toString()}\n`);
    } catch (e) {
      console.log(`  ${poolNames[i]} Pool: Error - ${e.message.substring(0, 100)}\n`);
    }
  }

  // Contract ETH balance
  const contractEth = await provider.getBalance(CONTRACT_ADDRESS);
  console.log(`  Contract ETH: ${hre.ethers.formatEther(contractEth)}`);

  // Remaining deployer balance
  const finalEth = await provider.getBalance(deployer.address);
  console.log(`  Deployer ETH remaining: ${hre.ethers.formatEther(finalEth)}`);

  // Trader final state
  const traderFinalEth = await provider.getBalance(traderWallet.address);
  const traderFinalTokens = await evmX.balanceOf(traderWallet.address);
  console.log(`  Trader ETH: ${hre.ethers.formatEther(traderFinalEth)}`);
  console.log(`  Trader evmX: ${hre.ethers.formatEther(traderFinalTokens)}`);

  console.log("\n" + "=".repeat(60));
  console.log("  SEPOLIA DEMO SETUP COMPLETE!");
  console.log("=".repeat(60));
  console.log("\n  The pools now have real ETH from trade taxes.");
  console.log("  Open index.html to see the live frontend!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n  ERROR:", error.message || error);
    process.exit(1);
  });
