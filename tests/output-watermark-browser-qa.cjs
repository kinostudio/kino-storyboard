"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,".."),dist=path.join(root,"dist");
const server=http.createServer((req,res)=>{
 const file=path.resolve(dist,"."+new URL(req.url,"http://localhost").pathname.replace(/\/$/,"/index.html"));
 if(!file.startsWith(dist+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader("Content-Type",file.endsWith(".html")?"text/html":file.endsWith(".css")?"text/css":file.endsWith(".svg")?"image/svg+xml":"text/javascript");res.end(data);});
});
async function ready(page){
 await page.waitForFunction(()=>{const b=document.querySelector("#print-output");return b&&!b.disabled&&document.querySelector("#print-document > .output-page");});
 await page.waitForFunction(async()=>{
  let prior="",stable=0;
  for(let i=0;i<120;i++){
   await new Promise(requestAnimationFrame);
   const signature=JSON.stringify(Array.from(document.querySelectorAll("#print-document > .output-page")).map(e=>[e.clientWidth,e.clientHeight,e.querySelector(".output-page-body").clientHeight,e.querySelectorAll("[data-output-record]").length]));
   stable=signature===prior?stable+1:0;prior=signature;
   if(stable>=4&&!document.querySelector("#print-output").disabled)return true;
  }return false;
 });
}
(async()=>{
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||chromium.executablePath()});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(process.env.KINO_QA_URL||"http://127.0.0.1:"+server.address().port);
  await page.getByRole("button",{name:"新建專案",exact:true}).click();
  await page.waitForFunction(()=>!!StoryModel.getProject());
  const projectId=await page.evaluate(async()=>{
   const m=StoryModel,scene=m.getProject().scenes[0].id;
   for(let i=0;i<9;i++)await m.addShot(scene,{title:"Watermark shot "+(i+1),duration:4,visual:"畫面描述與浮水印分層，尺寸保持一致。"});
   const doc=m.getScreenplay()||{subject:"",outline:"",format:"tw",scenes:[]};doc.subject="Watermark screenplay";await m.saveScreenplay(doc);
   const day=await m.addDay("2026-11-17","測試拍攝日","09:00");await m.scheduleShot(m.getProject().shots[0].id,day);
   return m.getProject().projectId;
  });
  await page.locator('.rail-button[data-view="output"]').click();await ready(page);
  const geometry=()=>page.locator("#print-document > .output-page").evaluateAll(pages=>pages.map(p=>({w:p.clientWidth,h:p.clientHeight,records:p.querySelectorAll("[data-output-record]").length})));
  const initial=await geometry();
  assert.equal(await page.locator(".output-watermark").count(),0);
  await page.locator("#watermark-settings > label").click();
  await page.waitForFunction(()=>StoryModel.getProject().outputPreferences.watermark?.enabled);
  async function set(key,value){
   await page.locator('[data-watermark-field="'+key+'"]').evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));},value);
   await page.waitForFunction(({key,value})=>StoryModel.getProject().outputPreferences.watermark[key]===value,{key,value});
   await ready(page);
  }
  await set("text","KINO REVIEW <private>");await set("opacity",22);await set("rotation",-25);
  assert.deepEqual(await geometry(),initial,"watermark must not change pagination or page geometry");
  assert.equal(await page.locator(".output-watermark").count(),initial.length);
  assert.equal(await page.locator(".output-watermark-content").first().textContent(),"KINO REVIEW <private>");
  assert.equal(await page.locator(".output-watermark img").count(),0,"text stays escaped");
  const first=await page.locator(".output-page").first().elementHandle();
  await set("x",30);await set("y",45);await set("size",55);await set("color","#8f3040");
  assert.ok(await first.evaluate(e=>e.isConnected),"watermark adjustment must not rebuild preview pages");
  for(const orientation of ["portrait","landscape"]){
   await page.locator('[data-orientation="'+orientation+'"]').click();await ready(page);
   const count=await page.locator("#print-document > .output-page").count();
   assert.equal(await page.locator(".output-watermark").count(),count);
   await page.locator(".output-page").first().screenshot({path:path.join(root,"tmp","watermark-text-"+orientation+".png")});
   await page.emulateMedia({media:"print"});await ready(page);
   assert.equal(await page.locator(".output-watermark").count(),count);
   assert.equal(await page.locator(".output-watermark").first().evaluate(e=>getComputedStyle(e).opacity),"0.22");
   await page.emulateMedia({media:"screen"});await ready(page);
  }
  for(const type of ["screenplay","combined","schedule","storyboard"]){
   await page.selectOption("#output-type",type);await ready(page);
   assert.equal(await page.locator(".output-watermark").count(),await page.locator("#print-document > .output-page").count(),type);
  }
  const png=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=200;c.height=80;const x=c.getContext("2d");x.fillStyle="#294b72";x.fillRect(0,0,200,80);x.clearRect(8,8,184,64);x.font="bold 32px sans-serif";x.fillText("KINO",52,52);return c.toDataURL("image/png").split(",")[1];});
  await set("type","image");
  await page.locator("#watermark-image").setInputFiles({name:"logo.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
  await page.waitForFunction(()=>!!StoryModel.getProject().outputPreferences.watermark.image);await ready(page);
  await page.locator(".output-watermark img").first().evaluate(e=>e.decode());
  assert.equal(await page.locator(".output-watermark img").first().evaluate(e=>e.naturalWidth),200);
  const saved=await page.evaluate(()=>StoryModel.getProject().outputPreferences.watermark);
  await page.locator("#watermark-image").setInputFiles({name:"unsafe.svg",mimeType:"image/svg+xml",buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')});
  await page.waitForFunction(()=>!document.querySelector('[data-watermark-action="upload"]').disabled);
  assert.deepEqual(await page.evaluate(()=>StoryModel.getProject().outputPreferences.watermark),saved,"rejected image preserves the saved watermark");
  await page.locator(".output-page").first().screenshot({path:path.join(root,"tmp","watermark-image.png")});
  await page.emulateMedia({media:"print"});await ready(page);
  await page.pdf({path:path.join(root,"tmp","watermark-image.pdf"),preferCSSPageSize:true,printBackground:true});
  await page.emulateMedia({media:"screen"});await ready(page);
  await page.reload();await page.waitForFunction(()=>!!window.StoryModel);
  await page.evaluate(async id=>{if(StoryModel.getProject()?.projectId!==id)await StoryModel.selectProject(id);},projectId);
  await page.waitForFunction(()=>StoryModel.getLifecycle()?.phase==="ready",null,{timeout:45000});
  await page.locator('.rail-button[data-view="output"]').click();await ready(page);
  assert.deepEqual(await page.evaluate(()=>StoryModel.getProject().outputPreferences.watermark),saved);
  const copy=await page.evaluate(async()=>{const pack=await StoryModel.exportCompletePackage();return (await StoryModel.importCompletePackage(pack.archiveBytes,{mode:"copy"})).projectId;});
  await page.evaluate(id=>StoryModel.selectProject(id),copy);
  assert.deepEqual(await page.evaluate(()=>StoryModel.getProject().outputPreferences.watermark),saved,"ZIP copy preserves image and adjustments");
  await page.locator('.rail-button[data-view="output"]').click();await ready(page);
  await page.locator("#watermark-settings > label").click();
  await page.waitForFunction(()=>StoryModel.getProject().outputPreferences.watermark.enabled===false);
  assert.equal(await page.locator(".output-watermark").count(),0);
  assert.deepEqual(errors,[]);
  console.log("PASS text/image watermark, adjustments without reflow, portrait/landscape, all document types, print, reload and ZIP restore");
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
