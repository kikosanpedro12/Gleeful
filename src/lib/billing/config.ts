import "server-only";

/**
 * PAYMENTS_MODE is the one switch for charging:
 *  - "off" (default, anything unrecognised): no billing check. Closed beta behaviour is unchanged.
 *  - "sandbox": the billing check is ON (a parent needs a trial or plan), webhooks are accepted. Use with Freemius sandbox only.
 *  - "live": same as sandbox, for real money. Flipping this is the founder's decision, after the go-live list in CHECKPOINT.md.
 */
export type PaymentsMode = "off" | "sandbox" | "live";
export function paymentsMode(env: Record<string, string | undefined> = process.env): PaymentsMode {
  const v = (env.PAYMENTS_MODE ?? "").trim().toLowerCase();
  return v === "sandbox" || v === "live" ? v : "off";
}
/** Freemius product secret key (signs webhooks). Server-only. */
export const freemiusSecret = (env: Record<string, string | undefined> = process.env) => env.FREEMIUS_SECRET_KEY?.trim() ?? "";
