import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

function almostEqual(a: bigint, b: bigint, tolerance: bigint): boolean {
  const diff = a > b ? a - b : b - a;
  return diff <= tolerance;
}

describe("ReverseDutchAuctionSwap", function () {
  async function deployAuctionFixture() {
    const [deployer, buyer, otherBuyer] = await ethers.getSigners();
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const tokenInitialSupply = ethers.parseUnits("10000", 18);
    
    const tokenForSale = await ERC20Mock.deploy("TokenForSale", "TFS", deployer.address, tokenInitialSupply);
    await tokenForSale.waitForDeployment();
    const paymentToken = await ERC20Mock.deploy("PaymentToken", "PT", deployer.address, tokenInitialSupply);
    await paymentToken.waitForDeployment();
    const tokensForSaleAmount = ethers.parseUnits("1000", 18);
    const initialPrice = ethers.parseUnits("1", 18);
    const finalPrice = ethers.parseUnits("0.5", 18);
    const duration = 3600;
    const AuctionFactory = await ethers.getContractFactory("ReverseDutchAuctionSwap");
    const auction = await AuctionFactory.deploy(
      tokenForSale.target,
      paymentToken.target,
      tokensForSaleAmount,
      initialPrice,
      finalPrice,
      duration
    );
    await auction.waitForDeployment();
    await tokenForSale.approve(auction.target, tokensForSaleAmount);
    await auction.fundAuction();
    const buyerFund = ethers.parseUnits("1000", 18);
    await paymentToken.transfer(buyer.address, buyerFund);
    await paymentToken.transfer(otherBuyer.address, buyerFund);
    return { auction, tokenForSale, paymentToken, deployer, buyer, otherBuyer, tokensForSaleAmount, initialPrice, finalPrice, duration };
  }

  describe("Price Decrease", function () {
    it("should decrease price correctly over time", async function () {
      const { auction, initialPrice, finalPrice, duration } = await loadFixture(deployAuctionFixture);
      const tol = 1000000000000000n;
      const priceStart = await auction.getCurrentPrice();
      expect(BigInt(initialPrice.toString()) - BigInt(priceStart.toString())).to.be.lt(tol);
      await time.increaseTo((await time.latest()) + duration / 2);
      const priceMid = await auction.getCurrentPrice();
      expect(priceMid).to.be.lt(initialPrice);
      expect(priceMid).to.be.gt(finalPrice);
      await time.increaseTo((await time.latest()) + duration);
      const priceEnd = await auction.getCurrentPrice();
      expect(priceEnd).to.equal(finalPrice);
    });
  });

  describe("buy()", function () {
    it("should swap funds and tokens correctly", async function () {
      const { auction, paymentToken, tokenForSale, buyer, deployer } = await loadFixture(deployAuctionFixture);
      const amountToBuy = ethers.parseUnits("10", 18);
      const currentPrice = await auction.getCurrentPrice();
      const expectedCost = (BigInt(currentPrice.toString()) * BigInt(amountToBuy.toString())) / 1000000000000000000n;
      await paymentToken.connect(buyer).approve(auction.target, ethers.parseUnits("10000", 18));
      const buyerInitialPT = BigInt((await paymentToken.balanceOf(buyer.address)).toString());
      const deployerInitialPT = BigInt((await paymentToken.balanceOf(deployer.address)).toString());
      const buyerInitialTFS = BigInt((await tokenForSale.balanceOf(buyer.address)).toString());
      const tx = await auction.connect(buyer).buy(amountToBuy);
      await tx.wait();
      const buyerFinalTFS = BigInt((await tokenForSale.balanceOf(buyer.address)).toString());
      expect(buyerFinalTFS).to.equal(buyerInitialTFS + BigInt(amountToBuy.toString()));
      const buyerFinalPT = BigInt((await paymentToken.balanceOf(buyer.address)).toString());
      const deployerFinalPT = BigInt((await paymentToken.balanceOf(deployer.address)).toString());
      const diffBuyer = buyerInitialPT - buyerFinalPT;
      const diffSeller = deployerFinalPT - deployerInitialPT;
      const tolCost = 1000000000000000n;
      expect(almostEqual(diffBuyer, expectedCost, tolCost)).to.be.true;
      expect(almostEqual(diffSeller, expectedCost, tolCost)).to.be.true;
    });

    it("should revert further purchases once tokens are sold out", async function () {
      const { auction, paymentToken, tokensForSaleAmount, buyer, otherBuyer } = await loadFixture(deployAuctionFixture);
      await paymentToken.connect(buyer).approve(auction.target, ethers.parseUnits("10000", 18));
      await auction.connect(buyer).buy(tokensForSaleAmount);
      expect(await auction.saleActive()).to.equal(false);
      await expect(auction.connect(otherBuyer).buy(ethers.parseUnits("1", 18))).to.be.reverted;
    });

    it("should revert if buying zero tokens", async function () {
      const { auction } = await loadFixture(deployAuctionFixture);
      await expect(auction.buy(0)).to.be.revertedWith("Invalid token amount");
    });

    it("should revert if buyer has insufficient allowance", async function () {
      const { auction, buyer } = await loadFixture(deployAuctionFixture);
      await expect(auction.connect(buyer).buy(ethers.parseUnits("1", 18))).to.be.reverted;
    });

    it("should revert if buyer has insufficient funds", async function () {
      const { auction, paymentToken, buyer } = await loadFixture(deployAuctionFixture);
      await paymentToken.connect(buyer).approve(auction.target, ethers.parseUnits("10000", 18));
      await paymentToken.connect(buyer).transfer((await ethers.getSigners())[0].address, await paymentToken.balanceOf(buyer.address));
      await expect(auction.connect(buyer).buy(ethers.parseUnits("1", 18))).to.be.reverted;
    });

    it("should allow multiple buyers to purchase tokens until sold out", async function () {
      const { auction, paymentToken, tokensForSaleAmount, buyer, otherBuyer } = await loadFixture(deployAuctionFixture);
      await paymentToken.connect(buyer).approve(auction.target, ethers.parseUnits("10000", 18));
      await paymentToken.connect(otherBuyer).approve(auction.target, ethers.parseUnits("10000", 18));
      const halfAmount = tokensForSaleAmount / 2n;
      await auction.connect(buyer).buy(halfAmount);
      await auction.connect(otherBuyer).buy(halfAmount);
      expect(await auction.saleActive()).to.equal(false);
    });
  });

  describe("Cost Calculation", function () {
    it("should calculate total cost correctly at intermediate times", async function () {
      const { auction, duration, initialPrice } = await loadFixture(deployAuctionFixture);
      const costT0 = BigInt((await auction.calculateTotalCost(ethers.parseUnits("1", 18))).toString());
      expect(costT0).to.equal(BigInt(initialPrice.toString()));
      await time.increaseTo((await time.latest()) + duration / 2);
      const costMid = BigInt((await auction.calculateTotalCost(ethers.parseUnits("1", 18))).toString());
      const priceMid = BigInt((await auction.getCurrentPrice()).toString());
      expect(costMid).to.equal(priceMid);
    });
  });

  describe("Edge Cases", function () {
    it("should handle edge case: no buyer before auction ends", async function () {
      const { auction, tokensForSaleAmount, finalPrice, duration } = await loadFixture(deployAuctionFixture);
      await time.increaseTo((await time.latest()) + duration + 1);
      const currentPrice = await auction.getCurrentPrice();
      expect(currentPrice).to.equal(finalPrice);
      expect(await auction.tokensForSale()).to.equal(tokensForSaleAmount);
    });
  });
});
