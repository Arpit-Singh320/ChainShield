// Add a reviewer to ClaimsProcessor so VRF path doesn't revert with "No active reviewers"
// Usage:
//   REVIEWER=<address> npx hardhat run --network fuji scripts/add-reviewer.js
// If REVIEWER is not provided, defaults to the admin signer address.

const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const [admin] = await hre.ethers.getSigners();
  const CLAIMS_PROCESSOR_ADDRESS = process.env.CLAIMS_PROCESSOR_ADDRESS;
  if (!CLAIMS_PROCESSOR_ADDRESS) throw new Error("CLAIMS_PROCESSOR_ADDRESS missing in env");

  const reviewer = process.env.REVIEWER || admin.address;

  const ClaimsProcessor = await hre.ethers.getContractFactory("ClaimsProcessor");
  const claims = ClaimsProcessor.attach(CLAIMS_PROCESSOR_ADDRESS).connect(admin);

  console.log("Admin:", admin.address);
  console.log("ClaimsProcessor:", claims.target || claims.address);
  console.log("Adding reviewer:", reviewer);

  try {
    const tx = await claims.addReviewer(reviewer);
    const rc = await tx.wait();
    console.log("Reviewer added. tx:", tx.hash, "gasUsed:", rc.gasUsed?.toString?.());
  } catch (e) {
    const msg = e?.error?.message || e?.message || String(e);
    console.log("Add reviewer failed (possibly already added):", msg.split("\n")[0]);
  }

  const count = await claims.getActiveReviewerCount();
  console.log("Active reviewers count:", Number(count));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
