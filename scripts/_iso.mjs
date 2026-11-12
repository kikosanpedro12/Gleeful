import puppeteer from "puppeteer-core";
const ORIGIN="http://localhost:3112";
const b = await puppeteer.launch({ executablePath:"/usr/bin/google-chrome", headless:"new", args:["--no-sandbox","--no-proxy-server","--use-angle=swiftshader","--enable-unsafe-swiftshader","--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"]});
const p = await b.newPage(); const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,200))); p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,160))});
const att=(o)=>({skill:"science.mars.red_color",questionId:"q_red",answerId:"rust",correct:true,hintsUsed:0,context:"taught",at:"2026-01-01T00:00:00Z",...o});
for (const [n,a] of Object.entries({constructor:att({skill:"constructor"}),proto:att({skill:"__proto__"}),toString:att({skill:"toString"}),hasOwnProperty:att({skill:"hasOwnProperty"}),badAt:att({at:"garbage",session:"abc"}),nullAt:att({at:null}),hints1e9:att({hintsUsed:1e9}),sessions1e308:null})) {
  errs.length=0;
  await p.goto(ORIGIN+"/parent",{waitUntil:"domcontentloaded"});
  await p.evaluate((v)=>localStorage.setItem("aiteacher.learner.v1",v), JSON.stringify(a?{version:1,sessions:1,attempts:[a]}:{version:1,sessions:1e308,attempts:[]}));
  await p.goto(ORIGIN+"/parent",{waitUntil:"domcontentloaded"}); await new Promise(r=>setTimeout(r,1200));
  const t=await p.evaluate(()=>document.body.innerText.slice(0,300).replace(/\n+/g," / "));
  console.log(n.padEnd(15), /Parent view/.test(t)?"OK  ":"DEAD", t.slice(0,140), "|", errs[0]??"");
}
await b.close();
