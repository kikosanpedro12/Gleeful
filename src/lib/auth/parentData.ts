import "server-only";
import { CONSENT_VERSION } from "@/lib/consent/text";
import type { ServerSupabase } from "@/lib/supabase/server";

export interface LearnerRow { id: string; nickname: string; grade: number; preferred_teacher: "leo" | "mia" }
export type ParentData =
  | { ok: true; learners: LearnerRow[]; consent: { acceptedAt: string } | null }
  | { ok: false };

/**
 * Everything the parent area shows, read AS the parent (row-level security does the filtering).
 * Any database error (for example a migration not applied yet) is one generic "not ready" state:
 * the page never shows a raw database message.
 */
export async function loadParentData(supabase: ServerSupabase, parentId: string): Promise<ParentData> {
  try {
    const [learners, consent] = await Promise.all([
      supabase.from("learners").select("id,nickname,grade,preferred_teacher").eq("parent_id", parentId).order("created_at", { ascending: true }).limit(50),
      supabase.from("parental_consents").select("accepted_at").eq("parent_id", parentId).eq("consent_text_version", CONSENT_VERSION).is("withdrawn_at", null).limit(1),
    ]);
    if (learners.error || consent.error) return { ok: false };
    return {
      ok: true,
      learners: (learners.data ?? []) as LearnerRow[],
      consent: consent.data && consent.data.length > 0 ? { acceptedAt: String((consent.data[0] as { accepted_at: string }).accepted_at) } : null,
    };
  } catch {
    return { ok: false };
  }
}
