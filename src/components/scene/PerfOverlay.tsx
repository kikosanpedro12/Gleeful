"use client";
import { useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { glbEnabled } from "@/lib/teacher/glbFlag";
import { glbLoadTimes, onGlbLoad, perfEnabled, readRenderCounts, RollingFps, setRenderCounts } from "@/lib/telemetry/perfOverlay";

/** True only for ?perf=1 together with the GLB rig on (it measures that rig). Read once per page view. */
export function perfWanted(): boolean {
  return typeof window !== "undefined" && perfEnabled(window.location.search) && glbEnabled();
}

/** Inside the Canvas: hands the renderer's counters to the overlay. Mounted only when perfWanted(). */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  useEffect(() => { setRenderCounts(() => ({ triangles: gl.info.render.triangles, calls: gl.info.render.calls })); return () => setRenderCounts(null); }, [gl]);
  return null;
}

/** Small corner readout for ?perf=1. Decorative (aria-hidden), no pointer events, own rAF loop that exists only while mounted. */
export default function PerfOverlay() {
  const [text, setText] = useState("measuring…");
  useEffect(() => {
    const meter = new RollingFps(2000);
    let raf = 0, last = 0, lastPaint = 0, alive = true;
    const render = () => {
      const c = readRenderCounts();
      const loads = glbLoadTimes().map(([id, ms]) => `${id} ${ms === "failed" ? "failed" : Math.round(ms) + " ms"}`).join(", ") || "loading";
      setText(`${meter.fps().toFixed(1)} fps (2 s avg) · ${c ? `${c.triangles} tris · ${c.calls} draws` : "no renderer yet"} · GLB load: ${loads}`);
    };
    const tick = (now: number) => {
      if (!alive) return;
      if (last) meter.push(now - last);
      last = now;
      if (now - lastPaint > 500) { lastPaint = now; render(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const off = onGlbLoad(render);
    return () => { alive = false; cancelAnimationFrame(raf); off(); };
  }, []);
  return (
    <div aria-hidden="true" data-testid="perf-overlay"
      style={{ position: "fixed", left: 4, bottom: 4, zIndex: 60, maxWidth: "min(330px, calc(100vw - 8px))", margin: 0, padding: "3px 6px", borderRadius: 6, background: "rgba(20,33,61,.78)", color: "#fff", font: "600 11px/1.35 ui-monospace, monospace", pointerEvents: "none", userSelect: "none" }}>
      <div>{text}</div>
      <div style={{ opacity: 0.8 }}>measured on this device</div>
    </div>
  );
}
