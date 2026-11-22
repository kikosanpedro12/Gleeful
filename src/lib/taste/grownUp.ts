/**
 * The "grown-up is here" step on the public landing, in front of the microphone and every spoken reply.
 *
 * This is a LIGHT CHECK, not age verification: a child can tap Yes. It exists so that voice (the browser's speech-to-text
 * service, and the voice partner that speaks replies) starts only after an adult has seen what it does. Typing needs no gate.
 *
 * - Default is closed. Only an exact "yes" in sessionStorage reopens it; any other stored value is ignored (closed).
 * - Kept in React state, and mirrored to sessionStorage (this browser session only) inside try/catch.
 *   Never localStorage, never a cookie, never sent to a server.
 * - "declined" = stays silent for the session; the mic button still opens the card again.
 */
export type Gate = "closed" | "open" | "declined";

export const GATE_KEY = "gleeful.grownup.v1";
const YES = "yes";
const NO = "no";

/** The smallest part of Storage we use, so tests can pass a fake (or a hostile) one. */
export interface GateStore { getItem(k: string): string | null; setItem(k: string, v: string): void }

function store(): GateStore | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; } // access itself can throw (blocked storage)
}

/** Reads the session's earlier choice. Anything unexpected, or any failure, is "closed". */
export function readGate(s: GateStore | null = store()): Gate {
  try {
    const v = s?.getItem(GATE_KEY);
    return v === YES ? "open" : v === NO ? "declined" : "closed";
  } catch { return "closed"; }
}

/** Remembers the choice for this browser session. A storage failure is silent: the choice still holds in memory. */
export function writeGate(g: Gate, s: GateStore | null = store()): void {
  try { if (g !== "closed") s?.setItem(GATE_KEY, g === "open" ? YES : NO); } catch { /* memory only */ }
}

/** Whether the microphone and spoken replies may be used. The ONLY thing that is allowed to start either. */
export function voiceAllowed(g: Gate): boolean { return g === "open"; }

/** The next gate after the grown-up's tap. Accept opens; decline stays silent. Nothing else changes it. */
export function decide(accepted: boolean): Gate { return accepted ? "open" : "declined"; }
