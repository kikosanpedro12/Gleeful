// Tester adversarial browser run for the world/scripted-brain flow (DEMO mode only, TTS silent in headless).
// Needs the built app (build:test). Usage: SMOKE_URL=http://localhost:3112/learn?test=1 node scripts/break.mjs   Screenshots: scripts/out/b-*.png
// Software rendering (~5-10 fps): behaviour only, no performance claims.
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const TARGET = process.env.SMOKE_URL || "http://localhost:3111/learn?test=1";
const OUT = new URL("./out/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
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
page.on("console", (m) => { if (m.type() === "error" && !/favicon|404/.test(m.text())) errors.push(m.text()); });
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

const st = () => page.evaluate(() => {
  const el = document.querySelector('[data-testid="state"]');
  const t = window.__teacher;
  const tp = t?.rig ? (() => { const p = t.rig.root.position; return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }; })() : null;
  return {
    state: el?.getAttribute("data-state") ?? "offline", world: el?.getAttribute("data-world"), transit: el?.getAttribute("data-transit") === "1",
    walking: t?.animator?.debug.walking, pointing: t?.animator?.debug.pointing, mouth: t?.animator?.debug.mouthOpen ?? 0,
    pos: tp, fx: window.__fx ? { open: +window.__fx.open.toFixed(2), space: +window.__fx.space.toFixed(2), shown: window.__fx.shown } : null,
    choices: [...document.querySelectorAll('[data-testid^="choice-"]')].map((b) => b.getAttribute("data-testid").slice(7)),
    question: !!document.querySelector('[data-testid="question"]'),
    inspect: !!document.querySelector('[data-testid="inspect"]'),
    onboarding: !!document.querySelector('[data-testid="onboarding"]'),
    caption: document.querySelector('[data-testid="caption"]')?.textContent ?? "",
  };
});
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await st(); if (fn(d)) return d; await sleep(80); } return null; };
const shot = (n) => page.screenshot({ path: `${OUT}b-${n}.png` });
const openKeyboard = () => page.evaluate(() => { if (!document.querySelector('[data-testid="text-input"]')) [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("⌨"))?.click(); });
const type = async (t) => { await openKeyboard(); await page.waitForSelector('[data-testid="text-input"]'); await page.type('[data-testid="text-input"]', t); await page.keyboard.press("Enter"); };
const words = () => page.evaluate(() => [...document.querySelectorAll(".words p")].map((p) => p.textContent));
const toggleWords = () => page.click('button[aria-label="Show words"]');
const startWith = async (who) => {
  await page.waitForSelector(`[data-testid="pick-${who}"]`, { timeout: 15000 });
  await page.click(`[data-testid="pick-${who}"]`); await sleep(300);
  await page.click('[data-testid="start"]');
  return waitFor((d) => d.choices.length > 0 && d.state === "idle", 25000);
};
const endLesson = () => page.click('button[aria-label="End lesson"]');
const goMars = async () => {
  await page.click('[data-testid="choice-mars"]');
  return waitFor((d) => d.transit, 15000);
};

await page.goto(TARGET, { waitUntil: "domcontentloaded" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas", { timeout: 30000 });
await sleep(2000);

// ---- 1. Interrupt the flight: Stop, then typing several times, then mic.
await startWith("leo");
await goMars();
await waitFor((d) => d.fx?.space > 0.5, 10000);
let ib = await page.$('[data-testid="interrupt"]');
if (ib) await ib.click().catch(() => {});
await type("take me back");
await sleep(400);
await type("are we there yet");
await sleep(150);
await type("wow");
const mic = await page.$('[data-testid="mic"]:not([disabled])');
if (mic) { await mic.click().catch(() => {}); await sleep(300); }
await shot("01-interrupted-flight");
const landed = await waitFor((d) => d.world === "mars" && !d.transit, 20000);
check("flight interrupted 3x still lands on Mars", !!landed);
const arrivalChoices = await waitFor((d) => d.state === "idle" && d.choices.length > 0, 25000);
check("after landing the child gets choices (arrival line not swallowed)", !!arrivalChoices, arrivalChoices ? `(${arrivalChoices.choices})` : `(state ${(await st()).state}, mic was ${mic ? "available" : "disabled"})`);
const posMars = (await st()).pos;
check("teacher stands near the Mars landing spot", !!posMars && Math.hypot(posMars.x, posMars.z) < 1.5, JSON.stringify(posMars));
await toggleWords();
const w1 = await words();
check("'take me back' mid-flight is not answered with 'already in the classroom'", !w1.join(" ").includes("already in the classroom"), `\n      ${w1.join("\n      ")}`);
await toggleWords();
await shot("02-landed-after-interrupts");

// ---- 2. Rapid taps on rock (before invite) and on answers.
// Rapid taps on the rock (no need to wait for the invite: a tap goes straight to the question).
const rp = await page.evaluate(() => window.__project("rock_1"));
const hit = rp && await page.evaluate((x, y) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${e.className}`.slice(0, 60) : null; }, rp.x, rp.y);
check("rock is not covered by the HUD while the keyboard is open", !!hit && hit.startsWith("CANVAS"), `(rock at ${rp && (rp.x | 0)},${rp && (rp.y | 0)}; on top: ${hit})`);
// Close the keyboard so the rest of the run exercises the taps themselves.
await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("⌨"))?.click());
await sleep(400);
if (rp) { for (let i = 0; i < 6; i++) await page.mouse.click(rp.x, rp.y, { delay: 10 }); }
const q = await waitFor((d) => d.question && d.state === "idle", 25000);
const nQ = await page.$$eval('[data-testid="question"]', (e) => e.length);
check("rock tapped 6x: exactly one question card, no crash", !!q && nQ === 1, `(cards=${nQ})`);
const answers = await page.$$('[data-testid^="answer-"]');
for (let i = 0; i < 4; i++) { const b = await page.$('[data-testid="answer-hot"]'); if (b) await b.click().catch(() => {}); }
await waitFor((d) => d.question && d.state === "idle", 25000);
for (let i = 0; i < 4; i++) { const b = await page.$('[data-testid="answer-sun"]'); if (b) await b.click().catch(() => {}); }
await waitFor((d) => d.state === "idle" && d.choices.length > 0, 25000);
check("answer buttons existed", answers.length === 3);
await shot("04-after-wrong-twice");

// ---- 3. End during the flight, then Start again.
await page.click('[data-testid="choice-crater"]').catch(() => {});
await waitFor((d) => d.choices.includes("back") && d.state === "idle", 30000);
await page.click('[data-testid="choice-back"]');
await waitFor((d) => d.transit, 15000);
await sleep(300);
await endLesson();
await sleep(1500);
const off1 = await st();
await shot("05-ended-midflight");
await sleep(9000);
const off2 = await st();
await shot("06-ended-later");
check("after End mid-flight, onboarding shows the classroom (not Mars/space)", off2.fx?.shown === "classroom" && off2.fx?.open === 0, JSON.stringify({ at1500: off1.fx, at10s: off2.fx }));
check("after End, teacher placed at onboarding spot", !!off2.pos && Math.abs(off2.pos.z + 0.85) < 0.05, JSON.stringify(off2.pos));

// ---- 4. Start again with Mia; history kept.
const again = await startWith("mia");
const s4 = await st();
check("Start again with Mia: classroom, walls closed, no trip", !!again && s4.world === "classroom" && !s4.transit && s4.fx?.open === 0, JSON.stringify({ world: s4.world, fx: s4.fx, pos: s4.pos }));
await toggleWords();
const w4 = await words();
await toggleWords();
check("Mia introduces herself", w4.join(" ").includes("Mia"), w4.join(" | "));
await shot("07-mia-restart");
// Later-check: type the answer instead of tapping
const hasQ = s4.question;
if (hasQ) { await type("it's rust"); await sleep(4000); }
await shot("08-mia-typed-recall");
const s5 = await waitFor((d) => d.state === "idle", 20000);
check("typed recall answer closes the question card", !s5?.question, `(question asked at start: ${hasQ})`);

// ---- 5. Odd typed text.
for (const t of ["<b>hi</b>", "🚀🚀", "x".repeat(600), "I trust you"]) { await type(t); await sleep(250); }
await waitFor((d) => d.state === "idle", 25000);
await shot("09-odd-text");

// ---- 6. Parent page.
await page.goto(new URL("/parent", TARGET).href, { waitUntil: "domcontentloaded" });
await sleep(1500);
const parent = await page.evaluate(() => document.body.innerText);
console.log("---- parent page ----\n" + parent.split("\n").filter(Boolean).join("\n") + "\n--------------------");
check("parent sessions = 2", /Sessions started: 2/.test(parent));
check("parent teacher = Mia", /Teacher: Mia/.test(parent));
await page.screenshot({ path: `${OUT}b-10-parent.png`, fullPage: true });

check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${fails} failing checks`);
process.exit(fails ? 1 : 0);
