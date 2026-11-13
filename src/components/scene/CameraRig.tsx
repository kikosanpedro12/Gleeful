"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useSession } from "@/lib/session/store";
import { fx } from "./shared";
import { actors } from "./TeacherActor";

/**
 * Frames the teacher for landscape and portrait screens and follows gently.
 * Shots: classroom (close, warm), space (wider, the planet behind the teacher),
 * mars (a little higher and wider so the landscape reads).
 */
const pos = new THREE.Vector3(), look = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3();

/** Per-orientation value: [portrait, landscape]. */
type PL = readonly [number, number];
const pick = (v: PL, portrait: boolean) => (portrait ? v[0] : v[1]);

/** Named framing numbers per shot (metres in world space). Tweak framing here, not inline. */
const SHOT = {
  /** Start screen: teachers in front of the board; landscape-wide pushes them left of the picker card. */
  onboarding: { wideX: 0.75, x: -0.1, camY: [1.3, 1.35] as PL, camZ: [4.4, 3.4] as PL, lookY: [0.4, 1.0] as PL, lookZ: -0.85 },
  /** Flight: off to the right so the planet (upper left) and the teacher are both in view. */
  space: { camX: 1.1, camY: 1.55, camZ: [5.0, 4.1] as PL, lookX: -0.9, lookY: 1.6, lookZ: -4 },
  /** Outdoor walk: camera leads from the side and a little ahead so her face shows while she talks. */
  walk: { minDistance: 0.6, ahead: [0.9, 1.3] as PL, out: [3.4, 4.4] as PL, lead: [0.5, 1.6] as PL, camY: 1.55, lookY: 1.05 },
  /** Outdoor, standing at a stop. */
  stop: { followX: 0.75, offsetX: 0.2, camY: 1.65, camZ: [4.1, 3.7] as PL, lookFollowX: 0.9, lookY: 1.05, lookZ: -1.6 },
  /** Classroom: near head height so the board's words sit clearly above her head. */
  classroom: { followX: [0.5, 0.35] as PL, camY: [1.62, 1.66] as PL, camZ: [4.1, 4.0] as PL, depthFollow: 0.35, depthOrigin: 0.8, lookFollowX: [0.85, 0.6] as PL, lookY: [1.0, 1.05] as PL },
} as const;

export default function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera, size } = useThree();
  const lookAt = useRef(new THREE.Vector3(0, 1.2, -1));
  const lastShot = useRef(fx.shot);
  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const portrait = size.width / size.height < 0.9;
    const s = useSession.getState();
    const onboarding = s.status === "disconnected";
    const fov = portrait ? 60 : fx.shot === "space" ? 46 : 42;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }

    const t = s.teacher ? actors[s.teacher]?.rig.root.position : undefined;
    const tx = !onboarding && t ? t.x : -0.1;
    const tz = !onboarding && t ? t.z : -0.85;
    const ty = !onboarding && t ? t.y : 0;
    if (onboarding) {
      // Landscape: teachers left of centre, picker card on the right.
      const wide = size.width >= 760 && !portrait;
      const o = SHOT.onboarding, x = wide ? o.wideX : o.x;
      pos.set(x, pick(o.camY, portrait), pick(o.camZ, portrait));
      look.set(x, pick(o.lookY, portrait), o.lookZ);
    } else if (fx.shot === "space") {
      const o = SHOT.space;
      pos.set(o.camX, o.camY, pick(o.camZ, portrait));
      look.set(o.lookX, o.lookY, o.lookZ);
    } else if (fx.shot === "outdoor") {
      const to = s.teacher ? actors[s.teacher]?.animator.walkTarget() : null;
      if (to && t && Math.hypot(to.x - tx, to.z - tz) > SHOT.walk.minDistance) {
        // Lead the walk from the front and to one side: the child sees the teacher's
        // face while she talks, and where she is going, instead of her back.
        dir.set(to.x - tx, 0, to.z - tz).normalize();
        side.set(-dir.z, 0, dir.x);
        if (side.z < 0) side.negate(); // stay on the camera's side of the path
        // Mostly from the side and a little ahead: her face turns to the child while she
        // talks, and there is room in the frame in the direction she is walking.
        const w = SHOT.walk, ahead = pick(w.ahead, portrait), out = pick(w.out, portrait), lead = pick(w.lead, portrait);
        pos.set(tx + dir.x * ahead + side.x * out, ty + w.camY, tz + dir.z * ahead + side.z * out);
        look.set(tx + dir.x * lead, ty + w.lookY, tz + dir.z * lead);
      } else {
        const o = SHOT.stop;
        pos.set(tx * o.followX + o.offsetX, ty + o.camY, tz + pick(o.camZ, portrait));
        look.set(tx * o.lookFollowX, ty + o.lookY, tz + o.lookZ);
      }
    } else {
      const o = SHOT.classroom;
      pos.set(tx * pick(o.followX, portrait), pick(o.camY, portrait), pick(o.camZ, portrait) + (tz + o.depthOrigin) * o.depthFollow);
      look.set(tx * pick(o.lookFollowX, portrait), pick(o.lookY, portrait), tz);
    }
    // Snap on a world swap (hidden by the flash) so the camera never sweeps across a new world.
    const snap = fx.shot !== lastShot.current && lastShot.current === "space";
    lastShot.current = fx.shot;
    const k = snap ? 1 : 1 - Math.exp(-(reducedMotion ? 4 : 2.2) * dt);
    cam.position.lerp(pos, k);
    lookAt.current.lerp(look, k);
    cam.lookAt(lookAt.current);
  });
  return null;
}
