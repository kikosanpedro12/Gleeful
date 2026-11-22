import "server-only";
/**
 * Content-free server event counters for the admin page. COUNTS ONLY: an event name (a fixed code such as
 * "upstream_error") and a number. Never a message, a question, a model reply, an address or an id.
 *
 * Per warm server instance and per UTC day (a cold start or another instance shows its own, smaller number).
 * Stored on globalThis so the API route bundles and the admin page, which are separate modules, see the same table.
 */
const NAME_RE = /^[a-z][a-z_]{0,39}$/;
const MAX_KEYS = 64;
const KEY = Symbol.for("gleeful.admin.events");

interface Table { day: string; counts: Map<string, number> }
const g = globalThis as unknown as Record<symbol, Table | undefined>;
const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

function table(now: number): Table {
  let t = g[KEY];
  if (!t || t.day !== dayOf(now)) { t = { day: dayOf(now), counts: new Map() }; g[KEY] = t; }
  return t;
}

export type EventSource = "brain" | "taste";

/** Never throws; ignores anything that is not a plain event code. New names are refused when the table is full. */
export function recordEvent(source: EventSource, event: string, now: number = Date.now()): void {
  try {
    if ((source !== "brain" && source !== "taste") || typeof event !== "string" || !NAME_RE.test(event)) return;
    const t = table(now);
    const k = `${source}.${event}`;
    const had = t.counts.get(k);
    if (had === undefined && t.counts.size >= MAX_KEYS) return;
    t.counts.set(k, (had ?? 0) + 1);
  } catch { /* counting must never break a request */ }
}

export function readEvents(now: number = Date.now()): { day: string; counts: { key: string; count: number }[] } {
  const t = table(now);
  return { day: t.day, counts: [...t.counts].map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key)) };
}

export function resetEventsForTest() { g[KEY] = undefined; }
