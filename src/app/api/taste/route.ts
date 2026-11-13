import "server-only";
import { handleTaste, makeTasteDeps, tasteStatus } from "@/lib/taste/server/handler";
import { readTasteEnv } from "@/lib/taste/server/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Seconds. Covers the 3 s body read and the 12 s model call. */
export const maxDuration = 20;

// One set of in-memory tables per WARM server instance: a brake, not a ceiling (see handler.ts). The Anthropic Console spend limit is the ceiling.
const base = makeTasteDeps({ env: readTasteEnv() });

export async function POST(req: Request) {
  // Re-read the environment per request so the kill switch and the caps take effect without a code change.
  return handleTaste(req, { ...base, env: readTasteEnv() });
}

/** Can a question be answered right now? Two booleans/numbers, no secrets, never cached. The landing page shows the live box only when this says yes. */
export async function GET() {
  return Response.json(await tasteStatus({ ...base, env: readTasteEnv() }), { headers: { "cache-control": "no-store" } });
}
