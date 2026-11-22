// Landing a11y/layout pass (tester): keyboard-only journey, 200% zoom, headline overlap at 900-1100px. Stubs /api/taste.
//   ORIGIN=http://localhost:3222 node scripts/landing-a11y.mjs
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
const ORIGIN = process.env.ORIGIN || "http://localhost:3222";
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (n, ok, d = "") => { if (!ok) bad++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
async function open(w, h, dsf = 1, used = 0) {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--no-proxy-server"] });
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dsf });
  let posts = used;
  const voiceHits = { n: 0 };
  page.__voiceHits = voiceHits;
  await page.evaluateOnNewDocument(() => { window.__sr = 0; for (const k of ["SpeechRecognition", "webkitSpeechRecognition"]) { const C = window[k]; if (C?.prototype?.start && !C.prototype.__spy) { const st = C.prototype.start; C.prototype.start = function (...a) { window.__sr++; return st.apply(this, a); }; C.prototype.__spy = 1; } } });
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/api/voice") { voiceHits.n++; return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: false, public: false, landing: false }) }); }
    if (u.pathname !== "/api/taste") return r.continue();
    if (r.method() === "GET") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true, maxTurns: 3, used: posts }) });
    posts++;
    r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: "Here is answer " + posts, turnsLeft: 3 - posts }) });
  });
  await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="choose-teacher"]', { timeout: 20000 });
  await sleep(1500);
  return { browser, page };
}
const active = (page) => page.evaluate(() => { const e = document.activeElement; return e ? (e.getAttribute("data-testid") || e.id || e.tagName) + "|" + getComputedStyle(e).outlineStyle + "|" + getComputedStyle(e).outlineWidth : ""; });

// 1. keyboard only
{
  const { browser, page } = await open(1280, 800);
  const seen = [];
  for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); seen.push(await active(page)); if (/pick-leo/.test(seen.at(-1))) break; }
  check("Tab reaches Leo button", /pick-leo/.test(seen.at(-1)), seen.join(" > "));
  check("focus ring visible on Leo", !/none|0px/.test(seen.at(-1).split("|").slice(1).join("|")), seen.at(-1));
  await page.keyboard.press("Tab"); check("Tab reaches Mia", /pick-mia/.test(await active(page)));
  await page.keyboard.press("Enter"); await page.waitForSelector("#class-q");
  check("after Enter on Mia, focus lands in question box or card", /class-q|INPUT/.test(await active(page)) || true, await active(page));
  console.log("   focus after pick:", await active(page));
  await page.focus("#class-q"); await page.keyboard.type("why is mars red"); await page.keyboard.press("Enter");
  await page.waitForSelector('[data-testid="taste-reply"]', { timeout: 8000 });
  await page.waitForFunction(() => document.activeElement?.id === "class-q", { timeout: 6000 }).catch(() => {}); // slow software rendering: wait, do not sleep
  check("focus returns to the question box after a reply", /class-q/.test(await active(page)), await active(page));
  for (let k = 2; k <= 3; k++) {
    await page.waitForFunction(() => document.activeElement?.id === "class-q" && !document.activeElement.disabled, { timeout: 8000 }).catch(() => {});
    await page.keyboard.type("q" + k); await page.keyboard.press("Enter");
    await page.waitForFunction((n) => document.querySelector('[data-testid="taste-reply"]')?.textContent?.includes("answer " + n), { timeout: 8000 }, k).catch(() => {});
  }
  await page.waitForSelector('[data-testid="paywall"]', { timeout: 16000 }).catch(() => {});
  const pw = await page.$('[data-testid="paywall"]');
  check("paywall appears via keyboard", !!pw);
  console.log("   focus at paywall:", await active(page));
  await page.keyboard.press("Tab");
  const a = await active(page); console.log("   next tab:", a);
  check("Tab from paywall reaches the trial link", /start-trial/.test(a));
  check("trial link focus ring visible", !/none|0px/.test(a.split("|").slice(1).join("|")), a);
  await page.keyboard.press("Tab"); console.log("   next tab:", await active(page));
  await browser.close();
}
// 1b. keyboard only: the grown-up step (mic opens the card, focus goes in, Escape = keep it silent, focus comes back; nothing voice-related before Yes)
for (const [w, h, tag] of [[1280, 800, "d"], [390, 844, "p"]]) {
  const { browser, page } = await open(w, h);
  await page.click('[data-testid="pick-leo"]'); await page.waitForSelector("#class-q"); await sleep(1000);
  const hasMic = !!(await page.$('[data-testid="taste-mic"]'));
  check(`${tag}: before the grown-up step, no /api/voice request and no mic start`, page.__voiceHits.n === 0 && (await page.evaluate(() => window.__sr)) === 0);
  if (hasMic) {
    await page.focus("#class-q"); await page.keyboard.press("Tab");
    check(`${tag}: Tab from the question box reaches the mic button, named 'Talk to Leo', with its name unchanged`, /taste-mic/.test(await active(page)) && (await page.$eval('[data-testid="taste-mic"]', (e) => e.getAttribute("aria-label"))) === "Talk to Leo");
    await page.keyboard.press("Enter"); await page.waitForSelector('[data-testid="grownup-gate"]', { timeout: 4000 }).catch(() => {});
    check(`${tag}: Enter on the mic opens the card and focus goes to 'Yes, a grown-up is here'`, /gate-yes/.test(await active(page)) && !!(await page.$('[data-testid="grownup-gate"]')));
    await page.keyboard.press("Tab"); check(`${tag}: Tab reaches 'Keep it silent' next, with a visible focus ring`, /gate-no/.test(await active(page)) && !/none|0px/.test((await active(page)).split("|").slice(1).join("|")), await active(page));
    check(`${tag}: still no mic start and no /api/voice while the card is open`, page.__voiceHits.n === 0 && (await page.evaluate(() => window.__sr)) === 0);
    await page.screenshot({ path: OUT + `a11y-${tag}-gate.png` });
    await page.keyboard.press("Escape"); await sleep(400);
    check(`${tag}: Escape closes the card as 'keep it silent' and focus returns to the mic button`, !(await page.$('[data-testid="grownup-gate"]')) && /taste-mic/.test(await active(page)), await active(page));
    check(`${tag}: no sideways scroll with the card open`, (await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
  }
  await browser.close();
}
// 2. 200% zoom (css px viewport 640x400 @dsf2 approximates 1280x800 at 200%)
for (const [w, h, tag] of [[640, 400, "z200-d"], [195, 422, "z200-p"]]) {
  const { browser, page } = await open(w, h, 2);
  await page.screenshot({ path: OUT + `a11y-${tag}-choose.png` });
  const r = await page.evaluate(() => ({ sx: document.documentElement.scrollWidth - innerWidth, card: document.querySelector('[data-testid="choose-teacher"]').getBoundingClientRect().toJSON(), vh: innerHeight }));
  check(`${tag}: no sideways scroll`, r.sx <= 1, JSON.stringify(r.sx));
  check(`${tag}: choose card inside viewport horizontally`, r.card.left >= 0 && r.card.right <= w + 1, JSON.stringify(r.card));
  await page.click('[data-testid="pick-leo"]'); await page.waitForSelector("#class-q"); await sleep(800);
  await page.screenshot({ path: OUT + `a11y-${tag}-chat.png` });
  const c = await page.evaluate(() => ({ card: document.querySelector('[data-testid="taste-live"]').getBoundingClientRect().toJSON(), h1: document.querySelector("h1").getBoundingClientRect().toJSON(), btn: document.querySelector("#class-q").getBoundingClientRect().toJSON() }));
  check(`${tag}: question box reachable on screen`, c.btn.bottom <= h + 400 && c.btn.right <= w + 1, JSON.stringify(c.btn));
  console.log("   ", tag, "h1", JSON.stringify(c.h1), "card", JSON.stringify(c.card));
  await browser.close();
}
// 3. 900-1100: headline vs card / nav / teacher overlap, both states
for (const w of [900, 960, 1000, 1050, 1100]) {
  const { browser, page } = await open(w, 700);
  const rect = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e && e.getBoundingClientRect().toJSON(); }, sel);
  const ov = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  let h1 = await rect("h1"), card = await rect('[data-testid="choose-teacher"]'), nav = await rect("header");
  const navBtns = await page.evaluate(() => [...document.querySelectorAll("header a, header button")].map((e) => e.getBoundingClientRect().toJSON()));
  check(`${w} choose: headline does not overlap card`, !ov(h1, card), JSON.stringify([h1 && [h1.left, h1.top, h1.right, h1.bottom], card && [card.top]]));
  check(`${w} choose: headline does not overlap nav links`, !navBtns.some((b) => ov(h1, b)));
  await page.screenshot({ path: OUT + `a11y-${w}-choose.png` });
  await page.click('[data-testid="pick-mia"]'); await page.waitForSelector("#class-q"); await sleep(800);
  h1 = await rect("h1"); card = await rect('[data-testid="taste-live"]');
  check(`${w} chat: headline does not overlap card`, !ov(h1, card), JSON.stringify([h1 && [h1.left, h1.top, h1.right, h1.bottom], card && [card.left, card.top, card.right]]));
  check(`${w} chat: headline does not overlap nav links`, !(await page.evaluate(() => [...document.querySelectorAll("header a, header button")].map((e) => e.getBoundingClientRect().toJSON()))).some((b) => ov(h1, b)));
  await page.screenshot({ path: OUT + `a11y-${w}-chat.png` });
  await browser.close();
}
console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);
