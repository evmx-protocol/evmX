/**
 * ============================================================================
 *  evmX - Environment Variable Helper
 * ============================================================================
 *
 *  Provides strict, fail-fast environment validation for fork tests.
 *  Prevents silent null/undefined usage that causes cryptic test failures.
 *
 *  Usage:
 *    const { requireEnv, optionalEnv, requireAddress, validateForkConfig } = require("./helpers/requireEnv");
 *    const rpcUrl = requireEnv("BASE_RPC_URL");
 *    const vrfAddr = optionalEnv("VRF_COORDINATOR", null);
 * ============================================================================
 */

const { ethers } = require("hardhat");

/**
 * Require an environment variable to be set and non-empty.
 * Throws a descriptive error immediately if missing.
 *
 * @param {string} name - Environment variable name
 * @param {string} [hint] - Optional human-readable hint for the error message
 * @returns {string} The environment variable value
 * @throws {Error} With clear message explaining what's missing and how to fix it
 */
function requireEnv(name, hint) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    const lines = [
      "",
      `  `,
      `    MISSING REQUIRED ENVIRONMENT VARIABLE                     `,
      `  `,
      ``,
      `  Variable:  ${name}`,
      hint ? `  Purpose:   ${hint}` : "",
      ``,
      `  To fix:`,
      `    1. Copy .env.example to .env:  cp .env.example .env`,
      `    2. Set ${name} in your .env file`,
      `    3. Re-run: npm run test:fork`,
      ``,
    ].filter(Boolean).join("\n");
    throw new Error(lines);
  }
  return value.trim();
}

/**
 * Get an optional environment variable with a default value.
 *
 * @param {string} name - Environment variable name
 * @param {*} defaultValue - Value to return if variable is missing
 * @returns {string|*} The environment variable value or default
 */
function optionalEnv(name, defaultValue) {
  const value = process.env[name];
  if (!value || value.trim() === "") return defaultValue;
  return value.trim();
}

/**
 * Require an environment variable and validate it's a proper Ethereum address.
 *
 * @param {string} name - Environment variable name
 * @param {string} [hint] - Optional human-readable hint
 * @returns {string} Checksummed Ethereum address
 * @throws {Error} If missing or not a valid address
 */
function requireAddress(name, hint) {
  const raw = requireEnv(name, hint);
  if (!ethers.isAddress(raw)) {
    throw new Error(
      `\n  ${name} = "${raw}" is NOT a valid Ethereum address.\n` +
      `  Expected format: 0x followed by 40 hex characters.\n` +
      `  Example: 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24\n`
    );
  }
  return ethers.getAddress(raw); // checksummed
}

/**
 * Get an optional address or return null.
 *
 * @param {string} name - Environment variable name
 * @returns {string|null} Checksummed address or null
 */
function optionalAddress(name) {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return null;
  const trimmed = raw.trim();
  if (!ethers.isAddress(trimmed)) {
    console.warn(`  WARNING: ${name} = "${trimmed}" is not a valid address. Ignoring.`);
    return null;
  }
  return ethers.getAddress(trimmed);
}

/**
 * Validate and return the complete fork test configuration.
 * Provides a single call to validate ALL required variables with clear diagnostics.
 *
 * @returns {Object} Validated configuration object
 * @throws {Error} With combined message listing ALL missing variables
 */
function validateForkConfig() {
  const errors = [];
  const config = {};

  //  Required 
  try {
    config.rpcUrl = requireEnv("BASE_RPC_URL", "Base Mainnet RPC endpoint for fork testing");
  } catch (e) { errors.push(e.message); }

  try {
    config.routerAddress = requireAddress("ROUTER_ADDRESS", "Uniswap V2 Router on Base Mainnet");
  } catch (e) { errors.push(e.message); }

  try {
    config.wethAddress = requireAddress("WETH_ADDRESS", "Wrapped ETH contract on Base");
  } catch (e) { errors.push(e.message); }

  //  Optional (with fallback) 
  config.vrfCoordinator = optionalAddress("VRF_COORDINATOR");
  config.vrfKeyHash = optionalEnv(
    "VRF_KEY_HASH",
    "0xdc2f87677b01473c763cb0aee938ed3341512f6057324a584e5944e786144d70"
  );
  config.forkBlockNumber = optionalEnv("FORK_BLOCK_NUMBER", null);
  config.useLocalVrfMock = config.vrfCoordinator === null;

  //  Report 
  if (errors.length > 0) {
    const combined = [
      "",
      "  ",
      "    FORK TEST CONFIGURATION ERRORS                            ",
      "  ",
      "",
      `  ${errors.length} required variable(s) missing or invalid.`,
      "",
      ...errors,
      "  ",
      "  Quick fix: cp .env.example .env && edit .env",
      "",
    ].join("\n");
    throw new Error(combined);
  }

  return config;
}

/**
 * Print a diagnostic table of the fork configuration.
 *
 * @param {Object} config - The validated config from validateForkConfig()
 */
function printForkDiagnostics(config) {
  console.log("");
  console.log("  ");
  console.log("    evmX Fork Test Configuration                           ");
  console.log("  ");
  console.log(`    RPC URL:        ${_truncate(config.rpcUrl, 39).padEnd(39)} `);
  console.log(`    Router:         ${config.routerAddress.padEnd(39)} `);
  console.log(`    WETH:           ${config.wethAddress.padEnd(39)} `);

  if (config.useLocalVrfMock) {
    console.log(`    VRF:            LOCAL MOCK (auto-deployed)              `);
  } else {
    console.log(`    VRF Coordinator: ${config.vrfCoordinator.padEnd(38)} `);
  }

  if (config.forkBlockNumber) {
    console.log(`    Fork Block:     ${config.forkBlockNumber.padEnd(39)} `);
  } else {
    console.log(`    Fork Block:     latest                                 `);
  }

  console.log("  ");
  console.log("");
}

/**
 * Assert that an on-chain address is a deployed contract (has code).
 *
 * @param {string} address - Address to check
 * @param {string} label - Human-readable label for error messages
 * @throws {Error} If address has no code deployed
 */
async function assertDeployedContract(address, label) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x" || code === "0x0" || code.length <= 2) {
    throw new Error(
      `\n  ${label} at ${address} has NO deployed code.\n` +
      `  This means the fork is not connected to the correct network,\n` +
      `  or the address is wrong. Check your .env configuration.\n`
    );
  }
}

function _truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

module.exports = {
  requireEnv,
  optionalEnv,
  requireAddress,
  optionalAddress,
  validateForkConfig,
  printForkDiagnostics,
  assertDeployedContract,
};

