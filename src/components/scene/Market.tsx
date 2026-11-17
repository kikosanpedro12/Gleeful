"use client";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { fx, Highlight, useCanvasTexture, useRegister } from "./shared";

/**
 * Fair Share Market: a pretend market stall for practising equal sharing (division).
 * A crate of 12 oranges and 3 baskets sit on the stall. Tapping the crate deals the
 * oranges one at a time, round and round, into the baskets until each has 4.
 * Everything is simple shapes made here (no downloaded assets).
 */
const TABLE = { x: 1.05, z: -1.35, top: 0.82 };
const CRATE_X = 0.3;
export const BASKET_X = [0.9, 1.3, 1.7] as const;
const ORANGES = 12;
const STEP_S = 0.42; // one orange leaves the crate every STEP_S seconds
const FLIGHT_S = 0.55;

/** Shared deal state (outside React so the 60 fps animation never re-renders). */
const deal = { start: -1 };
export const dealState = deal;

/** Where orange `i` rests in the crate (3 rows of 4) and in its basket (slot `k` of 4). */
function cratePos(i: number, v: THREE.Vector3) {
  const row = Math.floor(i / 4), col = i % 4;
  return v.set(CRATE_X - 0.12 + col * 0.08, TABLE.top + 0.13 + row * 0.03, TABLE.z - 0.05 + (row - 1) * 0.08);
}
function basketPos(i: number, v: THREE.Vector3) {
  const b = i % 3, k = Math.floor(i / 3);
  const ang = (k / 4) * Math.PI * 2;
  return v.set(BASKET_X[b] + Math.cos(ang) * 0.055 * (k < 3 ? 1 : 0), TABLE.top + 0.1 + (k === 3 ? 0.06 : 0), TABLE.z + Math.sin(ang) * 0.055 * (k < 3 ? 1 : 0));
}

function Oranges() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const geo = useMemo(() => new THREE.SphereGeometry(0.042, 16, 12), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f28c28", roughness: 0.6 }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const a = useMemo(() => new THREE.Vector3(), []), b = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (fx.shown !== "market") { deal.start = -1; return; } // leaving resets the stall for next time
    const t = deal.start < 0 ? -1 : (performance.now() - deal.start) / 1000;
    for (let i = 0; i < ORANGES; i++) {
      const m = refs.current[i];
      if (!m) continue;
      cratePos(i, a);
      basketPos(i, b);
      const p = t < 0 ? 0 : THREE.MathUtils.clamp((t - i * STEP_S) / FLIGHT_S, 0, 1);
      const e = p * p * (3 - 2 * p);
      m.position.lerpVectors(a, b, e);
      m.position.y += Math.sin(Math.PI * e) * 0.28; // a little hop
    }
  });
  return (
    <group>
      {Array.from({ length: ORANGES }, (_, i) => (
        <mesh key={i} ref={(m) => { refs.current[i] = m; }} geometry={geo} material={mat} castShadow />
      ))}
    </group>
  );
}

function Crate() {
  const ref = useRegister("crate");
  const invited = useRef(false);
  useFrame(() => { invited.current = useSession.getState().invite === "crate"; });
  const down = (e: ThreeEvent<PointerEvent>) => {
    if (fx.shown !== "market" || useSession.getState().transit) return; // hidden: never steal a tap meant for another world
    e.stopPropagation();
    deal.start = performance.now(); // (re)start the deal from a full crate
    session.tap("crate");
  };
  return (
    <group ref={ref} position={[CRATE_X, TABLE.top + 0.06, TABLE.z]}>
      <mesh castShadow onPointerDown={down}>
        <boxGeometry args={[0.4, 0.12, 0.3]} />
        <meshStandardMaterial color="#b7834f" roughness={0.9} />
      </mesh>
      {/* Bigger invisible hit area for small fingers */}
      <mesh visible={false} onPointerDown={down}>
        <boxGeometry args={[0.6, 0.4, 0.5]} />
      </mesh>
      <Highlight name="crate" radius={0.32} extra={() => invited.current} />
    </group>
  );
}

function Basket({ i }: { i: 0 | 1 | 2 }) {
  const name = `basket_${i + 1}`;
  const ref = useRegister(name);
  return (
    <group ref={ref} position={[BASKET_X[i], TABLE.top + 0.05, TABLE.z]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.13, 0.1, 0.1, 20, 1, true]} />
        <meshStandardMaterial color="#c99a5b" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.049, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.1, 20]} />
        <meshStandardMaterial color="#a77b45" />
      </mesh>
      <Highlight name={name} radius={0.18} />
    </group>
  );
}

function Sign() {
  const tex = useCanvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#2a6f63";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff6e5";
    ctx.font = "bold 64px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Fair Share Market", w / 2, h / 2);
  }, 1024, 160, []);
  return (
    <mesh position={[TABLE.x, 2.35, TABLE.z - 0.25]}>
      <planeGeometry args={[2.2, 0.34]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

function Stall() {
  const ref = useRegister("stall");
  const stripes = useMemo(() => Array.from({ length: 8 }, (_, i) => i), []);
  return (
    <group ref={ref} position={[TABLE.x, 0, TABLE.z]}>
      {/* Table */}
      <mesh position={[0, TABLE.top - 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.06, 0.7]} />
        <meshStandardMaterial color="#9c6b3f" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.4, 0.33]} castShadow>
        <boxGeometry args={[1.9, 0.78, 0.04]} />
        <meshStandardMaterial color="#e9c46a" roughness={0.9} />
      </mesh>
      {/* Posts and a striped awning */}
      {[-0.92, 0.92].map((x) => (
        <mesh key={x} position={[x, 1.1, -0.3]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 2.2, 8]} />
          <meshStandardMaterial color="#6b4a2b" />
        </mesh>
      ))}
      {stripes.map((i) => (
        <mesh key={i} position={[-0.83 + i * 0.237, 2.12, -0.05]} rotation={[0.35, 0, 0]}>
          <boxGeometry args={[0.237, 0.02, 0.75]} />
          <meshStandardMaterial color={i % 2 ? "#fff6e5" : "#e76f51"} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Other stalls and a back wall, for a sense of place. */
function Backdrop() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 12]} />
        <meshStandardMaterial color="#e8d2ad" roughness={1} />
      </mesh>
      <mesh position={[0, 2.5, -3.2]}>
        <planeGeometry args={[14, 5]} />
        <meshStandardMaterial color="#f7dcb0" roughness={1} />
      </mesh>
      {[[-2.4, "#7fb7b0"], [-3.9, "#f4a261"], [3.4, "#9ec5e8"]].map(([x, c]) => (
        <group key={String(x)} position={[x as number, 0, -2.6]}>
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[1.2, 0.9, 0.5]} />
            <meshStandardMaterial color={c as string} roughness={1} />
          </mesh>
          <mesh position={[0, 1.6, 0.1]} rotation={[0.3, 0, 0]}>
            <boxGeometry args={[1.35, 0.03, 0.7]} />
            <meshStandardMaterial color="#fff6e5" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function Market() {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.visible = fx.shown === "market"; // this component draws the "market" world (see worlds.ts)
  });
  return (
    <group ref={ref} visible={false}>
      <Backdrop />
      <Stall />
      <Sign />
      <Crate />
      <Basket i={0} />
      <Basket i={1} />
      <Basket i={2} />
      <Oranges />
    </group>
  );
}
