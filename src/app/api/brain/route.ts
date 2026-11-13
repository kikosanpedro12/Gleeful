import "server-only";
import { handleBrain, makeDeps, warnTesterMisconfigured } from "@/lib/brain/server/handler";
import { MemoryUsageStore } from "@/lib/brain/server/limits";
import { readEnv } from "@/lib/brain/server/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Seconds. Covers the 5 s body read and 12 s model call with margin; stops a stuck call from running for the platform default. */
export const maxDuration = 20;

// One set of in-memory tables per WARM server instance: a brake, not a ceiling (see limits.ts). The Anthropic Console spend limit is the real ceiling until public.brain_usage is wired in.
const usage = new MemoryUsageStore();
const base = makeDeps({ env: readEnv(), usage });

export async function POST(req: Request) {
  // Re-read the environment per request so the kill switch and key rotation take effect without a code change.
  return handleBrain(req, { ...base, env: readEnv() });
}

/**
 * Capability check for the client: is the brain switched on and keyed? One boolean, no secrets,
 * never cached. It lets a build with no key skip the POST instead of logging a 503 on every page load.
 */
export async function GET() {
  const env = readEnv();
  if (env.testerMisconfigured) warnTesterMisconfigured();
  // testerRequired is one more boolean (no hint about the code), so a browser without the code skips the POST.
  return Response.json({ configured: Boolean(env.apiKey) && !env.disabled && !env.testerMisconfigured, testerRequired: Boolean(env.testerCode) }, { headers: { "cache-control": "no-store" } });
}
