import "server-only";
import { freemiusSecret, paymentsMode } from "@/lib/billing/config";
import { handleWebhook } from "@/lib/billing/webhook";
import { pgStore } from "@/lib/billing/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

/** Freemius webhook. All logic lives in handleWebhook (testable); this only wires the real secret, mode and database. */
export async function POST(req: Request) {
  return handleWebhook(req, { mode: paymentsMode(), secret: freemiusSecret(), store: pgStore, now: () => new Date() });
}
