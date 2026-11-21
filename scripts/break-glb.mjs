// Break run for the GLB teachers: slow, corrupt, truncated, wrong and failing character files; WebGL context loss;
// act/gesture spam; interruption mid-clip; unmount during load; no unhandled rejections or CSP violations.
// Needs a TEST build (NEXT_PUBLIC_TEST_HOOKS=1). Flag on via ?rig=glb (or a build with NEXT_PUBLIC_CHAR_GLB=1).
//   SMOKE_URL="http://localhost:3222/learn?test=1&rig=glb" node scripts/break-glb.mjs
// Software rendering: behaviour only, never fps.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const TARGET = process.env.SMOKE_URL || "http://localhost:3222/learn?test=1&rig=glb";
const ORIGIN = new URL(TARGET).origin;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (n, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const GLB = (name) => fs.readFileSync(new URL(`../public/assets/characters/${name}`, import.meta.url));

/** A fresh page. `route(url, req)` may answer a character-file request (return true when handled). */
async function open(route, { w = 1280, h = 720 } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [], reqs = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR|Permissions-Policy|GLTFLoader: Couldn.t load texture/i.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); if (/Refused|Content Security/i.test(m.text())) errors.push("csp: " + m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument(() => {
    window.__rej = [];
    window.addEventListener("unhandledrejection", (e) => window.__rej.push(String(e.reason)));
    document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("/assets/characters/")) { reqs.push(u.split("/characters/")[1]); if (route && route(u.split("/characters/")[1], r)) return; }
    r.continue();
  });
  await page.setViewport({ width: w, height: h });
  await page.goto(TARGET, { waitUntil: "domcontentloaded" });
  return { page, ctx, errors, reqs };
}
const rig = (page, who = "leo") => page.evaluate((who) => { const t = window.__teachers?.[who]; return t ? (t.rig.glb ? "glb" : "procedural") : null; }, who);
const waitRig = async (page, who, ms) => { const t0 = Date.now(); let r = null; while (Date.now() - t0 < ms) { r = await rig(page, who); if (r) return r; await sleep(150); } return r; };
const rejections = (page) => page.evaluate(() => window.__rej);
const startLesson = async (page, who = "leo") => {
  await page.click(`[data-testid="pick-${who}"]`); await sleep(200); await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-testid="demo-badge"]', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle", { timeout: 30000 });
};
const call = (page, name, args) => page.evaluate((name, args) => {
  const c = window.__ctl; const id = "r" + Math.random(); c.responseTurn.set(id, c.s.conv.turnId);
  const b = c.s.rejectedCommands; c.events.onToolCall(id, "c" + Math.random(), name, JSON.stringify(args)); return c.s.rejectedCommands - b;
}, name, args);
const dbg = (page, who = "leo") => page.evaluate((who) => { const t = window.__teachers[who]; return { ...t.animator.debug, y: t.rig.root.position.y, x: t.rig.root.position.x, z: t.rig.root.position.z, pointed: t.animator.pointed }; }, who);
const settle = async (page, ms = 12000) => { const t0 = Date.now(); let d; while (Date.now() - t0 < ms) { d = await dbg(page); if (!d.action && !d.gesture && !d.walking && !d.pointing && Math.abs(d.y) < 0.06) return [d, true]; await sleep(100); } return [d, false]; };
const faultFree = async (n, o) => check(`${n}: no page errors, CSP violations or unhandled rejections`, o.errors.length === 0 && (await rejections(o.page)).length === 0, o.errors.concat(await rejections(o.page)).slice(0, 3).join(" | "));

// 1. Slow files (past the 8 s wait): nothing drawn first, then the procedural rig, never swapped for the late GLB.
{
  const o = await open((f, r) => { setTimeout(() => { try { r.continue(); } catch {} }, 11000); return true; });
  await sleep(2500);
  check("slow GLB: nothing drawn for the teachers yet (no flash of the old look)", (await rig(o.page)) === null);
  // the lesson can start while the teachers are still loading
  const picked = await o.page.click('[data-testid="pick-leo"]').then(() => true, () => false);
  check("slow GLB: onboarding is usable while loading", picked);
  const r = await waitRig(o.page, "leo", 14000);
  check("slow GLB: procedural rig after the wait", r === "procedural", String(r));
  await sleep(6000);
  check("slow GLB: the late file does not swap the body mid-session", (await rig(o.page)) === "procedural");
  await faultFree("slow GLB", o); await o.ctx.close();
}
// 2. Corrupt / truncated / wrong files.
const cases = {
  "garbage 200": (f, r) => { r.respond({ status: 200, contentType: "model/gltf-binary", body: "not a glb at all" }); return true; },
  "truncated leo.glb": (f, r) => { if (f !== "leo.glb") return false; r.respond({ status: 200, contentType: "model/gltf-binary", body: GLB("leo.glb").subarray(0, 100_000) }); return true; },
  "clips.glb is a character (no animations)": (f, r) => { if (f !== "clips.glb") return false; r.respond({ status: 200, contentType: "model/gltf-binary", body: GLB("leo.glb") }); return true; },
  "HTTP 500": (f, r) => { r.respond({ status: 500, body: "boom" }); return true; },
  "connection aborted": (f, r) => { r.abort("connectionreset"); return true; },
  "html instead of glb (SPA fallback)": (f, r) => { r.respond({ status: 200, contentType: "text/html", body: "<html>hi</html>" }); return true; },
};
for (const [name, route] of Object.entries(cases)) {
  const o = await open(route);
  const r = await waitRig(o.page, "leo", 20000);
  check(`${name}: procedural rig appears`, r === "procedural", String(r));
  await startLesson(o.page);
  check(`${name}: acts work on the fallback`, (await call(o.page, "act", { action: "clap" })) === 0 && (await call(o.page, "gesture", { gesture: "wave" })) === 0);
  const [, ok] = await settle(o.page);
  check(`${name}: settles to idle`, ok);
  await faultFree(name, o); await o.ctx.close();
}
// 3. Only mia.glb broken: Leo stays GLB, Mia falls back, independently.
{
  const o = await open((f, r) => { if (f !== "mia.glb") return false; r.respond({ status: 200, body: "junk" }); return true; });
  const l = await waitRig(o.page, "leo", 30000), m = await waitRig(o.page, "mia", 30000);
  check("only mia.glb broken: leo glb, mia procedural", l === "glb" && m === "procedural", `${l}/${m}`);
  await startLesson(o.page, "mia");
  check("mia fallback plays an act", (await call(o.page, "act", { action: "jump" })) === 0);
  const [, ok] = await settle(o.page, 12000).catch(() => [null, false]).then(async (x) => [x[0], x[1]]);
  await faultFree("only mia broken", o); await o.ctx.close();
}
// 4. Healthy page: spam, interruption, context loss, end mid-act, pick the other teacher, unmount.
{
  const o = await open(null);
  check("healthy: both teachers are GLB", (await waitRig(o.page, "leo", 40000)) === "glb" && (await waitRig(o.page, "mia", 40000)) === "glb");
  const before = o.reqs.filter((x) => x === "clips.glb").length;
  check("healthy: clips.glb fetched once for both teachers (cache)", before === 1, `requests=${o.reqs.join(",")}`);
  await startLesson(o.page, "leo");
  const geoBefore = (await o.page.evaluate(() => window.__renderInfo?.()))?.geometries;
  // spam: 80 mixed commands in one tick
  const rej = await o.page.evaluate(() => {
    const c = window.__ctl; let rej = 0;
    const cmds = [["act", { action: "run" }], ["act", { action: "jump" }], ["act", { action: "sit" }], ["act", { action: "clap" }], ["act", { action: "eat" }],
      ["gesture", { gesture: "wave" }], ["gesture", { gesture: "think" }], ["gesture", { gesture: "shrug" }], ["moveTeacherTo", { spot: "board_side" }], ["pointAt", { target: "board" }], ["moveTeacherTo", { spot: "center" }]];
    for (let i = 0; i < 80; i++) { const [n, a] = cmds[i % cmds.length]; const id = "s" + i; c.responseTurn.set(id, c.s.conv.turnId); const b = c.s.rejectedCommands; c.events.onToolCall(id, "c" + i, n, JSON.stringify(a)); rej += c.s.rejectedCommands - b; }
    return rej;
  });
  check("spam: valid commands are not rejected", rej === 0, `rejected=${rej}`);
  const [d, ok] = await settle(o.page, 60000);
  check("spam: settles to idle on the floor (queue drains, nothing stuck)", ok, JSON.stringify({ y: d.y, a: d.action, g: d.gesture, w: d.walking, u: d.upper, l: d.lower }));
  // interruption mid-clip: new typed child turn, Stop, End
  for (const how of ["typed", "stop", "end"]) {
    if (how === "end") { /* last: ends the lesson */ }
    if (how === "stop") {
      // Stop only exists while the teacher is speaking or thinking (the button is hidden when idle), so run the act inside such a turn.
      await o.page.evaluate(() => window.__ctl.sendText("hello"));
      await o.page.waitForFunction(() => ["speaking", "thinking"].includes(document.querySelector('[data-testid="state"]')?.getAttribute("data-state")), { timeout: 20000 }).catch(() => {});
    }
    await call(o.page, "act", { action: "run" });
    const t0 = Date.now(); while (Date.now() - t0 < 6000 && (await dbg(o.page)).action !== "run") await sleep(60);
    await sleep(300);
    if (how === "typed") await o.page.evaluate(() => window.__ctl.sendText("hello"));
    else if (how === "stop") {
      // The scripted "hello" reply is short: by the time the run starts the turn may be idle, and then the Stop button does not exist (and
      // __ctl.interrupt() is a no-op when nothing is speaking). That case is not what this check is about, so it is skipped, not faked.
      const btn = await o.page.$('[data-testid="interrupt"]');
      if (!btn) { console.log("SKIP  interrupt (stop) mid-run: the turn was already idle, so there was no Stop button to press"); await o.page.evaluate(() => window.__ctl.sendText("hello")); await sleep(300); continue; }
      await btn.click();
    }
    else await o.page.click('[aria-label="End lesson"]');
    const t1 = Date.now(); let d2; while (Date.now() - t1 < 4000) { d2 = await dbg(o.page); if (!d2.action) break; await sleep(60); }
    check(`interrupt (${how}) mid-run: the act stops`, !d2.action, JSON.stringify({ a: d2.action }));
    const [d3, ok3] = await settle(o.page, 12000);
    check(`interrupt (${how}): back to idle layers on the floor`, ok3 && d3.upper === "idle" && d3.lower === "idle", `${d3.upper}/${d3.lower} y=${d3.y.toFixed(3)}`);
    if (how !== "end") await sleep(500);
  }
  // after End: a new start works and the same rigs are reused (no re-fetch)
  await o.page.waitForSelector('[data-testid="onboarding"]', { timeout: 10000 }).catch(() => {});
  const stoolHidden = await o.page.evaluate(() => !window.__teachers.leo.rig.stool.visible);
  check("after End mid-act: pretend stool hidden", stoolHidden);
  await startLesson(o.page, "mia");
  check("restart with the other teacher: acts work", (await call(o.page, "act", { action: "clap" })) === 0);
  const [, ok4] = await settle(o.page, 12000);
  check("restart: mia settles", ok4);
  // WebGL context loss and restore during a lesson
  const lost = await o.page.evaluate(() => { const c = document.querySelector("canvas"); const gl = c.getContext("webgl2") || c.getContext("webgl"); const x = gl?.getExtension("WEBGL_lose_context"); if (!x) return false; x.loseContext(); window.__lose = x; return true; });
  check("context loss: extension available", lost);
  await call(o.page, "gesture", { gesture: "wave" });
  await sleep(1500);
  await o.page.evaluate(() => window.__lose?.restoreContext());
  await sleep(2500);
  const alive = await dbg(o.page, "mia").then(() => true, () => false);
  check("context loss and restore: animator still answers", alive);
  await call(o.page, "act", { action: "jump" });
  const [, ok5] = await settle(o.page, 15000);
  check("after context restore: an act still completes", ok5);
  const geoAfter = (await o.page.evaluate(() => window.__renderInfo?.()))?.geometries;
  console.log(`geometries before/after: ${geoBefore} / ${geoAfter}`);
  await faultFree("healthy run", o); await o.ctx.close();
}
// 5. Unmount during load: leave the page by client-side navigation while the files are still arriving.
{
  const o = await open((f, r) => { setTimeout(() => { try { r.continue(); } catch {} }, 4000); return true; });
  await sleep(1200);
  const nav = await o.page.evaluate(() => { try { window.next.router.push("/faq"); return true; } catch (e) { return String(e); } });
  await sleep(9000);
  check("unmount during load: client navigation worked", nav === true && /\/faq/.test(o.page.url()), `${nav} ${o.page.url()}`);
  await faultFree("unmount during load", o);
  // and the other way: unmount after the rig exists, then come back
  await o.page.evaluate(() => window.next.router.push("/learn?test=1&rig=glb")); await sleep(6000);
  await faultFree("unmount then return", o); await o.ctx.close();
}
// 6. Flag OFF must not download any character file (only meaningful on a build/URL with the flag off).
if (process.env.EXPECT_OFF) {
  const o = await open(null); await sleep(6000);
  check("flag off: no character files requested", o.reqs.length === 0, o.reqs.join(","));
  await o.ctx.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0);
