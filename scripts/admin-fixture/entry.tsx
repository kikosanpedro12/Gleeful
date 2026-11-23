// DEV ONLY (built by scripts/admin-fixture.mjs into scripts/out). Renders the real /admin components with SAMPLE data. Never imported by src/.
import { createRoot } from "react-dom/client";
import { DashboardView, PageHeader } from "@/app/admin/dashboard/DashboardView";
import { FeedbackInbox } from "@/app/admin/dashboard/FeedbackInbox";
import "@/app/admin/dashboard/admin.css";
import { emptyDashboard, sampleDashboard, sampleFeedback } from "@tests/helpers/adminFixture";

const empty = location.hash === "#empty";
const days = ([7, 30, 90] as const).find((d) => String(d) === new URLSearchParams(location.search).get("range")) ?? 30;
const d = empty ? emptyDashboard(days) : sampleDashboard(days);
createRoot(document.getElementById("root")!).render(
  <main className="ad" data-testid="admin"><div className="ad-wrap">
    <PageHeader days={days} updatedIso={d.generatedAt} />
    <DashboardView d={d} />
    <section className="ad-card" style={{ marginBottom: 16 }} data-testid="panel-feedback"><h2>Feedback inbox (newest 50)</h2>{empty ? <p className="ad-empty">No messages yet.</p> : <FeedbackInbox rows={sampleFeedback} />}</section>
  </div></main>,
);
