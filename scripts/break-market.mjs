// Tester adversarial browser run for the Fair Share Market (DEMO / scripted mode only; TTS silent in headless).
// Needs the built app (build:test). Usage: SMOKE_URL=http://localhost:3222/learn?test=1 node scripts/break-market.mjs
// W/H for viewport, RM=1 for reduced motion, TAG for screenshot prefix (scripts/out/<TAG>-*.png).
// Software rendering (~5-10 fps): behaviour only, no performance claims.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const TARGET = process.env.SMOKE_URL || "http://localhost:3222/learn?test=1";
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720), TAG = process.env.TAG || "bm";
const RM = !!process.env.RM;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${detail}`); };
const note = (s) => console.log(`NOTE  ${s}`);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});

async function newPage() {
  const ctx = await browser.createBrowserContext(); // fresh localStorage = fresh learner
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|404/.test(m.text())) page.errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => {
    window.__caps = [];
    setInterval(() => {
      const c = document.querySelector('[data-testid="caption"]')?.textContent?.trim();
      if (c && window.__caps.at(-1) !== c) window.__caps.push(c);
      const q = document.querySelector('[data-testid="question"]')?.textContent?.trim();
      if (q && window.__caps.at(-1) !== "Q:" + q) window.__caps.push("Q:" + q);
    }, 60);
  });
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  if (RM) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  return page;
}

const st = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="state"]');
  const t = window.__teacher;
  return {
    state: el?.getAttribute("data-state") ?? "offline", world: el?.getAttribute("data-world"), transit: el?.getAttribute("data-transit") === "1",
    walking: t?.animator?.debug.walking, pointing: t?.animator?.debug.pointing, gesture: t?.animator?.debug.gesture, mouth: t?.animator?.debug.mouthOpen ?? 0,
    helmet: t?.rig?.helmet.visible, shown: window.__fx?.shown,
    choices: [...document.querySelectorAll('[data-testid^="choice-"]')].map((b) => b.getAttribute("data-testid").slice(7)),
    question: document.querySelector('[data-testid="question"]')?.textContent ?? "",
    inspect: !!document.querySelector('[data-testid="inspect"]'),
    tag: document.getElementById("tap-tag")?.style.display === "block",
    caption: document.querySelector('[data-testid="caption"]')?.textContent ?? "",
    badge: document.querySelector('[data-testid="demo-badge"]')?.textContent ?? "",
  };
});
const waitFor = async (page, fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await st(page); if (fn(d)) return d; await sleep(80); } return null; };
const idleWith = (page, fn, ms = 25000) => waitFor(page, (d) => d.state === "idle" && !d.transit && fn(d), ms);
const caps = (page) => page.evaluate(() => window.__caps.splice(0));
const shot = (page, n) => page.screenshot({ path: `${OUT}${TAG}-${n}.png` });

/** World positions of the 12 oranges (SphereGeometry r=0.042), found by walking the scene from the teacher rig. */
const oranges = (page) => page.evaluate(() => {
  let o = window.__teacher?.rig?.root; if (!o) return null;
  while (o.parent) o = o.parent;
  const out = [];
  o.traverse((m) => { if (m.isMesh && m.geometry?.type === "SphereGeometry" && Math.abs((m.geometry.parameters?.radius ?? 0) - 0.042) < 1e-6 && m.material?.color?.getHexString?.() === "f28c28") out.push([+m.position.x.toFixed(3), +m.position.y.toFixed(3)]); });
  return out;
});
// crate x ≈ 0.18..0.42, baskets 0.85..1.75; resting y ≈ 0.92..1.0
const dealt = (os) => os ? os.filter(([x, y]) => x > 0.8 && y < 1.0).length : -1;
const inCrate = (os) => os ? os.filter(([x, y]) => x < 0.45 && y < 1.03).length : -1;
const flying = (os) => os ? 12 - dealt(os) - inCrate(os) : -1;

async function type(page, text) {
  if (!(await page.$('[data-testid="text-input"]'))) await page.click('[data-testid="type-toggle"]');
  await page.waitForSelector('[data-testid="text-input"]', { timeout: 3000 });
  await page.type('[data-testid="text-input"]', text);
  await page.keyboard.press("Enter");
}
async function tapTarget(page, name) {
  const p = await page.evaluate((n) => window.__project(n), name);
  if (p) await page.mouse.click(p.x, p.y);
  return p;
}
async function start(page, teacher = "leo") {
  await page.goto(TARGET, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 30000 });
  await sleep(1500);
  await page.click(`[data-testid="pick-${teacher}"]`);
  await sleep(300);
  await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-testid="demo-badge"]', { timeout: 10000 });
}
async function toMarket(page) {
  await page.click('[data-testid="choice-market"]');
  const helmets = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) { const d = await st(page); helmets.push(d.helmet); if (d.world === "market" && !d.transit) break; await sleep(60); }
  return helmets;
}
async function toCrateInvite(page) {
  const s = await idleWith(page, (d) => d.choices.includes("market"));
  if (s) await page.click('[data-testid="choice-market"]');
  return idleWith(page, (d) => d.tag);
}

// ===================================================================== A: market-first session
{
  const page = await newPage();
  await start(page);
  const g = await idleWith(page, (d) => d.choices.includes("market"));
  check("A1 greeting offers the market", !!g, g ? `choices=${g.choices}` : "");
  // Hidden crate in the classroom: tap where it would be.
  const cpClass = await page.evaluate(() => window.__project("crate"));
  await caps(page);
  if (cpClass && cpClass.x > 0 && cpClass.x < W && cpClass.y > 0 && cpClass.y < H) {
    await page.mouse.click(cpClass.x, cpClass.y);
    await sleep(1500);
    const d = await st(page);
    const c = await caps(page);
    check("A2 tap on hidden crate spot in classroom does nothing", d.world === "classroom" && !d.inspect && !c.some((x) => /crate|orange|look at something else/i.test(x)), `(${cpClass.x | 0},${cpClass.y | 0}) caps=${JSON.stringify(c)}`);
  } else note(`A2 hidden crate projects off-screen in classroom ${JSON.stringify(cpClass)}`);
  const helmets = await toMarket(page);
  check("A3 no helmet at any frame of the fade to the market", helmets.every((h) => h === false), `(${helmets.length} samples, true=${helmets.filter(Boolean).length})`);
  let os = await oranges(page);
  check("A4 on arrival all 12 oranges are in the crate", inCrate(os) === 12, `crate=${inCrate(os)} dealt=${dealt(os)}`);
  const inv = await toCrateInvite(page);
  check("A5 crate invite", !!inv);
  await shot(page, "01-invite");
  const cp = await page.evaluate(() => window.__project("crate"));
  const covered = cp ? await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, cp) : null;
  check("A6 crate on screen and the canvas (not UI) is on top at that point", !!cp && cp.x > 0 && cp.x < W && cp.y > 0 && cp.y < H && covered === "CANVAS", cp ? `(${cp.x | 0},${cp.y | 0}) top=${covered}` : "");

  // Double tap.
  await caps(page);
  if (cp) { await page.mouse.click(cp.x, cp.y); await sleep(40); await page.mouse.click(cp.x, cp.y); }
  await sleep(700);
  os = await oranges(page);
  note(`A7 0.7 s after double tap: crate=${inCrate(os)} flying=${flying(os)} dealt=${dealt(os)}`);
  // Tap during the deal.
  await sleep(900);
  const before = await oranges(page);
  const cp2 = await page.evaluate(() => window.__project("crate"));
  if (cp2) await page.mouse.click(cp2.x, cp2.y);
  await sleep(150);
  const after = await oranges(page);
  note(`A8 tap mid-deal: before dealt=${dealt(before)} flying=${flying(before)} → after dealt=${dealt(after)} flying=${flying(after)} crate=${inCrate(after)} (restart = oranges jump back)`);
  if (RM) {
    const rmOs = []; for (let i = 0; i < 5; i++) { rmOs.push(flying(await oranges(page))); await sleep(200); }
    check("A8rm reduced motion: oranges are not animated in flight", rmOs.every((f) => f === 0), `flying samples=${rmOs}`);
  }
  const q = await idleWith(page, (d) => /How many in each basket/.test(d.question), 40000);
  check("A9 after double tap + mid-deal tap, one question, idle", !!q);
  os = await oranges(page);
  check("A10 oranges settle 4/4/4 in the baskets", dealt(os) === 12, `dealt=${dealt(os)}`);
  const c9 = await caps(page);
  note(`A9 captions: ${JSON.stringify(c9)}`);
  await shot(page, "02-question");
  // Is the crate / baskets covered by the question card or inspect card?
  for (const n of ["crate", "basket_1", "basket_2", "basket_3"]) {
    const p = await page.evaluate((x) => window.__project(x), n);
    const top = p ? await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e?.tagName + (e?.closest('[data-testid]')?.getAttribute("data-testid") ? ":" + e.closest('[data-testid]').getAttribute("data-testid") : ""); }, p) : null;
    const on = !!p && p.x > 0 && p.x < W && p.y > 0 && p.y < H;
    note(`A11 with question open: ${n} at ${p ? `(${p.x | 0},${p.y | 0})` : "null"} on-screen=${on} top=${top}`);
    if (n !== "crate") check(`A11 ${n} visible while the question is open`, on && top === "CANVAS", `top=${top}`);
  }

  // Tap the crate while the question is open.
  const cp3 = await page.evaluate(() => window.__project("crate"));
  if (cp3 && cp3.x > 0 && cp3.x < W) {
    await page.mouse.click(cp3.x, cp3.y);
    await sleep(200);
    const d = await st(page);
    os = await oranges(page);
    note(`A12 crate tapped with question open: question now="${d.question.slice(0, 30)}" crate=${inCrate(os)} dealt=${dealt(os)}`);
    const q2 = await idleWith(page, (d) => /How many in each basket/.test(d.question), 40000);
    check("A12 re-tap while question open → question re-asked, idle", !!q2);
  } else note("A12 crate off-screen while question open; re-tap not possible");

  // Typed answers.
  const ask = async (text) => {
    await caps(page);
    await type(page, text);
    await sleep(300);
    const d = await waitFor(page, (d) => d.state === "idle", 25000);
    await sleep(400);
    return { d: await st(page), c: await caps(page) };
  };
  const reopen = async () => {
    // get the question back by tapping the crate again (re-deals)
    const s = await st(page);
    if (/How many in each basket/.test(s.question)) return true;
    if (!s.tag) { await type(page, "share again"); await idleWith(page, (d) => d.tag); }
    await tapTarget(page, "crate");
    return !!(await idleWith(page, (d) => /How many in each basket/.test(d.question), 40000));
  };
  let r = await ask("four or six");
  check('A13 "four or six" → asks to pick one, question stays, nothing recorded', /more than one answer/i.test(r.c.join(" ")) && /How many/.test(r.d.question), JSON.stringify(r.c));
  r = await ask("14");
  check('A14 "14" is NOT accepted as 4', !/Yes!|4 in each/i.test(r.c.join(" ")), JSON.stringify(r.c));
  note(`A14 "14" reply: ${JSON.stringify(r.c)} question open=${!!r.d.question}`);
  await reopen();
  r = await ask("40");
  check('A15 "40" is NOT accepted as 4', !/Yes!|4 in each/i.test(r.c.join(" ")), JSON.stringify(r.c));
  await reopen();
  r = await ask("12 divided by 3 is 4");
  note(`A16 "12 divided by 3 is 4" reply: ${JSON.stringify(r.c)}`);
  check('A16 a correct full sentence "12 divided by 3 is 4" is understood (not "more than one answer")', /Yes!/.test(r.c.join(" ")), "");
  if (/How many/.test(r.d.question)) { r = await ask("4"); check('A17 "4" accepted as correct', /Yes/.test(r.c.join(" ")), JSON.stringify(r.c)); }
  else { await reopen(); r = await ask("four"); check('A17 "four" accepted as correct', /Yes/.test(r.c.join(" ")), JSON.stringify(r.c)); }

  // "orange" at the market (singular) -> which intent?
  r = await ask("can I have an orange");
  note(`A18 "can I have an orange" at the market: ${JSON.stringify(r.c)}`);
  check('A18 "orange" at the market does not talk about Mars rocks', !/rocks|Mars|fly there/i.test(r.c.join(" ")), JSON.stringify(r.c));

  // Stop mid-deal.
  r = await ask("share again");
  await idleWith(page, (d) => d.tag);
  await tapTarget(page, "crate");
  await waitFor(page, (d) => d.state === "speaking" || d.state === "thinking", 5000);
  await sleep(400);
  const ib = await page.$('[data-testid="interrupt"]');
  if (ib) await ib.click();
  const stopT = Date.now();
  const stopped = await waitFor(page, (d) => d.state === "idle" && d.mouth < 0.02 && !d.walking && !d.pointing, 3000);
  check("A19 Stop mid-deal: speech, mouth, walking, pointing stop", !!stopped, `(${Date.now() - stopT} ms)`);
  const sStop = await st(page);
  const o1 = await oranges(page); await sleep(500); const o2 = await oranges(page);
  note(`A20 after Stop: oranges still moving=${JSON.stringify(o1) !== JSON.stringify(o2)} flying=${flying(o2)} dealt=${dealt(o2)}`);
  await sleep(2500);
  const after2 = await st(page);
  check("A21 after Stop the child is not stranded (question/choices/invite on screen)", !!after2.question || after2.choices.length > 0 || after2.tag || after2.inspect, `inspect=${after2.inspect} q=${!!after2.question} choices=${after2.choices} tag=${after2.tag}`);
  if (after2.inspect && !after2.question && !after2.choices.length && !after2.tag) {
    // Only the inspect card is left: the child presses "Put it back". Is anything left to do?
    const pb = await page.$$('[data-testid="inspect"] button');
    if (pb.length) await pb[pb.length - 1].click();
    await sleep(3500);
    const s3 = await st(page);
    check("A21b after Stop + Put it back, something to answer/tap is on screen", !!s3.question || s3.choices.length > 0 || s3.tag, `q=${!!s3.question} choices=${s3.choices} tag=${s3.tag} inspect=${s3.inspect} state=${s3.state}`);
    await shot(page, "03b-stranded");
  }
  const cStop = await caps(page);
  note(`A21 captions after stop: ${JSON.stringify(cStop)} gesture=${sStop.gesture}`);
  await shot(page, "03-after-stop");

  // Back mid-deal.
  await type(page, "share again");
  await idleWith(page, (d) => d.tag);
  await tapTarget(page, "crate");
  await sleep(1000);
  await type(page, "go back to class");
  const home = await waitFor(page, (d) => d.world === "classroom" && !d.transit, 20000);
  check("A22 back mid-deal → classroom", !!home);
  const rc = await idleWith(page, (d) => !!d.question || d.choices.length > 0, 25000);
  check("A23 recheck after a market trip is the SHARE recall (cookies)", !!rc && /cookies/i.test(rc.question), rc ? `q="${rc.question.slice(0, 60)}" choices=${rc.choices}` : "");
  // Hidden crate in classroom after a market trip.
  if (rc?.question) {
    await caps(page);
    const p = await page.evaluate(() => window.__project("crate"));
    if (p && p.x > 0 && p.x < W && p.y > 0 && p.y < H) {
      const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, p);
      if (top === "CANVAS") { await page.mouse.click(p.x, p.y); await sleep(1200); }
      const d = await st(page); const c = await caps(page);
      check("A24 tap on hidden crate spot in classroom (after a market trip) does nothing", d.world === "classroom" && !!d.question && !d.inspect && !c.some((x) => /orange|crate|something else/i.test(x)), `top=${top} caps=${JSON.stringify(c)}`);
    }
    await page.click('[data-testid="answer-five"]');
  }
  const mk2 = await idleWith(page, (d) => d.choices.includes("market"));
  if (mk2) {
    await toMarket(page);
    os = await oranges(page);
    check("A25 market → classroom → market: the stall is reset (12 in crate)", inCrate(os) === 12, `crate=${inCrate(os)} dealt=${dealt(os)}`);
  } else check("A25 market offered again", false);

  // End mid-deal, then Start again.
  await toCrateInvite(page);
  await tapTarget(page, "crate");
  await sleep(800);
  await page.click('button[aria-label="End lesson"]');
  await sleep(1500);
  const ended = await st(page);
  note(`A26 after End mid-deal: state=${ended.state} world=${ended.world} shown=${ended.shown}`);
  os = await oranges(page);
  note(`A26 oranges after End: crate=${inCrate(os)} dealt=${dealt(os)} flying=${flying(os)}`);
  await shot(page, "04-after-end");
  const startBtn = await page.$('[data-testid="start"]');
  if (startBtn) {
    await startBtn.click();
    const g2 = await idleWith(page, (d) => !!d.question || d.choices.length > 0, 30000);
    const c = await caps(page);
    check("A27 restart after End mid-market starts in the classroom with a prompt", !!g2 && g2.world === "classroom", g2 ? `q="${g2.question.slice(0, 50)}" choices=${g2.choices} caps=${JSON.stringify(c.slice(-3))}` : "");
  } else note("A27 no start button after End");
  check("A28 no page errors (session A)", page.errors.length === 0, page.errors.slice(0, 3).join(" | "));
  await page.close();
}

// ===================================================================== B: Mars then market in one session
{
  const page = await newPage();
  await start(page, "mia");
  await idleWith(page, (d) => d.choices.includes("mars"));
  await page.click('[data-testid="choice-mars"]');
  await waitFor(page, (d) => d.world === "mars" && !d.transit, 30000);
  await idleWith(page, (d) => d.choices.includes("red"));
  // On Mars: hidden crate spot.
  await caps(page);
  const p = await page.evaluate(() => window.__project("crate"));
  if (p && p.x > 0 && p.x < W && p.y > 0 && p.y < H) {
    await page.mouse.click(p.x, p.y);
    await sleep(1200);
    const d = await st(page); const c = await caps(page);
    check("B1 tap on hidden crate spot on Mars does nothing crate-related", d.world === "mars" && !c.some((x) => /orange|crate/i.test(x)), `(${p.x | 0},${p.y | 0}) inspect=${d.inspect} caps=${JSON.stringify(c)}`);
  } else note(`B1 hidden crate projects off-screen on Mars ${JSON.stringify(p)}`);
  // Ask for the market while on Mars.
  await caps(page);
  await type(page, "can we go to the market");
  await sleep(500);
  await waitFor(page, (d) => d.state === "idle", 20000);
  await sleep(800);
  const cm = await caps(page); const dm = await st(page);
  check('B2 "go to the market" on Mars gets an honest reply and a next step', !/on our way/i.test(cm.join(" ")) && (dm.choices.length > 0 || !!dm.question || dm.tag), `caps=${JSON.stringify(cm)} choices=${dm.choices}`);
  if (!dm.choices.includes("red")) { await type(page, "why is it red"); }
  else await page.click('[data-testid="choice-red"]');
  await idleWith(page, (d) => d.tag);
  await tapTarget(page, "rock_1");
  await idleWith(page, (d) => /red/i.test(d.question), 30000);
  await page.click('[data-testid="answer-rust"]');
  await idleWith(page, (d) => d.choices.length > 0);
  await type(page, "back to class");
  await waitFor(page, (d) => d.world === "classroom" && !d.transit, 30000);
  const r1 = await idleWith(page, (d) => !!d.question, 25000);
  check("B3 after Mars: recheck is the Mars recall", !!r1 && /red/i.test(r1.question) && !/cookies/i.test(r1.question), r1 ? `q="${r1.question.slice(0, 60)}"` : "");
  await page.click('[data-testid="answer-rust"]');
  await idleWith(page, (d) => d.choices.includes("market"));
  const helmets = await toMarket(page);
  check("B4 classroom→market after Mars: no helmet during the fade", helmets.every((h) => h === false), `true=${helmets.filter(Boolean).length}/${helmets.length}`);
  const os = await oranges(page);
  check("B5 market after Mars: 12 in crate", inCrate(os) === 12, `crate=${inCrate(os)}`);
  await toCrateInvite(page);
  await tapTarget(page, "crate");
  await idleWith(page, (d) => /How many in each basket/.test(d.question), 40000);
  await page.click('[data-testid="answer-four"]');
  await idleWith(page, (d) => d.choices.includes("back"));
  await page.click('[data-testid="choice-back"]');
  await waitFor(page, (d) => d.world === "classroom" && !d.transit, 30000);
  const r2 = await idleWith(page, (d) => !!d.question || d.choices.length > 0, 25000);
  check("B6 after Mars then market: recheck matches the trip (share, cookies)", !!r2 && /cookies/i.test(r2.question), r2 ? `q="${r2.question.slice(0, 60)}"` : "");
  await shot(page, "05-share-recheck");
  if (r2?.question) await page.click('[data-testid="answer-five"]');
  // Mars again WITHOUT tapping the rock, then back: no stale share recheck.
  await idleWith(page, (d) => d.choices.includes("mars"));
  await page.click('[data-testid="choice-mars"]');
  await waitFor(page, (d) => d.world === "mars" && !d.transit, 30000);
  await idleWith(page, (d) => d.choices.length > 0);
  await type(page, "back to class");
  await waitFor(page, (d) => d.world === "classroom" && !d.transit, 30000);
  const r3 = await idleWith(page, (d) => !!d.question || d.choices.length > 0, 25000);
  check("B7 later Mars trip (no rock) → no stale share recheck", !!r3 && !/cookies/i.test(r3.question), r3 ? `q="${r3.question.slice(0, 40)}" choices=${r3.choices}` : "");
  check("B8 badge honest throughout", /Scripted|not AI/i.test((await st(page)).badge), (await st(page)).badge);
  check("B9 no page errors (session B)", page.errors.length === 0, page.errors.slice(0, 3).join(" | "));
  await page.close();
}

await browser.close();
const failed = results.filter((c) => !c.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`  failed: ${f.name}`);
process.exit(failed.length ? 1 : 0);
