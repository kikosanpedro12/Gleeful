// Landing page smoke test in headless Chrome. Server running, then:
//   ORIGIN=http://localhost:3666 node scripts/landing-smoke.mjs           (desktop)
//   ORIGIN=... W=390 H=844 TAG=lp-p node scripts/landing-smoke.mjs         (phone)
// Software rendering: checks behaviour and takes screenshots; it says nothing about device fps.
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
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

async function open(path, { rm = false } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => { document.addEventListener("securitypolicyviolation", (e) => console.error(`Refused (CSP event): ${e.violatedDirective} ${e.blockedURI}`)); });
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700 });
  if (rm) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const res = await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1200);
  return { page, errors, res };
}
const mode = (page) => page.$eval('[data-testid="hero"]', (e) => e.getAttribute("data-mode"));
const scrollToChapter = async (page, id) => {
  await page.evaluate((cid) => document.querySelector(`[data-chapter="${cid}"]`).scrollIntoView({ behavior: "instant", block: "start" }), id);
  await sleep(1800);
};

// 1. Default visit: server-rendered headline, SEO, CTAs, honest status line.
{
  const { page, errors, res } = await open("/");
  check("/ responds 200", res.status() === 200, `(${res.status()})`);
  const h1 = await page.$eval("h1", (e) => e.textContent);
  check("hero headline is real HTML text", /AI teacher your kid can talk to/i.test(h1), `"${h1}"`);
  const robots = await page.$eval('meta[name="robots"]', (e) => e.content).catch(() => "");
  // Indexing follows SITE_INDEXING (src/lib/seo/site.ts): off by default, on only when Kiko turns it on.
  const indexing = process.env.SITE_INDEXING === "on";
  check(`/ robots meta follows SITE_INDEXING (${indexing ? "on" : "off"})`, indexing ? (/index/.test(robots) && !/noindex/.test(robots)) : /noindex/.test(robots), robots);
  check("/ has a title and description", /AI teacher.*early access/i.test(await page.title()) && !!(await page.$('meta[name="description"]')), await page.title());
  check("demo CTA goes to /learn", (await page.$eval('[data-testid="cta-demo"]', (e) => e.getAttribute("href"))) === "/learn");
  check("no waitlist anywhere on the page", !(await page.evaluate(() => /waitlist/i.test(document.body.innerText))));
  check("prices are shown in US dollars", await page.evaluate(() => /US\$29/.test(document.body.innerText) && /US\$79/.test(document.body.innerText)));
  const status = await page.$eval(".lp-status", (e) => e.textContent);
  check("hero says the demo is scripted", /scripted/i.test(status));
  check("every episode headline is in the page", (await page.$$eval(".lp-headline", (els) => els.length)) === 7);
  // Keyboard: the first tab stop is the skip link.
  await page.keyboard.press("Tab");
  check("first Tab focuses the skip link", (await page.evaluate(() => document.activeElement?.className)) === "lp-skip");
  check("no console or CSP errors on /", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

// 2. Poster mode (forced): no canvas, stills visible, every section screenshotted.
{
  const { page, errors } = await open("/?poster=1");
  await sleep(800);
  check("poster mode has no 3D canvas", !(await page.$(".lp-stage canvas")) && (await mode(page)) === "poster");
  const posterShown = await page.$eval(".lp-ch-ocean .lp-poster", (e) => getComputedStyle(e).visibility === "visible" && e.getBoundingClientRect().height > 50);
  check("poster mode shows the still illustrations", posterShown);
  for (const id of ["classroom", "ocean", "cell", "dino", "city", "numbers", "space"]) {
    await scrollToChapter(page, id);
    await page.screenshot({ path: `${OUT}${TAG}-poster-${id}.png` });
  }
  for (const sel of ["#how", "#parents", "#pricing", "#faq", "#try"]) {
    await page.evaluate((s) => document.querySelector(s).scrollIntoView({ behavior: "instant", block: "start" }), sel);
    await sleep(300);
    await page.screenshot({ path: `${OUT}${TAG}-section-${sel.slice(1)}.png` });
  }
  check("no console errors in poster mode", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

// 3. Reduced motion: never starts the 3D flight.
{
  const { page, errors } = await open("/", { rm: true });
  await sleep(2500);
  const m = await mode(page);
  const reason = await page.$eval('[data-testid="hero"]', (e) => e.getAttribute("data-reason"));
  check("reduced motion keeps the stills", m === "poster" && reason === "reduced-motion", `(${m}, ${reason})`);
  check("no console errors with reduced motion", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

// 4. 3D flight (forced on, since software rendering is slow): goes live and follows the scroll.
{
  const { page, errors } = await open("/?3d=1");
  const live = await page.waitForFunction(() => document.querySelector('[data-testid="hero"]')?.getAttribute("data-mode") === "live", { timeout: 45000 }).then(() => true).catch(() => false);
  check("3D stage goes live", live);
  check("3D stage has one canvas", (await page.$$(".lp-stage canvas")).length === 1);
  await sleep(1500);
  await page.screenshot({ path: `${OUT}${TAG}-3d-classroom.png` });
  const seen = [];
  for (const id of ["ocean", "cell", "dino", "city", "numbers", "space"]) {
    await scrollToChapter(page, id);
    await sleep(2500);
    seen.push(await page.$eval('[data-testid="hero"]', (e) => e.getAttribute("data-onair")));
    await page.screenshot({ path: `${OUT}${TAG}-3d-${id}.png` });
  }
  check("channel bug follows the scroll through every episode", seen.join(",") === "ocean,cell,dino,city,numbers,space", seen.join(","));
  // WebGL performance warnings from swiftshader are noise; real errors are not.
  const real = errors.filter((e) => !/GPU stall|WebGL|swiftshader|GL_/i.test(e));
  check("no console or CSP errors in 3D mode", real.length === 0, real.slice(0, 3).join(" | "));
  await page.close();
}

// 5. The lesson app moved to /learn and is not indexable; the parent view links back to it.
{
  const { page, res } = await open("/learn");
  check("/learn responds 200", res.status() === 200);
  const robots = await page.$eval('meta[name="robots"]', (e) => e.content).catch(() => "");
  check("/learn is noindex", /noindex/.test(robots), robots);
  await page.close();
  const p = await open("/parent");
  check("/parent links back to /learn", !!(await p.page.$('a[href="/learn"]')));
  await p.page.close();
}

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} checks FAILED` : `\nAll ${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
