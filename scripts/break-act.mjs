// Tester sweep: hostile/rapid act commands. SMOKE_URL=... node scripts/break-act.mjs
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const TARGET = process.env.SMOKE_URL || "http://localhost:3222/learn?test=1";
const OUT = fileURLToPath(new URL("./out/", import.meta.url)); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (n, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage(); const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" || /Refused|Content Security/i.test(m.text())) errors.push(m.text()); });
await page.setViewport({ width: 1280, height: 720 });
async function startLesson() {
  await page.goto(TARGET, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 30000 }); await sleep(2000);
  await page.click('[data-testid="pick-leo"]'); await sleep(300);
  await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-testid="demo-badge"]', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle", { timeout: 30000 });
}
await startLesson();
const call = (name, args, raw) => page.evaluate((name, args, raw) => {
  const c = window.__ctl; const id = "r" + Math.random(); c.responseTurn.set(id, c.s.conv.turnId);
  const b = c.s.rejectedCommands; c.events.onToolCall(id, "c" + Math.random(), name, raw ? args : JSON.stringify(args));
  return { rej: c.s.rejectedCommands - b }; }, name, args, raw);
const act = () => page.evaluate(() => window.__teachers.leo.animator.debug.action);
const dbg = () => page.evaluate(() => ({ ...window.__teachers.leo.animator.debug, y: window.__teachers.leo.rig.root.position.y }));
const pre = errors.length;
const hostile = [{ action: 5 }, { action: ["jump"] }, { action: { toString: 1 } }, { action: "JUMP" }, { action: "Jump " }, { action: " jump" }, { action: "constructor" }, { action: "toString" }, { action: "__proto__" }, { action: "" }, { action: null }, {}, { action: "swim" }, { action: "climb" }, { action: "jump", x: 9, speed: 1e9 }];
for (const h of hostile) { const r = await call("act", h); const a = await act(); const ok = h.action === "jump" && h.x ? r.rej === 0 : (r.rej === 1 && a === null); check("hostile " + JSON.stringify(h), ok, JSON.stringify({ r, a })); await sleep(50); }
await sleep(2500);
for (const raw of ["not json", "null", "[]", "\"jump\"", "{\"action\":\"__proto__\"}"]) { const r = await call("act", raw, true); check("raw args " + raw, r.rej === 1 && (await act()) === null, JSON.stringify(r)); }
await sleep(1800);
// spam
for (let i = 0; i < 60; i++) await call("act", { action: ["run", "jump", "eat", "sit", "clap"][i % 5] });
await sleep(300);
const d1 = await dbg(); console.log("after spam", JSON.stringify(d1));
await page.evaluate(() => window.__ctl.stop()); const t0 = Date.now(); let idle = false;
while (Date.now() - t0 < 60000) { if ((await act()) === null && (await page.evaluate(() => window.__ctl.s.conv.turnId, 0)) !== undefined) { await sleep(400); if ((await act()) === null) { idle = true; break; } } await sleep(300); }
check("spam: settles to idle", idle, "after " + (Date.now() - t0) + "ms");
await sleep(800); const d2 = await dbg(); check("spam: on floor", Math.abs(d2.y) < 0.06, JSON.stringify(d2));
// act then stop. The spam section above ended the lesson with __ctl.stop(), so start a fresh one first (otherwise the act is dropped and this tests nothing).
await startLesson();
await call("act", { action: "run" }); await sleep(500);
const before = await act();
await page.evaluate(() => { const c = window.__ctl; (c.stop || c.interrupt || c.bargeIn)?.call(c); });
await sleep(500); const d3 = await dbg();
check("act then stop clears", before === "run" && d3.action === null && Math.abs(d3.y) < 0.06, JSON.stringify({ before, d3 }));
// act while child speaks (typed + ptt state)
await page.evaluate(() => window.__ctl.sendText("tell me about rust")); await sleep(300);
const r = await call("act", { action: "clap" }); await sleep(400);
console.log("act during child turn:", JSON.stringify({ r, a: await act() }));
await sleep(8000);
// figure scene + action
const sc = await call("showScene", { setting: "study", era: "France, about 1805", figure: "napoleon" });
const ac = await call("act", { action: "clap" }); await sleep(900);
const st = await page.evaluate(() => ({ scene: !!window.__ctl.s.scene, a: window.__teachers.leo.animator.debug.action }));
check("figure scene + act no reject", sc.rej === 0 && ac.rej === 0, JSON.stringify({ sc, ac, st }));
await page.screenshot({ path: OUT + "d-break-figure-act.png" });
await call("hideScene", {}); await sleep(2500);
// transit
await page.evaluate(() => window.__ctl.beginTransit("market")); await sleep(300);
const tr = await call("act", { action: "jump" }); check("act during transit rejected/ignored", (await act()) === null, JSON.stringify(tr));
await call("act", { action: "run" }); await sleep(100);
// start action then transit
await page.waitForFunction(() => window.__ctl.s.world === "market" && !window.__ctl.s.transit, { timeout: 40000 }).catch(() => {});
await sleep(1500); console.log("world", await page.evaluate(() => window.__ctl.s.world));
const e = await call("act", { action: "eat" }); check("eat in market accepted (registry allows)", e.rej === 0, JSON.stringify(e));
await call("act", { action: "run" }); await sleep(400);
await page.evaluate(() => window.__ctl.beginTransit("classroom")); await sleep(600);
const d4 = await dbg(); check("action cleared by transit start", d4.action === null, JSON.stringify(d4));
await page.waitForFunction(() => window.__ctl.s.world === "classroom" && !window.__ctl.s.transit, { timeout: 40000 }).catch(() => {});
await sleep(1000);
const sw = await call("act", { action: "swim" }); check("swim in classroom rejected", sw.rej === 1);
const eC = await call("act", { action: "eat" }); check("eat in classroom accepted", eC.rej === 0);
await sleep(300); await page.evaluate(() => window.__ctl.beginTransit("mars")); 
await page.waitForFunction(() => window.__ctl.s.world === "mars" && !window.__ctl.s.transit, { timeout: 60000 }).catch(() => {});
await sleep(1500); console.log("world", await page.evaluate(() => window.__ctl.s.world));
const em = await call("act", { action: "eat" }); check("eat on Mars rejected", em.rej === 1 && (await act()) === null, JSON.stringify(em));
const jm = await call("act", { action: "jump" }); check("jump on Mars ok", jm.rej === 0);
await sleep(300);
await page.evaluate(() => { const c = window.__ctl; }); await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^end/i.test(b.textContent.trim()))?.click()); await sleep(800);
check("End clears action", (await act()) === null);
check("no page errors", errors.length === pre, errors.slice(0, 4).join(" | "));
await browser.close(); console.log(fails ? fails + " FAILED" : "ALL PASS"); process.exit(fails ? 1 : 0);
