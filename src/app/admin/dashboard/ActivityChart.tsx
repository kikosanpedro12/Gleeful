"use client";
import { useState } from "react";
import type { DayPoint } from "@/lib/billing/dashboard";
import { niceMax, pointsFor, shortDay } from "./format";

export const SERIES = [
  { key: "trialsStarted", label: "Trials started", color: "#b85c00", dash: "" },
  { key: "paid", label: "Paid", color: "#1f7a4d", dash: "" },
  { key: "cancelled", label: "Cancelled", color: "#c2275f", dash: "6 4" },
  { key: "refunds", label: "Refunds", color: "#7a3d8f", dash: "2 4" },
  { key: "failed", label: "Failed payments", color: "#2b59c3", dash: "10 3 2 3" },
] as const;
type Key = (typeof SERIES)[number]["key"];
const W = 640, H = 220;

export function ActivityChart({ series }: { series: DayPoint[] }) {
  const [on, setOn] = useState<Record<Key, boolean>>({ trialsStarted: true, paid: true, cancelled: true, refunds: false, failed: false });
  const [active, setActive] = useState<number | null>(null);
  const visible = SERIES.filter((s) => on[s.key]);
  const total = series.reduce((n, p) => n + p.trialsStarted + p.paid + p.cancelled + p.refunds + p.failed, 0);
  if (series.length === 0 || total === 0) {
    return <p className="ad-empty" data-testid="chart-empty">No billing events in this period yet, so there is nothing to draw. The chart fills in as trials and payments arrive.</p>;
  }
  const max = niceMax(Math.max(0, ...visible.flatMap((s) => series.map((p) => p[s.key]))));
  const n = series.length;
  const move = (i: number) => setActive(Math.max(0, Math.min(n - 1, i)));
  const onKey = (e: React.KeyboardEvent) => {
    const cur = active ?? n - 1;
    if (e.key === "ArrowLeft") { e.preventDefault(); move(cur - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); move(cur + 1); }
    else if (e.key === "Home") { e.preventDefault(); move(0); }
    else if (e.key === "End") { e.preventDefault(); move(n - 1); }
    else if (e.key === "Escape") setActive(null);
  };
  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width > 0) move(Math.round(((e.clientX - r.left) / r.width) * (n - 1)));
  };
  const p = active === null ? null : series[active];
  return (
    <div>
      <div className="ad-legend" role="group" aria-label="Choose which lines to show">
        {SERIES.map((s) => (
          <button key={s.key} type="button" aria-pressed={on[s.key]} onClick={() => setOn({ ...on, [s.key]: !on[s.key] })}>
            <svg width="26" height="6" aria-hidden="true"><line x1="0" y1="3" x2="26" y2="3" stroke={s.color} strokeWidth="3" strokeDasharray={s.dash || undefined} /></svg>
            {s.label}
          </button>
        ))}
      </div>
      <div className="ad-chart-wrap">
        <div className="ad-chart-y" aria-hidden="true"><span>{max}</span><span>{max / 2}</span><span>0</span></div>
        <div className="ad-chart-box" tabIndex={0} role="group" aria-label="Chart of billing events per day. Use the left and right arrow keys to read each day." onKeyDown={onKey} onBlur={() => setActive(null)} data-testid="chart-box">
          <svg className="ad-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" onPointerMove={onPointer} onPointerLeave={() => setActive(null)}>
            {[0, 0.5, 1].map((g) => <line key={g} x1="0" x2={W} y1={4 + g * (H - 8)} y2={4 + g * (H - 8)} stroke="#e3dccb" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            {visible.map((s) => (
              <polyline key={s.key} points={pointsFor(series.map((d) => d[s.key]), W, H, max)} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash || undefined} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ))}
            {active !== null && <line x1={n === 1 ? W / 2 : (active / (n - 1)) * W} x2={n === 1 ? W / 2 : (active / (n - 1)) * W} y1="0" y2={H} stroke="#14213D" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
          </svg>
        </div>
      </div>
      <div className="ad-chart-x" aria-hidden="true"><span>{shortDay(series[0].date)}</span><span>{shortDay(series[n - 1].date)}</span></div>
      <div className="ad-readout" aria-live="polite" data-testid="chart-readout">
        {p ? <><strong>{shortDay(p.date)}</strong>{": "}{visible.map((s) => `${s.label} ${p[s.key]}`).join(", ") || "No lines selected"}</> : <span className="ad-small">Point at the chart, or tab to it and use the arrow keys, to read a day. Days are Manila days.</span>}
      </div>
    </div>
  );
}
