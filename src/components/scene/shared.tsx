"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { WorldId } from "@/lib/worlds/registry";

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
/** Where the active teacher stands (the light rig follows it). */
export const teacherPosRef = { current: null as THREE.Vector3 | null };

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

/** Browser-test hooks (window.__teacher etc). Test/CI builds only, and only with ?test=1 or ?dev=1. */
// Requires BOTH a build flag (set only for test/CI builds) and the URL flag, so a
// normal production deployment never installs them, whatever the URL says.
export const TEST_HOOKS =
  process.env.NEXT_PUBLIC_TEST_HOOKS === "1" && typeof window !== "undefined" && /[?&](test|dev)=1(&|$)/.test(window.location.search);

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

/** Planet textures for space flights, keyed by WorldDef.planet. */
export const PLANET_TEXTURES: Record<"mars", (ctx: CanvasRenderingContext2D, w: number, h: number) => void> = {
  mars: (ctx, w, h) => drawMarsTexture(ctx, w, h),
};

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

/** Our own stylised Earth texture (not a real map): blue ocean, green and brown land blobs, white poles, soft clouds. */
export function drawEarthTexture(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#2f7fd1";
  ctx.fillRect(0, 0, w, h);
  const r = rng(7);
  const blob = (cx: number, cy: number, rad: number, fill: string, squash = 0.7) => {
    ctx.fillStyle = fill;
    for (let i = 0; i < 14; i++) {
      const a = r() * 6.28, d = r() * rad * 0.8;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * d * 1.3, cy + Math.sin(a) * d * squash, rad * (0.3 + r() * 0.4), rad * squash * (0.3 + r() * 0.4), r() * 3, 0, 7);
      ctx.fill();
    }
  };
  // Rough continent positions (stylised): Americas, Africa/Europe, Asia, Australia.
  const lands: [number, number, number][] = [[0.17, 0.3, 0.1], [0.24, 0.62, 0.08], [0.5, 0.36, 0.09], [0.53, 0.6, 0.08], [0.7, 0.3, 0.13], [0.82, 0.68, 0.05]];
  for (const [x, y, rad] of lands) {
    blob(x * w, y * h, rad * w, "#4fa24a");
    blob(x * w, y * h, rad * w * 0.55, "#8a8a45", 0.6);
  }
  ctx.fillStyle = "#f4f8fb";
  ctx.fillRect(0, 0, w, h * 0.07);
  ctx.fillRect(0, h * 0.93, w, h * 0.07);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    ctx.ellipse(r() * w, h * 0.12 + r() * h * 0.76, 20 + r() * 40, 4 + r() * 7, r() * 0.5 - 0.25, 0, 7);
    ctx.fill();
  }
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
  shown: "classroom" as WorldId,
  /** Camera mode. */
  shot: "indoor" as "indoor" | "outdoor" | "space",
};

/** Soft round contact shadow laid on the floor so furniture reads as standing there. */
export function useShadowTexture() {
  return useCanvasTexture((ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(40,25,10,0.55)");
    g.addColorStop(0.6, "rgba(40,25,10,0.25)");
    g.addColorStop(1, "rgba(40,25,10,0)");
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, 128, 128, []);
}

export function ContactShadow({ position, size }: { position: [number, number, number]; size: [number, number] }) {
  const tex = useShadowTexture();
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}
