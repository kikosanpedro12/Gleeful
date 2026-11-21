"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildTeacher, LOOKS, type TeacherId } from "@/lib/teacher/rig";
import { TeacherAnimator } from "@/lib/teacher/animator";
import { GlbTeacherAnimator } from "@/lib/teacher/glbAnimator";
import { glbEnabled } from "@/lib/teacher/glbFlag";
import { loadGlbRig, type GlbRig } from "@/lib/teacher/glbRig";
import { glbLoading } from "@/lib/teacher/glbStatus";
import { perfEnabled, recordGlbLoad } from "@/lib/telemetry/perfOverlay";
import type { ActorAnimator, ActorRig } from "@/lib/teacher/actor";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { frameMeter } from "@/lib/telemetry/frames";
import { WORLDS } from "@/lib/worlds/registry";
import { previewLevel } from "@/lib/voice/preview";
import { fx, pointedRef, resolveTarget, teacherPosRef, TEST_HOOKS } from "./shared";
import { WORLD_GROUND } from "./worlds";

const ONBOARD_POS: Record<TeacherId, [number, number]> = { leo: [-0.75, -0.85], mia: [0.55, -0.85] };

export const actors: Partial<Record<TeacherId, { animator: ActorAnimator; rig: ActorRig }>> = {};

/** How long the stage waits for the GLB teacher before it shows the procedural one for the rest of the session. */
const GLB_WAIT_MS = 8000;

/**
 * One teacher in the scene. During onboarding both teachers stand side by side
 * and only react to the voice preview; in a lesson only the chosen one is shown
 * and is driven by the conversation.
 *
 * Which body: the rigged GLB character by default (src/lib/teacher/glbFlag.ts: ?rig=procedural or NEXT_PUBLIC_CHAR_GLB=0 switch it off); the procedural rig is the fallback. For the GLB path the rigged character is
 * loaded first; nothing is drawn for that teacher until it is ready or has failed (no flash of the old look), and any
 * failure (network, bad file, missing bone) or a wait over GLB_WAIT_MS silently keeps the procedural rig.
 */
export default function TeacherActor({ id, reducedMotion }: { id: TeacherId; reducedMotion: boolean }) {
  const wantGlb = useMemo(() => glbEnabled(), []);
  const [glb, setGlb] = useState<GlbRig | "failed" | null>(wantGlb ? null : "failed");
  // Release a GLB rig we ended up not using (a late load after the 8 s fallback, or after unmount). Kept out of the state updater (it must stay pure).
  const state = useRef<GlbRig | "failed" | null>(glb);
  state.current = glb;
  useEffect(() => {
    if (!wantGlb) return;
    let alive = true;
    glbLoading(id, true);
    const settle = (v: GlbRig | "failed") => { if (state.current === null) { state.current = v; setGlb(v); } else if (v !== "failed") v.dispose(); glbLoading(id, false); };
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => { if (alive) settle("failed"); }, GLB_WAIT_MS);
    // loadAsync cannot be aborted. That is fine: the file is cached and shared, and every result is stale-guarded (alive / state) before use.
    const t0 = performance.now();
    const perf = perfEnabled(window.location.search); // ?perf=1 only: record the load time for the overlay
    loadGlbRig(id).then(
      (r) => { if (perf) recordGlbLoad(id, performance.now() - t0); if (!alive) { r.dispose(); return; } settle(r); },
      () => { if (perf) recordGlbLoad(id, "failed"); if (alive) settle("failed"); },
    );
    return () => { alive = false; glbLoading(id, false); if (timer) clearTimeout(timer); timer = null; };
  }, [wantGlb, id]);
  if (glb === null) return null;
  return glb === "failed" ? <Body id={id} reducedMotion={reducedMotion} glb={null} /> : <Body id={id} reducedMotion={reducedMotion} glb={glb} />;
}

function Body({ id, reducedMotion, glb }: { id: TeacherId; reducedMotion: boolean; glb: GlbRig | null }) {
  const { rig, animator } = useMemo((): { rig: ActorRig; animator: ActorAnimator } => {
    if (glb) return { rig: glb, animator: new GlbTeacherAnimator(glb) };
    const r = buildTeacher(LOOKS[id]);
    return { rig: r, animator: new TeacherAnimator(r) };
  }, [id, glb]);
  useEffect(() => {
    actors[id] = { animator, rig };
    const [x, z] = ONBOARD_POS[id];
    animator.place(x, z);
    if (TEST_HOOKS) (window as any).__teachers = actors;
    return () => { delete actors[id]; animator.dispose?.(); rig.dispose(); };
  }, [id, rig, animator]);

  // Arrival in a new world: stand at its arrival spot (the view is hidden by the flash).
  useEffect(() => useSession.subscribe((s, prev) => {
    if (s.world !== prev.world || (s.status === "connected" && prev.status !== "connected")) {
      const spot = WORLDS[s.world].spots[WORLDS[s.world].arrivalSpot];
      if (s.teacher === id && spot) animator.place(spot[0], spot[1]);
    }
    if (s.status === "disconnected" && prev.status !== "disconnected") {
      const [x, z] = ONBOARD_POS[id];
      animator.place(x, z);
    }
  }), [id, animator]);

  useFrame(({ camera }, dt) => {
    const s = useSession.getState();
    const inLesson = s.status !== "disconnected" && s.teacher !== null;
    const isMe = s.teacher === id;
    rig.root.visible = inLesson ? isMe : true;
    if (inLesson && !isMe) return;
    if (id === "leo" || (inLesson && isMe)) frameMeter.push(dt);

    if (!inLesson) {
      const previewing = s.previewing === id;
      animator.update({
        dt, state: previewing ? "speaking" : "idle", turnId: 0, interrupted: false,
        outputLevel: previewing ? previewLevel() : 0, inputLevel: 0, camera: camera.position,
        reducedMotion, resolveTarget, resolveSpot: () => null, helmet: false,
        takeDirectives: () => [], onFirstAnimation: () => {},
      });
      return;
    }
    const world = WORLDS[s.world];
    animator.update({
      dt,
      state: s.conv.state,
      turnId: s.conv.turnId,
      interrupted: s.conv.interrupted,
      outputLevel: session.outputLevel(),
      inputLevel: session.inputLevel(),
      camera: camera.position,
      reducedMotion,
      resolveTarget,
      resolveSpot: (name) => (s.transit ? null : world.spots[name] ?? null),
      // Helmet in space (only space trips) and where a real person would need one. A fade trip to a market is not space.
      helmet: (s.transit ? s.transit.style !== "fade" || WORLDS[s.transit.to].helmet || WORLDS[s.transit.from].helmet : false) || world.helmet,
      groundY: WORLD_GROUND[fx.shown],
      takeDirectives: () => {
        const d = useSession.getState().directives;
        if (d.length) useSession.setState({ directives: [] });
        return d;
      },
      onFirstAnimation: (turnId) => session.markAnimation(turnId),
    });
    pointedRef.current = animator.pointed;
    teacherPosRef.current = rig.root.position;
    if (TEST_HOOKS) (window as any).__teacher = { rig, animator };
  });
  return <primitive object={rig.root} />;
}
