"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

(async () => {
  const dist = path.resolve(__dirname, "../dist");
  const server = http.createServer((req, res) => {
    const file = path.resolve(dist, "." + new URL(req.url, "http://localhost").pathname.replace(/\/$/, "/index.html"));
    if (!file.startsWith(dist + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (error, bytes) => {
      if (error) return res.writeHead(404).end();
      res.setHeader("Content-Type", file.endsWith(".js") ? "application/javascript" : file.endsWith(".css") ? "text/css" : "text/html");
      res.end(bytes);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || chromium.executablePath() });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(process.env.DRAWING_QA_URL || "http://127.0.0.1:" + server.address().port);
    await page.locator("#lifecycle-project-title").fill("Disposable drawing v3 QA");
    await page.locator('button[name="createKind"][value="blank"]').click();
    await page.locator("body.project-ready").waitFor();
    await page.evaluate(async () => {
      const model = window.StoryModel;
      const scene = await model.addScene("QA");
      const shot = await model.addShot(scene, { title: "Drawing QA" });
      const photo = document.createElement("canvas"); photo.width=320; photo.height=180;
      photo.getContext("2d").fillRect(0,0,320,180);
      await model.addShotPhotos(shot, [new File([await new Promise(resolve => photo.toBlob(resolve))], "qa.png", {type:"image/png"})]);
      const assetId = model.getProject().shots.find(s => s.id === shot).assetIds[0];
      const crop = {x:.1,y:.1,width:.8,height:.8};
      await model.setShotPhotoCrop(shot, assetId, crop);
      window.qaShot = shot;
      const host = document.createElement("main");
      host.id = "drawing-qa";
      host.className = "ds-drawing-popup";
      host.style.cssText = "position:fixed;inset:0;z-index:9999;overflow:auto;background:white";
      document.body.append(host);
      window.qaEditor = DirectorStoryboardDrawingEditor.mount(host, { model, projectId: model.getProject().projectId, shotId: shot, draft: true, onBack:()=>{}, defaultBackgroundAssetId:assetId, defaultBackgroundCrop:crop });
      await qaEditor.refresh();
      qaEditor.editor.addLayer();
      qaEditor.editor.moveLayer(qaEditor.editor.layerId, -1);
    });
    async function settled() {
      await page.waitForFunction(() => !qaEditor.editor.drawingBusy && !qaEditor.editor.pendingOperation, null, {timeout:10000}).catch(async error => {
        console.error(await page.evaluate(() => ({status:qaEditor.editor.statusText,pending:qaEditor.editor.pendingOperation,errors:qaEditor.editor.pendingOperation?.error?.message})));
        throw error;
      });
    }
    async function stroke(tool) {
      await page.locator('[data-tool="' + tool + '"]').click();
      const box = await page.locator(".ds-de-canvas").boundingBox();
      await page.mouse.move(box.x + box.width * .3, box.y + box.height * .3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * .6, box.y + box.height * .5, { steps: 14 });
      await page.mouse.up();
      await settled();
    }
    await stroke("brush");
    assert.equal(await page.evaluate(() => qaEditor.editor.isDraft), false, "first stroke commits custom draft layers");
    await stroke("marker");
    await stroke("pencil");
    await stroke("circle");
    await stroke("rectangle");
    await stroke("cameraArrow");
    const tools = await page.evaluate(() => {
      const e = qaEditor.editor;
      const strokes = e.activeLayer().strokes;
      const result = { count: strokes.length, brush: strokes[0].points.map(p => p.pressure), marker: strokes[1], pencil: strokes[2], circle: strokes[3].points.length, rectangle: strokes[4].points.length, arrow: strokes[5].kind };
      e.pencilOnly = true;
      result.pencilOnly = !e.acceptsPointer({ pointerType: "mouse" }) && e.acceptsPointer({ pointerType: "pen" });
      e.pencilOnly = false;
      return result;
    });
    assert.equal(tools.count, 6);
    assert(tools.brush.every(p => p >= 0 && p <= 1));
    assert(new Set(tools.brush).size > 2, "simulated pressure varies");
    assert(tools.brush.slice(1).every((p,i) => Math.abs(p-tools.brush[i]) < .1), "pressure changes gradually");
    assert(tools.marker.color.endsWith(", 0.45)"));
    assert(tools.marker.points.every(p => p.pressure === null));
    assert(tools.pencil.points.every(p => p.pressure === null));
    assert.equal(tools.circle, 49);
    assert.equal(tools.rectangle, 5);
    assert.equal(tools.arrow, "cameraArrow");
    assert(tools.pencilOnly);
    fs.mkdirSync(path.resolve(__dirname,"../tmp/drawing-v3"), {recursive:true});
    for (const [width,height,label] of [[1366,900,"landscape"],[834,1194,"portrait"]]) {
      await page.setViewportSize({width,height});
      const box = await page.locator(".ds-de-canvas").boundingBox();
      assert(box.y >= 0 && box.y+box.height <= height, label+" canvas must fit on screen");
      await page.screenshot({path:path.resolve(__dirname,"../tmp/drawing-v3/"+label+".png")});
    }
    // Exercise saved layer commands through the editor, including undo/redo.
    await page.evaluate(() => qaEditor.editor.addLayer()); await settled();
    await page.evaluate(() => qaEditor.editor.runLayerState(qaEditor.editor.layerId, { visible: false, locked: true })); await settled();
    await page.evaluate(() => qaEditor.editor.moveLayer(qaEditor.editor.layerId, -1)); await settled();
    page.on("dialog", dialog => dialog.accept());
    await page.evaluate(() => qaEditor.editor.deleteLayer(qaEditor.editor.layerId)); await settled();
    await page.evaluate(async () => { await StoryModel.undo(); await StoryModel.redo(); });
    const source = await page.evaluate(async () => {
      window.qaSaved = StoryModel.getProject();
      qaEditor.destroy(); document.querySelector("#drawing-qa").remove();
      await StoryModel.release();
      return qaSaved;
    });
    await page.reload();
    await page.evaluate(async projectId => { await StoryModel.ready(); await StoryModel.selectProject(projectId); }, source.projectId);
    await page.locator("body.project-ready").waitFor();
    assert.deepEqual(await page.evaluate(() => StoryModel.getProject().drawings), source.drawings, "IndexedDB survives reload exactly");
    const roundtrip = await page.evaluate(async () => {
      const normalize = drawings => drawings.map(d => ({ canvas: d.canvas, layers: d.layers.map(l => ({ kind:l.kind, name:l.name, order:l.order, opacity:l.opacity, visible:l.visible, locked:l.locked, strokes:l.strokes.map(s => ({ kind:s.kind,color:s.color,baseWidth:s.baseWidth,points:s.points })) })) }));
      const before = StoryModel.getProject();
      const assets = [];
      for (const a of before.assets) assets.push(await StoryModel.getAsset(before.projectId,a.id));
      const archive = await StoryModel.exportCompletePackage();
      const copy = await StoryModel.importCompletePackage(archive.archiveBytes, { mode: "copy" });
      await StoryModel.selectProject(copy.projectId);
      const restored = StoryModel.getProject();
      const asset = await StoryModel.getAsset(restored.projectId,restored.drawings[0].backgroundAssetId);
      const image = await createImageBitmap(asset.originalBlob);
      const snapshot = DirectorStoryboardRenderer.createSnapshot(restored.drawings[0], {backgroundImage:image,backgroundFingerprint:restored.assets[0].sha256});
      const canvas = document.createElement("canvas");
      DirectorStoryboardRenderer.renderToCanvas(canvas, snapshot, { width:640,height:360 });
      image.close();
      const legacy = [];
      const sameCrop = (a,b) => a === b || a && b && ["x","y","width","height"].every(k => a[k] === b[k]);
      for (const version of [1,2]) {
        const old = JSON.parse(JSON.stringify(before));
        old.drawings[0].schemaVersion = version;
        old.drawings[0].layers = old.drawings[0].layers.filter(l => l.kind !== "custom");
        old.drawings[0].layers.forEach((l,i) => { l.order=i; });
        old.drawings[0].layers[0].strokes = [{id:"legacy-stroke",kind:"pen",color:"#112233",baseWidth:4,points:[{x:.2,y:.2,t:0,pressure:null},{x:.8,y:.8,t:20,pressure:null}]}];
        if (version === 1) delete old.drawings[0].backgroundCrop;
        const packed = await DirectorStoryboardProjectPackage.exportProjectPackage(old, assets, {zipAdapter:DirectorStoryboardZipAdapter});
        const imported = await StoryModel.importCompletePackage(packed.archiveBytes, {mode:"copy"});
        await StoryModel.selectProject(imported.projectId);
        const project = StoryModel.getProject();
        const id = project.drawings[0].id;
        if (version === 2) {
          const bridge = window.StoryProjectBridge;
          const unchanged = bridge.applyCommand(project,"setDrawingBackground",[id,project.drawings[0].backgroundAssetId]);
          if (!sameCrop(unchanged.project.drawings[0].backgroundCrop,old.drawings[0].backgroundCrop)) throw Error("v2 crop lost");
          const removed = bridge.applyCommand(project,"setDrawingBackground",[id,null]);
          if (removed.project.drawings[0].backgroundCrop!==null) throw Error("v2 crop not cleared with photo");
        }
        await StoryModel.addDrawingLayer(id, "相容性圖層");
        const upgraded = StoryModel.getProject().drawings[0];
        if (!upgraded.layers[0].strokes[0].points.every((p,i)=>["x","y","t","pressure"].every(k=>p[k]===old.drawings[0].layers[0].strokes[0].points[i][k]))) throw Error("legacy stroke changed");
        if (version===2 && !sameCrop(upgraded.backgroundCrop,old.drawings[0].backgroundCrop)) throw Error("upgraded crop changed");
        legacy.push({version,upgraded:StoryModel.getProject().drawings[0].schemaVersion});
      }
      return { before:normalize(before.drawings),after:normalize(restored.drawings), remapped:restored.drawings[0].id!==before.drawings[0].id, legacy, bytes:archive.archiveBytes.byteLength };
    });
    assert.deepEqual(roundtrip.after, roundtrip.before);
    assert(roundtrip.remapped);
    delete roundtrip.before; delete roundtrip.after;
    assert.deepEqual(roundtrip.legacy, [{version:1,upgraded:3},{version:2,upgraded:3}]);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result:"passed",checks:["draft custom layers saved with first stroke","six tools, pressure smoothing, constant marker alpha","saved layer commands and undo/redo","IndexedDB reload","ZIP copy with remapped IDs and exact vector content","v1/v2 ZIP import and upgrade","renderer snapshot"],roundtrip }));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode=1; });
