import fs from "node:fs";
import path from "node:path";

/** A tiny dependency-free GLB reader for the character tests (no gltf-transform needed in CI). */
export const CHAR_DIR = path.resolve(import.meta.dirname, "../../public/assets/characters");
export const charFile = (name: string) => path.join(CHAR_DIR, name);

export interface Glb { json: any; bin: Buffer }

export function parseGlb(buf: Buffer): Glb {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
  let off = 12, json: any = null, bin = Buffer.alloc(0);
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8"));
    else if (type === 0x004e4942) bin = Buffer.from(body);
    off += 8 + len;
  }
  return { json, bin };
}
export const readGlb = (name: string) => parseGlb(fs.readFileSync(charFile(name)));

const CT: Record<number, { ctor: any; size: number }> = {
  5120: { ctor: Int8Array, size: 1 }, 5121: { ctor: Uint8Array, size: 1 }, 5122: { ctor: Int16Array, size: 2 },
  5123: { ctor: Uint16Array, size: 2 }, 5125: { ctor: Uint32Array, size: 4 }, 5126: { ctor: Float32Array, size: 4 },
};
const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Raw (not de-normalised) accessor values, honouring byteStride. */
export function accessor(g: Glb, i: number): { data: ArrayLike<number>; count: number; comps: number; ctype: number; normalized: boolean } {
  const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView];
  const { ctor, size } = CT[a.componentType], comps = NCOMP[a.type];
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = bv.byteStride ?? size * comps;
  const out = new ctor(a.count * comps);
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength);
  for (let n = 0; n < a.count; n++) for (let c = 0; c < comps; c++) {
    const p = base + n * stride + c * size;
    out[n * comps + c] = size === 1 ? (a.componentType === 5120 ? dv.getInt8(p) : dv.getUint8(p)) : size === 2 ? (a.componentType === 5122 ? dv.getInt16(p, true) : dv.getUint16(p, true)) : a.componentType === 5126 ? dv.getFloat32(p, true) : dv.getUint32(p, true);
  }
  return { data: out, count: a.count, comps, ctype: a.componentType, normalized: !!a.normalized };
}

/** The same GLB without images/textures, so three's loader can parse the character in node (no DOM needed). */
export function withoutTextures(g: Glb): ArrayBuffer {
  const j = JSON.parse(JSON.stringify(g.json));
  delete j.images; delete j.textures; delete j.samplers;
  for (const m of j.materials ?? []) if (m.pbrMetallicRoughness) delete m.pbrMetallicRoughness.baseColorTexture;
  let js = JSON.stringify(j); while (js.length % 4) js += " ";
  const jb = Buffer.from(js, "utf8");
  const bin = Buffer.concat([g.bin, Buffer.alloc((4 - (g.bin.length % 4)) % 4)]);
  const total = 12 + 8 + jb.length + 8 + bin.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jb.length, 12); out.writeUInt32LE(0x4e4f534a, 16); jb.copy(out, 20);
  const o2 = 20 + jb.length;
  out.writeUInt32LE(bin.length, o2); out.writeUInt32LE(0x004e4942, o2 + 4); bin.copy(out, o2 + 8);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

import type * as THREE from "three";
import { SafeGLTFLoader } from "@/lib/three/safeGltfLoader";
/** Parse a shipped file with the app's own loader (textures stripped: node has no image decoder). */
export function loadNode(name: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  const buf = withoutTextures(readGlb(name));
  return new Promise((res, rej) => new SafeGLTFLoader().parse(buf, "", (g) => res({ scene: g.scene, animations: g.animations }), rej));
}
