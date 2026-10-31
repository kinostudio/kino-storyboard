"use strict";

// Isolated application-level Chromium smoke for the transient trailing Shot
// card. It uses a fresh context and disposable IndexedDB project.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("C:/Users/Aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const fixture = path.join(__dirname, "photo-crop-qa-primary.png");
const browserPath = "C:/Users/Aaron/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe";
const contentTypes = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };

async function main() {
  assert.ok(fs.existsSync(browserPath), "Pinned Chromium executable is missing.");
  assert.ok(fs.existsSync(fixture), "Photo fixture is missing.");
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(dist, pathname);
    if (file !== dist && !file.startsWith(dist + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => {
      if (error) { response.writeHead(404).end(); return; }
      response.setHeader("Content-Type", contentTypes[path.extname(file)] || "application/octet-stream");
      response.setHeader("Cache-Control", "no-store");
      response.end(bytes);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  let browser;
  let context;
  try {
    browser = await chromium.launch({ headless: true, executablePath: browserPath });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    assert.ok(response && response.ok(), "Local storyboard returned an unsuccessful response.");
    await page.locator("#lifecycle-project-title").waitFor({ state: "visible" });
    await page.locator("#lifecycle-project-title").fill("Trailing Placeholder QA");
    await page.locator('#lifecycle-create-form button[name="createKind"][value="blank"]').click();
    await page.locator("body.project-ready").waitFor({ state: "attached" });
    const sceneId = await page.evaluate(() => window.StoryModel.addScene("Placeholder QA"));
    await page.locator('#chapter-list [data-chapter="' + sceneId + '"]').click();
    const placeholder = page.locator("#shot-list [data-shot-placeholder]");
    await placeholder.waitFor({ state: "visible" });

    let baseline = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length };
    });
    await placeholder.locator('[data-shot-placeholder-field="title"]').fill("   \u200b ");
    await placeholder.locator('[data-shot-placeholder-field="duration"]').fill("0");
    await placeholder.locator('[data-shot-placeholder-field="duration"]').press("Tab");
    await page.waitForTimeout(150);
    let emptyState = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length };
    });
    assert.deepEqual(emptyState, baseline, "Whitespace and zero seconds leave the placeholder transient.");

    await placeholder.locator('[data-shot-placeholder-field="title"]').fill("Text promoted");
    await placeholder.locator('[data-placeholder-action="promote"]').click();
    await page.waitForFunction(() => window.StoryModel.getProject().shots.length === 1);
    let textState = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shots: project.shots.map((shot) => ({ title: shot.title, sceneId: shot.sceneId })) };
    });
    assert.equal(textState.revision, baseline.revision + 1, "Text promotion is one atomic Model command.");
    assert.equal(textState.shots[0].title, "Text promoted");
    assert.equal(textState.shots[0].sceneId, sceneId);
    await page.locator("#shot-list [data-shot-placeholder]").waitFor({ state: "visible" });
    assert.equal(await page.locator("#shot-list").evaluate((list) => list.lastElementChild.matches("[data-shot-placeholder]")), true, "Placeholder is the trailing card in list mode.");
    assert.equal(await page.locator('#shot-list [data-shot-placeholder][data-shot]').count(), 0, "Placeholder has no canonical Shot identifier.");
    assert.equal(await page.locator('#shot-list [data-shot-placeholder].is-selected').count(), 0, "Placeholder cannot become selected as a Shot.");
    await page.locator("#shot-list [data-shot-placeholder]").click();
    assert.equal(await page.locator('#shot-list [data-shot="' + (await page.evaluate(() => window.StoryModel.getProject().shots[0].id)) + '"].is-selected').count(), 1, "Clicking the placeholder leaves the real Shot selected.");

    await page.locator(".shot-view-switch [data-shot-view='gallery']").click();
    await page.waitForFunction(() => document.querySelector("#shot-list").dataset.shotView === "gallery");
    const galleryPlaceholder = page.locator("#shot-list [data-shot-placeholder]");
    await galleryPlaceholder.waitFor({ state: "visible" });
    assert.ok((await galleryPlaceholder.getAttribute("class")).includes("is-gallery"), "Placeholder is present in gallery mode.");
    assert.equal(await page.locator("#shot-list").evaluate((list) => list.lastElementChild.matches("[data-shot-placeholder]")), true, "Placeholder is the trailing card in gallery mode.");
    const beforeDuration = await page.evaluate(() => window.StoryModel.getProject().revision);
    await galleryPlaceholder.locator('[data-shot-placeholder-field="duration"]').fill("1.5");
    await galleryPlaceholder.locator('[data-placeholder-action="promote"]').click();
    await page.waitForFunction(() => window.StoryModel.getProject().shots.length === 2);
    const durationShot = await page.evaluate(() => window.StoryModel.getProject().shots[1]);
    assert.equal(durationShot.durationSeconds, 1.5, "Positive fractional seconds create a real Shot.");
    assert.equal(await page.evaluate(() => window.StoryModel.getProject().revision), beforeDuration + 1, "Duration promotion uses one revision.");

    const picker = page.locator("#shot-photo-picker");
    let beforePhoto = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length, assetCount: project.assets.length };
    });
    await page.locator('#shot-list [data-placeholder-action="photo"]').click();
    await picker.setInputFiles(fixture);
    await page.locator(".photo-crop-editor").waitFor({ state: "visible" });
    let afterFileSelection = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length, assetCount: project.assets.length };
    });
    assert.deepEqual(afterFileSelection, beforePhoto, "Selecting a photo and opening crop creates no Shot or Asset.");
    await page.locator(".photo-crop-editor").getByRole("button", { name: "取消" }).click();
    await page.locator(".photo-crop-editor").waitFor({ state: "hidden" });
    assert.deepEqual(await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length, assetCount: project.assets.length };
    }), beforePhoto, "Canceling crop creates no Shot, Asset, or revision.");

    await page.locator('#shot-list [data-placeholder-action="photo"]').click();
    await picker.setInputFiles(fixture);
    await page.locator(".photo-crop-editor").waitFor({ state: "visible" });
    await page.locator(".photo-crop-editor").getByRole("button", { name: "套用裁切" }).click();
    await page.waitForFunction(() => window.StoryModel.getProject().shots.length === 3);
    const photoShot = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      const shot = project.shots[2];
      return { revision: project.revision, assetCount: project.assets.length, shot: { sceneId: shot.sceneId, assetIds: shot.assetIds, crops: shot.photoCropsByAssetId || {} } };
    });
    assert.equal(photoShot.revision, beforePhoto.revision + 1, "Photo plus Shot commit uses one revision.");
    assert.equal(photoShot.shot.sceneId, sceneId);
    assert.equal(photoShot.shot.assetIds.length, 1, "New photo Shot respects the one-photo invariant.");
    assert.ok(photoShot.shot.crops[photoShot.shot.assetIds[0]], "Confirmed crop is attached to the new Shot.");
    await page.locator("#shot-list [data-shot-placeholder]").waitFor({ state: "visible" });

    const beforeDrawingDiscard = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length, drawingCount: project.drawings.length };
    });
    await page.locator('#shot-list [data-placeholder-action="drawing"]').click();
    await page.locator(".ds-de-canvas").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector(".ds-de-canvas").getContext("2d"));
    let canvasBox = await page.locator(".ds-de-canvas").boundingBox();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.28, canvasBox.y + canvasBox.height * 0.32);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.63, canvasBox.y + canvasBox.height * 0.57, { steps: 8 });
    await page.mouse.up();
    await page.locator(".ds-de-back").click();
    await page.locator("#shot-list [data-shot-placeholder]").waitFor({ state: "visible" });
    assert.deepEqual(await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length, drawingCount: project.drawings.length };
    }), beforeDrawingDiscard, "Drawing strokes followed by Return do not create Shot or Drawing.");

    await page.locator('#shot-list [data-placeholder-action="drawing"]').click();
    await page.locator(".ds-de-canvas").waitFor({ state: "visible" });
    canvasBox = await page.locator(".ds-de-canvas").boundingBox();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.30, canvasBox.y + canvasBox.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.66, canvasBox.y + canvasBox.height * 0.59, { steps: 8 });
    await page.mouse.up();
    await page.locator(".ds-de-save-close:visible").click();
    await page.waitForFunction(() => window.StoryModel.getProject().shots.length === 4 && window.StoryModel.getProject().drawings.length === 1);
    const drawingShot = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      const shot = project.shots[3];
      const drawing = project.drawings[0];
      return { revision: project.revision, shot: { id: shot.id, sceneId: shot.sceneId, drawingIds: shot.drawingIds }, drawing };
    });
    assert.equal(drawingShot.revision, beforeDrawingDiscard.revision + 1, "Explicit Save & Close creates Shot and Drawing in one revision.");
    assert.equal(drawingShot.shot.sceneId, sceneId);
    assert.deepEqual(drawingShot.shot.drawingIds, [drawingShot.drawing.id]);
    assert.ok(drawingShot.drawing.layers.some((layer) => layer.strokes.length > 0), "Saved Drawing includes its first stroke.");
    await page.locator("#shot-list [data-shot-placeholder]").waitFor({ state: "visible" });
    assert.deepEqual(pageErrors, [], "Isolated browser page has no uncaught errors.");

    console.log(JSON.stringify({
      result: "passed",
      script: "tests/shot-placeholder-trailing-browser-qa.cjs",
      scope: "fresh Chromium context and disposable IndexedDB project",
      checks: [
        "whitespace and zero seconds do not create a Shot",
        "valid text and positive duration create one Shot/revision and retain a trailing placeholder",
        "placeholder is unselectable and renders in list and gallery modes",
        "photo selection and crop cancellation write nothing; crop confirmation atomically creates one-photo Shot",
        "drawing then Return writes nothing; explicit Save & Close atomically creates Shot and Drawing",
        "no uncaught browser errors"
      ]
    }, null, 2));
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error && error.stack || error); process.exitCode = 1; });
