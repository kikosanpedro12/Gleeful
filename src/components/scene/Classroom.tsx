"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useSession } from "@/lib/session/store";
import { drawMarsTexture, fx, Highlight, registry, useCanvasTexture, useRegister } from "./shared";

function Board() {
  const text = useSession((s) => s.boardText);
  const ref = useRegister("board");
  const tex = useCanvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#24443f";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % w, (i * 53) % h, 120, 3);
    ctx.fillStyle = "#f4f1e6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const font = (n: number) => `600 ${n}px "Comic Sans MS", "Chalkboard SE", "Segoe Print", sans-serif`;
    // Wrap onto up to two lines, then shrink to fit (canvas text only, never HTML).
    let size = 92;
    let lines = [text];
    const fits = () => lines.every((l) => ctx.measureText(l).width <= w * 0.88) && lines.length * size * 1.15 <= h * 0.85;
    ctx.font = font(size);
    while (!fits() && size > 30) {
      const words = text.split(" ");
      if (words.length > 1 && ctx.measureText(text).width > w * 0.88) {
        let best = 1, bestW = Infinity;
        for (let i = 1; i < words.length; i++) {
          const m = Math.max(ctx.measureText(words.slice(0, i).join(" ")).width, ctx.measureText(words.slice(i).join(" ")).width);
          if (m < bestW) { bestW = m; best = i; }
        }
        lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
      }
      if (fits()) break;
      size -= 6;
      ctx.font = font(size);
    }
    lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
  }, 1024, 512, [text]);
  return (
    <group ref={ref} position={[0.25, 1.72, -2.94]}>
      <mesh position={[0, 0, -0.02]} castShadow>
        <boxGeometry args={[2.9, 1.5, 0.06]} />
        <meshStandardMaterial color="#b98a5a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.012]}>
        <planeGeometry args={[2.72, 1.32]} />
        <meshStandardMaterial map={tex} roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.78, 0.06]}>
        <boxGeometry args={[2.9, 0.05, 0.12]} />
        <meshStandardMaterial color="#a57a4d" roughness={0.7} />
      </mesh>
      <Highlight name="board" radius={0.9} />
    </group>
  );
}

function MarsGlobe() {
  const ref = useRegister("mars_globe");
  const ball = useRef<THREE.Mesh>(null);
  const tex = useCanvasTexture(drawMarsTexture, 512, 256, []);
  useFrame((_, dt) => { if (ball.current) ball.current.rotation.y += dt * 0.25; });
  return (
    <group ref={ref} position={[1.75, 1.07, -1.25]}>
      <mesh ref={ball} castShadow>
        <sphereGeometry args={[0.19, 40, 28]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.215, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.06, 10]} />
        <meshStandardMaterial color="#3b3b44" />
      </mesh>
      <mesh position={[0, -0.25, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.11, 0.025, 20]} />
        <meshStandardMaterial color="#3b3b44" />
      </mesh>
      <Highlight name="mars_globe" radius={0.27} />
    </group>
  );
}

function Bookshelf() {
  const ref = useRegister("bookshelf");
  const books = useMemo(() => {
    const colors = ["#e76f51", "#2a9d8f", "#e9c46a", "#457b9d", "#f4a261", "#8ab17d", "#b56576"];
    const out: { x: number; y: number; h: number; w: number; c: string }[] = [];
    for (let row = 0; row < 3; row++) {
      let x = -0.4;
      for (let i = 0; x < 0.36; i++) {
        const w = 0.045 + ((i * 7 + row * 3) % 4) * 0.012;
        out.push({ x: x + w / 2, y: -0.42 + row * 0.42, h: 0.24 + ((i * 5 + row) % 3) * 0.03, w, c: colors[(i + row * 2) % colors.length] });
        x += w + 0.006;
      }
    }
    return out;
  }, []);
  return (
    <group ref={ref} position={[-2.45, 0.95, -2.7]}>
      <mesh castShadow position={[0, 0, -0.02]}>
        <boxGeometry args={[0.95, 1.5, 0.3]} />
        <meshStandardMaterial color="#c9a274" roughness={0.8} />
      </mesh>
      {[-0.6, -0.18, 0.24].map((y) => (
        <mesh key={y} position={[0, y + 0.19, 0.02]}>
          <boxGeometry args={[0.86, 0.36, 0.25]} />
          <meshStandardMaterial color="#8a6a48" roughness={0.9} />
        </mesh>
      ))}
      {books.map((b, i) => (
        <mesh key={i} position={[b.x, b.y + b.h / 2 - 0.14, 0.08]}>
          <boxGeometry args={[b.w, b.h, 0.17]} />
          <meshStandardMaterial color={b.c} roughness={0.85} />
        </mesh>
      ))}
      <Highlight name="bookshelf" radius={0.75} />
    </group>
  );
}

function Window({ x, register }: { x: number; register?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    const o = ref.current;
    if (register && o) registry.set("window", o);
    return () => { if (register && registry.get("window") === o) registry.delete("window"); };
  }, [register]);
  return (
    <group ref={ref} position={[x, 1.75, 0.03]}>
      <mesh>
        <planeGeometry args={[0.95, 1.3]} />
        <meshBasicMaterial color="#bfe6f5" />
      </mesh>
      <mesh position={[0, -0.25, 0.001]}>
        <planeGeometry args={[0.95, 0.5]} />
        <meshBasicMaterial color="#a9d99a" />
      </mesh>
      {[[0, 0, 0.05, 1.36], [0, 0, 1.01, 0.05], [-0.5, 0, 0.05, 1.36], [0.5, 0, 0.05, 1.36], [0, 0.66, 1.05, 0.05], [0, -0.66, 1.05, 0.05]].map(([px, py, w, h], i) => (
        <mesh key={i} position={[px, py, 0.02]}>
          <boxGeometry args={[w, h, 0.04]} />
          <meshStandardMaterial color="#f7f3ea" />
        </mesh>
      ))}
      {register && <Highlight name="window" radius={0.8} />}
    </group>
  );
}

/**
 * The classroom is the hub. For a space trip its walls swing open like a
 * flower and the floor drops away, leaving the teacher and the child on the
 * rug, which becomes the travel platform.
 */
export default function Classroom() {
  const back = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const floor = useRef<THREE.Group>(null);
  const all = useRef<THREE.Group>(null);
  const rug = useRef<THREE.Group>(null);
  useFrame(() => {
    const o = fx.open;
    const e = o * o * (3 - 2 * o);
    // Walls peel outward from the top, then drift away and down into the stars.
    const peel = Math.min(1, e * 1.6), away = Math.max(0, e - 0.35) / 0.65;
    if (back.current) {
      back.current.rotation.x = -peel * 0.9;
      back.current.position.set(0, -away * 7, -3 - away * 9);
      back.current.visible = e < 0.99;
    }
    if (left.current) {
      left.current.rotation.z = peel * 0.9;
      left.current.position.set(-4.5 - away * 8, -away * 6, 0);
      left.current.visible = e < 0.99;
    }
    if (right.current) {
      right.current.rotation.z = -peel * 0.9;
      right.current.position.set(4.5 + away * 8, -away * 6, 0);
      right.current.visible = e < 0.99;
    }
    if (floor.current) { floor.current.position.y = -e * e * 12; floor.current.visible = e < 0.98; }
    if (all.current) all.current.visible = fx.shown === "classroom";
    // The rug glows a little while it carries us through space.
    if (rug.current) rug.current.position.y = Math.sin(performance.now() / 700) * 0.02 * e;
  });
  return (
    <group ref={all}>
      <group ref={floor}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[12, 10]} />
          <meshStandardMaterial color="#d9b48a" roughness={0.85} />
        </mesh>
        {/* Desk */}
        <group position={[1.75, 0, -1.25]}>
          <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.25, 0.06, 0.65]} />
            <meshStandardMaterial color="#b9895a" roughness={0.7} />
          </mesh>
          {[[-0.56, -0.27], [0.56, -0.27], [-0.56, 0.27], [0.56, 0.27]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.375, z]} castShadow>
              <boxGeometry args={[0.06, 0.75, 0.06]} />
              <meshStandardMaterial color="#8f6741" />
            </mesh>
          ))}
          <mesh position={[-0.35, 0.84, 0.05]} castShadow>
            <boxGeometry args={[0.28, 0.05, 0.2]} />
            <meshStandardMaterial color="#e76f51" />
          </mesh>
        </group>
        <MarsGlobe />
      </group>
      <group ref={rug}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.1, 0.006, -0.6]} receiveShadow>
          <circleGeometry args={[1.5, 48]} />
          <meshStandardMaterial color="#7fb7b0" roughness={1} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.1, 0.007, -0.6]}>
          <ringGeometry args={[1.38, 1.46, 64]} />
          <meshStandardMaterial color="#f4f1e6" roughness={1} />
        </mesh>
      </group>
      {/* Back wall, hinged at its base */}
      <group ref={back} position={[0, 0, -3]}>
        <mesh position={[0, 2, 0]}>
          <planeGeometry args={[12, 4]} />
          <meshStandardMaterial color="#f3e7d3" roughness={1} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.5, 0.01]}>
          <planeGeometry args={[12, 1]} />
          <meshStandardMaterial color="#e3cfae" roughness={1} />
        </mesh>
        <group position={[0, 0, 3]}>
          <Board />
          <Bookshelf />
        </group>
        <Window x={2.75} register />
        <Window x={-1.95} />
      </group>
      <group ref={left} position={[-4.5, 0, 0]}>
        <mesh position={[0, 2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[10, 4]} />
          <meshStandardMaterial color="#efe1ca" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <group ref={right} position={[4.5, 0, 0]}>
        <mesh position={[0, 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[10, 4]} />
          <meshStandardMaterial color="#efe1ca" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
