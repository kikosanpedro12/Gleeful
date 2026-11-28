// The recorded greeting in a real browser (the real mp3 files): success, missing file, interrupt, mute and unmute mid-play.
//   ORIGIN=http://localhost:<port> [W=390 H=844 TAG=g-p] node scripts/greeting-break.mjs
// /api/taste and /api/voice are stubbed (no model or ElevenLabs spend). Audio elements are watched through a wrapper on window.Audio.
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
const ORIGIN = process.env.ORIGIN || "http://localhost:3111";
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
const W = Number(process.env.W || 1280), H = Number(process.env.H || 800), TAG = process.env.TAG || "g-d";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const check = (n, ok, d = "") => { if (!ok) bad++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${ok ? "" : d}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function open({ grown = false, audio = "real" } = {}) {
  const page = await browser.newPage(); const st = { errors: [], taste: 0, voice: 0, audioReq: [] };
  page.on("pageerror", (e) => st.errors.push("pageerror " + e));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) st.errors.push(m.text()); });
  await page.evaluateOnNewDocument((grown) => {
    window.__spoken = []; window.__cancels = 0; window.__aud = [];
    const OA = window.Audio;
    window.Audio = function (src) { const a = new OA(src); window.__aud.push(a); return a; };
    let cur = null, t = null;
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => [], addEventListener() {}, removeEventListener() {}, speaking: false,
      speak(u) { window.__spoken.push(u.text); cur = u; setTimeout(() => { if (cur === u) { u.onstart?.({}); t = setTimeout(() => { if (cur === u) { cur = null; u.onend?.({}); } }, 20000); } }, 50); },
      cancel() { window.__cancels++; if (t) clearTimeout(t); cur = null; } } });
    if (grown) sessionStorage.setItem("gleeful.grownup.v1", "yes");
  }, grown);
  await page.setViewport({ width: W, height: H, isMobile: W < 700, hasTouch: W < 700 });
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url()); const json = (s, b) => r.respond({ status: s, contentType: "application/json", body: JSON.stringify(b) });
    if (u.pathname.startsWith("/audio/")) { st.audioReq.push(u.pathname); if (audio === "404") return r.respond({ status: 404, body: "" }); return r.continue(); }
    if (u.pathname === "/api/voice") { if (r.method() === "GET") return json(200, { configured: false, public: false, landing: false }); st.voice++; return json(429, { error: "x" }); }
    if (u.pathname === "/api/taste") { if (r.method() === "GET") return json(200, { available: true, maxTurns: 3, used: 0 }); st.taste++; return json(200, { reply: "Answer 1. A fun fact.", turnsLeft: 2, topic: "facts", choices: ["Yes", "No"] }); }
    r.continue();
  });
  await page.goto(ORIGIN + "/?test=1", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="choose-teacher"]', { timeout: 30000 }).catch(() => {});
  await sleep(800); return { page, st };
}
const note = (page) => page.$('[data-testid="greeting-note"]').then((e) => !!e);
const has = (page, id) => page.$(`[data-testid="${id}"]`).then((e) => !!e);
const waitNote = (page, ms = 12000) => page.waitForSelector('[data-testid="greeting-note"]', { timeout: ms }).then(() => true).catch(() => false);
const aud = (page) => page.evaluate(() => window.__aud.map((a) => ({ src: new URL(a.src).pathname, paused: a.paused, ended: a.ended, t: a.currentTime })));

// 1. success (Leo, then Mia): the file plays, the label shows only while it plays, no gate button meanwhile, no browser voice, nothing spent
for (const who of ["leo", "mia"]) {
  const { page, st } = await open();
  await page.click(`[data-testid="pick-${who}"]`);
  const shown = await waitNote(page);
  const a = await aud(page);
  check(`${who}: recorded greeting plays its own file and the label appears`, shown && a.length === 1 && a[0].src === `/audio/greeting-${who}.mp3` && !a[0].paused, JSON.stringify(a));
  check(`${who}: while it plays: caption shown, label says recorded not live, 'Turn on sound' hidden, voice control shown`, /Hi, I.m (Leo|Mia)! What do you want to learn today\?/.test(await page.$eval('[data-testid="taste-opener"]', (e) => e.textContent)) && /Recorded greeting, not live voice/.test(await page.$eval('[data-testid="greeting-note"]', (e) => e.textContent)) && !(await has(page, "taste-voice-ask")) && (await has(page, "taste-mute")));
  if (who === "leo") await page.screenshot({ path: `${OUT}${TAG}-greeting-playing.png` });
  await page.waitForFunction(() => window.__aud[0]?.ended, { timeout: 20000 }).catch(() => {});
  await sleep(400);
  check(`${who}: when it ends the label goes, 'Turn on sound' returns, caption stays`, !(await note(page)) && (await has(page, "taste-voice-ask")) && (await has(page, "taste-opener")));
  check(`${who}: no browser speech, no /api/voice, no /api/taste, no console errors`, (await page.evaluate(() => window.__spoken.length)) === 0 && st.voice === 0 && st.taste === 0 && st.errors.length === 0, st.errors.join("|"));
  await page.close();
}
// 2. missing file (404): caption stays, no label ever; gate closed = silent; gate yes = the browser voice speaks ONCE
{ const { page, st } = await open({ audio: "404" });
  await page.click('[data-testid="pick-leo"]'); await sleep(5000);
  check("404, gate closed: caption stays, no label, silent, 'Turn on sound' offered", !(await note(page)) && (await has(page, "taste-opener")) && (await page.evaluate(() => window.__spoken.length)) === 0 && (await has(page, "taste-voice-ask")));
  check("404: no console errors", st.errors.length === 0, st.errors.join("|"));
  await page.close(); }
{ const { page } = await open({ audio: "404", grown: true });
  await page.click('[data-testid="pick-leo"]');
  await page.waitForFunction(() => window.__spoken.length >= 1, { timeout: 9000 }).catch(() => {});
  await sleep(1500);
  const sp = await page.evaluate(() => [...window.__spoken]);
  check("404, grown-up yes: the browser voice speaks the greeting exactly once (no double), label never shown", sp.length === 1 && /What do you want to learn today\?/.test(sp[0]) && !(await note(page)), JSON.stringify(sp));
  await page.close(); }
// 3. interrupt mid-play: the visitor asks a question while the recording plays
{ const { page, st } = await open();
  await page.click('[data-testid="pick-leo"]'); await waitNote(page);
  await page.type("#class-q", "why is the sky blue"); await page.keyboard.press("Enter");
  await page.waitForSelector('[data-testid="taste-reply"]', { timeout: 10000 }).catch(() => {});
  const a = await aud(page);
  check("interrupt: the recording stops, the label goes, the answer shows, no browser speech, one try used", a[0]?.paused && !(await note(page)) && /Answer 1/.test(await page.$eval('[data-testid="taste-reply"]', (e) => e.textContent).catch(() => "")) && (await page.evaluate(() => window.__spoken.length)) === 0 && st.taste === 1, JSON.stringify(a));
  await sleep(1500);
  check("interrupt: the recording does not resume or restart afterwards", (await page.evaluate(() => window.__aud.length)) === 1 && (await aud(page))[0].paused);
  await page.close(); }
// 4. mute mid-play, then unmute
{ const { page, st } = await open();
  await page.click('[data-testid="pick-leo"]'); await waitNote(page);
  await page.click('[data-testid="taste-mute"]'); await sleep(300);
  const a = await aud(page);
  check("mute mid-play: the recording pauses, the label goes, the control stays pressed and says 'Voice is off', caption kept", a[0]?.paused && !(await note(page)) && (await page.$eval('[data-testid="taste-mute"]', (e) => e.getAttribute("aria-pressed"))) === "true" && /Voice is off/.test(await page.$eval('[data-testid="voice-off"]', (e) => e.textContent).catch(() => "")) && (await has(page, "taste-opener")), JSON.stringify(a));
  check("mute mid-play: no browser voice takes over (no double speech)", (await page.evaluate(() => window.__spoken.length)) === 0);
  await page.screenshot({ path: `${OUT}${TAG}-greeting-muted.png` });
  await page.click('[data-testid="taste-mute"]'); await sleep(300);
  check("unmute: pressed false, 'Voice is off' gone, the recording does not restart by itself", (await page.evaluate(() => window.__aud.length)) === 1 && (await aud(page))[0].paused && !(await has(page, "voice-off")));
  check("mute/unmute: no console errors", st.errors.length === 0, st.errors.join("|"));
  await page.close(); }
// 5. muted BEFORE it could play is not possible (the greeting starts on the pick tap), but a double pick must give one recording
{ const { page } = await open();
  await page.evaluate(() => { document.querySelector('[data-testid="pick-leo"]').click(); document.querySelector('[data-testid="pick-mia"]')?.click(); });
  await sleep(2500);
  const a = await aud(page); const playing = a.filter((x) => !x.paused && !x.ended).length;
  check("double pick in one tick: never two recordings playing at once", playing <= 1, JSON.stringify(a));
  await page.close(); }
await browser.close();
console.log(bad ? `\n${bad} FAILED` : "\nAll passed"); process.exit(bad ? 1 : 0);
