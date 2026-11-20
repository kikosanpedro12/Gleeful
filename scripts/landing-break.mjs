// Landing break run (tester): hostile /api/taste answers, errors, double-taps, no WebGL, reduced motion, CSP, console.
//   ORIGIN=http://localhost:3222 node scripts/landing-break.mjs     (stubs /api/taste: no model spend)
import puppeteer from "puppeteer-core";
const ORIGIN = process.env.ORIGIN || "http://localhost:3222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (n, ok, d = "") => { if (!ok) bad++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
const base = ["--no-sandbox", "--no-proxy-server"];
async function run(args, fn, opts = {}) {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new", args: [...base, ...args] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`)));
  await page.setViewport({ width: 1280, height: 800 });
  if (opts.rm) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const st = { posts: 0, handler: null, delay: 0 };
  await page.setRequestInterception(true);
  page.on("request", async (r) => {
    const u = new URL(r.url());
    if (u.pathname !== "/api/taste") return r.continue();
    if (r.method() === "GET") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true, maxTurns: 3, used: 0 }) });
    st.posts++;
    if (st.delay) await sleep(st.delay);
    const h = st.handler ? st.handler(st.posts) : { status: 200, body: { reply: "ok", turnsLeft: 2 } };
    r.respond({ status: h.status, contentType: "application/json", body: typeof h.body === "string" ? h.body : JSON.stringify(h.body) });
  });
  await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="choose-teacher"]', { timeout: 20000 });
  try { await fn(page, st, errors); } finally { await browser.close(); }
}

// 1. No WebGL: page works, still image, tutor choice and asking still work.
await run(["--disable-gpu", "--disable-3d-apis", "--disable-webgl", "--disable-webgl2"], async (page, st, errors) => {
  check("no-WebGL: still image instead of canvas", !(await page.$(".lp-class-stage canvas")) && !!(await page.$(".lp-class-still")));
  await page.click('[data-testid="pick-leo"]'); await page.waitForSelector("#class-q");
  await page.type("#class-q", "hello"); await page.keyboard.press("Enter");
  await page.waitForSelector('[data-testid="taste-reply"]', { timeout: 8000 }).catch(() => {});
  check("no-WebGL: a try still works", st.posts === 1 && !!(await page.$('[data-testid="taste-reply"]')));
  check("no-WebGL: no console errors", errors.length === 0, errors.slice(0, 2).join("|"));
});

// 2. Hostile answers: markup in reply, evil scene, giant reply, negative / NaN turnsLeft.
await run([], async (page, st, errors) => {
  await page.evaluate(() => { window.__x = 0; });
  st.handler = () => ({ status: 200, body: { reply: '<img src=x onerror="window.__x=1"><script>window.__x=2</script>**hi** https://evil.example', turnsLeft: -5, scene: { setting: "__proto__", era: "<b>x</b>", props: ["evil", "../../etc"], url: "javascript:window.__x=3" } } });
  await page.click('[data-testid="pick-mia"]'); await page.waitForSelector("#class-q");
  await page.type("#class-q", "x"); await page.keyboard.press("Enter");
  await page.waitForSelector('[data-testid="taste-reply"]', { timeout: 8000 }).catch(() => {});
  const x = await page.evaluate(() => window.__x);
  check("hostile reply is rendered as text, nothing executes", x === 0);
  check("hostile reply creates no <img>/<script> in the card", (await page.$('[data-testid="taste-live"] img, [data-testid="taste-live"] script')) === null);
  check("hostile scene is not shown", (await page.$('[data-testid="story"]')) === null);
  check("negative turnsLeft clamps to 'used all' (paywall follows)", /3 of 3/.test(await page.$eval('[data-testid="taste-count"]', (e) => e.textContent).catch(() => "")));
  check("no CSP/console errors with hostile data", errors.length === 0, errors.slice(0, 2).join("|"));
});

// 3. Errors: 429 rate_limited, 503 busy, 502, non-JSON 200, network abort. The box must recover and never lock up.
await run([], async (page, st, errors) => {
  await page.click('[data-testid="pick-leo"]'); await page.waitForSelector("#class-q");
  const cases = [
    [429, { error: "rate_limited" }], [503, { error: "taste_busy" }], [502, { error: "upstream_failed" }],
    [200, "not json"], [200, { reply: 5 }], [200, { reply: "" }], [500, "<html>"],
  ];
  for (const [status, body] of cases) {
    st.handler = () => ({ status, body });
    await page.type("#class-q", "again", { delay: 0 }); await page.keyboard.press("Enter");
    await sleep(500);
    const thinking = await page.$('[data-testid="taste-thinking"]');
    const disabled = await page.$eval("#class-q", (e) => e.disabled).catch(() => false);
    check(`error ${status} ${JSON.stringify(body).slice(0, 24)}: box not stuck`, !thinking && !disabled);
    await page.$eval("#class-q", (e) => { e.value = ""; }).catch(() => {});
  }
  check("errors never count a try", /0 of 3|^$/.test(await page.$eval('[data-testid="taste-count"]', (e) => e.textContent).catch(() => "0 of 3")));
  check("no pageerror on failures", errors.length === 0, errors.slice(0, 2).join("|"));
});

// 4. Rapid repeat: Enter x5 and button spam during a slow answer = exactly one request.
await run([], async (page, st) => {
  st.delay = 1200;
  await page.click('[data-testid="pick-mia"]'); await page.waitForSelector("#class-q");
  await page.type("#class-q", "spam");
  for (let i = 0; i < 5; i++) await page.keyboard.press("Enter");
  await page.click("button[type=submit], .lp-ask").catch(() => {});
  await page.click(".lp-chip").catch(() => {});
  await sleep(2500);
  check("rapid Enter/click while busy sends exactly one request", st.posts === 1, `posts=${st.posts}`);
});

// 5. Reduced motion: no console errors, page renders, tutor choice works.
await run([], async (page, st, errors) => {
  await page.click('[data-testid="pick-leo"]'); await page.waitForSelector("#class-q");
  check("reduced motion: works without errors", errors.length === 0, errors.slice(0, 2).join("|"));
}, { rm: true });

console.log(bad ? `\n${bad} FAILED` : "\nAll break checks passed");
process.exit(bad ? 1 : 0);
