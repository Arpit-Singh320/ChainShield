// AI pipeline end-to-end test
// - Creates a policy
// - Submits a claim with evidence hashes
// - Triggers backend AI analysis via BACKEND_URL
// - Verifies on-chain claim fields updated (supports AI_MOCK for deterministic checks)
// Usage:
//   BACKEND_URL=http://localhost:3001 \
//   AI_MOCK=true \
//   npx hardhat run --network fuji scripts/test-ai-pipeline.js

const hre = require("hardhat");
const axios = require("axios");
require("dotenv").config();

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const provider = hre.ethers.provider;
  const [admin] = await hre.ethers.getSigners();

  const POLICY_REGISTRY_ADDRESS = process.env.POLICY_REGISTRY_ADDRESS;
  const CLAIMS_PROCESSOR_ADDRESS = process.env.CLAIMS_PROCESSOR_ADDRESS;
  const BACKEND_URL = process.env.BACKEND_URL || process.env.API_BASE_URL;

  if (!POLICY_REGISTRY_ADDRESS || !CLAIMS_PROCESSOR_ADDRESS) {
    throw new Error("Missing contract addresses in .env (POLICY_REGISTRY_ADDRESS, CLAIMS_PROCESSOR_ADDRESS)");
  }
  if (!BACKEND_URL) {
    throw new Error("BACKEND_URL is not set. Start backend and set BACKEND_URL to run AI pipeline test.");
  }

  const PolicyRegistry = await hre.ethers.getContractFactory("PolicyRegistry");
  const ClaimsProcessor = await hre.ethers.getContractFactory("ClaimsProcessor");

  const policyRegistry = PolicyRegistry.attach(POLICY_REGISTRY_ADDRESS).connect(admin);
  const claimsProcessor = ClaimsProcessor.attach(CLAIMS_PROCESSOR_ADDRESS).connect(admin);

  console.log("Admin:", admin.address);
  console.log("Network:", (await provider.getNetwork()).chainId.toString());
  console.log("Contracts:");
  console.log("- PolicyRegistry:", policyRegistry.address);
  console.log("- ClaimsProcessor:", claimsProcessor.address);
  console.log("Backend URL:", BACKEND_URL);

  // 1) Create policy
  const premium = hre.ethers.parseEther("0.005");
  const coverageUSD = 5000000n; // $5.00 (6 dp)
  const deductibleUSD = 500000n; // $0.50
  const policyType = "auto";
  const duration = 60n * 60n * 24n * 30n;
  const txP = await policyRegistry.createPolicy(admin.address, premium, coverageUSD, deductibleUSD, policyType, duration);
  const rcP = await txP.wait();
  const nextPolicyId = await policyRegistry.nextPolicyId();
  const policyId = Number(nextPolicyId) - 1;
  console.log("Created policy:", policyId);

  // 2) Submit claim with evidence hashes (use real CIDs for richer AI context)
  const description = "Rear bumper minor damage in low-speed collision at parking lot";
  const evidenceHashes = [
    // placeholder CID (replace with your uploaded evidence via backend /api/evidence/upload)
    "bafybeigdyrzt5examplecid0000000000000000000000000000000000000000001"
  ];
  const txC = await claimsProcessor.submitClaim(policyId, description, evidenceHashes);
  await txC.wait();
  const nextClaimId = await claimsProcessor.nextClaimId();
  const claimId = Number(nextClaimId) - 1;
  console.log("Submitted claim:", claimId);

  // 3) Trigger backend AI analysis
  console.log("Triggering backend AI analysis...");
  const r = await axios.post(`${BACKEND_URL.replace(/\/$/, '')}/api/claims/${claimId}/analyze`);
  if (!r.data?.success) {
    throw new Error(`Backend returned failure: ${JSON.stringify(r.data)}`);
  }
  console.log("Backend analysis tx:", r.data.transactionHash);

  // 4) Poll on-chain for analysis fields
  const timeoutMs = 60_000; // 60s
  const start = Date.now();
  let claim;
  while (Date.now() - start < timeoutMs) {
    claim = await claimsProcessor.getClaim(claimId);
    const status = Number(claim.status);
    if (status >= 1) break; // AIAnalyzed or beyond
    await sleep(3000);
  }
  if (!claim) throw new Error("Could not read claim after analysis");
  const status = Number(claim.status);
  console.log("On-chain status:", status, "(0=Submitted,1=AIAnalyzed,2=UnderReview,3=Approved,4=Rejected,5=Paid)");
  console.log("AI fields:", {
    claimType: Number(claim.claimType),
    severity: Number(claim.severity),
    fraudRisk: Number(claim.fraudRisk),
    recommendedPayout: claim.recommendedPayout.toString(),
  });

  // 5) Deterministic assertions when AI_MOCK=true on backend
  const AI_MOCK = (process.env.AI_MOCK || 'false').toLowerCase() === 'true';
  if (AI_MOCK) {
    const expected = { claimType: 0, severity: 3, fraudRisk: 10, recommendedPayout: 2000000n };
    const got = {
      claimType: Number(claim.claimType),
      severity: Number(claim.severity),
      fraudRisk: Number(claim.fraudRisk),
      recommendedPayout: BigInt(claim.recommendedPayout.toString()),
    };
    const ok = got.claimType === expected.claimType &&
               got.severity === expected.severity &&
               got.fraudRisk === expected.fraudRisk &&
               got.recommendedPayout === expected.recommendedPayout;
    if (!ok) {
      console.error("AI_MOCK assertion failed. Expected:", expected, "Got:", got);
      process.exit(1);
    }
    console.log("AI_MOCK assertions passed.");
  }

  console.log("AI pipeline test completed successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
