"use strict";

// Isolated local-browser regression for the placeholder-shot lifecycle. A fresh
// Chromium context uses a disposable IndexedDB project and never opens the
// user's browser profile or project data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("C:/Users/Aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const browserPath = "C:/Users/Aaron/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe";
const contentTypes = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml" };

async function main() {
  assert.ok(fs.existsSync(browserPath), "Pinned Chromium executable is missing.");
  assert.ok(fs.existsSync(dist), "Release-candidate dist directory is missing.");

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
    browser = await chromium.launch({ headless: true, executablePath: browserPath });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    assert.ok(response && response.ok(), "Local storyboard returned an unsuccessful response.");
    await page.locator("#lifecycle-project-title").waitFor({ state: "visible" });
    await page.locator("#lifecycle-project-title").fill("Drawing Placeholder QA");
    await page.locator('#lifecycle-create-form button[name="createKind"][value="blank"]').click();
    await page.locator("body.project-ready").waitFor({ state: "attached" });

    const setup = await page.evaluate(async () => {
      const model = window.StoryModel;
      const sceneId = await model.addScene("Drawing Placeholder QA");
      const project = model.getProject();
      window.__placeholderBackEvents = [];
      window.__placeholderCreatedEvents = [];
      window.mountPlaceholderForQa = () => {
        const host = document.createElement("main");
        host.id = "placeholder-qa-host";
        host.style.cssText = "position:fixed;inset:0;z-index:99999;width:100vw;height:100vh;overflow:auto;background:white";
        document.body.appendChild(host);
        window.__placeholderHost = host;
        window.__placeholderEditor = window.DirectorStoryboardDrawingEditor.mount(host, {
          model,
          projectId: project.projectId,
          draft: true,
          shotLabel: "新增鏡頭草稿",
          placeholder: {
            sceneId,
            initialShotPatch: { title: "新鏡頭", visual: "尚未填寫", duration: 4 }
          },
          onCreated: (result) => window.__placeholderCreatedEvents.push(result),
          onBack: (result) => window.__placeholderBackEvents.push(result)
        });
        return window.__placeholderEditor.refresh();
      };
      window.unmountPlaceholderForQa = () => {
        if (window.__placeholderEditor) window.__placeholderEditor.destroy();
        if (window.__placeholderHost) window.__placeholderHost.remove();
        window.__placeholderEditor = null;
        window.__placeholderHost = null;
      };
      return { projectId: project.projectId, sceneId, revision: project.revision };
    });

    async function mountReady() {
      await page.evaluate(() => window.mountPlaceholderForQa());
      await page.waitForFunction(() => window.__placeholderEditor && window.__placeholderEditor.editor.drawing && window.__placeholderEditor.editor.backgroundReady);
    }

    async function drawOneStroke() {
      const box = await page.locator(".ds-de-canvas").boundingBox();
      assert.ok(box, "Drawing canvas is visible.");
      await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.32);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.63, box.y + box.height * 0.57, { steps: 8 });
      await page.mouse.up();
      await page.waitForFunction(() => window.__placeholderEditor.editor.placeholderHasStrokes());
    }

    await mountReady();
    await page.evaluate(async () => {
      await window.__placeholderEditor.requestClose();
      window.__placeholderEditor.editor.closeWithoutSaving();
    });
    let untouched = await page.evaluate(() => ({ project: window.StoryModel.getProject(), back: window.__placeholderBackEvents[0] }));
    assert.equal(untouched.project.revision, setup.revision, "Untouched close does not advance the project revision.");
    assert.equal(untouched.project.shots.length, 0, "Untouched close creates no Shot.");
    assert.equal(untouched.back.saved, false, "Untouched close reports saved=false.");
    await page.evaluate(() => window.unmountPlaceholderForQa());

    await mountReady();
    await drawOneStroke();
    let afterStroke = await page.evaluate(() => window.StoryModel.getProject());
    assert.equal(afterStroke.revision, setup.revision, "Drawing a stroke remains local before an explicit save.");
    assert.equal(afterStroke.shots.length, 0, "Drawing a stroke alone creates no Shot.");
    await page.evaluate(async () => {
      await window.__placeholderEditor.requestClose();
      window.__placeholderEditor.editor.closeWithoutSaving();
    });
    const discarded = await page.evaluate(() => ({ project: window.StoryModel.getProject(), back: window.__placeholderBackEvents[1] }));
    assert.equal(discarded.project.revision, setup.revision, "Discard after drawing does not advance the project revision.");
    assert.equal(discarded.project.shots.length, 0, "Discard after drawing creates no Shot.");
    assert.equal(discarded.back.saved, false, "Discard after drawing reports saved=false.");
    await page.evaluate(() => window.unmountPlaceholderForQa());

    await mountReady();
    await drawOneStroke();
    assert.equal(await page.evaluate(() => window.StoryModel.getProject().shots.length), 0, "The draft still has no Shot before Save & Close.");
    const saved = await page.evaluate(() => window.__placeholderEditor.saveAndClose());
    assert.equal(saved, true, "Explicit Save & Close commits the compound operation.");
    const committed = await page.evaluate(() => {
      const project = window.StoryModel.getProject();
      const editor = window.__placeholderEditor.editor;
      const created = window.__placeholderCreatedEvents[0];
      const back = window.__placeholderBackEvents[2];
      const shot = created && project.shots.find((item) => item.id === created.shotId);
      const drawing = created && project.drawings.find((item) => item.id === created.drawingId);
      const history = window.StoryModel.getHistoryStatus();
      return {
        project,
        shot,
        drawing,
        created,
        back,
        editor: { shotId: editor.capturedShotId, drawingId: editor.drawing.id, isDraft: editor.isDraft },
        history
      };
    });
    assert.equal(committed.project.revision, setup.revision + 1, "Shot and Drawing are committed in one project revision.");
    assert.equal(committed.project.shots.length, 1);
    assert.equal(committed.project.drawings.length, 1);
    assert.equal(committed.shot.sceneId, setup.sceneId);
    assert.deepEqual(committed.shot.drawingIds, [committed.created.drawingId]);
    assert.equal(committed.shot.title, "新鏡頭");
    assert.ok(committed.drawing.layers.some((layer) => layer.strokes.length > 0), "The atomic Drawing contains the initial stroke.");
    assert.equal(committed.editor.shotId, committed.created.shotId, "The editor adopts the real Shot ID.");
    assert.equal(committed.editor.drawingId, committed.created.drawingId, "The editor adopts the real Drawing ID.");
    assert.equal(committed.editor.isDraft, false, "The editor leaves draft mode after commit.");
    assert.equal(committed.back.saved, true, "Successful Save & Close reports saved=true.");
    assert.equal(committed.back.revision, committed.project.revision);
    assert.deepEqual(committed.created, {
      shotId: committed.shot.id,
      drawingId: committed.drawing.id,
      revision: committed.project.revision
    });
    assert.equal(committed.history.undoDepth, 2, "The compound create records one history entry after scene setup.");
    assert.deepEqual(pageErrors, [], "The isolated browser page has no uncaught errors.");

    console.log(JSON.stringify({
      result: "passed",
      scope: "fresh non-persistent Chromium context and disposable IndexedDB project",
      checks: [
        "untouched placeholder close creates no Shot and changes no revision",
        "drawing and discarding strokes creates no Shot or revision",
        "explicit Save & Close atomically creates Shot and Drawing with the initial stroke",
        "real IDs are rebound and returned through onCreated/onBack",
        "compound operation creates one history entry",
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
