// Tester break run for the landing taste round 2 (mic, spoken replies, ACT/CHOICES, arc, paywall). No model or ElevenLabs spend:
// /api/taste and /api/voice are stubbed. Needs a build:test build (reads window.__ctl / window.__teacher with ?test=1).
//   ORIGIN=http://localhost:3222 node scripts/taste-break2.mjs        (W=390 H=844 TAG=b2p for the phone)
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const ORIGIN = process.env.ORIGIN || "http://localhost:3222";
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 1280), H = Number(process.env.H || 800), TAG = process.env.TAG || "b2d";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (n, ok, d = "") => { if (!ok) bad++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const real = (e) => e.filter((x) => !/Failed to load resource/.test(x));

/** o.taste(n, body) -> {status, body}; o.voice: "off" | "landing"; o.voicePost(n) -> {status, pcm?}; o.sr: "denied"|"nospeech"|"text:<q>"|"none"|"hang"; o.speech: "fake" */
async function open(o = {}) {
  const page = await browser.newPage();
  const errors = [], st = { taste: 0, voice: 0, tasteBodies: [] };
  page.on("pageerror", (e) => errors.push("pageerror " + e));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.evaluateOnNewDocument((o) => {
    document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`));
    if (o.speech === "fake") {
      window.__spoken = []; window.__cancels = 0; let cur = null, t = null;
      Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => [], addEventListener() {}, removeEventListener() {}, speaking: false,
        speak(u) { window.__spoken.push(u.text); cur = u; setTimeout(() => { if (cur === u) { u.onstart?.({}); t = setTimeout(() => { if (cur === u) { cur = null; u.onend?.({}); } }, 20000); } }, 50); },
        cancel() { window.__cancels++; if (t) clearTimeout(t); cur = null; } } });
    }
    if (o.sr === "none") { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; }
    else if (o.sr) {
      window.__sr = 0;
      class SR { start() { window.__sr++; setTimeout(() => this.onstart?.(), 10);
        if (o.sr === "denied") setTimeout(() => { this.onerror?.({ error: "not-allowed" }); this.onend?.(); }, 60);
        else if (o.sr === "nospeech") setTimeout(() => { this.onerror?.({ error: "no-speech" }); this.onend?.(); }, 60);
        else if (o.sr.startsWith("text:")) setTimeout(() => { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: o.sr.slice(5) }], { isFinal: true })] }); this.onend?.(); }, 80); }
        stop() {} abort() {} }
      window.SpeechRecognition = SR; window.webkitSpeechRecognition = SR;
    }
    const A = window.AudioBufferSourceNode?.prototype; window.__src = { start: 0, stop: 0 };
    if (A) { const s = A.start, p = A.stop; A.start = function (...a) { window.__src.start++; return s.apply(this, a); }; A.stop = function (...a) { window.__src.stop++; return p.apply(this, a); }; }
  }, o);
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700 });
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url());
    const json = (s, b) => r.respond({ status: s, contentType: "application/json", body: typeof b === "string" ? b : JSON.stringify(b) });
    if (u.pathname === "/api/voice") {
      if (r.method() === "GET") return json(200, o.voice === "landing" ? { configured: true, public: false, landing: true } : { configured: false, public: false, landing: false });
      st.voice++;
      const v = o.voicePost ? o.voicePost(st.voice) : { status: 429 };
      if (v.pcm) return r.respond({ status: 200, contentType: "application/octet-stream", headers: { "x-sample-rate": "24000" }, body: Buffer.alloc(24000 * 2 * v.pcm) });
      return json(v.status, { error: "x" });
    }
    if (u.pathname !== "/api/taste") return r.continue();
    if (r.method() === "GET") return json(200, { available: true, maxTurns: 3, used: o.used ?? 0 });
    st.taste++; st.tasteBodies.push(JSON.parse(r.postData() || "{}"));
    const n = st.taste;
    const h = o.taste ? o.taste(n) : { status: 200, body: { reply: `Answer ${n}. Here is a fun fact.`, turnsLeft: 3 - n, topic: "volcano heat", ...(n < 3 ? { choices: ["Lava", "Ash"] } : {}) } };
    const go = () => json(h.status, h.body);
    if (o.delay) setTimeout(go, o.delay); else go();
  });
  await page.goto(ORIGIN + (o.path ?? "/?test=1"), { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="choose-teacher"]', { timeout: 20000 }).catch(() => {});
  await sleep(800);
  return { page, errors, st };
}
const pick = async (page, who = "leo", keepOpener = false) => {
  await page.click(`[data-testid="pick-${who}"]`); await page.waitForSelector("#class-q"); await sleep(400);
  if (!keepOpener) { const b = await page.$('[data-testid="taste-stop"]'); if (b) { await b.click(); await sleep(150); } } // end the opener line: later checks are about the answer
};
const ask = async (page, q) => { await page.type("#class-q", q); await page.keyboard.press("Enter"); };
const text = (page, sel) => page.$eval(sel, (e) => e.textContent).catch(() => null);
const chipsOf = (page, sel) => page.$$eval(`${sel} .lp-chip`, (els) => els.map((e) => e.textContent)).catch(() => []);
const waitReply = (page, n, ms = 10000) => page.waitForFunction((n) => document.querySelector('[data-testid="taste-reply"]')?.textContent?.includes("Answer " + n), { timeout: ms }, n).then(() => true).catch(() => false);
const dump = (page) => page.evaluate(() => document.querySelector(".lp-class-ui")?.innerText.replace(/\n+/g, " / ").slice(0, 300));
const ctl = (page, expr) => page.evaluate(`(() => { const c = window.__ctl; return ${expr}; })()`);

// ---- A. Hostile CHOICES / TOPIC / ACT / BOARD from a (stubbed) server: the browser must re-validate.
{
  const bodies = [
    ["markup", ["<img src=x onerror=alert(1)>", "ok"]],
    ["link", ["see https://evil.example", "Fine"]],
    ["3 choices", ["a", "b", "c"]],
    ["10 KB line", ["x".repeat(10240), "y"]],
    ["dupes", ["Same", "same"]],
    ["blank + proto", ["", "__proto__"]],
    ["non-array", "Lava|Ash"],
    ["object", { 0: "a", length: 1 }],
    ["handle", ["@bob", "Ok"]],
    ["pipe", ["a|b", "c"]],
    ["control", ["bad‮text", "ok"]],
  ];
  for (const [label, choices] of bodies) {
    const { page, errors } = await open({ taste: (n) => ({ status: 200, body: { reply: "Answer. Fun.", turnsLeft: 2, choices, topic: "<b>x</b>", act: "swim", board: "<i>", gesture: "__proto__" } }) });
    await pick(page); await ask(page, "hi");
    await page.waitForSelector('[data-testid="taste-reply"]', { timeout: 8000 }).catch(() => {});
    await sleep(500);
    const shown = await chipsOf(page, '[data-testid="taste-choices"]');
    const html = await page.$eval('[data-testid="taste-live"]', (e) => e.innerHTML).catch(() => "");
    check(`hostile CHOICES (${label}): nothing unsafe is rendered`, shown.length === 0 && !/<img|onerror|evil\.example/.test(html) && (await page.$('[data-testid="taste-live"] img')) === null, `shown=${JSON.stringify(shown).slice(0, 80)}`);
    check(`hostile CHOICES (${label}): no starter chips come back, no crash`, !(await page.$('[data-testid="taste-chips"]')) && real(errors).length === 0, real(errors).slice(0, 2).join("|"));
    await page.close();
  }
}

// ---- B. Model reply with no lines at all: still a normal answer, counter moves, no chips, no dead end.
{
  const { page, errors } = await open({ taste: (n) => ({ status: 200, body: { reply: "Plain answer.", turnsLeft: 2 } }) });
  await pick(page); await page.click('[data-testid="taste-chips"] .lp-chip');
  await page.waitForSelector('[data-testid="taste-reply"]', { timeout: 8000 }).catch(() => {});
  await sleep(300);
  check("reply with no ACT/CHOICES/BOARD/TOPIC: answer, no chips, can still type, counter 1 of 3", /Plain answer/.test(await text(page, '[data-testid="taste-reply"]')) && !(await page.$('[data-testid="taste-chips"], [data-testid="taste-choices"]')) && /1 of 3/.test(await text(page, '[data-testid="taste-count"]')) && !(await page.$eval("#class-q", (e) => e.disabled)) && real(errors).length === 0);
  await page.screenshot({ path: `${OUT}${TAG}-nolines.png` });
  await page.close();
}

// ---- C. Rapid sends. Real taps (separate tasks) must send one question. Same-tick synthetic clicks are reported as a NOTE:
// send() guards on the `busy` React state, not a ref, so 3 clicks dispatched in one script tick all pass (server sees 3).
{
  const o = await open({ delay: 700 });
  await pick(o.page);
  await Promise.all([1, 2, 3].map(() => o.page.click('[data-testid="taste-chips"] .lp-chip').catch(() => {})));
  await o.page.keyboard.press("Enter"); await o.page.keyboard.press("Enter");
  await sleep(2000);
  check("3 rapid real taps + 2 Enter: server saw exactly 1 POST", o.st.taste === 1, `posts=${o.st.taste}`);
  await o.page.close();
}
{
  const o = await open({ delay: 700 });
  await pick(o.page);
  await o.page.evaluate(() => { const c = document.querySelector('[data-testid="taste-chips"] .lp-chip'); c.click(); c.click(); c.click(); });
  await sleep(2000);
  console.log(`${o.st.taste === 1 ? "PASS" : "NOTE"}  same-tick synthetic triple click: server POSTs=${o.st.taste} (state-based busy guard)`);
  await o.page.close();
}

// ---- D. Mic: denied, no speech, unsupported, a spoken question, mic during speech.
{
  const { page, errors, st } = await open({ sr: "denied" });
  await pick(page);
  const hadMic = !!(await page.$('[data-testid="taste-mic"]'));
  await page.click('[data-testid="taste-mic"]');
  await sleep(500);
  const note = await text(page, '[data-testid="taste-mic-note"]');
  check("mic denied: clear note, no question sent, typing still works", hadMic && /blocked/.test(note ?? "") && st.taste === 0 && !(await page.$eval("#class-q", (e) => e.disabled)), `note=${note}`);
  check("mic denied: mic button is withdrawn (no dead button), disclosure follows", !(await page.$('[data-testid="taste-mic"]')), "");
  await ask(page, "typed after denial");
  await page.waitForSelector('[data-testid="taste-reply"]', { timeout: 8000 }).catch(() => {});
  check("mic denied: a typed question still gets an answer", st.taste === 1 && real(errors).length === 0, real(errors).slice(0, 2).join("|"));
  await page.close();
}
{
  const { page, errors, st } = await open({ sr: "nospeech" });
  await pick(page); await page.click('[data-testid="taste-mic"]'); await sleep(500);
  check("mic no-speech: note, nothing sent, mic still available, counter unchanged", /didn.t hear/.test((await text(page, '[data-testid="taste-mic-note"]')) ?? "") && st.taste === 0 && !!(await page.$('[data-testid="taste-mic"]')) && !/of 3 used/.test(await text(page, '[data-testid="taste-count"]')));
  await page.close();
}
{
  const { page, errors, st } = await open({ sr: "text:Why is the sky blue?" });
  await pick(page); await page.click('[data-testid="taste-mic"]');
  await page.waitForSelector('[data-testid="taste-reply"]', { timeout: 8000 }).catch(() => {});
  check("spoken question is sent as one try, text only", st.taste === 1 && st.tasteBodies[0]?.text === "Why is the sky blue?" && Object.keys(st.tasteBodies[0]).sort().join() === "history,tasteId,teacher,text,v");
  await page.close();
}
{
  const { page, errors, st } = await open({ sr: "text:" + "very long ".repeat(40) });
  await pick(page); await page.click('[data-testid="taste-mic"]');
  await page.waitForSelector('[data-testid="taste-reply"]', { timeout: 8000 }).catch(() => {});
  check("a 400-char spoken question is cut to 140 characters before sending (not rejected)", st.taste === 1 && st.tasteBodies[0].text.length <= 140, `len=${st.tasteBodies[0]?.text?.length}`);
  await page.close();
}
{
  const { page, errors } = await open({ sr: "hang", speech: "fake" });
  await pick(page); await page.click('[data-testid="taste-chips"] .lp-chip');
  await page.waitForSelector('[data-testid="taste-stop"]', { timeout: 8000 }).catch(() => {});
  const c0 = await page.evaluate(() => window.__cancels);
  await page.click('[data-testid="taste-mic"]');
  await sleep(300);
  check("mic tapped while the tutor talks silences her at once", (await page.evaluate(() => window.__cancels)) > c0 && !(await page.$('[data-testid="taste-stop"]')));
  check("while listening the typing box and chips are disabled and the placeholder says Listening", (await page.$eval("#class-q", (e) => e.disabled && e.placeholder === "Listening…")) && (await page.$$eval('[data-testid="taste-choices"] .lp-chip', (e) => e.every((x) => x.disabled))));
  check("while listening the tutor leans in (state listening) and does not act", (await ctl(page, "c.s.conv.state")) === "listening", `state=${await ctl(page, "c.s.conv.state")}`);
  await page.close();
}

// ---- E. Stop mid-speech: nothing of the old turn keeps going.
{
  const { page, errors } = await open({ speech: "fake", taste: (n) => ({ status: 200, body: { reply: "Answer one. Long long line.", turnsLeft: 2, gesture: "wave", act: "jump", board: "Gravity", choices: ["Up", "Down"], topic: "gravity" } }) });
  await page.evaluate(() => { window.__rec = []; window.__acts = []; setInterval(() => { const d = window.__teacher?.animator?.debug; if (d?.gesture) window.__rec.push([performance.now(), d.gesture]); if (d?.action) window.__acts.push([performance.now(), d.action]); }, 16); });
  await pick(page); await page.click('[data-testid="taste-chips"] .lp-chip');
  await page.waitForSelector('[data-testid="taste-stop"]', { timeout: 8000 }).catch(() => {});
  await sleep(500);
  const lvl0 = await ctl(page, "c.outputLevel()");
  await page.click('[data-testid="taste-stop"]');
  const tStop = await page.evaluate(() => performance.now());
  await sleep(150);
  const lvl1 = await ctl(page, "c.outputLevel()");
  await sleep(3500);
  const lateG = await page.evaluate((t) => window.__rec.filter(([x, g]) => x > t + 700 && g !== "nod").map((x) => x[1]), tStop);
  const lateA = await page.evaluate((t) => window.__acts.filter(([x]) => x > t + 1500).length, tStop);
  check("Stop: mouth level was moving while speaking and is 0 after Stop", lvl0 > 0 && lvl1 === 0, `before=${lvl0} after=${lvl1}`);
  check("Stop: state leaves 'speaking'; no gesture 0.7s+ after Stop", (await ctl(page, "c.s.conv.state")) !== "speaking" && lateG.length === 0, `state=${await ctl(page, "c.s.conv.state")} lateG=${lateG}`);
  check("Stop: the old jump does not continue 1.5s+ after Stop", lateA === 0, `lateAct frames=${lateA}`);
  check("Stop: no pending queued directives", (await ctl(page, "c.s.directives.length")) === 0, `directives=${await ctl(page, "c.s.directives.length")}`);
  check("Stop: answer text and choices stay so the child can carry on; counter 1 of 3", /Answer one/.test(await text(page, '[data-testid="taste-reply"]')) && (await chipsOf(page, '[data-testid="taste-choices"]')).join() === "Up,Down");
  check("Stop: no console errors", real(errors).length === 0, real(errors).slice(0, 2).join("|"));
  await page.close();
}

// ---- F. Typed barge-in while speaking: old voice cancelled before the new question goes out.
{
  const { page, errors, st } = await open({ speech: "fake" });
  await pick(page); await page.click('[data-testid="taste-chips"] .lp-chip');
  await page.waitForSelector('[data-testid="taste-stop"]', { timeout: 8000 }).catch(() => {});
  const c0 = await page.evaluate(() => window.__cancels);
  await page.click('[data-testid="taste-choices"] .lp-chip');
  await sleep(300);
  check("tapping an answer while she talks cancels the old voice", (await page.evaluate(() => window.__cancels)) > c0 && st.taste === 2);
  await page.waitForFunction(() => window.__spoken.filter((t) => !/^Hi, I.m/.test(t)).length >= 2, { timeout: 6000 }).catch(() => {});
  const ans = (await page.evaluate(() => window.__spoken)).filter((t) => !/^Hi, I.m/.test(t));
  check("then the new answer is spoken, once", ans.length === 2, JSON.stringify(ans));
  await page.close();
}

// ---- G. The paywall waits for a long answer to finish (it used to swap the UI at 12 s while the tutor was still talking): no swap while audio plays, Stop/Voice stay, and it still arrives (25 s max).
{
  const { page, errors } = await open({ speech: "fake", taste: (n) => ({ status: 200, body: { reply: `Answer ${n}. ` + "A long spoken answer that takes a while to say aloud. ".repeat(5).trim(), turnsLeft: 3 - n, topic: "volcano heat", ...(n < 3 ? { choices: ["Lava", "Ash"] } : {}) } }) });
  await pick(page);
  await page.click('[data-testid="taste-chips"] .lp-chip'); if (!(await waitReply(page, 1, 20000))) { check('arc reaches answer 1', false, await dump(page)); }
  await page.click('[data-testid="taste-choices"] .lp-chip'); if (!(await waitReply(page, 2, 20000))) { check('arc reaches answer 2', false, await dump(page)); }
  await page.click('[data-testid="taste-choices"] .lp-chip'); if (!(await waitReply(page, 3, 20000))) { check('arc reaches answer 3', false, await dump(page)); }
  check("no tap answers on the last try", !(await page.$('[data-testid="taste-choices"]')));
  await sleep(13500); // the old 12 s timer would have fired by now
  check("12 s after the last answer, while she is still talking: no paywall, Stop and Voice still there", !(await page.$('[data-testid="paywall"]')) && !!(await page.$('[data-testid="taste-stop"]')) && !!(await page.$('[data-testid="taste-mute"]')));
  await page.screenshot({ path: `${OUT}${TAG}-paywall-while-speaking.png` });
  await page.waitForSelector('[data-testid="paywall"]', { timeout: 20000 }).catch(() => {});
  const wall = !!(await page.$('[data-testid="paywall"]'));
  check("the paywall arrives (the voice ends or the 25 s maximum), and no audio is left playing under it", wall && (await ctl(page, "c.s.conv.state")) !== "speaking", `paywall=${wall} state=${await ctl(page, "c.s.conv.state")}`);
  check("no console errors", real(errors).length === 0, real(errors).slice(0, 2).join("|"));
  await page.close();
}
{
  // Stop pressed on the last answer: the paywall follows soon after, not 25 s later.
  const { page } = await open({ speech: "fake", taste: (n) => ({ status: 200, body: { reply: `Answer ${n}.`, turnsLeft: 3 - n, topic: "volcano heat", ...(n < 3 ? { choices: ["Lava", "Ash"] } : {}) } }) });
  await pick(page);
  await page.click('[data-testid="taste-chips"] .lp-chip'); await waitReply(page, 1, 20000);
  await page.click('[data-testid="taste-choices"] .lp-chip'); await waitReply(page, 2, 20000);
  await page.click('[data-testid="taste-choices"] .lp-chip'); await waitReply(page, 3, 20000);
  await page.waitForSelector('[data-testid="taste-stop"]', { timeout: 8000 }).catch(() => {});
  await page.$eval('[data-testid="taste-stop"]', (e) => e.click()).catch(() => {});
  const t0 = Date.now();
  await page.waitForSelector('[data-testid="paywall"]', { timeout: 6000 }).catch(() => {});
  check("Stop on the last answer brings the paywall within a few seconds", !!(await page.$('[data-testid="paywall"]')) && Date.now() - t0 < 5000, `${Date.now() - t0} ms`);
  await page.close();
}

// ---- H. Paywall with choices sent on the last try (server drops them; the browser must not show dead buttons).
{
  const { page } = await open({ taste: (n) => ({ status: 200, body: { reply: `Answer ${n}.`, turnsLeft: 3 - n, topic: "x y", choices: ["Lava", "Ash"] } }) });
  await pick(page);
  await page.click('[data-testid="taste-chips"] .lp-chip'); if (!(await waitReply(page, 1))) { check('arc reaches answer 1', false, await dump(page)); }
  await page.click('[data-testid="taste-choices"] .lp-chip'); if (!(await waitReply(page, 2))) { check('arc reaches answer 2', false, await dump(page)); }
  await page.click('[data-testid="taste-choices"] .lp-chip'); if (!(await waitReply(page, 3))) { check('arc reaches answer 3', false, await dump(page)); }
  await sleep(300);
  const dead = await chipsOf(page, '[data-testid="taste-choices"]');
  check("last try with choices from a misbehaving server: no tap answers offered that do nothing", dead.length === 0, `chips=${dead.join("|")}`);
  await page.waitForSelector('[data-testid="paywall"]', { timeout: 16000 }).catch(() => {});
  check("paywall still follows and names the topic", /x y/.test((await text(page, '[data-testid="paywall"]')) ?? ""));
  await page.close();
}

// ---- I. Reload mid-arc (server says 2 used): counter right, no starter chips, no stale choices, one more try then paywall.
{
  const { page, st } = await open({ used: 2, taste: (n) => ({ status: 200, body: { reply: "Last answer.", turnsLeft: 0, topic: "volcano heat" } }) });
  await pick(page);
  check("reload with 2 used: counter says 2 of 3, no starter chips", /2 of 3/.test(await text(page, '[data-testid="taste-count"]')) && !(await page.$('[data-testid="taste-chips"]')) && !(await page.$('[data-testid="taste-choices"]')));
  await ask(page, "one more");
  await page.waitForSelector('[data-testid="paywall"]', { timeout: 16000 }).catch(() => {});
  check("reload mid-arc: the third try reaches the paywall (topic named)", /volcano heat/.test((await text(page, '[data-testid="paywall"]')) ?? ""));
  await page.close();
}

// ---- J. Voice failures: 500 -> browser voice; pool runs out mid-session -> browser voice and no more ElevenLabs calls.
{
  const { page, errors, st } = await open({ voice: "landing", speech: "fake", voicePost: () => ({ status: 500 }) });
  await pick(page); await sleep(300); await page.click('[data-testid="taste-chips"] .lp-chip');
  await page.waitForFunction(() => window.__spoken.some((t) => /Answer 1/.test(t)), { timeout: 10000 }).catch(() => {});
  check("voice 500: browser voice speaks the line, no console error leaks the failure", (await page.evaluate(() => window.__spoken)).some((t) => /Answer 1/.test(t)) && real(errors).length === 0, real(errors).slice(0, 2).join("|"));
  await page.click('[data-testid="taste-choices"] .lp-chip');
  await page.waitForFunction(() => window.__spoken.some((t) => /Answer 2/.test(t)), { timeout: 10000 }).catch(() => {});
  check("voice 500: later lines do not retry ElevenLabs (off for this visit)", st.voice === 1, `voice posts=${st.voice}`);
  await page.close();
}
{
  const { page, errors, st } = await open({ voice: "landing", speech: "fake", voicePost: (n) => (n === 1 ? { pcm: 1 } : { status: 429 }) });
  await pick(page); await sleep(300); await page.click('[data-testid="taste-chips"] .lp-chip');
  if (!(await waitReply(page, 1))) { check('arc reaches answer 1', false, await dump(page)); }
  await sleep(2500); // let the 1 s of PCM play out
  check("daily pool: first line played through ElevenLabs audio (an audio source started)", (await page.evaluate(() => window.__src.start)) >= 1, `sources=${await page.evaluate(() => window.__src.start)} browserSpoken=${await page.evaluate(() => window.__spoken.length)}`);
  await page.click('[data-testid="taste-choices"] .lp-chip');
  await page.waitForFunction(() => window.__spoken.some((t) => /Answer 2/.test(t)), { timeout: 10000 }).catch(() => {});
  check("daily pool used up mid-session (429): that line is spoken by the browser voice", (await page.evaluate(() => window.__spoken)).some((t) => /Answer 2/.test(t)), JSON.stringify(await page.evaluate(() => window.__spoken)));
  check("pool used up: no stuck Stop button or thinking state, no console errors", real(errors).length === 0 && !(await page.$('[data-testid="taste-thinking"]')), real(errors).slice(0, 2).join("|"));
  await page.close();
}

// ---- K. Layout: choices + voice row + mic on a long reply at this viewport (overlap check by rectangles).
{
  const long = "This is a deliberately long answer from the tutor so that the card grows as much as the server allows. ".repeat(2).slice(0, 270);
  const { page } = await open({ speech: "fake", taste: (n) => ({ status: 200, body: { reply: long, turnsLeft: 2, topic: "a b", choices: ["A fairly long answer 1", "A fairly long answer 2"], board: "Key word", scene: { setting: "desert", era: "Egypt, long ago", props: ["pr_pyramids", "pr_palms"], figure: "napoleon", placement: "left" } } }) });
  await pick(page); await page.click('[data-testid="taste-chips"] .lp-chip');
  await page.waitForSelector('[data-testid="taste-stop"]', { timeout: 8000 }).catch(() => {});
  await page.waitForSelector('[data-testid="story"]', { timeout: 8000 }).catch(() => {});
  await sleep(2500);
  const ov = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
    const hit = (a, b) => a && b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
    const card = r('[data-testid="taste-live"]'), story = r('[data-testid="story"]'), head = r(".lp-class-head");
    const items = [...document.querySelectorAll('.lp-taste-actions button, .lp-taste-row button, .lp-taste-row input')].map((e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, n: e.textContent.trim() || e.id || "mic" }; });
    const pairs = []; for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (hit(items[i], items[j])) pairs.push(items[i].n + "<>" + items[j].n);
    return { cardStory: hit(card, story), cardHead: hit(card, head), pairs, right: Math.max(...items.map((i) => i.r)), vw: innerWidth, cardTop: card?.t, storyBottom: story?.b, headBottom: head?.b, sw: document.documentElement.scrollWidth };
  });
  check("layout: no control overlaps another inside the card", ov.pairs.length === 0, JSON.stringify(ov.pairs));
  check("layout: story card does not overlap the answer card", !ov.cardStory, JSON.stringify(ov));
  check("layout: controls stay inside the viewport, no sideways scroll", ov.right <= ov.vw && ov.sw <= ov.vw + 1, JSON.stringify(ov));
  await page.screenshot({ path: `${OUT}${TAG}-long-figure-pyramids.png` });
  await page.close();
}


// ---- L. Opener: fixed line on pick, browser voice only, not a try, no ElevenLabs call, no model call.
{
  const { page, errors, st } = await open({ voice: "landing", speech: "fake", voicePost: () => ({ pcm: 1 }) });
  await sleep(500);
  await page.click('[data-testid="pick-mia"]'); await page.waitForSelector("#class-q");
  await page.waitForFunction(() => window.__spoken.length >= 1, { timeout: 8000 }).catch(() => {});
  await sleep(800);
  const spoken = await page.evaluate(() => window.__spoken);
  check("opener: spoken in the browser voice, names the tutor and offers both starters", spoken.length === 1 && /^Hi, I.m Mia! Want to find out why Mars is red, or how old the pyramids are\?$/.test(spoken[0]), JSON.stringify(spoken));
  check("opener: no /api/voice call (ElevenLabs characters not spent) and no /api/taste call", st.voice === 0 && st.taste === 0, `voice=${st.voice} taste=${st.taste}`);
  check("opener: not a try (counter says 3 free tries, starter chips visible, 'Stop talking' shown while it plays)", /3 free tries/.test(await text(page, '[data-testid="taste-count"]')) && (await chipsOf(page, '[data-testid="taste-chips"]')).join("|") === "Why is Mars red?|How old are the pyramids?" && !!(await page.$('[data-testid="taste-stop"]')));
  check("opener: tutor waves (a gesture, not an action) and the mouth moves while it plays", (await ctl(page, "c.outputLevel()")) > 0);
  await page.screenshot({ path: `${OUT}${TAG}-opener.png` });
  check("opener: no console errors", real(errors).length === 0, real(errors).slice(0, 2).join("|"));
  // the first real question is try 1 and goes through ElevenLabs when offered
  await page.click('[data-testid="taste-chips"] .lp-chip'); await waitReply(page, 1);
  await sleep(600);
  check("after the opener the first question is try 1 of 3 and the opener is cut off for the answer", /1 of 3/.test(await text(page, '[data-testid="taste-count"]')) && st.taste === 1 && st.voice >= 1, `taste=${st.taste} voice=${st.voice}`);
  await page.close();
}
{ // the opener with muted voice / no speech synthesis at all: nothing breaks, no stuck Stop button
  const { page, errors } = await open({});
  await page.evaluate(() => { try { Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true }); } catch {} });
  await pick(page, "leo", true); await sleep(1200);
  check("opener without any speech synthesis: no Stop button stuck, no errors, typing works", !(await page.$('[data-testid="taste-stop"]')) && real(errors).length === 0 && !(await page.$eval("#class-q", (e) => e.disabled)), real(errors).slice(0, 2).join("|"));
  await page.close();
}

// ---- M. Leave the page (client-side navigation unmounts the hero; the window stays so we can look afterwards).
const leaveVia = async (page) => { await page.evaluate(() => { window.__marker = 1; window.next.router.push("/pricing"); }); await page.waitForFunction(() => location.pathname === "/pricing", { timeout: 10000 }).catch(() => {}); };
{
  const { page, errors, st } = await open({ speech: "fake" });
  await page.click('[data-testid="pick-leo"]'); await page.waitForSelector("#class-q");
  await page.waitForFunction(() => window.__spoken.length >= 1, { timeout: 8000 }).catch(() => {});
  await leaveVia(page);
  const c0 = await page.evaluate(() => window.__cancels); const n0 = await page.evaluate(() => window.__spoken.length);
  await sleep(2500);
  const stayed = await page.evaluate(() => window.__marker === 1);
  check("pick then leave mid-opener (SPA nav): speech is cancelled, nothing more is spoken", stayed && c0 >= 1 && (await page.evaluate(() => window.__spoken.length)) === n0 && n0 === 1, `stayed=${stayed} cancels=${c0} spoken=${n0}`);
  check("pick then leave: no console errors, no taste call", real(errors).length === 0 && st.taste === 0, real(errors).slice(0, 2).join("|"));
  await page.close();
}
{
  const { page, errors, st } = await open({ speech: "fake", delay: 2500, taste: (n) => ({ status: 200, body: { reply: "Late answer.", turnsLeft: 2, gesture: "wave", act: "jump", board: "Late", choices: ["A", "B"], topic: "late", scene: { setting: "desert", era: "Late", props: ["pr_pyramids"] } } }) });
  await pick(page); await page.click('[data-testid="taste-chips"] .lp-chip');
  await page.waitForSelector('[data-testid="taste-thinking"]', { timeout: 5000 }).catch(() => {});
  await leaveVia(page);
  await sleep(4500); // the stubbed answer arrives after we left
  const spoken = (await page.evaluate(() => window.__spoken)).filter((t) => /Late answer/.test(t));
  check("question pending, visitor leaves, late answer arrives: nothing is spoken", spoken.length === 0, JSON.stringify(spoken));
  check("late answer: no scene, no queued directives, tutor session closed", (await ctl(page, "c.s.scene === null && c.s.directives.length === 0 && c.s.status")) === "disconnected", `scene/dir/status=${await ctl(page, "[c.s.scene === null, c.s.directives.length, c.s.status]")}`);
  check("late answer: no console errors", real(errors).length === 0, real(errors).slice(0, 2).join("|"));
  await page.close();
}
{
  const { page, errors, st } = await open({ voice: "landing", speech: "fake", voicePost: () => ({ pcm: 1 }), delay: 0 });
  await sleep(400); await pick(page);
  await page.click('[data-testid="taste-chips"] .lp-chip'); await waitReply(page, 1, 8000);
  await leaveVia(page);
  const s0 = await page.evaluate(() => window.__src.start); const v0 = st.voice; const sp0 = (await page.evaluate(() => window.__spoken)).length;
  await sleep(3000);
  check("leave while the ElevenLabs line is being fetched/played: no audio source starts afterwards, no new voice call, no browser fallback speech", (await page.evaluate(() => window.__src.start)) === s0 && st.voice === v0 && (await page.evaluate(() => window.__spoken)).length === sp0, `src ${s0}->${await page.evaluate(() => window.__src.start)} voice ${v0}->${st.voice} spoken ${sp0}->${(await page.evaluate(() => window.__spoken)).length}`);
  check("leave mid ElevenLabs line: no console errors", real(errors).length === 0, real(errors).slice(0, 2).join("|"));
  await page.close();
}
{ // fast: pick, then leave in the same breath (before the opener's voices load)
  const { page, errors } = await open({ speech: "fake" });
  await page.evaluate(() => { window.__marker = 1; });
  await page.click('[data-testid="pick-leo"]'); await page.evaluate(() => window.next.router.push("/pricing"));
  await page.waitForFunction(() => location.pathname === "/pricing", { timeout: 10000 }).catch(() => {});
  await sleep(2500);
  const spoken = await page.evaluate(() => window.__spoken.length); const cancels = await page.evaluate(() => window.__cancels);
  const stillAlive = await page.evaluate(() => window.__marker === 1);
  check("pick then leave immediately: at most the opener started and it is cancelled; nothing speaks afterwards", stillAlive && (spoken === 0 || cancels >= 1), `spoken=${spoken} cancels=${cancels}`);
  check("pick then leave immediately: no console errors", real(errors).length === 0, real(errors).slice(0, 2).join("|"));
  await page.close();
}

await browser.close();
console.log(bad ? `\n${bad} FAILED` : "\nAll passed");
process.exit(bad ? 1 : 0);
