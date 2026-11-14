"use strict";

// Isolated browser coverage for Google Drive import from the project entry
// screen. The Drive module is mocked; no Google account or network request is
// used, and every browser context has a disposable IndexedDB.
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
 const page=await browser.newPage({viewport:{width:1180,height:1400}});
 await page.goto("http://127.0.0.1:"+server.address().port);
 await page.getByRole("button",{name:"建立示範專案",exact:true}).click();
 await page.locator("body.project-ready").waitFor();
 const errors=[]; page.on("pageerror",e=>errors.push(e.message));
 for(const view of ["清單","圖庫"]) {
 await page.getByRole("button",{name:view,exact:true}).click();
 for (const name of ["script","super"]) {
 const field=page.locator('#shot-list [data-shot-field="'+name+'"]').first();
 await field.fill(["第一行","第二行","第三行","第四行","第五行"].join(String.fromCharCode(10)));
 await field.press("Tab");
 await page.waitForTimeout(200);
 const metrics=await field.evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight,value:e.value}));
 assert.ok(metrics.height>=metrics.scroll,"Multiline text must fit in "+view+": "+JSON.stringify(metrics));
 }
 assert.equal(await page.locator(".shot-photo-manager").count(),0,"No multi-photo manager");
 fs.mkdirSync(path.join(root,"tmp","single-photo-qa"),{recursive:true});
 await page.screenshot({path:path.join(root,"tmp","single-photo-qa",view==="清單"?"list.png":"gallery.png")});
 }

 for (const view of ["清單","圖庫"]) {
   await page.getByRole("button",{name:view,exact:true}).click();
   const cards=page.locator("#shot-list .shot-card[data-shot]");
   const sourceId=await cards.nth(0).getAttribute("data-shot");
   const targetId=await cards.nth(1).getAttribute("data-shot");
   await cards.nth(0).scrollIntoViewIfNeeded();
   const a=await cards.nth(0).boundingBox();
   const b=await cards.nth(1).boundingBox();
   const image=await cards.nth(0).locator(".shot-thumb").boundingBox();
   await page.mouse.move(image.x+image.width/2,image.y+image.height/2);
   await page.mouse.down();
   await page.mouse.move(b.x+b.width/2,b.y+b.height-4,{steps:10});
   await page.mouse.up();
   await page.waitForFunction(({sourceId,targetId})=>{
     const ids=Array.from(document.querySelectorAll("#shot-list .shot-card[data-shot]")).map(e=>e.dataset.shot);
     return ids.indexOf(sourceId)>ids.indexOf(targetId);
   },{sourceId,targetId},{timeout:5000});
 }
 assert.deepEqual(errors,[]);
 console.log("PASS: list/gallery multiline VO, image drag reorder and no multi-photo panel");
 } finally {await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});

