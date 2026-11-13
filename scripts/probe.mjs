// Tester probes (round 4): test hooks off without ?test=1, CSP positive control + injection
// through every reachable text path, tampered localStorage, queued arrival after Stop,
// tap-to-talk with no speech, rapid End/Start. DEMO mode only.
// Usage: SMOKE_URL='http://localhost:3112/learn?test=1' node scripts/probe.mjs
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const TARGET = process.env.SMOKE_URL || "http://localhost:3111/learn?test=1";
const ORIGIN = new URL(TARGET).origin;
const OUT = new URL("./out/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, detail = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${detail}`); };

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [], csp = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  const t = m.text();
  if (/Content-Security-Policy|Refused/i.test(t)) csp.push(t);
  else if (m.type() === "error" && !/favicon|404/.test(t)) errors.push(t);
});
await page.evaluateOnNewDocument(() => {
  document.addEventListener("securitypolicyviolation", (e) => console.error(`Refused (CSP event): ${e.violatedDirective}`));
});
const st = () => page.evaluate(() => {
  const el = document.querySelector('[data-testid="state"]');
  return {
    state: el?.getAttribute("data-state") ?? "offline", world: el?.getAttribute("data-world"), transit: el?.getAttribute("data-transit") === "1",
    approach: window.__fx?.approach ?? 0, listening: !!document.querySelector('[data-testid="mic"].on, [data-testid="mic"][aria-pressed="true"]'),
    choices: [...document.querySelectorAll('[data-testid^="choice-"]')].map((b) => b.getAttribute("data-testid").slice(7)),
    question: !!document.querySelector('[data-testid="question"]'),
    caption: document.querySelector('[data-testid="caption"]')?.textContent ?? "",
    pwn: window.__pwn ?? null,
  };
});
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await st(); if (fn(d)) return d; await sleep(60); } return null; };
const type = async (t) => {
  await page.evaluate(() => { if (!document.querySelector('[data-testid="text-input"]')) [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("⌨"))?.click(); });
  await page.waitForSelector('[data-testid="text-input"]', { timeout: 3000 });
  await page.type('[data-testid="text-input"]', t); await page.keyboard.press("Enter");
};
const start = async (who = "leo") => {
  await page.waitForSelector(`[data-testid="pick-${who}"]`, { timeout: 30000 });
  await page.click(`[data-testid="pick-${who}"]`); await sleep(250); await page.click('[data-testid="start"]');
  return waitFor((d) => d.state === "idle" && (d.choices.length > 0 || d.question), 30000);
};
const fresh = async (url = TARGET) => { await page.goto(url, { waitUntil: "domcontentloaded" }); await page.evaluate(() => localStorage.clear()); await page.goto(url, { waitUntil: "domcontentloaded" }); await page.waitForSelector("canvas", { timeout: 30000 }); await sleep(1500); };

// ---- (c) test hooks are off without ?test=1
for (const q of ["/learn", "/learn?test=0", "/learn?test=1x", "/learn#test=1", "/learn?xtest=1"]) {
  await page.goto(ORIGIN + q, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 30000 }); await sleep(2500);
  const hooks = await page.evaluate(() => ["__teacher", "__project", "__teachers", "__fx"].filter((k) => typeof window[k] !== "undefined"));
  check(`no test hooks at ${q}`, hooks.length === 0, hooks.join(","));
}
{ // started lesson without hooks too (hooks may be set lazily)
  await page.click('[data-testid="pick-leo"]'); await sleep(200); await page.click('[data-testid="start"]'); await sleep(5000);
  const hooks = await page.evaluate(() => ["__teacher", "__project", "__teachers", "__fx"].filter((k) => typeof window[k] !== "undefined"));
  check("no test hooks after starting a lesson at /learn", hooks.length === 0, hooks.join(","));
}

// ---- (a) CSP positive control: the violation listener must actually see a blocked inline handler.
csp.length = 0;
await page.evaluate(() => document.body.insertAdjacentHTML("beforeend", '<img id="pc" src="data:," onerror="window.__pwn=\'pc\'"><img src="/nope.png" onerror="window.__pwn=\'pc2\'">'));
await sleep(800);
check("CSP positive control: inline handler blocked AND reported", (await page.evaluate(() => window.__pwn ?? null)) === null && csp.length > 0, `(${csp.length} msgs)`);
csp.length = 0;

// ---- (a) injection through typed input
await fresh();
await start("leo");
const payloads = ['<script>window.__pwn="s"</script>', '<img src=x onerror="window.__pwn=\'i\'">', '"><svg onload="window.__pwn=\'v\'">', "javascript:window.__pwn='j'"];
for (const p of payloads) { await type(p); await sleep(300); }
await waitFor((d) => d.state === "idle", 25000);
const injected = await page.evaluate(() => ({ pwn: window.__pwn ?? null, img: !!document.querySelector('img[src="x"]'), svg: !!document.querySelector("svg[onload]"), script: [...document.scripts].some((s) => s.textContent.includes("__pwn")) }));
check("typed HTML/script never becomes DOM or runs", !injected.pwn && !injected.img && !injected.svg && !injected.script, JSON.stringify(injected));
check("no CSP violations from normal lesson use", csp.length === 0, csp.slice(0, 2).join(" | "));

// ---- (f) queued arrival after Stop: be mid-answer at landing, then Stop.
{
  await page.goto(TARGET, { waitUntil: "domcontentloaded" });
  const ok = await start("leo") && await waitFor((d) => d.choices.includes("mars") && d.state === "idle", 25000);
  if (ok) {
    await page.click('[data-testid="choice-mars"]');
    await waitFor((d) => d.transit, 15000);
    // Reproducible recipe: a short typed question just before landing keeps a turn busy,
    // so the arrival line is queued / in flight when the child presses Stop on Mars.
    await page.waitForFunction(() => (window.__fx?.approach ?? 0) > 0.8, { polling: 20, timeout: 40000 }).catch(() => {});
    await type("why");
    const landedSpeaking = await waitFor((d) => d.world === "mars" && !d.transit, 25000);
    const s = await st();
    if (landedSpeaking && s.state !== "idle") {
      const ib = await page.$('[data-testid="interrupt"]'); if (ib) await ib.click();
      const tStop = Date.now();
      await waitFor((d) => d.state === "idle", 3000);
      const resumed = await waitFor((d) => d.state !== "idle", 8000);
      const dt = Date.now() - tStop;
      check("queued arrival delivered after Stop (~1.2 s)", !!resumed && dt > 900 && dt < 2600, `(${dt} ms, caption="${(resumed?.caption ?? "").slice(0, 50)}")`);
      const ch = await waitFor((d) => d.state === "idle" && d.choices.length > 0, 25000);
      check("after queued arrival the child gets choices", !!ch, ch ? `(${ch.choices})` : "");
    } else console.log(`SKIP  queued-arrival: teacher was ${s.state} at landing (not queued)`);
  } else check("mars choice offered for queued test", false);
}

// ---- (f) tap-to-talk with no speech: stub recognition so it starts, hears nothing, ends ("no-speech").
{
  await page.goto(TARGET, { waitUntil: "domcontentloaded" });
  await start("leo");
  await page.evaluate(() => {
    window.SpeechRecognition = class { start() { setTimeout(() => this.onstart?.(), 50); setTimeout(() => { this.onerror?.({ error: "no-speech" }); this.onend?.(); }, 1500); } stop() {} abort() {} };
  });
  const before = (await st()).choices;
  await page.click('[data-testid="mic"]'); const t0 = Date.now();
  const back = await waitFor((d) => d.state === "idle" && !d.listening && Date.now() - t0 > 1600, 15000);
  const after = await st();
  const banner = await page.evaluate(() => document.body.innerText.match(/didn.t hear anything[^\n]*/i)?.[0] ?? "");
  check("tap-to-talk, no speech: back to idle with a 'didn't hear' hint", !!back && !!banner, `(${banner})`);
  check("tap-to-talk, no speech: the choices the child had are still there", after.choices.length > 0 || after.question, `(before=${before}, after=${after.choices})`);
}

// ---- (f) rapid End/Start x5
for (let i = 0; i < 5; i++) {
  await page.click('button[aria-label="End lesson"]').catch(() => {});
  await page.waitForSelector('[data-testid="start"]', { timeout: 10000 }).catch(() => {});
  await page.click(`[data-testid="pick-${i % 2 ? "mia" : "leo"}"]`).catch(() => {});
  await page.click('[data-testid="start"]').catch(() => {});
  await sleep(120);
}
const sane = await waitFor((d) => d.state === "idle" && d.world === "classroom" && !d.transit && (d.choices.length > 0 || d.question), 30000);
check("rapid End/Start x5 ends in a usable classroom", !!sane, JSON.stringify(await st()));
await page.screenshot({ path: `${OUT}probe-end-start.png` });

// ---- (e) tampered localStorage, then /parent and the lesson
const big = "x".repeat(100000);
const att = (o) => ({ skill: "science.mars.red_color", questionId: "q_red", answerId: "rust", correct: true, hintsUsed: 0, context: "taught", at: "2026-01-01T00:00:00Z", ...o });
const CASES = {
  "not json": ["{oops", "{oops"],
  "null / wrong types": ["null", '{"a":1}'],
  "attempts not array": [JSON.stringify({ version: 1, attempts: "x", sessions: "9" }), "123"],
  "proto/constructor skills, junk at/session": [JSON.stringify({ version: 1, learnerId: 5, teacher: "<b>x</b>", sessions: 1e308, attempts: [
    att({ skill: "constructor" }), att({ skill: "__proto__" }), att({ skill: "toString", at: "garbage", session: "abc" }), att({ hintsUsed: 1e9 }), att({ at: null }), att({ skill: big }), null, 7, "s"] }), "[null,{}]"],
  "html in stored skill": [JSON.stringify({ version: 1, sessions: 1, attempts: [att({ skill: '<img src=x onerror="window.__pwn=\'ls\'">' })] }), "[]"],
};
for (const [name, [learner, latency]] of Object.entries(CASES)) {
  errors.length = 0; csp.length = 0;
  await page.goto(ORIGIN + "/parent", { waitUntil: "domcontentloaded" });
  await page.evaluate((l, r) => { localStorage.setItem("aiteacher.learner.v1", l); localStorage.setItem("aiteacher.latency.v1", r); }, learner, latency);
  await page.goto(ORIGIN + "/parent", { waitUntil: "domcontentloaded" }); await sleep(1200);
  const pv = await page.evaluate(() => ({ ok: /Parent view/.test(document.body.innerText), pwn: window.__pwn ?? null, img: !!document.querySelector('img[src="x"]') }));
  await page.goto(TARGET, { waitUntil: "domcontentloaded" });
  const lesson = await start("leo");
  // finish a turn so the latency log is written over the junk
  check(`tampered storage [${name}]: /parent renders, lesson starts, no errors`, pv.ok && !pv.pwn && !pv.img && !!lesson && errors.length === 0,
    `${JSON.stringify(pv)} lesson=${!!lesson} ${errors.slice(0, 2).join(" | ").slice(0, 300)}`);
}
{ // storage full: lesson must go on
  errors.length = 0;
  await page.goto(TARGET, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); try { let s = "y".repeat(1 << 20); for (let i = 0; i < 12; i++) localStorage.setItem("fill" + i, s); } catch {} });
  await page.goto(TARGET, { waitUntil: "domcontentloaded" });
  const ok = await start("mia");
  check("localStorage full: lesson still starts", !!ok && errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.evaluate(() => localStorage.clear());
}

await browser.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
