/**
 * ============================================================================
 *  evmX - Full Test Suite Runner
 * ============================================================================
 *
 *  Runs ALL 174 tests in sequence:
 *    1. Foundry tests (121)  attacks, fuzz, invariant, formal, edge, economic
 *    2. Hardhat local tests (28)  unit + integration
 *    3. Hardhat fork tests (25)  Base Mainnet fork
 *
 *  Usage:
 *    npm run test:full                 # All 174 tests
 *    npm run test:full -- --suite attacks    # Only attack tests
 *    npm run test:full -- --suite fuzz       # Only fuzz tests
 *
 *  Works on Windows (PowerShell), macOS, and Linux.
 * ============================================================================
 */

const { execSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const IS_WIN = os.platform() === "win32";

//  Parse args 
const args = process.argv.slice(2);
const suiteIdx = args.indexOf("--suite");
const SUITE_FILTER = suiteIdx !== -1 ? args[suiteIdx + 1] : null;

const SUITE_MAP = {
  attacks:    { match: "evmXAttacks", label: "Attack Vectors (12)" },
  fuzz:       { match: "evmXFuzz", label: "Fuzz Tests (14)" },
  invariant:  { match: "evmXInvariant", label: "Invariant Tests (13)" },
  economic:   { match: "evmXEconomic", label: "Economic Stress (15)" },
  properties: { match: "evmXFormalInvariant|evmXPropertyTests|evmXEdgeCase", label: "Formal Properties (67)" },
};

//  Find forge binary 
function findForge() {
  // 1. Try PATH first
  try {
    const result = spawnSync(IS_WIN ? "where" : "which", ["forge"], {
      encoding: "utf-8",
      stdio: "pipe",
    });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim().split(/\r?\n/)[0].trim();
    }
  } catch {}

  // 2. Try common install locations
  const home = os.homedir();
  const candidates = [
    path.join(home, ".foundry", "bin", IS_WIN ? "forge.exe" : "forge"),
    path.join(home, ".cargo", "bin", IS_WIN ? "forge.exe" : "forge"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

//  Run a command and stream output 
function run(label, cmd, env = {}) {
  console.log("");
  console.log(`  \x1b[36m-- ${label} ${"-".repeat(Math.max(0, 56 - label.length))}\x1b[0m`);
  console.log(`  \x1b[2m$ ${cmd}\x1b[0m`);
  console.log("");

  try {
    execSync(cmd, {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, ...env },
      shell: true,
    });
    return true;
  } catch (err) {
    console.error(`\n  \x1b[31m FAILED: ${label}\x1b[0m\n`);
    return false;
  }
}

//  Main 
function main() {
  console.log("");
  console.log("  \x1b[1m\x1b[36m==============================================================\x1b[0m");
  console.log("  \x1b[1m\x1b[36m  evmX Test Runner                                          \x1b[0m");
  console.log("  \x1b[1m\x1b[36m==============================================================\x1b[0m");

  const startTime = Date.now();
  const results = [];

  // Find forge
  const forgePath = findForge();
  const forgeCmd = forgePath
    ? (forgePath.includes(" ") ? `"${forgePath}"` : forgePath)
    : null;

  if (!forgeCmd) {
    console.error("\n  \x1b[31mERROR: forge not found!\x1b[0m");
    console.error("  Run \x1b[1mnpm run setup\x1b[0m to install everything automatically.");
    console.error("  Or install manually: curl -L https://foundry.paradigm.xyz | bash && foundryup\n");
    process.exit(1);
  }

  //  Single suite mode 
  if (SUITE_FILTER) {
    const suite = SUITE_MAP[SUITE_FILTER];
    if (!suite) {
      console.error(`\n  Unknown suite: ${SUITE_FILTER}`);
      console.error(`  Available: ${Object.keys(SUITE_MAP).join(", ")}\n`);
      process.exit(1);
    }
    const ok = run(suite.label, `${forgeCmd} test --match-contract "${suite.match}" -vvv`);
    process.exit(ok ? 0 : 1);
  }

  //  Full suite 

  // Step 1: Foundry (121 tests)
  const ok1 = run("Foundry Tests (121)", `${forgeCmd} test --summary`);
  results.push({ name: "Foundry (121)", passed: ok1 });

  // Step 2: Hardhat local (28 tests)
  const ok2 = run("Hardhat Local Tests (28)", "npx hardhat test test/LaunchStress.test.js");
  results.push({ name: "Hardhat Local (28)", passed: ok2 });

  // Step 3: Hardhat fork (25 tests)
  const ok3 = run(
    "Hardhat Fork Tests (25) - Base Mainnet",
    "npx hardhat test test/evmX_BaseFork.test.js",
    { FORKING: "true" }
  );
  results.push({ name: "Hardhat Fork (25)", passed: ok3 });

  //  Summary 
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const allPassed = results.every((r) => r.passed);

  console.log("");
  console.log("  \x1b[1m==============================================================\x1b[0m");
  console.log("  \x1b[1m  RESULTS                                                    \x1b[0m");
  console.log("  \x1b[1m==============================================================\x1b[0m");
  for (const r of results) {
    const icon = r.passed ? "\x1b[32mOK\x1b[0m " : "\x1b[31mERR\x1b[0m";
    console.log(`  ${icon} ${r.name.padEnd(55)}`);
  }
  console.log("  \x1b[1m==============================================================\x1b[0m");
  if (allPassed) {
    console.log("  \x1b[32m\x1b[1mALL 174 TESTS PASSED\x1b[0m");
  } else {
    console.log("  \x1b[31m\x1b[1mSOME TESTS FAILED - see output above\x1b[0m");
  }
  console.log(`  \x1b[2mTime: ${elapsed}s\x1b[0m`);
  console.log("  \x1b[1m==============================================================\x1b[0m");
  console.log("");

  process.exit(allPassed ? 0 : 1);
}

main();

