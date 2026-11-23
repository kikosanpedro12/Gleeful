import puppeteer from "puppeteer-core";
const b=await puppeteer.launch({executablePath:"/usr/bin/google-chrome",headless:"new",args:["--no-sandbox","--no-proxy-server","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]});
for (const rig of ["glb","procedural"]) for (const [tag,w,h] of [["d",1280,800],["p",390,844]]){
 const p=await b.newPage(); await p.setViewport({width:w,height:h}); const errs=[];
 p.on("console",m=>{if(/Refused|Content-Security/i.test(m.text())||m.type()==="error")errs.push(m.text())}); p.on("pageerror",e=>errs.push(String(e)));
 await p.goto(`http://localhost:3222/learn?test=1&rig=${rig}`,{waitUntil:"domcontentloaded",timeout:60000}); await new Promise(r=>setTimeout(r,12000));
 await p.screenshot({path:`/tmp/tt/choose-${rig}-${tag}.png`});
 console.log(rig,tag,"overflowX",await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),"errs",JSON.stringify(errs).slice(0,300));
 await p.close();
}
await b.close();
