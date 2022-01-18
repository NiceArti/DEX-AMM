// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;



interface IFactory 
{
  event PairCreated(address pairAddress);

  function createPair(address A, address B) external returns (address);
  function isPairCreated(address A, address B) external view returns(address);
}
