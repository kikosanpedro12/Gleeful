"use server";
/**
 * Parent-area writes. Every action re-checks the signed-in parent from the verified session (never from
 * the form), and every database call runs AS that parent, so row-level security is the real gate: even a
 * forged id in the form can only ever touch the caller's own rows.
 * Messages are fixed strings. Nothing personal is logged.
 */
import { revalidatePath } from "next/cache";
import { CONSENT_VERSION } from "@/lib/consent/text";
import { createServerSupabase } from "@/lib/supabase/server";
import { currentParentId, forgetConsentCache, hasCurrentConsent } from "@/lib/auth/parent";
import { MAX_LEARNERS_PER_PARENT, parseLearnerInput } from "@/lib/auth/validate";

export interface ActionResult { ok: boolean; message: string }
const NOT_SIGNED_IN: ActionResult = { ok: false, message: "Please sign in again." };
const GENERIC: ActionResult = { ok: false, message: "That didn't work. Please try again." };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function parent() {
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  const id = await currentParentId(supabase);
  return id ? { supabase, id } : null;
}
const done = (message: string): ActionResult => { revalidatePath("/parent"); return { ok: true, message }; };

export async function giveConsent(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const p = await parent();
  if (!p) return NOT_SIGNED_IN;
  if (fd.get("agree") !== "on") return { ok: false, message: "Tick the box to confirm, or leave this page without agreeing." };
  try {
    const { error } = await p.supabase.from("parental_consents").insert({ parent_id: p.id, consent_text_version: CONSENT_VERSION });
    if (error && error.code !== "23505") return GENERIC; // 23505 = already agreed to this wording: fine
  } catch { return GENERIC; }
  forgetConsentCache(p.id);
  return done("Thank you. Your permission is recorded.");
}

export async function withdrawConsent(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  const p = await parent();
  if (!p) return NOT_SIGNED_IN;
  try {
    // The value is ignored: the database stamps the time itself.
    const { error } = await p.supabase.from("parental_consents").update({ withdrawn_at: new Date().toISOString() }).eq("parent_id", p.id).is("withdrawn_at", null);
    if (error) return GENERIC;
  } catch { return GENERIC; }
  forgetConsentCache(p.id);
  return done("Permission withdrawn. The AI teacher is off for your family.");
}

export async function addLearner(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const p = await parent();
  if (!p) return NOT_SIGNED_IN;
  const input = parseLearnerInput((k) => fd.get(k));
  if (!input.ok) return { ok: false, message: input.message };
  // A child's details are only collected after the parent has agreed to the current wording.
  if (!(await hasCurrentConsent(p.supabase, p.id))) return { ok: false, message: "Please give your permission first (above), then add your child." };
  try {
    const count = await p.supabase.from("learners").select("id", { count: "exact", head: true }).eq("parent_id", p.id);
    if (count.error) return GENERIC;
    if ((count.count ?? 0) >= MAX_LEARNERS_PER_PARENT) return { ok: false, message: `You can add up to ${MAX_LEARNERS_PER_PARENT} children.` };
    const { error } = await p.supabase.from("learners").insert({ parent_id: p.id, ...input.value, language: "en" });
    if (error) return GENERIC;
  } catch { return GENERIC; }
  return done("Added.");
}

export async function updateLearner(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const p = await parent();
  if (!p) return NOT_SIGNED_IN;
  const id = fd.get("id");
  if (typeof id !== "string" || !UUID_RE.test(id)) return GENERIC;
  const input = parseLearnerInput((k) => fd.get(k));
  if (!input.ok) return { ok: false, message: input.message };
  try {
    const { data, error } = await p.supabase.from("learners").update(input.value).eq("id", id).eq("parent_id", p.id).select("id");
    if (error || !data || data.length === 0) return GENERIC;
  } catch { return GENERIC; }
  return done("Saved.");
}

export async function deleteLearner(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const p = await parent();
  if (!p) return NOT_SIGNED_IN;
  const id = fd.get("id");
  if (typeof id !== "string" || !UUID_RE.test(id)) return GENERIC;
  try {
    const { error } = await p.supabase.from("learners").delete().eq("id", id).eq("parent_id", p.id);
    if (error) return GENERIC;
  } catch { return GENERIC; }
  return done("Deleted, along with their lesson history.");
}
