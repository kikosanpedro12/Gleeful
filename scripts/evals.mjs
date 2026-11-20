// `npm run evals`            offline: canned model outputs through the real sanitizers/validators (no network, no spend).
// `npm run evals -- --live`  real model (MODELS.default), OFF unless asked; needs ANTHROPIC_API_KEY, capped by EVAL_MAX_CALLS (default 20).
import { spawnSync } from "node:child_process";

const live = process.argv.includes("--live");
const env = { ...process.env };
if (live) {
  if (!env.ANTHROPIC_API_KEY) { console.error("refusing to run live: ANTHROPIC_API_KEY is not set"); process.exit(2); }
  const raw = env.EVAL_MAX_CALLS;
  if (raw !== undefined && raw !== "" && (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 200)) { console.error("refusing to run live: EVAL_MAX_CALLS must be a whole number from 1 to 200"); process.exit(2); }
  env.EVAL_MAX_CALLS = raw || "20";
  env.EVAL_LIVE = "1";
  console.log(`LIVE eval: real API calls, at most ${env.EVAL_MAX_CALLS}.`);
} else {
  delete env.EVAL_LIVE; // offline can never spend, whatever the shell has set
}
const file = live ? "tests/evals/live.test.ts" : "tests/evals/offline.test.ts";
const r = spawnSync("npx", ["vitest", "run", file], { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
