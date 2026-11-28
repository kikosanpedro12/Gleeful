import "server-only";
import { after } from "next/server";

/**
 * Runs an analytics write AFTER the response has been sent, so a page or redirect never waits on it (Next's `after()`).
 * Outside a request (tests, scripts) `after` throws, so the task just starts right away. Never throws; the task must not either.
 */
export function later(task: () => Promise<unknown>): void {
  const run = () => { void Promise.resolve().then(task).catch(() => {}); };
  try { after(run); } catch { run(); }
}
