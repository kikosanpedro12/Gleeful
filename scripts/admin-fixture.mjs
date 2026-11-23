// DEV ONLY: builds scripts/out/admin-fixture (SAMPLE data, never part of the app) and shoots it.
//   node scripts/admin-fixture.mjs            builds + screenshots desktop (1280) and phone (390), full and empty, and checks the chart by keyboard
import { build } from "vite";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const out = path.join(root, "scripts/out/admin-fixture");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "src"), { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>admin fixture</title></head><body style="margin:0"><div id="root"></div><script type="module" src="/entry.tsx"></script></body></html>`);
fs.copyFileSync(path.join(root, "scripts/admin-fixture/entry.tsx"), path.join(out, "entry.tsx"));
const shim = path.join(out, "link-shim.tsx");
fs.writeFileSync(shim, `export default function Link({ href, prefetch, ...p }: any) { return <a href={href} {...p} />; }`);
await build({
  root: out, logLevel: "warn", configFile: false,
  esbuild: { jsx: "automatic" },
  define: { "process.env.NODE_ENV": '"production"' },
  resolve: { alias: [{ find: "next/link", replacement: shim }, { find: "@tests", replacement: path.join(root, "tests") }, { find: "@", replacement: path.join(root, "src") }] },
  build: { outDir: path.join(out, "dist"), emptyOutDir: true },
});
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"); const f = path.join(out, "dist", u.pathname === "/" ? "index.html" : u.pathname);
  if (!f.startsWith(path.join(out, "dist")) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); res.end(fs.readFileSync(f));
}).listen(0);
const port = srv.address().port;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--no-proxy-server"] });
let bad = 0; const ck = (n, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}`); if (!ok) bad++; };
for (const [w, h, tag] of [[1280, 900, "d"], [390, 844, "p"]]) {
  for (const state of ["full", "empty"]) {
    const page = await browser.newPage(); await page.setViewport({ width: w, height: h });
    const errs = []; page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(`http://localhost:${port}/?range=30#${state}`); await page.reload(); await page.waitForSelector("[data-testid=admin]");
    await page.screenshot({ path: path.join(root, `scripts/out/admin-${tag}-${state}.png`), fullPage: true });
    ck(`${tag}/${state}: no console errors`, errs.length === 0);
    ck(`${tag}/${state}: no horizontal page scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (state === "full") {
      await page.focus("[data-testid=chart-box]"); await page.keyboard.press("ArrowLeft");
      ck(`${tag}: arrow key shows a day in the readout`, /Trials started/.test(await page.$eval("[data-testid=chart-readout]", (e) => e.textContent)));
      await page.click("[aria-pressed]"); ck(`${tag}: legend toggle flips aria-pressed`, (await page.$eval("[aria-pressed]", (e) => e.getAttribute("aria-pressed"))) === "false");
      await page.type("#fb-q", "maths"); ck(`${tag}: feedback filter`, /Showing 1 of 2/.test(await page.$eval("[data-testid=fb-count]", (e) => e.textContent)));
      const small = await page.evaluate(() => [...document.querySelectorAll(".ad a, .ad button, .ad input")].filter((e) => !e.closest("li") && e.getBoundingClientRect().height < 43).map((e) => e.textContent.slice(0, 20)));
      ck(`${tag}: controls >= 44px high ${small.join("|")}`, small.length === 0);
      await page.screenshot({ path: path.join(root, `scripts/out/admin-${tag}-full-top.png`) });
    }
    await page.close();
  }
}
await browser.close(); srv.close(); process.exit(bad ? 1 : 0);
