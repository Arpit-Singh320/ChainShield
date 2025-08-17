/* eslint-disable no-console */
// End-to-end API test script for the Insurance backend
// Usage:
//   node scripts/test-all-apis.js
// Optional env:
//   API_BASE=http://localhost:3001
//   API_KEY=your_api_key_if_enabled
//   HOLDER_ADDRESS=0x...
//   USER_ADDRESS=0x...        // if different from holder
//   REVIEWER_ADDRESS=0x...     // optional admin op
//   ORACLE_ADDRESS=0x...       // optional admin op
//   DEPOSIT_AMOUNT_AVAX=0.05   // optional admin op
//   REVIEW_PAYOUT_USD_6DEC=25000000 // $25.000000 for reviewer-approve
//   TEST_UPLOAD=true           // to test upload endpoint (requires 'form-data' package)

const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const API_KEY = process.env.API_KEY || '';
const HOLDER_ADDRESS = process.env.HOLDER_ADDRESS || process.env.USER_ADDRESS || '';
const USER_ADDRESS = process.env.USER_ADDRESS || HOLDER_ADDRESS;
const REVIEWER_ADDRESS = process.env.REVIEWER_ADDRESS || '';
const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS || '';
const DEPOSIT_AMOUNT_AVAX = process.env.DEPOSIT_AMOUNT_AVAX || '';
const REVIEW_PAYOUT_USD_6DEC = process.env.REVIEW_PAYOUT_USD_6DEC || '2500000'; // $2.50 default
const TEST_UPLOAD = (process.env.TEST_UPLOAD || 'false').toLowerCase() === 'true';

const client = axios.create({
  baseURL: API_BASE,
  headers: API_KEY ? { 'x-api-key': API_KEY } : undefined,
  timeout: 30000,
});

async function main() {
  console.log('--- Insurance Backend API E2E Test ---');
  console.log(`Base: ${API_BASE}`);

  // 1) Health & Config
  await step('GET /api/health', async () => {
    const { data } = await client.get('/api/health');
    console.log(data);
  });

  await step('GET /api/config', async () => {
    const { data } = await client.get('/api/config');
    console.log(data);
  });

  // 2) Admin: optional settings
  if (REVIEWER_ADDRESS) {
    await step('POST /api/admin/reviewers/add', async () => {
      const { data } = await client.post('/api/admin/reviewers/add', { address: REVIEWER_ADDRESS });
      console.log(data);
    }, true);
  }

  if (ORACLE_ADDRESS) {
    await step('POST /api/admin/oracle', async () => {
      const { data } = await client.post('/api/admin/oracle', { address: ORACLE_ADDRESS });
      console.log(data);
    }, true);
  }

  await step('POST /api/admin/thresholds', async () => {
    const { data } = await client.post('/api/admin/thresholds', { autoApprove: 15, autoReject: 80 });
    console.log(data);
  }, true);

  if (DEPOSIT_AMOUNT_AVAX) {
    await step('POST /api/admin/payout/deposit', async () => {
      const { data } = await client.post('/api/admin/payout/deposit', { amountAvax: DEPOSIT_AMOUNT_AVAX });
      console.log(data);
    }, true);
  }

  await step('GET /api/admin/payout/stats', async () => {
    const { data } = await client.get('/api/admin/payout/stats');
    console.log(data);
  }, true);

  // 3) Create policy (requires HOLDER_ADDRESS)
  assertAddr(HOLDER_ADDRESS, 'HOLDER_ADDRESS');
  let policyId = '';
  await step('POST /api/policies/create', async () => {
    const body = {
      holder: HOLDER_ADDRESS,
      premium: '1000',
      coverage: '50000',
      deductible: '100',
      policyType: 'AUTO',
      duration: 60 * 60 * 24 * 30, // 30 days
    };
    const { data } = await client.post('/api/policies/create', body);
    console.log(data);
    policyId = data.policyId || policyId;
  });

  // 4) Evidence upload (optional)
  let evidenceHashes = [];
  if (TEST_UPLOAD) {
    await step('POST /api/evidence/upload', async () => {
      // Require 'form-data' package at runtime, without adding to package.json
      let FormData;
      try {
        FormData = require('form-data');
      } catch {
        console.warn("Skipping upload: 'form-data' package not installed. Run: npm i form-data");
        return;
      }
      const form = new FormData();
      form.append('files', Buffer.from('Sample evidence text 1'), { filename: 'evidence1.txt', contentType: 'text/plain' });
      form.append('files', Buffer.from('Sample evidence text 2'), { filename: 'evidence2.txt', contentType: 'text/plain' });

      const { data } = await client.post('/api/evidence/upload', form, {
        headers: form.getHeaders(API_KEY ? { 'x-api-key': API_KEY } : undefined),
        maxBodyLength: Infinity,
      });
      console.log(data);
      evidenceHashes = (data.files || []).map(f => f.cid).filter(Boolean);
    });
  } else {
    evidenceHashes = ['bafybeigdyrdummyhash1', 'bafybeigdyrdummyhash2'];
    console.log('Skipping upload; using dummy CIDs for submit:', evidenceHashes);
  }

  // 5) Submit claim
  let claimId = '';
  await step('POST /api/claims/submit', async () => {
    const body = {
      policyId,
      description: 'Wallet drained due to phishing link. Request coverage.',
      evidenceHashes,
      userAddress: USER_ADDRESS,
    };
    const { data } = await client.post('/api/claims/submit', body);
    console.log(data);
    claimId = data.claimId || claimId;
  });

  // 6) Trigger AI analysis
  await step('POST /api/claims/:id/analyze', async () => {
    const { data } = await client.post(`/api/claims/${claimId}/analyze`);
    console.log(data);
  });

  // 7) Fetch claim & policy details
  await step('GET /api/claims/:id', async () => {
    const { data } = await client.get(`/api/claims/${claimId}`);
    console.log(data);
  });

  await step('GET /api/policies/:id', async () => {
    const { data } = await client.get(`/api/policies/${policyId}`);
    console.log(data);
  });

  await step('GET /api/users/:addr/policies', async () => {
    const { data } = await client.get(`/api/users/${HOLDER_ADDRESS}/policies`);
    console.log(data);
  });

  await step('GET /api/users/:addr/claims', async () => {
    const { data } = await client.get(`/api/users/${HOLDER_ADDRESS}/claims`);
    console.log(data);
  });

  // 8) Reviewer approve (optional path)
  await step('POST /api/claims/:id/reviewer-approve', async () => {
    try {
      const { data } = await client.post(`/api/claims/${claimId}/reviewer-approve`, { payoutUsd: REVIEW_PAYOUT_USD_6DEC });
      console.log(data);
    } catch (e) {
      console.warn('Reviewer-approve may fail if claim was auto-approved/rejected, or signer is not assigned reviewer. Continuing...', e.response?.data || e.message);
    }
  }, true);

  // 9) Payouts and balance
  await step('GET /api/payouts/:id', async () => {
    try {
      const { data } = await client.get(`/api/payouts/${claimId}`);
      console.log(data);
    } catch (e) {
      console.warn('Payout details not available yet (claim may not be approved).');
    }
  }, true);

  await step('GET /api/users/:addr/balance', async () => {
    try {
      const { data } = await client.get(`/api/users/${HOLDER_ADDRESS}/balance`);
      console.log(data);
    } catch (e) {
      console.warn('Balance not available yet.');
    }
  }, true);

  console.log('--- Done ---');
}

async function step(name, fn, optional = false) {
  console.log(`\n=== ${name} ===`);
  try {
    await fn();
  } catch (err) {
    console.error(`[Error] ${name}:`, err.response?.data || err.message);
    if (!optional) throw err;
  }
}

function assertAddr(addr, label) {
  if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    throw new Error(`Missing or invalid ${label}. Set it via env.`);
  }
}

main().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
