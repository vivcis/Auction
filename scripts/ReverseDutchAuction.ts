import { ethers } from "hardhat";

async function main() {
  const [deployer, buyer] = await ethers.getSigners();
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  const initialSupply = ethers.parseUnits("10000", 18);

  const tokenForSale = await ERC20Mock.deploy("TokenForSale", "TFS", deployer.address, initialSupply, {
    maxFeePerGas: ethers.parseUnits("200", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
  });
  await tokenForSale.waitForDeployment();
  console.log("Token for Sale deployed at:", tokenForSale.target);

  const paymentToken = await ERC20Mock.deploy("PaymentToken", "PT", deployer.address, initialSupply, {
    maxFeePerGas: ethers.parseUnits("200", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
  });
  await paymentToken.waitForDeployment();
  console.log("Payment Token deployed at:", paymentToken.target);

  const paymentForBuyer = ethers.parseUnits("1000", 18);
  const txTransfer = await paymentToken.transfer(buyer.address, paymentForBuyer, {
    maxFeePerGas: ethers.parseUnits("200", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
  });
  await txTransfer.wait();
  console.log("Transferred payment tokens to buyer:", buyer.address);

  const tokensForSaleAmount = ethers.parseUnits("1000", 18);
  const initialPrice = ethers.parseUnits("1", 18);
  const finalPrice = ethers.parseUnits("0.5", 18);
  const auctionDuration = 3600;

  const AuctionFactory = await ethers.getContractFactory("ReverseDutchAuctionSwap");
  const auction = await AuctionFactory.deploy(
    tokenForSale.target,
    paymentToken.target,
    tokensForSaleAmount,
    initialPrice,
    finalPrice,
    auctionDuration,
    {
      maxFeePerGas: ethers.parseUnits("200", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
    }
  );
  await auction.waitForDeployment();
  console.log("Auction deployed at:", auction.target);

  const approveTx = await tokenForSale.approve(auction.target, tokensForSaleAmount, {
    maxFeePerGas: ethers.parseUnits("200", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
  });
  await approveTx.wait();
  const fundTx = await auction.fundAuction({
    maxFeePerGas: ethers.parseUnits("200", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
  });
  await fundTx.wait();
  console.log("Auction funded by seller.");

  const currentPrice = await auction.getCurrentPrice();
  console.log("Current auction price per token:", currentPrice.toString());

  const buyerApprovalTx = await paymentToken.connect(buyer).approve(auction.target, paymentForBuyer, {
    maxFeePerGas: ethers.parseUnits("200", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
  });
  await buyerApprovalTx.wait();
  console.log("Buyer approved auction contract to spend payment tokens.");

  const amountToBuy = ethers.parseUnits("100", 18);
  const buyTx = await auction.connect(buyer).buy(amountToBuy, {
    maxFeePerGas: ethers.parseUnits("200", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
  });
  await buyTx.wait();
  console.log("Buyer purchased", amountToBuy.toString(), "tokens at price", currentPrice.toString());

  const updatedPrice = await auction.getCurrentPrice();
  console.log("Updated auction price per token:", updatedPrice.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
