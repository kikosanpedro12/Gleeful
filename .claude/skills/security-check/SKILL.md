---
name: security-check
description: Run the full security gate (secrets, dependencies, types, tests, RLS mutation test, CSP and headers, test-hook isolation) and report pass/fail. Use before every push to main, after any change to auth, database, proxy, headers or storage, and when Kiko asks "is it secure".
---

# /security-check

Run these in order from the repo root and stop at the first failure. Fix it, then re-run from the top.

1. `node scripts/check-secrets.mjs`: no keys or tokens in tracked files. `.env.local` must be git-ignored (`git check-ignore .env.local`).
2. `npm audit --audit-level=high`: no high or critical advisories. Dependencies are pinned (`.npmrc save-exact`); never add a `^` or `~` range.
3. `npm run typecheck` and `npm test`: all pass, including `tests/db/*` (real Postgres via PGlite).
4. `npm run mutate`: every planted RLS hole must be KILLED. A survivor means a policy or test is too weak. Treat it as a blocker.
5. `npm run build` (production, no test hooks). Start it with `npx next start -p 3199` and check:
   - `curl -sI http://localhost:3199/` has `content-security-policy` with a fresh `nonce-` each request, plus `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy`, `strict-transport-security` and `permissions-policy`.
   - `curl -s "http://localhost:3199/?test=1"` never installs `window.__teacher`, `__fx` or `__project` (check in the browser console) (test hooks exist only in `build:test`).
   - Stop the server: kill the `next-server` PID (`pkill -f "next start"` does not match it).
6. `npm run build:test`, serve it, and run `node scripts/journey.mjs` with `SMOKE_URL`. It must report zero CSP violations.
7. Review the diff (`git diff origin/main` or the last commits) against `SECURITY.md`:
   - No secret under a `NEXT_PUBLIC_` name.
   - No `SECURITY DEFINER` in the public schema.
   - Every new table has RLS with `TO authenticated` plus an ownership check, and UPDATE has both USING and WITH CHECK.
   - Every value read from storage or the network is validated before use. Look up ids with `Map` or `Object.hasOwn`, never a plain object.
   - No `dangerouslySetInnerHTML`, `eval` or inline handlers.

Report: one line per step (PASS / FAIL + why), then the overall verdict. For risky changes (auth, RLS, payments) also ask the reviewer agent (`.claude/agents/reviewer.md`) for an independent pass.
