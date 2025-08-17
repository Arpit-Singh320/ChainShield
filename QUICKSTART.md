# Avalanche Insurance — Quickstart

This guide helps you run the local demo (backend + frontend) and perform a quick end‑to‑end walkthrough.

## Prerequisites
- Node.js 18+ and npm
- A browser wallet (e.g., MetaMask) configured for Avalanche Fuji (chainId 43113)

## Project layout
- `backend/` — Node/Express API (default port 3331)
- `frontend/` — Vite + React UI
- `scripts/` — helper scripts (API smoke tests, deploy helpers, etc.)

## 1) Backend — install and start
```bash
cd "./backend"

# Install dependencies
npm ci

# Start server (defaults to port 3331)
npm start
```
Optional: configure `backend/.env` (API keys are optional and not required for this demo).

Common env vars (if present in your codebase):
- `PORT` — backend port (defaults to 3331)
- `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` — global rate-limiter
- `RATE_LIMIT_MAX_POLICIES` — higher limit for `GET /api/users/:address/policies` (if implemented)
- `USER_POLICIES_TTL_MS` — in‑memory cache TTL for user policies
- `API_KEYS` — comma‑separated list to require `x-api-key` header (omit to disable)

## 2) Frontend — point to backend and start
```bash
cd "../frontend"

# Install dependencies
npm ci

# Point UI to backend
printf "VITE_BACKEND_URL=http://localhost:3331\n" > .env.local

# Start Vite dev server (usually http://localhost:5173)
npm run dev
```
In your browser, connect your wallet to Avalanche Fuji (chainId 43113).

## 3) Quick API smoke tests (optional)
Open a new terminal at the repo root, then:
```bash
# Health check
curl -s -D - http://localhost:3331/api/health -o /dev/null

# Policies endpoint headers (cache + rate limit)
ADDR="0xa58DCCb0F17279abD1d0D9069Aa8711Df4a4c58E"
curl -s -D - "http://localhost:3331/api/users/${ADDR}/policies" -o /dev/null
```
Look for headers like `X-Cache` and `X-RateLimit-Remaining`.

Full coverage test (if available):
```bash
cd "../"
node scripts/test-apis.js --base http://localhost:3331 --addr 0xa58DCCb0F17279abD1d0D9069Aa8711Df4a4c58E
```

## 4) Demo flow checklist (UI)
- Connect wallet (Fuji 43113)
- Open Dashboard: confirm Policies and Claims load
- File a claim: add description, upload evidence (image/PDF ≤10MB), submit
- Claim detail: run AI analysis, observe status + results
- If Approved/Paid: withdraw payout via wallet button

## Troubleshooting
- Backend not reachable: ensure it’s running on 3331 (or update `VITE_BACKEND_URL`).
- Wrong network: switch wallet to Avalanche Fuji (43113).
- CORS or 401: if `API_KEYS` is set in backend, include `x-api-key` in requests or remove `API_KEYS` for the demo.
- Rate limit: check `X-RateLimit-Remaining` headers; adjust related env vars for demos.

## Useful paths
- Backend: `backend/src/index.js`
- Frontend services: `frontend/src/services/api.ts`
- Smoke tests: `scripts/test-apis.js`

You’re ready to demo the AI‑assisted insurance flow on Avalanche Fuji locally.
