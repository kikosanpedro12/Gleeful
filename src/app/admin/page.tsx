import { requireAdmin } from "@/lib/admin/guard";
import { buildSnapshot, NOT_TRACKED } from "@/lib/admin/snapshot";

export const dynamic = "force-dynamic";

const wrap: React.CSSProperties = { maxWidth: 880, margin: "0 auto", padding: "20px 16px 48px", fontFamily: "system-ui, sans-serif", color: "#1d1d1f", lineHeight: 1.45 };
const card: React.CSSProperties = { background: "#fff", border: "2px solid #d8d2c4", borderRadius: 12, padding: "14px 16px", margin: "14px 0", overflowX: "auto" };
const h2: React.CSSProperties = { fontSize: 18, margin: "0 0 8px" };
const small: React.CSSProperties = { fontSize: 13, color: "#4a4a4a" };

export default async function AdminPage() {
  await requireAdmin(); // 404 for everyone else, with no hint this page exists
  const s = buildSnapshot();
  const v = s.voiceLanding;
  const pct = v && v.cap > 0 ? Math.min(100, Math.round((v.used / v.cap) * 100)) : 0;
  return (
    <main style={{ ...wrap, background: "#f6f2e8", minHeight: "100vh" }} data-testid="admin">
      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Gleeful admin</h1>
      <p style={small}>Read-only. Snapshot at {s.generatedAt}. No write actions, no secrets, no child text. Reload to refresh.</p>

      <section style={card} aria-labelledby="a-switches" data-testid="panel-switches">
        <h2 id="a-switches" style={h2}>Kill switches (display only)</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr><th align="left">Setting</th><th align="left">State</th></tr></thead>
          <tbody>
            {s.switches.map((r) => (
              <tr key={r.name}><td style={{ padding: "4px 8px 4px 0", verticalAlign: "top" }}><code>{r.name}</code></td><td style={{ padding: "4px 0" }}>{r.state}{r.note && <div style={small}>{r.note}</div>}</td></tr>
            ))}
            {s.keys.map((k) => (
              <tr key={k.name}><td style={{ padding: "4px 8px 4px 0" }}><code>{k.name}</code></td><td>{k.configured ? "key is set" : "key is NOT set"}</td></tr>
            ))}
          </tbody>
        </table>
        <p style={small}>Change these in Vercel env settings and redeploy. This page cannot change anything.</p>
      </section>

      <section style={card} aria-labelledby="a-voice" data-testid="panel-voice">
        <h2 id="a-voice" style={h2}>Landing voice pool, today (UTC {v?.day})</h2>
        {v && (<>
          <p style={{ margin: "0 0 6px" }}><strong>{v.used.toLocaleString("en-US")}</strong> of {v.cap.toLocaleString("en-US")} characters ({pct}%)</p>
          <div role="img" aria-label={`${pct} percent of the daily landing voice pool used`} style={{ height: 10, background: "#e6e0d0", borderRadius: 6 }}><div style={{ width: `${pct}%`, height: 10, background: "#7a3d8f", borderRadius: 6 }} /></div>
          <p style={small}>Scope: {v.scope}. A low number can mean a recent cold start, not no use. The ceiling that really binds is the credit cap on the ElevenLabs key.</p>
        </>)}
      </section>

      <section style={card} aria-labelledby="a-events" data-testid="panel-events">
        <h2 id="a-events" style={h2}>Brain and landing Ask: server events, today (UTC {s.events.day})</h2>
        {s.events.counts.length === 0 ? <p style={{ margin: 0 }}>None recorded on this instance today.</p> : (
          <table style={{ borderCollapse: "collapse", fontSize: 14 }}><tbody>
            {s.events.counts.map((c) => <tr key={c.key}><td style={{ padding: "2px 16px 2px 0" }}><code>{c.key}</code></td><td>{c.count}</td></tr>)}
          </tbody></table>
        )}
        <p style={small}>Counts of fixed event codes only (upstream_error, bad_model_output, auth_error, moderated, dropped_parts). Scope: {s.events.scope}. Full logs are in Vercel.</p>
      </section>

      <section style={card} aria-labelledby="a-nt" data-testid="panel-not-tracked">
        <h2 id="a-nt" style={h2}>Not tracked yet</h2>
        <p style={small}>Nothing below is measured today. Nothing is guessed or estimated.</p>
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {NOT_TRACKED.map((n) => (
            <li key={n.what} style={{ marginBottom: 8 }}><strong>{n.what}: not tracked yet.</strong><div style={small}>Why: {n.why}</div><div style={small}>Would need: {n.needs}</div></li>
          ))}
        </ul>
      </section>
    </main>
  );
}
