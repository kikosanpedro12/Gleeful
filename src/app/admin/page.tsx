import { requireAdmin } from "@/lib/admin/guard";
import { buildSnapshot, NOT_TRACKED } from "@/lib/admin/snapshot";
import { loadDashboard, parseRange, type Dashboard } from "@/lib/billing/dashboard";
import { recentFeedback, type FeedbackRow } from "@/lib/feedback/store";
import { billingConfigured } from "@/lib/billing/store";
import { DashboardView, PageHeader } from "./dashboard/DashboardView";
import { FeedbackInbox } from "./dashboard/FeedbackInbox";
import "./dashboard/admin.css";

export const dynamic = "force-dynamic";

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("deadline")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export default async function AdminPage({ searchParams }: { searchParams?: Promise<{ range?: string | string[] }> } = {}) {
  await requireAdmin(); // 404 for everyone else, with no hint this page exists
  const range = parseRange((await searchParams)?.range);
  const s = buildSnapshot();
  let dash: Dashboard | null = null;
  let feedback: FeedbackRow[] = [];
  let dbProblem: string | null = null;
  if (billingConfigured()) {
    const kind = (e: unknown) => (e instanceof Error && e.message === "deadline" ? "timed out" : typeof (e as { code?: unknown })?.code === "string" ? `error ${(e as { code: string }).code}` : "error");
    // One at a time on the single connection, each with its own deadline, so a stuck one is named (no message text or values are shown).
    try { dash = await withDeadline(loadDashboard(range), 6000); } catch (e) { dbProblem = `numbers ${kind(e)}`; }
    try { feedback = await withDeadline(recentFeedback(50), 4000); } catch (e) { dbProblem = `${dbProblem ? dbProblem + "; " : ""}feedback ${kind(e)}`; } // never let a slow database hang the whole page
  }
  const v = s.voiceLanding;
  const pct = v && v.cap > 0 ? Math.min(100, Math.round((v.used / v.cap) * 100)) : 0;
  const fbOk = billingConfigured() && !dbProblem;
  return (
    <main className="ad" data-testid="admin">
      <div className="ad-wrap">
      <PageHeader days={range} updatedIso={dash?.generatedAt ?? s.generatedAt} />

      {!billingConfigured() ? (
        <section className="ad-card" style={{ marginBottom: 16 }} aria-labelledby="a-money" data-testid="panel-customers">
          <h2 id="a-money">Customers and revenue</h2>
          <p className="ad-empty">Not connected: <code>BILLING_DATABASE_URL</code> is not set on this deployment.</p>
        </section>
      ) : !dash ? (
        <section className="ad-card" style={{ marginBottom: 16 }} aria-labelledby="a-money" data-testid="panel-customers">
          <h2 id="a-money">Customers and revenue</h2>
          <p className="ad-empty">The database could not be read just now{dbProblem ? ` (${dbProblem})` : ""}. Reload to try again.</p>
        </section>
      ) : <DashboardView d={dash} />}

      <section className="ad-card" style={{ marginBottom: 16 }} aria-labelledby="a-fb" data-testid="panel-feedback">
        <h2 id="a-fb">Feedback inbox (newest 50)</h2>
        {!fbOk ? <p className="ad-empty">Not available until the database connection works.</p>
          : feedback.length === 0 ? <p className="ad-empty">No messages yet. Families can write at <code>/feedback</code> (linked from the parent area).</p>
          : <FeedbackInbox rows={feedback} />}
        <p className="ad-small">Read-only here. Reply from your own e-mail with the link. Messages are stored only in our database and are never shown to other visitors.</p>
      </section>

      <section className="ad-card" style={{ marginBottom: 16 }} aria-labelledby="a-switches" data-testid="panel-switches">
        <h2 id="a-switches" >Kill switches (display only)</h2>
        <div className="ad-scroll"><table className="ad-table">
          <thead><tr><th align="left">Setting</th><th align="left">State</th></tr></thead>
          <tbody>
            {s.switches.map((r) => (
              <tr key={r.name}><td style={{ padding: "4px 8px 4px 0", verticalAlign: "top" }}><code>{r.name}</code></td><td style={{ padding: "4px 0" }}>{r.state}{r.note && <div className="ad-small">{r.note}</div>}</td></tr>
            ))}
            {s.keys.map((k) => (
              <tr key={k.name}><td style={{ padding: "4px 8px 4px 0" }}><code>{k.name}</code></td><td>{k.configured ? "key is set" : "key is NOT set"}</td></tr>
            ))}
          </tbody>
        </table></div>
        <p className="ad-small">Change these in Vercel env settings and redeploy. This page cannot change anything.</p>
      </section>

      <section className="ad-card" style={{ marginBottom: 16 }} aria-labelledby="a-voice" data-testid="panel-voice">
        <h2 id="a-voice" >Landing voice pool, today (UTC {v?.day})</h2>
        {v && (<>
          <p style={{ margin: "0 0 6px" }}><strong>{v.used.toLocaleString("en-US")}</strong> of {v.cap.toLocaleString("en-US")} characters ({pct}%)</p>
          <div role="img" aria-label={`${pct} percent of the daily landing voice pool used`} style={{ height: 10, background: "#e6e0d0", borderRadius: 6 }}><div style={{ width: `${pct}%`, height: 10, background: "#7a3d8f", borderRadius: 6 }} /></div>
          <p className="ad-small">Scope: {v.scope}. A low number can mean a recent cold start, not no use. The ceiling that really binds is the credit cap on the ElevenLabs key.</p>
        </>)}
      </section>

      <section className="ad-card" style={{ marginBottom: 16 }} aria-labelledby="a-events" data-testid="panel-events">
        <h2 id="a-events" >Brain and landing Ask: server events, today (UTC {s.events.day})</h2>
        {s.events.counts.length === 0 ? <p style={{ margin: 0 }}>None recorded on this instance today.</p> : (
          <div className="ad-scroll"><table className="ad-table"><tbody>
            {s.events.counts.map((c) => <tr key={c.key}><td style={{ padding: "2px 16px 2px 0" }}><code>{c.key}</code></td><td>{c.count}</td></tr>)}
          </tbody></table></div>
        )}
        <p className="ad-small">Counts of fixed event codes only (upstream_error, bad_model_output, auth_error, moderated, dropped_parts). Scope: {s.events.scope}. Full logs are in Vercel.</p>
      </section>

      <section className="ad-card" style={{ marginBottom: 16 }} aria-labelledby="a-nt" data-testid="panel-not-tracked">
        <h2 id="a-nt" >Not tracked yet</h2>
        <p className="ad-small">Nothing below is measured today. Nothing is guessed or estimated.</p>
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {NOT_TRACKED.map((n) => (
            <li key={n.what} style={{ marginBottom: 8 }}><strong>{n.what}: not tracked yet.</strong><div className="ad-small">Why: {n.why}</div><div className="ad-small">Would need: {n.needs}</div></li>
          ))}
        </ul>
      </section>
    </div>
    </main>
  );
}
