// Tester checks for round 2: facing after pointAt, no .glb with the rig off, loading line while GLBs are delayed, floor.
// SMOKE_BASE=http://localhost:3222 [W= H=] node scripts/verify-round2.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.SMOKE_BASE || "http://localhost:3222";
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (n, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
async function open(qs, delayMs = 0) {
  const page = await browser.newPage(); const glbReqs = [];
  await page.setViewport({ width: W, height: H });
  await page.setRequestInterception(true);
  page.on("request", (r) => { if (/\.glb(\?|$)/.test(r.url())) { glbReqs.push(r.url()); if (delayMs) return void setTimeout(() => r.continue().catch(() => {}), delayMs); } r.continue().catch(() => {}); });
  await page.goto(`${BASE}/learn?test=1${qs}`, { waitUntil: "domcontentloaded" });
  return { page, glbReqs };
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// 1. rig OFF (rig=procedural, also sticky on the next page): no .glb; the default (no param) now loads GLB
for (const qs of ["&rig=procedural"]) {
  const { page, glbReqs } = await open(qs);
  await page.waitForFunction(() => !!window.__teachers?.leo, { timeout: 40000 });
  await sleep(2500);
  check(`rig off (${qs}): no .glb requested, procedural rig`, glbReqs.length === 0 && !(await page.evaluate(() => window.__teachers.leo.rig.glb)), JSON.stringify(glbReqs));
  await page.close();
}
// 2. loading line while GLBs delayed
{
  const { page } = await open("&rig=glb", 6000);
  const txt = () => page.evaluate(() => document.body.innerText + "|" + [...document.querySelectorAll("[aria-live]")].map((e) => e.textContent).join("~"));
  await page.waitForSelector("canvas", { timeout: 30000 });
  let seen = false; for (let i = 0; i < 30 && !seen; i++) { seen = /Getting your teacher ready/.test(await txt()); if (!seen) await sleep(200); }
  check("loading line appears while GLBs are delayed (6 s)", seen);
  await page.screenshot({ path: `/tmp/tr/loading-${W}.png` });
  await page.waitForFunction(() => window.__teachers?.leo?.rig?.glb, { timeout: 60000 }).catch(() => {});
  await sleep(1500);
  check("loading line gone after load", !/Getting your teacher ready/.test(await txt()));
  await page.close();
}
// 3. pointAt leaves the teacher facing the child, and on the floor
for (const qs of ["&rig=glb", "&rig=procedural"]) for (const who of ["leo", "mia"]) {
  const { page } = await open(qs);
  await page.waitForFunction(() => !!window.__teachers?.leo, { timeout: 40000 });
  await page.waitForSelector('[data-testid="pick-leo"]', { timeout: 30000 });
  await page.click(`[data-testid="pick-${who}"]`); await sleep(300); await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-testid="demo-badge"]', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle", { timeout: 30000 });
  await sleep(2500);
  const st = () => page.evaluate((w) => { const t = window.__teachers[w]; return { yaw: t.rig.root.rotation.y, y: t.rig.root.position.y, pointing: t.animator.debug.pointing, pointed: t.animator.pointed }; }, who);
  const call = (n, a) => page.evaluate((n, a) => { const c = window.__ctl; const id = "r" + Math.random(); c.responseTurn.set(id, c.s.conv.turnId); c.events.onToolCall(id, "c" + Math.random(), n, JSON.stringify(a)); }, n, a);
  const base = (await st()).yaw;
  for (const target of ["board", "mars_globe", "bookshelf"]) {
    await call("pointAt", { target });
    let s; for (let i = 0; i < 60; i++) { s = await st(); if (s.pointed === target) break; await sleep(100); }
    const got = s.pointed === target;
    for (let i = 0; i < 100; i++) { s = await st(); if (!s.pointing) break; await sleep(100); }
    let d = 9; for (let i = 0; i < 80; i++) { s = await st(); d = Math.abs(wrap(s.yaw - base)); if (d < 0.05) break; await sleep(100); }
    check(`${qs} ${who} pointAt ${target}: reached=${got}, facing child again (yaw ${s.yaw.toFixed(2)} vs ${base.toFixed(2)}), y=${s.y.toFixed(3)}`, got && d < 0.12 && Math.abs(s.y) < 0.06);
  }
  await page.close();
}
await browser.close(); console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
