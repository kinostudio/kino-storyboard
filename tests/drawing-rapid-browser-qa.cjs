"use strict";

// Isolated rapid-stroke persistence and retry coverage with disposable IndexedDB.
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


async function main() {
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const browser=await chromium.launch({headless:true,executablePath:browserPath});
 try {
 for(const draft of [false,true]) {
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const page=await context.newPage();
 await page.goto("http://127.0.0.1:"+server.address().port);
 await page.getByRole("button",{name:"新建專案",exact:true}).click();
 await page.locator("body.project-ready").waitFor();
 await page.evaluate(async draft=>{
   const model=window.StoryModel;
   const shot=await model.addShot(model.getProject().scenes[0].id,{title:"Rapid pen QA"});
   const drawingId=draft?null:await model.createDrawingForShot(shot);
   const proxy=new Proxy({...model},{get(target,key){
     if(["appendDrawingStroke","createDrawingForShotWithInitialEdit"].includes(key)) return async (...args)=>{
       await new Promise(r=>setTimeout(r,180));
       if(window.failNextSave){window.failNextSave=false;throw new Error("simulated write failure");}
       return target[key](...args);
     };
     return target[key];
   }});
   const host=document.createElement("main");
   host.className="ds-drawing-popup";host.style.cssText="position:fixed;inset:16px;z-index:9999;background:white";
   document.body.append(host);
   window.penQa=DirectorStoryboardDrawingEditor.mount(host,{model:proxy,projectId:model.getProject().projectId,shotId:shot,draft,drawing:drawingId?model.getDrawing(drawingId):undefined,onBack:()=>{}});
   window.penShot=shot;
   await penQa.refresh();
 },draft);
 const box=await page.locator(".ds-de-canvas").boundingBox();
 async function draw(index){
   const y=box.y+box.height*(.3+index*.06);
   await page.mouse.move(box.x+box.width*.4,y);
   await page.mouse.down();
   await page.mouse.move(box.x+box.width*.6,y,{steps:3});
   await page.mouse.up();
 }
 for(let i=0;i<3;i++) await draw(i);
 await page.waitForFunction(()=>!penQa.editor.pendingOperation&&!penQa.editor.drawingBusy&&!penQa.editor.strokeQueue.length);
 assert.equal(await page.evaluate(()=>StoryModel.getProject().drawings.find(d=>d.shotId===penShot).layers.reduce((n,l)=>n+l.strokes.length,0)),3,"Rapid strokes must all persist");
 await page.evaluate(()=>window.failNextSave=true);
 await draw(3);await draw(4);
 await page.getByRole("button",{name:"重試保存",exact:true}).waitFor();
 assert.ok(await page.evaluate(()=>penQa.editor.strokeQueue.length>=1),"Later stroke retained on failure");
 await page.getByRole("button",{name:"重試保存",exact:true}).click();
 await page.waitForFunction(()=>!penQa.editor.pendingOperation&&!penQa.editor.drawingBusy&&!penQa.editor.strokeQueue.length);
 assert.equal(await page.evaluate(()=>StoryModel.getProject().drawings.find(d=>d.shotId===penShot).layers.reduce((n,l)=>n+l.strokes.length,0)),5,"Retry drains later strokes exactly once");
 console.log("PASS rapid drawing draft="+draft);
 await context.close();
 }
 }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});
