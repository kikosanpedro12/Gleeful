import "server-only";
import { makeElevenDeps, readElevenEnv, type ElevenDeps } from "./elevenHandler";
import { readEnv } from "@/lib/brain/server/config";
import { resolveParentAccess } from "@/lib/auth/parent";

/**
 * ONE set of voice counters per warm server instance, shared by /api/voice and the read-only /admin page.
 * Kept on globalThis because route bundles are separate modules. A brake, not a ceiling: the credit cap on the
 * ElevenLabs key is the ceiling.
 */
const KEY = Symbol.for("gleeful.voice.deps");
const g = globalThis as unknown as Record<symbol, ElevenDeps | undefined>;

export function getVoiceDeps(): ElevenDeps {
  return (g[KEY] ??= makeElevenDeps({ env: readElevenEnv(), brainEnv: readEnv(), parent: () => resolveParentAccess() }));
}
