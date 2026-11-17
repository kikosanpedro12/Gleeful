// Loads /voice-lab, reports CSP violations, page errors and any /api/voice requests (should be none on load).
import puppeteer from "puppeteer-core";
const URL_ = process.env.URL_ || "http://localhost:3222/voice-lab";
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--no-proxy-server"] });
const p = await b.newPage();
const csp = [], errs = [], reqs = [];
p.on("pageerror", (e) => errs.push(String(e)));
p.on("console", (m) => { const t = m.text(); if (/Content-Security-Policy|Refused/i.test(t)) csp.push(t); else if (m.type() === "error" && !/favicon|404/.test(t)) errs.push(t); });
p.on("request", (r) => { if (/api\/voice/.test(r.url())) reqs.push(r.method() + " " + r.url()); });
await p.goto(URL_, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));
const text = await p.evaluate(() => document.body.innerText);
console.log("el-1 present:", /el-1/i.test(text), "| csp:", csp.length, "| errors:", errs.length, "| api/voice requests on load:", reqs);
csp.concat(errs).forEach((x) => console.log(" ", x.slice(0, 200)));
await b.close();
process.exit(csp.length || errs.length ? 1 : 0);
