"use client";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Component, Suspense, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { assetById } from "@/lib/assets/manifest";
import { figureById } from "@/lib/assets/figures";
import { PRETEND_LABEL, PROP_SLOTS, SETTINGS, type StoryFrame } from "@/lib/scene/frame";

/**
 * The story picture (docs/SCENE_KIT_SPEC.md v0.2): a small pretend diorama of a place or time, beside the lesson.
 * Only ids from our own manifests are drawn, from files we ship; placement is fixed here. Real people appear only as
 * a credited public-domain picture. Always labelled as pretend. Reduced motion: no turning.
 */
/**
 * three's GLTFLoader reads embedded textures through a blob: URL fetch, which our CSP (connect-src 'self') rightly
 * refuses. Without createImageBitmap it falls back to an <img> (img-src allows blob:), so hide it during parse only.
 * The check happens synchronously when the parser is built, so the restore below is safe.
 */
class SafeGLTFLoader extends GLTFLoader {
  override parse(data: ArrayBuffer | string, path: string, onLoad: Parameters<GLTFLoader["parse"]>[2], onError?: Parameters<GLTFLoader["parse"]>[3]) {
    const g = globalThis as { createImageBitmap?: unknown };
    const saved = g.createImageBitmap;
    g.createImageBitmap = undefined;
    try { super.parse(data, path, onLoad, onError); } finally { g.createImageBitmap = saved; }
  }
}

function Prop({ id, slot }: { id: string; slot: number }) {
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
  const [x, z] = PROP_SLOTS[slot] ?? [0, 0];
  return <primitive object={obj} position={[x, 0, z]} />;
}

/** A failed picture (bad network, no WebGL) must never take the lesson down: show the caption and label only. */
class PictureGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="story-note" data-testid="story-failed">The picture could not load.</p> : this.props.children; }
}

function Turn({ children, calm }: { children: React.ReactNode; calm: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (!calm && g.current) g.current.rotation.y += dt * 0.15; });
  return <group ref={g}>{children}</group>;
}

function Diorama({ frame, calm }: { frame: StoryFrame; calm: boolean }) {
  const s = SETTINGS[frame.setting];
  return (
    <Canvas camera={{ position: [0, 1.1, 2.4], fov: 40 }} dpr={[1, 1.5]} gl={{ antialias: true }} frameloop={calm ? "demand" : "always"}>
      <color attach="background" args={[s.sky]} />
      <hemisphereLight args={["#ffffff", s.ground, 1.1]} />
      <directionalLight position={[2, 3, 2]} intensity={1.6} />
      <Turn calm={calm}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[2.4, 48]} /><meshStandardMaterial color={s.ground} roughness={1} /></mesh>
        <Suspense fallback={null}>{frame.props.map((id, i) => <Prop key={id} id={id} slot={i} />)}</Suspense>
      </Turn>
    </Canvas>
  );
}

export default function StoryPanel() {
  const sc = useSession((s) => s.scene);
  const calm = useMemo(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  if (!sc) return null;
  const { frame } = sc;
  const fig = frame.figure ? figureById.get(frame.figure) : undefined;
  return (
    <section className="story" data-testid="story" aria-label={`A pretend picture: ${frame.era}`}>
      <button className="ghost icon widget-close" aria-label="Close the picture" onClick={() => session.closeScene()}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" fill="none" /></svg>
      </button>
      <div className="story-view"><PictureGuard key={sc.id}><Diorama frame={frame} calm={calm} /></PictureGuard></div>
      {fig && (
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
