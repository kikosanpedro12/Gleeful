import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Per-tester invite codes. TESTER_INVITES="alice:<code>,bob:<code>" (name 1-24 of a-z 0-9 _ -, code 16+ chars, at most 50).
 * Each invite is its own budget owner ("tester:<name>") in the brain and the voice, and can be revoked by deleting its
 * entry. The master BRAIN_TESTER_CODE still works and keeps the shared "tester" owner. A malformed entry is skipped
 * (never half-accepted), and a duplicate name or code keeps only the first.
 */
export interface Invite { name: string; code: string }
export const INVITE_MAX = 50;
export const INVITE_CODE_MIN = 16;
const NAME = /^[a-z0-9_-]{1,24}$/;

export function parseInvites(raw: string | undefined): Invite[] {
  const out: Invite[] = [];
  const names = new Set<string>(), codes = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const i = part.indexOf(":");
    if (i < 1) continue;
    const name = part.slice(0, i).trim().toLowerCase();
    const code = part.slice(i + 1).trim();
    if (!NAME.test(name) || code.length < INVITE_CODE_MIN || code.length > 200 || names.has(name) || codes.has(code)) continue;
    names.add(name); codes.add(code);
    out.push({ name, code });
    if (out.length >= INVITE_MAX) break;
  }
  return out;
}

const digest = (s: string) => createHash("sha256").update(s.slice(0, 200), "utf8").digest();

/** Name of the invite whose code was given, or null. Compares against every invite (no early exit), in constant time per code. */
export function matchInvite(invites: readonly Invite[] | undefined, given: string | null): string | null {
  if (!given || !invites?.length) return null;
  const g = digest(given);
  let hit: string | null = null;
  for (const inv of invites) if (timingSafeEqual(digest(inv.code), g) && hit === null) hit = inv.name;
  return hit;
}
