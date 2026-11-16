import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";

// Name-tag checks from the camera pose HeroScene uses at the centre of each chapter
// (copied constants: CAM_BACK 8, SPACING 40, fov 46 / 62, fog 12..46). They fail when a
// key tag (including a caveat) is hidden at rest on a phone or a laptop, when a tag is not
// right above the part it names (the desktop leaf once printed "mitochondrion" on the
// nucleus), when a tag stops following its drifting part, or when it names something the
// fog has mostly hidden.

const realDoc = (globalThis as { document?: unknown }).document;
beforeAll(() => {
  (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
});
afterAll(() => { (globalThis as { document?: unknown }).document = realDoc; });

const CAM_BACK = 8, FOG_NEAR = 12, FOG_FAR = 46;
const VIEWS = [
  { name: "desktop 1280x800", w: 1280, h: 800 },
  { name: "phone 390x844", w: 390, h: 844 },
];

function cameraAt(cc: number, w: number, h: number) {
  const portrait = w / h < 0.85;
  const cam = new THREE.PerspectiveCamera(portrait ? 62 : 46, w / h, 0.1, 140);
  const camZ = CAM_BACK - cc * 40;
  cam.position.set(Math.sin(cc * 1.7) * 0.6, 0.5, camZ);
  cam.lookAt(Math.sin(cc * 1.7 + 0.4) * 0.4, 0.1, camZ - 10);
  cam.updateMatrixWorld();
  return { cam, portrait };
}

async function setup() {
  const { Kit, buildWorlds, fitTags, screenRect } = await import("../src/components/landing/worlds3d");
  const { buildTeacher, LOOKS } = await import("../src/lib/teacher/rig");
  const k = new Kit();
  const ws = buildWorlds(k);
  const leo = buildTeacher(LOOKS.leo), mia = buildTeacher(LOOKS.mia);
  return { ws, fitTags, screenRect, leo, mia };
}

// Where HeroScene puts Leo and Mia once flying (t = 0), and their screen boxes.
function placeTeachers(cam: THREE.PerspectiveCamera, portrait: boolean, leo: { root: THREE.Object3D }, mia: { root: THREE.Object3D }) {
  const xs = portrait ? [-0.6, 0.62] : [1.5, 3.1];
  [leo, mia].forEach((rig, kk) => rig.root.position.set(cam.position.x + xs[kk], (portrait ? -0.8 : -1.3) + Math.sin(kk * 1.3) * 0.12, cam.position.z - (kk === 0 ? 6.4 : 6.0)));
  leo.root.updateMatrixWorld(true); mia.root.updateMatrixWorld(true);
}

// The tags a child most needs on each world, which must show at the chapter's resting view on both screens.
const MUST_SHOW: Record<string, string[]> = {
  world_cell: ["label_chloroplast", "label_mitochondrion"],
  world_space: ["label_Earth", "label_Moon, not to scale"], // the Moon tag carries the distance caveat
};

describe("landing name tags, seen from the real chapter camera", () => {
  for (const v of VIEWS) {
    it(`each tag sits right above the part it names, and the key tags show (${v.name})`, async () => {
      const { ws, fitTags, screenRect, leo, mia } = await setup();
      const bad: string[] = [];
      ws.forEach((w, i) => {
        const tags = w.group.children.filter((o) => o.name.startsWith("label_")) as THREE.Sprite[];
        if (!tags.length) return;
        const { cam, portrait } = cameraAt(i, v.w, v.h);
        placeTeachers(cam, portrait, leo, mia);
        w.update(0, true, i);
        w.group.updateMatrixWorld(true);
        const box = new THREE.Box3();
        fitTags(w.group, cam, portrait, [leo, mia].map((r) => screenRect(box.setFromObject(r.root), cam)));
        for (const name of MUST_SHOW[w.group.name] ?? []) {
          const t = tags.find((x) => x.name === name);
          if (!t?.visible) bad.push(`${w.group.name} ${name} hidden at rest`);
        }
        const p = new THREE.Vector3(), q = new THREE.Vector3();
        for (const tag of tags) {
          const f = tag.userData.follow as THREE.Object3D | undefined;
          if (!f || !tag.visible) continue;
          tag.getWorldPosition(p).project(cam);
          f.getWorldPosition(q).project(cam);
          // The part is under the tag: same column, and a short way below it.
          if (Math.abs(p.x - q.x) > 0.06 || p.y <= q.y || p.y - q.y > 0.3) bad.push(`${w.group.name} ${tag.name} is not right above its part (tag ${p.x.toFixed(2)},${p.y.toFixed(2)} part ${q.x.toFixed(2)},${q.y.toFixed(2)})`);
        }
      });
      expect(bad).toEqual([]);
    });
  }

  it("a tag still follows its part after the part drifts", async () => {
    const { ws } = await setup();
    const cell = ws.find((w) => w.group.name === "world_cell")!;
    const tag = cell.group.children.find((o) => o.name === "label_chloroplast")!;
    const part = tag.userData.follow as THREE.Object3D;
    for (let t = 0; t < 200; t += 1) cell.update(t * 0.016, true, 2);
    expect(tag.position.x).toBeCloseTo(part.position.x);
    expect(tag.position.y - part.position.y).toBeCloseTo(tag.userData.dy as number);
  });

  it("every tag names something the fog leaves mostly visible at its chapter", async () => {    const { ws } = await setup();
    const fogged: string[] = [];
    const half = FOG_NEAR + (FOG_FAR - FOG_NEAR) / 2;
    ws.forEach((w, i) => {
      const { cam } = cameraAt(i, 1280, 800);
      w.group.updateMatrixWorld(true);
      const p = new THREE.Vector3();
      for (const o of w.group.children) {
        if (!o.name.startsWith("label_")) continue;
        const d = o.getWorldPosition(p).distanceTo(cam.position);
        if (d > half) fogged.push(`${w.group.name} ${o.name} is ${d.toFixed(1)} away (fog over half at ${half})`);
      }
    });
    expect(fogged).toEqual([]);
  });
});
