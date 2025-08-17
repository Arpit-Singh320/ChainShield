// VRF smoke test for ClaimsProcessor on Fuji
// Triggers the UnderReview path and waits for VRF callback to assign a reviewer

const hre = require("hardhat");
require("dotenv").config();

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function main() {
  const provider = hre.ethers.provider;
  const [admin] = await hre.ethers.getSigners();
  console.log("Admin:", admin.address);
  console.log("Network:", (await provider.getNetwork()).name, "ChainId:", (await provider.getNetwork()).chainId);

  const POLICY_REGISTRY_ADDRESS = process.env.POLICY_REGISTRY_ADDRESS;
  const CLAIMS_PROCESSOR_ADDRESS = process.env.CLAIMS_PROCESSOR_ADDRESS;
  if (!POLICY_REGISTRY_ADDRESS || !CLAIMS_PROCESSOR_ADDRESS) {
    throw new Error("Missing POLICY_REGISTRY_ADDRESS or CLAIMS_PROCESSOR_ADDRESS in .env");
  }

  const PolicyRegistry = await hre.ethers.getContractFactory("PolicyRegistry");
  const ClaimsProcessor = await hre.ethers.getContractFactory("ClaimsProcessor");

  const policyRegistry = PolicyRegistry.attach(POLICY_REGISTRY_ADDRESS).connect(admin);
  const claimsProcessor = ClaimsProcessor.attach(CLAIMS_PROCESSOR_ADDRESS).connect(admin);

  console.log("Contracts:");
  console.log("- PolicyRegistry:", POLICY_REGISTRY_ADDRESS);
  console.log("- ClaimsProcessor:", CLAIMS_PROCESSOR_ADDRESS);

  // Ensure at least one reviewer (admin) is present
  try {
    const addTx = await claimsProcessor.addReviewer(admin.address);
    await addTx.wait();
    console.log("Added admin as reviewer");
  } catch (e) {
    const msg = e?.error?.message || e?.message || String(e);
    if (msg.includes("Already a reviewer") || msg.includes("execution reverted")) {
      console.log("Reviewer already registered or cannot add twice.");
    } else {
      console.log("addReviewer info:", msg.split("\n")[0]);
    }
  }

  // Create a policy for admin
  const premium = hre.ethers.parseEther("0.01");
  const coverageUSD = 5000000n; // $5
  const deductibleUSD = 1000000n; // $1
  const policyType = "auto";
  const duration = 60n * 60n * 24n * 30n; // 30 days

  console.log("Creating policy...");
  const createTx = await policyRegistry.createPolicy(
    admin.address,
    premium,
    coverageUSD,
    deductibleUSD,
    policyType,
    duration
  );
  await createTx.wait();
  const nextPolicyId = await policyRegistry.nextPolicyId();
  const policyId = Number(nextPolicyId) - 1;
  console.log("PolicyId:", policyId);

  // Submit a claim
  const submitTx = await claimsProcessor.submitClaim(
    policyId,
    "VRF test claim",
    ["bafybeigdyrzt5examplecid0000000000000000000000000000000000000000001"]
  );
  await submitTx.wait();
  const nextClaimId = await claimsProcessor.nextClaimId();
  const claimId = Number(nextClaimId) - 1;
  console.log("ClaimId:", claimId);

  // Submit AI Analysis with mid fraudRisk to route to VRF path (UnderReview)
  const claimType = 0;
  const severity = 5;
  const fraudRisk = 50; // between 20 and 70
  const recommendedPayoutUSD = 1000000n; // any value

  console.log("Submitting AI analysis to trigger VRF reviewer selection...");
  const aiTx = await claimsProcessor.submitAIAnalysis(
    claimId,
    claimType,
    severity,
    fraudRisk,
    recommendedPayoutUSD
  );
  await aiTx.wait();
  console.log("AI analysis submitted.");

  // Poll for assignedReviewer to be set by fulfillRandomWords
  console.log("Waiting for VRF callback to assign reviewer (this requires a funded VRF sub and consumer configured)...");
  let assigned = null;
  for (let i = 0; i < 12; i++) { // ~60s total
    const c = await claimsProcessor.claims(claimId);
    assigned = c.assignedReviewer;
    if (assigned && assigned !== hre.ethers.ZeroAddress) {
      console.log("Assigned reviewer:", assigned);
      break;
    }
    await sleep(5000);
  }

  if (!assigned || assigned === hre.ethers.ZeroAddress) {
    console.log("Reviewer not assigned within timeout.");
    console.log("Check VRF subscription:");
    console.log("- VRF_COORDINATOR:", process.env.VRF_COORDINATOR);
    console.log("- VRF_SUBSCRIPTION_ID:", process.env.VRF_SUBSCRIPTION_ID);
    console.log("- VRF_KEY_HASH:", process.env.VRF_KEY_HASH);
    console.log("Ensure sub is funded and ClaimsProcessor is added as consumer.");
  }

  console.log("VRF smoke test complete.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
