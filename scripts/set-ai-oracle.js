// Set the AI oracle address on ClaimsProcessor to the backend signer (or any address you pass)
// Usage:
//   ORACLE=<address> npx hardhat run --network fuji scripts/set-ai-oracle.js
// If ORACLE is not provided, defaults to the first signer (admin).

const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const [admin] = await hre.ethers.getSigners();
  const CLAIMS_PROCESSOR_ADDRESS = process.env.CLAIMS_PROCESSOR_ADDRESS;
  if (!CLAIMS_PROCESSOR_ADDRESS) throw new Error("CLAIMS_PROCESSOR_ADDRESS missing in env");

  const oracle = process.env.ORACLE || admin.address;

  const ClaimsProcessor = await hre.ethers.getContractFactory("ClaimsProcessor");
  const claims = ClaimsProcessor.attach(CLAIMS_PROCESSOR_ADDRESS).connect(admin);

  console.log("Admin:", admin.address);
  console.log("ClaimsProcessor:", claims.target || claims.address);
  console.log("Setting AI oracle to:", oracle);

  const tx = await claims.setAIOracle(oracle);
  const rc = await tx.wait();
  console.log("AI oracle set. tx:", tx.hash, "gasUsed:", rc.gasUsed?.toString?.());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
