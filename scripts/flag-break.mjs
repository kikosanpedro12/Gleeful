// Tester: flag logic break run. ORIGIN=... EXPECT_DEFAULT=glb|procedural
import puppeteer from "puppeteer-core";
const ORIGIN = process.env.ORIGIN, DEF = process.env.EXPECT_DEFAULT || "glb";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (n, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${n} ${d}`); };
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new",
  args: ["--no-sandbox", "--no-proxy-server", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
async function run(name, path, { init, block, settle = 6000 } = {}) {
  const page = await browser.newPage(); const errs = [], glb = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" || /Refused|Content Security/i.test(m.text())) errs.push(m.text()); });
  if (block) { await page.setRequestInterception(true); page.on("request", (r) => /\.glb/.test(r.url()) ? r.abort() : r.continue()); }
  page.on("request", (r) => { if (/\.glb/.test(r.url())) glb.push(r.url().split("/").pop()); });
  if (init) await page.evaluateOnNewDocument(init);
  await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas", { timeout: 40000 }).catch(() => {});
  await sleep(settle);
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 0));
  console.log(name, "glb requests:", glb.join(",") || "none", "errs:", errs.length);
  return { page, errs, glb };
}
const wantGlb = (g) => g.includes("leo.glb");
let r;
r = await run("poisoned storage 'glb'", "/learn", { init: () => sessionStorage.setItem("gleeful.rig", "glb") });
check("poison 'glb' = default", wantGlb(r.glb) === (DEF === "glb") && !r.errs.length, r.errs.join("|")); await r.page.close();
r = await run("poisoned storage junk", "/learn", { init: () => sessionStorage.setItem("gleeful.rig", "__proto__") });
check("junk ignored", wantGlb(r.glb) === (DEF === "glb") && !r.errs.length, r.errs.join("|")); await r.page.close();
r = await run("poisoned storage 'procedural'", "/learn", { init: () => sessionStorage.setItem("gleeful.rig", "procedural") });
check("stored procedural honoured", r.glb.length === 0 && !r.errs.length, r.errs.join("|")); await r.page.close();
const throwing = () => { Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("denied", "SecurityError"); } }); };
r = await run("sessionStorage getter throws", "/learn", { init: throwing });
check("throwing storage: default", wantGlb(r.glb) === (DEF === "glb") && !r.errs.length, r.errs.join("|")); await r.page.close();
r = await run("sessionStorage throws + ?rig=procedural", "/learn?rig=procedural", { init: throwing });
check("throwing storage + procedural param honoured", r.glb.length === 0 && !r.errs.length, r.errs.join("|")); await r.page.close();
r = await run("sessionStorage throws + ?rig=glb", "/learn?rig=glb", { init: throwing });
check("throwing storage + glb param honoured", wantGlb(r.glb) && !r.errs.length, r.errs.join("|")); await r.page.close();
const throwOps = () => { const p = Storage.prototype; p.getItem = p.setItem = p.removeItem = function () { throw new Error("quota"); }; };
r = await run("Storage methods throw + ?rig=procedural", "/learn?rig=procedural", { init: throwOps });
check("method-throw: procedural honoured", r.glb.length === 0 && !r.errs.length, r.errs.join("|")); await r.page.close();
r = await run("Storage methods throw, default", "/learn", { init: throwOps });
check("method-throw: default", wantGlb(r.glb) === (DEF === "glb") && !r.errs.length, r.errs.join("|")); await r.page.close();
// duplicate/odd params
for (const q of ["?rig=glb&rig=procedural", "?rig=procedural&rig=glb", "?rig=%70rocedural", "?rig=procedural%00", "?rig[]=procedural", "?rig=glb%20"]) {
  r = await run("query " + q, "/learn" + q);
  console.log("   stored:", await r.page.evaluate(() => sessionStorage.getItem("gleeful.rig")));
  check("no errors " + q, !r.errs.length, r.errs.join("|")); await r.page.close();
}
// procedural then ?rig=glb in one tab
{
  const page = await browser.newPage(); const glb = [];
  page.on("request", (q) => { if (/\.glb/.test(q.url())) glb.push(q.url().split("/").pop()); });
  await page.goto(ORIGIN + "/learn?rig=procedural", { waitUntil: "domcontentloaded" }); await sleep(4000);
  await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" }); await sleep(4000);
  await page.goto(ORIGIN + "/learn", { waitUntil: "domcontentloaded" }); await sleep(4000);
  check("landing->learn keeps procedural", glb.length === 0, glb.join());
  await page.goto(ORIGIN + "/learn?rig=glb", { waitUntil: "domcontentloaded" }); await sleep(7000);
  check("?rig=glb after procedural loads GLB", wantGlb(glb), glb.join());
  // client-side nav (SPA) from landing
  await page.close();
}
// GLB blocked -> fallback
r = await run("GLB blocked", "/learn?rig=glb", { block: true, settle: 14000 });
const ok = await r.page.evaluate(() => !!document.querySelector("canvas") && document.body.innerText.length > 50);
check("blocked glb: page alive, canvas present, no page errors", ok && !r.errs.some((e) => !/Failed to load resource|ERR_FAILED/i.test(e)), r.errs.join("|"));
await r.page.screenshot({ path: `/tmp/tp/scripts/out/flag-blocked-${DEF}.png` }).catch(()=>{});
await r.page.close();
await browser.close(); console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
