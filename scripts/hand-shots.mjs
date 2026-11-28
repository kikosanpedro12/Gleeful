// Hand close-ups for the GLB teachers: idle, wave (landing and /learn), open_hands, pointAt. Writes a full frame and a zoomed crop of
// the hands + head for each pose, so a curled or broken hand is visible. Needs a TEST build (NEXT_PUBLIC_TEST_HOOKS=1).
//   ORIGIN=http://localhost:3555 PREFIX=after [W=390 H=844 TAG=p] [RM=1] node scripts/hand-shots.mjs
// Output: scripts/out/hands-<PREFIX>-<surface>-<teacher>-<pose>-<TAG>[-full].png. Software rendering: looks only, never fps.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const ORIGIN = process.env.ORIGIN || "http://localhost:3555";
const PREFIX = process.env.PREFIX || "after";
const OUT = fileURLToPath(new URL("./out/", import.meta.url)); fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720), TAG = process.env.TAG || "d";
const ONLY = process.env.SURFACE || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const written = [];

async function newPage() {
  const page = await browser.newPage();
  if (process.env.RM) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
  // Landing: the taste and voice calls are stubbed (no model or ElevenLabs spend), so the choose-a-tutor step shows.
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url());
    const json = (status, body) => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (u.pathname.startsWith("/audio/")) return r.respond({ status: 404, body: "" });
    if (u.pathname === "/api/taste") return json(200, r.method() === "GET" ? { available: true, maxTurns: 3, used: 0 } : { error: "stub" });
    if (u.pathname === "/api/voice") return json(200, { configured: false, public: false, landing: false });
    r.continue();
  });
  return page;
}
/** Screen box (CSS px) around both hands and the head of a teacher. */
const box = (page, who) => page.evaluate((who) => {
  const t = window.__teachers[who]; const st = t.rig.root.__r3f?.root?.getState?.(); if (!st) return null;
  const pts = [t.rig.bones.left.hand, t.rig.bones.right.hand, t.rig.bones.head, t.rig.bones.spine2];
  const r = st.gl.domElement.getBoundingClientRect();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const b of pts) {
    const v = b.getWorldPosition(new b.position.constructor()).project(st.camera);
    const x = r.left + ((v.x + 1) / 2) * r.width, y = r.top + ((1 - v.y) / 2) * r.height;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}, who);
async function shoot(page, who, surface, pose) {
  const base = `${OUT}hands-${PREFIX}-${surface}-${who}-${pose}-${TAG}`;
  await page.screenshot({ path: `${base}-full.png` });
  const b = await box(page, who);
  if (b) {
    const pad = 70, size = Math.max(240, b.x1 - b.x0 + 2 * pad, b.y1 - b.y0 + 2 * pad);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const x = Math.max(0, Math.min(W - size, cx - size / 2)), y = Math.max(0, Math.min(H - size, cy - size / 2));
    await page.screenshot({ path: `${base}.png`, clip: { x, y, width: Math.min(size, W), height: Math.min(size, H), scale: 2 } });
    written.push(`${base}.png`);
  }
  written.push(`${base}-full.png`);
}
const until = async (page, who, pick, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate((who, pick) => !!new Function("d", "return " + pick)(window.__teachers[who].animator.debug), who, pick)) return true; await sleep(50); }
  return false;
};
const call = (page, name, args) => page.evaluate((name, args) => {
  const c = window.__ctl; const id = "r" + Math.random(); c.responseTurn.set(id, c.s.conv.turnId);
  c.events.onToolCall(id, "c" + Math.random(), name, JSON.stringify(args));
}, name, args);

for (const who of ["leo", "mia"]) {
  // ---- landing: choose the tutor, the tutor waves
  if (!ONLY || ONLY === "landing") {
    const page = await newPage();
    await page.goto(`${ORIGIN}/?test=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="choose-teacher"]', { timeout: 30000 });
    await page.waitForFunction((w) => !!window.__teachers?.[w], { timeout: 40000 }, who);
    await sleep(1500);
    await shoot(page, who, "landing", "idle");
    await page.click(`[data-testid="pick-${who}"]`);
    if (!process.env.RM) {
      const ok = await until(page, who, 'd.gesture === "wave"', 8000);
      console.log(`landing ${who}: wave started=${ok}`);
      await sleep(650); await shoot(page, who, "landing", "wave");
    }
    await page.close();
  }
  // ---- /learn: idle, wave, open_hands, pointAt
  if (!ONLY || ONLY === "learn") {
    const page = await newPage();
    await page.goto(`${ORIGIN}/learn?test=1&rig=glb`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForFunction((w) => !!window.__teachers?.[w], { timeout: 40000 }, who);
    await sleep(1500);
    await page.click(`[data-testid="pick-${who}"]`); await sleep(300);
    await page.click('[data-testid="start"]');
    await page.waitForSelector('[data-testid="demo-badge"]', { timeout: 20000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle", { timeout: 30000 });
    await sleep(800);
    await shoot(page, who, "learn", "idle");
    for (const g of ["wave", "open_hands"]) {
      await call(page, "gesture", { gesture: g });
      const ok = await until(page, who, `d.gesture === "${g}"`, 6000);
      await sleep(g === "wave" ? 700 : 600); await shoot(page, who, "learn", g);
      console.log(`learn ${who}: ${g} started=${ok}`);
      await until(page, who, "!d.gesture", 8000); await sleep(500);
    }
    await call(page, "pointAt", { target: "board" });
    const ok = await until(page, who, 'd.pointing === "board"', 5000);
    await sleep(900); await shoot(page, who, "learn", "point");
    console.log(`learn ${who}: pointAt started=${ok}`);
    await page.close();
  }
}
await browser.close();
console.log(written.join("\n"));
