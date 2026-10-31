"use strict";

// Isolated local-browser regression for atomic Shot creation with initial text.
// The disposable IndexedDB context keeps user projects untouched.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("C:/Users/Aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const photoFixture = fs.readFileSync(path.join(__dirname, "photo-crop-qa-primary.png"));
const executablePath = "C:/Users/Aaron/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe";
const contentTypes = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml" };

async function main() {
  assert.ok(fs.existsSync(executablePath), "pinned Chromium executable is missing");
  assert.ok(fs.existsSync(dist), "release-candidate dist directory is missing");

  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(dist, pathname);
    if (file !== dist && !file.startsWith(dist + path.sep)) {
      response.writeHead(403).end();
      return;
    }
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
    browser = await chromium.launch({ headless: true, executablePath });
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    assert.ok(response && response.ok(), "local storyboard returned an unsuccessful response");
    await page.locator("#lifecycle-project-title").waitFor({ state: "visible" });
    await page.locator("#lifecycle-project-title").fill("Atomic Shot Creation QA");
    await page.locator('#lifecycle-create-form button[name="createKind"][value="blank"]').click();
    await page.locator("body.project-ready").waitFor({ state: "attached" });

    const result = await page.evaluate(async (photoBytes) => {
      const model = window.StoryModel;
      const sceneId = await model.addScene("Atomic Shot Creation QA");
      const before = model.getProject();
      const beforeHistory = model.getHistoryStatus();
      const shotId = await model.addShot(sceneId, {
        title: "第一鏡",
        visual: "晨光穿過窗戶",
        script: "今天開始拍攝。",
        duration: 2.5
      });
      const after = model.getProject();
      const afterHistory = model.getHistoryStatus();
      const savedShot = after.shots.find((shot) => shot.id === shotId);
      const beforeInvalid = { revision: after.revision, shotCount: after.shots.length };
      let invalidCode = null;
      try { await model.addShot(sceneId, { duration: 1.25 }); }
      catch (error) { invalidCode = error.code; }
      const afterInvalid = model.getProject();
      const invalidState = { revision: afterInvalid.revision, shotCount: afterInvalid.shots.length };
      const beforeUndo = afterInvalid.revision;
      await model.undo();
      const undone = model.getProject();

      const photoFile = new File([new Uint8Array(photoBytes)], "atomic-shot.png", { type: "image/png" });
      function capturePhotoState() {
        const project = model.getProject();
        const history = model.getHistoryStatus();
        return {
          revision: project.revision,
          shotIds: project.shots.map((shot) => shot.id),
          assetIds: project.assets.map((asset) => asset.id),
          undoDepth: history.undoDepth
        };
      }
      const beforePhotoRevisionChecks = capturePhotoState();
      let missingPhotoRevisionCode = null;
      try {
        await model.addShotWithPhoto(sceneId, photoFile, { title: "缺少 revision" }, {
          crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
        });
      } catch (error) { missingPhotoRevisionCode = error.code; }
      const afterMissingPhotoRevision = capturePhotoState();
      let malformedPhotoRevisionCode = null;
      try {
        await model.addShotWithPhoto(sceneId, photoFile, { title: "無效 revision" }, {
          expectedRevision: "" + beforePhotoRevisionChecks.revision,
          crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
        });
      } catch (error) { malformedPhotoRevisionCode = error.code; }
      const afterMalformedPhotoRevision = capturePhotoState();
      let stalePhotoRevisionCode = null;
      try {
        await model.addShotWithPhoto(sceneId, photoFile, { title: "過期 revision" }, {
          expectedRevision: beforePhotoRevisionChecks.revision - 1,
          crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
        });
      } catch (error) { stalePhotoRevisionCode = error.code; }
      const afterStalePhotoRevision = capturePhotoState();
      const beforeQueuedPhotoRace = capturePhotoState();
      const revisionBumpScenePromise = model.addScene("照片 revision race");
      const queuedStalePhotoPromise = model.addShotWithPhoto(sceneId, photoFile, { title: "佇列等待中的過期草稿" }, {
        expectedRevision: beforeQueuedPhotoRace.revision,
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
      });
      const revisionBumpSceneId = await revisionBumpScenePromise;
      let queuedStalePhotoCode = null;
      try { await queuedStalePhotoPromise; }
      catch (error) { queuedStalePhotoCode = error.code; }
      const afterQueuedPhotoRace = capturePhotoState();
      const beforePhoto = model.getProject();
      const beforePhotoHistory = model.getHistoryStatus();
      const photoResult = await model.addShotWithPhoto(sceneId, photoFile, { title: "照片鏡頭", visual: "晨光與人物" }, {
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        expectedRevision: beforePhoto.revision
      });
      const afterPhoto = model.getProject();
      const photoShot = afterPhoto.shots.find((shot) => shot.id === photoResult.shotId);
      const photoAsset = photoShot && photoShot.assetIds[0];
      const photoCrop = photoShot && photoShot.photoCropsByAssetId && photoShot.photoCropsByAssetId[photoAsset];
      const afterPhotoHistory = model.getHistoryStatus();
      const photoLoaded = photoAsset ? await model.getShotPhoto(photoResult.shotId, photoAsset) : null;
      const beforePhotoUndo = afterPhoto.revision;
      await model.undo();
      const afterPhotoUndo = model.getProject();

      const beforeDrawing = model.getProject();
      const beforeDrawingHistory = model.getHistoryStatus();
      const drawingResult = await model.addShotWithDrawing(sceneId, { title: "手繪鏡頭", visual: "分鏡筆跡" }, {
        kind: "snapshot",
        backgroundAssetId: null,
        backgroundCrop: null,
        layers: [
          { kind: "scene", visible: true, locked: false, strokes: [
            { kind: "pen", color: "#e94f3d", baseWidth: 8, points: [{ x: 0.1, y: 0.2, t: 0, pressure: 0.5 }, { x: 0.6, y: 0.7, t: 12, pressure: 0.7 }] },
            { kind: "pen", color: "#2767c5", baseWidth: 5, points: [{ x: 0.2, y: 0.3, t: 0 }, { x: 0.4, y: 0.5, t: 8 }] }
          ] },
          { kind: "subject", visible: false, locked: true, strokes: [
            { kind: "cameraArrow", color: "#24292d", baseWidth: 10, points: [{ x: 0.2, y: 0.8, t: 0 }, { x: 0.8, y: 0.2, t: 20 }] }
          ] }
        ]
      }, beforeDrawing.revision);
      const afterDrawing = model.getProject();
      const drawing = afterDrawing.drawings.find((item) => item.id === drawingResult.drawingId);
      const afterDrawingHistory = model.getHistoryStatus();
      const beforeDrawingUndo = afterDrawing.revision;
      await model.undo();
      const afterDrawingUndo = model.getProject();

      const beforeEmptyDrawing = model.getProject();
      let emptyDrawingCode = null;
      try {
        await model.addShotWithDrawing(sceneId, {}, {
          kind: "snapshot",
          layers: [
            { kind: "scene", visible: true, locked: false, strokes: [] },
            { kind: "subject", visible: true, locked: false, strokes: [] }
          ]
        }, beforeEmptyDrawing.revision);
      } catch (error) { emptyDrawingCode = error.code; }
      const afterEmptyDrawing = model.getProject();

      const legacyShotId = await model.addShot(sceneId);
      const beforeLegacyDrawing = model.getProject();
      const legacyDrawingId = await model.createDrawingForShotWithInitialEdit(legacyShotId, {
        kind: "stroke",
        layerKind: "scene",
        strokeDraft: { kind: "pen", color: "#e94f3d", baseWidth: 8, points: [{ x: 0.15, y: 0.25, t: 0 }, { x: 0.55, y: 0.65, t: 10 }] }
      }, beforeLegacyDrawing.revision);
      const afterLegacyDrawing = model.getProject();
      const legacyDrawing = afterLegacyDrawing.drawings.find((item) => item.id === legacyDrawingId);

      return {
        sceneId,
        shotId,
        beforeRevision: before.revision,
        afterRevision: after.revision,
        beforeUndoDepth: beforeHistory.undoDepth,
        afterUndoDepth: afterHistory.undoDepth,
        shot: savedShot && {
          sceneId: savedShot.sceneId,
          title: savedShot.title,
          visual: savedShot.visual,
          script: savedShot.script,
          durationSeconds: savedShot.durationSeconds
        },
        invalidCode,
        beforeInvalid,
        invalidState,
        beforeUndo,
        undoneRevision: undone.revision,
        undoneShotIds: undone.shots.map((shot) => shot.id),
        photoRevisionChecks: {
          missingPhotoRevisionCode,
          malformedPhotoRevisionCode,
          stalePhotoRevisionCode,
          queuedStalePhotoCode,
          revisionBumpSceneId,
          before: beforePhotoRevisionChecks,
          afterMissing: afterMissingPhotoRevision,
          afterMalformed: afterMalformedPhotoRevision,
          afterStale: afterStalePhotoRevision,
          beforeQueuedRace: beforeQueuedPhotoRace,
          afterQueuedRace: afterQueuedPhotoRace
        },
        photo: {
          result: photoResult,
          beforeRevision: beforePhoto.revision,
          afterRevision: afterPhoto.revision,
          beforeUndoDepth: beforePhotoHistory.undoDepth,
          afterUndoDepth: afterPhotoHistory.undoDepth,
          shot: photoShot && { title: photoShot.title, visual: photoShot.visual, assetIds: photoShot.assetIds.slice() },
          photoCrop,
          loadedBytes: photoLoaded && photoLoaded.originalBlob && photoLoaded.originalBlob.size,
          beforeUndo: beforePhotoUndo,
          undoneRevision: afterPhotoUndo.revision,
          undoneShotIds: afterPhotoUndo.shots.map((shot) => shot.id),
          undoneAssetIds: afterPhotoUndo.assets.map((asset) => asset.id)
        },
        drawing: {
          result: drawingResult,
          beforeRevision: beforeDrawing.revision,
          afterRevision: afterDrawing.revision,
          beforeUndoDepth: beforeDrawingHistory.undoDepth,
          afterUndoDepth: afterDrawingHistory.undoDepth,
          shot: afterDrawing.shots.find((shot) => shot.id === drawingResult.shotId) && {
            title: afterDrawing.shots.find((shot) => shot.id === drawingResult.shotId).title,
            drawingIds: afterDrawing.shots.find((shot) => shot.id === drawingResult.shotId).drawingIds.slice()
          },
          drawing: drawing && {
            shotId: drawing.shotId,
            layers: drawing.layers.map((layer) => ({ kind: layer.kind, visible: layer.visible, locked: layer.locked, strokes: layer.strokes.length }))
          },
          beforeUndo: beforeDrawingUndo,
          undoneRevision: afterDrawingUndo.revision,
          undoneShotIds: afterDrawingUndo.shots.map((shot) => shot.id),
          undoneDrawingIds: afterDrawingUndo.drawings.map((item) => item.id)
        },
        emptyDrawingCode,
        beforeEmptyDrawing: { revision: beforeEmptyDrawing.revision, shotCount: beforeEmptyDrawing.shots.length },
        afterEmptyDrawing: { revision: afterEmptyDrawing.revision, shotCount: afterEmptyDrawing.shots.length },
        legacyDrawing: {
          shotId: legacyShotId,
          drawingId: legacyDrawingId,
          beforeRevision: beforeLegacyDrawing.revision,
          afterRevision: afterLegacyDrawing.revision,
          strokeCount: legacyDrawing && legacyDrawing.layers.reduce((sum, layer) => sum + layer.strokes.length, 0)
        }
      };
    }, Array.from(photoFixture));

    assert.equal(result.afterRevision, result.beforeRevision + 1, "Shot and initial fields should use one Project revision");
    assert.equal(result.afterUndoDepth, result.beforeUndoDepth + 1, "Shot and initial fields should create one history entry");
    assert.deepEqual(result.shot, {
      sceneId: result.sceneId,
      title: "第一鏡",
      visual: "晨光穿過窗戶",
      script: "今天開始拍攝。",
      durationSeconds: 2.5
    });
    assert.equal(result.invalidCode, "INVALID_DURATION", "invalid initial data should reject the whole command");
    assert.deepEqual(result.invalidState, result.beforeInvalid, "invalid initial data should not partially create a Shot");
    assert.equal(result.undoneRevision, result.beforeUndo + 1, "undo should be a single next revision");
    assert.ok(!result.undoneShotIds.includes(result.shotId), "one undo should remove the Shot and its initial fields together");
    assert.equal(result.photoRevisionChecks.missingPhotoRevisionCode, "INVALID_ARGUMENT", "photo Shot creation must require expectedRevision");
    assert.equal(result.photoRevisionChecks.malformedPhotoRevisionCode, "INVALID_ARGUMENT", "photo Shot creation must reject a non-integer expectedRevision");
    assert.equal(result.photoRevisionChecks.stalePhotoRevisionCode, "PHOTO_TARGET_REVISION_CHANGED", "photo Shot creation must reject an already stale expectedRevision");
    assert.deepEqual(result.photoRevisionChecks.afterMissing, result.photoRevisionChecks.before, "missing expectedRevision must not create a Shot, Asset, history entry, or revision");
    assert.deepEqual(result.photoRevisionChecks.afterMalformed, result.photoRevisionChecks.before, "invalid expectedRevision must not mutate Project state");
    assert.deepEqual(result.photoRevisionChecks.afterStale, result.photoRevisionChecks.before, "an already stale expectedRevision must not mutate Project state");
    assert.equal(result.photoRevisionChecks.queuedStalePhotoCode, "PHOTO_TARGET_REVISION_CHANGED", "photo Shot creation must recheck expectedRevision after earlier queued writes");
    assert.equal(typeof result.photoRevisionChecks.revisionBumpSceneId, "string", "the queued revision-changing command should commit");
    assert.equal(result.photoRevisionChecks.afterQueuedRace.revision, result.photoRevisionChecks.beforeQueuedRace.revision + 1, "only the earlier queued command should increment revision");
    assert.deepEqual(result.photoRevisionChecks.afterQueuedRace.shotIds, result.photoRevisionChecks.beforeQueuedRace.shotIds, "a queued stale photo draft must not create an empty Shot");
    assert.deepEqual(result.photoRevisionChecks.afterQueuedRace.assetIds, result.photoRevisionChecks.beforeQueuedRace.assetIds, "a queued stale photo draft must not persist an Asset");
    assert.equal(result.photoRevisionChecks.afterQueuedRace.undoDepth, result.photoRevisionChecks.beforeQueuedRace.undoDepth + 1, "a queued stale photo draft must add no history entry");
    assert.equal(result.photo.afterRevision, result.photo.beforeRevision + 1, "Shot, photo bytes, metadata and crop should use one Project revision");
    assert.equal(result.photo.afterUndoDepth, result.photo.beforeUndoDepth + 1, "Shot and photo should create one history entry");
    assert.ok(result.photo.result.shotId, "photo operation should return its canonical shot ID");
    assert.deepEqual(result.photo.shot.assetIds, [result.photo.result.assetId], "the returned photo asset should belong to the new Shot");
    assert.deepEqual(result.photo.photoCrop, { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, "photo and crop should be stored together");
    assert.ok(result.photo.loadedBytes > 0, "new Shot photo bytes should be readable after commit");
    assert.equal(result.photo.undoneRevision, result.photo.beforeUndo + 1, "one undo should remove the photo Shot");
    assert.deepEqual(result.photo.undoneShotIds, [], "photo Shot should disappear on one undo");
    assert.deepEqual(result.photo.undoneAssetIds, [], "photo Asset metadata should disappear with the Shot on one undo");
    assert.equal(result.drawing.afterRevision, result.drawing.beforeRevision + 1, "Shot, Drawing and all strokes should use one Project revision");
    assert.equal(result.drawing.afterUndoDepth, result.drawing.beforeUndoDepth + 1, "Shot and Drawing should create one history entry");
    assert.equal(result.drawing.shot.title, "手繪鏡頭");
    assert.deepEqual(result.drawing.shot.drawingIds, [result.drawing.result.drawingId]);
    assert.equal(result.drawing.drawing.shotId, result.drawing.result.shotId);
    assert.deepEqual(result.drawing.drawing.layers, [
      { kind: "scene", visible: true, locked: false, strokes: 2 },
      { kind: "subject", visible: false, locked: true, strokes: 1 }
    ], "snapshot strokes and final layer state should be committed together");
    assert.equal(result.drawing.undoneRevision, result.drawing.beforeUndo + 1, "one undo should remove the Drawing Shot");
    assert.deepEqual(result.drawing.undoneShotIds, [], "Drawing Shot should disappear on one undo");
    assert.deepEqual(result.drawing.undoneDrawingIds, [], "Drawing should disappear with the Shot on one undo");
    assert.equal(result.emptyDrawingCode, "EMPTY_DRAWING", "blank Drawing should not promote a placeholder");
    assert.deepEqual(result.afterEmptyDrawing, result.beforeEmptyDrawing, "blank Drawing should not create a Shot or revision");
    assert.equal(typeof result.legacyDrawing.drawingId, "string", "existing Drawing API should still return a Drawing ID");
    assert.equal(result.legacyDrawing.afterRevision, result.legacyDrawing.beforeRevision + 1, "existing Drawing creation should still use one revision");
    assert.equal(result.legacyDrawing.strokeCount, 1, "existing Drawing creation should still commit its initial stroke");
    assert.deepEqual(pageErrors, [], "the isolated browser context should have no uncaught page errors");

    console.log(JSON.stringify({
      status: "passed",
      scope: "fresh non-persistent Chromium context and disposable IndexedDB project",
      checks: [
        "addShot(sceneId, initialPatch) writes Shot plus initial fields in one revision",
        "initial fields create one undo entry and one undo removes the Shot",
        "invalid initial patch writes no partial Shot or revision",
        "addShotWithPhoto requires a valid current expectedRevision and rechecks it after queue waits",
        "addShotWithPhoto atomically persists Shot, photo bytes, crop, and one history entry",
        "addShotWithDrawing atomically persists Shot, Drawing snapshot, and one history entry",
        "empty Drawing cannot promote a placeholder",
        "existing createDrawingForShotWithInitialEdit remains compatible",
        "no uncaught page errors"
      ],
      result
    }, null, 2));
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
