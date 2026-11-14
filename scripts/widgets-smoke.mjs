// Teaching widgets (number line, fraction bars) end to end in headless Chrome, scripted mode (no AI needed).
// Usage: server on :3111 (npm run build:test && npx next start -p 3111), then `node scripts/widgets-smoke.mjs`.
// Phone size: W=390 H=844 TAG=p. Software rendering: says nothing about device fps.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const TARGET = process.env.SMOKE_URL || "http://localhost:3111/learn?test=1";
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720), TAG = process.env.TAG || "d";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${detail}`); };

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const shot = (n) => page.screenshot({ path: `${OUT}${TAG}-w-${n}.png` });
const waitSel = (sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms }).then(() => true, () => false);
const gone = (sel, ms = 8000) => page.waitForSelector(sel, { hidden: true, timeout: ms }).then(() => true, () => false);
const idleWith = async (id, ms = 25000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ok = await page.evaluate((i) => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle" && !!document.querySelector(`[data-testid="choice-${i}"]`), id);
    if (ok) return true;
    await sleep(100);
  }
  return false;
};
const words = async () => {
  if (!(await page.$(".words"))) await page.click('button[aria-label="Show the words"]');
  await sleep(150);
  return page.$eval(".words", (e) => e.textContent || "").catch(() => "");
};
const waitWords = async (re, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (re.test(await words())) return true; await sleep(250); } return false; };
const box = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });

await page.goto(TARGET, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas", { timeout: 30000 });
await sleep(2000);
await page.click('[data-testid="pick-leo"]');
await sleep(400);
await page.click('[data-testid="start"]');
check("lesson starts", await waitSel('[data-testid="demo-badge"]'));
check("greeting offers fraction bars", await idleWith("fractions"));
const chips = await page.$$eval(".top .chip", (e) => e.length);
check("one badge in the header (not three)", chips === 1, `(${chips})`);
await shot("01-greeting");

// ---- badge info
await page.click('[data-testid="demo-badge"]');
check("badge (i) opens the details", await waitSel('[data-testid="badge-info"]', 2000));
await shot("02-badge-info");
await page.click(".badge-info .ghost");
check("details close", await gone('[data-testid="badge-info"]', 2000));

// ---- fraction bars
await page.click('[data-testid="choice-fractions"]');
check("fraction bars appear", await waitSel('[data-testid="widget"][data-kind="fraction_bars"]'));
await page.waitForFunction(() => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle", { timeout: 25000 }).catch(() => {});
await shot("03-fraction-bars");
const wb = await box('[data-testid="widget"]');
check("widget fits on screen", wb.x >= 0 && wb.r <= W + 1 && wb.b <= H + 1, JSON.stringify(wb));
const parts = await page.$$(".fb-row.mine .fb-part");
check("child bar has 4 tappable parts, each at least 44px tall", parts.length === 4 && (await Promise.all(parts.map((p) => p.boundingBox()))).every((b) => b && b.height >= 44));
const send = '[data-testid="widget-send"]';
check("Tell button is off until something is shaded", await page.$eval(send, (b) => b.disabled));
await parts[0].click();
await sleep(150);
check("Tell button on after shading", !(await page.$eval(send, (b) => b.disabled)));
await page.click(send); // 1/4: wrong
check("a wrong shading gets an honest 'not quite'", await waitWords(/Not quite/));
await page.waitForFunction(() => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle", { timeout: 25000 }).catch(() => {});
check("widget stays up so the child can try again", !!(await page.$('[data-testid="widget"]')));
await (await page.$$(".fb-row.mine .fb-part"))[1].click();
await sleep(150);
await page.click(send); // 2/4 = 1/2: right
check("an equal fraction (2/4 for 1/2) is accepted", await waitWords(/Yes, that's it/));
check("then offers what next", await idleWith("numberline"));
await shot("04-fraction-correct");

// ---- number line
await page.click('[data-testid="choice-numberline"]');
check("number line appears", await waitSel('[data-testid="widget"][data-kind="number_line"]'));
await page.waitForFunction(() => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle", { timeout: 25000 }).catch(() => {});
const nl = await box("svg.nl");
check("number line fits on screen", nl.x >= 0 && nl.r <= W + 1 && nl.b <= H + 1, JSON.stringify(nl));
// tap at 1/4 of the way along the real line (viewBox 360, pad 26)
const tapAt = async (frac) => { const b = await box("svg.nl"); await page.mouse.click(b.x + ((26 + (360 - 52) * frac) / 360) * b.w, b.y + b.h * 0.55); };
await tapAt(0.25);
await sleep(150);
const label1 = await page.$eval(".nl-pick-label", (e) => e.textContent).catch(() => null);
check("tapping the line snaps to the nearest tick (1/4)", label1 === "1/4", JSON.stringify(label1));
const sizes = await page.$$eval(".widget-actions button", (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; }));
check("every widget button is at least 44px", sizes.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(sizes));
await page.click(send);
check("wrong spot: not quite", await waitWords(/Not quite/));
await page.waitForFunction(() => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle", { timeout: 25000 }).catch(() => {});
await page.click('button[aria-label="Move one step right"]');
await page.click('button[aria-label="Move one step right"]');
await sleep(150);
check("nudging right twice reaches 3/4", (await page.$eval(".nl-pick-label", (e) => e.textContent)) === "3/4");
await shot("05-number-line");
await page.click(send);
check("three quarters is right", await waitWords(/Yes, that's it/));

// ---- close
await page.waitForFunction(() => document.querySelector('[data-testid="state"]')?.getAttribute("data-state") === "idle", { timeout: 25000 }).catch(() => {});
await page.click(".widget-close");
check("the child can close the widget", await gone('[data-testid="widget"]', 2000));
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const bad = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - bad.length}/${checks.length} checks passed`);
process.exit(bad.length ? 1 : 0);
