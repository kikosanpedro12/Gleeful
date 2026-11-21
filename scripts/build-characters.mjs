// Builds the shippable Leo and Mia from the raw Tripo exports (rigged T-pose meshes + one animated copy of Leo).
//
//   node scripts/build-characters.mjs [srcDir=/home/claude/rig-src] [outDir=public/assets/characters]
//
// Writes  leo.glb, mia.glb  (mesh + skin + one 1024px JPEG, quantized; no animation)
//         clips.glb         (skeleton + the clips only; retargeted onto each character by bone name at runtime)
//
// Rules (see docs/ARCHITECTURE.md "GLB characters"):
//  - Needs @gltf-transform/{core,extensions,functions} and sharp (already used by scripts/shrink-glb.mjs).
//  - NO meshopt/draco compression: the decoders are WebAssembly and our CSP has no 'wasm-unsafe-eval'. Quantization only.
//  - NO simplification: the meshes are only ~18k triangles, and any simplify risks tearing skin weights and UV seams.
//  - Skin weights and joints must survive (checked below; the script exits 1 if not).
//  - Budgets: character <= 900 KB, clips <= 1.2 MB (CAPS below; tests/characters.test.ts checks the written files).
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { quantize, textureCompress, prune, dedup } from "@gltf-transform/functions";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.resolve(process.argv[2] || process.env.CHAR_SRC || "/home/claude/rig-src");
const OUT = path.resolve(ROOT, process.argv[3] || "public/assets/characters");
import { CAPS, CLIPS } from "./characters-config.mjs";
const ROT_TOL = 0.0012; // radians: a key is dropped when slerp between its neighbours is this close (0.07 degrees)
const POS_TOL = 0.0004; // metres in the 0.98 m source scale
const REST_TOL = 0.002; // radians: a constant track this close to the rest pose is not stored

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const kb = (n) => (n / 1024).toFixed(0) + " KB";
let failed = false;
const fail = (m) => { failed = true; console.error("FAIL: " + m); };

// ------------------------------------------------------------------------------------------ quaternion helpers
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
function slerp(a, b, t) {
  let d = dot(a, b), bb = b;
  if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) { const r = a.map((v, i) => v + (bb[i] - v) * t); const n = Math.hypot(...r); return r.map((v) => v / n); }
  const th = Math.acos(d), s = Math.sin(th), w1 = Math.sin((1 - t) * th) / s, w2 = Math.sin(t * th) / s;
  return a.map((v, i) => v * w1 + bb[i] * w2);
}
const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(dot(a, b))));

/** Ramer-Douglas-Peucker over time: keep the keys a straight (slerp/lerp) line between neighbours would miss. */
function reduceKeys(times, vals, size, tol) {
  const n = times.length, keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const get = (i) => Array.from(vals.subarray(i * size, i * size + size));
  const rec = (i, j) => {
    if (j - i < 2) return;
    let worst = 0, wk = -1;
    const a = get(i), b = get(j);
    for (let k = i + 1; k < j; k++) {
      const t = (times[k] - times[i]) / (times[j] - times[i] || 1);
      const q = get(k);
      const e = size === 4 ? angle(slerp(a, b, t), q) : Math.hypot(...q.map((v, c) => v - (a[c] + (b[c] - a[c]) * t)));
      if (e > worst) { worst = e; wk = k; }
    }
    if (worst > tol) { keep[wk] = 1; rec(i, wk); rec(wk, j); }
  };
  rec(0, n - 1);
  const idx = [...keep.keys()].filter((i) => keep[i]);
  const T = new Float32Array(idx.length), V = new Float32Array(idx.length * size);
  idx.forEach((i, o) => { T[o] = times[i]; V.set(vals.subarray(i * size, i * size + size), o * size); });
  return [T, V];
}

// ------------------------------------------------------------------------------------------ clips.glb
async function buildClips() {
  const src = await io.read(path.join(SRC, "leo_anim.glb"));
  const root = src.getRoot();
  const names = root.listAnimations().map((a) => a.getName());
  for (const want of Object.keys(CLIPS)) if (!names.includes(want)) fail(`clip ${want} missing from leo_anim.glb (has ${names.join(", ")})`);
  for (const have of names) if (!(have in CLIPS)) console.log(`note: source clip ${have} is not shipped`);

  const out = new Document();
  const buf = out.createBuffer();
  const scene = out.createScene("skeleton");
  const clone = new Map();
  const skel = root.getDefaultScene().listChildren().find((n) => n.getName() === "Armature");
  const copy = (n, parent) => {
    const c = out.createNode(n.getName()).setTranslation(n.getTranslation()).setRotation(n.getRotation()).setScale(n.getScale());
    clone.set(n.getName(), c);
    if (parent) parent.addChild(c); else scene.addChild(c);
    for (const k of n.listChildren()) if (!k.getMesh()) copy(k, c);
  };
  copy(skel, null);
  const rest = (name) => src.getRoot().listNodes().find((n) => n.getName() === name);
  const stats = { dropped: 0, kept: 0, maxTransDev: 0, maxScaleDev: 0 };

  for (const anim of root.listAnimations()) {
    const cfg = CLIPS[anim.getName()];
    if (!cfg) continue;
    const o = out.createAnimation(anim.getName());
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode(), name = node.getName(), p = ch.getTargetPath(), s = ch.getSampler();
      const T0 = s.getInput().getArray(), V0 = s.getOutput().getArray();
      const size = p === "rotation" ? 4 : 3;
      // Slice to [start, end] and shift to 0.
      const start = cfg.start ?? 0, end = cfg.end ?? Infinity;
      const ids = []; for (let i = 0; i < T0.length; i++) if (T0[i] >= start - 1e-4 && T0[i] <= end + 1e-4) ids.push(i);
      let times = Float32Array.from(ids, (i) => T0[i] - T0[ids[0]]);
      let vals = new Float32Array(ids.length * size); ids.forEach((i, o) => vals.set(V0.subarray(i * size, i * size + size), o * size));
      const r = rest(name);
      if (p === "scale") {
        for (let i = 0; i < vals.length; i++) stats.maxScaleDev = Math.max(stats.maxScaleDev, Math.abs(vals[i] - 1));
        stats.dropped++; continue; // bones are never scaled
      }
      if (p === "translation") {
        const rt = r.getTranslation();
        if (name !== "mixamorig:Hips") {
          for (let i = 0; i < vals.length; i++) stats.maxTransDev = Math.max(stats.maxTransDev, Math.abs(vals[i] - rt[i % 3]));
          stats.dropped++; continue; // fixed bone lengths; only the hips move
        }
        // In place: drop the clip's horizontal drift/offset (the run clip is held 0.43 m ahead of the origin).
        let mx = 0, mz = 0; for (let i = 0; i < times.length; i++) { mx += vals[i * 3]; mz += vals[i * 3 + 2]; }
        mx /= times.length; mz /= times.length;
        for (let i = 0; i < times.length; i++) { vals[i * 3] += rt[0] - mx; vals[i * 3 + 2] += rt[2] - mz; }
        if (cfg.flattenRise) {
          // y(t) minus its linear trend from first to last key, plus the first key's height.
          const y0 = vals[1], y1 = vals[(times.length - 1) * 3 + 1], T = times[times.length - 1] || 1;
          for (let i = 0; i < times.length; i++) vals[i * 3 + 1] -= (y1 - y0) * (times[i] / T);
        }
      } else {
        for (let i = 1; i < times.length; i++) { // continuity: neighbouring keys on the same side of the hypersphere
          const a = vals.subarray((i - 1) * 4, i * 4), b = vals.subarray(i * 4, i * 4 + 4);
          if (dot(a, b) < 0) for (let k = 0; k < 4; k++) b[k] = -b[k];
        }
        const q = r.getRotation();
        let far = 0; for (let i = 0; i < times.length; i++) far = Math.max(far, angle(Array.from(vals.subarray(i * 4, i * 4 + 4)), q));
        if (far < REST_TOL) { stats.dropped++; continue; } // never leaves the rest pose: the mixer leaves the bone alone
      }
      [times, vals] = reduceKeys(times, vals, size, p === "rotation" ? ROT_TOL : POS_TOL);
      const tin = out.createAccessor().setType("SCALAR").setArray(times).setBuffer(buf);
      let outArr = vals, normalized = false;
      if (p === "rotation") {
        outArr = new Int16Array(vals.length); normalized = true;
        for (let i = 0; i < times.length; i++) {
          const q = Array.from(vals.subarray(i * 4, i * 4 + 4)), n = Math.hypot(...q);
          for (let k = 0; k < 4; k++) outArr[i * 4 + k] = Math.round((q[k] / n) * 32767);
        }
      }
      const tout = out.createAccessor().setType(p === "rotation" ? "VEC4" : "VEC3").setArray(outArr).setNormalized(normalized).setBuffer(buf);
      const smp = out.createAnimationSampler().setInput(tin).setOutput(tout).setInterpolation("LINEAR");
      o.addSampler(smp).addChannel(out.createAnimationChannel().setTargetNode(clone.get(name)).setTargetPath(p).setSampler(smp));
      stats.kept++;
    }
  }
  console.log("clips: tracks kept", stats.kept, "dropped", stats.dropped, "| max non-hips translation deviation", stats.maxTransDev.toFixed(5), "max scale deviation", stats.maxScaleDev.toFixed(5));
  if (stats.maxTransDev > 0.002) fail("a non-hips bone translates in the source clips; dropping its track would change the animation");
  if (stats.maxScaleDev > 0.002) fail("a bone is scaled in the source clips");
  await out.transform(prune({ keepLeaves: true }));
  const file = path.join(OUT, "clips.glb");
  await io.write(file, out);
  const size = fs.statSync(file).size;
  console.log("clips.glb", kb(size), "(cap", kb(CAPS.clips) + ")");
  if (size > CAPS.clips) fail(`clips.glb ${kb(size)} over cap ${kb(CAPS.clips)}`);
}

// ------------------------------------------------------------------------------------------ leo.glb / mia.glb
/** 8-bit weights each round by up to 1/510; give the rounding error to the biggest weight so every vertex sums to exactly 255/255. */
function exactWeights(doc) {
  for (const prim of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
    const W = prim.getAttribute("WEIGHTS_0"), a = W.getArray();
    if (!(a instanceof Uint8Array)) throw new Error("expected uint8 weights");
    for (let i = 0; i < a.length; i += 4) {
      const sum = a[i] + a[i + 1] + a[i + 2] + a[i + 3];
      if (sum === 255) continue;
      let big = i; for (let k = 1; k < 4; k++) if (a[i + k] > a[big]) big = i + k;
      a[big] += 255 - sum;
    }
    W.setArray(a);
  }
}

async function buildCharacter(id) {
  const doc = await io.read(path.join(SRC, `${id}.glb`));
  const before = (() => {
    const p = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    return { verts: p.getAttribute("POSITION").getCount(), tris: p.getIndices().getCount() / 3, joints: doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()) };
  })();
  // One colour texture. The 2048 normal map and 2048 metal/roughness PNGs (about 6 MB) are dropped: a cartoon character, matte.
  for (const m of doc.getRoot().listMaterials()) {
    m.setNormalTexture(null).setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(0.85);
    for (const e of m.listExtensions()) e.dispose();
  }
  await doc.transform(
    prune(), dedup(),
    quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeWeight: 8 }),
    textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [1024, 1024], quality: 72 }),
  );
  exactWeights(doc);
  for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === "KHR_materials_volume") e.dispose();
  const file = path.join(OUT, `${id}.glb`);
  await io.write(file, doc);

  // ---- verify what survived
  const re = await io.read(file);
  const skin = re.getRoot().listSkins()[0];
  const prim = re.getRoot().listMeshes()[0].listPrimitives()[0];
  const joints = skin.listJoints().map((j) => j.getName());
  if (joints.length !== before.joints.length || joints.some((j, i) => j !== before.joints[i])) fail(`${id}: joints changed`);
  if (!joints.every((j) => j.startsWith("mixamorig:"))) fail(`${id}: joint not named mixamorig:*`);
  const J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0");
  if (!J || !W) fail(`${id}: JOINTS_0 / WEIGHTS_0 missing`);
  else {
    if (W.getCount() !== before.verts) fail(`${id}: vertex count changed ${before.verts} -> ${W.getCount()}`);
    let worst = 0; const e = [0, 0, 0, 0];
    for (let i = 0; i < W.getCount(); i++) { W.getElement(i, e); worst = Math.max(worst, Math.abs(e[0] + e[1] + e[2] + e[3] - 1)); }
    console.log(`${id}: weights sum to 1 within ${worst.toExponential(1)}`);
    if (worst > 1e-6) fail(`${id}: skin weights drifted (sum off by ${worst})`);
  }
  if (prim.getIndices().getCount() / 3 !== before.tris) fail(`${id}: triangles changed`);
  const tex = re.getRoot().listTextures();
  if (tex.length !== 1 || tex[0].getMimeType() !== "image/jpeg") fail(`${id}: expected one JPEG texture, got ${tex.map((t) => t.getMimeType())}`);
  const size = fs.statSync(file).size;
  console.log(`${id}.glb`, kb(size), `${before.tris} triangles, ${before.verts} vertices, ${joints.length} joints, texture ${tex[0]?.getSize()?.join("x")} (cap ${kb(CAPS.character)})`);
  if (size > CAPS.character) fail(`${id}.glb ${kb(size)} over cap ${kb(CAPS.character)}`);
}

fs.mkdirSync(OUT, { recursive: true });
await buildClips();
await buildCharacter("leo");
await buildCharacter("mia");
if (failed) { console.error("build-characters: FAILED"); process.exit(1); }
console.log("build-characters: ok");
