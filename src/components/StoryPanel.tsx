"use client";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { SafeGLTFLoader } from "@/lib/three/safeGltfLoader";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { assetById, isProcedural } from "@/lib/assets/manifest";
import { figureById, type Figure } from "@/lib/assets/figures";
import { PRETEND_LABEL, PROP_SLOTS, SETTINGS, type Placement, type StoryFrame } from "@/lib/scene/frame";

/**
 * The story picture (docs/SCENE_KIT_SPEC.md v0.2): a small pretend diorama of a place or time, beside the lesson.
 * Only ids from our own manifests are drawn, from files we ship; placement is fixed here. Real people appear only as
 * a credited public-domain picture. Always labelled as pretend. Reduced motion: no turning.
 */
/** Where a figure stands (code decides, the model only picks left, center or right). */
const FIGURE_X: Record<Placement, number> = { left: -0.8, center: 0, right: 0.8 };
/** With a figure, props go to the other side so nothing walks through the person. */
const PROP_SLOTS_BESIDE: Record<Placement, [number, number][]> = {
  left: [[0.9, -0.4], [1.6, -1.0]],
  right: [[-0.9, -0.4], [-1.6, -1.0]],
  center: [[-1.0, -0.6], [1.0, -0.6]],
};

function Prop({ id, pos }: { id: string; pos: [number, number] }) {
  const a = assetById(id);
  const gltf = useLoader(SafeGLTFLoader, `/assets/${a?.file}`);
  const obj = useMemo(() => {
    const o = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    const k = 0.55 / Math.max(size.x, size.y, size.z, 0.001); // every prop fits a 0.55 m box so nothing dwarfs the rest
    o.scale.setScalar(k);
    const b2 = new THREE.Box3().setFromObject(o);
    o.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    const g = new THREE.Group();
    g.add(o);
    return g;
  }, [gltf]);
  return <primitive object={obj} position={[pos[0], 0, pos[1]]} />;
}

/** Sandstone pyramid: a four-sided cone turned so a face points at the camera. Plain shapes, not to scale. */
function Pyramid({ x, z, h }: { x: number; z: number; h: number }) {
  return (
    <mesh position={[x, h / 2, z]} rotation={[0, Math.PI / 4, 0]}>
      <coneGeometry args={[h * 0.82, h, 4, 1]} />
      <meshStandardMaterial color="#d8b26e" roughness={0.95} flatShading />
    </mesh>
  );
}
function Palm({ x, z, h, lean }: { x: number; z: number; h: number; lean: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, 0, lean]}>
      <mesh position={[0, h / 2, 0]}><cylinderGeometry args={[0.018, 0.028, h, 6]} /><meshStandardMaterial color="#8a6a43" roughness={1} /></mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.cos(i * 1.256) * 0.09, h, Math.sin(i * 1.256) * 0.09]} rotation={[Math.sin(i * 1.256) * 1.1, 0, -Math.cos(i * 1.256) * 1.1]}>
          <coneGeometry args={[0.05, 0.22, 4]} />
          <meshStandardMaterial color="#4f8a3a" roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  );
}
/** Props drawn in code (PROCEDURAL_PROPS): nothing to download, so no Suspense, no loader, no file. */
function ProceduralProp({ id, pos }: { id: string; pos: [number, number] }) {
  return (
    <group position={[pos[0], 0, pos[1]]} name={id}>
      {id === "pr_pyramids" && (<><Pyramid x={0} z={-0.15} h={0.62} /><Pyramid x={-0.46} z={0.05} h={0.42} /><Pyramid x={0.4} z={0.12} h={0.3} /></>)}
      {id === "pr_palms" && (<><Palm x={-0.12} z={0} h={0.5} lean={0.12} /><Palm x={0.12} z={0.08} h={0.38} lean={-0.18} /></>)}
    </group>
  );
}

/** A 3D character, about 1.1 m tall, standing on the ground facing the camera. Only files from figures.ts. */
function FigureModel({ fig, x }: { fig: Figure; x: number }) {
  const gltf = useLoader(SafeGLTFLoader, `/assets/${fig.model}`);
  const obj = useMemo(() => {
    const o = gltf.scene.clone(true);
    const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
    o.scale.setScalar(1.1 / Math.max(size.y, 0.001));
    const b2 = new THREE.Box3().setFromObject(o);
    o.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    const g = new THREE.Group();
    g.add(o);
    return g;
  }, [gltf]);
  return <primitive object={obj} position={[x, 0, -0.2]} />;
}

/** Full shows the whole picture; closeup moves in on the figure's head and shoulders. Positions are fixed here. */
function CameraAim({ closeup, x }: { closeup: boolean; x: number }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    if (closeup) { camera.position.set(x, 0.92, 0.62); camera.lookAt(x, 0.86, 0); }
    else { camera.position.set(x * 0.4, 0.85, 1.85); camera.lookAt(x * 0.3, 0.55, 0); }
    invalidate();
  }, [camera, invalidate, closeup, x]);
  return null;
}

/** A failed picture (bad network, no WebGL) must never take the lesson down: show the caption and label only. */
class PictureGuard extends Component<{ children: ReactNode; onFail?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail?.(); }
  render() { return this.state.failed ? <p className="story-note" data-testid="story-failed">The picture could not load.</p> : this.props.children; }
}

function Turn({ children, calm }: { children: React.ReactNode; calm: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (!calm && g.current) g.current.rotation.y += dt * 0.15; });
  return <group ref={g}>{children}</group>;
}

function Diorama({ frame, fig, calm }: { frame: StoryFrame; fig?: Figure; calm: boolean }) {
  const s = SETTINGS[frame.setting];
  const model = fig?.tier === "model" && fig.model ? fig : undefined;
  const placement = frame.placement ?? "right";
  const fx = FIGURE_X[placement];
  const beside = PROP_SLOTS_BESIDE[placement];
  return (
    <Canvas camera={{ position: [0, 1.1, 2.4], fov: 40 }} dpr={[1, 1.5]} gl={{ antialias: true }} frameloop={calm ? "demand" : "always"}>
      <color attach="background" args={[s.sky]} />
      <hemisphereLight args={["#ffffff", s.ground, 1.1]} />
      <directionalLight position={[2, 3, 2]} intensity={1.6} />
      {model && <CameraAim closeup={frame.view === "closeup"} x={fx} />}
      {/* With a character the picture holds still (a person who spins is odd); without one it turns slowly. */}
      <Turn calm={calm || !!model}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[2.4, 48]} /><meshStandardMaterial color={s.ground} roughness={1} /></mesh>
        <Suspense fallback={null}>{frame.props.map((id, i) => {
          const pos = (model ? beside[i] : undefined) ?? PROP_SLOTS[i] ?? [0, 0];
          return isProcedural(assetById(id)) ? <ProceduralProp key={id} id={id} pos={pos} /> : <Prop key={id} id={id} pos={pos} />;
        })}</Suspense>
      </Turn>
      {model && <Suspense fallback={null}><FigureModel fig={model} x={fx} /></Suspense>}
    </Canvas>
  );
}

export default function StoryPanel() {
  const sc = useSession((s) => s.scene);
  const calm = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  if (!sc) return null;
  const { frame } = sc;
  const fig = frame.figure ? figureById.get(frame.figure) : undefined;
  // Move and zoom must not remount the Canvas: key on what is drawn, not on the scene id.
  const drawKey = `${frame.setting}|${frame.era}|${frame.figure ?? ""}|${frame.props.join(",")}`;
  const drawFailed = failedKey === drawKey;
  return (
    <section className="story" data-testid="story" aria-label={`A pretend picture: ${frame.era}${fig ? `, with ${fig.name}` : ""}`}>
      <button className="ghost icon widget-close" aria-label="Close the picture" onClick={() => session.closeScene()}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" fill="none" /></svg>
      </button>
      {/* Nothing to draw (a name card with no props)? Then no empty hill: just the card and the caption. */}
      {(frame.props.length > 0 || (fig?.tier === "model" && fig.model)) && (
        <div className="story-view" aria-hidden="true"><PictureGuard key={drawKey} onFail={() => setFailedKey(drawKey)}><Diorama frame={frame} fig={fig} calm={calm} /></PictureGuard></div>
      )}
      {fig && fig.tier !== "portrait" && (
        <div className="story-card" data-testid="story-card" data-tier={fig.tier}>
          <b>{fig.name}</b> <span>{fig.years}</span>
          <p>{fig.blurb}</p>
          {fig.tier === "model" && !drawFailed && <p className="story-note">{fig.appearance === "uncertain" ? `Nobody knows exactly what ${fig.name} looked like. ` : ""}A pretend 3D character made with AI to help us imagine. It is not a real photo.</p>}
        </div>
      )}
      {fig && fig.tier === "portrait" && fig.file && (
        <figure className="story-figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/assets/figures/${fig.file}`} alt={fig.name} />
          <figcaption>{fig.name}. {fig.credit}. Public domain.</figcaption>
        </figure>
      )}
      <p className="story-era"><b>{frame.era}</b></p>
      <p className="story-note" data-testid="story-label">{PRETEND_LABEL}</p>
    </section>
  );
}
