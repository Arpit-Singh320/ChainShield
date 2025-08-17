require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Helper: load Fuji accounts from env
function getFujiAccounts() {
  if (process.env.FUJI_PRIVATE_KEYS) {
    return process.env.FUJI_PRIVATE_KEYS
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.env.FUJI_PRIVATE_KEY) {
    return [process.env.FUJI_PRIVATE_KEY];
  }
  return [];
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    fuji: {
      url: process.env.AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
      accounts: getFujiAccounts(),
      chainId: 43113, // Avalanche Fuji Testnet Chain ID
      timeout: 60000, // 60 seconds
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  etherscan: {
    apiKey: {
      avalancheFujiTestnet: process.env.AVALANCHE_API_KEY || ""
    },
    customChains: [
      {
        network: "avalancheFujiTestnet",
        chainId: 43113,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan",
          browserURL: "https://testnet.snowtrace.io"
        }
      }
    ]
  }
};
