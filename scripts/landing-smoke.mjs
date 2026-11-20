// Landing smoke test (classroom landing) in headless Chrome. Server running, then:
//   ORIGIN=http://localhost:3111 node scripts/landing-smoke.mjs        (desktop)
//   ORIGIN=... W=390 H=844 TAG=lp-p node scripts/landing-smoke.mjs      (phone)
// The /api/taste calls are stubbed (no model spend). Software rendering: behaviour and screenshots, not fps.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ORIGIN = process.env.ORIGIN || "http://localhost:3111";
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
async function open(path, { stub = "live", rm = false } = {}) {
  const page = await browser.newPage();
  const errors = [], posts = { count: 0, last: null };
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`)));
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700 });
  if (rm) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname !== "/api/taste") return r.continue();
    const json = (status, body) => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (r.method() === "GET") return json(200, stub === "off" ? { available: false, maxTurns: 3 } : { available: true, maxTurns: 3, used: stub === "used" ? 3 : 0 });
    posts.count++; posts.last = JSON.parse(r.postData() || "{}");
    return json(200, { reply: `Here is answer ${posts.count}.`, turnsLeft: 3 - posts.count, scene: { setting: "desert", era: "Mars, today", props: [] } });
  });
  const res = await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded", timeout: 60000 });
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
  await page.click(".lp-chip");
  await page.waitForFunction(() => document.querySelector('[data-testid="taste-reply"]')?.textContent?.includes("answer 1"), { timeout: 10000 }).catch(() => {});
  check("a try sends the chosen teacher and shows the reply", posts.count === 1 && posts.last?.teacher === "mia" && /answer 1/.test(await page.$eval('[data-testid="taste-reply"]', (e) => e.textContent).catch(() => "")));
  await page.waitForSelector('[data-testid="story"]', { timeout: 10000 }).catch(() => {});
  check("the pretend picture shows on the board, labelled", !!(await page.$('[data-testid="story"]')) && /pretend picture/i.test(await page.$eval('[data-testid="story-label"]', (e) => e.textContent).catch(() => "")));
  check("counter shows 1 of 3", /1 of 3/.test(await page.$eval('[data-testid="taste-count"]', (e) => e.textContent)));
  await page.screenshot({ path: `${OUT}${TAG}-try1.png` });
  for (const n of [2, 3]) {
    await page.type("#class-q", `question ${n}`);
    await page.keyboard.press("Enter");
    await page.waitForFunction((k) => document.querySelector('[data-testid="taste-reply"]')?.textContent?.includes(`answer ${k}`), { timeout: 10000 }, n).catch(() => {});
  }
  check("three tries were sent", posts.count === 3);
  await page.waitForSelector('[data-testid="paywall"]', { timeout: 15000 }).catch(() => {});
  const wall = await page.$eval('[data-testid="paywall"]', (e) => e.textContent).catch(() => "");
  check("hard paywall after the 3rd try, honest about money", /7-day free trial/.test(wall) && /Nothing is charged today/.test(wall) && /not switched on/.test(wall));
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

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} checks FAILED` : `\nAll ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
