import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  const initialSupply = ethers.parseUnits("10000", 18);

  const tokenForSale = await ERC20Mock.deploy("TokenForSale", "TFS", deployer.address, initialSupply);
  await tokenForSale.waitForDeployment();
  console.log("Token for Sale deployed at:", tokenForSale.target);

  const paymentToken = await ERC20Mock.deploy("PaymentToken", "PT", deployer.address, initialSupply);
  await paymentToken.waitForDeployment();
  console.log("Payment Token deployed at:", paymentToken.target);

  const tokensForSaleAmount = ethers.parseUnits("1000", 18);
  const initialPrice = ethers.parseUnits("1", 18);
  const finalPrice = ethers.parseUnits("0.5", 18);
  const auctionDuration = 3600; // 1 hour

  const AuctionFactory = await ethers.getContractFactory("ReverseDutchAuctionSwap");
  const auction = await AuctionFactory.deploy(
    tokenForSale.target,
    paymentToken.target,
    tokensForSaleAmount,
    initialPrice,
    finalPrice,
    auctionDuration
  );
  await auction.waitForDeployment();
  console.log("Auction deployed at:", auction.target);

  // Fund the auction (seller deposits tokens)
  const approveTx = await tokenForSale.approve(auction.target, tokensForSaleAmount);
  await approveTx.wait();
  const fundTx = await auction.fundAuction();
  await fundTx.wait();
  console.log("Auction funded by seller.");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
