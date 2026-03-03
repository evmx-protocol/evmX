/**
 * ============================================================================
 *  evmX - GitHub Repository Upload
 * ============================================================================
 *
 *  One-command GitHub upload:
 *
 *    npm run github:init
 *
 *  What it does:
 *    1. Checks prerequisites (git, gh CLI, authentication)
 *    2. Verifies .gitignore safety (no secrets leak)
 *    3. Initializes git repo
 *    4. Stages & commits all project files
 *    5. Creates GitHub repository
 *    6. Pushes to GitHub
 *
 *  Prerequisites:
 *    - GitHub CLI (gh) installed: https://cli.github.com
 *    - Authenticated: gh auth login
 *
 *  Usage:
 *    npm run github:init                            # Interactive
 *    GITHUB_REPO=username/evmX npm run github:init  # Non-interactive
 *    GITHUB_PRIVATE=true npm run github:init         # Private repo
 *
 * ============================================================================
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: opts.silent ? "pipe" : "inherit",
      ...opts,
    })?.trim() || "";
  } catch (err) {
    if (opts.ignoreError) return "";
    throw err;
  }
}

function silent(cmd) {
  return run(cmd, { silent: true, stdio: "pipe", ignoreError: true });
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

// â”€â”€ Safety â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function verifySafety() {
  const gitignorePath = path.join(ROOT, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    console.error("  ERROR: .gitignore not found! Cannot upload without it.");
    process.exit(1);
  }

  const content = fs.readFileSync(gitignorePath, "utf-8");
  const required = [".env", "node_modules/"];
  const missing = required.filter((r) => !content.includes(r));

  if (missing.length > 0) {
    console.error(`  ERROR: .gitignore missing: ${missing.join(", ")}`);
    process.exit(1);
  }
}

// â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function main() {
  console.log("");
  console.log("  \x1b[1m\x1b[36mâ•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\x1b[0m");
  console.log("  \x1b[1m\x1b[36mâ•‘  evmX â€” GitHub Upload                                      â•‘\x1b[0m");
  console.log("  \x1b[1m\x1b[36mâ•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ť\x1b[0m");
  console.log("");

  // â”€â”€ 1. Prerequisites â”€â”€
  console.log("  \x1b[1m[1/6]\x1b[0m Checking prerequisites...");

  try { execSync("git --version", { stdio: "pipe" }); }
  catch { console.error("  ERROR: git not installed â†’ https://git-scm.com"); process.exit(1); }
  console.log("    \x1b[32mâś”\x1b[0m git");

  try { execSync("gh --version", { stdio: "pipe" }); }
  catch { console.error("  ERROR: gh not installed â†’ https://cli.github.com"); process.exit(1); }
  console.log("    \x1b[32mâś”\x1b[0m gh");

  const authCheck = silent("gh auth status 2>&1");
  if (authCheck.includes("not logged") || !authCheck) {
    console.error("  ERROR: Not authenticated. Run: gh auth login");
    process.exit(1);
  }
  console.log("    \x1b[32mâś”\x1b[0m authenticated");

  // â”€â”€ 2. Safety â”€â”€
  console.log("\n  \x1b[1m[2/6]\x1b[0m Safety checks...");
  verifySafety();
  console.log("    \x1b[32mâś”\x1b[0m .gitignore verified (.env + node_modules protected)");

  // â”€â”€ 3. Git init â”€â”€
  console.log("\n  \x1b[1m[3/6]\x1b[0m Initializing git...");
  if (fs.existsSync(path.join(ROOT, ".git"))) {
    console.log("    Already initialized");
  } else {
    run("git init");
    run("git branch -M main");
  }

  // â”€â”€ 4. Stage & commit â”€â”€
  console.log("\n  \x1b[1m[4/6]\x1b[0m Staging files...");
  run("git add -A");

  // Safety: remove .env if accidentally staged
  const stagedFiles = silent("git diff --cached --name-only");
  if (stagedFiles.includes(".env")) {
    console.log("    \x1b[33mâš \x1b[0m Removing .env from staging (secrets protection)");
    run("git reset HEAD .env", { ignoreError: true });
  }

  const diff = silent("git diff --cached --stat");
  if (diff) {
    run('git commit -m "evmX: Autonomous Community Reward Protocol on Base L2\n\n- Chainlink CRE + VRF v2.5 + Data Feed (ETH/USD) — 3 services\n- 3-tier reward pools (Micro/Mid/Mega) with Smart Ladder\n- AI Protocol Intelligence: predictive analytics powered by Chainlink Data Feed\n- Solidity 0.8.28 | Foundry + Hardhat dual framework\n- 174 tests: attacks, fuzz, invariant, formal properties, economic, fork\n- CRE workflows: autonomous-rewards + event-monitor\n- Ownership renounced + LP burned — fully autonomous\n- Convergence Hackathon 2026 | DeFi & Tokenization"');
    console.log("    \x1b[32mâś”\x1b[0m Committed");
  } else {
    console.log("    No changes to commit");
  }

  // â”€â”€ 5. Create repo â”€â”€
  console.log("\n  \x1b[1m[5/6]\x1b[0m Creating GitHub repository...");

  let repoName = process.env.GITHUB_REPO || "";

  if (!repoName) {
    const ghUser = silent("gh api user --jq .login");
    const defaultName = ghUser ? `${ghUser}/evmX` : "evmX";
    repoName = await ask(`    Repo name [${defaultName}]: `);
    if (!repoName) repoName = defaultName;
    if (!repoName.includes("/") && ghUser) repoName = `${ghUser}/${repoName}`;
  }

  const visibility = process.env.GITHUB_PRIVATE === "true" ? "--private" : "--public";
  const existingRemote = silent("git remote get-url origin");

  if (existingRemote) {
    console.log(`    Remote exists: ${existingRemote}`);
  } else {
    try {
      run(`gh repo create ${repoName} ${visibility} --source=. --remote=origin --description "evmX - ERC-20 with autonomous probabilistic reward distribution on Base L2"`);
    } catch {
      console.log("    Repo may exist. Adding remote...");
      run(`git remote add origin https://github.com/${repoName}.git`, { ignoreError: true });
    }
  }

  // â”€â”€ 6. Push â”€â”€
  console.log("\n  \x1b[1m[6/6]\x1b[0m Pushing to GitHub...");
  try {
    run("git push -u origin main");
  } catch {
    run("git push -u origin main --force");
  }

  // â”€â”€ Done â”€â”€
  console.log("");
  console.log("  \x1b[32m\x1b[1mâ•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\x1b[0m");
  console.log("  \x1b[32m\x1b[1mâ•‘  SUCCESS â€” Uploaded to GitHub                               â•‘\x1b[0m");
  console.log("  \x1b[32m\x1b[1mâ•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ť\x1b[0m");
  console.log("");
  console.log(`  \x1b[1mURL:\x1b[0m  https://github.com/${repoName}`);
  console.log("");
  console.log(“  \x1b[1mUploaded:\x1b[0m”);
  console.log(“    \x1b[32m+\x1b[0m Smart contracts (evmX.sol + evmX_Testable.sol)”);
  console.log(“    \x1b[32m+\x1b[0m CRE workflows (autonomous-rewards + event-monitor)”);
  console.log(“    \x1b[32m+\x1b[0m 174 tests (Foundry + Hardhat + Fork)”);
  console.log(“    \x1b[32m+\x1b[0m Frontend dashboard (index.html)”);
  console.log(“    \x1b[32m+\x1b[0m Deploy scripts + CI pipeline”);
  console.log(“    \x1b[32m+\x1b[0m README + TESTING + HACKATHON docs”);
  console.log("");
  console.log("  \x1b[1mProtected:\x1b[0m");
  console.log("    \x1b[31mâś\x1b[0m .env (secrets â€” not uploaded)");
  console.log("    \x1b[31mâś\x1b[0m node_modules/");
  console.log("");
  console.log("  \x1b[1mAnyone can now:\x1b[0m");
  console.log(`    git clone https://github.com/${repoName}.git`);
  console.log("    cd evmX");
  console.log("    npm run setup");
  console.log("  â†’ All 174 tests run automatically.");
  console.log("");
}

main().catch((err) => {
  console.error(`\n  FATAL: ${err.message}`);
  process.exit(1);
});


