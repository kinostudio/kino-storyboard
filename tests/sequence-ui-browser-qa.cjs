"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const fixture = path.join(__dirname, "photo-crop-qa-primary.png");
const contentTypes = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };

async function closeDrawingDraft(page) {
  const popup = page.locator(".sequence-drawing-popup");
  await popup.locator(".ds-de-back").click();
  await page.waitForTimeout(150);
  if (await popup.count()) {
    const closeDialog = popup.locator(".ds-de-close-dialog");
    if (await closeDialog.count()) {
      const open = await closeDialog.evaluate((dialog) => dialog.open);
      if (open) await closeDialog.getByRole("button", { name: "返回關閉" }).click();
      else throw new Error("Drawing close prompt was mounted but not opened.");
    } else {
      throw new Error("Drawing editor remained open without its close prompt: " + (await popup.innerText()).slice(0, 200));
    }
  }
  await popup.waitFor({ state: "detached" });
}

async function main() {
  const browserPath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || chromium.executablePath();
  assert.ok(fs.existsSync(browserPath), "Pinned Chromium executable is missing.");
  assert.ok(fs.existsSync(fixture), "Photo crop fixture is missing.");
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(dist, relative);
    if (file !== dist && !file.startsWith(dist + path.sep)) return response.writeHead(403).end();
    fs.readFile(file, (error, bytes) => {
      if (error) return response.writeHead(404).end();
      response.setHeader("Content-Type", contentTypes[path.extname(file)] || "application/octet-stream");
      response.setHeader("Cache-Control", "no-store");
      response.end(bytes);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: browserPath });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await page.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    assert.ok(response && response.ok(), "Local storyboard returned an unsuccessful response.");
    await page.locator("#lifecycle-project-title").waitFor({ state: "visible" });
    await page.locator("#lifecycle-project-title").fill("Sequence editor UI QA");
    await page.locator('#lifecycle-create-form button[name="createKind"][value="blank"]').click();
    await page.locator("body.project-ready").waitFor({ state: "attached" });
    const shotId = await page.evaluate(async () => {
      const sceneId = await StoryModel.addScene("連續分鏡 QA");
      await StoryModel.addShot(sceneId, { title: "主鏡頭", visual: "A 畫面", script: "A 旁白", duration: 8 });
      return StoryModel.getProject().shots[0].id;
    });
    const host = page.locator('[data-sequence-host="' + shotId + '"]');
    await host.waitFor({ state: "attached" });
    await page.locator(".sequence-menu summary").click();
    await page.locator('[data-action="sequence-add"][data-shot-id="' + shotId + '"]').click();
    await host.locator('.sequence-frame-row.is-placeholder [data-sequence-field="visual"]').waitFor({ state: "visible" });

    let frameCount = await page.evaluate((id) => StoryModel.getSequenceFrames(id).length, shotId);
    assert.equal(frameCount, 1, "Opening the local B placeholder does not persist an empty frame.");
    await page.waitForTimeout(750);
    frameCount = await page.evaluate((id) => StoryModel.getSequenceFrames(id).length, shotId);
    assert.equal(frameCount, 1, "An untouched trailing placeholder remains local.");

    const bVisual = "B 畫面第一行\nB 畫面第二行";
    await host.locator('.sequence-frame-row.is-placeholder [data-sequence-field="visual"]').fill(bVisual);
    await page.waitForFunction((id) => StoryModel.getSequenceFrames(id).length === 2, shotId);
    let frames = await page.evaluate((id) => StoryModel.getSequenceFrames(id), shotId);
    assert.equal(frames[1].visual, bVisual, "Typing in B creates and saves the child frame with multiline text.");
    await host.locator('.sequence-frame-row[data-sequence-saved-frame] [data-sequence-field="script"]').fill("B 旁白");
    await host.locator('.sequence-frame-row[data-sequence-saved-frame] [data-sequence-field="super"]').fill("B 字卡");
    await host.locator('.sequence-frame-row[data-sequence-saved-frame] [data-sequence-field="visual"]').click();
    await page.waitForFunction((id) => {
      const b = StoryModel.getSequenceFrames(id)[1];
      return b && b.script === "B 旁白" && b.super === "B 字卡";
    }, shotId);
    assert.equal(await host.locator('.sequence-frame-row.is-placeholder').count(), 1, "A committed B immediately gets one local C placeholder.");
    assert.equal(await host.locator('.sequence-frame-row[data-sequence-saved-frame]').count(), 1, "Only saved children are counted as rows.");

    const cancelPhotoButton = host.locator('.sequence-frame-row.is-placeholder [data-sequence-action="photo"]');
    const cancelChooserPromise = page.waitForEvent("filechooser");
    await cancelPhotoButton.click();
    const cancelChooser = await cancelChooserPromise;
    await cancelChooser.setFiles([]);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate((id) => StoryModel.getSequenceFrames(id).length, shotId), 2, "Canceling the trailing photo picker creates no frame.");

    await host.locator('.sequence-frame-row.is-placeholder [data-sequence-action="drawing"]').click();
    await page.locator(".sequence-drawing-popup .ds-de-canvas").waitFor({ state: "visible" });
    await closeDrawingDraft(page);
    assert.equal(await page.evaluate((id) => StoryModel.getSequenceFrames(id).length, shotId), 2, "Canceling an empty trailing Drawing creates no frame.");

    await page.evaluate(() => {
      const api = window.DirectorStoryboardDrawingEditor;
      window.DirectorStoryboardDrawingEditor = Object.assign({}, api, {
        mount(container, options) {
          const handle = api.mount(container, options);
          window.__sequenceQaDrawingHandle = handle;
          return handle;
        }
      });
    });
    await host.locator('.sequence-frame-row.is-placeholder [data-sequence-action="drawing"]').click();
    const drawingDialog = page.locator(".sequence-drawing-popup");
    const canvas = drawingDialog.locator(".ds-de-canvas");
    await canvas.waitFor({ state: "visible" });
    const canvasBox = await canvas.boundingBox();
    assert.ok(canvasBox && canvasBox.width > 100 && canvasBox.height > 100, "Drawing canvas is visible and interactive.");
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.24, canvasBox.y + canvasBox.height * 0.32);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.7, canvasBox.y + canvasBox.height * 0.66, { steps: 8 });
    await page.mouse.up();
    try {
      await page.waitForFunction((id) => StoryModel.getSequenceFrames(id).length === 3, shotId, { timeout: 10000 });
    } catch (error) {
      const diagnostic = await page.evaluate(() => {
        const editor = window.__sequenceQaDrawingHandle && window.__sequenceQaDrawingHandle.editor;
        const lifecycle = StoryModel.getLifecycle();
        const shot = StoryModel.getProject().shots[0];
        const pending = editor && editor.pendingOperation;
        return {
          frameCount: StoryModel.getSequenceFrames(shot.id).length,
          lifecycle: { phase: lifecycle.phase, pendingCount: lifecycle.pendingCount, writable: lifecycle.writable },
          statusText: editor && editor.statusText,
          drawingBusy: editor && editor.drawingBusy,
          isDraft: editor && editor.isDraft,
          activeStroke: editor && editor.activeStroke && editor.activeStroke.points.length,
          pending: pending && { kind: pending.kind, error: pending.error && pending.error.message, code: pending.error && pending.error.code, baseRevision: pending.baseRevision }
        };
      });
      throw new Error("First stroke did not persist a child Drawing: " + JSON.stringify(diagnostic) + "; " + error.message);
    }
    let drawingFrame = await page.evaluate((id) => StoryModel.getSequenceFrames(id)[2], shotId);
    assert.ok(drawingFrame.drawingIds.length === 1, "The first saved stroke atomically creates its frame and Drawing.");
    const drawingId = drawingFrame.drawingIds[0];
    assert.equal(await page.evaluate((id) => StoryModel.getDrawing(id).frameId, drawingId), drawingFrame.id, "The Drawing remains attached to the child frame.");
    await page.locator(".sequence-drawing-popup .ds-de-header-actions .ds-de-save-close").click();
    await page.locator(".sequence-drawing-popup").waitFor({ state: "detached", timeout: 20000 });
    await host.locator('.sequence-frame-row[data-sequence-saved-frame] img.sequence-drawing-image').waitFor({ state: "visible", timeout: 20000 });

    const photoButton = host.locator('.sequence-frame-row.is-placeholder [data-sequence-action="photo"]');
    const chooserPromise = page.waitForEvent("filechooser");
    await photoButton.click();
    const chooser = await chooserPromise;
    await chooser.setFiles(fixture);
    const cropEditor = page.locator(".sequence-photo-crop-mount .photo-crop-editor");
    await cropEditor.waitFor({ state: "visible", timeout: 20000 });
    await cropEditor.getByRole("button", { name: "套用裁切" }).click();
    await page.waitForFunction((id) => StoryModel.getSequenceFrames(id).length === 4, shotId, { timeout: 20000 });
    frames = await page.evaluate((id) => StoryModel.getSequenceFrames(id), shotId);
    const photoFrame = frames[3];
    assert.equal(photoFrame.assetIds.length, 1, "Photo confirmation creates a child frame with exactly one image.");
    assert.ok(photoFrame.photoCropsByAssetId && photoFrame.photoCropsByAssetId[photoFrame.assetIds[0]], "Confirmed crop is stored on the child frame.");
    await host.locator('.sequence-frame-row[data-sequence-saved-frame] img.sequence-photo-image').waitFor({ state: "visible", timeout: 20000 });
    assert.equal(await host.locator('.sequence-frame-row[data-sequence-saved-frame] img.sequence-drawing-image').count(), 1, "Saved drawing renders as an image preview.");

    await page.screenshot({ path: path.join(root, "tmp", "sequence-ui-qa.png"), fullPage: true });

    const savedRows = host.locator(".sequence-frame-row[data-sequence-saved-frame]");
    const originalOrder = await page.evaluate((id) => StoryModel.getSequenceFrames(id).map((frame) => frame.id), shotId);
    await savedRows.nth(0).locator('[data-sequence-action="move-down"]').click();
    await page.waitForFunction((args) => StoryModel.getSequenceFrames(args.id).map((frame) => frame.id).join(",") !== args.order.join(","), { id: shotId, order: originalOrder });
    const reordered = await page.evaluate((id) => StoryModel.getSequenceFrames(id).map((frame) => frame.id), shotId);
    assert.equal(reordered[1], originalOrder[2], "The child row reorder control swaps stable frame content.");
    page.once("dialog", (dialog) => dialog.accept());
    await host.locator('.sequence-frame-row[data-sequence-saved-frame]').first().getByRole("button", { name: /刪除/ }).click();
    await page.waitForFunction((args) => StoryModel.getSequenceFrames(args.id).length === args.count - 1, { id: shotId, count: 4 });

    const final = await page.evaluate((id) => {
      const project = StoryModel.getProject();
      const shot = project.shots.find((item) => item.id === id);
      return { count: StoryModel.getSequenceFrames(id).length, duration: shot.durationSeconds, scheduleRows: project.scheduleEntries.filter((item) => item.type === "shot" && item.shotId === id).length };
    }, shotId);
    assert.equal(final.count, 3, "Deleting one child leaves the remaining frames.");
    assert.equal(final.duration, 8, "Child editing keeps the main Shot duration shared.");
    assert.equal(final.scheduleRows, 0, "The frame editor does not create schedule entries.");

    await page.locator('[data-view="output"]').first().click();
    const copyProjectId = await page.evaluate(async () => {
      const archive = await StoryModel.exportCompletePackage();
      const imported = await StoryModel.importCompletePackage(archive.archiveBytes, { mode: "copy" });
      return imported.projectId;
    });
    await page.evaluate((projectId) => StoryModel.selectProject(projectId), copyProjectId);
    await page.waitForFunction((projectId) => StoryModel.getProject().projectId === projectId, copyProjectId);
    await page.waitForTimeout(250);
    const projectSwitch = await page.evaluate(() => ({
      errors: Array.from(document.querySelectorAll(".toast.is-error")).map((toast) => toast.textContent.trim()),
      missingFrameToasts: Array.from(document.querySelectorAll(".toast.is-error")).filter((toast) => toast.textContent.includes("分鏡不存在")).length
    }));
    assert.deepEqual(projectSwitch.errors, [], "Switching to a ZIP copy does not query the old frame ID or show an error toast.");
    assert.equal(projectSwitch.missingFrameToasts, 0, "The old sequence state cannot show ‘frame not found’ after project switch.");
    assert.deepEqual(pageErrors, [], "The browser reports no uncaught page errors.");
    await context.close();
    console.log("PASS sequence editor UI: transient placeholder, multiline fields, canceled photo/drawing, atomic first stroke, crop confirmation and previews, frame reorder/delete");
    console.log("PASS ZIP-copy project switch: 0 application error toasts");
    console.log("SCREENSHOT tmp/sequence-ui-qa.png");
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
