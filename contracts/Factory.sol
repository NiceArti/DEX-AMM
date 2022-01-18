// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Pair.sol";
import "./Token.sol";
import "./interfaces/IFactory.sol";


contract Factory is IFactory
{
  address public WETH;

  mapping(address => mapping(address => address)) private getPair;

  constructor()
  {
    ERC20 weth = new ERC20("Wrapped ETH", "WETH");
    WETH = address(weth);
  }




  /**
  *   Function createPair
  *   return type : address
  *   @param A    : address
  *   @param B    : address
  *
  *   This function gets addresses of two ERC20 tokens
  *   and creates pair between them
  *   If pair exists function exits itself
  */
  function createPair(address A, address B) public override returns (address) 
  {
    require(B != A, "Factory: address must be unique");
    
    (address first, address second) = _swapTokens(A, B);
    string memory symbol = _pairName(first, second);

    require(B != address(0) || A != address(0), "Factory: zero address");
    require(getPair[first][second] == address(0), "Factory: pair already exists");


    address newPair = _createPair(first, second, symbol);
    
    emit PairCreated(address(newPair));
    return address(newPair);
  }

  
  function isPairCreated(address A, address B) public override view returns(address)
  {
    (address first, address second) = _swapTokens(A, B);
    return getPair[first][second];
  }


  /**
  *   Function _pairName
  *   return type string
  *   @param A : address
  *   @param B : address
  *
  *   This function gets addresses of two ERC20 tokens
  *   and returns lp-name of them Ex: USDT-DAI-LP
  */
  function _pairName(address A, address B) internal view returns(string memory)
  {
      ERC20 _A = ERC20(A);
      ERC20 _B = ERC20(B);

      return string(abi.encodePacked(_A.symbol(), "-", _B.symbol(), "-LP"));
  }




  /**
  *   Function _createPair
  *   return type   : address
  *   @param A      : address
  *   @param B      : address
  *   @param symbol : string
  *
  *   This function gets addresses of two ERC20 tokens
  *   and ther created symbol and then returns the address of them
  */
  function _createPair(address A, address B, string memory symbol) internal returns(address)
  {
    Pair newPair = new Pair(A, B, "LP-Token", symbol, WETH);
    return getPair[A][B] = address(newPair);
  }



  /**
  *   Function _swapTokens
  *   return type   : address
  *   @param A      : address
  *   @param B      : address
  *
  *   This function gets addresses of two ERC20 tokens
  *   and then switch their places
  */
  function _swapTokens(address A, address B) internal view returns (address first, address second)
  {
    (first, second) = A == WETH ? (A, B) : B == WETH ? (B, A) : A > B ? (A, B) : (B, A);
  }

}
