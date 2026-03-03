// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MockWETH9.sol";

interface IERC20Minimal {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
    function allowance(address, address) external view returns (uint256);
}

/**
 * @dev Minimal mock pair that holds real reserves and supports sync-like behavior.
 */
contract MockUniswapV2Pair {
    address public token0;
    address public token1;
    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Sync(uint112 reserve0, uint112 reserve1);

    function initialize(address _token0, address _token1) external {
        token0 = _token0;
        token1 = _token1;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, blockTimestampLast);
    }

    function mint(address to) external returns (uint256 liquidity) {
        uint256 balance0 = IERC20Minimal(token0).balanceOf(address(this));
        uint256 balance1 = IERC20Minimal(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - uint256(reserve0);
        uint256 amount1 = balance1 - uint256(reserve1);

        if (totalSupply == 0) {
            liquidity = _sqrt(amount0 * amount1);
        } else {
            liquidity = _min(
                (amount0 * totalSupply) / uint256(reserve0),
                (amount1 * totalSupply) / uint256(reserve1)
            );
        }
        require(liquidity > 0, "Pair: INSUFFICIENT_LIQUIDITY_MINTED");
        balanceOf[to] += liquidity;
        totalSupply += liquidity;

        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    /// @dev Simplified swap — router sends tokens in, pair sends tokens out.
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata) external {
        require(amount0Out > 0 || amount1Out > 0, "Pair: INSUFFICIENT_OUTPUT");
        require(amount0Out < uint256(reserve0) && amount1Out < uint256(reserve1), "Pair: INSUFFICIENT_LIQUIDITY");

        if (amount0Out > 0) IERC20Minimal(token0).transfer(to, amount0Out);
        if (amount1Out > 0) IERC20Minimal(token1).transfer(to, amount1Out);

        uint256 balance0 = IERC20Minimal(token0).balanceOf(address(this));
        uint256 balance1 = IERC20Minimal(token1).balanceOf(address(this));
        _update(balance0, balance1);
    }

    function _update(uint256 balance0, uint256 balance1) private {
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp);
        emit Sync(reserve0, reserve1);
    }

    function _sqrt(uint256 y) private pure returns (uint256 z) {
        if (y > 3) { z = y; uint256 x = y / 2 + 1; while (x < z) { z = x; x = (y / x + x) / 2; } }
        else if (y != 0) { z = 1; }
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) { return a < b ? a : b; }
}

/**
 * @dev Mock factory — creates pairs and tracks them.
 */
contract MockUniswapV2Factory {
    mapping(address => mapping(address => address)) public getPair;

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "Factory: IDENTICAL");
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(getPair[t0][t1] == address(0), "Factory: PAIR_EXISTS");
        MockUniswapV2Pair p = new MockUniswapV2Pair();
        p.initialize(t0, t1);
        pair = address(p);
        getPair[t0][t1] = pair;
        getPair[t1][t0] = pair;
    }
}

/**
 * @dev Mock router with real AMM math for testing.
 */
contract MockUniswapV2Router {
    address public immutable factory;
    address public immutable WETH;

    constructor(address _factory, address _weth) {
        factory = _factory;
        WETH = _weth;
    }

    receive() external payable {}

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        require(deadline >= block.timestamp, "Router: EXPIRED");
        amountToken = amountTokenDesired;
        amountETH = msg.value;

        address pair = MockUniswapV2Factory(factory).getPair(token, WETH);
        require(pair != address(0), "Router: NO_PAIR");

        IERC20Minimal(token).transferFrom(msg.sender, pair, amountToken);
        MockWETH9(payable(WETH)).deposit{value: amountETH}();
        IERC20Minimal(WETH).transfer(pair, amountETH);

        liquidity = MockUniswapV2Pair(pair).mint(to);
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external view returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "Router: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; i++) {
            address pair = MockUniswapV2Factory(factory).getPair(path[i], path[i + 1]);
            (uint112 r0, uint112 r1,) = MockUniswapV2Pair(pair).getReserves();
            address t0 = MockUniswapV2Pair(pair).token0();
            (uint256 rIn, uint256 rOut) = path[i] == t0 ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
            uint256 amtInFee = amounts[i] * 997;
            amounts[i + 1] = (amtInFee * rOut) / (rIn * 1000 + amtInFee);
        }
    }

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable {
        require(deadline >= block.timestamp, "Router: EXPIRED");
        require(path[0] == WETH, "Router: INVALID_PATH");
        MockWETH9(payable(WETH)).deposit{value: msg.value}();

        address pair = MockUniswapV2Factory(factory).getPair(path[0], path[1]);
        IERC20Minimal(WETH).transfer(pair, msg.value);

        (uint112 r0, uint112 r1,) = MockUniswapV2Pair(pair).getReserves();
        address t0 = MockUniswapV2Pair(pair).token0();
        (uint256 rIn, uint256 rOut) = path[0] == t0 ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        uint256 amtInFee = msg.value * 997;
        uint256 amountOut = (amtInFee * rOut) / (rIn * 1000 + amtInFee);

        uint256 balBefore = IERC20Minimal(path[1]).balanceOf(to);
        if (path[0] == t0) {
            MockUniswapV2Pair(pair).swap(0, amountOut, to, "");
        } else {
            MockUniswapV2Pair(pair).swap(amountOut, 0, to, "");
        }
        uint256 received = IERC20Minimal(path[1]).balanceOf(to) - balBefore;
        require(received >= amountOutMin, "Router: INSUFFICIENT_OUTPUT");
    }

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external {
        require(deadline >= block.timestamp, "Router: EXPIRED");
        require(path[path.length - 1] == WETH, "Router: INVALID_PATH");

        address pair = MockUniswapV2Factory(factory).getPair(path[0], path[1]);
        IERC20Minimal(path[0]).transferFrom(msg.sender, pair, amountIn);

        // Recalculate after transfer (fee-on-transfer support)
        (uint112 r0, uint112 r1,) = MockUniswapV2Pair(pair).getReserves();
        address t0 = MockUniswapV2Pair(pair).token0();
        uint256 actualAmountIn = IERC20Minimal(path[0]).balanceOf(pair) - (path[0] == t0 ? uint256(r0) : uint256(r1));

        (uint256 rIn, uint256 rOut) = path[0] == t0 ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        uint256 amtInFee = actualAmountIn * 997;
        uint256 amountOut = (amtInFee * rOut) / (rIn * 1000 + amtInFee);
        require(amountOut >= amountOutMin, "Router: INSUFFICIENT_OUTPUT");

        if (path[0] == t0) {
            MockUniswapV2Pair(pair).swap(0, amountOut, address(this), "");
        } else {
            MockUniswapV2Pair(pair).swap(amountOut, 0, address(this), "");
        }

        MockWETH9(payable(WETH)).withdraw(amountOut);
        (bool s,) = to.call{value: amountOut}("");
        require(s, "Router: ETH transfer failed");
    }
}
