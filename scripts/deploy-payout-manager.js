// Deploy PayoutManager contract
const hre = require("hardhat");
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("Deploying PayoutManager contract to Avalanche Fuji...");

  // Get configuration from env
  const policyRegistryAddress = process.env.POLICY_REGISTRY_ADDRESS;
  const claimsProcessorAddress = process.env.CLAIMS_PROCESSOR_ADDRESS;
  const priceFeed = process.env.CHAINLINK_PRICE_FEED;

  if (!policyRegistryAddress || !claimsProcessorAddress) {
    throw new Error("Missing POLICY_REGISTRY_ADDRESS or CLAIMS_PROCESSOR_ADDRESS in .env file");
  }

  if (!priceFeed) {
    throw new Error("Missing CHAINLINK_PRICE_FEED environment variable");
  }

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);
  
  // Deploy PayoutManager
  console.log("Deploying with parameters:");
  console.log(`- Policy Registry: ${policyRegistryAddress}`);
  console.log(`- Claims Processor: ${claimsProcessorAddress}`);
  console.log(`- Price Feed: ${priceFeed}`);
  
  const PayoutManager = await ethers.getContractFactory("PayoutManager");
  const payoutManager = await PayoutManager.deploy(
    policyRegistryAddress,
    claimsProcessorAddress,
    priceFeed
  );
  
  await payoutManager.waitForDeployment();
  const payoutManagerAddress = await payoutManager.getAddress();
  
  console.log(`PayoutManager deployed to: ${payoutManagerAddress}`);

  // Set PayoutManager in ClaimsProcessor
  console.log("Setting PayoutManager in ClaimsProcessor...");
  
  // Get ClaimsProcessor contract instance
  const ClaimsProcessor = await ethers.getContractFactory("ClaimsProcessor");
  const claimsProcessor = ClaimsProcessor.attach(claimsProcessorAddress);
  
  // Set PayoutManager address
  const tx = await claimsProcessor.setPayoutManager(payoutManagerAddress);
  await tx.wait();
  console.log("PayoutManager address set in ClaimsProcessor");
  
  // Fund the PayoutManager with initial funds (1 AVAX)
  console.log("Funding PayoutManager with 1 AVAX...");
  const fundTx = await deployer.sendTransaction({
    to: payoutManagerAddress,
    value: ethers.parseEther("1.0")
  });
  await fundTx.wait();
  console.log(`Funded PayoutManager with 1 AVAX`);
  
  console.log("");
  console.log("==========================================================");
  console.log("Update your .env file with the following value:");
  console.log(`PAYOUT_MANAGER_ADDRESS=${payoutManagerAddress}`);
  console.log("==========================================================");
  
  // Verify contract on Fuji explorer
  console.log("Waiting for 30 seconds before verification...");
  await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds delay
  
  try {
    await hre.run("verify:verify", {
      address: payoutManagerAddress,
      constructorArguments: [
        policyRegistryAddress,
        claimsProcessorAddress,
        priceFeed
      ],
    });
    console.log("PayoutManager contract verified on explorer");
  } catch (error) {
    console.log("Error verifying contract:", error.message);
  }
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
