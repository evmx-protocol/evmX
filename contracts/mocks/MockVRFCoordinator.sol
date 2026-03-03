// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IVRFConsumer {
    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external;
}

contract MockVRFCoordinator {
    uint256 private nextRequestId = 1;
    uint256 public subscriptionNativeBalance;
    mapping(uint256 => address) public requestConsumer;
    mapping(uint256 => bool) public requestPending;

    // Subscription state
    struct Subscription {
        uint96 balance;
        uint96 nativeBalance;
        uint64 reqCount;
        address owner;
        address[] consumers;
    }

    mapping(uint256 => Subscription) public subscriptions;

    event RandomWordsRequested(uint256 indexed requestId, address consumer);
    event RandomWordsFulfilled(uint256 indexed requestId, uint256[] randomWords);

    function createSubscription(uint256 subId, address owner) external {
        subscriptions[subId].owner = owner;
        subscriptions[subId].nativeBalance = 1 ether; // Start with some balance
    }

    function addConsumer(uint256 subId, address consumer) external {
        subscriptions[subId].consumers.push(consumer);
    }

    function getSubscription(uint256 subId) external view returns (
        uint96 balance, uint96 nativeBalance, uint64 reqCount, address owner, address[] memory consumers
    ) {
        Subscription storage sub = subscriptions[subId];
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

    function requestRandomWords(RandomWordsRequest calldata /* req */) external returns (uint256 requestId) {
        requestId = nextRequestId++;
        requestConsumer[requestId] = msg.sender;
        requestPending[requestId] = true;
        emit RandomWordsRequested(requestId, msg.sender);
    }

    /// @notice Manually fulfill a VRF request — callable by test scripts
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) external {
        require(requestPending[requestId], "No pending request");
        address consumer = requestConsumer[requestId];
        require(consumer != address(0), "No consumer");

        requestPending[requestId] = false;

        IVRFConsumer(consumer).rawFulfillRandomWords(requestId, randomWords);

        emit RandomWordsFulfilled(requestId, randomWords);
    }

    /// @notice Fulfill with a single random word (convenience)
    function fulfillRandomWordsSimple(uint256 requestId, uint256 randomWord) external {
        uint256[] memory words = new uint256[](1);
        words[0] = randomWord;

        require(requestPending[requestId], "No pending request");
        address consumer = requestConsumer[requestId];
        require(consumer != address(0), "No consumer");

        requestPending[requestId] = false;

        IVRFConsumer(consumer).rawFulfillRandomWords(requestId, words);

        emit RandomWordsFulfilled(requestId, words);
    }

    function fundSubscriptionWithNative(uint256 subId) external payable {
        subscriptions[subId].nativeBalance += uint96(msg.value);
        subscriptionNativeBalance += msg.value;
    }

    /// @notice Get the latest request ID
    function getLastRequestId() external view returns (uint256) {
        return nextRequestId - 1;
    }

    receive() external payable {}
}
