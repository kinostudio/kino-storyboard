"use strict";

// Isolated real-Chromium QA for the six storyboard output templates. The
// project, nine stills, browser storage, and screenshots are disposable.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("C:/Users/Aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const outputDir = process.env.OUTPUT_TEMPLATE_QA_DIR ? path.resolve(process.env.OUTPUT_TEMPLATE_QA_DIR) : path.join(root, "tmp", "output-template-qa");
const browserPath = "C:/Users/Aaron/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe";
const templates = ["worksheet", "proposal", "production", "av", "contact", "vo"];
const orientations = ["landscape", "portrait"];
const selectedTemplates = process.env.OUTPUT_TEMPLATE_QA_TEMPLATE ? [process.env.OUTPUT_TEMPLATE_QA_TEMPLATE] : templates;
const selectedOrientations = process.env.OUTPUT_TEMPLATE_QA_ORIENTATION ? [process.env.OUTPUT_TEMPLATE_QA_ORIENTATION] : orientations;
const densitySweepTemplate = process.env.OUTPUT_TEMPLATE_QA_DENSITY_TEMPLATE || "contact";
const densitySweepSamples = process.env.OUTPUT_TEMPLATE_QA_DENSITY_SAMPLES
  ? process.env.OUTPUT_TEMPLATE_QA_DENSITY_SAMPLES.split(",").map((value)=>Number(value.trim()))
  : [2,6,8,12];
assert.ok(selectedTemplates.every((template)=>templates.includes(template)),"OUTPUT_TEMPLATE_QA_TEMPLATE must be one of the six supported slugs");
assert.ok(selectedOrientations.every((orientation)=>orientations.includes(orientation)),"OUTPUT_TEMPLATE_QA_ORIENTATION must be landscape or portrait");
assert.ok(templates.includes(densitySweepTemplate),"OUTPUT_TEMPLATE_QA_DENSITY_TEMPLATE must be one of the six supported slugs");
assert.ok(densitySweepSamples.length>0&&densitySweepSamples.every((density)=>Number.isInteger(density)&&density>=1&&density<=12),"OUTPUT_TEMPLATE_QA_DENSITY_SAMPLES must be comma-separated values from 1 to 12");
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\//, "") || "index.html";
  const file = path.resolve(dist, relative);
  if (file !== dist && !file.startsWith(dist + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, bytes) => {
    if (error) return response.writeHead(404).end();
    const ext = path.extname(file);
    response.setHeader("Content-Type", ({ ".css":"text/css", ".html":"text/html", ".json":"application/json", ".svg":"image/svg+xml" })[ext] || "text/javascript");
    response.setHeader("Cache-Control", "no-store");
    response.end(bytes);
  });
});

async function waitForOutputReady(page, timeout=30000) {
  await page.waitForFunction(() => {
    const doc = document.querySelector("#print-document");
    const button = document.querySelector("#print-output");
    return doc && button && !button.disabled && !doc.querySelector(".output-capture-progress,.output-capture-blocked") && doc.querySelector(":scope > .output-page");
  }, null, { timeout }).catch(async (error) => {
    const diagnostic = await page.evaluate(() => ({
      selectedTemplate:document.querySelector("#output-template")?.value,
      slider:document.querySelector("#output-items-per-page")?.value,
      printDisabled:document.querySelector("#print-output")?.disabled,
      progress:document.querySelector("#print-document .output-capture-progress")?.innerText,
      blocked:document.querySelector("#print-document .output-capture-blocked")?.innerText,
      pages:Array.from(document.querySelectorAll("#print-document > .output-page")).map((node) => ({ layout:node.dataset.layout, template:node.dataset.template, density:node.dataset.density, records:node.querySelectorAll("[data-output-record]").length })),
      status:document.querySelector("#durable-status-title")?.innerText
    }));
    await page.screenshot({ path:path.join(outputDir,"blocked-layout.png"), fullPage:true }).catch(() => {});
    throw new Error(error.message + " diagnostic=" + JSON.stringify(diagnostic));
  });
  await page.waitForFunction(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const signature = () => {
      const doc=document.querySelector("#print-document"),button=document.querySelector("#print-output");
      if(!doc||!button||button.disabled||doc.querySelector(".output-capture-progress,.output-capture-blocked"))return "";
      return JSON.stringify(Array.from(doc.querySelectorAll(":scope > .output-page")).map((page)=>{
        const rect=page.getBoundingClientRect();
        return [page.dataset.template,page.dataset.layout,page.dataset.density,Math.round(rect.width),Math.round(rect.height),Array.from(page.querySelectorAll("[data-output-record]")).map((record)=>{const box=record.getBoundingClientRect();return [record.getAttribute("data-output-record"),Math.round(box.width),Math.round(box.height)];})];
      }));
    };
    let previous="",stable=0;
    for(let index=0;index<120;index++){
      await frame();
      const current=signature();
      if(current&&current===previous)stable++;else stable=current?0:0;
      previous=current;
      if(stable>=3)return true;
    }
    return false;
  }, null, { timeout }).catch(async (error) => {
    const diagnostic=await page.evaluate(()=>({
      template:document.querySelector("#output-template")?.value,
      slider:document.querySelector("#output-items-per-page")?.value,
      pages:Array.from(document.querySelectorAll("#print-document > .output-page")).map((page)=>({layout:page.dataset.layout,template:page.dataset.template,density:page.dataset.density,records:Array.from(page.querySelectorAll("[data-output-record]")).map((record)=>record.getAttribute("data-output-record"))}))
    }));
    await page.screenshot({path:path.join(outputDir,"unstable-layout.png"),fullPage:true}).catch(()=>{});
    throw new Error("output pages did not reach a stable DOM geometry: " + error.message + " diagnostic=" + JSON.stringify(diagnostic));
  });
}

async function setDensity(page, requested) {
  await page.locator("#output-items-per-page").evaluate((slider, value) => {
    slider.value = String(value);
    slider.dispatchEvent(new Event("input", { bubbles:true }));
    slider.dispatchEvent(new Event("change", { bubbles:true }));
  }, requested);
  await page.waitForFunction((value) => document.querySelector("#output-items-per-page")?.value === String(value), requested, { timeout:10000 });
  await waitForOutputReady(page);
}

async function setTemplate(page, template) {
  await page.locator("#output-template").selectOption(template);
  await page.waitForFunction((value) => document.querySelector("#output-template")?.value === value, template, { timeout:10000 });
  await waitForOutputReady(page);
}

async function setOrientation(page, orientation) {
  await page.locator(`.orientation-button[data-orientation="${orientation}"]`).click();
  await waitForOutputReady(page);
}

async function readState(page, label) {
  return page.evaluate((label) => {
    const doc = document.querySelector("#print-document");
    const slider = document.querySelector("#output-items-per-page");
    const pages = Array.from(doc.querySelectorAll(":scope > .output-page"));
    return {
      label,
      requestedDensity:Number(slider?.value || 0),
      selectedTemplate:document.querySelector("#output-template")?.value || "",
      pages:pages.map((page) => {
        const rect = page.getBoundingClientRect();
        const body = page.querySelector(".output-page-body");
        const bodyRect = body?.getBoundingClientRect();
        const records = Array.from(body?.querySelectorAll(":scope > [data-output-record]") || []);
        return {
          layout:page.dataset.layout || "",
          template:page.dataset.template || "",
          density:Number(page.dataset.density || 0),
          orientation:page.classList.contains("is-portrait") ? "portrait" : "landscape",
          pageSize:{ width:Math.round(rect.width*100)/100, height:Math.round(rect.height*100)/100 },
          overflow:page.scrollWidth > page.clientWidth + 2 || page.scrollHeight > page.clientHeight + 2 || !!body && (body.scrollWidth > body.clientWidth + 2 || body.scrollHeight > body.clientHeight + 2),
          bodySize:bodyRect ? {width:Math.round(bodyRect.width*100)/100,height:Math.round(bodyRect.height*100)/100} : null,
          records:records.map((wrap) => {
            const recordRect = wrap.getBoundingClientRect();
            const card = wrap.querySelector(":scope > .output-card") || wrap.firstElementChild;
            const cardRect = card?.getBoundingClientRect();
            const overflow = [wrap,card].filter(Boolean).some((node) => node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 2);
            const ids = wrap.querySelector(".output-compact-id")?.textContent.trim() || "";
            const visible = (wrap.innerText || wrap.textContent || "").replace(/\s+/gu," ").trim();
            const labels = Array.from(wrap.querySelectorAll("[data-output-field-label],.output-field-label,.output-image-field strong")).map((node) => node.textContent.replace(/\s+/gu," ").trim()).filter(Boolean);
            const rect = (box) => box ? {width:Math.round(box.width*100)/100,height:Math.round(box.height*100)/100,left:Math.round(box.left*100)/100,top:Math.round(box.top*100)/100} : null;
            return {
              id:wrap.getAttribute("data-output-record") || "",
              shotId:wrap.getAttribute("data-shot-id") || wrap.querySelector("[data-shot-id]")?.getAttribute("data-shot-id") || "",
              visibleId:ids,
              visible,
              labels,
              overflow,
              overflowMetrics:{
                wrap:{clientWidth:wrap.clientWidth,scrollWidth:wrap.scrollWidth,clientHeight:wrap.clientHeight,scrollHeight:wrap.scrollHeight},
                card:card?{className:card.className,clientWidth:card.clientWidth,scrollWidth:card.scrollWidth,clientHeight:card.clientHeight,scrollHeight:card.scrollHeight}:null,
                body:body?{clientWidth:body.clientWidth,scrollWidth:body.scrollWidth,clientHeight:body.clientHeight,scrollHeight:body.scrollHeight}:null
              },
              box:rect(recordRect),
              cardBox:rect(cardRect),
              hooks:{
                avVisual:wrap.querySelector(".output-av-visual")?.innerText || "",
                avAudio:wrap.querySelector(".output-av-audio")?.innerText || "",
                contact:wrap.querySelector(".output-contact-card")?.innerText || "",
                vo:wrap.querySelector(".output-vo-script")?.textContent || ""
              }
            };
          })
        };
      })
    };
  }, label);
}

function verifyBaseState(state, shotIds, sceneNumber, template, orientation) {
  assert.equal(state.selectedTemplate, template, `${state.label}: selector should preserve template`);
  const requestedDensity=state.requestedDensity;
  const expectedSplit=[];
  for(let remaining=shotIds.length;remaining>0;remaining-=requestedDensity)expectedSplit.push(Math.min(remaining,requestedDensity));
  assert.equal(state.pages.length, expectedSplit.length, `${state.label}: nine short shots at capacity ${requestedDensity} should use ${expectedSplit.length} pages`);
  assert.ok(state.pages.every((page) => page.layout === template && page.template === template), `${state.label}: rendered page template hooks should match`);
  assert.ok(state.pages.every((page) => page.orientation === orientation), `${state.label}: page orientation should match selection`);
  assert.ok(state.pages.every((page) => !page.overflow), `${state.label}: page/body must not overflow`);
  assert.ok(state.pages.every((page) => page.records.every((record) => !record.overflow)), `${state.label}: shot cards must not clip text`);
  assert.ok(state.pages.every((page) => page.density === requestedDensity), `${state.label}: rendered capacity should remain ${requestedDensity}`);
  assert.deepEqual(state.pages.map((page) => page.records.length), expectedSplit, `${state.label}: pages should use the selected capacity and retain a partial final page`);
  const records = state.pages.flatMap((page) => page.records);
  assert.deepEqual(records.map((record) => record.id), shotIds, `${state.label}: each source Shot must appear exactly once and in order`);
  assert.deepEqual(records.map((record) => record.shotId), shotIds, `${state.label}: output record identity must remain 1:1 with its Shot`);
  records.forEach((record,index) => {
    assert.ok(record.visible.includes(`${sceneNumber}-${index+1}`), `${state.label}: Shot ${index+1} must retain its visible ${sceneNumber}-${index+1} identifier; text=${record.visible}`);
    if(template !== "vo") assert.ok(record.visible.includes(`SHOT-TITLE-${String(index+1).padStart(2,"0")}`), `${state.label}: Shot ${index+1} title should remain attached to its identifier`);
  });
  const first = state.pages[0].records[0].cardBox;
  const partial = state.pages.at(-1).records[0].cardBox;
  assert.ok(first && partial && Math.abs(first.width-partial.width) <= 3 && Math.abs(first.height-partial.height) <= 3,
    `${state.label}: partial final-page card should reserve the same slot size (${JSON.stringify({first,partial})})`);
  const page0 = state.pages[0].pageSize;
  assert.ok(state.pages.every((page) => Math.abs(page.pageSize.width-page0.width) <= 1 && Math.abs(page.pageSize.height-page0.height) <= 1), `${state.label}: all pages including partial final page must use equal page geometry`);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive:true });
  const report = { status:"running", outputDirectory:outputDir, templates, orientations, selectedTemplates, selectedOrientations, densitySweepTemplate, densitySweepSamples, screenshots:[], cases:[], failures:[] };
  let browser;
  await new Promise((resolve) => server.listen(0,"127.0.0.1",resolve));
  try {
    browser = await chromium.launch({ headless:true, executablePath:browserPath });
    const context = await browser.newContext({ viewport:{width:1600,height:1200}, deviceScaleFactor:1 });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const pageErrors=[];
    page.on("pageerror",(error)=>pageErrors.push(error.message));
    await page.goto(process.env.STORYBOARD_BASE_URL || `http://127.0.0.1:${server.address().port}`,{waitUntil:"domcontentloaded"});
    await page.locator("#lifecycle-project-title").fill("Output template layout QA");
    const priorProjectId=await page.evaluate(()=>window.StoryModel.getProject()?.projectId||null);
    await page.locator('#lifecycle-create-form button[name="createKind"][value="blank"]').click();
    await page.waitForFunction((previousId)=>{const project=window.StoryModel.getProject();return project&&project.projectId!==previousId;},priorProjectId,{timeout:30000});
    await page.locator("body.project-ready").waitFor({state:"attached"});

    const fixture = await page.evaluate(async () => {
      const model=window.StoryModel;
      if (!model) throw new Error("StoryModel is unavailable");
      const sceneId=await model.addScene("EXT. 小鎮街口 · 清晨");
      const titles=["SHOT-TITLE-01","SHOT-TITLE-02","SHOT-TITLE-03","SHOT-TITLE-04","SHOT-TITLE-05","SHOT-TITLE-06","SHOT-TITLE-07","SHOT-TITLE-08","SHOT-TITLE-09"];
      const descriptions=[
        "清晨薄霧覆住街口，主角推開店門，暖光從窗內落到濕潤的人行道。",
        "玻璃上的雨滴映出路口紅燈；店員把熱咖啡推到吧檯另一端。",
        "主角停在斑馬線前，低頭看一眼手機裡尚未送出的訊息。",
        "遠景車燈由霧中接近，騎樓招牌在畫面右側輕輕晃動。",
        "手部特寫：咖啡杯放上木桌，薄薄蒸氣遮住一角便條紙。",
        "兩人隔著玻璃對望，店內暖色與街上的藍灰清晨形成反差。",
        "主角收起手機轉身離開，門鈴短響後街景重新安靜。",
        "低角度跟拍腳步穿過斑馬線，鞋底帶起一小片積水。",
        "定鏡留在空下來的吧檯，窗外第一束日光慢慢移過杯緣。"
      ];
      const colors=[[22,65,89],[45,91,104],[73,99,104],[34,72,92],[156,100,65],[73,87,93],[65,95,105],[46,72,82],[178,134,83]];
      const shots=[];
      for(let index=0;index<9;index++){
        const id=await model.addShot(sceneId);
        const sequence=String(index+1).padStart(2,"0");
        await model.updateShot(id,{
          title:titles[index],visual:`VISUAL-QA-${sequence}｜${descriptions[index]}`,
          script:`VO-QA-${sequence}｜${["有些早晨，城市先醒來的是燈光。","我以為那句話還有時間說出口。","雨停之前，我們都沒有移開視線。","這條路，我們走過很多次。","留在桌上的字，比記憶更清楚。","玻璃裡的倒影，像另一個答案。","我決定把未完成的話帶走。","街道很長，但下一步已經很近。","天亮以後，故事才真正開始。"][index]}`,
          super:`SUPER-QA-${sequence}`,sound:`SOUND-QA-${sequence}｜遠處車聲、室內杯盤輕響`,move:`MOVE-QA-${sequence}｜${index%2?"緩慢推近":"固定中景"}`,duration:5+index*2
        });
        const canvas=document.createElement("canvas");canvas.width=960;canvas.height=540;
        const ctx=canvas.getContext("2d");
        const [r,g,b]=colors[index];
        const gradient=ctx.createLinearGradient(0,0,960,540);gradient.addColorStop(0,`rgb(${Math.max(0,r-12)},${Math.max(0,g-10)},${Math.max(0,b-7)})`);gradient.addColorStop(1,`rgb(${Math.min(255,r+42)},${Math.min(255,g+37)},${Math.min(255,b+30)})`);
        ctx.fillStyle=gradient;ctx.fillRect(0,0,960,540);
        ctx.fillStyle="rgba(15,28,35,.48)";ctx.fillRect(0,345,960,195);
        ctx.fillStyle="rgba(245,220,167,.76)";ctx.fillRect(90+index*11,104,240,160);
        ctx.fillStyle="rgba(25,40,46,.68)";ctx.fillRect(116+index*11,126,90,116);ctx.fillRect(222+index*11,126,83,116);
        ctx.fillStyle="rgba(255,229,168,.85)";ctx.fillRect(132+index*11,141,59,82);ctx.fillRect(235+index*11,141,55,82);
        ctx.fillStyle="rgba(245,224,190,.78)";ctx.fillRect(366,286,310,25);
        ctx.fillStyle="rgba(31,44,47,.78)";ctx.fillRect(394,311,18,98);ctx.fillRect(627,311,18,98);
        ctx.fillStyle="rgba(210,221,215,.8)";ctx.beginPath();ctx.ellipse(478+index*8,330,34,42,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="rgba(37,47,49,.94)";ctx.beginPath();ctx.ellipse(478+index*8,326,27,34,0,0,Math.PI*2);ctx.fill();
        ctx.fillRect(458+index*8,356,42,86);
        ctx.fillStyle="rgba(255,255,255,.91)";ctx.font="bold 32px sans-serif";ctx.fillText(`FRAME ${sequence}`,38,493);
        const blob=await new Promise((resolve,reject)=>canvas.toBlob((value)=>value?resolve(value):reject(new Error("PNG generation failed")),"image/png"));
        const imported=await model.addShotPhotos(id,[new File([blob],`output-shot-${sequence}.png`,{type:"image/png"})]);
        if(!imported?.addedAssetIds?.length)throw new Error(`Photo was not saved for Shot ${sequence}`);
        shots.push({id,title:titles[index],visual:`VISUAL-QA-${sequence}`,vo:`VO-QA-${sequence}`,super:`SUPER-QA-${sequence}`,sound:`SOUND-QA-${sequence}`,move:`MOVE-QA-${sequence}`});
      }
      return {sceneId,sceneNumber:model.getProject().sceneOrder.indexOf(sceneId)+1,shots,projectId:model.getProject().projectId};
    });
    report.fixture={projectId:fixture.projectId,shotIds:fixture.shots.map((shot)=>shot.id),count:fixture.shots.length,syntheticFilmStills:true};
    await page.waitForFunction(()=>document.querySelector("#durable-status-title")?.textContent==="已儲存",null,{timeout:30000});
    await page.locator('.rail-button[data-view="output"]').click();
    await waitForOutputReady(page);
    const templateControl=page.locator("#output-template");
    assert.equal(await templateControl.count(),1,"template selector should be wired into the real output screen");
    assert.deepEqual(await templateControl.locator("option").evaluateAll((items)=>items.map((item)=>item.value).filter(Boolean)),templates,"all six template values should be available");
    assert.deepEqual(await page.locator("#output-items-per-page").evaluate((slider)=>({min:Number(slider.min),max:Number(slider.max)})),{min:1,max:12},"density selector should retain the requested 1–12 range");
    const superField=page.locator('[data-output-field="details.super"]');
    if(!(await superField.isChecked())){
      await superField.evaluate((input)=>{input.checked=true;input.dispatchEvent(new Event("change",{bubbles:true}));});
      await waitForOutputReady(page);
    }
    await setDensity(page,4);

    for(const template of selectedTemplates){
      for(const orientation of selectedOrientations){
        await setOrientation(page,"landscape");
        await setTemplate(page,template);
        if(process.env.OUTPUT_TEMPLATE_QA_DEFAULT_DENSITY!=="1")await setDensity(page,4);
        await setOrientation(page,orientation);
        const selectedDensity=Number(await page.locator("#output-items-per-page").inputValue());
        const state=await readState(page,`${template}-${orientation}-density-${selectedDensity}`);
        report.lastState={name:state.label,pages:state.pages.map((outputPage)=>({layout:outputPage.layout,template:outputPage.template,density:outputPage.density,orientation:outputPage.orientation,pageSize:outputPage.pageSize,overflow:outputPage.overflow,bodySize:outputPage.bodySize,records:outputPage.records}))};
        if(state.pages.length!==Math.ceil(fixture.shots.length/state.requestedDensity)){
          for(const [pageIndex,suffix] of [[0,"first"],[state.pages.length-1,"last"]]){
            const file=path.join(outputDir,`${template}-${orientation}-density-${String(state.requestedDensity).padStart(2,"0")}-${suffix}-diagnostic.png`);
            await page.locator("#print-document > .output-page").nth(pageIndex).screenshot({path:file,animations:"disabled"});
            report.screenshots.push(file);
          }
        }
        verifyBaseState(state,fixture.shots.map((shot)=>shot.id),fixture.sceneNumber,template,orientation);
        const records=state.pages.flatMap((outputPage)=>outputPage.records);
        if(template==="av"){
          for(let index=0;index<records.length;index++){
            const record=records[index],shot=fixture.shots[index];
            assert.ok(record.hooks.avVisual.includes(shot.visual)&&record.hooks.avVisual.includes(shot.move)&&record.hooks.avVisual.includes(shot.super),`${state.label}: visual column should retain visual, move, and SUPER fields`);
            assert.ok(record.hooks.avAudio.includes(shot.vo)&&record.hooks.avAudio.includes(shot.sound),`${state.label}: audio column should retain VO and sound fields`);
            assert.ok(!record.hooks.avVisual.includes(shot.vo)&&!record.hooks.avAudio.includes(shot.visual),`${state.label}: AV columns should not cross-contaminate`);
          }
        } else if(template==="contact"){
          for(let index=0;index<records.length;index++){
            const record=records[index],shot=fixture.shots[index];
            assert.ok(record.hooks.contact.includes(shot.title)&&record.hooks.contact.includes(`${fixture.sceneNumber}-${index+1}`),`${state.label}: contact card should retain its compact id/title`);
            assert.ok(!record.hooks.contact.includes(shot.vo)&&!record.hooks.contact.includes(shot.visual)&&!record.hooks.contact.includes(shot.sound)&&!record.hooks.contact.includes(shot.super),`${state.label}: contact card should omit descriptive fields`);
          }
        } else if(template==="vo"){
          for(let index=0;index<records.length;index++){
            const record=records[index],shot=fixture.shots[index];
            assert.ok(record.hooks.vo.includes(shot.vo),`${state.label}: VO-only row should carry its script`);
            assert.ok(!record.hooks.vo.includes(shot.visual)&&!record.hooks.vo.includes(shot.sound)&&!record.hooks.vo.includes(shot.super)&&!record.hooks.vo.includes(shot.move),`${state.label}: VO-only script area must not include other fields`);
          }
        }
        const pad=String(state.requestedDensity).padStart(2,"0");
        for(const [pageIndex,suffix] of [[0,"first"],[state.pages.length-1,"last"]]){
          const file=path.join(outputDir,`${template}-${orientation}-density-${pad}-${suffix}.png`);
          await page.locator("#print-document > .output-page").nth(pageIndex).screenshot({path:file,animations:"disabled"});
          report.screenshots.push(file);
        }
        await page.emulateMedia({media:"print"});
        const printState=await readState(page,`${template}-${orientation}-density-4-print-media`);
        assert.equal(printState.pages.length,state.pages.length,`${printState.label}: print media should keep the preview page count`);
        assert.deepEqual(printState.pages.map((outputPage)=>outputPage.layout),state.pages.map((outputPage)=>outputPage.layout),`${printState.label}: print media should preserve template layout`);
        assert.deepEqual(printState.pages.flatMap((outputPage)=>outputPage.records.map((record)=>record.id)),state.pages.flatMap((outputPage)=>outputPage.records.map((record)=>record.id)),`${printState.label}: print media should preserve every Shot id and order`);
        assert.ok(printState.pages.every((outputPage)=>outputPage.orientation===orientation&&!outputPage.overflow),`${printState.label}: print media should preserve orientation without page overflow`);
        await page.emulateMedia({media:"screen"});
        report.cases.push({name:`${template}-${orientation}-density-${state.requestedDensity}`,requestedDensity:state.requestedDensity,pageCount:state.pages.length,split:state.pages.map((outputPage)=>outputPage.records.length),pageSize:state.pages[0].pageSize});
      }
    }

    if(process.env.OUTPUT_TEMPLATE_QA_BASE_ONLY!=="1"){
    // Exercise a selected low/high density range in Chromium; effective layout
    // density may be lower than the preserved slider choice.
    if(process.env.OUTPUT_TEMPLATE_QA_SKIP_DENSITY_SWEEP!=="1"){
    await setTemplate(page,densitySweepTemplate);
    await setOrientation(page,"landscape");
    for(const requested of densitySweepSamples){
      await setDensity(page,requested);
      const state=await readState(page,`${densitySweepTemplate}-landscape-density-${requested}`);
      assert.equal(state.requestedDensity,requested,`${state.label}: user density preference must not be silently rewritten`);
      const records=state.pages.flatMap((outputPage)=>outputPage.records);
      assert.deepEqual(records.map((record)=>record.id),fixture.shots.map((shot)=>shot.id),`${state.label}: all 9 identifiers should remain 1:1 and ordered`);
      assert.ok(state.pages.every((outputPage)=>outputPage.layout===densitySweepTemplate&&outputPage.template===densitySweepTemplate&&!outputPage.overflow),`${state.label}: pages must stay in their template and fit`);
      assert.ok(state.pages.every((outputPage)=>outputPage.density>0&&outputPage.records.length<=outputPage.density),`${state.label}: page record count should respect its effective density`);
      const first=state.pages[0].records[0].cardBox,partial=state.pages.at(-1).records[0].cardBox;
      assert.ok(first&&partial&&Math.abs(first.width-partial.width)<=3&&Math.abs(first.height-partial.height)<=3,`${state.label}: partial page must retain slot sizing`);
      report.cases.push({name:state.label,requestedDensity:requested,effectiveDensity:state.pages[0]?.density,pageCount:state.pages.length,split:state.pages.map((outputPage)=>outputPage.records.length)});
      if(requested===12||requested===2){
        const file=path.join(outputDir,`${densitySweepTemplate}-landscape-density-${String(requested).padStart(2,"0")}-first.png`);
        await page.locator("#print-document > .output-page").first().screenshot({path:file,animations:"disabled"});
        report.screenshots.push(file);
      }
    }
    }

    // VO is deliberately isolated from visual, sound, SUPER, and camera fields;
    // an empty script should disappear without disturbing subsequent shot ids.
    if(process.env.OUTPUT_TEMPLATE_QA_SKIP_VO!=="1"){
    await setTemplate(page,"vo");
    const firstShot=fixture.shots[0];
    const emptyRevision=await page.evaluate(async(id)=>{const model=window.StoryModel;const revision=model.getProject().revision;await model.updateShot(id,{script:""});return revision+1;},firstShot.id);
    await page.waitForFunction((revision)=>window.StoryModel.getProject().revision>=revision,emptyRevision,{timeout:30000});
    await page.waitForFunction(()=>document.querySelector("#durable-status-title")?.textContent==="已儲存",null,{timeout:30000});
    await waitForOutputReady(page);
    const emptyVo=await readState(page,"vo-empty-first-script");
    const emptyVoRecords=emptyVo.pages.flatMap((outputPage)=>outputPage.records);
    assert.equal(emptyVoRecords.length,8,"VO template should omit only the shot whose script is empty");
    assert.deepEqual(emptyVoRecords.map((record)=>record.id),fixture.shots.slice(1).map((shot)=>shot.id),"omitting empty VO must preserve remaining source order and ids");
    assert.ok(emptyVoRecords.every((record)=>record.hooks.vo.trim().length>0),"VO-only output must not render empty script placeholders");
    await page.evaluate(async({id,script})=>window.StoryModel.updateShot(id,{script}),{id:firstShot.id,script:`VO-QA-01｜清晨的街道還沒有完全醒來。`});
    await page.waitForFunction(()=>document.querySelector("#durable-status-title")?.textContent==="已儲存",null,{timeout:30000});
    await waitForOutputReady(page);

    // Long VO runs across real output records; sentinels must survive in order,
    // and neither the page nor the row boxes may clip the text.
    const longVo=Array.from({length:32},(_,index)=>`LONGVO-SEG-${String(index+1).padStart(3,"0")}-The morning train crosses the old river bridge before the town wakes.`).join(" ");
    const longRevision=await page.evaluate(async({id,script})=>{const model=window.StoryModel;const revision=model.getProject().revision;await model.updateShot(id,{script});return revision+1;},{id:firstShot.id,script:longVo});
    await page.waitForFunction((revision)=>window.StoryModel.getProject().revision>=revision,longRevision,{timeout:30000});
    await page.waitForFunction(()=>document.querySelector("#durable-status-title")?.textContent==="已儲存",null,{timeout:30000});
    await setDensity(page,2);
    const longState=await readState(page,"vo-long-script-density-2");
    const firstFragments=longState.pages.flatMap((outputPage)=>outputPage.records).filter((record)=>record.id===firstShot.id);
    const visibleLongText=longState.pages.flatMap((outputPage)=>outputPage.records.filter((record)=>record.id===firstShot.id).map((record)=>record.hooks.vo)).join("");
    for(let index=1;index<=32;index++){
      const token=`LONGVO-SEG-${String(index).padStart(3,"0")}`;
      assert.ok(visibleLongText.includes(token),`long VO content must preserve ${token}`);
      assert.equal(visibleLongText.split(token).length-1,1,`long VO segment ${token} should appear once`);
    }
    assert.ok(firstFragments.length>=1,"long VO should retain its source Shot id");
    assert.ok(longState.pages.every((outputPage)=>!outputPage.overflow&&outputPage.records.every((record)=>!record.overflow)),"long VO pages and cards must not overflow or clip");
    const longFirstScreenshot=path.join(outputDir,"vo-long-script-density-02-page-first.png");
    const longLastScreenshot=path.join(outputDir,"vo-long-script-density-02-page-last.png");
    await page.locator("#print-document > .output-page").first().screenshot({path:longFirstScreenshot,animations:"disabled"});
    await page.locator("#print-document > .output-page").last().screenshot({path:longLastScreenshot,animations:"disabled"});
    report.screenshots.push(longFirstScreenshot,longLastScreenshot);
    report.longVo={segments:32,records:firstFragments.length,pages:longState.pages.length,allSegmentsPreserved:true,noOverflow:true};

    await page.waitForFunction(()=>document.querySelector("#durable-status-title")?.textContent==="已儲存",null,{timeout:30000});
    const storedPreferences=await page.evaluate(()=>window.StoryModel.getProject().outputPreferences);
    assert.equal(storedPreferences.template,"vo","VO template preference should be committed before reload");
    assert.equal(storedPreferences.densityByTemplate.vo,2,"VO density preference should be committed before reload");
    await page.reload({waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>window.StoryModel&&window.StoryModel.getLifecycle()?.phase!=="opening",null,{timeout:30000});
    await page.evaluate(async(projectId)=>{
      const current=window.StoryModel.getProject();
      if(!current||current.projectId!==projectId)await window.StoryModel.selectProject(projectId);
    },fixture.projectId);
    await page.waitForFunction((projectId)=>document.body.classList.contains("project-ready")&&window.StoryModel.getProject()?.projectId===projectId,fixture.projectId,{timeout:30000});
    await page.waitForFunction(()=>window.StoryModel.getLifecycle()?.phase==="ready",null,{timeout:45000});
    await page.locator('.rail-button[data-view="output"]').click();
    await waitForOutputReady(page);
    const reloaded=await page.evaluate(()=>({projectId:window.StoryModel.getProject().projectId,preferences:window.StoryModel.getProject().outputPreferences,shotCount:window.StoryModel.getProject().shots.length,slider:Number(document.querySelector("#output-items-per-page").value)}));
    assert.equal(reloaded.preferences.template,"vo","reload should restore the selected VO template");
    assert.equal(reloaded.preferences.densityByTemplate.vo,2,"reload should restore VO density 2");
    assert.equal(reloaded.slider,2,"reload should restore visible density 2");
    assert.equal(reloaded.shotCount,9,"reload should preserve all nine source shots");
    report.reloadPersistence={template:reloaded.preferences.template,density:reloaded.slider,shots:reloaded.shotCount,projectId:reloaded.projectId};

    const zipRoundTrip=await page.evaluate(async()=>{
      const model=window.StoryModel;
      const source=model.getProject();
      const archive=await model.exportCompletePackage();
      const preview=await model.previewCompletePackage(archive.archiveBytes,{mode:"copy"});
      const imported=await model.importCompletePackage(archive.archiveBytes,{mode:"copy"});
      await model.selectProject(imported.projectId);
      const copy=model.getProject();
      return {
        fileName:archive.fileName,archiveBytes:archive.archiveBytes.byteLength,
        sourceProjectId:source.projectId,previewProjectId:preview.projectId,copyProjectId:copy.projectId,
        previewShots:preview.counts.shots,previewAssets:preview.counts.assets,
        copiedShots:copy.shots.length,copiedAssets:copy.assets.length,
        preferences:copy.outputPreferences,
        firstScript:copy.shots[0]?.script||"",
        shotIds:copy.shots.map((shot)=>shot.id)
      };
    });
    assert.match(zipRoundTrip.fileName,/\.zip$/i,"export should build a real project ZIP archive");
    assert.ok(zipRoundTrip.archiveBytes>0,"project ZIP archive should contain bytes");
    assert.equal(zipRoundTrip.previewProjectId,fixture.projectId,"ZIP preview should verify the source Project ID");
    assert.notEqual(zipRoundTrip.copyProjectId,fixture.projectId,"ZIP copy import should assign a fresh Project ID");
    assert.deepEqual([zipRoundTrip.previewShots,zipRoundTrip.previewAssets,zipRoundTrip.copiedShots,zipRoundTrip.copiedAssets],[9,9,9,9],"ZIP round trip should preserve nine Shots and nine photo Assets");
    assert.equal(zipRoundTrip.preferences.template,"vo","ZIP round trip should preserve selected output template");
    assert.equal(zipRoundTrip.preferences.densityByTemplate.vo,2,"ZIP round trip should preserve template density");
    assert.equal(zipRoundTrip.firstScript,longVo,"ZIP round trip should preserve the complete long VO source string");
    assert.equal(new Set(zipRoundTrip.shotIds).size,9,"ZIP copy should remap every Shot ID without duplicates");
    await page.locator('.rail-button[data-view="output"]').click();
    await waitForOutputReady(page);
    assert.equal(await page.locator("#output-template").inputValue(),"vo","copied ZIP should restore the VO template in its output view");
    assert.equal(await page.locator("#output-items-per-page").inputValue(),"2","copied ZIP should restore the VO density in its output view");
    report.zipRoundTrip={fileName:zipRoundTrip.fileName,archiveBytes:zipRoundTrip.archiveBytes,shots:zipRoundTrip.copiedShots,assets:zipRoundTrip.copiedAssets,template:zipRoundTrip.preferences.template,density:zipRoundTrip.preferences.densityByTemplate.vo,sourceIdsRemapped:true,longVoPreserved:true};
    }
    }

    report.pageErrors=pageErrors;
    assert.deepEqual(pageErrors,[],"Chromium page should not emit uncaught errors");
    report.status="passed";
    report.boundary="Disposable local Chromium preview, print-media DOM, reload persistence, and complete ZIP copy round trip; native printer/PDF viewer acceptance was not part of this focused template QA.";
    fs.writeFileSync(path.join(outputDir,"result.json"),JSON.stringify(report,null,2)+"\n");
    process.stdout.write(JSON.stringify({status:report.status,outputDirectory:outputDir,cases:report.cases,longVo:report.longVo,screenshots:report.screenshots,result:path.join(outputDir,"result.json")},null,2)+"\n");
    await context.close();
  } catch(error) {
    report.status="failed";
    report.fatal=error&& (error.stack||error.message)||String(error);
    report.pageErrors=report.pageErrors||[];
    fs.writeFileSync(path.join(outputDir,"result.json"),JSON.stringify(report,null,2)+"\n");
    throw error;
  } finally {
    if(browser)await browser.close();
    await new Promise((resolve)=>server.close(resolve));
  }
}

main().catch((error)=>{console.error(error&&error.stack||error);process.exitCode=1;});
