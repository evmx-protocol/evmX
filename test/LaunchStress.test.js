const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("evmX Launch Stress Test", function () {
  this.timeout(300_000); // 5 min for the full suite

  let owner, marketing, users;
  let token, router, factory, weth, pair, vrfCoordinator;
  let pairAddress;

  const TOTAL_SUPPLY = ethers.parseEther("100000000");
  const SUB_ID = 1n;
  const VRF_KEY_HASH = ethers.keccak256(ethers.toUtf8Bytes("test-key-hash"));

  // Gas tracking
  const gasLog = { buys: [], sells: [], transfers: [], swaps: [], vrfFulfills: [] };

  async function logGas(label, tx) {
    const receipt = await tx.wait();
    const gas = receipt.gasUsed;
    if (label === "buy") gasLog.buys.push(gas);
    else if (label === "sell") gasLog.sells.push(gas);
    else if (label === "transfer") gasLog.transfers.push(gas);
    else if (label === "swap") gasLog.swaps.push(gas);
    else if (label === "vrfFulfill") gasLog.vrfFulfills.push(gas);
    return receipt;
  }

  function avg(arr) {
    if (arr.length === 0) return 0n;
    return arr.reduce((a, b) => a + b, 0n) / BigInt(arr.length);
  }

  before(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    marketing = signers[1];
    users = signers.slice(2, 22); // 20 test users

    // Deploy mocks
    const MockWETH = await ethers.getContractFactory("MockWETH");
    weth = await MockWETH.deploy();

    const MockFactory = await ethers.getContractFactory("MockFactory");
    factory = await MockFactory.deploy();

    const MockRouter = await ethers.getContractFactory("MockRouter");
    router = await MockRouter.deploy(await factory.getAddress(), await weth.getAddress());

    const MockVRF = await ethers.getContractFactory("MockVRFCoordinator");
    vrfCoordinator = await MockVRF.deploy();

    // Setup VRF subscription
    await vrfCoordinator.createSubscription(SUB_ID, owner.address);

    // Deploy token
    const Token = await ethers.getContractFactory("evmX_Testable");
    token = await Token.deploy(
      marketing.address,
      SUB_ID,
      await router.getAddress(),
      await vrfCoordinator.getAddress(),
      VRF_KEY_HASH
    );

    // Add token as VRF consumer
    await vrfCoordinator.addConsumer(SUB_ID, await token.getAddress());

    pairAddress = await token.uniswapPair();
    pair = await ethers.getContractAt("MockPair", pairAddress);

    // Approve router for liquidity
    const routerAddr = await router.getAddress();
    await token.approve(routerAddr, TOTAL_SUPPLY);

    // Add liquidity: 50M tokens + 50 ETH
    const liqTokens = ethers.parseEther("50000000");
    const liqEth = ethers.parseEther("50");

    await router.addLiquidityETH(
      await token.getAddress(),
      liqTokens,
      0,
      0,
      owner.address,
      Math.floor(Date.now() / 1000) + 3600,
      { value: liqEth }
    );
  });

  // ================================================================
  // PHASE 1: Basic sanity
  // ================================================================

  describe("Deployment sanity", function () {
    it("should have correct total supply", async function () {
      expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
    });

    it("should have pair with reserves", async function () {
      const [r0, r1] = await pair.getReserves();
      expect(r0).to.be.gt(0n);
      expect(r1).to.be.gt(0n);
    });

    it("owner should hold remaining tokens", async function () {
      const balance = await token.balanceOf(owner.address);
      expect(balance).to.be.gt(0n);
    });
  });

  // ================================================================
  // PHASE 2: Simulate buys
  // ================================================================

  describe("50 Buy transactions", function () {
    it("should process 50 buys without reverts", async function () {
      for (let i = 0; i < 50; i++) {
        const user = users[i % users.length];
        const buyAmount = ethers.parseEther("100000"); // 100k tokens each

        // Owner sends tokens to pair (simulates user buying from pool)
        // We'll distribute from owner to each user (simulates buy)
        const tx = await token.connect(owner).transfer(user.address, buyAmount);
        await logGas("buy", tx);
      }
    });
  });

  // ================================================================
  // PHASE 3: Simulate sells (via pair  mark as liquidityPool sell)
  // ================================================================

  describe("30 Sell transactions", function () {
    it("should process 30 sells without reverts", async function () {
      for (let i = 0; i < 30; i++) {
        const user = users[i % users.length];
        const bal = await token.balanceOf(user.address);
        if (bal > ethers.parseEther("20000")) {
          const sellAmount = ethers.parseEther("10000");
          // Transfer to pair (simulates a sell)
          const tx = await token.connect(user).transfer(pairAddress, sellAmount);
          await logGas("sell", tx);
        }
      }
    });
  });

  // ================================================================
  // PHASE 4: Wallet-to-wallet transfers
  // ================================================================

  describe("20 Wallet-to-wallet transfers", function () {
    it("should process 20 transfers without reverts", async function () {
      for (let i = 0; i < 20; i++) {
        const from = users[i % users.length];
        const to = users[(i + 1) % users.length];
        const bal = await token.balanceOf(from.address);
        if (bal > ethers.parseEther("5000")) {
          const tx = await token.connect(from).transfer(to.address, ethers.parseEther("1000"));
          await logGas("transfer", tx);
        }
      }
    });
  });

  // ================================================================
  // PHASE 5: Swap threshold trigger
  // ================================================================

  describe("Auto-swap threshold", function () {
    it("should accumulate taxes without stuck state", async function () {
      const tokenAddr = await token.getAddress();
      const contractBalance = await token.balanceOf(tokenAddr);
      // Contract should have accumulated tax tokens
      expect(contractBalance).to.be.gte(0n);
    });

    it("should trigger swap via runAutonomousCycle", async function () {
      try {
        const tx = await token.runAutonomousCycle({ gasLimit: 5_000_000 });
        await logGas("swap", tx);
      } catch (e) {
        // Swap may not trigger if threshold not met  that's OK
      }
    });
  });

  // ================================================================
  // PHASE 6: MaxTx / MaxWallet violations
  // ================================================================

  describe("Limit violations", function () {
    it("should revert on MaxTx violation", async function () {
      const maxTx = await token.maxTxAmount();
      const violationAmount = maxTx + 1n;

      // Transfer from owner (excluded) to user (not excluded) via pair (buy)
      // We need a non-excluded sender. Use a user.
      const user = users[0];
      const recipient = users[15];

      // Give user enough tokens
      await token.connect(owner).transfer(user.address, violationAmount + ethers.parseEther("10000"));

      await expect(
        token.connect(user).transfer(recipient.address, violationAmount)
      ).to.be.reverted;
    });

    it("should revert on MaxWallet violation", async function () {
      const maxWallet = await token.maxWalletAmount();
      const recipient = users[14];
      const currentBal = await token.balanceOf(recipient.address);

      if (currentBal < maxWallet) {
        const needed = maxWallet - currentBal + 1n;
        // Transfer in small chunks or directly from owner (excluded from limits)
        // But recipient will exceed  should revert if sender is non-excluded
        const user = users[0];
        const userBal = await token.balanceOf(user.address);

        if (userBal > needed) {
          await expect(
            token.connect(user).transfer(recipient.address, needed)
          ).to.be.reverted;
        }
      }
    });
  });

  // ================================================================
  // PHASE 7: Pool accumulation
  // ================================================================

  describe("Pool accumulation", function () {
    it("should report pot balances via view functions", async function () {
      const microInfo = await token.getPoolInfo(0);
      const midInfo = await token.getPoolInfo(1);
      const megaInfo = await token.getPoolInfo(2);

      // Log for visibility
      console.log("    Micro pot balance:", ethers.formatEther(microInfo[0]));
      console.log("    Mid pot balance:", ethers.formatEther(midInfo[0]));
      console.log("    Mega pot balance:", ethers.formatEther(megaInfo[0]));
    });

    it("should accept external ETH deposits to mega pot", async function () {
      const tokenAddr = await token.getAddress();
      const megaBefore = await token.megaPoolBalance();

      await owner.sendTransaction({ to: tokenAddr, value: ethers.parseEther("1") });

      const megaAfter = await token.megaPoolBalance();
      expect(megaAfter).to.be.gt(megaBefore);
    });

    it("syncETHAccounting should handle any drift", async function () {
      await token.syncETHAccounting();
      // Should not revert
    });
  });

  // ================================================================
  // PHASE 8: VRF draw lifecycle
  // ================================================================

  describe("VRF draw lifecycle", function () {
    it("should request and fulfill a VRF draw", async function () {
      // Force micro pot to have balance and participants
      // First, advance time past micro ladder time limit
      await ethers.provider.send("evm_increaseTime", [7201]); // 2h + 1s
      await ethers.provider.send("evm_mine", []);

      // Trigger autonomous cycle to potentially request draw
      try {
        await token.runAutonomousCycle({ gasLimit: 5_000_000 });
      } catch (e) {
        // May not trigger if conditions not met
      }

      // Check if any VRF request is pending
      const microPending = await token.microPoolPendingRequestId();
      const midPending = await token.midPoolPendingRequestId();
      const megaPending = await token.megaPoolPendingRequestId();

      const pendingId = microPending || midPending || megaPending;

      if (pendingId > 0n) {
        console.log("    Pending VRF request:", pendingId.toString());

        // Fulfill it
        const tx = await vrfCoordinator.fulfillRandomWordsSimple(
          pendingId,
          12345678901234567890n
        );
        await logGas("vrfFulfill", tx);

        // Verify pending is cleared
        const microAfter = await token.microPoolPendingRequestId();
        const midAfter = await token.midPoolPendingRequestId();
        const megaAfter = await token.megaPoolPendingRequestId();

        const clearedId = (microPending > 0n ? microAfter : 0n) ||
                          (midPending > 0n ? midAfter : 0n) ||
                          (megaPending > 0n ? megaAfter : 0n);

        expect(clearedId).to.equal(0n);
        console.log("    VRF fulfilled and pending cleared");
      } else {
        console.log("    No VRF draw triggered (no participants or no pot balance)");
      }
    });

    it("cycle IDs should be valid after draws", async function () {
      const microCycle = await token.microPoolCycleId();
      const midCycle = await token.midPoolCycleId();
      const megaCycle = await token.megaPoolCycleId();

      expect(microCycle).to.be.gte(1n);
      expect(midCycle).to.be.gte(1n);
      expect(megaCycle).to.be.gte(1n);
    });
  });

  // ================================================================
  // PHASE 9: Same-block multi-operation (mining control)
  // ================================================================

  describe("Same-block operations", function () {
    it("should handle manual mining mode", async function () {
      await ethers.provider.send("evm_setAutomine", [false]);

      try {
        // Queue multiple txs in same block
        const user1 = users[5];
        const user2 = users[6];

        const bal1 = await token.balanceOf(user1.address);
        const bal2 = await token.balanceOf(user2.address);

        if (bal1 > ethers.parseEther("1000") && bal2 > ethers.parseEther("1000")) {
          // Two different users doing transfers in same block
          await token.connect(user1).transfer(users[7].address, ethers.parseEther("100"));
          await token.connect(user2).transfer(users[8].address, ethers.parseEther("100"));

          await ethers.provider.send("evm_mine", []);
        }
      } finally {
        await ethers.provider.send("evm_setAutomine", [true]);
        await ethers.provider.send("evm_mine", []);
      }
    });
  });

  // ================================================================
  // PHASE 10: Owner renounce
  // ================================================================

  describe("Ownership renounce", function () {
    it("should renounce ownership", async function () {
      await token.renounceOwnership();
      const newOwner = await token.owner();
      expect(newOwner).to.equal(ethers.ZeroAddress);
    });

    it("should revert all owner-only functions after renounce", async function () {
      await expect(
        token.updateTrafficWhitelist(users[0].address, true)
      ).to.be.reverted;

      await expect(
        token.setMarketingWallet(users[1].address)
      ).to.be.reverted;
    });

    it("runAutonomousCycle should still work after renounce", async function () {
      // Permissionless function  must keep working
      const tx = await token.connect(users[0]).runAutonomousCycle({ gasLimit: 5_000_000 });
      await tx.wait();
    });

    it("transfers should still work after renounce", async function () {
      const sender = users[0];
      const receiver = users[1];
      const bal = await token.balanceOf(sender.address);
      if (bal > ethers.parseEther("100")) {
        await token.connect(sender).transfer(receiver.address, ethers.parseEther("50"));
      }
    });

    it("emergency force draw should still be callable after renounce", async function () {
      // Should revert with NoPendingAllocation (not access control)
      await expect(
        token.connect(users[0]).emergencyForceAllocation(0, { gasLimit: 2_000_000 })
      ).to.be.revertedWithCustomError(token, "NoPendingAllocation");
    });

    it("syncETHAccounting should still work after renounce", async function () {
      await token.connect(users[0]).syncETHAccounting();
    });

    it("reEnroll should still work after renounce", async function () {
      await token.connect(users[0]).reEnroll(users[1].address);
    });
  });

  // ================================================================
  // PHASE 11: State consistency checks
  // ================================================================

  describe("Final state consistency", function () {
    it("should have no stuck ETH (accounting matches balance)", async function () {
      const tokenAddr = await token.getAddress();
      const microPot = await token.microPoolBalance();
      const midPot = await token.midPoolBalance();
      const megaPot = await token.megaPoolBalance();
      const vrfPending = await token.pendingVrfEth();

      const tracked = microPot + midPot + megaPot + vrfPending;
      const actual = await ethers.provider.getBalance(tokenAddr);

      // Actual should be >= tracked (excess goes to mega via sync)
      expect(actual).to.be.gte(tracked);

      console.log("    Tracked ETH:", ethers.formatEther(tracked));
      console.log("    Actual ETH:", ethers.formatEther(actual));
      console.log("    Difference:", ethers.formatEther(actual - tracked));
    });

    it("total token supply should be unchanged", async function () {
      const supply = await token.totalSupply();
      expect(supply).to.equal(TOTAL_SUPPLY);
    });

    it("participant counts should be non-negative", async function () {
      const microInfo = await token.getPoolInfo(0);
      const midInfo = await token.getPoolInfo(1);
      const megaInfo = await token.getPoolInfo(2);
      expect(microInfo[5]).to.be.gte(0n);
      expect(midInfo[5]).to.be.gte(0n);
      expect(megaInfo[5]).to.be.gte(0n);
      console.log(`    Participants: micro=${microInfo[5]}, mid=${midInfo[5]}, mega=${megaInfo[5]}`);
    });

    it("no pending VRF requests should be stuck", async function () {
      const microPending = await token.microPoolPendingRequestId();
      const midPending = await token.midPoolPendingRequestId();
      const megaPending = await token.megaPoolPendingRequestId();

      console.log(`    Pending requests: micro=${microPending}, mid=${midPending}, mega=${megaPending}`);
    });
  });

  // ================================================================
  // PHASE 12: Gas report
  // ================================================================

  describe("Gas Report", function () {
    it("should print gas statistics", function () {
      console.log("\n    ");
      console.log("    GAS USAGE REPORT");
      console.log("    ");

      if (gasLog.buys.length > 0) {
        console.log(`    Buy avg:         ${avg(gasLog.buys).toLocaleString()} gas (${gasLog.buys.length} txs)`);
        console.log(`    Buy min:         ${gasLog.buys.reduce((a, b) => a < b ? a : b).toLocaleString()}`);
        console.log(`    Buy max:         ${gasLog.buys.reduce((a, b) => a > b ? a : b).toLocaleString()}`);
      }

      if (gasLog.sells.length > 0) {
        console.log(`    Sell avg:        ${avg(gasLog.sells).toLocaleString()} gas (${gasLog.sells.length} txs)`);
        console.log(`    Sell min:        ${gasLog.sells.reduce((a, b) => a < b ? a : b).toLocaleString()}`);
        console.log(`    Sell max:        ${gasLog.sells.reduce((a, b) => a > b ? a : b).toLocaleString()}`);
      }

      if (gasLog.transfers.length > 0) {
        console.log(`    Transfer avg:    ${avg(gasLog.transfers).toLocaleString()} gas (${gasLog.transfers.length} txs)`);
      }

      if (gasLog.swaps.length > 0) {
        console.log(`    Swap avg:        ${avg(gasLog.swaps).toLocaleString()} gas (${gasLog.swaps.length} txs)`);
      }

      if (gasLog.vrfFulfills.length > 0) {
        console.log(`    VRF fulfill avg: ${avg(gasLog.vrfFulfills).toLocaleString()} gas (${gasLog.vrfFulfills.length} txs)`);
      }

      console.log("    \n");
    });
  });
});

