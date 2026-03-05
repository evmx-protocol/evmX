/**
 * ============================================================================
 *  evmX — Tenderly Virtual TestNet Full Lifecycle Demo
 * ============================================================================
 *
 *  Creates comprehensive transaction history on the Tenderly Public Explorer
 *  by simulating complete protocol lifecycle:
 *
 *    Liquidity → Buys → Sells → Pool accumulation → Autonomous Cycles →
 *    VRF Request → Emergency Fallback → ETH PAYOUT TO WINNER → Cycle Reset
 *
 *  Uses Tenderly's evm_increaseTime/evm_mine to advance time for:
 *    - 2h Micro pool timer expiry
 *    - 24h VRF timeout (emergency fallback)
 *    - 6h Mid pool timer expiry
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val) {
  return hre.ethers.formatEther(val);
}

async function getDeadline() {
  const block = await hre.ethers.provider.getBlock("latest");
  return block.timestamp + 600;
}

async function advanceTime(seconds) {
  await hre.ethers.provider.send("evm_increaseTime", [seconds]);
  await hre.ethers.provider.send("evm_mine", []);
}

async function mineBlocks(count) {
  for (let i = 0; i < count; i++) {
    await hre.ethers.provider.send("evm_mine", []);
  }
}

async function printPoolStatus(evmX, evmX_ADDRESS, label) {
  console.log(`\n  ┌─── Pool Status ${label ? `(${label})` : ""} ───`);
  try {
    const microBal = await evmX.microPoolBalance();
    const midBal = await evmX.midPoolBalance();
    const megaBal = await evmX.megaPoolBalance();
    const contractETH = await hre.ethers.provider.getBalance(evmX_ADDRESS);
    console.log(`  │  Micro Pool:   ${fmt(microBal)} ETH`);
    console.log(`  │  Mid Pool:     ${fmt(midBal)} ETH`);
    console.log(`  │  Mega Pool:    ${fmt(megaBal)} ETH`);
    console.log(`  │  Contract ETH: ${fmt(contractETH)} ETH`);
    console.log(`  └────────────────────────────`);
    return { microBal, midBal, megaBal, contractETH };
  } catch (e) {
    console.log(`  │  Read error: ${e.message.slice(0, 80)}`);
    console.log(`  └────────────────────────────`);
    return null;
  }
}

function logEvents(receipt, evmX) {
  for (const log of receipt.logs) {
    try {
      const parsed = evmX.interface.parseLog(log);
      if (parsed) {
        const args = parsed.args
          ? Object.entries(parsed.args)
              .filter(([k]) => isNaN(k))
              .map(([k, v]) => {
                if (typeof v === "bigint") return `${k}=${fmt(v)}`;
                return `${k}=${v}`;
              })
              .join(", ")
          : "";
        console.log(`    📡 Event: ${parsed.name}(${args})`);
      }
    } catch {
      /* skip non-evmX logs */
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN DEMO
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("═".repeat(64));
  console.log("  evmX — Tenderly Virtual TestNet FULL LIFECYCLE Demo");
  console.log("═".repeat(64) + "\n");

  if (hre.network.name !== "tenderlyVNet") {
    throw new Error(`Expected network 'tenderlyVNet', got '${hre.network.name}'.`);
  }

  const evmX_ADDRESS = process.env.evmX_ADDRESS;
  if (!evmX_ADDRESS) {
    throw new Error("evmX_ADDRESS not set!\n  Usage: evmX_ADDRESS=0x... npm run demo:tenderly");
  }

  const [deployer] = await hre.ethers.getSigners();
  const evmX = await hre.ethers.getContractAt("evmX_Testable", evmX_ADDRESS, deployer);
  const router = new hre.ethers.Contract(UNISWAP_V2_ROUTER, ROUTER_ABI, deployer);

  const pair = await evmX.uniswapPair();
  console.log(`  Contract:     ${evmX_ADDRESS}`);
  console.log(`  Pair:         ${pair}`);
  console.log(`  Deployer:     ${deployer.address}`);

  const deployerBal = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`  Deployer ETH: ${fmt(deployerBal)}\n`);

  let txCount = 0;

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 0: Create & fund buyer wallets
  // ════════════════════════════════════════════════════════════════════════════
  console.log("━".repeat(64));
  console.log("  PHASE 0: Create & Fund Buyer Wallets");
  console.log("━".repeat(64) + "\n");

  const buyers = [];
  for (let i = 0; i < 10; i++) {
    const wallet = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
    const tx = await deployer.sendTransaction({
      to: wallet.address,
      value: hre.ethers.parseEther("5"),
    });
    await tx.wait();
    buyers.push(wallet);
    txCount++;
    console.log(`  Buyer ${String(i + 1).padStart(2)}: ${wallet.address} → funded 5 ETH`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 1: Add Liquidity
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 1: Add Liquidity (Uniswap V2)");
  console.log("━".repeat(64) + "\n");

  const tokenBal = await evmX.balanceOf(deployer.address);
  console.log(`  Deployer token balance: ${fmt(tokenBal)} evmX`);

  if (tokenBal > hre.ethers.parseEther("40000000")) {
    const LIQUIDITY_ETH = hre.ethers.parseEther("5");
    const LIQUIDITY_TOKENS = hre.ethers.parseEther("50000000");

    const approveTx = await evmX.approve(UNISWAP_V2_ROUTER, LIQUIDITY_TOKENS);
    await approveTx.wait();
    txCount++;
    console.log(`  ✅ Approved ${fmt(LIQUIDITY_TOKENS)} evmX for Router`);

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
    txCount++;
    console.log(`  ✅ Liquidity added! Gas: ${liqReceipt.gasUsed}`);
    console.log(`  Pool: ${fmt(LIQUIDITY_ETH)} ETH + ${fmt(LIQUIDITY_TOKENS)} evmX`);
  } else {
    console.log("  ⏭️  Liquidity already added (deployer has < 40M tokens).");
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 2: Heavy Buying Round — 10 buys to fill pools
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 2: Heavy Buying Round (3% buy tax → pool accumulation)");
  console.log("━".repeat(64) + "\n");

  const buyAmounts = ["0.5", "0.6", "0.7", "0.4", "0.8", "0.3", "0.5", "0.6", "0.45", "0.55"];

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
      txCount++;
      console.log(`  Buy ${String(i + 1).padStart(2)}: ${buyAmounts[i]} ETH → ${fmt(tokenBalance)} evmX (gas: ${receipt.gasUsed})`);
      logEvents(receipt, evmX);
    } catch (e) {
      console.log(`  Buy ${String(i + 1).padStart(2)}: FAILED — ${e.message.slice(0, 120)}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 3: Sell Round — Mega pool accumulation
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 3: Sell Round (3% sell tax → Mega pool accumulation)");
  console.log("━".repeat(64) + "\n");

  for (let i = 0; i < 5; i++) {
    const seller = buyers[i];
    const sellerEvmX = evmX.connect(seller);
    const sellerRouter = router.connect(seller);
    const bal = await evmX.balanceOf(seller.address);

    if (bal === 0n) {
      console.log(`  Sell ${i + 1}: skipped (no tokens)`);
      continue;
    }

    const sellAmount = bal / 4n; // sell 25% — keep majority for eligibility
    const dl = await getDeadline();

    try {
      const appTx = await sellerEvmX.approve(UNISWAP_V2_ROUTER, sellAmount);
      await appTx.wait();
      txCount++;

      const tx = await sellerRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
        sellAmount,
        0,
        [evmX_ADDRESS, WETH],
        seller.address,
        dl
      );
      const receipt = await tx.wait();
      txCount++;
      console.log(`  Sell ${i + 1}: ${fmt(sellAmount)} evmX sold (gas: ${receipt.gasUsed})`);
      logEvents(receipt, evmX);
    } catch (e) {
      console.log(`  Sell ${i + 1}: FAILED — ${e.message.slice(0, 120)}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 4: Autonomous Cycle — swap tokens→ETH, distribute to pools
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 4: Autonomous Cycle #1 (swap + pool distribution)");
  console.log("━".repeat(64) + "\n");

  try {
    const cycleTx = await evmX.runAutonomousCycle({ gasLimit: 3_000_000 });
    const cycleReceipt = await cycleTx.wait();
    txCount++;
    console.log(`  ✅ runAutonomousCycle() executed! Gas: ${cycleReceipt.gasUsed}`);
    logEvents(cycleReceipt, evmX);
  } catch (e) {
    console.log(`  runAutonomousCycle(): ${e.message.slice(0, 120)}`);
  }

  await printPoolStatus(evmX, evmX_ADDRESS, "after Phase 4");

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 5: More buys to push pools over threshold
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 5: Second Buying Round (push pools over threshold)");
  console.log("━".repeat(64) + "\n");

  const buyAmounts2 = ["0.8", "0.9", "1.0", "0.7", "0.85"];
  for (let i = 0; i < 5; i++) {
    const buyer = buyers[i + 5]; // use buyers 6-10
    const buyRouter = router.connect(buyer);
    const amount = hre.ethers.parseEther(buyAmounts2[i]);
    const dl = await getDeadline();

    try {
      const tx = await buyRouter.swapExactETHForTokensSupportingFeeOnTransferTokens(
        0,
        [WETH, evmX_ADDRESS],
        buyer.address,
        dl,
        { value: amount }
      );
      const receipt = await tx.wait();
      txCount++;
      const tokenBalance = await evmX.balanceOf(buyer.address);
      console.log(`  Buy ${i + 1}: ${buyAmounts2[i]} ETH → ${fmt(tokenBalance)} evmX (gas: ${receipt.gasUsed})`);
    } catch (e) {
      console.log(`  Buy ${i + 1}: FAILED — ${e.message.slice(0, 120)}`);
    }
  }

  // Run another autonomous cycle to distribute newly accumulated tokens
  try {
    const cycleTx = await evmX.runAutonomousCycle({ gasLimit: 3_000_000 });
    const cycleReceipt = await cycleTx.wait();
    txCount++;
    console.log(`\n  ✅ runAutonomousCycle() #2: Gas ${cycleReceipt.gasUsed}`);
    logEvents(cycleReceipt, evmX);
  } catch (e) {
    console.log(`\n  runAutonomousCycle() #2: ${e.message.slice(0, 120)}`);
  }

  await printPoolStatus(evmX, evmX_ADDRESS, "after Phase 5");

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 6: ⏰ Advance time 2.5 hours → Micro pool timer expires
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 6: ⏰ Advance Time +2.5 hours (Micro timer expiry)");
  console.log("━".repeat(64) + "\n");

  await advanceTime(2.5 * 60 * 60); // 2.5 hours
  console.log("  ✅ Time advanced by 2.5 hours");
  console.log("  → Micro pool 2h timer should be expired");

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 7: Autonomous Cycle → triggers Micro allocation → VRF request
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 7: Autonomous Cycle → Trigger Micro Pool Allocation");
  console.log("━".repeat(64) + "\n");

  try {
    const cycleTx = await evmX.runAutonomousCycle({ gasLimit: 3_000_000 });
    const cycleReceipt = await cycleTx.wait();
    txCount++;
    console.log(`  ✅ runAutonomousCycle() #3: Gas ${cycleReceipt.gasUsed}`);
    logEvents(cycleReceipt, evmX);

    // Check for VRF request
    const microPending = await evmX.microPoolPendingRequestId();
    if (microPending > 0n) {
      console.log(`  🎲 VRF Request ID (Micro): ${microPending}`);
      console.log("  → Waiting for Chainlink VRF callback...");
      console.log("  → On a fork, VRF won't respond — emergency fallback will handle it!");
    }
  } catch (e) {
    console.log(`  Cycle: ${e.message.slice(0, 120)}`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 8: ⏰ Advance time 25 hours → VRF timeout (24h emergency threshold)
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 8: ⏰ Advance Time +25 hours (VRF timeout → emergency)");
  console.log("━".repeat(64) + "\n");

  await advanceTime(25 * 60 * 60); // 25 hours
  console.log("  ✅ Time advanced by 25 hours");
  console.log("  → VRF 24h timeout exceeded — emergency fallback now available!");

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 9: Emergency Force Allocation — COMMIT phase
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 9: Emergency Force Allocation — COMMIT (Micro Pool)");
  console.log("━".repeat(64) + "\n");

  console.log("  The protocol's built-in emergency fallback ensures rewards");
  console.log("  are always distributed, even when VRF is unavailable on a fork.\n");

  try {
    const forceTx = await evmX.emergencyForceAllocation(0, { gasLimit: 2_000_000 }); // 0 = Micro
    const forceReceipt = await forceTx.wait();
    txCount++;
    console.log(`  ✅ emergencyForceAllocation(Micro) — COMMIT phase`);
    console.log(`     Gas: ${forceReceipt.gasUsed}`);
    console.log(`     → Emergency seed committed, waiting 5 blocks for reveal...`);
    logEvents(forceReceipt, evmX);
  } catch (e) {
    console.log(`  ❌ Emergency commit failed: ${e.message.slice(0, 150)}`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 10: Mine 7 blocks (need 5+ for commit-reveal delay)
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 10: Mine 7 Blocks (commit-reveal delay)");
  console.log("━".repeat(64) + "\n");

  await mineBlocks(7);
  console.log("  ✅ 7 blocks mined — commit-reveal delay satisfied");

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 11: Emergency Force Allocation — REVEAL → ETH PAYOUT! 💰
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 11: 💰 Emergency Force Allocation — REVEAL (Micro Pool)");
  console.log("━".repeat(64) + "\n");

  // Record all buyer ETH balances BEFORE
  const ethBefore = {};
  for (let i = 0; i < buyers.length; i++) {
    ethBefore[buyers[i].address] = await hre.ethers.provider.getBalance(buyers[i].address);
  }

  try {
    const revealTx = await evmX.emergencyForceAllocation(0, { gasLimit: 2_000_000 }); // 0 = Micro
    const revealReceipt = await revealTx.wait();
    txCount++;
    console.log(`  ✅ emergencyForceAllocation(Micro) — REVEAL phase`);
    console.log(`     Gas: ${revealReceipt.gasUsed}`);
    logEvents(revealReceipt, evmX);

    // Check who won by comparing ETH balances
    console.log("\n  📊 Winner Detection (ETH balance changes):");
    for (let i = 0; i < buyers.length; i++) {
      const ethAfter = await hre.ethers.provider.getBalance(buyers[i].address);
      const diff = ethAfter - ethBefore[buyers[i].address];
      if (diff > 0n) {
        console.log(`  🏆 WINNER! Buyer ${i + 1} (${buyers[i].address})`);
        console.log(`     → Received ${fmt(diff)} ETH from Micro Pool!`);
      }
    }
  } catch (e) {
    console.log(`  Emergency reveal: ${e.message.slice(0, 150)}`);
  }

  await printPoolStatus(evmX, evmX_ADDRESS, "after Micro payout");

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 12: Third buying round (refill pools for Mid cycle)
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 12: Third Buying Round (refill for Mid pool cycle)");
  console.log("━".repeat(64) + "\n");

  const buyAmounts3 = ["1.0", "1.2", "0.8", "1.1", "0.9"];
  for (let i = 0; i < 5; i++) {
    const buyer = buyers[i]; // reuse first 5 buyers
    const buyRouter = router.connect(buyer);
    const amount = hre.ethers.parseEther(buyAmounts3[i]);
    const dl = await getDeadline();

    try {
      const tx = await buyRouter.swapExactETHForTokensSupportingFeeOnTransferTokens(
        0,
        [WETH, evmX_ADDRESS],
        buyer.address,
        dl,
        { value: amount }
      );
      const receipt = await tx.wait();
      txCount++;
      console.log(`  Buy ${i + 1}: ${buyAmounts3[i]} ETH (gas: ${receipt.gasUsed})`);
    } catch (e) {
      console.log(`  Buy ${i + 1}: FAILED — ${e.message.slice(0, 120)}`);
    }
  }

  // Autonomous cycle to distribute new tokens→ETH
  try {
    const cycleTx = await evmX.runAutonomousCycle({ gasLimit: 3_000_000 });
    const cycleReceipt = await cycleTx.wait();
    txCount++;
    console.log(`\n  ✅ runAutonomousCycle() #4: Gas ${cycleReceipt.gasUsed}`);
    logEvents(cycleReceipt, evmX);
  } catch (e) {
    console.log(`\n  Cycle #4: ${e.message.slice(0, 120)}`);
  }

  await printPoolStatus(evmX, evmX_ADDRESS, "after Phase 12 refill");

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 13: ⏰ Advance time 7 hours → Mid pool timer expires
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 13: ⏰ Advance Time +7 hours (Mid pool timer expiry)");
  console.log("━".repeat(64) + "\n");

  await advanceTime(7 * 60 * 60);
  console.log("  ✅ Time advanced by 7 hours");
  console.log("  → Mid pool 6h timer should be expired");

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 14: Trigger Mid pool allocation
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 14: Autonomous Cycle → Trigger Mid Pool Allocation");
  console.log("━".repeat(64) + "\n");

  try {
    const cycleTx = await evmX.runAutonomousCycle({ gasLimit: 3_000_000 });
    const cycleReceipt = await cycleTx.wait();
    txCount++;
    console.log(`  ✅ runAutonomousCycle() #5: Gas ${cycleReceipt.gasUsed}`);
    logEvents(cycleReceipt, evmX);

    const midPending = await evmX.midPoolPendingRequestId();
    if (midPending > 0n) {
      console.log(`  🎲 VRF Request ID (Mid): ${midPending}`);
    }
  } catch (e) {
    console.log(`  Cycle: ${e.message.slice(0, 120)}`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 15: ⏰ Advance 25h + Emergency force for Mid pool
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 15: ⏰ Advance +25h → Emergency Force (Mid Pool)");
  console.log("━".repeat(64) + "\n");

  await advanceTime(25 * 60 * 60);
  console.log("  ✅ Time advanced by 25 hours → VRF timeout exceeded");

  // Commit
  try {
    const commitTx = await evmX.emergencyForceAllocation(1, { gasLimit: 2_000_000 }); // 1 = Mid
    const commitReceipt = await commitTx.wait();
    txCount++;
    console.log(`  ✅ emergencyForceAllocation(Mid) — COMMIT: Gas ${commitReceipt.gasUsed}`);
    logEvents(commitReceipt, evmX);
  } catch (e) {
    console.log(`  Mid commit: ${e.message.slice(0, 150)}`);
  }

  await mineBlocks(7);
  console.log("  ✅ 7 blocks mined");

  // Reveal
  const ethBeforeMid = {};
  for (let i = 0; i < buyers.length; i++) {
    ethBeforeMid[buyers[i].address] = await hre.ethers.provider.getBalance(buyers[i].address);
  }

  try {
    const revealTx = await evmX.emergencyForceAllocation(1, { gasLimit: 2_000_000 }); // 1 = Mid
    const revealReceipt = await revealTx.wait();
    txCount++;
    console.log(`  ✅ emergencyForceAllocation(Mid) — REVEAL: Gas ${revealReceipt.gasUsed}`);
    logEvents(revealReceipt, evmX);

    console.log("\n  📊 Winner Detection (Mid Pool):");
    for (let i = 0; i < buyers.length; i++) {
      const ethAfter = await hre.ethers.provider.getBalance(buyers[i].address);
      const diff = ethAfter - ethBeforeMid[buyers[i].address];
      if (diff > 0n) {
        console.log(`  🏆 WINNER! Buyer ${i + 1} (${buyers[i].address})`);
        console.log(`     → Received ${fmt(diff)} ETH from Mid Pool!`);
      }
    }
  } catch (e) {
    console.log(`  Mid reveal: ${e.message.slice(0, 150)}`);
  }

  await printPoolStatus(evmX, evmX_ADDRESS, "after Mid payout");

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 16: Re-enrollment round
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 16: Re-enrollment (permissionless eligibility check)");
  console.log("━".repeat(64) + "\n");

  for (let i = 0; i < 5; i++) {
    try {
      const tx = await evmX.reEnroll(buyers[i].address);
      const receipt = await tx.wait();
      txCount++;
      console.log(`  reEnroll(buyer ${i + 1}): ✅ success (gas: ${receipt.gasUsed})`);
    } catch (e) {
      const reason = e.message.includes("revert")
        ? e.message.match(/reverted with custom error '([^']+)'/)?.[1] || "reverted"
        : e.message.slice(0, 80);
      console.log(`  reEnroll(buyer ${i + 1}): ${reason}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Phase 17: Final buying flurry (show pool refill after payouts)
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n" + "━".repeat(64));
  console.log("  PHASE 17: Final Trading Flurry (pool refill after payouts)");
  console.log("━".repeat(64) + "\n");

  for (let i = 5; i < 10; i++) {
    const buyer = buyers[i];
    const buyRouter = router.connect(buyer);
    const dl = await getDeadline();

    try {
      const tx = await buyRouter.swapExactETHForTokensSupportingFeeOnTransferTokens(
        0,
        [WETH, evmX_ADDRESS],
        buyer.address,
        dl,
        { value: hre.ethers.parseEther("0.6") }
      );
      const receipt = await tx.wait();
      txCount++;
      console.log(`  Buy ${i - 4}: 0.6 ETH (gas: ${receipt.gasUsed})`);
    } catch (e) {
      console.log(`  Buy ${i - 4}: FAILED — ${e.message.slice(0, 120)}`);
    }
  }

  // Final autonomous cycle
  try {
    const cycleTx = await evmX.runAutonomousCycle({ gasLimit: 3_000_000 });
    const cycleReceipt = await cycleTx.wait();
    txCount++;
    console.log(`\n  ✅ runAutonomousCycle() #6 (final): Gas ${cycleReceipt.gasUsed}`);
    logEvents(cycleReceipt, evmX);
  } catch (e) {
    console.log(`\n  Cycle #6: ${e.message.slice(0, 120)}`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  FINAL SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  await printPoolStatus(evmX, evmX_ADDRESS, "FINAL STATE");

  console.log("\n" + "═".repeat(64));
  console.log("  FULL LIFECYCLE DEMO COMPLETE! 🎉");
  console.log("═".repeat(64));
  console.log(`\n  Total transactions: ${txCount}`);
  console.log("\n  What the Tenderly Explorer now shows:");
  console.log("    🔵 10 buyer wallet fundings");
  console.log("    🔵 Uniswap V2 liquidity addition");
  console.log("    🟢 20 buy swaps (3% buy tax → Micro/Mid/Marketing/VRF)");
  console.log("    🔴 5 sell swaps (3% sell tax → Mega pool)");
  console.log("    ⚡ 6 runAutonomousCycle() calls (swap + pool checks)");
  console.log("    🎲 VRF requests (on-chain randomness)");
  console.log("    🔥 Emergency force allocations (commit + reveal)");
  console.log("    💰 ETH payouts to random winners (Micro + Mid pools)");
  console.log("    🔄 5 reEnroll() calls (permissionless re-check)");
  console.log("    📊 Pool accumulation → payout → refill cycle visible");
  console.log("\n  ✨ Full protocol lifecycle demonstrated:");
  console.log("    Trade → Tax → Pool Fill → Timer Expiry → Allocation →");
  console.log("    VRF Request → Emergency Fallback → Winner Paid → Reset → Repeat");
  console.log("\n  View on Tenderly Explorer:");
  console.log("  → https://dashboard.tenderly.co\n");
}

main()
  .then(() => {
    console.log("  Done! ✅");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n  Demo ERROR:", error.message || error);
    process.exit(1);
  });
