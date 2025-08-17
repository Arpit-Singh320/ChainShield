// End-to-end test script for Avalanche Insurance contracts on Fuji
// CommonJS + Hardhat v2

const hre = require("hardhat");
require("dotenv").config();
const axios = require("axios");

async function main() {
  const provider = hre.ethers.provider;
  const [deployer] = await hre.ethers.getSigners();
  console.log("Using deployer:", deployer.address);
  console.log("Network:", (await provider.getNetwork()).name, "ChainId:", (await provider.getNetwork()).chainId);

  // Load addresses from .env
  const POLICY_REGISTRY_ADDRESS = process.env.POLICY_REGISTRY_ADDRESS;
  const CLAIMS_PROCESSOR_ADDRESS = process.env.CLAIMS_PROCESSOR_ADDRESS;
  const PAYOUT_MANAGER_ADDRESS = process.env.PAYOUT_MANAGER_ADDRESS;
  const BACKEND_URL = process.env.BACKEND_URL; // Optional: http://localhost:3001 or similar

  if (!POLICY_REGISTRY_ADDRESS || !CLAIMS_PROCESSOR_ADDRESS || !PAYOUT_MANAGER_ADDRESS) {
    throw new Error("Missing contract addresses in .env");
  }

  // Get contract factories and instances
  const PolicyRegistry = await hre.ethers.getContractFactory("PolicyRegistry");
  const ClaimsProcessor = await hre.ethers.getContractFactory("ClaimsProcessor");
  const PayoutManager = await hre.ethers.getContractFactory("PayoutManager");

  const policyRegistry = PolicyRegistry.attach(POLICY_REGISTRY_ADDRESS);
  const claimsProcessor = ClaimsProcessor.attach(CLAIMS_PROCESSOR_ADDRESS);
  const payoutManager = PayoutManager.attach(PAYOUT_MANAGER_ADDRESS);

  console.log("Contracts:");
  console.log("- PolicyRegistry:", policyRegistry.address);
  console.log("- ClaimsProcessor:", claimsProcessor.address);
  console.log("- PayoutManager:", payoutManager.address);

  // 1) Create Policy (admin only) for the deployer as policyholder
  const now = Math.floor(Date.now() / 1000);
  const premium = hre.ethers.parseEther("0.01"); // 0.01 AVAX (just a value; not enforced on-chain)
  const coverageUSD = 5000000n; // $5.00 with 6 decimals
  const deductibleUSD = 1000000n; // $1.00 with 6 decimals
  const policyType = "auto";
  const duration = 60n * 60n * 24n * 30n; // 30 days

  console.log("\n[1/5] Creating policy (admin only)...");
  const createTx = await policyRegistry.createPolicy(
    deployer.address,
    premium,
    coverageUSD,
    deductibleUSD,
    policyType,
    duration
  );
  const createRcpt = await createTx.wait();
  console.log("  tx:", createTx.hash, "gasUsed:", createRcpt.gasUsed.toString());

  // Derive policyId from event or nextPolicyId-1
  const nextPolicyId = await policyRegistry.nextPolicyId();
  const policyId = Number(nextPolicyId) - 1;
  console.log("Policy created. ID:", policyId);

  // 2) Submit Claim (msg.sender must be policyholder)
  const description = `Minor accident on ${new Date(now * 1000).toISOString()}`;
  const evidenceHashes = [
    "bafybeigdyrzt5examplecid0000000000000000000000000000000000000000001",
  ];

  console.log("\n[2/5] Submitting claim...");
  const submitTx = await claimsProcessor.submitClaim(
    policyId,
    description,
    evidenceHashes
  );
  const submitRcpt = await submitTx.wait();
  console.log("  tx:", submitTx.hash, "gasUsed:", submitRcpt.gasUsed.toString());

  const nextClaimId = await claimsProcessor.nextClaimId();
  const claimId = Number(nextClaimId) - 1;
  console.log("Claim submitted. ID:", claimId);

  // 3) Submit AI Analysis
  // Option A: If BACKEND_URL is set, call backend API and log request/response.
  // Option B: Otherwise, submit directly on-chain as AI oracle (deployer).
  const claimType = 0; // auto
  const severity = 3; // low
  const fraudRisk = 10; // below default autoApproveThreshold 20
  const recommendedPayoutUSD = 2000000n; // $2.00 (6 decimals)

  if (BACKEND_URL) {
    const url = `${BACKEND_URL.replace(/\/$/, "")}/api/claims/${claimId}/analyze`;
    console.log("\n[3/5] Calling backend AI analysis endpoint:", url);
    try {
      console.log("  Request: POST", url);
      const start = Date.now();
      const resp = await axios.post(url, {});
      const ms = Date.now() - start;
      console.log("  Response status:", resp.status, resp.statusText, `(${ms}ms)`);
      console.log("  Response data:", JSON.stringify(resp.data, null, 2));
      console.log("  Note: Backend performs Gemini AI call and on-chain submitAIAnalysis.")
    } catch (err) {
      console.log("  Backend analyze call failed; falling back to direct on-chain submission.");
      console.log("  Error:", err.response ? err.response.data : err.message);
      const aiTx = await claimsProcessor.submitAIAnalysis(
        claimId,
        claimType,
        severity,
        fraudRisk,
        recommendedPayoutUSD
      );
      const aiRcpt = await aiTx.wait();
      console.log("  Direct on-chain AI submission tx:", aiTx.hash, "gasUsed:", aiRcpt.gasUsed.toString());
    }
  } else {
    console.log("\n[3/5] Submitting AI analysis on-chain (no BACKEND_URL set)...");
    const aiTx = await claimsProcessor.submitAIAnalysis(
      claimId,
      claimType,
      severity,
      fraudRisk,
      recommendedPayoutUSD
    );
    const aiRcpt = await aiTx.wait();
    console.log("  tx:", aiTx.hash, "gasUsed:", aiRcpt.gasUsed.toString());
  }

  // 4) Verify payout details and balances
  const payout = await payoutManager.getPayoutDetails(claimId);
  console.log("\n[4/5] Payout details:");
  console.log("- recipient:", payout.recipient);
  console.log("- usdAmount:", payout.usdAmount.toString());
  console.log("- avaxAmount:", payout.avaxAmount.toString());
  console.log("- processed:", payout.processed);
  console.log("- withdrawn:", payout.withdrawn);

  const balanceBefore = await provider.getBalance(deployer.address);
  const userBalance = await payoutManager.getUserBalance(deployer.address);
  console.log("User withdrawable balance in PayoutManager:", userBalance.toString());

  if (userBalance > 0n) {
    console.log("\n[5/5] Withdrawing from PayoutManager...");
    const wTx = await payoutManager.withdraw();
    const wRcpt = await wTx.wait();
    console.log("  tx:", wTx.hash, "gasUsed:", wRcpt.gasUsed.toString());

    const balanceAfter = await provider.getBalance(deployer.address);
    console.log("  AVAX balance before:", hre.ethers.formatEther(balanceBefore),
                ", after:", hre.ethers.formatEther(balanceAfter));
  } else {
    console.log("\n[5/5] No withdrawable balance.");
  }

  // 5) Read claim status
  const claimStruct = await claimsProcessor.claims(claimId);
  console.log("\nFinal claim status:", claimStruct.status, "(0=Submitted,1=AIAnalyzed,2=UnderReview,3=Approved,4=Rejected,5=Paid)");
  console.log("Final payout:", claimStruct.finalPayout.toString());

  console.log("\nE2E test completed.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
