"use client";
import { useState } from "react";

/** Sends one message to POST /api/feedback on our own server. No third party, no cookies, nothing stored in the browser. */
export default function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // hidden honeypot: people never see it, bots fill it
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (message.trim().length === 0) { setNote({ ok: false, text: "Please write a message first." }); return; }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, email, website, page: "/feedback" }),
      });
      if (res.ok) { setMessage(""); setNote({ ok: true, text: "Thank you. We read the messages we get." }); }
      else if (res.status === 429) setNote({ ok: false, text: "That's a lot of messages in a short time. Please try again in a few minutes." });
      else if (res.status === 503) setNote({ ok: false, text: "Feedback isn't switched on yet. You can write to us at hello@getgleeful.com instead." });
      else setNote({ ok: false, text: "We couldn't send that. Please check the message and your email address and try again." });
    } catch {
      setNote({ ok: false, text: "We couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <label htmlFor="fb-message">Your message</label>
      <textarea id="fb-message" data-testid="fb-message" rows={6} maxLength={2000} required value={message} onChange={(e) => setMessage(e.target.value)} />
      <small className="fine">Please don&apos;t include your child&apos;s name or other personal details. {message.length}/2000</small>
      <label htmlFor="fb-email">Your email (optional, only if you want a reply)</label>
      <input id="fb-email" data-testid="fb-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false} maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="fb-website">Leave this empty</label>
        <input id="fb-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      <button className="primary" type="submit" disabled={busy} data-testid="fb-send">{busy ? "Sending…" : "Send feedback"}</button>
      {note && <p role={note.ok ? "status" : "alert"} className={note.ok ? "fine" : "warn"} data-testid="fb-note">{note.text}</p>}
    </form>
  );
}
