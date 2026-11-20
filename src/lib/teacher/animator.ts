import * as THREE from "three";
import type { JointName, TeacherRig } from "./rig";
import { JOINTS } from "./rig";
import type { TeacherState } from "./stateMachine";
import type { Action, Gesture, SceneCommand } from "@/lib/scene/commands";

/**
 * Drives the rig every frame from conversation state + validated directives.
 * No clips: poses are joint-angle targets blended with exponential damping, so
 * any state can flow into any other without popping. Deterministic given its
 * inputs (the only randomness is a seeded LCG for blink/gesture variety).
 */
type Pose = Partial<Record<JointName, [number, number, number]>>;

const P: Record<string, Pose> = {
  idle: { shoulderL: [0.03, 0, 0.09], shoulderR: [0.03, 0, -0.09], elbowL: [-0.18, 0, 0], elbowR: [-0.18, 0, 0] },
  listening: {
    spine: [0.07, 0, 0], head: [0.02, 0, 0.09],
    shoulderL: [-0.32, 0, -0.2], shoulderR: [-0.32, 0, 0.2], elbowL: [-1.25, 0, -0.35], elbowR: [-1.25, 0, 0.35],
  },
  thinking: {
    spine: [-0.02, 0, 0], head: [-0.12, 0.3, -0.06],
    shoulderR: [-0.75, 0, 0.3], elbowR: [-2.05, 0, 0.1],
    shoulderL: [-0.2, 0, -0.3], elbowL: [-1.45, 0, -0.75],
  },
  speaking: { shoulderL: [-0.22, 0, 0.12], shoulderR: [-0.22, 0, -0.12], elbowL: [-1.0, 0, 0.1], elbowR: [-1.0, 0, -0.1] },
};

/** Talking-hand variations: cycled (seeded) so beats are not identical loops. */
const BEATS: Pose[] = [
  { shoulderR: [-0.5, 0, -0.3], elbowR: [-1.15, 0, -0.35] },
  { shoulderL: [-0.5, 0, 0.3], elbowL: [-1.15, 0, 0.35] },
  { shoulderL: [-0.4, 0, 0.35], shoulderR: [-0.4, 0, -0.35], elbowL: [-0.85, 0, 0.3], elbowR: [-0.85, 0, -0.3] },
  { shoulderR: [-0.9, 0, -0.15], elbowR: [-1.5, 0, 0] },
  {},
];

const GESTURE_SEC: Record<Gesture, number> = { wave: 1.9, nod: 1.2, thumbs_up: 1.6, shrug: 1.5, think: 1.8, open_hands: 1.7 };

/** Nominal seconds per action (halved with reduced motion). Pretend acting: nothing here moves the teacher across the floor. */
export const ACTION_SEC: Record<Action, number> = { run: 2.6, jump: 1.3, eat: 3.4, sit: 3.4, clap: 2.2, swim: 3.6, climb: 3.6 };
const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

type Active =
  | { kind: "walk"; to: THREE.Vector3; turnId: number }
  | { kind: "point"; target: string; t: number; turnId: number }
  | { kind: "gesture"; gesture: Gesture; t: number; turnId: number }
  | { kind: "act"; action: Action; t: number; turnId: number };

export interface FrameInput {
  dt: number;
  state: TeacherState;
  turnId: number;
  interrupted: boolean;
  outputLevel: number;
  inputLevel: number;
  camera: THREE.Vector3;
  reducedMotion: boolean;
  /** World position of a named, registered scene object. */
  resolveTarget(name: string): THREE.Vector3 | null;
  /** Floor position of a named spot in the current world. */
  resolveSpot(name: string): [number, number] | null;
  /** Space helmet on (field trips / space). */
  helmet: boolean;
  /** Height of the ground under a point (uneven terrain). */
  groundY?(x: number, z: number): number;
  takeDirectives(): { turnId: number; command: SceneCommand }[];
  onFirstAnimation(turnId: number): void;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const e1 = new THREE.Euler();
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class TeacherAnimator {
  private time = 0;
  private queue: { turnId: number; command: SceneCommand }[] = [];
  private active: Active | null = null;
  private yaw = 0;
  private thoughtTurn = -1;
  private lastTurn = -1;
  private lastState: TeacherState = "offline";
  private stateTime = 0;
  private react = 0; // interruption reaction timer
  private blinkAt = 2;
  private blink = 0;
  private mouthOpen = 0;
  private beat = 4;
  private beatAt = 0;
  private walkPhase = 0;
  private bob = 0;
  private lift = 0; // action height offset (jump arc, sit, climb)
  private actPhase = 0;
  private chew = 0;
  private snapGround = false;
  private footBase: number;
  private pt = new THREE.Vector3();
  private seed = 1234567;
  private announced = -1;
  private lookObject: string | null = null;
  /** Read by the scene to highlight the object being pointed at. */
  pointed: string | null = null;
  /** For tests / dev panel. */
  debug = { mouthOpen: 0, walking: false, gesture: null as string | null, action: null as string | null, pointing: null as string | null };

  constructor(private rig: TeacherRig) {
    rig.root.position.set(-0.15, 0, -0.7);
    rig.root.updateMatrixWorld(true);
    this.footBase = this.lowest() - rig.root.position.y; // sole height below the root when standing
  }

  /**
   * World height of the lowest of a few reference points (both soles' corners, the knees, the pelvis).
   * A handful of points instead of a bounding box of the whole rig, so it is cheap enough for every frame.
   * Needs up-to-date world matrices.
   */
  private lowest(): number {
    const J = this.rig.joints;
    let min = Infinity;
    for (const k of [J.kneeL, J.kneeR]) {
      for (const [y, z] of [[-0.5055, 0.18], [-0.5055, -0.09]]) min = Math.min(min, k.localToWorld(this.pt.set(0, y, z)).y);
      min = Math.min(min, k.localToWorld(this.pt.set(0, -0.07, 0)).y);
    }
    return Math.min(min, J.hips.localToWorld(this.pt.set(0, -0.178, 0)).y);
  }

  /** Teleport (used during a world change, while the view is hidden). Cancels any action. */
  place(x: number, z: number, faceYaw = 0) {
    this.rig.root.position.set(x, 0, z);
    this.yaw = faceYaw;
    this.rig.root.rotation.y = faceYaw;
    this.active = null;
    this.queue = [];
    this.pointed = null;
    this.lookObject = null;
    this.lift = 0; this.snapGround = false; this.actPhase = 0; this.chew = 0;
  }

  /** Where the teacher is walking to, or null when standing (the camera leads the walk). */
  walkTarget(): THREE.Vector3 | null {
    return this.active?.kind === "walk" ? this.active.to : null;
  }

  /** Play a gesture right now, outside the conversation (onboarding preview). */
  gestureNow(gesture: Gesture) {
    this.active = { kind: "gesture", gesture, t: 0, turnId: this.lastTurn };
  }

  private rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  update(f: FrameInput) {
    const dt = Math.min(f.dt, 0.1);
    this.time += dt;
    const { rig } = this;
    const J = rig.joints;

    // --- turn / state bookkeeping -------------------------------------------------
    if (f.turnId !== this.lastTurn) {
      // New turn: everything queued or playing for the old one is obsolete.
      this.queue = [];
      this.active = null;
      this.pointed = null;
      this.lookObject = null;
      if (f.interrupted) this.react = 0.45;
      this.lastTurn = f.turnId;
    }
    if (f.state !== this.lastState) {
      // The child just finished talking: a small nod says "got it" straight away,
      // before any answer exists. A visual acknowledgement, never fake speech.
      if (f.state === "thinking" && !this.active) this.active = { kind: "gesture", gesture: "nod", t: 0.5, turnId: f.turnId };
      this.lastState = f.state;
      this.stateTime = 0;
    }
    this.stateTime += dt;
    // The child is speaking: stop acting at once and attend.
    if (f.state === "listening" && this.active?.kind === "act") this.active = null;
    this.react = Math.max(0, this.react - dt);

    for (const d of f.takeDirectives()) if (d.turnId === f.turnId) this.queue.push(d);
    // An action never starts for a frame while the child is speaking.
    if (f.state === "listening" && this.queue.some((d) => d.command.name === "act")) this.queue = this.queue.filter((d) => d.command.name !== "act");
    if (!this.active && this.queue.length) this.begin(this.queue.shift()!, f);

    // --- locomotion ----------------------------------------------------------------
    let walking = false;
    let desiredYaw = Math.atan2(f.camera.x - rig.root.position.x, f.camera.z - rig.root.position.z);
    if (this.active?.kind === "walk") {
      v1.copy(this.active.to).sub(rig.root.position).setY(0);
      const dist = v1.length();
      if (dist < 0.04) this.active = null;
      else {
        walking = true;
        // Long walks speed up a little so the child is not kept waiting.
        const step = Math.min(dist, (1.0 + Math.min(dist, 5) * 0.18) * dt);
        rig.root.position.addScaledVector(v1.normalize(), step);
        desiredYaw = Math.atan2(v1.x, v1.z);
        this.walkPhase += dt * 6.2;
      }
    }

    // --- pointing ------------------------------------------------------------------
    let pointArm: "L" | "R" | null = null;
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
        // Turn the body part-way to the object, keep the face available to the child.
        desiredYaw = desiredYaw + THREE.MathUtils.clamp(rel, -2.2, 2.2) * 0.4;
        pointArm = rel > 0 ? "L" : "R"; // +yaw is toward +X, the character's left
        this.pointed = this.active.t > 0.35 ? this.active.target : null;
        // Look at the object first, then back to the child.
        this.lookObject = this.active.t < 1.1 ? this.active.target : null;
      }
    } else if (this.active?.kind !== "gesture") this.lookObject = null;

    this.yaw += wrap(desiredYaw - this.yaw) * damp(walking ? 9 : 5, dt);
    rig.root.rotation.y = this.yaw;

    // --- base pose -----------------------------------------------------------------
    const stateKey = f.state === "offline" ? "idle" : f.state;
    const pose: Pose = { ...P[stateKey] };
    const off: Pose = {};
    const add = (j: JointName, x: number, y: number, z: number) => {
      const o = off[j] ?? (off[j] = [0, 0, 0]);
      o[0] += x; o[1] += y; o[2] += z;
    };
    const m = f.reducedMotion ? 0.35 : 1;
    const t = this.time;

    // Always alive: breathing + slow weight shift.
    add("chest", Math.sin(t * 1.5) * 0.018 * m, 0, 0);
    add("hips", 0, 0, Math.sin(t * 0.45) * 0.022 * m);
    add("spine", 0, 0, -Math.sin(t * 0.45) * 0.03 * m);

    const level = THREE.MathUtils.clamp((f.outputLevel - 0.01) * 9, 0, 1);

    if (f.state === "speaking") {
      // Emphasis beats follow the voice; the hand shape changes every ~2 s.
      if (t > this.beatAt) {
        let next = Math.floor(this.rand() * BEATS.length);
        if (next === this.beat) next = (next + 1) % BEATS.length;
        this.beat = next;
        this.beatAt = t + 1.6 + this.rand() * 1.4;
      }
      Object.assign(pose, BEATS[this.beat]);
      const pulse = level * 0.22 * m;
      add("elbowL", -pulse, 0, 0);
      add("elbowR", -pulse, 0, 0);
      add("head", Math.sin(t * 2.6) * 0.03 * m + level * 0.04, Math.sin(t * 0.9) * 0.05 * m, 0);
      add("spine", 0.03, Math.sin(t * 0.7) * 0.04 * m, 0);
    } else if (f.state === "listening") {
      // Small nods that follow the child's voice.
      const inL = THREE.MathUtils.clamp(f.inputLevel * 8, 0, 1);
      add("head", Math.sin(t * 3.1) * 0.035 * (0.4 + inL) * m, 0, 0.07);
      // Lean in and tilt the head: visibly listening, not waiting.
      add("spine", 0.07, 0, 0);
    } else if (f.state === "thinking") {
      add("head", Math.sin(t * 1.3) * 0.02, 0, 0);
      // Still thinking after a beat: hand to chin, once per turn.
      if (this.stateTime > 1.1 && !this.active && this.thoughtTurn !== f.turnId) {
        this.thoughtTurn = f.turnId;
        this.active = { kind: "gesture", gesture: "think", t: 0, turnId: f.turnId };
      }
    }
    if (this.react > 0) {
      // Interrupted: stop, straighten, attend.
      const k = this.react / 0.45;
      add("spine", 0.1 * k, 0, 0);
      add("head", -0.08 * k, 0, 0);
    }

    // --- gesture overlay -------------------------------------------------------------
    if (this.active?.kind === "gesture") {
      const g = this.active;
      g.t += dt;
      const dur = GESTURE_SEC[g.gesture];
      const w = Math.sin(g.t * 11);
      switch (g.gesture) {
        case "wave":
          pose.shoulderR = [0, 0, -2.25]; pose.elbowR = [0, 0, -0.55 + w * 0.42];
          break;
        case "nod":
          add("head", Math.max(0, Math.sin(g.t * 9)) * 0.28, 0, 0);
          break;
        case "thumbs_up":
          pose.shoulderR = [-0.95, 0, -0.25]; pose.elbowR = [-1.35, 0, 0];
          break;
        case "shrug":
          pose.shoulderL = [-0.25, 0, 0.5]; pose.shoulderR = [-0.25, 0, -0.5];
          pose.elbowL = [-1.5, 0, 0.75]; pose.elbowR = [-1.5, 0, -0.75];
          add("head", 0, 0, 0.14); add("chest", -0.04, 0, 0);
          break;
        case "think":
          Object.assign(pose, P.thinking);
          break;
        case "open_hands":
          pose.shoulderL = [-0.55, 0, 0.5]; pose.shoulderR = [-0.55, 0, -0.5];
          pose.elbowL = [-0.8, 0, 0.35]; pose.elbowR = [-0.8, 0, -0.35];
          break;
      }
      if (g.t > dur) this.active = null;
    }

    // --- walking overlay -------------------------------------------------------------
    if (walking) {
      const s = Math.sin(this.walkPhase), c = Math.cos(this.walkPhase);
      pose.thighL = [-s * 0.5, 0, 0]; pose.thighR = [s * 0.5, 0, 0];
      pose.kneeL = [Math.max(0, c) * 0.75, 0, 0]; pose.kneeR = [Math.max(0, -c) * 0.75, 0, 0];
      pose.shoulderL = [s * 0.4, 0, 0.08]; pose.shoulderR = [-s * 0.4, 0, -0.08];
      pose.elbowL = [-0.35, 0, 0]; pose.elbowR = [-0.35, 0, 0];
      this.bob = Math.abs(Math.sin(this.walkPhase)) * 0.018;
    } else this.bob += (0 - this.bob) * damp(10, dt);

    // --- action overlay (run, jump, eat, sit, clap, swim, climb) -----------------------
    let liftTarget = 0, liftK = 12, chewTarget = 0, snap = false;
    if (this.active?.kind === "act") {
      const a = this.active;
      const red = f.reducedMotion;
      const dur = ACTION_SEC[a.action] * (red ? 0.5 : 1);
      a.t += dt;
      const u = a.t * (ACTION_SEC[a.action] / dur); // time on the nominal timeline
      const nd = ACTION_SEC[a.action];
      const env = Math.min(1, u / 0.4, (nd - u) / 0.4); // ease in and out
      const e = Math.max(0, env);
      const amp = red ? 0.4 : 1;
      switch (a.action) {
        case "run": {
          this.actPhase += dt * (red ? 6.5 : 11);
          const s = Math.sin(this.actPhase), c = Math.cos(this.actPhase), k2 = amp * e;
          pose.thighL = [-s * 0.95 * k2 - 0.1, 0, 0]; pose.thighR = [s * 0.95 * k2 - 0.1, 0, 0];
          pose.kneeL = [Math.max(0, c) * 1.5 * k2, 0, 0]; pose.kneeR = [Math.max(0, -c) * 1.5 * k2, 0, 0];
          pose.shoulderL = [s * 0.9 * k2, 0, 0.1]; pose.shoulderR = [-s * 0.9 * k2, 0, -0.1];
          pose.elbowL = [-1.5 * e, 0, 0]; pose.elbowR = [-1.5 * e, 0, 0];
          add("spine", 0.22 * k2, 0, 0);
          liftTarget = Math.abs(s) * 0.06 * k2; liftK = 30;
          break;
        }
        case "jump": {
          // crouch 0-0.3, airborne 0.3-0.85, land 0.85-1.15, recover to 1.3
          const crouch = (d: number) => {
            pose.thighL = [-1.0 * d, 0, 0]; pose.thighR = [-1.0 * d, 0, 0];
            pose.kneeL = [1.9 * d, 0, 0]; pose.kneeR = [1.9 * d, 0, 0];
            snap = d > 0.02; // feet stay on the floor while the knees bend
          };
          const cd = red ? 0.3 : 1;
          if (u < 0.3) {
            const d = smooth(u / 0.3); crouch(d * cd);
            pose.shoulderL = [0.5 * d * cd, 0, 0.1]; pose.shoulderR = [0.5 * d * cd, 0, -0.1];
            pose.elbowL = [-0.3, 0, 0]; pose.elbowR = [-0.3, 0, 0];
          } else if (u < 0.85) {
            const q = (u - 0.3) / 0.55;
            liftTarget = 4 * (red ? 0.05 : 0.42) * q * (1 - q); liftK = 70;
            pose.thighL = [-0.35, 0, 0]; pose.thighR = [-0.35, 0, 0]; pose.kneeL = [0.7, 0, 0]; pose.kneeR = [0.7, 0, 0];
            const up = red ? -1.2 : -2.8;
            pose.shoulderL = [up, 0, 0.3]; pose.shoulderR = [up, 0, -0.3];
            pose.elbowL = [-0.2, 0, 0]; pose.elbowR = [-0.2, 0, 0];
          } else if (u < 1.3) {
            const p = (u - 0.85) / 0.45;
            crouch(Math.sin(Math.min(1, p) * Math.PI) * 0.7 * cd);
            pose.shoulderL = [-0.3, 0, 0.15]; pose.shoulderR = [-0.3, 0, -0.15];
          }
          break;
        }
        case "eat": {
          // Pretend food, no prop: hand to mouth, hand down, chew. Left hand holds the "snack" at the chest.
          const cyc = 0.5 - 0.5 * Math.cos((u / 1.7) * Math.PI * 2);
          const up = smooth(cyc * 1.6) * e;
          pose.shoulderR = [-0.55 - 0.65 * up, 0, -0.1 + 0.45 * up]; pose.elbowR = [-1.2 - 0.85 * up, 0, 0.3 * up];
          pose.shoulderL = [-0.5 * e, 0, 0.2]; pose.elbowL = [-1.3 * e, 0, -0.2];
          add("head", 0.05 * up, 0, 0);
          chewTarget = up > 0.8 ? (0.15 + Math.abs(Math.sin(u * 10)) * 0.3) * (red ? 0.6 : 1) : 0;
          break;
        }
        case "sit": {
          // On the floor, legs out in front (no chair needed, so it works in every world).
          const d = smooth(u / 0.9) * smooth((nd - u) / 0.8);
          pose.thighL = [-1.45 * d, 0, 0.08 * d]; pose.thighR = [-1.45 * d, 0, -0.08 * d];
          pose.kneeL = [0.12 * d, 0, 0]; pose.kneeR = [0.12 * d, 0, 0];
          pose.shoulderL = [-0.35 * d, 0, 0.2]; pose.shoulderR = [-0.35 * d, 0, -0.2];
          pose.elbowL = [-0.5 * d, 0, 0]; pose.elbowR = [-0.5 * d, 0, 0];
          snap = true;
          break;
        }
        case "clap": {
          const c = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 2.0); // 0 apart, 1 together
          const k2 = amp * e;
          pose.shoulderL = [-0.9 * e, 0, (0.45 - 1.1 * c) * k2]; pose.shoulderR = [-0.9 * e, 0, -(0.45 - 1.1 * c) * k2];
          pose.elbowL = [-1.35 * e, 0, 0]; pose.elbowR = [-1.35 * e, 0, 0];
          add("head", 0.04 * e, 0, 0);
          break;
        }
        case "swim": {
          // Face-down front crawl at hip height. Needs water scenery to look right; no world declares swim yet.
          this.actPhase += dt * (red ? 2.5 : 4.5);
          const ph = this.actPhase, k2 = amp * e;
          add("hips", 1.35 * e, 0, 0);
          add("neck", -0.35 * e, 0, 0); add("head", -0.95 * e, 0, 0);
          const TAU = Math.PI * 2; // arm angle -PI (reach forward) -> under -> back -> over; the two arms half a stroke apart
          pose.shoulderL = [(-Math.PI + (ph % TAU)) * e, 0, 0.1]; pose.shoulderR = [(-Math.PI + ((ph + Math.PI) % TAU)) * e, 0, -0.1];
          pose.elbowL = [-0.3 * e, 0, 0]; pose.elbowR = [-0.3 * e, 0, 0];
          pose.thighL = [Math.sin(ph * 3) * 0.28 * k2, 0, 0]; pose.thighR = [-Math.sin(ph * 3) * 0.28 * k2, 0, 0];
          pose.kneeL = [0.15 + Math.max(0, -Math.sin(ph * 3)) * 0.25 * k2, 0, 0]; pose.kneeR = [0.15 + Math.max(0, Math.sin(ph * 3)) * 0.25 * k2, 0, 0];
          liftTarget = Math.sin(ph * 1.5) * 0.03 * k2; liftK = 10;
          break;
        }
        case "climb": {
          // Hand-over-hand and step-up in place with a slow rise and return. Needs something climbable in the scene.
          this.actPhase += dt * (red ? 2 : 3.2);
          const sL = Math.sin(this.actPhase), k2 = amp * e;
          const reachL = 0.5 + 0.5 * sL, reachR = 0.5 - 0.5 * sL;
          pose.shoulderL = [-(1.3 + 1.2 * reachL) * e, 0, 0.15]; pose.shoulderR = [-(1.3 + 1.2 * reachR) * e, 0, -0.15];
          pose.elbowL = [-0.5 * e, 0, 0]; pose.elbowR = [-0.5 * e, 0, 0];
          pose.thighL = [-(0.2 + 0.8 * reachR) * k2, 0, 0]; pose.thighR = [-(0.2 + 0.8 * reachL) * k2, 0, 0];
          pose.kneeL = [1.2 * reachR * k2, 0, 0]; pose.kneeR = [1.2 * reachL * k2, 0, 0];
          add("spine", 0.12 * e, 0, 0);
          liftTarget = 0.28 * amp * Math.sin(Math.PI * Math.min(1, u / nd)); liftK = 10;
          break;
        }
      }
      if (a.t >= dur) this.active = null;
    }
    this.snapGround = snap;
    if (!snap) this.lift += (liftTarget - this.lift) * damp(liftK, dt);
    this.chew = chewTarget;
    const ground = f.groundY ? f.groundY(rig.root.position.x, rig.root.position.z) : 0;
    rig.root.position.y = ground + this.bob + this.lift;

    // --- head look (after yaw so it is relative to the body) ------------------------
    const lookAt = (this.lookObject && f.resolveTarget(this.lookObject)) || f.camera;
    J.head.getWorldPosition(v2);
    v1.copy(lookAt).sub(v2);
    const lookYaw = THREE.MathUtils.clamp(wrap(Math.atan2(v1.x, v1.z) - this.yaw), -1.0, 1.0);
    const lookPitch = THREE.MathUtils.clamp(-Math.atan2(v1.y, Math.hypot(v1.x, v1.z)), -0.45, 0.45);
    if (f.state !== "thinking" || this.lookObject) {
      add("neck", lookPitch * 0.35, lookYaw * 0.4, 0);
      add("head", lookPitch * 0.45, lookYaw * 0.45, 0);
    }

    // --- apply joints ----------------------------------------------------------------
    const acting = this.active?.kind === "act";
    const k = damp(this.react > 0 ? 16 : walking || acting ? 14 : 8, dt);
    for (const name of JOINTS) {
      if (pointArm && (name === `shoulder${pointArm}` || name === `elbow${pointArm}`)) continue;
      const p = pose[name], o = off[name];
      e1.set((p?.[0] ?? 0) + (o?.[0] ?? 0), (p?.[1] ?? 0) + (o?.[1] ?? 0), (p?.[2] ?? 0) + (o?.[2] ?? 0));
      q1.setFromEuler(e1);
      J[name].quaternion.slerp(q1, k);
    }

    // Bent legs (crouch, sit) are lowered until the lowest part of the body touches the ground again,
    // whatever the joint blend is doing this frame, so the feet never sink through or hover above the floor.
    if (this.snapGround) {
      rig.root.position.y = ground + this.bob + this.lift;
      rig.root.updateMatrixWorld(true);
      const dy = THREE.MathUtils.clamp(ground + this.footBase - this.lowest(), -0.2, 0.2);
      this.lift += dy;
      rig.root.position.y += dy;
    }

    // Pointing arm aims at the actual object position (overrides the pose).
    if (pointArm && pointWorld) {
      const sh = pointArm === "L" ? J.shoulderL : J.shoulderR;
      const el = pointArm === "L" ? J.elbowL : J.elbowR;
      sh.getWorldPosition(v2);
      v1.copy(pointWorld).sub(v2).normalize();
      sh.parent!.getWorldQuaternion(q2).invert();
      v1.applyQuaternion(q2);
      q1.setFromUnitVectors(DOWN, v1);
      sh.quaternion.slerp(q1, damp(10, dt));
      el.quaternion.slerp(q2.identity(), damp(10, dt));
    }

    // --- face ------------------------------------------------------------------------
    // Mouth: loudness-driven (NOT phoneme lip sync). Closed the moment we are not speaking.
    const targetOpen = Math.max(f.state === "speaking" ? level : 0, this.chew);
    this.mouthOpen += (targetOpen - this.mouthOpen) * damp(targetOpen > this.mouthOpen ? 38 : f.state === "speaking" ? 16 : 60, dt);
    const open = this.mouthOpen;
    rig.mouth.scale.set(1 - open * 0.25, 0.08 + open * 0.75, 0.3);
    rig.mouth.visible = open > 0.03;
    rig.smile.visible = !rig.mouth.visible;

    // Blink
    if (t > this.blinkAt) {
      this.blink = 0.14;
      this.blinkAt = t + 2.2 + this.rand() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);
    const lid = this.blink > 0 ? 0.12 : 1;
    rig.eyeL.scale.y += (lid - rig.eyeL.scale.y) * damp(45, dt);
    rig.eyeR.scale.y = rig.eyeL.scale.y;

    // Eyes carry the last part of the gaze; thinking looks up and away.
    const gx = f.state === "thinking" && !this.lookObject ? 0.008 : THREE.MathUtils.clamp(lookYaw * 0.012, -0.009, 0.009);
    const gy = f.state === "thinking" && !this.lookObject ? 0.007 : THREE.MathUtils.clamp(-lookPitch * 0.012, -0.006, 0.006);
    for (const p of [rig.pupilL, rig.pupilR]) {
      p.position.x += (gx - p.position.x) * damp(14, dt);
      p.position.y += (gy - p.position.y) * damp(14, dt);
    }
    // Brows: up when listening/interrupted, uneven when thinking.
    const browUp = f.state === "listening" || this.react > 0 ? 0.012 : f.state === "speaking" ? level * 0.006 : 0;
    rig.browL.position.y += (0.215 + browUp + (f.state === "thinking" ? 0.01 : 0) - rig.browL.position.y) * damp(12, dt);
    rig.browR.position.y += (0.215 + browUp - rig.browR.position.y) * damp(12, dt);

    rig.helmet.visible = f.helmet;

    // --- telemetry ---------------------------------------------------------------------
    // The "got it" nod and hand-to-chin while thinking are not the answer, so they never count as first animation.
    if (this.announced !== f.turnId && (f.state === "speaking" || (this.active && f.state !== "thinking"))) {
      this.announced = f.turnId;
      f.onFirstAnimation(f.turnId);
    }
    this.debug.mouthOpen = open;
    this.debug.walking = walking;
    this.debug.gesture = this.active?.kind === "gesture" ? this.active.gesture : null;
    this.debug.action = this.active?.kind === "act" ? this.active.action : null;
    this.debug.pointing = this.active?.kind === "point" ? this.active.target : null;
  }

  private begin(d: { turnId: number; command: SceneCommand }, f: FrameInput) {
    const c = d.command;
    switch (c.name) {
      case "moveTeacherTo": {
        const spot = f.resolveSpot(c.spot);
        if (spot) this.active = { kind: "walk", to: new THREE.Vector3(spot[0], 0, spot[1]), turnId: d.turnId };
        break;
      }
      case "pointAt":
        if (f.resolveTarget(c.target)) this.active = { kind: "point", target: c.target, t: 0, turnId: d.turnId };
        break;
      case "gesture":
        this.active = { kind: "gesture", gesture: c.gesture, t: 0, turnId: d.turnId };
        break;
      case "act":
        this.active = { kind: "act", action: c.action, t: 0, turnId: d.turnId };
        break;
      case "inviteTap":
        // Gesture toward the object the child should tap.
        if (f.resolveTarget(c.target)) this.active = { kind: "point", target: c.target, t: 0.6, turnId: d.turnId };
        break;
      case "writeOnBoard":
        // Board text itself is updated by the session controller; glance at it.
        this.lookObject = "board";
        this.active = { kind: "gesture", gesture: "nod", t: 0.6, turnId: d.turnId };
        break;
    }
  }
}
