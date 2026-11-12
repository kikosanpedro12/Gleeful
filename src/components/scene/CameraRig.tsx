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
const pos = new THREE.Vector3(), look = new THREE.Vector3();

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
      pos.set(wide ? 0.75 : -0.1, portrait ? 1.3 : 1.35, portrait ? 4.4 : 3.4);
      look.set(wide ? 0.75 : -0.1, portrait ? 0.4 : 1.0, -0.85);
    } else if (fx.shot === "space") {
      // Off to the right so the planet (upper left) and the teacher are both in view.
      pos.set(1.1, 1.55, portrait ? 5.0 : 4.1);
      look.set(-0.9, 1.6, -4);
    } else if (fx.shot === "mars") {
      pos.set(tx * 0.75 + 0.2, ty + 1.65, tz + (portrait ? 4.1 : 3.7));
      look.set(tx * 0.9, ty + 1.05, tz - 1.6);
    } else {
      pos.set(tx * (portrait ? 0.5 : 0.35), 1.45, (portrait ? 4.1 : 4.0) + (tz + 0.8) * 0.35);
      look.set(tx * (portrait ? 0.85 : 0.6), portrait ? 1.0 : 1.05, tz);
    }
    // Snap on a world swap (hidden by the flash) so the camera never sweeps across a new world.
    const snap = fx.shot !== lastShot.current && fx.shot === "mars";
    lastShot.current = fx.shot;
    const k = snap ? 1 : 1 - Math.exp(-(reducedMotion ? 4 : 2.2) * dt);
    cam.position.lerp(pos, k);
    lookAt.current.lerp(look, k);
    cam.lookAt(lookAt.current);
  });
  return null;
}
