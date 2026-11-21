import type * as THREE from "three";
import type { Gesture } from "@/lib/scene/commands";
import type { FrameInput } from "./animator";

/** What the scene needs from a teacher body, whichever rig draws it (procedural rig.ts or GLB glbRig.ts). */
export interface ActorRig {
  root: THREE.Group;
  helmet: THREE.Object3D;
  dispose(): void;
}
export interface ActorAnimator {
  update(f: FrameInput): void;
  place(x: number, z: number, faceYaw?: number): void;
  walkTarget(): THREE.Vector3 | null;
  gestureNow(gesture: Gesture): void;
  /** Optional: stop and release anything the animator holds (the GLB animator's AnimationMixer). */
  dispose?(): void;
  readonly pointed: string | null;
  readonly debug: { mouthOpen: number; walking: boolean; gesture: string | null; action: string | null; pointing: string | null };
}
