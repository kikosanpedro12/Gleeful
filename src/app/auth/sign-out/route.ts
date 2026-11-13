import "server-only";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { crossOrigin } from "@/lib/http/request";
import { clearConsentCache } from "@/lib/auth/parent";

export const dynamic = "force-dynamic";

/** POST only (a link or image on another page must not be able to sign a parent out), same-origin only. */
export async function POST(req: Request) {
  if (crossOrigin(req)) return new NextResponse(null, { status: 403 });
  const supabase = await createServerSupabase();
  if (supabase) { try { await supabase.auth.signOut({ scope: "local" }); } catch { /* the cookie is cleared below by the client library when it can */ } }
  clearConsentCache();
  return NextResponse.redirect(new URL("/", req.url), 303);
}
