import type { Dashboard } from "@/lib/billing/dashboard";
import type { EventStats } from "@/lib/events/stats";
import { pctOf, shortDay } from "./format";

export const VISITS_URL = "https://vercel.com/gleeful-6f6cb38c/gleeful/analytics";
const COUNT = (n: number) => n.toLocaleString("en-US");

interface Step { key: string; label: string; n: number; color: string; kind: "people" | "events" }

/** Sign-up to paid, one bar per step. People steps are distinct parents seen in the range; the last two are billing webhook events. */
export function SignupFunnelCard({ d, e }: { d: Dashboard; e: EventStats }) {
  const f = e.funnel;
  const steps: Step[] = [
    { key: "signup", label: "Signed up", n: f.signups, color: "#0e8a8c", kind: "people" },
    { key: "consent", label: "Gave permission", n: f.consents, color: "#0e8a8c", kind: "people" },
    { key: "learner", label: "Added a child", n: f.learners, color: "#0e8a8c", kind: "people" },
    { key: "active", label: "Sent a message to the teacher", n: f.active, color: "#0e8a8c", kind: "people" },
    { key: "checkout", label: "Opened checkout", n: f.checkoutClicks, color: "#2b59c3", kind: "people" },
    { key: "trial", label: "Trial started", n: d.totals.trialsStarted, color: "#b85c00", kind: "events" },
    { key: "paid", label: "Paid", n: d.totals.paid, color: "#1f7a4d", kind: "events" },
  ];
  const max = Math.max(1, ...steps.map((s) => s.n));
  const any = steps.some((s) => s.n > 0);
  return (
    <section className="ad-card" aria-labelledby="a-sfun" data-testid="panel-signup-funnel">
      <h2 id="a-sfun">Funnel: sign-up to paid</h2>
      <p className="ad-small" style={{ margin: 0 }}>Last {d.days} days. Each bar counts different people seen in this range, not one group followed over time, so a later bar can be larger than an earlier one.</p>
      {!any ? <p className="ad-empty">Nothing in this period yet. Steps fill in as families sign up and use Gleeful.</p> : (
        <ol className="ad-steps">
          {steps.map((s) => (
            <li key={s.key} data-testid={`fun-${s.key}`}>
              <div className="ad-fun-top"><span>{s.label}{s.kind === "events" && <> <span className="ad-tag">WEBHOOK EVENTS</span></>}</span><strong>{COUNT(s.n)}</strong></div>
              <div className="ad-fun-bar" aria-hidden="true"><i style={{ width: `${pctOf(s.n, max)}%`, background: s.color }} /></div>
            </li>
          ))}
        </ol>
      )}
      <p className="ad-small" style={{ margin: "8px 0 0" }}>People steps are counted from our own events (one person counted once per step). Trial and Paid come from billing webhooks: they count events, not people, and include sandbox purchases while testing. Sign-ups before event tracking began are not included.</p>
    </section>
  );
}

export function RetentionCard({ e }: { e: EventStats }) {
  const r = e.retention;
  const rows: [string, number, string][] = [
    ["Active today", r.activeToday, "ret-today"],
    ["Active in the last 7 days", r.active7, "ret-7"],
    ["Active in the last 30 days", r.active30, "ret-30"],
    ["Quiet families", r.quiet, "ret-quiet"],
  ];
  return (
    <section className="ad-card" aria-labelledby="a-ret" data-testid="panel-retention">
      <h2 id="a-ret">Retention</h2>
      {r.signupsEver === 0 && r.active30 === 0 ? <p className="ad-empty">No families tracked yet. This fills in once parents sign up and the teacher answers them.</p> : (
        <table className="ad-table"><tbody>
          {rows.map(([label, n, id]) => <tr key={id} data-testid={id}><td>{label}</td><td className="r"><strong>{COUNT(n)}</strong></td></tr>)}
        </tbody></table>
      )}
      <p className="ad-small" style={{ margin: "8px 0 0" }}>A family is active on a day when a signed-in parent sent a message to the live teacher (Manila days). It is counted when the message arrives, before the reply, so a reply that failed still counts. Quiet = signed up more than 7 days ago and no active day in the last 7. Only counts are shown, never e-mails. Sign-ups before tracking began are not in these numbers{r.signupsEver > 0 ? ` (${COUNT(r.signupsEver)} tracked sign-ups so far)` : ""}.</p>
    </section>
  );
}

export function SourcesCard({ e }: { e: EventStats }) {
  const total = e.sources.reduce((n, s) => n + s.count, 0);
  const word = { campaign: "campaign tag", referrer: "referring site", direct: "" } as const;
  return (
    <section className="ad-card" aria-labelledby="a-src" data-testid="panel-sources">
      <h2 id="a-src">Where sign-ups came from</h2>
      <p className="ad-small" style={{ margin: 0 }}>Last {e.days} days, top 10. From the link&apos;s utm_source tag, else the site that referred the visitor.</p>
      {e.sources.length === 0 ? <p className="ad-empty">No sign-ups in this period yet.</p> : (
        <div className="ad-scroll"><table className="ad-table" data-testid="sources-table">
          <thead className="sr-only"><tr><th>Source</th><th>Sign-ups</th><th>Bar</th></tr></thead>
          <tbody>
            {e.sources.map((s) => (
              <tr key={s.kind + s.name}>
                <td>{s.name}{word[s.kind] && <span className="ad-small"> ({word[s.kind]})</span>}</td>
                <td className="r"><strong>{s.count}</strong></td>
                <td style={{ width: "30%" }}><div className="ad-bar" aria-hidden="true"><i style={{ width: `${pctOf(s.count, total)}%`, background: "#0e8a8c" }} /></div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}

const HEALTH = [
  { key: "brainError", label: "Teacher errors", color: "#c2275f" },
  { key: "brainFallback", label: "Teacher fell back to the script", color: "#b85c00" },
  { key: "voiceError", label: "Voice errors", color: "#2b59c3" },
] as const;

/** Error codes per day, stacked bars (server-rendered SVG) with the numbers in a table underneath. */
export function HealthCard({ e }: { e: EventStats }) {
  const t = e.healthTotals;
  const sum = t.brainError + t.brainFallback + t.voiceError;
  const W = 600, H = 110, n = e.health.length;
  const peak = Math.max(1, ...e.health.map((p) => p.brainError + p.brainFallback + p.voiceError));
  const bw = W / Math.max(n, 1);
  const days = e.health.filter((p) => p.brainError + p.brainFallback + p.voiceError > 0);
  return (
    <section className="ad-card" aria-labelledby="a-health" data-testid="panel-health">
      <h2 id="a-health">Health: errors per day</h2>
      <p className="ad-small" style={{ margin: 0 }}>Last {e.days} days, all server instances together. Fixed codes only; nothing a child said.</p>
      {sum === 0 ? <p className="ad-empty">No errors recorded in this period. (That is also what you see before tracking starts.)</p> : (<>
        <div className="ad-legend-static">{HEALTH.map((h) => <span key={h.key}><i className="ad-swatch" style={{ background: h.color }} aria-hidden="true" /> {h.label}: <strong>{t[h.key]}</strong></span>)}</div>
        <svg className="ad-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Errors per day over ${e.days} days: ${t.brainError} teacher errors, ${t.brainFallback} script fallbacks, ${t.voiceError} voice errors. Busiest day had ${peak}.`} style={{ height: 110 }}>
          {e.health.map((p, i) => {
            let y = H;
            return HEALTH.map((h) => {
              const v = p[h.key]; if (v === 0) return null;
              const hh = (v / peak) * (H - 6); y -= hh;
              return <rect key={`${p.date}-${h.key}`} x={i * bw + 0.5} y={y} width={Math.max(bw - 1, 1)} height={hh} fill={h.color} />;
            });
          })}
        </svg>
        <div className="ad-chart-x" style={{ marginLeft: 0 }}><span>{shortDay(e.health[0].date)}</span><span>peak {peak} a day</span><span>{shortDay(e.health[n - 1].date)}</span></div>
        <details><summary>Numbers by day</summary>
          <div className="ad-scroll"><table className="ad-table" data-testid="health-table">
            <thead><tr><th>Day</th>{HEALTH.map((h) => <th key={h.key} className="r">{h.label}</th>)}</tr></thead>
            <tbody>{[...days].reverse().map((p) => <tr key={p.date}><td>{shortDay(p.date)}</td>{HEALTH.map((h) => <td key={h.key} className="r">{p[h.key]}</td>)}</tr>)}</tbody>
          </table></div>
        </details>
      </>)}
    </section>
  );
}

export function VisitsCard() {
  return (
    <section className="ad-card" aria-labelledby="a-visits" data-testid="panel-visits">
      <h2 id="a-visits">Website visits</h2>
      <p className="ad-small" style={{ margin: "0 0 8px" }}>Page views and visitors for the public pages are counted by Vercel Web Analytics (no cookies, no personal data). They are read in Vercel, not here.</p>
      <a className="ad-linkbtn" href={VISITS_URL} target="_blank" rel="noopener noreferrer">Open Vercel Analytics</a>
    </section>
  );
}

/** Everything the product-events part of /admin shows. Prop-driven; no data loading in here. */
export function EventsPanels({ d }: { d: Dashboard }) {
  const e = d.events;
  if (!e) {
    return (<>
      <section className="ad-card" style={{ marginBottom: 16 }} aria-labelledby="a-evnote" data-testid="panel-events-note">
        <h2 id="a-evnote">Funnel, retention, sources and health</h2>
        <p className="ad-empty">{d.eventsNote === "not_applied"
          ? <>Not set up yet: the <code>app_events</code> table does not exist in the database. Apply the <code>20261123210909_app_events.sql</code> migration, then this fills in as families use Gleeful.</>
          : "These numbers could not be read just now. Reload to try again."}</p>
      </section>
      <div className="ad-grid"><VisitsCard /></div>
    </>);
  }
  return (<>
    <div className="ad-grid ad-two"><SignupFunnelCard d={d} e={e} /><RetentionCard e={e} /></div>
    <div className="ad-grid ad-two"><SourcesCard e={e} /><HealthCard e={e} /></div>
    <div className="ad-grid"><VisitsCard /></div>
  </>);
}
