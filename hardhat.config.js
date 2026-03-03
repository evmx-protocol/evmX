require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * ============================================================================
 *  evmX - Hardhat Configuration
 * ============================================================================
 *
 *  Local tests (no .env needed):
 *    npx hardhat test test/LaunchStress.test.js
 *
 *  Fork tests (requires .env with BASE_RPC_URL + addresses):
 *    npm run test:fork
 *    See .env.example for all required variables.
 *
 *  Deploy:
 *    npm run deploy:base
 *
 *  Verify:
 *    npx hardhat verify --network base <ADDRESS> <ARGS...>
 * ============================================================================
 */

// â”€â”€ Environment (all optional at config load time) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BASE_RPC_URL = process.env.BASE_RPC_URL || "";
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const FORKING_ENABLED = process.env.FORKING === "true";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";
const FORK_BLOCK_NUMBER = process.env.FORK_BLOCK_NUMBER
  ? parseInt(process.env.FORK_BLOCK_NUMBER, 10)
  : undefined;

// â”€â”€ Build fork config only when FORKING=true â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildForkConfig() {
  if (!FORKING_ENABLED) return {};

  const rpcUrl = BASE_RPC_URL || "https://mainnet.base.org";
  if (!BASE_RPC_URL) {
    console.warn(
      "\n  WARNING: BASE_RPC_URL not set in .env.\n" +
      "  Using public https://mainnet.base.org (rate-limited, may timeout).\n" +
      "  For reliable tests: set BASE_RPC_URL in .env (Alchemy/Infura recommended)\n"
    );
  }

  const forkConfig = { url: rpcUrl };
  if (FORK_BLOCK_NUMBER) {
    forkConfig.blockNumber = FORK_BLOCK_NUMBER;
  }

  return { forking: forkConfig };
}

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      blockGasLimit: 30_000_000,
      gas: 12_000_000,
      accounts: {
        count: 60, // 60 accounts for bot-army tests
      },
      // â”€â”€ Base chain hardfork history (required for fork mode) â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Without this, Hardhat errors on "no known hardfork" for Base blocks
      chains: {
        8453: {
          hardforkHistory: {
            london: 0,
            merge: 0,
            shanghai: 0,
            cancun: 0,
          },
        },
      },
      // Base L2 runs Cancun EVM (post-Dencun upgrade)
      hardfork: "cancun",
      ...buildForkConfig(),
    },
    // â”€â”€ Base Mainnet (production deploy) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    base: {
      url: BASE_RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: "auto",
    },
    // -- Base Sepolia Testnet (hackathon / CRE testing) ---------------------
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      chainId: 84532,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      gasPrice: "auto",
    },
  },
  // â”€â”€ BaseScan verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  etherscan: {
    apiKey: {
      base: BASESCAN_API_KEY,
      baseSepolia: BASESCAN_API_KEY,
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
};

