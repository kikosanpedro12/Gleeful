import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { SafeGLTFLoader } from "@/lib/three/safeGltfLoader";
import { buildHelmet, LOOKS, type TeacherId, type TeacherLook } from "./rig";
import { bone, CLIP_IDS, HIPS, measureStride, REQUIRED_BONES, retargetClips, type ClipSet, type ClipId } from "./glbClips";

/**
 * Leo and Mia as rigged GLB characters (public/assets/characters, built by scripts/build-characters.mjs), behind a
 * switch (src/lib/teacher/glbFlag.ts, on by default). The procedural rig (rig.ts) is the fallback.
 *
 * Honest limits: the models have NO face blendshapes (no mouth, no blink, no eyes that move). Speech shows as body
 * and head emphasis only; it is not lip sync.
 */

/** Same standing height as the procedural teachers (Leo 2.0 with hair, Mia 0.955 of that), a bit shorter (the procedural Leo is 2.0 with his curls) because these have bigger heads and wider shoulders. */
export const GLB_HEIGHT: Record<TeacherId, number> = { leo: 1.9, mia: 1.9 * LOOKS.mia.height };
export const CHARACTER_FILES = { leo: "/assets/characters/leo.glb", mia: "/assets/characters/mia.glb", clips: "/assets/characters/clips.glb" } as const;

export interface ArmBones { arm: THREE.Bone; fore: THREE.Bone; hand: THREE.Bone }

export interface GlbRig {
  look: TeacherLook;
  /** Feet at y = 0, facing +Z, scaled to GLB_HEIGHT. Same contract as TeacherRig.root. */
  root: THREE.Group;
  /** Unscaled character (the skeleton lives here). */
  model: THREE.Group;
  /** Moves the whole character up or down inside the root (the animator keeps the feet on the floor and lifts the root for jumps). */
  holderOffset(y: number): void;
  skinned: THREE.SkinnedMesh;
  helmet: THREE.Object3D;
  /** A pretend stool that appears under the sit clip (the clip sits on a chair-height seat). */
  stool: THREE.Mesh;
  clips: Map<ClipId, ClipSet>;
  bones: {
    hips: THREE.Bone; spine: THREE.Bone; spine1: THREE.Bone; spine2: THREE.Bone; neck: THREE.Bone; head: THREE.Bone;
    /** The arm on the character's +X side (the animator's "L"), and the one on -X ("R"). */
    left: ArmBones; right: ArmBones;
    feet: THREE.Bone[];
  };
  /** Scale from model units to world units. */
  scale: number;
  /** Natural in-place speeds of the locomotion clips, in WORLD units per second. */
  stride: { walk: number; run: number };
  /** True for the real GLB (tests use it to tell it from the procedural rig). */
  glb: true;
  dispose(): void;
}

const loader = new SafeGLTFLoader();
const cache = new Map<string, Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>>();
function load(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((g) => ({ scene: g.scene, animations: g.animations }));
    p.catch(() => cache.delete(url)); // a failed load can be retried later
    cache.set(url, p);
  }
  return p;
}
/** Drop cached files (tests). */
export function clearGlbCache() { cache.clear(); }

const find = (root: THREE.Object3D, name: string) => {
  const o = root.getObjectByName(bone(name));
  if (!o) throw new Error(`character has no bone ${name}`);
  return o as THREE.Bone;
};
const v3 = new THREE.Vector3();

/** Lowest skinned vertex height (model space, after the current pose). 20k vertices, once per rig. */
function lowestVertex(skinned: THREE.SkinnedMesh): number {
  skinned.skeleton.update();
  const pos = skinned.geometry.getAttribute("position");
  let min = Infinity;
  for (let i = 0; i < pos.count; i++) {
    skinned.getVertexPosition(i, v3);
    min = Math.min(min, v3.applyMatrix4(skinned.matrixWorld).y);
  }
  return min;
}

/** Build a rig from parsed files (no network): used by loadGlbRig and by the tests. */
export function assembleGlbRig(id: TeacherId, charScene: THREE.Group, clipsScene: THREE.Group, clipList: THREE.AnimationClip[]): GlbRig {
  const look = LOOKS[id];
  const model = cloneSkinned(charScene) as THREE.Group;
  let skinned: THREE.SkinnedMesh | null = null;
  model.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh; });
  if (!skinned) throw new Error("character has no skinned mesh");
  const sk = skinned as THREE.SkinnedMesh;
  for (const b of REQUIRED_BONES) if (!model.getObjectByName(b)) throw new Error(`character has no bone ${b}`);

  const holder = new THREE.Group();
  holder.add(model);
  const root = new THREE.Group();
  root.name = `teacher_${id}`;
  root.add(holder);
  root.updateMatrixWorld(true);

  const { clips, resolvedTracks, totalTracks } = retargetClips(clipsScene, clipList, model);
  for (const c of CLIP_IDS) if (!clips.has(c)) throw new Error(`clips.glb has no clip ${c}`);
  if (resolvedTracks < totalTracks * 0.8) throw new Error("clips do not match this skeleton");

  // Scale to the teacher height. T-pose bounds of the skinned mesh (hair included).
  sk.frustumCulled = false; // a swimming or jumping body leaves the bind-pose bounds
  sk.castShadow = true;
  const box = new THREE.Box3().setFromObject(sk);
  const k = GLB_HEIGHT[id] / (box.max.y || 1);
  holder.scale.setScalar(k);

  // Stride speeds are measured in model units before scaling; the unscaled model is the holder's child so world == model * k.
  const unscaled = holder.scale.x;
  holder.scale.setScalar(1);
  const stride = {
    walk: measureStride(model, clips.get("walk")!.full) * k,
    run: measureStride(model, clips.get("run")!.full) * k,
  };
  // Stand on the floor in the idle pose: lowest vertex at y = 0.
  const mixer = new THREE.AnimationMixer(model);
  const idle = mixer.clipAction(clips.get("idle")!.full);
  idle.play();
  mixer.setTime(0);
  root.updateMatrixWorld(true);
  model.position.y -= lowestVertex(sk);
  mixer.stopAllAction();
  mixer.uncacheRoot(model); // restores the bones' rest values. Never call skeleton.pose(): quantization changed the inverse bind matrices, so it would rebuild a different rest pose.
  holder.scale.setScalar(unscaled);
  root.updateMatrixWorld(true);

  // Which arm is on +X (the animator's "L" side: yaw toward +X is the character's left).
  const lA = find(model, "LeftArm"), rA = find(model, "RightArm");
  const lx = lA.getWorldPosition(new THREE.Vector3()).x, rx = rA.getWorldPosition(new THREE.Vector3()).x;
  const arms = (side: "Left" | "Right"): ArmBones => ({ arm: find(model, `${side}Arm`), fore: find(model, `${side}ForeArm`), hand: find(model, `${side}Hand`) });
  const plusX = lx >= rx ? arms("Left") : arms("Right"), minusX = lx >= rx ? arms("Right") : arms("Left");

  // Helmet on the head bone: the procedural bubble, scaled to this head (model units).
  const hm = buildHelmet();
  const head = find(model, "Head");
  hm.group.position.set(0, 0.092, 0.012);
  hm.group.scale.setScalar(0.62);
  head.add(hm.group);

  const stoolMat = new THREE.MeshStandardMaterial({ color: "#b9925f", roughness: 0.9 });
  const stoolGeo = new THREE.CylinderGeometry(0.2, 0.17, 1, 24);
  const stool = new THREE.Mesh(stoolGeo, stoolMat);
  stool.castShadow = true;
  stool.visible = false;
  root.add(stool);

  const disposables: { dispose(): void }[] = [hm, stoolMat, stoolGeo];
  return {
    look, root, model, holderOffset: (y: number) => { holder.position.y = y; }, skinned: sk, helmet: hm.group, stool, clips,
    bones: {
      hips: find(model, "Hips"), spine: find(model, "Spine"), spine1: find(model, "Spine1"), spine2: find(model, "Spine2"),
      neck: find(model, "Neck"), head, left: plusX, right: minusX,
      feet: ["LeftFoot", "LeftToeBase", "LeftToe_End", "RightFoot", "RightToeBase", "RightToe_End"].map((n) => model.getObjectByName(bone(n))).filter((o): o is THREE.Bone => !!o),
    },
    scale: k, stride, glb: true,
    // Geometry, material and texture are shared by the cached file (a second rig reuses them), so only our own pieces are freed.
    dispose: () => { disposables.forEach((d) => d.dispose()); sk.skeleton.dispose(); }, // each clone has its own skeleton (and bone texture); geometry and the texture are shared
  };
}

/** Fetch and assemble. Rejects on any problem (network, bad file, missing bone): the caller falls back to the procedural rig. */
export async function loadGlbRig(id: TeacherId): Promise<GlbRig> {
  const [c, k] = await Promise.all([load(CHARACTER_FILES[id]), load(CHARACTER_FILES.clips)]);
  return assembleGlbRig(id, c.scene, k.scene, k.animations);
}

export { HIPS };
