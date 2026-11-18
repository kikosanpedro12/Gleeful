// Landing taste speaks the reply via /api/voice (public voice taste). /api/taste and /api/voice are MOCKED (no real key, no ElevenLabs contact).
//   ORIGIN=http://localhost:3222 node scripts/taste-voice.mjs   (W=390 H=844 / RM=1 for phone / reduced motion)
import puppeteer from "puppeteer-core";
const ORIGIN = process.env.ORIGIN || "http://localhost:3222";
const W = Number(process.env.W || 1280), H = Number(process.env.H || 800), RM = !!process.env.RM;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const check = (n, ok, d = "") => { if (!ok) bad++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });

async function run(name, { pub, voicePost = "ok", path = "/" }, body) {
  console.log(`--- ${name}`);
  const page = await browser.newPage();
  const errs = [], voice = [];
  page.on("pageerror", (e) => errs.push("pageerror " + e));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.evaluateOnNewDocument(() => {
    document.addEventListener("securitypolicyviolation", (e) => console.error(`Refused (CSP event): ${e.violatedDirective} ${e.blockedURI}`));
    window.__src = { start: 0, stop: 0 };
    const A = window.AudioBufferSourceNode?.prototype;
    if (A) { const s = A.start, t = A.stop; A.start = function (...a) { window.__src.start++; return s.apply(this, a); }; A.stop = function (...a) { window.__src.stop++; return t.apply(this, a); }; }
  });
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700 });
  if (RM) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  let n = 0;
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url()); const json = (s, b, h = {}) => r.respond({ status: s, contentType: "application/json", body: JSON.stringify(b), headers: h });
    if (u.pathname === "/api/taste") { if (r.method() === "GET") return json(200, { available: true, maxTurns: 3 }); n++; return json(200, { reply: `Here is answer ${n}. It is a fun one to think about.`, turnsLeft: 3 - n }); }
    if (u.pathname === "/api/voice") {
      voice.push({ method: r.method(), headers: r.headers() });
      if (r.method() === "GET") return json(200, { configured: true, public: pub, teachers: ["leo", "mia"], model: "x", standInVoices: true });
      if (voicePost === "ok") return r.respond({ status: 200, contentType: "application/octet-stream", headers: { "x-sample-rate": "24000" }, body: Buffer.alloc(24000 * 2 * 4) }); // 4 s of silence
      return json(Number(voicePost), { error: "x" });
    }
    r.continue();
  });
  await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1500);
  await body(page, voice, errs);
  await page.close();
}
const ask = async (page, q) => { await page.$eval("#taste", (e) => e.scrollIntoView({ behavior: "instant", block: "center" })); await page.waitForSelector("#taste-q", { timeout: 15000 }); await page.click("#taste-q", { clickCount: 3 }); await page.type("#taste-q", q); await page.click('#taste button[type="submit"]'); };
const posts = (v) => v.filter((x) => x.method === "POST");

await run("public OFF", { pub: false }, async (page, voice, errs) => {
  await ask(page, "why is the sky blue"); await sleep(1500);
  check("only GET probes, no POST", posts(voice).length === 0 && voice.every((x) => x.method === "GET"), JSON.stringify(voice.map((x) => x.method)));
  check("reply shown", /answer 1/.test(await page.$eval('[data-testid="taste-reply"]', (e) => e.textContent)));
  check("no errors", errs.length === 0, errs.join("|"));
});
await run("public ON", { pub: true }, async (page, voice, errs) => {
  await ask(page, "why is the sky blue"); await sleep(1500);
  const p = posts(voice);
  check("exactly one POST", p.length === 1, String(p.length));
  check("x-gleeful-voice: public", p[0]?.headers["x-gleeful-voice"] === "public");
  check("no tester header", !Object.keys(p[0]?.headers ?? {}).some((k) => /tester/i.test(k)), Object.keys(p[0]?.headers ?? {}).join(","));
  check("audio started", (await page.evaluate(() => window.__src.start)) > 0, JSON.stringify(await page.evaluate(() => window.__src)));
  // new question stops the old line
  const before = await page.evaluate(() => window.__src.stop);
  await ask(page, "what is a volcano"); await sleep(400);
  const after = await page.evaluate(() => window.__src.stop);
  check("new question stops the old audio", after > before, `${before}->${after}`);
  await sleep(1500);
  check("second question -> second POST only", posts(voice).length === 2, String(posts(voice).length));
  // unmount: client-side navigation away stops audio
  const b2 = await page.evaluate(() => { window.__marker = 1; return window.__src.stop; });
  await page.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("href")?.startsWith("/learn")); a?.click(); });
  await sleep(1500);
  check("navigated away", /\/learn/.test(page.url()), page.url());
  const spa = await page.evaluate(() => window.__marker === 1);
  if (spa) check("unmount stops audio", (await page.evaluate(() => window.__src.stop)) > b2); else console.log("NOTE  landing links are plain <a> (full page load): audio ends with the page; React unmount path not reachable from the UI");
  check("no errors", errs.length === 0, errs.join("|"));
});
for (const code of ["429", "503", "403", "500"]) await run(`public ON, POST ${code}`, { pub: true, voicePost: code }, async (page, voice, errs) => {
  await ask(page, "why is the sky blue"); await sleep(1500);
  check("one POST, silent fallback", posts(voice).length === 1, String(posts(voice).length));
  check("reply still shown", /answer 1/.test(await page.$eval('[data-testid="taste-reply"]', (e) => e.textContent)));
  const real = errs.filter((e) => !/Failed to load resource/.test(e) || /Refused/.test(e));
  check("no console errors/CSP violations (resource-status noise excluded)", real.length === 0, errs.join("|"));
  if (errs.length) console.log("  note: raw console errors:", errs.join(" | "));
});
await run("/learn, public OFF", { pub: false, path: "/learn?test=1" }, async (page, voice, errs) => {
  await sleep(1500); check("no POST on /learn load", posts(voice).length === 0);
});
await browser.close();
console.log(bad ? `${bad} FAILED` : "all passed"); process.exit(bad ? 1 : 0);
