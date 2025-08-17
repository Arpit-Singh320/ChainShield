// Print addresses and AVAX balances for accounts configured via FUJI_PRIVATE_KEYS
// Usage:
//   npx hardhat run --network fuji scripts/print-balances.js

const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const provider = hre.ethers.provider;
  const net = await provider.getNetwork();
  console.log("Network:", net.name, "ChainId:", net.chainId.toString());

  // ethers.getSigners() reflects hardhat.config.js -> networks.fuji.accounts
  const signers = await hre.ethers.getSigners();
  if (!signers.length) {
    console.log("No accounts available. Ensure FUJI_PRIVATE_KEYS or FUJI_PRIVATE_KEY is set and Hardhat is reading them.");
    return;
  }

  console.log("\nAccounts and balances:");
  for (let i = 0; i < signers.length; i++) {
    const s = signers[i];
    const bal = await provider.getBalance(s.address);
    console.log(`- [${i}] ${s.address} => ${hre.ethers.formatEther(bal)} AVAX`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
