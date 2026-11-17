// Browser check: /tester with an invite code, then /learn runs a turn. Server must run with TESTER_INVITES set
// (and a dummy key), ORIGIN=http://localhost:<port>, INVITE=<code>. Expect upstream failure -> scripted fallback, no errors.
import puppeteer from "puppeteer-core";
const O = process.env.ORIGIN || "http://localhost:3222", CODE = process.env.INVITE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
const errs = [], brainReqs = [];
p.on("pageerror", (e) => errs.push(String(e)));
p.on("console", (m) => { if (m.type() === "error" && !/status of 5\d\d|status of 40[0-9]/.test(m.text())) errs.push(m.text()); });
p.on("request", (r) => { if (r.url().includes("/api/brain") && r.method() === "POST") brainReqs.push(r.headers()["x-gleeful-tester"] === CODE); });
const out = [];
const chk = (n, ok) => { out.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}`); };
await p.goto(`${O}/tester`, { waitUntil: "networkidle2" });
await p.type("input", CODE);
await p.keyboard.press("Enter");
await p.waitForSelector('[data-testid="tester-saved"]', { timeout: 8000 }).then(() => chk("tester page accepts code", true), () => chk("tester page accepts code", false));
await p.goto(`${O}/learn`, { waitUntil: "networkidle2" });
await sleep(1500);
const btn = await p.$("button.primary, [data-testid=start]");
if (btn) await btn.click();
await sleep(12000);
chk("lesson runs (a brain POST carried the invite header)", brainReqs.length > 0 && brainReqs.every(Boolean));
chk("lesson shows teacher text/UI", await p.evaluate(() => document.body.innerText.length > 50));
await p.screenshot({ path: new URL("./out/invite-flow.png", import.meta.url).pathname });
chk(`no page errors (${errs.length})`, errs.length === 0);
if (errs.length) console.log(errs.slice(0, 5));
await b.close();
process.exit(out.every(Boolean) ? 0 : 1);
