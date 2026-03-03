// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MockWETH.sol";
import "./MockPair.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
    function allowance(address, address) external view returns (uint256);
}

contract MockRouter {
    address public immutable factoryAddr;
    address public immutable wethAddr;

    constructor(address _factory, address _weth) {
        factoryAddr = _factory;
        wethAddr = _weth;
    }

    function factory() external view returns (address) {
        return factoryAddr;
    }

    function WETH() external view returns (address) {
        return wethAddr;
    }

    /// @dev Simulates Uniswap getAmountsOut using constant product x*y=k
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        require(path.length == 2, "Invalid path");
        amounts = new uint256[](2);
        amounts[0] = amountIn;

        // Get pair reserves
        address pairAddr = _getPair(path[0], path[1]);
        if (pairAddr == address(0)) {
            amounts[1] = 0;
            return amounts;
        }

        (uint112 r0, uint112 r1,) = MockPair(pairAddr).getReserves();
        address token0 = MockPair(pairAddr).token0();

        uint256 reserveIn;
        uint256 reserveOut;
        if (path[0] == token0) {
            reserveIn = uint256(r0);
            reserveOut = uint256(r1);
        } else {
            reserveIn = uint256(r1);
            reserveOut = uint256(r0);
        }

        if (reserveIn == 0 || reserveOut == 0) {
            amounts[1] = 0;
            return amounts;
        }

        // Uniswap V2 formula with 0.3% fee
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        amounts[1] = numerator / denominator;
    }

    /// @dev Simulates swap: takes tokens from sender, sends ETH back
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external {
        require(path.length == 2, "Invalid path");
        require(path[1] == wethAddr, "Must end with WETH");

        address pairAddr = _getPair(path[0], path[1]);
        require(pairAddr != address(0), "No pair");

        // Transfer tokens from sender to pair
        uint256 balBefore = IERC20(path[0]).balanceOf(pairAddr);
        IERC20(path[0]).transferFrom(msg.sender, pairAddr, amountIn);
        uint256 actualIn = IERC20(path[0]).balanceOf(pairAddr) - balBefore;

        // Calculate output
        (uint112 r0, uint112 r1,) = MockPair(pairAddr).getReserves();
        address token0 = MockPair(pairAddr).token0();

        uint256 reserveIn;
        uint256 reserveOut;
        if (path[0] == token0) {
            reserveIn = uint256(r0);
            reserveOut = uint256(r1);
        } else {
            reserveIn = uint256(r1);
            reserveOut = uint256(r0);
        }

        uint256 amountInWithFee = actualIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        uint256 amountOut = numerator / denominator;

        require(amountOut >= amountOutMin, "INSUFFICIENT_OUTPUT");

        // Update reserves
        if (path[0] == token0) {
            MockPair(pairAddr).setReserves(uint112(reserveIn + actualIn), uint112(reserveOut - amountOut));
        } else {
            MockPair(pairAddr).setReserves(uint112(reserveOut - amountOut), uint112(reserveIn + actualIn));
        }

        // Send WETH from pair, then unwrap to ETH and send to recipient
        // For simplicity: the pair must hold enough WETH. We withdraw from WETH and send ETH.
        MockWETH(payable(wethAddr)).withdraw(amountOut);
        (bool success,) = to.call{value: amountOut}("");
        require(success, "ETH transfer failed");
    }

    /// @dev Simulates addLiquidityETH
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 /* amountTokenMin */,
        uint256 /* amountETHMin */,
        address /* to */,
        uint256 /* deadline */
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        address pairAddr = _getPair(token, wethAddr);
        require(pairAddr != address(0), "No pair");

        amountToken = amountTokenDesired;
        amountETH = msg.value;

        // Transfer token to pair
        IERC20(token).transferFrom(msg.sender, pairAddr, amountToken);

        // Wrap ETH and send to pair
        MockWETH(payable(wethAddr)).deposit{value: amountETH}();
        MockWETH(payable(wethAddr)).transfer(pairAddr, amountETH);

        // Sync reserves
        MockPair(pairAddr).syncReserves();

        liquidity = amountETH; // Simplified
    }

    function _getPair(address tokenA, address tokenB) internal view returns (address) {
        // Try factory getPair
        (bool success, bytes memory data) = factoryAddr.staticcall(
            abi.encodeWithSignature("getPair(address,address)", tokenA, tokenB)
        );
        if (success && data.length >= 32) {
            address pair = abi.decode(data, (address));
            return pair;
        }
        return address(0);
    }

    receive() external payable {}
}
