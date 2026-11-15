"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,".."),dist=path.join(root,"dist");
const server=http.createServer((request,response)=>{
 const file=path.resolve(dist,"."+new URL(request.url,"http://localhost").pathname.replace(/\/$/,"/index.html"));
 if(!file.startsWith(dist+path.sep)){response.writeHead(403).end();return;}
 fs.readFile(file,(error,bytes)=>{
  if(error){response.writeHead(404).end();return;}
  response.setHeader("Content-Type",file.endsWith(".css")?"text/css":file.endsWith(".html")?"text/html":file.endsWith(".svg")?"image/svg+xml":"text/javascript");
  response.end(bytes);
 });
});
(async()=>{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||chromium.executablePath()});
 try{
 for(const touch of [false,true]){
  const context=await browser.newContext({viewport:touch?{width:1024,height:1000}:{width:1440,height:1100},hasTouch:touch});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(process.env.KINO_QA_URL||"http://127.0.0.1:"+server.address().port);
  await page.getByRole("button",{name:"新建專案",exact:true}).click();
  await page.locator("#shot-placeholder-title").fill("秒數拖曳驗收");
  await page.locator("#shot-placeholder-title").press("Tab");
  await page.waitForFunction(()=>StoryModel.getProject().shots.length===1);
  await page.locator("#shot-duration").fill("8");
  await page.locator("#shot-duration").press("Tab");
  await page.waitForFunction(()=>StoryModel.getProject().shots[0].durationSeconds===8);
  assert.equal(await page.locator('[data-shot-select]:visible').count(),0,"checkboxes only appear in multi-select mode");
  const getDuration=()=>page.evaluate(()=>{const shot=StoryModel.getProject().shots[0];return shot.durationSeconds;});
  const cdp=touch?await context.newCDPSession(page):null;
  async function pointer(type,x,y){
   if(touch) await cdp.send("Input.dispatchTouchEvent",{type:({down:"touchStart",move:"touchMove",up:"touchEnd",cancel:"touchCancel"})[type],touchPoints:type==="up"||type==="cancel"?[]:[{x,y}]});
   else if(type==="down"){await page.mouse.move(x,y);await page.mouse.down();}
   else if(type==="move")await page.mouse.move(x,y);
   else await page.mouse.up();
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  }
  for(const selector of ["#inspector .duration-scrub-handle","#shot-list [data-shot] .duration-scrub-handle"]){
   const handle=page.locator(selector).first();
   await handle.scrollIntoViewIfNeeded();
   const box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
   const initial=await getDuration();
   const revision=await page.evaluate(()=>StoryModel.getProject().revision);
   await pointer("down",x,y);await pointer("move",x,y-32);
   const field=handle.locator("..").locator("input");
   assert.equal(await handle.getAttribute("data-scale"),"1");
   assert.equal(Number(await field.inputValue()),initial+4);
   await pointer("move",x-74,y-32);
   assert.ok(Math.abs(Number(await handle.getAttribute("data-scale"))-(1-74/192))<.001,"speed changes continuously");
   assert.equal(Number(await field.inputValue()),initial+4,"horizontal gear change must not jump");
   await pointer("move",x-74,y-64);
   assert.equal(Number(await field.inputValue()),initial+6);
   await pointer("move",x-144,y-64);await pointer("move",x-144,y-96);
   assert.equal(Number(await field.inputValue()),initial+7);
   assert.equal(await handle.evaluate(e=>e.style.getPropertyValue("--scrub-fill")),"25%");
   await page.screenshot({path:path.join(root,"tmp","duration-fine-fill-"+(touch?"touch":"desktop")+".png")});
   await pointer("move",x,y-96);
   assert.equal(Number(await field.inputValue()),initial+7,"changing precision does not change the value");
   await pointer("move",x,y-80);
   assert.equal(Number(await field.inputValue()),initial+5,"dragging down decreases seconds");
   assert.equal(await getDuration(),initial,"drag does not persist intermediate values");
   await page.screenshot({path:path.join(root,"tmp","duration-scrub-"+(touch?"touch":"desktop")+".png")});
   await pointer("up");
   await page.waitForFunction(expected=>{const shot=StoryModel.getProject().shots[0];return (shot.durationSeconds)===expected;},initial+5);
   assert.equal(await page.evaluate(()=>StoryModel.getProject().revision),revision+1,"one gesture saves once");
  }
  await page.locator('[data-shot-view="gallery"]').click();
  const galleryHandle=page.locator('#shot-list [data-shot] .duration-scrub-handle').first();
  await galleryHandle.scrollIntoViewIfNeeded();
  const galleryBox=await galleryHandle.boundingBox();
  const galleryStart=await getDuration();
  await pointer("down",galleryBox.x+16,galleryBox.y+22);
  await pointer("move",galleryBox.x+16,galleryBox.y+6);
  await pointer("up");
  await page.waitForFunction(expected=>StoryModel.getProject().shots[0].durationSeconds===expected,galleryStart+2);
  await page.locator('[data-shot-view="list"]').click();
  const field=page.locator("#shot-duration");
  await field.scrollIntoViewIfNeeded();
  const inputBox=await field.boundingBox();
  await pointer("down",inputBox.x+inputBox.width*.6,inputBox.y+inputBox.height/2);
  await pointer("up");
  assert.ok(await field.evaluate(element=>document.activeElement===element),"tap must focus direct numeric entry");
  await page.keyboard.type("3.7");await field.press("Tab");
  await page.waitForFunction(()=>{const s=StoryModel.getProject().shots[0];return (s.durationSeconds)===4;});
  const handle=page.locator("#inspector .duration-scrub-handle");
  await handle.scrollIntoViewIfNeeded();
  let box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await pointer("down",x,y);await pointer("move",x,y-40);
  if(touch)await pointer("cancel");else {await page.keyboard.press("Escape");await pointer("up");}
  assert.equal(await getDuration(),4);
  assert.equal(await field.inputValue(),"4");
  await field.fill("bad");await field.press("Tab");
  await pointer("down",x,y);await pointer("move",x,y-40);await pointer("up");
  assert.equal(await field.inputValue(),"bad","invalid manual input must be retained");
  assert.equal(await getDuration(),4);
  await field.fill("3.7");await field.press("Tab");
  const placeholder=page.locator("#shot-list [data-shot-placeholder] .duration-scrub-handle");
  await placeholder.scrollIntoViewIfNeeded();
  const placeholderBox=await placeholder.boundingBox();
  const px=placeholderBox.x+placeholderBox.width/2,py=placeholderBox.y+placeholderBox.height/2;
  await pointer("down",px,py);await pointer("move",px,py-16);await pointer("up");
  await page.waitForFunction(()=>StoryModel.getProject().shots.length===2);
  assert.equal(await page.evaluate(()=>StoryModel.getProject().shots[1].durationSeconds),2,"placeholder scrubbing creates one real shot");
  await page.locator('[data-shot-move-tag="特寫"]').click();
  await page.locator('[data-shot-move-tag="大特"]').click();
  await page.waitForFunction(()=>document.querySelector('#shot-move').value.includes("大特"));
  assert.ok(!(await page.locator("#shot-move").inputValue()).split("、").includes("特寫"));
  await page.locator('[data-shot-move-tag="過肩"]').click();
  assert.ok((await page.locator("#shot-move").inputValue()).includes("過肩"));
  assert.ok(await page.getByText("用於分類與搜尋",{exact:false}).count());
  assert.deepEqual(errors,[]);
  console.log("PASS duration scrubbing "+(touch?"touch":"desktop")+", integer rounding, gear no-jump, one save, cancel and invalid input");
  await context.close();
 }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
