"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { buildTeacher } from "@/lib/teacher/rig";
import { TeacherAnimator } from "@/lib/teacher/animator";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { frameMeter } from "@/lib/telemetry/frames";

/** Named scene objects the teacher can point at. Positions come from the real meshes. */
const registry = new Map<string, THREE.Object3D>();
const tmp = new THREE.Vector3();
const resolveTarget = (name: string) => {
  const o = registry.get(name);
  return o ? o.getWorldPosition(tmp.clone()) : null;
};
const pointedRef = { current: null as string | null };

function useRegister(name: string) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    if (ref.current) registry.set(name, ref.current);
    return () => void registry.delete(name);
  }, [name]);
  return ref;
}

/** Soft pulsing ring that appears on whatever the teacher is pointing at. */
function Highlight({ name, radius }: { name: string; radius: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock, camera }) => {
    const m = ref.current;
    if (!m) return;
    const on = pointedRef.current === name;
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.opacity += ((on ? 0.9 : 0) - mat.opacity) * 0.15;
    m.visible = mat.opacity > 0.02;
    m.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5) * 0.05);
    m.quaternion.copy(camera.quaternion);
  });
  return (
    <mesh ref={ref} visible={false} renderOrder={5}>
      <ringGeometry args={[radius, radius * 1.09, 48]} />
      <meshBasicMaterial color="#ffd166" transparent opacity={0} depthTest={false} />
    </mesh>
  );
}

function useCanvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, deps: unknown[]) {
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
    let size = 92;
    ctx.font = `600 ${size}px "Comic Sans MS", "Chalkboard SE", "Segoe Print", sans-serif`;
    while (ctx.measureText(text).width > w * 0.86 && size > 34) {
      size -= 6;
      ctx.font = `600 ${size}px "Comic Sans MS", "Chalkboard SE", "Segoe Print", sans-serif`;
    }
    ctx.fillText(text, w / 2, h / 2); // canvas text only: never HTML
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
  // Our own procedural texture: an illustrative globe, not a map of Mars.
  const tex = useCanvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#b5532c";
    ctx.fillRect(0, 0, w, h);
    let seed = 42;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) {
      const x = r() * w, y = h * 0.12 + r() * h * 0.76, rad = 6 + r() * 46;
      ctx.fillStyle = ["rgba(120,50,26,0.28)", "rgba(214,120,70,0.25)", "rgba(88,38,22,0.22)"][i % 3];
      ctx.beginPath();
      ctx.ellipse(x, y, rad * 1.8, rad, r() * 3, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(245,238,230,0.9)";
    ctx.fillRect(0, 0, w, h * 0.045);
    ctx.fillRect(0, h * 0.965, w, h * 0.035);
  }, 512, 256, []);
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
    if (register && ref.current) registry.set("window", ref.current);
    return () => { if (register) registry.delete("window"); };
  }, [register]);
  return (
    <group ref={ref} position={[x, 1.75, -2.97]}>
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

function Classroom() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 10]} />
        <meshStandardMaterial color="#d9b48a" roughness={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.1, 0.004, -0.6]} receiveShadow>
        <circleGeometry args={[1.5, 48]} />
        <meshStandardMaterial color="#7fb7b0" roughness={1} />
      </mesh>
      <mesh position={[0, 2, -3]}>
        <planeGeometry args={[12, 4]} />
        <meshStandardMaterial color="#f3e7d3" roughness={1} />
      </mesh>
      <mesh position={[0, 0.5, -2.99]}>
        <planeGeometry args={[12, 1]} />
        <meshStandardMaterial color="#e3cfae" roughness={1} />
      </mesh>
      <mesh position={[-4.5, 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[10, 4]} />
        <meshStandardMaterial color="#efe1ca" roughness={1} />
      </mesh>
      <mesh position={[4.5, 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[10, 4]} />
        <meshStandardMaterial color="#efe1ca" roughness={1} />
      </mesh>
      <Board />
      <Window x={2.75} register />
      <Window x={-1.95} />
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
      <Bookshelf />
    </group>
  );
}

function Teacher() {
  const rig = useMemo(() => buildTeacher(), []);
  const animator = useMemo(() => new TeacherAnimator(rig), [rig]);
  const reduced = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  useEffect(() => {
    (window as any).__teacher = { rig, animator };
    return () => rig.dispose();
  }, [rig, animator]);
  useFrame(({ camera }, dt) => {
    frameMeter.push(dt);
    const s = useSession.getState();
    animator.update({
      dt,
      state: s.conv.state,
      turnId: s.conv.turnId,
      interrupted: s.conv.interrupted,
      outputLevel: session.outputLevel(),
      inputLevel: session.inputLevel(),
      camera: camera.position,
      reducedMotion: reduced,
      resolveTarget,
      takeDirectives: () => {
        const d = useSession.getState().directives;
        if (d.length) useSession.setState({ directives: [] });
        return d;
      },
      onFirstAnimation: (turnId) => session.markAnimation(turnId),
    });
    pointedRef.current = animator.pointed;
  });
  return <primitive object={rig.root} />;
}

/** Frames the teacher for both landscape and portrait screens; follows gently. */
function CameraRig() {
  const { camera, size } = useThree();
  const look = useRef(new THREE.Vector3(0, 1.2, -1));
  useFrame((_, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const portrait = size.width / size.height < 0.9;
    const fov = portrait ? 58 : 40;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const t = (window as any).__teacher?.rig.root.position as THREE.Vector3 | undefined;
    const tx = t ? t.x * (portrait ? 0.85 : 0.35) : 0;
    const tz = t ? t.z : -0.8;
    const k = 1 - Math.exp(-2.2 * dt);
    cam.position.x += (tx * 0.6 - cam.position.x) * k;
    cam.position.y += (1.45 - cam.position.y) * k;
    cam.position.z += ((portrait ? 3.9 : 4.0) + (tz + 0.8) * 0.35 - cam.position.z) * k;
    look.current.x += (tx - look.current.x) * k;
    look.current.z += (tz - look.current.z) * k;
    cam.lookAt(look.current.x, portrait ? 1.0 : 1.05, look.current.z);
  });
  return null;
}

/** If the device cannot hold ~30 fps, drop resolution and shadows (and say so in the dev panel). */
function QualityGuard({ onLow }: { onLow: () => void }) {
  const n = useRef(0);
  const acc = useRef(0);
  const done = useRef(false);
  useFrame((_, dt) => {
    if (done.current || dt > 1) return;
    n.current++;
    if (n.current < 60) return; // skip warm-up frames
    acc.current += dt;
    if (n.current === 300) {
      done.current = true;
      if (240 / acc.current < 28) onLow();
    }
  });
  return null;
}

export default function Stage({ onQuality }: { onQuality?: (q: "high" | "low") => void }) {
  const [low, setLow] = useState(false);
  return (
    <Canvas
      shadows={!low}
      dpr={low ? 1 : [1, 1.75]}
      camera={{ position: [0, 1.45, 3.3], fov: 40, near: 0.1, far: 40 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => { gl.setClearColor("#f3e7d3"); }}
    >
      <hemisphereLight args={["#fff6e6", "#c9b08e", 1.05]} />
      <directionalLight
        position={[2.5, 4.5, 3.5]} intensity={1.7} castShadow={!low}
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-4} shadow-camera-right={4}
        shadow-camera-top={4} shadow-camera-bottom={-2} shadow-bias={-0.0004}
      />
      <directionalLight position={[-3, 2.5, 2]} intensity={0.35} />
      <Classroom />
      <Teacher />
      <CameraRig />
      <QualityGuard onLow={() => { setLow(true); onQuality?.("low"); }} />
    </Canvas>
  );
}
