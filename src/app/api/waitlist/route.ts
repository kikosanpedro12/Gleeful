import "server-only";
import { handleWaitlist, makeWaitlistDeps, readWaitlistEnv } from "@/lib/waitlist/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

// In-memory per-IP limit, per warm instance: a brake against form spam, not a hard ceiling.
const base = makeWaitlistDeps({ env: readWaitlistEnv() });

export async function POST(req: Request) {
  // Re-read env per request so adding the Supabase keys in Vercel takes effect on the next deploy without code changes.
  return handleWaitlist(req, { ...base, env: readWaitlistEnv() });
}

/** Is the waitlist open? One boolean, no secrets, never cached. Lets the form show "opens soon" up front. */
export async function GET() {
  const env = readWaitlistEnv();
  return Response.json({ open: Boolean(env.url && env.secretKey) }, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
