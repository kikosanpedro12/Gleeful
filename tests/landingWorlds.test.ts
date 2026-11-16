import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";

// The worlds draw name tags on canvases; in node a canvas without a 2D context is enough.
const realDoc = (globalThis as { document?: unknown }).document;
beforeAll(() => {
  (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
});
afterAll(() => { (globalThis as { document?: unknown }).document = realDoc; });

async function worlds() {
  const { Kit, buildWorlds } = await import("../src/components/landing/worlds3d");
  const { CHAPTERS } = await import("../src/components/landing/chapters");
  const k = new Kit();
  const ws = buildWorlds(k);
  const at = (id: string) => CHAPTERS.findIndex((c) => c.id === id);
  return { ws, at, k };
}
const tags = (g: THREE.Object3D) => g.children.filter((o) => o.name.startsWith("label_")).map((o) => o.name.slice(6));

describe("landing worlds read as real things", () => {
  it("names the parts of the leaf cell, including the mitochondria (not carrots)", async () => {
    const { ws, at } = await worlds();
    expect(tags(ws[at("cell")].group)).toEqual(expect.arrayContaining(["nucleus", "vacuole", "chloroplast", "mitochondrion"]));
  });

  it("names Saturn, the Moon and Earth in space", async () => {
    const { ws, at } = await worlds();
    expect(tags(ws[at("space")].group)).toEqual(expect.arrayContaining(["Saturn, not to scale", "Moon, not to scale", "Earth"]));
  });

  it("shows a world's tags only while that world is on screen", async () => {
    const { ws, at } = await worlds();
    const i = at("cell");
    const cell = ws[i];
    const visible = () => cell.group.children.filter((o) => o.name.startsWith("label_")).every((o) => o.visible);
    const hidden = () => cell.group.children.filter((o) => o.name.startsWith("label_")).every((o) => !o.visible);
    cell.update(0, true, i);
    expect(visible()).toBe(true);
    cell.update(0, true, i - 1);
    expect(hidden()).toBe(true);
    cell.update(0, true, i + 1);
    expect(hidden()).toBe(true);
  });

  it("keeps every tag readable in fog and dark, drawn on top so a drifting part can't half-cover it", async () => {
    const { ws } = await worlds();
    for (const w of ws) for (const o of w.group.children) {
      if (!o.name.startsWith("label_")) continue;
      const m = (o as THREE.Sprite).material;
      expect(m.fog).toBe(false);
      expect(m.depthTest).toBe(false);
    }
  });

  it("puts every geometry, material and tag texture in the bin, so dispose frees them", async () => {
    const { ws, k } = await worlds();
    const bin = new Set<unknown>(k.bin);
    const missing: string[] = [];
    for (const w of ws) w.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !(o instanceof THREE.Sprite) && !bin.has(m.geometry)) missing.push(`${w.group.name}:${o.type} geometry`);
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mt of mats) {
        if (!bin.has(mt)) missing.push(`${w.group.name}:${o.type} material`);
        const map = (mt as THREE.SpriteMaterial).map;
        if (map && !bin.has(map)) missing.push(`${w.group.name}:${o.type} texture`);
      }
    });
    expect(missing).toEqual([]);
  });

  it("stays cheap on mid-range phones: a draw-call budget per world", async () => {
    const { ws } = await worlds();
    for (const w of ws) {
      let calls = 0, transparent = 0;
      w.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if ((m as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) {
          calls++;
          const mat = Array.isArray(m.material) ? m.material[0] : m.material;
          if (mat?.transparent) transparent++;
        }
      });
      expect(calls, `${w.group.name} draw calls`).toBeLessThanOrEqual(90);
      expect(transparent, `${w.group.name} transparent`).toBeLessThanOrEqual(30);
    }
  });

  it("gives the fish a tail fin that widens toward the back, not a spike", async () => {
    const { ws, at } = await worlds();
    let fish: THREE.InstancedMesh | undefined;
    ws[at("ocean")].group.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count === 42) fish = o as THREE.InstancedMesh; });
    expect(fish).toBeDefined();
    const p = fish!.geometry.getAttribute("position");
    // Height of the shape near the very back versus just behind the body.
    let back = 0, neck = 0;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), y = Math.abs(p.getY(i));
      if (z < -0.68) back = Math.max(back, y);
      else if (z < -0.4 && z > -0.5) neck = Math.max(neck, y);
    }
    expect(back).toBeGreaterThan(neck);
  });

  it("hides a tag that would be cut off at the edge or fall behind the phone headline card", async () => {
    const { ws, at } = await worlds();
    const { fitTags } = await import("../src/components/landing/worlds3d");
    const g = ws[at("space")].group;
    const cam = new THREE.PerspectiveCamera(62, 390 / 844, 0.1, 200);
    const tag = g.children.find((o) => o.name === "label_Earth")!;
    g.updateMatrixWorld(true);
    tag.getWorldPosition(cam.position);
    const aim = cam.position.clone();
    cam.position.z += 12;
    // The Earth tag in the upper middle of the phone screen: kept.
    cam.lookAt(aim.clone().add(new THREE.Vector3(0, -1.5, 0))); cam.updateMatrixWorld(); tag.visible = true;
    fitTags(g, cam, true);
    expect(tag.visible).toBe(true);
    // Turned so the tag sits at the right edge: hidden, not clipped.
    cam.lookAt(aim.clone().add(new THREE.Vector3(-4, -1.5, 0))); cam.updateMatrixWorld(); tag.visible = true;
    fitTags(g, cam, true);
    expect(tag.visible).toBe(false);
    // Tag in the lower half of a phone screen: hidden behind the card.
    cam.lookAt(aim.clone().add(new THREE.Vector3(0, 2.5, 0))); cam.updateMatrixWorld(); tag.visible = true;
    fitTags(g, cam, true);
    expect(tag.visible).toBe(false);
  });

  it("hides a tag that would sit on Leo or Mia", async () => {
    const { ws, at } = await worlds();
    const { fitTags } = await import("../src/components/landing/worlds3d");
    const g = ws[at("space")].group;
    const cam = new THREE.PerspectiveCamera(46, 1280 / 800, 0.1, 200);
    const tag = g.children.find((o) => o.name === "label_Earth")!;
    g.updateMatrixWorld(true);
    tag.getWorldPosition(cam.position);
    const aim = cam.position.clone();
    cam.position.z += 12;
    cam.lookAt(aim.clone().add(new THREE.Vector3(0, -1.5, 0))); cam.updateMatrixWorld();
    tag.visible = true;
    fitTags(g, cam, false, [{ x0: -0.9, x1: -0.8, y0: -0.9, y1: -0.8 }]);
    expect(tag.visible).toBe(true);
    tag.visible = true;
    fitTags(g, cam, false, [{ x0: -0.2, x1: 0.2, y0: -0.2, y1: 0.6 }]);
    expect(tag.visible).toBe(false);
  });
});
