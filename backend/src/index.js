// Main Backend Server for Insurance Claims Processor
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ethers } from 'ethers';

// Import services
import { InsuranceBlockchainService } from './services/blockchainService.js';
import { InsuranceAIAnalyzer } from './services/aiAnalysisService.js';
import { IPFSService } from './services/ipfsService.js';
// Gateway middlewares
import { requestLogger } from './middleware/requestLogger.js';
import { apiKeyAuth } from './middleware/apiKeyAuth.js';
import { rateLimiter } from './middleware/rateLimiter.js';

// Configure environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Initialize Express app
const app = express();
const port = process.env.PORT || 3001;

// ----- API Gateway Layer -----
// Request logging
app.use(requestLogger);

// CORS whitelist
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // non-browser or same-origin
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};
app.use(cors(corsOptions));

// JSON body parsing
app.use(express.json());

// Version alias: rewrite /api/v1/* -> /api/*
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/v1/')) {
    req.url = req.originalUrl.replace('/api/v1', '/api');
  }
  next();
});

// API Key auth and rate limiting (enabled only if envs are set)
app.use('/api', apiKeyAuth);
app.use('/api', rateLimiter);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

// Admin-only: Create a policy (mirrors scripts/test-e2e.js createPolicy)
app.post('/api/policies/create', async (req, res) => {
  try {
    const { holder, premium, coverage, deductible, policyType, duration } = req.body;
    if (!holder || premium == null || coverage == null || deductible == null || !policyType || duration == null) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const tx = await blockchainService.policyRegistry.createPolicy(
      holder,
      premium,
      coverage,
      deductible,
      policyType,
      duration
    );
    const rcpt = await tx.wait();

    // Derive policyId from event or nextPolicyId - 1
    let policyId = 'Unknown';
    try {
      const evt = rcpt.logs.find(l => l.fragment && l.fragment.name === 'PolicyCreated');
      if (evt) policyId = evt.args.policyId.toString();
      else {
        const next = await blockchainService.policyRegistry.nextPolicyId();
        policyId = (Number(next) - 1).toString();
      }
    } catch {}

    res.status(200).json({ success: true, policyId, transactionHash: tx.hash });
  } catch (error) {
    console.error('Error creating policy:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
const upload = multer({ storage });

// Initialize services
const rpcUrl = process.env.AVALANCHE_FUJI_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;
const enableListener = (process.env.ENABLE_LISTENER || 'false').toLowerCase() === 'true';

if (!rpcUrl || !privateKey) {
  console.error("Missing RPC URL or private key in .env file");
  process.exit(1);
}

let blockchainService, aiAnalyzer, ipfsService;

try {
  blockchainService = new InsuranceBlockchainService(rpcUrl, privateKey);
  aiAnalyzer = new InsuranceAIAnalyzer();
  ipfsService = new IPFSService();
  
  console.log("Services initialized successfully");
} catch (error) {
  console.error("Error initializing services:", error);
  process.exit(1);
}

// Define API routes
// Simple in-memory caches
const userPoliciesCache = new Map(); // Map<addressLower, { data: string[], expiresAt: number }>
const USER_POLICIES_TTL_MS = Number(process.env.USER_POLICIES_TTL_MS || 5_000);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      blockchain: Boolean(blockchainService),
      ai: Boolean(aiAnalyzer),
      ipfs: Boolean(ipfsService)
    }
  });
});

// Public config for frontend (non-sensitive)
app.get('/api/config', (_req, res) => {
  res.status(200).json({
    success: true,
    chain: {
      rpcUrl: process.env.AVALANCHE_FUJI_RPC_URL || '',
      chainId: 43113
    },
    contracts: {
      policyRegistry: blockchainService?.policyRegistryAddress || '',
      claimsProcessor: blockchainService?.claimsProcessorAddress || '',
      payoutManager: blockchainService?.payoutManagerAddress || ''
    }
  });
});

// Upload evidence to IPFS
app.post('/api/evidence/upload', upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }
    
    const results = [];
    
    // Upload each file to IPFS
    for (const file of req.files) {
      const fileContent = fs.readFileSync(file.path);
      const cid = await ipfsService.uploadFile(fileContent, file.originalname);
      
      // Clean up the temporary file
      fs.unlinkSync(file.path);
      
      results.push({
        originalName: file.originalname,
        cid,
        url: ipfsService.getPublicUrl(cid)
      });
    }
    
    res.status(200).json({
      success: true,
      files: results
    });
  } catch (error) {
    console.error('Error uploading evidence:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get evidence from IPFS
app.get('/api/evidence/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    const exists = await ipfsService.checkFileExists(cid);
    
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'Evidence not found'
      });
    }
    
    const url = ipfsService.getPublicUrl(cid);
    res.status(200).json({
      success: true,
      cid,
      url
    });
  } catch (error) {
    console.error('Error retrieving evidence:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Manually submit a claim to the blockchain
app.post('/api/claims/submit', async (req, res) => {
  try {
    const { policyId, description, evidenceHashes, userAddress } = req.body;
    
    if (!policyId || !description || !Array.isArray(evidenceHashes) || evidenceHashes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    // Connect to user's address if provided (for frontend integration)
    let claimsProcessor = blockchainService.claimsProcessor;
    if (userAddress) {
      // Note: This assumes the frontend will handle the signing process
      // In a real app, you would use the user's wallet provider
      console.log(`Using user address ${userAddress} for submission`);
    }
    
    // Submit claim to blockchain
    const tx = await claimsProcessor.submitClaim(policyId, description, evidenceHashes);
    const receipt = await tx.wait();
    
    // Extract claim ID from event
    const event = receipt.logs.find(log => 
      log.fragment && log.fragment.name === "ClaimSubmitted"
    );
    const claimId = event ? event.args.claimId.toString() : "Unknown";
    
    res.status(200).json({
      success: true,
      claimId,
      transactionHash: tx.hash
    });
  } catch (error) {
    console.error('Error submitting claim:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Trigger AI analysis for a claim
app.post('/api/claims/:claimId/analyze', async (req, res) => {
  try {
    const { claimId } = req.params;
    
    // Process claim with AI analysis
    const result = await blockchainService.processNewClaim(claimId);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }
    
    res.status(200).json({
      success: true,
      claimId,
      analysis: result.analysis,
      transactionHash: result.transaction
    });
  } catch (error) {
    console.error(`Error analyzing claim #${req.params.claimId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get claim details
app.get('/api/claims/:claimId', async (req, res) => {
  try {
    const { claimId } = req.params;
    const claim = await blockchainService.getClaim(claimId);
    
    // Map status codes to names
    const statusMap = ["Submitted", "AIAnalyzed", "UnderReview", "Approved", "Rejected", "Paid"];
    
    const response = {
      id: claimId,
      policyId: claim.policyId.toString(),
      claimant: claim.claimant,
      description: claim.description,
      evidenceHashes: claim.evidenceHashes,
      evidenceUrls: claim.evidenceHashes.map(hash => ipfsService.getPublicUrl(hash)),
      timestamp: new Date(Number(claim.timestamp) * 1000).toISOString(),
      status: statusMap[Number(claim.status)],
      statusCode: Number(claim.status),
      assignedReviewer: claim.assignedReviewer,
      finalPayout: claim.finalPayout.toString(),
      aiAnalysis: {
        claimType: Number(claim.claimType),
        severity: Number(claim.severity),
        fraudRisk: Number(claim.fraudRisk),
        recommendedPayout: claim.recommendedPayout.toString()
      }
    };
    
    res.status(200).json({
      success: true,
      claim: response
    });
  } catch (error) {
    console.error(`Error getting claim #${req.params.claimId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get policy details
app.get('/api/policies/:policyId', async (req, res) => {
  try {
    const { policyId } = req.params;
    const policy = await blockchainService.getPolicy(policyId);
    
    const response = {
      id: policyId,
      holder: policy.policyholder,
      premium: policy.premium.toString(),
      coverage: policy.coverage.toString(),
      deductible: policy.deductible.toString(),
      policyType: policy.policyType,
      startTime: new Date(Number(policy.startDate) * 1000).toISOString(),
      endTime: new Date(Number(policy.endDate) * 1000).toISOString(),
      isActive: policy.isActive
    };
    
    res.status(200).json({
      success: true,
      policy: response
    });
  } catch (error) {
    console.error(`Error getting policy #${req.params.policyId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user's policies
app.get('/api/users/:address/policies', async (req, res) => {
  try {
    const { address } = req.params;
    const key = String(address).toLowerCase();
    const now = Date.now();

    // Serve from cache if fresh
    const cached = userPoliciesCache.get(key);
    if (cached && now < cached.expiresAt) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json({ success: true, address, policyIds: cached.data });
    }

    const policyIds = await blockchainService.getUserPolicies(address);
    const normalized = policyIds.map(id => id.toString());

    // Store in cache
    userPoliciesCache.set(key, { data: normalized, expiresAt: now + USER_POLICIES_TTL_MS });
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json({ success: true, address, policyIds: normalized });
  } catch (error) {
    console.error(`Error getting policies for ${req.params.address}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user's claims
app.get('/api/users/:address/claims', async (req, res) => {
  try {
    const { address } = req.params;
    const claimIds = await blockchainService.getUserClaims(address);
    
    res.status(200).json({
      success: true,
      address,
      claimIds: claimIds.map(id => id.toString())
    });
  } catch (error) {
    console.error(`Error getting claims for ${req.params.address}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Reviewer approves a claim with final payout (6 decimals USD)
app.post('/api/claims/:claimId/reviewer-approve', async (req, res) => {
  try {
    const { claimId } = req.params;
    const { payoutUsd } = req.body;
    if (payoutUsd == null) {
      return res.status(400).json({ success: false, error: 'Missing payoutUsd' });
    }
    const tx = await blockchainService.claimsProcessor.reviewerApproveClaim(claimId, payoutUsd);
    const rcpt = await tx.wait();
    res.status(200).json({ success: true, claimId, transactionHash: tx.hash, gasUsed: rcpt.gasUsed?.toString?.() });
  } catch (error) {
    console.error(`Error reviewer-approving claim #${req.params.claimId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get payout details for a claim
app.get('/api/payouts/:claimId', async (req, res) => {
  try {
    const { claimId } = req.params;
    const payout = await blockchainService.payoutManager.getPayoutDetails(claimId);
    res.status(200).json({ success: true, payout: {
      recipient: payout.recipient,
      usdAmount: payout.usdAmount?.toString?.(),
      avaxAmount: payout.avaxAmount?.toString?.(),
      processed: payout.processed,
      withdrawn: payout.withdrawn
    }});
  } catch (error) {
    console.error(`Error getting payout details for claim #${req.params.claimId}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user's withdrawable AVAX balance in PayoutManager
app.get('/api/users/:address/balance', async (req, res) => {
  try {
    const { address } = req.params;
    const bal = await blockchainService.payoutManager.getUserBalance(address);
    res.status(200).json({ success: true, address, balance: bal.toString() });
  } catch (error) {
    console.error(`Error getting user balance for ${req.params.address}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------- Admin Endpoints ----------------

// Add reviewer
app.post('/api/admin/reviewers/add', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ success: false, error: 'Missing address' });
    const tx = await blockchainService.claimsProcessor.addReviewer(address);
    const rcpt = await tx.wait();
    res.status(200).json({ success: true, address, transactionHash: tx.hash, gasUsed: rcpt.gasUsed?.toString?.() });
  } catch (error) {
    console.error('Error adding reviewer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove reviewer
app.post('/api/admin/reviewers/remove', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ success: false, error: 'Missing address' });
    const tx = await blockchainService.claimsProcessor.removeReviewer(address);
    const rcpt = await tx.wait();
    res.status(200).json({ success: true, address, transactionHash: tx.hash, gasUsed: rcpt.gasUsed?.toString?.() });
  } catch (error) {
    console.error('Error removing reviewer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Set AI oracle address
app.post('/api/admin/oracle', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ success: false, error: 'Missing address' });
    const tx = await blockchainService.claimsProcessor.setAIOracle(address);
    const rcpt = await tx.wait();
    res.status(200).json({ success: true, address, transactionHash: tx.hash, gasUsed: rcpt.gasUsed?.toString?.() });
  } catch (error) {
    console.error('Error setting AI oracle:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Set auto-approve / auto-reject thresholds
app.post('/api/admin/thresholds', async (req, res) => {
  try {
    const { autoApprove, autoReject } = req.body;
    if (autoApprove == null || autoReject == null) {
      return res.status(400).json({ success: false, error: 'Missing thresholds' });
    }
    const tx = await blockchainService.claimsProcessor.setThresholds(autoApprove, autoReject);
    const rcpt = await tx.wait();
    res.status(200).json({ success: true, autoApprove, autoReject, transactionHash: tx.hash, gasUsed: rcpt.gasUsed?.toString?.() });
  } catch (error) {
    console.error('Error setting thresholds:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Payout manager: set treasury
app.post('/api/admin/payout/treasury', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ success: false, error: 'Missing address' });
    const tx = await blockchainService.payoutManager.setTreasury(address);
    const rcpt = await tx.wait();
    res.status(200).json({ success: true, address, transactionHash: tx.hash, gasUsed: rcpt.gasUsed?.toString?.() });
  } catch (error) {
    console.error('Error setting treasury:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Payout manager: set price feed
app.post('/api/admin/payout/price-feed', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ success: false, error: 'Missing address' });
    const tx = await blockchainService.payoutManager.setPriceFeed(address);
    const rcpt = await tx.wait();
    res.status(200).json({ success: true, address, transactionHash: tx.hash, gasUsed: rcpt.gasUsed?.toString?.() });
  } catch (error) {
    console.error('Error setting price feed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Payout manager: deposit AVAX for payouts (from backend signer)
app.post('/api/admin/payout/deposit', async (req, res) => {
  try {
    const { amountAvax } = req.body; // string or number
    if (amountAvax == null) return res.status(400).json({ success: false, error: 'Missing amountAvax' });
    const value = ethers.parseEther(String(amountAvax));
    const tx = await blockchainService.payoutManager.deposit({ value });
    const rcpt = await tx.wait();
    res.status(200).json({ success: true, amountAvax: String(amountAvax), transactionHash: tx.hash, gasUsed: rcpt.gasUsed?.toString?.() });
  } catch (error) {
    console.error('Error depositing to PayoutManager:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Payout manager: stats
app.get('/api/admin/payout/stats', async (_req, res) => {
  try {
    const availableFunds = await blockchainService.payoutManager.availableFunds();
    const totalPayouts = await blockchainService.payoutManager.totalPayouts();
    const totalWithdrawn = await blockchainService.payoutManager.totalWithdrawn();
    const onchainBal = await blockchainService.payoutManager.getContractBalance();
    res.status(200).json({ success: true, stats: {
      availableFunds: availableFunds.toString(),
      totalPayouts: totalPayouts.toString(),
      totalWithdrawn: totalWithdrawn.toString(),
      contractBalance: onchainBal.toString()
    }});
  } catch (error) {
    console.error('Error reading payout stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start blockchain listener when server starts
let claimListener;

// Start the server
app.listen(port, () => {
  console.log(`Insurance Claims Processor API running on port ${port}`);
  
  const enableListener = process.env.ENABLE_LISTENER === 'true';
  
  if (enableListener) {
    console.log("Starting claim listener...");
    blockchainService.startClaimListener();
    console.log("Claim listener started");
  } else {
    console.log("Claim listener disabled (set ENABLE_LISTENER=true to enable). Use /api/claims/:claimId/analyze to process claims.");
  }
  
  if (enableListener) {
    // Check for pending claims on startup
    blockchainService.processPendingClaims(1, 100);
  }
});

// Handle server shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  
  // Remove blockchain listeners
  if (blockchainService) {
    blockchainService.claimsProcessor.removeAllListeners();
  }
  
  process.exit(0);
});
