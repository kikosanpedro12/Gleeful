"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { buildTeacher, LOOKS, type TeacherId } from "@/lib/teacher/rig";
import { TeacherAnimator } from "@/lib/teacher/animator";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { frameMeter } from "@/lib/telemetry/frames";
import { WORLDS } from "@/lib/worlds/registry";
import { previewLevel } from "@/lib/voice/preview";
import { fx, pointedRef, resolveTarget, TEST_HOOKS } from "./shared";
import { WORLD_GROUND } from "./worlds";

const ONBOARD_POS: Record<TeacherId, [number, number]> = { leo: [-0.75, -0.85], mia: [0.55, -0.85] };

export const actors: Partial<Record<TeacherId, { animator: TeacherAnimator; rig: ReturnType<typeof buildTeacher> }>> = {};

/**
 * One teacher in the scene. During onboarding both teachers stand side by side
 * and only react to the voice preview; in a lesson only the chosen one is shown
 * and is driven by the conversation.
 */
export default function TeacherActor({ id, reducedMotion }: { id: TeacherId; reducedMotion: boolean }) {
  const rig = useMemo(() => buildTeacher(LOOKS[id]), [id]);
  const animator = useMemo(() => new TeacherAnimator(rig), [rig]);
  useEffect(() => {
    actors[id] = { animator, rig };
    const [x, z] = ONBOARD_POS[id];
    animator.place(x, z);
    if (TEST_HOOKS) (window as any).__teachers = actors;
    return () => { delete actors[id]; rig.dispose(); };
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
      helmet: !!s.transit || world.helmet,
      groundY: WORLD_GROUND[fx.shown],
      takeDirectives: () => {
        const d = useSession.getState().directives;
        if (d.length) useSession.setState({ directives: [] });
        return d;
      },
      onFirstAnimation: (turnId) => session.markAnimation(turnId),
    });
    pointedRef.current = animator.pointed;
    (window as unknown as { __teacherPos?: unknown }).__teacherPos = rig.root.position;
    if (TEST_HOOKS) (window as any).__teacher = { rig, animator };
  });
  return <primitive object={rig.root} />;
}
