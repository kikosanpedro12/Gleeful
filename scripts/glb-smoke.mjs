// GLB teachers (Leo and Mia as rigged characters) in the browser: every gesture and act plays, walking, pointing,
// interruption, hostile ids, stale turns, no CSP violations, and screenshots to compare with the procedural rig.
// Needs a TEST build (NEXT_PUBLIC_TEST_HOOKS=1) whose controller exposes window.__ctl.
//   SMOKE_URL=http://localhost:3333/learn?test=1&rig=glb       [TEACHER=leo|mia] [W=390 H=844 TAG=p] [RM=1] node scripts/glb-smoke.mjs
//   SMOKE_URL=http://localhost:3333/learn?test=1&rig=procedural EXPECT=procedural TAG=proc node scripts/glb-smoke.mjs   (the same run on the procedural rig, for the screenshots)
//   FALLBACK=1 ... blocks /assets/characters/* so the GLB load fails: the procedural rig must appear and everything still works.
// Software rendering: behaviour and screenshots, never fps. Triangle and draw-call counts come from the renderer's info.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const TARGET = process.env.SMOKE_URL || "http://localhost:3333/learn?test=1&rig=glb";
const OUT = fileURLToPath(new URL("./out/", import.meta.url)); fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720), TAG = process.env.TAG || "d";
const WHO = process.env.TEACHER || "leo";
const EXPECT = process.env.EXPECT || (process.env.FALLBACK ? "procedural" : "glb");
const RM = !!process.env.RM;
const CLIPS = new Set(["idle", "walk", "run", "jump", "jump_down", "run_upstairs", "sit", "look_around", "bow", "swim", "laugh_01", "greet_01", "cheer", "agree", "climb", "clap", "wave_goodbye_01"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (n, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
if (RM) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
const errors = [], files = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" || /Refused|Content Security/i.test(m.text())) errors.push(m.text()); });
page.on("response", (r) => { if (r.url().includes("/assets/characters/")) files.push(r.status() + " " + r.url().split("/characters/")[1]); });
await page.evaluateOnNewDocument(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`)));
if (process.env.FALLBACK) {
  await page.setRequestInterception(true);
  page.on("request", (r) => (r.url().includes("/assets/characters/") ? r.abort() : r.continue()));
}
await page.setViewport({ width: W, height: H });
await page.goto(TARGET, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas", { timeout: 30000 });
await page.waitForFunction((who) => !!window.__teachers?.[who], { timeout: 40000 }, WHO);
await sleep(1500);
const isGlb = await page.evaluate((who) => !!window.__teachers[who].rig.glb, WHO);
check(`rig is ${EXPECT}`, EXPECT === "glb" ? isGlb : !isGlb, `glb=${isGlb}`);
if (EXPECT === "glb") check("character files fetched (200)", ["leo.glb", "mia.glb", "clips.glb"].filter((f) => f.startsWith(WHO) || f === "clips.glb").every((f) => files.some((x) => x === "200 " + f)), files.join(","));
if (process.env.FALLBACK) check("failed load shows no error to the visitor", errors.filter((e) => !/Failed to load resource|ERR_FAILED|net::/i.test(e)).length === 0, errors.slice(0, 3).join(" | "));
await page.screenshot({ path: `${OUT}${TAG}-glb-0-onboarding.png` });
await page.click(`[data-testid="pick-${WHO}"]`); await sleep(300);
await page.click('[data-testid="start"]');
await page.waitForSelector('[data-testid="demo-badge"]', { timeout: 20000 });
await page.waitForFunction(() => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle", { timeout: 30000 });
await sleep(800);
const preErr = errors.length;

const call = (name, args, stale = false) => page.evaluate((name, args, stale) => {
  const c = window.__ctl; const id = "r" + Math.random();
  c.responseTurn.set(id, stale ? c.s.conv.turnId - 1 : c.s.conv.turnId);
  const before = c.s.rejectedCommands, sb = c.s.staleDropped;
  c.events.onToolCall(id, "c" + Math.random(), name, JSON.stringify(args));
  return { rej: c.s.rejectedCommands - before, stale: c.s.staleDropped - sb };
}, name, args, stale);
const dbg = () => page.evaluate((who) => { const t = window.__teachers[who]; return { ...t.animator.debug, y: t.rig.root.position.y, x: t.rig.root.position.x, z: t.rig.root.position.z, pointed: t.animator.pointed }; }, WHO);
const seen = new Set();
const note = (d) => { if (d.upper) { seen.add(d.upper); seen.add(d.lower); } };
const shot = (name) => page.screenshot({ path: `${OUT}${TAG}-glb-${name}.png` });
/** Wait until `pick(debug)` is truthy, polling; returns the last debug and whether it happened. */
async function until(pick, ms, shotAt = null, shotName = null) {
  const t0 = Date.now(); let shotDone = false, d = await dbg();
  while (Date.now() - t0 < ms) {
    d = await dbg(); note(d);
    if (shotAt !== null && !shotDone && Date.now() - t0 > shotAt) { shotDone = true; await shot(shotName); }
    if (pick(d)) return [d, true];
    await sleep(60);
  }
  return [d, false];
}

check("hook present", await page.evaluate(() => !!window.__ctl));
const info = await page.evaluate(() => window.__renderInfo?.());
console.log("render info (idle, one teacher in the lesson):", JSON.stringify(info));
if (EXPECT === "glb") {
  const tri = await page.evaluate((who) => { const g = window.__teachers[who].rig.skinned.geometry; return (g.index?.count ?? 0) / 3; }, WHO);
  console.log("character triangles:", tri);
  check("character triangle count is 15k-20k (not simplified)", tri > 15000 && tri < 20000, String(tri));
}

// ---------------------------------------------------------------- gestures
for (const g of ["wave", "nod", "thumbs_up", "shrug", "think", "open_hands"]) {
  const r = await call("gesture", { gesture: g });
  check(`gesture ${g}: accepted`, r.rej === 0 && r.stale === 0, JSON.stringify(r));
  const [, started] = await until((d) => d.gesture === g, 6000);
  check(`gesture ${g}: started`, started);
  await sleep(g === "wave" ? 700 : 500); await shot(`gesture-${g}`);
  const [d2, ended] = await until((d) => !d.gesture, 8000);
  check(`gesture ${g}: returned to idle`, ended && Math.abs(d2.y) < 0.06, `y=${d2.y?.toFixed(3)}`);
  await sleep(500);
}
// ---------------------------------------------------------------- acts (the classroom allows run, jump, eat, sit, clap)
const SEC = { run: 2.6, jump: 1.3, eat: 3.4, sit: 3.4, clap: 2.2 };
for (const a of Object.keys(SEC)) {
  const r = await call("act", { action: a });
  check(`act ${a}: accepted`, r.rej === 0 && r.stale === 0, JSON.stringify(r));
  let peak = 0;
  const t0 = Date.now(); let started = false, shotDone = false, d = await dbg();
  while (Date.now() - t0 < (SEC[a] * (RM ? 0.5 : 1) + 16) * 1000) {
    d = await dbg(); note(d); peak = Math.max(peak, d.y);
    if (d.action === a) started = true;
    if (started && !shotDone && Date.now() - t0 > SEC[a] * (a === "jump" ? 380 : 560)) { shotDone = true; await shot(`act-${a}`); }
    if (started && !d.action) break;
    await sleep(60);
  }
  check(`act ${a}: started`, started);
  check(`act ${a}: returned to idle`, d.action === null);
  if (a === "jump" && EXPECT === "glb") check("jump: " + (RM ? "small with reduced motion" : "visible"), RM ? peak < 0.2 : peak > 0.08, "peak " + peak.toFixed(2));
  // The crossfade back to idle takes a moment (and software rendering runs slowly): wait for the floor, do not guess a delay.
  [d] = await until((x) => Math.abs(x.y) < 0.06 && (EXPECT !== "glb" || (x.upper === "idle" && x.lower === "idle")), 6000);
  check(`act ${a}: back on the floor, layers back to idle`, Math.abs(d.y) < 0.06 && (EXPECT !== "glb" || (d.upper === "idle" && d.lower === "idle")), `y=${d.y.toFixed(3)} ${d.upper}/${d.lower}`);
}
// ---------------------------------------------------------------- walk to a spot
{
  const r = await call("moveTeacherTo", { spot: "board_side" });
  check("walk: accepted", r.rej === 0, JSON.stringify(r));
  const [, walking] = await until((d) => d.walking, 6000);
  check("walk: started", walking);
  await sleep(500); await shot("walk");
  if (EXPECT === "glb") { const d = await dbg(); check("walk: plays a locomotion clip", d.lower === "walk" || d.lower === "run", `${d.upper}/${d.lower}`); }
  const [d2, done] = await until((d) => !d.walking, 20000);
  check("walk: arrived and stopped", done && Math.hypot(d2.x + 1.35, d2.z + 1.75) < 0.2, `at ${d2.x.toFixed(2)},${d2.z.toFixed(2)}`);
  await sleep(700);
  const d3 = await dbg();
  check("walk: back to the idle clip, on the floor", Math.abs(d3.y) < 0.06 && (EXPECT !== "glb" || d3.lower === "idle"), `${d3.upper}/${d3.lower}`);
  await call("moveTeacherTo", { spot: "center" });
  await until((d) => !d.walking && Math.hypot(d.x + 0.15, d.z + 0.7) < 0.3, 20000);
}
// ---------------------------------------------------------------- point at the board
{
  const r = await call("pointAt", { target: "board" });
  check("pointAt: accepted", r.rej === 0, JSON.stringify(r));
  const [d, ok] = await until((x) => x.pointed === "board", 5000);
  check("pointAt: pointing at the board", ok, `pointing=${d.pointing} pointed=${d.pointed}`);
  await sleep(500); await shot("point");
  const [, ended] = await until((x) => !x.pointing, 8000);
  check("pointAt: ended", ended);
}
// ---------------------------------------------------------------- hostile ids, stale turn, interruption
for (const bad of ["swim", "climb", "fly", "__proto__", "https://evil.example/x.glb", "../../etc/passwd"]) {
  const r = await call("act", { action: bad });
  const d = await dbg();
  check(`act rejected: ${bad}`, r.rej === 1 && d.action === null, JSON.stringify(r));
}
for (const bad of ["backflip", "__proto__", "https://evil.example/x.glb"]) {
  const r = await call("gesture", { gesture: bad });
  const d = await dbg();
  check(`gesture rejected: ${bad}`, r.rej === 1 && d.gesture === null, JSON.stringify(r));
}
{
  const st = await call("act", { action: "jump" }, true);
  const d = await dbg();
  check("stale turn dropped", st.stale === 1 && d.action === null, JSON.stringify(st));
}
await call("act", { action: "sit" });
const [, sitting] = await until((d) => d.action === "sit", 4000);
check("sit running", sitting);
await page.evaluate(() => window.__ctl.sendText("hello"));
const [, stopped] = await until((d) => d.action === null, 3000);
check("a new child turn stops the act", stopped);
// ---------------------------------------------------------------- speaking / thinking pose (the scripted answer)
{
  const t0 = Date.now(); let state = "", shotDone = false;
  while (Date.now() - t0 < 14000) {
    state = await page.$eval('[data-testid="state"]', (e) => e.getAttribute("data-state")).catch(() => "");
    if (state === "speaking" && !shotDone) { shotDone = true; await sleep(700); await shot("speaking"); break; }
    await sleep(100);
  }
  console.log(shotDone ? "speaking shot taken" : "NOTE: never reached the speaking state in 14 s (headless voice); no speaking shot");
  const d = await dbg(); note(d);
  if (EXPECT === "glb") check("speaking: no mouth value is ever claimed", d.mouthOpen === 0);
}
// ---------------------------------------------------------------- clip names, cost, errors
if (EXPECT === "glb") {
  const bad = [...seen].filter((n) => !CLIPS.has(n));
  check("only shipped clip names were ever played", bad.length === 0, `seen=${[...seen].join(",")} bad=${bad.join(",")}`);
  const ri = await page.evaluate(() => window.__renderInfo?.());
  console.log("render info (end):", JSON.stringify(ri));
}
check("no page errors / CSP violations", errors.length === preErr, errors.slice(preErr, preErr + 5).join(" | "));
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
