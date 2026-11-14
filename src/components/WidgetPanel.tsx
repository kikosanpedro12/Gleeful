"use client";
import { useMemo, useState } from "react";
import { useSession } from "@/lib/session/store";
import { session } from "@/lib/session/controller";
import { LOOKS } from "@/lib/teacher/rig";
import { describeWidget, formatFraction, formatValue, targetString, type FractionBarsSpec, type NumberLineSpec, type WidgetSpec } from "@/lib/widgets/spec";

/**
 * The on-screen teaching widget (docs/SCENE_KIT_SPEC.md). Plain SVG/HTML on top of the 3D scene: cheap on phones,
 * readable by screen readers, no model-written code. The child sets it by tapping; "Tell <teacher>" sends what
 * they set (and the target the teacher asked for) back as a normal turn, so the usual interruption rules apply.
 */
export default function WidgetPanel() {
  const w = useSession((s) => s.widget);
  const teacher = useSession((s) => s.teacher);
  if (!w) return null;
  const name = teacher ? LOOKS[teacher].name : "the teacher";
  return (
    <section className="widget" data-testid="widget" data-kind={w.spec.kind} aria-label={describeWidget(w.spec)}>
      <button className="ghost icon widget-close" aria-label="Close this" onClick={() => session.closeWidget()}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" fill="none" /></svg>
      </button>
      {w.spec.kind === "number_line" ? <NumberLine key={w.id} spec={w.spec} name={name} /> : <FractionBars key={w.id} spec={w.spec} name={name} />}
    </section>
  );
}

const W = 360, PAD = 26, Y = 62;

function NumberLine({ spec, name }: { spec: NumberLineSpec; name: string }) {
  const n = Math.round((spec.max - spec.min) / spec.step);
  const [at, setAt] = useState<number | null>(null); // tick index the child picked
  const x = (i: number) => PAD + ((W - 2 * PAD) * i) / n;
  const value = (i: number) => spec.min + i * spec.step;
  const stride = Math.max(1, Math.ceil((n + 1) / 9)); // at most ~9 tick labels so they never collide
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD) / (W - 2 * PAD)) * n);
    setAt(Math.min(n, Math.max(0, i)));
  };
  const set = (d: number) => setAt((cur) => Math.min(n, Math.max(0, (cur ?? 0) + d)));
  const shown = at === null ? null : formatValue(value(at), spec);
  return (
    <div className="widget-body">
      <svg
        viewBox={`0 0 ${W} 112`} className="nl" role="slider" tabIndex={0} aria-label="Number line: tap a mark"
        aria-valuemin={spec.min} aria-valuemax={spec.max} aria-valuenow={at === null ? undefined : value(at)} aria-valuetext={shown ?? "nothing picked"}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); set(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); set(at === null ? 0 : -1); } }}
      >
        <rect x="0" y="0" width={W} height="112" fill="transparent" />
        <line x1={PAD} x2={W - PAD} y1={Y} y2={Y} className="nl-line" />
        {Array.from({ length: n + 1 }, (_, i) => (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={Y - 9} y2={Y + 9} className="nl-tick" />
            {i % stride === 0 && <text x={x(i)} y={Y + 28} className="nl-label" textAnchor="middle">{formatValue(value(i), spec)}</text>}
          </g>
        ))}
        {spec.marks.map((m, k) => {
          const i = (m - spec.min) / spec.step;
          return (
            <g key={k}>
              <circle cx={x(i)} cy={Y} r="7" className="nl-mark" />
              <text x={x(i)} y={Y - 16} className="nl-mark-label" textAnchor="middle">{formatValue(m, spec)}</text>
            </g>
          );
        })}
        {at !== null && (
          <g>
            <circle cx={x(at)} cy={Y} r="11" className="nl-pick" />
            <text x={x(at)} y={Y - 20} className="nl-pick-label" textAnchor="middle">{shown}</text>
          </g>
        )}
      </svg>
      <div className="widget-actions">
        <button className="ghost" aria-label="Move one step left" disabled={at === 0} onClick={() => set(at === null ? 0 : -1)}>◀</button>
        <button className="ghost" aria-label="Move one step right" disabled={at === n} onClick={() => set(at === null ? 0 : 1)}>▶</button>
        <button className="primary" data-testid="widget-send" disabled={shown === null} onClick={() => shown !== null && session.widgetAnswer("number_line", shown, targetString(spec), `(put the marker at ${shown} on the number line)`)}>
          Tell {name}{shown !== null ? `: ${shown}` : ""}
        </button>
      </div>
    </div>
  );
}

function FractionBars({ spec, name }: { spec: FractionBarsSpec; name: string }) {
  const [shaded, setShaded] = useState(spec.bars[0].shaded);
  const parts = spec.bars[0].parts;
  const label = shaded === 0 ? "none" : formatFraction(shaded, parts);
  return (
    <div className="widget-body">
      <div className="fb">
        {spec.bars.map((b, bi) => (
          <div key={bi} className={`fb-row ${bi === 0 ? "mine" : "ref"}`}>
            <div className="fb-bar" role={bi === 0 ? "group" : "img"} aria-label={bi === 0 ? `Your bar: ${shaded} of ${parts} parts shaded` : `Reference bar: ${b.shaded} of ${b.parts} parts shaded`}>
              {Array.from({ length: b.parts }, (_, j) => {
                const on = j < (bi === 0 ? shaded : b.shaded);
                return bi === 0 ? (
                  <button key={j} className={`fb-part ${on ? "on" : ""}`} aria-pressed={on} aria-label={`Part ${j + 1} of ${b.parts}`} onClick={() => setShaded(j + 1 === shaded ? j : j + 1)} />
                ) : (
                  <span key={j} className={`fb-part ref ${on ? "on" : ""}`} />
                );
              })}
            </div>
            <small>{bi === 0 ? `${shaded} of ${parts} shaded` : `${b.shaded} of ${b.parts} shaded`}</small>
          </div>
        ))}
      </div>
      <div className="widget-actions">
        <button className="ghost" onClick={() => setShaded(0)} disabled={shaded === 0}>Clear</button>
        <button className="primary" data-testid="widget-send" disabled={shaded === 0} onClick={() => session.widgetAnswer("fraction_bars", formatFraction(shaded, parts), targetString(spec), `(shaded ${shaded} of ${parts} parts on the fraction bar)`)}>
          Tell {name}{shaded ? `: ${label}` : ""}
        </button>
      </div>
    </div>
  );
}
