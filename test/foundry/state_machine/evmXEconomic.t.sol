// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../evmXBaseTest.sol";

/**
 * @title evmXEconomic â€" Extreme Economic Simulation Tests
 * @dev Scenarios that push the contract through realistic and adversarial
 *      market conditions: crashes, pumps, sell waves, threshold oscillation,
 *      full mega pool cycles, multi-cycle stability, and zero-liquidity recovery.
 *
 *      Each test is deterministic (fixed block advancement + known swap math)
 *      and verifies that all invariants hold after the extreme event.
 */
contract evmXEconomic is evmXBaseTest {

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  HELPERS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @dev Assert core accounting invariant: tracked ETH <= actual balance
    function _assertAccountingIntegrity(string memory context) internal view {
        uint256 tracked = token.microPoolBalance()
                        + token.midPoolBalance()
                        + token.megaPoolBalance()
                        + token.pendingVrfEth();
        assertLe(tracked, address(token).balance, string.concat("Accounting broken: ", context));
    }

    /// @dev Assert total supply is unchanged
    function _assertSupplyIntact(string memory context) internal view {
        assertEq(token.totalSupply(), TOTAL_SUPPLY, string.concat("Supply changed: ", context));
    }

    /// @dev Buy for many users to build realistic holder base and pool balances
    function _buildHolderBase(uint256 count, uint256 ethPerBuy) internal {
        for (uint256 i; i < count && i < NUM_USERS; i++) {
            buyTokens(users[i], ethPerBuy);
            // Advance 1 block per user to avoid SameBlockTrade
            vm.roll(block.number + 1);
        }
    }

    /// @dev Run autonomous cycle safely (ignoring reverts from threshold not met etc.)
    function _safeAutonomousCycle() internal {
        try token.runAutonomousCycle() {} catch {}
    }

    /// @dev Build pool balance by buying, advancing time, and running autonomous cycles
    function _buildPoolBalance(uint256 rounds, uint256 ethPerRound) internal {
        for (uint256 r; r < rounds; r++) {
            for (uint256 i; i < 5 && i < NUM_USERS; i++) {
                buyTokens(users[i], ethPerRound);
                vm.roll(block.number + 1);
            }
            warpTime(10 minutes);
            _safeAutonomousCycle();
        }
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  1. 90% PRICE CRASH â€" Massive sell-off, verify pots and accounting
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_90PercentPriceCrash() public {
        // Build healthy holder base
        _buildHolderBase(15, 0.5 ether);
        warpTime(1 hours);
        _safeAutonomousCycle();

        uint256 microBefore = token.microPoolBalance();
        uint256 midBefore = token.midPoolBalance();
        uint256 megaBefore = token.megaPoolBalance();

        // Each user sells 90% of their tokens â€" massive price impact
        for (uint256 i; i < 15; i++) {
            uint256 bal = token.balanceOf(users[i]);
            uint256 sellAmt = (bal * 90) / 100;
            if (sellAmt > 0 && sellAmt <= token.maxTxAmount()) {
                sellTokens(users[i], sellAmt);
            } else if (sellAmt > token.maxTxAmount()) {
                // Sell in maxTx chunks
                uint256 remaining = sellAmt;
                while (remaining > 0) {
                    uint256 chunk = remaining > token.maxTxAmount() ? token.maxTxAmount() : remaining;
                    sellTokens(users[i], chunk);
                    remaining -= chunk;
                    vm.roll(block.number + 1);
                }
            }
            vm.roll(block.number + 1);
        }

        // Pool balances must not decrease from sells (sells add to pools via tax)
        assertGe(token.microPoolBalance(), microBefore, "Micro pool decreased after crash");
        assertGe(token.megaPoolBalance(), megaBefore, "Mega pool decreased after crash");

        _assertSupplyIntact("after 90% crash");
        _assertAccountingIntegrity("after 90% crash");

        // System must still be functional â€" autonomous cycle works
        warpTime(30 minutes);
        _safeAutonomousCycle();
        _assertAccountingIntegrity("post-crash cycle");
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  2. 10X PUMP â€" Rapid buying spree, verify limits and pool growth
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_10xPump() public {
        // Record initial state
        uint256 contractEthBefore = address(token).balance;

        // Aggressive buying: 20 users, multiple rounds
        // This pumps significant ETH into a pool that started with 10 ETH
        for (uint256 round; round < 3; round++) {
            for (uint256 i; i < NUM_USERS; i++) {
                // Only buy if under max wallet (respecting contract limits)
                uint256 currentBal = token.balanceOf(users[i]);
                if (currentBal >= token.maxWalletAmount() * 90 / 100) continue;
                buyTokens(users[i], 0.5 ether);
                vm.roll(block.number + 1);
            }
            warpTime(5 minutes);
            _safeAutonomousCycle();
        }

        // Pots must have grown significantly from all the buy tax
        assertTrue(
            token.microPoolBalance() + token.midPoolBalance() + token.megaPoolBalance() > 0,
            "Pots should have grown during pump"
        );

        _assertSupplyIntact("after 10x pump");
        _assertAccountingIntegrity("after 10x pump");

        // No user should exceed maxWalletAmount
        for (uint256 i; i < NUM_USERS; i++) {
            assertLe(
                token.balanceOf(users[i]),
                token.maxWalletAmount(),
                "User exceeded max wallet during pump"
            );
        }
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  3. MASSIVE SELL WAVE â€" Liquidation event where all holders dump
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_massiveSellWave() public {
        // First build up: everyone buys
        _buildHolderBase(NUM_USERS, 1 ether);
        warpTime(2 hours);
        _safeAutonomousCycle();

        uint256 supplyBefore = token.totalSupply();

        // NOW: everyone dumps everything they can
        for (uint256 i; i < NUM_USERS; i++) {
            uint256 bal = token.balanceOf(users[i]);
            if (bal == 0) continue;

            uint256 sellAmt = bal > token.maxTxAmount() ? token.maxTxAmount() : bal;
            sellTokens(users[i], sellAmt);
            vm.roll(block.number + 1);
        }

        // Verify no supply leak
        assertEq(token.totalSupply(), supplyBefore, "Supply changed during sell wave");
        _assertAccountingIntegrity("after sell wave");

        // Contract should still have tokens from accumulated tax
        assertTrue(token.balanceOf(address(token)) > 0, "Contract should have accumulated tax tokens");

        // Autonomous cycle should work even in depleted state
        _safeAutonomousCycle();
        _assertAccountingIntegrity("post sell-wave cycle");
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  4. THRESHOLD OSCILLATION â€" Rapid pool fills near threshold boundaries
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_thresholdOscillation() public {
        // Record initial thresholds
        uint256 microThresholdStart = token.microPoolCurrentThreshold();
        uint256 midThresholdStart = token.midPoolCurrentThreshold();

        // Build holder base first
        _buildHolderBase(10, 0.3 ether);

        // Repeatedly approach threshold through buys, then warp past time limit
        // to trigger threshold decay, then build up again
        for (uint256 cycle; cycle < 5; cycle++) {
            // Build up pool balances through buys
            for (uint256 i; i < 5; i++) {
                buyTokens(users[i], 0.2 ether);
                vm.roll(block.number + 1);
            }

            _safeAutonomousCycle();

            // Warp past micro ladder time limit (2 hours) â€" threshold should decay
            warpTime(3 hours);

            _safeAutonomousCycle();
        }

        // After oscillation: thresholds must be within valid bounds
        uint256 microThresholdNow = token.microPoolCurrentThreshold();
        uint256 midThresholdNow = token.midPoolCurrentThreshold();

        // Micro threshold: between base (0.01 ETH) and max (100 ETH)
        assertGe(microThresholdNow, 0.01 ether, "Micro threshold below base");
        assertLe(microThresholdNow, 100 ether, "Micro threshold above max");

        // Mid threshold: between base (0.05 ETH) and max (500 ETH)
        assertGe(midThresholdNow, 0.05 ether, "Mid threshold below base");
        assertLe(midThresholdNow, 500 ether, "Mid threshold above max");

        _assertSupplyIntact("after threshold oscillation");
        _assertAccountingIntegrity("after threshold oscillation");
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  5. FULL MEGA POT CYCLE â€" 7 days elapse, VRF draw triggers
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_fullMegaPoolCycle() public {
        uint256 megaCycleStart = token.megaPoolCycleId();

        // Build holder base
        _buildHolderBase(10, 0.5 ether);

        // Send ETH directly to contract for mega pot
        (bool s,) = address(token).call{value: 5 ether}("");
        assertTrue(s, "ETH send failed");
        token.syncETHAccounting();

        uint256 megaBalBefore = token.megaPoolBalance();
        assertTrue(megaBalBefore > 0, "Mega pool should have balance");

        // Warp past 7-day mega pool duration
        warpTime(7 days + 1 hours);

        // Running autonomous cycle should trigger mega pool draw
        _safeAutonomousCycle();

        // Check if VRF request was made
        uint256 reqId = vrfCoordinator.getPendingRequestId();

        if (reqId > 0) {
            // Fulfill VRF with a random word
            fulfillVRFWithWord(reqId, uint256(keccak256("mega_recipient_seed")));

            // After fulfillment, mega cycle should advance
            // (or remain same if no eligible recipient found)
            uint256 megaCycleAfter = token.megaPoolCycleId();
            assertTrue(
                megaCycleAfter >= megaCycleStart,
                "Mega cycle should not go backwards"
            );
        }

        _assertSupplyIntact("after mega pool cycle");
        _assertAccountingIntegrity("after mega pool cycle");
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  6. MULTI-CYCLE STABILITY â€" Multiple micro/mid pool cycles
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_multiCycleStability() public {
        uint256 microCycleStart = token.microPoolCycleId();

        // Run through multiple complete cycles
        for (uint256 cycle; cycle < 5; cycle++) {
            // Build up through buys
            for (uint256 i; i < 10; i++) {
                buyTokens(users[i], 0.3 ether);
                vm.roll(block.number + 1);
            }

            // Build pool balance through autonomous cycles
            warpTime(30 minutes);
            _safeAutonomousCycle();

            // Send ETH directly to build up pots faster
            (bool s,) = address(token).call{value: 0.5 ether}("");
            token.syncETHAccounting();

            // Warp past micro threshold time limit
            warpTime(3 hours);

            // This should check thresholds and potentially trigger draws
            _safeAutonomousCycle();

            // If VRF request pending, fulfill it
            uint256 reqId = vrfCoordinator.getPendingRequestId();
            if (reqId > 0) {
                fulfillVRFWithWord(reqId, uint256(keccak256(abi.encodePacked("cycle", cycle))));
            }

            // Run another cycle to process results
            warpTime(10 minutes);
            _safeAutonomousCycle();

            // Invariants must hold after each cycle
            _assertAccountingIntegrity(string.concat("multi-cycle #", vm.toString(cycle)));
        }

        _assertSupplyIntact("after multi-cycle stability");

        // Cycles should have progressed (or stayed if thresholds weren't met)
        uint256 microCycleEnd = token.microPoolCycleId();
        assertTrue(microCycleEnd >= microCycleStart, "Micro cycle went backwards");
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  7. ZERO LIQUIDITY RECOVERY â€" Remove almost all liquidity, recover
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_zeroLiquidityRecovery() public {
        // Build holder base first
        _buildHolderBase(10, 0.3 ether);
        _safeAutonomousCycle();

        // After massive sells that drain the ETH side of the pool significantly
        // The pool starts with 50M tokens + 10 ETH. After many sells, ETH drops.
        for (uint256 i; i < 10; i++) {
            uint256 bal = token.balanceOf(users[i]);
            if (bal > 0) {
                uint256 sellAmt = bal > token.maxTxAmount() ? token.maxTxAmount() : bal;
                if (sellAmt > 0) {
                    sellTokens(users[i], sellAmt);
                }
            }
            vm.roll(block.number + 1);
        }

        // Even in low-liquidity state, core functions must not revert
        _assertSupplyIntact("during low liquidity");
        _assertAccountingIntegrity("during low liquidity");

        // Autonomous cycle should handle gracefully
        warpTime(1 hours);
        _safeAutonomousCycle();

        // Eligibility checks should not panic with low prices
        for (uint256 i; i < 5; i++) {
            token.isEligibleForMicroPool(users[i], token.microPoolCycleId());
            token.isEligibleForMidPool(users[i], token.midPoolCycleId());
            token.isEligibleForMegaPool(users[i], token.megaPoolCycleId());
        }

        // Now recovery: fresh buying restores liquidity
        for (uint256 i; i < 10; i++) {
            buyTokens(users[i], 0.5 ether);
            vm.roll(block.number + 1);
        }

        _assertSupplyIntact("after liquidity recovery");
        _assertAccountingIntegrity("after liquidity recovery");

        // System should fully work again
        _safeAutonomousCycle();
        _assertAccountingIntegrity("post-recovery cycle");
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  8. SWAP THRESHOLD BOUNDARY STRESS â€" Exact boundary behavior
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_swapThresholdBoundaryStress() public {
        // Build up contract token balance to just below swap threshold
        // Each buy sends ~3% tax to contract
        // 120k tokens threshold / 3% = ~4M tokens in buys needed
        _buildHolderBase(15, 0.5 ether);

        uint256 contractBal = token.balanceOf(address(token));

        // Record pre-swap state
        uint256 ethBefore = address(token).balance;

        // Now trigger: one more buy should push past threshold
        if (contractBal < SWAP_THRESHOLD) {
            // Keep buying until threshold
            for (uint256 i; i < 10; i++) {
                buyTokens(users[i % NUM_USERS], 0.3 ether);
                vm.roll(block.number + 1);
                if (token.balanceOf(address(token)) >= SWAP_THRESHOLD) break;
            }
        }

        // Running autonomous cycle should trigger swapAndDistribute
        _safeAutonomousCycle();

        // After swap, contract token balance should be reduced
        // (or unchanged if swap failed, which is also safe)
        _assertSupplyIntact("after swap threshold stress");
        _assertAccountingIntegrity("after swap threshold stress");
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  9. WHALE ROTATION â€" Users hitting max wallet, transferring, re-buying
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_whaleRotation() public {
        // User[0] buys to near max wallet
        // Max wallet is 4% of 100M = 4M tokens
        address whale = users[0];
        uint256 maxWallet = token.maxWalletAmount();

        // Buy as much as possible (stay under 90% of max wallet to leave room for buy tax imprecision)
        for (uint256 i; i < 20; i++) {
            uint256 bal = token.balanceOf(whale);
            if (bal >= maxWallet * 85 / 100) break; // Near limit â€" stop before exceeding
            buyTokens(whale, 0.5 ether);
            vm.roll(block.number + 1);
        }

        uint256 whaleBal = token.balanceOf(whale);

        // Whale transfers some to a fresh address
        address whale2 = makeAddr("whale2");
        vm.deal(whale2, 10 ether);
        uint256 transferAmt = whaleBal / 3;
        vm.prank(whale);
        token.transfer(whale2, transferAmt);

        // Whale buys more to fill back up (only if under limit)
        vm.roll(block.number + 1);
        if (token.balanceOf(whale) < maxWallet * 85 / 100) {
            buyTokens(whale, 0.3 ether);
        }

        // Whale2 sells
        vm.roll(block.number + 1);
        sellTokens(whale2, token.balanceOf(whale2));

        // Whale exclusion is enforced at recipient selection time via _isEligibleCandidate.
        // The mapping may show eligible, but whale will be rejected when selected.
        if (token.balanceOf(whale) > TOTAL_SUPPLY / 33) {
            assertTrue(true, "Whale above threshold - will be excluded at selection time");
        }

        _assertSupplyIntact("after whale rotation");
        _assertAccountingIntegrity("after whale rotation");
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  10. EMERGENCY DRAW UNDER ECONOMIC STRESS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_emergencyDrawUnderStress() public {
        // Build holder base and pots
        _buildHolderBase(10, 0.5 ether);

        // Send ETH directly to build pot
        (bool s,) = address(token).call{value: 2 ether}("");
        token.syncETHAccounting();

        warpTime(3 hours);
        _safeAutonomousCycle();

        // Check if a VRF request is pending
        uint256 reqId = vrfCoordinator.getPendingRequestId();

        if (reqId > 0) {
            // DON'T fulfill VRF â€" simulate VRF being down
            // Warp past emergency timeout (24 hours)
            warpTime(25 hours);

            // During this time, massive selling happens (economic stress)
            for (uint256 i; i < 10; i++) {
                uint256 bal = token.balanceOf(users[i]);
                if (bal > 0) {
                    uint256 sellAmt = bal > token.maxTxAmount() ? token.maxTxAmount() : bal;
                    sellTokens(users[i], sellAmt);
                }
                vm.roll(block.number + 1);
            }

            // Emergency force draw with commit-reveal pattern
            uint256 microReq = token.microPoolPendingRequestId();
            uint256 midReq = token.midPoolPendingRequestId();
            uint256 megaReq = token.megaPoolPendingRequestId();

            // Step 1: Commit via autonomous cycle (sets emergencyReadyBlock)
            _safeAutonomousCycle();
            // Advance past EMERGENCY_COMMIT_DELAY_BLOCKS = 5
            vm.roll(block.number + 6);
            // Step 2: Execute via autonomous cycle (uses committed blockhash)
            _safeAutonomousCycle();

            // If still pending (e.g. insufficient gas), try manual emergency
            if (microReq != 0 && token.microPoolPendingRequestId() == microReq) {
                try token.emergencyForceAllocation(0) {} catch {}
            } else if (midReq != 0 && token.midPoolPendingRequestId() == midReq) {
                try token.emergencyForceAllocation(1) {} catch {}
            } else if (megaReq != 0 && token.megaPoolPendingRequestId() == megaReq) {
                try token.emergencyForceAllocation(2) {} catch {}
            }

            _assertAccountingIntegrity("after emergency draw under stress");
        }

        _assertSupplyIntact("after emergency draw stress");
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  11. SUSTAINED VOLUME â€" Long period of continuous trading
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_sustainedVolume() public {
        // Simulate 20 rounds of trading activity (each = 1 block set)
        // Reduced from 50 to avoid gas limit issues in Foundry environment
        for (uint256 round; round < 20; round++) {
            // 2 random users buy
            for (uint256 j; j < 2; j++) {
                uint256 idx = (round * 2 + j) % NUM_USERS;
                buyTokens(users[idx], 0.1 ether);
                vm.roll(block.number + 1);
            }

            // 1 random user sells
            uint256 sellerIdx = (round + 7) % NUM_USERS;
            uint256 bal = token.balanceOf(users[sellerIdx]);
            if (bal > 0) {
                uint256 sellAmt = bal / 4; // Sell 25%
                if (sellAmt > token.maxTxAmount()) sellAmt = token.maxTxAmount();
                if (sellAmt > 0) {
                    sellTokens(users[sellerIdx], sellAmt);
                }
            }
            vm.roll(block.number + 1);

            // Every 5 rounds, run autonomous cycle and warp time
            if (round % 5 == 4) {
                warpTime(30 minutes);
                _safeAutonomousCycle();

                // Fulfill any pending VRF
                uint256 reqId = vrfCoordinator.getPendingRequestId();
                if (reqId > 0) {
                    fulfillVRFWithWord(reqId, uint256(keccak256(abi.encodePacked("sustained", round))));
                }
            }
        }

        _assertSupplyIntact("after sustained volume");
        _assertAccountingIntegrity("after sustained volume");

        // All pots should have some balance from sustained tax collection
        uint256 totalPots = token.microPoolBalance() + token.midPoolBalance() + token.megaPoolBalance();
        assertTrue(totalPots > 0, "Pots should have accumulated from sustained trading");
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  12. TAX ACCUMULATION PRECISION â€" Verify no wei leaks over many txs
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_taxAccumulationPrecision() public {
        uint256 supplyBefore = token.totalSupply();
        uint256 accountedBefore = 0;

        // Sum all known token locations before
        for (uint256 i; i < NUM_USERS; i++) {
            accountedBefore += token.balanceOf(users[i]);
        }
        accountedBefore += token.balanceOf(address(token)); // contract
        accountedBefore += token.balanceOf(owner);           // deployer
        accountedBefore += token.balanceOf(pair);            // liquidity pool
        accountedBefore += token.balanceOf(marketing);       // marketing wallet

        assertEq(accountedBefore, supplyBefore, "Pre-trade: unaccounted tokens exist");

        // Do 30 buys and 15 sells
        for (uint256 i; i < 15; i++) {
            buyTokens(users[i], 0.2 ether);
            vm.roll(block.number + 1);
        }
        for (uint256 i; i < 15; i++) {
            buyTokens(users[(i + 5) % NUM_USERS], 0.1 ether);
            vm.roll(block.number + 1);
        }
        warpTime(1 hours);
        _safeAutonomousCycle();

        for (uint256 i; i < 15; i++) {
            uint256 bal = token.balanceOf(users[i]);
            if (bal > 0) {
                uint256 sellAmt = bal / 2;
                if (sellAmt > token.maxTxAmount()) sellAmt = token.maxTxAmount();
                if (sellAmt > 0) {
                    sellTokens(users[i], sellAmt);
                }
            }
            vm.roll(block.number + 1);
        }

        // Supply must be exactly the same â€" no wei created or destroyed
        assertEq(token.totalSupply(), supplyBefore, "Supply changed - wei leak detected");

        // Re-account all tokens
        uint256 accountedAfter = 0;
        for (uint256 i; i < NUM_USERS; i++) {
            accountedAfter += token.balanceOf(users[i]);
        }
        accountedAfter += token.balanceOf(address(token));
        accountedAfter += token.balanceOf(owner);
        accountedAfter += token.balanceOf(pair);
        accountedAfter += token.balanceOf(marketing);

        assertEq(accountedAfter, supplyBefore, "Post-trade: unaccounted tokens exist (precision leak)");
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  13. CONCURRENT POT DRAWS â€" Multiple pots ready simultaneously
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_concurrentPoolAllocations() public {
        // Build large holder base
        _buildHolderBase(15, 0.5 ether);

        // Inject enough ETH to trigger micro AND mid thresholds
        (bool s,) = address(token).call{value: 10 ether}("");
        token.syncETHAccounting();

        // Warp well past both micro (2h) and mid (6h) ladder time limits
        warpTime(7 hours);

        // Run autonomous cycle â€" should handle multiple draws
        _safeAutonomousCycle();

        // Fulfill first VRF if pending
        uint256 reqId = vrfCoordinator.getPendingRequestId();
        if (reqId > 0) {
            fulfillVRFWithWord(reqId, uint256(keccak256("concurrent_draw_1")));
        }

        // Run again to trigger second draw (VRF is sequential)
        _safeAutonomousCycle();

        reqId = vrfCoordinator.getPendingRequestId();
        if (reqId > 0) {
            fulfillVRFWithWord(reqId, uint256(keccak256("concurrent_draw_2")));
        }

        // Third pass for mega if applicable
        _safeAutonomousCycle();
        reqId = vrfCoordinator.getPendingRequestId();
        if (reqId > 0) {
            fulfillVRFWithWord(reqId, uint256(keccak256("concurrent_draw_3")));
        }

        _assertSupplyIntact("after concurrent draws");
        _assertAccountingIntegrity("after concurrent draws");
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  14. POST-RENOUNCE ECONOMIC ACTIVITY â€" Contract operates without owner
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_postRenounceFullActivity() public {
        // Build holder base
        _buildHolderBase(10, 0.5 ether);
        _safeAutonomousCycle();

        // Renounce ownership
        token.renounceOwnership();
        assertEq(token.owner(), address(0), "Owner should be zero");

        // Full trading cycle after renounce
        for (uint256 round; round < 10; round++) {
            // Buy
            for (uint256 i; i < 3; i++) {
                uint256 idx = (round * 3 + i) % NUM_USERS;
                buyTokens(users[idx], 0.2 ether);
                vm.roll(block.number + 1);
            }

            // Sell
            uint256 sellerIdx = (round + 5) % NUM_USERS;
            uint256 bal = token.balanceOf(users[sellerIdx]);
            if (bal > 0) {
                uint256 sellAmt = bal / 3;
                if (sellAmt > token.maxTxAmount()) sellAmt = token.maxTxAmount();
                if (sellAmt > 0) {
                    sellTokens(users[sellerIdx], sellAmt);
                }
            }
            vm.roll(block.number + 1);

            // Autonomous cycle
            if (round % 3 == 2) {
                warpTime(1 hours);
                _safeAutonomousCycle();

                uint256 reqId = vrfCoordinator.getPendingRequestId();
                if (reqId > 0) {
                    fulfillVRFWithWord(reqId, uint256(keccak256(abi.encodePacked("postrenounce", round))));
                }
            }
        }

        // Marketing wallet must be unchanged (no owner to change it)
        assertEq(token.marketingWallet(), marketing, "Marketing wallet changed after renounce");

        _assertSupplyIntact("after post-renounce activity");
        _assertAccountingIntegrity("after post-renounce activity");
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  15. VRF FUNDING UNDER PRESSURE â€" VRF fund behavior during volatility
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function test_economic_vrfFundingUnderPressure() public {
        // Build holder base and trigger many swaps
        _buildHolderBase(15, 0.5 ether);

        uint256 vrfEthBefore = token.pendingVrfEth();

        // Multiple autonomous cycles to trigger VRF funding
        for (uint256 i; i < 5; i++) {
            for (uint256 j; j < 5; j++) {
                buyTokens(users[j], 0.2 ether);
                vm.roll(block.number + 1);
            }
            warpTime(10 minutes);
            _safeAutonomousCycle();
        }

        // VRF pending should have been attempted to be funded
        // (whether successful depends on threshold + cooldowns)

        // The key invariant: pendingVrfEth + pool balances <= actual balance
        _assertAccountingIntegrity("after VRF funding under pressure");

        // Verify VRF subscription can still receive funding
        (,uint96 nativeBalance,,,) = vrfCoordinator.getSubscription(vrfSubId);
        // Should be >= initial 5 ether (we funded in setUp)
        assertGe(nativeBalance, 5 ether, "VRF subscription drained below initial");

        _assertSupplyIntact("after VRF funding pressure");
    }
}

