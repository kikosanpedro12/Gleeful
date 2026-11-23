export interface FeedbackInput { message: string; contactEmail: string | null; page: string | null }
export const MAX_MESSAGE = 2000;
const EMAIL = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[^@\s,;<>"]+$/;
const BIDI = /[\u202a-\u202e\u2066-\u2069]/g;
/** True when the hidden field was filled (a bot). The route answers these with a normal-looking 200 and stores nothing. */
export function isHoneypot(body: unknown): boolean {
  return !!body && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>).website === "string" && (body as Record<string, string>).website.length > 0;
}
const PAGE = /^\/[a-z0-9/_-]{0,58}$/;

/** Parses the browser's JSON. Returns null for anything that is not a plain, small, well-formed message. The honeypot field `website` must be absent or empty. */
export function parseFeedback(body: unknown): FeedbackInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.website === "string" && b.website.length > 0) return null; // a bot filled the hidden field
  if (typeof b.message !== "string") return null;
  const message = b.message.replace(/\r\n/g, "\n").replace(BIDI, "").trim();
  if (message.length < 1 || message.length > MAX_MESSAGE) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(message)) return null;
  let contactEmail: string | null = null;
  if (typeof b.email === "string" && b.email.trim() !== "") {
    const e = b.email.trim();
    if (e.length < 3 || e.length > 254 || !EMAIL.test(e)) return null;
    contactEmail = e.toLowerCase();
  }
  let page: string | null = null;
  if (typeof b.page === "string" && b.page !== "") {
    if (!PAGE.test(b.page)) return null;
    page = b.page;
  }
  return { message, contactEmail, page };
}
