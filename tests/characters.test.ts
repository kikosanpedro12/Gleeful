import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { CAPS } from "../scripts/characters-config.mjs";
import { accessor, charFile, readGlb } from "./helpers/glb";
import { CLIP_IDS } from "@/lib/teacher/glbClips";

/**
 * The pipeline's OUTPUT (public/assets/characters, built by scripts/build-characters.mjs): joints, weights, clips,
 * sizes, and no WebAssembly-compressed buffers (our CSP has no 'wasm-unsafe-eval').
 */
const BUDGET_SOURCE = { leo: 18613, mia: 17696 } as const; // triangles of the Tripo exports: the build must not simplify

describe.each(["leo", "mia"] as const)("%s.glb", (id) => {
  const g = readGlb(`${id}.glb`);
  it(`is within the ${CAPS.character / 1024} KB cap`, () => {
    expect(fs.statSync(charFile(`${id}.glb`)).size).toBeLessThanOrEqual(CAPS.character);
  });
  it("uses no compressed-buffer extension (meshopt/draco are WebAssembly decoders the CSP would block)", () => {
    const used: string[] = g.json.extensionsUsed ?? [];
    expect(used.filter((e) => /meshopt|draco|basis|webp/i.test(e))).toEqual([]);
    expect(g.json.extensionsRequired ?? []).toEqual(["KHR_mesh_quantization"]);
  });
  it("has one skin with 53 joints, all named mixamorig:*", () => {
    expect(g.json.skins).toHaveLength(1);
    const joints: number[] = g.json.skins[0].joints;
    expect(joints).toHaveLength(53);
    const names = joints.map((n) => g.json.nodes[n].name as string);
    expect(names.every((n) => n.startsWith("mixamorig:"))).toBe(true);
    for (const must of ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand", "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot"])
      expect(names).toContain(`mixamorig:${must}`);
    expect(new Set(names).size).toBe(53);
  });
  it("keeps all triangles (never simplified) and skin attributes on one mesh", () => {
    expect(g.json.meshes).toHaveLength(1);
    const p = g.json.meshes[0].primitives;
    expect(p).toHaveLength(1);
    expect(p[0].attributes.JOINTS_0).toBeDefined();
    expect(p[0].attributes.WEIGHTS_0).toBeDefined();
    expect(accessor(g, p[0].indices).count / 3).toBe(BUDGET_SOURCE[id]);
  });
  it("every vertex has skin weights that sum to exactly 1 and joint indexes inside the skin", () => {
    const p = g.json.meshes[0].primitives[0];
    const W = accessor(g, p.attributes.WEIGHTS_0), J = accessor(g, p.attributes.JOINTS_0);
    expect(W.count).toBe(J.count);
    expect(W.normalized).toBe(true);
    const max = W.ctype === 5121 ? 255 : 65535;
    let influenced = 0;
    for (let i = 0; i < W.count; i++) {
      const s = W.data[i * 4] + W.data[i * 4 + 1] + W.data[i * 4 + 2] + W.data[i * 4 + 3];
      if (s !== max) throw new Error(`vertex ${i} weights sum ${s}/${max}`);
      for (let k = 0; k < 4; k++) {
        if (W.data[i * 4 + k] > 0) { influenced++; expect(J.data[i * 4 + k]).toBeLessThan(53); }
      }
    }
    expect(influenced).toBeGreaterThan(W.count); // more than one bone moves most vertices: it really is skinned
  });
  it("has exactly one 1024px JPEG colour texture (normal and metal-roughness maps were dropped)", () => {
    expect(g.json.images).toHaveLength(1);
    expect(g.json.images[0].mimeType).toBe("image/jpeg");
    const bv = g.json.bufferViews[g.json.images[0].bufferView];
    const jpg = g.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    expect(jpg[0]).toBe(0xff); expect(jpg[1]).toBe(0xd8);
    // SOF0/SOF2 marker carries the size.
    let w = 0, h = 0;
    for (let i = 2; i < jpg.length - 9; ) {
      if (jpg[i] !== 0xff) { i++; continue; }
      const m = jpg[i + 1];
      if (m === 0xc0 || m === 0xc2) { h = jpg.readUInt16BE(i + 5); w = jpg.readUInt16BE(i + 7); break; }
      i += 2 + jpg.readUInt16BE(i + 2);
    }
    expect([w, h]).toEqual([1024, 1024]);
    const mat = g.json.materials[0];
    expect(mat.normalTexture).toBeUndefined();
    expect(mat.pbrMetallicRoughness.metallicRoughnessTexture).toBeUndefined();
  });
});

describe("clips.glb", () => {
  const g = readGlb("clips.glb");
  it(`is within the ${CAPS.clips / 1024} KB cap and has no mesh, skin or texture`, () => {
    expect(fs.statSync(charFile("clips.glb")).size).toBeLessThanOrEqual(CAPS.clips);
    expect(g.json.meshes ?? []).toHaveLength(0);
    expect(g.json.skins ?? []).toHaveLength(0);
    expect(g.json.images ?? []).toHaveLength(0);
    expect((g.json.extensionsUsed ?? []).filter((e: string) => /meshopt|draco/i.test(e))).toEqual([]);
  });
  it("has exactly the 17 shipped clips", () => {
    const names: string[] = g.json.animations.map((a: any) => a.name);
    expect([...names].sort()).toEqual([...CLIP_IDS].sort());
  });
  it("every channel targets a mixamorig bone; only the hips translate; nothing scales", () => {
    const nodeName = (i: number) => g.json.nodes[i].name as string;
    for (const a of g.json.animations) {
      expect(a.channels.length).toBeGreaterThan(10);
      for (const c of a.channels) {
        expect(nodeName(c.target.node)).toMatch(/^mixamorig:/);
        expect(["rotation", "translation"]).toContain(c.target.path);
        if (c.target.path === "translation") expect(nodeName(c.target.node)).toBe("mixamorig:Hips");
      }
      expect(a.channels.some((c: any) => c.target.path === "translation")).toBe(true);
    }
  });
  it("rotations are normalised int16 (small), times are float, and each clip has a positive length", () => {
    for (const a of g.json.animations) {
      let length = 0;
      for (const c of a.channels) {
        const s = a.samplers[c.sampler];
        const out = accessor(g, s.output), tin = accessor(g, s.input);
        expect(tin.ctype).toBe(5126);
        if (c.target.path === "rotation") { expect(out.ctype).toBe(5122); expect(out.normalized).toBe(true); }
        for (let i = 1; i < tin.count; i++) expect(tin.data[i]).toBeGreaterThan(tin.data[i - 1]); // a held pose is one key at 0
        length = Math.max(length, tin.data[tin.count - 1]);
      }
      expect(length).toBeGreaterThan(0.5);
    }
  });
  it("the hips stay in place: no horizontal drift away from the skeleton's rest position", () => {
    const hipsIdx = g.json.nodes.findIndex((n: any) => n.name === "mixamorig:Hips");
    const rest = g.json.nodes[hipsIdx].translation as number[];
    for (const a of g.json.animations) {
      const c = a.channels.find((x: any) => x.target.node === hipsIdx && x.target.path === "translation");
      const v = accessor(g, a.samplers[c.sampler].output).data;
      let mx = 0, mz = 0;
      for (let i = 0; i < v.length; i += 3) { mx += v[i]; mz += v[i + 2]; }
      mx /= v.length / 3; mz /= v.length / 3;
      expect(Math.abs(mx - rest[0])).toBeLessThan(0.05);
      expect(Math.abs(mz - rest[2])).toBeLessThan(0.05);
    }
  });
});

describe("caching the teacher models", async () => {
  const { default: nextConfig } = await import("../next.config.mjs");
  type Rule = { source: string; headers: { key: string; value: string }[] };
  const rules = (await nextConfig.headers!()) as Rule[];
  const rule = rules.find((r) => r.source === "/assets/characters/:path*");
  it("gives the character files an hour of cache, not max-age=0, and no stale-while-revalidate (old and new files must not mix)", () => {
    const cc = rule?.headers.find((h) => h.key === "Cache-Control")?.value ?? "";
    expect(cc).toMatch(/public/);
    expect(Number(/max-age=(\d+)/.exec(cc)?.[1])).toBeGreaterThanOrEqual(3600);
    expect(cc).not.toMatch(/stale-while-revalidate/);
  });
  it("sets nothing but caching on that rule (the CSP stays per-request in src/proxy.ts)", () => {
    expect(rule?.headers.map((h) => h.key)).toEqual(["Cache-Control"]);
    expect(rules.some((r) => r.headers.some((h) => /content-security-policy/i.test(h.key)))).toBe(false);
  });
  it("does not cache anything else under /assets", () => {
    expect(rules.filter((r) => r.headers.some((h) => h.key === "Cache-Control")).map((r) => r.source)).toEqual(["/assets/characters/:path*"]);
  });
});
