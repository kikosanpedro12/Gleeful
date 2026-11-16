import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";

// Tester (16 Nov): the first cut of the leaf put "chloroplast" on a mitochondrion and
// "mitochondrion" over the nucleus. landingTagsView checks a tag sits above *its* part,
// but not that the part is the kind the tag names: swapping the two follow targets, or
// moving the nucleus tag over the vacuole, still passed. This checks identity: each cell
// tag is right above a part of the kind it names (found by that part's colour), and that
// the nearest named part under the tag is that kind.

const realDoc = (globalThis as { document?: unknown }).document;
beforeAll(() => {
  (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
});
afterAll(() => { (globalThis as { document?: unknown }).document = realDoc; });

// Colour of each named part's outer mesh in worlds3d.ts cell().
const KIND: Record<string, string> = {
  label_nucleus: "8e6ccf",
  label_vacuole: "cff3ff",
  label_chloroplast: "3fa34d",
  label_mitochondrion: "f7a35c",
};

function colourOf(o: THREE.Object3D) {
  const m = o as THREE.Mesh;
  if (!m.isMesh) return "";
  const mt = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
  return mt.color ? mt.color.getHexString() : "";
}

describe("cell name tags name the right kind of part", () => {
  it("each tag's nearest named part below it is the kind it names", async () => {
    const { Kit, buildWorlds } = await import("../src/components/landing/worlds3d");
    const ws = buildWorlds(new Kit());
    const cell = ws.find((w) => w.group.name === "world_cell")!;
    const i = ws.indexOf(cell);
    cell.update(0, true, i);
    cell.group.updateMatrixWorld(true);
    const parts: { kind: string; at: THREE.Vector3 }[] = [];
    cell.group.traverse((o) => {
      const c = colourOf(o);
      for (const [tag, col] of Object.entries(KIND)) if (c === col) parts.push({ kind: tag, at: o.getWorldPosition(new THREE.Vector3()) });
    });
    const bad: string[] = [];
    for (const tag of cell.group.children.filter((o) => o.name in KIND)) {
      const p = tag.getWorldPosition(new THREE.Vector3());
      // Named parts below the tag, ranked by distance in x/z and how far below.
      const below = parts.filter((q) => q.at.y < p.y).map((q) => ({ ...q, d: Math.hypot(q.at.x - p.x, q.at.z - p.z) + (p.y - q.at.y) * 0.25 })).sort((a, b) => a.d - b.d);
      if (!below.length || below[0].kind !== tag.name) bad.push(`${tag.name} is nearest to a ${below[0]?.kind.slice(6) ?? "nothing"}`);
    }
    expect(bad).toEqual([]);
  });
});
