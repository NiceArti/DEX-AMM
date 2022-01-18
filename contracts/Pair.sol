// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Token.sol";
import "./libraries/Math.sol";
import "./interfaces/IPair.sol";

contract Pair is ERC20, IPair
{
    address public token1;
    address public token2;

    uint256 public reserve1;
    uint256 public reserve2;

    address private WETH;


    constructor(address _token1, address _token2, string memory _name,  string memory _symbol, address weth) ERC20(_name, _symbol) 
    {
        require(_token1 != address(0) || _token2 != address(0), "Pair: zero address");

        WETH = weth;
        token1 = _token1;
        token2 = _token2;
    }


    /**
    *   Function addLiquidity
    *
    *   @param _token1Amount   : uint256
    *   @param _token2Amount   : uint256
    *   @param token1Address   : address
    *
    *   This function creates liquidity between two tokens
    *   ERC20 that someone wants to make
    */
    function addLiquidity(uint256 _token1Amount, uint256 _token2Amount, address token1Address) public override
    {
        //swap amounts if order is reversed, used for UI and tests
        if(token2 == token1Address) 
        {
            uint256 helper;
            helper = _token1Amount;
            _token1Amount = _token2Amount;
            _token2Amount = helper;
        }


        (uint256 token1Reserve, uint256 token2Reserve) = getReserve();
        uint256 _totalSupply = totalSupply();
        uint256 liquidity;


        if (token1Reserve == 0 && token2Reserve == 0) 
        {
            IERC20(token1).transferFrom(msg.sender, address(this), _token1Amount);
            IERC20(token2).transferFrom(msg.sender, address(this), _token2Amount);
            liquidity = Math.sqrt(_token1Amount * _token2Amount);
        } 
        else 
        {
            uint256 token1Amount = (_token2Amount * token1Reserve) / token2Reserve;
            require(token1Amount >= _token1Amount, "Pair: wrong rate");
            
            IERC20(token1).transferFrom(msg.sender, address(this), _token1Amount);
            IERC20(token2).transferFrom(msg.sender, address(this), _token2Amount);
            
            liquidity = Math.min(_token1Amount * _totalSupply / token1Reserve, _token2Amount * _totalSupply / token2Reserve);
        }


        require(liquidity > 0, "Pair: liquidity is low");
        _mint(msg.sender, liquidity);

        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 balance2 = IERC20(token2).balanceOf(address(this));
        update(balance1, balance2);

        emit LiquidityAdded(liquidity, msg.sender);
    }

    /**
    *   Function addLiquidityETH
    *
    *   @param _token2Amount     : uint256
    *
    *   This function creates liquidity between two tokens
    *   ERC20 and ETH that someone wants to make
    */
    function addLiquidityETH(uint256 _token2Amount) public payable override
    {
        require(token1 == WETH, "Pair: pull must be either");

        uint256 _token1Amount = msg.value;
        (uint256 token1Reserve, uint256 token2Reserve) = getReserve();
        uint256 _totalSupply = totalSupply();
        uint256 liquidity;
        
        if (token1Reserve == 0 && token2Reserve == 0) 
        {
            reserve1 += _token1Amount;
            IERC20(token2).transferFrom(msg.sender, address(this), _token2Amount);
            
            liquidity = Math.sqrt(_token1Amount * _token2Amount);
        } 
        else 
        {
            uint256 token1Amount = (_token2Amount * token1Reserve) / token2Reserve;
            require(token1Amount >= _token1Amount, "Pair: wrong rate");
            
            reserve1 += _token1Amount;
            IERC20(token2).transferFrom(msg.sender, address(this), _token2Amount);
            liquidity = Math.min(_token1Amount * _totalSupply / token1Reserve, _token2Amount * _totalSupply / token2Reserve);
        }

        require(liquidity > 0, "Pair: liquidity is low");
        
        _mint(msg.sender, liquidity);
        
        reserve2 = IERC20(token2).balanceOf(address(this));

        emit LiquidityAdded(liquidity, msg.sender);
    }


    /**
    *   Function getAmount
    *   returns (uint256) 
    *
    *   @param inputAmount     : uint256
    *   @param inputReserve    : uint256
    *   @param outputReserve   : uint256
    *
    *   This function by formula get amount of one token
    *   using reserve of other and make their price automatically
    */
    function getAmount(uint256 inputAmount, uint256 inputReserve, uint256 outputReserve) private pure returns (uint256) 
    {
        require(inputReserve > 0 && outputReserve > 0, "Pair: wrong reserves");

        uint256 inputAmountWithFee = inputAmount * 997;
        uint256 numerator = inputAmountWithFee * outputReserve;
        uint256 denominator = (inputReserve * 1000) + inputAmountWithFee;
        
        return numerator / denominator;
    }

    /**
    *   Function getTokenAmount
    *   returns (uint256) 
    *
    *   @param tokenSold           : uint256
    *   @param tokenSoldAddress    : address    
    *
    *   This function gets amount of LP tokens
    */
    function getTokenAmount(uint256 tokenSold, address tokenSoldAddress) public override view returns (uint256) 
    {
        require(tokenSold > 0, "Pair: value must be more than 0");
        require(tokenSoldAddress == token1 || tokenSoldAddress == token2, "Pair: wrong address of solden tokens");

        
        (uint256 token1Reserve, uint256 token2Reserve) = getReserve();
       
        if(tokenSoldAddress == token1) return getAmount(tokenSold, token1Reserve, token2Reserve);
        else return getAmount(tokenSold, token2Reserve, token1Reserve);
    }




    /**
    *   Function swap
    *
    *   @param soldAmount           : uint256
    *   @param _minAmount           : uint256
    *   @param _tokenSoldAddress    : address    
    *
    *   This function swaps tokens
    */
    function swap(uint256 soldAmount, uint256 _minAmount, address _tokenSoldAddress) public override
    {
        require(soldAmount > 0, "Pair: value must be more than 0");
        require(_tokenSoldAddress == token1 || _tokenSoldAddress == token2, "Pair: wrong address of solden tokens");
        (uint256 token1Reserve, uint256 token2Reserve) = getReserve();
        
        
        (_tokenSoldAddress == token1) 
        ? _swap(soldAmount, token1Reserve, token2Reserve, _minAmount)
        : _swap(soldAmount, token2Reserve, token1Reserve, _minAmount);


        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 balance2 = IERC20(token2).balanceOf(address(this));

        update(balance1, balance2);
    }


    /**
    *   Function _swap
    *
    *   @param soldAmount     : uint256
    *   @param token1Reserve  : uint256
    *   @param token2Reserve  : uint256
    *   @param _minAmount     : uint256
    *
    *   This is low-level function that swaps tokens
    *   it uses for level up function swap
    */
    function _swap(uint256 soldAmount, uint256 token1Reserve, uint256 token2Reserve, uint256 _minAmount) internal
    {
        uint256 tokenBought = getAmount(soldAmount, token1Reserve, token2Reserve);
        require(tokenBought >= _minAmount,"Pair: not enough tokens");
        IERC20(token1).transferFrom(msg.sender, address(this), soldAmount);
        IERC20(token2).transfer(msg.sender, tokenBought);
    }



    /**
    *   Function ethToTokenSwap
    *
    *   @param _minTokens     : uint256
    *
    *   This function swaps ether with token
    */
    function ethToTokenSwap(uint256 _minTokens) public override payable 
    {
        require(token1 == WETH, "Pair: This is not ether pair");

        (uint256 ethReserve, uint256 tokenReserve) = getReserve();
        uint256 tokensBought = getAmount( msg.value, ethReserve, tokenReserve);
        
        require(tokensBought >= _minTokens, "Pair: not enough balance");
        
        IERC20(token2).transfer(msg.sender, tokensBought);
        
        reserve1 += msg.value;
        reserve2 -= tokensBought;
    }

    /**
    *   Function tokenToEthSwap
    *
    *   @param _tokensSold  : uint256
    *   @param _minEth      : uint256
    *
    *   This function swaps token with ether
    */
    function tokenToEthSwap(uint256 _tokensSold, uint256 _minEth) public override
    {
        require(token1 == WETH, "Pair: This is not ether pair");

        uint256 ethBought = getAmount(_tokensSold, reserve2, reserve1);

        require(ethBought >= _minEth, "Pair: not enough reserve");

        IERC20(token2).transferFrom(msg.sender, address(this), _tokensSold);
        payable(msg.sender).transfer(ethBought);

        reserve1 -= ethBought;
        reserve2 = IERC20(token2).balanceOf(address(this));
    }


    /**
    *   Function removeLiquidity
    *   returns (uint256, uint256) 
    *
    *   @param _liquidity     : uint256
    *
    *   This function removes LP with TOKEN/TOKEN
    */
    function removeLiquidity(uint256 _liquidity) public override returns (uint256 amount1, uint256 amount2)
    {
        (amount1, amount2) =_removeLiquidity(_liquidity);

        IERC20(token1).transfer(msg.sender, amount1);
        IERC20(token2).transfer(msg.sender, amount2);
        
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 balance2 = IERC20(token2).balanceOf(address(this));
        
        update(balance1, balance2);

        emit LiquidityRemoved(_liquidity, msg.sender);
    }


    /**
    *   Function removeLiquidityETH
    *   returns (uint256, uint256) 
    *
    *   @param _liquidity     : uint256
    *
    *   This function removes LP with TOKEN/ETH 
    */
    function removeLiquidityETH(uint256 _liquidity) public override returns (uint256 amount1, uint256 amount2)
    {
        (amount1, amount2) = _removeLiquidity(_liquidity);

        payable(msg.sender).transfer(amount1);
        IERC20(token2).transfer(msg.sender, amount2);
        
        reserve1 -= amount1;
        reserve2 -= amount2;

        emit LiquidityRemoved(_liquidity, msg.sender);
    }
    

    /**
    *   Function _removeLiquidity
    *   returns (uint256, uint256) 
    *
    *   @param _liquidity     : uint256
    *
    *   This is internal low-level function that makes calculations
    *   that is used for removeLiqudity, and removeLiqudityETH 
    */
    function _removeLiquidity(uint256 _liquidity) internal returns (uint256 amount1, uint256 amount2)
    {
        require(_liquidity > 0, "Pair: invalid amount");

        (uint256 token1Reserve, uint256 token2Reserve) = getReserve();
        uint256 _totalSupply = totalSupply();

        amount1 = _liquidity * token1Reserve / _totalSupply;
        amount2 = _liquidity * token2Reserve / _totalSupply;

        require(amount1 > 0 && amount2 > 0, "Pair: Invalid liqudity");
        _burn(msg.sender, _liquidity);
    }






    /**
    *   Function update
    *   @param balance1     : uint256
    *   @param balance2     : uint256
    *
    *   This function updates reserves when someone deposit or withdraw tokens
    */
    function update(uint256 balance1, uint256 balance2) private 
    {
        require(balance1 <= uint256(2**256 - 1) && balance2 <= uint256(2**256 - 1), 'Pair: stack overflow :D');

        reserve1 = balance1;
        reserve2 = balance2;
    }

    /**
    *   Function getReserve
    *   return type   : uint256
    *
    *   This function gets reserves of two tokens that someone
    *   sets in lp
    */
    function getReserve() public override view returns (uint256, uint256) { return (reserve1, reserve2); }
    
}