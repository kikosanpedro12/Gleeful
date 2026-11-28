/** A parent counts as a sign-up when the account was created within this window of the link being used (links last 1 hour; one signup per parent is enforced by the database). */
export const FRESH_ACCOUNT_MS = 2 * 60 * 60 * 1000;
export function isFreshAccount(createdAt: unknown, now: number): boolean {
  if (typeof createdAt !== "string") return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t <= now + 60_000 && now - t <= FRESH_ACCOUNT_MS;
}
