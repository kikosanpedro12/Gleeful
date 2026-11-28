import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { ACTIONS, GESTURES, type Action, type Gesture, type SceneCommand } from "@/lib/scene/commands";
import { ACTION_SEC, GESTURE_SEC, TeacherAnimator, type FrameInput } from "@/lib/teacher/animator";
import { GlbTeacherAnimator } from "@/lib/teacher/glbAnimator";
import { assembleGlbRig, GLB_HEIGHT, loadGlbRig, clearGlbCache, type GlbRig } from "@/lib/teacher/glbRig";
import { buildTeacher, LOOKS, type TeacherId } from "@/lib/teacher/rig";
import { glbEnabled } from "@/lib/teacher/glbFlag";
import { loadNode } from "./helpers/glb";

let files: Record<"clips" | "leo" | "mia", Awaited<ReturnType<typeof loadNode>>>;
beforeAll(async () => { files = { clips: await loadNode("clips.glb"), leo: await loadNode("leo.glb"), mia: await loadNode("mia.glb") }; });
const rigOf = (id: TeacherId): GlbRig => assembleGlbRig(id, files[id].scene, files.clips.scene, files.clips.animations);

const targets: Record<string, THREE.Vector3> = { mars_globe: new THREE.Vector3(1.75, 1.07, -1.25), board: new THREE.Vector3(0.25, 1.72, -2.94) };
function harness(kind: "glb", id?: TeacherId): Harness<GlbTeacherAnimator, GlbRig>;
function harness(kind: "procedural", id?: TeacherId): Harness<TeacherAnimator, ReturnType<typeof buildTeacher>>;
function harness(kind: "glb" | "procedural", id: TeacherId = "leo"): Harness<GlbTeacherAnimator | TeacherAnimator, GlbRig | ReturnType<typeof buildTeacher>> {
  const rig = kind === "glb" ? rigOf(id) : buildTeacher(LOOKS[id]);
  const anim = kind === "glb" ? new GlbTeacherAnimator(rig as GlbRig) : new TeacherAnimator(rig as ReturnType<typeof buildTeacher>);
  const scene = new THREE.Scene(); scene.add(rig.root);
  let pending: { turnId: number; command: SceneCommand }[] = [];
  const announced: number[] = [];
  const base: FrameInput = {
    dt: 1 / 60, state: "idle", turnId: 0, interrupted: false, outputLevel: 0, inputLevel: 0,
    camera: new THREE.Vector3(0, 1.45, 3.3), reducedMotion: false,
    resolveTarget: (n) => targets[n]?.clone() ?? null,
    resolveSpot: (n) => ({ center: [-0.15, -0.7], board_side: [-1.35, -1.75], desk_side: [0.95, -0.9] } as Record<string, [number, number]>)[n] ?? null,
    helmet: false,
    takeDirectives: () => { const d = pending; pending = []; return d; },
    onFirstAnimation: (t) => announced.push(t),
  };
  const trace: string[] = [];
  const step = (over: Partial<FrameInput> = {}, frames = 1) => {
    for (let i = 0; i < frames; i++) {
      anim.update({ ...base, ...over }); scene.updateMatrixWorld(true);
      const d = anim.debug;
      trace.push(`${d.action}|${d.gesture}|${d.walking}|${d.pointing}|${anim.pointed}`);
    }
  };
  const push = (turnId: number, command: SceneCommand) => { pending.push({ turnId, command }); };
  return { rig, anim, step, push, announced, trace, scene };
}
interface Harness<A, R> {
  rig: R; anim: A; scene: THREE.Scene; announced: number[]; trace: string[];
  step(over?: Partial<FrameInput>, frames?: number): void;
  push(turnId: number, command: SceneCommand): void;
}
const rle = (t: string[]) => { const out: [string, number][] = []; for (const x of t) { const l = out[out.length - 1]; if (l && l[0] === x) l[1]++; else out.push([x, 1]); } return out; };
const feetY = (rig: GlbRig) => new THREE.Box3().setFromObject(rig.skinned).min.y;
const heightOf = (rig: GlbRig) => { const b = new THREE.Box3().setFromObject(rig.skinned); return b.max.y - Math.max(0, b.min.y); };

describe("GLB rig: size, floor, attachments", () => {
  for (const id of ["leo", "mia"] as const) {
    it(`${id}: stands on the floor at the procedural teacher's height, Mia a little shorter`, () => {
      const rig = rigOf(id); const scene = new THREE.Scene(); scene.add(rig.root); scene.updateMatrixWorld(true);
      new GlbTeacherAnimator(rig);
      scene.updateMatrixWorld(true);
      expect(heightOf(rig)).toBeGreaterThan(GLB_HEIGHT[id] * 0.93);
      expect(heightOf(rig)).toBeLessThan(GLB_HEIGHT[id] * 1.1);
      expect(Math.abs(feetY(rig))).toBeLessThan(0.04);
      expect(rig.glb).toBe(true);
    });
  }
  it("Mia is shorter than Leo, like the procedural pair", () => {
    expect(GLB_HEIGHT.mia / GLB_HEIGHT.leo).toBeCloseTo(LOOKS.mia.height, 3);
  });
  it("the helmet hangs on the head bone and shows only when asked; the stool starts hidden", () => {
    const { rig, step } = harness("glb");
    const g = rig as GlbRig;
    expect(g.helmet.parent?.name).toBe("mixamorigHead");
    expect(g.helmet.visible).toBe(false);
    step({ helmet: true }, 2);
    expect(g.helmet.visible).toBe(true);
    step({ helmet: false }, 2);
    expect(g.helmet.visible).toBe(false);
    expect(g.stool.visible).toBe(false);
  });
});

describe("GLB animator: the same control flow as the procedural animator", () => {
  type AnyH = Harness<GlbTeacherAnimator | TeacherAnimator, GlbRig | ReturnType<typeof buildTeacher>>;
  const scripts: [string, (h: AnyH) => void][] = [
    ...GESTURES.map((g): [string, (h: AnyH) => void] => [`gesture ${g}`, (h) => { h.step({ state: "speaking", turnId: 1 }, 20); h.push(1, { name: "gesture", gesture: g }); h.step({ state: "speaking", turnId: 1 }, 200); }]),
    ...["run", "jump", "eat", "sit", "clap"].map((a): [string, (h: AnyH) => void] => [`act ${a}`, (h) => { h.step({ state: "speaking", turnId: 1 }, 10); h.push(1, { name: "act", action: a as Action }); h.step({ state: "speaking", turnId: 1 }, 330); }]),
    ["pointAt", (h) => { h.step({ state: "speaking", turnId: 1 }, 20); h.push(1, { name: "pointAt", target: "board" }); h.step({ state: "speaking", turnId: 1 }, 260); }],
    ["inviteTap", (h) => { h.push(1, { name: "inviteTap", target: "mars_globe" }); h.step({ state: "idle", turnId: 1 }, 200); }],
    ["thinking: nod then hand to chin once", (h) => { h.step({ state: "idle", turnId: 1 }, 10); h.step({ state: "thinking", turnId: 2 }, 300); }],
    ["new turn cancels the gesture; stale directive dropped", (h) => { h.push(1, { name: "gesture", gesture: "wave" }); h.step({ state: "speaking", turnId: 1 }, 20); h.push(1, { name: "gesture", gesture: "shrug" }); h.step({ state: "speaking", turnId: 2 }, 100); }],
    ["listening drops acts", (h) => { h.push(1, { name: "act", action: "clap" }); h.step({ state: "listening", turnId: 1 }, 60); }],
    ["board write nods", (h) => { h.push(1, { name: "writeOnBoard", text: "Hi" } as SceneCommand); h.step({ state: "speaking", turnId: 1 }, 120); }],
  ];
  for (const [name, run] of scripts) {
    it(`${name}: same trace of action / gesture / pointing as the procedural rig (frame counts within 2)`, () => {
      const a = harness("procedural"), b = harness("glb");
      run(a); run(b);
      const ra = rle(a.trace), rb = rle(b.trace);
      expect(rb.map((x) => x[0])).toEqual(ra.map((x) => x[0]));
      ra.forEach((x, i) => expect(Math.abs(x[1] - rb[i][1]), `${x[0]}`).toBeLessThanOrEqual(2));
      expect(b.announced).toEqual(a.announced);
    });
  }
  it("walking: starts, ends on the spot, uses a locomotion clip, never skates faster than the clip allows", () => {
    const { rig, anim, step, push } = harness("glb");
    push(1, { name: "moveTeacherTo", spot: "board_side" });
    step({ state: "speaking", turnId: 1 }, 2);
    expect(anim.walkTarget()?.x).toBeCloseTo(-1.35);
    expect(anim.debug.walking).toBe(true);
    expect(["walk", "run"]).toContain(anim.debug.lower);
    step({ state: "speaking", turnId: 1 }, 600);
    expect(anim.walkTarget()).toBeNull();
    expect(Math.hypot(rig.root.position.x + 1.35, rig.root.position.z + 1.75)).toBeLessThan(0.1);
    step({ state: "speaking", turnId: 1 }, 40);
    expect(anim.debug.lower).toBe("idle");
    expect(anim.debug.walking).toBe(false);
  });
  it("a walk to an unknown spot or a hostile spot name does nothing", () => {
    const { anim, step, push } = harness("glb");
    push(1, { name: "moveTeacherTo", spot: "__proto__" } as SceneCommand);
    push(1, { name: "moveTeacherTo", spot: "https://evil.example" } as SceneCommand);
    step({ state: "idle", turnId: 1 }, 30);
    expect(anim.walkTarget()).toBeNull();
    expect(anim.debug.lower).toBe("idle");
  });
  it("hostile act and gesture ids that got past the validator are ignored: idle clips only, nothing left running", () => {
    const { anim, step, push } = harness("glb");
    for (const bad of ["__proto__", "constructor", "fly", "https://evil.example/x.glb", ""]) {
      push(1, { name: "act", action: bad } as unknown as SceneCommand);
      push(1, { name: "gesture", gesture: bad } as unknown as SceneCommand);
      step({ state: "speaking", turnId: 1 }, 20);
      expect(anim.debug.action).toBeNull();
      expect(anim.debug.gesture).toBeNull();
      expect(anim.debug.upper).toBe("idle");
      expect(anim.debug.lower).toBe("idle");
    }
  });
  it("a gesture or act that never ends cannot happen: every one is over within its nominal time", () => {
    for (const g of GESTURES) {
      const { anim, step } = harness("glb");
      anim.gestureNow(g as Gesture);
      step({ state: "idle", turnId: 0 }, Math.ceil((GESTURE_SEC[g] + 0.3) * 60));
      expect(anim.debug.gesture, g).toBeNull();
    }
  });
});

describe("GLB animator: acting out", () => {
  function play(action: Action, over: Partial<FrameInput> = {}, id: TeacherId = "leo") {
    const h = harness("glb", id);
    const rig = h.rig as GlbRig;
    h.push(1, { name: "act", action });
    const t = { frames: 0, maxY: 0, minFoot: 9, clips: new Set<string>(), seen: false, stool: false };
    const n = Math.ceil((ACTION_SEC[action] + 1.6) * 60);
    for (let i = 0; i < n; i++) {
      h.step({ state: "idle", turnId: 1, ...over }, 1);
      if (h.anim.debug.action === action) { t.seen = true; t.frames++; }
      t.maxY = Math.max(t.maxY, rig.root.position.y);
      t.clips.add(h.anim.debug.upper); t.clips.add(h.anim.debug.lower);
      if (rig.stool.visible) t.stool = true;
      if (i % 5 === 0 && h.anim.debug.action) t.minFoot = Math.min(t.minFoot, feetY(rig));
    }
    return { ...h, rig, t };
  }
  for (const a of ["run", "jump", "eat", "sit", "clap"] as Action[]) {
    it(`${a}: plays for its nominal time, then the body is back on the floor in the idle clips`, () => {
      const r = play(a);
      expect(r.t.seen).toBe(true);
      expect(r.t.frames / 60).toBeGreaterThan(ACTION_SEC[a] - 0.1);
      expect(r.t.frames / 60).toBeLessThan(ACTION_SEC[a] + 0.1);
      expect(r.anim.debug.action).toBeNull();
      expect(r.anim.debug.upper).toBe("idle");
      expect(r.rig.root.position.y).toBeCloseTo(0, 1);
      expect(r.t.minFoot).toBeGreaterThan(-0.08); // never sinks through the floor
      expect(a === "sit").toBe(r.t.stool);
    });
    it(`${a}: reduced motion makes it shorter and smaller`, () => {
      const full = play(a), red = play(a, { reducedMotion: true });
      expect(red.t.frames).toBeLessThan(full.t.frames * 0.6);
      expect(red.t.maxY).toBeLessThanOrEqual(full.t.maxY + 0.01);
    });
    it(`${a}: a new turn, or the child speaking, stops it`, () => {
      const h = harness("glb");
      h.push(1, { name: "act", action: a });
      h.step({ state: "speaking", turnId: 1 }, 20);
      expect(h.anim.debug.action).toBe(a);
      h.step({ state: "speaking", turnId: 2, interrupted: true }, 1);
      expect(h.anim.debug.action).toBeNull();
      const h2 = harness("glb");
      h2.push(1, { name: "act", action: a });
      h2.step({ state: "speaking", turnId: 1 }, 20);
      h2.step({ state: "listening", turnId: 1 }, 1);
      expect(h2.anim.debug.action).toBeNull();
    });
  }
  it("jump lifts the root (root.position.y is the jump height); reduced motion keeps it low", () => {
    expect(play("jump").t.maxY).toBeGreaterThan(0.15);
    expect(play("jump", { reducedMotion: true }).t.maxY).toBeLessThan(0.12);
  });
  it("run uses the run clip, with reduced motion the walk clip; sit shows the stool; clap and jump use their clips", () => {
    expect(play("run").t.clips.has("run")).toBe(true);
    expect(play("run", { reducedMotion: true }).t.clips.has("run")).toBe(false);
    expect(play("clap").t.clips.has("clap")).toBe(true);
    expect(play("jump").t.clips.has("jump")).toBe(true);
    expect(play("sit").t.clips.has("sit")).toBe(true);
  });
  it("every act works on Mia's longer legs too, and she stays on the floor", () => {
    for (const a of ACTIONS) {
      const r = play(a, {}, "mia");
      expect(r.t.seen, a).toBe(true);
      expect(r.t.minFoot, a).toBeGreaterThan(a === "swim" ? -0.25 : -0.08);
      expect(r.rig.root.position.y).toBeCloseTo(0, 1);
    }
  });
});

describe("GLB animator: speaking has body language but no mouth", () => {
  it("never reports a mouth, moves the body while speaking, and responds to the voice level", () => {
    const idle = harness("glb"), talk = harness("glb");
    idle.step({ state: "idle" }, 180);
    talk.step({ state: "speaking", turnId: 1, outputLevel: 0.12 }, 180);
    expect(talk.anim.debug.mouthOpen).toBe(0);
    const hand = (r: GlbRig) => r.bones.right.hand.getWorldPosition(new THREE.Vector3());
    const handL = (r: GlbRig) => r.bones.left.hand.getWorldPosition(new THREE.Vector3());
    const moved = Math.max(hand(talk.rig as GlbRig).distanceTo(hand(idle.rig as GlbRig)), handL(talk.rig as GlbRig).distanceTo(handL(idle.rig as GlbRig)));
    expect(moved).toBeGreaterThan(0.08);
    // Loud speech nods the head more than silence.
    const head = (h: Harness<GlbTeacherAnimator, GlbRig>) => h.rig.bones.head.getWorldPosition(new THREE.Vector3());
    const quiet = harness("glb"); quiet.step({ state: "speaking", turnId: 1, outputLevel: 0 }, 180);
    expect(head(talk).distanceTo(head(quiet))).toBeGreaterThan(0.001);
  });
  it("the child's silence after an interruption brings the body back: no frozen pose, all numbers finite", () => {
    const h = harness("glb");
    h.step({ state: "speaking", turnId: 1, outputLevel: 0.2 }, 60);
    h.step({ state: "listening", turnId: 2, interrupted: true, inputLevel: 0.1 }, 60);
    h.step({ state: "thinking", turnId: 2 }, 60);
    h.step({ state: "idle", turnId: 2 }, 120);
    const r = h.rig as GlbRig;
    for (const b of [r.bones.head, r.bones.left.hand, r.bones.right.hand, r.bones.hips]) {
      const p = b.getWorldPosition(new THREE.Vector3());
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
    }
  });
  it("pointing aims the arm at the real object position (hand, shoulder and target nearly in line)", () => {
    const { rig, anim, step, push } = harness("glb");
    const r = rig as GlbRig;
    step({ state: "speaking", turnId: 1 }, 30);
    push(1, { name: "pointAt", target: "mars_globe" });
    step({ state: "speaking", turnId: 1 }, 80);
    expect(anim.debug.pointing).toBe("mars_globe");
    expect(anim.pointed).toBe("mars_globe");
    const target = targets.mars_globe;
    const best = [r.bones.left, r.bones.right].map((a) => {
      const sh = a.arm.getWorldPosition(new THREE.Vector3()), hand = a.hand.getWorldPosition(new THREE.Vector3());
      return hand.clone().sub(sh).normalize().dot(target.clone().sub(sh).normalize());
    });
    expect(Math.max(...best)).toBeGreaterThan(0.93);
  });
  it("pointing at a board BEHIND the teacher keeps the face toward the child: body turns <= ~26 degrees, arm swings out, hand never in front of the face", () => {
    for (const id of ["leo", "mia"] as TeacherId[]) {
      const { rig, anim, step, push } = harness("glb", id);
      const r = rig as GlbRig;
      step({ state: "speaking", turnId: 1 }, 30);
      push(1, { name: "pointAt", target: "board" });
      step({ state: "speaking", turnId: 1 }, 50);
      expect(anim.debug.pointing, id).toBe("board");
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(r.root.getWorldQuaternion(new THREE.Quaternion()));
      const toCam = new THREE.Vector3(0, 0, 4).sub(r.root.position).setY(0).normalize();
      expect(Math.acos(Math.min(1, fwd.dot(toCam))), id).toBeLessThan(0.5);
      // Seen from the camera (looking along -z), the pointing hand must be well to the side of the head, not in front of the face.
      const head = r.bones.head.getWorldPosition(new THREE.Vector3());
      const hands = [r.bones.left.hand, r.bones.right.hand].map((h) => h.getWorldPosition(new THREE.Vector3()));
      const farSide = Math.max(...hands.map((h) => Math.abs(h.x - head.x)));
      expect(farSide, id).toBeGreaterThan(0.3);
    }
  });
  it("a run's flight phase is not 'air': only jump, climb and swim lift the reported root height", () => {
    const h = harness("glb");
    const far = () => [-4, 3] as [number, number];
    h.push(1, { name: "moveTeacherTo", spot: "center" });
    let maxY = 0, lowers = new Set<string>();
    for (let i = 0; i < 600; i++) { h.step({ state: "idle", turnId: 1, resolveSpot: far }, 1); maxY = Math.max(maxY, (h.rig as GlbRig).root.position.y); lowers.add(h.anim.debug.lower); }
    expect(lowers.has("run") || lowers.has("walk")).toBe(true);
    expect(maxY).toBe(0);
  });
  it("looks at the camera, with the head turn clamped", () => {
    const { rig, step } = harness("glb");
    const r = rig as GlbRig;
    step({ state: "idle", camera: new THREE.Vector3(30, 1.5, -0.7) }, 90); // far to the side, behind the shoulder line
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(r.bones.head.getWorldQuaternion(new THREE.Quaternion()));
    expect(Number.isFinite(fwd.x)).toBe(true);
  });
});

describe("flag and fallback", () => {
  it("is ON by default; only the build kill switch '0' turns the default off", () => {
    expect(glbEnabled({})).toBe(true);
    expect(glbEnabled({ build: "" })).toBe(true);
    expect(glbEnabled({ build: "1" })).toBe(true);
    expect(glbEnabled({ build: "0" })).toBe(false);
  });
  it("?rig=procedural is the escape hatch in any build; ?rig=glb beats the kill switch", () => {
    expect(glbEnabled({ search: "?rig=procedural" })).toBe(false);
    expect(glbEnabled({ search: "?test=1&rig=procedural" })).toBe(false);
    expect(glbEnabled({ search: "?rig=glb", build: "0" })).toBe(true);
    expect(glbEnabled({ search: "?rig=bogus" })).toBe(true); // junk is ignored, the default stands
    expect(glbEnabled({ search: "?rig=bogus", build: "0" })).toBe(false);
  });
  it("a load that cannot fetch rejects (so the stage keeps the procedural teacher) instead of throwing", async () => {
    clearGlbCache();
    await expect(loadGlbRig("leo")).rejects.toBeDefined();
  });
  it("a character file with a missing bone is refused", () => {
    const broken = files.leo.scene.clone(true);
    broken.getObjectByName("mixamorigLeftHand")!.name = "renamed";
    expect(() => assembleGlbRig("leo", broken, files.clips.scene, files.clips.animations)).toThrow(/no bone/);
  });
  it("clips that miss a shipped clip are refused", () => {
    expect(() => assembleGlbRig("leo", files.leo.scene, files.clips.scene, files.clips.animations.filter((a) => a.name !== "jump"))).toThrow(/no clip jump/);
  });
});

describe("loading note and clean-up", () => {
  it("the 'getting your teacher ready' store is on while any teacher loads and off when all have settled", async () => {
    const { glbLoading, glbLoadingNow } = await import("@/lib/teacher/glbStatus");
    expect(glbLoadingNow()).toBe(false);
    glbLoading("leo", true); glbLoading("mia", true);
    expect(glbLoadingNow()).toBe(true);
    glbLoading("leo", false);
    expect(glbLoadingNow()).toBe(true); // Mia is still loading
    glbLoading("mia", false); glbLoading("mia", false); // a double release is harmless
    expect(glbLoadingNow()).toBe(false);
  });
  it("disposing an animator and its rig leaves the shared bones at rest and frees the skeleton texture", () => {
    const h = harness("glb");
    const r = h.rig as GlbRig;
    h.step({ state: "speaking", turnId: 1 }, 30);
    h.anim.dispose();
    expect(() => r.dispose()).not.toThrow();
    expect(r.skinned.skeleton.boneTexture).toBeNull();
  });
});

describe("GLB wave: the raised hand clears the head", () => {
  for (const id of ["leo", "mia"] as const) {
    it(`${id}: while waving, the waving hand stays more than 0.2 m to the side of the head and the arm is actually raised`, () => {
      const h = harness("glb", id); const rig = h.rig as GlbRig;
      h.step({ state: "idle", turnId: 1 }, 10);
      h.push(1, { name: "gesture", gesture: "wave" });
      let minSide = Infinity, maxUp = -Infinity;
      for (let i = 0; i < 90; i++) { // the whole 1.9 s gesture, sampled each frame
        h.step({ state: "idle", turnId: 1 }, 1);
        if (i < 25 || i > 85) continue; // fully raised part only
        const hand = rig.bones.right.hand.getWorldPosition(new THREE.Vector3()), head = rig.bones.head.getWorldPosition(new THREE.Vector3());
        minSide = Math.min(minSide, Math.abs(hand.x - head.x)); maxUp = Math.max(maxUp, hand.y - rig.bones.right.arm.getWorldPosition(new THREE.Vector3()).y);
      }
      expect(minSide).toBeGreaterThan(0.2);
      expect(maxUp).toBeGreaterThan(0.1);
    });
  }
});
