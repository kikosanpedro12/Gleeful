import "server-only";
import { readEvents } from "./events";
import { readElevenEnv } from "@/lib/tts/elevenHandler";
import { getVoiceDeps } from "@/lib/tts/voiceDeps";
import { readEnv } from "@/lib/brain/server/config";
import { readTasteEnv } from "@/lib/taste/server/config";
import { indexingEnabled } from "@/lib/seo/site";
import { accountsAvailable } from "@/lib/supabase/env";

/** Everything /admin shows. Booleans, counts and fixed labels only: never a key, a code, an id, an address or any child text. */
export interface AdminSnapshot {
  generatedAt: string;
  switches: { name: string; state: string; note: string }[];
  keys: { name: string; configured: boolean }[];
  voiceLanding: { day: string; used: number; cap: number; scope: string } | null;
  events: { day: string; counts: { key: string; count: number }[]; scope: string };
}

export function buildSnapshot(env: Record<string, string | undefined> = process.env, now: number = Date.now()): AdminSnapshot {
  const eleven = readElevenEnv(env);
  const brain = readEnv(env);
  const taste = readTasteEnv(env);
  const day = new Date(now).toISOString().slice(0, 10);

  // The voice counters live in this instance's memory. Not readable at all from another instance.
  const pool = getVoiceDeps().anon.get("landing-pool");
  const voiceLanding = { day, used: pool && pool.day === day ? pool.chars : 0, cap: eleven.landingDailyChars, scope: "this server instance only; resets on a cold start" };

  return {
    generatedAt: new Date(now).toISOString(),
    switches: [
      { name: "NEXT_PUBLIC_CHAR_GLB", state: env.NEXT_PUBLIC_CHAR_GLB === "0" ? "OFF (procedural teachers)" : "ON (GLB teachers)", note: "Build-time value: reflects the build this server runs, not a later env change." },
      { name: "SITE_INDEXING", state: indexingEnabled(env) ? "ON (landing page may be indexed)" : "OFF (everything noindex)", note: "Build-time for robots.txt." },
      { name: "ELEVEN_LANDING", state: eleven.landingOn ? "ON (needs the ElevenLabs key)" : "OFF", note: "Read per request." },
      { name: "BRAIN_DISABLED", state: brain.disabled ? "STOPPED (lessons use the script)" : "not set (brain may answer)", note: "Kill switch for every model call." },
      { name: "TASTE_DISABLED", state: taste.disabled ? "STOPPED (landing Ask box off)" : "not set", note: "Landing Ask box only (BRAIN_DISABLED also stops it)." },
      { name: "TTS_DISABLED", state: eleven.disabled ? "STOPPED (voice off)" : "not set", note: "Voice route switch." },
      { name: "Parent accounts (Supabase URL + publishable key)", state: accountsAvailable(env) ? "configured" : "not configured", note: "" },
    ],
    keys: [
      { name: "ANTHROPIC_API_KEY (brain and landing Ask box)", configured: Boolean(brain.apiKey) },
      { name: "ELEVENLABS_API_KEY (voice)", configured: Boolean(eleven.key) },
    ],
    voiceLanding,
    events: { ...readEvents(now), scope: "this server instance only, since midnight UTC or its last cold start" },
  };
}

/** What is NOT measured, and what it would take. Shown as-is on the page. */
export const NOT_TRACKED: { what: string; why: string; needs: string }[] = [
  { what: "Sign-ups (parent accounts)", why: "Accounts live in Supabase Auth (auth.users). The app deliberately holds no service/secret key, and row-level security lets each parent see only their own rows.", needs: "A reviewed server-only count source: either a secret key used ONLY by an admin route, or a security-invoker view/function exposing a bare count, with RLS tests and a mutant. Founder decision." },
  { what: "Trial / free-try counts", why: "The 3 free tries are a signed cookie in the visitor's browser; the per-address and site-wide daily counters are in server memory and are not exposed.", needs: "A counter table (day, count only) written by /api/taste, or a Vercel analytics event." },
  { what: "Consents, learners, lesson sessions, attempts", why: "Tables exist (migrations) but are parent-owned under RLS. Totals across families are not readable without the secret key. parental_consents may not be applied live yet.", needs: "Same as sign-ups. Never show child text or nicknames." },
  { what: "Voice usage across all instances, or across days", why: "Counters are per warm instance and in memory.", needs: "Shared storage (the planned brain_usage-style table) or the ElevenLabs usage page / account usage API." },
  { what: "Brain and taste spend (tokens, cost)", why: "Token counts are not persisted; the Anthropic Console is the source of truth for spend.", needs: "A brain_signals aggregates table (BACKLOG, needs founder OK on what is logged)." },
  { what: "Errors across instances / history", why: "Counts are in-memory per instance and per UTC day; the full logs are in Vercel.", needs: "Vercel log drain, or the aggregates table above." },
];
