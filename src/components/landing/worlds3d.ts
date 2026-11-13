import * as THREE from "three";
import { CHAPTERS } from "./chapters";

/**
 * Landing-only stylised worlds, built from primitives in code (no third-party
 * assets). Low poly and flat shaded on purpose: cheap on mid-range phones and
 * readable at a glance. World i sits at z = -i * SPACING along the flight path.
 *
 * Each builder returns a group plus an `update(time, near)` that animates only
 * while the world is near the camera.
 */
export const SPACING = 40;
export const worldZ = (i: number) => -i * SPACING;

export interface World { group: THREE.Group; update(t: number, near: boolean, c: number): void }

type Disposable = { dispose(): void };
export class Kit {
  readonly bin: Disposable[] = [];
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  mat(color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
    const key = color + JSON.stringify(extra);
    let m = this.mats.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...extra }); this.mats.set(key, m); this.bin.push(m); }
    return m;
  }
  geo<T extends THREE.BufferGeometry>(g: T) { this.bin.push(g); return g; }
  mesh(g: THREE.BufferGeometry, color: string, parent: THREE.Object3D, x = 0, y = 0, z = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
    const m = new THREE.Mesh(this.geo(g), this.mat(color, extra));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  dispose() { for (const d of this.bin) d.dispose(); this.bin.length = 0; this.mats.clear(); }
}

/** Deterministic pseudo-random so every visit looks the same (and tests are stable). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function ground(k: Kit, parent: THREE.Object3D, color: string, y: number, seed: number, bump = 0.6, size = 70) {
  const g = new THREE.PlaneGeometry(size, size, 22, 22);
  g.rotateX(-Math.PI / 2);
  const r = rng(seed);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    // Keep the flight corridor flat-ish, hills at the sides.
    const side = Math.min(1, Math.abs(x) / 14);
    p.setY(i, (r() - 0.5) * bump + side * side * r() * bump * 4);
    void z;
  }
  g.computeVertexNormals();
  return k.mesh(g, color, parent, 0, y, 0);
}

function palm(k: Kit, parent: THREE.Object3D, x: number, y: number, z: number, s = 1) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.scale.setScalar(s);
  parent.add(p);
  const trunk = k.mesh(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 6), "#8A5A3B", p, 0, 1.6, 0);
  trunk.rotation.z = 0.08;
  for (let i = 0; i < 6; i++) {
    const leaf = k.mesh(new THREE.ConeGeometry(0.35, 2.2, 4), "#2E8B57", p, 0, 3.2, 0);
    leaf.rotation.set(1.15, (i / 6) * Math.PI * 2, 0, "YXZ");
    leaf.translateY(1);
  }
  return p;
}

// ------------------------------------------------------------------ classroom
function classroom(k: Kit): World {
  const g = new THREE.Group();
  const floor = k.mesh(new THREE.BoxGeometry(14, 0.2, 18), "#E7C79B", g, 0, -2.3, 2);
  void floor;
  const rug = k.mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.05, 28), "#0E8A8C", g, 0, -2.18, 1.2);
  void rug;
  const wallMat = "#FFF4DD";
  const pivot = (x: number, y: number, z: number) => { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); return p; };

  // Back wall, hinged at its bottom edge so it falls away from the camera.
  const back = pivot(0, -2.2, -6);
  k.mesh(new THREE.BoxGeometry(14, 7, 0.25), wallMat, back, 0, 3.5, 0);
  const board = k.mesh(new THREE.BoxGeometry(7.2, 3, 0.1), "#1E4D3A", back, 0, 4, 0.2);
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 420;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#1E4D3A"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#F5F8FF"; ctx.font = "800 120px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Ask me anything", c.width / 2, c.height / 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  k.bin.push(tex);
  const chalk = new THREE.Mesh(k.geo(new THREE.PlaneGeometry(6.9, 2.8)), new THREE.MeshBasicMaterial({ map: tex }));
  k.bin.push(chalk.material as THREE.Material);
  chalk.position.set(0, 0, 0.06);
  board.add(chalk);
  k.mesh(new THREE.BoxGeometry(7.6, 0.25, 0.4), "#B7814E", back, 0, 2.4, 0.3);

  const left = pivot(-7, -2.2, 2), right = pivot(7, -2.2, 2);
  k.mesh(new THREE.BoxGeometry(0.25, 7, 16), wallMat, left, 0, 3.5, 0);
  k.mesh(new THREE.BoxGeometry(0.25, 7, 16), wallMat, right, 0, 3.5, 0);
  // Windows and a shelf so the side walls read as a room.
  for (const z of [-2, 4]) k.mesh(new THREE.BoxGeometry(0.1, 2.2, 2.4), "#BFE6FF", left, 0.2, 4, z);
  const shelf = k.mesh(new THREE.BoxGeometry(0.8, 3, 3), "#B7814E", right, -0.5, 1.5, -3);
  for (let i = 0; i < 6; i++) k.mesh(new THREE.BoxGeometry(0.5, 0.7, 0.18), ["#FF5E8A", "#FFB627", "#0E8A8C", "#2B59C3"][i % 4], shelf, -0.1, 0.3 + (i % 2) * 0.9, -1 + i * 0.35);
  const ceiling = k.mesh(new THREE.BoxGeometry(14, 0.2, 16), "#FFFFFF", g, 0, 4.9, 2);

  return {
    group: g,
    update(_t, _near, cc) {
      // Walls peel away during the first half of the first scroll step.
      const p = THREE.MathUtils.smoothstep(cc, 0.04, 0.55);
      back.rotation.x = -p * (Math.PI / 2);
      left.rotation.z = p * (Math.PI / 2.1);
      right.rotation.z = -p * (Math.PI / 2.1);
      ceiling.position.y = 4.9 + p * 14;
      ceiling.visible = p < 0.98;
    },
  };
}

// ---------------------------------------------------------------------- ocean
function ocean(k: Kit): World {
  const g = new THREE.Group();
  ground(k, g, "#D9C38A", -3.2, 11, 0.8);
  const r = rng(7);
  const kelp: THREE.Mesh[] = [];
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const h = 3 + r() * 4;
    const m = k.mesh(new THREE.ConeGeometry(0.18, h, 5), r() > 0.5 ? "#2E8B57" : "#3FA34D", g, side * (4 + r() * 9), -3.2 + h / 2, (r() - 0.5) * 30);
    m.userData.phase = r() * 6;
    kelp.push(m);
  }
  for (let i = 0; i < 9; i++) {
    const s = 0.5 + r() * 1.4;
    k.mesh(new THREE.DodecahedronGeometry(s, 0), "#7A8C99", g, (r() > 0.5 ? 1 : -1) * (3 + r() * 10), -3.1, (r() - 0.5) * 30).rotation.set(r(), r(), r());
  }
  // Fish: one instanced mesh, three schools circling.
  const FISH = 42;
  const fishGeo = k.geo(new THREE.ConeGeometry(0.16, 0.6, 5));
  fishGeo.rotateX(Math.PI / 2);
  const fish = new THREE.InstancedMesh(fishGeo, k.mat("#FFFFFF"), FISH);
  const palette = [new THREE.Color("#FFB627"), new THREE.Color("#FF5E8A"), new THREE.Color("#F5F8FF")];
  const seeds = Array.from({ length: FISH }, (_, i) => ({ school: i % 3, a: r() * Math.PI * 2, rad: 1 + r() * 1.6, y: (r() - 0.5) * 1.2, sp: 0.4 + r() * 0.3 }));
  seeds.forEach((s, i) => fish.setColorAt(i, palette[s.school]));
  g.add(fish);
  const centres = [new THREE.Vector3(-5, 1.6, -6), new THREE.Vector3(5.5, 0.4, -3), new THREE.Vector3(1.5, 3, -13)];
  // Bubbles.
  const BUB = 30;
  const bubbles = new THREE.InstancedMesh(k.geo(new THREE.SphereGeometry(0.08, 8, 6)), k.mat("#E6FBFF", { transparent: true, opacity: 0.75, flatShading: false, emissive: "#9FE7FF", emissiveIntensity: 0.4 }), BUB);
  const bseed = Array.from({ length: BUB }, () => ({ x: (r() - 0.5) * 16, z: (r() - 0.5) * 24, o: r() * 7 }));
  g.add(bubbles);
  // A friendly whale far off.
  const whale = new THREE.Group();
  whale.position.set(-9, 3.5, -16);
  g.add(whale);
  const body = k.mesh(new THREE.SphereGeometry(1, 10, 8), "#2B59C3", whale);
  body.scale.set(3.6, 1.3, 1.5);
  const tail = k.mesh(new THREE.ConeGeometry(0.9, 1.6, 4), "#2B59C3", whale, 3.9, 0.2, 0);
  tail.rotation.z = Math.PI / 2;
  k.mesh(new THREE.SphereGeometry(1, 10, 8), "#F5F8FF", whale, 0, -0.55, 0).scale.set(3, 0.6, 1.2);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  return {
    group: g,
    update(t, near) {
      if (!near) return;
      for (const m of kelp) m.rotation.z = Math.sin(t * 0.9 + m.userData.phase) * 0.12;
      seeds.forEach((s, i) => {
        const c = centres[s.school];
        const a = s.a + t * s.sp;
        v.set(c.x + Math.cos(a) * s.rad * 2, c.y + s.y + Math.sin(t + i) * 0.1, c.z + Math.sin(a) * s.rad);
        q.setFromAxisAngle(up, -a);
        m4.compose(v, q, one);
        fish.setMatrixAt(i, m4);
      });
      fish.instanceMatrix.needsUpdate = true;
      bseed.forEach((b, i) => {
        v.set(b.x + Math.sin(t + i) * 0.2, -3 + ((t * 0.8 + b.o) % 8), b.z);
        m4.compose(v, q.identity(), one);
        bubbles.setMatrixAt(i, m4);
      });
      bubbles.instanceMatrix.needsUpdate = true;
      whale.position.x = -9 + Math.sin(t * 0.15) * 3;
      tail.rotation.y = Math.sin(t * 1.5) * 0.4;
    },
  };
}

// ------------------------------------------------------------ inside a leaf cell
function cell(k: Kit): World {
  const g = new THREE.Group();
  const r = rng(23);
  // Cell wall: a big soft box seen from inside.
  // Seen from inside only: hidden until the camera has entered, so it never shows as a box from the ocean.
  const wall = k.mesh(new THREE.BoxGeometry(30, 16, 44, 2, 2, 2), "#9BD37A", g, 0, 1, -2, { side: THREE.BackSide, flatShading: false, roughness: 1 });
  const nucleus = k.mesh(new THREE.IcosahedronGeometry(2.4, 2), "#8E6CCF", g, -6, 2.5, -8);
  k.mesh(new THREE.IcosahedronGeometry(0.9, 1), "#5B3FA6", nucleus, 0.6, 0.4, 1.7);
  const vacuole = k.mesh(new THREE.SphereGeometry(4.2, 20, 14), "#CFF3FF", g, 7, 1.5, -12, { transparent: true, opacity: 0.35, flatShading: false });
  void vacuole;
  const drifting: THREE.Object3D[] = [];
  for (let i = 0; i < 16; i++) {
    const cp = new THREE.Group();
    cp.position.set((r() - 0.5) * 22, -3 + r() * 9, -18 + r() * 34);
    g.add(cp);
    const b = k.mesh(new THREE.SphereGeometry(0.7, 10, 8), "#3FA34D", cp);
    b.scale.set(1.5, 0.75, 0.75);
    for (let j = -1; j <= 1; j++) k.mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 10), "#7BD389", cp, j * 0.38, 0, 0).rotation.z = Math.PI / 2;
    cp.rotation.set(r() * 3, r() * 3, r() * 3);
    cp.userData = { phase: r() * 6, spin: 0.2 + r() * 0.4 };
    drifting.push(cp);
  }
  for (let i = 0; i < 6; i++) {
    const m = k.mesh(new THREE.CapsuleGeometry(0.35, 1, 4, 8), "#F28C38", g, (r() - 0.5) * 18, -2 + r() * 7, -14 + r() * 26);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.userData = { phase: r() * 6, spin: 0.3 };
    drifting.push(m);
  }
  const PTS = 260;
  const pos = new Float32Array(PTS * 3);
  for (let i = 0; i < PTS; i++) { pos[i * 3] = (r() - 0.5) * 26; pos[i * 3 + 1] = -5 + r() * 12; pos[i * 3 + 2] = -20 + r() * 40; }
  const pg = k.geo(new THREE.BufferGeometry());
  pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({ color: "#E8FFD6", size: 0.09, transparent: true, opacity: 0.8 });
  k.bin.push(pm);
  g.add(new THREE.Points(pg, pm));
  return {
    group: g,
    update(t, near, cc) {
      wall.visible = cc > 1.72 && cc < 2.75;
      if (!near) return;
      for (const d of drifting) {
        d.rotation.y += 0.003 * d.userData.spin * 10;
        d.position.y += Math.sin(t * 0.6 + d.userData.phase) * 0.004;
      }
      nucleus.rotation.y = t * 0.1;
    },
  };
}

// ------------------------------------------------------------- dinosaur valley
function dino(k: Kit): World {
  const g = new THREE.Group();
  const r = rng(41);
  ground(k, g, "#7FA650", -3.2, 5, 1);
  const volcano = k.mesh(new THREE.ConeGeometry(7, 9, 9), "#6B4F3A", g, -14, 1.2, -18);
  void volcano;
  const lava = k.mesh(new THREE.ConeGeometry(1.6, 1.2, 9), "#FF6A3D", g, -14, 5.3, -18, { emissive: "#FF6A3D", emissiveIntensity: 0.8 });
  for (let i = 0; i < 7; i++) palm(k, g, (i % 2 ? 1 : -1) * (5 + r() * 9), -3.2, -14 + r() * 26, 0.8 + r() * 0.5);
  for (let i = 0; i < 6; i++) k.mesh(new THREE.IcosahedronGeometry(2 + r() * 3, 0), "#5E8C3A", g, (i % 2 ? 1 : -1) * (14 + r() * 6), -3.5, -16 + r() * 30);

  // A long-necked dinosaur, built from simple shapes. Not any real reconstruction; a friendly stylisation.
  const dinoG = new THREE.Group();
  dinoG.position.set(7, -3.2, -9);
  dinoG.rotation.y = -0.6;
  g.add(dinoG);
  const skin = "#4E8F7A";
  const body = k.mesh(new THREE.SphereGeometry(1, 12, 10), skin, dinoG, 0, 3.4, 0);
  body.scale.set(3, 1.6, 1.5);
  const neck = new THREE.Group();
  neck.position.set(-2.4, 4, 0);
  dinoG.add(neck);
  const neckM = k.mesh(new THREE.CylinderGeometry(0.35, 0.6, 6, 8), skin, neck, 0, 3, 0);
  void neckM;
  neck.rotation.z = 0.55;
  const head = k.mesh(new THREE.SphereGeometry(0.6, 10, 8), skin, neck, -0.2, 6.2, 0);
  head.scale.set(1.5, 0.8, 0.8);
  k.mesh(new THREE.SphereGeometry(0.1, 6, 6), "#14213D", head, -0.25, 0.25, 0.45);
  k.mesh(new THREE.SphereGeometry(0.1, 6, 6), "#14213D", head, -0.25, 0.25, -0.45);
  const tail = k.mesh(new THREE.ConeGeometry(0.8, 7, 8), skin, dinoG, 5.2, 3.2, 0);
  tail.rotation.z = Math.PI / 2 + 0.15;
  for (const [x, z] of [[-1.6, 0.8], [-1.6, -0.8], [1.6, 0.8], [1.6, -0.8]]) k.mesh(new THREE.CylinderGeometry(0.45, 0.5, 2.6, 7), skin, dinoG, x, 1.3, z);
  // Spots.
  for (let i = 0; i < 7; i++) k.mesh(new THREE.SphereGeometry(0.28, 6, 5), "#3B7564", dinoG, -1.8 + i * 0.6, 4.75, (r() - 0.5) * 1.2);

  return {
    group: g,
    update(t, near) {
      if (!near) return;
      neck.rotation.z = 0.55 + Math.sin(t * 0.5) * 0.08;
      tail.rotation.y = Math.sin(t * 0.7) * 0.15;
      (lava.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7 + Math.sin(t * 2) * 0.25;
    },
  };
}

// -------------------------------------------------------------- ancient city
function city(k: Kit): World {
  const g = new THREE.Group();
  const r = rng(59);
  ground(k, g, "#E0C27A", -3.2, 3, 0.4);
  const pyramid = new THREE.Group();
  pyramid.position.set(-9, -3.2, -12);
  g.add(pyramid);
  for (let i = 0; i < 7; i++) {
    const s = 10 - i * 1.35;
    k.mesh(new THREE.BoxGeometry(s, 1.1, s), i % 2 ? "#D9A441" : "#C8913A", pyramid, 0, 0.55 + i * 1.1, 0);
  }
  k.mesh(new THREE.BoxGeometry(1.6, 1, 1.6), "#FFB627", pyramid, 0, 8.2, 0, { emissive: "#FFB627", emissiveIntensity: 0.3 });
  // Stairs up the front face.
  for (let i = 0; i < 7; i++) k.mesh(new THREE.BoxGeometry(1.4, 0.3, 0.6), "#F0D9A0", pyramid, 0, 0.2 + i * 1.1, 5 - i * 0.68);
  // A row of columns with a lintel.
  for (let i = 0; i < 6; i++) {
    k.mesh(new THREE.CylinderGeometry(0.35, 0.42, 5, 8), "#F3E3BD", g, 6, -0.7, 4 - i * 3);
    k.mesh(new THREE.BoxGeometry(1, 0.35, 1), "#E2CC97", g, 6, 1.9, 4 - i * 3);
  }
  k.mesh(new THREE.BoxGeometry(1.2, 0.6, 16.5), "#E2CC97", g, 6, 2.35, -3.5);
  const obelisk = k.mesh(new THREE.CylinderGeometry(0.3, 0.6, 7, 4), "#CDAE6E", g, 2.5, 0.3, -18);
  obelisk.rotation.y = Math.PI / 4;
  for (let i = 0; i < 4; i++) palm(k, g, -3 + r() * 2 * (i % 2 ? 1 : -1) + (i % 2 ? 9 : -2), -3.2, -2 + i * -5, 0.9);
  const sun = k.mesh(new THREE.CircleGeometry(4, 24), "#FFE7A3", g, 4, 9, -26, { emissive: "#FFE7A3", emissiveIntensity: 0.6, flatShading: false });
  void sun;
  return { group: g, update() {} };
}

// ------------------------------------------------------------- fraction island
function numbers(k: Kit): World {
  const g = new THREE.Group();
  const r = rng(71);
  const island = k.mesh(new THREE.CylinderGeometry(9, 6, 2, 10), "#FFD27A", g, 0, -4.2, -6);
  void island;
  const pie = new THREE.Group();
  pie.position.set(-3, 0.6, -4);
  pie.rotation.x = 0.9;
  g.add(pie);
  const colours = ["#FFB627", "#FF5E8A", "#74C365", "#F5F8FF"];
  const slices: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const s = k.mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.5, 16, 1, false, (i * Math.PI) / 2, Math.PI / 2), colours[i], pie);
    s.userData.dir = new THREE.Vector3(Math.sin((i + 0.5) * Math.PI / 2), 0, Math.cos((i + 0.5) * Math.PI / 2));
    slices.push(s);
  }
  const halves = new THREE.Group();
  halves.position.set(4.5, 2.4, -9);
  halves.rotation.x = 0.8;
  g.add(halves);
  const h1 = k.mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.45, 16, 1, false, 0, Math.PI), "#FFB627", halves);
  const h2 = k.mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.45, 16, 1, false, Math.PI, Math.PI), "#FF5E8A", halves);
  // A fraction bar: eight blocks, three lit.
  const bar = new THREE.Group();
  bar.position.set(-1, -2.4, 1);
  g.add(bar);
  for (let i = 0; i < 8; i++) k.mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), i < 3 ? "#74C365" : "#F5F8FF", bar, (i - 3.5) * 0.78, 0, 0);
  // Floating number tiles drawn to small canvases.
  const tiles: THREE.Sprite[] = [];
  for (const [txt, x, y, z] of [["1/2", 6, 4.5, -14], ["1/4", -7, 3.2, -10], ["3/4", -5, 5.5, -16], ["+", 2, 5, -6], ["=", 8, 1.5, -4]] as const) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 256;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#F5F8FF"; ctx.beginPath(); ctx.roundRect(8, 8, 240, 240, 48); ctx.fill();
      ctx.fillStyle = "#2B59C3"; ctx.font = "800 104px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, 128, 136);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex });
    k.bin.push(tex, mat);
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z);
    sp.scale.setScalar(1.8);
    sp.userData.phase = r() * 6;
    g.add(sp);
    tiles.push(sp);
  }
  const cubes: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const m = k.mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), colours[i % 4], g, (r() - 0.5) * 18, r() * 6 - 1, -16 + r() * 20);
    m.userData.phase = r() * 6;
    cubes.push(m);
  }
  return {
    group: g,
    update(t, near) {
      if (!near) return;
      const open = (Math.sin(t * 0.8) + 1) * 0.35;
      for (const s of slices) s.position.copy(s.userData.dir).multiplyScalar(open);
      pie.rotation.z = t * 0.2;
      h1.position.x = -0.2 - open * 0.6; h2.position.x = 0.2 + open * 0.6;
      halves.rotation.y = t * 0.3;
      for (const tl of tiles) tl.position.y += Math.sin(t + tl.userData.phase) * 0.003;
      for (const cb of cubes) { cb.rotation.x = t * 0.4 + cb.userData.phase; cb.rotation.y = t * 0.3; }
    },
  };
}

// ---------------------------------------------------------------------- space
function space(k: Kit): World {
  const g = new THREE.Group();
  const r = rng(97);
  const N = 700;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = 30 + r() * 30;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(th) * s * rad; pos[i * 3 + 1] = u * rad; pos[i * 3 + 2] = Math.sin(th) * s * rad;
  }
  const pg = k.geo(new THREE.BufferGeometry());
  pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({ color: "#FFFFFF", size: 0.25, sizeAttenuation: true });
  k.bin.push(pm);
  const stars = new THREE.Points(pg, pm);
  g.add(stars);
  const planet = new THREE.Group();
  planet.position.set(-8, 3, -18);
  g.add(planet);
  k.mesh(new THREE.IcosahedronGeometry(5, 2), "#FF5E8A", planet);
  const ring = k.mesh(new THREE.RingGeometry(6.4, 9, 40), "#FFD27A", planet, 0, 0, 0, { side: THREE.DoubleSide, flatShading: false });
  ring.rotation.x = 1.25;
  const moon = k.mesh(new THREE.IcosahedronGeometry(1.4, 1), "#C9CED8", g, 7, 4.5, -8);
  const earth = k.mesh(new THREE.IcosahedronGeometry(2.2, 2), "#2B59C3", g, -1, -5.5, -24);
  for (let i = 0; i < 5; i++) k.mesh(new THREE.IcosahedronGeometry(0.8 + r() * 0.6, 0), "#74C365", earth, (r() - 0.5) * 2.4, (r() - 0.5) * 2.4, 1.6 + r() * 0.4);
  return {
    group: g,
    update(t, near) {
      if (!near) return;
      planet.rotation.y = t * 0.05;
      moon.position.y = 4.5 + Math.sin(t * 0.4) * 0.4;
      earth.rotation.y = t * 0.15;
      stars.rotation.y = t * 0.005;
    },
  };
}

const BUILDERS = { classroom, ocean, cell, dino, city, numbers, space } as const;

export function buildWorlds(k: Kit): World[] {
  return CHAPTERS.map((ch, i) => {
    const w = BUILDERS[ch.id](k);
    w.group.position.z = worldZ(i);
    w.group.name = `world_${ch.id}`;
    return w;
  });
}
