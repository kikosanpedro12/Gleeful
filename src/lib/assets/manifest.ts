/**
 * Asset library manifest: the only 3D parts a scene may use. The brain picks ids from here;
 * unknown ids are rejected. Every entry needs a matching row in ASSET_LICENSES.md first.
 * Poly Haven starter set (CC0, realistic) added 18 Nov 2026.
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

export const ASSETS: readonly Asset[] = [
  { id: "ph_SchoolChair_01", name: "School chair", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/SchoolChair_01", look: "realistic", file: "ph/SchoolChair_01.glb", kb: 202, tags: ["classroom", "school", "furniture"] },
  { id: "ph_SchoolDesk_01", name: "School desk", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/SchoolDesk_01", look: "realistic", file: "ph/SchoolDesk_01.glb", kb: 197, tags: ["classroom", "school", "furniture"] },
  { id: "ph_alarm_clock_01", name: "Alarm clock", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/alarm_clock_01", look: "realistic", file: "ph/alarm_clock_01.glb", kb: 697, tags: ["time", "clock", "morning"] },
  { id: "ph_boulder_01", name: "Boulder", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/boulder_01", look: "realistic", file: "ph/boulder_01.glb", kb: 1452, tags: ["rocks", "nature", "geology"] },
  { id: "ph_food_apple_01", name: "Apple", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/food_apple_01", look: "realistic", file: "ph/food_apple_01.glb", kb: 234, tags: ["food", "fruit", "nature", "market"] },
  { id: "ph_jug_01", name: "Ceramic jug", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/jug_01", look: "realistic", file: "ph/jug_01.glb", kb: 179, tags: ["kitchen", "history", "container"] },
  { id: "ph_marble_bust_01", name: "Marble bust", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/marble_bust_01", look: "realistic", file: "ph/marble_bust_01.glb", kb: 505, tags: ["ancient", "rome", "greece", "history", "sculpture"] },
  { id: "ph_moon_rock_01", name: "Moon rock", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/moon_rock_01", look: "realistic", file: "ph/moon_rock_01.glb", kb: 491, tags: ["space", "moon", "rocks", "geology"] },
  { id: "ph_pocket_watch", name: "Pocket watch", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/pocket_watch", look: "realistic", file: "ph/pocket_watch.glb", kb: 500, tags: ["time", "clock", "history", "1800s"] },
  { id: "ph_potted_plant_01", name: "Potted plant", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/potted_plant_01", look: "realistic", file: "ph/potted_plant_01.glb", kb: 1442, tags: ["plants", "nature", "science"] },
  { id: "ph_rock_moss_set_01", name: "Mossy rocks", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/rock_moss_set_01", look: "realistic", file: "ph/rock_moss_set_01.glb", kb: 698, tags: ["forest", "nature", "rocks", "geology"] },
  { id: "ph_seadogs_compass", name: "Brass compass", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/seadogs_compass", look: "realistic", file: "ph/seadogs_compass.glb", kb: 524, tags: ["navigation", "explorer", "map", "direction", "history"] },
  { id: "ph_standing_chalkboard_01", name: "Standing chalkboard", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/standing_chalkboard_01", look: "realistic", file: "ph/standing_chalkboard_01.glb", kb: 232, tags: ["classroom", "school", "board"] },
  { id: "ph_tree_stump_01", name: "Tree stump", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/tree_stump_01", look: "realistic", file: "ph/tree_stump_01.glb", kb: 646, tags: ["forest", "nature", "trees"] },
  { id: "ph_vintage_grandfather_clock_01", name: "Grandfather clock", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/vintage_grandfather_clock_01", look: "realistic", file: "ph/vintage_grandfather_clock_01.glb", kb: 881, tags: ["time", "clock", "history", "1800s"] },
  { id: "ph_vintage_microscope", name: "Vintage microscope", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/vintage_microscope", look: "realistic", file: "ph/vintage_microscope.glb", kb: 915, tags: ["science", "lab", "cells"] },
  { id: "ph_vintage_oil_lamp", name: "Oil lamp", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/vintage_oil_lamp", look: "realistic", file: "ph/vintage_oil_lamp.glb", kb: 422, tags: ["history", "light", "1800s"] },
  { id: "ph_wall_clock", name: "Wall clock", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/wall_clock", look: "realistic", file: "ph/wall_clock.glb", kb: 237, tags: ["time", "clock", "classroom"] },
  { id: "ph_wicker_basket_01", name: "Wicker basket", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/wicker_basket_01", look: "realistic", file: "ph/wicker_basket_01.glb", kb: 725, tags: ["market", "container", "food"] },
  { id: "ph_wooden_bookshelf_worn", name: "Wooden bookshelf", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/wooden_bookshelf_worn", look: "realistic", file: "ph/wooden_bookshelf_worn.glb", kb: 397, tags: ["books", "library", "study", "furniture"] },
  { id: "ph_wooden_bowl_01", name: "Wooden bowl", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/wooden_bowl_01", look: "realistic", file: "ph/wooden_bowl_01.glb", kb: 388, tags: ["kitchen", "food"] },
  { id: "ph_wooden_bucket_01", name: "Wooden bucket", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/wooden_bucket_01", look: "realistic", file: "ph/wooden_bucket_01.glb", kb: 269, tags: ["water", "farm", "container"] },
  { id: "ph_wooden_crate_02", name: "Wooden crate", source: "polyhaven-cc0", sourceUrl: "https://polyhaven.com/a/wooden_crate_02", look: "realistic", file: "ph/wooden_crate_02.glb", kb: 259, tags: ["market", "container", "storage"] },
];

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
