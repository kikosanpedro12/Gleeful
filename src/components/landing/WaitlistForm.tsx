"use client";
import { useEffect, useId, useState } from "react";

type State = "idle" | "sending" | "done" | "closed" | "error";
const MESSAGES: Record<string, string> = {
  invalid_email: "That email address doesn't look right. Check it and try again.",
  consent_required: "Tick the box to confirm you're a parent or guardian and happy to hear from us.",
  rate_limited: "Too many tries from this connection. Wait a few minutes, then try again.",
  upstream: "We couldn't save that just now. Try again in a minute.",
  default: "Something went wrong sending that. Try again in a minute.",
};

export default function WaitlistForm({ source = "landing" }: { source?: "landing" | "landing_footer" }) {
  const id = useId();
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/waitlist", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { open: false }))
      .then((j: { open?: boolean }) => { if (live && j.open === false) setState((s) => (s === "idle" ? "closed" : s)); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    setState("sending");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: String(f.get("email") ?? ""), consent: f.get("consent") === "on", website: String(f.get("website") ?? ""), source }),
      });
      if (res.ok) { setState("done"); return; }
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 503) { setState("closed"); return; }
      setError(MESSAGES[j.error ?? "default"] ?? MESSAGES.default);
      setState("error");
    } catch {
      setError(MESSAGES.default);
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="lp-form-done" role="status" data-testid="waitlist-done">You're on the list. We'll email you when early access opens.</p>;
  }
  return (
    <form className="lp-form" onSubmit={submit} noValidate data-testid="waitlist-form" data-state={state}>
      {state === "closed" && (
        <p className="lp-form-note" role="status" data-testid="waitlist-closed">
          The waitlist opens soon. Meanwhile, try the demo lesson with your child.
        </p>
      )}
      <div className="lp-form-row">
        <label htmlFor={`${id}-email`} className="lp-sr">Parent's email</label>
        <input id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} placeholder="Parent's email" disabled={state === "closed" || state === "sending"} />
        <button type="submit" className="lp-btn lp-btn-main" disabled={state === "closed" || state === "sending"} data-testid="waitlist-submit">
          {state === "sending" ? "Joining…" : "Join the waitlist"}
        </button>
      </div>
      <label className="lp-consent">
        <input type="checkbox" name="consent" required disabled={state === "closed"} />
        <span>I'm a parent or guardian, 18 or older, and I'm happy for Gleeful to email me about early access. No spam; unsubscribe any time.</span>
      </label>
      {/* Honeypot: hidden from people and screen readers; bots fill it. */}
      <div className="lp-hp" aria-hidden>
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <p className="lp-form-error" role="alert" data-testid="waitlist-error">{error}</p>
    </form>
  );
}
