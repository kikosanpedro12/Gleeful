"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useSession } from "@/lib/session/store";
import { session, TRANSIT_MS, REDUCED_TRANSIT_MS } from "@/lib/session/controller";
import { fx } from "./shared";
import { actors } from "./TeacherActor";
import { WORLDS } from "@/lib/worlds/registry";

/**
 * Runs world travel from the store's `transit` record. Pure timeline: progress
 * comes from the clock, so a slow frame never skips the arrival or fires it twice.
 *
 * Space flight (≈9 s): walls open → stars appear → cruise toward the planet →
 * warm flash as we "land" → Mars surface. Fade: a soft colour dip (≈1.4 s).
 * Reduced motion: always a short fade.
 */
const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

export default function Director({ flash, reducedMotion }: { flash: React.RefObject<HTMLDivElement | null>; reducedMotion: boolean }) {
  const fired = useRef<{ t0: number; cruise: boolean; swapped: boolean } | null>(null);
  const { gl } = useThree();
  const bg = useRef(new THREE.Color("#f3e7d3"));
  const target = new THREE.Color();

  useFrame((_, dt) => {
    const s = useSession.getState();
    const tr = s.transit;
    let flashO = 0, flashColor = "#ffcfa3";
    if (!tr) {
      fired.current = null;
      fx.open = 0; fx.space = 0; fx.approach = 0; fx.travel = 0;
      fx.shown = s.world === "mars" ? "mars" : "classroom";
      fx.shot = fx.shown;
    } else {
      if (!fired.current || fired.current.t0 !== tr.t0) fired.current = { t0: tr.t0, cruise: false, swapped: false };
      const f = fired.current;
      const style = reducedMotion ? "fade" : tr.style;
      const dur = reducedMotion ? REDUCED_TRANSIT_MS : TRANSIT_MS[style];
      const p = THREE.MathUtils.clamp((performance.now() - tr.t0) / dur, 0, 1);
      if (style === "space_flight") {
        fx.open = smooth(0.02, 0.2, p);
        fx.space = smooth(0.06, 0.24, p);
        fx.approach = smooth(0.22, 0.86, p);
        fx.travel = smooth(0.2, 0.4, p) * (1 - smooth(0.7, 0.86, p));
        fx.shot = p < 0.84 ? (p < 0.06 ? "classroom" : "space") : "mars";
        flashO = smooth(0.74, 0.84, p) * (1 - smooth(0.86, 0.98, p));
        if (!f.cruise && p > 0.3) { f.cruise = true; session.transitEvent("cruise"); }
        fx.shown = p < 0.84 ? tr.from : tr.to;
        if (p >= 0.84) { fx.open = 0; fx.space = 0; }
      } else {
        flashColor = tr.to === "classroom" ? "#f6ead6" : "#ffcfa3";
        flashO = smooth(0, 0.45, p) * (1 - smooth(0.55, 1, p));
        fx.shown = p < 0.5 ? tr.from : tr.to;
        fx.shot = fx.shown;
        fx.open = 0; fx.space = 0;
      }
      // Hidden by the flash: move the teacher to the new world's arrival spot.
      if (!f.swapped && fx.shown === tr.to) {
        f.swapped = true;
        const spot = WORLDS[tr.to].spots[WORLDS[tr.to].arrivalSpot];
        const a = s.teacher ? actors[s.teacher] : undefined;
        if (a && spot) a.animator.place(spot[0], spot[1]);
      }
      if (p >= 1) { fired.current = null; session.transitEvent("arrived"); }
    }
    // Background colour follows where we are.
    const want = fx.space > 0.02 ? "#04060f" : fx.shown === "mars" ? "#d8a47e" : "#f3e7d3";
    target.set(want);
    bg.current.lerp(target, fx.space > 0.02 ? Math.min(1, fx.space * 1.2) : 1 - Math.exp(-8 * dt));
    gl.setClearColor(bg.current);
    const el = flash.current;
    if (el) {
      el.style.opacity = flashO.toFixed(3);
      el.style.background = flashColor;
      el.style.display = flashO > 0.002 ? "block" : "none";
    }
  });
  return null;
}
