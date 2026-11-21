/**
 * Is the GLB teacher path on? Off by default: the procedural rig (rig.ts) stays the live look until the founder approves.
 *  - Build flag:  NEXT_PUBLIC_CHAR_GLB=1   (not a secret; it only picks a look)
 *  - Test hook:   ?rig=glb  or  ?rig=procedural  (only in a test build, NEXT_PUBLIC_TEST_HOOKS=1, and only with ?test=1 like every other hook)
 * A deployment build never reads the URL, so a visitor cannot switch it on or off.
 */
export function glbEnabled(env: { build?: string; testHooks?: boolean; search?: string } = {
  build: process.env.NEXT_PUBLIC_CHAR_GLB,
  testHooks: process.env.NEXT_PUBLIC_TEST_HOOKS === "1",
  search: typeof window !== "undefined" ? window.location.search : "",
}): boolean {
  if (env.testHooks && env.search && /[?&](test|dev)=1(&|$)/.test(env.search)) {
    if (/[?&]rig=glb(&|$)/.test(env.search)) return true;
    if (/[?&]rig=procedural(&|$)/.test(env.search)) return false;
  }
  return env.build === "1";
}
