import "server-only";
import { handleBrain, makeDeps } from "@/lib/brain/server/handler";
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
