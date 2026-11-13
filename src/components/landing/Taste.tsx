"use client";
import { useEffect, useRef, useState } from "react";
import { TASTE_ENDPOINT, TASTE_MAX_INPUT, TASTE_MAX_TURNS, type TasteRequest } from "@/lib/taste/protocol";

/**
 * "Ask the teacher one thing": a three-question taste of the real AI.
 *
 * HONESTY RULE: the page is server-rendered as the PREVIEW (a recorded sample, labelled as such). It becomes the
 * live box only after GET /api/taste says a question would really be answered by the model. Anything else
 * (no key, switched off, daily budget used, network trouble) keeps the Preview. We never show an AI answer we
 * did not get from the model, and we never fake one when the budget runs out.
 */
type Mode = "preview" | "live";
type Line = { role: "visitor" | "teacher"; text: string };
type Notice = null | "over" | "busy" | "trouble";

const IDEAS = ["Why is Mars red?", "What is 12 divided by 3?", "How do bees make honey?"];
const randomId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2).padEnd(12, "x"));

export default function Taste() {
  const [mode, setMode] = useState<Mode>("preview");
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [left, setLeft] = useState(TASTE_MAX_TURNS);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const id = useRef<string>("");

  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await fetch(TASTE_ENDPOINT, { method: "GET", cache: "no-store", credentials: "omit", signal: ctl.signal });
        if (!res.ok) return;
        const j = (await res.json()) as { available?: unknown };
        if (j.available === true) { id.current = randomId(); setMode("live"); }
      } catch { /* cannot tell: stay on the Preview */ }
    })();
    return () => ctl.abort();
  }, []);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy || left <= 0 || notice === "over" || notice === "busy") return;
    setBusy(true);
    setNotice(null);
    const body: TasteRequest = { v: 1, tasteId: id.current, text: q, history: lines.slice(-4) };
    try {
      const res = await fetch(TASTE_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, credentials: "omit", body: JSON.stringify(body) });
      if (res.ok) {
        const j = (await res.json()) as { reply?: unknown; turnsLeft?: unknown };
        if (typeof j.reply !== "string" || !j.reply) throw new Error("empty");
        setLines((l) => [...l, { role: "visitor", text: q }, { role: "teacher", text: j.reply as string }]);
        setLeft(typeof j.turnsLeft === "number" ? Math.max(0, Math.min(TASTE_MAX_TURNS, j.turnsLeft)) : 0);
        setText("");
      } else if (res.status === 429 || res.status === 503) {
        const err = (await res.json().catch(() => ({}))) as { error?: unknown };
        // rate_limited = slow down a moment; taste_over / taste_busy / unavailable = done for now.
        setNotice(err.error === "rate_limited" ? "trouble" : err.error === "taste_over" ? "over" : "busy");
      } else setNotice("trouble");
    } catch { setNotice("trouble"); }
    finally { setBusy(false); }
  }

  const finished = left <= 0 || notice === "over" || notice === "busy";
  const last = [...lines].reverse().find((l) => l.role === "teacher");

  return (
    <section id="taste" className="lp-section lp-taste" aria-labelledby="taste-h">
      <div className="lp-wrap lp-wrap-narrow">
        {mode === "live" ? (
          <>
            <p className="lp-tag lp-tag-live" data-testid="taste-live"><span aria-hidden className="lp-dot" /> Live AI teacher</p>
            <h2 id="taste-h" className="lp-h2">Ask the teacher one thing.</h2>
            <p className="lp-lede">You get {TASTE_MAX_TURNS} questions. It is an AI, so answers can be wrong; check anything important with a grown-up. Please don't type names, addresses or other private details.</p>

            <div className="lp-host" aria-live="polite" aria-atomic="true">
              {last ? <p className="lp-host-say" data-testid="taste-reply">{last.text}</p> : <p className="lp-host-say lp-host-wait">Hi! I'm the Gleeful teacher. What are you curious about?</p>}
            </div>

            {finished ? (
              <div className="lp-taste-done" data-testid="taste-done">
                {notice === "busy" ? <p>The teacher is resting for now. Come back soon, or try the scripted demo lesson.</p>
                  : <p>That was your taste. The full lesson takes the whole class somewhere to look closer.</p>}
                <a className="lp-btn lp-btn-main" href="/learn">Try the demo lesson</a>
              </div>
            ) : (
              <form className="lp-taste-form" onSubmit={ask}>
                <div className="lp-chips" role="group" aria-label="Question ideas">
                  {IDEAS.map((i) => <button key={i} type="button" className="lp-chip" onClick={() => setText(i)}>{i}</button>)}
                </div>
                <label className="lp-sr" htmlFor="taste-q">Your question</label>
                <div className="lp-taste-row">
                  <input id="taste-q" className="lp-taste-input" type="text" inputMode="text" autoComplete="off" autoCapitalize="sentences" enterKeyHint="send"
                    maxLength={TASTE_MAX_INPUT} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a question" disabled={busy} />
                  <button className="lp-btn lp-btn-main" type="submit" disabled={busy || !text.trim()}>{busy ? "Thinking…" : "Ask"}</button>
                </div>
                <p className="lp-taste-meta">{left} {left === 1 ? "question" : "questions"} left</p>
                {notice === "trouble" && <p className="lp-taste-err" role="status">I couldn't reach the teacher just then. Wait a moment and try again, or try the <a href="/learn">scripted demo lesson</a>.</p>}
              </form>
            )}
          </>
        ) : (
          <>
            <p className="lp-tag" data-testid="taste-preview">Preview · a recorded sample, not live</p>
            <h2 id="taste-h" className="lp-h2">Ask the teacher one thing.</h2>
            <p className="lp-lede">When the live AI teacher is switched on, you can ask it up to {TASTE_MAX_TURNS} questions right here. It isn't on right now, so here is a recorded example of the kind of answer to expect.</p>
            <div className="lp-host">
              <p className="lp-host-q">“Why is Mars red?”</p>
              <p className="lp-host-say">Mars is covered in dust and rock that contain iron, and iron that has rusted looks red. Want to go and look at it up close?</p>
            </div>
            <a className="lp-btn lp-btn-main" href="/learn">Try the demo lesson</a>
          </>
        )}
      </div>
    </section>
  );
}
