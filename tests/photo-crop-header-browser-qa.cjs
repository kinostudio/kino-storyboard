"use strict";

// Crop previews must reject unsafe headers before assigning an image source.
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
 const page=await browser.newPage();await page.goto("http://127.0.0.1:"+server.address().port);
 const result=await page.evaluate(async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src");let decodes=0;
  Object.defineProperty(HTMLImageElement.prototype,"src",{...descriptor,set(value){decodes++;return descriptor.set.call(this,value);}});
  const png=new Uint8Array(33);png.set([137,80,78,71,13,10,26,10]);
  const view=new DataView(png.buffer);view.setUint32(8,13);png.set([73,72,68,82],12);view.setUint32(16,9000);view.setUint32(20,9000);png[24]=8;png[25]=2;
  const errors=[];
  for(const blob of [new Blob([png],{type:"image/png"}),new Blob([new Uint8Array(20*1024*1024+1)]),new Blob([new Uint8Array([1,2])])]){
   const host=document.createElement("div");document.body.append(host);
   const handle=DirectorStoryboardPhotoCropEditor.mount(host,{imageBlob:blob,aspectRatio:"16:9"});
   try{await handle.editor.readyPromise;errors.push("unexpected-success");}catch(e){errors.push(e.code||e.message);}
   handle.destroy();host.remove();
  }
  Object.defineProperty(HTMLImageElement.prototype,"src",descriptor);
  return {decodes,errors};
 });
 assert.equal(result.decodes,0,"oversized dimensions/bytes and malformed headers cannot reach image decoding");
 assert.equal(result.errors.length,3);assert.ok(!result.errors.includes("unexpected-success"));
 console.log("PASS crop preflight rejects oversized dimensions/bytes and malformed images before decode");
 }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});
