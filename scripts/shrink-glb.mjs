// Shrinks a Tripo GLB (about 2M faces, 4k textures) to something we can ship.
// Usage: node scripts/shrink-glb.mjs <in.glb> <out.glb> [targetTriangles=60000] [texturePx=512]
// Needs @gltf-transform/{core,extensions,functions}, meshoptimizer and sharp (install with --no-save).
// Aims for a triangle target by repeated weld + simplify passes. Never use sloppy simplification:
// it tears UV seams.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { quantize, simplify, weld, textureCompress, prune, dedup } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
const [,, inp, out, target = "60000", tex = "512"] = process.argv;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const tris = () => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
const goal = +target;
console.log("start triangles", Math.round(tris()));
await doc.transform(weld());
for (let pass = 0; pass < 10 && tris() > goal * 1.1; pass++) {
  const ratio = Math.max(goal / tris(), 0.1);
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 1 }), weld());
  console.log("pass", pass + 1, "triangles", Math.round(tris()));
}
await doc.transform(prune(), dedup(),
  quantize({ quantizePosition: 12, quantizeNormal: 8, quantizeTexcoord: 12 }),
  textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [+tex, +tex], quality: 70 }));
await io.write(out, doc);
console.log("final triangles", Math.round(tris()));
