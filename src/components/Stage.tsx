"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import Classroom from "./scene/Classroom";
import Space from "./scene/Space";
import Mars from "./scene/Mars";
import TeacherActor from "./scene/TeacherActor";
import CameraRig from "./scene/CameraRig";
import Director from "./scene/Director";
import { fx, resolveTarget } from "./scene/shared";
import { useSession } from "@/lib/session/store";

function ClassroomLights() {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => { if (ref.current) ref.current.visible = fx.shown === "classroom"; });
  return (
    <group ref={ref}>
      <hemisphereLight args={["#fff6e6", "#c9b08e", 1.05]} />
      <directionalLight
        position={[2.5, 4.5, 3.5]} intensity={1.7} castShadow
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-4} shadow-camera-right={4}
        shadow-camera-top={4} shadow-camera-bottom={-2} shadow-bias={-0.0004}
      />
      <directionalLight position={[-3, 2.5, 2]} intensity={0.35} />
    </group>
  );
}

/** Positions the "Tap to investigate" tag over the object the teacher invited the child to tap. */
function ScreenTag() {
  const { camera, size } = useThree();
  const el = useRef<HTMLElement | null>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!el.current) el.current = document.getElementById("tap-tag");
    const node = el.current;
    if (!node) return;
    const s = useSession.getState();
    const p = s.invite && !s.inspecting ? resolveTarget(s.invite) : null;
    if (!p) { node.style.display = "none"; return; }
    v.copy(p).add(new THREE.Vector3(0, 0.38, 0)).project(camera);
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

/** Exposes a projector for the browser smoke test (where is an object on screen?). */
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
      <ClassroomLights />
      <Classroom />
      <Space />
      <Mars />
      <TeacherActor id="leo" reducedMotion={reduced} />
      <TeacherActor id="mia" reducedMotion={reduced} />
      <Director flash={flash} reducedMotion={reduced} />
      <CameraRig reducedMotion={reduced} />
      <ScreenTag />
      <TestHooks />
      <QualityGuard onLow={() => { setLow(true); onQuality?.("low"); }} />
    </Canvas>
  );
}
