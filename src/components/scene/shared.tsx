"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Named scene objects the teacher can point at or the child can tap.
 * Positions are read live from the real meshes, never from the model.
 */
export const registry = new Map<string, THREE.Object3D>();
const tmp = new THREE.Vector3();
export const resolveTarget = (name: string) => {
  const o = registry.get(name);
  return o ? o.getWorldPosition(tmp.clone()) : null;
};
/** Which object the teacher is pointing at (written by the animator each frame). */
export const pointedRef = { current: null as string | null };

export function useRegister<T extends THREE.Object3D = THREE.Group>(name: string, enabled = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!enabled) return;
    const o = ref.current;
    if (o) registry.set(name, o);
    return () => { if (registry.get(name) === o) registry.delete(name); };
  }, [name, enabled]);
  return ref;
}

/** Soft pulsing ring on whatever the teacher is pointing at, or what we invite the child to tap. */
export function Highlight({ name, radius, extra, flat }: { name: string; radius: number; extra?: () => boolean; flat?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock, camera }) => {
    const m = ref.current;
    if (!m) return;
    const on = pointedRef.current === name || !!extra?.();
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.opacity += ((on ? 0.9 : 0) - mat.opacity) * 0.15;
    m.visible = mat.opacity > 0.02;
    m.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5) * 0.06);
    if (flat) m.rotation.set(-Math.PI / 2, 0, 0);
    else m.quaternion.copy(camera.quaternion);
  });
  return (
    <mesh ref={ref} visible={false} renderOrder={5}>
      <ringGeometry args={[radius, radius * (flat ? 1.05 : 1.09), 64]} />
      <meshBasicMaterial color="#ffd166" transparent opacity={0} depthTest={false} />
    </mesh>
  );
}

export function useCanvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, deps: unknown[]) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [w, h]);
  useEffect(() => {
    const ctx = (tex.image as HTMLCanvasElement).getContext("2d")!;
    draw(ctx, w, h);
    tex.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Deterministic pseudo-random, so the world looks the same every visit. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Our own illustrative Mars texture (not a real map). */
export function drawMarsTexture(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#b5532c";
  ctx.fillRect(0, 0, w, h);
  const r = rng(42);
  for (let i = 0; i < 320; i++) {
    const x = r() * w, y = h * 0.1 + r() * h * 0.8, rad = 5 + r() * 48;
    ctx.fillStyle = ["rgba(120,50,26,0.28)", "rgba(214,120,70,0.25)", "rgba(88,38,22,0.22)"][i % 3];
    ctx.beginPath();
    ctx.ellipse(x, y, rad * 1.8, rad, r() * 3, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(245,238,230,0.92)";
  ctx.fillRect(0, 0, w, h * 0.045);
  ctx.fillRect(0, h * 0.965, w, h * 0.035);
}

/**
 * Shared, per-frame visual state for world travel, written by the transit
 * director and read by the scene pieces. Kept outside React so a 60 fps
 * animation never re-renders components.
 */
export const fx = {
  /** 0 = classroom closed, 1 = walls fully open to space. */
  open: 0,
  /** 0..1 visibility of the starfield. */
  space: 0,
  /** Planet approach progress 0..1. */
  approach: 0,
  /** Star travel offset (speed feel). */
  travel: 0,
  /** Which world's geometry is visible right now. */
  shown: "classroom" as "classroom" | "mars",
  /** Camera mode. */
  shot: "classroom" as "classroom" | "space" | "mars",
};
