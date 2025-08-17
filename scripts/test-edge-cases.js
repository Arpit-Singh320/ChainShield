// Edge-case test script for ChainShield contracts
// CommonJS + Hardhat v2

const hre = require("hardhat");
require("dotenv").config();

async function expectRevert(promise, note) {
  try {
    const tx = await promise;
    await tx.wait();
    console.log(`  [FAIL] Expected revert${note ? ` (${note})` : ""}, but tx succeeded:`, tx.hash);
  } catch (err) {
    const msg = err?.error?.message || err?.message || String(err);
    console.log(`  [OK] Reverted as expected${note ? ` (${note})` : ""}:`, msg.split("\n")[0]);
  }
}

async function main() {
  const provider = hre.ethers.provider;
  const signers = await hre.ethers.getSigners();
  const admin = signers[0];
  const user2 = signers[1];
  const user3 = signers[2];
  console.log("Admin:", admin?.address);
  if (user2) console.log("User2:", user2.address); else console.log("User2: <none>");
  if (user3) console.log("User3:", user3.address); else console.log("User3: <none>");
  console.log("Network:", (await provider.getNetwork()).name, "ChainId:", (await provider.getNetwork()).chainId);

  // Load addresses from .env
  const POLICY_REGISTRY_ADDRESS = process.env.POLICY_REGISTRY_ADDRESS;
  const CLAIMS_PROCESSOR_ADDRESS = process.env.CLAIMS_PROCESSOR_ADDRESS;
  const PAYOUT_MANAGER_ADDRESS = process.env.PAYOUT_MANAGER_ADDRESS;
  if (!POLICY_REGISTRY_ADDRESS || !CLAIMS_PROCESSOR_ADDRESS || !PAYOUT_MANAGER_ADDRESS) {
    throw new Error("Missing contract addresses in .env");
  }

  // Attach contracts
  const PolicyRegistry = await hre.ethers.getContractFactory("PolicyRegistry");
  const ClaimsProcessor = await hre.ethers.getContractFactory("ClaimsProcessor");
  const PayoutManager = await hre.ethers.getContractFactory("PayoutManager");

  const policyRegistry = PolicyRegistry.attach(POLICY_REGISTRY_ADDRESS).connect(admin);
  const claimsProcessor = ClaimsProcessor.attach(CLAIMS_PROCESSOR_ADDRESS).connect(admin);
  const payoutManager = PayoutManager.attach(PAYOUT_MANAGER_ADDRESS).connect(admin);

  console.log("Contracts:");
  console.log("- PolicyRegistry:", policyRegistry.address);
  console.log("- ClaimsProcessor:", claimsProcessor.address);
  console.log("- PayoutManager:", payoutManager.address);

  // Helper: create a policy for a given holder
  async function createPolicyFor(holder) {
    const premium = hre.ethers.parseEther("0.01");
    const coverageUSD = 5000000n; // $5 with 6 decimals
    const deductibleUSD = 1000000n; // $1 with 6 decimals
    const policyType = "auto";
    const duration = 60n * 60n * 24n * 30n; // 30 days
    const tx = await policyRegistry.createPolicy(holder, premium, coverageUSD, deductibleUSD, policyType, duration);
    await tx.wait();
    const nextPolicyId = await policyRegistry.nextPolicyId();
    return Number(nextPolicyId) - 1;
  }

  // Edge 0: submitClaim against a non-existent policyId
  console.log("\n[Edge 0] submitClaim with invalid policyId should revert");
  await expectRevert(
    claimsProcessor.submitClaim(999999, "invalid policy test", []),
    "Invalid policyId"
  );

  // Create a valid policy for admin
  console.log("\n[Setup] Creating a policy for admin as policyholder...");
  const policyId = await createPolicyFor(admin.address);
  console.log("  policyId:", policyId);

  // Edge 1: non-policyholder tries to submit claim on someone else's policy
  console.log("\n[Edge 1] Non-policyholder submitClaim should revert");
  if (user2) {
    await expectRevert(
      ClaimsProcessor.attach(CLAIMS_PROCESSOR_ADDRESS).connect(user2).submitClaim(
        policyId,
        "user2 cannot claim on admin's policy",
        []
      ),
      "Non-holder claim"
    );
  } else {
    console.log("  [SKIP] No secondary funded signer available on this network.");
  }

  // Edge 2: cancel policy, then policyholder tries to submit claim (should revert)
  console.log("\n[Edge 2] Cancel policy then submitClaim should revert");
  const cancelTx = await policyRegistry.cancelPolicy(policyId);
  await cancelTx.wait();
  await expectRevert(
    claimsProcessor.submitClaim(policyId, "claim on cancelled policy", []),
    "Cancelled policy"
  );

  // Setup: create a fresh active policy and submit a claim correctly by the holder
  console.log("\n[Setup] Create fresh policy and submit a valid claim...");
  const freshPolicyId = await createPolicyFor(admin.address);
  const submitTx = await claimsProcessor.submitClaim(
    freshPolicyId,
    "Valid claim for AI analysis",
    [
      "bafybeigdyrzt5examplecid0000000000000000000000000000000000000000001",
    ]
  );
  await submitTx.wait();
  const nextClaimId = await claimsProcessor.nextClaimId();
  const claimId = Number(nextClaimId) - 1;
  console.log("  claimId:", claimId);

  // Edge 3: unauthorized AI submit (only AI oracle)
  console.log("\n[Edge 3] submitAIAnalysis from non-oracle should revert");
  if (user2) {
    const unauthorized = ClaimsProcessor.attach(CLAIMS_PROCESSOR_ADDRESS).connect(user2);
    await expectRevert(
      unauthorized.submitAIAnalysis(claimId, 0, 5, 10, 1000000n),
      "Only AI oracle"
    );
  } else {
    console.log("  [SKIP] No secondary signer; cannot test non-oracle path.");
  }

  // Edge 4: high fraud risk should auto-reject
  console.log("\n[Edge 4] High fraudRisk should auto-reject (no VRF path)");
  const highRisk = 90; // > autoRejectThreshold default 70
  const aiTxReject = await claimsProcessor.submitAIAnalysis(
    claimId,
    0,
    5,
    highRisk,
    0n // recommended payout 0 for rejected path
  );
  await aiTxReject.wait();
  const claimStructReject = await claimsProcessor.claims(claimId);
  console.log("  status:", claimStructReject.status, "(expect 4=Rejected)");

  // Setup: new claim that will be auto-approved (low risk). This may revert at payout step if insufficient funds.
  console.log("\n[Setup] New claim for auto-approve path (may hit Insufficient funds)");
  const submitTx2 = await claimsProcessor.submitClaim(
    freshPolicyId,
    "Claim for auto-approve payout",
    []
  );
  await submitTx2.wait();
  const nextClaimId2 = await claimsProcessor.nextClaimId();
  const claimId2 = Number(nextClaimId2) - 1;
  const lowRisk = 5; // < autoApproveThreshold default 20
  const payoutUSD = 2000000n; // $2.00

  console.log("  Attempting AI analysis that should approve and trigger payout...");
  let approved = false;
  try {
    const aiTxApprove = await claimsProcessor.submitAIAnalysis(
      claimId2,
      0,
      3,
      lowRisk,
      payoutUSD
    );
    await aiTxApprove.wait();
    approved = true;
  } catch (err) {
    const msg = err?.error?.message || err?.message || String(err);
    console.log("  [Info] Auto-approve transaction failed (expected if PayoutManager underfunded):", msg.split("\n")[0]);
  }

  if (!approved) {
    // Try funding the PayoutManager, then retry the flow with a new claim
    console.log("\n[Edge 5] Funding PayoutManager and retrying auto-approve path");
    const fundAmount = hre.ethers.parseEther("0.2"); // adjust if needed
    const fundTx = await admin.sendTransaction({ to: payoutManager.address, value: fundAmount });
    await fundTx.wait();
    console.log("  Funded PayoutManager with:", hre.ethers.formatEther(fundAmount), "AVAX");

    const submitTx3 = await claimsProcessor.submitClaim(
      freshPolicyId,
      "Claim after funding PayoutManager",
      []
    );
    await submitTx3.wait();
    const nextClaimId3 = await claimsProcessor.nextClaimId();
    const claimId3 = Number(nextClaimId3) - 1;

    const aiTxApprove2 = await claimsProcessor.submitAIAnalysis(
      claimId3,
      0,
      3,
      lowRisk,
      payoutUSD
    );
    await aiTxApprove2.wait();

    const payout = await payoutManager.getPayoutDetails(claimId3);
    console.log("  Payout processed? processed=", payout.processed, ", avaxAmount=", payout.avaxAmount.toString());

    const userBal = await payoutManager.getUserBalance(admin.address);
    console.log("  User withdrawable balance:", userBal.toString());

    if (userBal > 0n) {
      const wTx = await payoutManager.withdraw();
      await wTx.wait();
      console.log("  Withdrawn successfully.");
    }
  }

  // Edge 6: withdraw with zero balance should revert
  console.log("\n[Edge 6] Withdraw with zero balance should revert (if no balance)");
  if (user3) {
    const balNow = await payoutManager.getUserBalance(user3.address);
    if (balNow === 0n) {
      await expectRevert(
        PayoutManager.attach(PAYOUT_MANAGER_ADDRESS).connect(user3).withdraw(),
        "Zero balance withdraw"
      );
    } else {
      console.log("  Skipping: user3 unexpectedly has a balance.");
    }
  } else {
    console.log("  [SKIP] No tertiary signer; cannot test zero-balance withdraw.");
  }

  console.log("\nEdge-case tests completed.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
