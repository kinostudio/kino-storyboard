"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const modulePath = path.join(__dirname, "..", "dist", "google-drive.js");
const source = fs.readFileSync(modulePath, "utf8");
const scope = "https://www.googleapis.com/auth/drive.file";
const sessionUrl = "https://www.googleapis.com/upload/drive/v3/files?upload_id=403-test";

function jsonResponse(value, status) {
  return new Response(JSON.stringify(value), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

function createHarness(fetchImpl) {
  const pickerResponses = [{
    action: "PICKED",
    docs: [{ id: "folder-1", name: "Storyboard backups", mimeType: "application/vnd.google-apps.folder" }],
  }];

  class DocsView {
    constructor() {}
    setIncludeFolders() { return this; }
    setMode() { return this; }
    setMimeTypes() { return this; }
    setSelectFolderEnabled() { return this; }
  }

  class PickerBuilder {
    addView() { return this; }
    setOAuthToken() { return this; }
    setDeveloperKey() { return this; }
    setAppId() { return this; }
    setLocale() { return this; }
    setCallback(callback) { this.callback = callback; return this; }
    enableFeature() { return this; }
    build() {
      const result = pickerResponses.shift();
      const callback = this.callback;
      return {
        setVisible(visible) {
          if (visible) setTimeout(() => callback(result), 0);
        },
      };
    }
  }

  const picker = {
    DocsView,
    PickerBuilder,
    ViewId: { DOCS: "DOCS" },
    DocsViewMode: { LIST: "LIST" },
    Response: { ACTION: "action", DOCUMENTS: "docs" },
    Action: { PICKED: "PICKED", CANCEL: "CANCEL", ERROR: "ERROR" },
    Feature: { SUPPORT_DRIVES: "SUPPORT_DRIVES" },
  };
  const windowObject = {
    KinoDriveConfig: {
      clientId: "mock-client.apps.googleusercontent.com",
      apiKey: "mock-api-key",
      appId: "123456789",
    },
    google: {
      accounts: {
        oauth2: {
          initTokenClient(config) {
            return {
              requestAccessToken() {
                config.callback({ access_token: "mock-token", scope, expires_in: 3600 });
              },
            };
          },
          hasGrantedAllScopes(response, requiredScope) {
            return response.access_token === "mock-token" && requiredScope === scope;
          },
        },
      },
      picker,
    },
    gapi: { load(_name, options) { options.callback(); } },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init && init.detail; }
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
  };
  const documentObject = {
    visibilityState: "visible",
    scripts: [],
    head: { appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
  };
  const context = {
    window: windowObject,
    document: documentObject,
    CustomEvent: windowObject.CustomEvent,
    fetch: fetchImpl,
    AbortController,
    ArrayBuffer,
    Uint8Array,
    URL,
    Response,
    Promise,
    Error,
    Object,
    Number,
    String,
    Math,
    RegExp,
    Array,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, context, { filename: modulePath });
  return windowObject.KinoDrive;
}

async function testQuota403ExpiresSession() {
  let sessionCount = 0;
  let chunkCount = 0;
  const api = createHarness(async (url, init) => {
    const method = init.method || "GET";
    if (method === "POST" && url.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
      sessionCount += 1;
      return new Response(null, { status: 200, headers: { Location: sessionUrl } });
    }
    if (url === sessionUrl && method === "PUT") {
      chunkCount += 1;
      return jsonResponse({ error: { code: 403, errors: [{ reason: "storageQuotaExceeded" }] } }, 403);
    }
    throw new Error("Unexpected request: " + method + " " + url);
  });

  await assert.rejects(api.exportZip(Uint8Array.from([1, 2, 3]), "quota.storyboard.zip"), (error) => {
    assert.equal(error.code, "DRIVE_UPLOAD_SESSION_EXPIRED");
    assert.equal(error.status, 403);
    assert.equal(error.causeCode, "storageQuotaExceeded");
    assert.match(error.message, /儲存空間已滿/);
    return true;
  });
  assert.equal(sessionCount, 1);
  assert.equal(chunkCount, 1);
  const pending = api.getStatus().pendingUpload;
  assert.equal(pending.state, "expired");
  assert.equal(pending.canResume, false);
  assert.equal(pending.possibleDuplicate, true);
  await assert.rejects(api.resumeUpload(), (error) => error.code === "DRIVE_UPLOAD_SESSION_EXPIRED");
  assert.equal(sessionCount, 1, "The expired session must not silently create a second Drive file.");
  assert.throws(() => api.discardPendingUpload(), (error) => error.code === "DRIVE_DUPLICATE_CONFIRMATION_REQUIRED");
  assert.equal(api.discardPendingUpload({ confirmPossibleDuplicate: true }), true);
}

async function testRateLimit403CanResume() {
  let sessionCount = 0;
  let chunkCount = 0;
  let statusCount = 0;
  const bytes = Uint8Array.from([10, 11, 12, 13, 14, 15]);
  const api = createHarness(async (url, init) => {
    const method = init.method || "GET";
    if (method === "POST" && url.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
      sessionCount += 1;
      return new Response(null, { status: 200, headers: { Location: sessionUrl } });
    }
    if (url === sessionUrl && method === "PUT") {
      const contentRange = init.headers["Content-Range"];
      if (contentRange.startsWith("bytes */")) {
        statusCount += 1;
        return new Response(null, { status: 308 });
      }
      chunkCount += 1;
      if (chunkCount === 1) {
        return jsonResponse({ error: { code: 403, errors: [{ reason: "userRateLimitExceeded" }] } }, 403);
      }
      assert.equal(contentRange, "bytes 0-5/6");
      return jsonResponse({
        id: "created-after-rate-limit",
        name: "rate-limit.storyboard.zip",
        mimeType: "application/zip",
        size: String(bytes.byteLength),
      }, 201);
    }
    throw new Error("Unexpected request: " + method + " " + url);
  });

  await assert.rejects(api.exportZip(bytes, "rate-limit.storyboard.zip"), (error) => {
    assert.equal(error.code, "DRIVE_RATE_LIMITED");
    assert.equal(error.causeCode, "userRateLimitExceeded");
    return true;
  });
  assert.equal(api.getStatus().pendingUpload.state, "paused");
  assert.equal(api.getStatus().pendingUpload.canResume, true);

  const completed = await api.resumeUpload();
  assert.equal(completed.id, "created-after-rate-limit");
  assert.equal(sessionCount, 1, "Retry must use the original resumable session.");
  assert.equal(statusCount, 1, "Resume checks Drive's accepted byte range before sending again.");
  assert.equal(chunkCount, 2);
  assert.equal(api.getStatus().pendingUpload, null);
}

async function main() {
  let folderCreates = 0;
  const destination = createHarness(async (url, init) => {
    if (url.startsWith("https://www.googleapis.com/drive/v3/files?")) {
      folderCreates++;
      const body = JSON.parse(init.body);
      assert.deepEqual(body.parents, ["folder-1"]);
      assert.equal(body.name, "新資料夾");
      return jsonResponse({ id: "child-1", name: body.name, mimeType: "application/vnd.google-apps.folder" });
    }
    if (init.method === "POST") {
      assert.deepEqual(JSON.parse(init.body).parents, ["child-1"]);
      return new Response(null, { status: 200, headers: { Location: sessionUrl } });
    }
    return jsonResponse({ id: "zip-1", name: "test.zip", mimeType: "application/zip", size: "1" }, 200);
  });
  const result = await destination.exportZip(Uint8Array.from([1]), "test.zip", { chooseDestination: async () => ({ createFolderName: "新資料夾" }) });
  assert.equal(folderCreates, 1);
  assert.equal(result.folderId, "child-1");
  const cancelled = createHarness(async () => { throw new Error("No network requests expected after cancellation"); });
  await assert.rejects(cancelled.exportZip(Uint8Array.from([1]), "test.zip", { chooseDestination: async () => null }), error => error.code === "DRIVE_CANCELLED");
  await testQuota403ExpiresSession();
  await testRateLimit403CanResume();
  console.log(JSON.stringify({
    result: "passed",
    checks: [
      "storageQuotaExceeded 403 marks the resumable session expired, exposes a useful reason, and blocks silent duplicate creation",
      "userRateLimitExceeded 403 remains retryable through the original session after querying confirmed progress",
    ],
    boundary: "mock Google Identity, Picker, Fetch, and Drive responses only; no live Google account or Drive request",
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
