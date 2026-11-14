"use strict";

// Isolated text-first creation, duration, VO, selection and scroll coverage.
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


async function main(){
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const browser=await chromium.launch({headless:true,executablePath:browserPath});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1400},permissions:["clipboard-read","clipboard-write"]});
 const page=await context.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("http://127.0.0.1:"+server.address().port);
 await page.getByRole("button",{name:"新建專案",exact:true}).click();
 await page.locator("body.project-ready").waitFor();
 for(let i=1;i<=3;i++){
   await page.locator("#shot-placeholder-title").fill("文字先行 "+i);
   await page.locator("#shot-placeholder-title").press("Tab");
   await page.waitForFunction(n=>StoryModel.getProject().shots.length===n,i);
 }
 assert.equal(await page.evaluate(()=>StoryModel.getProject().assets.length),0);
 const vo=["第一行旁白","第二行旁白"].join(String.fromCharCode(10));
 await page.locator("#shot-script").fill(vo);
 await page.locator("#shot-script").press("Tab");
 await page.waitForFunction(vo=>StoryModel.getProject().shots.some(s=>s.script===vo),vo);
 await page.locator("#shot-duration").fill("");
 await page.locator("#shot-duration").press("Tab");
 assert.equal(await page.getByText("INVALID_DURATION",{exact:false}).count(),0);
 await page.locator("#inspector [data-duration-wheel]").click();
 const seconds=page.getByRole("listbox",{name:"整數秒",exact:true});
 await seconds.evaluate(e=>e.scrollTop=7*44);
 const tenths=page.getByRole("listbox",{name:"十分之一秒",exact:true});
 await tenths.evaluate(e=>e.scrollTop=5*44);
 await page.waitForFunction(()=>document.querySelector('[aria-label="整數秒"] [aria-selected="true"]').textContent==="7");
 await page.waitForFunction(()=>document.querySelector('[aria-label="十分之一秒"] [aria-selected="true"]').textContent==="5");
 await page.getByRole("button",{name:"完成",exact:true}).click();
 await page.waitForTimeout(500);

 await page.waitForFunction(()=>StoryModel.getState().shots.some(s=>s.duration===7.5));
 await page.getByRole("button",{name:"檢視全片台詞／旁白稿",exact:true}).click();
 await page.getByRole("button",{name:"複製全文",exact:true}).click();
 assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).split(String.fromCharCode(13)).join(""),vo);
 const download=page.waitForEvent("download");
 await page.getByRole("button",{name:"匯出文稿",exact:true}).click();
 const file=await download;
 assert.equal(fs.readFileSync(await file.path(),"utf8").replace(/^﻿/,""),vo);
 await page.getByRole("button",{name:"返回分鏡",exact:true}).click();
 await page.getByRole("button",{name:"多選鏡頭",exact:true}).click();
 assert.equal(await page.locator('[data-shot-select][aria-checked="true"]').count(),0);
 const cards=page.locator("#shot-list .shot-card[data-shot]");
 const ids=await cards.evaluateAll(items=>items.map(e=>e.dataset.shot));
 let fileChoosers=0;page.on("filechooser",()=>fileChoosers++);
 await cards.nth(0).locator(".shot-thumb").click();
 await cards.nth(1).locator("[data-shot-select]").click();
 assert.equal(await page.locator('[data-shot-select][aria-checked="true"]').count(),2);
 const a=await cards.nth(0).locator(".shot-thumb").boundingBox();
 const b=await cards.nth(2).boundingBox();
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
 await page.mouse.move(b.x+b.width/2,b.y+b.height-4,{steps:10});await page.mouse.up();
 await page.waitForFunction(ids=>StoryModel.getState().shots.map(s=>s.id).join() === [ids[2],ids[0],ids[1]].join(),ids);
 assert.equal(fileChoosers,0);
 await page.getByRole("button",{name:"完成多選",exact:true}).click();
 await page.setViewportSize({width:1440,height:850});
 await page.evaluate(async()=>{
   const scene=StoryModel.getProject().scenes[0].id;
   for(let i=0;i<12;i++)await StoryModel.addShot(scene,{title:"Scroll QA "+i});
 });
 const panel=page.locator(".storyboard-panel"), inspector=page.locator("#inspector");
 await panel.hover();await page.mouse.wheel(0,700);
 await page.waitForFunction(()=>document.querySelector(".storyboard-panel").scrollTop>0);
 const position=await panel.evaluate(e=>e.scrollTop);
 assert.equal(await inspector.evaluate(e=>e.scrollTop),0);
 await inspector.hover();await page.mouse.wheel(0,300);
 await page.waitForFunction(()=>document.querySelector("#inspector").scrollTop>0);
 assert.equal(await panel.evaluate(e=>e.scrollTop),position);
 assert.equal(await page.evaluate(()=>document.scrollingElement.scrollTop),0);
 assert.deepEqual(errors,[]);
 console.log("PASS text-first shots, seconds wheel, VO copy/TXT, visible multi-selection, group drag and independent scroll");
 }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});
