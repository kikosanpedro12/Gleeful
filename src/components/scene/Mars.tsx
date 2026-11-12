"use client";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { fx, Highlight, rng, useRegister } from "./shared";

/**
 * A prepared Martian landscape: procedural ground with a crater, a far-off
 * giant volcano, scattered rocks, drifting dust and a butterscotch sky.
 * Everything is generated here (no downloaded assets). Illustrative, not a
 * map of a real place on Mars.
 */
const CRATER = { x: -3.9, z: -7.0, r: 2.0, depth: 1.05 };
export const ROCK_POS = new THREE.Vector3(1.0, 0, -1.15);

export function groundHeight(x: number, z: number) {
  let h = Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.35 + Math.sin(x * 0.63 + z * 0.41) * 0.08 + Math.cos(z * 0.9 - x * 0.3) * 0.04;
  // Keep the area around the landing spot gentle and flat.
  const near = Math.hypot(x, z + 1);
  h *= THREE.MathUtils.smoothstep(near, 1.5, 5);
  const d = Math.hypot(x - CRATER.x, z - CRATER.z);
  if (d < CRATER.r) h -= CRATER.depth * (1 - (d / CRATER.r) ** 2);
  h += 0.28 * Math.exp(-((d - CRATER.r) ** 2) / 0.12); // raised rim
  // Rising hills toward the horizon.
  h += Math.max(0, -z - 18) * 0.06 * (1 + Math.sin(x * 0.12));
  return h;
}

function Ground() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(90, 90, 150, 150);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(p.count * 3);
    const base = new THREE.Color("#b25a33"), light = new THREE.Color("#cf8650"), dark = new THREE.Color("#7c3920"), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const h = groundHeight(x, z);
      p.setY(i, h);
      const n = (Math.sin(x * 1.7 + z * 0.9) + Math.sin(x * 0.37 - z * 1.3)) * 0.25 + 0.5;
      c.copy(base).lerp(n > 0.5 ? light : dark, Math.abs(n - 0.5) * 0.9);
      const d = Math.hypot(x - CRATER.x, z - CRATER.z);
      if (d < CRATER.r) c.lerp(dark, 0.35 * (1 - d / CRATER.r));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}

function Rocks() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 90;
  const geo = useMemo(() => new THREE.DodecahedronGeometry(1, 0), []);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const r = rng(99);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      let x = 0, z = 0;
      do { x = (r() - 0.5) * 30; z = -r() * 26 + 3; } while (Math.hypot(x, z + 0.8) < 1.6 || Math.hypot(x - ROCK_POS.x, z - ROCK_POS.z) < 0.7);
      const s = 0.04 + r() ** 3 * 0.42;
      o.position.set(x, groundHeight(x, z) + s * 0.25, z);
      o.rotation.set(r() * 3, r() * 3, r() * 3);
      o.scale.set(s * (0.8 + r() * 0.6), s * (0.5 + r() * 0.4), s * (0.8 + r() * 0.5));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col.set(["#8e4426", "#a3532f", "#6f3420", "#b86a40"][i % 4]));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, count]} castShadow receiveShadow>
      <meshStandardMaterial roughness={0.95} flatShading />
    </instancedMesh>
  );
}

function Sky() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(95, 32, 16);
    const p = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const top = new THREE.Color("#9c6a58"), horizon = new THREE.Color("#e6b48a"), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const t = THREE.MathUtils.clamp(p.getY(i) / 95, 0, 1);
      c.copy(horizon).lerp(top, Math.pow(t, 0.6));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  const skyRef = useRegister<THREE.Mesh>("sky");
  return (
    <>
      <mesh geometry={geo}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>
      {/* Pointing target for "the sky": a point up and ahead */}
      <mesh ref={skyRef} position={[0, 7, -12]} visible={false}>
        <sphereGeometry args={[0.1]} />
      </mesh>
      {/* Small, pale Sun: Mars is farther from the Sun than Earth */}
      <mesh position={[30, 34, -60]}>
        <sphereGeometry args={[1.4, 16, 12]} />
        <meshBasicMaterial color="#fff4e0" fog={false} />
      </mesh>
    </>
  );
}

function Dust() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const r = rng(5);
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (r() - 0.5) * 16; pos[i * 3 + 1] = r() * 3; pos[i * 3 + 2] = -r() * 14 + 3; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    for (let i = 0; i < a.length; i += 3) {
      a[i] += dt * 0.25;
      a[i + 1] += Math.sin(performance.now() / 1300 + i) * dt * 0.03;
      if (a[i] > 8) a[i] -= 16;
    }
    p.needsUpdate = true;
  });
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.035} color="#f0c9a0" transparent opacity={0.55} depthWrite={false} />
    </points>
  );
}

function Volcano() {
  const ref = useRegister("mountain");
  return (
    <group position={[17, 0, -52]}>
      <mesh position={[0, 3.2, 0]} scale={[1, 1, 0.8]}>
        <cylinderGeometry args={[6, 22, 7, 40, 1]} />
        <meshStandardMaterial color="#a2583a" roughness={1} />
      </mesh>
      <mesh position={[0, 6.75, 0]} scale={[1, 1, 0.8]}>
        <cylinderGeometry args={[4.6, 6, 0.4, 32]} />
        <meshStandardMaterial color="#8b4a30" roughness={1} />
      </mesh>
      <group ref={ref} position={[0, 6.5, 0]}>
        <Highlight name="mountain" radius={5} />
      </group>
    </group>
  );
}

function CraterMarker() {
  const ref = useRegister("crater");
  return (
    <group ref={ref} position={[CRATER.x, groundHeight(CRATER.x + CRATER.r, CRATER.z) + 0.05, CRATER.z]}>
      <Highlight name="crater" radius={CRATER.r * 1.02} flat />
    </group>
  );
}

/** The rock the lesson is about: tap it to pick it up, drag to spin it. */
function InspectRock() {
  const ref = useRegister("rock_1");
  const mesh = useRef<THREE.Mesh>(null);
  const { camera, size } = useThree();
  const inspecting = useSession((s) => s.inspecting === "rock_1");
  const invited = useRef(false);
  const spin = useRef({ x: 0.4, y: 0.6, dragging: false, lastX: 0, lastY: 0, vx: 0, vy: 0.3 });
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(0.2, 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const r = rng(13);
    const colors = new Float32Array(p.count * 3);
    const v = new THREE.Vector3(), c = new THREE.Color();
    const rust = new THREE.Color("#c4652f"), dark = new THREE.Color("#5e2a19"), dust = new THREE.Color("#e0915a");
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 23) * Math.cos(v.y * 19) * Math.sin(v.z * 17);
      v.multiplyScalar(1 + n * 0.12 + (r() - 0.5) * 0.05);
      v.y *= 0.72;
      p.setXYZ(i, v.x, v.y, v.z);
      c.copy(dark).lerp(rust, 0.5 + n * 0.8);
      if (r() > 0.82) c.lerp(dust, 0.7); // flecks of orange dust
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  const rest = useMemo(() => new THREE.Vector3(ROCK_POS.x, groundHeight(ROCK_POS.x, ROCK_POS.z) + 0.12, ROCK_POS.z), []);
  const target = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const g = ref.current, m = mesh.current;
    if (!g || !m) return;
    invited.current = useSession.getState().invite === "rock_1";
    if (inspecting) {
      // Float in front of the viewer, a little below centre.
      const portrait = size.width / size.height < 0.9;
      target.set(portrait ? 0.2 : 0.42, portrait ? -0.05 : -0.12, -1.75).applyMatrix4(camera.matrixWorld);
      if (!spin.current.dragging) { spin.current.y += spin.current.vy * dt; spin.current.vy *= 0.985; if (Math.abs(spin.current.vy) < 0.25) spin.current.vy = 0.25; }
    } else target.copy(rest);
    g.position.lerp(target, 1 - Math.exp(-6 * dt));
    m.rotation.set(spin.current.x, spin.current.y, 0);
    const s = inspecting ? 1.05 : 1;
    m.scale.lerp(new THREE.Vector3(s, s, s), 1 - Math.exp(-6 * dt));
  });

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!inspecting) { session.tap("rock_1"); return; }
    spin.current.dragging = true;
    spin.current.lastX = e.clientX;
    spin.current.lastY = e.clientY;
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    const sp = spin.current;
    if (!sp.dragging) return;
    const dx = e.clientX - sp.lastX, dy = e.clientY - sp.lastY;
    sp.y += dx * 0.012; sp.x += dy * 0.012;
    sp.vy = dx * 0.4;
    sp.lastX = e.clientX; sp.lastY = e.clientY;
  };
  const up = () => { spin.current.dragging = false; };

  return (
    <group ref={ref} position={rest}>
      <mesh ref={mesh} geometry={geo} castShadow onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
        <meshStandardMaterial vertexColors roughness={0.9} flatShading />
      </mesh>
      {/* Bigger invisible hit area: small fingers, small rock */}
      <mesh visible={false} onPointerDown={down}>
        <sphereGeometry args={[0.42, 12, 8]} />
      </mesh>
      <Highlight name="rock_1" radius={0.32} extra={() => invited.current && !inspecting} />
    </group>
  );
}

export default function Mars() {
  const ref = useRef<THREE.Group>(null);
  const { scene } = useThree();
  const fog = useMemo(() => new THREE.Fog("#d8a47e", 14, 75), []);
  useFrame(() => {
    const on = fx.shown === "mars";
    if (ref.current) ref.current.visible = on;
    scene.fog = on ? fog : null;
  });
  return (
    <group ref={ref} visible={false}>
      <Sky />
      <Ground />
      <Rocks />
      <Volcano />
      <CraterMarker />
      <InspectRock />
      <Dust />
      <mesh position={[0, 0, 0]} visible={false} ref={useRegister<THREE.Mesh>("ground")}>
        <sphereGeometry args={[0.05]} />
      </mesh>
      <hemisphereLight args={["#f6d2b0", "#6b3420", 0.9]} />
      <directionalLight position={[8, 10, 4]} intensity={1.9} color="#ffe2c2" castShadow
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-bias={-0.0004} />
    </group>
  );
}
