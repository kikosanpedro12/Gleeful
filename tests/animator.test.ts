import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildTeacher } from "@/lib/teacher/rig";
import { TeacherAnimator, type FrameInput } from "@/lib/teacher/animator";
import type { SceneCommand } from "@/lib/scene/commands";

function setup() {
  const rig = buildTeacher();
  const anim = new TeacherAnimator(rig);
  const scene = new THREE.Scene();
  scene.add(rig.root);
  let pending: { turnId: number; command: SceneCommand }[] = [];
  const animated: number[] = [];
  const targets: Record<string, THREE.Vector3> = { mars_globe: new THREE.Vector3(1.75, 1.07, -1.25), board: new THREE.Vector3(0.25, 1.72, -2.94) };
  const base: FrameInput = {
    dt: 1 / 60, state: "idle", turnId: 0, interrupted: false, outputLevel: 0, inputLevel: 0,
    camera: new THREE.Vector3(0, 1.45, 3.3), reducedMotion: false,
    resolveTarget: (n) => targets[n]?.clone() ?? null,
    takeDirectives: () => { const d = pending; pending = []; return d; },
    onFirstAnimation: (t) => animated.push(t),
  };
  const step = (over: Partial<FrameInput>, frames = 1) => {
    for (let i = 0; i < frames; i++) { anim.update({ ...base, ...over }); scene.updateMatrixWorld(true); }
  };
  return { rig, anim, step, push: (turnId: number, command: SceneCommand) => pending.push({ turnId, command }), animated };
}
const handR = (rig: ReturnType<typeof buildTeacher>) => rig.handR.getWorldPosition(new THREE.Vector3());
const handL = (rig: ReturnType<typeof buildTeacher>) => rig.handL.getWorldPosition(new THREE.Vector3());

describe("teacher animator", () => {
  it("mouth follows voice loudness only while speaking, and shuts on interruption", () => {
    const { anim, step } = setup();
    step({ state: "speaking", turnId: 1, outputLevel: 0.12 }, 30);
    expect(anim.debug.mouthOpen).toBeGreaterThan(0.5);
    // Barge-in: audio level may still be non-zero for a moment; the mouth must still close.
    step({ state: "listening", turnId: 2, interrupted: true, outputLevel: 0.12 }, 6);
    expect(anim.debug.mouthOpen).toBeLessThan(0.02);
  });

  it("body pose changes between states (not a static figure)", () => {
    const { rig, step } = setup();
    step({ state: "idle" }, 90);
    const idle = handR(rig);
    step({ state: "thinking", turnId: 1 }, 90);
    expect(handR(rig).distanceTo(idle)).toBeGreaterThan(0.25);
  });

  it("pointing aims the arm at the real object position", () => {
    const { rig, anim, step, push } = setup();
    const target = new THREE.Vector3(1.75, 1.07, -1.25);
    step({ state: "speaking", turnId: 1 }, 30);
    push(1, { name: "pointAt", target: "mars_globe" });
    step({ state: "speaking", turnId: 1 }, 80);
    expect(anim.debug.pointing).toBe("mars_globe");
    expect(anim.pointed).toBe("mars_globe");
    // Pointing hand, shoulder and target should be nearly collinear.
    const best = [[rig.joints.shoulderL, handL(rig)], [rig.joints.shoulderR, handR(rig)]].map(([sh, hand]) => {
      const s = (sh as THREE.Object3D).getWorldPosition(new THREE.Vector3());
      return (hand as THREE.Vector3).clone().sub(s).normalize().dot(target.clone().sub(s).normalize());
    });
    expect(Math.max(...best)).toBeGreaterThan(0.97);
  });

  it("walks to a spot and arrives", () => {
    const { rig, anim, step, push } = setup();
    const start = rig.root.position.clone();
    push(1, { name: "moveTeacherTo", spot: "board_side" });
    step({ state: "speaking", turnId: 1 }, 20);
    expect(anim.debug.walking).toBe(true);
    step({ state: "speaking", turnId: 1 }, 240);
    expect(anim.debug.walking).toBe(false);
    expect(rig.root.position.distanceTo(start)).toBeGreaterThan(1);
    expect(rig.root.position.x).toBeCloseTo(-1.35, 1);
  });

  it("a new turn cancels the active action and the queued ones", () => {
    const { anim, step, push } = setup();
    push(1, { name: "pointAt", target: "board" });
    push(1, { name: "gesture", gesture: "wave" });
    step({ state: "speaking", turnId: 1 }, 30);
    expect(anim.debug.pointing).toBe("board");
    step({ state: "listening", turnId: 2, interrupted: true }, 2);
    expect(anim.debug.pointing).toBeNull();
    expect(anim.pointed).toBeNull();
    step({ state: "listening", turnId: 2 }, 300);
    expect(anim.debug.gesture).toBeNull(); // queued wave never played
  });

  it("ignores directives tagged with an old turn", () => {
    const { anim, step, push } = setup();
    step({ state: "thinking", turnId: 3 }, 2);
    push(2, { name: "moveTeacherTo", spot: "desk_side" });
    step({ state: "thinking", turnId: 3 }, 10);
    expect(anim.debug.walking).toBe(false);
  });

  it("reports first animation once per turn", () => {
    const { step, animated } = setup();
    step({ state: "thinking", turnId: 1 }, 5);
    expect(animated).toEqual([]);
    step({ state: "speaking", turnId: 1 }, 5);
    expect(animated).toEqual([1]);
  });
});
