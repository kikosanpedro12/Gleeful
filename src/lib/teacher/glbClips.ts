import * as THREE from "three";
import type { Action, Gesture } from "@/lib/scene/commands";

/**
 * Clip vocabulary, retargeting and the pure "what plays when" tables for the GLB teachers (Leo and Mia as rigged
 * Tripo characters; docs/ARCHITECTURE.md "GLB characters"). Everything here is data or a pure function of three
 * objects, so it is tested in node (tests/glbClips.test.ts) without a browser.
 *
 * Bone names: the files say "mixamorig:Hips"; three's loader sanitises that to "mixamorigHips" for both nodes and
 * track names. Everything below uses the sanitised names.
 */

/** The 17 clips in public/assets/characters/clips.glb (scripts/characters-config.mjs). Only these ids are ever played. */
export const CLIP_IDS = [
  "idle", "walk", "run", "jump", "jump_down", "run_upstairs", "sit", "look_around", "bow", "swim",
  "laugh_01", "greet_01", "cheer", "agree", "climb", "clap", "wave_goodbye_01",
] as const;
export type ClipId = (typeof CLIP_IDS)[number];
const CLIP_SET: ReadonlySet<string> = new Set(CLIP_IDS);
/** Hostile or unknown ids (including "__proto__") are not clips. */
export const isClipId = (id: unknown): id is ClipId => typeof id === "string" && CLIP_SET.has(id);

export const bone = (name: string) => `mixamorig${name}`;
export const HIPS = bone("Hips");

/** Everything from the spine up (arms, hands, fingers, neck, head). The legs and the hips are the "lower" layer. */
const LOWER_RE = /^mixamorig(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End))$/;
export const isLowerBone = (name: string) => LOWER_RE.test(name);

/** Used by the retarget coverage test: every bone a shipped track may drive on a character. */
export const REQUIRED_BONES = [
  "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
].map(bone);

export interface ClipSet { full: THREE.AnimationClip; upper: THREE.AnimationClip; lower: THREE.AnimationClip }

export interface Retargeted {
  clips: Map<ClipId, ClipSet>;
  /** Track targets the character has no node for (finger/toe tips that are not in the skin): harmless, listed for tests. */
  skippedBones: string[];
  /** Tracks whose bone exists on the character (all of them must resolve; the test asserts coverage). */
  resolvedTracks: number;
  totalTracks: number;
}

const split = (trackName: string): [string, string] => {
  const i = trackName.lastIndexOf(".");
  return [trackName.slice(0, i), trackName.slice(i + 1)];
};
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), qd = new THREE.Quaternion();
const cf = new THREE.Quaternion(), cfi = new THREE.Quaternion();

/**
 * Retarget the clips (authored on the skeleton in clips.glb) onto a character with the SAME bone names but its own rest
 * pose and proportions:
 *  - rotation:  q = (C * (q_clip * rest_src^-1) * C^-1) * rest_char   (delta in the parent's frame; C = frame fix, identity except at the hips,
 *               because the character files carry a 90 degree node above the skeleton that the clips file does not)
 *  - hips position: rest_char + C * (p_clip - rest_src) * (hipHeight_char / hipHeight_src)   (Mia's legs are longer than Leo's)
 * Also splits every clip into an upper-body layer and a hips+legs layer so gestures can play over walking or standing.
 */
export function retargetClips(srcRoot: THREE.Object3D, srcClips: THREE.AnimationClip[], dstRoot: THREE.Object3D): Retargeted {
  srcRoot.updateMatrixWorld(true);
  dstRoot.updateMatrixWorld(true);
  const out = new Map<ClipId, ClipSet>();
  const skipped = new Set<string>();
  let resolved = 0, total = 0;
  const srcHips = srcRoot.getObjectByName(HIPS), dstHips = dstRoot.getObjectByName(HIPS);
  if (!srcHips || !dstHips) throw new Error("retarget: no hips bone");
  const ratio = dstHips.position.y / (srcHips.position.y || 1);
  const frame = (dst: THREE.Object3D, src: THREE.Object3D) => {
    // C = Pdst^-1 * Psrc where P is the world rotation of the hips' parent.
    const pd = dst.parent ? dst.parent.getWorldQuaternion(qa) : qa.identity();
    const ps = src.parent ? src.parent.getWorldQuaternion(qb) : qb.identity();
    return cf.copy(pd).invert().multiply(ps);
  };

  for (const clip of srcClips) {
    if (!isClipId(clip.name)) continue; // never retarget (or play) something that is not on the list
    const tracks: THREE.KeyframeTrack[] = [];
    for (const t of clip.tracks) {
      total++;
      const [name, prop] = split(t.name);
      const dst = dstRoot.getObjectByName(name), src = srcRoot.getObjectByName(name);
      if (!dst || !src) { skipped.add(name); continue; }
      resolved++;
      const isHips = name === HIPS;
      if (isHips) frame(dst, src); else cf.identity();
      cfi.copy(cf).invert();
      if (prop === "quaternion") {
        const v = new Float32Array(t.values.length);
        const rsInv = src.quaternion.clone().invert();
        for (let i = 0; i < v.length; i += 4) {
          qc.set(t.values[i], t.values[i + 1], t.values[i + 2], t.values[i + 3]).normalize();
          // d' = q_clip * rest_src^-1, conjugated by the frame fix, then applied to the character's own rest rotation.
          qd.copy(qc).multiply(rsInv);
          qd.premultiply(cf).multiply(cfi).multiply(dst.quaternion);
          v[i] = qd.x; v[i + 1] = qd.y; v[i + 2] = qd.z; v[i + 3] = qd.w;
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(t.name, Array.from(t.times), Array.from(v)));
      } else if (prop === "position" && isHips) {
        const v = new Float32Array(t.values.length);
        const p = new THREE.Vector3();
        for (let i = 0; i < v.length; i += 3) {
          p.set(t.values[i] - src.position.x, t.values[i + 1] - src.position.y, t.values[i + 2] - src.position.z).multiplyScalar(ratio).applyQuaternion(cf).add(dst.position);
          v[i] = p.x; v[i + 1] = p.y; v[i + 2] = p.z;
        }
        tracks.push(new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(v)));
      }
    }
    const mk = (suffix: string, keep: (name: string) => boolean) =>
      new THREE.AnimationClip(`${clip.name}${suffix}`, clip.duration, tracks.filter((t) => keep(split(t.name)[0])));
    out.set(clip.name, {
      full: new THREE.AnimationClip(clip.name, clip.duration, tracks),
      upper: mk(":upper", (n) => !isLowerBone(n)),
      lower: mk(":lower", (n) => isLowerBone(n)),
    });
  }
  return { clips: out, skippedBones: [...skipped].sort(), resolvedTracks: resolved, totalTracks: total };
}

// ----------------------------------------------------------------------------------------------------------------
// What plays when (pure; the animator only looks things up here, so hostile ids can never reach a loader or mixer).

export interface ActPlan {
  /** Which clip plays on the whole body; null = no matching clip yet (procedural overlay only). */
  clip: ClipId | null;
  /** Source second to start from (the clip is cut to the part we play). */
  from: number;
  loop: boolean;
  fade: number;
  /** Reduced motion plays this clip instead (smaller motion). */
  calmClip?: ClipId;
}

const ACT_PLANS: Readonly<Record<Action, ActPlan>> = {
  run: { clip: "run", from: 0, loop: true, fade: 0.25, calmClip: "walk" },
  jump: { clip: "jump", from: 0, loop: false, fade: 0.12 },
  // TODO(eat): there is no eating clip yet. The body stays idle and the right hand goes to the mouth by IK (glbAnimator.ts).
  eat: { clip: null, from: 0, loop: true, fade: 0.3 },
  sit: { clip: "sit", from: 0.2, loop: true, fade: 0.5 },
  clap: { clip: "clap", from: 0, loop: true, fade: 0.3 },
  swim: { clip: "swim", from: 0, loop: true, fade: 0.4 },
  climb: { clip: "climb", from: 0, loop: true, fade: 0.35 },
};
const ACT_MAP = new Map<string, ActPlan>(Object.entries(ACT_PLANS));
/** null for anything that is not one of the seven acts (Map lookup: "__proto__", "constructor" and URLs are not keys). */
export const actPlan = (id: unknown): ActPlan | null => (typeof id === "string" ? ACT_MAP.get(id) ?? null : null);

/**
 * Gestures. "ik" ones are drawn by the arm IK in the animator (no good standing clip exists: wave_goodbye_01 is a
 * SEATED wave, greet_01 is a salute); "head" is a small procedural nod; "clip" plays a part of a clip on the upper body.
 */
export type GesturePlan =
  | { kind: "ik"; pose: "wave" | "think" | "shrug" | "open_hands" }
  | { kind: "head"; pose: "nod" }
  | { kind: "clip"; clip: ClipId; from: number };
const GESTURE_PLANS: Readonly<Record<Gesture, GesturePlan>> = {
  wave: { kind: "ik", pose: "wave" },
  nod: { kind: "head", pose: "nod" },
  thumbs_up: { kind: "clip", clip: "agree", from: 1.0 }, // the thumbs-up part of "agree"
  shrug: { kind: "ik", pose: "shrug" },
  think: { kind: "ik", pose: "think" },
  open_hands: { kind: "ik", pose: "open_hands" },
};
const GESTURE_MAP = new Map<string, GesturePlan>(Object.entries(GESTURE_PLANS));
export const gesturePlan = (id: unknown): GesturePlan | null => (typeof id === "string" ? GESTURE_MAP.get(id) ?? null : null);

export type Layer = { lower: ClipId; upper: ClipId; upperFrom: number; lowerFrom: number; loop: boolean; fade: number; timeScale: number };

export interface LayerInput {
  walking: "walk" | "run" | null;
  walkSpeedScale: number;
  act: Action | null;
  gesture: Gesture | null;
  reducedMotion: boolean;
}

/**
 * The pure "state to clip" decision: which clip each layer should be playing right now.
 * Priority: act > walking > gesture clip > idle. Conversation state (speaking, thinking, listening) is drawn on top of
 * the idle clip by the animator (arm beats, head, lean); the models have no face blendshapes, so there is NO mouth.
 */
export function chooseLayers(i: LayerInput): Layer {
  const base: Layer = { lower: "idle", upper: "idle", upperFrom: 0, lowerFrom: 0, loop: true, fade: 0.35, timeScale: 1 };
  if (i.act) {
    const p = actPlan(i.act);
    const clip = p ? (i.reducedMotion && p.calmClip ? p.calmClip : p.clip) : null;
    if (p && clip) return { lower: clip, upper: clip, upperFrom: p.from, lowerFrom: p.from, loop: p.loop, fade: p.fade, timeScale: i.reducedMotion ? 0.7 : 1 };
    return base; // eat: idle body, hand to mouth by IK
  }
  if (i.walking) {
    const clip: ClipId = i.walking === "run" && !i.reducedMotion ? "run" : "walk";
    return { ...base, lower: clip, upper: clip, loop: true, fade: 0.22, timeScale: i.walkSpeedScale };
  }
  if (i.gesture) {
    const g = gesturePlan(i.gesture);
    if (g?.kind === "clip") return { ...base, upper: g.clip, upperFrom: g.from, loop: false, fade: 0.25 };
  }
  return base;
}

/**
 * Seconds for the part of the clip we use, never zero. Used to fit a one-shot clip (the jump) into the nominal action time.
 */
export function fitTimeScale(clipSeconds: number, wantSeconds: number): number {
  if (!(clipSeconds > 0) || !(wantSeconds > 0)) return 1;
  return Math.min(2, Math.max(0.5, clipSeconds / wantSeconds));
}

/**
 * Natural in-place speed of a locomotion clip in character units per second (how fast the planted foot slides back
 * relative to the hips). Measured on the real skeleton so walking speed can follow the clip and the feet do not skate.
 * Poses the model with a throw-away mixer and restores the bind pose.
 */
export function measureStride(model: THREE.Object3D, clip: THREE.AnimationClip): number {
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.play();
  const names = ["LeftFoot", "RightFoot"].map(bone);
  const hips = model.getObjectByName(HIPS)!;
  const feet = names.map((n) => model.getObjectByName(n)!);
  const N = 48, dur = clip.duration;
  const v = new THREE.Vector3(), h = new THREE.Vector3();
  const zs: number[][] = [[], []], ys: number[][] = [[], []];
  for (let i = 0; i <= N; i++) {
    mixer.setTime((dur * i) / N);
    model.updateMatrixWorld(true);
    hips.getWorldPosition(h);
    feet.forEach((f, k) => { f.getWorldPosition(v); zs[k].push(v.z - h.z); ys[k].push(v.y); });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(model);
  const speeds: number[] = [];
  for (let k = 0; k < 2; k++) {
    const low = Math.min(...ys[k]);
    for (let i = 0; i < N; i++) {
      if (ys[k][i] > low + 0.03 || ys[k][i + 1] > low + 0.03) continue; // only while the foot is planted
      speeds.push(Math.abs(zs[k][i + 1] - zs[k][i]) / (dur / N));
    }
  }
  if (!speeds.length) return 1;
  speeds.sort((a, b) => a - b);
  return speeds[Math.floor(speeds.length / 2)];
}
