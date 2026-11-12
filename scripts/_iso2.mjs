import puppeteer from "puppeteer-core";
const T="http://localhost:3112/?test=1"; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b = await puppeteer.launch({ executablePath:"/usr/bin/google-chrome", headless:"new", args:["--no-sandbox","--no-proxy-server","--use-angle=swiftshader","--enable-unsafe-swiftshader","--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"]});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const st=()=>p.evaluate(()=>{const el=document.querySelector('[data-testid="state"]');return {state:el?.getAttribute("data-state"),world:el?.getAttribute("data-world"),choices:[...document.querySelectorAll('[data-testid^="choice-"]')].map(b=>b.getAttribute("data-testid").slice(7)),q:!!document.querySelector('[data-testid="question"]'),banner:document.querySelector('.banner,[role="status"],[data-testid="banner"]')?.textContent??"",mic:document.querySelector('[data-testid="mic"]')?.outerHTML.slice(0,120)}});
const words=async()=>{await p.click('button[aria-label="Show words"]');const w=await p.evaluate(()=>[...document.querySelectorAll(".words p")].map(x=>x.textContent));await p.click('button[aria-label="Show words"]');return w;};
const type=async t=>{await p.evaluate(()=>{if(!document.querySelector('[data-testid="text-input"]'))[...document.querySelectorAll("button")].find(x=>x.textContent?.includes("⌨"))?.click()});await p.waitForSelector('[data-testid="text-input"]');await p.type('[data-testid="text-input"]',t);await p.keyboard.press("Enter");};
const mode=process.argv[2];
await p.goto(T,{waitUntil:"domcontentloaded"}); await p.evaluate(()=>localStorage.clear()); await p.goto(T,{waitUntil:"domcontentloaded"}); await p.waitForSelector('[data-testid="pick-leo"]',{timeout:30000}); await sleep(1500);
await p.click('[data-testid="pick-leo"]'); await sleep(250); await p.click('[data-testid="start"]');
for(let i=0;i<200;i++){const s=await st(); if(s.state==="idle"&&s.choices.length)break; await sleep(100);}
console.log("after greet", JSON.stringify(await st()));
if(mode==="type"){ for (const t of ["<b>x</b>","asdf qwer"]) { await type(t); await sleep(4000); console.log("after",JSON.stringify(t),JSON.stringify(await st())); } }
if(mode==="typefast"){ for (const t of ["<b>x</b>","asdf","zzz","qq"]) { await type(t); await sleep(300);} await sleep(8000); console.log("after fast junk",JSON.stringify(await st())); }
if(mode==="mic"){ await p.click('[data-testid="mic"]'); for(let i=0;i<12;i++){await sleep(500); console.log(i*500, JSON.stringify(await st()));} }
console.log((await words()).slice(-6).join("\n  "));
await b.close();
