// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MockWETH.sol";

interface IERC20Minimal {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

contract MockPair {
    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    constructor(address _token0, address _token1) {
        // Sort tokens like Uniswap does
        if (uint160(_token0) < uint160(_token1)) {
            token0 = _token0;
            token1 = _token1;
        } else {
            token0 = _token1;
            token1 = _token0;
        }
    }

    function setReserves(uint112 _reserve0, uint112 _reserve1) external {
        reserve0 = _reserve0;
        reserve1 = _reserve1;
        blockTimestampLast = uint32(block.timestamp);
    }

    function syncReserves() external {
        reserve0 = uint112(IERC20Minimal(token0).balanceOf(address(this)));
        reserve1 = uint112(IERC20Minimal(token1).balanceOf(address(this)));
        blockTimestampLast = uint32(block.timestamp);
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, blockTimestampLast);
    }
}
