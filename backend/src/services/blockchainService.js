// Blockchain Integration Service for Insurance Claims Processor
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { InsuranceAIAnalyzer } from './aiAnalysisService.js';

// Resolve paths relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from project root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Load contract ABIs
const loadContractAbi = (contractName) => {
  try {
    const artifactPath = path.resolve(__dirname, `../../../artifacts/contracts/${contractName}.sol/${contractName}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    return artifact.abi;
  } catch (error) {
    console.error(`Error loading ABI for ${contractName}:`, error);
    return null;
  }
};

export class InsuranceBlockchainService {
  /**
   * Initialize the blockchain service
   * @param {string} rpcUrl - RPC URL for the blockchain
   * @param {string} privateKey - Private key for sending transactions
   */
  constructor(rpcUrl, privateKey) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    this.aiAnalyzer = new InsuranceAIAnalyzer();
    
    // Load contract addresses from env
    this.policyRegistryAddress = process.env.POLICY_REGISTRY_ADDRESS;
    this.claimsProcessorAddress = process.env.CLAIMS_PROCESSOR_ADDRESS;
    this.payoutManagerAddress = process.env.PAYOUT_MANAGER_ADDRESS;
    
    if (!this.policyRegistryAddress || !this.claimsProcessorAddress || !this.payoutManagerAddress) {
      throw new Error("Missing contract addresses in .env file");
    }
    
    // Load contract ABIs
    const policyRegistryAbi = loadContractAbi("PolicyRegistry");
    const claimsProcessorAbi = loadContractAbi("ClaimsProcessor");
    const payoutManagerAbi = loadContractAbi("PayoutManager");
    
    if (!policyRegistryAbi || !claimsProcessorAbi || !payoutManagerAbi) {
      throw new Error("Failed to load contract ABIs");
    }
    
    // Initialize contract instances
    this.policyRegistry = new ethers.Contract(
      this.policyRegistryAddress,
      policyRegistryAbi,
      this.signer
    );
    
    this.claimsProcessor = new ethers.Contract(
      this.claimsProcessorAddress,
      claimsProcessorAbi,
      this.signer
    );
    
    this.payoutManager = new ethers.Contract(
      this.payoutManagerAddress,
      payoutManagerAbi,
      this.signer
    );
    
    console.log("Blockchain service initialized with contracts:");
    console.log(`- PolicyRegistry: ${this.policyRegistryAddress}`);
    console.log(`- ClaimsProcessor: ${this.claimsProcessorAddress}`);
    console.log(`- PayoutManager: ${this.payoutManagerAddress}`);
  }
  
  /**
   * Process a new claim with AI analysis
   * @param {string} claimId - ID of the claim to process
   */
  async processNewClaim(claimId) {
    try {
      console.log(`Processing claim #${claimId}...`);
      
      // Get claim data from blockchain
      const claim = await this.claimsProcessor.getClaim(claimId);
      
      // Get policy data to determine policy type
      const policyId = claim.policyId.toString();
      const policy = await this.policyRegistry.getPolicy(policyId);
      const policyType = policy.policyType;
      
      console.log(`Claim #${claimId} is for policy #${policyId} (${policyType})`);
      
      // Perform AI analysis
      let analysis = await this.aiAnalyzer.analyzeClaim({
        description: claim.description,
        evidenceHashes: claim.evidenceHashes,
        policyType: policyType
      });
      
      // Optional override to force auto-approval for testing (avoids VRF path)
      if ((process.env.FORCE_AUTO_APPROVE || 'false').toLowerCase() === 'true') {
        console.log('[AI] FORCE_AUTO_APPROVE is enabled. Coercing analysis to auto-approve path.');
        analysis = {
          ...analysis,
          claimType: 0, // auto
          severity: Math.max(1, Math.min(10, analysis.severity || 3)),
          fraudRisk: 10, // below threshold
          recommendedPayout: analysis.recommendedPayout && analysis.recommendedPayout > 0 ? analysis.recommendedPayout : 2000000, // $2.00
          reasoning: (analysis.reasoning || '') + ' [forced auto-approve for testing]',
          confidence: Math.max(50, analysis.confidence || 80)
        };
      }
      
      console.log(`AI analysis completed for claim #${claimId}:`);
      console.log(`- Claim Type: ${analysis.claimType}`);
      console.log(`- Severity: ${analysis.severity}/10`);
      console.log(`- Fraud Risk: ${analysis.fraudRisk}%`);
      console.log(`- Recommended Payout: $${analysis.recommendedPayout}`);
      console.log(`- Confidence: ${analysis.confidence}%`);
      console.log(`- Reasoning: ${analysis.reasoning}`);
      
      // Submit AI analysis back to blockchain
      const tx = await this.claimsProcessor.submitAIAnalysis(
        claimId,
        analysis.claimType,
        analysis.severity,
        analysis.fraudRisk,
        analysis.recommendedPayout
      );
      
      console.log(`Submitting AI analysis to blockchain (tx: ${tx.hash})...`);
      const receipt = await tx.wait();
      console.log(`AI analysis submitted for claim #${claimId} (block: ${receipt.blockNumber})`);
      
      return {
        success: true,
        claimId: claimId,
        analysis: analysis,
        transaction: tx.hash
      };
    } catch (error) {
      console.error(`Error processing claim #${claimId}:`, error);
      return {
        success: false,
        claimId: claimId,
        error: error.message
      };
    }
  }
  
  /**
   * Start listening for new claim submissions
   */
  startClaimListener() {
    console.log("Starting claim listener...");
    
    // Listen for ClaimSubmitted events
    this.claimsProcessor.on("ClaimSubmitted", async (claimId, policyId, claimant) => {
      console.log(`New claim submitted: #${claimId.toString()} for policy #${policyId.toString()} by ${claimant}`);
      
      // Add small delay to ensure blockchain state is updated
      setTimeout(async () => {
        await this.processNewClaim(claimId.toString());
      }, 5000);
    });
    
    console.log("Claim listener started");
  }
  
  /**
   * Process any pending claims that haven't been analyzed yet
   * @param {number} startId - Starting claim ID to check
   * @param {number} endId - Ending claim ID to check
   */
  async processPendingClaims(startId = 1, endId = 100) {
    console.log(`Checking for pending claims between IDs ${startId}-${endId}...`);
    
    for (let i = startId; i <= endId; i++) {
      try {
        const claim = await this.claimsProcessor.getClaim(i);
        
        // If claim exists and is in Submitted status
        if (claim.status === 0) { // Submitted
          console.log(`Found pending claim #${i}`);
          await this.processNewClaim(i.toString());
        }
      } catch (error) {
        // Skip if claim doesn't exist
        if (!error.message.includes("revert")) {
          console.error(`Error checking claim #${i}:`, error);
        }
      }
    }
    
    console.log("Finished processing pending claims");
  }
  
  /**
   * Get policy details
   * @param {string} policyId - ID of the policy
   * @returns {Object} Policy details
   */
  async getPolicy(policyId) {
    try {
      const policy = await this.policyRegistry.getPolicy(policyId);
      return policy;
    } catch (error) {
      console.error(`Error getting policy #${policyId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get claim details
   * @param {string} claimId - ID of the claim
   * @returns {Object} Claim details
   */
  async getClaim(claimId) {
    try {
      const claim = await this.claimsProcessor.getClaim(claimId);
      return claim;
    } catch (error) {
      console.error(`Error getting claim #${claimId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get user's policies
   * @param {string} userAddress - User's address
   * @returns {Array} Array of policy IDs
   */
  async getUserPolicies(userAddress) {
    try {
      const policyIds = await this.policyRegistry.getUserPolicies(userAddress);
      return policyIds;
    } catch (error) {
      console.error(`Error getting policies for ${userAddress}:`, error);
      throw error;
    }
  }
  
  /**
   * Get user's claims
   * @param {string} userAddress - User's address
   * @returns {Array} Array of claim IDs
   */
  async getUserClaims(userAddress) {
    try {
      const claimIds = await this.claimsProcessor.getUserClaims(userAddress);
      return claimIds;
    } catch (error) {
      console.error(`Error getting claims for ${userAddress}:`, error);
      throw error;
    }
  }
}
