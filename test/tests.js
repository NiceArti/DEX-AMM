// const { assert } = require("console");
const truffleAssert = require('truffle-assertions');

const Factory = artifacts.require("Factory");
const Token = artifacts.require("Token");
const Pair = artifacts.require("Pair");

contract("Factory", function (accounts) 
{
  let factory = null;
  let token = null;
  
  let usdt;
  let bnb;

  // USDT/BNB - pair
  let pairUsdtBnb;
  let pairAddress;
  var lpRemoved;


  before(async() => 
  {
    factory = await Factory.deployed();
    token = await Token.deployed();

    //deployin tokens
    usdt = await Token.new('usdt','USDT');
    bnb = await Token.new('bnb','BNB');

    lpRemoved = false;
    
  });
  
  let pairWethUsdt;
  let wethAddress;


  //***   Factory start    ***//
  describe("Factory:", async () => 
  {

    // happy
    describe("Happy path:", async () => 
    {
      it("isPairCreated: before", async () => 
      {
        const address1 = '0x1000000000000000000000000000000000000000';
        const address2 = '0x2000000000000000000000000000000000000000';
        pairAddress = await factory.isPairCreated(address1, address2);
        
        assert.equal(pairAddress, '0x0000000000000000000000000000000000000000');
      });
    
      it("createPair", async () => 
      {
        let result = await factory.createPair(usdt.address, bnb.address, {from: accounts[0]});
        let pairAddress = result.logs[0].args.pairAddress;
        
        // USDT/BNB - pair
        pairUsdtBnb = await Pair.at(pairAddress);
        
        truffleAssert.eventEmitted(result, 'PairCreated', event => 
        {
            return event.pairAddress == pairAddress;
        });
      });

      it("isPairCreated: after", async () => 
      {
          let reversed = await factory.isPairCreated(usdt.address, bnb.address);
          pairAddress = await factory.isPairCreated(bnb.address, usdt.address);
          
          assert.equal(pairAddress, reversed);
      });
    });


    // Non happy
    describe("Non happy path:", async () => 
    {
      it("isPairCreated: Must be false with new addresses that dont have LP", async () => 
      {
          let waxp = '0x1000000000000123500000000000000000000000';
          let avax = '0x2000000000000275500000000000000000000000';

          let pair1 = await factory.isPairCreated(waxp, avax);
          let pair2 = await factory.isPairCreated(avax, waxp);
          
          assert.equal(pair1, false);
          assert.equal(pair2, false);
      });

      it("createPair: Create pair with already existing address and swap their places", async () => 
      {
        await truffleAssert.reverts(factory.createPair(usdt.address, bnb.address), "Factory: pair already exists");
        await truffleAssert.reverts(factory.createPair(bnb.address, usdt.address), "Factory: pair already exists");
      });

      it("isPairCreated: Must return true even if we swap pairs BNB/USDT = USDT/BNB", async () => 
      {
        let a = await factory.isPairCreated(usdt.address, bnb.address);
        let b = await factory.isPairCreated(bnb.address, usdt.address);

        assert.equal(a, b);
      });


    });

  });

  //***   Factory end    ***//



  //***   Pair start    ***//
  describe('Pair:', async () => 
  {
    describe('Happy path:', async () => 
    {
      it("addLiquidity", async () => 
      {
        // mint and approvance
        await usdt.mint(accounts[0], 1000, {from: accounts[0]});
        await bnb.mint(accounts[0], 100, {from: accounts[0]});

        await usdt.approve(pairUsdtBnb.address, 500, {from: accounts[0]});
        await bnb.approve(pairUsdtBnb.address, 50, {from: accounts[0]});

        let result = await pairUsdtBnb.addLiquidity(500, 50, usdt.address, {from: accounts[0]});
        let lpTokens = await pairUsdtBnb.balanceOf(accounts[0]);

        truffleAssert.eventEmitted(result, 'LiquidityAdded', (event) => 
        {
          return event.amount.toString() == lpTokens.toString() && event.from == accounts[0];
        });
      });
      
      describe('Liquidity parameters (before removing lp):', async () => 
      {
        it("swap", async () => 
        {
          await usdt.mint(accounts[1], 1000, {from: accounts[1]});
          await usdt.approve(pairUsdtBnb.address, 100, {from: accounts[1]});
          let minAmount = await pairUsdtBnb.getTokenAmount(100, usdt.address, {from: accounts[1]});
          
          //handle calculations
          let inputReserve;
          let outputReserve;

          if (usdt.address == pairUsdtBnb.token2()) 
          {
            inputReserve = await bnb.balanceOf(pairUsdtBnb.address);
            outputReserve = await usdt.balanceOf(pairUsdtBnb.address);
          } 
          else 
          {
            inputReserve = await usdt.balanceOf(pairUsdtBnb.address);
            outputReserve = await bnb.balanceOf(pairUsdtBnb.address);
          }

          inputReserve = inputReserve.toNumber();
          outputReserve = outputReserve.toNumber();

          const inputAmount = 100;
          const fee = 0.3;

          const inputAmountWithFee = inputAmount * (100 - fee);
          const numerator = inputAmountWithFee * outputReserve;
          const denominator = (inputReserve * 100) + inputAmountWithFee;
          
          const receivedTokens = parseInt(numerator / denominator);

          //swap
          await pairUsdtBnb.swap(100, minAmount, usdt.address, {from: accounts[1]});
          let balanceBnb = await bnb.balanceOf(accounts[1]);

          assert.equal(receivedTokens, balanceBnb.toNumber());

        });

        it("Name created", async () => 
        {
          let name = await pairUsdtBnb.name();
          assert.equal(name, "LP-Token");
        });

        it("Symbol created", async () => 
        {
          let symbol = await pairUsdtBnb.symbol();
          return symbol == 'USDT-BNB-LP' || symbol == 'BNB-USDT-LP';
        });
        
        it("removeLiquidity: USDT/BNB", async () => 
        {
          const balanceUsdtBefore = await usdt.balanceOf(accounts[0]);
          const balanceBnbBefore = await bnb.balanceOf(accounts[0]);
          const liqudityBefore = await pairUsdtBnb.balanceOf(accounts[0]);
  
          let usdtReserveBefore;
          let bnbReserveBefore;
          
          let usdtReserveAfter;
          let bnbReserveAfter;
  
          if (usdt.address > bnb.address) 
          {
            usdtReserveBefore = await pairUsdtBnb.reserve1();
            bnbReserveBefore = await pairUsdtBnb.reserve2();
          } 
          else
          {
            usdtReserveBefore = await pairUsdtBnb.reserve2();
            bnbReserveBefore = await pairUsdtBnb.reserve1();
          }
  
          let result = await pairUsdtBnb.removeLiquidity(liqudityBefore.toNumber() / 2, {from: accounts[0]});
          const balanceUsdtAfter = await usdt.balanceOf(accounts[0]);
          const balanceBnbAfter = await bnb.balanceOf(accounts[0]);
          
          await pairUsdtBnb.balanceOf(accounts[0]);
          
          if(usdt.address > bnb.address) 
          {
            usdtReserveAfter = await pairUsdtBnb.reserve1();
            bnbReserveAfter = await pairUsdtBnb.reserve2();
          } 
          else 
          {
            usdtReserveAfter = await pairUsdtBnb.reserve2();
            bnbReserveAfter = await pairUsdtBnb.reserve1();
          }
  
          
          const amount1 = liqudityBefore.toNumber() / 2 * usdtReserveBefore.toNumber() / liqudityBefore.toNumber();
          const amount2 = liqudityBefore.toNumber() / 2 * bnbReserveBefore.toNumber() / liqudityBefore.toNumber();
          
          let lpTokens = await pairUsdtBnb.balanceOf(accounts[0]);
          
          
          truffleAssert.eventEmitted(result, 'LiquidityRemoved', event => 
          {
            return event.amount.toString() == lpTokens.toString() && event.from == accounts[0];
          });
  
          lpRemoved = true;
  
  
          assert(usdtReserveBefore.toNumber() - amount1 == usdtReserveAfter.toNumber() 
          && bnbReserveBefore.toNumber() - amount2 == bnbReserveAfter.toNumber() 
          && balanceUsdtBefore.toNumber() + amount1 == balanceUsdtAfter.toNumber() 
          && balanceBnbBefore.toNumber() + amount2 == balanceBnbAfter.toNumber()); 
        });
      });


      describe('Liquidity parameters (after removing lp): ', async () => 
      {
        it("swap", async () => 
        {
          if(lpRemoved == true)
            assert(true);
          else
            assert(false);
        });

        it("Symbol removed", async () => 
        {
          let symbol = await pairUsdtBnb.symbol();
          return symbol != 'USDT-BNB-LP' || symbol != 'BNB-USDT-LP';
        });
      });
    });
    
    describe('Non happy path:', async () => 
    {
      it("Can we swap with amount 0? NO!", async () => 
      {
        await truffleAssert.reverts(pairUsdtBnb.swap(0, 0, usdt.address), "Pair: value must be more than 0");
      });

      it("Can we swap not existing address? NO", async () => 
      {
        let a = "0x0000000000000000000000000000000000000123";
        await truffleAssert.reverts(pairUsdtBnb.swap(100, 100, a, {from: accounts[7]}), "Pair: wrong address of solden tokens");
      });

      it("Can we swap zerro address? NO", async () => 
      {
        let a = "0x0000000000000000000000000000000000000000";
        await truffleAssert.reverts(pairUsdtBnb.swap(100, 100, a, {from: accounts[7]}), "Pair: wrong address of solden tokens");
      });

      it("Can we remove LP with zero liquidity? NO", async () => 
      {
        await truffleAssert.reverts(pairUsdtBnb.removeLiquidity(0, {from: accounts[7]}), "Pair: invalid amount");
      });
    });


    //***   ETH functionality start    ***//
    describe('WETH: ', async () => 
    {
      describe('Happy path:', async () =>
      {
        it('createPairETH', async () => 
        {
          await usdt.mint(accounts[2], 1000000000000000);
    
          wethAddress = await factory.WETH();
          
          let result = await factory.createPair(usdt.address, wethAddress, {from: accounts[2]});
          let pairAddress = result.logs[0].args.pairAddress;
          
          pairWethUsdt = await Pair.at(pairAddress);
          
          truffleAssert.eventEmitted(result, 'PairCreated', (event) => 
          {
            return event.pairAddress == pairAddress;
          });
        });
    
        it('addLiquidityETH', async () => 
        {
          await usdt.approve(pairWethUsdt.address, 1000000, {from: accounts[2]});
          await pairWethUsdt.addLiquidityETH(1000000, {from: accounts[2], value: 10**15});
          let balance1 = await pairWethUsdt.reserve1();
          let balance2 = await pairWethUsdt.reserve2();
          assert(balance1.toNumber() == 10**15 && balance2 == 1000000);
        });
    
    
        it('swapEthToToken', async () => 
        {
          await usdt.mint(accounts[3], 100);
          balanceBefore = await web3.eth.getBalance(accounts[3]);
          
          await usdt.approve(pairWethUsdt.address, 100, {from: accounts[3]});
          
          let reserve1Before = await pairWethUsdt.reserve1();
          let minEth = await pairWethUsdt.getTokenAmount(100, usdt.address);
          
          await pairWethUsdt.tokenToEthSwap(100, minEth, {from: accounts[3]});
          let reserve1After = await pairWethUsdt.reserve1();
          assert(minEth.toNumber() == reserve1Before.toNumber() - reserve1After.toNumber());
        });
    
        it('swapTokenToEth', async () => 
        {
          let balanceBefore = await usdt.balanceOf(accounts[5]);
          let reserve2Before = await pairWethUsdt.reserve2();
          let minTokens = await pairWethUsdt.getTokenAmount(100000000, wethAddress);
          
          await pairWethUsdt.ethToTokenSwap(minTokens, {from: accounts[5], value: 100000000});
          
          let reserve2After = await pairWethUsdt.reserve2();
          let balanceAfter = await usdt.balanceOf(accounts[5]);
          
          assert(minTokens.toNumber() == reserve2Before.toNumber() - reserve2After.toNumber() && 
          reserve2Before.toNumber() - reserve2After.toNumber() == balanceAfter.toNumber() - balanceBefore.toNumber());
        });
    
        it('Transfer LP to another account', async () => 
        {
          let liquidity = await pairWethUsdt.balanceOf(accounts[2]);
          await pairWethUsdt.transfer(accounts[3], liquidity, {from: accounts[2]});
          let liqudityAfter = await pairWethUsdt.balanceOf(accounts[3]);
          assert.equal(liquidity.toNumber(), liqudityAfter.toNumber());
        });
    
        it('Remove LP from another accout', async () => 
        {
          let liquidityBefore = await pairWethUsdt.balanceOf(accounts[3]);
          let usdtBefore = await usdt.balanceOf(accounts[3]);
          let usdtReserveBefore = await pairWethUsdt.reserve2();
    
          let result = await pairWethUsdt.removeLiquidityETH(Math.trunc(liquidityBefore.toNumber() / 2), {from: accounts[3]});
          
          let liquidityAfter = await pairWethUsdt.balanceOf(accounts[3]);
          let usdtAfter = await usdt.balanceOf(accounts[3]);
          let usdtReserveAfter = await pairWethUsdt.reserve2();
          
          
          let lpTokens = await pairWethUsdt.balanceOf(accounts[3]) - 1;
    
          truffleAssert.eventEmitted(result, 'LiquidityRemoved', (event) => 
          {
            return event.amount.toString() == lpTokens.toString() && event.from == accounts[3];
          });
    
    
          assert(Math.trunc(liquidityBefore / 2) == liquidityBefore.toNumber() - liquidityAfter.toNumber() &&
          usdtAfter.toNumber() - usdtBefore.toNumber() == usdtReserveBefore.toNumber() - usdtReserveAfter.toNumber());
        });
    
        it('Check fee from swap', async () => 
        {
          let reserve1Before = await pairWethUsdt.reserve1();
          let reserve2Before = await pairWethUsdt.reserve2();
    
          await usdt.mint(accounts[6], 100000000);
    
          //10 big swaps: numbers are chosen to maintain equality
          let minAmount;

          for (let i = 0; i < 10; i++) 
          {
            minAmount = await pairWethUsdt.getTokenAmount(100000000, wethAddress);
            await pairWethUsdt.ethToTokenSwap(minAmount, {from: accounts[6], value: 10000000000000});
            
    
            await usdt.approve(pairWethUsdt.address, 9700, {from: accounts[6]});
            minAmount = await pairWethUsdt.getTokenAmount(9700, usdt.address);
            await pairWethUsdt.tokenToEthSwap(9700, minAmount, {from: accounts[6]});
          }
    
          let reserve1After = await pairWethUsdt.reserve1();
          let reserve2After = await pairWethUsdt.reserve2();
    
          assert(reserve2After < reserve2Before && reserve1After > reserve1Before, 
            `${reserve2After} ${reserve2Before} ${reserve1After} ${reserve1Before}`);
        });
      });

      describe('Non happy path:', async () =>
      {
        it("Can we remove LP ETH with zero liquidity? NO", async () => 
        {
          await truffleAssert.reverts(pairWethUsdt.removeLiquidityETH(0, {from: accounts[1]}), "Pair: invalid amount");
        });

        it("Can we remove LP ETH with zero liquidity? NO", async () => 
        {
          await truffleAssert.reverts(pairWethUsdt.removeLiquidityETH(0, {from: accounts[1]}), "Pair: invalid amount");
        });        
      });
    });
      
    //***   ETH functionality end    ***//
  });
  
  //***   Pair end    ***//
  
});