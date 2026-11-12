// Full Mars journey in headless Chrome (scripted mode). Usage: server on :3111, then `node scripts/journey.mjs`.
// Software rendering (~5-10 fps): this checks behaviour and takes screenshots; it says nothing about device fps.
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const TARGET = process.env.SMOKE_URL || "http://localhost:3111/";
const OUT = new URL("./out/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720), TAG = process.env.TAG || "d";
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
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
if (process.env.RM) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);

const st = () => page.evaluate(() => {
  const el = document.querySelector('[data-testid="state"]');
  const t = window.__teacher?.animator;
  return {
    state: el?.getAttribute("data-state"), world: el?.getAttribute("data-world"), transit: el?.getAttribute("data-transit") === "1",
    walking: t?.debug.walking, pointing: t?.debug.pointing, gesture: t?.debug.gesture, mouth: t?.debug.mouthOpen ?? 0,
    helmet: window.__teacher?.rig?.helmet.visible, fx: window.__fx ? { ...window.__fx } : null,
    choices: [...document.querySelectorAll('[data-testid^="choice-"]')].map((b) => b.getAttribute("data-testid").slice(7)),
    question: !!document.querySelector('[data-testid="question"]'),
    inspect: !!document.querySelector('[data-testid="inspect"]'),
    tag: document.getElementById("tap-tag")?.style.display === "block",
  };
});
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await st(); if (fn(d)) return d; await sleep(80); } return null; };
const shot = (n) => page.screenshot({ path: `${OUT}${TAG}-${n}.png` });
const click = (sel) => page.click(sel);

await page.goto(TARGET, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas", { timeout: 30000 });
await sleep(2500);
await shot("01-onboarding");
check("onboarding shows both teachers to choose", !!(await page.$('[data-testid="pick-leo"]')) && !!(await page.$('[data-testid="pick-mia"]')));
await click('[data-testid="pick-mia"]');
await sleep(900);
const prev = await page.evaluate(() => window.__teachers?.mia?.animator.debug.gesture);
check("tapping Mia previews her (wave)", prev === "wave", `(gesture=${prev})`);
await shot("02-preview-mia");
await click('[data-testid="pick-leo"]');
await sleep(400);
await click('[data-testid="start"]');
await page.waitForSelector('[data-testid="demo-badge"]', { timeout: 10000 });
check("scripted mode labelled on screen", true);
const g = await waitFor((d) => d.state === "speaking");
check("Leo greets", !!g);
await waitFor((d) => d.mouth > 0.2, 5000).then((d) => check("mouth moves while speaking", !!d));
const c1 = await waitFor((d) => d.choices.includes("mars") && d.state === "idle", 20000);
check("greeting offers a Mars choice", !!c1);
await shot("03-classroom-choice");

await click('[data-testid="choice-mars"]');
const tr = await waitFor((d) => d.transit, 15000);
check("choosing Mars starts the trip", !!tr);
const RM = !!process.env.RM;
const open = RM ? true : await waitFor((d) => d.fx && d.fx.open > 0.6, 8000);
check(RM ? "reduced motion: no wall animation" : "classroom walls open", !!open);
if (RM) { const sawOpen = await waitFor((d) => d.fx && d.fx.open > 0.05, 2500); check("reduced motion: walls never move", !sawOpen); }
await shot("04-walls-open");
if (!RM) {
  const space = await waitFor((d) => d.fx && d.fx.approach > 0.35, 12000);
  check("flying through space toward the planet", !!space, space ? `(helmet=${space.helmet})` : "");
  check("helmet on in space", !!space?.helmet);
  await shot("05-space");
  await waitFor((d) => d.fx && d.fx.approach > 0.75, 10000);
  await shot("06-approach");
}
const arrived = await waitFor((d) => d.world === "mars" && !d.transit, 15000);
check("arrived on Mars", !!arrived);
check("simulation label visible on Mars", !!(await page.$('[data-testid="sim-badge"]')));
await sleep(1200);
await shot("07-mars-arrival");
const c2 = await waitFor((d) => d.choices.includes("red") && d.state === "idle", 25000);
check("Mars arrival offers 'why red'", !!c2);

await click('[data-testid="choice-red"]');
const walkRock = await waitFor((d) => d.walking || d.pointing === "rock_1", 10000);
check("Leo goes to the rock", !!walkRock);
const inv = await waitFor((d) => d.tag && d.state === "idle", 20000);
check("rock invites a tap (tag shown)", !!inv);
await shot("08-invite-tap");

// Tap the rock where it is on screen.
const rp = await page.evaluate(() => window.__project("rock_1"));
check("rock is on screen", !!rp && rp.x > 0 && rp.x < W && rp.y > 0 && rp.y < H, rp ? `(${rp.x|0},${rp.y|0})` : "");
if (rp) await page.mouse.click(rp.x, rp.y);
const insp = await waitFor((d) => d.inspect, 5000);
check("tapping the rock picks it up for inspection", !!insp);
await sleep(1500);
// Drag to spin
const rp2 = await page.evaluate(() => window.__project("rock_1"));
if (rp2) { await page.mouse.move(rp2.x, rp2.y); await page.mouse.down(); await page.mouse.move(rp2.x + 120, rp2.y, { steps: 6 }); await page.mouse.up(); }
await shot("09-inspect-rock");
const q = await waitFor((d) => d.question && d.state === "idle", 25000);
check("tap changes the lesson: a question is asked", !!q);
await shot("10-question");

await click('[data-testid="answer-hot"]');
const hint = await waitFor((d) => d.question && d.state === "idle", 25000);
check("wrong answer → hint, asked again", !!hint);
await click('[data-testid="answer-rust"]');
const next = await waitFor((d) => d.choices.includes("crater") && d.state === "idle", 25000);
check("right answer → choose next stop", !!next);
await shot("11-choose-next");

// Interrupt test: choose crater, then stop mid-walk.
await click('[data-testid="choice-crater"]');
await waitFor((d) => d.state === "speaking", 8000);
await sleep(600);
const ib = await page.$('[data-testid="interrupt"]');
if (ib) await ib.click();
const stopped = await waitFor((d) => d.state === "idle" && d.mouth < 0.02 && !d.walking && !d.pointing, 3000);
check("Stop mid-walk: speech, mouth and walking all stop", !!stopped);
// Ask again properly.
const choicesNow = (await st()).choices;
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("⌨")); b?.click(); });
await page.waitForSelector('[data-testid="text-input"]', { timeout: 3000 });
await page.type('[data-testid="text-input"]', "let's see the crater");
await page.keyboard.press("Enter");
const atCrater = await waitFor((d) => d.pointing === "crater", 25000);
check("typed request → walks to crater and points", !!atCrater, `(choices before: ${choicesNow.join(",")})`);
await sleep(800);
await shot("12-crater");

const back = await waitFor((d) => d.choices.includes("back") && d.state === "idle", 25000);
check("offers back to class", !!back);
await click('[data-testid="choice-back"]');
const home = await waitFor((d) => d.world === "classroom" && !d.transit, 20000);
check("back in the classroom", !!home);
const recall = await waitFor((d) => d.question && d.state === "idle", 25000);
check("later unassisted check asked back in class", !!recall);
await shot("13-recall");
await click('[data-testid="answer-rust"]');
await waitFor((d) => d.state === "idle" && !d.question, 25000);

// Parent page shows honest evidence.
await page.goto(TARGET.replace(/\/?$/, "/parent"), { waitUntil: "domcontentloaded" });
await sleep(1500);
const parent = await page.evaluate(() => document.body.innerText);
check("parent view shows independent later check", /on their own later/i.test(parent));
check("parent view says it was with a hint during the lesson", /1 hint/.test(parent));
await page.screenshot({ path: `${OUT}${TAG}-14-parent.png`, fullPage: true });

const real = errors.filter((e) => !/favicon|404/.test(e));
check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));
await browser.close();
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
