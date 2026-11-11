// Tester-added adversarial browser run (DEMO mode only). Needs the built app on :3111.
// Usage: node scripts/break.mjs      Screenshots: scripts/out/b-*.png
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const TARGET = process.env.SMOKE_URL || "http://localhost:3111/";
const OUT = new URL("./out/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, detail = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${detail}`); };

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/status of (503|404)/.test(m.text())) errors.push(m.text()); });
const notFound = [];
page.on("response", (r) => { if (r.status() === 404) notFound.push(r.url()); });

const dbg = () => page.evaluate(() => {
  const t = window.__teacher;
  if (!t) return null;
  const w = (o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return [e[12], e[13], e[14]]; };
  const J = t.rig.joints;
  return {
    ...t.animator.debug, pointed: t.animator.pointed, x: t.rig.root.position.x, z: t.rig.root.position.z,
    state: document.querySelector('[data-testid="state"]')?.getAttribute("data-state") ?? "offline",
    shL: w(J.shoulderL), shR: w(J.shoulderR), hL: w(t.rig.handL), hR: w(t.rig.handR),
    caption: document.querySelector(".caption")?.textContent ?? "",
    stopVisible: !!document.querySelector('[data-testid="interrupt"]'),
  };
});
const waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(); if (d && fn(d)) return d; await sleep(40); } return null; };
const type = async (text) => { await page.type('[data-testid="text-input"]', text); await page.keyboard.press("Enter"); };
// Submit several messages from inside the page with a fixed gap, so the gap does not depend on test-driver speed.
const burst = (texts, gapMs) => page.evaluate(async (texts, gapMs) => {
  const input = document.querySelector('[data-testid="text-input"]');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  for (const t of texts) {
    set.call(input, t);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    document.querySelector("form.type").requestSubmit();
    await new Promise((r) => setTimeout(r, gapMs));
  }
}, texts, gapMs);
const aimError = (d, target) => {
  // angle between shoulder->hand and shoulder->target for whichever arm is closer to the target direction
  const ang = (s, h) => {
    const a = [h[0] - s[0], h[1] - s[1], h[2] - s[2]], b = [target[0] - s[0], target[1] - s[1], target[2] - s[2]];
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return (Math.acos(dot / (Math.hypot(...a) * Math.hypot(...b))) * 180) / Math.PI;
  };
  return Math.min(ang(d.shL, d.hL), ang(d.shR, d.hR));
};
// Object centres as used in tests/animator.test.ts (the live registry is not exposed to the page).
const GLOBE = [1.75, 1.07, -1.25], BOARD = [0.25, 1.72, -2.94];

await page.setViewport({ width: 1280, height: 720 });
await page.goto(TARGET, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas", { timeout: 20000 });
await sleep(1200);
await page.click('[data-testid="start"]');
await page.waitForSelector('[data-testid="demo-badge"]', { timeout: 8000 });

// 1. Stop during the greeting.
await waitFor((d) => d.state === "speaking");
await page.click('[data-testid="interrupt"]');
const g = await waitFor((d) => d.state === "idle" && d.mouthOpen < 0.02 && d.gesture === null, 1500);
check("Stop during greeting: state, mouth and wave all stop", !!g);

// 2. Pointing accuracy, no dev panel in the way.
await type("why is mars red?");
const p1 = await waitFor((d) => d.pointing === "mars_globe" && d.pointed === "mars_globe");
await sleep(900);
const p1b = await dbg();
await page.screenshot({ path: `${OUT}b-01-point-globe.png` });
const e1 = p1b ? aimError(p1b, GLOBE) : 999;
check("arm aims at the globe (<12 deg off)", !!p1 && e1 < 12, `error ${e1.toFixed(1)} deg`);

// 3. Stop during THINKING (before any audio), then wait: nothing from that turn may appear.
await waitFor((d) => d.state === "idle", 20000);
const x0 = (await dbg()).x;
await page.type('[data-testid="text-input"]', "tell me about mars");
// Submit and press Stop 250 ms later inside the page, so slow test polling cannot miss the 600 ms window.
const stopState = await page.evaluate(() => new Promise((res) => {
  document.querySelector("form.type").requestSubmit();
  setTimeout(() => {
    const st = document.querySelector('[data-testid="state"]').getAttribute("data-state");
    const b = document.querySelector('[data-testid="interrupt"]');
    b?.click();
    res({ st, clicked: !!b });
  }, 250);
}));
const leaks = new Set();
for (let i = 0; i < 40; i++) { const d = await dbg(); if (d.state !== "idle") leaks.add("state:" + d.state); if (d.walking) leaks.add("walking"); if (d.pointing) leaks.add("pointing"); if (d.gesture) leaks.add("gesture:" + d.gesture); if (d.mouthOpen > 0.02) leaks.add("mouth"); if (Math.abs(d.x - x0) > 0.02) leaks.add("moved"); await sleep(75); }
check("Stop during thinking: no walk, pointing, speech or mouth for 3 s", stopState.st === "thinking" && stopState.clicked && leaks.size === 0, JSON.stringify(stopState) + " leaks=" + [...leaks].join(","));
await page.screenshot({ path: `${OUT}b-02-after-stop-thinking.png` });

// 4. Stop then immediate input.
await type("hello");
const h = await waitFor((d) => d.gesture === "wave" && d.state !== "idle", 4000);
check("input straight after Stop gets its own reply (wave)", !!h);

// 5. Rapid typed inputs, 5 in under a second: only the last may act.
const xr = (await dbg()).x;
await burst(["tell me about mars", "books", "tell me about mars", "hello", "why is mars red?"], 100);
const seen = new Set(); let walked = false; const caps = new Set();
const tEnd = Date.now() + 7000;
while (Date.now() < tEnd) { const d = await dbg(); if (d.pointing) seen.add(d.pointing); if (d.gesture) seen.add(d.gesture); if (d.walking) walked = true; if (d.caption) caps.add(d.caption); await sleep(50); }
const xr2 = (await dbg()).x;
check("rapid input: teacher did not move", Math.abs(xr2 - xr) < 0.02, `x ${xr.toFixed(2)} -> ${xr2.toFixed(2)}`);
check("rapid input: only the last turn's action plays", seen.size === 1 && seen.has("mars_globe") && !walked, `saw ${[...seen].join(",") || "nothing"} walked=${walked}`);
check("rapid input: only the last turn's caption shows", caps.size === 1 && [...caps][0].includes("rusted"), `${caps.size} captions`);
await page.screenshot({ path: `${OUT}b-03-after-rapid.png` });

// 6. Typed barge-in while walking: the walk must stop where it is.
await waitFor((d) => d.state === "idle", 20000);
const xa = (await dbg()).x;
await burst(["tell me about mars", "hello"], 1100); // walk starts ~600 ms in; "hello" lands mid-walk
const wk = true;
await sleep(250);
const w1 = await dbg(); await sleep(1200); const w2 = await dbg();
check("typed barge-in mid-walk: walking stops part-way", !!wk && !w2.walking && Math.abs(w2.x - w1.x) < 0.05 && Math.abs(w2.x - xa) > 0.02 && w2.x > -1.3, `x ${xa.toFixed(2)} -> ${w1.x.toFixed(2)} -> ${w2.x.toFixed(2)}`);
await page.screenshot({ path: `${OUT}b-04-stranded-after-barge-in.png` });

// 7. Board pointing from the board spot + phone layout while speaking.
await waitFor((d) => d.state === "idle", 20000);
await type("tell me about mars");
const pb = await waitFor((d) => d.pointing === "board" && d.pointed === "board", 12000);
await sleep(700);
const pb2 = await dbg();
const e2 = pb2 ? aimError(pb2, BOARD) : 999;
check("arm aims at the board (<12 deg off)", !!pb && e2 < 12, `error ${e2.toFixed(1)} deg`);
await page.screenshot({ path: `${OUT}b-05-point-board.png` });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await sleep(900);
await page.screenshot({ path: `${OUT}b-06-phone-speaking.png` });
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
await sleep(900);
await page.screenshot({ path: `${OUT}b-07-phone-landscape.png` });
await page.setViewport({ width: 1280, height: 720 });

// 8. End mid-speech, wait, Start again.
await type("why is mars red?");
await waitFor((d) => d.state === "speaking", 5000);
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "End").click());
await sleep(300);
const off = await dbg();
check("End mid-speech: mouth shut, nothing pointing", off.mouthOpen < 0.02 && off.pointing === null && off.state === "offline", JSON.stringify({ m: off.mouthOpen, p: off.pointing, s: off.state }));
let ghost = false;
for (let i = 0; i < 30; i++) { const d = await dbg(); if (d.mouthOpen > 0.02 || d.pointing || d.gesture || d.walking) ghost = true; await sleep(100); }
check("after End: no ghost animation for 3 s", !ghost);
await page.screenshot({ path: `${OUT}b-08-after-end.png` });
await page.click('[data-testid="start"]');
const again = await waitFor((d) => d.state === "speaking" && d.gesture === "wave", 8000);
check("Start again after End: fresh greeting", !!again);
await sleep(600);
await page.screenshot({ path: `${OUT}b-09-restart.png` });

// 9. Double-click Start is harmless (after another End).
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "End").click());
await sleep(200);
await page.evaluate(() => { const b = document.querySelector('[data-testid="start"]'); b.click(); b.click(); b.click(); });
await waitFor((d) => d.state === "speaking", 8000);
await waitFor((d) => d.state === "idle", 20000);
const badges = await page.$$eval('[data-testid="demo-badge"]', (n) => n.length);
check("triple-click Start: one session, ends idle", badges === 1);

console.log("404s:", [...new Set(notFound)].join(", ") || "none");
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
console.log(`\n${fails ? fails + " FAILED" : "all passed"}`);
await browser.close();
process.exit(fails ? 1 : 0);
