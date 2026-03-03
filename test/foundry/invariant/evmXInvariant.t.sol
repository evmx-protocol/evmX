// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../evmXBaseTest.sol";
import "./evmXHandler.sol";

/**
 * @title evmXInvariant
 * @dev Invariant tests that must ALWAYS hold regardless of operation sequence.
 *      Uses Foundry's invariant engine with a stateful handler.
 */
contract evmXInvariant is evmXBaseTest {
    evmXHandler public handler;

    function setUp() public override {
        super.setUp();

        // Fund actors
        for (uint256 i; i < users.length; i++) {
            vm.deal(users[i], 100 ether);
        }

        handler = new evmXHandler(
            address(token),
            address(router),
            address(vrfCoordinator),
            address(weth),
            users
        );
        vm.deal(address(handler), 500 ether);

        // Seed some users with tokens via buys
        for (uint256 i; i < 10; i++) {
            buyTokens(users[i], 0.5 ether);
        }

        // Target only the handler
        targetContract(address(handler));
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // INVARIANTS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @dev Total supply must NEVER change after deployment
    function invariant_totalSupplyNeverChanges() public view {
        assertEq(token.totalSupply(), TOTAL_SUPPLY, "INVARIANT: totalSupply changed");
    }

    /// @dev Tracked ETH (pots + pendingVrf) must never exceed contract balance
    function invariant_ethAccountingLteBalance() public view {
        uint256 tracked = token.microPoolBalance() + token.midPoolBalance() +
                          token.megaPoolBalance() + token.pendingVrfEth();
        uint256 actual = address(token).balance;
        assertLe(tracked, actual, "INVARIANT: tracked ETH > actual balance");
    }

    /// @dev Sum of pot balances must be <= contract balance
    function invariant_sumOfPotsLteBalance() public view {
        uint256 potSum = token.microPoolBalance() + token.midPoolBalance() + token.megaPoolBalance();
        assertLe(potSum, address(token).balance, "INVARIANT: pot sum > balance");
    }

    /// @dev Cycle IDs must be >= 1 and monotonically non-decreasing from initial
    function invariant_cycleIdsValid() public view {
        assertGe(token.microPoolCycleId(), 1, "INVARIANT: micro cycleId < 1");
        assertGe(token.midPoolCycleId(), 1, "INVARIANT: mid cycleId < 1");
        assertGe(token.megaPoolCycleId(), 1, "INVARIANT: mega cycleId < 1");
    }

    /// @dev Micro threshold must be within [MICRO_BASE (0.01 ETH), MICRO_MAX (100 ETH)]
    function invariant_microThresholdInBounds() public view {
        uint256 t = token.microPoolCurrentThreshold();
        assertGe(t, 0.01 ether, "INVARIANT: micro threshold below base");
        assertLe(t, 100 ether, "INVARIANT: micro threshold above max");
    }

    /// @dev Mid threshold must be within [MID_BASE (0.05 ETH), MID_MAX (500 ETH)]
    function invariant_midThresholdInBounds() public view {
        uint256 t = token.midPoolCurrentThreshold();
        assertGe(t, 0.05 ether, "INVARIANT: mid threshold below base");
        assertLe(t, 500 ether, "INVARIANT: mid threshold above max");
    }

    /// @dev Marketing wallet address must never be address(0)
    function invariant_marketingWalletNonZero() public view {
        assertTrue(token.marketingWallet() != address(0), "INVARIANT: marketing wallet is zero");
    }

    /// @dev Contract should never have more tokens than TOTAL_SUPPLY
    function invariant_contractTokensLteTotalSupply() public view {
        assertLe(token.balanceOf(address(token)), TOTAL_SUPPLY, "INVARIANT: contract holds > totalSupply");
    }

    /// @dev After operations, call summary
    function invariant_callSummary() public view {
        // This invariant always passes â€" used to print ghost stats
        // console.log("Buys:", handler.ghost_totalBuys());
        // console.log("Sells:", handler.ghost_totalSells());
        // console.log("Transfers:", handler.ghost_totalTransfers());
        // console.log("AutonomousCycles:", handler.ghost_totalAutonomousCycles());
        // console.log("VRFFulfills:", handler.ghost_totalVRFFulfills());
    }

    /// @dev Entry totalEntries must always be >= roundStartIndex for all pools
    function invariant_entryIndicesConsistent() public view {
        assertGe(token.microPoolTotalEntries(), token.microPoolRoundStartIndex(), "INVARIANT: micro totalEntries < roundStart");
        assertGe(token.midPoolTotalEntries(), token.midPoolRoundStartIndex(), "INVARIANT: mid totalEntries < roundStart");
        assertGe(token.megaPoolTotalEntries(), token.megaPoolRoundStartIndex(), "INVARIANT: mega totalEntries < roundStart");
    }

    /// @dev getPoolInfo should never revert for valid pool types
    function invariant_getPoolInfoNeverReverts() public view {
        token.getPoolInfo(0);
        token.getPoolInfo(1);
        token.getPoolInfo(2);
    }
}

/**
 * @title evmXInvariantPostRenounce
 * @dev Same invariants but with ownership already renounced.
 */
contract evmXInvariantPostRenounce is evmXBaseTest {
    evmXHandler public handler;

    function setUp() public override {
        super.setUp();

        // Fund actors
        for (uint256 i; i < users.length; i++) {
            vm.deal(users[i], 100 ether);
        }

        handler = new evmXHandler(
            address(token),
            address(router),
            address(vrfCoordinator),
            address(weth),
            users
        );
        vm.deal(address(handler), 500 ether);

        // Seed some users with tokens via buys
        for (uint256 i; i < 10; i++) {
            buyTokens(users[i], 0.5 ether);
        }

        // Target only the handler
        targetContract(address(handler));
        // Renounce ownership before invariant runs
        token.renounceOwnership();
    }

    /// @dev Owner must be zero after renounce
    function invariant_ownerZeroAfterRenounce() public view {
        assertEq(token.owner(), address(0), "INVARIANT: owner not zero after renounce");
    }

    /// @dev Marketing wallet must remain unchanged after renounce
    function invariant_marketingWalletImmutableAfterRenounce() public view {
        assertEq(token.marketingWallet(), marketing, "INVARIANT: marketing wallet changed after renounce");
    }
}

