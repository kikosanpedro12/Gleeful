/**
 * Are the GLB teachers on? ON by default (founder decision, 21 Nov 2026); the procedural rig (rig.ts) is the fallback.
 * Order of precedence:
 *  1. `?rig=procedural` / `?rig=glb` in the URL (exact words only, everything else is ignored: allow-list).
 *  2. The browser session's remembered choice (sessionStorage `gleeful.rig`): `?rig=procedural` is remembered so
 *     landing -> /learn keeps it; `?rig=glb` forgets it. Only the exact word "procedural" is ever believed.
 *  3. Build kill switch: NEXT_PUBLIC_CHAR_GLB=0 turns the default OFF (any other value, or unset, leaves it ON).
 * Any load failure or an 8 s wait still falls back to the procedural rig (TeacherActor). The switch only picks a look;
 * it exposes no test hook (window.__teachers, __ctl need a test build and ?test=1).
 */
export type RigChoice = "glb" | "procedural";

export const RIG_STORAGE_KEY = "gleeful.rig";

/** The `rig` query value, only if it is exactly one of the two vetted rigs. Anything else (case variants, lists, junk) is null. */
export function parseRigParam(search: string | undefined | null): RigChoice | null {
  if (!search || typeof search !== "string") return null;
  let v: string | null;
  try { v = new URLSearchParams(search).get("rig"); } catch { return null; }
  return v === "glb" || v === "procedural" ? v : null;
}

/** Minimal storage shape (sessionStorage). */
export interface RigStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

/**
 * The visitor's explicit choice for this page view, or null for "use the default". The URL wins; `procedural` is
 * remembered, `glb` forgets it. Storage may be missing or throw (private mode, blocked): then the URL alone decides.
 */
export function resolveRigPreview(search: string | undefined | null, store: RigStore | null): RigChoice | null {
  const fromUrl = parseRigParam(search);
  try {
    if (fromUrl === "procedural") { store?.setItem(RIG_STORAGE_KEY, "procedural"); return "procedural"; }
    if (fromUrl === "glb") { store?.removeItem(RIG_STORAGE_KEY); return "glb"; }
    return store?.getItem(RIG_STORAGE_KEY) === "procedural" ? "procedural" : null;
  } catch {
    return fromUrl;
  }
}

function browserStore(): RigStore | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}

export function glbEnabled(env: { build?: string; search?: string; store?: RigStore | null } = {
  build: process.env.NEXT_PUBLIC_CHAR_GLB,
  search: typeof window !== "undefined" ? window.location.search : "",
  store: browserStore(),
}): boolean {
  const choice = resolveRigPreview(env.search, env.store ?? null);
  if (choice) return choice === "glb";
  return !["0", "false", "off"].includes((env.build ?? "").trim().toLowerCase());
}
