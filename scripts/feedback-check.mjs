import puppeteer from "puppeteer-core";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/usr/bin/google-chrome",headless:"new",args:["--no-sandbox","--no-proxy-server","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]});
const B="http://localhost:3222";
for (const [tag,w,h] of [["d",1280,800],["p",390,844]]){
 const p=await b.newPage(); await p.setViewport({width:w,height:h});
 const msgs=[]; p.on("console",m=>{if(/Refused|Content-Security/i.test(m.text()))msgs.push(m.text())}); p.on("pageerror",e=>msgs.push(String(e)));
 await p.goto(B+"/feedback",{waitUntil:"networkidle0"});
 const ov=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 // empty
 await p.click('[data-testid=fb-send]'); await sleep(200);
 console.log(tag,"empty:",await p.$eval('[data-testid=fb-note]',e=>e.textContent), "hOverflow",ov);
 // keyboard: focus textarea, type, tab to email, tab to send (honeypot skipped), Enter
 await p.focus('#fb-message'); await p.keyboard.type("Great lesson");
 await p.keyboard.press("Tab"); const f1=await p.evaluate(()=>document.activeElement.id);
 await p.keyboard.press("Tab"); const f2=await p.evaluate(()=>document.activeElement.dataset.testid);
 await p.keyboard.press("Enter"); await sleep(800);
 console.log(tag,"tab order",f1,f2,"->",await p.$eval('[data-testid=fb-note]',e=>e.textContent));
 // over 2000 paste
 await p.$eval('#fb-message',e=>e.value=''); await p.focus('#fb-message');
 await p.evaluate(()=>navigator.clipboard&&0);
 await p.keyboard.type("a".repeat(2100),{delay:0});
 console.log(tag,"len after 2100 typed",await p.$eval('#fb-message',e=>e.value.length));
 // honeypot via JS: sends website value
 let sent=null; await p.setRequestInterception(true); p.on("request",r=>{ if(r.url().endsWith("/api/feedback")) sent=r.postData(); r.continue();});
 await p.evaluate(()=>{});
 await p.screenshot({path:`/tmp/tt/fb-${tag}.png`,fullPage:true});
 console.log(tag,"console issues",JSON.stringify(msgs));
 await p.close();
}
await b.close();
