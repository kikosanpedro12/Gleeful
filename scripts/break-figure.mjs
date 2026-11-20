// Tester sweep for figure scenes in the real browser. Usage: SMOKE_URL=http://localhost:3222/learn?test=1 [W= H= TAG=] node scripts/break-figure.mjs
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const TARGET = process.env.SMOKE_URL || "http://localhost:3222/learn?test=1";
const OUT = fileURLToPath(new URL("./out/", import.meta.url)); fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720), TAG = process.env.TAG || "d";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (n, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage(); const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" || /Refused|Content Security/i.test(m.text())) errors.push(m.text()); });
await page.setViewport({ width: W, height: H });
await page.goto(TARGET, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas", { timeout: 30000 }); await sleep(2000);
await page.click('[data-testid="pick-leo"]'); await sleep(300); await page.click('[data-testid="start"]');
await page.waitForSelector('[data-testid="demo-badge"]', { timeout: 20000 });
await page.waitForFunction(() => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle", { timeout: 30000 });
const call = (name, args) => page.evaluate((name, args) => { const c = window.__ctl; const id = "r" + Math.random(); c.responseTurn.set(id, c.s.conv.turnId);
  const b = c.s.rejectedCommands; c.events.onToolCall(id, "c" + Math.random(), name, typeof args === "string" ? args : JSON.stringify(args));
  return { rej: c.s.rejectedCommands - b, scene: !!c.s.scene, fig: c.s.scene?.frame?.figure, pl: c.s.scene?.frame?.placement, view: c.s.scene?.frame?.view }; }, name, args);
const base = { setting: "study", era: "France, about 1805" };
const hostile = [["figure number", { figure: 5 }], ["figure array", { figure: ["napoleon"] }], ["figure object", { figure: { toString: 1 } }], ["figure constructor", { figure: "constructor" }], ["figure toString", { figure: "toString" }],
  ["figure empty", { figure: "" }], ["figure caps", { figure: "Napoleon" }], ["figure space", { figure: "napoleon " }], ["figure null", { figure: null }], ["placement __proto__", { figure: "napoleon", placement: "__proto__" }], ["placement number", { figure: "napoleon", placement: 1 }],
  ["placement null", { figure: "napoleon", placement: null }], ["placement Left", { figure: "napoleon", placement: "Left" }], ["view html", { figure: "napoleon", view: "<img src=x onerror=alert(1)>" }], ["view toString", { figure: "napoleon", view: "toString" }],
  ["view array", { figure: "napoleon", view: ["full"] }], ["over budget (3 tp props + napoleon)", { figure: "napoleon", props: ["tp_orca","tp_elephant","tp_t_rex"] }], ["mixed looks + figure", { figure: "napoleon", props: ["ph_pocket_watch", "tp_orca"] }],
  ["placement w/o figure (no crash)", { placement: "left" }, true]];
for (const [n, a, ok] of hostile) { const r = await call("showScene", { ...base, ...a }); check("hostile: " + n, ok ? !r.rej : r.rej === 1 && !r.scene, JSON.stringify(r)); await page.evaluate(() => window.__ctl.closeScene()); }
// valid figure edge: figure with 4 ph props near budget
let r = await call("showScene", { ...base, figure: "napoleon", props: ["ph_pocket_watch", "ph_marble_bust_01"], placement: "center", view: "closeup" }); check("valid center closeup", !r.rej && r.fig === "napoleon" && r.view === "closeup", JSON.stringify(r));
// rapid repeated move/zoom
const t0 = Date.now();
for (let i = 0; i < 60; i++) await call("showScene", { ...base, figure: i % 2 ? "napoleon" : "marie_curie", placement: ["left", "center", "right"][i % 3], view: i % 4 < 2 ? "full" : "closeup", props: i % 5 === 0 ? ["ph_pocket_watch"] : [] });
await sleep(3000);
const st = await page.evaluate(() => ({ stories: document.querySelectorAll('[data-testid="story"]').length, canv: document.querySelectorAll('[data-testid="story"] canvas').length, cards: document.querySelectorAll('[data-testid="story-card"]').length, scene: window.__ctl.s.scene?.frame }));
check("60 rapid showScene: one panel, <=1 canvas, one card", st.stories === 1 && st.canv <= 1 && st.cards === 1, JSON.stringify(st));
check("last frame wins (i=59: napoleon, right? )", st.scene?.figure === "napoleon", JSON.stringify(st.scene));
await page.screenshot({ path: `${OUT}${TAG}-break-rapid.png` });
// webgl contexts: count lost/alive via a fresh canvas isn't possible; check no console warnings about too many contexts
check("no 'Too many active WebGL contexts' warning", !errors.some((e) => /too many/i.test(e)), errors.slice(0, 3).join(" | "));
// figure scene while travelling: scene must clear, new ones refused, no stale figure after arrival
await call("showScene", { ...base, figure: "magellan", props: ["ph_pocket_watch"] });
await page.evaluate(() => window.__ctl.beginTransit("market")); await sleep(400);
check("figure scene cleared on travel", !(await page.$('[data-testid="story"]')));
r = await call("showScene", { ...base, figure: "napoleon" }); check("figure scene refused during transit", r.rej === 1 && !r.scene, JSON.stringify(r));
await page.waitForFunction(() => !window.__ctl.s.transit, { timeout: 25000 }).catch(() => {}); await sleep(1500);
check("no figure panel after arrival", !(await page.$('[data-testid="story"]')));
await page.screenshot({ path: `${OUT}${TAG}-break-after-travel.png` });
// figure scene then End while the GLB is still loading
await call("showScene", { ...base, figure: "magellan", props: ["ph_pocket_watch"] });
await page.evaluate(() => window.__ctl.stop()); await sleep(1500);
check("figure scene then End: no story panel", !(await page.$('[data-testid="story"]')) && !(await page.evaluate(() => window.__ctl.s.scene)));
check("no page errors / CSP violations", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close(); console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
