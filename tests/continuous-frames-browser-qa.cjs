"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const fixture = fs.readFileSync(path.join(__dirname, "photo-crop-qa-primary.png")).toString("base64");
const contentTypes = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml" };

async function main() {
  const browserPath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || chromium.executablePath();
  assert.ok(fs.existsSync(browserPath), "Pinned Chromium executable is missing.");
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
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    await page.locator("#lifecycle-project-title").fill("Continuous frames QA");
    await page.locator('button[name="createKind"][value="blank"]').click();
    await page.locator("body.project-ready").waitFor();

    const state = await page.evaluate(async (photoBase64) => {
      const model = window.StoryModel;
      const schema = window.DirectorStoryboardProjectSchema;
      const sceneId = await model.addScene("QA");
      const shotId = await model.addShot(sceneId, { title: "連續運鏡", visual: "A", script: "VO-A", duration: 8 });
      const dayId = await model.addDay("2026-11-15", "拍攝日", "08:00");
      await model.scheduleShot(shotId, dayId);
      const legacy = JSON.parse(JSON.stringify(model.getProject()));

      const legacyMulti = JSON.parse(JSON.stringify(legacy));
      const legacyShot = legacyMulti.shots.find((shot) => shot.id === shotId);
      legacyMulti.assets = [
        { projectId: legacyMulti.projectId, id: "legacy-photo-a", role: "photoOriginal", sha256: "a".repeat(64), mime: "image/png", originalName: "a.png", byteLength: 0, width: 1, height: 1, state: "missing", thumbnail: null },
        { projectId: legacyMulti.projectId, id: "legacy-photo-b", role: "photoOriginal", sha256: "b".repeat(64), mime: "image/png", originalName: "b.png", byteLength: 0, width: 1, height: 1, state: "missing", thumbnail: null }
      ];
      legacyShot.assetIds = ["legacy-photo-a", "legacy-photo-b"];
      schema.validateProject(legacyMulti);

      const cropA = { x: .1, y: .1, width: .8, height: .8 };
      const cropB = { x: .2, y: .15, width: .65, height: .7 };
      const frameB = await model.addSequenceFrame(shotId, null, { visual: "B", script: "VO-B" });
      const frameBId = frameB.frameId;
      await model.undo();
      if (model.getProject().shots[0].sequenceFrames) throw Error("Undo retained the newly-added frame.");
      await model.redo();
      if (model.getProject().shots[0].sequenceFrames[0].id !== frameBId) throw Error("Redo changed the stable frame ID.");

      const photoBytes = Uint8Array.from(atob(photoBase64), (character) => character.charCodeAt(0));
      const photo = new File([photoBytes], "continuous-frame.png", { type: "image/png" });
      const initialEdit = {
        kind: "stroke",
        layerKind: "subject",
        strokeDraft: {
          kind: "pen", color: "#24344f", baseWidth: 5,
          points: [{ x: .2, y: .25, t: 0, pressure: null }, { x: .7, y: .72, t: 24, pressure: null }]
        }
      };
      const drawingRevision = model.getProject().revision;
      const drawingId = await model.createDrawingForShotWithInitialEdit(
        shotId, initialEdit, drawingRevision, null, frameBId
      );
      const drawing = model.getDrawing(drawingId);
      if (drawing.frameId !== frameBId || drawing.shotId !== shotId) throw Error("Drawing was not owned by its frame and master Shot.");

      const current = model.getProject();
      const frameC = await model.addSequenceFrameWithPhoto(
        shotId, photo, { visual: "C", script: "VO-C", super: "SUPER-C" },
        { expectedRevision: current.revision, crop: cropB }, frameBId, "frame-c-local"
      );
      const frameCId = frameC.frameId;
      const assetId = model.getProject().shots[0].sequenceFrames.find((frame) => frame.id === frameCId).assetIds[0];
      await model.addShotPhotos(shotId, [photo], { crop: cropA }, frameBId);
      const beforePhotoLimit = model.getProject().revision;
      let photoLimitCode = null;
      try { await model.addShotPhotos(shotId, [photo], undefined, frameBId); }
      catch (error) { photoLimitCode = error.code; }
      if (photoLimitCode !== "SHOT_PHOTO_LIMIT") throw Error("A second photo was accepted for one frame.");
      if (model.getProject().revision !== beforePhotoLimit) throw Error("Rejected second photo changed the revision.");

      const shot = model.getProject().shots.find((item) => item.id === shotId);
      const frameBRecord = shot.sequenceFrames.find((frame) => frame.id === frameBId);
      const frameCRecord = shot.sequenceFrames.find((frame) => frame.id === frameCId);
      if (shot.durationSeconds !== 8 || shot.assetIds.length !== 0) throw Error("Shared duration or A photo state changed unexpectedly.");
      if (frameBRecord.assetIds.length !== 1 || frameCRecord.assetIds.length !== 1) throw Error("Each frame must own exactly one photo.");
      if (frameBRecord.assetIds[0] !== frameCRecord.assetIds[0] || frameBRecord.assetIds[0] !== assetId) throw Error("Equal photos were not deduplicated across frames.");
      if (JSON.stringify(frameBRecord.photoCropsByAssetId[assetId]) === JSON.stringify(frameCRecord.photoCropsByAssetId[assetId])) {
        throw Error("Photo crops were shared across frames.");
      }
      if (model.getDrawingsForShot(shotId, frameBId).length !== 1 || model.getDrawingsForShot(shotId, frameCId).length !== 0) {
        throw Error("Drawing lookup crossed frame ownership.");
      }
      const imageB = await model.getShotPhoto(shotId, assetId, frameBId);
      const imageC = await model.getShotPhoto(shotId, assetId, frameCId);
      if (imageB.frameId !== frameBId || imageC.frameId !== frameCId) throw Error("Photo reads lost the selected frame ID.");

      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 72;
      const context = canvas.getContext("2d");
      context.fillStyle = "#a72b45";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const frameABlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const frameAPhoto = new File([frameABlob], "frame-a.png", { type: "image/png" });
      await model.addShotPhotos(shotId, [frameAPhoto], { crop: cropA }, shot.sequenceFrameId);
      const frameAAssetId = model.getProject().shots.find((item) => item.id === shotId).assetIds[0];
      await model.setDrawingBackground(drawingId, assetId);
      if (model.getDrawing(drawingId).backgroundAssetId !== assetId) {
        throw Error("A Drawing could not use its own frame's photo as the background.");
      }
      const beforeCrossFrameBackground = model.getProject();
      let crossFrameBackgroundCode = null;
      try { await model.setDrawingBackground(drawingId, frameAAssetId); }
      catch (error) { crossFrameBackgroundCode = error.code; }
      let idleSnapshots = 0;
      const backgroundDeadline = Date.now() + 5000;
      while (Date.now() < backgroundDeadline && idleSnapshots < 2) {
        const status = model.getLifecycle();
        idleSnapshots = status.phase === "ready" && status.pendingCount === 0 ? idleSnapshots + 1 : 0;
        if (idleSnapshots < 2) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (idleSnapshots < 2) throw Error("The expected cross-frame Drawing background failure left pending work.");
      if (crossFrameBackgroundCode !== "SHOT_ASSET_NOT_FOUND") {
        throw Error("A Drawing accepted a photo owned only by another frame.");
      }
      if (JSON.stringify(model.getProject()) !== JSON.stringify(beforeCrossFrameBackground) ||
          model.getDrawing(drawingId).backgroundAssetId !== assetId) {
        throw Error("Rejecting a cross-frame Drawing background changed project data.");
      }
      await model.removeShotPhoto(shotId, frameAAssetId, shot.sequenceFrameId);

      const beforeNoOp = model.getProject();
      await model.createDrawingForSequenceFrame(
        shotId, "frame-cancel-local",
        { kind: "layerState", layerKind: "subject", patch: { visible: true } },
        beforeNoOp.revision, null, {}
      );
      const afterNoOp = model.getProject();
      if (afterNoOp.revision !== beforeNoOp.revision || afterNoOp.shots[0].sequenceFrames.some((frame) => frame.id === "frame-cancel-local")) {
        throw Error("A no-op drawing draft persisted a blank frame.");
      }
      const badPhoto = new File(["not an image"], "bad.png", { type: "image/png" });
      const beforeBadPhoto = model.getProject();
      try {
        await model.addSequenceFrameWithPhoto(shotId, badPhoto, {}, { expectedRevision: beforeBadPhoto.revision, crop: cropA }, null, "frame-bad-photo");
        throw Error("Invalid photo unexpectedly committed.");
      } catch (error) {
        if (error.message === "Invalid photo unexpectedly committed.") throw error;
      }
      if (model.getProject().revision !== beforeBadPhoto.revision ||
          model.getProject().shots[0].sequenceFrames.some((frame) => frame.id === "frame-bad-photo")) {
        throw Error("Failed photo preparation persisted a blank frame.");
      }

      const duplicateShotId = await model.duplicateShot(shotId);
      const duplicated = model.getProject();
      const duplicate = duplicated.shots.find((item) => item.id === duplicateShotId);
      if (duplicate.sequenceFrameId === shot.sequenceFrameId || duplicate.sequenceFrames.some((frame) => shot.sequenceFrames.some((source) => source.id === frame.id))) {
        throw Error("Shot duplication did not remap frame IDs.");
      }
      const duplicateFrameIds = new Set([duplicate.sequenceFrameId].concat(duplicate.sequenceFrames.map((frame) => frame.id)));
      const duplicateDrawings = duplicated.drawings.filter((item) => item.shotId === duplicateShotId);
      if (duplicateDrawings.length !== 1 || !duplicateFrameIds.has(duplicateDrawings[0].frameId)) {
        throw Error("Shot duplication lost the nested Drawing owner.");
      }
      await model.deleteShot(duplicateShotId);
      if (model.getProject().drawings.filter((item) => item.shotId === duplicateShotId).length) {
        throw Error("Deleting the duplicated Shot left nested Drawings behind.");
      }

      const originalFrameIds = model.getSequenceFrames(shotId).map((frame) => frame.id);
      const sourceBeforeDelete = model.getProject();
      const saveDeadline = Date.now() + 5000;
      let stableSaveStatusCount = 0;
      while (Date.now() < saveDeadline && stableSaveStatusCount < 2) {
        const status = model.getLifecycle();
        const saved = status.phase === "ready" && status.pendingCount === 0 &&
          status.committedRevision === sourceBeforeDelete.revision && !status.rescueAvailable;
        stableSaveStatusCount = saved ? stableSaveStatusCount + 1 : 0;
        if (stableSaveStatusCount < 2) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (stableSaveStatusCount < 2) throw Error("Project did not reach a stable saved state before ZIP export.");
      const archive = await model.exportCompletePackage();
      const packageCopy = await model.importCompletePackage(archive.archiveBytes, { mode: "copy" });
      await model.selectProject(packageCopy.projectId);
      const copy = model.getProject();
      const sourceShot = sourceBeforeDelete.shots.find((item) => item.id === shotId);
      const copiedShot = copy.shots.find((item) => item.title === sourceShot.title);
      const sourceFrameIds = [sourceShot.sequenceFrameId].concat((sourceShot.sequenceFrames || []).map((frame) => frame.id)).filter(Boolean);
      const copiedFrameIds = [copiedShot.sequenceFrameId].concat((copiedShot.sequenceFrames || []).map((frame) => frame.id)).filter(Boolean);
      const photoFrames = [copiedShot].concat(copiedShot.sequenceFrames || []).filter((frame) => frame.assetIds.length === 1);
      const copiedAssetId = photoFrames[0].assetIds[0];
      window.__zipRoundTrip = {
        sourceFrames: sourceFrameIds.length,
        copiedFrames: copiedFrameIds.length,
        allFrameIdsRemapped: copiedFrameIds.every((id) => !sourceFrameIds.includes(id)),
        duration: copiedShot.durationSeconds,
        scheduleShots: copy.scheduleEntries.filter((entry) => entry.type === "shot").length,
        drawingOwnersValid: copy.drawings.every((drawing) => drawing.shotId === copiedShot.id &&
          copiedFrameIds.includes(drawing.frameId)),
        copiedPhotoFrames: photoFrames.length,
        independentCrops: JSON.stringify(photoFrames[0].photoCropsByAssetId[copiedAssetId]) !==
          JSON.stringify(photoFrames[1].photoCropsByAssetId[copiedAssetId])
      };
      await model.selectProject(sourceBeforeDelete.projectId);
      await model.reorderSequenceFrames(shotId, [frameCId, originalFrameIds[0], frameBId]);
      let reordered = model.getProject().shots.find((item) => item.id === shotId);
      if (reordered.sequenceFrameId !== frameCId || reordered.visual !== "C" || reordered.durationSeconds !== 8) {
        throw Error("Reordering did not promote frame content while keeping shared duration.");
      }
      if (reordered.sequenceFrames.map((frame) => frame.id).join(",") !== [originalFrameIds[0], frameBId].join(",")) {
        throw Error("Frame reorder produced the wrong stable ID order.");
      }
      if (model.getProject().scheduleEntries.filter((entry) => entry.shotId === shotId).length !== 1) {
        throw Error("Frames created extra schedule entries.");
      }
      await model.deleteSequenceFrame(shotId, frameCId);
      reordered = model.getProject().shots.find((item) => item.id === shotId);
      if (reordered.sequenceFrameId !== originalFrameIds[0] || reordered.visual !== "A") {
        throw Error("Deleting A failed to promote the next frame's content.");
      }
      await model.deleteSequenceFrame(shotId, frameBId);
      const collapsed = model.getProject();
      const finalShot = collapsed.shots.find((item) => item.id === shotId);
      if (Object.prototype.hasOwnProperty.call(finalShot, "sequenceFrameId") ||
          Object.prototype.hasOwnProperty.call(finalShot, "sequenceFrames") ||
          finalShot.visual !== "A" || finalShot.durationSeconds !== 8 || collapsed.drawings.length !== 0) {
        throw Error("Deleting down to one frame did not collapse cleanly or remove its Drawing.");
      }

      const sourceProjectId = collapsed.projectId;
      window.__legacyProject = legacy;
      return { sourceProjectId, shotId, drawingId, assetId, legacyRevision: legacy.revision, zipRoundTrip: window.__zipRoundTrip };
    }, fixture);

    const legacyChecks = await page.evaluate(async () => {
      const { __legacyProject: legacy } = window;
      const packed = await DirectorStoryboardProjectPackage.exportProjectPackage(
        legacy, [], { zipAdapter: DirectorStoryboardZipAdapter }
      );
      const imported = await StoryModel.importCompletePackage(packed.archiveBytes, { mode: "copy" });
      await StoryModel.selectProject(imported.projectId);
      const copy = StoryModel.getProject();
      return {
        hasSequenceFields: Object.prototype.hasOwnProperty.call(copy.shots[0], "sequenceFrameId") ||
          Object.prototype.hasOwnProperty.call(copy.shots[0], "sequenceFrames"),
        shotCount: copy.shots.length,
        duration: copy.shots[0].durationSeconds,
        projectIdChanged: copy.projectId !== legacy.projectId
      };
    });
    assert.deepEqual(legacyChecks, { hasSequenceFields: false, shotCount: 1, duration: 8, projectIdChanged: true });

    assert.deepEqual(state.zipRoundTrip, {
      sourceFrames: 3, copiedFrames: 3, allFrameIdsRemapped: true, duration: 8,
      scheduleShots: 1, drawingOwnersValid: true, copiedPhotoFrames: 2, independentCrops: true
    });

    const persisted = await page.evaluate(async (projectId) => {
      const before = StoryModel.getProject();
      await StoryModel.release();
      await StoryModel.ready();
      await StoryModel.selectProject(projectId);
      return StoryModel.getProject();
    }, state.sourceProjectId);
    assert.equal(persisted.shots.length, 1, "IndexedDB reload preserves the single master Shot.");
    assert.equal(persisted.shots[0].durationSeconds, 8, "IndexedDB reload preserves shared duration.");
    assert.equal(persisted.scheduleEntries.filter((entry) => entry.type === "shot").length, 1, "Schedule remains one row per Shot.");
    assert.equal(persisted.drawings.length, 0, "Deleting frame rows removed their nested Drawing records.");
    assert.deepEqual(pageErrors, []);
    console.log("PASS continuous frames: stable IDs, one Shot/schedule/duration, photo limits and crops, Drawing ownership, undo/redo, reorder/delete promotion, old ZIP import, frame ZIP remap, and IndexedDB reload");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
