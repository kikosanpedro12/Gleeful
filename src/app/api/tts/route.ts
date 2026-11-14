import "server-only";
import { handleTts, makeTtsDeps, readTtsEnv, ttsStatus } from "@/lib/tts/handler";
import { readEnv } from "@/lib/brain/server/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Seconds. Covers the 3 s body read and the 10 s upstream call. */
export const maxDuration = 20;

// In-memory counters per WARM instance: a brake, not a ceiling. The ceiling is Deepgram's prepaid credit.
const base = makeTtsDeps({ env: readTtsEnv(), brainEnv: readEnv() });

export async function POST(req: Request) {
  // Re-read the environment per request so the kill switch, key and caps take effect without a code change.
  base.env = readTtsEnv();
  base.brainEnv = readEnv();
  return handleTts(req, base);
}

export async function GET() {
  base.env = readTtsEnv();
  base.brainEnv = readEnv();
  return Response.json(ttsStatus(base), { headers: { "cache-control": "no-store" } });
}
