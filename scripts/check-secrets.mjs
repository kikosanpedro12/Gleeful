// Fails the build if something that looks like a secret is committed, or if a
// server-only secret is given a NEXT_PUBLIC_ name (which ships it to the browser).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["node_modules", ".next", ".git", "scripts/out", "coverage"]);
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|sql|toml|yml|yaml|env|example|txt|html|sh|ps1|key|p8|pem|cfg|ini)$|^\.env|^\.npmrc$/;
const PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic API key"],
  [/sk-(proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/, "OpenAI-style secret key"],
  [/sbp_[A-Za-z0-9]{30,}/, "Supabase personal access token"],
  [/gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/, "GitHub token"],
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/AIza[0-9A-Za-z_-]{35}/, "Google API key"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/sb_secret_[A-Za-z0-9_-]{16,}/, "Supabase secret key"],
  [/eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "JWT (legacy Supabase anon/service key?)"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/, "database URL with password"],
];
const PUBLIC_SECRET = /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE|PRIVATE|ANTHROPIC|OPENAI|DEEPGRAM|API_KEY|PASSWORD|TOKEN|SB_SECRET)/;

const hits = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full).replaceAll(path.sep, "/");
    if ([...SKIP].some((s) => rel === s || rel.startsWith(s + "/"))) continue;
    if (e.isDirectory()) { walk(full); continue; }
    if (!EXT.test(e.name) || rel === "package-lock.json" || rel === "scripts/check-secrets.mjs") continue;
    const text = fs.readFileSync(full, "utf8");
    for (const [re, what] of PATTERNS) if (re.test(text)) hits.push(`${rel}: looks like a ${what}`);
    if (PUBLIC_SECRET.test(text)) hits.push(`${rel}: a secret-looking variable has a NEXT_PUBLIC_ name (it would ship to the browser)`);
    if (/^\.env(\.|$)/.test(e.name) && e.name !== ".env.example") hits.push(`${rel}: real env file present in the repo tree (must stay git-ignored)`);
  }
}
walk(ROOT);
// .env files are allowed on disk locally if git-ignored; only fail on them in CI.
const fatal = process.env.CI ? hits : hits.filter((h) => !h.includes("real env file"));
if (fatal.length) { console.error("Secret check FAILED:\n  " + fatal.join("\n  ")); process.exit(1); }
console.log("Secret check passed.");
