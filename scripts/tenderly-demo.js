/**
 * ============================================================================
 *  evmX — Tenderly Virtual TestNet Demo Script
 * ============================================================================
 *
 *  Creates rich transaction history on the Tenderly Explorer by simulating
 *  real protocol activity: liquidity, buys, sells, autonomous cycles.
 *
 *  Usage:
 *    evmX_ADDRESS=0x... npx hardhat run scripts/tenderly-demo.js --network tenderlyVNet
 *
 *  Prerequisites:
 *    1. evmX deployed on Tenderly VNet (run deploy-tenderly.js first)
 *    2. evmX_ADDRESS set in .env or command line
 *    3. Deployer funded with ETH on Tenderly VNet
 * ============================================================================
 */

const hre = require("hardhat");

const ROUTER_ABI = [
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external",
  "function WETH() external pure returns (address)",
];

const UNISWAP_V2_ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const WETH = "0x4200000000000000000000000000000000000006";

function fmt(val) {
  return hre.ethers.formatEther(val);
}

async function getDeadline() {
  const block = await hre.ethers.provider.getBlock("latest");
  return block.timestamp + 600;
}

async function main() {
  console.log("=".repeat(60));
  console.log("  evmX — Tenderly Virtual TestNet Demo");
  console.log("=".repeat(60) + "\n");

  if (hre.network.name !== "tenderlyVNet") {
    throw new Error(`Expected network 'tenderlyVNet', got '${hre.network.name}'.`);
  }

  const evmX_ADDRESS = process.env.evmX_ADDRESS;
  if (!evmX_ADDRESS) {
    throw new Error("evmX_ADDRESS not set!\n  Usage: evmX_ADDRESS=0x... npm run demo:tenderly");
  }

  // ── Load deployer ────────────────────────────────────────────────────────
  const [deployer] = await hre.ethers.getSigners();
  const evmX = await hre.ethers.getContractAt("evmX_Testable", evmX_ADDRESS, deployer);
  const router = new hre.ethers.Contract(UNISWAP_V2_ROUTER, ROUTER_ABI, deployer);

  const pair = await evmX.uniswapPair();
  console.log(`  Contract:    ${evmX_ADDRESS}`);
  console.log(`  Pair:        ${pair}`);
  console.log(`  Deployer:    ${deployer.address}`);

  const deployerBal = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`  Deployer ETH: ${fmt(deployerBal)}\n`);

  // ── Create buyer wallets (Tenderly has only 1 signer) ────────────────────
  console.log("--- Phase 0: Create & fund buyer wallets ---\n");

  const buyers = [];
  for (let i = 0; i < 5; i++) {
    const wallet = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
    const tx = await deployer.sendTransaction({
      to: wallet.address,
      value: hre.ethers.parseEther("3"),
    });
    await tx.wait();
    buyers.push(wallet);
    console.log(`  Buyer ${i + 1}: ${wallet.address} → funded 3 ETH`);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Phase 1: Add Liquidity (if not already added)
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n--- Phase 1: Add Liquidity ---\n");

  const tokenBal = await evmX.balanceOf(deployer.address);
  console.log(`  Deployer token balance: ${fmt(tokenBal)} evmX`);

  if (tokenBal > hre.ethers.parseEther("40000000")) {
    const LIQUIDITY_ETH = hre.ethers.parseEther("5");
    const LIQUIDITY_TOKENS = hre.ethers.parseEther("50000000");

    const approveTx = await evmX.approve(UNISWAP_V2_ROUTER, LIQUIDITY_TOKENS);
    await approveTx.wait();
    console.log(`  Approved ${fmt(LIQUIDITY_TOKENS)} evmX for Router`);

    const deadline = await getDeadline();
    const liqTx = await router.addLiquidityETH(
      evmX_ADDRESS,
      LIQUIDITY_TOKENS,
      (LIQUIDITY_TOKENS * 95n) / 100n,
      (LIQUIDITY_ETH * 95n) / 100n,
      deployer.address,
      deadline,
      { value: LIQUIDITY_ETH }
    );
    const liqReceipt = await liqTx.wait();
    console.log(`  Liquidity added! Gas: ${liqReceipt.gasUsed}`);
    console.log(`  Pool: ${fmt(LIQUIDITY_ETH)} ETH + ${fmt(LIQUIDITY_TOKENS)} evmX`);
  } else {
    console.log("  Liquidity already added (deployer has < 40M tokens).");
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Phase 2: Simulate Buys (5 wallets, varied amounts)
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n--- Phase 2: Buy Transactions (eligibility demo) ---\n");

  const buyAmounts = ["0.1", "0.15", "0.2", "0.25", "0.3"];

  for (let i = 0; i < buyers.length; i++) {
    const buyRouter = router.connect(buyers[i]);
    const amount = hre.ethers.parseEther(buyAmounts[i]);
    const dl = await getDeadline();

    try {
      const tx = await buyRouter.swapExactETHForTokensSupportingFeeOnTransferTokens(
        0,
        [WETH, evmX_ADDRESS],
        buyers[i].address,
        dl,
        { value: amount }
      );
      const receipt = await tx.wait();
      const tokenBalance = await evmX.balanceOf(buyers[i].address);
      console.log(`  Buy ${i + 1}: ${buyAmounts[i]} ETH → ${fmt(tokenBalance)} evmX (gas: ${receipt.gasUsed})`);
    } catch (e) {
      console.log(`  Buy ${i + 1}: FAILED — ${e.message.slice(0, 100)}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Phase 3: Simulate Sells (tax collection demo)
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n--- Phase 3: Sell Transactions (tax collection demo) ---\n");

  for (let i = 0; i < 3; i++) {
    const seller = buyers[i];
    const sellerEvmX = evmX.connect(seller);
    const sellerRouter = router.connect(seller);
    const bal = await evmX.balanceOf(seller.address);

    if (bal === 0n) {
      console.log(`  Sell ${i + 1}: skipped (no tokens)`);
      continue;
    }

    const sellAmount = bal / 3n;
    const dl = await getDeadline();

    try {
      const appTx = await sellerEvmX.approve(UNISWAP_V2_ROUTER, sellAmount);
      await appTx.wait();

      const tx = await sellerRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
        sellAmount,
        0,
        [evmX_ADDRESS, WETH],
        seller.address,
        dl
      );
      const receipt = await tx.wait();
      console.log(`  Sell ${i + 1}: ${fmt(sellAmount)} evmX sold (gas: ${receipt.gasUsed})`);
    } catch (e) {
      console.log(`  Sell ${i + 1}: FAILED — ${e.message.slice(0, 100)}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Phase 4: Autonomous Cycle
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n--- Phase 4: Autonomous Cycle ---\n");

  try {
    const cycleTx = await evmX.runAutonomousCycle({ gasLimit: 2_000_000 });
    const cycleReceipt = await cycleTx.wait();
    console.log(`  runAutonomousCycle() executed! Gas: ${cycleReceipt.gasUsed}`);

    for (const log of cycleReceipt.logs) {
      try {
        const parsed = evmX.interface.parseLog(log);
        if (parsed) console.log(`    Event: ${parsed.name}`);
      } catch { /* skip */ }
    }
  } catch (e) {
    console.log(`  runAutonomousCycle(): ${e.message.slice(0, 100)}`);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Phase 5: Pool Status
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n--- Phase 5: Pool Status ---\n");

  try {
    const microBal = await evmX.microPoolBalance();
    const midBal = await evmX.midPoolBalance();
    const megaBal = await evmX.megaPoolBalance();
    const contractETH = await hre.ethers.provider.getBalance(evmX_ADDRESS);

    console.log(`  Micro Pool:  ${fmt(microBal)} ETH`);
    console.log(`  Mid Pool:    ${fmt(midBal)} ETH`);
    console.log(`  Mega Pool:   ${fmt(megaBal)} ETH`);
    console.log(`  Contract ETH: ${fmt(contractETH)} ETH`);
  } catch (e) {
    console.log(`  Pool read error: ${e.message.slice(0, 80)}`);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Phase 6: Re-enrollment
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n--- Phase 6: Re-enrollment ---\n");

  for (let i = 0; i < 3; i++) {
    try {
      const tx = await evmX.reEnroll(buyers[i].address);
      const receipt = await tx.wait();
      console.log(`  reEnroll(buyer ${i + 1}): success (gas: ${receipt.gasUsed})`);
    } catch (e) {
      const reason = e.message.includes("revert")
        ? e.message.match(/reverted with custom error '([^']+)'/)?.[1] || "reverted"
        : e.message.slice(0, 60);
      console.log(`  reEnroll(buyer ${i + 1}): ${reason}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Summary
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n" + "=".repeat(60));
  console.log("  DEMO COMPLETE!");
  console.log("=".repeat(60));
  console.log("\n  Transactions created on Tenderly Explorer:");
  console.log("    - 5 buyer wallet fundings");
  console.log("    - 1 liquidity addition (ETH + tokens)");
  console.log("    - 5 buy swaps (with 3% buy tax → pool funding)");
  console.log("    - 3 sell swaps (with 3% sell tax → Mega pot)");
  console.log("    - 1 runAutonomousCycle()");
  console.log("    - 3 reEnroll() calls");
  console.log("\n  Total: ~18 transactions showing full protocol lifecycle");
  console.log("\n  Check your Tenderly Explorer to see the full history!");
  console.log("  → https://dashboard.tenderly.co\n");
}

main()
  .then(() => {
    console.log("  Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n  Demo ERROR:", error.message || error);
    process.exit(1);
  });
