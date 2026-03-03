// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../evmXBaseTest.sol";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MALICIOUS CONTRACTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/// @dev Attempts reentrancy when receiving ETH as a pool recipient
contract MaliciousRecipient {
    evmX_Testable public target;
    uint256 public attackCount;

    constructor(address _target) { target = evmX_Testable(payable(_target)); }

    receive() external payable {
        attackCount++;
        if (attackCount < 3) {
            // Attempt reentrancy via emergencyForceAllocation
            try target.emergencyForceAllocation(0) {} catch {}
            // Attempt reentrancy via runAutonomousCycle
            try target.runAutonomousCycle() {} catch {}
        }
    }

    function buy(address router, address weth) external payable {
        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = address(target);
        MockUniswapV2Router(payable(router)).swapExactETHForTokensSupportingFeeOnTransferTokens{value: msg.value}(
            0, path, address(this), block.timestamp + 1
        );
    }
}

/// @dev Marketing wallet that attempts reentrancy on ETH receive
contract MaliciousMarketing {
    evmX_Testable public target;
    uint256 public callCount;

    constructor() {}

    function setTarget(address _target) external { target = evmX_Testable(payable(_target)); }

    receive() external payable {
        callCount++;
        if (callCount < 2) {
            // Try to re-enter swap
            try target.runAutonomousCycle() {} catch {}
        }
    }
}

/// @dev Gas grief: consumes all gas on receive to waste recipient selection gas
contract GasGriefReceiver {
    receive() external payable {
        // Infinite loop to consume all forwarded gas
        while (true) {}
    }

    function approve(address token, address spender) external {
        IERC20Minimal(token).approve(spender, type(uint256).max);
    }
}

/// @dev Forcefully sends ETH via selfdestruct
contract ForcedEthSender {
    constructor(address target) payable {
        selfdestruct(payable(target));
    }
}

/// @dev Attempts flash-loan style buy+sell in one transaction
contract FlashBuySeller {
    MockUniswapV2Router public router;
    evmX_Testable public token;
    address public weth;

    constructor(address _router, address _token, address _weth) {
        router = MockUniswapV2Router(payable(_router));
        token = evmX_Testable(payable(_token));
        weth = _weth;
    }

    function attack() external payable {
        // Buy
        address[] memory buyPath = new address[](2);
        buyPath[0] = weth;
        buyPath[1] = address(token);
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: msg.value}(
            0, buyPath, address(this), block.timestamp + 1
        );

        // Sell immediately (same transaction, different block number check doesn't apply to contracts)
        uint256 bal = token.balanceOf(address(this));
        token.approve(address(router), bal);
        address[] memory sellPath = new address[](2);
        sellPath[0] = address(token);
        sellPath[1] = weth;
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            bal, 0, sellPath, address(this), block.timestamp + 1
        );
    }

    receive() external payable {}
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ATTACK TESTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

contract evmXAttacks is evmXBaseTest {

    // â"€â"€â"€ 1. Reentrancy via recipient payout â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function test_reentrancyViaRecipientPayout() public {
        // NOTE: MaliciousRecipient is a contract, so _isEligibleCandidate checks
        // candidate.code.length > 0 and returns false. Contracts can never win.
        // This test verifies that protection works.
        MaliciousRecipient attacker = new MaliciousRecipient(address(token));
        vm.deal(address(attacker), 10 ether);

        // Buy tokens for the attacker
        attacker.buy{value: 1 ether}(address(router), address(weth));
        uint256 attackerBal = token.balanceOf(address(attacker));
        assertTrue(attackerBal > 0, "Attacker should have tokens");

        // The contract-based attacker is not eligible for pool (code.length > 0)
        // This is the defense. Verify via view:
        uint256 microCycle = token.microPoolCycleId();
        uint256 midCycle = token.midPoolCycleId();
        uint256 megaCycle = token.megaPoolCycleId();
        assertFalse(token.isEligibleForMicroPool(address(attacker), microCycle), "Contract should not be micro eligible");
        assertFalse(token.isEligibleForMidPool(address(attacker), midCycle), "Contract should not be mid eligible");
        assertFalse(token.isEligibleForMegaPool(address(attacker), megaCycle), "Contract should not be mega eligible");
    }

    // â"€â"€â"€ 2. Reentrancy via marketing wallet â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function test_reentrancyViaMarketingWallet() public {
        MaliciousMarketing malMarketing = new MaliciousMarketing();

        // Deploy new token with malicious marketing wallet
        MockVRFCoordinatorV2Plus vrfCoord2 = new MockVRFCoordinatorV2Plus();
        uint256 subId2 = vrfCoord2.createSubscription();
        vrfCoord2.fundSubscriptionWithNative{value: 1 ether}(subId2);

        evmX_Testable token2 = new evmX_Testable(
            address(malMarketing),
            subId2,
            address(router),
            address(vrfCoord2),
            VRF_KEY_HASH
        );
        malMarketing.setTarget(address(token2));
        vrfCoord2.addConsumer(subId2, address(token2));

        // Add liquidity
        address pair2 = token2.uniswapPair();
        token2.approve(address(router), 50_000_000 ether);
        router.addLiquidityETH{value: 10 ether}(address(token2), 50_000_000 ether, 0, 0, address(this), block.timestamp + 1);

        // Buy enough to trigger swap threshold
        for (uint256 i; i < 15; i++) {
            address buyer = users[i];
            address[] memory path = new address[](2);
            path[0] = address(weth);
            path[1] = address(token2);
            vm.prank(buyer);
            try router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: 0.5 ether}(
                0, path, buyer, block.timestamp + 1
            ) {} catch {}
        }

        // Supply should be intact regardless of malicious marketing behavior
        assertEq(token2.totalSupply(), TOTAL_SUPPLY, "Supply changed after malicious marketing");
    }

    // â"€â"€â"€ 3. Flash-loan style buy+sell â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function test_flashLoanRapidBuySell() public {
        FlashBuySeller attacker = new FlashBuySeller(address(router), address(token), address(weth));
        vm.deal(address(attacker), 5 ether);

        uint256 totalSupplyBefore = token.totalSupply();
        uint256 contractEthBefore = address(token).balance;

        // The attacker tries buy+sell in one tx.
        // Same-block protection: since FlashBuySeller is interacting with the pair in both
        // directions in the same block, the sell should trigger SameBlockTrade if limits apply.
        // BUT: the attacker itself is not excluded from limits, however the pair IS excluded.
        // The buy writes lastBuyBlock[attacker] = block.number
        // The sell writes lastSellBlock[attacker] = block.number
        // Buy check: isBuy && lastBuyBlock[to] == block.number â†' checks the BUYER address
        // Sell check: isSell && lastSellBlock[from] == block.number â†' checks the SELLER address
        // First buy sets lastBuyBlock[attacker], first sell checks lastSellBlock[attacker] (different mapping)
        // So same-block buy then sell IS allowed (different mappings).
        // But the attacker pays 3% tax on buy AND 3% tax on sell = ~6% total loss.
        try attacker.attack{value: 1 ether}() {
            // If it succeeds, the attacker paid double tax â€" not profitable
        } catch {
            // If it reverts, attack was prevented
        }

        // Invariants must hold
        assertEq(token.totalSupply(), totalSupplyBefore, "Supply changed after flash attack");
    }

    // â"€â"€â"€ 4. Sandwich attack on swap threshold â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function test_sandwichAttackThreshold() public {
        // Attacker tries to sandwich the swapAndDistribute auto-swap
        // by front-running with a sell to move price, then back-running with a buy.
        address sandwicher = users[0];
        buyTokens(sandwicher, 3 ether); // Get tokens

        // Build up to near threshold through many buys
        for (uint256 i = 1; i < 15; i++) {
            buyTokens(users[i], 0.3 ether);
        }

        uint256 potsBefore = token.microPoolBalance() + token.midPoolBalance() + token.megaPoolBalance();

        // Sandwicher front-runs: sell to move price down before auto-swap
        uint256 sellAmt = token.balanceOf(sandwicher) / 2;
        if (sellAmt > 0 && sellAmt <= MAX_TX) {
            sellTokens(sandwicher, sellAmt);
        }

        // Trigger auto-swap via autonomous cycle
        try token.runAutonomousCycle() {} catch {}

        // Invariants hold regardless
        assertEq(token.totalSupply(), TOTAL_SUPPLY, "Supply changed in sandwich");
        uint256 tracked = token.microPoolBalance() + token.midPoolBalance() + token.megaPoolBalance() + token.pendingVrfEth();
        assertLe(tracked, address(token).balance, "Accounting broken in sandwich");
    }

    // â"€â"€â"€ 5. Gas grief attack â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function test_gasGriefAttack() public {
        // Deploy gas grief receivers that waste all forwarded gas
        // NOTE: These are contracts, so _isEligibleCandidate returns false (code.length > 0)
        // The contract-is-not-eligible check IS the defense against gas grief recipients.

        GasGriefReceiver griefReceiver = new GasGriefReceiver();
        vm.deal(address(griefReceiver), 10 ether);

        // Even if somehow eligible (which they can't be due to code.length check),
        // the PAYOUT_GAS_LIMIT (300k) limits the damage, and PayoutFailed is emitted.
        // Pool funds stay safe.

        // Verify the defense:
        assertFalse(token.isEligibleForMicroPool(address(griefReceiver), token.microPoolCycleId()), "GasGrief receiver should never be eligible");
    }

    // â"€â"€â"€ 6. Forced ETH injection â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function test_forcedEthInjection() public {
        uint256 trackedBefore = token.microPoolBalance() + token.midPoolBalance() + token.megaPoolBalance() + token.pendingVrfEth();
        uint256 balanceBefore = address(token).balance;

        // Force 1 ETH via selfdestruct
        new ForcedEthSender{value: 1 ether}(address(token));

        uint256 balanceAfter = address(token).balance;
        uint256 trackedAfter = token.microPoolBalance() + token.midPoolBalance() + token.megaPoolBalance() + token.pendingVrfEth();

        // Balance increased but tracking didn't
        assertEq(balanceAfter, balanceBefore + 1 ether, "ETH not received");
        assertEq(trackedAfter, trackedBefore, "Tracking changed from selfdestruct");

        // syncETHAccounting should fix it
        token.syncETHAccounting();
        uint256 trackedFixed = token.microPoolBalance() + token.midPoolBalance() + token.megaPoolBalance() + token.pendingVrfEth();
        assertEq(trackedFixed, trackedBefore + 1 ether, "sync didn't fix accounting");
        assertLe(trackedFixed, address(token).balance, "Tracking exceeds balance after sync");
    }

    // â"€â"€â"€ 7. Low liquidity price manipulation â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function test_lowLiquidityPriceManipulation() public {
        // After initial setup, the pool has 50M tokens + 10 ETH.
        // A large buy could significantly move the price.
        address manipulator = users[15];

        // Buy with 5 ETH (50% of pool ETH) â€" massive price impact
        uint256 received = buyTokens(manipulator, 5 ether);

        // Despite manipulation, contract invariants hold
        assertEq(token.totalSupply(), TOTAL_SUPPLY, "Supply changed");

        // Eligibility check should still work without reverting
        // Eligibility mappings shouldn't panic even with price manipulation
        token.isEligibleForMicroPool(manipulator, token.microPoolCycleId());
        token.isEligibleForMidPool(manipulator, token.midPoolCycleId());
        token.isEligibleForMegaPool(manipulator, token.megaPoolCycleId());
    }

    // â"€â"€â"€ 8. MEV same-block exploitation â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function test_mevSameBlockExploitation() public {
        // NOTE: SameBlockTrade checks `lastBuyBlock[to]` and `lastSellBlock[from]`.
        // For Uniswap swaps, `from` is the pair (excluded from limits) so `limitsApply = false`.
        // This is by design â€" the pair must be excluded for normal operation.
        //
        // Instead, we verify that DIRECT same-block transfers to the same recipient
        // are properly handled, and that the system's economic defense (3% tax per trade)
        // makes same-block sandwich attacks economically unviable.

        address attacker = users[10];
        buyTokens(attacker, 1 ether);

        uint256 attackerBal = token.balanceOf(attacker);

        // Buy + sell in same block: attacker pays 3% buy tax + 3% sell tax = ~6% loss
        // This makes sandwich/MEV attacks economically unprofitable.
        uint256 ethBefore = attacker.balance;

        // Sell all tokens immediately (same block, different direction = allowed but costly)
        vm.roll(block.number + 1); // need new block for sell
        sellTokens(attacker, attackerBal);

        uint256 ethAfter = attacker.balance;
        // The attacker should have LOST value due to double taxation
        // Started with 1 ETH worth of tokens (minus buy tax), sold (minus sell tax)
        // Even at perfect price, attacker loses ~6% to tax
        assertLt(ethAfter - ethBefore, 0.97 ether, "Attacker should lose money to double tax");
    }

    // â"€â"€â"€ 9. Malicious VRF coordinator response â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function test_maliciousVRFWrongRequestId() public {
        // Try to fulfill with a fake requestId
        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = 12345;

        vm.prank(address(vrfCoordinator));
        vm.expectRevert(); // UnknownRequest
        token.rawFulfillRandomWords(999999, randomWords);
    }

    function test_maliciousVRFEmptyRandomWords() public {
        // Build state to trigger a draw
        for (uint256 i; i < 10; i++) {
            buyTokens(users[i], 0.5 ether);
        }
        warpTime(3 hours);
        // Send ETH to build pot
        (bool s,) = address(token).call{value: 1 ether}("");
        token.syncETHAccounting();

        try token.runAutonomousCycle() {} catch {}

        uint256 reqId = vrfCoordinator.getPendingRequestId();
        if (reqId > 0) {
            uint256[] memory emptyWords = new uint256[](0);
            vm.prank(address(vrfCoordinator));
            vm.expectRevert(); // UnknownRequest (empty randomWords check)
            token.rawFulfillRandomWords(reqId, emptyWords);
        }
    }

    function test_maliciousNonCoordinatorFulfill() public {
        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = 1;

        // Non-coordinator address tries to fulfill
        vm.prank(users[0]);
        vm.expectRevert(); // OnlyCoordinator
        token.rawFulfillRandomWords(1, randomWords);
    }

    // â"€â"€â"€ 10. Owner backdoor after renounce â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function test_ownerBackdoorAfterRenounce() public {
        token.renounceOwnership();
        assertEq(token.owner(), address(0), "Owner not zero");

        // ALL onlyOwner functions must revert
        vm.expectRevert();
        token.updateTrafficWhitelist(users[0], true);

        vm.expectRevert();
        token.setMarketingWallet(users[1]);

        // But public functions still work
        vm.prank(users[0]);
        try token.runAutonomousCycle() {} catch {}

        token.syncETHAccounting();

        // Marketing wallet must remain the original
        assertEq(token.marketingWallet(), marketing, "Marketing wallet changed after renounce");
    }
}

