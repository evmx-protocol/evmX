// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../evmXBaseTest.sol";

/**
 * @title evmXFuzz
 * @dev Aggressive fuzz tests covering boundaries, edge cases, and random sequences.
 */
contract evmXFuzz is evmXBaseTest {

    // â"€â"€â"€ Buy boundary fuzzing â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function testFuzz_buyWithRandomAmount(uint256 ethAmount) public {
        ethAmount = bound(ethAmount, 0.0001 ether, 5 ether);
        address buyer = users[0];

        uint256 balBefore = token.balanceOf(buyer);
        buyTokens(buyer, ethAmount);
        uint256 received = token.balanceOf(buyer) - balBefore;

        // Must receive tokens (>0) for any non-zero ETH
        assertGt(received, 0, "Fuzz: zero tokens received");
        // Total supply unchanged
        assertEq(token.totalSupply(), TOTAL_SUPPLY, "Fuzz: supply changed");
    }

    // â"€â"€â"€ Sell boundary fuzzing â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function testFuzz_sellWithRandomAmount(uint256 sellPct) public {
        sellPct = bound(sellPct, 1, 100);
        address seller = users[1];

        buyTokens(seller, 1 ether);
        uint256 tokenBal = token.balanceOf(seller);
        uint256 sellAmount = (tokenBal * sellPct) / 100;
        if (sellAmount == 0) return;

        // Sell should not revert (within maxTx for reasonable amounts)
        if (sellAmount <= MAX_TX) {
            uint256 ethBefore = seller.balance;
            sellTokens(seller, sellAmount);
            assertGt(seller.balance, ethBefore, "Fuzz: no ETH received from sell");
        }
    }

    // â"€â"€â"€ Transfer boundary fuzzing â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function testFuzz_transferBoundary(uint256 amount) public {
        address from = users[2];
        address to = users[3];

        buyTokens(from, 2 ether);
        uint256 bal = token.balanceOf(from);
        amount = bound(amount, 1, bal);

        if (amount > MAX_TX) {
            vm.prank(from);
            vm.expectRevert();
            token.transfer(to, amount);
        } else {
            uint256 toBefore = token.balanceOf(to);
            // Check maxWallet
            if (toBefore + amount > MAX_WALLET) {
                vm.prank(from);
                vm.expectRevert();
                token.transfer(to, amount);
            } else {
                vm.prank(from);
                token.transfer(to, amount);
                // No fee on wallet-to-wallet, so exact amount transferred
                assertEq(token.balanceOf(to), toBefore + amount, "Fuzz: transfer amount mismatch");
            }
        }
    }

    // â"€â"€â"€ Tax calculation precision â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function testFuzz_taxCalculationPrecision(uint256 ethAmount) public {
        ethAmount = bound(ethAmount, 0.001 ether, 1 ether);
        address buyer = users[4];

        uint256 tokenBalBefore = token.balanceOf(buyer);
        uint256 contractBalBefore = token.balanceOf(address(token));

        buyTokens(buyer, ethAmount);

        uint256 tokenReceived = token.balanceOf(buyer) - tokenBalBefore;
        uint256 taxCollected = token.balanceOf(address(token)) - contractBalBefore;

        // Tax should be ~3% of gross. gross = received + tax
        uint256 grossTokens = tokenReceived + taxCollected;
        if (grossTokens > 0) {
            // Tax should be within 300 BPS +/- 1 wei rounding
            uint256 expectedTax = (grossTokens * 300) / 10_000;
            assertApproxEqAbs(taxCollected, expectedTax, 2, "Fuzz: tax precision drift > 2 wei");
        }
    }

    // â"€â"€â"€ Dynamic entry calculation never panics â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function testFuzz_dynamicEntryNeverPanics(uint256 potBalance) public view {
        // Verify the view functions don't revert with any pot balance state
        // We can't set pot balance directly, but we can call the view functions
        token.getPoolInfo(0);
        token.getPoolInfo(1);
        token.getPoolInfo(2);
    }

    // â"€â"€â"€ Threshold raise/lower stays in bounds â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function testFuzz_thresholdAlwaysInBounds(uint256 numOps) public {
        numOps = bound(numOps, 1, 50);

        for (uint256 i; i < numOps; i++) {
            // Alternate between buying (to build pot) and warping time (to trigger draws)
            buyTokens(users[i % NUM_USERS], 0.1 ether);
            warpTime(3 hours); // past micro ladder time limit
            try token.runAutonomousCycle() {} catch {}
        }

        uint256 microT = token.microPoolCurrentThreshold();
        uint256 midT = token.midPoolCurrentThreshold();

        assertGe(microT, 0.01 ether, "Fuzz: micro threshold < base after ops");
        assertLe(microT, 100 ether, "Fuzz: micro threshold > max after ops");
        assertGe(midT, 0.05 ether, "Fuzz: mid threshold < base after ops");
        assertLe(midT, 500 ether, "Fuzz: mid threshold > max after ops");
    }

    // â"€â"€â"€ Random operation sequence â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function testFuzz_randomOperationSequence(uint256 seed) public {
        uint256 ops = bound(seed % 256, 10, 80);

        for (uint256 i; i < ops; i++) {
            uint256 action = uint256(keccak256(abi.encodePacked(seed, i))) % 6;
            address actor = users[i % NUM_USERS];

            if (action == 0) {
                // Buy
                uint256 ethAmt = bound(uint256(keccak256(abi.encodePacked(seed, i, "buy"))), 0.001 ether, 0.5 ether);
                if (actor.balance >= ethAmt) buyTokens(actor, ethAmt);
            } else if (action == 1) {
                // Sell
                uint256 bal = token.balanceOf(actor);
                if (bal > 100 ether) {
                    uint256 sellAmt = bound(uint256(keccak256(abi.encodePacked(seed, i, "sell"))), 1, bal / 2);
                    if (sellAmt <= MAX_TX) sellTokens(actor, sellAmt);
                }
            } else if (action == 2) {
                // Transfer
                address to = users[(i + 7) % NUM_USERS];
                uint256 bal = token.balanceOf(actor);
                if (bal > 0 && actor != to) {
                    uint256 amt = bound(uint256(keccak256(abi.encodePacked(seed, i, "xfer"))), 1, bal);
                    if (amt <= MAX_TX) {
                        vm.prank(actor);
                        try token.transfer(to, amt) {} catch {}
                    }
                }
            } else if (action == 3) {
                // Autonomous cycle
                vm.prank(actor);
                try token.runAutonomousCycle() {} catch {}
            } else if (action == 4) {
                // Warp time
                warpTime(bound(uint256(keccak256(abi.encodePacked(seed, i, "warp"))), 30, 4 hours));
            } else {
                // Fulfill VRF
                uint256 reqId = vrfCoordinator.getPendingRequestId();
                if (reqId > 0) {
                    uint256[] memory rw = new uint256[](1);
                    rw[0] = uint256(keccak256(abi.encodePacked(seed, i, "vrf")));
                    vm.prank(address(vrfCoordinator));
                    try token.rawFulfillRandomWords(reqId, rw) {} catch {}
                }
            }
        }

        // Post-sequence invariants
        assertEq(token.totalSupply(), TOTAL_SUPPLY, "Fuzz seq: supply changed");
        uint256 tracked = token.microPoolBalance() + token.midPoolBalance() + token.megaPoolBalance() + token.pendingVrfEth();
        assertLe(tracked, address(token).balance, "Fuzz seq: accounting drift");
    }

    // â"€â"€â"€ Swap threshold boundary â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function testFuzz_swapThresholdBoundary(uint256 numBuys) public {
        numBuys = bound(numBuys, 50, 150);

        uint256 contractBalBefore = token.balanceOf(address(token));
        uint256 ethBalBefore = address(token).balance;

        for (uint256 i; i < numBuys; i++) {
            address buyer = users[i % NUM_USERS];
            if (buyer.balance >= 0.05 ether) {
                buyTokens(buyer, 0.05 ether);
            }
        }

        // If threshold was crossed, contract balance should have decreased (swapped)
        // and ETH balance should have increased (from swap proceeds)
        uint256 contractBalAfter = token.balanceOf(address(token));
        uint256 ethBalAfter = address(token).balance;

        // Either the swap happened (fewer tokens, more ETH) or it didn't yet
        // But accounting must be valid
        uint256 tracked = token.microPoolBalance() + token.midPoolBalance() + token.megaPoolBalance() + token.pendingVrfEth();
        assertLe(tracked, ethBalAfter, "Fuzz: accounting after threshold crossing");
    }

    // â"€â"€â"€ 1 wei edge cases â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function testFuzz_1weiEdgeCases(uint8 scenario) public {
        address user = users[5];
        buyTokens(user, 1 ether); // Get some tokens first
        uint256 bal = token.balanceOf(user);

        if (scenario % 3 == 0) {
            // Transfer 1 wei token
            vm.prank(user);
            token.transfer(users[6], 1);
            assertEq(token.balanceOf(users[6]), 1, "1 wei transfer failed");
        } else if (scenario % 3 == 1) {
            // Transfer exactly maxTx
            if (bal >= MAX_TX) {
                vm.prank(user);
                token.transfer(users[7], MAX_TX);
            }
        } else {
            // Transfer maxTx + 1 should revert
            if (bal > MAX_TX) {
                vm.prank(user);
                vm.expectRevert();
                token.transfer(users[8], MAX_TX + 1);
            }
        }
    }

    // â"€â"€â"€ Repeated autonomous cycle is safe â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function testFuzz_repeatedAutonomousCycleSafe(uint256 count) public {
        count = bound(count, 1, 30);

        // Build some state
        for (uint256 i; i < 5; i++) {
            buyTokens(users[i], 0.5 ether);
        }

        uint256 supplyBefore = token.totalSupply();

        for (uint256 i; i < count; i++) {
            vm.prank(users[i % NUM_USERS]);
            try token.runAutonomousCycle() {} catch {}
            warpTime(60);
        }

        assertEq(token.totalSupply(), supplyBefore, "Fuzz: supply changed after repeated cycles");
        uint256 tracked = token.microPoolBalance() + token.midPoolBalance() + token.megaPoolBalance() + token.pendingVrfEth();
        assertLe(tracked, address(token).balance, "Fuzz: accounting after repeated cycles");
    }

    // ─── getUserStatus never reverts ─────────────────────────────────────

    function testFuzz_getUserStatusNeverReverts(uint256 userSeed) public {
        address user = users[userSeed % NUM_USERS];

        // Call before any interaction — must not revert
        (bool me, uint8 mEnt, bool miE, uint8 miEnt, bool mgE, uint8 mgEnt) = token.getUserStatus(user);

        // Entries must be <= 3 (MAX_ENTRIES_PER_CYCLE)
        assertLe(mEnt, 3, "Fuzz: micro entries > 3");
        assertLe(miEnt, 3, "Fuzz: mid entries > 3");
        assertLe(mgEnt, 3, "Fuzz: mega entries > 3");

        // Buy and check again
        uint256 ethAmt = bound(userSeed, 0.01 ether, 1 ether);
        if (user.balance >= ethAmt) {
            buyTokens(user, ethAmt);
            vm.roll(block.number + 1);
        }

        (me, mEnt, miE, miEnt, mgE, mgEnt) = token.getUserStatus(user);
        assertLe(mEnt, 3, "Fuzz: micro entries > 3 after buy");
        assertLe(miEnt, 3, "Fuzz: mid entries > 3 after buy");
        assertLe(mgEnt, 3, "Fuzz: mega entries > 3 after buy");
    }

    // ─── Buy-to-Play entries always bounded [0, 3] ───────────────────────

    function testFuzz_buyToPlayEntriesBounded(uint256 numBuys) public {
        numBuys = bound(numBuys, 1, 25);
        address user = users[0];

        for (uint256 i; i < numBuys; i++) {
            if (user.balance >= 0.3 ether) {
                buyTokens(user, 0.3 ether);
                vm.roll(block.number + 1);
            }
        }

        (, uint8 microEnt,, uint8 midEnt,, uint8 megaEnt) = token.getUserStatus(user);
        assertLe(microEnt, 3, "Fuzz: micro entries > 3 after many buys");
        assertLe(midEnt, 3, "Fuzz: mid entries > 3 after many buys");
        assertLe(megaEnt, 3, "Fuzz: mega entries > 3 after many buys");

        // Should have at least 1 entry for micro (any buy gives entry)
        assertGe(microEnt, 1, "Fuzz: 0 micro entries after buys");
    }

    // ─── getPoolInfo valid pool types never revert ───────────────────────

    function testFuzz_getPoolInfoValidPools(uint8 poolType) public view {
        if (poolType <= 2) {
            // Valid pool types — must not revert
            (uint256 bal, uint256 entryReq, uint256 threshold, uint256 cycleId, uint256 totalEntries, uint256 roundStart) = token.getPoolInfo(poolType);
            // Entry requirement must be within [floor, cap] for each pool type
            if (poolType == 0) {
                assertGe(entryReq, 0.001 ether, "Fuzz: micro entry below floor");
                assertLe(entryReq, 0.05 ether, "Fuzz: micro entry above cap");
            } else if (poolType == 1) {
                assertGe(entryReq, 0.0025 ether, "Fuzz: mid entry below floor");
                assertLe(entryReq, 0.25 ether, "Fuzz: mid entry above cap");
            } else {
                assertGe(entryReq, 0.0035 ether, "Fuzz: mega entry below floor");
                assertLe(entryReq, 1 ether, "Fuzz: mega entry above cap");
            }
            assertGe(cycleId, 1, "Fuzz: cycleId < 1");
            assertGe(totalEntries, roundStart, "Fuzz: totalEntries < roundStart");
        }
        // Invalid types (3-255) are not tested here — P45 covers revert behavior
    }

    // ─── reEnroll edge cases ─────────────────────────────────────────────

    function testFuzz_reEnrollNeverGivesEntries(uint256 userSeed) public {
        address user = users[userSeed % NUM_USERS];

        // Transfer tokens from owner (no buy = no entries)
        uint256 amt = bound(userSeed, 1000 ether, 500_000 ether);
        token.transfer(user, amt);
        vm.roll(block.number + 1);

        // reEnroll
        token.reEnroll(user);

        // Must have 0 entries (entries only from buys)
        (, uint8 microEnt,, uint8 midEnt,, uint8 megaEnt) = token.getUserStatus(user);
        assertEq(microEnt, 0, "Fuzz: reEnroll gave micro entries");
        assertEq(midEnt, 0, "Fuzz: reEnroll gave mid entries");
        assertEq(megaEnt, 0, "Fuzz: reEnroll gave mega entries");
    }
}

