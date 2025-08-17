#!/usr/bin/env node
/*
 Test all backend APIs for Avalanche Insurance
 Usage:
   node scripts/test-apis.js \
     --url http://localhost:3331 \
     --addr 0xYourAddress \
     [--apiKey YOUR_API_KEY] \
     [--policy 1] \
     [--claim 1]

 Or via env:
   BACKEND_URL=http://localhost:3331 API_KEY=... ADDRESS=0x... POLICY_ID=1 CLAIM_ID=1 node scripts/test-apis.js
*/

const axios = require('axios');

function getArg(name, def) {
  const idx = process.argv.findIndex(a => a === `--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env[name.toUpperCase().replace(/-/g, '_')] || def;
}

const BASE_URL = (getArg('url', 'http://localhost:3331')).replace(/\/$/, '');
const API_KEY = getArg('apiKey', '');
const ADDRESS = getArg('addr', '');
const POLICY_ID = getArg('policy', '');
const CLAIM_ID = getArg('claim', '');

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
  },
  validateStatus: () => true,
});

function logTitle(title) {
  console.log(`\n=== ${title} ===`);
}

function printHeaders(h) {
  const keys = ['x-cache', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];
  const shown = keys
    .filter(k => h[k] !== undefined)
    .map(k => `${k}: ${h[k]}`)
    .join(', ');
  if (shown) console.log(`Headers: ${shown}`);
}

async function hit(method, url, data) {
  try {
    const res = await client.request({ method, url, data });
    console.log(`${method.toUpperCase()} ${url} -> ${res.status}`);
    printHeaders(res.headers || {});
    // Show a concise body preview
    const body = res.data;
    const json = typeof body === 'object' ? JSON.stringify(body) : String(body);
    console.log(json.length > 800 ? json.slice(0, 800) + '... [truncated]' : json);
    return res;
  } catch (err) {
    console.error(`${method.toUpperCase()} ${url} -> ERROR`, err.message);
    if (err.response) {
      console.error('Response:', err.response.status, err.response.data);
    }
    return null;
  }
}

(async () => {
  console.log(`Base URL: ${BASE_URL}`);
  if (API_KEY) console.log('Using API key header');
  if (!ADDRESS) console.log('Tip: pass --addr 0xYourAddress to exercise user endpoints');

  // 1) Health
  logTitle('Health');
  await hit('get', '/api/health');

  // 2) Config
  logTitle('Config');
  await hit('get', '/api/config');

  // 3) User endpoints (policies, claims, balance)
  if (ADDRESS) {
    logTitle(`User Policies (address=${ADDRESS})`);
    await hit('get', `/api/users/${ADDRESS}/policies`);
    // Call again to observe cache HIT
    await hit('get', `/api/users/${ADDRESS}/policies`);

    logTitle(`User Claims (address=${ADDRESS})`);
    await hit('get', `/api/users/${ADDRESS}/claims`);

    logTitle(`User Balance (address=${ADDRESS})`);
    await hit('get', `/api/users/${ADDRESS}/balance`);
  }

  // 4) Policy details
  if (POLICY_ID) {
    logTitle(`Policy Details (id=${POLICY_ID})`);
    await hit('get', `/api/policies/${POLICY_ID}`);
  }

  // 5) Claim details
  if (CLAIM_ID) {
    logTitle(`Claim Details (id=${CLAIM_ID})`);
    await hit('get', `/api/claims/${CLAIM_ID}`);

    logTitle(`Payout Details (claimId=${CLAIM_ID})`);
    await hit('get', `/api/payouts/${CLAIM_ID}`);
  }

  // 6) Admin: payout stats (GET)
  logTitle('Admin Payout Stats');
  await hit('get', '/api/admin/payout/stats');

  console.log('\nAll tests attempted.');
})().catch((e) => {
  console.error('Fatal error in test runner:', e);
  process.exit(1);
});
