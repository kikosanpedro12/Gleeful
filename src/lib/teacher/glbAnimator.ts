import * as THREE from "three";
import type { Action, Gesture, SceneCommand } from "@/lib/scene/commands";
import { ACTION_SEC, GESTURE_SEC, type FrameInput } from "./animator";
import type { ActorAnimator } from "./actor";
import { actPlan, chooseLayers, fitTimeScale, gesturePlan, type Layer } from "./glbClips";
import type { ArmBones, GlbRig } from "./glbRig";
import type { TeacherState } from "./stateMachine";

/**
 * Drives a GLB teacher (glbRig.ts). Same inputs and same public surface as TeacherAnimator (animator.ts), so the
 * scene, the camera and the browser tests do not care which rig is on stage. The control flow (turn ids, stale drops,
 * queue, walk, point, gesture, act, interrupt) mirrors animator.ts; tests/glbAnimator.test.ts drives both with the same
 * inputs and requires the same debug trace, so they cannot drift apart unnoticed.
 *
 * What is different is the output stage:
 *  - two clip layers (hips+legs, and spine-up) on one AnimationMixer, crossfaded separately, so a gesture or a talking
 *    beat can play over standing or walking;
 *  - arm IK (two-bone, analytic) for wave, think, eat, open hands, shrug, talking beats and pointAt;
 *  - small procedural head / spine offsets for look-at, listening, thinking, nodding and voice emphasis.
 * No mouth: the models have no face blendshapes. Speech is body and head emphasis, NOT lip sync.
 */

type Active =
  | { kind: "walk"; to: THREE.Vector3; turnId: number }
  | { kind: "point"; target: string; t: number; turnId: number }
  | { kind: "gesture"; gesture: Gesture; t: number; turnId: number }
  | { kind: "act"; action: Action; t: number; turnId: number };

type ArmSide = "L" | "R";
interface ArmWant { w: number; t: THREE.Vector3 }

const V = THREE.Vector3, Q = THREE.Quaternion;
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const clamp = THREE.MathUtils.clamp;

const t1 = new V(), t2 = new V(), t3 = new V(), t4 = new V(), t5 = new V();
const pq = new Q(), pq2 = new Q(), dq = new Q(), rq = new Q();
const eu = new THREE.Euler();

/** Rotate a bone by a rotation given in the WORLD frame. */
function rotateWorld(b: THREE.Object3D, world: THREE.Quaternion) {
  b.parent!.getWorldQuaternion(pq);
  pq2.copy(pq).invert().multiply(world).multiply(pq);
  b.quaternion.premultiply(pq2);
}

/**
 * Analytic two-bone IK: put the hand (the wrist joint) on `target` (world), the elbow toward `pole` (a direction).
 * Reach is clamped, so a far target gives a straight arm pointing at it. Blended in by weight w (0 = untouched clip pose).
 * Needs fresh world matrices on entry; leaves them fresh.
 */
export function solveArm(a: ArmBones, target: THREE.Vector3, pole: THREE.Vector3, w: number) {
  if (w < 0.002) return;
  const sa = a.arm.quaternion.clone(), sf = a.fore.quaternion.clone();
  const A = a.arm.getWorldPosition(t1), B = a.fore.getWorldPosition(t2), C = a.hand.getWorldPosition(t3);
  const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
  t4.copy(target).sub(A);
  const dist = Math.max(1e-4, t4.length());
  const d = clamp(dist, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const u = t4.multiplyScalar(1 / dist);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const p = t5.copy(pole).addScaledVector(u, -pole.dot(u));
  if (p.lengthSq() < 1e-6) p.set(0, -1, 0).addScaledVector(u, u.y);
  p.normalize();
  // Where the elbow should be, and where the wrist ends up (on the line to the target at reach d).
  const Bn = new V().copy(A).addScaledVector(u, along).addScaledVector(p, h);
  const Tn = new V().copy(A).addScaledVector(u, d);
  dq.setFromUnitVectors(t4.copy(B).sub(A).normalize(), new V().copy(Bn).sub(A).normalize());
  rotateWorld(a.arm, dq);
  a.arm.updateMatrixWorld(true);
  const B2 = a.fore.getWorldPosition(t2), C2 = a.hand.getWorldPosition(t3);
  dq.setFromUnitVectors(t4.copy(C2).sub(B2).normalize(), new V().copy(Tn).sub(B2).normalize());
  rotateWorld(a.fore, dq);
  if (w < 0.999) {
    a.arm.quaternion.slerpQuaternions(sa, a.arm.quaternion.clone(), w);
    a.fore.quaternion.slerpQuaternions(sf, a.fore.quaternion.clone(), w);
  }
  a.arm.updateMatrixWorld(true);
}

/** Talking-hand variations (seeded), like BEATS in animator.ts: which hands, how far forward/out/up. */
const BEATS: { l: number; r: number; fwd: number; out: number; up: number }[] = [
  { l: 0, r: 1, fwd: 0.15, out: 0.07, up: -0.05 },
  { l: 1, r: 0, fwd: 0.15, out: 0.07, up: -0.05 },
  { l: 1, r: 1, fwd: 0.13, out: 0.1, up: -0.08 },
  { l: 0, r: 1, fwd: 0.18, out: 0.04, up: 0.0 },
  { l: 0, r: 0, fwd: 0.15, out: 0.07, up: -0.05 },
];

export class GlbTeacherAnimator implements ActorAnimator {
  private time = 0;
  private queue: { turnId: number; command: SceneCommand }[] = [];
  private active: Active | null = null;
  private yaw = 0;
  private thoughtTurn = -1;
  private lastTurn = -1;
  private lastState: TeacherState = "offline";
  private stateTime = 0;
  private react = 0;
  private beat = 4;
  private beatAt = 0;
  private seed = 1234567;
  private announced = -1;
  private lookObject: string | null = null;
  private mixer: THREE.AnimationMixer;
  private ch: { upper: Channel; lower: Channel };
  private modBones: THREE.Bone[];
  private base: THREE.Quaternion[];
  private armW = { L: 0, R: 0 };
  private armT = { L: new V(), R: new V() };
  private hipRestY: number;
  private jointBase = 0;
  private stoolK = 0;
  private lookYaw = 0;
  pointed: string | null = null;
  debug = { mouthOpen: 0, walking: false, gesture: null as string | null, action: null as string | null, pointing: null as string | null, upper: "idle", lower: "idle" };

  constructor(private rig: GlbRig) {
    rig.root.position.set(-0.15, 0, -0.7);
    this.mixer = new THREE.AnimationMixer(rig.model);
    this.ch = { upper: new Channel(this.mixer, "upper"), lower: new Channel(this.mixer, "lower") };
    const b = rig.bones;
    this.modBones = [b.spine1, b.neck, b.head, b.left.arm, b.left.fore, b.right.arm, b.right.fore];
    this.base = this.modBones.map((o) => o.quaternion.clone());
    this.hipRestY = b.hips.position.y;
    this.applyLayers({ lower: "idle", upper: "idle", upperFrom: 0, lowerFrom: 0, loop: true, fade: 0, timeScale: 1 });
    this.mixer.update(0);
    rig.root.updateMatrixWorld(true);
    this.jointBase = this.lowestJoint();
  }

  /** Stop every action and release the mixer's bindings so a discarded animator leaves the shared bones at rest. */
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.rig.model); }

  /** Lowest foot joint, in the root's local height (so it does not depend on where the root currently is). */
  private lowestJoint(): number {
    let min = Infinity;
    this.rig.root.getWorldPosition(t4);
    for (const f of this.rig.bones.feet) { f.getWorldPosition(t5); min = Math.min(min, t5.y - t4.y); }
    return min;
  }

  place(x: number, z: number, faceYaw = 0) {
    this.rig.root.position.set(x, 0, z);
    this.yaw = faceYaw;
    this.rig.root.rotation.y = faceYaw;
    this.active = null;
    this.queue = [];
    this.pointed = null;
    this.lookObject = null;
    this.armW.L = this.armW.R = 0;
    this.rig.holderOffset(0);
  }

  walkTarget(): THREE.Vector3 | null {
    return this.active?.kind === "walk" ? this.active.to : null;
  }

  gestureNow(gesture: Gesture) {
    if (!gesturePlan(gesture)) return;
    this.active = { kind: "gesture", gesture, t: 0, turnId: this.lastTurn };
  }

  private rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private applyLayers(l: Layer) {
    const c = this.rig.clips;
    this.ch.upper.play(c.get(l.upper)!.upper, { from: l.upperFrom, loop: l.loop, fade: l.fade, timeScale: l.timeScale });
    this.ch.lower.play(c.get(l.lower)!.lower, { from: l.lowerFrom, loop: l.loop, fade: l.fade, timeScale: l.timeScale });
    this.debug.upper = l.upper;
    this.debug.lower = l.lower;
  }

  /** Rotation given in the character's own frame (x pitch, y yaw, z roll), applied to a bone on top of the clip pose. */
  private addRot(b: THREE.Object3D, x: number, y: number, z: number) {
    if (!x && !y && !z) return;
    this.rig.root.getWorldQuaternion(rq);
    eu.set(x, y, z);
    dq.setFromEuler(eu);
    dq.premultiply(rq).multiply(rq.invert());
    rotateWorld(b, dq);
  }

  update(f: FrameInput) {
    const dt = Math.min(f.dt, 0.1);
    this.time += dt;
    const { rig } = this;
    const b = rig.bones;

    // --- turn / state bookkeeping (same rules as TeacherAnimator) ------------------------------
    if (f.turnId !== this.lastTurn) {
      this.queue = [];
      this.active = null;
      this.pointed = null;
      this.lookObject = null;
      if (f.interrupted) this.react = 0.45;
      this.lastTurn = f.turnId;
    }
    if (f.state !== this.lastState) {
      if (f.state === "thinking" && !this.active) this.active = { kind: "gesture", gesture: "nod", t: 0.5, turnId: f.turnId };
      this.lastState = f.state;
      this.stateTime = 0;
    }
    this.stateTime += dt;
    if (f.state === "listening" && this.active?.kind === "act") this.active = null;
    this.react = Math.max(0, this.react - dt);

    for (const d of f.takeDirectives()) if (d.turnId === f.turnId) this.queue.push(d);
    if (f.state === "listening" && this.queue.some((d) => d.command.name === "act")) this.queue = this.queue.filter((d) => d.command.name !== "act");
    if (!this.active && this.queue.length) this.begin(this.queue.shift()!, f);

    const red = f.reducedMotion;
    const m = red ? 0.35 : 1;

    // --- locomotion --------------------------------------------------------------------------------
    let walking: "walk" | "run" | null = null;
    let walkScale = 1;
    let desiredYaw = Math.atan2(f.camera.x - rig.root.position.x, f.camera.z - rig.root.position.z);
    if (this.active?.kind === "walk") {
      v1.copy(this.active.to).sub(rig.root.position).setY(0);
      const dist = v1.length();
      if (dist < 0.04) this.active = null;
      else {
        // The clip's own speed decides how fast we move, so the planted foot does not skate. Long walks speed up a little.
        const want = 1.0 + Math.min(dist, 5) * 0.18;
        const useRun = !red && want > rig.stride.walk * 1.5;
        const stride = useRun ? rig.stride.run : rig.stride.walk;
        walkScale = clamp(want / Math.max(0.2, stride), 0.6, 1.5);
        walking = useRun ? "run" : "walk";
        const step = Math.min(dist, walkScale * stride * dt);
        rig.root.position.addScaledVector(v1.normalize(), step);
        desiredYaw = Math.atan2(v1.x, v1.z);
      }
    }

    // --- pointing ------------------------------------------------------------------------------------
    let pointArm: ArmSide | null = null;
    let pointWorld: THREE.Vector3 | null = null;
    if (this.active?.kind === "point") {
      this.active.t += dt;
      pointWorld = f.resolveTarget(this.active.target);
      if (!pointWorld || this.active.t > 3.0) {
        this.active = null;
        this.pointed = null;
        pointWorld = null;
      } else {
        const toT = Math.atan2(pointWorld.x - rig.root.position.x, pointWorld.z - rig.root.position.z);
        const rel = wrap(toT - desiredYaw);
        // The body turns only a little (about 25 degrees at most) so the face stays toward the child; the arm does the aiming (IK below).
        desiredYaw = desiredYaw + clamp(rel, -0.45, 0.45);
        pointArm = rel > 0 ? "L" : "R";
        this.pointed = this.active.t > 0.35 ? this.active.target : null;
        this.lookObject = this.active.t < 0.5 ? this.active.target : null; // a short glance; then the face is back toward the child
      }
    } else if (this.active?.kind !== "gesture") this.lookObject = null;

    this.yaw += wrap(desiredYaw - this.yaw) * damp(walking ? 9 : 5, dt);
    rig.root.rotation.y = this.yaw;

    // --- voice level, beats ----------------------------------------------------------------------------
    const level = clamp((f.outputLevel - 0.01) * 9, 0, 1);
    const t = this.time;
    if (f.state === "speaking" && t > this.beatAt) {
      let next = Math.floor(this.rand() * BEATS.length);
      if (next === this.beat) next = (next + 1) % BEATS.length;
      this.beat = next;
      this.beatAt = t + 1.6 + this.rand() * 1.4;
    }
    if (f.state === "thinking" && this.stateTime > 1.1 && !this.active && this.thoughtTurn !== f.turnId) {
      this.thoughtTurn = f.turnId;
      this.active = { kind: "gesture", gesture: "think", t: 0, turnId: f.turnId };
    }

    // --- gesture / act clocks ------------------------------------------------------------------------------
    let gesture: Gesture | null = null;
    let act: Action | null = null;
    let actU = 0, actNom = 1, actEnv = 0;
    if (this.active?.kind === "gesture") {
      this.active.t += dt;
      gesture = this.active.gesture;
      if (this.active.t > GESTURE_SEC[gesture]) { this.active = null; gesture = null; }
    }
    if (this.active?.kind === "act") {
      const a = this.active;
      const dur = ACTION_SEC[a.action] * (red ? 0.5 : 1);
      a.t += dt;
      actNom = ACTION_SEC[a.action];
      actU = a.t * (actNom / dur);
      actEnv = Math.max(0, Math.min(1, actU / 0.4, (actNom - actU) / 0.4));
      act = a.action;
      if (a.t >= dur) { this.active = null; act = null; }
    }

    // --- clip layers --------------------------------------------------------------------------------------------
    const layer = chooseLayers({ walking, walkSpeedScale: walkScale, act, gesture, reducedMotion: red });
    if (act === "jump") {
      const clip = rig.clips.get("jump")!.full;
      layer.timeScale *= fitTimeScale(clip.duration, ACTION_SEC.jump * (red ? 0.5 : 1));
    }
    this.applyLayers(layer);

    // --- run the mixer, then draw on top ------------------------------------------------------------------------
    // Bones we adjust by hand are put back to what the mixer last wrote, so offsets never pile up frame after frame.
    this.modBones.forEach((o, i) => o.quaternion.copy(this.base[i]));
    this.mixer.update(dt);
    this.modBones.forEach((o, i) => this.base[i].copy(o.quaternion));
    const hips = b.hips;
    // Small motion: the vertical travel of a jump or climb shrinks to a tenth (the legs still tuck, so the feet peak about 0.14 m off the floor in a small-motion jump vs about 0.3-0.4 normally; a sit must keep its full drop or the legs would hang in the air).
    if (red && (act === "jump" || act === "climb")) hips.position.y = this.hipRestY + (hips.position.y - this.hipRestY) * 0.1;
    rig.root.updateMatrixWorld(true);

    // Arms by IK.
    const want = { L: { w: 0, t: new V() } as ArmWant, R: { w: 0, t: new V() } as ArmWant };
    this.armTargets(f, want, { gesture, gestureT: this.active?.kind === "gesture" ? this.active.t : 0, act, actU, actEnv, walking: !!walking, pointArm, pointWorld, level, m });
    const pole = new V(0, -1, -0.5);
    for (const side of ["L", "R"] as const) {
      const arms = side === "L" ? b.left : b.right;
      const w = this.armW[side];
      const nw = w + (want[side].w - w) * damp(want[side].w > w ? 9 : 7, dt);
      this.armW[side] = nw < 0.003 && want[side].w === 0 ? 0 : nw;
      if (this.armW[side] > 0.003) {
        if (w < 0.003) this.armT[side].copy(want[side].t); else this.armT[side].lerp(want[side].t, damp(16, dt));
        rig.root.getWorldQuaternion(rq);
        const out = side === "L" ? 1 : -1;
        // Pointing: the elbow stays out to the side and low, so the raised arm never crosses the face. Everything else keeps the relaxed elbow.
        if (this.active?.kind === "point") pole.set(out * 1, -0.5, -0.1).applyQuaternion(rq);
        else pole.set(out * 0.45, -1, -0.5).applyQuaternion(rq);
        solveArm(arms, this.armT[side], pole, this.armW[side]);
      }
    }

    // Body language on top of the clip: breathing is in the idle clip; here the conversation state.
    const spineK = f.state === "listening" ? 0.07 : f.state === "speaking" ? 0.03 + level * 0.03 : f.state === "thinking" ? -0.02 : 0;
    this.addRot(b.spine1, spineK * (red ? 0.5 : 1) + (this.react > 0 ? 0.1 * (this.react / 0.45) : 0), f.state === "speaking" ? Math.sin(t * 0.7) * 0.04 * m : 0, 0);
    let hp = 0, hy = 0, hr = 0;
    if (f.state === "speaking") { hp += Math.sin(t * 2.6) * 0.03 * m + level * 0.04; hy += Math.sin(t * 0.9) * 0.05 * m; }
    else if (f.state === "listening") { const inL = clamp(f.inputLevel * 8, 0, 1); hp += Math.sin(t * 3.1) * 0.035 * (0.4 + inL) * m; hr += 0.08; }
    else if (f.state === "thinking") { hp += Math.sin(t * 1.3) * 0.02 - 0.1; hy += 0.28; hr -= 0.06; }
    if (this.react > 0) hp -= 0.08 * (this.react / 0.45);
    if (gesture === "nod") hp += Math.max(0, Math.sin(this.active?.kind === "gesture" ? this.active.t * 9 : 0)) * 0.28 * (red ? 0.6 : 1);
    if (gesture === "shrug") hr += 0.14;
    if (act === "eat") hp += 0.05 * smooth(actU) + (0.1 + Math.abs(Math.sin(actU * 10)) * 0.12) * (actU > 0.5 && actU < actNom - 0.4 ? 1 : 0) * 0.5 * m;

    // Look at the child (or the thing being pointed at), clamped; split between neck and head.
    const lookAt = (this.lookObject && f.resolveTarget(this.lookObject)) || f.camera;
    b.head.getWorldPosition(t1);
    t2.copy(lookAt).sub(t1);
    const lookYaw = clamp(wrap(Math.atan2(t2.x, t2.z) - this.yaw), -1.0, 1.0) * (this.lookObject ? 0.5 : 1);
    const lookPitch = clamp(-Math.atan2(t2.y, Math.hypot(t2.x, t2.z)), -0.45, 0.45);
    const away = f.state === "thinking" && !this.lookObject;
    this.lookYaw += ((away ? 0 : lookYaw) - this.lookYaw) * damp(8, dt);
    const lp = away ? 0 : lookPitch;
    if (!(act === "swim")) {
      this.addRot(b.neck, lp * 0.35, this.lookYaw * 0.4, 0);
      this.addRot(b.head, hp + lp * 0.45, hy + this.lookYaw * 0.45, hr);
    }
    rig.root.updateMatrixWorld(true);

    // --- ground: the feet decide the height (jumps lift the root, so root.position.y is the jump height) --------
    const ground = f.groundY ? f.groundY(rig.root.position.x, rig.root.position.z) : 0;
    const air = clamp(this.lowestJoint() - this.jointBase, -0.3, 1.5);
    // Only a jump, a climb or a swim count as "in the air": the feet really leave the floor and root.position.y is the height. A run clip has
    // a flight phase in every stride, a walk has a lifted foot, and both are just the animation; they must not make the reported height
    // jump around (or hold a 0.1 m "height" while the clip fades back to idle). The body itself looks the same either way, because the
    // root rises by exactly what the holder drops. Feet below the floor are always lifted back up.
    const airborne = act === "jump" || act === "climb" || act === "swim";
    rig.root.position.y = ground + (airborne ? Math.max(0, air) : 0);
    rig.holderOffset(airborne ? -air : -Math.min(0, air));
    // Pretend stool under the sit clip (the clip sits at chair height).
    this.stoolK += ((act === "sit" ? 1 : 0) - this.stoolK) * damp(10, dt);
    rig.stool.visible = this.stoolK > 0.02;
    rig.stool.scale.set(1, Math.max(0.001, 0.5 * this.stoolK), 1);
    rig.stool.position.set(0, 0.25 * this.stoolK, -0.12);

    rig.helmet.visible = f.helmet;

    // --- telemetry -------------------------------------------------------------------------------------------------
    if (this.announced !== f.turnId && (f.state === "speaking" || (this.active && f.state !== "thinking"))) {
      this.announced = f.turnId;
      f.onFirstAnimation(f.turnId);
    }
    this.debug.mouthOpen = 0; // no mouth on these models
    this.debug.walking = !!walking;
    this.debug.gesture = this.active?.kind === "gesture" ? this.active.gesture : null;
    this.debug.action = this.active?.kind === "act" ? this.active.action : null;
    this.debug.pointing = this.active?.kind === "point" ? this.active.target : null;
  }

  private begin(d: { turnId: number; command: SceneCommand }, f: FrameInput) {
    const c = d.command;
    switch (c.name) {
      case "moveTeacherTo": {
        const spot = f.resolveSpot(c.spot);
        // A spot must be two real numbers: a lookup that returned something odd (a prototype object) is not a place to walk to.
        if (Array.isArray(spot) && Number.isFinite(spot[0]) && Number.isFinite(spot[1])) this.active = { kind: "walk", to: new THREE.Vector3(spot[0], 0, spot[1]), turnId: d.turnId };
        break;
      }
      case "pointAt":
        if (f.resolveTarget(c.target)) this.active = { kind: "point", target: c.target, t: 0, turnId: d.turnId };
        break;
      case "gesture":
        // Same rule as acts: only gestures that have a plan are played, so an unknown id can never leave a gesture "running".
        if (gesturePlan(c.gesture)) this.active = { kind: "gesture", gesture: c.gesture, t: 0, turnId: d.turnId };
        break;
      case "act":
        // Only the seven known acts have a plan; anything else is ignored here even if it got past the validator.
        if (actPlan(c.action)) this.active = { kind: "act", action: c.action, t: 0, turnId: d.turnId };
        break;
      case "inviteTap":
        if (f.resolveTarget(c.target)) this.active = { kind: "point", target: c.target, t: 0.6, turnId: d.turnId };
        break;
      case "writeOnBoard":
        this.lookObject = "board";
        this.active = { kind: "gesture", gesture: "nod", t: 0.6, turnId: d.turnId };
        break;
    }
  }

  /** Where each hand should be this frame (world), and how strongly the IK owns the arm. Offsets are in model units. */
  private armTargets(
    f: FrameInput, want: { L: ArmWant; R: ArmWant },
    c: { gesture: Gesture | null; gestureT: number; act: Action | null; actU: number; actEnv: number; walking: boolean; pointArm: ArmSide | null; pointWorld: THREE.Vector3 | null; level: number; m: number },
  ) {
    const { rig } = this;
    const k = rig.scale;
    rig.root.getWorldQuaternion(rq);
    const shoulder = (s: ArmSide, out: THREE.Vector3) => (s === "L" ? rig.bones.left : rig.bones.right).arm.getWorldPosition(out);
    // Offset from a side's shoulder in the character's frame: out (away from the body), up, forward.
    const rel = (s: ArmSide, out: number, up: number, fwd: number) => shoulder(s, new V()).add(new V((s === "L" ? 1 : -1) * out, up, fwd).multiplyScalar(k).applyQuaternion(rq));
    const set = (s: ArmSide, w: number, tgt: THREE.Vector3) => { want[s].w = Math.max(want[s].w, w); want[s].t.copy(tgt); };
    const head = rig.bones.head.getWorldPosition(new V());
    const mouth = () => head.clone().add(new V(0, 0.045, 0.1).multiplyScalar(k).applyQuaternion(rq));
    const m = c.m;

    if (c.pointArm && c.pointWorld) {
      // The body only turns a little, so a board BEHIND the teacher would put the arm straight along the line of sight (a hand in front of the
      // face). Swing the arm out to the side until it is at least ~55 degrees out from the line of sight: it still points at the board from the
      // child's side of the room, and it never crosses the face.
      const sh = shoulder(c.pointArm, new V());
      const dir = c.pointWorld.clone().sub(sh).normalize();
      const q = rq.clone().invert();
      const local = dir.clone().applyQuaternion(q); // x = toward the character's left
      const sideSign = c.pointArm === "L" ? 1 : -1;
      const minSide = 0.85;
      if (local.x * sideSign < minSide) {
        local.x = sideSign * minSide;
        const rest = Math.sqrt(Math.max(0, 1 - minSide * minSide)), yz = Math.hypot(local.y, local.z) || 1;
        local.y = (local.y / yz) * rest; local.z = (local.z / yz) * rest;
      }
      const aim = sh.clone().add(local.applyQuaternion(rq).multiplyScalar(Math.max(0.5, sh.distanceTo(c.pointWorld))));
      set(c.pointArm, smooth(Math.min(1, (this.active?.kind === "point" ? this.active.t : 0) / 0.35)), aim);
      return;
    }
    if (c.act === "eat") {
      // Hand to the mouth and back, left hand held at the chest. TODO: replace with a real eating clip and a snack prop.
      const cyc = 0.5 - 0.5 * Math.cos((c.actU / 1.7) * Math.PI * 2);
      const up = smooth(cyc * 1.6) * c.actEnv;
      const low = rel("R", 0.08, -0.05, 0.14);
      set("R", c.actEnv, low.lerp(mouth(), up));
      set("L", c.actEnv * 0.8, rel("L", 0.05, -0.02, 0.15));
      return;
    }
    if (c.act || c.walking) return;
    if (c.gesture) {
      const gp = gesturePlan(c.gesture);
      const e = smooth(Math.min(1, c.gestureT / 0.3)) * smooth(Math.min(1, (GESTURE_SEC[c.gesture] - c.gestureT) / 0.3));
      if (gp?.kind === "ik") {
        switch (gp.pose) {
          case "wave": set("R", e, rel("R", 0.07 + Math.sin(c.gestureT * 11) * 0.06 * m, 0.17, 0.07)); break;
          case "think": set("R", e, mouth().add(new V(0, -0.03 * k, 0.0).applyQuaternion(rq))); set("L", e * 0.7, rel("L", 0.04, -0.06, 0.16)); break;
          case "open_hands": set("L", e, rel("L", 0.1, -0.03, 0.17)); set("R", e, rel("R", 0.1, -0.03, 0.17)); break;
          case "shrug": set("L", e, rel("L", 0.17 * Math.max(m, 0.6), -0.07, 0.09)); set("R", e, rel("R", 0.17 * Math.max(m, 0.6), -0.07, 0.09)); break;
        }
      }
      return;
    }
    if (f.state === "speaking") {
      const bt = BEATS[this.beat];
      const pulse = c.level * 0.04 * m;
      if (bt.l) set("L", 0.75, rel("L", bt.out, bt.up + pulse, bt.fwd));
      if (bt.r) set("R", 0.75, rel("R", bt.out, bt.up + pulse, bt.fwd));
    }
  }
}

const v1 = new V();

/** One layer of the mixer: crossfades between clips, remembers what is playing. */
class Channel {
  private key = "";
  private action: THREE.AnimationAction | null = null;
  constructor(private mixer: THREE.AnimationMixer, readonly name: string) {}
  play(clip: THREE.AnimationClip, o: { from: number; loop: boolean; fade: number; timeScale: number }) {
    const key = `${clip.name}|${o.from}|${o.loop}`;
    if (key === this.key && this.action) { this.action.setEffectiveTimeScale(o.timeScale); return; }
    const prev = this.action;
    const next = this.mixer.clipAction(clip);
    next.reset();
    next.time = o.from;
    next.setLoop(o.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = true;
    next.setEffectiveTimeScale(o.timeScale);
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next && o.fade > 0) prev.crossFadeTo(next, o.fade, false);
    else if (prev && prev !== next) prev.stop();
    this.key = key;
    this.action = next;
  }
}

