# Progress Report — Blockchain Insurance System

Timestamp: 2025-08-16 15:10:44 +05:30

## New Additions (since last update)
- __Scripts added__ in `scripts/`:
  - `set-ai-oracle.js`: sets the AI oracle address on `ClaimsProcessor` so the backend signer can call `submitAIAnalysis()`.
  - `add-reviewer.js`: adds a reviewer to `ClaimsProcessor` to support UnderReview flows when VRF/human review is enabled.
- __Environment usage__: confirmed `.env` addresses for Fuji are wired across backend and scripts.

## How to Use (quick commands)
- __Set AI Oracle__ (backend signer or any address):
  ```bash
  set -a; source scripts/.env; set +a
  ORACLE=<address> npx hardhat run --network fuji scripts/set-ai-oracle.js
  ```
- __Add Reviewer__ (optional, for UnderReview + VRF/human flows):
  ```bash
  set -a; source scripts/.env; set +a
  REVIEWER=<address> npx hardhat run --network fuji scripts/add-reviewer.js
  ```

## Troubleshooting Notes
- __Port in use (EADDRINUSE :3001)__: another backend instance is running. Either stop it or start on a new port:
  ```bash
  PORT=3005 node backend/src/index.js
  ```
- __Nonce too low__ during Hardhat scripts: your account has pending/competing txs on Fuji.
  - Wait for mempool to clear or bump nonce by sending a new tx.
  - Alternatively, specify a higher gas price or run fewer concurrent scripts.

## Summary
- Verified and fixed backend API responses to align with on-chain structs and avoid BigInt JSON issues.
- End-to-end flow works on Avalanche Fuji with forced auto-approval for AI analysis.
- Evidence upload remains blocked without IPFS credentials (expected by design).

## Capabilities (What the system can do)
- **Create and manage policies (on-chain)** via `PolicyRegistry`:
  - Create, update, cancel policies; fetch policy details; list user policies.
  - Policy fields: `policyholder`, `premium`, `coverage`, `deductible`, `policyType`, `startDate`, `endDate`, `isActive`.
- **Submit claims (on-chain)** via `ClaimsProcessor` using `POST /api/claims/submit`.
- **AI-assisted claim analysis** using Gemini through backend:
  - Trigger with `POST /api/claims/:id/analyze`.
  - AI outputs mapped on-chain: `claimType`, `severity`, `fraudRisk`, `recommendedPayout`.
  - Testing mode supports `FORCE_AUTO_APPROVE=true` to bypass VRF/human review.
- **Payout workflow**:
  - After AI analysis (auto-approve in tests), claim status advances and `finalPayout` is set.
  - `PayoutManager` integration used during E2E to simulate payout and withdrawal.
- **Evidence handling**:
  - Store evidence as IPFS CIDs on-chain when submitting claims.
  - Resolve public URLs via gateway for viewing.
  - Upload endpoint available (`/api/evidence/upload`) — requires IPFS creds to enable writes.
- **Data retrieval APIs** (normalized, JSON-safe):
  - `GET /api/claims/:id` — full claim with AI fields and payout.
  - `GET /api/policies/:id` — policy details.
  - `GET /api/users/:address/claims` and `/policies` — listings.
  - `GET /api/health` — service readiness.
- **Operational configuration**:
  - Listener disabled by default (`ENABLE_LISTENER=false`) to avoid Fuji filter issues; manual analyze API is supported.
  - Contracts connected via `.env` addresses; runs against Avalanche Fuji RPC.

## What Changed
- Updated `backend/src/index.js`:
  - `GET /api/claims/:claimId`: Map AI fields directly from claim struct (`claimType`, `severity`, `fraudRisk`, `recommendedPayout`) and serialize numeric fields (BigInt -> string/number). Also map `status` safely.
  - `GET /api/policies/:policyId`: Use `policyholder`, `startDate`, `endDate` from `PolicyRegistry.Policy` and serialize timestamps.

## Verified Endpoints (200 OK)
- `GET /api/health`
- `POST /api/claims/submit`
- `POST /api/claims/:id/analyze` (with `FORCE_AUTO_APPROVE=true`)
- `GET /api/claims/:id` (normalized JSON, no BigInt errors)
- `GET /api/policies/:id`
- `GET /api/users/:address/claims`
- `GET /api/users/:address/policies`

## Known Limitations
- `POST /api/evidence/upload` requires `IPFS_PROJECT_ID` and `IPFS_PROJECT_SECRET` to enable writes. Without these, it fails with 500 as designed.
- Listener is disabled to avoid Avalanche Fuji filter issues. Use explicit analyze endpoint during tests.

## How To Reproduce
- Start backend on a free port:
```bash
PORT=3005 ENABLE_LISTENER=false FORCE_AUTO_APPROVE=true npm start
```
- Quick API test (Node fetch):
```bash
node -e '
const BACKEND="http://localhost:3005";
const USER="0xa58DCCb0F17279abD1d0D9069Aa8711Df4a4c58E";
const POLICY_ID=8;
(async()=>{
  const j=async(r)=>({code:r.status, body: await r.text()});
  let r;
  r=await fetch(`${BACKEND}/api/health`); console.log("health", await j(r));
  r=await fetch(`${BACKEND}/api/claims/submit`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({policyId:POLICY_ID,description:"API test",evidenceHashes:["dummy-cid-1"],userAddress:USER})}); const s=await j(r); console.log("submit", s); const id=JSON.parse(s.body).claimId;
  r=await fetch(`${BACKEND}/api/claims/${id}/analyze`,{method:"POST"}); console.log("analyze", await j(r));
  r=await fetch(`${BACKEND}/api/claims/${id}`); console.log("claim", await j(r));
  r=await fetch(`${BACKEND}/api/policies/${POLICY_ID}`); console.log("policy", await j(r));
  r=await fetch(`${BACKEND}/api/users/${USER}/claims`); console.log("userClaims", await j(r));
  r=await fetch(`${BACKEND}/api/users/${USER}/policies`); console.log("userPolicies", await j(r));
})();
'
```

## Next Steps
- Add IPFS credentials in `backend/.env` to enable evidence uploads:
  - `IPFS_PROJECT_ID=...`
  - `IPFS_PROJECT_SECRET=...`
- (Optional) Re-enable listener with a more robust RPC provider if needed for VRF/human review flows.
- Frontend: consume normalized fields from claims and policies endpoints.
