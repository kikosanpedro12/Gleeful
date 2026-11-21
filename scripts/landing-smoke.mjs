// Landing smoke test (classroom landing) in headless Chrome. Server running, then:
//   ORIGIN=http://localhost:3111 node scripts/landing-smoke.mjs        (desktop)
//   ORIGIN=... W=390 H=844 TAG=lp-p node scripts/landing-smoke.mjs      (phone)
// The /api/taste AND /api/voice calls are stubbed (no model or ElevenLabs spend; .env.local may hold a real key). Software rendering: behaviour and screenshots, not fps.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ORIGIN = process.env.ORIGIN || "http://localhost:3111";
/** Extra query string for every page, e.g. QS=rig=glb to run the whole suite with the GLB teachers (add QS=rig=procedural for the escape hatch; the default is the GLB teachers). */
const QS = process.env.QS || "";
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 1280), H = Number(process.env.H || 800), TAG = process.env.TAG || "lp-d";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${detail}`); };
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

/** stub: "live" answers with a scene; "off" = taste unavailable; "used" = already 3 used (cookie says so). */
/** voice: "off" = server offers no ElevenLabs; "landing" = offers the landing pool but every POST is refused (429), so the browser voice must take over.
 *  speech: "fake" = a stand-in speechSynthesis that "speaks" for 20 s (headless Chrome has no reliable voice). noMic: remove SpeechRecognition. */
async function open(path, { stub = "live", rm = false, post = null, voice = "off", speech = null, noMic = false } = {}) {
  const page = await browser.newPage();
  const errors = [], posts = { count: 0, last: null, all: [], voice: 0 };
  if (noMic) await page.evaluateOnNewDocument(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  if (speech === "fake") await page.evaluateOnNewDocument(() => {
    window.__spoken = []; window.__cancels = 0; let cur = null, t = null;
    const fake = { getVoices: () => [], addEventListener() {}, removeEventListener() {}, speaking: false,
      speak(u) { window.__spoken.push(u.text); cur = u; setTimeout(() => { if (cur === u) { u.onstart?.({}); t = setTimeout(() => { if (cur === u) { cur = null; u.onend?.({}); } }, 20000); } }, 50); },
      cancel() { window.__cancels++; if (t) clearTimeout(t); cur = null; } };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`)));
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700 });
  if (rm) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url());
    const json = (status, body) => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (u.pathname === "/api/voice") {
      if (r.method() === "GET") return json(200, voice === "landing" ? { configured: true, public: false, landing: true } : { configured: false, public: false, landing: false });
      posts.voice++; return json(429, { error: "daily_limit" });
    }
    if (u.pathname !== "/api/taste") return r.continue();
    if (r.method() === "GET") return json(200, stub === "off" ? { available: false, maxTurns: 3 } : { available: true, maxTurns: 3, used: stub === "used" ? 3 : 0 });
    posts.count++; posts.last = JSON.parse(r.postData() || "{}"); posts.all.push(posts.last);
    if (post) return json(200, post(posts.count));
    const n = posts.count;
    return json(200, { reply: `Here is answer ${n}.`, turnsLeft: 3 - n, topic: "red Mars dust", scene: { setting: "desert", era: "Mars, today", props: ["pr_pyramids"] },
      ...(n < 3 ? { choices: n === 1 ? ["Rust", "Paint"] : ["Iron", "Gold"] } : {}) });
  });
  const res = await page.goto(ORIGIN + path + (QS ? (path.includes("?") ? "&" : "?") + QS : ""), { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1500);
  return { page, errors, res, posts };
}
const real = (errs) => errs.filter((e) => !/Failed to load resource/.test(e));

// 1. Full journey: choose a tutor, 3 tries, scene on the board, paywall.
{
  const { page, errors, res, posts } = await open("/");
  check("/ responds 200", res.status() === 200);
  check("headline is real text", /Meet your tutor/i.test(await page.$eval("h1", (e) => e.textContent)));
  await page.waitForSelector('[data-testid="choose-teacher"]', { timeout: 15000 });
  check("visitor can choose Leo or Mia", !!(await page.$('[data-testid="pick-leo"]')) && !!(await page.$('[data-testid="pick-mia"]')));
  check("the 3D classroom canvas is on the page", !!(await page.$(".lp-class-stage canvas")));
  await page.screenshot({ path: `${OUT}${TAG}-choose.png` });
  await page.click('[data-testid="pick-mia"]');
  await page.waitForSelector("#class-q");
  check("starter question chips show before the first question", !!(await page.$('[data-testid="taste-chips"]')));
  check("the tutor opens with a line that offers the two starter questions, no try used", /Want to find out why Mars is red, or how old the pyramids are\?/.test(await page.$eval('[data-testid="taste-opener"]', (e) => e.textContent).catch(() => "")) && posts.count === 0 && (await page.$$('[data-testid="taste-chips"] .lp-chip')).length === 2);
  check("the opener is not a try: counter still says 3 free tries", /3 free tries/.test(await page.$eval('[data-testid="taste-count"]', (e) => e.textContent)));
  const hasSR = await page.evaluate(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  check("mic button and its disclosure show when the browser has speech recognition", !hasSR || (!!(await page.$('[data-testid="taste-mic"]')) && /sends your voice/.test(await page.$eval('[data-testid="taste-mic-disclosure"]', (e) => e.textContent).catch(() => ""))), `SR=${hasSR}`);
  await page.click('[data-testid="taste-chips"] .lp-chip');
  await page.waitForFunction(() => document.querySelector('[data-testid="taste-reply"]')?.textContent?.includes("answer 1"), { timeout: 10000 }).catch(() => {});
  check("a try sends the chosen teacher and shows the reply", posts.count === 1 && posts.last?.teacher === "mia" && /answer 1/.test(await page.$eval('[data-testid="taste-reply"]', (e) => e.textContent).catch(() => "")));
  await page.waitForSelector('[data-testid="story"]', { timeout: 10000 }).catch(() => {});
  check("the pretend picture shows on the board, labelled", !!(await page.$('[data-testid="story"]')) && /pretend picture/i.test(await page.$eval('[data-testid="story-label"]', (e) => e.textContent).catch(() => "")));
  check("counter shows 1 of 3", /1 of 3/.test(await page.$eval('[data-testid="taste-count"]', (e) => e.textContent)));
  check("starter chips are gone after the first question", !(await page.$('[data-testid="taste-chips"]')));
  const ch = await page.$$eval('[data-testid="taste-choices"] .lp-chip', (els) => els.map((e) => e.textContent)).catch(() => []);
  check("the tutor's own 2 answers replace the starter chips", ch.join("|") === "Rust|Paint", ch.join("|"));
  check("the pyramid prop (drawn in code) is accepted on the board", !!(await page.$('[data-testid="story"] .story-view')));
  await page.screenshot({ path: `${OUT}${TAG}-try1.png` });
  await page.click('[data-testid="taste-choices"] .lp-chip');
  await page.waitForFunction(() => document.querySelector('[data-testid="taste-reply"]')?.textContent?.includes("answer 2"), { timeout: 10000 }).catch(() => {});
  check("tapping a tutor answer sends it as the next try", posts.count === 2 && posts.last?.text === "Rust");
  await page.type("#class-q", "question 3");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector('[data-testid="taste-reply"]')?.textContent?.includes("answer 3"), { timeout: 10000 }).catch(() => {});
  check("three tries were sent", posts.count === 3);
  check("no tap answers after the last try", !(await page.$('[data-testid="taste-choices"]')));
  await page.waitForSelector('[data-testid="paywall"]', { timeout: 15000 }).catch(() => {});
  const wall = await page.$eval('[data-testid="paywall"]', (e) => e.textContent).catch(() => "");
  check("hard paywall after the 3rd try, honest about money", /7-day free trial/.test(wall) && /Nothing is charged today/.test(wall) && /not switched on/.test(wall));
  check("paywall talks to the grown-up and names what was explored", /For grown-ups/.test(wall) && /red Mars dust/.test(wall), wall.slice(0, 120));
  check("no ElevenLabs call when the server offers none", posts.voice === 0);
  // WCAG 2.2.1: the card is ADDED below the last answer; nothing the visitor was reading is removed or taken over by a timer.
  check("the last answer stays on screen under the paywall (not swapped out)", /answer 3/.test(await page.$eval('[data-testid="taste-reply"]', (e) => e.textContent).catch(() => "")));
  check("question box and chips are gone after the last try (Stop / Mute voice show only while sound plays)", !(await page.$("#class-q")) && !(await page.$('[data-testid="taste-chips"], [data-testid="taste-choices"]')));
  check("the paywall does not steal keyboard focus after a live answer", await page.evaluate(() => !document.activeElement?.closest?.('[data-testid="paywall"]')));
  await sleep(8000);
  check("8 s later everything is still there (no auto-dismiss)", !!(await page.$('[data-testid="paywall"]')) && /answer 3/.test(await page.$eval('[data-testid="taste-reply"]', (e) => e.textContent).catch(() => "")));
  check("paywall CTA goes to sign-in", (await page.$eval('[data-testid="start-trial"]', (e) => e.getAttribute("href")).catch(() => "")) === "/sign-in");
  await page.screenshot({ path: `${OUT}${TAG}-paywall.png` });
  check("no console or CSP errors on the full journey", real(errors).length === 0, real(errors).slice(0, 3).join(" | "));
  await page.close();
}

// 2. A refresh does not reset: the server says 3 are used, so the page goes straight to the paywall.
{
  const { page } = await open("/", { stub: "used" });
  await page.waitForSelector('[data-testid="paywall"]', { timeout: 15000 }).catch(() => {});
  check("returning visitor with 3 used sees the paywall, not new tries", !!(await page.$('[data-testid="paywall"]')) && !(await page.$("#class-q")));
  await page.close();
}

// 3. Live tutor off: say so, offer the scripted demo, never fake an answer.
{
  const { page } = await open("/", { stub: "off" });
  await page.waitForSelector('[data-testid="taste-unavailable"]', { timeout: 15000 }).catch(() => {});
  check("when the live tutor is off the page says so and offers the demo", !!(await page.$('[data-testid="taste-unavailable"]')) && !(await page.$("#class-q")));
  await page.close();
}

// 4. No sideways scroll, tap targets, no price on the home page; reduced motion still works.
{
  const { page, errors } = await open("/", { rm: true });
  await page.waitForSelector('[data-testid="choose-teacher"]', { timeout: 15000 }).catch(() => {});
  check("no sideways scrolling", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const tiny = await page.$$eval(".lp-class-ui button, .lp-class-ui a.lp-btn", (els) => els.filter((e) => e.getBoundingClientRect().height < 43).map((e) => e.outerHTML.slice(0, 60)));
  check("controls are at least 44px tall", tiny.length === 0, tiny.join(" | "));
  check("no price on the home page (pricing has its own page)", !/US\$\d/.test(await page.evaluate(() => document.body.innerText)));
  check("no console errors with reduced motion", real(errors).length === 0, real(errors).slice(0, 3).join(" | "));
  await page.close();
}

// 5. Pricing and FAQ pages.
for (const [p, re] of [["/pricing", /US\$29[\s\S]*US\$79/], ["/faq", /Questions parents ask/]]) {
  const { page, res } = await open(p);
  check(`${p} loads`, res.status() === 200 && re.test(await page.evaluate(() => document.body.innerText)));
  await page.close();
}

// 5b. No speech recognition (Firefox): no mic button, no mic disclosure, typing still works.
{
  const { page, errors } = await open("/", { noMic: true });
  await page.waitForSelector('[data-testid="choose-teacher"]', { timeout: 15000 });
  await page.click('[data-testid="pick-leo"]');
  await page.waitForSelector("#class-q");
  check("no mic button without SpeechRecognition", !(await page.$('[data-testid="taste-mic"]')) && !(await page.$('[data-testid="taste-mic-disclosure"]')));
  check("no console errors without SpeechRecognition", real(errors).length === 0, real(errors).slice(0, 2).join("|"));
  await page.close();
}

// 5c. Spoken reply: ElevenLabs offered but refused (pool used up) -> the browser voice speaks; Stop silences it; Voice off keeps it quiet.
{
  const { page, errors, posts } = await open("/", { voice: "landing", speech: "fake" });
  await page.waitForSelector('[data-testid="choose-teacher"]', { timeout: 15000 });
  await page.click('[data-testid="pick-leo"]');
  await page.waitForSelector("#class-q");
  await sleep(500); // the voice probe answers
  await page.waitForFunction(() => (window.__spoken || []).some((t) => /Want to find out why Mars is red/.test(t)), { timeout: 8000 }).catch(() => {}); // the voice list can take up to 1.2 s to load
  check("the opener is spoken with the free browser voice and never calls ElevenLabs", (await page.evaluate(() => window.__spoken)).some((t) => /Want to find out why Mars is red/.test(t)) && posts.voice === 0, `voice posts=${posts.voice}`);
  await page.click('[data-testid="taste-chips"] .lp-chip');
  await page.waitForFunction(() => document.querySelector('[data-testid="taste-reply"]')?.textContent?.includes("answer 1"), { timeout: 15000 }).catch(() => {});
  await page.waitForSelector('[data-testid="taste-stop"]', { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  check("ElevenLabs was tried once for the landing (stubbed refusal)", posts.voice >= 1, `voice posts=${posts.voice}`);
  check("after the refusal the free browser voice speaks the reply", (await page.evaluate(() => window.__spoken)).some((t) => /answer 1/.test(t)));
  check("a visible Stop button while the tutor talks", !!(await page.$('[data-testid="taste-stop"]')));
  await page.screenshot({ path: `${OUT}${TAG}-speaking.png` });
  const c0 = await page.evaluate(() => window.__cancels);
  await page.$eval('[data-testid="taste-stop"]', (e) => e.click()).catch(() => {});
  await sleep(300);
  check("Stop silences the voice and hides itself", !(await page.$('[data-testid="taste-stop"]')) && (await page.evaluate(() => window.__cancels)) > c0);
  await page.click('[data-testid="taste-mute"]');
  check("voice toggle: one constant name ('Mute voice'), aria-pressed=true once pressed (state is not in the label)", (await page.$eval('[data-testid="taste-mute"]', (e) => e.getAttribute("aria-pressed") + "|" + e.textContent.trim())) === "true|Mute voice");
  await page.click('[data-testid="taste-mute"]');
  check("pressing it again gives aria-pressed=false with the same name", (await page.$eval('[data-testid="taste-mute"]', (e) => e.getAttribute("aria-pressed") + "|" + e.textContent.trim())) === "false|Mute voice");
  await page.click('[data-testid="taste-mute"]'); // muted again for the next check
  const n0 = (await page.evaluate(() => window.__spoken)).length;
  await page.click('[data-testid="taste-choices"] .lp-chip');
  await page.waitForFunction(() => document.querySelector('[data-testid="taste-reply"]')?.textContent?.includes("answer 2"), { timeout: 10000 }).catch(() => {});
  await sleep(800);
  check("with Voice off the next reply is not spoken", (await page.evaluate(() => window.__spoken)).length === n0);
  check("no console errors on the voice path", real(errors).length === 0, real(errors).slice(0, 2).join("|"));
  await page.close();
}

// 6. The tutor's gesture and chalkboard phrase (needs a build:test build and ?test=1: reads window.__teacher and the board texture).
// Board text is canvas pixels, so the check hashes every canvas texture in the scene: changed = new text drawn.
const HOOKS = `
  window.__rec = []; window.__acts = []; setInterval(() => { const d = window.__teacher?.animator?.debug; if (d?.gesture) window.__rec.push(d.gesture); if (d?.action) window.__acts.push(d.action); }, 16);
  window.__boards = () => { const root = (function up(o) { while (o.parent) o = o.parent; return o; })(window.__teacher.rig.root); const out = [];
    root.traverse((o) => { const m = o.material && o.material.map; const c = m && m.image; if (c && typeof c.toDataURL === "function") { const d = c.toDataURL(); let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d.charCodeAt(i)) | 0; out.push(h); } }); return out.join(","); };`;
async function acts(label, body, { expectGesture = null, expectBoardChange, expectAct = undefined }) {
  const { page, errors, posts } = await open("/?test=1", { post: (n) => ({ reply: `Answer ${n}.`, turnsLeft: 2, ...body }) });
  await page.waitForSelector('[data-testid="choose-teacher"]', { timeout: 15000 });
  await page.evaluate(HOOKS);
  await page.click('[data-testid="pick-leo"]');
  await page.waitForSelector("#class-q");
  await page.waitForFunction(() => window.__teacher?.animator, { timeout: 15000 }).catch(() => {});
  if (!(await page.evaluate(() => !!window.__teacher))) { check(`${label}: test hooks present (use npm run build:test)`, false); await page.close(); return; }
  await sleep(1500); // let the board texture settle
  const before = await page.evaluate(() => window.__boards());
  await page.evaluate(() => { window.__rec = []; window.__acts = []; });
  await page.click(".lp-chip");
  await page.waitForFunction(() => document.querySelector('[data-testid="taste-reply"]')?.textContent?.includes("Answer 1"), { timeout: 10000 }).catch(() => {});
  await sleep(2500);
  const after = await page.evaluate(() => window.__boards());
  if (expectAct) await sleep(2500);
  const seen = await page.evaluate(() => [...new Set(window.__rec)]);
  const acted = await page.evaluate(() => [...new Set(window.__acts)]);
  if (expectAct !== undefined) check(`${label}: ${expectAct ? `teacher acts "${expectAct}"` : "no action"}`, expectAct ? acted.includes(expectAct) : acted.length === 0, `acted=${acted.join(",")}`);
  check(`${label}: board ${expectBoardChange ? "changes" : "does not change"}`, (before !== after) === expectBoardChange, `before=${before} after=${after}`);
  if (expectGesture) check(`${label}: teacher plays "${expectGesture}"`, seen.includes(expectGesture), `seen=${seen.join(",")}`);
  else check(`${label}: no gesture from the stub`, !seen.some((g) => !["nod", "think"].includes(g)) || seen.length === 0, `seen=${seen.join(",")}`);
  check(`${label}: no crash or console errors`, real(errors).length === 0 && /Answer 1/.test(await page.$eval('[data-testid="taste-reply"]', (e) => e.textContent).catch(() => "")), real(errors).slice(0, 2).join("|"));
  await page.close();
}
await acts("valid gesture + board", { gesture: "wave", board: "Coconut taller" }, { expectGesture: "wave", expectBoardChange: true });
await acts("gesture 'backflip'", { gesture: "backflip" }, { expectBoardChange: false });
await acts("board with a link", { board: "go to https://evil.example/x" }, { expectBoardChange: false });
await acts("5,000-char board", { board: "A".repeat(5000) }, { expectBoardChange: false });
await acts("valid ACT jump", { act: "jump", board: "Gravity" }, { expectBoardChange: true, expectAct: "jump" });
await acts("ACT swim (not allowed in the classroom)", { act: "swim" }, { expectBoardChange: false, expectAct: null });
await acts("hostile ACT ids", { act: "__proto__" }, { expectBoardChange: false, expectAct: null });
await acts("HTML board and non-string gesture", { board: "<img src=x onerror=alert(1)>", gesture: { name: "wave" } }, { expectBoardChange: false });

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} checks FAILED` : `\nAll ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
