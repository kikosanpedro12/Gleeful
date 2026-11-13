"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { buildTeacher, LOOKS, type TeacherRig, type JointName } from "@/lib/teacher/rig";
import { CHAPTERS, chapterAt, mixHex } from "./chapters";
import { buildWorlds, Kit, SPACING, worldZ } from "./worlds3d";

/**
 * The landing hero's 3D stage. Scroll progress (0..1) arrives through a ref,
 * so scrolling never re-renders React. The camera eases toward the scroll
 * target and flies along -Z through the worlds; Leo and Mia fly with it.
 */
export interface HeroSceneProps {
  progress: MutableRefObject<number>;
  active: boolean;
  onReady: () => void;
  /** Called once with the measured average fps over the first seconds of flight. */
  onPerf: (fps: number) => void;
}

const CAM_BACK = 8;
const NEAR = 52;
const helmetOn = (c: number) => (c > 0.55 && c < 1.6) || c > 5.45;

type Pose = Partial<Record<JointName, [number, number, number]>>;
const STAND: Pose = { shoulderL: [0.03, 0, 0.09], shoulderR: [0.03, 0, -0.09], elbowL: [-0.18, 0, 0], elbowR: [-0.18, 0, 0] };
const WAVE_R: Pose = { ...STAND, shoulderR: [0, 0, -2.25], elbowR: [0, 0, -0.5] };
const WAVE_L: Pose = { ...STAND, shoulderL: [0, 0, 2.25], elbowL: [0, 0, 0.5] };
const FLY_R: Pose = { shoulderR: [-0.2, 0, -2.6], elbowR: [0, 0, -0.15], shoulderL: [0.2, 0, 0.55], elbowL: [-0.4, 0, 0], thighL: [0.4, 0, 0], thighR: [0.15, 0, 0], kneeL: [1.0, 0, 0], kneeR: [0.55, 0, 0] };
const FLY_L: Pose = { shoulderL: [-0.2, 0, 2.6], elbowL: [0, 0, 0.15], shoulderR: [0.2, 0, -0.55], elbowR: [-0.4, 0, 0], thighL: [0.15, 0, 0], thighR: [0.4, 0, 0], kneeL: [0.55, 0, 0], kneeR: [1.0, 0, 0] };

function applyPose(rig: TeacherRig, a: Pose, b: Pose, t: number) {
  for (const name of Object.keys(rig.joints) as JointName[]) {
    const pa = a[name] ?? [0, 0, 0], pb = b[name] ?? [0, 0, 0];
    rig.joints[name].rotation.set(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t);
  }
}

function Flight({ progress, onReady, onPerf }: Omit<HeroSceneProps, "active">) {
  const { scene, camera, size, gl } = useThree();
  const kit = useMemo(() => new Kit(), []);
  const worlds = useMemo(() => buildWorlds(kit), [kit]);
  const leo = useMemo(() => buildTeacher(LOOKS.leo), []);
  const mia = useMemo(() => buildTeacher(LOOKS.mia), []);
  const hemi = useMemo(() => new THREE.HemisphereLight("#ffffff", "#8a6a4a", 1.15), []);
  const sun = useMemo(() => { const d = new THREE.DirectionalLight("#fff3dc", 1.5); d.position.set(4, 10, 6); return d; }, []);
  const fog = useMemo(() => new THREE.Fog(CHAPTERS[0].sky, 12, 46), []);
  const c = useRef(chapterAt(progress.current));
  const perf = useRef({ start: -1, frames: 0, done: false, readySent: false });
  const tmp = useMemo(() => ({ bg: new THREE.Color(), sky: new THREE.Color() }), []);

  useEffect(() => {
    for (const w of worlds) scene.add(w.group);
    scene.add(leo.root, mia.root, hemi, sun, sun.target);
    scene.fog = fog;
    scene.background = tmp.bg;
    return () => {
      for (const w of worlds) scene.remove(w.group);
      scene.remove(leo.root, mia.root, hemi, sun, sun.target);
      scene.fog = null;
      scene.background = null;
      kit.dispose(); leo.dispose(); mia.dispose();
    };
  }, [scene, worlds, leo, mia, hemi, sun, fog, kit, tmp]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const target = chapterAt(progress.current);
    // Ease toward the scroll position; fast enough to feel attached, smooth enough to hide scroll jitter.
    c.current += (target - c.current) * (1 - Math.exp(-dt * 5));
    const cc = c.current;
    const i0 = Math.floor(cc), f = cc - i0;
    const a = CHAPTERS[Math.min(i0, CHAPTERS.length - 1)], b = CHAPTERS[Math.min(i0 + 1, CHAPTERS.length - 1)];
    // Hold each world's colour for most of its step, blend in the gap between worlds.
    const blend = THREE.MathUtils.smoothstep(f, 0.35, 0.85);
    const sky = mixHex(a.sky, b.sky, blend);
    tmp.bg.set(sky);
    fog.color.set(sky);
    hemi.color.copy(tmp.sky.set("#ffffff").lerp(tmp.bg, 0.3));

    const portrait = size.width / size.height < 0.85;
    const cam = camera as THREE.PerspectiveCamera;
    const fov = portrait ? 62 : 46;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const camZ = CAM_BACK - cc * SPACING;
    const bob = Math.sin(t * 0.8) * 0.08;
    // On tall phone screens the lower-third covers the bottom half, so in the classroom
    // the camera looks down a little to lift the teachers above it.
    const standLook = portrait ? -2.6 : 0.1;
    const lookY = standLook + (0.1 - standLook) * THREE.MathUtils.smoothstep(cc, 0.1, 0.7);
    cam.position.set(Math.sin(cc * 1.7) * 0.6, 0.5 + bob, camZ);
    cam.lookAt(Math.sin(cc * 1.7 + 0.4) * 0.4, lookY, camZ - 10);
    sun.target.position.set(0, 0, camZ - 10);
    sun.position.set(4, 10, camZ + 4);

    worlds.forEach((w, i) => {
      const near = Math.abs(camZ - worldZ(i)) < NEAR;
      w.group.visible = near;
      w.update(t, near, cc);
    });

    // Teachers: stand and wave in the classroom, then fly ahead of the camera.
    const fly = THREE.MathUtils.smoothstep(cc, 0.12, 0.6);
    const xs = portrait ? [-0.6, 0.62] : [1.5, 3.1];
    const yStand = -2.2, yFly = portrait ? -0.8 : -1.3;
    [leo, mia].forEach((rig, k) => {
      const lead = k === 0 ? 6.4 : 6.0;
      const phase = t * 1.6 + k * 1.3;
      const y = yStand + (yFly - yStand) * fly + Math.sin(phase) * 0.12 * fly;
      rig.root.position.set(cam.position.x + xs[k] * (0.7 + 0.3 * fly), y, camZ - lead);
      // Face the viewer, leaning into the flight.
      rig.root.rotation.set(-0.35 * fly, (k === 0 ? 0.35 : -0.35) * (portrait ? 0.6 : 1) + Math.sin(phase * 0.5) * 0.05 * fly, (k === 0 ? 0.12 : -0.12) * fly);
      const waving = (Math.sin(t * 2.2 + k * Math.PI) + 1) / 2;
      const standPose = k === 0 ? WAVE_L : WAVE_R;
      if (fly < 0.01) applyPose(rig, STAND, standPose, waving * 0.85);
      else applyPose(rig, standPose, k === 0 ? FLY_L : FLY_R, fly);
      rig.helmet.visible = helmetOn(cc);
    });

    // Report readiness after the first real frame, and a short fps sample for slow-device fallback.
    if (!perf.current.readySent) { perf.current.readySent = true; onReady(); }
    if (!perf.current.done) {
      if (perf.current.start < 0) perf.current.start = t;
      perf.current.frames++;
      const span = t - perf.current.start;
      if (span > 3) { perf.current.done = true; onPerf(perf.current.frames / span); }
    }
    void gl;
  });
  return null;
}

export default function HeroScene({ progress, active, onReady, onPerf }: HeroSceneProps) {
  const dpr = useMemo<[number, number]>(() => {
    if (typeof window === "undefined") return [1, 1.5];
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    return [1, small ? 1.5 : 1.75];
  }, []);
  return (
    <Canvas
      className="lp-canvas"
      frameloop={active ? "always" : "never"}
      dpr={dpr}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false, stencil: false }}
      camera={{ fov: 46, near: 0.1, far: 140, position: [0, 0.5, CAM_BACK] }}
      aria-hidden
    >
      <Flight progress={progress} onReady={onReady} onPerf={onPerf} />
    </Canvas>
  );
}
