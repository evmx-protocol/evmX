// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/evmX_Testable.sol";
import "./mocks/MockUniswapV2.sol";
import "./mocks/MockWETH9.sol";
import "./mocks/MockVRFCoordinatorV2Plus.sol";

/**
 * @title evmXBaseTest
 * @dev Shared base for all evmX Foundry tests. Deploys mocks, token, adds liquidity.
 */
abstract contract evmXBaseTest is Test {
    evmX_Testable public token;
    MockWETH9 public weth;
    MockUniswapV2Factory public factory;
    MockUniswapV2Router public router;
    MockVRFCoordinatorV2Plus public vrfCoordinator;

    address public pair;
    uint256 public vrfSubId;
    bytes32 public constant VRF_KEY_HASH = keccak256("test_key_hash");

    address public owner;
    address public marketing;

    // Test users
    address[] public users;
    uint256 public constant NUM_USERS = 20;

    // Token constants
    uint256 public constant TOTAL_SUPPLY = 100_000_000 ether;
    uint256 public constant MAX_TX = (TOTAL_SUPPLY * 150) / 10_000; // 1.5%
    uint256 public constant MAX_WALLET = (TOTAL_SUPPLY * 4) / 100;  // 4%
    uint256 public constant SWAP_THRESHOLD = 120_000 ether;

    // Liquidity params
    uint256 public constant INITIAL_TOKEN_LIQ = 50_000_000 ether;
    uint256 public constant INITIAL_ETH_LIQ = 10 ether;

    function setUp() public virtual {
        owner = address(this);
        marketing = makeAddr("marketing");

        // Deploy mocks
        weth = new MockWETH9();
        factory = new MockUniswapV2Factory();
        router = new MockUniswapV2Router(address(factory), address(weth));

        vrfCoordinator = new MockVRFCoordinatorV2Plus();
        vrfSubId = vrfCoordinator.createSubscription();
        vrfCoordinator.fundSubscriptionWithNative{value: 5 ether}(vrfSubId);

        // Deploy token
        token = new evmX_Testable(
            marketing,
            vrfSubId,
            address(router),
            address(vrfCoordinator),
            VRF_KEY_HASH
        );

        pair = token.uniswapPair();
        vrfCoordinator.addConsumer(vrfSubId, address(token));

        // Add liquidity
        token.approve(address(router), INITIAL_TOKEN_LIQ);
        router.addLiquidityETH{value: INITIAL_ETH_LIQ}(
            address(token), INITIAL_TOKEN_LIQ, 0, 0, owner, block.timestamp + 1
        );

        // Create test users
        for (uint256 i; i < NUM_USERS; i++) {
            address user = makeAddr(string(abi.encodePacked("user", vm.toString(i))));
            users.push(user);
            vm.deal(user, 100 ether);
        }

        vm.deal(address(this), 1000 ether);
    }

    // â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

    function buyTokens(address buyer, uint256 ethAmount) internal returns (uint256 received) {
        uint256 balBefore = token.balanceOf(buyer);
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(token);

        vm.prank(buyer);
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: ethAmount}(
            0, path, buyer, block.timestamp + 1
        );
        received = token.balanceOf(buyer) - balBefore;
    }

    function sellTokens(address seller, uint256 tokenAmount) internal {
        vm.startPrank(seller);
        token.approve(address(router), tokenAmount);
        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = address(weth);
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount, 0, path, seller, block.timestamp + 1
        );
        vm.stopPrank();
    }

    function fulfillVRF(uint256 requestId) internal {
        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = uint256(keccak256(abi.encodePacked(requestId, block.timestamp)));
        vrfCoordinator.fulfillRandomWords(requestId, randomWords);
    }

    function fulfillVRFWithWord(uint256 requestId, uint256 word) internal {
        uint256[] memory randomWords = new uint256[](1);
        randomWords[0] = word;
        vrfCoordinator.fulfillRandomWords(requestId, randomWords);
    }

    /// @dev Low-level VRF fulfill directly pranking the coordinator (for attack tests)
    function fulfillVRFDirect(uint256 requestId, uint256[] memory randomWords) internal {
        vm.prank(address(vrfCoordinator));
        token.rawFulfillRandomWords(requestId, randomWords);
    }

    function warpTime(uint256 secs) internal {
        vm.warp(block.timestamp + secs);
        vm.roll(block.number + secs / 2); // ~2s block time on Base
    }

    function getUser(uint256 seed) internal view returns (address) {
        return users[seed % NUM_USERS];
    }

    receive() external payable {}
}

