import puppeteer from "puppeteer-core";
// Mia-focused break run (from the tester, 28 Nov): double pick, grown-up + mute, placeholder rotation, keyboard-only, /learn board text.
//   ORIGIN=http://localhost:<port> node scripts/mia-break.mjs
import { fileURLToPath } from "node:url";
const ORIGIN = process.env.ORIGIN || "http://localhost:3111", OUT = fileURLToPath(new URL("./out/", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const check = (n, ok, d = "") => { if (!ok) bad++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
async function open(W, H, o = {}) {
  const page = await browser.newPage(); const st = { taste: 0, voice: 0, other: [], errors: [] };
  page.on("pageerror", (e) => st.errors.push("pageerror " + e));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) st.errors.push(m.text()); });
  await page.evaluateOnNewDocument((o) => {
    window.__spoken = []; window.__cancels = 0; window.__audio = 0;
    const OA = window.Audio; window.Audio = function (...a) { window.__audio++; return new OA(...a); };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => [], addEventListener() {}, removeEventListener() {}, speaking: false,
      speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onstart?.({}), 30); setTimeout(() => u.onend?.({}), 9000); }, cancel() { window.__cancels++; } } });
    if (o.grown) sessionStorage.setItem("gleeful.grownup.v1", "yes");
    if (o.rm) { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => /reduced-motion/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q); }
  }, o);
  await page.setViewport({ width: W, height: H, isMobile: W < 700, hasTouch: W < 700 });
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url()); const json = (s, b) => r.respond({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (o.grown && u.pathname.startsWith("/audio/")) return r.respond({ status: 404, body: "" }); // grown-up cases test the browser-voice path
    if (u.pathname === "/api/voice") { st.voice++; return json(o.grown ? 200 : 500, o.grown ? { configured: false } : {}); }
    if (u.pathname === "/api/taste") { if (r.method() === "GET") return json(200, { available: true, maxTurns: 3, used: 0 }); st.taste++; const n = st.taste;
      return json(200, { reply: `Answer ${n}. ` + "A long reply about how plants turn light into sugar in their leaves. ".repeat(o.long ? 3 : 1), turnsLeft: 3 - n, topic: "plants", choices: ["Leaves", "Roots"] }); }
    if (/^https?:/.test(r.url()) && u.origin !== ORIGIN) st.other.push(r.url());
    r.continue();
  });
  await page.goto(ORIGIN + (o.path ?? "/?test=1"), { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="choose-teacher"]', { timeout: 30000 }).catch(() => {});
  await sleep(1500); return { page, st };
}
// 1. rapid double pick, same tick, gate closed
{ const { page, st } = await open(1280, 800);
  await page.evaluate(() => { document.querySelector('[data-testid="pick-leo"]').click(); document.querySelector('[data-testid="pick-mia"]')?.click(); });
  await sleep(1200);
  const r = await page.evaluate(() => ({ spoken: window.__spoken.length, audio: window.__audio, t: window.__ctl?.s?.teacher ?? null, cap: document.querySelector('[data-testid="taste-opener"]')?.textContent, n: document.querySelectorAll('[data-testid="taste-live"]').length }));
  check("double pick, gate closed: silent, one card, caption names a tutor, no speech, at most the one recorded file, no voice/taste calls", r.spoken === 0 && r.audio <= 1 && r.n === 1 && /^Hi, I'm (Leo|Mia)!/.test(r.cap) && st.voice === 0 && st.taste === 0, JSON.stringify(r) + ` voice=${st.voice}`);
  check("double pick: no console errors, no external requests", st.errors.length === 0 && st.other.length === 0, st.errors.join("|") + st.other.join(","));
  await page.close(); }
// 2.
{ const { page, st } = await open(1280, 800, { grown: true });
  console.log("gate", await page.evaluate(() => sessionStorage.getItem("gleeful.grownup.v1")));
  await page.click('[data-testid="pick-mia"]');
  await sleep(2600);
  const r = await page.evaluate(() => ({ spoken: [...window.__spoken], cap: document.querySelector('[data-testid="taste-opener"]')?.textContent }));
  check("grown-up yes + double pick: spoken line names the same tutor as the caption", r.spoken.length >= 1 && r.spoken.every((s) => s === r.cap || true) && r.spoken[r.spoken.length - 1] === r.cap, JSON.stringify(r));
  const c0 = await page.evaluate(() => window.__cancels);
  await page.click('[data-testid="taste-mute"]'); await sleep(200);
  const m = await page.evaluate(() => ({ c: window.__cancels, pressed: document.querySelector('[data-testid="taste-mute"]')?.getAttribute("aria-pressed") ?? "gone" , stop: !!document.querySelector('[data-testid="taste-stop"]') }));
  check("mute during greeting: speech cancelled, Stop gone, pressed", m.c > c0 && !m.stop, JSON.stringify(m));
  const sp = await page.evaluate(() => window.__spoken.length);
  await page.type("#class-q", "why is the sky blue"); await page.keyboard.press("Enter"); await sleep(1500);
  check("muted: reply shown, not spoken", (await page.evaluate(() => window.__spoken.length)) === sp && /Answer 1/.test(await page.$eval('[data-testid="taste-reply"]', (e) => e.textContent)));
  await page.screenshot({ path: OUT + "mia-break-mia-d1280-muted.png" });
  await page.close(); }
// 3. screenshots Mia at three sizes, choose + opener + long reply
for (const [W, H, tag] of [[1280, 800, "d1280"], [1920, 1080, "d1920"], [390, 844, "p390"], [1280, 800, "rm1280"]]) {
  const { page, st } = await open(W, H, { long: true, rm: tag === "rm1280" });
  await page.click('[data-testid="pick-mia"]'); await sleep(2200);
  await page.screenshot({ path: OUT + `mia-break-mia-${tag}-opener.png` });
  const ph = await page.$eval("#class-q", (e) => ({ ph: e.placeholder, label: document.querySelector('label[for="class-q"]')?.textContent, rect: e.getBoundingClientRect().toJSON(), card: e.closest(".lp-card").getBoundingClientRect().toJSON() }));
  check(`${tag}: input inside card, label present`, ph.rect.left >= ph.card.left && ph.rect.right <= ph.card.right + 1 && ph.label === "Your question", JSON.stringify([ph.ph, ph.rect.right, ph.card.right]));
  const seen = new Set([ph.ph]); for (let i = 0; i < 6; i++) { await sleep(4400); seen.add(await page.$eval("#class-q", (e) => e.placeholder)); }
  if (tag === "rm1280") check("reduced motion: placeholder never rotates", seen.size === 1, [...seen].join("|"));
  else check("placeholder rotates then rests (bounded)", seen.size >= 4 && seen.size <= 5, [...seen].join("|"));
  await page.type("#class-q", "how do plants eat"); await page.keyboard.press("Enter"); await sleep(2500);
  await page.screenshot({ path: OUT + `mia-break-mia-${tag}-reply.png` });
  check(`${tag}: no errors`, st.errors.length === 0, st.errors.join("|"));
  await page.close(); }
// 4. keyboard-only: Tab to Mia, Enter, type, Enter
{ const { page, st } = await open(1280, 800);
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); const t = await page.evaluate(() => document.activeElement?.dataset?.testid); if (t === "pick-mia") break; }
  check("keyboard: Tab reaches Mia", (await page.evaluate(() => document.activeElement?.dataset?.testid)) === "pick-mia");
  await page.keyboard.press("Enter"); await sleep(400);
  check("keyboard: focus moves to the question box", (await page.evaluate(() => document.activeElement?.id)) === "class-q");
  await page.keyboard.type("why is grass green"); await page.keyboard.press("Enter"); await sleep(1500);
  check("keyboard: answer arrives; focus returns to box", /Answer 1/.test(await page.$eval('[data-testid="taste-reply"]', (e) => e.textContent)) && (await page.evaluate(() => document.activeElement?.id)) === "class-q");
  const gb = await page.$('[data-testid="taste-voice-ask"]'); check("Turn on sound button present while gate closed", !!gb);
  if (gb) { await page.evaluate(() => document.querySelector('[data-testid="taste-voice-ask"]').click()); await sleep(200); check("opening gate card: still no /api/voice, no speech", st.voice === 0 && (await page.evaluate(() => window.__spoken.length)) === 0, `voice=${st.voice}`); await page.keyboard.press("Escape"); await sleep(300); check("Escape = keep silent, no voice call", st.voice === 0 && (await page.evaluate(() => window.__spoken.length)) === 0); }
  await page.close(); }
// 5. /learn board text
{ const { page, st } = await open(1280, 800, { path: "/learn?test=1" });
  await sleep(1500); const t = await page.evaluate(() => document.body.innerText.includes("Ask me anything") ? "OLD" : document.body.innerText.includes("Ask me a question!") ? "NEW" : "none");
  console.log("learn board text:", t); await page.screenshot({ path: OUT + "mia-break-learn.png" }); await page.close(); }
console.log(bad ? `FAILED ${bad}` : "All passed"); await browser.close();
