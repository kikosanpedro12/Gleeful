"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fx, Highlight, PLANET_TEXTURES, rng, useCanvasTexture, useRegister } from "./shared";
import { useSession } from "@/lib/session/store";
import { WORLDS } from "@/lib/worlds/registry";

/** Starfield + the destination planet. Only drawn while travelling. */
export default function Space() {
  const stars = useRef<THREE.Points>(null);
  const group = useRef<THREE.Group>(null);
  const planet = useRegister("destination");
  const ball = useRef<THREE.Mesh>(null);
  // Flying out: the planet ahead. Flying home: the planet we are leaving.
  const planetKey = useSession((s) => (s.transit ? WORLDS[s.transit.to].planet ?? WORLDS[s.transit.from].planet : undefined)) ?? "mars";
  const tex = useCanvasTexture(PLANET_TEXTURES[planetKey], 1024, 512, [planetKey]);
  const geo = useMemo(() => {
    const r = rng(7);
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // A long tube of stars around the travel path.
      const a = r() * Math.PI * 2, rad = 6 + r() * 40;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = Math.sin(a) * rad + 1.5;
      pos[i * 3 + 2] = -r() * 160 + 10;
      const warm = r();
      col[i * 3] = 0.85 + warm * 0.15; col[i * 3 + 1] = 0.85 + (1 - warm) * 0.1; col[i * 3 + 2] = 0.9 + (1 - warm) * 0.1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    const show = fx.space > 0.01;
    if (group.current) group.current.visible = show;
    if (!show) return;
    const m = stars.current?.material as THREE.PointsMaterial | undefined;
    if (m) m.opacity = fx.space;
    // Stars stream past: move them toward the viewer and wrap around.
    if (stars.current) {
      const p = geo.attributes.position as THREE.BufferAttribute;
      const arr = p.array as Float32Array;
      const speed = 4 + fx.travel * 26;
      for (let i = 2; i < arr.length; i += 3) {
        arr[i] += speed * dt;
        if (arr[i] > 12) arr[i] -= 170;
      }
      p.needsUpdate = true;
    }
    // Planet: from a dot far away to filling the view.
    const a = fx.approach;
    const e = a * a * a;
    if (planet.current) {
      planet.current.position.set(-3.2 - e * 2.6, 3.0 + e * 0.9, -130 + e * 121);
      planet.current.scale.setScalar(2.2 + e * 3.4);
    }
    if (ball.current) ball.current.rotation.y += dt * 0.08;
  });
  return (
    <group ref={group} visible={false}>
      <points ref={stars} geometry={geo}>
        <pointsMaterial size={0.12} sizeAttenuation vertexColors transparent opacity={0} depthWrite={false} />
      </points>
      <group ref={planet}>
        <mesh ref={ball}>
          <sphereGeometry args={[1, 48, 32]} />
          <meshStandardMaterial map={tex} roughness={0.95} emissive="#3a1206" emissiveIntensity={0.25} />
        </mesh>
        {/* Thin atmosphere glow */}
        <mesh scale={1.04}>
          <sphereGeometry args={[1, 32, 24]} />
          <meshBasicMaterial color="#ffb38a" transparent opacity={0.12} side={THREE.BackSide} depthWrite={false} />
        </mesh>
        <Highlight name="destination" radius={1.25} />
      </group>
      <directionalLight position={[6, 3, 4]} intensity={2.2} color="#fff1dd" />
    </group>
  );
}
