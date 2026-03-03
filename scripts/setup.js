/**
 * ============================================================================
 *  evmX â€” One-Command Setup & Test Runner
 * ============================================================================
 *
 *  Clone the repo â†’ run ONE command â†’ everything works.
 *
 *    npm run setup
 *
 *  What this script does:
 *    1. Checks Node.js version (18+)
 *    2. Installs npm dependencies (if needed)
 *    3. Detects or installs Foundry (forge)
 *    4. Installs forge-std library (if needed)
 *    5. Creates .env from .env.example (if missing)
 *    6. Compiles all contracts (Foundry + Hardhat)
 *    7. Runs ALL 174 tests:
 *       - 121 Foundry  (attacks, fuzz, invariant, formal, edge, economic)
 *       -  28 Hardhat   (local unit + integration)
 *       -  25 Hardhat   (Base Mainnet fork)
 *
 *  Works on: Windows (PowerShell/CMD), macOS, Linux
 *
 * ============================================================================
 */

const { execSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const IS_WIN = os.platform() === "win32";

// â”€â”€ Pretty Print â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function header(text) {
  console.log("");
  console.log(`${C.cyan}${C.bold}  â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—${C.reset}`);
  console.log(`${C.cyan}${C.bold}  â•‘  ${text.padEnd(58)} â•‘${C.reset}`);
  console.log(`${C.cyan}${C.bold}  â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ť${C.reset}`);
}

function step(num, total, text) {
  console.log("");
  console.log(`${C.bold}  [${num}/${total}] ${text}${C.reset}`);
}

function ok(text) { console.log(`  ${C.green}âś”${C.reset} ${text}`); }
function warn(text) { console.log(`  ${C.yellow}âš ${C.reset} ${text}`); }
function fail(text) { console.log(`  ${C.red}âś${C.reset} ${text}`); }
function info(text) { console.log(`  ${C.dim}${text}${C.reset}`); }

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function exec(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: opts.silent ? "pipe" : "inherit",
      shell: true,
      env: { ...process.env, ...opts.env },
      timeout: opts.timeout || 600_000,
    });
  } catch (err) {
    if (opts.ignoreError) return "";
    throw err;
  }
}

function execSilent(cmd) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: "pipe",
      shell: true,
      timeout: 30_000,
    }).trim();
  } catch {
    return "";
  }
}

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// â”€â”€ Step 1: Check Node.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function checkNode() {
  const ver = process.version;
  const major = parseInt(ver.slice(1), 10);
  if (major < 18) {
    fail(`Node.js ${ver} detected â€” minimum is v18.0.0`);
    console.log("    Download: https://nodejs.org");
    process.exit(1);
  }
  ok(`Node.js ${ver}`);
}

// â”€â”€ Step 2: Install npm dependencies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function installNpm() {
  if (fileExists("node_modules/.package-lock.json") || fileExists("node_modules/@nomicfoundation")) {
    ok("node_modules/ already exists");
    // Quick check if packages are up to date
    info("Running npm install to check for updates...");
  }
  exec("npm install --no-fund");
  ok("npm dependencies installed");
}

// â”€â”€ Step 3: Find or install Foundry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function findForge() {
  // 1. Check PATH
  const which = IS_WIN ? "where" : "which";
  try {
    const result = spawnSync(which, ["forge"], { encoding: "utf-8", stdio: "pipe" });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim().split(/\r?\n/)[0].trim();
    }
  } catch {}

  // 2. Common install locations
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

function setupFoundry() {
  let forgePath = findForge();

  if (forgePath) {
    const ver = execSilent(`"${forgePath}" --version`);
    ok(`Foundry found: ${forgePath}`);
    if (ver) info(ver.split("\n")[0]);
    return forgePath;
  }

  // Not found â€” try to install automatically
  warn("Foundry (forge) not found. Attempting automatic install...");

  if (IS_WIN) {
    // On Windows, try foundryup via PowerShell or direct download
    console.log("");
    console.log(`  ${C.yellow}â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—${C.reset}`);
    console.log(`  ${C.yellow}â•‘  Foundry not found â€” Install it manually:                  â•‘${C.reset}`);
    console.log(`  ${C.yellow}â•‘                                                             â•‘${C.reset}`);
    console.log(`  ${C.yellow}â•‘  Option 1 (Git Bash / WSL):                                â•‘${C.reset}`);
    console.log(`  ${C.yellow}â•‘    curl -L https://foundry.paradigm.xyz | bash              â•‘${C.reset}`);
    console.log(`  ${C.yellow}â•‘    foundryup                                                â•‘${C.reset}`);
    console.log(`  ${C.yellow}â•‘                                                             â•‘${C.reset}`);
    console.log(`  ${C.yellow}â•‘  Option 2 (PowerShell):                                    â•‘${C.reset}`);
    console.log(`  ${C.yellow}â•‘    irm https://foundry.paradigm.xyz | iex                   â•‘${C.reset}`);
    console.log(`  ${C.yellow}â•‘    foundryup                                                â•‘${C.reset}`);
    console.log(`  ${C.yellow}â•‘                                                             â•‘${C.reset}`);
    console.log(`  ${C.yellow}â•‘  Then re-run: npm run setup                                 â•‘${C.reset}`);
    console.log(`  ${C.yellow}â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ť${C.reset}`);

    // Try PowerShell install
    try {
      console.log("");
      info("Trying automatic install via PowerShell...");
      exec('powershell -Command "irm https://foundry.paradigm.xyz | iex"', { timeout: 120_000 });

      // Try foundryup
      const foundryupPath = path.join(os.homedir(), ".foundry", "bin", "foundryup.exe");
      if (fs.existsSync(foundryupPath)) {
        exec(`"${foundryupPath}"`, { timeout: 120_000 });
      }

      forgePath = findForge();
      if (forgePath) {
        ok(`Foundry installed at: ${forgePath}`);
        return forgePath;
      }
    } catch {
      // Silent fail, instructions already shown
    }

    fail("Automatic Foundry install failed. Please install manually (see above).");
    console.log("");
    info("After installing Foundry, re-run: npm run setup");
    info("The 53 Hardhat tests will still work without Foundry.");
    console.log("");
    return null;
  }

  // Linux/macOS â€” try foundryup
  try {
    info("Running: curl -L https://foundry.paradigm.xyz | bash");
    exec("curl -L https://foundry.paradigm.xyz | bash", { timeout: 60_000 });

    // Run foundryup
    const foundryupPath = path.join(os.homedir(), ".foundry", "bin", "foundryup");
    if (fs.existsSync(foundryupPath)) {
      info("Running: foundryup");
      exec(`"${foundryupPath}"`, { timeout: 120_000 });
    }

    forgePath = findForge();
    if (forgePath) {
      ok(`Foundry installed at: ${forgePath}`);
      return forgePath;
    }
  } catch {}

  fail("Foundry auto-install failed.");
  info("Install manually: curl -L https://foundry.paradigm.xyz | bash && foundryup");
  info("Then re-run: npm run setup");
  return null;
}

// â”€â”€ Step 4: Install forge-std â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function installForgeStd(forgePath) {
  if (!forgePath) return;

  // Check if forge-std exists
  const forgeStdPath = path.join(ROOT, "lib", "forge-std", "src", "Test.sol");
  if (fs.existsSync(forgeStdPath)) {
    ok("forge-std already installed");
    return;
  }

  info("Installing forge-std...");
  const forgeCmd = forgePath.includes(" ") ? `"${forgePath}"` : forgePath;
  try {
    exec(`${forgeCmd} install foundry-rs/forge-std --no-git`);
    ok("forge-std installed");
  } catch {
    // Try alternative: if lib dir doesn't exist, create it
    const libDir = path.join(ROOT, "lib");
    if (!fs.existsSync(libDir)) fs.mkdirSync(libDir);
    try {
      exec(`${forgeCmd} install foundry-rs/forge-std --no-git --no-commit`);
      ok("forge-std installed");
    } catch (err2) {
      warn("forge-std install failed. Foundry tests may not compile.");
      info("Manual fix: forge install foundry-rs/forge-std --no-git");
    }
  }
}

// â”€â”€ Step 5: Create .env â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function setupEnv() {
  const envPath = path.join(ROOT, ".env");

  if (fs.existsSync(envPath)) {
    ok(".env already exists");
    // Check if BASE_RPC_URL is set
    const content = fs.readFileSync(envPath, "utf-8");
    if (content.includes("BASE_RPC_URL=") && !content.match(/BASE_RPC_URL=\s*$/m)) {
      ok("BASE_RPC_URL is configured");
    } else {
      warn("BASE_RPC_URL not set â€” fork tests will use public RPC (rate-limited)");
      info("For reliable fork tests: edit .env and add an Alchemy/Infura RPC URL");
    }
    return;
  }

  // Create .env with working defaults
  const envContent = `# ============================================================================
#  evmX - Environment Configuration (auto-generated by setup)
# ============================================================================
#  For faster/reliable fork tests, replace BASE_RPC_URL with Alchemy/Infura:
#    https://www.alchemy.com (free tier) or https://infura.io (free tier)
# ============================================================================

# â”€â”€ Fork Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
BASE_RPC_URL=https://mainnet.base.org
ROUTER_ADDRESS=0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24
WETH_ADDRESS=0x4200000000000000000000000000000000000006
VRF_KEY_HASH=0xdc2f87677b01473c763cb0aee938ed3341512f6057324a584e5944e786144d70
FORK_BLOCK_NUMBER=25000000
`;

  fs.writeFileSync(envPath, envContent, "utf-8");
  ok(".env created with Base Mainnet defaults");
  info("Fork tests will use public RPC (works but rate-limited)");
  info("For faster tests: edit .env â†’ add Alchemy/Infura RPC URL");
}

// â”€â”€ Step 6: Compile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function compile(forgePath) {
  const forgeCmd = forgePath ? (forgePath.includes(" ") ? `"${forgePath}"` : forgePath) : null;

  if (forgeCmd) {
    info("Compiling with Foundry...");
    exec(`${forgeCmd} build`);
    ok("Foundry compilation successful");
  }

  info("Compiling with Hardhat...");
  exec("npx hardhat compile");
  ok("Hardhat compilation successful");
}

// â”€â”€ Step 7: Run all tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function runTests(forgePath) {
  const forgeCmd = forgePath ? (forgePath.includes(" ") ? `"${forgePath}"` : forgePath) : null;
  const results = [];
  const startTime = Date.now();

  // â”€â”€ 7a: Foundry tests â”€â”€
  if (forgeCmd) {
    console.log("");
    console.log(`  ${C.cyan}â”€â”€ Foundry Tests (121) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€${C.reset}`);
    try {
      exec(`${forgeCmd} test --summary`);
      results.push({ name: "Foundry", count: 121, passed: true });
    } catch {
      results.push({ name: "Foundry", count: 121, passed: false });
    }
  } else {
    warn("Skipping Foundry tests (forge not installed)");
    results.push({ name: "Foundry", count: 121, passed: null });
  }

  // â”€â”€ 7b: Hardhat local tests â”€â”€
  console.log("");
  console.log(`  ${C.cyan}â”€â”€ Hardhat Local Tests (28) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€${C.reset}`);
  try {
    exec("npx hardhat test test/LaunchStress.test.js");
    results.push({ name: "Hardhat Local", count: 28, passed: true });
  } catch {
    results.push({ name: "Hardhat Local", count: 28, passed: false });
  }

  // â”€â”€ 7c: Hardhat fork tests â”€â”€
  console.log("");
  console.log(`  ${C.cyan}â”€â”€ Hardhat Fork Tests (25) â€” Base Mainnet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€${C.reset}`);
  try {
    exec("npx hardhat test test/evmX_BaseFork.test.js", { env: { FORKING: "true" } });
    results.push({ name: "Hardhat Fork", count: 25, passed: true });
  } catch {
    results.push({ name: "Hardhat Fork", count: 25, passed: false });
  }

  return { results, elapsed: ((Date.now() - startTime) / 1000).toFixed(1) };
}

// â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function printSummary(results, elapsed) {
  const totalTests = results.reduce((sum, r) => sum + (r.passed !== null ? r.count : 0), 0);
  const passedTests = results.reduce((sum, r) => sum + (r.passed === true ? r.count : 0), 0);
  const allPassed = results.every((r) => r.passed !== false);
  const skipped = results.filter((r) => r.passed === null);

  console.log("");
  console.log(`  ${C.bold}â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—${C.reset}`);
  console.log(`  ${C.bold}â•‘  TEST RESULTS                                               â•‘${C.reset}`);
  console.log(`  ${C.bold}â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•Ł${C.reset}`);

  for (const r of results) {
    let icon, color;
    if (r.passed === true) { icon = "âś”"; color = C.green; }
    else if (r.passed === false) { icon = "âś"; color = C.red; }
    else { icon = "â€“"; color = C.yellow; }

    const label = `${r.name} (${r.count})`;
    const status = r.passed === null ? "SKIPPED" : r.passed ? "PASS" : "FAIL";
    console.log(`  â•‘  ${color}${icon}${C.reset}  ${label.padEnd(40)} ${color}${status.padEnd(12)}${C.reset} â•‘`);
  }

  console.log(`  ${C.bold}â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•Ł${C.reset}`);

  if (allPassed && skipped.length === 0) {
    console.log(`  â•‘  ${C.green}${C.bold}âś”  ALL ${totalTests} TESTS PASSED${C.reset}${" ".repeat(39 - String(totalTests).length)}â•‘`);
  } else if (allPassed && skipped.length > 0) {
    console.log(`  â•‘  ${C.green}${C.bold}âś”  ${passedTests}/${totalTests} TESTS PASSED${C.reset}  ${C.yellow}(${skipped.length} suite skipped)${C.reset}${" ".repeat(18 - String(passedTests).length - String(totalTests).length)}â•‘`);
  } else {
    const failedCount = results.filter((r) => r.passed === false).reduce((s, r) => s + r.count, 0);
    console.log(`  â•‘  ${C.red}${C.bold}âś  ${failedCount} TESTS FAILED${C.reset}${" ".repeat(43 - String(failedCount).length)}â•‘`);
  }

  console.log(`  â•‘  ${C.dim}Time: ${elapsed}s${C.reset}${" ".repeat(53 - elapsed.length)}â•‘`);
  console.log(`  ${C.bold}â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ť${C.reset}`);
  console.log("");

  return allPassed;
}

// â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function main() {
  const totalSteps = 7;

  header("evmX â€” Automated Setup & Test Runner");

  // â”€â”€ 1. Node.js â”€â”€
  step(1, totalSteps, "Checking Node.js...");
  checkNode();

  // â”€â”€ 2. npm install â”€â”€
  step(2, totalSteps, "Installing npm dependencies...");
  installNpm();

  // â”€â”€ 3. Foundry â”€â”€
  step(3, totalSteps, "Setting up Foundry (forge)...");
  const forgePath = setupFoundry();

  // â”€â”€ 4. forge-std â”€â”€
  step(4, totalSteps, "Installing forge-std library...");
  installForgeStd(forgePath);

  // â”€â”€ 5. .env â”€â”€
  step(5, totalSteps, "Configuring environment...");
  setupEnv();

  // â”€â”€ 6. Compile â”€â”€
  step(6, totalSteps, "Compiling contracts...");
  compile(forgePath);

  // â”€â”€ 7. Tests â”€â”€
  step(7, totalSteps, "Running ALL tests...");
  const { results, elapsed } = runTests(forgePath);

  // â”€â”€ Summary â”€â”€
  const allPassed = printSummary(results, elapsed);

  if (allPassed) {
    console.log(`  ${C.green}${C.bold}Setup complete! Everything is working.${C.reset}`);
    console.log("");
    console.log(`  ${C.dim}Useful commands:${C.reset}`);
    console.log(`    npm run setup          ${C.dim}â€” Full setup + run all tests${C.reset}`);
    console.log(`    npm run test:full      ${C.dim}â€” Run all 174 tests (no setup)${C.reset}`);
    console.log(`    npm run test           ${C.dim}â€” Hardhat local tests only${C.reset}`);
    console.log(`    npm run test:fork      ${C.dim}â€” Base Mainnet fork tests only${C.reset}`);
    console.log(`    npm run test:attacks   ${C.dim}â€” Attack vector simulations${C.reset}`);
    console.log(`    npm run test:fuzz      ${C.dim}â€” Fuzz tests (1000 runs each)${C.reset}`);
    console.log(`    npm run github:init    ${C.dim}â€” Upload to GitHub${C.reset}`);
    console.log("");
  }

  process.exit(allPassed ? 0 : 1);
}

main();

