import { useSyncExternalStore } from "react";

/**
 * Which GLB teachers are still loading (flag on only). The stage shows one honest "Getting your teacher ready" line
 * while any is pending, and nothing once the teachers (or the fallback) are on screen.
 */
const pending = new Set<string>();
const listeners = new Set<() => void>();
let snapshot = false;
function emit() {
  const next = pending.size > 0;
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((l) => l());
}
export function glbLoading(id: string, on: boolean) { if (on) pending.add(id); else pending.delete(id); emit(); }
export const glbLoadingNow = () => snapshot;
export function useGlbLoading(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => snapshot, () => false);
}
