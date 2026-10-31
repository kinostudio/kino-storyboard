(function () {
  "use strict";

  const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
  const DRIVE_API = "https://www.googleapis.com/drive/v3";
  const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
  const MAX_ARCHIVE_BYTES = 516 * 1024 * 1024;
  const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
  const TOKEN_PROMPT_TIMEOUT_MS = 120000;
  const PICKER_MIME_TYPES = "application/zip,application/x-zip-compressed";

  let libraryPromise = null;
  let libraryError = null;
  let currentOperation = null;
  let pendingUpload = null;
  let nextOperationId = 1;

  function makeError(code, message, extra) {
    const error = new Error(message || code || "Google Drive 操作失敗。");
    error.name = "KinoDriveError";
    error.code = code || "DRIVE_UNKNOWN_ERROR";
    if (extra && typeof extra === "object") Object.assign(error, extra);
    return error;
  }

  function getConfig() {
    const value = window.KinoDriveConfig;
    if (!value || !value.clientId || !value.apiKey || !value.appId) {
      throw makeError(
        "DRIVE_NOT_CONFIGURED",
        "Google Drive 尚未設定。請設定 window.KinoDriveConfig.clientId、apiKey 和 appId（Google Cloud Project number）後重載。"
      );
    }
    const config = {
      clientId: String(value.clientId).trim(),
      apiKey: String(value.apiKey).trim(),
      appId: String(value.appId).trim(),
    };
    if (!config.clientId || !config.apiKey || !/^\d+$/.test(config.appId)) {
      throw makeError(
        "DRIVE_CONFIG_INVALID",
        "Google Drive 設定格式錯誤；appId 必須是 Google Cloud Project number。"
      );
    }
    return config;
  }

  function setOperationPhase(operation, phase, loaded, total) {
    operation.phase = phase;
    const detail = {
      operation: operation.kind,
      phase,
      loaded: Number.isFinite(loaded) ? loaded : 0,
      total: Number.isFinite(total) ? total : 0,
    };
    detail.percent = detail.total > 0 ? Math.min(100, Math.floor((detail.loaded / detail.total) * 100)) : null;
    try {
      if (typeof operation.onProgress === "function") operation.onProgress(detail);
    } catch (_) {}
    try {
      if (typeof window.CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent("kinodrive:progress", { detail }));
      }
    } catch (_) {}
  }

  function ensureScript(url, marker) {
    if (marker()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let script = Array.from(document.scripts).find((item) => item.src === url);
      if (!script) {
        script = document.createElement("script");
        script.src = url;
        script.async = true;
        script.defer = true;
      }
      let settled = false;
      const timer = setTimeout(() => {
        finish(reject, makeError("DRIVE_SDK_LOAD_TIMEOUT", "Google Drive 元件載入逾時，請確認網路後重試。"));
      }, 20000);
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
        callback(value);
      };
      const onLoad = () => {
        if (marker()) finish(resolve);
        else finish(reject, makeError("DRIVE_SDK_LOAD_FAILED", "Google Drive 元件沒有成功初始化。"));
      };
      const onError = () => finish(reject, makeError("DRIVE_SDK_LOAD_FAILED", "無法載入 Google Drive 元件。"));
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      if (!script.isConnected) document.head.appendChild(script);
    });
  }

  async function loadGoogleLibraries() {
    getConfig();
    await Promise.all([
      ensureScript("https://accounts.google.com/gsi/client", () => !!(window.google && window.google.accounts && window.google.accounts.oauth2)),
      ensureScript("https://apis.google.com/js/api.js", () => !!window.gapi),
    ]);
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      const timer = setTimeout(() => finish(reject, makeError("DRIVE_PICKER_LOAD_TIMEOUT", "Google Picker 載入逾時，請重試。")), 15000);
      try {
        window.gapi.load("picker", {
          callback: () => finish(resolve),
          onerror: () => finish(reject, makeError("DRIVE_PICKER_LOAD_FAILED", "Google Picker 載入失敗。")),
          ontimeout: () => finish(reject, makeError("DRIVE_PICKER_LOAD_TIMEOUT", "Google Picker 載入逾時，請重試。")),
          timeout: 12000,
        });
      } catch (_) {
        finish(reject, makeError("DRIVE_PICKER_LOAD_FAILED", "Google Picker 載入失敗。"));
      }
    });
    if (!(window.google && window.google.accounts && window.google.accounts.oauth2 && window.google.picker)) {
      throw makeError("DRIVE_SDK_LOAD_FAILED", "Google Drive 元件沒有成功初始化。");
    }
  }

  function ensureLibraries() {
    if (!libraryPromise) {
      libraryPromise = loadGoogleLibraries().then(() => {
        libraryError = null;
      }).catch((error) => {
        libraryError = error;
        libraryPromise = null;
        throw error;
      });
    }
    return libraryPromise;
  }

  function beginOperation(kind, options) {
    if (currentOperation) throw makeError("DRIVE_OPERATION_BUSY", "另一個 Google Drive 操作仍在進行中。", { retryable: true });
    const operation = {
      id: nextOperationId++,
      kind,
      phase: "starting",
      token: null,
      tokenClient: null,
      picker: null,
      controller: null,
      cancelReject: null,
      cancelled: false,
      onProgress: options && options.onProgress,
      externalSignal: options && options.signal,
      externalAbortHandler: null,
    };
    currentOperation = operation;
    if (operation.externalSignal) {
      operation.externalAbortHandler = () => cancelOperation(operation);
      if (operation.externalSignal.aborted) cancelOperation(operation);
      else operation.externalSignal.addEventListener("abort", operation.externalAbortHandler, { once: true });
    }
    return operation;
  }

  function assertActive(operation, allowCancelled) {
    if (operation.cancelled && !allowCancelled) {
      throw makeError("DRIVE_CANCELLED", "Google Drive 操作已取消。", { cancelled: true });
    }
    if (currentOperation !== operation) {
      throw makeError("DRIVE_OPERATION_ENDED", "Google Drive 操作已結束。", { cancelled: true });
    }
  }

  function cancelOperation(operation) {
    if (!operation || currentOperation !== operation || operation.cancelled) return false;
    operation.cancelled = true;
    if (operation.controller) {
      try { operation.controller.abort(); } catch (_) {}
    }
    if (operation.picker) {
      try { operation.picker.setVisible(false); } catch (_) {}
    }
    if (typeof operation.cancelReject === "function") {
      const reject = operation.cancelReject;
      operation.cancelReject = null;
      reject(makeError("DRIVE_CANCELLED", "Google Drive 操作已取消。", { cancelled: true }));
    }
    return true;
  }

  function endOperation(operation) {
    if (!operation) return;
    if (operation.externalSignal && operation.externalAbortHandler) {
      try { operation.externalSignal.removeEventListener("abort", operation.externalAbortHandler); } catch (_) {}
    }
    if (operation.controller) {
      try { operation.controller.abort(); } catch (_) {}
      operation.controller = null;
    }
    if (operation.picker) {
      try { operation.picker.setVisible(false); } catch (_) {}
      operation.picker = null;
    }
    operation.token = null;
    operation.tokenClient = null;
    operation.cancelReject = null;
    if (currentOperation === operation) currentOperation = null;
  }

  function requestToken(operation) {
    assertActive(operation);
    if (!(window.google && window.google.accounts && window.google.accounts.oauth2)) {
      return ensureLibraries().then(() => requestToken(operation));
    }
    const config = getConfig();
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      let dismissalTimer = null;
      let lostFocus = false;
      let wasHidden = false;

      const cleanupListeners = () => {
        if (timer) clearTimeout(timer);
        if (dismissalTimer) clearTimeout(dismissalTimer);
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        operation.cancelReject = null;
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        callback(value);
      };
      const onBlur = () => { lostFocus = true; };
      const onFocus = () => {
        if (!lostFocus) return;
        if (dismissalTimer) clearTimeout(dismissalTimer);
        dismissalTimer = setTimeout(() => {
          if (!settled) finish(reject, makeError("DRIVE_AUTH_CANCELLED", "Google 授權已關閉。", { cancelled: true }));
        }, 1800);
      };
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          wasHidden = true;
          lostFocus = true;
        }
        else if (wasHidden) onFocus();
      };

      operation.cancelReject = (error) => finish(reject, error);
      window.addEventListener("blur", onBlur);
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onVisibilityChange);
      timer = setTimeout(() => {
        finish(reject, makeError("DRIVE_AUTH_TIMEOUT", "等待 Google 授權逾時；請重新按下 Drive 動作。", { retryable: true }));
      }, TOKEN_PROMPT_TIMEOUT_MS);

      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: DRIVE_FILE_SCOPE,
          callback: (response) => {
            if (settled) return;
            if (operation.cancelled) {
              finish(reject, makeError("DRIVE_CANCELLED", "Google Drive 操作已取消。", { cancelled: true }));
              return;
            }
            if (!response || response.error || !response.access_token) {
              const cancelled = response && (response.error === "access_denied" || response.error === "popup_closed_by_user");
              finish(reject, makeError(
                cancelled ? "DRIVE_AUTH_CANCELLED" : "DRIVE_AUTH_FAILED",
                cancelled ? "Google 授權已取消。" : "Google 授權失敗，請重試。",
                { cancelled: !!cancelled, retryable: !cancelled }
              ));
              return;
            }
            const granted = typeof window.google.accounts.oauth2.hasGrantedAllScopes === "function"
              ? window.google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_FILE_SCOPE)
              : String(response.scope || "").split(/\s+/).includes(DRIVE_FILE_SCOPE);
            if (!granted) {
              finish(reject, makeError("DRIVE_SCOPE_NOT_GRANTED", "尚未授予 Google Drive 檔案權限；本次沒有傳輸 ZIP。"));
              return;
            }
            operation.token = response.access_token;
            finish(resolve, operation.token);
          },
        });
        operation.tokenClient = client;
        client.requestAccessToken();
      } catch (_) {
        finish(reject, makeError("DRIVE_AUTH_FAILED", "無法開啟 Google 授權視窗；請再按一次 Drive 動作。", { retryable: true }));
      }
    });
  }

  function pickFromDrive(operation, token, mode) {
    assertActive(operation);
    return new Promise((resolve, reject) => {
      const pickerApi = window.google.picker;
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        operation.cancelReject = null;
        if (operation.picker) {
          try { operation.picker.setVisible(false); } catch (_) {}
          operation.picker = null;
        }
        callback(value);
      };
      const cancelError = () => makeError("DRIVE_CANCELLED", "Google Drive 選擇已取消。", { cancelled: true });
      operation.cancelReject = (error) => finish(reject, error || cancelError());

      try {
        const view = new pickerApi.DocsView(pickerApi.ViewId.DOCS)
          .setIncludeFolders(mode === "folder")
          .setMode(pickerApi.DocsViewMode.LIST);
        if (mode === "folder") view.setMimeTypes("application/vnd.google-apps.folder").setSelectFolderEnabled(true);
        else view.setMimeTypes(PICKER_MIME_TYPES);

        const builder = new pickerApi.PickerBuilder()
          .addView(view)
          .setOAuthToken(token)
          .setDeveloperKey(getConfig().apiKey)
          .setAppId(getConfig().appId)
          .setLocale("zh-TW")
          .setCallback((data) => {
            if (settled) return;
            if (!data || !data[pickerApi.Response.ACTION]) {
              finish(reject, makeError("DRIVE_PICKER_FAILED", "Google Picker 沒有回傳選取結果。"));
              return;
            }
            const action = data[pickerApi.Response.ACTION];
            if (action === pickerApi.Action.CANCEL) {
              finish(reject, cancelError());
              return;
            }
            if (pickerApi.Action.ERROR && action === pickerApi.Action.ERROR) {
              finish(reject, makeError("DRIVE_PICKER_FAILED", "Google Picker 回報載入或選取錯誤。請檢查網站來源、API 金鑰限制及瀏覽器設定。"));
              return;
            }
            // Picker may emit nonterminal notifications; wait for a selection or cancellation.
            if (action !== pickerApi.Action.PICKED) return;
            const documents = data[pickerApi.Response.DOCUMENTS];
            const selected = Array.isArray(documents) ? documents[0] : null;
            if (!selected || !selected.id) {
              finish(reject, makeError("DRIVE_PICKER_EMPTY", "Google Picker 沒有選取檔案或資料夾。"));
              return;
            }
            finish(resolve, selected);
          });

        if (typeof builder.setTitle === "function") builder.setTitle(mode === "folder" ? "選擇儲存資料夾：單擊資料夾名稱後按「選取」" : "選擇要匯入的 ZIP");

        if (pickerApi.Feature && pickerApi.Feature.SUPPORT_DRIVES && typeof builder.enableFeature === "function") {
          builder.enableFeature(pickerApi.Feature.SUPPORT_DRIVES);
        }
        operation.picker = builder.build();
        operation.picker.setVisible(true);
      } catch (_) {
        finish(reject, makeError("DRIVE_PICKER_FAILED", "無法開啟 Google Picker。"));
      }
    });
  }

  function parseJson(response) {
    return response.json().catch(() => ({}));
  }

  function awaitOperationOrCancel(operation, value) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, result) => {
        if (settled) return;
        settled = true;
        operation.cancelReject = null;
        callback(result);
      };
      operation.cancelReject = (error) => finish(reject, error || makeError("DRIVE_CANCELLED", "Google Drive 操作已取消。", { cancelled: true }));
      Promise.resolve(value).then(
        (result) => finish(resolve, result),
        (error) => finish(reject, error)
      );
    });
  }

  function httpError(response, context) {
    let code = "DRIVE_HTTP_" + response.status;
    let message = "Google Drive " + (context || "操作") + "失敗（HTTP " + response.status + "）。";
    if (response.status === 401) {
      code = "DRIVE_TOKEN_EXPIRED";
      message = "Google Drive 授權已過期；請再次按下 Drive 動作授權後重試。";
    } else if (response.status === 403) {
      code = "DRIVE_ACCESS_DENIED";
      message = "Google Drive 拒絕此操作；請確認檔案權限、API 設定與 Drive 儲存空間。";
    } else if (response.status === 404) {
      code = "DRIVE_FILE_NOT_FOUND";
      message = "Google Drive 檔案或上傳工作階段已不存在。";
    } else if (response.status === 429) {
      code = "DRIVE_RATE_LIMITED";
      message = "Google Drive 暫時限制請求；請稍後再試。";
    } else if (response.status >= 500) {
      code = "DRIVE_SERVER_ERROR";
      message = "Google Drive 暫時無法完成請求；請稍後重試。";
    }
    return makeError(code, message, { status: response.status, retryable: response.status === 429 || response.status >= 500 });
  }

  async function uploadErrorReason(response) {
    try {
      const body = await response.clone().json();
      const error = body && body.error;
      const details = [];
      if (error && Array.isArray(error.errors)) details.push(...error.errors);
      if (error && Array.isArray(error.details)) details.push(...error.details);
      const reason = details.map((item) => item && (item.reason || (item.metadata && item.metadata.reason)))
        .find((value) => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value));
      return reason || null;
    } catch (_) { return null; }
  }

  function isDriveRateLimitReason(reason) {
    return reason === "rateLimitExceeded" || reason === "userRateLimitExceeded";
  }

  function uploadSessionExpiredError(status, reason, context) {
    const detail = uploadReasonDetail(reason);
    return makeError(
      "DRIVE_UPLOAD_SESSION_EXPIRED",
      "Google Drive 在" + context + "回傳 HTTP " + status + "。Drive 指引要求 resumable upload 遇到此類 4xx 後重新建立工作階段；本次不會自動建立新檔。" + detail + "請先檢查 Drive，再清除待處理狀態後重試。",
      { status, retryable: false, possibleDuplicate: true, causeCode: reason || ("DRIVE_HTTP_" + status) }
    );
  }

  function uploadReasonDetail(reason) {
    if (reason === "storageQuotaExceeded") return " Google Drive 儲存空間已滿，請先釋出空間。";
    if (reason === "insufficientFilePermissions") return " Google Drive 拒絕寫入所選資料夾，請改選有新增檔案權限的位置。";
    return reason ? " Google 回報原因：" + reason + "。" : "";
  }

  async function fetchForOperation(operation, url, init, keepController) {
    assertActive(operation);
    const controller = new AbortController();
    operation.controller = controller;
    try {
      return await fetch(url, Object.assign({}, init || {}, { signal: controller.signal }));
    } catch (error) {
      if (operation.controller === controller) operation.controller = null;
      if (operation.cancelled || (error && error.name === "AbortError")) {
        throw makeError("DRIVE_CANCELLED", "Google Drive 操作已取消。", { cancelled: true });
      }
      throw makeError("DRIVE_NETWORK_ERROR", "網路連線中斷；目前的 Google Drive 狀態需要確認。", { retryable: true });
    } finally {
      if (!keepController && operation.controller === controller) operation.controller = null;
    }
  }

  async function getFileMetadata(operation, token, fileId) {
    const fields = "id,name,mimeType,size,capabilities(canDownload),webViewLink";
    const url = DRIVE_API + "/files/" + encodeURIComponent(fileId) + "?fields=" + encodeURIComponent(fields);
    const response = await fetchForOperation(operation, url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
    });
    if (!response.ok) throw httpError(response, "檔案資訊讀取");
    return parseJson(response);
  }

  async function createDestinationFolder(operation, token, parent, name) {
    const folderName = String(name || "").trim();
    if (!folderName || folderName.length > 255 || /[\u0000-\u001f]/.test(folderName)) {
      throw makeError("DRIVE_FOLDER_NAME_INVALID", "請輸入有效的資料夾名稱（最多 255 字）。");
    }
    let response;
    try {
      response = await fetchForOperation(operation, DRIVE_API + "/files?supportsAllDrives=true&fields=id%2Cname%2CmimeType", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder", parents: [parent.id] }),
      });
    } catch (error) {
      if (error && (error.code === "DRIVE_NETWORK_ERROR" || error.code === "DRIVE_CANCELLED")) {
        throw makeError("DRIVE_FOLDER_CREATE_UNCONFIRMED", "資料夾建立結果無法確認；請先檢查 Google Drive 再重試，避免重複建立。");
      }
      throw error;
    }
    if (!response.ok) throw httpError(response, "新增資料夾");
    const folder = await parseJson(response);
    if (!folder || !folder.id || folder.mimeType !== "application/vnd.google-apps.folder") {
      throw makeError("DRIVE_FOLDER_CREATE_UNCONFIRMED", "資料夾建立結果無法確認，請先檢查 Google Drive 再重試。");
    }
    return folder;
  }

  function validateZipMetadata(metadata) {
    if (!metadata || !metadata.id || !metadata.name) {
      throw makeError("DRIVE_FILE_METADATA_INVALID", "Google Drive 沒有提供有效的檔案資訊。請改用本機 ZIP 匯入。", { retryable: true });
    }
    if (/\.zip$/i.test(metadata.name) === false) {
      throw makeError("DRIVE_FILE_NOT_ZIP", "選取的檔名不是 ZIP；請選擇完整專案 .zip 檔。", { retryable: true });
    }
    if (String(metadata.mimeType || "").startsWith("application/vnd.google-apps.")) {
      throw makeError("DRIVE_UNSUPPORTED_FILE", "Google Workspace 文件不是可匯入的 ZIP 檔。", { retryable: true });
    }
    const mimeType = String(metadata.mimeType || "").toLowerCase();
    if (mimeType && mimeType !== "application/zip" && mimeType !== "application/x-zip-compressed" && mimeType !== "application/octet-stream") {
      throw makeError("DRIVE_FILE_NOT_ZIP", "Google Drive 檔案 MIME 類型不是 ZIP；請選擇 ZIP 檔。", { retryable: true });
    }
    if (metadata.capabilities && metadata.capabilities.canDownload === false) {
      throw makeError("DRIVE_DOWNLOAD_FORBIDDEN", "目前帳號沒有下載此 Google Drive 檔案的權限。", { retryable: true });
    }
    const size = Number(metadata.size);
    if (!Number.isSafeInteger(size) || size <= 0) {
      throw makeError("DRIVE_FILE_SIZE_UNKNOWN", "Google Drive 沒有提供有效檔案大小，無法安全下載此 ZIP。", { retryable: true });
    }
    if (size > MAX_ARCHIVE_BYTES) {
      throw makeError("ARCHIVE_SIZE_LIMIT", "ZIP 超過目前完整專案包上限 516 MiB。", { retryable: true, size });
    }
    return size;
  }

  async function downloadZipBytes(operation, token, metadata, size) {
    setOperationPhase(operation, "download", 0, size);
    const response = await fetchForOperation(operation, DRIVE_API + "/files/" + encodeURIComponent(metadata.id) + "?alt=media", {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
    }, true);
    const downloadController = operation.controller;
    try {
      if (!response.ok) throw httpError(response, "ZIP 下載");

      const bytes = new Uint8Array(size);
      let offset = 0;
      if (response.body && typeof response.body.getReader === "function") {
        const reader = response.body.getReader();
        try {
          while (true) {
            assertActive(operation);
            const result = await reader.read();
            if (result.done) break;
            const chunk = result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value);
            if (offset + chunk.byteLength > size) {
              try { await reader.cancel(); } catch (_) {}
              throw makeError("DRIVE_FILE_SIZE_MISMATCH", "下載的 ZIP 大小超過 Google Drive 檔案資訊；沒有匯入資料。", { retryable: true });
            }
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
            setOperationPhase(operation, "download", offset, size);
          }
        } catch (error) {
          if (operation.cancelled || (error && error.name === "AbortError")) {
            throw makeError("DRIVE_CANCELLED", "ZIP 下載已取消；本機專案尚未變更。", { cancelled: true });
          }
          if (error && error.code) throw error;
          throw makeError("DRIVE_NETWORK_ERROR", "ZIP 下載中斷；本機專案尚未變更。", { retryable: true });
        } finally {
          try { reader.releaseLock(); } catch (_) {}
        }
      } else {
        let buffer;
        try {
          buffer = await response.arrayBuffer();
        } catch (error) {
          if (operation.cancelled || (error && error.name === "AbortError")) {
            throw makeError("DRIVE_CANCELLED", "ZIP 下載已取消；本機專案尚未變更。", { cancelled: true });
          }
          throw makeError("DRIVE_NETWORK_ERROR", "ZIP 下載中斷；本機專案尚未變更。", { retryable: true });
        }
        if (buffer.byteLength !== size) {
          throw makeError("DRIVE_FILE_SIZE_MISMATCH", "下載 ZIP 的大小與 Google Drive 檔案資訊不一致；沒有匯入資料。", { retryable: true });
        }
        bytes.set(new Uint8Array(buffer));
        offset = buffer.byteLength;
        setOperationPhase(operation, "download", offset, size);
      }
      if (offset !== size) {
        throw makeError("DRIVE_FILE_SIZE_MISMATCH", "下載 ZIP 的大小與 Google Drive 檔案資訊不一致；沒有匯入資料。", { retryable: true });
      }
      return bytes;
    } finally {
      if (operation.controller === downloadController) operation.controller = null;
    }
  }

  async function importZip(options) {
    const operation = beginOperation("import", options || {});
    try {
      getConfig();
      setOperationPhase(operation, "authorize", 0, 0);
      const token = await requestToken(operation);
      setOperationPhase(operation, "pick-file", 0, 0);
      const selected = await pickFromDrive(operation, token, "file");
      if (!selected || !selected.id) throw makeError("DRIVE_PICKER_EMPTY", "Google Picker 沒有選取 ZIP 檔。", { retryable: true });
      setOperationPhase(operation, "file-metadata", 0, 0);
      const metadata = await getFileMetadata(operation, token, selected.id);
      const size = validateZipMetadata(metadata);
      const bytes = await downloadZipBytes(operation, token, metadata, size);
      assertActive(operation);
      return {
        bytes,
        name: metadata.name,
        mimeType: metadata.mimeType || "application/zip",
        size: bytes.byteLength,
      };
    } finally {
      endOperation(operation);
    }
  }

  function normalizeZipBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw makeError("DRIVE_EXPORT_BYTES_INVALID", "匯出需要完整專案 ZIP 的 Uint8Array bytes。", { retryable: true });
  }

  function normalizeZipName(value) {
    let name = String(value || "Storyboard").trim().replace(/[\\/\u0000-\u001f\u007f]/g, "_");
    if (!name) name = "Storyboard";
    if (!/\.zip$/i.test(name)) name += ".zip";
    return name;
  }

  function rangeNextOffset(rangeHeader, total) {
    if (!rangeHeader) return 0;
    const match = String(rangeHeader).match(/(?:bytes\s*=\s*)?\d+-(\d+)/i);
    if (!match) return 0;
    const offset = Number(match[1]) + 1;
    return Number.isSafeInteger(offset) && offset >= 0 && offset <= total ? offset : 0;
  }

  async function startResumableUpload(operation, token, pending) {
    const metadata = {
      name: pending.name,
      mimeType: "application/zip",
      parents: [pending.folderId],
    };
    const fields = "id,name,mimeType,size,webViewLink,parents";
    const url = DRIVE_UPLOAD_API + "?uploadType=resumable&supportsAllDrives=true&fields=" + encodeURIComponent(fields);
    setOperationPhase(operation, "upload-init", 0, pending.size);
    const response = await fetchForOperation(operation, url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "application/zip",
        "X-Upload-Content-Length": String(pending.size),
      },
      body: JSON.stringify(metadata),
    });
    if (!response.ok) {
      const reason = await uploadErrorReason(response);
      if (response.status === 429 || isDriveRateLimitReason(reason)) {
        throw makeError("DRIVE_RATE_LIMITED", "Google Drive 暫時限制上傳初始化；請稍候後重新開始匯出。" + (reason ? "（原因：" + reason + "）" : ""), {
          status: response.status,
          retryable: true,
          causeCode: reason || "rateLimitExceeded",
        });
      }
      const error = httpError(response, "上傳初始化");
      if (reason) {
        error.causeCode = reason;
        error.message += uploadReasonDetail(reason);
      }
      throw error;
    }
    const sessionUrl = response.headers.get("Location");
    let validSessionUrl = false;
    try {
      const parsedSessionUrl = new URL(sessionUrl);
      validSessionUrl = parsedSessionUrl.protocol === "https:" && parsedSessionUrl.hostname === "www.googleapis.com" && parsedSessionUrl.pathname.startsWith("/upload/drive/v3/files");
    } catch (_) {}
    if (!validSessionUrl) {
      throw makeError("DRIVE_UPLOAD_SESSION_INVALID", "Google Drive 沒有回傳有效的 resumable upload session。", { retryable: true });
    }
    pending.sessionUrl = sessionUrl;
    pending.state = "uploading";
  }

  async function queryUploadStatus(operation, pending) {
    const response = await fetchForOperation(operation, pending.sessionUrl, {
      method: "PUT",
      headers: { "Content-Range": "bytes */" + pending.size },
      body: new Uint8Array(0),
    });
    if (response.status === 200 || response.status === 201) {
      return { complete: true, metadata: await parseJson(response) };
    }
    if (response.status === 308) {
      return { complete: false, nextOffset: rangeNextOffset(response.headers.get("Range"), pending.size) };
    }
    if (response.status === 404) {
      pending.state = "expired";
      pending.expired = true;
      throw makeError(
        "DRIVE_UPLOAD_SESSION_EXPIRED",
        "Drive resumable session 已過期；不會自動重新建立檔案，避免在結果不確定時產生重複檔。",
        { retryable: false, possibleDuplicate: true }
      );
    }
    const reason = await uploadErrorReason(response);
    if (response.status === 429 || (response.status === 403 && isDriveRateLimitReason(reason))) {
      pending.state = "paused";
      throw makeError("DRIVE_RATE_LIMITED", "Google Drive 暫時限制上傳狀態查詢；請稍候再按「續傳／查詢」。" + (reason ? "（原因：" + reason + "）" : ""), {
        status: response.status,
        retryable: true,
        causeCode: reason || "rateLimitExceeded",
      });
    }
    if (response.status >= 400 && response.status < 500) {
      pending.state = "expired";
      pending.expired = true;
      throw uploadSessionExpiredError(response.status, reason, "上傳狀態查詢");
    }
    const error = httpError(response, "上傳狀態查詢");
    if (reason) error.message += "（原因：" + reason + "）";
    throw error;
  }

  function completeUpload(metadata, pending) {
    if (!metadata || !metadata.id) {
      pending.state = "result-unknown";
      throw makeError("DRIVE_UPLOAD_RESULT_UNKNOWN", "Drive 已回應上傳終態，但沒有回傳檔案 ID；請使用「續傳／查詢」確認，不要重新建立檔案。", { retryable: true, outcomeUnknown: true });
    }
    const actualSize = metadata.size !== undefined && metadata.size !== null && Number.isSafeInteger(Number(metadata.size))
      ? Number(metadata.size)
      : null;
    const mimeMatches = !metadata.mimeType || metadata.mimeType === "application/zip";
    const nameMatches = !metadata.name || metadata.name === pending.name;
    const sizeMatches = actualSize !== null && actualSize === pending.size;
    if (!mimeMatches || !nameMatches || (actualSize !== null && !sizeMatches)) {
      pendingUpload = null;
      throw makeError(
        "DRIVE_UPLOAD_METADATA_MISMATCH",
        "Drive 已建立檔案，但回傳的檔名、MIME 或大小與 ZIP 不一致；請在 Drive 檢查該檔案後再決定是否重試。",
        { uploaded: true, fileId: metadata.id }
      );
    }
    pendingUpload = null;
    return {
      id: metadata.id,
      name: metadata.name || pending.name,
      mimeType: metadata.mimeType || "application/zip",
      size: actualSize,
      sizeMatches,
      verification: sizeMatches ? "size-confirmed" : "size-unavailable",
      webViewLink: metadata.webViewLink || ("https://drive.google.com/file/d/" + encodeURIComponent(metadata.id) + "/view"),
      folderId: pending.folderId,
      folderName: pending.folderName || null,
    };
  }

  async function uploadFromOffset(operation, pending, startOffset) {
    let start = startOffset;
    let zeroProgressCount = 0;
    setOperationPhase(operation, "upload", start, pending.size);
    while (start < pending.size) {
      assertActive(operation);
      const end = Math.min(start + UPLOAD_CHUNK_BYTES, pending.size);
      let response;
      try {
        response = await fetchForOperation(operation, pending.sessionUrl, {
          method: "PUT",
          headers: { "Content-Range": "bytes " + start + "-" + (end - 1) + "/" + pending.size },
          body: pending.bytes.subarray(start, end),
        });
      } catch (error) {
        if (operation.cancelled || (error && error.cancelled)) {
          pending.state = "paused";
          throw makeError("DRIVE_CANCELLED", "上傳已停止；Drive 可能已收到部分 ZIP bytes。按「續傳／查詢」可確認遠端進度。", { cancelled: true, resumable: true });
        }
        if (!error || (error.code !== "DRIVE_NETWORK_ERROR" && error.status < 500)) throw error;
        try {
          const status = await queryUploadStatus(operation, pending);
          if (status.complete) return completeUpload(status.metadata, pending);
          start = status.nextOffset;
          pending.state = "paused";
          zeroProgressCount = start === 0 ? zeroProgressCount + 1 : 0;
          setOperationPhase(operation, "upload", start, pending.size);
          if (zeroProgressCount > 3) {
            pending.state = "result-unknown";
            throw makeError("DRIVE_UPLOAD_RESULT_UNKNOWN", "無法確認 Drive 已接收的 bytes；請按「續傳／查詢」重試狀態查詢，不要重新建立檔案。", { retryable: true, outcomeUnknown: true });
          }
          continue;
        } catch (queryError) {
          if (queryError && queryError.code === "DRIVE_UPLOAD_SESSION_EXPIRED") throw queryError;
          pending.state = "result-unknown";
          if (queryError && queryError.code === "DRIVE_CANCELLED") throw queryError;
          throw makeError("DRIVE_UPLOAD_RESULT_UNKNOWN", "上傳連線中斷，Drive 的接收位置尚未確認；請按「續傳／查詢」，不要重新建立檔案。", { retryable: true, outcomeUnknown: true });
        }
      }

      if (response.status === 200 || response.status === 201) {
        const metadata = await parseJson(response);
        return completeUpload(metadata, pending);
      }
      if (response.status === 308) {
        const nextOffset = rangeNextOffset(response.headers.get("Range"), pending.size);
        if (nextOffset <= start) zeroProgressCount += 1;
        else zeroProgressCount = 0;
        start = nextOffset;
        pending.state = "uploading";
        setOperationPhase(operation, "upload", start, pending.size);
        if (zeroProgressCount > 3) {
          pending.state = "result-unknown";
          throw makeError("DRIVE_UPLOAD_RESULT_UNKNOWN", "Drive 尚未確認上傳進度；請按「續傳／查詢」確認，不要重新建立檔案。", { retryable: true, outcomeUnknown: true });
        }
        continue;
      }
      const uploadReason = response.status === 403 || response.status === 429
        ? await uploadErrorReason(response)
        : null;
      if (response.status === 429 || (response.status === 403 && isDriveRateLimitReason(uploadReason))) {
        pending.state = "paused";
        throw makeError("DRIVE_RATE_LIMITED", "Google Drive 暫時限制 ZIP 上傳；請稍候，再按「續傳／查詢」確認遠端進度後重試。" + (uploadReason ? "（原因：" + uploadReason + "）" : ""), {
          status: response.status,
          retryable: true,
          causeCode: uploadReason || "rateLimitExceeded",
        });
      }
      if (response.status >= 400 && response.status < 500) {
        pending.state = "expired";
        pending.expired = true;
        throw uploadSessionExpiredError(response.status, uploadReason || await uploadErrorReason(response), "ZIP 上傳");
      }
      if (response.status >= 500) {
        try {
          const status = await queryUploadStatus(operation, pending);
          if (status.complete) return completeUpload(status.metadata, pending);
          start = status.nextOffset;
          pending.state = "paused";
          setOperationPhase(operation, "upload", start, pending.size);
          continue;
        } catch (queryError) {
          if (queryError && queryError.code === "DRIVE_UPLOAD_SESSION_EXPIRED") throw queryError;
          pending.state = "result-unknown";
          throw makeError("DRIVE_UPLOAD_RESULT_UNKNOWN", "Drive 暫時錯誤，遠端接收位置尚未確認；請按「續傳／查詢」，不要重新建立檔案。", { retryable: true, outcomeUnknown: true });
        }
      }
      const uploadError = httpError(response, "ZIP 上傳");
      const reason = await uploadErrorReason(response);
      pending.state = "result-unknown";
      throw makeError(
        "DRIVE_UPLOAD_RESULT_UNKNOWN",
        "Drive 回傳 " + uploadError.code + (reason ? "（原因：" + reason + "）" : "") + "；上傳 session 的實際接收位置尚未確認。請按「續傳／查詢」，不要重新建立檔案。",
        { retryable: true, outcomeUnknown: true, causeCode: uploadError.code, status: response.status }
      );
    }
    const status = await queryUploadStatus(operation, pending);
    if (status.complete) return completeUpload(status.metadata, pending);
    pending.state = "result-unknown";
    throw makeError("DRIVE_UPLOAD_RESULT_UNKNOWN", "Drive 尚未回報 ZIP 上傳完成；請按「續傳／查詢」確認。", { retryable: true, outcomeUnknown: true });
  }

  async function exportZip(bytesValue, nameValue, options) {
    const operation = beginOperation("export", options || {});
    try {
      getConfig();
      if (pendingUpload) {
        throw makeError("DRIVE_UPLOAD_PENDING", "前一次上傳尚未確認；請先按「續傳／查詢」，不要建立第二份 ZIP。", { retryable: true, pending: true });
      }
      const lazySource = typeof bytesValue === "function" || !!(bytesValue && typeof bytesValue.then === "function");
      let token = null;
      let exportedValue = null;
      if (lazySource) {
        setOperationPhase(operation, "authorize", 0, 0);
        token = await requestToken(operation);
        assertActive(operation);
        setOperationPhase(operation, "build-package", 0, 0);
        const sourcePromise = typeof bytesValue === "function"
          ? Promise.resolve().then(() => bytesValue())
          : bytesValue;
        exportedValue = await awaitOperationOrCancel(operation, sourcePromise);
        assertActive(operation);
      }
      const archiveBytes = exportedValue && typeof exportedValue === "object" && !(exportedValue instanceof Uint8Array) && !(exportedValue instanceof ArrayBuffer) && !ArrayBuffer.isView(exportedValue)
        ? exportedValue.archiveBytes
        : exportedValue;
      const bytes = normalizeZipBytes(lazySource ? archiveBytes : bytesValue);
      if (!bytes.byteLength) throw makeError("DRIVE_EXPORT_BYTES_INVALID", "ZIP bytes 為空。", { retryable: true });
      if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw makeError("ARCHIVE_SIZE_LIMIT", "ZIP 超過目前完整專案包上限 516 MiB。", { retryable: true });
      const sourceName = nameValue || (exportedValue && typeof exportedValue === "object" && exportedValue.fileName);
      const name = normalizeZipName(sourceName);
      if (!token) {
        setOperationPhase(operation, "authorize", 0, bytes.byteLength);
        token = await requestToken(operation);
      }
      setOperationPhase(operation, "pick-folder", 0, bytes.byteLength);
      let folder = await pickFromDrive(operation, token, "folder");
      if (!folder || !folder.id || folder.mimeType !== "application/vnd.google-apps.folder") {
        throw makeError("DRIVE_FOLDER_REQUIRED", "請在 Google Picker 選擇目的資料夾。", { retryable: true });
      }
      if (options && typeof options.chooseDestination === "function") {
        const choice = await awaitOperationOrCancel(operation, options.chooseDestination({ id: folder.id, name: folder.name || "所選資料夾" }));
        if (!choice) throw makeError("DRIVE_CANCELLED", "已取消 Google Drive 匯出。", { cancelled: true });
        if (choice.createFolderName != null) folder = await createDestinationFolder(operation, token, folder, choice.createFolderName);
      }
      const pending = {
        bytes,
        size: bytes.byteLength,
        name,
        folderId: folder.id,
        folderName: folder.name || null,
        sessionUrl: null,
        state: "initializing",
        expired: false,
      };
      pendingUpload = pending;
      try {
        await startResumableUpload(operation, token, pending);
      } catch (error) {
        pendingUpload = null;
        throw error;
      }
      return await uploadFromOffset(operation, pending, 0);
    } finally {
      endOperation(operation);
    }
  }

  async function resumeUpload(options) {
    const operation = beginOperation("resume", options || {});
    const pending = pendingUpload;
    try {
      getConfig();
      if (!pending || !pending.sessionUrl) {
        throw makeError("DRIVE_NO_PENDING_UPLOAD", "目前沒有可續傳的 Google Drive 上傳。", { retryable: false });
      }
      if (pending.expired) {
        throw makeError("DRIVE_UPLOAD_SESSION_EXPIRED", "此 Drive resumable session 已過期；不會自動建立新檔，避免產生重複 ZIP。", { retryable: false, possibleDuplicate: true });
      }
      setOperationPhase(operation, "reauthorize", 0, pending.size);
      await requestToken(operation);
      setOperationPhase(operation, "upload-status", 0, pending.size);
      const status = await queryUploadStatus(operation, pending);
      if (status.complete) return completeUpload(status.metadata, pending);
      pending.state = "uploading";
      return await uploadFromOffset(operation, pending, status.nextOffset);
    } finally {
      endOperation(operation);
    }
  }

  function getStatus() {
    let configured = false;
    let configError = null;
    try { getConfig(); configured = true; } catch (error) { configError = error; }
    return {
      configured,
      ready: !!(window.google && window.google.accounts && window.google.accounts.oauth2 && window.google.picker),
      loading: !!libraryPromise,
      error: libraryError ? { code: libraryError.code, message: libraryError.message } : null,
      configError: configError ? { code: configError.code, message: configError.message } : null,
      currentOperation: currentOperation ? { kind: currentOperation.kind, phase: currentOperation.phase } : null,
      pendingUpload: pendingUpload ? {
        name: pendingUpload.name,
        size: pendingUpload.size,
        folderName: pendingUpload.folderName,
        state: pendingUpload.state,
        canResume: !!pendingUpload.sessionUrl && !pendingUpload.expired,
        possibleDuplicate: !!pendingUpload.sessionUrl,
      } : null,
    };
  }

  function discardPendingUpload(options) {
    if (!pendingUpload) return false;
    if (pendingUpload.sessionUrl) {
      if (!options || options.confirmPossibleDuplicate !== true) {
        throw makeError("DRIVE_DUPLICATE_CONFIRMATION_REQUIRED", "結果尚未確認；若清除暫存後重新上傳，Drive 可能出現重複檔。請明確確認後再清除。", { possibleDuplicate: true });
      }
    }
    pendingUpload = null;
    return true;
  }

  const api = {
    importZip,
    exportZip,
    resumeUpload,
    cancelCurrent: () => cancelOperation(currentOperation),
    getStatus,
    discardPendingUpload,
    isConfigured: () => {
      try { getConfig(); return true; } catch (_) { return false; }
    },
  };

  Object.defineProperty(api, "ready", {
    enumerable: true,
    get() {
      if (!api.isConfigured()) return Promise.resolve(false);
      return ensureLibraries().then(() => true).catch(() => false);
    },
  });

  window.KinoDrive = api;

  if (api.isConfigured()) {
    ensureLibraries().catch(() => {});
  }
})();
