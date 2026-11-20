// Acting out (act command: run, jump, eat, sit, clap) in the browser. Needs a TEST build whose controller exposes window.__ctl (tester copy).
// Usage: SMOKE_URL=http://localhost:3222/learn?test=1 [W=390 H=844 TAG=p] [RM=1] node scripts/act-smoke.mjs
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const TARGET = process.env.SMOKE_URL || "http://localhost:3222/learn?test=1";
const OUT = fileURLToPath(new URL("./out/", import.meta.url)); fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720), TAG = process.env.TAG || "d";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (n, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
if (process.env.RM) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
const errors = [], glb = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" || /Refused|Content Security/i.test(m.text())) errors.push(m.text()); });
await page.setViewport({ width: W, height: H });
await page.goto(TARGET, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas", { timeout: 30000 }); await sleep(2000);
await page.click('[data-testid="pick-leo"]'); await sleep(300);
await page.click('[data-testid="start"]');
await page.waitForSelector('[data-testid="demo-badge"]', { timeout: 20000 });
await page.waitForFunction(() => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle", { timeout: 30000 });

const preErr = errors.length;
check("hook present", await page.evaluate(() => !!window.__ctl && !!window.__teachers?.leo));
const call = (name, args, stale = false) => page.evaluate((name, args, stale) => {
  const c = window.__ctl; const id = "r" + Math.random();
  c.responseTurn.set(id, stale ? c.s.conv.turnId - 1 : c.s.conv.turnId);
  const before = c.s.rejectedCommands, sb = c.s.staleDropped;
  c.events.onToolCall(id, "c" + Math.random(), name, JSON.stringify(args));
  return { rej: c.s.rejectedCommands - before, stale: c.s.staleDropped - sb };
}, name, args, stale);
const act = () => page.evaluate(() => window.__teachers.leo.animator.debug.action);
const rootY = () => page.evaluate(() => window.__teachers.leo.rig.root.position.y);
const SEC = { run: 2.6, jump: 1.3, eat: 3.4, sit: 3.4, clap: 2.2 };
const RM = !!process.env.RM;
for (const a of Object.keys(SEC)) {
  const r = await call("act", { action: a });
  check(`${a}: accepted`, r.rej === 0 && r.stale === 0, JSON.stringify(r));
  let started = false, peak = 0, shot = false;
  const t0 = Date.now();
  while (Date.now() - t0 < (SEC[a] + 14) * 1000) {
    const cur = await act(); if (cur === a) started = true;
    peak = Math.max(peak, await rootY());
    if (started && !shot && Date.now() - t0 > SEC[a] * (a === "jump" ? 450 : 600)) { shot = true; await page.screenshot({ path: `${OUT}${TAG}-act-${a}.png` }); }
    if (started && !cur) break;
    await sleep(60);
  }
  check(`${a}: started`, started);
  check(`${a}: returned to idle`, (await act()) === null);
  if (a === "jump") check("jump: height " + (RM ? "small with reduced motion" : "visible"), RM ? peak < 0.12 : peak > 0.2, "peak " + peak.toFixed(2));
  await sleep(700);
  check(`${a}: back on the floor`, Math.abs(await rootY()) < 0.06, String(await rootY()));
}
// Not allowed here: swim (no water), unknown ids, hostile ids, stale turn.
for (const bad of ["swim", "climb", "fly", "__proto__", "https://evil.example/x.glb"]) {
  const r = await call("act", { action: bad });
  check(`rejected: ${bad}`, r.rej === 1 && (await act()) === null, JSON.stringify(r));
}
const st = await call("act", { action: "jump" }, true);
check("stale turn dropped", st.stale === 1 && (await act()) === null, JSON.stringify(st));
// A new child turn stops a running action.
await call("act", { action: "sit" }); await sleep(500);
check("sit running", (await act()) === "sit");
await page.evaluate(() => window.__ctl.sendText("hello"));
await sleep(600);
check("new child turn stops it", (await act()) === null);
check("no page errors / CSP violations", errors.length === preErr, errors.slice(0, 5).join(" | "));
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
