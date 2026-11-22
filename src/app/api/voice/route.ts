import "server-only";
import { handleVoice, readElevenEnv, voiceStatus } from "@/lib/tts/elevenHandler";
import { readEnv } from "@/lib/brain/server/config";
import { getVoiceDeps } from "@/lib/tts/voiceDeps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Seconds. Covers the 3 s body read and the streamed audio (18 s ceiling in the handler). */
export const maxDuration = 25;

// In-memory counters per WARM instance: a brake, not a ceiling. The ceiling is the credit cap on the ElevenLabs key.
const base = getVoiceDeps();

export async function POST(req: Request) {
  // Re-read the environment per request so the kill switch, key and caps take effect without a code change.
  base.env = readElevenEnv();
  base.brainEnv = readEnv();
  return handleVoice(req, base);
}

export async function GET(req: Request) {
  base.env = readElevenEnv();
  base.brainEnv = readEnv();
  const { status, body } = await voiceStatus(req, base);
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
