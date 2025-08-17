// Deployment script for Insurance Claims Processor System (CommonJS)
const hre = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("Deploying Insurance Claims Processor contracts to Avalanche Fuji...");

  // Get configuration from env
  const vrfCoordinator = process.env.VRF_COORDINATOR;
  const vrfKeyHash = process.env.VRF_KEY_HASH;
  const vrfSubscriptionId = process.env.VRF_SUBSCRIPTION_ID;
  const priceFeed = process.env.PRICE_FEED_AVAX_USD;

  if (!vrfCoordinator || !vrfKeyHash || !vrfSubscriptionId || !priceFeed) {
    throw new Error("Missing required environment variables for deployment");
  }

  // Deploy PolicyRegistry contract
  console.log("Deploying PolicyRegistry...");
  const PolicyRegistry = await hre.ethers.getContractFactory("PolicyRegistry");
  const policyRegistry = await PolicyRegistry.deploy();
  await policyRegistry.waitForDeployment();
  console.log(`PolicyRegistry deployed to: ${await policyRegistry.getAddress()}`);

  // Deploy ClaimsProcessor contract
  console.log("Deploying ClaimsProcessor...");
  const ClaimsProcessor = await hre.ethers.getContractFactory("ClaimsProcessor");
  const claimsProcessor = await ClaimsProcessor.deploy(
    vrfCoordinator,
    vrfKeyHash,
    vrfSubscriptionId,
    await policyRegistry.getAddress()
  );
  await claimsProcessor.waitForDeployment();
  console.log(`ClaimsProcessor deployed to: ${await claimsProcessor.getAddress()}`);

  // Deploy PayoutManager contract
  console.log("Deploying PayoutManager...");
  const PayoutManager = await hre.ethers.getContractFactory("PayoutManager");
  const payoutManager = await PayoutManager.deploy(
    await claimsProcessor.getAddress(),
    priceFeed
  );
  await payoutManager.waitForDeployment();
  console.log(`PayoutManager deployed to: ${await payoutManager.getAddress()}`);

  // Set up contract connections
  console.log("Setting up contract connections...");
  
  // Set claims processor in PolicyRegistry
  const setClaimsProcessorTx = await policyRegistry.setClaimsProcessor(await claimsProcessor.getAddress());
  await setClaimsProcessorTx.wait();
  console.log("ClaimsProcessor set in PolicyRegistry");
  
  // Set payout manager in ClaimsProcessor
  const setPayoutManagerTx = await claimsProcessor.setPayoutManager(await payoutManager.getAddress());
  await setPayoutManagerTx.wait();
  console.log("PayoutManager set in ClaimsProcessor");

  // Add a sample reviewer
  const [deployer] = await hre.ethers.getSigners();
  const addReviewerTx = await claimsProcessor.addReviewer(deployer.address);
  await addReviewerTx.wait();
  console.log(`Added ${deployer.address} as a reviewer`);

  // Fund the PayoutManager with some AVAX
  const fundingAmount = hre.ethers.parseEther("0.1"); // 0.1 AVAX
  const fundingTx = await deployer.sendTransaction({
    to: await payoutManager.getAddress(),
    value: fundingAmount
  });
  await fundingTx.wait();
  console.log(`Funded PayoutManager with ${hre.ethers.formatEther(fundingAmount)} AVAX`);

  console.log("Deployment complete!");
  console.log("Contract Addresses:");
  console.log(`- PolicyRegistry: ${await policyRegistry.getAddress()}`);
  console.log(`- ClaimsProcessor: ${await claimsProcessor.getAddress()}`);
  console.log(`- PayoutManager: ${await payoutManager.getAddress()}`);

  // Updating .env file would be done manually after deployment
  console.log("\nPlease update your .env file with these addresses");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
