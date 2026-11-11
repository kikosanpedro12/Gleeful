// End-to-end smoke test in headless Chrome against a running server.
// Usage: npm run build && npm start -- -p 3111 &  then  npm run smoke
// Exercises DEMO mode only (no credentials): start, greeting, typed turns,
// scene commands, walking, pointing, interruption. Software-rendered, so the
// fps it prints says nothing about real devices.
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const TARGET = process.env.SMOKE_URL || "http://localhost:3111/?dev=1";
const OUT = new URL("./out/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${detail}`); };

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const view = async (w, h, name) => { await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 }); await sleep(900); await page.screenshot({ path: `${OUT}${name}.png` }); };
const dbg = () => page.evaluate(() => {
  const t = window.__teacher;
  const st = document.querySelector('[data-testid="state"]')?.getAttribute("data-state");
  return t ? { ...t.animator.debug, pointed: t.animator.pointed, x: t.rig.root.position.x, z: t.rig.root.position.z, state: st } : null;
});
const waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await dbg(); if (d && fn(d)) return d; await sleep(60); } return null; };
const type = async (text) => { await page.type('[data-testid="text-input"]', text); await page.keyboard.press("Enter"); };

await page.setViewport({ width: 1280, height: 720 });
await page.goto(TARGET, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas", { timeout: 20000 });
await sleep(1500);
await view(1280, 720, "01-start-desktop");
await view(390, 844, "02-start-phone");
await page.setViewport({ width: 1280, height: 720 });

await page.click('[data-testid="start"]');
await page.waitForSelector('[data-testid="demo-badge"]', { timeout: 8000 });
check("demo mode is labelled on screen", true);
const greet = await waitFor((d) => d.state === "speaking" && d.gesture === "wave");
check("greeting: speaking + wave gesture", !!greet);
await sleep(500);
await page.screenshot({ path: `${OUT}03-greeting-wave.png` });
const open = await waitFor((d) => d.mouthOpen > 0.2, 4000);
check("mouth moves while speaking", !!open, open ? `(open=${open.mouthOpen.toFixed(2)})` : "");
await waitFor((d) => d.state === "idle", 15000);

// Mic is denied in headless -> typed fallback must be offered automatically.
check("typed fallback visible when mic unavailable", !!(await page.$('[data-testid="text-input"]')));

await type("why is mars red?");
const think = await waitFor((d) => d.state === "thinking", 2000);
check("thinking state after input", !!think);
const point = await waitFor((d) => d.pointing === "mars_globe" && d.pointed === "mars_globe");
check("scene command: points at the Mars globe", !!point);
await sleep(500);
await page.screenshot({ path: `${OUT}04-pointing-globe.png` });

// Interrupt mid-answer.
await page.click('[data-testid="interrupt"]');
const t0 = Date.now();
const cut = await waitFor((d) => d.state === "idle" && d.mouthOpen < 0.02 && d.pointing === null, 1500);
check("interrupt: speech state, mouth and pointing all stop", !!cut, cut ? `(${Date.now() - t0} ms incl. polling)` : "");
await page.screenshot({ path: `${OUT}05-after-interrupt.png` });

const before = await dbg();
await type("tell me about mars");
const walk = await waitFor((d) => d.walking);
check("teacher walks (legs + root move)", !!walk);
const arrived = await waitFor((d) => !d.walking && Math.abs(d.x - before.x) > 0.8, 9000);
check("teacher arrives at the board", !!arrived, arrived ? `(x ${before.x.toFixed(2)} -> ${arrived.x.toFixed(2)})` : "");
const board = await waitFor((d) => d.pointing === "board", 5000);
check("points at the board after walking", !!board);
await sleep(600);
await page.screenshot({ path: `${OUT}06-at-board.png` });

// Barge-in by typing while the teacher is talking: old reply must not continue.
await type("hello");
const wave2 = await waitFor((d) => d.gesture === "wave" && d.pointing === null, 5000);
check("new turn replaces the old one (no stale pointing)", !!wave2);
await waitFor((d) => d.state === "idle", 15000);
await view(390, 844, "07-phone-session");

const dev = await page.$eval('[data-testid="dev"]', (e) => e.innerText);
fs.writeFileSync(`${OUT}dev-panel.txt`, dev);
console.log("\n--- dev panel ---\n" + dev);
const real = errors.filter((e) => !/favicon|404|503/.test(e));
check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));
await browser.close();
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
