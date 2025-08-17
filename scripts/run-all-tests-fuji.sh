#!/usr/bin/env bash
set -euo pipefail

# Run all Avalanche Insurance tests sequentially on Fuji.
# Usage:
#   scripts/run-all-tests-fuji.sh [--include-vrf]
#
# Options:
#   --include-vrf   Attempt to run VRF test as final step. Requires a funded
#                   VRF subscription and ClaimsProcessor added as consumer.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f scripts/.env ]; then
  echo "[ERROR] scripts/.env not found. Configure contract addresses and Fuji keys first." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; source scripts/.env; set +a

INCLUDE_VRF=false
if [ "${1:-}" = "--include-vrf" ]; then
  INCLUDE_VRF=true
fi

run() {
  local label="$1"; shift
  echo "\n=== [$label] START ===" | sed 's/\\n/\n/g'
  local start_ts end_ts elapsed
  start_ts=$(date +%s)
  "$@"
  end_ts=$(date +%s)
  elapsed=$(( end_ts - start_ts ))
  echo "=== [$label] DONE in ${elapsed}s ===\n"
}

require_env() {
  local name="$1"; local val
  val="${!name:-}"
  if [ -z "$val" ]; then
    echo "[ERROR] Missing required env var: $name" >&2
    exit 1
  fi
}

# Basic required env for scripts
require_env POLICY_REGISTRY_ADDRESS
require_env CLAIMS_PROCESSOR_ADDRESS
require_env PAYOUT_MANAGER_ADDRESS

# Show network info and signers (best-effort)
if command -v npx >/dev/null 2>&1; then
  echo "Using Node: $(node -v) / npm: $(npm -v)"
  echo "Hardhat: $(npx hardhat --version || true)"
fi

# Run tests sequentially
run "Interactions" npx hardhat run --network fuji scripts/test-interactions.js
run "Edge Cases" npx hardhat run --network fuji scripts/test-edge-cases.js
run "End-to-End (AI)" npx hardhat run --network fuji scripts/test-e2e.js

# VRF test (optional)
if [ "$INCLUDE_VRF" = true ]; then
  # Validate minimum VRF config
  if [ -z "${VRF_COORDINATOR:-}" ] || [ -z "${VRF_KEY_HASH:-}" ] || [ -z "${VRF_SUBSCRIPTION_ID:-}" ]; then
    echo "[WARN] VRF env not fully set. Skipping test-vrf.js." >&2
    exit 0
  fi
  if [ "${VRF_SUBSCRIPTION_ID}" = "123" ]; then
    echo "[WARN] VRF_SUBSCRIPTION_ID appears to be a placeholder (123). Skipping test-vrf.js." >&2
    exit 0
  fi
  echo "[INFO] Running VRF test last. Ensure subscription is funded and ClaimsProcessor is a consumer."
  run "VRF" npx hardhat run --network fuji scripts/test-vrf.js
else
  echo "[INFO] Skipping VRF test. Use --include-vrf to enable."
fi

echo "\nAll requested tests completed." | sed 's/\\n/\n/g'
