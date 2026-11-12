import "server-only";
import { handleBrain, makeDeps } from "@/lib/brain/server/handler";
import { MemoryUsageStore } from "@/lib/brain/server/limits";
import { readEnv } from "@/lib/brain/server/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One set of in-memory tables per server instance (see limits.ts for what that does and does not guarantee).
const usage = new MemoryUsageStore();
const base = makeDeps({ env: readEnv(), usage });

export async function POST(req: Request) {
  // Re-read the environment per request so the kill switch and key rotation take effect without a code change.
  return handleBrain(req, { ...base, env: readEnv() });
}
