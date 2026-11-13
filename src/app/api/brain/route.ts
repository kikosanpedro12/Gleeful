import "server-only";
import { handleBrain, makeDeps, warnTesterMisconfigured } from "@/lib/brain/server/handler";
import { MemoryUsageStore } from "@/lib/brain/server/limits";
import { readEnv } from "@/lib/brain/server/config";
import { resolveParentAccess } from "@/lib/auth/parent";
import { accountsAvailable } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Seconds. Covers the 5 s body read and 12 s model call with margin; stops a stuck call from running for the platform default. */
export const maxDuration = 20;

// One set of in-memory tables per WARM server instance: a brake, not a ceiling (see limits.ts). The Anthropic Console spend limit is the real ceiling until public.brain_usage is wired in.
const usage = new MemoryUsageStore();
// `parent` resolves the signed-in parent from the session cookie (verified with getClaims) and whether their consent is on file.
const base = makeDeps({ env: readEnv(), usage, parent: () => resolveParentAccess() });

export async function POST(req: Request) {
  // Re-read the environment per request so the kill switch and key rotation take effect without a code change.
  return handleBrain(req, { ...base, env: readEnv() });
}

/**
 * Capability check for the client: can THIS visitor reach the model right now? A few booleans, no secrets,
 * never cached. It lets a visitor without access skip the POST (the script answers) and lets the on-screen
 * copy claim an AI teacher only when one will really answer.
 *
 * - configured: key present, not switched off, passcode (if any) long enough, and at least one way in exists
 *   (parent accounts, or a private-test passcode).
 * - testerRequired: a private-test passcode is accepted here (name kept for older clients).
 * - signedIn / consented: this browser has a verified parent session, and that parent's consent is on file.
 */
export async function GET() {
  const env = readEnv();
  if (env.testerMisconfigured) warnTesterMisconfigured();
  let signedIn = false;
  let consented = false;
  try {
    const p = await resolveParentAccess();
    signedIn = p !== null;
    consented = p?.consented === true;
  } catch { /* cannot tell: treated as not signed in */ }
  const wayIn = accountsAvailable() || Boolean(env.testerCode);
  return Response.json(
    { configured: Boolean(env.apiKey) && !env.disabled && !env.testerMisconfigured && wayIn, testerRequired: Boolean(env.testerCode), signedIn, consented },
    { headers: { "cache-control": "no-store" } },
  );
}
