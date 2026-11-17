// Tester-passcode lesson: /api/voice answers 503 (no key); lesson must continue on the browser voice, never hang,
// call /api/voice at most once, and survive interrupt mid-line. Never contacts ElevenLabs when the server has no key.
import puppeteer from "puppeteer-core";
const TARGET = process.env.SMOKE_URL || "http://localhost:3222/learn?test=1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
const errs = [], voice = [];
page.on("pageerror", (e) => errs.push("pageerror " + e));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
page.on("response", (r) => { if (r.url().includes("/api/voice")) voice.push(`${r.request().method()} ${r.status()}`); });
await page.setViewport({ width: 1280, height: 720 });
await page.evaluateOnNewDocument(() => { try { sessionStorage.setItem("gleeful.tester", "dummy-code-0123456789abcdef"); } catch {} });
const st = () => page.evaluate(() => { const el = document.querySelector('[data-testid="state"]'); const t = window.__teacher?.animator;
  return { state: el?.getAttribute("data-state"), mouth: t?.debug.mouthOpen ?? 0, walking: t?.debug.walking, pointing: t?.debug.pointing,
    choices: [...document.querySelectorAll('[data-testid^="choice-"]')].map((b) => b.getAttribute("data-testid").slice(7)), code: sessionStorage.getItem("gleeful.tester")?.length }; });
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await st(); if (fn(d)) return d; await sleep(100); } return null; };
await page.goto(TARGET, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas", { timeout: 30000 });
await sleep(2000);
console.log("code length in storage:", (await st()).code);
await page.click('[data-testid="pick-leo"]'); await sleep(300); await page.click('[data-testid="start"]');
const greetSpeaking = await waitFor((d) => d.mouth > 0.02, 20000);
check("greeting speaks (mouth moves) despite 503", !!greetSpeaking);
const c1 = await waitFor((d) => d.choices.includes("mars"), 25000);
check("greeting finishes and offers Mars (no hang)", !!c1);
console.log("voice requests after greeting:", voice);
check("/api/voice called exactly once so far, status 503", voice.length === 1 && voice[0].endsWith("503"), JSON.stringify(voice));
await page.click('[data-testid="choice-mars"]');
const arrive = await waitFor((d) => d.choices.includes("why-red") || d.choices.includes("rock") || d.choices.includes("crater"), 90000);
console.log("choices on Mars:", arrive?.choices);
await sleep(1200);
check("later lines did not call /api/voice again", voice.length === 1, JSON.stringify(voice));
const pick = arrive?.choices.includes("crater") ? "crater" : arrive?.choices[0];
await page.click(`[data-testid="choice-${pick}"]`);
await waitFor((d) => d.state === "speaking", 8000); await sleep(600);
const intr = await page.$('[data-testid="interrupt"]');
check("Stop button present while busy", !!intr);
if (intr) { await intr.click(); const s = await waitFor((d) => d.state === "idle" && d.mouth < 0.02 && !d.walking && !d.pointing, 3000); check("Stop mid-line: mouth/walk/point stop", !!s, JSON.stringify(s)); await sleep(3000);
  const after = await st(); check("after Stop 3s: no walking or pointing from the old turn (a fresh strand-guard line may speak)", !after.walking && !after.pointing, JSON.stringify(after)); }
// rapid typed barge-in
await page.click('[data-testid="type-toggle"]').catch(() => {}); await sleep(300);
const inp = await page.$('[data-testid="text-input"]');
if (inp) { await inp.type("show me the crater"); await page.keyboard.press("Enter"); await sleep(500); await page.keyboard.press("Enter").catch(() => {}); }
await sleep(8000);
const fin = await st();
check("lesson not stuck in speaking after typed turn", fin.state !== "speaking" || (await waitFor((d) => d.state !== "speaking", 30000)) !== null, JSON.stringify(fin));
console.log("final voice requests:", voice);
check("/api/voice never called more than once", voice.length <= 1, JSON.stringify(voice));
const real = errs.filter((e) => !/status of 503/.test(e));
check("no console/page errors other than the browser-logged 503 network line (" + (errs.length - real.length) + " such)", real.length === 0, real.slice(0, 4).join(" | "));
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
