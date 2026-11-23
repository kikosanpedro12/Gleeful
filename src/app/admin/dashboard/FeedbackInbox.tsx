"use client";
import { useState } from "react";
import type { FeedbackRow } from "@/lib/feedback/store";

export function FeedbackInbox({ rows }: { rows: FeedbackRow[] }) {
  const [q, setQ] = useState("");
  const [withEmail, setWithEmail] = useState(false);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((f) => (!withEmail || f.contactEmail) && (!needle || f.message.toLowerCase().includes(needle) || (f.page ?? "").toLowerCase().includes(needle)));
  return (
    <div>
      <div className="ad-fb-tools">
        <label className="ad-small" htmlFor="fb-q" style={{ flex: "0 0 100%" }}>Search messages</label>
        <input id="fb-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a word" />
        <button type="button" aria-pressed={withEmail} onClick={() => setWithEmail(!withEmail)}>Only with an e-mail</button>
      </div>
      <p className="ad-small" aria-live="polite" data-testid="fb-count">Showing {shown.length} of {rows.length}</p>
      {shown.length === 0 ? <p className="ad-empty">Nothing matches. Clear the search to see everything.</p> : (
        <ul className="ad-list ad-fb">
          {shown.map((f) => (
            <li key={f.id} style={{ display: "block" }}>
              <div className="ad-small">{f.createdAt.slice(0, 16).replace("T", " ")} UTC{f.page ? ` · ${f.page}` : ""}</div>
              <div className="msg">{f.message}</div>
              <div className="ad-small">{f.contactEmail ? <>Reply: <a href={`mailto:${encodeURIComponent(f.contactEmail)}?subject=${encodeURIComponent("Re: your Gleeful feedback")}`}>{f.contactEmail}</a></> : "No e-mail left."}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
