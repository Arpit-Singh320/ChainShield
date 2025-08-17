// Deploy PolicyRegistry contract
const hre = require("hardhat");
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("Deploying PolicyRegistry contract to Avalanche Fuji...");
  
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);
  
  // Deploy PolicyRegistry
  const PolicyRegistry = await ethers.getContractFactory("PolicyRegistry");
  const policyRegistry = await PolicyRegistry.deploy();
  
  await policyRegistry.waitForDeployment();
  const policyRegistryAddress = await policyRegistry.getAddress();
  
  console.log(`PolicyRegistry deployed to: ${policyRegistryAddress}`);
  console.log("");
  console.log("==========================================================");
  console.log("Update your .env file with the following value:");
  console.log(`POLICY_REGISTRY_ADDRESS=${policyRegistryAddress}`);
  console.log("==========================================================");
  
  // Verify contract on Fuji explorer (optional)
  console.log("Waiting for 30 seconds before verification...");
  await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds delay
  
  try {
    await hre.run("verify:verify", {
      address: policyRegistryAddress,
      constructorArguments: [],
    });
    console.log("PolicyRegistry contract verified on explorer");
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
