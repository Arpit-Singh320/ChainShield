// Deploy ClaimsProcessor contract
const hre = require("hardhat");
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("Deploying ClaimsProcessor contract to Avalanche Fuji...");

  // Get configuration from env
  const policyRegistryAddress = process.env.POLICY_REGISTRY_ADDRESS;
  const vrfCoordinator = process.env.VRF_COORDINATOR;
  const vrfKeyHash = process.env.VRF_KEY_HASH;
  const vrfSubscriptionId = process.env.VRF_SUBSCRIPTION_ID;

  if (!policyRegistryAddress) {
    throw new Error("Missing POLICY_REGISTRY_ADDRESS in .env file");
  }

  if (!vrfCoordinator || !vrfKeyHash || !vrfSubscriptionId) {
    throw new Error("Missing required Chainlink VRF environment variables");
  }

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);
  
  // Deploy ClaimsProcessor
  console.log("Deploying with parameters:");
  console.log(`- Policy Registry: ${policyRegistryAddress}`);
  console.log(`- VRF Coordinator: ${vrfCoordinator}`);
  console.log(`- VRF Key Hash: ${vrfKeyHash}`);
  console.log(`- VRF Subscription ID: ${vrfSubscriptionId}`);
  
  const ClaimsProcessor = await ethers.getContractFactory("ClaimsProcessor");
  // Constructor signature in ClaimsProcessor.sol:
  // constructor(address _vrfCoordinator, bytes32 _keyHash, uint64 _subscriptionId, address _policyRegistry)
  const claimsProcessor = await ClaimsProcessor.deploy(
    vrfCoordinator,
    vrfKeyHash,
    vrfSubscriptionId,
    policyRegistryAddress
  );
  
  await claimsProcessor.waitForDeployment();
  const claimsProcessorAddress = await claimsProcessor.getAddress();
  
  console.log(`ClaimsProcessor deployed to: ${claimsProcessorAddress}`);

  // Set ClaimsProcessor in PolicyRegistry
  console.log("Setting ClaimsProcessor in PolicyRegistry...");
  
  // Get PolicyRegistry contract instance
  const PolicyRegistry = await ethers.getContractFactory("PolicyRegistry");
  const policyRegistry = PolicyRegistry.attach(policyRegistryAddress);
  
  // Set ClaimsProcessor address
  const tx = await policyRegistry.setClaimsProcessor(claimsProcessorAddress);
  await tx.wait();
  console.log("ClaimsProcessor address set in PolicyRegistry");
  
  // Add deployer as a reviewer
  console.log("Adding deployer as reviewer...");
  const addReviewerTx = await claimsProcessor.addReviewer(deployer.address);
  await addReviewerTx.wait();
  console.log(`Added ${deployer.address} as a reviewer`);
  
  console.log("");
  console.log("==========================================================");
  console.log("Update your .env file with the following value:");
  console.log(`CLAIMS_PROCESSOR_ADDRESS=${claimsProcessorAddress}`);
  console.log("==========================================================");
  
  // Verify contract on Fuji explorer
  console.log("Waiting for 30 seconds before verification...");
  await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds delay
  
  try {
    await hre.run("verify:verify", {
      address: claimsProcessorAddress,
      constructorArguments: [
        vrfCoordinator,
        vrfKeyHash,
        vrfSubscriptionId,
        policyRegistryAddress
      ],
    });
    console.log("ClaimsProcessor contract verified on explorer");
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
