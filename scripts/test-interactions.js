// Test script for interacting with Insurance Claims Processor contracts
const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("Testing Insurance Claims Processor contracts...");

  // Load contract addresses from .env
  const policyRegistryAddress = process.env.POLICY_REGISTRY_ADDRESS;
  const claimsProcessorAddress = process.env.CLAIMS_PROCESSOR_ADDRESS;
  const payoutManagerAddress = process.env.PAYOUT_MANAGER_ADDRESS;

  if (!policyRegistryAddress || !claimsProcessorAddress || !payoutManagerAddress) {
    throw new Error("Missing contract addresses in .env file");
  }

  // Get contract instances
  const policyRegistry = await ethers.getContractAt("PolicyRegistry", policyRegistryAddress);
  const claimsProcessor = await ethers.getContractAt("ClaimsProcessor", claimsProcessorAddress);
  const payoutManager = await ethers.getContractAt("PayoutManager", payoutManagerAddress);

  // Get signers (may be only one on Fuji). Fallback to admin when missing.
  const signers = await ethers.getSigners();
  const admin = signers[0];
  const user1 = signers[1] || admin;
  const user2 = signers[2];
  const reviewer = signers[3] || admin;

  console.log("Testing with accounts:");
  console.log(`- Admin: ${admin?.address}`);
  console.log(`- User1: ${user1 ? user1.address : '<none>'}`);
  console.log(`- User2: ${user2 ? user2.address : '<none>'}`);
  console.log(`- Reviewer: ${reviewer ? reviewer.address : '<none>'}`);

  // 1. Create policies for users
  console.log("\n----- Creating Policies -----");
  
  // Create policy for User1 - Auto insurance
  const premium1 = ethers.parseEther("0.1"); // 0.1 AVAX premium
  const coverage1 = ethers.parseEther("10"); // 10 AVAX coverage
  const deductible1 = ethers.parseEther("0.5"); // 0.5 AVAX deductible
  const duration1 = 30 * 24 * 60 * 60; // 30 days in seconds
  
  try {
    const tx1 = await policyRegistry.createPolicy(
      user1.address,
      premium1,
      coverage1,
      deductible1,
      "auto",
      duration1
    );
    const receipt1 = await tx1.wait();
    const event1 = receipt1.logs.find(log => 
      log.fragment && log.fragment.name === "PolicyCreated"
    );
    const policyId1 = event1 ? event1.args.policyId : "Unknown";
    console.log(`Created Auto Policy #${policyId1} for ${user1.address}`);
    
    // Create policy for User2 - Home insurance (skip if no secondary signer)
    if (!user2) {
      console.log("Skipping User2 policy creation: no secondary signer available on this network.");
    } else {
      const premium2 = ethers.parseEther("0.2"); // 0.2 AVAX premium
      const coverage2 = ethers.parseEther("20"); // 20 AVAX coverage
      const deductible2 = ethers.parseEther("1"); // 1 AVAX deductible
      const duration2 = 365 * 24 * 60 * 60; // 365 days in seconds
      
      const tx2 = await policyRegistry.createPolicy(
        user2.address,
        premium2,
        coverage2,
        deductible2,
        "home",
        duration2
      );
      const receipt2 = await tx2.wait();
      const event2 = receipt2.logs.find(log => 
        log.fragment && log.fragment.name === "PolicyCreated"
      );
      const policyId2 = event2 ? event2.args.policyId : "Unknown";
      console.log(`Created Home Policy #${policyId2} for ${user2.address}`);
    }
    
    // 2. User1 submits a claim
    console.log("\n----- Submitting Claims -----");
  
  // Connect as User1
  const user1ClaimsProcessor = claimsProcessor.connect(user1);

  // Ensure User1 has gas to submit transactions on Fuji
  try {
    const minBalance = ethers.parseEther("0.01"); // 0.01 AVAX threshold
    const targetTopUp = ethers.parseEther("0.05"); // top-up amount
    const user1Bal = await ethers.provider.getBalance(user1.address);
    if (user1Bal < minBalance) {
      console.log(`User1 balance low (${ethers.formatEther(user1Bal)} AVAX). Funding with ${ethers.formatEther(targetTopUp)} AVAX from admin...`);
      const fundTx = await admin.sendTransaction({ to: user1.address, value: targetTopUp });
      await fundTx.wait();
      const newBal = await ethers.provider.getBalance(user1.address);
      console.log(`User1 new balance: ${ethers.formatEther(newBal)} AVAX`);
    }
  } catch (fundErr) {
    console.log("Warning: auto-fund step failed (continuing):", fundErr?.message || fundErr);
  }

  // Submit a claim
  const description = "My car was damaged in an accident on Main Street.";
  const evidenceHashes = [
    "QmP8jTG1m9GSDJLCbeWhVSVgEzCPPwXEtXRP3FubKcJUNE", // Image of damage
    "QmYbdAKkwF9rqlDB8qtdPWiuxHX9bRVk91Xf4aRrJXkFTQ"  // Accident report
  ];

  const claimTx = await user1ClaimsProcessor.submitClaim(
    policyId1,
    description,
    evidenceHashes
  );
  const claimReceipt = await claimTx.wait();
  const claimEvent = claimReceipt.logs.find(log =>
    log.fragment && log.fragment.name === "ClaimSubmitted"
  );
  const claimId = claimEvent ? claimEvent.args.claimId : "Unknown";
  console.log(`User1 submitted Claim #${claimId} for Policy #${policyId1}`);
    
    // 3. Admin submits AI analysis results (simulating the AI Oracle)
    console.log("\n----- Submitting AI Analysis -----");
    
    // AI Analysis Results
    const claimType = 0; // Auto claim
    const severity = 7;   // 7/10 severity
    const fraudRisk = 15; // 15% fraud risk (low)
    const recommendedPayout = ethers.parseUnits("500", 6); // $500 (in USDC 6 decimals)
    
    const aiTx = await claimsProcessor.submitAIAnalysis(
      claimId,
      claimType,
      severity,
      fraudRisk,
      recommendedPayout
    );
    await aiTx.wait();
    console.log(`AI analysis submitted for Claim #${claimId}`);
    console.log(`- Claim Type: ${claimType} (Auto)`);
    console.log(`- Severity: ${severity}/10`);
    console.log(`- Fraud Risk: ${fraudRisk}%`);
    console.log(`- Recommended Payout: $${ethers.formatUnits(recommendedPayout, 6)}`);
    
    // 4. Check claim status
    console.log("\n----- Checking Claim Status -----");
    
    const claim = await claimsProcessor.getClaim(claimId);
    const statusMap = ["Submitted", "AIAnalyzed", "UnderReview", "Approved", "Rejected", "Paid"];
    console.log(`Claim #${claimId} Status: ${statusMap[claim.status]}`);
    
    // If approved automatically (fraudRisk < autoApproveThreshold)
    if (claim.status === 3 || claim.status === 5) { // Approved or Paid
      console.log(`Claim was auto-approved with payout of $${ethers.formatUnits(claim.finalPayout, 6)}`);
      
      // 5. Check payout details
      console.log("\n----- Checking Payout Details -----");
      
      const payout = await payoutManager.getPayoutDetails(claimId);
      console.log(`Payout Details for Claim #${claimId}:`);
      console.log(`- USD Amount: $${ethers.formatUnits(payout.usdAmount, 6)}`);
      console.log(`- AVAX Amount: ${ethers.formatEther(payout.avaxAmount)} AVAX`);
      console.log(`- Processed: ${payout.processed}`);
      console.log(`- Withdrawn: ${payout.withdrawn}`);
      
      // 6. User1 withdraws funds
      console.log("\n----- Withdrawing Funds -----");
      
      const user1Balance = await payoutManager.getUserBalance(user1.address);
      console.log(`User1 balance before withdrawal: ${ethers.formatEther(user1Balance)} AVAX`);
      
      if (user1Balance > 0) {
        const user1PayoutManager = payoutManager.connect(user1);
        const withdrawTx = await user1PayoutManager.withdraw();
        await withdrawTx.wait();
        console.log(`User1 withdrew ${ethers.formatEther(user1Balance)} AVAX`);
      }
    } else if (claim.status === 2) { // Under Review
      console.log(`Claim needs human review (fraud risk: ${fraudRisk}%)`);
      console.log(`Assigned reviewer: ${claim.assignedReviewer}`);
      
      // If the reviewer is the admin, approve the claim
      if (claim.assignedReviewer.toLowerCase() === admin.address.toLowerCase()) {
        console.log("\n----- Reviewer Approving Claim -----");
        
        const reviewerApproveTx = await claimsProcessor.reviewerApproveClaim(
          claimId,
          recommendedPayout
        );
        await reviewerApproveTx.wait();
        console.log(`Reviewer approved Claim #${claimId} with payout: $${ethers.formatUnits(recommendedPayout, 6)}`);
      }
    } else if (claim.status === 4) { // Rejected
      console.log(`Claim was auto-rejected due to high fraud risk (${fraudRisk}%)`);
    }
    
    // 7. Get user's claims
    console.log("\n----- Getting User Claims -----");
    
    const userClaims = await claimsProcessor.getUserClaims(user1.address);
    console.log(`User1 has ${userClaims.length} claims`);
    for (let i = 0; i < userClaims.length; i++) {
      console.log(`- Claim #${userClaims[i]}`);
    }
    
    console.log("\nTest script execution completed!");
    
  } catch (error) {
    console.error("Error during test execution:");
    console.error(error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
