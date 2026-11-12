"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import Space from "./scene/Space";
import { WORLD_SCENES } from "./scene/worlds";
import { WORLD_IDS, WORLDS } from "@/lib/worlds/registry";
import TeacherActor from "./scene/TeacherActor";
import CameraRig from "./scene/CameraRig";
import Director from "./scene/Director";
import { fx, resolveTarget, TEST_HOOKS } from "./scene/shared";
import { useSession } from "@/lib/session/store";

/**
 * One light rig for every world, recoloured per world. Keeping the number and
 * type of lights constant avoids shader recompiles (a visible stall) on arrival.
 */
const LIGHTS: Record<"indoor" | "outdoor", { sky: string; ground: string; hemi: number; sun: string; sunI: number; sunPos: [number, number, number] }> = {
  indoor: { sky: "#fff6e6", ground: "#c9b08e", hemi: 1.05, sun: "#ffffff", sunI: 1.7, sunPos: [2.5, 4.5, 3.5] },
  outdoor: { sky: "#f6d2b0", ground: "#6b3420", hemi: 0.9, sun: "#ffe2c2", sunI: 1.9, sunPos: [8, 10, 4] },
};
function Lights() {
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const L = LIGHTS[WORLDS[fx.shown].framing];
    if (hemi.current) { hemi.current.color.set(L.sky); hemi.current.groundColor.set(L.ground); hemi.current.intensity = L.hemi; }
    if (sun.current) {
      sun.current.color.set(L.sun);
      sun.current.intensity = L.sunI;
      // Shadows follow the teacher's area so the small shadow map stays sharp.
      const t = (window as unknown as { __teacherPos?: THREE.Vector3 }).__teacherPos;
      const cx = t?.x ?? 0, cz = t?.z ?? 0;
      sun.current.position.set(cx + L.sunPos[0], L.sunPos[1], cz + L.sunPos[2]);
      sun.current.target.position.set(cx, 0, cz);
      sun.current.target.updateMatrixWorld();
    }
    if (fill.current) fill.current.intensity = WORLDS[fx.shown].framing === "indoor" ? 0.35 : 0;
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={["#fff6e6", "#c9b08e", 1.05]} />
      <directionalLight
        ref={sun} position={[2.5, 4.5, 3.5]} intensity={1.7} castShadow
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-5} shadow-camera-right={5}
        shadow-camera-top={5} shadow-camera-bottom={-5} shadow-bias={-0.0004}
      />
      <directionalLight ref={fill} position={[-3, 2.5, 2]} intensity={0.35} />
    </>
  );
}

/** Positions the "Tap to investigate" tag over the object the teacher invited the child to tap. */
function ScreenTag() {
  const { camera, size } = useThree();
  const el = useRef<HTMLElement | null>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 0.38, 0), []);
  useFrame(() => {
    if (!el.current) el.current = document.getElementById("tap-tag");
    const node = el.current;
    if (!node) return;
    const s = useSession.getState();
    const p = s.invite && !s.inspecting ? resolveTarget(s.invite) : null;
    if (!p) { node.style.display = "none"; return; }
    v.copy(p).add(up).project(camera);
    if (v.z > 1) { node.style.display = "none"; return; }
    node.style.display = "block";
    node.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`;
  });
  return null;
}

/** If the device cannot hold ~30 fps, drop resolution and shadows. */
function QualityGuard({ onLow }: { onLow: () => void }) {
  const n = useRef(0);
  const acc = useRef(0);
  const done = useRef(false);
  useFrame((_, dt) => {
    if (done.current || dt > 1) return;
    n.current++;
    if (n.current < 60) return;
    acc.current += dt;
    if (n.current === 300) {
      done.current = true;
      if (240 / acc.current < 28) onLow();
    }
  });
  return null;
}

function TestHooks() {
  const { camera, size } = useThree();
  (window as any).__project = (name: string) => {
    const p = resolveTarget(name);
    if (!p) return null;
    const v = p.clone().project(camera);
    return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, z: v.z };
  };
  (window as any).__fx = fx;
  return null;
}

export default function Stage({ onQuality, flash }: { onQuality?: (q: "high" | "low") => void; flash: React.RefObject<HTMLDivElement | null> }) {
  const [low, setLow] = useState(false);
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  return (
    <Canvas
      shadows={!low}
      dpr={low ? 1 : [1, 1.75]}
      camera={{ position: [0, 1.45, 4.0], fov: 42, near: 0.05, far: 260 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => { gl.setClearColor("#f3e7d3"); }}
    >
      <Lights />
      {WORLD_IDS.map((id) => { const Scene = WORLD_SCENES[id]; return <Scene key={id} />; })}
      <Space />
      <TeacherActor id="leo" reducedMotion={reduced} />
      <TeacherActor id="mia" reducedMotion={reduced} />
      <Director flash={flash} reducedMotion={reduced} />
      <CameraRig reducedMotion={reduced} />
      <ScreenTag />
      {TEST_HOOKS && <TestHooks />}
      <QualityGuard onLow={() => { setLow(true); onQuality?.("low"); }} />
    </Canvas>
  );
}
