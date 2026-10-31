"use strict";

// Isolated browser coverage for Google Drive import from the project entry
// screen. The Drive module is mocked; no Google account or network request is
// used, and every browser context has a disposable IndexedDB.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("C:/Users/Aaron/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const browserPath = "C:/Users/Aaron/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe";
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\//, "") || "index.html";
  const file = path.resolve(dist, relative);
  if (file !== dist && !file.startsWith(dist + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, bytes) => {
    if (error) return response.writeHead(404).end();
    const ext = path.extname(file);
    response.setHeader("Content-Type", ext === ".css" ? "text/css" : ext === ".html" ? "text/html" : ext === ".svg" ? "image/svg+xml" : "text/javascript");
    response.setHeader("Cache-Control", "no-store");
    response.end(bytes);
  });
});

const mockDriveModule = `(() => {
  window.KinoDriveConfig = { clientId: "mock-client", apiKey: "mock-key", appId: "123456789" };
  window.__mockDrive = { importCalls: 0, cancelNext: false, fixture: null, cancelReject: null };
  window.KinoDrive = {
    ready: Promise.resolve(true),
    getStatus: () => ({ configured: true, ready: true, loading: false, currentOperation: null, pendingUpload: null }),
    importZip: () => {
      window.__mockDrive.importCalls += 1;
      if (window.__mockDrive.cancelNext) {
        window.__mockDrive.cancelNext = false;
        return new Promise((resolve, reject) => { window.__mockDrive.cancelReject = reject; });
      }
      const fixture = window.__mockDrive.fixture;
      if (!fixture) return Promise.reject(Object.assign(new Error("No mock ZIP fixture"), { code: "MOCK_FIXTURE_MISSING" }));
      return Promise.resolve({ bytes: new Uint8Array(fixture.bytes), name: fixture.name, mimeType: "application/zip", size: fixture.bytes.length });
    },
    exportZip: async () => { throw Object.assign(new Error("Export is outside this check"), { code: "MOCK_EXPORT_UNUSED" }); },
    cancelCurrent: () => {
      const reject = window.__mockDrive.cancelReject;
      if (!reject) return false;
      window.__mockDrive.cancelReject = null;
      reject(Object.assign(new Error("Google Drive operation cancelled"), { code: "DRIVE_CANCELLED", cancelled: true }));
      return true;
    },
  };
})();`;

async function openEntry(page, url) {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert.ok(response && response.ok(), "Local dist server returned an unsuccessful response.");
  await page.locator("#lifecycle-project-title").waitFor({ state: "visible" });
  return pageErrors;
}

async function main() {
  assert.ok(fs.existsSync(browserPath), "Pinned Chromium executable is missing.");
  let browser;
  let sourceContext;
  let missingConfigContext;
  let importContext;
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port;
  try {
    browser = await chromium.launch({ headless: true, executablePath: browserPath });

    missingConfigContext = await browser.newContext();
    const missingConfigPage = await missingConfigContext.newPage();
    const missingConfigErrors = await openEntry(missingConfigPage, url);
    const missingConfigDriveButton = missingConfigPage.locator('#lifecycle-gate [data-lifecycle-action="import-google-drive"]');
    assert.equal(await missingConfigDriveButton.isDisabled(), true, "Drive import is disabled when configuration is absent.");
    assert.match(await missingConfigPage.locator('#lifecycle-gate [role="status"]').innerText(), /KinoDriveConfig\.clientId/);
    assert.equal(await missingConfigPage.locator('#lifecycle-gate [data-lifecycle-action="import-complete-package"]').isDisabled(), false, "Local ZIP preview remains available without Drive configuration.");
    assert.equal(await missingConfigPage.locator('[data-lifecycle-action="preview-migration"]').count(), 0, "The old-draft preview action is absent from the entry screen.");
    assert.deepEqual(missingConfigErrors, [], "The missing-config entry screen has no uncaught page errors.");

    sourceContext = await browser.newContext();
    const sourcePage = await sourceContext.newPage();
    await sourcePage.route("**/google-drive.js*", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: mockDriveModule }));
    const sourceErrors = await openEntry(sourcePage, url);
    await sourcePage.getByRole("button", { name: "新建專案" }).click();
    await sourcePage.waitForFunction(() => document.body.classList.contains("project-ready") && window.StoryModel.getLifecycle().phase === "ready", null, { timeout: 30000 });
    const fixture = await sourcePage.evaluate(async () => {
      const result = await window.StoryModel.exportCompletePackage();
      return { name: result.fileName, bytes: Array.from(result.archiveBytes) };
    });
    assert.match(fixture.name, /\.zip$/i);
    assert.ok(fixture.bytes.length > 0, "The source is a valid, non-empty exported package.");
    assert.deepEqual(sourceErrors, [], "The source package context has no uncaught page errors.");

    importContext = await browser.newContext();
    const importPage = await importContext.newPage();
    await importPage.route("**/google-drive.js*", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: mockDriveModule }));
    const importErrors = await openEntry(importPage, url);
    await importPage.waitForFunction(() => {
      const button = document.querySelector('#lifecycle-gate [data-lifecycle-action="import-google-drive"]');
      return button && !button.disabled;
    }, null, { timeout: 10000 });
    assert.equal(await importPage.locator("#lifecycle-project-title").inputValue(), "", "The target entry has no opened project.");
    assert.equal(await importPage.getByRole("button", { name: "新建專案" }).count(), 1, "The blank-project action uses the requested label.");
    assert.equal(await importPage.locator('[data-lifecycle-action="preview-migration"]').count(), 0, "The old-draft preview action stays absent when Drive is ready.");
    await importPage.evaluate(() => { window.__mockDrive.cancelNext = true; });
    await importPage.locator('#lifecycle-gate [data-lifecycle-action="import-google-drive"]').click();
    const cancelDriveButton = importPage.locator('#lifecycle-gate [data-lifecycle-action="cancel-drive-import"]');
    await cancelDriveButton.waitFor({ state: "visible" });
    await cancelDriveButton.click();
    await importPage.waitForFunction(() => document.querySelector('#lifecycle-gate [role="status"]')?.textContent.includes("已取消 Google Drive 匯入"), null, { timeout: 10000 });
    assert.equal(await importPage.evaluate(() => window.StoryModel.getLifecycle().projects.length), 0, "Cancelling Drive selection leaves the local project list unchanged.");
    assert.equal(await importPage.evaluate(() => window.StoryModel.getProject()), null, "Cancelling Drive selection does not open a project.");

    await importPage.evaluate((value) => { window.__mockDrive.fixture = value; }, fixture);
    await importPage.locator('#lifecycle-gate [data-lifecycle-action="import-google-drive"]').click();
    await importPage.locator("#complete-package-import-dialog").waitFor({ state: "visible" });
    await importPage.getByText("完整封包驗證通過", { exact: false }).waitFor({ state: "visible" });
    assert.equal(await importPage.evaluate(() => window.StoryModel.getLifecycle().projects.length), 0, "Drive ZIP preview writes no project before confirmation.");
    assert.equal(await importPage.evaluate(() => window.StoryModel.getProject()), null, "Drive ZIP preview leaves the entry without an opened project.");
    await importPage.locator('#complete-package-import-actions [data-package-import-action="confirm"]').click();
    await importPage.waitForFunction(() => window.StoryModel.getLifecycle().projects.length === 1, null, { timeout: 30000 });
    assert.equal(await importPage.evaluate(() => window.StoryModel.getProject()), null, "Confirmed Drive import adds a project without opening it.");
    assert.equal(await importPage.evaluate(() => document.body.classList.contains("project-ready")), false, "Confirmed Drive import stays on the project entry screen.");

    await importPage.locator('#lifecycle-gate [data-lifecycle-action="import-google-drive"]').click();
    await importPage.locator("#complete-package-import-dialog").waitFor({ state: "visible" });
    await importPage.getByText("完整封包驗證通過", { exact: false }).waitFor({ state: "visible" });
    assert.match(await importPage.locator(".package-import-collision").innerText(), /不會覆蓋/);
    assert.equal(await importPage.locator('#complete-package-import-actions [data-package-import-action="confirm"]').count(), 0, "A duplicate Drive Project ID cannot be restored over existing data.");
    assert.equal(await importPage.evaluate(() => window.StoryModel.getLifecycle().projects.length), 1, "The duplicate preview does not change the project list.");
    assert.equal(await importPage.evaluate(() => window.StoryModel.getProject()), null, "The duplicate preview still does not open the imported project.");
    await importPage.locator('#complete-package-import-actions [data-package-import-action="cancel"]').click();
    assert.deepEqual(importErrors, [], "The mocked Drive entry flow has no uncaught page errors.");

    console.log(JSON.stringify({
      result: "passed",
      isolation: "fresh Chromium contexts with disposable IndexedDB",
      realGoogleAccount: "not_used",
      checks: [
        "entry capability check disables Drive import when configuration is missing while local ZIP import remains available",
        "old-draft preview control is removed and blank creation is labelled 新建專案",
        "Drive selection cancellation reports cancellation and changes no local projects",
        "Drive ZIP uses the existing full preview and requires confirmation before write",
        "confirmed Drive import adds a project without opening or switching to it",
        "duplicate Project ID preview refuses overwrite and does not open the project",
        "no uncaught browser errors"
      ]
    }, null, 2));
  } finally {
    if (missingConfigContext) await missingConfigContext.close();
    if (sourceContext) await sourceContext.close();
    if (importContext) await importContext.close();
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
