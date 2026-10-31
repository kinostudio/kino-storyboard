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

async function choosePhoto(page, button, filePath) {
  const chooserPromise = page.waitForEvent("filechooser");
  await button.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);
}

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
    await page.waitForTimeout(1000);
    let emptyState = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length };
    });
    assert.deepEqual(emptyState, baseline, "Whitespace and zero seconds leave the placeholder transient.");

    await placeholder.locator('[data-shot-placeholder-field="title"]').fill("Text promoted");
    await page.waitForFunction(() => window.StoryModel.getProject().shots.length === 1);
    let textState = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      const shot = project.shots[0];
      const active = document.activeElement;
      return {
        revision: project.revision,
        shots: project.shots.map((item) => ({ title: item.title, sceneId: item.sceneId })),
        hasManualPromoteButton: !!document.querySelector('#shot-list [data-placeholder-action="promote"]'),
        focusStayedOnPromotedTitle: !!(active && active.matches('[data-shot="' + shot.id + '"] [data-shot-field="title"]')),
        caret: active && typeof active.selectionStart === "number" ? active.selectionStart : null
      };
    });
    assert.equal(textState.revision, baseline.revision + 1, "Text promotion is one atomic Model command.");
    assert.equal(textState.shots[0].title, "Text promoted");
    assert.equal(textState.shots[0].sceneId, sceneId);
    assert.equal(textState.hasManualPromoteButton, false, "Text placeholders promote without an Add Shot button.");
    assert.equal(textState.focusStayedOnPromotedTitle, true, "Focus transfers to the saved Shot title without blurring the user.");
    assert.equal(textState.caret, "Text promoted".length, "Caret position survives automatic promotion.");
    await page.locator("#shot-list [data-shot-placeholder]").waitFor({ state: "visible" });
    assert.equal(await page.locator("#shot-list").evaluate((list) => list.lastElementChild.matches("[data-shot-placeholder]")), true, "Placeholder is the trailing card in list mode.");
    assert.equal(await page.locator('#shot-list [data-shot-placeholder][data-shot]').count(), 0, "Placeholder has no canonical Shot identifier.");
    assert.equal(await page.locator('#shot-list [data-shot-placeholder].is-selected').count(), 0, "Placeholder cannot become selected as a Shot.");
    await page.locator("#shot-list [data-shot-placeholder]").click();
    assert.equal(await page.locator('#shot-list [data-shot="' + (await page.evaluate(() => window.StoryModel.getProject().shots[0].id)) + '"].is-selected').count(), 1, "Clicking the placeholder leaves the real Shot selected.");

    const secondSceneId = await page.evaluate(() => window.StoryModel.addScene("Second Placeholder QA"));
    await page.locator('#shot-list [data-shot-placeholder] [data-shot-placeholder-field="title"]').fill("Flush to original scene");
    await page.locator('#chapter-list [data-chapter="' + secondSceneId + '"]').click();
    await page.waitForFunction(() => window.StoryModel.getProject().shots.some((shot) => shot.title === "Flush to original scene"));
    const sceneFlushShot = await page.evaluate(() => window.StoryModel.getProject().shots.find((shot) => shot.title === "Flush to original scene"));
    assert.equal(sceneFlushShot.sceneId, sceneId, "Switching scenes flushes the pending draft into its original scene.");
    await page.locator('#chapter-list [data-chapter="' + sceneId + '"]').click();

    await page.locator('#shot-list [data-shot-placeholder-field="title"]').fill("Flush before output");
    await page.locator('[data-view="output"]').first().click();
    await page.waitForFunction(() => window.StoryModel.getProject().shots.some((shot) => shot.title === "Flush before output"));
    const outputFlushShot = await page.evaluate(() => window.StoryModel.getProject().shots.find((shot) => shot.title === "Flush before output"));
    assert.equal(outputFlushShot.sceneId, sceneId, "Switching to output flushes the pending draft into its original scene.");
    await page.locator('[data-view="storyboard"]').first().click();

    const beforeSlowSave = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length };
    });
    await page.evaluate(() => {
      const prototype = IDBTransaction.prototype;
      const original = Object.getOwnPropertyDescriptor(prototype, "oncomplete");
      if (!original || !original.set || !original.get) throw new Error("IDBTransaction.oncomplete cannot be delayed in this Chromium build.");
      let release;
      let reportGateHit;
      const gate = new Promise((resolve) => { release = resolve; });
      const gateHit = new Promise((resolve) => { reportGateHit = resolve; });
      let armed = true;
      Object.defineProperty(prototype, "oncomplete", {
        configurable: true,
        enumerable: original.enumerable,
        get() { return original.get.call(this); },
        set(handler) {
          if (armed && this.mode === "readwrite" && this.objectStoreNames.contains("projects")) {
            armed = false;
            reportGateHit();
            original.set.call(this, function (event) { void gate.then(() => handler.call(this, event)); });
          } else original.set.call(this, handler);
        }
      });
      window.__waitForPlaceholderWriteGate = () => gateHit;
      window.__releasePlaceholderWriteGate = release;
      window.__restorePlaceholderWriteGate = () => Object.defineProperty(prototype, "oncomplete", original);
    });
    const slowTitle = page.locator('#shot-list [data-shot-placeholder-field="title"]');
    await slowTitle.fill("Save in progress");
    await page.evaluate(() => window.__waitForPlaceholderWriteGate());
    assert.equal(await slowTitle.isDisabled(), false, "Placeholder fields remain editable during a slow save.");
    await page.keyboard.type(" continued");
    await page.evaluate(() => { window.__restorePlaceholderWriteGate(); window.__releasePlaceholderWriteGate(); });
    await page.waitForFunction(() => window.StoryModel.getProject().shots.some((shot) => shot.title === "Save in progress continued"));
    const afterSlowSave = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length, lastTitle: project.shots[project.shots.length - 1].title };
    });
    assert.equal(afterSlowSave.shotCount, beforeSlowSave.shotCount + 1, "Typing during persistence updates the same Shot instead of creating another.");
    assert.equal(afterSlowSave.revision, beforeSlowSave.revision + 2, "An in-flight edit is merged into the newly created Shot.");
    assert.equal(afterSlowSave.lastTitle, "Save in progress continued", "Keystrokes entered while saving are retained.");

    await page.evaluate(() => {
      const prototype = IDBTransaction.prototype;
      const original = Object.getOwnPropertyDescriptor(prototype, "oncomplete");
      let release;
      let reportGateHit;
      const gate = new Promise((resolve) => { release = resolve; });
      const gateHit = new Promise((resolve) => { reportGateHit = resolve; });
      let armed = true;
      Object.defineProperty(prototype, "oncomplete", {
        configurable: true,
        enumerable: original.enumerable,
        get() { return original.get.call(this); },
        set(handler) {
          if (armed && this.mode === "readwrite" && this.objectStoreNames.contains("projects")) {
            armed = false;
            reportGateHit();
            original.set.call(this, function (event) { void gate.then(() => handler.call(this, event)); });
          } else original.set.call(this, handler);
        }
      });
      window.__waitForAnchorWriteGate = () => gateHit;
      window.__releaseAnchorWriteGate = release;
      window.__restoreAnchorWriteGate = () => Object.defineProperty(prototype, "oncomplete", original);
    });
    const anchorTitle = page.locator('#shot-list [data-shot-placeholder-field="title"]');
    await anchorTitle.fill("Anchor field rebasing");
    await page.evaluate(() => window.__waitForAnchorWriteGate());
    await page.locator('#shot-list [data-shot-placeholder-field="duration"]').fill("1.23");
    await page.evaluate(() => { window.__restoreAnchorWriteGate(); window.__releaseAnchorWriteGate(); });
    await page.waitForFunction(() => window.StoryModel.getProject().shots.some((shot) => shot.title === "Anchor field rebasing"));
    const retainedInvalidDraft = page.locator('#shot-list [data-shot-placeholder-field="duration"]');
    assert.equal(await retainedInvalidDraft.inputValue(), "1.23", "An invalid in-flight edit remains visible beside its newly created anchor Shot.");
    const anchorShotId = await page.evaluate(() => window.StoryModel.getProject().shots.find((shot) => shot.title === "Anchor field rebasing").id);
    await page.evaluate(async (shotId) => window.StoryModel.updateShot(shotId, { visual: "Edited elsewhere" }), anchorShotId);
    await retainedInvalidDraft.fill("1.2");
    await page.waitForFunction((shotId) => {
      const shot = window.StoryModel.getProject().shots.find((item) => item.id === shotId);
      return shot && shot.durationSeconds === 1.2;
    }, anchorShotId);
    const rebasedAnchor = await page.evaluate((shotId) => {
      const project = window.StoryModel.getProject();
      return { shotCount: project.shots.length, shot: project.shots.find((item) => item.id === shotId) };
    }, anchorShotId);
    assert.equal(rebasedAnchor.shotCount, afterSlowSave.shotCount + 1, "Correcting an invalid retained draft updates its anchor without creating another Shot.");
    assert.equal(rebasedAnchor.shot.title, "Anchor field rebasing");
    assert.equal(rebasedAnchor.shot.visual, "Edited elsewhere", "Anchor reconciliation does not overwrite fields edited elsewhere.");
    assert.equal(rebasedAnchor.shot.durationSeconds, 1.2);

    const beforeClearWhileSaving = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length };
    });
    await page.evaluate(() => {
      const prototype = IDBTransaction.prototype;
      const original = Object.getOwnPropertyDescriptor(prototype, "oncomplete");
      let release;
      let reportGateHit;
      const gate = new Promise((resolve) => { release = resolve; });
      const gateHit = new Promise((resolve) => { reportGateHit = resolve; });
      let armed = true;
      Object.defineProperty(prototype, "oncomplete", {
        configurable: true,
        enumerable: original.enumerable,
        get() { return original.get.call(this); },
        set(handler) {
          if (armed && this.mode === "readwrite" && this.objectStoreNames.contains("projects")) {
            armed = false;
            reportGateHit();
            original.set.call(this, function (event) { void gate.then(() => handler.call(this, event)); });
          } else original.set.call(this, handler);
        }
      });
      window.__waitForClearWriteGate = () => gateHit;
      window.__releaseClearWriteGate = release;
      window.__restoreClearWriteGate = () => Object.defineProperty(prototype, "oncomplete", original);
    });
    const clearWhileSavingTitle = page.locator('#shot-list [data-shot-placeholder-field="title"]');
    await clearWhileSavingTitle.fill("Keep the original Shot after clear");
    await page.evaluate(() => window.__waitForClearWriteGate());
    await clearWhileSavingTitle.fill("");
    await page.evaluate(() => { window.__restoreClearWriteGate(); window.__releaseClearWriteGate(); });
    await page.waitForFunction(() => window.StoryModel.getProject().shots.some((shot) => shot.title === "Keep the original Shot after clear"));
    const afterClearWhileSaving = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      const shot = project.shots.find((item) => item.title === "Keep the original Shot after clear");
      return { revision: project.revision, shotCount: project.shots.length, shot };
    });
    assert.equal(afterClearWhileSaving.shotCount, beforeClearWhileSaving.shotCount + 1, "Clearing fields during create preserves one previously committed Shot.");
    assert.equal(afterClearWhileSaving.revision, beforeClearWhileSaving.revision + 1, "Clearing fields does not dispatch an empty-field update.");
    assert.equal(afterClearWhileSaving.shot.title, "Keep the original Shot after clear");
    assert.equal(afterClearWhileSaving.shot.durationSeconds, 0);
    assert.equal(await page.locator('#shot-list [data-shot-placeholder-field="title"]').inputValue(), "", "The cleared draft remains blank in the trailing placeholder.");
    const retainedShotToast = page.locator("#toast-region .toast").filter({ hasText: "先前已輸入的鏡頭已保存；空白與 0 秒草稿不會清除該鏡頭。" });
    await retainedShotToast.waitFor({ state: "visible" });
    await page.waitForTimeout(1000);
    assert.equal(await retainedShotToast.last().textContent(), "先前已輸入的鏡頭已保存；空白與 0 秒草稿不會清除該鏡頭。", "The retained-Shot explanation remains the final success notice.");
    const afterClearSettled = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length };
    });
    assert.deepEqual(afterClearSettled, { revision: afterClearWhileSaving.revision, shotCount: afterClearWhileSaving.shotCount }, "No delayed empty Shot update or duplicate appears after the debounce window.");
    await page.locator('#shot-list [data-shot-placeholder-field="title"]').fill("Next Shot after clear");
    await page.waitForFunction((count) => window.StoryModel.getProject().shots.length === count + 1 && window.StoryModel.getProject().shots.some((shot) => shot.title === "Next Shot after clear"), afterClearWhileSaving.shotCount);
    assert.equal(await page.evaluate((shotId) => window.StoryModel.getProject().shots.find((shot) => shot.id === shotId).title, afterClearWhileSaving.shot.id), "Keep the original Shot after clear", "A new post-clear draft creates a new Shot instead of reusing the committed anchor.");

    const beforeRetry = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length };
    });
    await page.evaluate(() => {
      const originalPut = IDBObjectStore.prototype.put;
      let failNextProjectWrite = true;
      IDBObjectStore.prototype.put = function (...args) {
        if (failNextProjectWrite && this.name === "projects") {
          failNextProjectWrite = false;
          throw new DOMException("QA IndexedDB write failure", "QuotaExceededError");
        }
        return originalPut.apply(this, args);
      };
      window.__restoreProjectPut = () => { IDBObjectStore.prototype.put = originalPut; };
    });
    const retryTitle = page.locator('#shot-list [data-shot-placeholder-field="title"]');
    await retryTitle.fill("Retry the original Shot");
    await page.locator('#durable-status-actions [data-status-action="retry"]').waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => window.StoryModel.getProject().shots.length), beforeRetry.shotCount, "A failed IndexedDB transaction does not expose a partially created Shot.");
    assert.equal(await retryTitle.inputValue(), "Retry the original Shot", "Failed saves retain the complete draft for retry.");
    await page.evaluate(() => window.__restoreProjectPut());
    await page.locator('#durable-status-actions [data-status-action="retry"]').click();
    await page.waitForFunction(() => window.StoryModel.getProject().shots.some((shot) => shot.title === "Retry the original Shot"));
    const afterRetry = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length };
    });
    assert.equal(afterRetry.shotCount, beforeRetry.shotCount + 1, "Retry commits exactly one Shot.");
    assert.equal(afterRetry.revision, beforeRetry.revision + 1, "Retry commits the original queued command once.");

    await page.locator(".shot-view-switch [data-shot-view='gallery']").click();
    await page.waitForFunction(() => document.querySelector("#shot-list").dataset.shotView === "gallery");
    const galleryPlaceholder = page.locator("#shot-list [data-shot-placeholder]");
    await galleryPlaceholder.waitFor({ state: "visible" });
    assert.ok((await galleryPlaceholder.getAttribute("class")).includes("is-gallery"), "Placeholder is present in gallery mode.");
    assert.equal(await page.locator("#shot-list").evaluate((list) => list.lastElementChild.matches("[data-shot-placeholder]")), true, "Placeholder is the trailing card in gallery mode.");
    const beforeDuration = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length };
    });
    await galleryPlaceholder.locator('[data-shot-placeholder-field="duration"]').fill("1.5");
    await page.waitForFunction((count) => window.StoryModel.getProject().shots.length === count + 1, beforeDuration.shotCount);
    const durationShot = await page.evaluate(() => window.StoryModel.getProject().shots.at(-1));
    assert.equal(durationShot.durationSeconds, 1.5, "Positive fractional seconds create a real Shot.");
    assert.equal(await page.evaluate(() => window.StoryModel.getProject().revision), beforeDuration.revision + 1, "Duration promotion uses one revision.");

    const beforeComposition = await page.evaluate(() => window.StoryModel.getProject().shots.length);
    const compositionField = page.locator('#shot-list [data-shot-placeholder-field="title"]');
    await compositionField.focus();
    await compositionField.evaluate((field) => {
      field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
      field.value = "輸入中";
      field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "輸入中", isComposing: true }));
    });
    await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(() => window.StoryModel.getProject().shots.length), beforeComposition, "An active IME composition never promotes partial text.");
    await compositionField.evaluate((field) => {
      field.value = "繁體輸入完成";
      field.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "繁體輸入完成" }));
      field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "成", isComposing: false }));
    });
    await page.waitForFunction((count) => window.StoryModel.getProject().shots.length === count + 1, beforeComposition);
    assert.equal((await page.evaluate(() => window.StoryModel.getProject().shots.at(-1).title)), "繁體輸入完成", "The final IME value promotes after composition ends.");

    const picker = page.locator("#shot-photo-picker");
    let beforePhoto = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length, assetCount: project.assets.length };
    });
    await choosePhoto(page, page.locator('#shot-list [data-placeholder-action="photo"]'), fixture);
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

    const beforePhotoDraftCancel = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length, assetCount: project.assets.length };
    });
    await page.locator('#shot-list [data-shot-placeholder-field="title"]').fill("Photo cancel resumes auto-save");
    await choosePhoto(page, page.locator('#shot-list [data-placeholder-action="photo"]'), fixture);
    await page.locator(".photo-crop-editor").waitFor({ state: "visible" });
    await page.locator(".photo-crop-editor").getByRole("button", { name: "取消" }).click();
    await page.locator(".photo-crop-editor").waitFor({ state: "hidden" });
    await page.waitForFunction(() => window.StoryModel.getProject().shots.some((shot) => shot.title === "Photo cancel resumes auto-save"));
    const afterPhotoDraftCancel = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      const shot = project.shots.find((item) => item.title === "Photo cancel resumes auto-save");
      return { revision: project.revision, shotCount: project.shots.length, assetCount: project.assets.length, shot };
    });
    assert.equal(afterPhotoDraftCancel.shotCount, beforePhotoDraftCancel.shotCount + 1, "Canceling photo crop eventually auto-saves the text draft once.");
    assert.equal(afterPhotoDraftCancel.shot.title, "Photo cancel resumes auto-save");
    assert.deepEqual(afterPhotoDraftCancel.shot.assetIds, [], "A canceled crop saves the text draft without an Asset.");
    assert.equal(afterPhotoDraftCancel.assetCount, beforePhotoDraftCancel.assetCount);
    assert.equal(afterPhotoDraftCancel.revision, beforePhotoDraftCancel.revision + 1);
    beforePhoto = { revision: afterPhotoDraftCancel.revision, shotCount: afterPhotoDraftCancel.shotCount, assetCount: afterPhotoDraftCancel.assetCount };

    await page.locator('#shot-list [data-shot-placeholder-field="title"]').fill("Oversize photo resumes auto-save");
    const oversizedPhoto = { name: "oversized.png", mimeType: "image/png", buffer: Buffer.alloc(20 * 1024 * 1024 + 1) };
    await choosePhoto(page, page.locator('#shot-list [data-placeholder-action="photo"]'), oversizedPhoto);
    await page.waitForFunction(() => window.StoryModel.getProject().shots.some((shot) => shot.title === "Oversize photo resumes auto-save"));
    const afterOversizePhoto = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      const shot = project.shots.find((item) => item.title === "Oversize photo resumes auto-save");
      return { revision: project.revision, shotCount: project.shots.length, assetCount: project.assets.length, shot };
    });
    assert.equal(afterOversizePhoto.shotCount, beforePhoto.shotCount + 1, "Rejecting an oversized photo resumes auto-saving the text draft once.");
    assert.equal(afterOversizePhoto.revision, beforePhoto.revision + 1);
    assert.equal(afterOversizePhoto.assetCount, beforePhoto.assetCount);
    assert.equal(afterOversizePhoto.shot.title, "Oversize photo resumes auto-save");
    assert.deepEqual(afterOversizePhoto.shot.assetIds, []);
    beforePhoto = { revision: afterOversizePhoto.revision, shotCount: afterOversizePhoto.shotCount, assetCount: afterOversizePhoto.assetCount };

    await page.locator('#shot-list [data-shot-placeholder-field="title"]').fill("Crop failure clear resumes auto-save");
    const cropFailureChooserPromise = page.waitForEvent("filechooser");
    await page.locator('#shot-list [data-placeholder-action="photo"]').click();
    const cropFailureChooser = await cropFailureChooserPromise;
    await page.evaluate(() => {
      window.__originalPhotoCropEditor = window.DirectorStoryboardPhotoCropEditor;
      window.DirectorStoryboardPhotoCropEditor = null;
    });
    await cropFailureChooser.setFiles(fixture);
    await page.locator('#shot-photo-import-banner [data-shot-photo-action="cancel"]').waitFor({ state: "visible" });
    await page.evaluate(() => { window.DirectorStoryboardPhotoCropEditor = window.__originalPhotoCropEditor; });
    await page.locator('#shot-photo-import-banner [data-shot-photo-action="cancel"]').click();
    await page.waitForFunction(() => window.StoryModel.getProject().shots.some((shot) => shot.title === "Crop failure clear resumes auto-save"));
    const afterCropFailureClear = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      const shot = project.shots.find((item) => item.title === "Crop failure clear resumes auto-save");
      return { revision: project.revision, shotCount: project.shots.length, assetCount: project.assets.length, shot };
    });
    assert.equal(afterCropFailureClear.shotCount, beforePhoto.shotCount + 1, "Clearing a crop-open failure resumes the retained text draft once.");
    assert.equal(afterCropFailureClear.revision, beforePhoto.revision + 1);
    assert.equal(afterCropFailureClear.assetCount, beforePhoto.assetCount);
    assert.deepEqual(afterCropFailureClear.shot.assetIds, []);
    beforePhoto = { revision: afterCropFailureClear.revision, shotCount: afterCropFailureClear.shotCount, assetCount: afterCropFailureClear.assetCount };

    await choosePhoto(page, page.locator('#shot-list [data-placeholder-action="photo"]'), fixture);
    await page.locator(".photo-crop-editor").waitFor({ state: "visible" });
    await page.locator(".photo-crop-editor").getByRole("button", { name: "套用裁切" }).click();
    await page.waitForFunction((count) => window.StoryModel.getProject().shots.length === count + 1, beforePhoto.shotCount);
    const photoShot = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      const shot = project.shots.at(-1);
      return { revision: project.revision, assetCount: project.assets.length, shot: { sceneId: shot.sceneId, assetIds: shot.assetIds, crops: shot.photoCropsByAssetId || {} } };
    });
    assert.equal(photoShot.revision, beforePhoto.revision + 1, "Photo plus Shot commit uses one revision.");
    assert.equal(photoShot.shot.sceneId, sceneId);
    assert.equal(photoShot.shot.assetIds.length, 1, "New photo Shot respects the one-photo invariant.");
    assert.ok(photoShot.shot.crops[photoShot.shot.assetIds[0]], "Confirmed crop is attached to the new Shot.");
    await page.locator("#shot-list [data-shot-placeholder]").waitFor({ state: "visible" });

    const beforeDrawingAutoSave = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      return { revision: project.revision, shotCount: project.shots.length, drawingCount: project.drawings.length };
    });
    await page.locator('#shot-list [data-shot-placeholder-field="title"]').fill("Drawing return resumes auto-save");
    await page.locator('#shot-list [data-placeholder-action="drawing"]').click();
    await page.locator(".ds-de-canvas").waitFor({ state: "visible" });
    await page.locator(".ds-de-back").click();
    await page.locator("#shot-list [data-shot-placeholder]").waitFor({ state: "visible" });
    await page.waitForFunction(() => window.StoryModel.getProject().shots.some((shot) => shot.title === "Drawing return resumes auto-save"));
    const afterDrawingReturnAutoSave = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      const shot = project.shots.find((item) => item.title === "Drawing return resumes auto-save");
      return { revision: project.revision, shotCount: project.shots.length, drawingCount: project.drawings.length, shot };
    });
    assert.equal(afterDrawingReturnAutoSave.shotCount, beforeDrawingAutoSave.shotCount + 1, "Returning from unsaved drawing resumes the text draft timer once.");
    assert.equal(afterDrawingReturnAutoSave.revision, beforeDrawingAutoSave.revision + 1);
    assert.equal(afterDrawingReturnAutoSave.drawingCount, beforeDrawingAutoSave.drawingCount);
    assert.equal(afterDrawingReturnAutoSave.shot.title, "Drawing return resumes auto-save");
    assert.deepEqual(afterDrawingReturnAutoSave.shot.drawingIds, []);

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
    await page.waitForFunction((counts) => window.StoryModel.getProject().shots.length === counts.shotCount + 1 && window.StoryModel.getProject().drawings.length === counts.drawingCount + 1, beforeDrawingDiscard);
    const drawingShot = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      const shot = project.shots.at(-1);
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
      "valid text and positive duration auto-create one Shot/revision and retain a trailing placeholder without an Add Shot button",
      "automatic promotion preserves keyboard focus and caret position",
        "pending drafts flush to their original scene before switching scenes or opening output",
        "typing during a delayed IndexedDB completion is merged into the same Shot",
        "invalid drafts rebase only changed fields and preserve edits made elsewhere on the anchor Shot",
        "clearing every field during creation keeps the committed Shot, explains the outcome, and detaches the old anchor",
        "an IndexedDB write failure retains the draft and retries the original queued Shot once",
      "IME composition defers promotion until the final composed value",
        "placeholder is unselectable and renders in list and gallery modes",
        "photo crop cancellation, oversize rejection, and crop-open failure cleanup resume text auto-save",
        "photo crop confirmation atomically creates a one-photo Shot",
        "returning from unsaved drawing resumes text auto-save",
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
