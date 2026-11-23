import "server-only";
import { db, billingConfigured } from "@/lib/billing/store";
import type { FeedbackInput } from "./validate";

export interface FeedbackRow { id: string; createdAt: string; message: string; contactEmail: string | null; page: string | null }

export const feedbackConfigured = billingConfigured;

/** Global caps live in the database so many instances or addresses cannot flood it: 100 an hour, 5000 in total. Returns false when refused. */
export async function saveFeedback(f: FeedbackInput): Promise<boolean> {
  const r = await db()`insert into public.feedback (message, contact_email, page)
    select ${f.message}, ${f.contactEmail}, ${f.page}
    where (select count(*) from public.feedback where created_at > now() - interval '1 hour') < 100
      and (select count(*) from public.feedback) < 5000
    returning id`;
  return r.length > 0;
}

/** Newest first. Read-only; used by /admin. */
export async function recentFeedback(limit = 50): Promise<FeedbackRow[]> {
  const rows = await db()<{ id: string; created_at: Date; message: string; contact_email: string | null; page: string | null }[]>`select id, created_at, message, contact_email, page from public.feedback order by created_at desc limit ${Math.min(Math.max(limit, 1), 200)}`;
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at.toISOString(), message: r.message, contactEmail: r.contact_email, page: r.page }));
}
