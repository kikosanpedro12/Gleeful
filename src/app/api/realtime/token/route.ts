import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { teacherInstructions } from "@/lib/voice/instructions";
import { SCENE_TOOLS } from "@/lib/scene/commands";

/**
 * Mints a short-lived Realtime client secret. The standard API key never
 * leaves the server. Guards: optional access code, per-process hourly cap.
 * (Phase 3 replaces the access code with real parent auth via Supabase.)
 */
export const dynamic = "force-dynamic";

const minted: number[] = [];

function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ code: "NO_KEY", message: "No API key configured; demo mode." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const required = process.env.APP_ACCESS_CODE;
  if (required && !(typeof body.accessCode === "string" && safeEqual(body.accessCode, required)))
    return NextResponse.json({ code: "BAD_CODE", message: "That access code is not right." }, { status: 401 });

  const cap = Number(process.env.MAX_SESSIONS_PER_HOUR || 12);
  const now = Date.now();
  while (minted.length && now - minted[0] > 3_600_000) minted.shift();
  if (minted.length >= cap)
    return NextResponse.json({ code: "RATE_LIMIT", message: "Session limit reached for this hour. Try again later." }, { status: 429 });

  const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";
  const voice = process.env.OPENAI_REALTIME_VOICE_LEO || "cedar";
  const base = { type: "realtime", model, instructions: teacherInstructions("Leo"), tools: SCENE_TOOLS, tool_choice: "auto" };
  const full = {
    ...base,
    audio: {
      input: { turn_detection: { type: "semantic_vad" }, transcription: { model: "gpt-4o-mini-transcribe" } },
      output: { voice },
    },
  };
  const minimal = { ...base, audio: { output: { voice } } };

  const mint = (session: object) =>
    fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // Synthetic/dev identifier only. Replace with a hashed parent-account id in Phase 3.
        "OpenAI-Safety-Identifier": createHash("sha256").update("dev-family-test").digest("hex").slice(0, 32),
      },
      body: JSON.stringify({ session }),
    });

  try {
    let res = await mint(full);
    let degraded = false;
    if (res.status === 400) {
      // Session shape drift: retry with the minimal documented shape and say so.
      const detail = await res.text();
      console.warn("[token] full session config rejected, retrying minimal:", detail.slice(0, 500));
      res = await mint(minimal);
      degraded = true;
    }
    if (!res.ok) {
      const detail = await res.text();
      console.error("[token] mint failed", res.status, detail.slice(0, 500));
      return NextResponse.json({ code: "UPSTREAM", message: `The voice service refused the session (${res.status}). Check the server log.` }, { status: 502 });
    }
    const data = await res.json();
    if (!data.value) return NextResponse.json({ code: "UPSTREAM", message: "Voice service returned no client secret." }, { status: 502 });
    minted.push(now);
    return NextResponse.json({ value: data.value, expiresAt: data.expires_at ?? null, model, degraded }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "UPSTREAM", message: "Could not reach the voice service." }, { status: 502 });
  }
}
