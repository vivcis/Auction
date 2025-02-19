import { ethers, network } from "hardhat";

async function main() {
  const auctionAddress = "0x267fB71b280FB34B278CedE84180a9A9037C941b"; 
  const [, buyer] = await ethers.getSigners();
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

  const buyerApprovalTx = await paymentToken.connect(buyer).approve(
    auctionAddress,
    ethers.parseUnits("1000", 18)
  );
  await buyerApprovalTx.wait();
  console.log("Buyer approved auction contract.");

  const amountToBuy = ethers.parseUnits("100", 18);
  try {
    const tx0 = await auction.connect(buyer).buy(amountToBuy);
    await tx0.wait();
    console.log("Buyer purchased 100 tokens at t=0");
  } catch (error) {
    console.error("Purchase at t=0 failed:", error);
  }

  await increaseTime(900); // Increase time by 15 minutes
  currentPrice = await auction.getCurrentPrice();
  console.log("Current price at t=900s:", currentPrice.toString());
  try {
    const tx900 = await auction.connect(buyer).buy(amountToBuy);
    await tx900.wait();
    console.log("Buyer purchased 100 tokens at t=900s");
  } catch (error) {
    console.error("Purchase at t=900s failed:", error);
  }

  await increaseTime(1800); // Increase time by an additional 30 minutes (total t=2700s)
  currentPrice = await auction.getCurrentPrice();
  console.log("Current price at t=2700s:", currentPrice.toString());
  try {
    const tx2700 = await auction.connect(buyer).buy(amountToBuy);
    await tx2700.wait();
    console.log("Buyer purchased 100 tokens at t=2700s");
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
