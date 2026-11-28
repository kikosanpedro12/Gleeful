/** Only https links to Freemius's own checkout/portal hosts are ever used, whatever the environment says. */
export function safeLink(v: string | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && (u.hostname === "checkout.freemius.com" || u.hostname.endsWith(".freemius.com")) ? u.toString() : null;
  } catch { return null; }
}
export type CheckoutPlan = "solo" | "family";
export const isCheckoutPlan = (p: unknown): p is CheckoutPlan => p === "solo" || p === "family";
/** The checkout link for a plan, from server env. */
export function checkoutLink(plan: CheckoutPlan, env: Record<string, string | undefined> = process.env): string | null {
  return safeLink(plan === "solo" ? env.FREEMIUS_CHECKOUT_URL_SOLO : env.FREEMIUS_CHECKOUT_URL_FAMILY);
}
/** Same-origin hop the parent page links to, so a click can be counted without any script. */
export const checkoutHref = (plan: CheckoutPlan) => `/api/checkout?plan=${plan}`;
