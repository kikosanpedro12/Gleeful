/**
 * Small HTTP helpers shared by /api/brain and the sign-in routes.
 * Plain functions of a Request: no framework imports, so tests can call them directly.
 */

/** The caller's address from the proxy header, or "unknown". Only a brake key, never an identity. */
export function clientIp(req: Request): string {
  const first = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(first) ? first : "unknown";
}

/**
 * Same-origin only: a page on another site must not be able to spend our key.
 *
 * DECISION: a request with NEITHER Origin nor Sec-Fetch-Site is allowed. Every
 * browser sends at least one of them on a POST, so a cross-site web page cannot
 * omit both; only non-browser clients (curl, scripts) do, and they can forge
 * either header anyway. This check is CSRF protection for browsers, NOT a spend
 * control. Spend is controlled by the rate limits, the daily caps and the
 * Console spend limit.
 */
export function crossOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  try { return new URL(origin).host !== host; } catch { return true; }
}

/**
 * Reads the body with a hard cap on BYTES (not characters) and a time limit, so a
 * chunked or slow-drip request cannot hold the function open or fill memory.
 */
export async function readBody(req: Request, maxBytes: number, timeoutMs: number): Promise<{ ok: true; text: string } | { ok: false; status: 400 | 413 }> {
  if (!req.body) return { ok: true, text: "" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, timeoutMs);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { void reader.cancel().catch(() => {}); return { ok: false, status: 413 }; }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  } finally {
    clearTimeout(timer);
  }
  if (timedOut) return { ok: false, status: 400 };
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.byteLength; }
  try { return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(all) }; } catch { return { ok: false, status: 400 }; }
}

