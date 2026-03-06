// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * ===========================================================================
 * |         ETERNAL VIRTUAL MACHINE (evmX) -- Testable Contract             |
 * |                         Base Mainnet (Chain ID: 8453)                   |
 * ===========================================================================
 * |                                                                         |
 * |  Autonomous Community Reward Protocol ERC-20 with:                      |
 * |    - 3% buy tax  -> Micro Pot (1%) + Mid Pot (1.5%) + Marketing (0.4%) |
 * |                     + VRF funding (0.1%)                                |
 * |    - 3% sell tax -> Mega Pot (1.9%) + Marketing (1%) + VRF (0.1%)      |
 * |    - Chainlink VRF v2.5 random draws (native payment)                  |
 * |    - Smart ladder thresholds for Micro & Mid pots                      |
 * |    - 7-day Mega Pot cycle                                              |
 * |    - Same-block trade protection                                       |
 * |    - Anti-whale: Max TX 1.5%, Max Wallet 4%                            |
 * |    - Auto token->ETH swap at 120k threshold                            |
 * |    - Emergency force draw after 24h VRF timeout                        |
 * |    - Autonomous cycle runner for external keepers                      |
 * |                                                                         |
 * |  Hardcoded addresses:                                                   |
 * |    Uniswap V2 Router: 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24      |
 * |    VRF Coordinator:   0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634      |
 * |    VRF Key Hash:      150 gwei gas lane (Base Mainnet)                 |
 * |                                                                         |
 * |  Constructor params:                                                    |
 * |    - _marketingWallet  (address)                                        |
 * |    - _vrfSubscriptionId (uint256)                                       |
 * |                                                                         |
 * ===========================================================================
 */

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ------------------------------------------------------------------------------
// Uniswap V2 interfaces
// ------------------------------------------------------------------------------
interface IUniswapV2Router02 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);
}

interface IUniswapV2Factory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IUniswapV2Pair {
    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
}

// ------------------------------------------------------------------------------
// Chainlink VRF v2.5 interfaces
// ------------------------------------------------------------------------------
library VRFV2PlusClient {
    bytes4 public constant EXTRA_ARGS_V1_TAG = bytes4(keccak256("VRF ExtraArgsV1"));

    struct ExtraArgsV1 {
        bool nativePayment;
    }

    struct RandomWordsRequest {
        bytes32 keyHash;
        uint256 subId;
        uint16 requestConfirmations;
        uint32 callbackGasLimit;
        uint32 numWords;
        bytes extraArgs;
    }

    function _argsToBytes(ExtraArgsV1 memory extraArgs) internal pure returns (bytes memory bts) {
        return abi.encodeWithSelector(EXTRA_ARGS_V1_TAG, extraArgs);
    }
}

interface IVRFSubscriptionV2Plus {
    function fundSubscriptionWithNative(uint256 subId) external payable;
}

interface IVRFCoordinatorV2Plus is IVRFSubscriptionV2Plus {
    function requestRandomWords(VRFV2PlusClient.RandomWordsRequest calldata req)
        external
        returns (uint256 requestId);
    function getSubscription(uint256 subId)
        external
        view
        returns (
            uint96 balance,
            uint96 nativeBalance,
            uint64 reqCount,
            address owner,
            address[] memory consumers
        );
}

// ===============================================================================
//  evmX -- Main Contract
// ===============================================================================
contract evmX_Testable is ERC20, Ownable, ReentrancyGuard {

    // ======== Errors ========
    error InvalidAddress();
    error TransferExceedsMaxTx(uint256 amount, uint256 max);
    error WalletExceedsMaxLimit(uint256 amount, uint256 max);
    error SameBlockTrade();
    error OnlyCoordinator();
    error UnknownRequest(uint256 requestId);
    error InvalidPoolType(uint8 poolType);
    error PoolTypeMismatch(uint8 expected, uint8 actual);
    error NoPendingAllocation();
    error EmergencyAllocationTimeoutNotReached(uint256 availableAt, uint256 currentTime);
    error InsufficientExecutionGas(uint256 provided, uint256 required);
    error InvalidVrfSubscription(uint256 subId);
    error InsufficientBalance();

    // ======== Injectable addresses (testable) ========

    // ======== Token and limits ========
    uint256 private constant TOTAL_SUPPLY = 100_000_000 * 1e18;
    uint256 private constant MAX_WALLET_PERCENT = 4;
    uint256 private constant MAX_TX_BPS = 150;
    uint256 private constant BASIS_POINTS = 10_000;

    uint256 private constant MICRO_MAX_WHALE_TOKENS = TOTAL_SUPPLY / 33;

    uint256 private constant BUY_TAX = 300;
    uint256 private constant SELL_TAX = 300;

    uint256 private constant MICRO_POOL_BPS = 100;
    uint256 private constant MID_POOL_BPS = 150;
    uint256 private constant BUY_MARKETING_BPS = 40;

    uint256 private constant MEGA_POOL_BPS = 190;
    uint256 private constant SELL_MARKETING_BPS = 100;

    // ======== Entry rules ========
    uint256 private constant MICRO_POOL_FLOOR_ETH = 0.001 ether;
    uint256 private constant MICRO_POOL_ENTRY_CAP_ETH = 0.05 ether;
    uint256 private constant MID_POOL_FLOOR_ETH = 0.0025 ether;
    uint256 private constant MEGA_POOL_FLOOR_ETH = 0.0035 ether;
    uint256 private constant DYNAMIC_ENTRY_BPS = 70;
    uint256 private constant MID_POOL_ENTRY_CAP_ETH = 0.25 ether;
    uint256 private constant MEGA_POOL_ENTRY_CAP_ETH = 1 ether;
    uint8 private constant MAX_ENTRIES_PER_CYCLE = 3;

    // ======== Smart ladder ========
    uint256 private constant MICRO_BASE_THRESHOLD = 0.01 ether;
    uint256 private constant MID_BASE_THRESHOLD = 0.05 ether;
    uint256 private constant MICRO_LADDER_TIME_LIMIT = 2 hours;
    uint256 private constant MID_LADDER_TIME_LIMIT = 6 hours;

    uint256 private constant MICRO_MAX_THRESHOLD = 100 ether;
    uint256 private constant MID_MAX_THRESHOLD = 500 ether;

    uint256 private constant MEGA_POOL_DURATION = 7 days;

    // ======== Swap + rewards ========
    uint256 private constant AUTO_SWAP_THRESHOLD = 120_000 * 10 ** 18;
    uint256 private constant SWAP_SLIPPAGE_BPS = 9400;
    uint256 private constant SWAP_MIN_OUTPUT_ETH = 0.0001 ether;
    uint256 private constant MIN_TOKENS_FOR_REWARDS = 100 * 1e18; // dust filter only — real threshold is ETH-value-based
    uint256 private constant MAX_RECIPIENT_ATTEMPTS = 130;
    uint256 private constant RECIPIENT_SELECTION_GAS_RESERVE = 350_000;
    uint256 private constant MIN_ALLOCATION_EXECUTION_GAS = 900_000;
    uint256 private constant PAYOUT_GAS_LIMIT = 300_000;

    uint256 private constant MIN_WETH_LIQUIDITY = 0.05 ether;
    uint256 private constant LIQUIDITY_GRACE_PERIOD = 1 hours;

    // ======== VRF v2.5 ========
    uint16 private constant VRF_REQUEST_CONFIRMATIONS = 3;
    uint32 private constant VRF_CALLBACK_GAS_LIMIT = 2_500_000;
    uint32 private constant VRF_NUM_WORDS = 1;
    uint256 private constant VRF_MIN_FUND_ETH = 0.001 ether;
    uint256 private constant VRF_NATIVE_BALANCE_CAP = 2 ether;

    uint256 private constant VRF_STALE_REROUTE_TIMEOUT = 7 days;

    uint256 private constant EMERGENCY_ALLOCATION_TIMEOUT = 24 hours;
    uint256 private constant EMERGENCY_COMMIT_DELAY_BLOCKS = 5;

    uint256 private constant SWAP_COOLDOWN = 30;

    uint256 private constant MAX_CLEANUP_GAS = 30_000;

    // ======== Immutables ========
    IUniswapV2Router02 public immutable uniswapRouter;
    address public immutable uniswapPair;
    address public marketingWallet;
    uint256 public immutable deploymentTime;
    uint256 public immutable maxWalletAmount;
    uint256 public immutable maxTxAmount;
    bool private immutable isWethToken0;
    IVRFCoordinatorV2Plus private immutable vrfCoordinator;
    uint256 public immutable vrfSubscriptionId;
    address private immutable vrfCoordinatorAddress;
    bytes32 private immutable vrfKeyHash;

    bool private inSwap;
    bool private inAllocation;
    uint256 private lastFailedSwapTime;
    uint256[3] private emergencyReadyBlock; // [Micro, Mid, Mega] commit-reveal delay

    // ======== Pot state ========
    uint256 public microPoolBalance;
    uint256 public midPoolBalance;
    uint256 public megaPoolBalance;
    uint256 private megaPoolExternalInflowPending;

    uint256 public microPoolCurrentThreshold;
    uint256 public midPoolCurrentThreshold;

    uint256 public microPoolLastAllocationTime;
    uint256 public midPoolLastAllocationTime;
    uint256 public megaPoolStartTime;

    uint256 public microPoolCycleId;
    uint256 public midPoolCycleId;
    uint256 public megaPoolCycleId;

    uint256 private accumulatedMicroPoolTokens;
    uint256 private accumulatedMidPoolTokens;
    uint256 private accumulatedMegaPoolTokens;
    uint256 private accumulatedMarketingTokens;
    uint256 private accumulatedVrfTokens;

    uint256 public pendingVrfEth;
    uint256 private lastSuccessfulVrfFundTime;

    // ======== Eligibility ========
    mapping(address => bool) public isExcludedFromFees;
    mapping(address => bool) public isExcludedFromLimits;
    mapping(address => bool) public isLiquidityPool;
    mapping(address => uint256) private lastBuyBlock;
    mapping(address => uint256) private lastSellBlock;

    mapping(address => mapping(uint256 => bool)) public isEligibleForMicroPool;
    mapping(address => mapping(uint256 => bool)) public isEligibleForMidPool;
    mapping(address => mapping(uint256 => bool)) public isEligibleForMegaPool;

    mapping(address => mapping(uint256 => uint256)) private microPoolRequiredTokenHold;
    mapping(address => mapping(uint256 => uint256)) private midPoolRequiredTokenHold;
    mapping(address => mapping(uint256 => uint256)) private megaPoolRequiredTokenHold;

    mapping(uint256 => address[]) private microPoolCycleParticipants;
    mapping(uint256 => mapping(address => uint256)) private microPoolCycleParticipantIndexPlusOne;

    mapping(uint256 => address[]) private midPoolCycleParticipants;
    mapping(uint256 => mapping(address => uint256)) private midPoolCycleParticipantIndexPlusOne;

    mapping(uint256 => address[]) private megaPoolCycleParticipants;
    mapping(uint256 => mapping(address => uint256)) private megaPoolCycleParticipantIndexPlusOne;

    mapping(uint256 => address) public microPoolEntries;
    uint256 public microPoolTotalEntries;
    uint256 public microPoolRoundStartIndex;

    mapping(uint256 => address) public midPoolEntries;
    uint256 public midPoolTotalEntries;
    uint256 public midPoolRoundStartIndex;

    mapping(uint256 => address) public megaPoolEntries;
    uint256 public megaPoolTotalEntries;
    uint256 public megaPoolRoundStartIndex;

    uint256 private microPoolCleanupIndex;
    uint256 private midPoolCleanupIndex;
    uint256 private megaPoolCleanupIndex;

    // ======== Multi-entry tracking (unified mapping to save bytecode) ========
    mapping(address => mapping(uint256 => mapping(uint8 => uint8))) private poolEntryCount;
    mapping(address => mapping(uint256 => mapping(uint8 => uint128))) private poolCumBuyETH;

    // ======== VRF draw tracking ========
    enum PoolType { Micro, Mid, Mega }

    struct AllocationRequest {
        uint8 poolType;
        uint256 cycleId;
        uint256 roundStartIndex;
        uint256 totalEntries;
        uint256 poolAmount;
        bool forceAllocation;
        bool exists;
    }

    mapping(uint256 => AllocationRequest) private allocationRequests;
    uint256 public microPoolPendingRequestId;
    uint256 public midPoolPendingRequestId;
    uint256 public megaPoolPendingRequestId;

    mapping(uint256 => uint256) private allocationRequestTimestamps;
    uint256[3] private vrfRequestFailureSince;

    // ======== Events ========
    event PoolAllocated(uint8 indexed poolType, address indexed recipient, uint256 amount, uint256 cycleId);
    event PoolThresholdAdjusted(uint8 indexed poolType, uint256 newThreshold, bool increased);
    event SwapAndDistribute(uint256 tokensSwapped, uint256 ethReceived, uint256 vrfEth);
    event ETHDepositedToRewardPool(address indexed from, uint256 amount);
    event PayoutFailed(address indexed holder, uint256 amount);
    event ForceAllocationExecuted(uint8 poolType, uint256 amount, uint256 cycleId);
    event EligibilityChecked(address indexed user, uint256 userETHValue);
    event EntryIssued(address indexed user, uint8 poolType, uint256 entryIndex, uint256 count, uint256 cycleId);
    event TrafficWhitelistUpdated(address indexed account, bool isWhitelisted);
    event AllocationRequested(
        uint256 indexed requestId, uint8 poolType, uint256 cycleId, uint256 poolAmount, bool forceAllocation
    );
    event AllocationRequestFailed(uint8 poolType, uint256 cycleId);
    event VrfSubscriptionFunded(uint256 amount);
    event VrfSubscriptionFundFailed(uint256 amount);
    event VrfFundingReroutedToPools(
        uint256 reroutedAmount, uint256 microAmount, uint256 midAmount, uint256 megaAmount,
        uint256 nativeSubscriptionBalance
    );
    event EmergencyForceAllocationExecuted(uint8 poolType, uint256 requestId, address caller);
    event EmergencyAllocationCommitted(uint8 poolType, uint256 readyBlock);
    event NoEligibleRecipient(
        uint8 indexed poolType, uint256 indexed cycleId, uint256 roundStartIndex, uint256 totalEntries
    );
    event AutonomousCycleProcessed(address indexed caller, bool swapExecuted, bool vrfFundAttempted);
    event MarketingWalletUpdated(address indexed previousWallet, address indexed newWallet);
    event ETHAccountingSynced(uint256 excess);
    event ReEnrollment(address indexed user);

    modifier lockTheSwap() {
        inSwap = true;
        _;
        inSwap = false;
    }

    /**
     * @param _marketingWallet     Marketing wallet that receives ETH from taxes
     * @param _vrfSubscriptionId   Chainlink VRF v2.5 subscription ID (must exist, native funded)
     *
     * @dev Deploy flow:
     *   1. Create VRF subscription at https://vrf.chain.link/ (Base Mainnet)
     *   2. Fund the subscription with native ETH (minimum 0.1 ETH recommended)
     *   3. Deploy this contract with your marketing wallet + sub ID
     *   4. Add this contract address as a consumer in the VRF subscription
     *   5. Add liquidity on Uniswap V2
     *   6. (Optional) Renounce ownership after verifying everything works
     */
    constructor(
        address _marketingWallet,
        uint256 _vrfSubscriptionId,
        address _routerAddress,
        address _vrfCoordinatorAddress,
        bytes32 _vrfKeyHash
    ) ERC20("ETERNAL VIRTUAL MACHINE", "evmX") Ownable(msg.sender) {
        if (_marketingWallet == address(0)) revert InvalidAddress();
        if (_vrfSubscriptionId == 0) revert InvalidVrfSubscription(_vrfSubscriptionId);

        uniswapRouter = IUniswapV2Router02(_routerAddress);
        marketingWallet = _marketingWallet;
        vrfCoordinatorAddress = _vrfCoordinatorAddress;
        vrfKeyHash = _vrfKeyHash;

        IVRFCoordinatorV2Plus coordinator = IVRFCoordinatorV2Plus(_vrfCoordinatorAddress);
        try coordinator.getSubscription(_vrfSubscriptionId) returns (uint96, uint96, uint64, address, address[] memory) {
        } catch {
            revert InvalidVrfSubscription(_vrfSubscriptionId);
        }

        vrfCoordinator = coordinator;
        vrfSubscriptionId = _vrfSubscriptionId;

        deploymentTime = block.timestamp;
        lastSuccessfulVrfFundTime = block.timestamp;

        address weth = uniswapRouter.WETH();
        address pair = IUniswapV2Factory(uniswapRouter.factory()).createPair(address(this), weth);
        uniswapPair = pair;
        isLiquidityPool[pair] = true;
        isWethToken0 = IUniswapV2Pair(pair).token0() == weth;

        maxWalletAmount = (TOTAL_SUPPLY * MAX_WALLET_PERCENT) / 100;
        maxTxAmount = (TOTAL_SUPPLY * MAX_TX_BPS) / BASIS_POINTS;

        microPoolCurrentThreshold = MICRO_BASE_THRESHOLD;
        midPoolCurrentThreshold = MID_BASE_THRESHOLD;

        microPoolCycleId = 1;
        midPoolCycleId = 1;
        megaPoolCycleId = 1;

        microPoolLastAllocationTime = block.timestamp;
        midPoolLastAllocationTime = block.timestamp;
        megaPoolStartTime = block.timestamp;

        isExcludedFromFees[msg.sender] = true;
        isExcludedFromFees[address(this)] = true;
        isExcludedFromFees[_marketingWallet] = true;

        isExcludedFromLimits[msg.sender] = true;
        isExcludedFromLimits[address(this)] = true;
        isExcludedFromLimits[_marketingWallet] = true;
        isExcludedFromLimits[pair] = true;

        _mint(msg.sender, TOTAL_SUPPLY);
    }

    receive() external payable {
        if (msg.value > 0 && !inSwap) {
            if (msg.sender == vrfCoordinatorAddress) {
                pendingVrfEth += msg.value;
            } else {
                megaPoolBalance += msg.value;
                megaPoolExternalInflowPending += msg.value;
                emit ETHDepositedToRewardPool(msg.sender, msg.value);
            }
        }
    }

    function syncETHAccounting() external {
        uint256 tracked = microPoolBalance + midPoolBalance + megaPoolBalance + pendingVrfEth;
        uint256 actual = address(this).balance;
        if (actual > tracked) {
            uint256 excess = actual - tracked;
            megaPoolBalance += excess;
            emit ETHAccountingSynced(excess);
        }
    }

    function updateTrafficWhitelist(address account, bool isWhitelisted) external onlyOwner {
        if (account == address(0)) revert InvalidAddress();
        isExcludedFromFees[account] = isWhitelisted;
        isExcludedFromLimits[account] = isWhitelisted;
        emit TrafficWhitelistUpdated(account, isWhitelisted);
    }

    function setMarketingWallet(address newWallet) external onlyOwner {
        if (newWallet == address(0)) revert InvalidAddress();
        address previous = marketingWallet;
        if (newWallet == previous) return;
        marketingWallet = newWallet;
        isExcludedFromFees[previous] = false;
        isExcludedFromLimits[previous] = false;
        isExcludedFromFees[newWallet] = true;
        isExcludedFromLimits[newWallet] = true;
        emit MarketingWalletUpdated(previous, newWallet);
    }

    function runAutonomousCycle() external nonReentrant {
        bool swapExecuted;
        bool vrfFundAttempted;
        if (!inSwap && !inAllocation) {
            if (block.timestamp >= lastFailedSwapTime + SWAP_COOLDOWN) {
                uint256 contractTokenBalance = balanceOf(address(this));
                if (contractTokenBalance >= AUTO_SWAP_THRESHOLD) {
                    swapAndDistribute();
                    swapExecuted = true;
                    vrfFundAttempted = true;
                }
            }
            if (!swapExecuted && pendingVrfEth >= VRF_MIN_FUND_ETH) {
                _attemptVrfFund();
                vrfFundAttempted = true;
            }
            _autoResolveTimedOutAllocations();
            checkAndAllocateMicroPool();
            checkAndAllocateMidPool();
            checkAndAllocateMegaPool();
        }
        emit AutonomousCycleProcessed(msg.sender, swapExecuted, vrfFundAttempted);
    }

    /// @notice Re-enroll any holder into current pool cycles (callable by anyone)
    function reEnroll(address user) external nonReentrant {
        if (user == address(0)) revert InvalidAddress();
        if (user.code.length > 0) revert InvalidAddress();
        if (balanceOf(user) < MIN_TOKENS_FOR_REWARDS) revert InsufficientBalance();
        checkAndUpdateEligibility(user, 0);
        emit ReEnrollment(user);
    }

    function emergencyForceAllocation(uint8 poolType) external nonReentrant {
        if (poolType > uint8(PoolType.Mega)) revert InvalidPoolType(poolType);
        if (gasleft() < MIN_ALLOCATION_EXECUTION_GAS) {
            revert InsufficientExecutionGas(gasleft(), MIN_ALLOCATION_EXECUTION_GAS);
        }
        uint256 requestId = _getPendingRequestId(poolType);
        if (requestId == 0) revert NoPendingAllocation();
        uint256 availableAt = allocationRequestTimestamps[requestId] + EMERGENCY_ALLOCATION_TIMEOUT;
        if (block.timestamp < availableAt) {
            revert EmergencyAllocationTimeoutNotReached(availableAt, block.timestamp);
        }
        AllocationRequest memory request = allocationRequests[requestId];
        if (!request.exists) revert UnknownRequest(requestId);
        if (request.poolType != poolType) revert PoolTypeMismatch(poolType, request.poolType);
        _executeEmergencyAllocation(poolType, requestId, request, msg.sender);
    }

    // ======== Internal helpers ========

    function _getPendingRequestId(uint8 poolType) private view returns (uint256) {
        if (poolType == uint8(PoolType.Micro)) return microPoolPendingRequestId;
        if (poolType == uint8(PoolType.Mid)) return midPoolPendingRequestId;
        return megaPoolPendingRequestId;
    }

    function _clearPendingRequestId(uint8 poolType) private {
        if (poolType == uint8(PoolType.Micro)) {
            microPoolPendingRequestId = 0;
        } else if (poolType == uint8(PoolType.Mid)) {
            midPoolPendingRequestId = 0;
        } else {
            megaPoolPendingRequestId = 0;
        }
        emergencyReadyBlock[poolType] = 0;
    }

    function _autoResolveTimedOutAllocations() private {
        if (microPoolPendingRequestId == 0 && midPoolPendingRequestId == 0 && megaPoolPendingRequestId == 0) {
            return;
        }
        if (gasleft() < MIN_ALLOCATION_EXECUTION_GAS) return;
        _tryAutoResolveTimedOutAllocation(uint8(PoolType.Micro), microPoolPendingRequestId);
        if (gasleft() >= MIN_ALLOCATION_EXECUTION_GAS) {
            _tryAutoResolveTimedOutAllocation(uint8(PoolType.Mid), midPoolPendingRequestId);
        }
        if (gasleft() >= MIN_ALLOCATION_EXECUTION_GAS) {
            _tryAutoResolveTimedOutAllocation(uint8(PoolType.Mega), megaPoolPendingRequestId);
        }
    }

    function _tryAutoResolveTimedOutAllocation(uint8 poolType, uint256 requestId) private returns (bool) {
        if (requestId == 0) return false;
        uint256 requestTimestamp = allocationRequestTimestamps[requestId];
        if (requestTimestamp == 0 || block.timestamp < requestTimestamp + EMERGENCY_ALLOCATION_TIMEOUT) {
            return false;
        }
        AllocationRequest memory request = allocationRequests[requestId];
        if (!request.exists || request.poolType != poolType) {
            delete allocationRequests[requestId];
            delete allocationRequestTimestamps[requestId];
            _clearPendingRequestId(poolType);
            return true;
        }
        // Commit-reveal: step 1 — commit a future block for entropy
        if (emergencyReadyBlock[poolType] == 0) {
            emergencyReadyBlock[poolType] = block.number + EMERGENCY_COMMIT_DELAY_BLOCKS;
            emit EmergencyAllocationCommitted(poolType, emergencyReadyBlock[poolType]);
            return false; // wait for next keeper call
        }
        // Commit-reveal: step 2 — execute only AFTER committed block has passed
        // (must be strictly >, so _deriveEmergencyRandom's `currentBlock > readyBlock` is true)
        if (block.number <= emergencyReadyBlock[poolType]) {
            return false; // not yet ready
        }
        // Guard: if committed blockhashes expired (EVM only stores last 256), re-commit
        if (block.number > emergencyReadyBlock[poolType] + 256) {
            emergencyReadyBlock[poolType] = block.number + EMERGENCY_COMMIT_DELAY_BLOCKS;
            emit EmergencyAllocationCommitted(poolType, emergencyReadyBlock[poolType]);
            return false;
        }
        // NOTE: do NOT reset emergencyReadyBlock here — _deriveEmergencyRandom reads it,
        // then _clearPendingRequestId (inside _executeEmergencyAllocation) resets it after use
        _executeEmergencyAllocation(poolType, requestId, request, address(0));
        return true;
    }

    function _deriveEmergencyRandom(
        uint256 entropySeed, AllocationRequest memory request, address caller
    ) private view returns (uint256) {
        uint256 currentBlock = block.number;
        // Use committed blockhash if available (auto-resolve path), else fallback (manual path)
        uint256 readyBlock = emergencyReadyBlock[request.poolType];
        bytes32 committedHash1;
        bytes32 committedHash2;
        bytes32 committedHash3;
        bytes32 committedHash4;
        if (readyBlock > 0 && currentBlock > readyBlock) {
            // Committed blockhashes — finalized and immutable, not manipulable
            committedHash1 = blockhash(readyBlock - 1);
            committedHash2 = readyBlock >= 3 ? blockhash(readyBlock - 3) : bytes32(0);
            committedHash3 = readyBlock >= 5 ? blockhash(readyBlock - 5) : bytes32(0);
            committedHash4 = blockhash(readyBlock);
        } else {
            // Fallback for manual emergencyForceAllocation (no commit-reveal)
            committedHash1 = currentBlock > 10 ? blockhash(currentBlock - 10) : bytes32(0);
            committedHash2 = currentBlock > 50 ? blockhash(currentBlock - 50) : bytes32(0);
            committedHash3 = currentBlock > 100 ? blockhash(currentBlock - 100) : bytes32(0);
            committedHash4 = currentBlock > 200 ? blockhash(currentBlock - 200) : bytes32(0);
        }
        bytes32 requestEntropy = keccak256(
            abi.encodePacked(
                entropySeed, request.poolType, request.cycleId, request.roundStartIndex,
                request.totalEntries, request.poolAmount, address(this),
                committedHash1, committedHash2, committedHash3, committedHash4
            )
        );
        return uint256(
            keccak256(
                abi.encodePacked(
                    block.prevrandao, block.timestamp, tx.gasprice, gasleft(),
                    caller, msg.sender, tx.origin,
                    address(this).balance,
                    microPoolBalance ^ midPoolBalance ^ megaPoolBalance,
                    requestEntropy
                )
            )
        );
    }

    function _executeEmergencyAllocation(
        uint8 poolType, uint256 requestId, AllocationRequest memory request, address caller
    ) private {
        delete allocationRequests[requestId];
        delete allocationRequestTimestamps[requestId];
        uint256 onChainRandom = _deriveEmergencyRandom(requestId, request, caller);
        _clearPendingRequestId(poolType);
        _finalizeAllocation(PoolType(poolType), request, onChainRandom);
        emit EmergencyForceAllocationExecuted(poolType, requestId, caller);
    }

    function _executeNoPendingEmergencyAllocation(
        PoolType poolType, uint256 cycleId, uint256 roundStartIndex,
        uint256 totalEntries, uint256 poolAmount, bool forceAllocation
    ) private {
        AllocationRequest memory syntheticRequest = AllocationRequest({
            poolType: uint8(poolType), cycleId: cycleId, roundStartIndex: roundStartIndex,
            totalEntries: totalEntries, poolAmount: poolAmount, forceAllocation: forceAllocation, exists: true
        });
        uint256 syntheticSeed = uint256(
            keccak256(abi.encodePacked(
                block.number, block.timestamp, gasleft(), cycleId,
                roundStartIndex, totalEntries, poolAmount, uint8(poolType)
            ))
        );
        uint256 onChainRandom = _deriveEmergencyRandom(syntheticSeed, syntheticRequest, msg.sender);
        _finalizeAllocation(poolType, syntheticRequest, onChainRandom);
        emit EmergencyForceAllocationExecuted(uint8(poolType), 0, msg.sender);
    }

    function _markVrfRequestFailure(PoolType poolType) private returns (bool timedOut) {
        uint8 poolIndex = uint8(poolType);
        uint256 since = vrfRequestFailureSince[poolIndex];
        if (since == 0) { vrfRequestFailureSince[poolIndex] = block.timestamp; return false; }
        return block.timestamp >= since + EMERGENCY_ALLOCATION_TIMEOUT;
    }

    function _clearVrfRequestFailure(PoolType poolType) private {
        vrfRequestFailureSince[uint8(poolType)] = 0;
    }

    function _requestOrFallbackAllocation(
        PoolType poolType, uint256 cycleId, uint256 roundStartIndex,
        uint256 totalEntries, uint256 poolAmount, bool forceAllocation
    ) private returns (bool started) {
        if (_requestPoolAllocation(poolType, cycleId, roundStartIndex, totalEntries, poolAmount, forceAllocation)) {
            _clearVrfRequestFailure(poolType);
            return true;
        }
        if (_markVrfRequestFailure(poolType) && gasleft() >= MIN_ALLOCATION_EXECUTION_GAS) {
            _executeNoPendingEmergencyAllocation(poolType, cycleId, roundStartIndex, totalEntries, poolAmount, forceAllocation);
            _clearVrfRequestFailure(poolType);
            return true;
        }
        return false;
    }

    function _raiseThreshold(uint256 currentThreshold, uint256 maxThreshold) private pure returns (uint256) {
        if (currentThreshold >= maxThreshold / 2) return maxThreshold;
        uint256 raised = currentThreshold * 2;
        return raised > maxThreshold ? maxThreshold : raised;
    }

    function _lowerThreshold(uint256 currentThreshold, uint256 baseThreshold) private pure returns (uint256) {
        uint256 lowered = currentThreshold / 2;
        return lowered < baseThreshold ? baseThreshold : lowered;
    }

    // ======== Core transfer logic ========

    function _update(address from, address to, uint256 amount) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, amount);
            return;
        }
        bool isBuy = isLiquidityPool[from];
        bool isSell = isLiquidityPool[to];
        bool limitsApply = !isExcludedFromLimits[from] && !isExcludedFromLimits[to];

        if (limitsApply) {
            if (isBuy && lastBuyBlock[to] == block.number) revert SameBlockTrade();
            if (isSell && lastSellBlock[from] == block.number) revert SameBlockTrade();
            if (amount > maxTxAmount) revert TransferExceedsMaxTx(amount, maxTxAmount);
            if (!isSell) {
                uint256 recipientNewBalance = balanceOf(to) + amount;
                if (recipientNewBalance > maxWalletAmount) revert WalletExceedsMaxLimit(recipientNewBalance, maxWalletAmount);
            }
        }

        bool takeFee = !(isExcludedFromFees[from] || isExcludedFromFees[to] || inSwap);
        uint256 fees;

        if (takeFee) {
            if (isBuy) {
                fees = (amount * BUY_TAX) / BASIS_POINTS;
                if (fees > 0) {
                    uint256 microTokens = (fees * MICRO_POOL_BPS) / BUY_TAX;
                    uint256 midTokens = (fees * MID_POOL_BPS) / BUY_TAX;
                    uint256 marketingTokens = (fees * BUY_MARKETING_BPS) / BUY_TAX;
                    uint256 vrfTokens = fees - microTokens - midTokens - marketingTokens;
                    accumulatedMicroPoolTokens += microTokens;
                    accumulatedMidPoolTokens += midTokens;
                    accumulatedMarketingTokens += marketingTokens;
                    accumulatedVrfTokens += vrfTokens;
                    super._update(from, address(this), fees);
                }
            } else if (isSell) {
                fees = (amount * SELL_TAX) / BASIS_POINTS;
                if (fees > 0) {
                    uint256 megaTokens = (fees * MEGA_POOL_BPS) / SELL_TAX;
                    uint256 marketingTokens = (fees * SELL_MARKETING_BPS) / SELL_TAX;
                    uint256 vrfTokens = fees - megaTokens - marketingTokens;
                    accumulatedMegaPoolTokens += megaTokens;
                    accumulatedMarketingTokens += marketingTokens;
                    accumulatedVrfTokens += vrfTokens;
                    super._update(from, address(this), fees);
                }
            }
        }

        if (isBuy) lastBuyBlock[to] = block.number;
        if (isSell) {
            lastSellBlock[from] = block.number;
            if (from != address(this)) _revokeEligibilityOnSell(from);
        } else if (!isBuy && from != address(this)) {
            uint256 fromBalance = balanceOf(from);
            uint256 projectedBalance = fromBalance > amount ? fromBalance - amount : 0;
            _revokeIfBelowRequiredBalance(from, projectedBalance);
        }

        if (!inSwap && !isBuy) {
            if (block.timestamp >= lastFailedSwapTime + SWAP_COOLDOWN) {
                uint256 contractTokenBalance = balanceOf(address(this));
                if (contractTokenBalance >= AUTO_SWAP_THRESHOLD) {
                    swapAndDistribute();
                }
            }
        }

        super._update(from, to, amount - fees);

        if (isBuy && takeFee && !inSwap) {
            checkAndUpdateEligibility(to, getTokenValueInETH(amount - fees));
        }

        // Auto-enroll on transfer-in (not buy, not sell, not internal swap)
        if (!isBuy && !isSell && !inSwap && to != address(this) && to.code.length == 0) {
            if (balanceOf(to) >= MIN_TOKENS_FOR_REWARDS) {
                checkAndUpdateEligibility(to, 0);
            }
        }

        if (!inSwap && !inAllocation) {
            _autoResolveTimedOutAllocations();
            checkAndAllocateMicroPool();
            checkAndAllocateMidPool();
            checkAndAllocateMegaPool();
        }
    }

    // ======== Eligibility ========

    function _revokeEligibilityOnSell(address user) private {
        uint256 currentMicroCycle = microPoolCycleId;
        uint256 currentMidCycle = midPoolCycleId;
        uint256 currentMegaCycle = megaPoolCycleId;
        _revokeAndRemove(user, currentMicroCycle, PoolType.Micro);
        _revokeAndRemove(user, currentMidCycle, PoolType.Mid);
        _revokeAndRemove(user, currentMegaCycle, PoolType.Mega);
        if (microPoolPendingRequestId != 0) _revokeAndRemove(user, currentMicroCycle + 1, PoolType.Micro);
        if (midPoolPendingRequestId != 0) _revokeAndRemove(user, currentMidCycle + 1, PoolType.Mid);
        if (megaPoolPendingRequestId != 0) _revokeAndRemove(user, currentMegaCycle + 1, PoolType.Mega);
    }

    function _revokeAndRemove(address user, uint256 cycleId, PoolType poolType) private {
        // Short-circuit: skip expensive storage writes if user was never eligible
        bool eligible;
        if (poolType == PoolType.Micro) eligible = isEligibleForMicroPool[user][cycleId];
        else if (poolType == PoolType.Mid) eligible = isEligibleForMidPool[user][cycleId];
        else eligible = isEligibleForMegaPool[user][cycleId];
        if (!eligible) return;
        _setCycleEligibility(user, cycleId, poolType, false);
        _removeCycleParticipant(user, cycleId, poolType);
    }

    function checkAndUpdateEligibility(address user, uint256 buyAmountETH) internal {
        if (user.code.length > 0) return;
        uint256 userBalance = balanceOf(user);
        if (userBalance < MIN_TOKENS_FOR_REWARDS) return;
        (bool hasReserves, uint256 tokenReserve, uint256 wethReserve) = _getReservesSnapshot();
        uint256 userETHValue = _getTokenValueInETHFromReserves(userBalance, hasReserves, tokenReserve, wethReserve);
        uint256 microRequired = calculateDynamicEntry(microPoolBalance, MICRO_POOL_FLOOR_ETH, MICRO_POOL_ENTRY_CAP_ETH);
        uint256 midRequired = calculateDynamicEntry(midPoolBalance, MID_POOL_FLOOR_ETH, MID_POOL_ENTRY_CAP_ETH);
        uint256 megaRequired = calculateDynamicEntry(_megaPoolEntryBaseBalance(), MEGA_POOL_FLOOR_ETH, MEGA_POOL_ENTRY_CAP_ETH);

        uint256 microCycle = microPoolPendingRequestId == 0 ? microPoolCycleId : microPoolCycleId + 1;
        uint256 midCycle = midPoolPendingRequestId == 0 ? midPoolCycleId : midPoolCycleId + 1;
        uint256 megaCycle = megaPoolPendingRequestId == 0 ? megaPoolCycleId : megaPoolCycleId + 1;

        bool anyChecked;
        // Micro whale exclusion (>3% supply) applied at entry time, not just selection
        if (userETHValue >= microRequired && userBalance <= MICRO_MAX_WHALE_TOKENS) {
            _tryGrantEligibility(user, microCycle, PoolType.Micro, microRequired, buyAmountETH, userBalance, userETHValue, hasReserves, tokenReserve, wethReserve);
            anyChecked = true;
        }
        if (userETHValue >= midRequired) {
            _tryGrantEligibility(user, midCycle, PoolType.Mid, midRequired, buyAmountETH, userBalance, userETHValue, hasReserves, tokenReserve, wethReserve);
            anyChecked = true;
        }
        if (userETHValue >= megaRequired) {
            _tryGrantEligibility(user, megaCycle, PoolType.Mega, megaRequired, buyAmountETH, userBalance, userETHValue, hasReserves, tokenReserve, wethReserve);
            anyChecked = true;
        }
        // NOTE: EligibilityChecked = "check performed" not "eligibility granted".
        // Use getUserStatus() for actual eligibility state.
        if (anyChecked) {
            emit EligibilityChecked(user, userETHValue);
        }
    }

    function _tryGrantEligibility(
        address user, uint256 cycleId, PoolType poolType, uint256 requiredETH,
        uint256 buyAmountETH, uint256 userBalance, uint256 userETHValue,
        bool hasReserves, uint256 tokenReserve, uint256 wethReserve
    ) private {
        bool alreadyEligible;
        if (poolType == PoolType.Micro) alreadyEligible = isEligibleForMicroPool[user][cycleId];
        else if (poolType == PoolType.Mid) alreadyEligible = isEligibleForMidPool[user][cycleId];
        else alreadyEligible = isEligibleForMegaPool[user][cycleId];

        if (!alreadyEligible) {
            // Grant eligibility for this cycle (entries only from actual buys below)
            uint256 requiredTokenHold = _estimateRequiredTokenHold(requiredETH, userBalance, userETHValue, hasReserves, tokenReserve, wethReserve);
            if (requiredTokenHold <= userBalance) {
                _setCycleEligibility(user, cycleId, poolType, true);
                _setCycleRequiredTokenHold(user, cycleId, poolType, requiredTokenHold);
                _addCycleParticipant(user, cycleId, poolType);
                alreadyEligible = true;
            }
        }
        // Already-eligible users are already in the participant set — no re-add needed

        // "Buy-to-Play": all entries (including first) require an actual buy
        // Entry 1: any buy | Entry 2: cumBuy >= 1x threshold | Entry 3: cumBuy >= 2x threshold
        if (alreadyEligible && buyAmountETH > 0 && requiredETH > 0) {
            uint8 pt = uint8(poolType);
            uint8 cnt = poolEntryCount[user][cycleId][pt];
            if (cnt < MAX_ENTRIES_PER_CYCLE) {
                uint128 cum = poolCumBuyETH[user][cycleId][pt] + uint128(buyAmountETH);
                poolCumBuyETH[user][cycleId][pt] = cum;
                uint256 d = uint256(cum) / requiredETH;
                if (d > MAX_ENTRIES_PER_CYCLE - 1) d = MAX_ENTRIES_PER_CYCLE - 1;
                uint8 total = uint8(d + 1);
                if (total > cnt) {
                    _issueEntries(user, cycleId, poolType, total - cnt);
                    poolEntryCount[user][cycleId][pt] = total;
                }
            }
        }
    }

    function _issueEntries(address user, uint256 cycleId, PoolType poolType, uint256 count) private {
        uint256 si;
        if (poolType == PoolType.Micro) {
            si = microPoolTotalEntries;
            for (uint256 i; i < count;) { microPoolEntries[si + i] = user; unchecked { ++i; } }
            microPoolTotalEntries = si + count;
        } else if (poolType == PoolType.Mid) {
            si = midPoolTotalEntries;
            for (uint256 i; i < count;) { midPoolEntries[si + i] = user; unchecked { ++i; } }
            midPoolTotalEntries = si + count;
        } else {
            si = megaPoolTotalEntries;
            for (uint256 i; i < count;) { megaPoolEntries[si + i] = user; unchecked { ++i; } }
            megaPoolTotalEntries = si + count;
        }
        emit EntryIssued(user, uint8(poolType), si, count, cycleId);
    }

    function calculateDynamicEntry(uint256 poolBalance, uint256 floorETH, uint256 capETH) private pure returns (uint256) {
        uint256 calculatedEntry = (poolBalance * DYNAMIC_ENTRY_BPS) / BASIS_POINTS;
        if (calculatedEntry < floorETH) return floorETH;
        if (calculatedEntry > capETH) return capETH;
        return calculatedEntry;
    }

    function _megaPoolEntryBaseBalance() private view returns (uint256) {
        if (megaPoolBalance <= megaPoolExternalInflowPending) return 0;
        return megaPoolBalance - megaPoolExternalInflowPending;
    }

    function _estimateRequiredTokenHold(
        uint256 requiredETH, uint256 userBalance, uint256 userETHValue,
        bool hasReserves, uint256 tokenReserve, uint256 wethReserve
    ) private pure returns (uint256) {
        uint256 requiredTokenHold = hasReserves
            ? _requiredTokensFromKnownReserves(requiredETH, tokenReserve, wethReserve)
            : type(uint256).max;
        if (requiredTokenHold == type(uint256).max) {
            if (userETHValue == 0) return type(uint256).max;
            requiredTokenHold = (userBalance * requiredETH) / userETHValue;
            if ((userBalance * requiredETH) % userETHValue != 0) requiredTokenHold += 1;
        }
        return requiredTokenHold;
    }

    function _getReservesSnapshot() private view returns (bool hasReserves, uint256 tokenReserve, uint256 wethReserve) {
        try IUniswapV2Pair(uniswapPair).getReserves() returns (uint112 r0, uint112 r1, uint32) {
            wethReserve = isWethToken0 ? uint256(r0) : uint256(r1);
            tokenReserve = isWethToken0 ? uint256(r1) : uint256(r0);
            if (wethReserve == 0 || tokenReserve == 0) return (false, 0, 0);
            return (true, tokenReserve, wethReserve);
        } catch {
            return (false, 0, 0);
        }
    }

    function _requiredTokensFromKnownReserves(uint256 requiredETH, uint256 tokenReserve, uint256 wethReserve) private pure returns (uint256) {
        if (requiredETH == 0) return 0;
        if (wethReserve == 0 || tokenReserve == 0 || requiredETH >= wethReserve) return type(uint256).max;
        uint256 numerator = tokenReserve * requiredETH * 1000;
        uint256 denominator = (wethReserve - requiredETH) * 997;
        if (denominator == 0) return type(uint256).max;
        return (numerator / denominator) + 1;
    }

    function _setCycleRequiredTokenHold(address user, uint256 cycleId, PoolType poolType, uint256 requiredTokenHold) private {
        if (poolType == PoolType.Micro) microPoolRequiredTokenHold[user][cycleId] = requiredTokenHold;
        else if (poolType == PoolType.Mid) midPoolRequiredTokenHold[user][cycleId] = requiredTokenHold;
        else megaPoolRequiredTokenHold[user][cycleId] = requiredTokenHold;
    }

    function _getCycleRequiredTokenHold(address user, uint256 cycleId, PoolType poolType) private view returns (uint256) {
        if (poolType == PoolType.Micro) return microPoolRequiredTokenHold[user][cycleId];
        if (poolType == PoolType.Mid) return midPoolRequiredTokenHold[user][cycleId];
        return megaPoolRequiredTokenHold[user][cycleId];
    }

    function _revokeIfBelowRequiredBalance(address user, uint256 projectedBalance) private {
        _revokeCycleIfBelow(user, microPoolCycleId, PoolType.Micro, projectedBalance);
        _revokeCycleIfBelow(user, midPoolCycleId, PoolType.Mid, projectedBalance);
        _revokeCycleIfBelow(user, megaPoolCycleId, PoolType.Mega, projectedBalance);
        if (microPoolPendingRequestId != 0) _revokeCycleIfBelow(user, microPoolCycleId + 1, PoolType.Micro, projectedBalance);
        if (midPoolPendingRequestId != 0) _revokeCycleIfBelow(user, midPoolCycleId + 1, PoolType.Mid, projectedBalance);
        if (megaPoolPendingRequestId != 0) _revokeCycleIfBelow(user, megaPoolCycleId + 1, PoolType.Mega, projectedBalance);
    }

    function _revokeCycleIfBelow(address user, uint256 cycleId, PoolType poolType, uint256 projectedBalance) private {
        uint256 requiredTokenHold = _getCycleRequiredTokenHold(user, cycleId, poolType);
        if (requiredTokenHold == 0 || projectedBalance >= requiredTokenHold) return;
        _revokeAndRemove(user, cycleId, poolType);
    }

    function _getTokenValueInETHFromReserves(
        uint256 tokenAmount, bool hasReserves, uint256 tokenReserve, uint256 wethReserve
    ) private view returns (uint256) {
        if (tokenAmount == 0) return 0;
        if (!hasReserves) return 0;
        uint256 minLiquidity = block.timestamp < deploymentTime + LIQUIDITY_GRACE_PERIOD ? 0 : MIN_WETH_LIQUIDITY;
        if (wethReserve < minLiquidity) return 0;
        uint256 amountInWithFee = tokenAmount * 997;
        uint256 numerator = amountInWithFee * wethReserve;
        uint256 denominator = (tokenReserve * 1000) + amountInWithFee;
        if (denominator == 0) return 0;
        return numerator / denominator;
    }

    function getTokenValueInETH(uint256 tokenAmount) private view returns (uint256) {
        if (tokenAmount == 0) return 0;
        (bool hasReserves, uint256 tokenReserve, uint256 wethReserve) = _getReservesSnapshot();
        return _getTokenValueInETHFromReserves(tokenAmount, hasReserves, tokenReserve, wethReserve);
    }

    // ======== Swap ========

    function swapAndDistribute() private lockTheSwap {
        uint256 microTokens = accumulatedMicroPoolTokens;
        uint256 midTokens = accumulatedMidPoolTokens;
        uint256 megaTokens = accumulatedMegaPoolTokens;
        uint256 marketingTokens = accumulatedMarketingTokens;
        uint256 vrfTokens = accumulatedVrfTokens;
        uint256 totalTokens = microTokens + midTokens + megaTokens + marketingTokens + vrfTokens;
        if (totalTokens == 0) return;

        uint256 contractTokenBalance = balanceOf(address(this));
        if (contractTokenBalance < totalTokens) {
            uint256 scale = (contractTokenBalance * BASIS_POINTS) / totalTokens;
            microTokens = (microTokens * scale) / BASIS_POINTS;
            midTokens = (midTokens * scale) / BASIS_POINTS;
            megaTokens = (megaTokens * scale) / BASIS_POINTS;
            marketingTokens = (marketingTokens * scale) / BASIS_POINTS;
            vrfTokens = contractTokenBalance - microTokens - midTokens - megaTokens - marketingTokens;
            totalTokens = contractTokenBalance;
        }
        if (totalTokens == 0) return;

        uint256 initialETHBalance = address(this).balance;
        bool swapOk = swapTokensForEth(totalTokens);
        uint256 ethReceived = address(this).balance - initialETHBalance;
        if (!swapOk || ethReceived == 0) return;

        uint256 microETH = (ethReceived * microTokens) / totalTokens;
        uint256 midETH = (ethReceived * midTokens) / totalTokens;
        uint256 megaETH = (ethReceived * megaTokens) / totalTokens;
        uint256 marketingETH = (ethReceived * marketingTokens) / totalTokens;
        uint256 vrfETH = (ethReceived * vrfTokens) / totalTokens;
        uint256 remainder = ethReceived - microETH - midETH - megaETH - marketingETH - vrfETH;

        microPoolBalance += microETH;
        midPoolBalance += midETH;
        megaPoolBalance += megaETH + remainder;
        pendingVrfEth += vrfETH;

        if (marketingETH > 0) {
            (bool success,) = marketingWallet.call{value: marketingETH, gas: PAYOUT_GAS_LIMIT}("");
            if (!success) megaPoolBalance += marketingETH;
        }

        emit SwapAndDistribute(totalTokens, ethReceived, vrfETH);

        accumulatedMicroPoolTokens = 0;
        accumulatedMidPoolTokens = 0;
        accumulatedMegaPoolTokens = 0;
        accumulatedMarketingTokens = 0;
        accumulatedVrfTokens = 0;

        _attemptVrfFund();
    }

    function swapTokensForEth(uint256 tokenAmount) private returns (bool) {
        if (block.timestamp < lastFailedSwapTime + SWAP_COOLDOWN) return false;
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = uniswapRouter.WETH();
        uint256 currentAllowance = allowance(address(this), address(uniswapRouter));
        if (currentAllowance < tokenAmount) _approve(address(this), address(uniswapRouter), type(uint256).max);

        uint256 minOut;
        try uniswapRouter.getAmountsOut(tokenAmount, path) returns (uint256[] memory amounts) {
            minOut = (amounts[1] * SWAP_SLIPPAGE_BPS) / BASIS_POINTS;
            if (minOut < SWAP_MIN_OUTPUT_ETH) minOut = SWAP_MIN_OUTPUT_ETH;
        } catch {
            lastFailedSwapTime = block.timestamp;
            return false;
        }

        try uniswapRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount, minOut, path, address(this), block.timestamp
        ) {
            return true;
        } catch {
            lastFailedSwapTime = block.timestamp;
            return false;
        }
    }

    function _attemptVrfFund() private {
        uint256 pending = pendingVrfEth;
        if (pending < VRF_MIN_FUND_ETH) return;
        if (block.timestamp >= lastSuccessfulVrfFundTime + VRF_STALE_REROUTE_TIMEOUT) {
            pendingVrfEth = 0;
            lastSuccessfulVrfFundTime = block.timestamp;
            _rerouteVrfEthToPools(pending, 0);
            return;
        }
        uint256 rerouteAmount;
        uint256 nativeBalance;
        (bool nativeBalanceKnown, uint256 currentNativeBalance) = _getVrfNativeSubscriptionBalance();
        if (!nativeBalanceKnown) { emit VrfSubscriptionFundFailed(pending); return; }
        nativeBalance = currentNativeBalance;
        if (nativeBalance >= VRF_NATIVE_BALANCE_CAP) { rerouteAmount = pending; pending = 0; }
        else {
            uint256 capacity = VRF_NATIVE_BALANCE_CAP - nativeBalance;
            if (pending > capacity) { rerouteAmount = pending - capacity; pending = capacity; }
        }
        pendingVrfEth = 0;
        if (pending > 0) {
            try vrfCoordinator.fundSubscriptionWithNative{value: pending}(vrfSubscriptionId) {
                lastSuccessfulVrfFundTime = block.timestamp;
                emit VrfSubscriptionFunded(pending);
            } catch { pendingVrfEth += pending; emit VrfSubscriptionFundFailed(pending); }
        }
        if (rerouteAmount > 0) _rerouteVrfEthToPools(rerouteAmount, nativeBalance);
    }

    function _getVrfNativeSubscriptionBalance() private view returns (bool known, uint256 nativeBalance) {
        try vrfCoordinator.getSubscription(vrfSubscriptionId) returns (uint96, uint96 nativeBal, uint64, address, address[] memory) {
            return (true, uint256(nativeBal));
        } catch { return (false, 0); }
    }

    function _rerouteVrfEthToPools(uint256 amount, uint256 nativeSubscriptionBalance) private {
        uint256 microAmount = amount / 3;
        uint256 midAmount = amount / 3;
        uint256 megaAmount = amount - microAmount - midAmount;
        microPoolBalance += microAmount;
        midPoolBalance += midAmount;
        megaPoolBalance += megaAmount;
        emit VrfFundingReroutedToPools(amount, microAmount, midAmount, megaAmount, nativeSubscriptionBalance);
    }

    // ======== Allocation logic ========

    function checkAndAllocateMicroPool() private {
        if (microPoolPendingRequestId != 0) return;
        uint256 cycleId = microPoolCycleId;
        uint256 balance = microPoolBalance;
        uint256 participantCount = _getCycleParticipantCount(cycleId, PoolType.Micro);
        if (participantCount == 0 || microPoolTotalEntries <= microPoolRoundStartIndex || balance == 0) {
            _clearVrfRequestFailure(PoolType.Micro); return;
        }
        uint256 timeElapsed = block.timestamp - microPoolLastAllocationTime;
        uint256 threshold = microPoolCurrentThreshold;
        if (balance >= threshold) {
            bool fastFill = timeElapsed < MICRO_LADDER_TIME_LIMIT;
            if (_requestOrFallbackAllocation(PoolType.Micro, cycleId, microPoolRoundStartIndex, microPoolTotalEntries, balance, false) && fastFill) {
                uint256 newThreshold = _raiseThreshold(threshold, MICRO_MAX_THRESHOLD);
                microPoolCurrentThreshold = newThreshold;
                emit PoolThresholdAdjusted(uint8(PoolType.Micro), newThreshold, true);
            }
        } else if (timeElapsed >= MICRO_LADDER_TIME_LIMIT) {
            if (_requestOrFallbackAllocation(PoolType.Micro, cycleId, microPoolRoundStartIndex, microPoolTotalEntries, balance, true)) {
                uint256 newThreshold = _lowerThreshold(threshold, MICRO_BASE_THRESHOLD);
                microPoolCurrentThreshold = newThreshold;
                emit PoolThresholdAdjusted(uint8(PoolType.Micro), newThreshold, false);
            }
        }
    }

    function checkAndAllocateMidPool() private {
        if (midPoolPendingRequestId != 0) return;
        uint256 cycleId = midPoolCycleId;
        uint256 balance = midPoolBalance;
        uint256 participantCount = _getCycleParticipantCount(cycleId, PoolType.Mid);
        if (participantCount == 0 || midPoolTotalEntries <= midPoolRoundStartIndex || balance == 0) {
            _clearVrfRequestFailure(PoolType.Mid); return;
        }
        uint256 timeElapsed = block.timestamp - midPoolLastAllocationTime;
        uint256 threshold = midPoolCurrentThreshold;
        if (balance >= threshold) {
            bool fastFill = timeElapsed < MID_LADDER_TIME_LIMIT;
            if (_requestOrFallbackAllocation(PoolType.Mid, cycleId, midPoolRoundStartIndex, midPoolTotalEntries, balance, false) && fastFill) {
                uint256 newThreshold = _raiseThreshold(threshold, MID_MAX_THRESHOLD);
                midPoolCurrentThreshold = newThreshold;
                emit PoolThresholdAdjusted(uint8(PoolType.Mid), newThreshold, true);
            }
        } else if (timeElapsed >= MID_LADDER_TIME_LIMIT) {
            if (_requestOrFallbackAllocation(PoolType.Mid, cycleId, midPoolRoundStartIndex, midPoolTotalEntries, balance, true)) {
                uint256 newThreshold = _lowerThreshold(threshold, MID_BASE_THRESHOLD);
                midPoolCurrentThreshold = newThreshold;
                emit PoolThresholdAdjusted(uint8(PoolType.Mid), newThreshold, false);
            }
        }
    }

    function checkAndAllocateMegaPool() private {
        if (megaPoolPendingRequestId != 0) return;
        uint256 cycleId = megaPoolCycleId;
        uint256 balance = megaPoolBalance;
        uint256 participantCount = _getCycleParticipantCount(cycleId, PoolType.Mega);
        if (participantCount == 0 || megaPoolTotalEntries <= megaPoolRoundStartIndex || balance == 0) {
            _clearVrfRequestFailure(PoolType.Mega); return;
        }
        if (block.timestamp >= megaPoolStartTime + MEGA_POOL_DURATION) {
            _requestOrFallbackAllocation(PoolType.Mega, cycleId, megaPoolRoundStartIndex, megaPoolTotalEntries, balance, false);
        }
    }

    // ======== VRF ========

    function _requestPoolAllocation(
        PoolType poolType, uint256 cycleId, uint256 roundStartIndex,
        uint256 totalEntries, uint256 poolAmount, bool forceAllocation
    ) private returns (bool) {
        VRFV2PlusClient.RandomWordsRequest memory req = VRFV2PlusClient.RandomWordsRequest({
            keyHash: vrfKeyHash,
            subId: vrfSubscriptionId,
            requestConfirmations: VRF_REQUEST_CONFIRMATIONS,
            callbackGasLimit: VRF_CALLBACK_GAS_LIMIT,
            numWords: VRF_NUM_WORDS,
            extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: true}))
        });
        try vrfCoordinator.requestRandomWords(req) returns (uint256 requestId) {
            allocationRequests[requestId] = AllocationRequest({
                poolType: uint8(poolType), cycleId: cycleId, roundStartIndex: roundStartIndex,
                totalEntries: totalEntries, poolAmount: poolAmount, forceAllocation: forceAllocation, exists: true
            });
            allocationRequestTimestamps[requestId] = block.timestamp;
            if (poolType == PoolType.Micro) microPoolPendingRequestId = requestId;
            else if (poolType == PoolType.Mid) midPoolPendingRequestId = requestId;
            else megaPoolPendingRequestId = requestId;
            emit AllocationRequested(requestId, uint8(poolType), cycleId, poolAmount, forceAllocation);
            return true;
        } catch {
            emit AllocationRequestFailed(uint8(poolType), cycleId);
            return false;
        }
    }

    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        if (msg.sender != vrfCoordinatorAddress) revert OnlyCoordinator();
        _fulfillRandomWords(requestId, randomWords);
    }

    function _fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal nonReentrant {
        AllocationRequest memory request = allocationRequests[requestId];
        if (!request.exists) revert UnknownRequest(requestId);
        delete allocationRequests[requestId];
        delete allocationRequestTimestamps[requestId];
        if (randomWords.length == 0) revert UnknownRequest(requestId);
        _clearPendingRequestId(request.poolType);
        _finalizeAllocation(PoolType(request.poolType), request, randomWords[0]);
    }

    function _finalizeAllocation(PoolType poolType, AllocationRequest memory request, uint256 randomWord) private {
        inAllocation = true;

        if (poolType == PoolType.Micro) microPoolLastAllocationTime = block.timestamp;
        else if (poolType == PoolType.Mid) midPoolLastAllocationTime = block.timestamp;
        else megaPoolStartTime = block.timestamp;

        uint256 poolBalance;
        if (poolType == PoolType.Micro) poolBalance = microPoolBalance;
        else if (poolType == PoolType.Mid) poolBalance = midPoolBalance;
        else poolBalance = megaPoolBalance;

        uint256 prize = request.poolAmount > poolBalance ? poolBalance : request.poolAmount;
        address recipient = _selectAndPayRecipient(
            request.cycleId, poolType, randomWord, prize, request.roundStartIndex, request.totalEntries
        );

        if (recipient == address(0)) {
            emit NoEligibleRecipient(uint8(poolType), request.cycleId, request.roundStartIndex, request.totalEntries);
        } else {
            if (request.forceAllocation && poolType != PoolType.Mega) {
                emit ForceAllocationExecuted(uint8(poolType), prize, request.cycleId);
            }
            emit PoolAllocated(uint8(poolType), recipient, prize, request.cycleId);
        }
        _resetPoolCycle(poolType, request.totalEntries);

        inAllocation = false;
    }

    function _selectAndPayRecipient(
        uint256 cycleId, PoolType poolType, uint256 randomWord, uint256 prize,
        uint256 roundStartIndex, uint256 totalEntries
    ) private returns (address recipient) {
        uint256 roundEntryCount = totalEntries > roundStartIndex ? totalEntries - roundStartIndex : 0;
        if (prize == 0 || roundEntryCount == 0) return address(0);
        uint256 maxAttempts = roundEntryCount > MAX_RECIPIENT_ATTEMPTS ? MAX_RECIPIENT_ATTEMPTS : roundEntryCount;
        uint256 entropy = randomWord;
        for (uint256 i; i < maxAttempts;) {
            if (gasleft() < RECIPIENT_SELECTION_GAS_RESERVE) break;
            uint256 index = entropy % roundEntryCount;
            address candidate = _getEntryAt(poolType, roundStartIndex + index);
            if (candidate != address(0) && _isEligibleCandidate(candidate, cycleId, poolType)) {
                if (poolType == PoolType.Micro) microPoolBalance -= prize;
                else if (poolType == PoolType.Mid) midPoolBalance -= prize;
                else megaPoolBalance -= prize;
                (bool success,) = candidate.call{value: prize, gas: PAYOUT_GAS_LIMIT}("");
                if (success) return candidate;
                if (poolType == PoolType.Micro) microPoolBalance += prize;
                else if (poolType == PoolType.Mid) midPoolBalance += prize;
                else megaPoolBalance += prize;
                emit PayoutFailed(candidate, prize);
                // Payout failed — mark ineligible so we don't retry this address
                _setCycleEligibility(candidate, cycleId, poolType, false);
            }
            entropy = uint256(keccak256(abi.encodePacked(entropy, candidate, i)));
            unchecked { ++i; }
        }
        return address(0);
    }

    function _getEntryAt(PoolType poolType, uint256 index) private view returns (address) {
        if (poolType == PoolType.Micro) return microPoolEntries[index];
        if (poolType == PoolType.Mid) return midPoolEntries[index];
        return megaPoolEntries[index];
    }

    // ======== Participant set management ========

    function _setCycleEligibility(address user, uint256 cycleId, PoolType poolType, bool eligible) private {
        if (poolType == PoolType.Micro) isEligibleForMicroPool[user][cycleId] = eligible;
        else if (poolType == PoolType.Mid) isEligibleForMidPool[user][cycleId] = eligible;
        else isEligibleForMegaPool[user][cycleId] = eligible;
        if (!eligible) _setCycleRequiredTokenHold(user, cycleId, poolType, 0);
    }

    function _addCycleParticipant(address user, uint256 cycleId, PoolType poolType) private {
        if (user == address(0)) return;
        if (poolType == PoolType.Micro) _addParticipant(microPoolCycleParticipants[cycleId], microPoolCycleParticipantIndexPlusOne[cycleId], user);
        else if (poolType == PoolType.Mid) _addParticipant(midPoolCycleParticipants[cycleId], midPoolCycleParticipantIndexPlusOne[cycleId], user);
        else _addParticipant(megaPoolCycleParticipants[cycleId], megaPoolCycleParticipantIndexPlusOne[cycleId], user);
    }

    function _removeCycleParticipant(address user, uint256 cycleId, PoolType poolType) private {
        if (user == address(0)) return;
        if (poolType == PoolType.Micro) _removeParticipant(microPoolCycleParticipants[cycleId], microPoolCycleParticipantIndexPlusOne[cycleId], user);
        else if (poolType == PoolType.Mid) _removeParticipant(midPoolCycleParticipants[cycleId], midPoolCycleParticipantIndexPlusOne[cycleId], user);
        else _removeParticipant(megaPoolCycleParticipants[cycleId], megaPoolCycleParticipantIndexPlusOne[cycleId], user);
    }

    function _addParticipant(address[] storage participants, mapping(address => uint256) storage indexPlusOneMap, address user) private {
        if (indexPlusOneMap[user] != 0) return;
        participants.push(user);
        indexPlusOneMap[user] = participants.length;
    }

    function _removeParticipant(address[] storage participants, mapping(address => uint256) storage indexPlusOneMap, address user) private {
        uint256 indexPlusOne = indexPlusOneMap[user];
        if (indexPlusOne == 0) return;
        uint256 length = participants.length;
        if (length == 0) { delete indexPlusOneMap[user]; return; }
        uint256 index = indexPlusOne - 1;
        if (index >= length) { delete indexPlusOneMap[user]; return; }
        uint256 lastIndex = length - 1;
        if (index != lastIndex) {
            address lastParticipant = participants[lastIndex];
            participants[index] = lastParticipant;
            indexPlusOneMap[lastParticipant] = index + 1;
        }
        participants.pop();
        delete indexPlusOneMap[user];
    }

    function _getCycleParticipantCount(uint256 cycleId, PoolType poolType) private view returns (uint256) {
        if (poolType == PoolType.Micro) return microPoolCycleParticipants[cycleId].length;
        if (poolType == PoolType.Mid) return midPoolCycleParticipants[cycleId].length;
        return megaPoolCycleParticipants[cycleId].length;
    }

    function _isEligibleCandidate(address candidate, uint256 cycleId, PoolType poolType) private view returns (bool) {
        if (candidate == address(0)) return false;
        bool cycleEligible;
        if (poolType == PoolType.Micro) cycleEligible = isEligibleForMicroPool[candidate][cycleId];
        else if (poolType == PoolType.Mid) cycleEligible = isEligibleForMidPool[candidate][cycleId];
        else cycleEligible = isEligibleForMegaPool[candidate][cycleId];
        if (!cycleEligible) return false;
        if (candidate.code.length > 0) return false;
        uint256 balance = balanceOf(candidate);
        uint256 requiredTokenHold = _getCycleRequiredTokenHold(candidate, cycleId, poolType);
        if (requiredTokenHold > 0 && balance < requiredTokenHold) return false;
        if (poolType == PoolType.Micro && balance > MICRO_MAX_WHALE_TOKENS) return false;
        return true;
    }

    // ======== Cycle reset + cleanup ========

    function _resetPoolCycle(PoolType poolType, uint256 newRoundStartIndex) private {
        vrfRequestFailureSince[uint8(poolType)] = 0;
        if (poolType == PoolType.Micro) {
            unchecked { ++microPoolCycleId; }
            microPoolRoundStartIndex = newRoundStartIndex;
            microPoolCleanupIndex = _cleanupEntries(microPoolEntries, newRoundStartIndex, microPoolCleanupIndex);
        } else if (poolType == PoolType.Mid) {
            unchecked { ++midPoolCycleId; }
            midPoolRoundStartIndex = newRoundStartIndex;
            midPoolCleanupIndex = _cleanupEntries(midPoolEntries, newRoundStartIndex, midPoolCleanupIndex);
        } else {
            unchecked { ++megaPoolCycleId; }
            megaPoolRoundStartIndex = newRoundStartIndex;
            megaPoolExternalInflowPending = 0;
            megaPoolCleanupIndex = _cleanupEntries(megaPoolEntries, newRoundStartIndex, megaPoolCleanupIndex);
        }
    }

    function _cleanupEntries(mapping(uint256 => address) storage entries, uint256 newRoundStartIndex, uint256 cleanupIndex) private returns (uint256) {
        if (cleanupIndex >= newRoundStartIndex) return cleanupIndex;
        uint256 startGas = gasleft();
        while (cleanupIndex < newRoundStartIndex) {
            if (startGas - gasleft() >= MAX_CLEANUP_GAS) break;
            delete entries[cleanupIndex];
            unchecked { ++cleanupIndex; }
        }
        return cleanupIndex;
    }

    // ======== View helpers ========

    function getPoolInfo(uint8 pt) external view returns (
        uint256 balance, uint256 entryRequirementETH, uint256 currentThreshold,
        uint256 timeUntilExpiry, uint256 cycleId, uint256 participantCount
    ) {
        if (pt > uint8(PoolType.Mega)) revert InvalidPoolType(pt);
        if (pt == uint8(PoolType.Micro)) {
            uint256 elapsed = block.timestamp - microPoolLastAllocationTime;
            return (microPoolBalance, calculateDynamicEntry(microPoolBalance, MICRO_POOL_FLOOR_ETH, MICRO_POOL_ENTRY_CAP_ETH), microPoolCurrentThreshold, elapsed >= MICRO_LADDER_TIME_LIMIT ? 0 : MICRO_LADDER_TIME_LIMIT - elapsed, microPoolCycleId, _getCycleParticipantCount(microPoolCycleId, PoolType.Micro));
        } else if (pt == uint8(PoolType.Mid)) {
            uint256 elapsed = block.timestamp - midPoolLastAllocationTime;
            return (midPoolBalance, calculateDynamicEntry(midPoolBalance, MID_POOL_FLOOR_ETH, MID_POOL_ENTRY_CAP_ETH), midPoolCurrentThreshold, elapsed >= MID_LADDER_TIME_LIMIT ? 0 : MID_LADDER_TIME_LIMIT - elapsed, midPoolCycleId, _getCycleParticipantCount(midPoolCycleId, PoolType.Mid));
        } else {
            uint256 endTime_ = megaPoolStartTime + MEGA_POOL_DURATION;
            return (megaPoolBalance, calculateDynamicEntry(_megaPoolEntryBaseBalance(), MEGA_POOL_FLOOR_ETH, MEGA_POOL_ENTRY_CAP_ETH), 0, block.timestamp >= endTime_ ? 0 : endTime_ - block.timestamp, megaPoolCycleId, _getCycleParticipantCount(megaPoolCycleId, PoolType.Mega));
        }
    }

    /// @notice Get user's eligibility and entry count for all pools (required ETH via getPoolInfo)
    function getUserStatus(address user) external view returns (
        bool microEligible, uint8 microEntries,
        bool midEligible, uint8 midEntries,
        bool megaEligible, uint8 megaEntries
    ) {
        uint256 mc = microPoolPendingRequestId == 0 ? microPoolCycleId : microPoolCycleId + 1;
        uint256 midc = midPoolPendingRequestId == 0 ? midPoolCycleId : midPoolCycleId + 1;
        uint256 megc = megaPoolPendingRequestId == 0 ? megaPoolCycleId : megaPoolCycleId + 1;
        microEligible = isEligibleForMicroPool[user][mc];
        midEligible = isEligibleForMidPool[user][midc];
        megaEligible = isEligibleForMegaPool[user][megc];
        microEntries = poolEntryCount[user][mc][uint8(PoolType.Micro)];
        midEntries = poolEntryCount[user][midc][uint8(PoolType.Mid)];
        megaEntries = poolEntryCount[user][megc][uint8(PoolType.Mega)];
    }

}

