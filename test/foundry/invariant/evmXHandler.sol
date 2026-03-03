// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../evmXBaseTest.sol";

/**
 * @title evmXHandler
 * @dev Stateful handler for Foundry invariant testing. Performs random operations
 *      on the evmX contract and tracks ghost variables for invariant verification.
 */
contract evmXHandler is Test {
    evmX_Testable public token;
    MockUniswapV2Router public router;
    MockVRFCoordinatorV2Plus public vrfCoordinator;
    address public weth;
    address[] public actors;

    // Ghost variables for tracking
    uint256 public ghost_totalEthIn;
    uint256 public ghost_totalEthOut;
    uint256 public ghost_totalBuys;
    uint256 public ghost_totalSells;
    uint256 public ghost_totalTransfers;
    uint256 public ghost_totalAutonomousCycles;
    uint256 public ghost_totalEmergencyDraws;
    uint256 public ghost_totalVRFFulfills;
    uint256 public ghost_ownerRenounced; // 0 or 1

    uint256 public ghost_microCyclesBefore;
    uint256 public ghost_midCyclesBefore;
    uint256 public ghost_megaCyclesBefore;

    constructor(
        address _token,
        address _router,
        address _vrfCoordinator,
        address _weth,
        address[] memory _actors
    ) {
        token = evmX_Testable(payable(_token));
        router = MockUniswapV2Router(payable(_router));
        vrfCoordinator = MockVRFCoordinatorV2Plus(_vrfCoordinator);
        weth = _weth;
        actors = _actors;
    }

    modifier useActor(uint256 seed) {
        address actor = actors[seed % actors.length];
        vm.startPrank(actor);
        _;
        vm.stopPrank();
    }

    // â"€â"€ Actions â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function buy(uint256 actorSeed, uint256 ethAmount) external useActor(actorSeed) {
        ethAmount = bound(ethAmount, 0.001 ether, 2 ether);
        address actor = actors[actorSeed % actors.length];
        if (actor.balance < ethAmount) return;

        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = address(token);

        try router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: ethAmount}(
            0, path, actor, block.timestamp + 1
        ) {
            ghost_totalBuys++;
            ghost_totalEthIn += ethAmount;
        } catch {}
    }

    function sell(uint256 actorSeed, uint256 tokenAmount) external useActor(actorSeed) {
        address actor = actors[actorSeed % actors.length];
        uint256 bal = token.balanceOf(actor);
        if (bal == 0) return;
        tokenAmount = bound(tokenAmount, 1, bal);

        token.approve(address(router), tokenAmount);
        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = weth;

        uint256 ethBefore = actor.balance;
        try router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount, 0, path, actor, block.timestamp + 1
        ) {
            ghost_totalSells++;
            ghost_totalEthOut += actor.balance - ethBefore;
        } catch {}
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = actors[fromSeed % actors.length];
        address to = actors[toSeed % actors.length];
        if (from == to) return;
        uint256 bal = token.balanceOf(from);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);

        vm.prank(from);
        try token.transfer(to, amount) {
            ghost_totalTransfers++;
        } catch {}
    }

    function autonomousCycle(uint256 actorSeed) external useActor(actorSeed) {
        ghost_microCyclesBefore = token.microPoolCycleId();
        ghost_midCyclesBefore = token.midPoolCycleId();
        ghost_megaCyclesBefore = token.megaPoolCycleId();

        try token.runAutonomousCycle() {
            ghost_totalAutonomousCycles++;
        } catch {}
    }

    function emergencyForceAllocation(uint256 actorSeed, uint8 poolType) external useActor(actorSeed) {
        poolType = uint8(bound(uint256(poolType), 0, 2));
        try token.emergencyForceAllocation(poolType) {
            ghost_totalEmergencyDraws++;
        } catch {}
    }

    function fulfillPendingVRF() external {
        uint256 reqId = vrfCoordinator.getPendingRequestId();
        if (reqId == 0) return;

        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = uint256(keccak256(abi.encodePacked(reqId, block.timestamp, block.number)));

        try vrfCoordinator.fulfillRandomWords(reqId, randomWords) {
            ghost_totalVRFFulfills++;
        } catch {}
    }

    function sendEthToContract(uint256 amount) external {
        amount = bound(amount, 0.001 ether, 1 ether);
        (bool s,) = address(token).call{value: amount}("");
        if (s) ghost_totalEthIn += amount;
    }

    function syncAccounting() external {
        token.syncETHAccounting();
    }

    function warpForward(uint256 secs) external {
        secs = bound(secs, 1, 8 hours);
        vm.warp(block.timestamp + secs);
        vm.roll(block.number + secs / 2);
    }

    function reEnrollUser(uint256 userSeed) external {
        address user = actors[userSeed % actors.length];
        try token.reEnroll(user) {} catch {}
    }

    /// @dev Buy multiple times for a user to test multi-entry accumulation
    function buyMultiple(uint256 actorSeed, uint256 count) external useActor(actorSeed) {
        count = bound(count, 1, 5);
        address actor = actors[actorSeed % actors.length];

        for (uint256 i; i < count; i++) {
            if (actor.balance < 0.1 ether) break;

            address[] memory path = new address[](2);
            path[0] = weth;
            path[1] = address(token);

            try router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: 0.1 ether}(
                0, path, actor, block.timestamp + 1
            ) {
                ghost_totalBuys++;
                ghost_totalEthIn += 0.1 ether;
            } catch {}

            // Advance block between buys
            vm.roll(block.number + 1);
        }
    }

    /// @dev Check getUserStatus for a random user (verifies it never reverts)
    function checkUserStatus(uint256 userSeed) external view {
        address user = actors[userSeed % actors.length];
        // This call must never revert regardless of state
        token.getUserStatus(user);
    }
}

