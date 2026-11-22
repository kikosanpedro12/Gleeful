import "server-only";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAdminClaims, parseAllowlist } from "./allowlist";

/**
 * Server-side gate for /admin. EVERY failure (accounts off, no session, signed in but not listed, empty allowlist,
 * any error) ends in the same notFound(), so a visitor cannot tell that /admin exists or why they were refused.
 * Claims come from getClaims() (verified), never from the client.
 */
export async function requireAdmin(): Promise<void> {
  let ok = false;
  try {
    const list = parseAllowlist(process.env.ADMIN_EMAILS);
    if (list.emails.size + list.ids.size > 0) {
      const supabase = await createServerSupabase();
      if (supabase) {
        const { data, error } = await supabase.auth.getClaims();
        ok = !error && !!data && isAdminClaims(data.claims, list);
      }
    }
  } catch {
    ok = false;
  }
  if (!ok) notFound();
}
