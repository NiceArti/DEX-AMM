// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;



interface IPair 
{
    event LiquidityAdded(uint256 amount, address from);
    event LiquidityRemoved(uint256 amount, address from);

    function addLiquidity(uint256 _token1Amount, uint256 _token2Amount, address token1Address) external;
    function addLiquidityETH(uint256 _token2Amount) external payable;
    
    function removeLiquidity(uint256 _liquidity) external returns (uint256 amount1, uint256 amount2);
    function removeLiquidityETH(uint256 _liquidity) external returns (uint256 amount1, uint256 amount2);

    function swap(uint256 soldAmount, uint256 _minAmount, address _tokenSoldAddress) external;

    function ethToTokenSwap(uint256 _minTokens) external payable;
    function tokenToEthSwap(uint256 _tokensSold, uint256 _minEth) external;
    
    function getTokenAmount(uint256 tokenSold, address tokenSoldAddress) external view returns (uint256);
    function getReserve() external view returns (uint256, uint256);

}
