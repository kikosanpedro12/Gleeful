import Link from "next/link";
import type { Dashboard, RangeDays } from "@/lib/billing/dashboard";
import { ActivityChart } from "./ActivityChart";
import { delta, manilaDateTime, manilaUpdated, pctOf, pointsFor, type Delta } from "./format";

const RANGE_OPTIONS: RangeDays[] = [7, 30, 90];
const COLORS = ["#1f7a4d", "#0e8a8c", "#b85c00", "#c2275f", "#2b59c3", "#7a3d8f", "#6b7a2a", "#55605a"];
const STATUS_WORDS: Record<string, string> = { trialing: "on a trial", active: "paying", past_due: "payment failed", canceled: "cancelled", refunded: "refunded" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Server-rendered links that look like a segmented control. The URL is the state, so it works without scripts. */
export function RangeControl({ days }: { days: number }) {
  return (
    <nav className="ad-range" aria-label="Date range" data-testid="range-control">
      {RANGE_OPTIONS.map((r) => (
        <Link key={r} href={`/admin?range=${r}`} aria-current={r === days ? "true" : undefined} prefetch={false}>Last {r} days</Link>
      ))}
    </nav>
  );
}

export function PageHeader({ days, updatedIso }: { days: number; updatedIso: string }) {
  return (
    <header className="ad-head">
      <div>
        <h1>Gleeful admin</h1>
        <p className="ad-small" style={{ margin: "4px 0 0" }}>Read-only. Last updated {manilaUpdated(updatedIso)}. Reload to refresh. No write actions, no secrets, no child text.</p>
      </div>
      <RangeControl days={days} />
    </header>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.every((v) => v === 0)) return <div className="ad-small" style={{ height: 34, marginTop: 8 }}>No activity in this period</div>;
  const max = Math.max(...values, 1);
  return (
    <svg className="ad-spark" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pointsFor(values, 120, 34, max, 3)} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Kpi({ label, value, d, values, color, testid }: { label: string; value: number; d: Delta; values: number[]; color: string; testid: string }) {
  return (
    <section className="ad-card" aria-label={label} data-testid={testid}>
      <div className="ad-kpi-label">{label}</div>
      <div className="ad-kpi-num">{value}</div>
      <div className={`ad-delta ad-${d.tone}`}>{d.text}</div>
      <Spark values={values} color={color} />
    </section>
  );
}

export function Kpis({ d }: { d: Dashboard }) {
  const t = d.totals, p = d.previous, s = d.series;
  const activeNow = d.stats.current.filter((r) => r.status === "active").reduce((n, r) => n + r.count, 0);
  return (
    <div className="ad-grid ad-kpis" data-testid="kpis">
      <Kpi testid="kpi-trials" label="Trials started" value={t.trialsStarted} d={delta(t.trialsStarted, p.trialsStarted, d.days, true)} values={s.map((x) => x.trialsStarted)} color="#b85c00" />
      <Kpi testid="kpi-paid" label="Paid (new, or came back)" value={t.paid} d={delta(t.paid, p.paid, d.days, true)} values={s.map((x) => x.paid)} color="#1f7a4d" />
      <Kpi testid="kpi-cancelled" label="Cancelled" value={t.cancelled} d={delta(t.cancelled, p.cancelled, d.days, false)} values={s.map((x) => x.cancelled)} color="#c2275f" />
      <section className="ad-card" aria-label="Estimated monthly revenue" data-testid="stats-mrr">
        <div className="ad-kpi-label">Estimated monthly revenue <span className="ad-tag">ESTIMATE</span></div>
        <div className="ad-kpi-num">US${d.stats.estMonthlyUsd}</div>
        <div className="ad-delta ad-flat">{activeNow} {activeNow === 1 ? "person" : "people"} on a paid plan right now</div>
        <p className="ad-small" style={{ margin: "8px 0 0" }}>Paying people times list price. Includes sandbox and test purchases. Before fees, tax and refunds. Not a payout figure.</p>
      </section>
    </div>
  );
}

export function ActivityCard({ d }: { d: Dashboard }) {
  return (
    <section className="ad-card" aria-labelledby="a-activity" data-testid="panel-activity">
      <h2 id="a-activity">Activity over time</h2>
      <p className="ad-small" style={{ margin: 0 }}>Billing events that changed something, per day, last {d.days} days (sandbox events included while testing).</p>
      <ActivityChart series={d.series} />
    </section>
  );
}

export function CustomersCard({ d }: { d: Dashboard }) {
  const rows = d.stats.current.filter((r) => r.count > 0);
  const total = rows.reduce((n, r) => n + r.count, 0);
  const R = 56, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <section className="ad-card" aria-labelledby="a-cust" data-testid="panel-customers">
      <h2 id="a-cust">Customers right now</h2>
      <p className="ad-small" style={{ margin: 0 }}>By plan and status. Counts come from Freemius webhooks; sandbox events are included while testing. Buyers who pay with a different e-mail than their Gleeful account still count here.</p>
      {total === 0 ? <p className="ad-empty">No customers yet. They appear here after the first trial starts.</p> : (
        <div className="ad-donut-row" style={{ marginTop: 12 }}>
          <svg className="ad-donut" viewBox="0 0 150 150" role="img" aria-label={`${total} ${total === 1 ? "person" : "people"} in total. ${rows.map((r) => `${r.count} ${cap(r.plan)} ${STATUS_WORDS[r.status] ?? r.status}`).join(", ")}.`}>
            <circle cx="75" cy="75" r={R} fill="none" stroke="#eee8d8" strokeWidth="22" />
            {rows.map((r, i) => {
              const len = (r.count / total) * C;
              const el = <circle key={r.plan + r.status} cx="75" cy="75" r={R} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="22" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 75 75)" />;
              offset += len;
              return el;
            })}
            <text x="75" y="82" textAnchor="middle" className="ad-donut-centre" fill="#1d2a24" fontSize="30" fontWeight="800">{total}</text>
          </svg>
          <div className="ad-scroll" style={{ flex: "1 1 240px" }}>
            <table className="ad-table" data-testid="stats-current">
              <thead className="sr-only"><tr><th>Plan and status</th><th>People</th><th>Bar</th><th>Share</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.plan + r.status}>
                    <td><span className="ad-dot" style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />{cap(r.plan)}, {STATUS_WORDS[r.status] ?? r.status}</td>
                    <td className="r"><strong>{r.count}</strong></td>
                    <td style={{ width: "34%" }}><div className="ad-bar" aria-hidden="true"><i style={{ width: `${pctOf(r.count, total)}%`, background: COLORS[i % COLORS.length] }} /></div></td>
                    <td className="r">{pctOf(r.count, total)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export function FunnelCard({ d }: { d: Dashboard }) {
  const { trialsStarted: a, trialToPaid: b } = d.funnel;
  const rate = a > 0 ? Math.min(100, pctOf(b, a)) : 0;
  return (
    <section className="ad-card" aria-labelledby="a-funnel" data-testid="panel-funnel">
      <h2 id="a-funnel">Trial to paid</h2>
      <p className="ad-small" style={{ margin: 0 }}>Last {d.days} days.</p>
      {a === 0 && b === 0 ? <p className="ad-empty">No trials in this period yet.</p> : (<>
        <div className="ad-fun"><div className="ad-fun-top"><span>Trials started</span><strong>{a}</strong></div><div className="ad-fun-bar" aria-hidden="true"><i style={{ width: a > 0 ? "100%" : "0%", background: "#b85c00" }} /></div></div>
        <div className="ad-fun"><div className="ad-fun-top"><span>Trial became paid</span><strong>{b}{a > 0 ? ` (${rate}%)` : ""}</strong></div><div className="ad-fun-bar" aria-hidden="true"><i style={{ width: `${a > 0 ? Math.min(100, pctOf(b, a)) : 0}%`, background: "#1f7a4d" }} /></div></div>
        <p className="ad-small" style={{ margin: 0 }}>Counts events, not people: someone who started a trial before this period can be counted as paid here. Trials last 7 days, so recent starts have not had time to convert.</p>
      </>)}
    </section>
  );
}

export function UsageCard({ d }: { d: Dashboard }) {
  const u = d.usage;
  return (
    <section className="ad-card" aria-labelledby="a-usage" data-testid="panel-usage">
      <h2 id="a-usage">Usage this period</h2>
      {u.subscribersWithUsage === 0 ? <p className="ad-empty">No one has used their allowance in the current billing period yet.</p> : (
        <table className="ad-table"><tbody>
          <tr><td>Turns used (all people)</td><td className="r"><strong>{u.turnsThisPeriod.toLocaleString("en-US")}</strong></td></tr>
          <tr><td>People who have used any</td><td className="r"><strong>{u.subscribersWithUsage}</strong></td></tr>
          <tr><td>People at 80% or more of their limit</td><td className="r"><strong>{u.atOrAbove80Percent}</strong></td></tr>
        </tbody></table>
      )}
      <p className="ad-small" style={{ margin: "8px 0 0" }}>A turn is one reply from the teacher. Hours are an estimate (about 2.7 turns a minute), so the limit is a brake that protects margin, not a stopwatch.</p>
    </section>
  );
}

export function RecentCard({ d }: { d: Dashboard }) {
  return (
    <section className="ad-card" aria-labelledby="a-recent" data-testid="panel-recent">
      <h2 id="a-recent">Recent activity</h2>
      {d.recent.length === 0 ? <p className="ad-empty">Nothing yet. Trials and payments show up here with the e-mail partly hidden.</p> : (
        <ul className="ad-list">
          {d.recent.map((r, i) => (
            <li key={`${r.at}-${i}`} className={r.applied ? undefined : "ad-dim"}>
              <span><strong>{r.label}</strong> · {r.who}{r.applied ? "" : " (ignored: out of order or duplicate)"}</span>
              <span className="ad-small">{manilaDateTime(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function WindowsDetails({ d }: { d: Dashboard }) {
  const w = d.stats.windows;
  return (
    <section className="ad-card" style={{ marginBottom: 16 }}>
      <details>
        <summary>Numbers by period, including all time</summary>
        <div className="ad-scroll">
          <table className="ad-table" data-testid="stats-windows">
            <thead><tr><th>Events that changed something</th>{w.map((x) => <th key={x.label} className="r">{x.label}</th>)}</tr></thead>
            <tbody>
              {([["Trials started", "trialsStarted"], ["Trials cancelled", "cancelledTrials"], ["Trial became paid", "trialToPaid"], ["Paid without a trial", "directPaid"], ["Paid plans cancelled", "paidCancelled"], ["Refunds", "refunds"], ["Failed payments", "failedPayments"]] as const).map(([label, key]) => (
                <tr key={key}><td>{label}</td>{w.map((x) => <td key={x.label} className="r">{x[key]}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function DashboardView({ d }: { d: Dashboard }) {
  return (<>
    <Kpis d={d} />
    <div className="ad-grid ad-two"><ActivityCard d={d} /><CustomersCard d={d} /></div>
    <div className="ad-grid ad-three"><FunnelCard d={d} /><UsageCard d={d} /><RecentCard d={d} /></div>
    <WindowsDetails d={d} />
  </>);
}
