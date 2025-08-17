// Set auto-approve and auto-reject thresholds on ClaimsProcessor
// Usage examples:
//   AUTO_APPROVE=100 AUTO_REJECT=101 npx hardhat run --network fuji scripts/set-thresholds.js
//   AUTO_APPROVE=20  AUTO_REJECT=70  npx hardhat run --network fuji scripts/set-thresholds.js

const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const CLAIMS_PROCESSOR_ADDRESS = process.env.CLAIMS_PROCESSOR_ADDRESS;
  if (!CLAIMS_PROCESSOR_ADDRESS) throw new Error("CLAIMS_PROCESSOR_ADDRESS missing in env");

  const autoApprove = Number(process.env.AUTO_APPROVE ?? 20);
  const autoReject = Number(process.env.AUTO_REJECT ?? 70);

  // Accept full uint8 range (0..255). This allows setting AUTO_REJECT > 100
  // to effectively disable auto-reject while forcing auto-approve (e.g., 100/200).
  if (!(autoApprove >= 0 && autoApprove <= 255 && autoReject >= 0 && autoReject <= 255)) {
    throw new Error("AUTO_APPROVE and AUTO_REJECT must be between 0 and 255");
  }
  if (!(autoApprove < autoReject)) {
    throw new Error("AUTO_APPROVE must be < AUTO_REJECT");
  }

  const [admin] = await hre.ethers.getSigners();
  const ClaimsProcessor = await hre.ethers.getContractFactory("ClaimsProcessor");
  const claims = ClaimsProcessor.attach(CLAIMS_PROCESSOR_ADDRESS).connect(admin);

  console.log("Admin:", admin.address);
  console.log("ClaimsProcessor:", claims.target || claims.address);
  console.log(`Setting thresholds: autoApprove=${autoApprove}, autoReject=${autoReject}`);

  const tx = await claims.setThresholds(autoApprove, autoReject);
  const rc = await tx.wait();
  console.log("Thresholds updated. tx:", tx.hash, "gasUsed:", rc.gasUsed?.toString?.());
}

main().catch((e) => { console.error(e); process.exit(1); });
