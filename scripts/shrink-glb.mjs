import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { quantize, simplify, weld, textureCompress, prune, dedup, resample } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
const [,, inp, out, ratio="0.02", tex="1024"] = process.argv;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const root = doc.getRoot();
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) console.log("verts", p.getAttribute("POSITION").getCount(), "idx", p.getIndices()?.getCount());
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: 1 }), simplify({ simplifier: MeshoptSimplifier, ratio: 0.1, error: 1 }), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.2, error: 1 }), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 1 }), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 1 }), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.6, error: 1 }), weld(), prune(), dedup(),
  quantize({ quantizePosition: 12, quantizeNormal: 8, quantizeTexcoord: 12 }), textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [+tex, +tex], quality: 70 }));
await io.write(out, doc);
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) console.log("after verts", p.getAttribute("POSITION").getCount());
