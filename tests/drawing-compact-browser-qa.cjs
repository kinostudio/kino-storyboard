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
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,executablePath:browserPath});
 try {
 for (const size of [{width:1440,height:900},{width:1366,height:1024},{width:1024,height:1366}]) {
 const context=await browser.newContext({viewport:size,hasTouch:size.width!==1440});
 const page=await context.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("http://127.0.0.1:"+server.address().port);
 await page.getByRole("button",{name:"建立示範專案",exact:true}).click();
 await page.locator(".shot-art-wrap").first().hover();
 await page.locator(".shot-drawing-entry").first().click();
 await page.locator(".ds-de-canvas").waitFor();
 await page.waitForFunction(()=>document.querySelector(".ds-de-stage").getBoundingClientRect().height>200);
 const canvas=page.locator(".ds-de-canvas");
 const box=await canvas.boundingBox();
 assert.ok(box.height>=size.height*.65, "Canvas must occupy 65% of viewport: "+JSON.stringify({size,box}));
 assert.ok(box.y+box.height<=size.height, "Canvas bottom must remain visible");
 assert.equal(await page.locator(".ds-de-tool").first().innerText(),"");
 assert.equal(await page.getByRole("button",{name:"復原上一筆",exact:true}).innerText(),"");
 const layers=page.locator('summary[aria-label="圖層"]');
 await layers.click();
 await page.getByRole("button",{name:"新增自訂圖層",exact:true}).waitFor();
 assert.equal((await canvas.boundingBox()).height,box.height,"Layer popover must not shrink canvas");
 await layers.press("Escape");
 assert.equal(await page.locator(".ds-de-drawer[open]").count(),0);
 await page.locator('summary[aria-label="繪圖設定"]').click();
 await page.getByRole("switch",{name:"只用 Apple Pencil 塗鴉",exact:true}).waitFor();
 await page.locator('summary[aria-label="繪圖設定"]').press("Escape");
 await page.getByRole("button",{name:"畫筆",exact:true}).click();
 await page.mouse.move(box.x+box.width*.4,box.y+box.height*.4);
 await page.mouse.down();
 await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6,{steps:12});
 await page.mouse.up();
 await page.waitForFunction(()=>!document.querySelector(".ds-de-history button").disabled);
 await page.getByRole("button",{name:"復原上一筆",exact:true}).click();
 await page.waitForFunction(()=>!document.querySelectorAll(".ds-de-history button")[1].disabled);
 await page.getByRole("button",{name:"重做上一筆",exact:true}).click();
 fs.mkdirSync(path.join(root,"tmp","drawing-compact-qa"),{recursive:true});
 await page.screenshot({path:path.join(root,"tmp","drawing-compact-qa",size.width+"x"+size.height+".png")});
 assert.deepEqual(errors,[]);
 console.log("PASS compact drawing "+size.width+"x"+size.height+" canvas="+Math.round(box.height));
 await context.close();
 }
 } finally {await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});
