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
 await new Promise(r => server.listen(0,"127.0.0.1",r));
 const browser=await chromium.launch({headless:true,executablePath:browserPath});
 try {
 const page=await browser.newPage();
 await page.route("**/google-drive.js*",r=>r.fulfill({contentType:"text/javascript",body:`window.KinoDriveConfig={clientId:"x",apiKey:"x",appId:"1"};
 window.calls=0; window.KinoDrive={ready:Promise.resolve(true), getStatus:()=>({pendingUpload:JSON.parse(localStorage.getItem("qa-notice"))}), importZip:async()=>{}, exportZip:async()=>{
 window.calls++; if(window.calls===1) throw Object.assign(new Error("timeout"),{code:"DRIVE_AUTH_TIMEOUT"});
 for(const phase of ["authorize","build-package","pick-folder"]) { window.dispatchEvent(new CustomEvent("kinodrive:progress",{detail:{phase}})); await new Promise(r=>window.nextPhase=r); }
 throw Object.assign(new Error("cancel"),{code:"DRIVE_CANCELLED",cancelled:true});
 }};`}));
 await page.goto("http://127.0.0.1:"+server.address().port);
 await page.getByRole("button",{name:"新建專案",exact:true}).click();
 await page.locator("body.project-ready").waitFor();
 await page.getByRole("button",{name:"專案",exact:true}).click();
 await page.locator('[data-drive-action="export"]').click();
 await page.getByRole("button",{name:"重新授權",exact:true}).waitFor();
 await page.getByRole("button",{name:"重新授權",exact:true}).click();
 await page.waitForFunction(()=>document.querySelector("#google-drive-status")?.textContent.includes("Google 視窗"));
 await page.evaluate(()=>window.nextPhase());
 await page.waitForFunction(()=>document.querySelector("#google-drive-status")?.textContent.includes("建立完整 ZIP"));
 await page.evaluate(()=>window.nextPhase());
 await page.waitForFunction(()=>document.querySelector("#google-drive-status")?.textContent.includes("儲存位置"));
 await page.evaluate(()=>window.nextPhase());
 await page.evaluate(()=>localStorage.setItem("qa-notice",JSON.stringify({name:"check.zip",folderName:"QA",possibleDuplicate:true,canResume:false})));
 await page.reload();
 await page.getByRole("button",{name:/待命名專案 revision/}).click();
 await page.getByRole("button",{name:"專案",exact:true}).click();
 assert.match(await page.locator("#google-drive-status").innerText(),/check.zip.*QA/);
 await page.locator('[data-drive-action="discard-pending"]').waitFor({state:"visible"});
 console.log("PASS: timeout retry, authorize/build/destination messages, reload upload notice");
 } finally {await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});
