"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { frameMeter, type FrameStats } from "@/lib/telemetry/frames";
import { summarize, TARGET_MEDIAN_MS, TARGET_P95_MS, MIN_SAMPLES_FOR_VERDICT } from "@/lib/telemetry/latency";

// USD per 1M tokens, gpt-realtime-2.1, from the official model page on 2026-11-12. Re-verify before relying on it.
const PRICE = { textIn: 4, textOut: 24, audioIn: 32, audioOut: 64, cached: 0.4 };

/** Developer/parent-tester panel. Only rendered with ?dev=1 — never in the child's view. */
export default function DevPanel({ quality }: { quality: string }) {
  const s = useSession();
  const [fs, setFs] = useState<FrameStats>(frameMeter.stats());
  useEffect(() => {
    const i = setInterval(() => setFs(frameMeter.stats()), 1000);
    return () => clearInterval(i);
  }, []);
  const mode = s.mode ?? "demo";
  const all = summarize(s.results, mode);
  const warm = summarize(s.results, mode, { warmOnly: true });
  const u = s.usage;
  const cost =
    ((u.inputTokens - u.inputAudioTokens - u.cachedTokens) * PRICE.textIn + u.inputAudioTokens * PRICE.audioIn + u.cachedTokens * PRICE.cached +
      (u.outputTokens - u.outputAudioTokens) * PRICE.textOut + u.outputAudioTokens * PRICE.audioOut) / 1e6;
  const mins = s.sessionStartedAt ? (Date.now() - s.sessionStartedAt) / 60000 : 0;

  const download = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), frames: fs, quality, turns: session.storedResults() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ai-teacher-measurements.json";
    a.click();
  };
  const verdict = all.meetsTarget === null
    ? mode === "demo" ? "n/a — demo timings are simulated" : `not enough data (${all.samples}/${MIN_SAMPLES_FOR_VERDICT})`
    : all.meetsTarget ? "MEETS target" : "MISSES target";

  return (
    <aside className="dev" data-testid="dev">
      <b>DEV · {mode.toUpperCase()}{s.model ? ` · ${s.model}` : ""}</b>
      <table><tbody>
        <tr><td>state</td><td>{s.conv.state} · turn {s.conv.turnId}</td></tr>
        <tr><td>fps avg / 1% low</td><td>{fs.avgFps} / {fs.low1Fps}</td></tr>
        <tr><td>worst frame</td><td>{fs.worstFrameMs} ms · {fs.longFrames} long · {fs.stalls} stalls</td></tr>
        <tr><td>quality</td><td>{quality}</td></tr>
        <tr><td colSpan={2}><i>end of speech → first audible reply (target median ≤{TARGET_MEDIAN_MS}, p95 ≤{TARGET_P95_MS})</i></td></tr>
        <tr><td>all turns</td><td>n={all.samples} · med {all.medianMs ?? "–"} · p95 {all.p95Ms ?? "–"} ms</td></tr>
        <tr><td>warm only</td><td>n={warm.samples} · med {warm.medianMs ?? "–"} · p95 {warm.p95Ms ?? "–"} ms</td></tr>
        <tr><td>VAD wait (med)</td><td>{all.medianVadDelayMs ?? "–"} ms</td></tr>
        <tr><td>→ animation (med)</td><td>{all.medianAnimationMs ?? "–"} ms</td></tr>
        <tr><td>failed / cut off / &gt;4s</td><td>{all.failures} / {all.interrupted} / {all.overTarget}</td></tr>
        <tr><td>verdict</td><td>{verdict}</td></tr>
        <tr><td>commands</td><td>{s.rejectedCommands} rejected · {s.staleDropped} stale dropped</td></tr>
        <tr><td>usage</td><td>{u.responses} resp · in {u.inputTokens} (audio {u.inputAudioTokens}, cached {u.cachedTokens}) · out {u.outputTokens} (audio {u.outputAudioTokens})</td></tr>
        <tr><td>est. cost</td><td>{mode === "live" ? `$${cost.toFixed(4)} over ${mins.toFixed(1)} min` : "none (demo)"}</td></tr>
      </tbody></table>
      <button onClick={download}>Export measurements</button>
      <button onClick={() => session.clearStoredResults()}>Clear</button>
    </aside>
  );
}
