// Production build, NO test hooks: GLB teachers are the DEFAULT; ?rig=procedural is the sticky escape hatch (?rig=glb clears it); ?perf=1 overlay.
//   npm run build && npx next start -p 3333   (a deployment build, never build:test)
//   ORIGIN=http://localhost:3333 [W=390 H=844 TAG=p] [RM=1] node scripts/preview-smoke.mjs
// Software rendering: checks behaviour, never fps quality (the overlay only has to show numbers).
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const ORIGIN = process.env.ORIGIN || "http://localhost:3333";
const OUT = fileURLToPath(new URL("./out/", import.meta.url)); fs.mkdirSync(OUT, { recursive: true });
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720), TAG = process.env.TAG || "d";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (n, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function visit(path, { settle = 9000, waitOverlay = false } = {}) {
  const page = await browser.newPage();
  if (process.env.RM) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.setViewport({ width: W, height: H });
  const errors = [], glb = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" || /Refused|Content Security/i.test(m.text())) errors.push(m.text()); });
  page.on("response", (r) => { if (/\/assets\/characters\/[^?]*\.glb/.test(r.url())) glb.push(r.status() + " " + r.url().split("/").pop()); });
  await page.evaluateOnNewDocument(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`)));
  await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("canvas", { timeout: 40000 }).catch(() => {});
  if (waitOverlay) await page.waitForFunction(() => /GLB load: .*\d+ ms/.test(document.querySelector('[data-testid="perf-overlay"]')?.textContent || ""), { timeout: 60000 }).catch(() => {});
  await sleep(settle);
  const hooks = await page.evaluate(() => ({ teachers: !!window.__teachers, ctl: !!window.__ctl, rinfo: !!window.__renderInfo, fx: !!window.__fx }));
  return { page, errors, glb, hooks };
}
const overlayOf = (page) => page.evaluate(() => { const o = document.querySelector('[data-testid="perf-overlay"]'); return o ? { text: o.textContent, hidden: o.getAttribute("aria-hidden") } : null; });
const noindex = (page) => page.evaluate(() => [...document.querySelectorAll('meta[name="robots"]')].map((m) => m.content).join(","));

const stored = (page) => page.evaluate(() => sessionStorage.getItem("gleeful.rig"));
const nav = async (page, url, ms = 7000) => { await page.goto(ORIGIN + url, { waitUntil: "domcontentloaded" }); await page.waitForSelector("canvas", { timeout: 40000 }); await sleep(ms); };
// 1. /learn default + ?perf=1 (no rig param): GLB loads
{
  const { page, errors, glb, hooks } = await visit("/learn?perf=1", { waitOverlay: true });
  check("learn default: no test hooks in production", !hooks.teachers && !hooks.ctl && !hooks.rinfo && !hooks.fx, JSON.stringify(hooks));
  check("learn default: both teachers + clips fetched (200)", ["leo.glb", "mia.glb", "clips.glb"].every((f) => glb.includes("200 " + f)), glb.join(","));
  const o = await overlayOf(page);
  console.log("overlay:", JSON.stringify(o));
  check("learn: overlay shown, aria-hidden", !!o && o.hidden === "true");
  check("learn: overlay has fps, tris, draws, GLB load ms", !!o && /\d+(\.\d)? fps/.test(o.text) && /\d+ tris/.test(o.text) && /\d+ draws/.test(o.text) && /GLB load: .*\d+ ms/.test(o.text), o?.text);
  check("learn: overlay says measured on this device", !!o && /measured on this device/.test(o.text));
  check("learn: noindex kept", /noindex/.test(await noindex(page)), await noindex(page));
  check("learn: nothing stored by default", (await stored(page)) === null);
  await page.screenshot({ path: `${OUT}${TAG}-prod-learn-default.png` });
  glb.length = 0;
  await nav(page, "/learn");
  check("learn: no overlay without ?perf=1", (await overlayOf(page)) === null);
  check("learn: still GLB without params", glb.some((x) => x === "200 clips.glb"), glb.join(","));
  // escape hatch, sticky for the session
  glb.length = 0;
  await nav(page, "/learn?rig=procedural", 5000);
  check("escape hatch: ?rig=procedural requests no .glb and is stored", glb.length === 0 && (await stored(page)) === "procedural", glb.join(","));
  await nav(page, "/learn", 5000);
  check("escape hatch: sticky on the next page without the param (no .glb)", glb.length === 0, glb.join(","));
  await nav(page, "/?perf=1", 5000);
  check("escape hatch: sticky on landing too; no overlay (GLB rig is off)", glb.length === 0 && (await overlayOf(page)) === null, glb.join(","));
  await nav(page, "/learn?rig=glb", 8000);
  check("?rig=glb clears the escape hatch and GLB loads again", (await stored(page)) === null && glb.some((x) => x === "200 clips.glb"), glb.join(","));
  check("learn: no page errors or CSP violations", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}
// 2. landing default: GLB teachers in the classroom, no overlay, no hooks
{
  const { page, errors, glb, hooks } = await visit("/", { settle: 12000 });
  check("landing default: no test hooks in production", !hooks.teachers && !hooks.ctl && !hooks.rinfo, JSON.stringify(hooks));
  check("landing default: GLB teachers loaded", ["leo.glb", "mia.glb", "clips.glb"].every((f) => glb.includes("200 " + f)), glb.join(","));
  check("landing: no overlay without ?perf=1", (await overlayOf(page)) === null);
  console.log("landing robots meta:", (await noindex(page)) || "(none)");
  await page.screenshot({ path: `${OUT}${TAG}-prod-landing-default.png` });
  check("landing: no page errors or CSP violations", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}
// 3. landing ?rig=procedural: no .glb
{
  const { page, errors, glb } = await visit("/?rig=procedural", { settle: 8000 });
  check("landing ?rig=procedural: no .glb requested", glb.length === 0, glb.join(","));
  await page.screenshot({ path: `${OUT}${TAG}-prod-landing-procedural.png` });
  check("landing ?rig=procedural: no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}
// 4. hostile values are ignored: the default (GLB) stands, nothing stored
for (const path of ["/learn?rig=GLB", "/learn?rig=PROCEDURAL", "/learn?rig=http://x/y.glb", "/learn?rig=__proto__"]) {
  const { page, errors, glb } = await visit(path, { settle: 7000 });
  check(`hostile ${path}: default GLB stands`, glb.some((x) => x === "200 clips.glb"), glb.join(","));
  check(`hostile ${path}: nothing stored, no page errors`, (await stored(page)) === null && errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
