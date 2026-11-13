"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { CHAPTERS, chapterAt } from "./chapters";
import Poster from "./Posters";

const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

type Mode = "poster" | "loading" | "live";
const SLOW_FPS = 22;
const SLOW_KEY = "gleeful.landing.slow";

/** Decide once, on the client, whether this device gets the 3D flight. Everyone else keeps the still posters. */
export function canFly(): { ok: boolean; reason: string } {
  const q = new URLSearchParams(location.search);
  if (q.has("poster")) return { ok: false, reason: "forced" };
  if (q.has("3d")) return { ok: true, reason: "forced" };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return { ok: false, reason: "reduced-motion" };
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return { ok: false, reason: "save-data" };
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 3) return { ok: false, reason: "low-memory" };
  if ((navigator.hardwareConcurrency ?? 4) < 4) return { ok: false, reason: "few-cores" };
  try { if (sessionStorage.getItem(SLOW_KEY) === "1") return { ok: false, reason: "slow-before" }; } catch { /* storage blocked: fine */ }
  try {
    const c = document.createElement("canvas");
    if (!(c.getContext("webgl2") || c.getContext("webgl"))) return { ok: false, reason: "no-webgl" };
  } catch { return { ok: false, reason: "no-webgl" }; }
  return { ok: true, reason: "ok" };
}

export default function HeroTrack() {
  const wrap = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const [mode, setMode] = useState<Mode>("poster");
  const [reason, setReason] = useState("ssr");
  const [active, setActive] = useState(true);
  const [onAir, setOnAir] = useState(0);
  const forced = useRef(false);

  useEffect(() => {
    const d = canFly();
    setReason(d.reason);
    forced.current = d.reason === "forced";
    if (!d.ok) return;
    // Let the page paint (headline, posters) before downloading and starting the 3D stage.
    const start = () => setMode("loading");
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(start, { timeout: 1200 }); else setTimeout(start, 300);
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      progress.current = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
      const idx = Math.round(chapterAt(progress.current));
      setOnAir((prev) => (prev === idx ? prev : idx));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting && document.visibilityState === "visible"), { rootMargin: "100px" });
    io.observe(el);
    const vis = () => setActive(document.visibilityState === "visible" && el.getBoundingClientRect().bottom > 0);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", vis);
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const onReady = useCallback(() => setMode((m) => (m === "loading" ? "live" : m)), []);
  const onPerf = useCallback((fps: number) => {
    if (forced.current || fps >= SLOW_FPS) return;
    try { sessionStorage.setItem(SLOW_KEY, "1"); } catch { /* ignore */ }
    setReason("slow");
    setMode("poster");
  }, []);

  const ch = CHAPTERS[onAir];
  return (
    <div ref={wrap} className={`lp-hero is-${mode}`} data-testid="hero" data-mode={mode} data-reason={reason} data-onair={ch.id}>
      <div className="lp-stage" aria-hidden>
        {mode !== "poster" && <HeroScene progress={progress} active={active} onReady={onReady} onPerf={onPerf} />}
        <p className="lp-bug" style={{ background: ch.plate, color: ch.plateInk }}>
          <span className="lp-bug-dot" />Now showing: {ch.episode}{ch.preview ? " (preview)" : ""}
        </p>
      </div>
      {CHAPTERS.map((c, i) => (
        <section
          key={c.id}
          id={i === 0 ? "top" : `episode-${c.id}`}
          className={`lp-ch lp-ch-${c.id}`}
          data-chapter={c.id}
          aria-labelledby={`h-${c.id}`}
          style={{ "--sky": c.sky, "--ink": c.ink, "--plate": c.plate, "--plate-ink": c.plateInk } as React.CSSProperties}
        >
          <Poster id={c.id} />
          <div className="lp-third">
            <p className="lp-episode">{c.subject}{c.preview && <span className="lp-preview" data-testid="preview-tag"> · Preview, not in the demo yet</span>}</p>
            {i === 0
              ? <h1 id={`h-${c.id}`} className="lp-headline"><span>{c.headline}</span></h1>
              : <h2 id={`h-${c.id}`} className="lp-headline"><span>{c.headline}</span></h2>}
            <p className="lp-strap">{c.strap}</p>
            {i === 0 && (
              <>
                <div className="lp-ctas">
                  <a className="lp-btn lp-btn-main" href="/learn" data-testid="cta-demo">Try the demo lesson</a>
                  <a className="lp-btn lp-btn-alt" href="#how" data-testid="cta-how">How it works</a>
                </div>
                <p className="lp-status">Early access. The demo lesson is scripted; the Ask box below is the real AI; full live lessons are in private testing. The other worlds here are previews. Scroll to fly.</p>
              </>
            )}
            {i === CHAPTERS.length - 1 && (
              <div className="lp-ctas">
                <a className="lp-btn lp-btn-main" href="/learn">Try the demo lesson</a>
                <a className="lp-btn lp-btn-alt" href="#pricing">Prices at launch</a>
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
