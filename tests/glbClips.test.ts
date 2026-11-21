import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { ACTIONS, GESTURES } from "@/lib/scene/commands";
import {
  actPlan, bone, chooseLayers, CLIP_IDS, fitTimeScale, gesturePlan, HIPS, isClipId, isLowerBone, measureStride, REQUIRED_BONES, retargetClips,
} from "@/lib/teacher/glbClips";
import { loadNode } from "./helpers/glb";

let clips: Awaited<ReturnType<typeof loadNode>>, leo: Awaited<ReturnType<typeof loadNode>>, mia: Awaited<ReturnType<typeof loadNode>>;
beforeAll(async () => { [clips, leo, mia] = await Promise.all([loadNode("clips.glb"), loadNode("leo.glb"), loadNode("mia.glb")]); });

const trackBone = (t: THREE.KeyframeTrack) => t.name.slice(0, t.name.lastIndexOf("."));

describe("retarget: bone names", () => {
  it("three sanitises mixamorig:Hips to mixamorigHips, so every lookup below uses the sanitised name", () => {
    expect(clips.scene.getObjectByName(HIPS)).toBeTruthy();
    expect(clips.scene.getObjectByName("mixamorig:Hips")).toBeUndefined();
  });
  for (const who of ["leo", "mia"] as const) {
    it(`${who}: has every bone a clip needs, and every track of all 17 clips resolves to a node`, () => {
      const c = who === "leo" ? leo : mia;
      for (const b of REQUIRED_BONES) expect(c.scene.getObjectByName(b), b).toBeTruthy();
      const r = retargetClips(clips.scene, clips.animations, c.scene);
      expect([...r.clips.keys()].sort()).toEqual([...CLIP_IDS].sort());
      // Tracks that cannot resolve may only be bones that are not in the skin (finger tips, toe ends): never a real joint.
      const skinned = new Set<string>();
      c.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.bones.forEach((b) => skinned.add(b.name)); });
      expect(skinned.size).toBe(53);
      for (const miss of r.skippedBones) {
        expect(skinned.has(miss), `${miss} is in the skin but a track could not find it`).toBe(false);
        expect(miss).toMatch(/Toe_End$|Hand\w+4$|HeadTop_End$/);
      }
      expect(r.resolvedTracks / r.totalTracks).toBeGreaterThan(0.9);
      // Every bone in the skin that a clip animates is reached by the retargeted tracks.
      const reached = new Set<string>();
      for (const s of r.clips.values()) for (const t of s.full.tracks) reached.add(trackBone(t));
      for (const b of REQUIRED_BONES) expect(reached.has(b), `${b} never animated`).toBe(true);
    });
  }
  it("the clips file and both characters share the same set of skinned bone names", () => {
    const names = (root: THREE.Object3D) => { const n: string[] = []; root.traverse((o) => { if (o.name.startsWith("mixamorig")) n.push(o.name); }); return n; };
    const c = new Set(names(clips.scene));
    for (const n of names(leo.scene)) if (!/Toe_End$|Hand\w+4$/.test(n)) expect(c.has(n), n).toBe(true);
    expect(names(leo.scene).sort()).toEqual(names(mia.scene).sort());
  });
});

describe("retarget: the maths", () => {
  it("retargeting a skeleton onto itself changes nothing", () => {
    const same = retargetClips(clips.scene, clips.animations, clips.scene);
    const idle = same.clips.get("idle")!.full;
    const orig = clips.animations.find((a) => a.name === "idle")!;
    expect(idle.tracks.length).toBe(orig.tracks.length);
    for (const t of idle.tracks) {
      const o = orig.tracks.find((x) => x.name === t.name)!;
      for (let i = 0; i < t.values.length; i++) expect(t.values[i]).toBeCloseTo(o.values[i], 4);
    }
  });
  it("Mia's longer legs scale the hips motion (hip height ratio), Leo's do not", () => {
    const hipY = (c: typeof leo) => c.scene.getObjectByName(HIPS)!.position.y;
    const ratio = hipY(mia) / hipY(leo);
    expect(ratio).toBeGreaterThan(1.03);
    const swing = (c: typeof leo) => {
      const t = retargetClips(clips.scene, clips.animations, c.scene).clips.get("jump")!.full.tracks.find((x) => x.name === `${HIPS}.position`)!;
      const ys = Array.from(t.values).filter((_, i) => i % 3 === 1);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(swing(mia) / swing(leo)).toBeCloseTo(ratio, 2);
  });
  it("hips rotation keeps the same WORLD orientation as in the clips file (the 90 degree wrapper node in the character files is compensated)", () => {
    // Rotations about the vertical axis commute with that wrapper, so test clips that tip the body forward: run (leans), swim (face down), jump_down.
    const parentWorld = (root: THREE.Object3D) => { root.updateMatrixWorld(true); return root.getObjectByName(HIPS)!.parent!.getWorldQuaternion(new THREE.Quaternion()); };
    const Psrc = parentWorld(clips.scene);
    for (const c of [leo, mia]) {
      const Pdst = parentWorld(c.scene);
      expect(Math.abs(Pdst.dot(Psrc))).toBeLessThan(0.8); // the files really do differ above the hips (else this test proves nothing)
      const r = retargetClips(clips.scene, clips.animations, c.scene);
      for (const id of ["run", "swim", "jump_down"] as const) {
        const got = r.clips.get(id)!.full.tracks.find((x) => x.name === `${HIPS}.quaternion`)!;
        const src = clips.animations.find((a) => a.name === id)!.tracks.find((x) => x.name === `${HIPS}.quaternion`)!;
        for (const k of [0, Math.floor(src.times.length / 2)]) {
          const qd = new THREE.Quaternion().fromArray(Array.from(got.values.slice(k * 4, k * 4 + 4)));
          const qs = new THREE.Quaternion().fromArray(Array.from(src.values.slice(k * 4, k * 4 + 4)));
          const world = Pdst.clone().multiply(qd), want = Psrc.clone().multiply(qs);
          expect(Math.abs(world.dot(want)), `${id} key ${k}`).toBeGreaterThan(0.995);
        }
      }
    }
  });
  it("splits every clip into an upper layer and a hips-and-legs layer that together cover all tracks", () => {
    const r = retargetClips(clips.scene, clips.animations, leo.scene);
    for (const [id, s] of r.clips) {
      expect(s.upper.tracks.length + s.lower.tracks.length, id).toBe(s.full.tracks.length);
      expect(s.upper.tracks.every((t) => !isLowerBone(trackBone(t))), id).toBe(true);
      expect(s.lower.tracks.every((t) => isLowerBone(trackBone(t))), id).toBe(true);
      expect(s.lower.tracks.some((t) => t.name === `${HIPS}.position`), id).toBe(true);
      expect(s.upper.name).toBe(`${id}:upper`);
    }
  });
  it("measures natural locomotion speeds (run is faster than walk) on the real skeleton", () => {
    const r = retargetClips(clips.scene, clips.animations, leo.scene);
    const walk = measureStride(leo.scene, r.clips.get("walk")!.full), run = measureStride(leo.scene, r.clips.get("run")!.full);
    expect(walk).toBeGreaterThan(0.15);
    expect(walk).toBeLessThan(1.5);
    expect(run).toBeGreaterThan(walk * 1.5);
  });
});

describe("state to clip mapping", () => {
  const base = { walking: null, walkSpeedScale: 1, act: null, gesture: null, reducedMotion: false } as const;
  it("idle by default on both layers", () => {
    expect(chooseLayers(base)).toMatchObject({ lower: "idle", upper: "idle", loop: true });
  });
  it("walking plays walk on both layers, run only for a long, fast walk, never with reduced motion", () => {
    expect(chooseLayers({ ...base, walking: "walk", walkSpeedScale: 1.2 })).toMatchObject({ lower: "walk", upper: "walk", timeScale: 1.2 });
    expect(chooseLayers({ ...base, walking: "run" })).toMatchObject({ lower: "run", upper: "run" });
    expect(chooseLayers({ ...base, walking: "run", reducedMotion: true })).toMatchObject({ lower: "walk", upper: "walk" });
  });
  it("each act plays its clip: run, jump, clap, sit, climb, swim; eat has no clip yet (idle body, hand to the mouth by IK)", () => {
    const want: Record<string, string> = { run: "run", jump: "jump", clap: "clap", sit: "sit", climb: "climb", swim: "swim", eat: "idle" };
    expect(Object.keys(want).sort()).toEqual([...ACTIONS].sort());
    for (const a of ACTIONS) expect(chooseLayers({ ...base, act: a }).lower, a).toBe(want[a]);
    expect(chooseLayers({ ...base, act: "jump" }).loop).toBe(false);
    expect(chooseLayers({ ...base, act: "run", reducedMotion: true }).lower).toBe("walk");
    expect(chooseLayers({ ...base, act: "clap", reducedMotion: true }).timeScale).toBeLessThan(1);
  });
  it("gestures: thumbs_up plays the agree clip on the upper body only; the rest are drawn by IK or head motion", () => {
    expect(chooseLayers({ ...base, gesture: "thumbs_up" })).toMatchObject({ lower: "idle", upper: "agree" });
    for (const g of GESTURES) expect(gesturePlan(g), g).not.toBeNull();
    for (const g of ["wave", "shrug", "think", "open_hands", "nod"] as const) expect(chooseLayers({ ...base, gesture: g }).upper, g).toBe("idle");
    expect(gesturePlan("wave")).toEqual({ kind: "ik", pose: "wave" }); // wave_goodbye_01 is a SEATED wave: not used
  });
  it("priority: act beats walking beats gesture", () => {
    expect(chooseLayers({ ...base, act: "clap", walking: "walk", gesture: "thumbs_up" }).lower).toBe("clap");
    expect(chooseLayers({ ...base, walking: "walk", gesture: "thumbs_up" }).upper).toBe("walk");
  });
  it("every clip a plan can name is a shipped clip", () => {
    for (const a of ACTIONS) { const p = actPlan(a)!; if (p.clip) expect(isClipId(p.clip)).toBe(true); if (p.calmClip) expect(isClipId(p.calmClip)).toBe(true); }
    for (const g of GESTURES) { const p = gesturePlan(g)!; if (p.kind === "clip") expect(isClipId(p.clip)).toBe(true); }
  });
  it("hostile or unknown ids are never a clip, a plan, or a crash", () => {
    for (const bad of ["__proto__", "constructor", "toString", "hasOwnProperty", "../x", "https://evil.example/x.glb", "", "RUN", "run ", null, undefined, 3, {}, []]) {
      expect(isClipId(bad)).toBe(false);
      expect(actPlan(bad)).toBeNull();
      expect(gesturePlan(bad)).toBeNull();
    }
    expect(chooseLayers({ ...base, act: "__proto__" as never })).toMatchObject({ lower: "idle", upper: "idle" });
    expect(chooseLayers({ ...base, gesture: "constructor" as never })).toMatchObject({ lower: "idle", upper: "idle" });
    // retargeting also refuses a clip that is not on the list
    const evil = new THREE.AnimationClip("__proto__", 1, []);
    expect([...retargetClips(clips.scene, [evil, ...clips.animations], leo.scene).clips.keys()]).not.toContain("__proto__");
  });
  it("fitTimeScale fits a clip into a wanted time, bounded", () => {
    expect(fitTimeScale(2.2, 1.3)).toBeCloseTo(1.69, 1);
    expect(fitTimeScale(2.2, 0.01)).toBe(2);
    expect(fitTimeScale(0.1, 5)).toBe(0.5);
    expect(fitTimeScale(0, 1)).toBe(1);
    expect(fitTimeScale(NaN, 1)).toBe(1);
  });
  it("bone() builds sanitised names", () => { expect(bone("Hips")).toBe(HIPS); });
});
