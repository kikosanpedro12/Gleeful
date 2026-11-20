// Story scene (showScene/hideScene) in the browser. Needs a TEST build whose controller exposes window.__ctl (tester copy).
// Usage: SMOKE_URL=http://localhost:3222/learn?test=1 [W=390 H=844 TAG=p] [RM=1] node scripts/scene-smoke.mjs
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
page.on("response", (r) => { if (r.url().endsWith(".glb")) glb.push(r.status() + " " + r.url().split("/assets/")[1]); });
await page.setViewport({ width: W, height: H });
await page.goto(TARGET, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas", { timeout: 30000 }); await sleep(2000);
await page.click('[data-testid="pick-leo"]'); await sleep(300);
await page.click('[data-testid="start"]');
await page.waitForSelector('[data-testid="demo-badge"]', { timeout: 20000 });
await page.waitForFunction(() => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle", { timeout: 30000 });
const preErr = errors.length;
check("no errors before any scene (baseline)", preErr === 0, errors.slice(0,3).join(" | "));
check("hook present", await page.evaluate(() => !!window.__ctl));
// call the real onToolCall for the current turn
const call = (name, args, stale = false) => page.evaluate((name, args, stale) => {
  const c = window.__ctl; const id = "r" + Math.random();
  c.responseTurn.set(id, stale ? c.s.conv.turnId - 1 : c.s.conv.turnId);
  const before = c.s.rejectedCommands, sb = c.s.staleDropped;
  c.events.onToolCall(id, "c" + Math.random(), name, JSON.stringify(args));
  return { rej: c.s.rejectedCommands - before, stale: c.s.staleDropped - sb, scene: !!c.s.scene };
}, name, args, stale);
const story = () => page.$('[data-testid="story"]');
const good = { setting: "study", era: "France, about 1805", props: ["ph_pocket_watch", "ph_marble_bust_01"] };
let r = await call("showScene", good);
check("valid scene accepted", r.scene && !r.rej, JSON.stringify(r));
await sleep(5000);
check("panel visible", !!(await story()));
check("label shown", /pretend/i.test(await page.$eval('[data-testid="story-label"]', (e) => e.textContent).catch(() => "")));
check("era shown", /France, about 1805/.test(await page.$eval('[data-testid="story"]', (e) => e.textContent).catch(() => "")));
check("GLBs loaded 200", glb.some((g) => /^200 ph\/pocket_watch/.test(g)) && glb.some((g) => /^200 ph\/marble_bust/.test(g)), glb.join(","));
const bb = await page.$eval('[data-testid="story"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, h: r.height }; });
check("panel on screen", bb.x >= 0 && bb.r <= W + 1 && bb.b <= H + 1, JSON.stringify(bb));
await page.screenshot({ path: `${OUT}${TAG}-scene-1.png` });
const cb = await page.$eval('[data-testid="story"] button', (e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
check("close button >=44px", cb[0] >= 44 && cb[1] >= 44, cb.join("x"));
await page.click('[data-testid="story"] button'); await sleep(300);
check("close works", !(await story()));
// ---- figures: 3D character, zoom, move, name card (decision 19-21 Nov)
const figBox = () => page.$eval('[data-testid="story-card"]', (e) => ({ tier: e.getAttribute("data-tier"), text: e.textContent })).catch(() => null);
r = await call("showScene", { setting: "study", era: "France, about 1805", props: ["ph_pocket_watch"], figure: "napoleon", placement: "right", view: "full" });
check("figure scene accepted", r.scene && !r.rej, JSON.stringify(r));
await sleep(7000);
const c1 = await figBox();
check("model figure: card with name, years, pretend-likeness note", c1?.tier === "model" && /Napoleon Bonaparte/.test(c1.text) && /1769/.test(c1.text) && /not a real photo/.test(c1.text), JSON.stringify(c1));
check("figure GLB loaded 200", glb.some((g) => /^200 tripo\/napoleon/.test(g)), glb.join(","));
await page.screenshot({ path: `${OUT}${TAG}-scene-figure-full.png` });
r = await call("showScene", { setting: "study", era: "France, about 1805", props: [], figure: "napoleon", placement: "left", view: "closeup" });
check("same figure moved and zoomed (a second showScene replaces the first)", r.scene && !r.rej, JSON.stringify(r));
await sleep(2500);
await page.screenshot({ path: `${OUT}${TAG}-scene-figure-closeup.png` });
r = await call("showScene", { setting: "study", era: "England, 2000s", figure: "stephen_hawking" });
await sleep(1500);
const c2 = await figBox();
check("name card figure: no model, card only", c2?.tier === "card" && /Stephen Hawking/.test(c2.text) && !/not a real photo/.test(c2.text), JSON.stringify(c2));
await page.screenshot({ path: `${OUT}${TAG}-scene-figure-card.png` });
r = await call("showScene", { setting: "ancient_city", era: "Mactan, 1521", props: ["tp_orca"], figure: "lapu_lapu" });
await sleep(6000);
check("tp_ props and a figure together", r.scene && !r.rej, JSON.stringify(r));
check("tripo prop GLB loaded 200", glb.some((g) => /^200 tripo\/orca/.test(g)), glb.join(","));
await page.evaluate(() => window.__ctl.closeScene()); await sleep(300);
// hostile
for (const [n, a] of [
  ["unknown prop", { ...good, props: ["nope"] }], ["url prop", { ...good, props: ["https://evil.example/x.glb"] }],
  ["proto setting", { setting: "__proto__", era: "x" }], ["constructor setting", { setting: "constructor", era: "x" }],
  ["7 props", { ...good, props: Array(7).fill("ph_pocket_watch") }], ["figure unknown", { ...good, figure: "nobody" }], ["figure proto", { ...good, figure: "__proto__" }], ["placement bad", { ...good, figure: "napoleon", placement: "behind" }], ["view bad", { ...good, figure: "napoleon", view: "../x" }],
  ["era object", { ...good, era: { a: 1 } }], ["era empty", { ...good, era: "  " }], ["props string", { ...good, props: "ph_pocket_watch" }],
  ["extra coords ignored", { ...good, x: 5, url: "http://e.x" }],
]) {
  r = await call("showScene", a);
  const expectOk = n === "extra coords ignored";
  check(`hostile: ${n}`, expectOk ? r.scene : (!r.scene && r.rej === 1), JSON.stringify(r));
  if (r.scene) await page.evaluate(() => window.__ctl.closeScene());
}
await page.evaluate(() => window.__ctl.set({ scene: null }));
// raw json garbage
r = await page.evaluate(() => { const c = window.__ctl; const id = "z"; c.responseTurn.set(id, c.s.conv.turnId); c.events.onToolCall(id, "cz", "showScene", "{__proto__:"); return { scene: !!c.s.scene, rej: c.s.rejectedCommands }; });
check("garbage JSON dropped", !r.scene);
// stale
r = await call("showScene", good, true);
check("stale-turn scene dropped", !r.scene && r.stale === 1, JSON.stringify(r));
// scene then hide
await call("showScene", good); await sleep(1000);
await call("hideScene", {});
check("hideScene clears", !(await story()));
// scene clears on travel
await call("showScene", good); await sleep(500);
await page.evaluate(() => window.__ctl.beginTransit("market"));
await sleep(300);
check("scene cleared on world travel", !(await story()));
r = await call("showScene", good);
check("no scene during transit", !r.scene && r.rej === 1, JSON.stringify(r));
await sleep(2500);
await page.screenshot({ path: `${OUT}${TAG}-scene-2-transit.png` });
// End mid-scene
await page.waitForFunction(() => !window.__ctl.s.transit, { timeout: 20000 }).catch(() => {});
await call("showScene", good);
await page.evaluate(() => window.__ctl.stop());
await sleep(500);
check("scene cleared on End", !(await story()));
await sleep(500);
check("no page errors / CSP violations", errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
