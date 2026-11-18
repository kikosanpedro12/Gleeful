/**
 * Asset library manifest: the only 3D parts a scene may use. The brain picks ids from here;
 * unknown ids are rejected. Every entry needs a matching row in ASSET_LICENSES.md first.
 * Empty on purpose until files are fetched and licence rows are added.
 */
export type AssetSource = "polyhaven-cc0" | "quaternius-qal" | "own";
export type Look = "realistic" | "stylized";

export interface Asset {
  id: string;
  name: string;
  source: AssetSource;
  sourceUrl: string;
  look: Look;
  file: string; // path under public/assets/, a .glb
  kb: number; // size after Blender shrink; target under 1000
  tags: string[];
}

export const ASSETS: readonly Asset[] = [];

const byId = new Map(ASSETS.map((a) => [a.id, a]));
export const assetById = (id: string): Asset | undefined => byId.get(id);

export const MAX_ASSET_KB = 1000;
export const MAX_SCENE_KB = 5000;

/** A scene may use one look only, and stay under the size budget. Returns an error string or null. */
export function checkAssets(ids: readonly string[]): string | null {
  const list = ids.map(assetById);
  if (list.some((a) => !a)) return "unknown asset id";
  const found = list as Asset[];
  if (new Set(found.map((a) => a.look)).size > 1) return "mixed looks";
  if (found.reduce((n, a) => n + a.kb, 0) > MAX_SCENE_KB) return "scene too large";
  return null;
}
