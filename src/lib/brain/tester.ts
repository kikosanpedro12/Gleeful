/**
 * Private-test passcode, browser side. Entered once on /tester and kept in this
 * tab's sessionStorage (cleared when the tab closes). It is checked on the
 * server only; the browser never learns whether a code is right except by the
 * lesson answering with the AI. Storage can throw (private mode, blocked
 * storage), so every access is wrapped.
 */
export const TESTER_KEY = "gleeful.tester";
export const TESTER_HEADER = "x-gleeful-tester";
const MAX = 200;

export function getTesterCode(): string | null {
  try { const v = sessionStorage.getItem(TESTER_KEY); return v && v.length <= MAX ? v : null; } catch { return null; }
}
export function setTesterCode(code: string): boolean {
  const v = code.trim();
  if (!v || v.length > MAX) return false;
  try { sessionStorage.setItem(TESTER_KEY, v); return true; } catch { return false; }
}
export function clearTesterCode() {
  try { sessionStorage.removeItem(TESTER_KEY); } catch { /* nothing stored */ }
}
