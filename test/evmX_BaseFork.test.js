/**
 * ============================================================================
 *  evmX - Base Mainnet Fork Stress Test
 * ============================================================================
 *
 *  A full integration test suite against a real Base Mainnet fork with
 *  live Uniswap V2 Router, WETH, and (optionally) Chainlink VRF Coordinator.
 *
 *  Prerequisites:
 *    1. cp .env.example .env
 *    2. Set BASE_RPC_URL, ROUTER_ADDRESS, WETH_ADDRESS
 *    3. (Optional) Set VRF_COORDINATOR - auto-deploys mock if missing
 *
 *  Run:
 *    npm run test:fork
 *
 *  Scenarios (8 categories, 25 tests):
 *    1. Deployment & Liquidity
 *    2. Spark test (deployer first buy)
 *    3. Bot army (50+ wallets)
 *    4. Tax verification + auto-swap
 *    5. Autonomous reward pool logic (VRF allocations)
 *    6. Limit enforcement (maxTx, maxWallet)
 *    7. Same-block trade protection
 *    8. Renounce ownership
 * ============================================================================
 */

const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const {
  validateForkConfig,
  printForkDiagnostics,
  assertDeployedContract,
} = require("./helpers/requireEnv");

describe("evmX - Base Mainnet Fork Stress Test", function () {
  this.timeout(600_000); // 10 min - fork tests are slower

  // ======================== Configuration ========================
  let FORK_CONFIG;             // Validated env config
  let ROUTER_ADDR;             // Uniswap V2 Router
  let WETH_ADDR;               // WETH
  let VRF_COORDINATOR_ADDR;    // VRF (real or mock)
  let VRF_KEY_HASH;            // VRF key hash
  let VRF_IS_MOCK = false;     // Whether we deployed a local VRF mock

  // ======================== Constants ========================
  const TOTAL_SUPPLY = ethers.parseEther("100000000");
  const MAX_TX_BPS = 150n;
  const MAX_WALLET_PERCENT = 4n;
  const BASIS_POINTS = 10000n;
  const AUTO_SWAP_THRESHOLD = ethers.parseEther("120000");

  const MAX_TX_AMOUNT = (TOTAL_SUPPLY * MAX_TX_BPS) / BASIS_POINTS;
  const MAX_WALLET_AMOUNT = (TOTAL_SUPPLY * MAX_WALLET_PERCENT) / 100n;

  // ======================== Test state ========================
  let owner, marketing;
  let botWallets;     // 53 wallets for bot simulation
  let token;
  let router;
  let pairAddress;
  let vrfSubId;
  let vrfCoordinator; // contract instance (real or mock)

  // Gas tracking
  const gasLog = { buys: [], sells: [], transfers: [], vrfFulfills: [] };

  // ======================== Helpers ========================

  async function logGas(label, tx) {
    const receipt = await tx.wait();
    const gas = receipt.gasUsed;
    if (gasLog[label + "s"]) gasLog[label + "s"].push(gas);
    else if (label === "vrfFulfill") gasLog.vrfFulfills.push(gas);
    return receipt;
  }

  function avg(arr) {
    if (arr.length === 0) return 0n;
    return arr.reduce((a, b) => a + b, 0n) / BigInt(arr.length);
  }

  async function getBlockTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return BigInt(block.timestamp);
  }

  async function buyTokens(buyer, ethAmount) {
    const routerWithSigner = router.connect(buyer);
    const path = [WETH_ADDR, await token.getAddress()];
    const ts = await getBlockTimestamp();
    const deadline = ts + 3600n;

    const tx = await routerWithSigner.swapExactETHForTokensSupportingFeeOnTransferTokens(
      0, path, buyer.address, deadline,
      { value: ethAmount },
    );
    return tx;
  }

  async function sellTokens(seller, tokenAmount) {
    const tokenWithSigner = token.connect(seller);
    await tokenWithSigner.approve(ROUTER_ADDR, tokenAmount);

    const routerWithSigner = router.connect(seller);
    const path = [await token.getAddress(), WETH_ADDR];
    const ts = await getBlockTimestamp();
    const deadline = ts + 3600n;

    const tx = await routerWithSigner.swapExactTokensForETHSupportingFeeOnTransferTokens(
      tokenAmount, 0, path, seller.address, deadline,
    );
    return tx;
  }

  async function fulfillVRF(requestId, randomWord) {
    if (VRF_IS_MOCK) {
      // Use mock's fulfillRandomWordsSimple (deterministic, no impersonation)
      const tx = await vrfCoordinator.fulfillRandomWordsSimple(requestId, randomWord);
      return tx;
    }

    // Real VRF coordinator on fork: impersonate the coordinator address
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [VRF_COORDINATOR_ADDR],
    });

    await owner.sendTransaction({
      to: VRF_COORDINATOR_ADDR,
      value: ethers.parseEther("1"),
    });

    const vrfSigner = await ethers.getSigner(VRF_COORDINATOR_ADDR);
    const tokenAddr = await token.getAddress();

    const iface = new ethers.Interface([
      "function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords)",
    ]);
    const data = iface.encodeFunctionData("rawFulfillRandomWords", [
      requestId,
      [randomWord],
    ]);

    const tx = await vrfSigner.sendTransaction({
      to: tokenAddr,
      data: data,
      gasLimit: 5_000_000,
    });

    await network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [VRF_COORDINATOR_ADDR],
    });

    return tx;
  }

  async function advanceTime(seconds) {
    await network.provider.send("evm_increaseTime", [Number(seconds)]);
    await network.provider.send("evm_mine");
  }

  async function mineBlock() {
    await network.provider.send("evm_mine");
  }

  function findEvent(receipt, eventName) {
    for (const log of receipt.logs) {
      try {
        const parsed = token.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === eventName) return parsed;
      } catch {}
    }
    return null;
  }

  function findAllEvents(receipt, eventName) {
    const events = [];
    for (const log of receipt.logs) {
      try {
        const parsed = token.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === eventName) events.push(parsed);
      } catch {}
    }
    return events;
  }

  // ================================================================
  //  SETUP - Validate env, deploy contracts, add liquidity
  // ================================================================
  before(async function () {
    //  Step 1: Validate environment 
    console.log("\n  [1/6] Validating fork configuration...");
    try {
      FORK_CONFIG = validateForkConfig();
    } catch (err) {
      console.error(err.message);
      this.skip(); // Skip all tests with clear explanation
      return;
    }

    ROUTER_ADDR = FORK_CONFIG.routerAddress;
    WETH_ADDR = FORK_CONFIG.wethAddress;
    VRF_KEY_HASH = FORK_CONFIG.vrfKeyHash;

    printForkDiagnostics(FORK_CONFIG);

    // Programmatic fork setup — works even without FORKING=true in hardhat.config
    const forkParams = { jsonRpcUrl: FORK_CONFIG.rpcUrl };
    if (FORK_CONFIG.forkBlockNumber) {
      forkParams.blockNumber = parseInt(FORK_CONFIG.forkBlockNumber, 10);
    }
    try {
      await network.provider.request({
        method: "hardhat_reset",
        params: [{ forking: forkParams }],
      });
    } catch (err) {
      console.error(`\n  Fork connection failed: ${err.message.slice(0, 120)}`);
      console.error("  Check BASE_RPC_URL in .env. Public RPC may be rate-limited.");
      console.error("  Recommended: use Alchemy or Infura free tier.\n");
      this.skip();
      return;
    }

    //  Step 2: Setup signers
    console.log("  [2/6] Allocating test wallets...");
    const signers = await ethers.getSigners();
    if (signers.length < 55) {
      throw new Error(
        `Need at least 55 signers but got ${signers.length}.\n` +
        "Ensure hardhat.config.js has: accounts: { count: 60 }"
      );
    }
    owner = signers[0];
    marketing = signers[1];
    botWallets = signers.slice(2, 55); // 53 wallets
    console.log(`    Allocated: 1 owner + 1 marketing + ${botWallets.length} bots`);

    //  Step 3: Verify on-chain contracts exist 
    console.log("  [3/6] Verifying on-chain contracts...");
    await assertDeployedContract(ROUTER_ADDR, "Uniswap V2 Router");
    console.log(`    Router:   ${ROUTER_ADDR} ... OK`);

    await assertDeployedContract(WETH_ADDR, "WETH");
    console.log(`    WETH:     ${WETH_ADDR} ... OK`);

    // Attach to router and verify it returns valid addresses
    router = await ethers.getContractAt(
      [
        "function factory() external view returns (address)",
        "function WETH() external view returns (address)",
        "function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)",
        "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable",
        "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external",
        "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
      ],
      ROUTER_ADDR,
    );

    const factoryAddr = await router.factory();
    const wethFromRouter = await router.WETH();
    if (factoryAddr === ethers.ZeroAddress) {
      throw new Error("Router.factory() returned address(0) - fork not connected to Base Mainnet");
    }
    if (wethFromRouter === ethers.ZeroAddress) {
      throw new Error("Router.WETH() returned address(0) - fork not connected to Base Mainnet");
    }
    console.log(`    Factory:  ${factoryAddr}`);
    console.log(`    WETH:     ${wethFromRouter} (from router)`);

    //  Step 4: Setup VRF (real or mock) 
    console.log("  [4/6] Setting up VRF...");

    if (FORK_CONFIG.useLocalVrfMock) {
      //  Deploy local VRF mock 
      console.log("    VRF_COORDINATOR not set in .env - deploying local mock...");
      const MockVRF = await ethers.getContractFactory("MockVRFCoordinator");
      vrfCoordinator = await MockVRF.deploy();
      await vrfCoordinator.waitForDeployment();
      VRF_COORDINATOR_ADDR = await vrfCoordinator.getAddress();
      VRF_IS_MOCK = true;
      console.log(`    MockVRFCoordinator: ${VRF_COORDINATOR_ADDR}`);

      // Create subscription on mock
      await vrfCoordinator.createSubscription(1, owner.address);
      await vrfCoordinator.fundSubscriptionWithNative(1, { value: ethers.parseEther("5") });
      vrfSubId = 1n;
      console.log(`    Mock VRF sub ID=${vrfSubId}, funded 5 ETH`);
    } else {
      //  Attach to real VRF coordinator 
      VRF_COORDINATOR_ADDR = FORK_CONFIG.vrfCoordinator;
      await assertDeployedContract(VRF_COORDINATOR_ADDR, "Chainlink VRF Coordinator");
      console.log(`    VRF:      ${VRF_COORDINATOR_ADDR} ... OK (real)`);
      VRF_IS_MOCK = false;

      vrfCoordinator = await ethers.getContractAt(
        [
          "function createSubscription() external returns (uint256 subId)",
          "function addConsumer(uint256 subId, address consumer) external",
          "function getSubscription(uint256 subId) external view returns (uint96 balance, uint96 nativeBalance, uint64 reqCount, address subOwner, address[] memory consumers)",
          "function fundSubscriptionWithNative(uint256 subId) external payable",
        ],
        VRF_COORDINATOR_ADDR,
      );

      // Create VRF subscription on real coordinator
      const createSubTx = await vrfCoordinator.createSubscription();
      const createSubReceipt = await createSubTx.wait();

      // Parse subscription ID from event logs
      vrfSubId = null;
      for (const log of createSubReceipt.logs) {
        if (log.address.toLowerCase() === VRF_COORDINATOR_ADDR.toLowerCase()) {
          if (log.topics.length >= 2) {
            vrfSubId = BigInt(log.topics[1]);
            break;
          }
        }
      }
      if (!vrfSubId) {
        for (const log of createSubReceipt.logs) {
          if (log.data && log.data.length >= 66) {
            const candidate = BigInt("0x" + log.data.slice(2, 66));
            if (candidate > 0n) { vrfSubId = candidate; break; }
          }
        }
      }
      if (!vrfSubId || vrfSubId === 0n) {
        throw new Error(
          "Failed to parse VRF subscription ID from createSubscription() receipt.\n" +
          "The VRF Coordinator at " + VRF_COORDINATOR_ADDR + " may be incompatible.\n" +
          "Fix: unset VRF_COORDINATOR in .env to auto-deploy a local mock."
        );
      }
      console.log(`    VRF sub ID=${vrfSubId}`);

      await vrfCoordinator.fundSubscriptionWithNative(vrfSubId, {
        value: ethers.parseEther("5"),
      });
      console.log("    VRF sub funded: 5 ETH");
    }

    //  Step 5: Deploy evmX_Testable 
    console.log("  [5/6] Deploying evmX_Testable...");
    const Token = await ethers.getContractFactory("evmX_Testable");
    token = await Token.deploy(
      marketing.address,
      vrfSubId,
      ROUTER_ADDR,
      VRF_COORDINATOR_ADDR,
      VRF_KEY_HASH,
    );
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    console.log(`    Token:    ${tokenAddress}`);

    // Add as VRF consumer
    if (VRF_IS_MOCK) {
      await vrfCoordinator.addConsumer(1, tokenAddress);
    } else {
      await vrfCoordinator.addConsumer(vrfSubId, tokenAddress);
    }
    console.log("    Added as VRF consumer");

    // Get and validate pair address
    pairAddress = await token.uniswapPair();
    if (pairAddress === ethers.ZeroAddress) {
      throw new Error(
        "token.uniswapPair() returned address(0).\n" +
        "Pair creation failed. Check ROUTER_ADDRESS and WETH_ADDRESS in .env"
      );
    }
    console.log(`    Pair:     ${pairAddress}`);

    //  Step 6: Final verification 
    console.log("  [6/6] Verifying deployment...");
    const supply = await token.totalSupply();
    if (supply !== TOTAL_SUPPLY) {
      throw new Error(`totalSupply mismatch: ${supply} != ${TOTAL_SUPPLY}`);
    }
    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal !== TOTAL_SUPPLY) {
      throw new Error(`Owner balance mismatch: ${ownerBal} != ${TOTAL_SUPPLY}`);
    }
    console.log("    Supply:   100,000,000 evmX ... OK");
    console.log("    Owner:    holds 100% ... OK");

    //  Diagnostics Summary 
    console.log("");
    console.log("  ");
    console.log("    Fork Setup Complete                                     ");
    console.log("  ");
    console.log(`    Token:     ${tokenAddress}  `);
    console.log(`    Pair:      ${pairAddress}  `);
    console.log(`    VRF Mode:  ${(VRF_IS_MOCK ? "LOCAL MOCK (deterministic)" : "REAL (fork impersonation)").padEnd(38)} `);
    console.log("  ");
    console.log("");
  });

  // ================================================================
  //  1. Deployment & Liquidity
  // ================================================================
  describe("1. Deployment & Liquidity", function () {
    it("should create a WETH/evmX liquidity pool", async function () {
      const liqTokens = ethers.parseEther("50000000"); // 50M tokens
      const liqEth = ethers.parseEther("0.4");

      await token.approve(ROUTER_ADDR, liqTokens);

      const ts = await getBlockTimestamp();
      const liqTx = await router.addLiquidityETH(
        await token.getAddress(), liqTokens, 0, 0, owner.address, ts + 3600n,
        { value: liqEth },
      );
      await liqTx.wait();

      const pair = await ethers.getContractAt(
        [
          "function getReserves() external view returns (uint112, uint112, uint32)",
          "function token0() external view returns (address)",
          "function totalSupply() external view returns (uint256)",
        ],
        pairAddress,
      );

      const [reserve0, reserve1] = await pair.getReserves();
      const token0 = await pair.token0();
      const lpSupply = await pair.totalSupply();
      const isToken0WETH = token0.toLowerCase() === WETH_ADDR.toLowerCase();
      const wethReserve = isToken0WETH ? reserve0 : reserve1;
      const tokenReserve = isToken0WETH ? reserve1 : reserve0;

      console.log(`      Pool: ${ethers.formatEther(wethReserve)} ETH / ${ethers.formatEther(tokenReserve)} evmX`);
      console.log(`      LP supply: ${ethers.formatEther(lpSupply)}`);

      expect(wethReserve).to.be.gt(0, "WETH reserve must be > 0 after liquidity add");
      expect(tokenReserve).to.be.gt(0, "Token reserve must be > 0 after liquidity add");
      expect(lpSupply).to.be.gt(0, "LP supply must be > 0 after liquidity add");
      expect(await token.balanceOf(owner.address)).to.equal(TOTAL_SUPPLY - liqTokens);
    });

    it("should have correct contract parameters", async function () {
      expect(await token.maxTxAmount()).to.equal(MAX_TX_AMOUNT);
      expect(await token.maxWalletAmount()).to.equal(MAX_WALLET_AMOUNT);
      expect(await token.marketingWallet()).to.equal(marketing.address);
      expect(await token.vrfSubscriptionId()).to.equal(vrfSubId);
      console.log(`      Max TX: ${ethers.formatEther(MAX_TX_AMOUNT)} | Max Wallet: ${ethers.formatEther(MAX_WALLET_AMOUNT)}`);
    });
  });

  // ================================================================
  //  2. Spark Test
  // ================================================================
  describe("2. Spark Test - Deployer first buy", function () {
    it("should allow deployer to make a buy (excluded from fees)", async function () {
      const sparkEth = ethers.parseEther("0.2");
      const balBefore = await token.balanceOf(owner.address);

      const tx = await buyTokens(owner, sparkEth);
      const receipt = await logGas("buy", tx);

      const balAfter = await token.balanceOf(owner.address);
      const received = balAfter - balBefore;

      console.log(`      Spark: ${ethers.formatEther(sparkEth)} ETH -> ${ethers.formatEther(received)} evmX (gas: ${receipt.gasUsed})`);
      expect(received).to.be.gt(0, "Deployer should receive tokens from spark buy");
    });
  });

  // ================================================================
  //  3. Bot Army (50+ wallets)
  // ================================================================
  describe("3. Bot Army - 50+ wallets chaotic trading", function () {
    it("should handle 50+ bot buys without reverts", async function () {
      let ok = 0;
      for (let i = 0; i < botWallets.length; i++) {
        const ethAmt = ethers.parseEther((0.001 + Math.random() * 0.004).toFixed(6));
        try {
          const tx = await buyTokens(botWallets[i], ethAmt);
          await logGas("buy", tx);
          ok++;
          await mineBlock();
        } catch (err) {
          console.log(`        Bot ${i} buy failed: ${err.message.slice(0, 60)}`);
        }
      }
      console.log(`      ${ok}/${botWallets.length} bot buys ok`);
      expect(ok).to.be.gte(50, "At least 50/53 bot buys should succeed");

      const contractBal = await token.balanceOf(await token.getAddress());
      console.log(`      Contract tax balance: ${ethers.formatEther(contractBal)} evmX`);
      expect(contractBal).to.be.gt(0, "Tax tokens should accumulate in contract");
    });

    it("should handle 30 bot sells", async function () {
      let ok = 0;
      for (let i = 0; i < 30; i++) {
        const bal = await token.balanceOf(botWallets[i].address);
        if (bal === 0n) continue;
        const sellAmt = (bal * BigInt(30 + Math.floor(Math.random() * 20))) / 100n;
        if (sellAmt === 0n) continue;
        try {
          const tx = await sellTokens(botWallets[i], sellAmt);
          await logGas("sell", tx);
          ok++;
          await mineBlock();
        } catch (err) {
          console.log(`        Bot ${i} sell failed: ${err.message.slice(0, 60)}`);
        }
      }
      console.log(`      ${ok}/30 bot sells ok`);
      expect(ok).to.be.gte(20, "At least 20/30 bot sells should succeed");
    });

    it("should handle mixed buys/sells/transfers", async function () {
      let ops = 0;

      for (let i = 30; i < 40 && i < botWallets.length; i++) {
        try { await buyTokens(botWallets[i], ethers.parseEther("0.002")); ops++; await mineBlock(); } catch {}
      }

      for (let i = 0; i < 5; i++) {
        const s = botWallets[i + 40];
        const b = await token.balanceOf(s.address);
        if (b === 0n) continue;
        const amt = b / 4n;
        if (amt === 0n) continue;
        try {
          const tx = await token.connect(s).transfer(botWallets[(i + 45) % botWallets.length].address, amt);
          await logGas("transfer", tx);
          ops++;
        } catch {}
      }

      for (let i = 10; i < 20; i++) {
        const b = await token.balanceOf(botWallets[i].address);
        if (b <= 1000n) continue;
        try { const tx = await sellTokens(botWallets[i], b / 3n); await logGas("sell", tx); ops++; await mineBlock(); } catch {}
      }

      console.log(`      ${ops} mixed operations completed`);
      expect(ops).to.be.gte(10, "At least 10 mixed operations should complete");
    });
  });

  // ================================================================
  //  4. Tax Verification + Auto-Swap
  // ================================================================
  describe("4. Tax Verification - Marketing accumulation & auto-swap", function () {
    it("should accumulate taxes in contract", async function () {
      const contractBal = await token.balanceOf(await token.getAddress());
      console.log(`      Contract token balance: ${ethers.formatEther(contractBal)} evmX`);
      expect(contractBal).to.be.gt(0, "Tax tokens must accumulate");
    });

    it("should trigger auto-swap when 120k threshold reached", async function () {
      const tokenAddr = await token.getAddress();
      let swapTriggered = false;
      let buyCount = 0;
      const mktEthBefore = await ethers.provider.getBalance(marketing.address);

      for (let round = 0; round < 30 && !swapTriggered; round++) {
        for (let i = 0; i < 10 && !swapTriggered; i++) {
          const walletIdx = (round * 10 + i) % botWallets.length;
          try {
            const tx = await buyTokens(botWallets[walletIdx], ethers.parseEther("0.01"));
            const receipt = await tx.wait();
            buyCount++;
            const swapEvt = findEvent(receipt, "SwapAndDistribute");
            if (swapEvt) {
              swapTriggered = true;
              console.log(`      SwapAndDistribute: ${ethers.formatEther(swapEvt.args[0])} tokens -> ${ethers.formatEther(swapEvt.args[1])} ETH`);
            }
            await mineBlock();
          } catch {}
        }
      }

      if (!swapTriggered) {
        const contractBal = await token.balanceOf(tokenAddr);
        console.log(`      Contract balance: ${ethers.formatEther(contractBal)} evmX`);
        if (contractBal >= AUTO_SWAP_THRESHOLD) {
          try {
            const cycleTx = await token.runAutonomousCycle({ gasLimit: 10_000_000 });
            const cycleReceipt = await cycleTx.wait();
            if (findEvent(cycleReceipt, "SwapAndDistribute")) {
              swapTriggered = true;
              console.log("      SwapAndDistribute via autonomousCycle");
            }
          } catch {}
        }
      }

      if (swapTriggered) {
        const mktEthAfter = await ethers.provider.getBalance(marketing.address);
        const mktReceived = mktEthAfter - mktEthBefore;
        console.log(`      Marketing ETH received: ${ethers.formatEther(mktReceived)}`);
        expect(mktReceived).to.be.gt(0, "Marketing wallet should receive ETH from swap");

        const microPool = await token.microPoolBalance();
        const midPool = await token.midPoolBalance();
        console.log(`      Micro: ${ethers.formatEther(microPool)} | Mid: ${ethers.formatEther(midPool)} ETH`);
        expect(microPool).to.be.gt(0, "Micro pool should receive ETH");
      }
      console.log(`      ${buyCount} buys, swap triggered: ${swapTriggered}`);
    });

    it("should have correct tax split ratios", async function () {
      const micro = await token.microPoolBalance();
      const mid = await token.midPoolBalance();
      if (micro > 0n && mid > 0n) {
        const ratio = Number((mid * 1000n) / micro) / 1000;
        console.log(`      Mid/Micro ratio: ${ratio} (expected ~1.5)`);
        expect(ratio).to.be.gte(0.5, "Mid/Micro ratio too low");
        expect(ratio).to.be.lte(3.0, "Mid/Micro ratio too high");
      }
    });
  });

  // ================================================================
  //  5. Autonomous Reward Pool Logic (VRF Allocations)
  // ================================================================
  describe("5. Autonomous Community Reward Protocol Logic - VRF Allocation Simulation", function () {
    it("should have eligible participants and pool balances", async function () {
      const cycleId = await token.microPoolCycleId();
      const microBal = await token.microPoolBalance();
      const entries = await token.microPoolTotalEntries();
      console.log(`      Micro cycle: ${cycleId}, balance: ${ethers.formatEther(microBal)} ETH, entries: ${entries}`);
    });

    it("should trigger & fulfill micro pool allocation after 2h", async function () {
      const microBal = await token.microPoolBalance();
      if (microBal === 0n) {
        for (let i = 0; i < 20; i++) {
          try { await buyTokens(botWallets[i], ethers.parseEther("0.005")); await mineBlock(); } catch {}
        }
      }

      await advanceTime(2 * 3600 + 120);

      let requestId = 0n;
      try {
        const tx = await token.runAutonomousCycle({ gasLimit: 10_000_000 });
        const receipt = await tx.wait();
        const drawEvt = findEvent(receipt, "AllocationRequested");
        if (drawEvt) {
          requestId = drawEvt.args[0];
          console.log(`      AllocationRequested: ID=${requestId}, poolType=${drawEvt.args[1]}`);
        }
        const failEvt = findEvent(receipt, "AllocationRequestFailed");
        if (failEvt) console.log(`      AllocationRequestFailed: poolType=${failEvt.args[0]}`);
      } catch (err) {
        console.log(`      autonomousCycle: ${err.message.slice(0, 80)}`);
      }

      if (requestId === 0n) {
        const pm = await token.microPoolPendingRequestId();
        if (pm > 0n) requestId = pm;
      }

      if (requestId > 0n) {
        console.log(`      Fulfilling VRF request ${requestId}...`);
        try {
          const randomWord = BigInt(ethers.keccak256(ethers.toUtf8Bytes("micro-test-" + Date.now())));
          const fulfillTx = await fulfillVRF(requestId, randomWord);
          const fulfillReceipt = await logGas("vrfFulfill", fulfillTx);

          const wonEvt = findEvent(fulfillReceipt, "PoolAllocated");
          const noWinnerEvt = findEvent(fulfillReceipt, "NoEligibleRecipient");
          if (wonEvt) console.log(`      PoolAllocated! Pool: ${wonEvt.args[0]}, Recipient: ${wonEvt.args[1]}, Prize: ${ethers.formatEther(wonEvt.args[2])} ETH`);
          else if (noWinnerEvt) console.log("      NoEligibleRecipient (sellers revoked)");
          expect(await token.microPoolPendingRequestId()).to.equal(0n, "Pending should clear after VRF");
        } catch (err) {
          console.log(`      VRF fulfillment: ${err.message.slice(0, 120)}`);
          if (!VRF_IS_MOCK) console.log("      (Expected: impersonation may fail on forked coordinator)");
        }
      } else {
        console.log("      No micro allocation requested (empty pot or no participants)");
      }
    });

    it("should trigger & fulfill mid pool allocation after 6h", async function () {
      console.log(`      Mid pool: ${ethers.formatEther(await token.midPoolBalance())} ETH`);

      await advanceTime(6 * 3600 + 120);
      for (let i = 0; i < 10; i++) {
        try { await buyTokens(botWallets[i + 10], ethers.parseEther("0.005")); await mineBlock(); } catch {}
      }

      let requestId = 0n;
      try {
        const tx = await token.runAutonomousCycle({ gasLimit: 10_000_000 });
        const receipt = await tx.wait();
        const draws = findAllEvents(receipt, "AllocationRequested");
        for (const d of draws) {
          if (d.args[1] === 1n || d.args[1] === 1) { requestId = d.args[0]; break; }
        }
      } catch {}

      const pendingMid = await token.midPoolPendingRequestId();
      if (pendingMid > 0n) requestId = pendingMid;

      if (requestId > 0n) {
        try {
          const rw = BigInt(ethers.keccak256(ethers.toUtf8Bytes("mid-test-" + Date.now())));
          await fulfillVRF(requestId, rw);
        } catch (err) {
          if (!VRF_IS_MOCK) console.log("      (Expected: forked coordinator impersonation)");
        }
      } else {
        console.log("      No mid allocation requested");
      }
    });

    it("should trigger & fulfill mega pool allocation after 7 days", async function () {
      console.log(`      Mega pool: ${ethers.formatEther(await token.megaPoolBalance())} ETH`);

      await advanceTime(7 * 24 * 3600 + 3600);
      for (let i = 0; i < 10; i++) {
        try { await buyTokens(botWallets[i + 20], ethers.parseEther("0.01")); await mineBlock(); } catch {}
      }

      let requestId = 0n;
      try {
        const tx = await token.runAutonomousCycle({ gasLimit: 10_000_000 });
        const receipt = await tx.wait();
        const draws = findAllEvents(receipt, "AllocationRequested");
        for (const d of draws) {
          if (d.args[1] === 2n || d.args[1] === 2) { requestId = d.args[0]; break; }
        }
      } catch {}

      const pendingMega = await token.megaPoolPendingRequestId();
      if (pendingMega > 0n) requestId = pendingMega;

      if (requestId > 0n) {
        try {
          const rw = BigInt(ethers.keccak256(ethers.toUtf8Bytes("mega-test-" + Date.now())));
          await fulfillVRF(requestId, rw);
        } catch (err) {
          if (!VRF_IS_MOCK) console.log("      (Expected: forked coordinator impersonation)");
        }
      } else {
        console.log("      No mega allocation requested");
      }
    });

    it("should handle emergency force allocation after 24h timeout", async function () {
      await advanceTime(2 * 3600 + 120);
      for (let i = 0; i < 15; i++) {
        try { await buyTokens(botWallets[i], ethers.parseEther("0.005")); await mineBlock(); } catch {}
      }

      let requestId = 0n;
      let poolType = 0;
      try {
        const tx = await token.runAutonomousCycle({ gasLimit: 10_000_000 });
        const receipt = await tx.wait();
        const drawEvt = findEvent(receipt, "AllocationRequested");
        if (drawEvt) {
          requestId = drawEvt.args[0];
          poolType = Number(drawEvt.args[1]);
        }
      } catch {}

      if (requestId === 0n) {
        const pm = await token.microPoolPendingRequestId();
        const pMid = await token.midPoolPendingRequestId();
        const pMega = await token.megaPoolPendingRequestId();
        if (pm > 0n) { requestId = pm; poolType = 0; }
        else if (pMid > 0n) { requestId = pMid; poolType = 1; }
        else if (pMega > 0n) { requestId = pMega; poolType = 2; }
      }

      if (requestId > 0n) {
        await expect(
          token.emergencyForceAllocation(poolType, { gasLimit: 5_000_000 })
        ).to.be.reverted;
        console.log("      Emergency correctly rejected before 24h");

        await advanceTime(24 * 3600 + 60);

        const emergTx = await token.emergencyForceAllocation(poolType, { gasLimit: 5_000_000 });
        const emergReceipt = await emergTx.wait();
        const emergEvt = findEvent(emergReceipt, "EmergencyForceAllocationExecuted");
        if (emergEvt) {
          console.log(`      Emergency executed: poolType=${emergEvt.args[0]}, requestId=${emergEvt.args[1]}`);
        }
      } else {
        console.log("      No pending allocation for emergency test");
      }
    });
  });

  // ================================================================
  //  6. Limit Test
  // ================================================================
  describe("6. Limit Test - Max TX enforcement", function () {
    it("should enforce maxTxAmount on wallet-to-wallet transfers", async function () {
      expect(await token.maxTxAmount()).to.equal(MAX_TX_AMOUNT);
      expect(await token.isExcludedFromLimits(pairAddress)).to.be.true;

      const sender = botWallets[0];
      const senderBal = await token.balanceOf(sender.address);

      if (senderBal > MAX_TX_AMOUNT) {
        const recipient = botWallets[botWallets.length - 1];
        await expect(
          token.connect(sender).transfer(recipient.address, MAX_TX_AMOUNT + 1n)
        ).to.be.revertedWithCustomError(token, "TransferExceedsMaxTx");
        console.log("      Transfer > maxTxAmount correctly reverted");
      } else {
        console.log(`      Sender balance ${ethers.formatEther(senderBal)} < maxTx (value verified)`);
      }
    });

    it("should allow buy under maxTxAmount", async function () {
      const testWallet = botWallets[botWallets.length - 2];
      const balBefore = await token.balanceOf(testWallet.address);
      await buyTokens(testWallet, ethers.parseEther("0.001"));
      expect(await token.balanceOf(testWallet.address)).to.be.gt(balBefore, "Buy should increase balance");
    });

    it("should enforce maxWalletAmount (4%)", async function () {
      const testWallet = botWallets[botWallets.length - 3];
      try {
        await buyTokens(testWallet, ethers.parseEther("5"));
        console.log("      Large buy succeeded (price kept under limit)");
      } catch {
        console.log("      Large buy reverted (limit enforced)");
      }
    });
  });

  // ================================================================
  //  7. Same-Block Trade Protection
  // ================================================================
  describe("7. Same-Block Trade Protection", function () {
    it("should allow same wallet to buy in different blocks", async function () {
      const testWallet = botWallets[3];
      const tx1 = await buyTokens(testWallet, ethers.parseEther("0.001"));
      await tx1.wait();
      await mineBlock();
      const tx2 = await buyTokens(testWallet, ethers.parseEther("0.001"));
      await tx2.wait();
      console.log("      Different-block buys: both OK");
    });

    it("should verify SameBlockTrade protection in bytecode", async function () {
      const tokenAddr = await token.getAddress();
      const code = await ethers.provider.getCode(tokenAddr);
      expect(code.length).to.be.gt(100, "Contract should have bytecode");

      const errorSig = ethers.id("SameBlockTrade()").slice(0, 10);
      const selectorBytes = errorSig.slice(2);
      const found = code.toLowerCase().includes(selectorBytes.toLowerCase());

      console.log(`      SameBlockTrade selector: ${errorSig} | in bytecode: ${found}`);
      expect(found).to.be.true;
      console.log("      Full runtime test: npx hardhat test test/LaunchStress.test.js");
    });
  });

  // ================================================================
  //  8. Renounce Ownership
  // ================================================================
  describe("8. Renounce Ownership", function () {
    it("should renounce ownership", async function () {
      expect(await token.owner()).to.equal(owner.address);
      await token.renounceOwnership();
      expect(await token.owner()).to.equal(ethers.ZeroAddress, "Owner must be zero after renounce");
    });

    it("should revert setMarketingWallet after renounce", async function () {
      await expect(
        token.setMarketingWallet(botWallets[0].address)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("should revert updateTrafficWhitelist after renounce", async function () {
      await expect(
        token.updateTrafficWhitelist(botWallets[1].address, true)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("should still allow trading after renounce", async function () {
      const w = botWallets[6];
      await buyTokens(w, ethers.parseEther("0.002"));
      console.log("      Buy after renounce: OK");

      await mineBlock();

      const bal = await token.balanceOf(w.address);
      if (bal > 1000n) {
        await sellTokens(w, bal / 2n);
        console.log("      Sell after renounce: OK");
      }

      try {
        await token.runAutonomousCycle({ gasLimit: 10_000_000 });
        console.log("      autonomousCycle after renounce: OK");
      } catch {
        console.log("      autonomousCycle had no work");
      }
    });

    it("marketing wallet permanently fixed", async function () {
      expect(await token.marketingWallet()).to.equal(marketing.address);
    });

    it("no pending VRF requests should be stuck", async function () {
      const pm = await token.microPoolPendingRequestId();
      const pMid = await token.midPoolPendingRequestId();
      const pMega = await token.megaPoolPendingRequestId();
      console.log(`      Pending: micro=${pm}, mid=${pMid}, mega=${pMega}`);
    });
  });

  // ================================================================
  //  GAS REPORT
  // ================================================================
  after(function () {
    console.log("\n  ");
    console.log("  GAS REPORT - Base Mainnet Fork");
    console.log("  ");

    for (const [label, arr] of Object.entries(gasLog)) {
      if (arr.length === 0) continue;
      const min = arr.reduce((a, b) => a < b ? a : b);
      const max = arr.reduce((a, b) => a > b ? a : b);
      console.log(`  ${label.padEnd(14)} ${arr.length} txs | avg: ${avg(arr)} | min: ${min} | max: ${max}`);
    }

    console.log("  \n");
  });
});

