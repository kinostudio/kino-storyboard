"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const dist = path.resolve(__dirname, "../dist");
const screenshotDir = path.resolve(__dirname, "../tmp/camera-presets-qa");
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\//, "") || "index.html";
  const file = path.resolve(dist, relative);
  if (file !== dist && !file.startsWith(dist + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, bytes) => {
    if (error) return response.writeHead(404).end();
    const ext = path.extname(file);
    response.setHeader("Content-Type", ext === ".css" ? "text/css" : ext === ".html" ? "text/html" : "text/javascript");
    response.setHeader("Cache-Control", "no-store");
    response.end(bytes);
  });
});

async function main() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || chromium.executablePath() });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:" + server.address().port);
    await page.locator("#lifecycle-project-title").fill("Disposable camera preset QA");
    await page.locator('button[name="createKind"][value="blank"]').click();
    await page.locator("body.project-ready").waitFor();
    const target = await page.evaluate(async () => {
      const model = window.StoryModel;
      const sceneId = await model.addScene("Camera presets");
      const shotId = await model.addShot(sceneId, { title: "Preset QA" });
      const drawingId = await model.createDrawingForShot(shotId);
      const drawing = model.getDrawing(drawingId);
      const scene = drawing.layers.find(layer => layer.kind === "scene");
      await model.appendDrawingStroke(drawingId, scene.id, {
        kind: "pen", color: "#123456", baseWidth: 6,
        points: [{ x: .2, y: .25, t: 0, pressure: null }, { x: .32, y: .4, t: 1, pressure: null }]
      });
      const host = document.createElement("main");
      host.id = "camera-preset-qa";
      host.className = "ds-drawing-popup";
      host.style.cssText = "position:fixed;inset:16px;z-index:9999;overflow:auto;background:white";
      document.body.append(host);
      window.presetQa = DirectorStoryboardDrawingEditor.mount(host, {
        model, projectId: model.getProject().projectId, shotId, drawingId: drawingId,
        drawing: model.getDrawing(drawingId), onBack: () => {}
      });
      window.presetProjectId = model.getProject().projectId;
      window.presetDrawingId = drawingId;
      await presetQa.refresh();
      return { projectId: window.presetProjectId, drawingId: drawingId };
    });

    const settled = async () => page.waitForFunction(() => {
      const editor = window.presetQa && window.presetQa.editor;
      return editor && !editor.drawingBusy && !editor.pendingOperation && !editor.strokeQueue.length;
    }, null, { timeout: 30000 });
    await settled();
    await page.locator(".ds-de-camera-preset-toggle").click();
    await page.locator(".ds-de-camera-preset-panel").waitFor({ state: "visible" });
    assert.equal(await page.locator(".ds-de-camera-preset-choice").count(), 17, "all required presets are listed");
    const aspectCheck = await page.evaluate(() => {
      const editor = presetQa.editor;
      const labels = Array.from(document.querySelectorAll(".ds-de-camera-preset-choice")).map(node => node.dataset.cameraPreset);
      return ["1:1", "4:3", "16:9", "2.35:1"].map(aspectRatio => {
        const canvas = DirectorStoryboardDrawingEditor.getCanonicalCanvasSize(aspectRatio);
        const strokes = labels.flatMap(label => editor.makeCameraPresetStrokes(label,
          { x: 0, y: 0, scale: 125, flipX: true, flipY: true }, canvas, "#214365", .6, 7));
        return { aspectRatio: aspectRatio, strokeCount: strokes.length, kinds: Array.from(new Set(strokes.map(stroke => stroke.kind))),
          inBounds: strokes.every(stroke => stroke.kind === "pen" || stroke.kind === "cameraArrow") && strokes.every(stroke =>
            stroke.points.length >= 2 && stroke.points.every(point => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)) };
      });
    });
    assert.deepEqual(aspectCheck.map(result => result.aspectRatio), ["1:1", "4:3", "16:9", "2.35:1"]);
    assert(aspectCheck.every(result => result.strokeCount > 100 && result.inBounds), "every preset remains valid at all four canvas ratios");

    await page.locator('button[data-camera-preset="PAN L"]').click();
    await page.locator('input[aria-label="新筆畫顏色"]').evaluate(input => {
      input.value = "#123456";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator('input[aria-label="筆刷不透明度"]').evaluate(input => {
      input.value = "60";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator('input[aria-label="運鏡圖層大小"]').evaluate(input => {
      input.value = "125";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator('input[aria-label="水平翻轉運鏡圖層"]').check();
    assert.match(await page.locator(".ds-de-camera-preset-apply").innerText(), /PAN R/, "direction label follows a horizontal flip");
    await page.locator(".ds-de-camera-preset-apply").click();
    await settled();
    const afterInsert = await page.evaluate(() => {
      const drawing = StoryModel.getDrawing(presetDrawingId);
      const preset = drawing.layers.find(layer => layer.name === "運鏡 PAN R");
      return { layerCount: drawing.layers.length, preset: preset && {
        kind: preset.kind, order: preset.order, opacity: preset.opacity, visible: preset.visible, locked: preset.locked,
        strokes: preset.strokes.map(stroke => ({ kind: stroke.kind, color: stroke.color, baseWidth: stroke.baseWidth, points: stroke.points }))
      }, sceneStrokeCount: drawing.layers.find(layer => layer.kind === "scene").strokes.length };
    });
    assert.equal(afterInsert.layerCount, 3, "preset occupies a separate custom layer");
    assert.equal(afterInsert.sceneStrokeCount, 1, "existing artwork remains on the scene layer");
    assert.equal(afterInsert.preset.kind, "custom");
    assert.equal(afterInsert.preset.opacity, 1, "new layer is transparent and independently composited");
    assert.equal(afterInsert.preset.visible, true);
    assert.equal(afterInsert.preset.locked, false);
    assert(afterInsert.preset.strokes.some(stroke => stroke.kind === "cameraArrow"));
    assert(afterInsert.preset.strokes.every(stroke => ["pen", "cameraArrow"].includes(stroke.kind)));
    assert(afterInsert.preset.strokes.every(stroke => stroke.color === "rgba(18, 52, 86, 0.6)"), "current color and opacity are captured");

    await page.evaluate(async () => {
      await StoryModel.undo();
      if (StoryModel.getDrawing(presetDrawingId).layers.some(layer => layer.kind === "custom" && layer.name.startsWith("運鏡 "))) throw Error("one undo must remove the complete preset");
      await StoryModel.redo();
      if (!StoryModel.getDrawing(presetDrawingId).layers.some(layer => layer.name === "運鏡 PAN R")) throw Error("one redo must restore the complete preset");
      await presetQa.refresh();
      presetQa.editor.layerId = StoryModel.getDrawing(presetDrawingId).layers.find(layer => layer.name === "運鏡 PAN R").id;
      presetQa.editor.updateControls();
    });
    await settled();

    await page.locator(".ds-de-camera-preset-toggle").click();
    await page.locator('button[data-camera-preset="DOLLY IN"]').click();
    const assertPresetPanelFits = async () => {
      const layout = await page.evaluate(() => {
        const panel = document.querySelector(".ds-de-camera-preset-panel");
        const grid = document.querySelector(".ds-de-camera-preset-grid");
        const preview = document.querySelector(".ds-de-camera-preset-preview");
        const apply = document.querySelector(".ds-de-camera-preset-apply");
        return {
          panelBottom: panel.getBoundingClientRect().bottom,
          viewportHeight: window.innerHeight,
          galleryScrolls: grid.scrollHeight > grid.clientHeight,
          previewVisible: preview && !preview.hidden,
          applyVisible: apply && !apply.hidden && apply.getBoundingClientRect().bottom <= window.innerHeight
        };
      });
      assert(layout.panelBottom <= layout.viewportHeight, "preset panel fits inside the viewport");
      assert(layout.galleryScrolls, "preset choices scroll within their gallery");
      assert(layout.previewVisible && layout.applyVisible, "preview and apply remain visible below the gallery");
    };
    await assertPresetPanelFits();
    await page.screenshot({ path: path.join(screenshotDir, "desktop-preset-popover.png") });
    await page.setViewportSize({ width: 1194, height: 834 });
    await assertPresetPanelFits();
    await page.screenshot({ path: path.join(screenshotDir, "ipad-landscape-preset-popover.png") });
    await page.locator(".ds-de-camera-preset-toggle").click();
    await page.locator('summary[aria-label="圖層"]').click();
    await page.locator(".ds-de-layer-row").first().waitFor({ state: "visible" });
    assert.equal(await page.locator(".ds-de-layer-row").count(), 3, "all layer thumbnails render before taking the layer screenshot");
    await page.screenshot({ path: path.join(screenshotDir, "ipad-landscape-layers-and-art.png") });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator(".ds-de-layer-row").first().waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(screenshotDir, "desktop-layers-and-art.png") });
    const layerRow = page.locator(".ds-de-layer-row").filter({ hasText: "運鏡 PAN R" });
    await layerRow.locator('button[data-layer-action="visibility"]').click();
    await page.waitForFunction(() => !StoryModel.getDrawing(presetDrawingId).layers.find(layer => layer.name === "運鏡 PAN R").visible);
    await layerRow.locator('button[data-layer-action="lock"]').click();
    await page.waitForFunction(() => StoryModel.getDrawing(presetDrawingId).layers.find(layer => layer.name === "運鏡 PAN R").locked);
    const orderBefore = await page.evaluate(() => StoryModel.getDrawing(presetDrawingId).layers.find(layer => layer.name === "運鏡 PAN R").order);
    await layerRow.locator('button[data-layer-action="down"]').click();
    await page.waitForFunction(previous => StoryModel.getDrawing(presetDrawingId).layers.find(layer => layer.name === "運鏡 PAN R").order < previous, orderBefore);
    const stored = await page.evaluate(() => {
      window.presetSavedProject = StoryModel.getProject();
      presetQa.destroy();
      document.querySelector("#camera-preset-qa").remove();
      return window.presetSavedProject;
    });
    await page.evaluate(async () => { await StoryModel.release(); });
    await page.reload();
    await page.evaluate(async projectId => { await StoryModel.ready(); await StoryModel.selectProject(projectId); }, target.projectId);
    await page.locator("body.project-ready").waitFor();
    const reloadProject = await page.evaluate(() => StoryModel.getProject());
    assert.deepEqual(reloadProject.drawings, stored.drawings, "hide, lock, reorder, and vector strokes persist after reload");

    const exported = await page.evaluate(async () => {
      const before = StoryModel.getProject();
      const archive = await StoryModel.exportCompletePackage();
      const copy = await StoryModel.importCompletePackage(archive.archiveBytes, { mode: "copy" });
      await StoryModel.selectProject(copy.projectId);
      const restored = StoryModel.getProject();
      const normalize = drawings => drawings.map(drawing => ({ canvas: drawing.canvas, layers: drawing.layers.map(layer => ({
        kind: layer.kind, name: layer.name, order: layer.order, opacity: layer.opacity, visible: layer.visible, locked: layer.locked,
        strokes: layer.strokes.map(stroke => ({ kind: stroke.kind, color: stroke.color, baseWidth: stroke.baseWidth, points: stroke.points }))
      })) }));
      window.presetDrawingId = restored.drawings[0].id;
      return { bytes: archive.archiveBytes.byteLength, before: normalize(before.drawings), after: normalize(restored.drawings), drawingId: restored.drawings[0].id };
    });
    assert(exported.bytes > 0);
    assert.deepEqual(exported.after, exported.before, "project ZIP copy preserves all custom vector strokes and layer state");

    const reloaded = await page.evaluate(async drawingId => {
      const model = StoryModel;
      const drawing = model.getDrawing(drawingId);
      const host = document.createElement("main");
      host.id = "camera-preset-edit-qa";
      host.className = "ds-drawing-popup";
      host.style.cssText = "position:fixed;inset:16px;z-index:9999;overflow:auto;background:white";
      document.body.append(host);
      window.presetQa = DirectorStoryboardDrawingEditor.mount(host, {
        model, projectId: model.getProject().projectId, shotId: drawing.shotId, drawingId: drawing.id, drawing, onBack: () => {}
      });
      await presetQa.refresh();
      return { drawingId: drawing.id };
    }, exported.drawingId);
    await settled();
    await page.locator('summary[aria-label="圖層"]').click();
    const persistedRow = page.locator(".ds-de-layer-row").filter({ hasText: "運鏡 PAN R" });
    await persistedRow.locator('button[data-layer-action="select"]').click();
    await persistedRow.locator('button[data-layer-action="visibility"]').click();
    await page.waitForFunction(() => StoryModel.getDrawing(presetDrawingId).layers.find(layer => layer.name === "運鏡 PAN R").visible);
    await persistedRow.locator('button[data-layer-action="lock"]').click();
    await page.waitForFunction(() => !StoryModel.getDrawing(presetDrawingId).layers.find(layer => layer.name === "運鏡 PAN R").locked);
    await persistedRow.locator('button[data-layer-action="adjustPreset"]').click();
    await page.locator(".ds-de-camera-preset-preview").waitFor({ state: "visible" });
    assert(await page.locator(".ds-de-camera-preset-grid").isHidden(), "reopened layer adjustment starts from the saved layer strokes");
    const beforeTransform = await page.evaluate(drawingId => {
      const drawing = StoryModel.getDrawing(drawingId);
      const layer = drawing.layers.find(item => item.name === "運鏡 PAN R");
      return { count: layer.strokes.length, points: layer.strokes.flatMap(stroke => stroke.points.map(point => [point.x, point.y])), scene: drawing.layers.find(item => item.kind === "scene").strokes };
    }, reloaded.drawingId);
    await page.locator('input[aria-label="運鏡圖層大小"]').evaluate(input => {
      input.value = "115";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const xRange = page.locator('input[aria-label="運鏡圖層水平位置"]');
    await xRange.evaluate(input => {
      input.value = String(Math.min(4, Number(input.max)));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator(".ds-de-camera-preset-apply").click();
    await settled();
    const afterTransform = await page.evaluate(drawingId => {
      const drawing = StoryModel.getDrawing(drawingId);
      const layer = drawing.layers.find(item => item.name === "運鏡 PAN R");
      return { count: layer.strokes.length, points: layer.strokes.flatMap(stroke => stroke.points.map(point => [point.x, point.y])), scene: drawing.layers.find(item => item.kind === "scene").strokes };
    }, reloaded.drawingId);
    assert.equal(afterTransform.count, beforeTransform.count, "editing transforms all saved strokes without dropping any");
    assert.notDeepEqual(afterTransform.points, beforeTransform.points, "post-reload movement and scale change the layer geometry");
    assert.deepEqual(afterTransform.scene, beforeTransform.scene, "post-reload layer editing leaves scene artwork unchanged");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "passed", checks: ["17 thumbnail presets", "vector labels and current color/opacity", "four normalized canvas ratios", "atomic add with one undo/redo", "hide/lock/reorder", "project reload", "ZIP copy", "post-reload whole-layer transforms"], aspectRatios: aspectCheck, presetStrokeCount: afterInsert.preset.strokes.length, zipBytes: exported.bytes, screenshots: ["desktop-preset-popover.png", "ipad-landscape-preset-popover.png", "desktop-layers-and-art.png", "ipad-landscape-layers-and-art.png"].map(name => path.join(screenshotDir, name)) }));
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
