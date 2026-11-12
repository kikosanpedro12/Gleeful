"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { frameMeter, type FrameStats } from "@/lib/telemetry/frames";
import { summarize, TARGET_MEDIAN_MS, TARGET_P95_MS, MIN_SAMPLES_FOR_VERDICT } from "@/lib/telemetry/latency";

/** Developer / parent-tester panel. Only rendered with ?dev=1, never in the child's normal view. */
export default function DevPanel({ quality }: { quality: string }) {
  const s = useSession();
  const [fs, setFs] = useState<FrameStats>(frameMeter.stats());
  useEffect(() => {
    const i = setInterval(() => setFs(frameMeter.stats()), 1000);
    return () => clearInterval(i);
  }, []);
  const mode = s.mode ?? "demo";
  const all = summarize(s.results, mode);
  const download = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ua: navigator.userAgent, frames: fs, quality, turns: session.storedResults() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ai-teacher-measurements.json";
    a.click();
  };
  return (
    <aside className="dev" data-testid="dev">
      <b>DEV · {mode.toUpperCase()}{s.model ? ` · ${s.model}` : ""}</b>
      <table><tbody>
        <tr><td>state</td><td>{s.conv.state} · turn {s.conv.turnId} · {s.transit ? `travelling → ${s.transit.to}` : s.world}</td></tr>
        <tr><td>fps avg / 1% low</td><td>{fs.avgFps} / {fs.low1Fps}</td></tr>
        <tr><td>worst frame</td><td>{fs.worstFrameMs} ms · {fs.longFrames} long · {fs.stalls} stalls</td></tr>
        <tr><td>quality</td><td>{quality}</td></tr>
        <tr><td colSpan={2}><i>input → first audible reply (target median ≤{TARGET_MEDIAN_MS}, p95 ≤{TARGET_P95_MS})</i></td></tr>
        <tr><td>turns</td><td>n={all.samples} · med {all.medianMs ?? "–"} · p95 {all.p95Ms ?? "–"} ms</td></tr>
        <tr><td>→ animation (med)</td><td>{all.medianAnimationMs ?? "–"} ms</td></tr>
        <tr><td>verdict</td><td>{mode === "demo" ? "n/a: scripted replies, not a real AI response time" : all.meetsTarget === null ? `not enough spoken turns (${all.voiceSamples}/${MIN_SAMPLES_FOR_VERDICT})` : all.meetsTarget ? "MEETS target" : "MISSES target"}</td></tr>
        <tr><td>commands</td><td>{s.rejectedCommands} rejected · {s.staleDropped} stale dropped</td></tr>
        <tr><td>AI cost</td><td>{mode === "demo" ? "$0 (no AI calls)" : `${s.usage.responses} responses`}</td></tr>
      </tbody></table>
      <button onClick={download}>Export measurements</button>
      <button onClick={() => session.clearStoredResults()}>Clear</button>
    </aside>
  );
}
