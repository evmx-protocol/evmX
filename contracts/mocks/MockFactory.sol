// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MockPair.sol";

contract MockFactory {
    mapping(address => mapping(address => address)) public getPair;

    event PairCreated(address indexed token0, address indexed token1, address pair);

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "IDENTICAL_ADDRESSES");
        require(getPair[tokenA][tokenB] == address(0), "PAIR_EXISTS");

        MockPair newPair = new MockPair(tokenA, tokenB);
        pair = address(newPair);

        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;

        emit PairCreated(tokenA, tokenB, pair);
    }
}
