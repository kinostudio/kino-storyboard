"use strict";

// Isolated continuous-frame output, geometry, VO and schedule-count coverage.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const browserPath = (process.env.PLAYWRIGHT_EXECUTABLE_PATH || chromium.executablePath());
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\//, "") || "index.html";
  const file = path.resolve(dist, relative);
  if (file !== dist && !file.startsWith(dist + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, bytes) => {
    if (error) return response.writeHead(404).end();
    const ext = path.extname(file);
    response.setHeader("Content-Type", ext === ".css" ? "text/css" : ext === ".html" ? "text/html" : ext === ".svg" ? "image/svg+xml" : "text/javascript");
    response.setHeader("Cache-Control", "no-store");
    response.end(bytes);
  });
});


async function ready(page) {
 await page.waitForFunction(()=>{const doc=document.querySelector("#print-document");return doc?.querySelector(".output-page")&&!document.querySelector("#print-output")?.disabled&&!doc.querySelector(".output-capture-progress,.output-capture-blocked")},null,{timeout:30000});
 await page.waitForTimeout(150);
}
async function main(){
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const browser=await chromium.launch({headless:true,executablePath:browserPath});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("http://127.0.0.1:"+server.address().port);
 await page.getByRole("button",{name:"新建專案",exact:true}).click();
 await page.locator("body.project-ready").waitFor();
 await page.evaluate(async()=>{
  const m=StoryModel,scene=m.getProject().scenes[0].id;
  const id=await m.addShot(scene,{title:"連續推近",visual:"起點全景",script:"VO-A",duration:8});
  await m.addSequenceFrame(id,null,{visual:"中點中景",script:"VO-B"});
  await m.addSequenceFrame(id,null,{visual:"終點特寫",script:"VO-C",super:"SUPER-C"});
  const next=await m.addShot(scene,{title:"下一鏡",script:"VO-NEXT",duration:5});
  for(const owner of [id,next]){
   for(const [index,frame] of m.getSequenceFrames(owner).entries()){
    const canvas=document.createElement("canvas");canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext("2d");ctx.fillStyle=["#243b55","#55776c","#946854"][index%3];ctx.fillRect(0,0,640,360);ctx.fillStyle="white";ctx.font="40px sans-serif";ctx.fillText(owner===id?"CONTINUOUS "+String.fromCharCode(65+index):"NEXT SHOT",40,180);
    const blob=await new Promise(r=>canvas.toBlob(r,"image/png"));
    await m.addShotPhotos(owner,[new File([blob],"frame-"+index+".png",{type:"image/png"})],undefined,frame.id);
   }
  }
  const day=await m.addDay("2026-11-14","連續分鏡驗收","09:00");await m.scheduleShot(id,day);await m.scheduleShot(next,day);
 });
 await page.locator('.rail-button[data-view="output"]').click();await ready(page);
 for(const aspect of ["16:9","1:1","4:3","2.35:1"]){
  await page.evaluate(async a=>StoryModel.setAspectRatio(a),aspect);await ready(page);
  for(const orientation of ["landscape","portrait"]){
   await page.locator('[data-orientation="'+orientation+'"]').click();await ready(page);
   for(const density of [2,3,4]){
    await page.locator("#output-items-per-page").evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));},density);await ready(page);
    const data=await page.evaluate(()=>{
     const doc=document.querySelector("#print-document");
     return {text:doc.innerText,records:doc.querySelectorAll("[data-output-record]").length,
      ids:[...doc.querySelectorAll(".output-compact-id")].map(e=>e.textContent),
      ratios:[...doc.querySelectorAll(".output-worksheet-art")].map(e=>{const r=e.getBoundingClientRect();return r.width/r.height;}),
      sizes:[...doc.querySelectorAll(".output-worksheet-art")].map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height];}),
      contained:[...doc.querySelectorAll(".output-page")].every(p=>{const box=p.getBoundingClientRect();return [...p.querySelectorAll(".output-page-header,.output-worksheet-art")].every(e=>{const r=e.getBoundingClientRect();return r.top>=box.top-1&&r.bottom<=box.bottom+1;});}),
      durationLabels:[...doc.querySelectorAll(".output-template-duration")].map(e=>e.textContent)};
    });
    assert.equal(data.records,4,JSON.stringify({aspect,orientation,density,data}));
    assert.deepEqual(data.ids,["1-1A","1-1B","1-1C","1-2"]);
    assert.deepEqual(data.durationLabels,["8 秒","5 秒"]);
    assert.ok(data.contained,"page headers and storyboard images must stay inside A4");
    for(const size of data.sizes){assert.ok(Math.abs(size[0]-data.sizes[0][0])<1.5);assert.ok(Math.abs(size[1]-data.sizes[0][1])<1.5,"last page must not enlarge remaining frames");}
    assert.match(data.text,/13 秒/);assert.match(data.text,/4 張分鏡/);
    const [w,h]=aspect.split(":").map(Number);for(const ratio of data.ratios)assert.ok(Math.abs(ratio-w/h)<.025,JSON.stringify({aspect,orientation,density,ratio}));
    if(aspect==="16:9"&&density===3){
     const dir=path.join(root,"tmp","sequence-qa");fs.mkdirSync(dir,{recursive:true});
     await page.locator("#print-document > .output-page").first().screenshot({path:path.join(dir,"paper-"+orientation+"-first.png"),style:".preview-stage {overflow:visible!important}"});
     await page.locator("#print-document > .output-page").last().screenshot({path:path.join(dir,"paper-"+orientation+"-last.png"),style:".preview-stage {overflow:visible!important}"});
    }
   }
  }
 }
 fs.mkdirSync(path.join(root,"tmp","sequence-qa"),{recursive:true});
 await page.screenshot({path:path.join(root,"tmp","sequence-qa","output-portrait.png")});
 await page.locator("#output-template").selectOption("vo");await ready(page);
 assert.deepEqual(await page.locator(".output-vo-script").allTextContents(),["VO-A","VO-B","VO-C","VO-NEXT"]);
 await page.locator("#output-type").selectOption("schedule");await ready(page);
 const schedule=await page.evaluate(()=>[...document.querySelectorAll("#print-document > .output-page")].map(e=>({section:e.dataset.section,count:e.querySelectorAll("[data-output-record]").length,text:e.innerText})));
 const counts=kind=>schedule.filter(p=>p.section===kind).reduce((n,p)=>n+p.count,0);
 assert.equal(counts("rundown"),2,JSON.stringify(schedule));
 assert.equal(counts("storyboard"),4,JSON.stringify(schedule));
 assert.equal(await page.evaluate(()=>StoryModel.getProject().scheduleEntries.length),2);
 assert.equal(await page.evaluate(()=>StoryModel.getProject().shots.reduce((n,s)=>n+s.durationSeconds,0)),13);
 assert.deepEqual(errors,[]);
 console.log("PASS sequence output: 2 shots/4 frames/13 seconds, four aspect ratios, both orientations, 2/3/4 frames per page, VO once in order");
 }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});
