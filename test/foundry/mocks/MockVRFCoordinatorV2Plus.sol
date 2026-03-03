// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @dev Minimal mock VRF Coordinator for Foundry tests.
 */
contract MockVRFCoordinatorV2Plus {
    struct Subscription {
        uint96 balance;
        uint96 nativeBalance;
        uint64 reqCount;
        address owner;
        address[] consumers;
    }

    uint256 public nextSubId = 1;
    uint256 public nextRequestId = 1;
    mapping(uint256 => Subscription) private subs;
    mapping(uint256 => address) public requestConsumer; // requestId → consumer
    mapping(uint256 => uint256) public requestSubId;    // requestId → subId

    event RandomWordsRequested(uint256 requestId, address consumer);

    function createSubscription() external returns (uint256 subId) {
        subId = nextSubId++;
        subs[subId].owner = msg.sender;
    }

    function addConsumer(uint256 subId, address consumer) external {
        subs[subId].consumers.push(consumer);
    }

    function fundSubscriptionWithNative(uint256 subId) external payable {
        subs[subId].nativeBalance += uint96(msg.value);
    }

    function getSubscription(uint256 subId) external view returns (
        uint96 balance, uint96 nativeBalance, uint64 reqCount, address owner, address[] memory consumers
    ) {
        Subscription storage sub = subs[subId];
        return (sub.balance, sub.nativeBalance, sub.reqCount, sub.owner, sub.consumers);
    }

    struct RandomWordsRequest {
        bytes32 keyHash;
        uint256 subId;
        uint16 requestConfirmations;
        uint32 callbackGasLimit;
        uint32 numWords;
        bytes extraArgs;
    }

    function requestRandomWords(RandomWordsRequest calldata req) external returns (uint256 requestId) {
        requestId = nextRequestId++;
        requestConsumer[requestId] = msg.sender;
        requestSubId[requestId] = req.subId;
        subs[req.subId].reqCount++;
        emit RandomWordsRequested(requestId, msg.sender);
    }

    /// @dev Test helper — call this to fulfill a pending VRF request
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        address consumer = requestConsumer[requestId];
        require(consumer != address(0), "VRF: unknown request");
        delete requestConsumer[requestId];

        // Call rawFulfillRandomWords on the consumer
        (bool success, bytes memory reason) = consumer.call(
            abi.encodeWithSignature("rawFulfillRandomWords(uint256,uint256[])", requestId, randomWords)
        );
        require(success, string(abi.encodePacked("VRF: fulfill failed: ", reason)));
    }

    /// @dev Returns pending request ID for a consumer (0 if none)
    function getPendingRequestId() external view returns (uint256) {
        // Simple — return highest unfulfilled
        for (uint256 i = nextRequestId - 1; i >= 1; i--) {
            if (requestConsumer[i] != address(0)) return i;
            if (i == 1) break;
        }
        return 0;
    }
}
