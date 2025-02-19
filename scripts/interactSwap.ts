import { ethers, network } from "hardhat";

async function main() {
  const auctionAddress = "0x267fB71b280FB34B278CedE84180a9A9037C941b";
  const [deployer, buyer] = await ethers.getSigners();
  const AuctionFactory = await ethers.getContractFactory("ReverseDutchAuctionSwap");
  const auction = AuctionFactory.attach(auctionAddress) as any;

  async function increaseTime(seconds: number) {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  }

  let currentPrice = await auction.getCurrentPrice();
  console.log("Current price at t=0:", currentPrice.toString());

  const paymentTokenAddress = await auction.paymentToken();
  const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  const paymentToken = ERC20Mock.attach(paymentTokenAddress) as any;

  let buyerBalance = await paymentToken.balanceOf(buyer.address);
  console.log("Buyer payment token balance:", buyerBalance.toString());
  if (buyerBalance === 0n) {
    const transferTx = await paymentToken.transfer(buyer.address, ethers.parseUnits("1000", 18));
    await transferTx.wait();
    buyerBalance = await paymentToken.balanceOf(buyer.address);
    console.log("Buyer funded. New balance:", buyerBalance.toString());
  }

  const approvalAmount = ethers.parseUnits("10000", 18);
  const buyerApprovalTx = await paymentToken.connect(buyer).approve(auctionAddress, approvalAmount);
  await buyerApprovalTx.wait();
  console.log("Buyer approved auction contract.");

  const amountToBuy = ethers.parseUnits("0.1", 18);
  try {
    const totalCost = await auction.calculateTotalCost(amountToBuy);
    console.log("Computed total cost for 0.1 token:", totalCost.toString());
  } catch (error) {
    console.error("calculateTotalCost call failed:", error);
  }

  try {
    const tx0 = await auction.connect(buyer).buy(amountToBuy);
    await tx0.wait();
    console.log("Buyer purchased 0.1 token at t=0");
  } catch (error) {
    console.error("Purchase at t=0 failed:", error);
  }

  await increaseTime(900);
  currentPrice = await auction.getCurrentPrice();
  console.log("Current price at t=900s:", currentPrice.toString());
  try {
    const tx900 = await auction.connect(buyer).buy(amountToBuy);
    await tx900.wait();
    console.log("Buyer purchased 0.1 token at t=900s");
  } catch (error) {
    console.error("Purchase at t=900s failed:", error);
  }

  await increaseTime(1800);
  currentPrice = await auction.getCurrentPrice();
  console.log("Current price at t=2700s:", currentPrice.toString());
  try {
    const tx2700 = await auction.connect(buyer).buy(amountToBuy);
    await tx2700.wait();
    console.log("Buyer purchased 0.1 token at t=2700s");
  } catch (error) {
    console.error("Purchase at t=2700s failed:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
