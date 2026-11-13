"use client";
import { useState } from "react";

type Way = "magic" | "password";

/**
 * Magic link or email + password. Everything goes through POST /auth/sign-in on our own server:
 * this page holds no Supabase key and talks to no one else. Answers are deliberately vague about
 * whether an account exists.
 */
export default function SignInForm({ next }: { next: string }) {
  const [way, setWay] = useState<Way>("magic");
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote(null);
    const mode = way === "magic" ? "magic" : creating ? "signup" : "password";
    try {
      const res = await fetch("/auth/sign-in", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, email, password: way === "password" ? password : undefined, next }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; next?: string };
      if (res.ok && j.ok && mode === "password") { window.location.assign(typeof j.next === "string" ? j.next : next); return; }
      setNote({ ok: res.ok && j.ok === true, text: j.message ?? "Something went wrong. Please try again." });
      if (res.ok && j.ok) setPassword("");
    } catch {
      setNote({ ok: false, text: "We couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <div className="auth-tabs" role="group" aria-label="How to sign in">
        <button type="button" aria-pressed={way === "magic"} onClick={() => { setWay("magic"); setNote(null); }}>Email me a link</button>
        <button type="button" aria-pressed={way === "password"} onClick={() => { setWay("password"); setNote(null); }}>Use a password</button>
      </div>
      <label htmlFor="auth-email">Email</label>
      <input id="auth-email" data-testid="auth-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false} maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required />
      {way === "password" && (
        <>
          <label htmlFor="auth-password">{creating ? "Choose a password (10 or more characters)" : "Password"}</label>
          <input id="auth-password" data-testid="auth-password" type="password" autoComplete={creating ? "new-password" : "current-password"} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </>
      )}
      <button className="primary" type="submit" disabled={busy || !email.trim() || (way === "password" && !password)} data-testid="auth-submit">
        {busy ? "One moment…" : way === "magic" ? "Send me a sign-in link" : creating ? "Create my account" : "Sign in"}
      </button>
      {way === "password" && (
        <button type="button" className="ghost" onClick={() => { setCreating(!creating); setNote(null); }}>
          {creating ? "I already have an account" : "New here? Create an account"}
        </button>
      )}
      {note && <p className={note.ok ? "ok" : "warn"} role={note.ok ? "status" : "alert"} data-testid="auth-note">{note.text}</p>}
      {way === "magic" && <small className="fine">The first time, this also creates your account. Open the link in this same browser.</small>}
    </form>
  );
}
