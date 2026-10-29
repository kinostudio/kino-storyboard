/*
 * StoryModel owns the complete committed canonical Project. It does not touch
 * IndexedDB or legacy storage until initialize() is explicitly called.
 */
(function attachStoryModel(root, factory) {
  "use strict";
  const dependencies = typeof module === "object" && module && module.exports
    ? {
      schema: require("./project-schema.js"),
      bootstrap: require("./project-bootstrap.js"),
      migrations: require("./project-migrations.js"),
      storage: require("./storage-contract.js"),
      repository: require("./idb-repository.js"),
      bridge: require("./project-bridge.js"),
      history: require("./history-engine.js"),
      photoImport: require("./photo-import.js"),
      projectPackage: require("./project-package.js"),
      zipAdapter: require("./zip-adapter.js"),
      packageCopy: require("./package-copy.js")
    }
    : {
      schema: root.DirectorStoryboardProjectSchema,
      bootstrap: root.DirectorStoryboardProjectBootstrap,
      migrations: root.DirectorStoryboardProjectMigrations,
      storage: root.DirectorStoryboardStorageContract,
      repository: root.DirectorStoryboardRepository,
      bridge: root.StoryProjectBridge,
      history: root.DirectorStoryboardHistoryEngine,
      photoImport: root.DirectorStoryboardPhotoImport,
      projectPackage: root.DirectorStoryboardProjectPackage,
      zipAdapter: root.DirectorStoryboardZipAdapter,
      packageCopy: root.DirectorStoryboardPackageCopy
    };
  const model = factory(root, dependencies);
  if (root) root.StoryModel = model;
  if (typeof module === "object" && module && module.exports) module.exports = model;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function createStoryModel(root, deps) {
  "use strict";

  const PRODUCTION_DB_NAME = "director-storyboard-projects-v1";
  const LEASE_RECOVERY_INTERVAL_MS = 1000;
  let instanceSequence = 0;

  function makeError(code, message, cause) {
    const error = new Error(message || code || "StoryModel error");
    error.name = "StoryModelError";
    error.code = code || "MODEL_ERROR";
    if (cause !== undefined) error.cause = cause;
    return error;
  }

  function normalizeError(value, fallbackCode, fallbackMessage) {
    if (value && typeof value.code === "string") return value;
    return makeError(fallbackCode || "MODEL_ERROR", value && value.message ? value.message : fallbackMessage, value);
  }

  function throwIfPackageAborted(signal) {
    if (!signal || signal.aborted !== true) return;
    const error = makeError("ABORT_ERR", "完整專案包作業已取消。");
    error.name = "AbortError";
    throw error;
  }

  function errorInfo(value) {
    const error = normalizeError(value, "MODEL_ERROR", "發生未知錯誤。");
    return { code: error.code, message: error.message };
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function cloneJson(value) {
    if (deps.schema && typeof deps.schema.cloneJson === "function") return deps.schema.cloneJson(value);
    return JSON.parse(JSON.stringify(value));
  }

  function captureJson(value, seen) {
    if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw makeError("INVALID_ARGUMENT", "命令參數只能包含有限數字。");
      return value;
    }
    if (typeof value !== "object") throw makeError("INVALID_ARGUMENT", "命令參數必須是 JSON 資料。");
    const visited = seen || new Set();
    if (visited.has(value)) throw makeError("INVALID_ARGUMENT", "命令參數不可包含循環參照。");
    visited.add(value);
    let result;
    if (Array.isArray(value)) {
      result = value.map(function (item) { return captureJson(item, visited); });
    } else {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) throw makeError("INVALID_ARGUMENT", "命令參數只能包含一般物件。");
      result = {};
      Object.keys(value).forEach(function (key) { result[key] = captureJson(value[key], visited); });
    }
    visited.delete(value);
    return result;
  }

  function safeJson(value) {
    if (value === undefined) return null;
    if (Array.isArray(value)) return value.map(safeJson);
    if (isRecord(value)) {
      const result = {};
      Object.keys(value).forEach(function (key) { result[key] = safeJson(value[key]); });
      return result;
    }
    return value;
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    return "{" + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ":" + stableStringify(value[key]);
    }).join(",") + "}";
  }

  function randomToken(prefix) {
    let random = "";
    try {
      if (root && root.crypto && typeof root.crypto.randomUUID === "function") random = root.crypto.randomUUID();
    } catch (_) { random = ""; }
    if (!random) {
      instanceSequence += 1;
      random = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + instanceSequence.toString(36);
    }
    return (prefix ? prefix + "-" : "") + random;
  }

  function validIso(value) {
    return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
  }

  function makeDemoLegacy() {
    const chapters = [
      { id: "chapter-opening", title: "室內泳池・清晨" },
      { id: "chapter-water", title: "泳池水下・晨間" },
      { id: "chapter-closing", title: "室內泳池・閉館前" }
    ];
    const shots = [
      { id: "shot-001", chapterId: chapters[0].id, no: "01-001", title: "光落在水面", visual: "清晨第一道光越過窗框，在泳池水面上慢慢展開。", script: "", sound: "水循環的低鳴，遠處的腳步聲。", move: "固定，緩慢推近", tags: "清晨、空間", duration: 8, art: "pool" },
      { id: "shot-002", chapterId: chapters[0].id, no: "01-002", title: "第一位泳客", visual: "泳客把毛巾放在長椅上，停一會兒才走向池邊。", script: "旁白：每天，城市醒來以前，這裡先亮起燈。", sound: "毛巾摩擦、室內殘響。", move: "中景，側向跟拍", tags: "人物、準備", duration: 12, art: "swimmer" },
      { id: "shot-003", chapterId: chapters[0].id, no: "01-003", title: "池畔的刻度", visual: "水線、深度標示與扶手構成一條安靜的水平線。", script: "", sound: "水滴落下。", move: "低角度橫移", tags: "細節、場景", duration: 7, art: "architecture" },
      { id: "shot-004", chapterId: chapters[1].id, no: "02-001", title: "入水", visual: "手扶池邊，腳尖試探水溫，然後整個人沉入水裡。", script: "", sound: "入水聲轉為水下的靜音。", move: "近景，跟隨入水", tags: "動作、水下", duration: 10, art: "swimmer" },
      { id: "shot-005", chapterId: chapters[1].id, no: "02-002", title: "水下的呼吸", visual: "水面下的光斑隨呼吸起伏，氣泡向上散開。", script: "旁白：每一次呼吸，都把時間帶回身體裡。", sound: "水下氣泡與呼吸。", move: "水下穩定器，緩慢平移", tags: "水下、旁白", duration: 14, art: "water" },
      { id: "shot-006", chapterId: chapters[1].id, no: "02-003", title: "來回之間", visual: "泳者在兩端折返，鏡頭保留完整泳道與節奏。", script: "", sound: "規律划水聲。", move: "長焦固定，等待人物進出畫面", tags: "泳道、節奏", duration: 18, art: "pool" },
      { id: "shot-007", chapterId: chapters[2].id, no: "03-001", title: "夕陽穿窗", visual: "傍晚的斜光映在濕潤地面，泳池逐漸安靜。", script: "", sound: "最後一輪水聲與遠處的回音。", move: "廣角慢慢後退", tags: "黃昏、空景", duration: 9, art: "sunset" },
      { id: "shot-008", chapterId: chapters[2].id, no: "03-002", title: "收起浮板", visual: "工作人員把浮板一片一片掛回牆面。", script: "旁白：有人離開以後，空間仍記得他們的動作。", sound: "塑膠浮板輕碰牆面。", move: "中景，緩慢推近", tags: "工作、收尾", duration: 11, art: "architecture" },
      { id: "shot-009", chapterId: chapters[2].id, no: "03-003", title: "最後一盞燈", visual: "門闔上，水面留下窗外最後一抹暖色。", script: "", sound: "門鎖聲後保留幾秒室內底噪。", move: "固定遠景", tags: "結尾、空間", duration: 8, art: "sunset" }
    ];
    const days = [
      { id: "day-2026-11-03", date: "2026-11-03", title: "第一天・清晨", start: "05:30" },
      { id: "day-2026-11-04", date: "2026-11-04", title: "第二天・閉館前", start: "16:00" }
    ];
    const entries = [
      { id: "entry-001", dayId: days[0].id, type: "shot", shotId: shots[0].id, title: shots[0].title, minutes: 20, status: "待拍", notes: "先拍無人空景，注意窗光變化。", timingMode: "auto", startTime: null, endTime: null, endNextDay: false },
      { id: "entry-002", dayId: days[0].id, type: "shot", shotId: shots[1].id, title: shots[1].title, minutes: 35, status: "待拍", notes: "確認泳客肖像同意。", timingMode: "auto", startTime: null, endTime: null, endNextDay: false },
      { id: "entry-break-001", dayId: days[0].id, type: "break", shotId: null, title: "休息與換景", minutes: 15, status: "待拍", notes: "", timingMode: "auto", startTime: null, endTime: null, endNextDay: false },
      { id: "entry-003", dayId: days[0].id, type: "shot", shotId: shots[2].id, title: shots[2].title, minutes: 25, status: "待拍", notes: "補池畔標示細節。", timingMode: "auto", startTime: null, endTime: null, endNextDay: false },
      { id: "entry-004", dayId: days[1].id, type: "shot", shotId: shots[6].id, title: shots[6].title, minutes: 30, status: "待拍", notes: "預留夕陽時段。", timingMode: "auto", startTime: null, endTime: null, endNextDay: false }
    ];
    return { revision: 0, title: "光落下的地方", aspectRatio: "16:9", chapters: chapters, shots: shots, days: days, entries: entries };
  }

  function createModel() {
    if (!deps.schema || !deps.bootstrap || !deps.migrations || !deps.storage || !deps.repository || !deps.bridge || !deps.history) {
      throw makeError("MODEL_DEPENDENCY_MISSING", "Model 需要 schema、bootstrap、migration、repository、project bridge 與 history engine。請檢查 script 順序。");
    }

    const ownerToken = randomToken("story-model-owner");
    const dataSubscribers = new Set();
    const lifecycleSubscribers = new Set();
    const ownedLeases = new Set();
    let historyState = null;
    let historyEntries = [];
    let historyReady = false;
    let historyFailure = null;
    const queue = [];
    let options = null;
    let repository = null;
    let initFlight = null;
    let initialized = false;
    let modelClosed = false;
    let projectGeneration = 0;
    let activationPending = false;
    let currentProject = null;
    let currentLeaseValid = false;
    let selectedProjectId = null;
    let projects = [];
    let migrationProject = null;
    let migrationPreview = null;
    let migrationReport = null;
    let migrationReturnPhase = null;
    let legacySourceRaw = null;
    let legacySourceKey = deps.storage.LEGACY_STORAGE_KEY;
    let migrationConfirmPending = false;
    let paused = false;
    let pumping = false;
    let heartbeatTimer = null;
    let heartbeatPromise = null;
    let foregroundPromise = null;
    let leaseRecovery = null;
    let postCommitLeaseLoss = null;
    let activeCommitItem = null;
    let leaseMs = 15000;
    const leaseOperationChains = new Map();
    const leaseClaimGenerations = new Map();
    const leaseActivities = new Set();
    let handlersInstalled = false;
    let draftsSnapshot = [];
    let lastSaveError = null;
    let lifecycle = {
      phase: "opening",
      pendingCount: 0,
      writable: false,
      committedRevision: null,
      selectedProjectId: null,
      projects: [],
      error: null,
      readOnlyReason: null,
      migrationReport: null,
      migrationPreview: null,
      sourceRaw: null,
      rescueAvailable: false,
      saveStatus: "尚未初始化"
    };

    function getNowIso() {
      let value;
      if (options && typeof options.now === "function") value = options.now();
      else value = new Date().toISOString();
      if (value instanceof Date) value = value.toISOString();
      if (typeof value === "number") value = new Date(value).toISOString();
      if (!validIso(value)) throw makeError("CLOCK_INVALID", "Project 時間必須是標準 UTC ISO 時間。");
      return value;
    }

    function makeUniqueId(kind, project) {
      const reserved = new Set();
      if (project) {
        ["scenes", "shots", "shootingDays", "scheduleEntries", "productionTasks", "assets", "drawings"].forEach(function (key) {
          (project[key] || []).forEach(function (item) { if (item && typeof item.id === "string") reserved.add(item.id); });
        });
        (project.drawings || []).forEach(function (drawing) {
          (drawing.layers || []).forEach(function (layer) {
            if (layer && typeof layer.id === "string") reserved.add(layer.id);
            (layer && layer.strokes || []).forEach(function (stroke) { if (stroke && typeof stroke.id === "string") reserved.add(stroke.id); });
          });
        });
      }
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const candidate = randomToken(kind || "item");
        if (!reserved.has(candidate)) {
          reserved.add(candidate);
          return candidate;
        }
      }
      throw makeError("ID_GENERATION_FAILED", "無法產生唯一 ID。");
    }

    function photoImportService() {
      return deps.photoImport || (root && root.DirectorStoryboardPhotoImport) || null;
    }

    function getBlobConstructor(photoOptions) {
      const configuredOptions = photoOptions || options && options.photoImportOptions;
      const configured = configuredOptions && configuredOptions.apis;
      return configured && configured.Blob ? configured.Blob : root && root.Blob;
    }

    function getAssetCrypto(photoOptions) {
      const configuredOptions = photoOptions || options && options.photoImportOptions;
      const configured = configuredOptions && configuredOptions.apis;
      return configuredOptions && configuredOptions.crypto || options && options.crypto || configured && configured.crypto || root && root.crypto || null;
    }

    async function digestStoredBlob(blob, metadata, photoOptions) {
      const BlobCtor = getBlobConstructor(photoOptions);
      const prototype = BlobCtor && BlobCtor.prototype;
      const sizeDescriptor = prototype && Object.getOwnPropertyDescriptor(prototype, "size");
      const nativeArrayBuffer = prototype && prototype.arrayBuffer;
      if (!sizeDescriptor || typeof sizeDescriptor.get !== "function" || typeof nativeArrayBuffer !== "function") {
        throw makeError("ASSET_READ_UNSUPPORTED", "目前環境無法安全驗證原生 Asset Blob。");
      }
      let size;
      let buffer;
      try {
        size = sizeDescriptor.get.call(blob);
        buffer = await nativeArrayBuffer.call(blob);
      } catch (cause) {
        throw makeError("CORRUPT_ASSET", "Asset 原圖不是可安全讀取的原生 Blob。", cause);
      }
      if (!Number.isSafeInteger(size) || !(buffer instanceof ArrayBuffer) || buffer.byteLength !== size) {
        throw makeError("CORRUPT_ASSET", "Asset 原圖大小或 bytes 無效：" + metadata.id + "。");
      }
      if (size !== metadata.byteLength) {
        throw makeError("ASSET_SIZE_MISMATCH", "Asset 原圖大小與 Project metadata 不符：" + metadata.id + "。");
      }
      const cryptoApi = getAssetCrypto(photoOptions);
      if (!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.subtle.digest !== "function") {
        throw makeError("CRYPTO_UNAVAILABLE", "Web Crypto SHA-256 不可用，無法確認照片 Asset 完整性。");
      }
      let digest;
      try { digest = await cryptoApi.subtle.digest("SHA-256", buffer); }
      catch (cause) { throw makeError("ASSET_HASH_FAILED", "計算 Asset 原圖 SHA-256 失敗：" + metadata.id + "。", cause); }
      const hashBytes = new Uint8Array(digest);
      if (hashBytes.byteLength !== 32) throw makeError("ASSET_HASH_FAILED", "SHA-256 回傳結果長度無效。");
      let hash = "";
      for (let index = 0; index < hashBytes.length; index += 1) hash += hashBytes[index].toString(16).padStart(2, "0");
      if (hash !== metadata.sha256) throw makeError("ASSET_HASH_MISMATCH", "Asset 原圖 SHA-256 與 Project metadata 不符：" + metadata.id + "。");
      return { size: size, sha256: hash };
    }

    async function loadVerifiedAsset(project, metadata, photoOptions) {
      if (metadata.state !== "available") throw makeError("ASSET_MISSING", "Asset 尚未標記為可用，不能作為可編輯照片載入：" + metadata.id + "。");
      if (!repository || typeof repository.loadAsset !== "function") {
        throw makeError("ASSET_LOAD_UNSUPPORTED", "repository 未提供可驗證的 Asset 讀取介面。");
      }
      const record = await repository.loadAsset(project.projectId, metadata.id);
      if (!record) throw makeError("ASSET_MISSING", "Project metadata 存在，但原圖 Blob 不存在：" + metadata.id + "。");
      if (!isRecord(record) || record.projectId !== project.projectId || record.id !== metadata.id || !isRecord(record.metadata)) {
        throw makeError("CORRUPT_ASSET", "assets store 的 Project／Asset identity 無效：" + metadata.id + "。");
      }
      if (stableStringify(record.metadata) !== stableStringify(metadata)) {
        throw makeError("ASSET_METADATA_MISMATCH", "Asset row metadata 與目前 Project 不一致：" + metadata.id + "。");
      }
      const blob = record.blob;
      await digestStoredBlob(blob, metadata, photoOptions);
      return {
        projectId: project.projectId,
        id: metadata.id,
        metadata: cloneJson(metadata),
        originalBlob: blob,
        thumbnailBlob: null,
        thumbnailStatus: metadata.thumbnail ? "rebuild_pending" : "not_generated"
      };
    }

    async function verifyExistingPhoto(project, metadata, photoOptions) {
      if (metadata.role !== "photoOriginal" || metadata.state !== "available") {
        throw makeError("ASSET_MISSING", "相同 hash 的既有照片 Asset 尚未可用，不能建立重複 Asset：" + metadata.id + "。");
      }
      await loadVerifiedAsset(project, metadata, photoOptions);
    }

    function reportPhotoProgress(item, update) {
      const callback = item && item.onProgress;
      if (typeof callback !== "function") return;
      try { callback(Object.assign({ type: item.type, shotId: item.shotId }, update || {})); }
      catch (_) { /* UI progress callbacks do not participate in persistence. */ }
    }

    function currentSaveStatus() {
      if (paused) return "尚未儲存：" + (lastSaveError ? lastSaveError.message : "保存失敗，尚有命令待處理");
      if (queue.length > 0 || pumping) return "正在儲存";
      if (!currentProject) {
        if (lifecycle.phase === "opening") return "正在讀取本機專案";
        if (lifecycle.phase === "error") return "尚未儲存：" + (lifecycle.error ? lifecycle.error.message : "讀取失敗");
        return "尚未選擇專案";
      }
      if (!currentLeaseValid || lifecycle.phase === "read_only") return "唯讀：" + (lifecycle.readOnlyReason || "目前沒有編輯權");
      return "已儲存本機專案（revision " + currentProject.revision + "）";
    }

    function lifecycleSnapshot() {
      const snapshot = {
        phase: lifecycle.phase,
        pendingCount: queue.length,
        writable: Boolean(currentLeaseValid && !paused && lifecycle.phase !== "read_only" && !activationPending),
        committedRevision: currentProject ? currentProject.revision : null,
        selectedProjectId: selectedProjectId,
        projects: cloneJson(projects),
        error: lifecycle.error ? { code: lifecycle.error.code, message: lifecycle.error.message } : null,
        readOnlyReason: lifecycle.readOnlyReason || null,
        migrationReport: migrationReport ? cloneJson(migrationReport) : null,
        migrationPreview: migrationPreview ? cloneJson(migrationPreview) : null,
        migrationReturnPhase: migrationReturnPhase,
        sourceRaw: legacySourceRaw,
        rescueAvailable: queue.length > 0 || legacySourceRaw !== null || hasDrafts(),
        saveStatus: currentSaveStatus()
      };
      return snapshot;
    }

    function callLifecycleSubscribers() {
      const snapshot = lifecycleSnapshot();
      lifecycle = Object.assign({}, lifecycle, {
        pendingCount: snapshot.pendingCount,
        writable: snapshot.writable,
        committedRevision: snapshot.committedRevision,
        selectedProjectId: snapshot.selectedProjectId,
        projects: snapshot.projects,
        rescueAvailable: snapshot.rescueAvailable,
        saveStatus: snapshot.saveStatus
      });
      lifecycleSubscribers.forEach(function (subscriber) {
        try { subscriber(cloneJson(snapshot)); }
        catch (error) { reportSubscriberError("lifecycle", error); }
      });
    }

    function setLifecycle(patch) {
      const update = patch || {};
      Object.keys(update).forEach(function (key) {
        if (key === "error") lifecycle.error = update.error ? errorInfo(update.error) : null;
        else lifecycle[key] = update[key];
      });
      callLifecycleSubscribers();
    }

    function getSetTimeout() {
      return options && options.setTimeout
        ? options.setTimeout
        : root && root.setTimeout
          ? root.setTimeout.bind(root)
          : setTimeout;
    }

    function getClearTimeout() {
      return options && options.clearTimeout
        ? options.clearTimeout
        : root && root.clearTimeout
          ? root.clearTimeout.bind(root)
          : clearTimeout;
    }

    function cancelLeaseRecovery() {
      const recovery = leaseRecovery;
      leaseRecovery = null;
      if (recovery && recovery.timer !== null) {
        try { getClearTimeout()(recovery.timer); } catch (_) { /* best effort */ }
      }
    }

    function beginProjectOperation() {
      cancelLeaseRecovery();
      projectGeneration += 1;
      return projectGeneration;
    }

    function isCurrentGeneration(generation) {
      return !modelClosed && generation === projectGeneration;
    }

    function serializeLeaseOperation(projectId, operation) {
      const previous = leaseOperationChains.get(projectId) || Promise.resolve();
      const current = previous.catch(function () {}).then(operation);
      leaseOperationChains.set(projectId, current);
      current.finally(function () {
        if (leaseOperationChains.get(projectId) === current) leaseOperationChains.delete(projectId);
      }).catch(function () {});
      return current;
    }

    function trackLeaseActivity(activity) {
      leaseActivities.add(activity);
      activity.finally(function () { leaseActivities.delete(activity); }).catch(function () {});
      return activity;
    }

    async function waitForLeaseActivities() {
      while (leaseActivities.size > 0 || leaseOperationChains.size > 0) {
        const pending = Array.from(leaseActivities).concat(Array.from(leaseOperationChains.values()));
        if (!pending.length) return;
        await Promise.allSettled(pending);
      }
    }

    async function claimLeaseForGeneration(projectId, generation) {
      return serializeLeaseOperation(projectId, async function () {
        if (!isCurrentGeneration(generation)) return { stale: true };
        const priorGeneration = leaseClaimGenerations.get(projectId);
        const hadActiveLease = ownedLeases.has(projectId) && currentProject &&
          currentProject.projectId === projectId && currentLeaseValid;
        try {
          await repository.claimLease(projectId);
        } catch (error) {
          return { error: error };
        }
        if (!isCurrentGeneration(generation)) {
          // releaseLease is owner-token checked by the repository; serialize it
          // with later claims so a stale callback cannot release a newer claim.
          if (!hadActiveLease) {
            try { await repository.releaseLease(projectId); } catch (_) { /* owner-safe best effort */ }
          }
          return { stale: true };
        }
        ownedLeases.add(projectId);
        leaseClaimGenerations.set(projectId, generation);
        return { claimed: true, generation: generation, priorGeneration: priorGeneration, hadActiveLease: Boolean(hadActiveLease) };
      });
    }

    function releaseOperationClaim(projectId, claim) {
      if (!claim || !claim.claimed) return Promise.resolve(false);
      return serializeLeaseOperation(projectId, async function () {
        if (leaseClaimGenerations.get(projectId) !== claim.generation) return false;
        const stillCurrentActiveLease = claim.hadActiveLease && currentProject &&
          currentProject.projectId === projectId && currentLeaseValid;
        if (stillCurrentActiveLease) {
          if (claim.priorGeneration === undefined) leaseClaimGenerations.delete(projectId);
          else leaseClaimGenerations.set(projectId, claim.priorGeneration);
          return false;
        }
        let released = false;
        try { released = await repository.releaseLease(projectId); } catch (_) { /* owner-safe best effort */ }
        ownedLeases.delete(projectId);
        leaseClaimGenerations.delete(projectId);
        return released;
      });
    }

    function releaseLeaseOwnerSafe(projectId) {
      if (!repository) return Promise.resolve(false);
      return serializeLeaseOperation(projectId, async function () {
        let released = false;
        try { released = await repository.releaseLease(projectId); }
        catch (_) { /* owner-safe best effort */ }
        ownedLeases.delete(projectId);
        leaseClaimGenerations.delete(projectId);
        return released;
      });
    }

    function queuedProjectId(item) {
      if (!item) return null;
      if (item.prepared && item.prepared.candidate) return item.prepared.candidate.projectId;
      if (item.candidate && item.candidate.projectId) return item.candidate.projectId;
      if (item.spec && item.spec.projectId) return item.spec.projectId;
      if (item.spec && item.spec.project && item.spec.project.projectId) return item.spec.project.projectId;
      return currentProject ? currentProject.projectId : null;
    }

    function updateProjectSummary(project) {
      const summary = {
        projectId: project.projectId,
        title: project.title,
        revision: project.revision,
        updatedAt: project.updatedAt
      };
      projects = projects.filter(function (row) { return row.projectId !== summary.projectId; }).concat([summary]);
      projects.sort(function (left, right) { return left.projectId < right.projectId ? -1 : left.projectId > right.projectId ? 1 : 0; });
    }

    function reportSubscriberError(kind, error) {
      if (root && root.console && typeof root.console.error === "function") root.console.error("StoryModel " + kind + " subscriber failed", error);
    }

    function hasDrafts() {
      if (Array.isArray(draftsSnapshot)) return draftsSnapshot.length > 0;
      if (isRecord(draftsSnapshot)) return Object.keys(draftsSnapshot).length > 0;
      return Boolean(draftsSnapshot);
    }

    function rejectPromise(code, message, cause) {
      return Promise.reject(makeError(code, message, cause));
    }

    function requireInitialized() {
      if (modelClosed || !initialized || !repository) throw makeError("NOT_INITIALIZED", "請先呼叫並等待 initialize()。");
    }

    function requireProject() {
      if (!currentProject) throw makeError("NOT_READY", "尚未選擇或建立專案。");
      return currentProject;
    }

    function requireCanSwitch() {
      if (queue.length > 0 || paused) throw makeError("PENDING_CHANGES", "目前有未保存命令；請先重試、匯出救援或明確放棄。");
      if (hasDrafts()) throw makeError("UNSAVED_DRAFTS", "仍有未提交欄位草稿；請先保存、匯出救援或明確放棄草稿。");
    }

    function makeLifecyclePreview(project, report, sourceKey, sourceRaw) {
      return {
        projectId: project.projectId,
        title: project.title,
        sourceKey: sourceKey,
        sourceRevision: report.sourceRevision,
        sceneCount: report.sceneCount,
        shotCount: report.shotCount,
        shootingDayCount: report.shootingDayCount,
        scheduleEntryCount: report.scheduleEntryCount,
        assetCount: report.assetCount,
        drawingCount: report.drawingCount,
        warnings: cloneJson(report.warnings || []),
        sourceRaw: sourceRaw
      };
    }

    function nonMigrationPhase() {
      if (currentProject) return currentLeaseValid ? "ready" : "read_only";
      return projects.length ? "choosing" : "needs_project_creation";
    }

    function getLegacyStorage() {
      if (options && Object.prototype.hasOwnProperty.call(options, "legacyStorage")) return options.legacyStorage;
      try { return root ? root.localStorage : null; }
      catch (error) { throw makeError("LEGACY_STORAGE_UNAVAILABLE", "無法存取瀏覽器 localStorage。", error); }
    }

    function bootstrapIdFactory() {
      return function (details) { return makeUniqueId(details && details.kind ? details.kind : "project"); };
    }

    async function refreshMigrationPreview() {
      requireInitialized();
      const generation = projectGeneration;
      const returnPhase = migrationReturnPhase || nonMigrationPhase();
      migrationReturnPhase = returnPhase;
      migrationProject = null;
      migrationPreview = null;
      migrationReport = null;

      try {
        const storage = getLegacyStorage();
        const firstRead = deps.storage.readLegacyRaw(storage);
        legacySourceKey = firstRead.key;
        legacySourceRaw = firstRead.raw;
        if (!firstRead.found) {
          migrationReturnPhase = null;
          setLifecycle({
            phase: returnPhase,
            error: null,
            migrationPreview: null,
            migrationReport: null
          });
          return lifecycleSnapshot();
        }

        const result = await deps.bootstrap.bootProject({
          adapter: repository,
          legacyStorage: storage,
          now: getNowIso,
          idFactory: bootstrapIdFactory()
        });
        if (!isCurrentGeneration(generation)) return lifecycleSnapshot();
        if (result.status !== "needs_migration_confirmation") {
          if (result.status === "needs_project_creation") {
            legacySourceRaw = null;
            migrationReturnPhase = null;
            setLifecycle({ phase: returnPhase, error: null, migrationPreview: null, migrationReport: null });
            return lifecycleSnapshot();
          }
          throw makeError("MIGRATION_PREVIEW_FAILED", "無法建立舊版草稿預覽。");
        }
        if (result.sourceRaw !== firstRead.raw || result.sourceKey !== firstRead.key) {
          legacySourceRaw = result.sourceRaw;
          throw makeError("LEGACY_SOURCE_CHANGED", "預覽期間舊版草稿已變更，請重新預覽後再確認。");
        }
        migrationProject = cloneJson(result.project);
        migrationReport = cloneJson(result.migrationReport);
        migrationPreview = makeLifecyclePreview(migrationProject, migrationReport, result.sourceKey, result.sourceRaw);
        legacySourceRaw = result.sourceRaw;
        legacySourceKey = result.sourceKey;
        setLifecycle({
          phase: "needs_migration_confirmation",
          error: null,
          migrationPreview: migrationPreview,
          migrationReport: migrationReport
        });
        return lifecycleSnapshot();
      } catch (cause) {
        if (!isCurrentGeneration(generation)) return lifecycleSnapshot();
        const error = normalizeError(cause, "MIGRATION_PREVIEW_FAILED", "舊版草稿預覽失敗。");
        migrationProject = null;
        migrationPreview = null;
        migrationReport = {
          status: "error",
          code: error.code,
          message: error.message,
          sourceKey: legacySourceKey,
          sourceRevision: null,
          warnings: []
        };
        setLifecycle({ phase: "error", error: error, migrationPreview: null, migrationReport: migrationReport });
        return lifecycleSnapshot();
      }
    }

    function installLifecycleHandlers() {
      if (handlersInstalled) return;
      handlersInstalled = true;
      const doc = options && options.document ? options.document : root && root.document;
      const win = options && options.window ? options.window : root;
      if (doc && typeof doc.addEventListener === "function") {
        doc.addEventListener("visibilitychange", onVisibilityChange);
      }
      if (win && typeof win.addEventListener === "function") {
        win.addEventListener("pageshow", onPageShow);
        win.addEventListener("pagehide", onPageHide);
      }
      const setIntervalFn = options && options.setInterval ? options.setInterval : root && root.setInterval ? root.setInterval.bind(root) : setInterval;
      heartbeatTimer = setIntervalFn(function () { renewInBackground(); }, options && options.heartbeatMs ? options.heartbeatMs : 5000);
    }

    function removeLifecycleHandlers() {
      if (!handlersInstalled) return;
      handlersInstalled = false;
      const doc = options && options.document ? options.document : root && root.document;
      const win = options && options.window ? options.window : root;
      if (doc && typeof doc.removeEventListener === "function") doc.removeEventListener("visibilitychange", onVisibilityChange);
      if (win && typeof win.removeEventListener === "function") {
        win.removeEventListener("pageshow", onPageShow);
        win.removeEventListener("pagehide", onPageHide);
      }
      if (heartbeatTimer !== null) {
        const clearIntervalFn = options && options.clearInterval ? options.clearInterval : root && root.clearInterval ? root.clearInterval.bind(root) : clearInterval;
        clearIntervalFn(heartbeatTimer);
        heartbeatTimer = null;
      }
    }

    function onVisibilityChange() {
      const doc = options && options.document ? options.document : root && root.document;
      if (!doc) return;
      if (doc.visibilityState === "hidden") renewInBackground();
      else checkForeground();
    }

    function onPageHide() {
      beginProjectOperation();
      activationPending = false;
      const hasUncommittedWork = queue.length > 0 || paused || hasDrafts();
      if (!hasUncommittedWork) releaseOwnedLeasesBestEffort();
      if (currentProject) {
        currentLeaseValid = false;
        setLifecycle({
          phase: "read_only",
          readOnlyReason: withHistoryErrorReason(hasUncommittedWork
            ? "頁面離開時仍有未保存工作；已保留唯讀狀態，返回時會重新確認。"
            : "頁面離開後已釋放編輯權，返回時會重新確認。")
        });
      }
    }

    function onPageShow() { checkForeground(); }

    function renewInBackground() {
      if (!currentProject || !currentLeaseValid || heartbeatPromise) return heartbeatPromise || Promise.resolve(false);
      const projectId = currentProject.projectId;
      const generation = projectGeneration;
      heartbeatPromise = repository.renewLease(projectId).then(function () {
        if (!isCurrentGeneration(generation) || !currentProject || currentProject.projectId !== projectId) return false;
        return true;
      }).catch(function (cause) {
        if (!isCurrentGeneration(generation) || !currentProject || currentProject.projectId !== projectId) return false;
        const error = normalizeError(cause, "LEASE_LOST", "無法延長專案編輯權。");
        currentLeaseValid = false;
        handleLeaseFailure(error, projectId);
        return false;
      }).finally(function () { heartbeatPromise = null; });
      return heartbeatPromise;
    }

    function handleLeaseFailure(error, projectId) {
      const item = activeCommitItem || (queue.length > 0 ? queue[0] : null);
      const itemProjectId = queuedProjectId(item);
      if (currentProject && currentProject.projectId === projectId) currentLeaseValid = false;

      // A heartbeat for the old project must not fail a queued create/new-project
      // transaction. That queue item has its own atomic lease check.
      if (item && itemProjectId && itemProjectId !== projectId) {
        setLifecycle({
          phase: "saving",
          error: error,
          readOnlyReason: currentProject && currentProject.projectId === projectId
            ? "目前專案編輯權已失效；正在保存另一個專案。"
            : lifecycle.readOnlyReason
        });
        return;
      }

      if (item && itemProjectId === projectId && item.commitInFlight) {
        item.leaseFailureDuringCommit = error;
        item.leaseFailureReadOnlyReason = "編輯權已失效；此專案目前為唯讀，請重新取得編輯權。";
        setLifecycle({ phase: "saving", error: null, readOnlyReason: item.leaseFailureReadOnlyReason });
        return;
      }

      if (item && itemProjectId === projectId) {
        paused = true;
        lastSaveError = error;
        item.storageFailed = true;
        item.error = errorInfo(error);
        settleReject(item, error);
        setLifecycle({ phase: "save_failed", error: error, readOnlyReason: "編輯權已失效；未保存命令仍保留。" });
      } else {
        setLifecycle({
          phase: currentProject && currentProject.projectId === projectId ? "read_only" : lifecycle.phase,
          error: error,
          readOnlyReason: currentProject && currentProject.projectId === projectId
            ? withHistoryErrorReason("此專案目前由其他分頁編輯，或編輯權已失效。")
            : lifecycle.readOnlyReason
        });
      }
    }

    async function checkForegroundCore() {
      if (!initialized || !currentProject || foregroundPromise) return foregroundPromise || false;
      const generation = projectGeneration;
      foregroundPromise = (async function () {
        const projectId = currentProject.projectId;
        const wasPaused = paused;
        currentLeaseValid = false;
        setLifecycle({ phase: "read_only", error: null, readOnlyReason: "正在重新確認專案編輯權…" });
        let claim = null;
        try {
          try { await repository.renewLease(projectId); }
          catch (renewError) {
            if (!renewError || renewError.code !== "LEASE_LOST") throw renewError;
            claim = await claimLeaseForGeneration(projectId, generation);
            if (claim.stale) return false;
            if (claim.error) throw claim.error;
          }
          const stored = await repository.loadProject(projectId);
          if (!isCurrentGeneration(generation) || !currentProject || currentProject.projectId !== projectId) {
            if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
            return false;
          }
          if (!stored) throw makeError("PROJECT_NOT_FOUND", "已選專案在 IndexedDB 中不存在。");
          const validated = deps.schema.validateProject(stored);

          const hasPendingWork = queue.length > 0 || paused || hasDrafts();
          const sameProject = stableStringify(validated) === stableStringify(currentProject);
          if (hasPendingWork && !sameProject) {
            const conflict = makeError("REVISION_CONFLICT", "尚有未保存工作且專案已變更；保留目前輸入，不會自動載入或覆蓋。");
            if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
            throw conflict;
          }

          const changed = !sameProject;
          let loadedHistory = null;
          let historyError = null;
          if (!hasPendingWork) {
            try { loadedHistory = await readOrInitializeHistory(validated, true, generation); }
            catch (cause) {
              if (cause && cause.code === "OPERATION_STALE") throw cause;
              historyError = historyUnavailable(cause);
            }
          }
          if (!isCurrentGeneration(generation)) {
            if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
            return false;
          }
          if (!hasPendingWork && changed) {
            currentProject = validated;
            updateProjectSummary(validated);
          }
          if (!hasPendingWork) {
            if (historyError) clearHistoryBundle(historyError);
            else installHistoryBundle(loadedHistory);
          }
          currentLeaseValid = true;
          if (!wasPaused && !queue.length) lastSaveError = null;
          const blockedByDrafts = hasDrafts() && changed;
          if (!hasPendingWork && changed) emitData({ type: "reload" });
          setLifecycle({
            phase: blockedByDrafts || historyError ? "read_only" : (wasPaused ? "save_failed" : (queue.length ? "saving" : "ready")),
            error: historyError || (wasPaused ? lastSaveError : null),
            readOnlyReason: blockedByDrafts
              ? "尚有未保存欄位，已保留唯讀；完成草稿處理後請重新載入最新專案。"
              : historyError ? historyErrorReason() : null
          });
          if (!wasPaused && !blockedByDrafts && !historyError) pumpQueue();
          return true;
        } catch (cause) {
          if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
          if (!isCurrentGeneration(generation)) return false;
          const error = normalizeError(cause, "LEASE_LOST", "返回頁面時無法確認專案編輯權。");
          currentLeaseValid = false;
          if (queue.length > 0 && (error.code === "REVISION_CONFLICT" || error.code === "LEASE_CONFLICT" || error.code === "LEASE_LOST")) {
            handleLeaseFailure(error, projectId);
          } else {
            setLifecycle({ phase: "read_only", error: error, readOnlyReason: withHistoryErrorReason("請重新取得編輯權，或重新載入最新專案。") });
          }
          if (error.code === "LEASE_CONFLICT") startLeaseRecovery(projectId, generation);
          return false;
        }
      })().finally(function () { foregroundPromise = null; });
      return foregroundPromise;
    }

    function checkForeground() {
      return trackLeaseActivity(checkForegroundCore());
    }

    async function releaseOwnedLeasesBestEffort() {
      if (!repository) return;
      const ids = Array.from(ownedLeases);
      ownedLeases.clear();
      ids.forEach(function (id) { leaseClaimGenerations.delete(id); });
      await Promise.all(ids.map(function (id) { return releaseLeaseOwnerSafe(id); }));
    }

    function finishLeaseRecovery(recovery) {
      if (leaseRecovery === recovery) leaseRecovery = null;
      if (recovery && recovery.timer !== null) {
        try { getClearTimeout()(recovery.timer); } catch (_) { /* best effort */ }
        recovery.timer = null;
      }
    }

    function startLeaseRecovery(projectId, generation) {
      if (!isCurrentGeneration(generation) || !currentProject || currentProject.projectId !== projectId ||
          queue.length > 0 || paused || hasDrafts()) return false;
      if (leaseRecovery && leaseRecovery.projectId === projectId && leaseRecovery.generation === generation) return true;
      cancelLeaseRecovery();
      const recovery = {
        projectId: projectId,
        generation: generation,
        attempts: 0,
        maxAttempts: Math.max(1, Math.ceil((leaseMs + 2000) / LEASE_RECOVERY_INTERVAL_MS)),
        timer: null
      };
      leaseRecovery = recovery;

      function scheduleNextAttempt() {
        if (leaseRecovery !== recovery || !isCurrentGeneration(generation)) return finishLeaseRecovery(recovery);
        recovery.timer = getSetTimeout()(function () {
          recovery.timer = null;
          trackLeaseActivity(runAttempt());
        }, LEASE_RECOVERY_INTERVAL_MS);
      }

      async function runAttempt() {
        if (leaseRecovery !== recovery || !isCurrentGeneration(generation) || !currentProject || currentProject.projectId !== projectId) {
          finishLeaseRecovery(recovery);
          return;
        }
        if (queue.length > 0 || paused || hasDrafts()) {
          finishLeaseRecovery(recovery);
          return;
        }
        recovery.attempts += 1;
        let claim;
        try {
          claim = await claimLeaseForGeneration(projectId, generation);
          if (claim.stale) { finishLeaseRecovery(recovery); return; }
          if (claim.error) {
            if (claim.error.code === "LEASE_CONFLICT" && recovery.attempts < recovery.maxAttempts) {
              scheduleNextAttempt();
              return;
            }
            if (isCurrentGeneration(generation)) {
              currentLeaseValid = false;
              setLifecycle({ phase: "read_only", error: claim.error, readOnlyReason: withHistoryErrorReason("此專案仍由其他分頁編輯；稍後可重新取得編輯權。") });
            }
            finishLeaseRecovery(recovery);
            return;
          }

          const stored = await repository.loadProject(projectId);
          if (!isCurrentGeneration(generation) || !currentProject || currentProject.projectId !== projectId) {
            await releaseOperationClaim(projectId, claim);
            finishLeaseRecovery(recovery);
            return;
          }
          if (!stored) throw makeError("PROJECT_NOT_FOUND", "取得編輯權後找不到專案。");
          const latest = deps.schema.validateProject(stored);
          if (queue.length > 0 || paused || hasDrafts()) {
            if (stableStringify(latest) !== stableStringify(currentProject)) {
              await releaseOperationClaim(projectId, claim);
              throw makeError("REVISION_CONFLICT", "取得編輯權期間出現未保存工作與外部修改；保留原輸入，不會自動載入。");
            }
            currentLeaseValid = true;
            setLifecycle({ phase: "read_only", error: null, readOnlyReason: "取得編輯權期間出現未保存欄位；完成處理後請重新載入最新專案。" });
            finishLeaseRecovery(recovery);
            return;
          }

          let loadedHistory = null;
          let historyError = null;
          try { loadedHistory = await readOrInitializeHistory(latest, true, generation); }
          catch (cause) {
            if (cause && cause.code === "OPERATION_STALE") throw cause;
            historyError = historyUnavailable(cause);
          }
          if (!isCurrentGeneration(generation)) {
            await releaseOperationClaim(projectId, claim);
            finishLeaseRecovery(recovery);
            return;
          }
          currentProject = latest;
          selectedProjectId = projectId;
          updateProjectSummary(latest);
          if (historyError) clearHistoryBundle(historyError);
          else installHistoryBundle(loadedHistory);
          currentLeaseValid = true;
          paused = false;
          lastSaveError = null;
          setLifecycle({
            phase: historyError ? "read_only" : "ready",
            error: historyError,
            readOnlyReason: historyError ? historyErrorReason() : null
          });
          emitData({ type: "reload" });
          finishLeaseRecovery(recovery);
        } catch (cause) {
          if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
          if (isCurrentGeneration(generation) && currentProject && currentProject.projectId === projectId) {
            const error = normalizeError(cause, "LEASE_LOST", "無法安全恢復專案編輯權。");
            currentLeaseValid = false;
            setLifecycle({ phase: "read_only", error: error, readOnlyReason: withHistoryErrorReason("恢復失敗；目前資料與未保存輸入均已保留。") });
          }
          finishLeaseRecovery(recovery);
        }
      }

      scheduleNextAttempt();
      return true;
    }

    async function loadAndActivateCore(project, summaries, generation) {
      let validated = deps.schema.validateProject(project);
      const projectId = validated.projectId;
      if (!isCurrentGeneration(generation)) return false;
      let leaseError = null;
      let claim = null;
      let freshProject = null;
      try {
        claim = await claimLeaseForGeneration(projectId, generation);
        if (claim.stale) return false;
        if (claim.error) throw claim.error;
        freshProject = await repository.loadProject(projectId);
        if (!isCurrentGeneration(generation)) {
          await releaseOperationClaim(projectId, claim);
          return false;
        }
        if (!freshProject) throw makeError("PROJECT_NOT_FOUND", "取得編輯權後找不到專案。");
        validated = deps.schema.validateProject(freshProject);
      } catch (cause) {
        if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
        leaseError = normalizeError(cause, "LEASE_LOST", "無法取得專案編輯權。");
        if (leaseError.code !== "LEASE_CONFLICT") throw leaseError;
      }

      if (!isCurrentGeneration(generation)) {
        if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
        return false;
      }
      let loadedHistory = null;
      let historyError = null;
      try { loadedHistory = await readOrInitializeHistory(validated, !leaseError, generation); }
      catch (cause) {
        if (cause && cause.code === "OPERATION_STALE") {
          if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
          return false;
        }
        historyError = historyUnavailable(cause);
      }
      if (!isCurrentGeneration(generation)) {
        if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
        return false;
      }
      const oldId = currentProject ? currentProject.projectId : null;
      const wasOwned = Boolean(claim && claim.claimed && ownedLeases.has(projectId));
      currentProject = validated;
      selectedProjectId = projectId;
      updateProjectSummary(validated);
      migrationProject = null;
      migrationPreview = null;
      migrationReport = null;
      migrationReturnPhase = null;
      if (historyError) clearHistoryBundle(historyError);
      else installHistoryBundle(loadedHistory);
      currentLeaseValid = !leaseError;
      activationPending = false;
      paused = false;
      lastSaveError = null;
      if (Array.isArray(summaries)) projects = cloneJson(summaries);
      const readOnlyReason = historyError
        ? historyErrorReason() + (leaseError ? " 編輯權目前也未取得。" : "")
        : leaseError ? "編輯權可能仍由其他分頁或重新載入前的頁面持有，正在嘗試重新取得。" : null;
      setLifecycle({
        phase: currentLeaseValid && !historyError ? "ready" : "read_only",
        error: historyError || leaseError,
        readOnlyReason: readOnlyReason,
        migrationPreview: null
      });
      emitData({ type: "init" });
      if (oldId && oldId !== projectId) {
        ownedLeases.delete(oldId);
        leaseClaimGenerations.delete(oldId);
        releaseLeaseOwnerSafe(oldId);
      }
      if (leaseError && leaseError.code === "LEASE_CONFLICT") startLeaseRecovery(projectId, generation);
      // A failed activation never discards another owner's lease. A successful
      // activation keeps this document's own claim alive for heartbeats.
      if (!currentLeaseValid && wasOwned) ownedLeases.delete(projectId);
      return projectId;
    }

    function loadAndActivate(project, summaries, generation) {
      return trackLeaseActivity(loadAndActivateCore(project, summaries, generation));
    }

    function initResult() {
      return {
        status: lifecycleSnapshot().phase,
        projects: cloneJson(projects),
        migration: migrationPreview ? cloneJson(migrationPreview) : null
      };
    }

    function initialize(initOptions) {
      if (initFlight) return initFlight;
      modelClosed = false;
      const generation = beginProjectOperation();
      options = initOptions || {};
      leaseMs = options.leaseMs === undefined ? 15000 : options.leaseMs;
      activationPending = false;
      setLifecycle({ phase: "opening", error: null, readOnlyReason: null });
      const attempt = (async function () {
        const indexedDBProvider = options.indexedDB || (root && root.indexedDB);
        if (options.repository) repository = options.repository;
        else {
          repository = deps.repository.createRepository({
            indexedDB: indexedDBProvider,
            dbName: options.dbName || PRODUCTION_DB_NAME,
            ownerToken: ownerToken,
            now: options.repositoryNow || options.nowEpoch || Date.now,
            leaseMs: options.leaseMs === undefined ? 15000 : options.leaseMs,
            crypto: options.crypto
          });
        }
        await repository.open();
        if (!isCurrentGeneration(generation)) throw makeError("OPERATION_STALE", "專案開啟已被關閉或新的操作取代。");
        projects = await repository.listProjects();
        if (!isCurrentGeneration(generation)) throw makeError("OPERATION_STALE", "專案清單讀取已被新的操作取代。");
        initialized = true;
        installLifecycleHandlers();

        if (options.projectId !== undefined && options.projectId !== null) {
          activationPending = true;
          let stored;
          try { stored = await repository.loadProject(options.projectId); }
          catch (cause) { throw normalizeError(cause, "PROJECT_READ_FAILED", "無法讀取指定專案。"); }
          if (!isCurrentGeneration(generation)) throw makeError("OPERATION_STALE", "指定專案讀取已被新的操作取代。");
          if (!stored) {
            activationPending = false;
            const missing = makeError("PROJECT_NOT_FOUND", "指定的專案不存在；已保留專案清單，沒有建立或寫入替代資料。");
            setLifecycle({ phase: "choosing", error: missing, migrationPreview: null });
            return initResult();
          }
          await loadAndActivate(stored, projects, generation);
          return initResult();
        }

        if (projects.length === 0) {
          activationPending = false;
          await refreshMigrationPreview();
          return initResult();
        }
        activationPending = false;
        setLifecycle({ phase: "choosing", error: null, readOnlyReason: null, migrationPreview: null });
        return initResult();
      })();
      initFlight = attempt;
      attempt.catch(function (cause) {
        if (!isCurrentGeneration(generation)) {
          if (initFlight === attempt) initFlight = null;
          return;
        }
        const error = normalizeError(cause, "INITIALIZE_FAILED", "無法開啟本機專案。");
        activationPending = false;
        setLifecycle({ phase: "error", error: error, readOnlyReason: null });
        if (initFlight === attempt) initFlight = null;
      });
      return attempt;
    }

    function enqueue(item) {
      let resolvePromise;
      let rejectPromise;
      const promise = new Promise(function (resolve, reject) { resolvePromise = resolve; rejectPromise = reject; });
      item.promise = promise;
      item.resolve = resolvePromise;
      item.reject = rejectPromise;
      item.settled = false;
      item.retryWaiters = [];
      if (item.generation === undefined) item.generation = projectGeneration;
      queue.push(item);
      setLifecycle({ phase: paused ? "save_failed" : "saving" });
      pumpQueue();
      return promise;
    }

    function settleResolve(item, value) {
      if (!item.settled) {
        item.settled = true;
        item.resolve(value);
      }
      item.retryWaiters.splice(0).forEach(function (waiter) { waiter.resolve(value); });
    }

    function settleReject(item, error) {
      if (!item.settled) {
        item.settled = true;
        item.reject(error);
      }
      item.retryWaiters.splice(0).forEach(function (waiter) { waiter.reject(error); });
    }

    function waitForRetry(item) {
      return new Promise(function (resolve, reject) { item.retryWaiters.push({ resolve: resolve, reject: reject }); });
    }

    function isStorageError(error) {
      return Boolean(error && error.storageStage === true);
    }

    function tagStorageError(cause, fallbackCode, fallbackMessage) {
      const error = normalizeError(cause, fallbackCode || "STORAGE_ERROR", fallbackMessage || "本機儲存操作失敗。");
      error.storageStage = true;
      return error;
    }

    function makeHistoryData(type, before, after) {
      return {
        kind: type,
        baseRevision: before ? before.revision : null,
        revision: after.revision
      };
    }

    function historyUnavailable(cause) {
      if (cause && cause.code === "HISTORY_UNAVAILABLE") return cause;
      return makeError("HISTORY_UNAVAILABLE", "舊復原歷史無法安全恢復；目前專案仍可讀取與匯出。", cause);
    }

    function installHistoryBundle(bundle) {
      historyState = deps.history.cloneStrictJson(bundle.state, "historyState");
      historyEntries = deps.history.cloneStrictJson(bundle.entries, "historyEntries");
      historyReady = true;
      historyFailure = null;
    }

    function clearHistoryBundle(cause) {
      historyState = null;
      historyEntries = [];
      historyReady = false;
      historyFailure = cause ? historyUnavailable(cause) : null;
      return historyFailure;
    }

    function historyErrorReason() {
      if (!historyFailure) return null;
      const detail = errorInfo(historyFailure.cause || historyFailure);
      return "舊復原歷史無法安全恢復（" + detail.code + "）：" + detail.message + "；復原與重做及專案編輯已停用。";
    }

    function withHistoryErrorReason(reason) {
      const historyReason = historyErrorReason();
      return historyReason ? historyReason + (reason ? " " + reason : "") : reason;
    }

    function receiptProject(receiptData, direction, project, revision) {
      const wrapper = receiptData && receiptData[direction];
      if (!isRecord(wrapper) || !isRecord(wrapper.project)) {
        throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt 缺少完整 " + direction + " Project。")
      }
      let value;
      try { value = deps.schema.validateProject(wrapper.project); }
      catch (cause) { throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt 的 " + direction + " Project 無法通過 schema 驗證。", cause); }
      if (value.projectId !== project.projectId || value.createdAt !== project.createdAt || value.revision !== revision) {
        throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt 的 Project 身分或 revision 不連續。")
      }
      return value;
    }

    const LEGACY_CREATIVE_KINDS = new Set([
      "updateProjectMetadata", "addScene", "updateScene", "addShot", "updateShot", "duplicateShot", "deleteShot", "moveShot",
      "reorderShots", "setShotNumberLocked", "renumberShots", "scheduleShot", "removeEntry", "moveEntry", "reorderScheduleEntries", "updateEntry",
      "addBreak", "addDay", "updateDay", "addProductionTask", "updateProductionTask", "moveProductionTask",
      "reorderProductionTasks", "reorderProductionTimeline", "deleteProductionTask", "setAspectRatio"
    ]);

    function backfillHistoryFromReceipts(project, receipts) {
      const canonical = deps.schema.validateProject(project);
      if (!Array.isArray(receipts)) throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt 清單格式無效。")
      const ordered = receipts.slice().sort(function (left, right) {
        const leftRevision = left && Number.isInteger(left.revision) ? left.revision : Number.MAX_SAFE_INTEGER;
        const rightRevision = right && Number.isInteger(right.revision) ? right.revision : Number.MAX_SAFE_INTEGER;
        return leftRevision - rightRevision;
      });
      const ids = new Set();
      ordered.forEach(function (receipt) {
        if (!isRecord(receipt) || receipt.projectId !== canonical.projectId || receipt.receipt !== true ||
            typeof receipt.commandId !== "string" || !receipt.commandId.trim() || ids.has(receipt.commandId)) {
          throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt 含有無效或重複的命令 ID。")
        }
        ids.add(receipt.commandId);
      });

      if (canonical.revision === 0 && ordered.length === 1) {
        const receipt = ordered[0];
        const data = receipt.data;
        if (!isRecord(data) || !["createProject", "confirmMigration"].includes(data.kind) ||
            data.baseRevision !== null || data.revision !== 0 || receipt.revision !== 0) {
          throw makeError("HISTORY_BACKFILL_FAILED", "revision 0 receipt 不是有效的新案或遷移 baseline。")
        }
        if (!Object.prototype.hasOwnProperty.call(data, "forward") && !Object.prototype.hasOwnProperty.call(data, "inverse")) {
          const allowedKeys = ["kind", "baseRevision", "revision", "arguments"];
          if (Object.keys(data).some(function (key) { return allowedKeys.indexOf(key) < 0; })) {
            throw makeError("HISTORY_BACKFILL_FAILED", "minimal create receipt 含有無法驗證的欄位。")
          }
          if (Object.prototype.hasOwnProperty.call(data, "arguments")) {
            deps.history.cloneStrictJson(data.arguments, "create receipt arguments");
          }
          return { state: deps.history.createBaseline(canonical), entries: [] };
        }
      }

      if (ordered.length !== canonical.revision + 1) {
        throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt revision 序列缺號或筆數不完整。")
      }

      const baselineReceipt = ordered[0];
      const baselineData = baselineReceipt && baselineReceipt.data;
      if (!isRecord(baselineData) || !["createProject", "confirmMigration"].includes(baselineData.kind) ||
          baselineData.baseRevision !== null || baselineData.revision !== 0 || baselineReceipt.revision !== 0 ||
          baselineData.inverse !== null) {
        throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt revision 0 缺少有效的新案或遷移 baseline。")
      }
      const baselineProject = receiptProject(baselineData, "forward", canonical, 0);
      if (!deps.history.deepEqual(baselineProject, canonical) && canonical.revision === 0) {
        throw makeError("HISTORY_BACKFILL_FAILED", "revision 0 baseline 與目前 Project 不一致。")
      }

      let simulatedProject = baselineProject;
      let state = deps.history.createBaseline(baselineProject);
      let entries = [];

      for (let revision = 1; revision < ordered.length; revision += 1) {
        const receipt = ordered[revision];
        const data = receipt && receipt.data;
        if (!isRecord(data) || receipt.revision !== revision || data.revision !== revision || data.baseRevision !== revision - 1) {
          throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt revision " + revision + " 缺少連續的完整資料。")
        }
        try { deps.history.cloneStrictJson(data, "legacy receipt data"); }
        catch (cause) { throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt revision " + revision + " 含有非 JSON 資料。", cause); }
        const before = receiptProject(data, "inverse", canonical, revision - 1);
        const after = receiptProject(data, "forward", canonical, revision);
        if (!deps.history.deepEqual(deps.history.creativeProjection(before), deps.history.creativeProjection(simulatedProject))) {
          throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt revision " + revision + " 的 before Project 與前一筆結果不相符。")
        }
        if (!deps.history.deepEqual(before.outputPreferences, simulatedProject.outputPreferences)) {
          throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt revision " + revision + " 的 before 輸出偏好與前一筆結果不相符。")
        }

        let result;
        if (LEGACY_CREATIVE_KINDS.has(data.kind)) {
          result = deps.history.recordCreativeCommand({
            beforeProject: before,
            afterProject: after,
            state: state,
            entries: entries,
            entryId: receipt.commandId,
            kind: data.kind
          });
        } else if (data.kind === "updateOutputPreferences") {
          result = deps.history.recordPreferenceCommand({ beforeProject: before, afterProject: after, state: state, entries: entries });
        } else if (data.kind === "undo" || data.kind === "redo") {
          if (!deps.history.deepEqual(before.outputPreferences, simulatedProject.outputPreferences) ||
              !deps.history.deepEqual(after.outputPreferences, simulatedProject.outputPreferences)) {
            throw makeError("HISTORY_BACKFILL_FAILED", "舊 undo/redo receipt 未保留當前輸出偏好。")
          }
          result = deps.history[data.kind]({ project: simulatedProject, state: state, entries: entries, updatedAt: after.updatedAt });
          if (!deps.history.deepEqual(result.project, after)) {
            throw makeError("HISTORY_BACKFILL_FAILED", "舊 " + data.kind + " receipt 的游標轉移結果與 forward Project 不相符。")
          }
        } else {
          throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt command kind 無法確定分類：" + String(data.kind) + "。")
        }
        if (result.noOp || !deps.history.deepEqual(result.state.projectRevision, revision)) {
          throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt revision " + revision + " 沒有產生有效 history 轉移。")
        }
        if (data.kind !== "undo" && data.kind !== "redo" &&
            !deps.history.deepEqual(deps.history.creativeProjection(result.project || after), deps.history.creativeProjection(after))) {
          throw makeError("HISTORY_BACKFILL_FAILED", "舊 receipt revision " + revision + " 的重播結果不相符。")
        }
        state = result.state;
        entries = result.entries;
        simulatedProject = after;
      }

      if (simulatedProject.revision !== canonical.revision ||
          !deps.history.deepEqual(deps.history.creativeProjection(simulatedProject), deps.history.creativeProjection(canonical)) ||
          !deps.history.deepEqual(simulatedProject.outputPreferences, canonical.outputPreferences)) {
        throw makeError("HISTORY_BACKFILL_FAILED", "完整舊 receipt 序列無法重建目前 Project。")
      }
      const validation = deps.history.validateHistory({ project: canonical, state: state, entries: entries });
      if (!validation.valid) throw makeError("HISTORY_BACKFILL_FAILED", "重建後的舊復原歷史驗證失敗。", validation.error);
      return { state: validation.state, entries: validation.entries };
    }

    async function readOrInitializeHistory(project, allowInitialize, generation) {
      if (!repository || typeof repository.readUndoHistory !== "function" || typeof repository.initializeUndoHistory !== "function") {
        throw historyUnavailable(makeError("HISTORY_REPOSITORY_UNSUPPORTED", "repository 未提供 WP-04 永續 history API。"));
      }
      let read = await repository.readUndoHistory(project.projectId);
      if (!isCurrentGeneration(generation)) throw makeError("OPERATION_STALE", "history 讀取已被新的操作取代。")
      if (!read || read.projectRevision !== project.revision) {
        throw historyUnavailable(makeError("HISTORY_REVISION_MISMATCH", "history state revision 與目前 Project revision 不一致。"));
      }
      if (read.state) {
        const validation = deps.history.validateHistory({ project: project, state: read.state, entries: read.entries });
        if (!validation.valid) throw historyUnavailable(makeError(validation.error.code, validation.error.message));
        return { state: validation.state, entries: validation.entries };
      }
      if (!allowInitialize) {
        throw historyUnavailable(makeError("HISTORY_STATE_MISSING", "此唯讀 Project 缺少可確認的 history baseline。"));
      }

      const rebuilt = backfillHistoryFromReceipts(project, read.receipts);
      if (!isCurrentGeneration(generation)) throw makeError("OPERATION_STALE", "history 回填已被新的操作取代。")
      try {
        await repository.initializeUndoHistory({
          projectId: project.projectId,
          expectedRevision: project.revision,
          state: rebuilt.state,
          entries: rebuilt.entries
        });
      } catch (cause) {
        if (!cause || cause.code !== "HISTORY_STATE_EXISTS") throw historyUnavailable(cause);
        read = await repository.readUndoHistory(project.projectId);
        if (!read || read.projectRevision !== project.revision || !read.state) {
          throw historyUnavailable(makeError("HISTORY_STATE_RACE", "另一個分頁建立 history state 後仍無法讀取一致結果。", cause));
        }
        const racedValidation = deps.history.validateHistory({ project: project, state: read.state, entries: read.entries });
        if (!racedValidation.valid) throw historyUnavailable(makeError(racedValidation.error.code, racedValidation.error.message, cause));
        return { state: racedValidation.state, entries: racedValidation.entries };
      }
      if (!isCurrentGeneration(generation)) throw makeError("OPERATION_STALE", "history 初始化已被新的操作取代。")
      const validation = deps.history.validateHistory({ project: project, state: rebuilt.state, entries: rebuilt.entries });
      if (!validation.valid) throw historyUnavailable(makeError(validation.error.code, validation.error.message));
      return { state: validation.state, entries: validation.entries };
    }

    function makeHistoryDelta(expectedStateRevision, result) {
      return {
        expectedStateRevision: expectedStateRevision,
        nextState: deps.history.cloneStrictJson(result.state, "next historyState"),
        entryWrites: deps.history.cloneStrictJson(result.entryWrites || [], "history entryWrites"),
        entryDeletes: deps.history.cloneStrictJson(result.entryDeletes || [], "history entryDeletes")
      };
    }

    function makeExpectedHistorySnapshot(state, entries) {
      return {
        state: state ? deps.history.cloneStrictJson(state, "expected historyState") : null,
        entries: deps.history.cloneStrictJson(entries || [], "expected historyEntries")
      };
    }

    function makeHistoryBundle(result) {
      return {
        state: deps.history.cloneStrictJson(result.state, "next historyState"),
        entries: deps.history.cloneStrictJson(result.entries || [], "next historyEntries")
      };
    }

    function newIdFactory(project) {
      const reserved = new Set();
      ["scenes", "shots", "shootingDays", "scheduleEntries", "productionTasks", "assets", "drawings"].forEach(function (key) {
        (project[key] || []).forEach(function (item) { if (item && typeof item.id === "string") reserved.add(item.id); });
      });
      (project.drawings || []).forEach(function (drawing) {
        (drawing.layers || []).forEach(function (layer) {
          if (layer && layer.id) reserved.add(layer.id);
          (layer && layer.strokes || []).forEach(function (stroke) { if (stroke && stroke.id) reserved.add(stroke.id); });
        });
      });
      return function (kind) {
        let value;
        do { value = randomToken(kind || "item"); } while (reserved.has(value));
        reserved.add(value);
        return value;
      };
    }

    function validateBridgeResult(result, before) {
      if (!result || !isRecord(result) || !isRecord(result.project) || typeof result.changed !== "boolean") {
        throw makeError("INVALID_BRIDGE_RESULT", "project bridge 回傳格式無效。");
      }
      const project = deps.schema.validateProject(result.project);
      if (project.projectId !== before.projectId) throw makeError("PROJECT_ID_MISMATCH", "命令不可改變 projectId。");
      if (project.revision !== before.revision) throw makeError("BRIDGE_REVISION_MUTATION", "revision 必須由 Model 交易執行器管理。");
      const actualChanged = stableStringify(project) !== stableStringify(before);
      if (!result.changed && actualChanged) throw makeError("BRIDGE_NOOP_MISMATCH", "bridge 將有變更的命令標成 no-op。");
      return { project: project, changed: actualChanged, value: result.value, undoable: result.undoable !== false };
    }

    function candidateWithRevision(project, revision) {
      const candidate = cloneJson(project);
      candidate.revision = revision;
      candidate.updatedAt = getNowIso();
      return deps.schema.validateProject(candidate);
    }

    function advanceChangedDrawingRevisions(before, project) {
      const candidate = cloneJson(project);
      const oldDrawings = new Map(before.drawings.map(function (drawing) { return [drawing.id, drawing]; }));
      candidate.drawings.forEach(function (drawing) {
        const previous = oldDrawings.get(drawing.id);
        if (!previous) return;
        const previousContent = cloneJson(previous);
        const nextContent = cloneJson(drawing);
        delete previousContent.revision;
        delete nextContent.revision;
        if (stableStringify(previousContent) !== stableStringify(nextContent)) {
          drawing.revision = previous.revision + 1;
        } else {
          drawing.revision = previous.revision;
        }
      });
      return deps.schema.validateProject(candidate);
    }

    function prepareBridgeCommand(item, before, raw) {
      const bridged = validateBridgeResult(raw, before);
      if (!bridged.changed) {
        item.prepared = { noop: true, value: bridged.value, type: item.type };
        return item.prepared;
      }
      const candidate = candidateWithRevision(advanceChangedDrawingRevisions(before, bridged.project), before.revision + 1);
      if (!bridged.undoable && item.type !== "updateOutputPreferences") {
        throw makeError("HISTORY_UNSUPPORTED_COMMAND", "成功的創作命令必須建立可驗證的 history entry。" + item.type);
      }
      const historyResult = bridged.undoable
        ? deps.history.recordCreativeCommand({
          beforeProject: before,
          afterProject: candidate,
          state: historyState,
          entries: historyEntries,
          entryId: item.commandId,
          kind: item.type
        })
        : deps.history.recordPreferenceCommand({
          beforeProject: before,
          afterProject: candidate,
          state: historyState,
          entries: historyEntries
        });
      const historyBundle = makeHistoryBundle(historyResult);
      item.prepared = {
        noop: false,
        type: item.type,
        value: bridged.value,
        before: before,
        candidate: candidate,
        history: makeHistoryData(item.type, before, candidate),
        historyDelta: makeHistoryDelta(before.revision, historyResult),
        expectedHistory: makeExpectedHistorySnapshot(historyState, historyEntries),
        historyBundle: historyBundle,
        baseRevision: before.revision
      };
      return item.prepared;
    }

    function prepareCommand(item) {
      const before = deps.schema.validateProject(currentProject);
      if (!currentLeaseValid && !paused) throw tagStorageError(makeError("LEASE_LOST", "專案目前沒有有效編輯權。"));
      if (!historyReady || !historyState) throw historyUnavailable(historyFailure || makeError("HISTORY_STATE_MISSING", "尚未載入可驗證的 history state。"));

      if (item.type === "undo" || item.type === "redo") {
        const from = item.type === "undo" ? historyState.undoEntryIds : historyState.redoEntryIds;
        if (!from.length) {
          item.prepared = { noop: true, value: false, type: item.type };
          return item.prepared;
        }
        const result = deps.history[item.type]({
          project: before,
          state: historyState,
          entries: historyEntries,
          updatedAt: getNowIso()
        });
        // WP-04 patches include complete Drawing snapshots. Keep the historical
        // Drawing revision restored by undo/redo so persisted patch chains stay
        // reversible after reload; Project revision remains monotonic here.
        const candidate = candidateWithRevision(result.project, before.revision + 1);
        const historyBundle = makeHistoryBundle(result);
        item.prepared = {
          noop: false,
          type: item.type,
          value: true,
          before: before,
          candidate: candidate,
          history: makeHistoryData(item.type, before, candidate),
          historyDelta: makeHistoryDelta(before.revision, result),
          expectedHistory: makeExpectedHistorySnapshot(historyState, historyEntries),
          historyBundle: historyBundle,
          baseRevision: before.revision
        };
        return item.prepared;
      }

      const raw = deps.bridge.applyCommand(before, item.type, item.args, { newId: newIdFactory(before) });
      return prepareBridgeCommand(item, before, raw);
    }

    async function preparePhotoCommand(item) {
      if (item.prepared) return item.prepared;
      const before = deps.schema.validateProject(currentProject);
      if (before.projectId !== item.projectId) throw makeError("PROJECT_CHANGED", "照片命令所屬專案已切換；原 Shot 與檔案仍保留在待處理項目。");
      if (!currentLeaseValid && !paused) throw tagStorageError(makeError("LEASE_LOST", "專案目前沒有有效編輯權。"));
      if (!historyReady || !historyState) throw historyUnavailable(historyFailure || makeError("HISTORY_STATE_MISSING", "尚未載入可驗證的 history state。"));
      const importer = photoImportService();
      if (!importer || typeof importer.preparePhotoImport !== "function") {
        throw makeError("PHOTO_IMPORT_UNAVAILABLE", "尚未載入照片驗證模組；沒有變更 Project 或 Asset。請重新載入後再試。");
      }

      const allocateId = newIdFactory(before);
      const preparedFiles = [];
      const importOptions = item.photoImportOptions || {};
      for (let index = 0; index < item.files.length; index += 1) {
        const file = item.files[index];
        const id = allocateId("asset");
        const originalName = file && typeof file.name === "string" ? file.name : null;
        reportPhotoProgress(item, {
          stage: "validating",
          index: index,
          total: item.files.length,
          originalName: originalName
        });
        const result = await importer.preparePhotoImport(file, Object.assign({}, importOptions, {
          projectId: before.projectId,
          id: id
        }));
        if (!result || !isRecord(result.metadata) || result.originalBlob !== file || result.metadata.projectId !== before.projectId || result.metadata.id !== id) {
          throw makeError("INVALID_PHOTO_IMPORT_RESULT", "照片驗證模組未保留呼叫當下的 Blob 與 Asset identity。");
        }
        preparedFiles.push(result);
        reportPhotoProgress(item, {
          stage: "validated",
          index: index,
          total: item.files.length,
          originalName: result.metadata.originalName,
          assetId: id
        });
      }

      const existingByHash = new Map(before.assets
        .filter(function (asset) { return asset.role === "photoOriginal"; })
        .map(function (asset) { return [asset.sha256, asset]; }));
      const verifiedExistingIds = new Set();
      for (let index = 0; index < preparedFiles.length; index += 1) {
        const result = preparedFiles[index];
        const existing = existingByHash.get(result.metadata.sha256);
        if (!existing || verifiedExistingIds.has(existing.id)) continue;
        await verifyExistingPhoto(before, existing, importOptions);
        verifiedExistingIds.add(existing.id);
      }

      const raw = deps.bridge.applyCommand(before, item.type, item.type === "addShotPhotos"
        ? [item.shotId, preparedFiles.map(function (result) { return result.metadata; })]
        : [item.shotId, item.previousAssetId, preparedFiles[0].metadata],
      { newId: newIdFactory(before) });
      const bridged = validateBridgeResult(raw, before);
      const currentRevision = before.revision;
      const bridgeValue = isRecord(bridged.value) ? bridged.value : { value: bridged.value };
      if (!bridged.changed) {
        item.prepared = {
          noop: true,
          value: Object.assign({}, bridgeValue, { revision: currentRevision }),
          type: item.type
        };
        return item.prepared;
      }

      const candidate = candidateWithRevision(bridged.project, currentRevision + 1);
      const baseHashes = new Set(before.assets.filter(function (asset) { return asset.role === "photoOriginal"; }).map(function (asset) { return asset.sha256; }));
      const writesByHash = new Map();
      preparedFiles.forEach(function (result) {
        if (!baseHashes.has(result.metadata.sha256) && !writesByHash.has(result.metadata.sha256)) {
          writesByHash.set(result.metadata.sha256, { id: result.metadata.id, blob: result.originalBlob });
        }
      });
      const candidateById = new Map(candidate.assets.map(function (asset) { return [asset.id, asset]; }));
      const assetWrites = Array.from(writesByHash.values()).filter(function (write) {
        return candidateById.has(write.id);
      });
      const historyResult = deps.history.recordCreativeCommand({
        beforeProject: before,
        afterProject: candidate,
        state: historyState,
        entries: historyEntries,
        entryId: item.commandId,
        kind: item.type
      });
      const historyBundle = makeHistoryBundle(historyResult);
      item.prepared = {
        noop: false,
        type: item.type,
        value: Object.assign({}, bridgeValue, { revision: candidate.revision }),
        before: before,
        candidate: candidate,
        history: makeHistoryData(item.type, before, candidate),
        historyDelta: makeHistoryDelta(before.revision, historyResult),
        expectedHistory: makeExpectedHistorySnapshot(historyState, historyEntries),
        historyBundle: historyBundle,
        assetWrites: assetWrites,
        baseRevision: before.revision
      };
      return item.prepared;
    }

    function assertDrawingQueueContext(item, before) {
      if (before.projectId !== item.projectId) throw makeError("PROJECT_CHANGED", "Drawing 命令所屬專案已切換；沒有套用到其他專案。");
      if (!currentLeaseValid && !paused) throw tagStorageError(makeError("LEASE_LOST", "專案目前沒有有效編輯權。"));
      if (!historyReady || !historyState) throw historyUnavailable(historyFailure || makeError("HISTORY_STATE_MISSING", "尚未載入可驗證的 history state。"));
    }

    async function prepareDrawingCreate(item) {
      if (item.prepared) return item.prepared;
      const before = deps.schema.validateProject(currentProject);
      assertDrawingQueueContext(item, before);
      if (Number.isInteger(item.expectedRevision) && before.revision !== item.expectedRevision) {
        throw makeError("DRAWING_TARGET_REVISION_CHANGED", "專案已更新；沒有建立 Drawing，請重新載入後再試。" );
      }
      const shot = before.shots.find(function (candidate) { return candidate.id === item.shotId; });
      if (!shot) throw makeError("SHOT_NOT_FOUND", "分鏡不存在。");
      if (item.backgroundAssetId !== null) {
        if (shot.assetIds.indexOf(item.backgroundAssetId) < 0) throw makeError("SHOT_ASSET_NOT_FOUND", "Drawing 底圖必須是所屬分鏡目前引用的照片。");
        const photo = before.assets.find(function (asset) { return asset.id === item.backgroundAssetId; });
        if (!photo || photo.role !== "photoOriginal") throw makeError("INVALID_BACKGROUND_ASSET", "Drawing 底圖只能使用 photoOriginal Asset。");
        await loadVerifiedAsset(before, photo);
      }

      // A draft action that leaves the default Drawing unchanged must stay local.
      // Validate first so malformed no-op patches still fail like bridge commands.
      const initialEdit = item.initialEdit;
      if (initialEdit) {
        let isNoop = false;
        if (initialEdit.kind === "layerState") {
          const patch = initialEdit.patch;
          const keys = Object.keys(patch);
          if (keys.some(function (key) { return key !== "visible" && key !== "locked"; }) ||
              keys.some(function (key) { return typeof patch[key] !== "boolean"; })) {
            throw makeError("INVALID_LAYER_STATE", "圖層狀態只能包含 visible／locked 布林值。");
          }
          isNoop = keys.every(function (key) { return patch[key] === (key === "visible"); });
        } else if (initialEdit.kind === "background") {
          const sourceAssetId = shot.assetIds[0] || null;
          const sourceCrop = sourceAssetId && shot.photoCropsByAssetId && shot.photoCropsByAssetId[sourceAssetId] || null;
          isNoop = initialEdit.assetId === sourceAssetId && stableStringify(item.backgroundCrop) === stableStringify(sourceCrop);
        } else if (initialEdit.kind === "reuseScene") {
          const source = before.drawings.find(function (drawing) { return drawing.id === initialEdit.sourceDrawingId; });
          if (!source) throw makeError("DRAWING_NOT_FOUND", "來源 Drawing 不存在。");
          const sourceScene = source.layers.find(function (layer) { return layer.kind === "scene"; });
          if (!sourceScene) throw makeError("INVALID_DRAWING_LAYERS", "來源 Drawing 缺少 Scene 圖層。");
          isNoop = sourceScene.strokes.length === 0;
        }
        if (isNoop) {
          item.prepared = { noop: true, value: null, type: item.type };
          return item.prepared;
        }
      }

      const createRaw = deps.bridge.applyCommand(before, "createDrawingForShot", [item.shotId], { newId: newIdFactory(before) });
      const created = validateBridgeResult(createRaw, before);
      if (!created.changed || typeof created.value !== "string") throw makeError("DRAWING_CREATE_FAILED", "Drawing bridge 沒有建立新的 Drawing。");
      let combinedProject = created.project;
      let combinedUndoable = created.undoable;
      if (item.backgroundAssetId !== null) {
        if (typeof deps.bridge.applyCommand !== "function") throw makeError("DRAWING_BACKGROUND_UNSUPPORTED", "目前 Drawing bridge 無法綁定照片底圖。");
        const backgroundRaw = deps.bridge.applyCommand(combinedProject, "setDrawingBackground", [created.value, item.backgroundAssetId, item.backgroundCrop], {
          newId: newIdFactory(combinedProject)
        });
        const background = validateBridgeResult(backgroundRaw, combinedProject);
        if (!background.changed) throw makeError("DRAWING_BACKGROUND_UNSUPPORTED", "目前 Drawing bridge 沒有保存照片底圖變更。");
        combinedProject = background.project;
        combinedUndoable = combinedUndoable && background.undoable;
      }
      if (initialEdit) {
        const drawing = combinedProject.drawings.find(function (candidate) { return candidate.id === created.value; });
        if (!drawing) throw makeError("DRAWING_CREATE_FAILED", "找不到新建的 Drawing；沒有提交初始編輯。");
        let type;
        let args;
        if (initialEdit.kind === "stroke") {
          const layer = drawing.layers.find(function (candidate) { return candidate.kind === initialEdit.layerKind; });
          if (!layer) throw makeError("DRAWING_LAYER_NOT_FOUND", "找不到首筆畫的目標圖層。");
          type = "appendDrawingStroke";
          args = [created.value, layer.id, initialEdit.strokeDraft];
        } else if (initialEdit.kind === "layerState") {
          const layer = drawing.layers.find(function (candidate) { return candidate.kind === initialEdit.layerKind; });
          if (!layer) throw makeError("DRAWING_LAYER_NOT_FOUND", "找不到圖層設定的目標圖層。");
          type = "setDrawingLayerState";
          args = [created.value, layer.id, initialEdit.patch];
        } else if (initialEdit.kind === "reuseScene") {
          type = "reuseSceneLayer";
          args = [initialEdit.sourceDrawingId, created.value];
        } else if (initialEdit.kind === "background") {
          if (drawing.backgroundAssetId !== initialEdit.assetId || stableStringify(drawing.backgroundCrop) !== stableStringify(item.backgroundCrop)) {
            type = "setDrawingBackground";
            args = [created.value, initialEdit.assetId, item.backgroundCrop];
          }
        } else if (initialEdit.kind !== "background") {
          throw makeError("INVALID_DRAWING_INITIAL_EDIT", "不支援此 Drawing 初始編輯類型。");
        }
        if (type) {
          const editRaw = deps.bridge.applyCommand(combinedProject, type, args, { newId: newIdFactory(combinedProject) });
          const edit = validateBridgeResult(editRaw, combinedProject);
          combinedProject = edit.project;
          combinedUndoable = combinedUndoable && edit.undoable;
        }
      }
      const combined = { project: combinedProject, changed: true, value: created.value, undoable: combinedUndoable };
      const prepared = prepareBridgeCommand(item, before, combined);
      if (!prepared.noop) prepared.value = created.value;
      return prepared;
    }

    async function prepareDrawingBackground(item) {
      if (item.prepared) return item.prepared;
      const before = deps.schema.validateProject(currentProject);
      assertDrawingQueueContext(item, before);
      if (item.assetId !== null) {
        const drawing = before.drawings.find(function (candidate) { return candidate.id === item.drawingId; });
        if (!drawing) throw makeError("DRAWING_NOT_FOUND", "Drawing 不存在。");
        const shot = before.shots.find(function (candidate) { return candidate.id === drawing.shotId; });
        if (!shot || shot.assetIds.indexOf(item.assetId) < 0) throw makeError("SHOT_ASSET_NOT_FOUND", "Drawing 底圖必須是所屬分鏡目前引用的照片。");
        const photo = before.assets.find(function (asset) { return asset.id === item.assetId; });
        if (!photo || photo.role !== "photoOriginal") throw makeError("INVALID_BACKGROUND_ASSET", "Drawing 底圖只能使用 photoOriginal Asset。");
        await loadVerifiedAsset(before, photo);
      }
      const raw = deps.bridge.applyCommand(before, "setDrawingBackground", [item.drawingId, item.assetId], { newId: newIdFactory(before) });
      return prepareBridgeCommand(item, before, raw);
    }

    function validateNewCandidate(candidate, label) {
      const validated = deps.schema.validateProject(candidate);
      if (validated.revision !== 0) throw makeError("INVALID_NEW_PROJECT_REVISION", label + " 的新專案 revision 必須是 0。");
      return validated;
    }

    function buildDemoProject(projectId) {
      const now = getNowIso();
      const migrated = deps.migrations.migrateLegacyProject(makeDemoLegacy(), {
        projectId: projectId,
        now: function () { return now; },
        idFactory: function (details) { return makeUniqueId(details && details.kind ? details.kind : "project"); }
      });
      migrated.project.revision = 0;
      migrated.project.updatedAt = now;
      return deps.schema.validateProject(migrated.project);
    }

    async function prepareCreate(item) {
      if (!item.candidate) {
        const spec = item.spec;
        if (spec.kind === "migration") {
          const candidate = cloneJson(spec.project);
          candidate.revision = 0;
          if (spec.title !== undefined) candidate.title = spec.title;
          candidate.migrationSource = { sourceKey: spec.sourceKey, sourceRevision: spec.sourceRevision };
          item.candidate = validateNewCandidate(candidate, "遷移候選");
          item.migrationReport = cloneJson(spec.report);
        } else if (spec.demo) {
          const demoProject = buildDemoProject(spec.projectId);
          demoProject.title = spec.title;
          demoProject.projectType = spec.projectType;
          item.candidate = validateNewCandidate(demoProject, "示範專案");
        } else {
          item.candidate = validateNewCandidate(deps.bridge.makeEmptyProject({
            projectId: spec.projectId,
            title: spec.title,
            projectType: spec.projectType,
            now: getNowIso()
          }), "空白專案");
        }
      }
      const projectId = item.candidate.projectId;
      const generation = projectGeneration;
      let claim;
      try {
        claim = await claimLeaseForGeneration(projectId, generation);
        if (claim.stale) throw makeError("LEASE_LOST", "頁面離開或操作切換後，已取消新專案 claim。");
        if (claim.error) throw claim.error;
      } catch (cause) { throw tagStorageError(cause, "LEASE_CONFLICT", "無法取得新專案編輯權。"); }
      let existing;
      try {
        existing = await repository.loadProject(projectId);
        if (!isCurrentGeneration(generation)) throw makeError("LEASE_LOST", "頁面離開或操作切換後，已取消新專案建立。");
      } catch (cause) {
        if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
        throw tagStorageError(cause, "PROJECT_READ_FAILED", "無法確認新專案 ID 是否已使用。");
      }
      if (existing) {
        if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
        throw makeError("PROJECT_EXISTS", "新專案 ID 已存在；請重新建立以產生另一個 ID。");
      }
      item.prepared = {
        noop: false,
        type: item.spec.kind === "migration" ? "confirmMigration" : "createProject",
        value: projectId,
        candidate: item.candidate,
        before: null,
        baseRevision: null,
        history: makeHistoryData(item.spec.kind === "migration" ? "confirmMigration" : "createProject", null, item.candidate),
        historyDelta: {
          expectedStateRevision: null,
          nextState: deps.history.createBaseline(item.candidate),
          entryWrites: [],
          entryDeletes: []
        },
        expectedHistory: makeExpectedHistorySnapshot(null, []),
        historyBundle: { state: deps.history.createBaseline(item.candidate), entries: [] },
        createProject: true,
        projectId: projectId,
        migrationReport: item.migrationReport || null
      };
      return item.prepared;
    }

    async function prepareQueueItem(item) {
      if (item.prepared) return item.prepared;
      if (item.kind === "create") return prepareCreate(item);
      if (item.kind === "photo") return preparePhotoCommand(item);
      if (item.kind === "drawing-create") return prepareDrawingCreate(item);
      if (item.kind === "drawing-background") return prepareDrawingBackground(item);
      return prepareCommand(item);
    }

    async function verifyRetry(item) {
      const prepared = item.prepared;
      const candidate = prepared && prepared.candidate ? prepared.candidate : item.candidate;
      if (!candidate) throw makeError("RETRY_CANDIDATE_MISSING", "保存失敗命令缺少候選資料，請匯出救援並重新載入。");
      if (item.error && item.error.code === "COMMIT_UNCERTAIN") {
        throw makeError("COMMIT_UNCERTAIN", "此命令的提交結果不確定；請重新載入並檢查，不會自動重送。");
      }
      if (item.error && item.error.code === "REVISION_CONFLICT") {
        throw makeError("REVISION_CONFLICT", "資料庫 Project 或 history 已偏離命令的驗證快照；草稿保留，請匯出後重新載入，不會重送舊命令。");
      }
      const projectId = candidate.projectId;
      const generation = projectGeneration;
      let claim = null;
      try {
        await repository.renewLease(projectId);
        ownedLeases.add(projectId);
      } catch (renewError) {
        if (!renewError || renewError.code !== "LEASE_LOST") throw tagStorageError(renewError, "LEASE_LOST", "無法確認保存重試的編輯權。");
        claim = await claimLeaseForGeneration(projectId, generation);
        if (claim.stale) throw tagStorageError(makeError("LEASE_LOST", "頁面離開或操作切換後，已取消保存重試。"));
        if (claim.error) throw tagStorageError(claim.error, "LEASE_CONFLICT", "其他分頁仍持有編輯權。");
      }
      let stored;
      try {
        stored = await repository.loadProject(projectId);
        if (!isCurrentGeneration(generation)) throw makeError("LEASE_LOST", "頁面離開或操作切換後，已取消保存重試。");
        const baseRevision = prepared ? prepared.baseRevision : null;
        if (baseRevision === null) {
          if (stored) throw makeError("COMMIT_UNCERTAIN", "新專案已出現在資料庫；無法確認原 command receipt，請匯出救援後重新載入，不會自動重送。");
          return true;
        }
        if (!stored) throw makeError("REVISION_CONFLICT", "重試前找不到原專案，拒絕覆蓋或重建。");
        if (stored.revision === candidate.revision) {
          throw makeError("COMMIT_UNCERTAIN", "資料庫已到候選 revision，但無法讀取 command receipt；請重新載入並檢查，不會自動重送。");
        }
        if (stored.revision !== baseRevision) {
          throw makeError("REVISION_CONFLICT", "資料庫 revision 已改變；拒絕自動覆蓋外部更新。");
        }
      } catch (cause) {
        if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
        throw isStorageError(cause) ? cause : tagStorageError(cause, cause.code || "PROJECT_READ_FAILED", "重試前無法安全核對目前專案 revision。");
      }
      return true;
    }

    async function commitPrepared(item, prepared) {
      item.commitInFlight = true;
      activeCommitItem = item;
      if (item.kind === "photo") {
        reportPhotoProgress(item, {
          stage: "saving",
          index: item.files.length,
          total: item.files.length,
          originalName: item.files.length === 1 && item.files[0] && item.files[0].name || null
        });
      }
      try {
        await repository.commitTransaction({
          project: prepared.candidate,
          baseRevision: prepared.baseRevision,
          commandId: item.commandId,
          assetWrites: prepared.assetWrites || [],
          history: prepared.history,
          historyDelta: prepared.historyDelta,
          expectedHistory: prepared.expectedHistory,
          snapshot: null
        });
        item.commitTransactionCommitted = true;
      } catch (cause) {
        item.commitInFlight = false;
        item.commitTransactionCommitted = false;
        if (activeCommitItem === item) activeCommitItem = null;
        if (cause && cause.code === "DUPLICATE_COMMAND") {
          throw tagStorageError(makeError("COMMIT_UNCERTAIN", "資料庫已記錄相同 commandId；請重新載入並檢查，不會自動重送。", cause));
        }
        if (cause && [
          "HISTORY_CONTENT_CONFLICT",
          "HISTORY_REVISION_CONFLICT",
          "HISTORY_STATE_MISSING",
          "HISTORY_ENTRY_MISSING",
          "CORRUPT_HISTORY_STATE",
          "CORRUPT_HISTORY_ENTRY"
        ].includes(cause.code)) {
          throw tagStorageError(makeError("REVISION_CONFLICT", "持久 history 已損毀或偏離已驗證快照；草稿已保留，請先匯出並重新載入，不會重送舊命令。", cause));
        }
        throw tagStorageError(cause, "STORAGE_COMMIT_FAILED", "本機專案保存失敗。");
      }
    }

    async function applyCommittedItem(item, prepared) {
      if (prepared.createProject) {
        const previousId = currentProject ? currentProject.projectId : null;
        currentProject = deps.schema.validateProject(prepared.candidate);
        selectedProjectId = currentProject.projectId;
        currentLeaseValid = !item.leaseFailureDuringCommit;
        ownedLeases.add(currentProject.projectId);
        installHistoryBundle(prepared.historyBundle);
        item.committedStateApplied = true;
        paused = false;
        lastSaveError = null;
        if (previousId && previousId !== currentProject.projectId) {
          await releaseLeaseOwnerSafe(previousId);
        }
        if (prepared.migrationReport) {
          migrationReport = cloneJson(prepared.migrationReport);
        } else migrationReport = null;
        migrationPreview = null;
        migrationProject = null;
        migrationReturnPhase = null;
        try { projects = await repository.listProjects(); }
        catch (_) {
          const summary = { projectId: currentProject.projectId, title: currentProject.title, revision: currentProject.revision };
          projects = projects.filter(function (row) { return row.projectId !== summary.projectId; }).concat([summary]);
        }
        setLifecycle({
          phase: currentLeaseValid ? "ready" : "read_only",
          error: item.leaseFailureDuringCommit || null,
          readOnlyReason: currentLeaseValid ? null : (item.leaseFailureReadOnlyReason || "此專案已建立並保存，但編輯權已失效。"),
          migrationPreview: null,
          migrationReport: migrationReport
        });
        emitData({ type: "init" });
        return prepared.value;
      }

      const committedBefore = currentProject;
      currentProject = deps.schema.validateProject(prepared.candidate);
      installHistoryBundle(prepared.historyBundle);
      item.committedStateApplied = true;
      paused = false;
      lastSaveError = null;
      setLifecycle({
        phase: queue.length > 0 ? "saving" : (currentLeaseValid ? "ready" : "read_only"),
        error: item.leaseFailureDuringCommit || null,
        readOnlyReason: currentLeaseValid ? null : (item.leaseFailureReadOnlyReason || "目前命令已保存，但編輯權已失效。")
      });
      emitData({ type: prepared.type, commandId: item.commandId, previousRevision: committedBefore.revision });
      if (item.kind === "photo") reportPhotoProgress(item, { stage: "saved", revision: currentProject.revision, total: item.files.length });
      return prepared.value;
    }

    function removeFirstItem() {
      if (queue.length) queue.shift();
    }

    function pauseQueue(item, error) {
      paused = true;
      lastSaveError = error;
      item.storageFailed = true;
      item.error = errorInfo(error);
      if (error.code === "LEASE_LOST" || error.code === "LEASE_CONFLICT" || error.code === "REVISION_CONFLICT" || error.code === "COMMIT_UNCERTAIN") {
        if (currentProject && item.prepared && item.prepared.candidate.projectId === currentProject.projectId) currentLeaseValid = false;
      }
      settleReject(item, error);
      setLifecycle({
        phase: "save_failed",
        error: error,
        readOnlyReason: currentLeaseValid ? null : "編輯權或 revision 已失效；請重試核對或重新載入。"
      });
      if (item.kind === "photo") reportPhotoProgress(item, {
        stage: "save_failed",
        total: item.files.length,
        error: { code: error.code, message: error.message }
      });
    }

    function pumpQueue() {
      if (pumping || paused || queue.length === 0 || !repository) return;
      pumping = true;
      setLifecycle({ phase: "saving", error: lifecycle.error && lifecycle.error.code ? lifecycle.error : null });
      (async function () {
        while (queue.length > 0 && !paused) {
          const item = queue[0];
          if (item.generation !== projectGeneration) {
            pauseQueue(item, tagStorageError(makeError("LEASE_LOST", "頁面離開或切換後，已停止提交舊佇列。")));
            break;
          }
          let prepared;
          try {
            prepared = await prepareQueueItem(item);
            if (item.generation !== projectGeneration) {
              pauseQueue(item, tagStorageError(makeError("LEASE_LOST", "頁面離開或切換後，已停止提交舊佇列。")));
              break;
            }
            if (prepared.noop) {
              removeFirstItem();
              settleResolve(item, prepared.value);
              if (item.kind === "photo") reportPhotoProgress(item, { stage: "saved", revision: currentProject ? currentProject.revision : null, total: item.files.length });
              setLifecycle({ phase: queue.length ? "saving" : (currentProject ? (currentLeaseValid ? "ready" : "read_only") : lifecycle.phase), error: null });
              continue;
            }
            if (paused) break;
            await commitPrepared(item, prepared);
            removeFirstItem();
            const value = await applyCommittedItem(item, prepared);
            item.commitInFlight = false;
            item.commitTransactionCommitted = false;
            if (activeCommitItem === item) activeCommitItem = null;
            settleResolve(item, value);
            if (item.leaseFailureDuringCommit) {
              if (queue.length > 0) {
                paused = true;
                lastSaveError = item.leaseFailureDuringCommit;
                postCommitLeaseLoss = { projectId: prepared.candidate.projectId, error: item.leaseFailureDuringCommit };
                setLifecycle({
                  phase: "read_only",
                  error: item.leaseFailureDuringCommit,
                  readOnlyReason: item.leaseFailureReadOnlyReason || "目前命令已保存；後續命令仍未保存，已保留等待明確重試。"
                });
              } else {
                setLifecycle({
                  phase: "read_only",
                  error: item.leaseFailureDuringCommit,
                  readOnlyReason: item.leaseFailureReadOnlyReason || "目前命令已保存；編輯權已失效，請重新取得編輯權。"
                });
              }
              break;
            }
          } catch (cause) {
            if (item.commitTransactionCommitted) {
              const error = normalizeError(cause, "POST_COMMIT_APPLY_FAILED", "命令已提交，但 Model 更新需要重新載入確認。");
              if (!item.committedStateApplied && prepared && prepared.candidate) {
                try { currentProject = deps.schema.validateProject(prepared.candidate); }
                catch (_) { currentProject = cloneJson(prepared.candidate); }
                selectedProjectId = currentProject.projectId;
                try { installHistoryBundle(prepared.historyBundle); }
                catch (historyCause) { clearHistoryBundle(historyCause); }
              }
              item.commitInFlight = false;
              item.commitTransactionCommitted = false;
              if (activeCommitItem === item) activeCommitItem = null;
              currentLeaseValid = false;
              settleResolve(item, prepared ? prepared.value : undefined);
              if (queue[0] === item) removeFirstItem();
              if (queue.length > 0) {
                paused = true;
                lastSaveError = error;
                postCommitLeaseLoss = { projectId: prepared.candidate.projectId, error: error };
              }
              setLifecycle({
                phase: queue.length > 0 ? "read_only" : "read_only",
                error: error,
                readOnlyReason: queue.length > 0
                  ? "命令已提交；後續命令保留未保存，請重新驗證後明確重試。"
                  : "命令已提交；請重新讀取專案以確認目前畫面。"
              });
              break;
            }
            const error = normalizeError(cause, "COMMAND_FAILED", "命令執行失敗。");
            if (isStorageError(error)) {
              pauseQueue(item, error);
              break;
            }
            if (item.kind === "photo") reportPhotoProgress(item, {
              stage: "failed",
              total: item.files.length,
              error: { code: error.code, message: error.message }
            });
            if (queue[0] === item) removeFirstItem();
            settleReject(item, error);
            setLifecycle({
              phase: currentProject ? (currentLeaseValid ? (queue.length ? "saving" : "ready") : "read_only") : (projects.length ? "choosing" : "needs_project_creation"),
              error: error,
              readOnlyReason: currentProject && !currentLeaseValid ? lifecycle.readOnlyReason : null
            });
          }
        }
      })().finally(function () {
        pumping = false;
        if (queue.length === 0 && !paused) {
          const phase = currentProject ? (currentLeaseValid ? "ready" : "read_only") : lifecycle.phase;
          setLifecycle({ phase: phase, error: null });
        } else callLifecycleSubscribers();
        if (queue.length > 0 && !paused) pumpQueue();
      });
    }

    function queueCommand(type, args) {
      try {
        requireInitialized();
        requireProject();
        if (activationPending) throw makeError("PROJECT_ACTIVATING", "專案切換完成前不能提交命令。");
        if (!historyReady || !historyState) throw historyUnavailable(historyFailure || makeError("HISTORY_STATE_MISSING", "尚未載入可驗證的 history state。"));
        if (queue.some(function (pending) { return pending.kind === "create"; })) {
          throw makeError("PROJECT_SWITCH_PENDING", "新專案保存完成前不能把命令排到即將切換的專案。");
        }
        if ((!currentLeaseValid || lifecycle.phase === "read_only") && !paused) throw makeError("READ_ONLY", lifecycle.readOnlyReason || "此專案目前為唯讀。");
        const captured = captureJson(args || []);
        return enqueue({ kind: "command", type: type, args: captured, commandId: randomToken("command") });
      } catch (error) { return Promise.reject(normalizeError(error, "COMMAND_REJECTED", "無法排入命令。")); }
    }

    function snapshotPhotoImportOptions() {
      const source = options && options.photoImportOptions;
      if (!source || !isRecord(source)) return {};
      const copy = Object.assign({}, source);
      if (source.policy && isRecord(source.policy)) {
        copy.policy = Object.assign({}, source.policy);
        if (Array.isArray(source.policy.acceptedMimeTypes)) copy.policy.acceptedMimeTypes = source.policy.acceptedMimeTypes.slice();
      }
      if (source.apis && isRecord(source.apis)) copy.apis = Object.assign({}, source.apis);
      return copy;
    }

    function queuePhotoCommand(type, shotId, previousAssetId, fileInput, commandOptions) {
      try {
        requireInitialized();
        requireProject();
        if (activationPending) throw makeError("PROJECT_ACTIVATING", "專案切換完成前不能提交照片命令。");
        if (!historyReady || !historyState) throw historyUnavailable(historyFailure || makeError("HISTORY_STATE_MISSING", "尚未載入可驗證的 history state。"));
        if (queue.some(function (pending) { return pending.kind === "create"; })) {
          throw makeError("PROJECT_SWITCH_PENDING", "新專案保存完成前不能把照片命令排到即將切換的專案。");
        }
        if ((!currentLeaseValid || lifecycle.phase === "read_only") && !paused) throw makeError("READ_ONLY", lifecycle.readOnlyReason || "此專案目前為唯讀。");

        let files;
        if (type === "addShotPhotos") {
          if (fileInput === null || fileInput === undefined) throw makeError("INVALID_ARGUMENT", "新增照片需要 File 或 FileList。");
          try { files = Array.prototype.slice.call(fileInput); }
          catch (cause) { throw makeError("INVALID_ARGUMENT", "新增照片需要 File 陣列或 FileList。", cause); }
          if (!files || typeof files.length !== "number") throw makeError("INVALID_ARGUMENT", "新增照片需要 File 陣列或 FileList。");
          if (files.length === 0) return Promise.resolve({ addedAssetIds: [], duplicateAssetIds: [], revision: currentProject.revision });
        } else {
          files = [fileInput];
        }
        const callOptions = isRecord(commandOptions) ? commandOptions : {};
        return enqueue({
          kind: "photo",
          type: type,
          projectId: currentProject.projectId,
          shotId: shotId,
          previousAssetId: previousAssetId,
          files: files.slice(),
          onProgress: typeof callOptions.onProgress === "function" ? callOptions.onProgress : null,
          photoImportOptions: snapshotPhotoImportOptions(),
          commandId: randomToken("command")
        });
      } catch (error) { return Promise.reject(normalizeError(error, "PHOTO_COMMAND_REJECTED", "無法排入照片命令。")); }
    }

    function queueDrawingCreate(shotId, selectedBackgroundAssetId, hasBackgroundOverride, initialEdit, expectedRevision, selectedBackgroundCrop, hasBackgroundCropOverride) {
      try {
        requireInitialized();
        requireProject();
        if (activationPending) throw makeError("PROJECT_ACTIVATING", "專案切換完成前不能建立 Drawing。");
        if (!historyReady || !historyState) throw historyUnavailable(historyFailure || makeError("HISTORY_STATE_MISSING", "尚未載入可驗證的 history state。"));
        if (queue.some(function (pending) { return pending.kind === "create"; })) throw makeError("PROJECT_SWITCH_PENDING", "新專案保存完成前不能排入 Drawing 命令。");
        if ((!currentLeaseValid || lifecycle.phase === "read_only") && !paused) throw makeError("READ_ONLY", lifecycle.readOnlyReason || "此專案目前為唯讀。");
        const project = deps.schema.validateProject(currentProject);
        if (Number.isInteger(expectedRevision) && project.revision !== expectedRevision) throw makeError("DRAWING_TARGET_REVISION_CHANGED", "專案已更新；請重新載入後再建立 Drawing。");
        const shot = project.shots.find(function (candidate) { return candidate.id === shotId; });
        if (!shot) throw makeError("SHOT_NOT_FOUND", "分鏡不存在。");
        const backgroundAssetId = hasBackgroundOverride ? selectedBackgroundAssetId : (shot.assetIds[0] || null);
        if (backgroundAssetId !== null && (typeof backgroundAssetId !== "string" || !backgroundAssetId.trim())) {
          throw makeError("INVALID_BACKGROUND_ASSET", "照片底圖 ID 必須是非空字串或 null。");
        }
        if (backgroundAssetId !== null && shot.assetIds.indexOf(backgroundAssetId) < 0) {
          throw makeError("SHOT_ASSET_NOT_FOUND", "Drawing 底圖必須是所屬分鏡目前引用的照片。");
        }
        const shotCrops = shot.photoCropsByAssetId || {};
        const hasExplicitBackgroundCrop = hasBackgroundCropOverride && selectedBackgroundCrop !== undefined;
        const backgroundCrop = hasExplicitBackgroundCrop
          ? (selectedBackgroundCrop === null ? null : deps.schema.validatePhotoCrop(selectedBackgroundCrop, "$.backgroundCrop"))
          : (backgroundAssetId && Object.prototype.hasOwnProperty.call(shotCrops, backgroundAssetId)
            ? deps.schema.validatePhotoCrop(shotCrops[backgroundAssetId], "$.shot.photoCropsByAssetId." + backgroundAssetId)
            : null);
        if (backgroundAssetId === null && backgroundCrop !== null) {
          throw makeError("INVALID_DRAWING_BACKGROUND_CROP", "沒有照片底圖時 backgroundCrop 必須是 null。");
        }
        return enqueue({
          kind: "drawing-create",
          type: "createDrawingForShot",
          projectId: project.projectId,
          shotId: shotId,
          backgroundAssetId: backgroundAssetId,
          backgroundCrop: backgroundCrop,
          initialEdit: initialEdit ? captureJson(initialEdit) : null,
          expectedRevision: Number.isInteger(expectedRevision) ? expectedRevision : null,
          commandId: randomToken("command")
        });
      } catch (error) { return Promise.reject(normalizeError(error, "DRAWING_COMMAND_REJECTED", "無法建立 Drawing。")); }
    }

    function queueDrawingCreateWithInitialEdit(shotId, initialEdit, expectedRevision, backgroundCrop) {
      try {
        if (!isRecord(initialEdit)) throw makeError("INVALID_DRAWING_INITIAL_EDIT", "建立 Drawing 需要有效的初始編輯。");
        if (["stroke", "layerState", "background", "reuseScene"].indexOf(initialEdit.kind) < 0) {
          throw makeError("INVALID_DRAWING_INITIAL_EDIT", "不支援此 Drawing 初始編輯類型。");
        }
        if (initialEdit.kind === "stroke" && (!['scene', 'subject'].includes(initialEdit.layerKind) || !isRecord(initialEdit.strokeDraft))) {
          throw makeError("INVALID_DRAWING_INITIAL_EDIT", "首筆畫需要有效圖層與筆畫資料。");
        }
        if (initialEdit.kind === "layerState" && (!['scene', 'subject'].includes(initialEdit.layerKind) || !isRecord(initialEdit.patch))) {
          throw makeError("INVALID_DRAWING_INITIAL_EDIT", "圖層設定需要有效圖層與狀態。");
        }
        if (initialEdit.kind === "background" && initialEdit.assetId !== null && (typeof initialEdit.assetId !== "string" || !initialEdit.assetId.trim())) {
          throw makeError("INVALID_DRAWING_INITIAL_EDIT", "底圖 ID 必須是非空字串或 null。");
        }
        if (initialEdit.kind === "reuseScene" && (typeof initialEdit.sourceDrawingId !== "string" || !initialEdit.sourceDrawingId.trim())) {
          throw makeError("INVALID_DRAWING_INITIAL_EDIT", "場景沿用需要有效來源 Drawing。");
        }
        if (!Number.isInteger(expectedRevision)) throw makeError("INVALID_DRAWING_INITIAL_EDIT", "建立 Drawing 需要有效的 Project revision。");
        const hasBackgroundOverride = initialEdit.kind === "background";
        return queueDrawingCreate(shotId, hasBackgroundOverride ? initialEdit.assetId : null, hasBackgroundOverride,
          initialEdit, expectedRevision, backgroundCrop, arguments.length > 3);
      } catch (error) { return Promise.reject(normalizeError(error, "DRAWING_COMMAND_REJECTED", "無法建立 Drawing 與初始編輯。")); }
    }

    function queueDrawingBackground(drawingId, assetId) {
      try {
        requireInitialized();
        requireProject();
        if (activationPending) throw makeError("PROJECT_ACTIVATING", "專案切換完成前不能變更 Drawing 底圖。");
        if (!historyReady || !historyState) throw historyUnavailable(historyFailure || makeError("HISTORY_STATE_MISSING", "尚未載入可驗證的 history state。"));
        if (queue.some(function (pending) { return pending.kind === "create"; })) throw makeError("PROJECT_SWITCH_PENDING", "新專案保存完成前不能排入 Drawing 命令。");
        if ((!currentLeaseValid || lifecycle.phase === "read_only") && !paused) throw makeError("READ_ONLY", lifecycle.readOnlyReason || "此專案目前為唯讀。");
        if (assetId !== null && (typeof assetId !== "string" || !assetId.trim())) {
          throw makeError("INVALID_BACKGROUND_ASSET", "底圖 Asset ID 必須是非空字串或 null。");
        }
        return enqueue({
          kind: "drawing-background",
          type: "setDrawingBackground",
          projectId: currentProject.projectId,
          drawingId: drawingId,
          assetId: assetId,
          commandId: randomToken("command")
        });
      } catch (error) { return Promise.reject(normalizeError(error, "DRAWING_COMMAND_REJECTED", "無法排入 Drawing 底圖命令。")); }
    }

    async function getAsset(projectId, assetId) {
      requireInitialized();
      requireProject();
      const project = deps.schema.validateProject(currentProject);
      if (projectId !== project.projectId) throw makeError("PROJECT_NOT_FOUND", "只能讀取目前已開啟專案的 Asset。");
      const metadata = project.assets.find(function (asset) { return asset.id === assetId; });
      if (!metadata) return null;
      return loadVerifiedAsset(project, metadata);
    }

    async function getShotPhoto(shotId, assetId) {
      requireInitialized();
      requireProject();
      const project = deps.schema.validateProject(currentProject);
      const shot = project.shots.find(function (item) { return item.id === shotId; });
      if (!shot) throw makeError("SHOT_NOT_FOUND", "分鏡不存在。");
      if (shot.assetIds.indexOf(assetId) < 0) throw makeError("SHOT_ASSET_NOT_FOUND", "此分鏡目前沒有引用這張照片。");
      const metadata = project.assets.find(function (asset) { return asset.id === assetId; });
      if (!metadata || metadata.role !== "photoOriginal") throw makeError("INVALID_SHOT_PHOTO_ASSET", "Shot 只能讀取 photoOriginal Asset。");
      const loaded = await loadVerifiedAsset(project, metadata);
      loaded.shotId = shotId;
      return loaded;
    }

    function getDrawing(drawingId) {
      requireInitialized();
      requireProject();
      const project = deps.schema.validateProject(currentProject);
      const drawing = project.drawings.find(function (item) { return item.id === drawingId; });
      if (!drawing) throw makeError("DRAWING_NOT_FOUND", "Drawing 不存在。");
      const shot = project.shots.find(function (item) { return item.id === drawing.shotId; });
      if (!shot || shot.drawingIds.indexOf(drawing.id) < 0) throw makeError("SHOT_DRAWING_MISMATCH", "Drawing 不屬於其宣告的 Shot。");
      return cloneJson(drawing);
    }

    function getDrawingsForShot(shotId) {
      requireInitialized();
      requireProject();
      const project = deps.schema.validateProject(currentProject);
      const shot = project.shots.find(function (item) { return item.id === shotId; });
      if (!shot) throw makeError("SHOT_NOT_FOUND", "分鏡不存在。");
      return shot.drawingIds.map(function (drawingId) { return getDrawing(drawingId); });
    }

    function queueCreate(spec) {
      try {
        requireInitialized();
        if (!paused && queue.length > 0 && !pumping) pumpQueue();
        return enqueue({ kind: "create", spec: captureJson(spec), commandId: randomToken("command") });
      } catch (error) { return Promise.reject(normalizeError(error, "CREATE_REJECTED", "無法建立專案。")); }
    }

    async function retryPending() {
      requireInitialized();
      if (!paused || queue.length === 0) return false;
      const item = queue[0];
      if (postCommitLeaseLoss && !item.storageFailed) {
        const recovery = postCommitLeaseLoss;
        const projectId = recovery.projectId;
        const generation = projectGeneration;
        if (!currentProject || currentProject.projectId !== projectId) {
          throw makeError("REVISION_CONFLICT", "待處理命令所屬專案已切換；請匯出救援後重新載入。");
        }
        setLifecycle({ phase: "save_failed", error: recovery.error, readOnlyReason: "保存交易已成功；正在重新驗證後續命令。" });
        let claim = null;
        try {
          try { await repository.renewLease(projectId); }
          catch (renewError) {
            if (!renewError || renewError.code !== "LEASE_LOST") throw renewError;
            claim = await claimLeaseForGeneration(projectId, generation);
            if (claim.stale) throw makeError("OPERATION_STALE", "重試已被頁面切換或關閉取消。");
            if (claim.error) throw claim.error;
          }
          if (!isCurrentGeneration(generation)) throw makeError("OPERATION_STALE", "重試已被頁面切換或關閉取消。");
          const stored = await repository.loadProject(projectId);
          if (!isCurrentGeneration(generation)) throw makeError("OPERATION_STALE", "重試已被頁面切換或關閉取消。");
          if (!stored) throw makeError("PROJECT_NOT_FOUND", "重試前找不到目前專案。");
          const latest = deps.schema.validateProject(stored);
          if (stableStringify(latest) !== stableStringify(currentProject)) {
            if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
            else await releaseLeaseOwnerSafe(projectId);
            currentLeaseValid = false;
            throw makeError("REVISION_CONFLICT", "專案已在其他位置改變；拒絕套用未保存命令，請先匯出救援並重新載入。");
          }
          ownedLeases.add(projectId);
          leaseClaimGenerations.set(projectId, generation);
          currentLeaseValid = true;
          paused = false;
          lastSaveError = null;
          postCommitLeaseLoss = null;
          queue.forEach(function (queued) { queued.generation = generation; });
          const completion = waitForRetry(item);
          setLifecycle({ phase: "saving", error: null, readOnlyReason: null });
          pumpQueue();
          return completion;
        } catch (cause) {
          if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
          const error = normalizeError(cause, "RETRY_FAILED", "無法安全重試保存。");
          currentLeaseValid = false;
          paused = true;
          lastSaveError = error;
          setLifecycle({ phase: "save_failed", error: error, readOnlyReason: "未保存命令仍保留；專案內容不同時不會自動套用。" });
          throw error;
        }
      }
      if (!item.storageFailed) throw makeError("NO_RETRYABLE_COMMAND", "目前沒有可重試的保存命令。");
      setLifecycle({ phase: "saving", error: null, readOnlyReason: null });
      try {
        if (!item.prepared) {
          const prepared = await prepareQueueItem(item);
          if (prepared.noop) {
            removeFirstItem();
            paused = false;
            lastSaveError = null;
            settleResolve(item, prepared.value);
            setLifecycle({ phase: currentProject ? (currentLeaseValid ? "ready" : "read_only") : "choosing", error: null });
            return prepared.value;
          }
        }
        await verifyRetry(item);
      }
      catch (cause) {
        const error = normalizeError(cause, "RETRY_FAILED", "無法安全重試保存。");
        lastSaveError = error;
        if (error.code === "LEASE_CONFLICT" || error.code === "LEASE_LOST" || error.code === "REVISION_CONFLICT" || error.code === "COMMIT_UNCERTAIN") {
          if (currentProject && item.prepared && item.prepared.candidate.projectId === currentProject.projectId) currentLeaseValid = false;
        }
        setLifecycle({ phase: "save_failed", error: error, readOnlyReason: currentLeaseValid ? null : "無法確認編輯權或資料庫 revision。" });
        throw error;
      }
      if (currentProject && item.prepared.candidate.projectId === currentProject.projectId) currentLeaseValid = true;
      delete item.leaseFailureDuringCommit;
      delete item.leaseFailureReadOnlyReason;
      paused = false;
      lastSaveError = null;
      queue.forEach(function (queued) { queued.generation = projectGeneration; });
      const completion = waitForRetry(item);
      pumpQueue();
      return completion;
    }

    async function cancelPending(cancelOptions) {
      const opts = cancelOptions || {};
      if (opts.confirm !== true) throw makeError("CONFIRMATION_REQUIRED", "放棄未保存命令前必須由使用者明確確認。");
      if (pumping && !paused) throw makeError("SAVE_IN_PROGRESS", "目前有 IndexedDB transaction 正在執行，完成或失敗後才能取消。");
      if (queue.length === 0) return false;
      const discarded = queue.splice(0);
      paused = false;
      lastSaveError = null;
      postCommitLeaseLoss = null;
      for (const item of discarded) {
        const error = makeError("COMMAND_CANCELLED", "使用者明確放棄此未保存命令。");
        settleReject(item, error);
        if (item.candidate && ownedLeases.has(item.candidate.projectId) && (!currentProject || currentProject.projectId !== item.candidate.projectId)) {
          await releaseLeaseOwnerSafe(item.candidate.projectId);
        }
      }
      migrationConfirmPending = false;
      setLifecycle({ phase: currentProject ? (currentLeaseValid ? "ready" : "read_only") : (projects.length ? "choosing" : "needs_project_creation"), error: null });
      return true;
    }

    async function selectProject(projectId) {
      requireInitialized();
      requireCanSwitch();
      if (typeof projectId !== "string" || !projectId.trim()) throw makeError("INVALID_PROJECT_ID", "請選擇有效的 projectId。");
      const generation = beginProjectOperation();
      activationPending = true;
      setLifecycle({ phase: "opening", error: null, readOnlyReason: null });
      try {
        const project = await repository.loadProject(projectId);
        if (!isCurrentGeneration(generation)) throw makeError("OPERATION_STALE", "專案切換已被新的操作取代。");
        if (!project) throw makeError("PROJECT_NOT_FOUND", "所選專案不存在；沒有建立或覆寫任何資料。");
        // Validate before changing the active selection or releasing its lease.
        deps.schema.validateProject(project);
        const summaries = await repository.listProjects();
        if (!isCurrentGeneration(generation)) throw makeError("OPERATION_STALE", "專案清單讀取已被新的操作取代。");
        projects = summaries;
        return await loadAndActivate(project, summaries, generation);
      } catch (cause) {
        if (!isCurrentGeneration(generation)) throw normalizeError(cause, "OPERATION_STALE", "專案切換已被新的操作取代。");
        activationPending = false;
        const error = normalizeError(cause, "PROJECT_READ_FAILED", "無法開啟所選專案。");
        const phase = currentProject ? (currentLeaseValid ? "ready" : "read_only") : (initialized ? (projects.length ? "choosing" : "needs_project_creation") : "error");
        setLifecycle({
          phase: phase,
          error: error,
          readOnlyReason: currentProject && !currentLeaseValid ? lifecycle.readOnlyReason : null
        });
        throw error;
      }
    }

    function createProject(createOptions) {
      const value = createOptions || {};
      try {
        requireInitialized();
        requireCanSwitch();
        const isDemo = value.demo === true;
        const title = value.title === undefined || value.title === null
          ? (isDemo ? "分鏡示範專案" : "")
          : value.title;
        if (typeof title !== "string" || !title.trim()) throw makeError("INVALID_TITLE", "專案名稱不可空白。");
        const projectType = value.projectType === undefined ? "" : value.projectType;
        if (typeof projectType !== "string") throw makeError("INVALID_PROJECT_TYPE", "專案類型必須是文字。");
        return queueCreate({
          kind: "new",
          projectId: makeUniqueId("project"),
          title: title.trim(),
          projectType: projectType.trim(),
          demo: isDemo
        });
      } catch (error) { return Promise.reject(normalizeError(error, "CREATE_REJECTED", "無法建立專案。")); }
    }

    async function confirmMigration(confirmOptions) {
      requireInitialized();
      requireCanSwitch();
      if (migrationConfirmPending) throw makeError("MIGRATION_CONFIRM_PENDING", "舊稿建立確認正在處理。");
      if (!migrationProject || !migrationPreview || legacySourceRaw === null) throw makeError("NO_MIGRATION_PREVIEW", "目前沒有可確認的舊稿預覽。");
      const confirmTitle = confirmOptions && Object.prototype.hasOwnProperty.call(confirmOptions, "title")
        ? confirmOptions.title
        : undefined;
      if (confirmTitle !== undefined && (typeof confirmTitle !== "string" || !confirmTitle.trim())) {
        throw makeError("INVALID_TITLE", "新專案名稱不可空白。");
      }
      migrationConfirmPending = true;
      try {
        const latest = deps.storage.readLegacyRaw(getLegacyStorage());
        if (!latest.found || latest.key !== legacySourceKey || latest.raw !== legacySourceRaw) {
          legacySourceRaw = latest.raw;
          await refreshMigrationPreview();
          throw makeError("LEGACY_SOURCE_CHANGED", "舊版草稿在預覽後已變更；已更新預覽，請再次確認。");
        }
        const report = cloneJson(migrationReport);
        report.projectId = migrationProject.projectId;
        const spec = {
          kind: "migration",
          project: cloneJson(migrationProject),
          report: report,
          sourceKey: legacySourceKey,
          sourceRevision: report.sourceRevision,
          title: confirmTitle === undefined ? undefined : confirmTitle.trim()
        };
        return await queueCreate(spec);
      } finally {
        migrationConfirmPending = false;
      }
    }

    async function cancelMigration() {
      try {
        requireInitialized();
        if (migrationConfirmPending) throw makeError("MIGRATION_CONFIRM_PENDING", "舊稿建立確認正在處理。");
        migrationProject = null;
        migrationPreview = null;
        migrationReport = null;
        const phase = migrationReturnPhase || nonMigrationPhase();
        migrationReturnPhase = null;
        setLifecycle({ phase: phase, error: null, migrationPreview: null, migrationReport: null, readOnlyReason: currentProject && !currentLeaseValid ? lifecycle.readOnlyReason : null });
        return lifecycleSnapshot();
      } catch (error) { throw normalizeError(error, "MIGRATION_CANCEL_FAILED", "無法取消遷移預覽。"); }
    }

    function emitData(event) {
      if (!currentProject) return;
      const base = deps.bridge.projectToUi(deps.schema.validateProject(currentProject));
      dataSubscribers.forEach(function (subscriber) {
        try {
          subscriber(cloneJson(base), Object.assign({}, event || {}, {
            projectId: currentProject.projectId,
            revision: currentProject.revision,
            saveStatus: currentSaveStatus()
          }));
        } catch (error) { reportSubscriberError("data", error); }
      });
    }

    function getState() {
      if (!currentProject) return null;
      return cloneJson(deps.bridge.projectToUi(deps.schema.validateProject(currentProject)));
    }

    function getProject() { return currentProject ? cloneJson(currentProject) : null; }

    function resolveShotNumbers() {
      requireProject();
      return deps.bridge.resolveShotNumbers(deps.schema.validateProject(currentProject));
    }

    function previewShotRenumber(sceneId) {
      requireProject();
      return deps.bridge.previewShotRenumber(deps.schema.validateProject(currentProject), sceneId);
    }

    function getTimeline(dayId) {
      if (!currentProject) throw makeError("NOT_READY", "尚未載入可讀專案，無法計算拍攝時間軸。");
      const state = deps.bridge.projectToUi(deps.schema.validateProject(currentProject));
      const day = state.days.find(function (item) { return item.id === dayId; });
      if (!day) throw makeError("SHOOTING_DAY_NOT_FOUND", "拍攝日不存在。");
      const entries = state.entries.filter(function (entry) { return entry.dayId === dayId; });
      const parseMinutes = function (value, label) {
        if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw makeError("INVALID_TIME", label + "格式無效。");
        return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
      };
      const timeline = [];
      const occupiedRanges = [];
      const gapCandidates = [];
      const overlapWithOccupied = function (start, end, occupiedRanges) {
        let minutes = 0;
        occupiedRanges.forEach(function (range) {
          const overlapStart = Math.max(start, range.start);
          const overlapEnd = Math.min(end, range.end);
          if (overlapEnd > overlapStart) minutes += overlapEnd - overlapStart;
        });
        return minutes;
      };
      const addOccupiedRange = function (start, end, occupiedRanges) {
        if (end <= start) return;
        let rangeStart = start;
        let rangeEnd = end;
        let index = 0;
        while (index < occupiedRanges.length && occupiedRanges[index].end < rangeStart) index += 1;
        while (index < occupiedRanges.length && occupiedRanges[index].start <= rangeEnd) {
          rangeStart = Math.min(rangeStart, occupiedRanges[index].start);
          rangeEnd = Math.max(rangeEnd, occupiedRanges[index].end);
          occupiedRanges.splice(index, 1);
        }
        occupiedRanges.splice(index, 0, { start: rangeStart, end: rangeEnd });
      };
      const freeRangesIn = function (start, end, occupiedRanges) {
        const freeRanges = [];
        let cursor = start;
        occupiedRanges.forEach(function (range) {
          if (range.end <= cursor || range.start >= end) return;
          const occupiedStart = Math.max(start, range.start);
          const occupiedEnd = Math.min(end, range.end);
          if (occupiedStart > cursor) freeRanges.push({ startOffset: cursor, endOffset: occupiedStart });
          cursor = Math.max(cursor, occupiedEnd);
        });
        if (cursor < end) freeRanges.push({ startOffset: cursor, endOffset: end });
        return freeRanges;
      };
      let cursor = 0;
      let known = true;
      entries.forEach(function (entry) {
        if (entry.timingMode === "fixed") {
          const startOffset = parseMinutes(entry.startTime, "拍攝開始時間") - parseMinutes(day.start, "拍攝日開始時間") + (entry.startNextDay === true ? 1440 : 0);
          const endOffset = startOffset + entry.minutes;
          const gapMinutes = known ? Math.max(0, startOffset - cursor) : 0;
          const overlapMinutes = overlapWithOccupied(startOffset, endOffset, occupiedRanges);
          const orderWarning = known && startOffset < cursor && overlapMinutes === 0
            ? timeline.length === 0 ? "before_day_start" : "before_previous_schedule"
            : null;
          const slot = { entryId: entry.id, startOffset: startOffset, endOffset: endOffset, minutes: entry.minutes, gapMinutes: gapMinutes, overlapMinutes: overlapMinutes, unknown: false };
          if (orderWarning) slot.orderWarning = orderWarning;
          timeline.push(slot);
          if (known && startOffset > cursor) gapCandidates.push({ slot: slot, start: cursor, end: startOffset });
          cursor = known ? Math.max(cursor, endOffset) : endOffset;
          known = true;
          addOccupiedRange(startOffset, endOffset, occupiedRanges);
          return;
        }
        const durationUnknown = entry.type === "shot" && entry.minutes === 0;
        if (!known) {
          timeline.push({ entryId: entry.id, startOffset: null, endOffset: null, minutes: entry.minutes, gapMinutes: 0, overlapMinutes: 0, unknown: true });
          return;
        }
        if (durationUnknown) {
          timeline.push({ entryId: entry.id, startOffset: cursor, endOffset: null, minutes: entry.minutes, gapMinutes: 0, overlapMinutes: 0, unknown: true });
          known = false;
          return;
        }
        const startOffset = cursor;
        const endOffset = startOffset + entry.minutes;
        const overlapMinutes = overlapWithOccupied(startOffset, endOffset, occupiedRanges);
        timeline.push({ entryId: entry.id, startOffset: startOffset, endOffset: endOffset, minutes: entry.minutes, gapMinutes: 0, overlapMinutes: overlapMinutes, unknown: false });
        cursor = endOffset;
        addOccupiedRange(startOffset, endOffset, occupiedRanges);
      });
      gapCandidates.forEach(function (candidate) {
        const intervals = freeRangesIn(candidate.start, candidate.end, occupiedRanges);
        candidate.slot.gapMinutes = intervals.reduce(function (total, interval) { return total + interval.endOffset - interval.startOffset; }, 0);
        if (intervals.length) candidate.slot.gapIntervals = intervals;
      });
      return timeline;
    }

    function subscribe(fn) {
      if (typeof fn !== "function") throw makeError("INVALID_ARGUMENT", "subscribe 需要函式回呼。");
      dataSubscribers.add(fn);
      if (currentProject) {
        try {
          fn(getState(), { type: "init", projectId: currentProject.projectId, revision: currentProject.revision, saveStatus: currentSaveStatus() });
        } catch (error) { reportSubscriberError("data", error); }
      }
      return function unsubscribe() { dataSubscribers.delete(fn); };
    }

    function subscribeLifecycle(fn) {
      if (typeof fn !== "function") throw makeError("INVALID_ARGUMENT", "subscribeLifecycle 需要函式回呼。");
      lifecycleSubscribers.add(fn);
      try { fn(lifecycleSnapshot()); } catch (error) { reportSubscriberError("lifecycle", error); }
      return function unsubscribe() { lifecycleSubscribers.delete(fn); };
    }

    function setDraftSnapshot(snapshot) {
      draftsSnapshot = captureJson(snapshot === undefined ? [] : snapshot);
      callLifecycleSubscribers();
      return lifecycleSnapshot().rescueAvailable;
    }

    function packageServices() {
      const service = deps.projectPackage || (root && root.DirectorStoryboardProjectPackage);
      const zipAdapter = deps.zipAdapter || (root && root.DirectorStoryboardZipAdapter);
      if (!service || typeof service.exportProjectPackage !== "function" ||
          typeof service.parseProjectPackage !== "function" || !zipAdapter ||
          typeof zipAdapter.encode !== "function" || typeof zipAdapter.decode !== "function") {
        throw makeError("PACKAGE_SUPPORT_UNAVAILABLE", "完整專案包模組尚未載入；請檢查 project-package、ZIP adapter 與 fflate script 順序。");
      }
      return { projectPackage: service, zipAdapter: zipAdapter };
    }

    function completePackageOptions(callOptions, zipAdapter) {
      if (callOptions !== undefined && callOptions !== null && !isRecord(callOptions)) {
        throw makeError("INVALID_PACKAGE_OPTIONS", "完整專案包操作選項必須是一般物件。");
      }
      if (callOptions && callOptions.packageOptions !== undefined && !isRecord(callOptions.packageOptions)) {
        throw makeError("INVALID_PACKAGE_OPTIONS", "packageOptions 必須是一般物件。");
      }
      if (options && options.projectPackageOptions !== undefined && !isRecord(options.projectPackageOptions)) {
        throw makeError("INVALID_PACKAGE_OPTIONS", "initialize 的 projectPackageOptions 必須是一般物件。");
      }
      const configured = Object.assign({}, options && options.projectPackageOptions || {},
        callOptions && callOptions.packageOptions || {});
      configured.schema = deps.schema;
      configured.zipAdapter = configured.zipAdapter || zipAdapter;
      configured.crypto = configured.crypto || options && options.crypto || root && root.crypto;
      configured.signal = callOptions && callOptions.signal || null;
      configured.keepWorkerCopyTicket = !!(callOptions && callOptions.mode === "copy");
      return configured;
    }

    function requireNoUncommittedPackageWork() {
      if (activationPending || migrationConfirmPending) {
        throw makeError("PROJECT_ACTIVATING", "專案切換或舊稿確認進行中，暫時不能匯入或匯出完整專案包。");
      }
      if (queue.length > 0 || paused || pumping || activeCommitItem) {
        throw makeError("PENDING_CHANGES", "目前有尚未完成的保存工作；請先保存或明確處理待保存命令，再匯入或匯出完整專案包。");
      }
      if (hasDrafts()) {
        throw makeError("UNSAVED_DRAFTS", "仍有未提交欄位草稿；請先保存或明確處理草稿，再匯入或匯出完整專案包。");
      }
    }

    function assertPackageSupportForImport() {
      const services = packageServices();
      if (!repository || typeof repository.importProjectPackage !== "function") {
        throw makeError("PACKAGE_IMPORT_UNAVAILABLE", "Repository 未提供原子完整專案包匯入介面。");
      }
      return services;
    }

    function packagePreview(verified, mode) {
      const project = verified.project;
      return {
        mode: mode,
        projectId: project.projectId,
        revision: project.revision,
        title: project.title,
        counts: {
          scenes: project.scenes.length,
          shots: project.shots.length,
          shootingDays: project.shootingDays.length,
          scheduleEntries: project.scheduleEntries.length,
          productionTasks: (project.productionTasks || []).length,
          assets: project.assets.length,
          drawings: project.drawings.length
        }
      };
    }

    function validatePackageMode(importOptions) {
      if (importOptions !== undefined && importOptions !== null && !isRecord(importOptions)) {
        throw makeError("INVALID_IMPORT_OPTIONS", "完整專案包操作選項必須是一般物件。");
      }
      const mode = !importOptions || importOptions.mode === undefined ? "restore" : importOptions.mode;
      if (mode !== "restore" && mode !== "copy") {
        throw makeError("INVALID_IMPORT_MODE", "完整專案包匯入 mode 只能是 restore 或 copy。");
      }
      if (importOptions && importOptions.newId !== undefined && typeof importOptions.newId !== "function") {
        throw makeError("INVALID_IMPORT_OPTIONS", "copy 模式的 newId 必須是函式。");
      }
      if (importOptions && importOptions.photoImportOptions !== undefined && !isRecord(importOptions.photoImportOptions)) {
        throw makeError("INVALID_IMPORT_OPTIONS", "photoImportOptions 必須是一般物件。");
      }
      if (importOptions && importOptions.packageOptions !== undefined && !isRecord(importOptions.packageOptions)) {
        throw makeError("INVALID_PACKAGE_OPTIONS", "packageOptions 必須是一般物件。");
      }
      if (mode === "restore" && importOptions && importOptions.targetProjectId !== undefined) {
        throw makeError("INVALID_IMPORT_OPTIONS", "targetProjectId 只能用於 copy 模式。");
      }
      return mode;
    }

    function assertVerifiedPackage(verified) {
      if (!isRecord(verified) || !isRecord(verified.project) || !Array.isArray(verified.assets)) {
        throw makeError("INVALID_PACKAGE", "完整專案包驗證器未回傳 canonical Project 與原圖 bytes。");
      }
      const project = deps.schema.validateProject(verified.project);
      if (verified.projectId !== project.projectId || verified.revision !== project.revision) {
        throw makeError("PACKAGE_IDENTITY_MISMATCH", "已驗證專案包的 projectId/revision 與 canonical Project 不一致。");
      }
      return project;
    }

    function packageCopyService() {
      return deps.packageCopy || (root && root.DirectorStoryboardPackageCopy) || null;
    }

    async function makePackageCopy(verified, importOptions, existingProjectIds, packageService, packageOptions) {
      const service = packageCopyService();
      if (!service || typeof service.createProjectCopy !== "function") {
        throw makeError("PACKAGE_COPY_UNAVAILABLE", "另存副本模組尚未載入。");
      }
      const targetProjectId = importOptions.targetProjectId === undefined
        ? randomToken("project-copy")
        : importOptions.targetProjectId;
      if (typeof targetProjectId !== "string" || !targetProjectId.trim() || targetProjectId !== targetProjectId.trim() || targetProjectId.length > 200) {
        throw makeError("INVALID_PROJECT_ID", "副本 targetProjectId 必須是長度 1–200 的穩定非空 ID。");
      }
      if (existingProjectIds && existingProjectIds.has(targetProjectId)) {
        throw makeError("PROJECT_EXISTS", "副本 targetProjectId 已存在；不會覆寫既有專案。");
      }
      let copied = null;
      if (verified.workerTicket && packageService && typeof packageService.createProjectCopyFromWorker === "function" &&
          typeof importOptions.newId !== "function") {
        try {
          copied = await packageService.createProjectCopyFromWorker(verified.workerTicket, targetProjectId, packageOptions || {});
          delete verified.workerTicket;
          const sourceById = new Map(verified.assets.map(function (asset) { return [asset.id, asset]; }));
          const sourceIdByNew = new Map((copied.idRemap || []).filter(function (entry) { return entry.kind === "asset"; })
            .map(function (entry) { return [entry.to, entry.from]; }));
          copied.assets = copied.project.assets.map(function (metadata) {
            const source = sourceById.get(sourceIdByNew.get(metadata.id));
            if (!source || !source.bytes || source.bytes.byteLength !== metadata.byteLength) {
              throw makeError("INVALID_PACKAGE_COPY", "另存副本的原始 Asset bytes 與 remap metadata 不一致。", { id: metadata.id });
            }
            return {
              projectId: copied.project.projectId,
              id: metadata.id,
              role: metadata.role,
              metadata: cloneJson(metadata),
              bytes: source.bytes
            };
          });
        } catch (error) {
          const signal = packageOptions && packageOptions.signal;
          const expiredTicket = error && error.code === "PACKAGE_COPY_SESSION_EXPIRED";
          if (signal && signal.aborted) throwIfPackageAborted(signal);
          if (!error || (error.workerTransportFailure !== true && !expiredTicket)) throw error;
          delete verified.workerTicket;
          copied = null;
        }
      }
      if (!copied) {
        const newId = typeof importOptions.newId === "function"
          ? importOptions.newId
          : function (kind) { return randomToken("copy-" + kind); };
        copied = service.createProjectCopy(verified, {
          schema: deps.schema,
          newId: newId,
          targetProjectId: targetProjectId
        });
      }
      const project = assertVerifiedPackage(copied);
      if (project.projectId !== targetProjectId || project.revision !== 0) {
        throw makeError("INVALID_PACKAGE_COPY", "副本 remapper 必須保留指定的新 projectId 並從 revision 0 開始。");
      }
      return copied;
    }

    function packageArchiveInput(input, packageOptions, packageService) {
      const maxArchiveBytes = packageOptions.limits && packageOptions.limits.maxArchiveBytes || packageService.DEFAULT_LIMITS.maxArchiveBytes;
      if (input instanceof Uint8Array) {
        if (input.byteLength > maxArchiveBytes) throw makeError("ARCHIVE_SIZE_LIMIT", "ZIP archive 大小超過上限。", { size: input.byteLength, limit: maxArchiveBytes });
        return input;
      }
      if (input instanceof ArrayBuffer) {
        if (input.byteLength > maxArchiveBytes) throw makeError("ARCHIVE_SIZE_LIMIT", "ZIP archive 大小超過上限。", { size: input.byteLength, limit: maxArchiveBytes });
        return input;
      }
      if (ArrayBuffer.isView(input)) {
        if (input.byteLength > maxArchiveBytes) throw makeError("ARCHIVE_SIZE_LIMIT", "ZIP archive 大小超過上限。", { size: input.byteLength, limit: maxArchiveBytes });
        return input;
      }
      const BlobCtor = root && root.Blob;
      const prototype = BlobCtor && BlobCtor.prototype;
      const sizeDescriptor = prototype && Object.getOwnPropertyDescriptor(prototype, "size");
      const nativeArrayBuffer = prototype && prototype.arrayBuffer;
      if (!input || !sizeDescriptor || typeof sizeDescriptor.get !== "function" || typeof nativeArrayBuffer !== "function") {
        throw makeError("INVALID_ARCHIVE_INPUT", "完整專案包必須是原始 bytes 或原生 Blob/File。");
      }
      let size;
      try { size = sizeDescriptor.get.call(input); }
      catch (cause) { throw makeError("INVALID_ARCHIVE_INPUT", "完整專案包必須是原生 Blob/File。", cause); }
      if (!Number.isSafeInteger(size) || size < 0) throw makeError("INVALID_ARCHIVE_INPUT", "完整專案包 Blob 大小無效。");
      if (size > maxArchiveBytes) throw makeError("ARCHIVE_SIZE_LIMIT", "ZIP archive 大小超過上限。", { size: size, limit: maxArchiveBytes });
      return input;
    }

    function assertExportContext(context) {
      requireNoUncommittedPackageWork();
      if (!currentProject || currentProject.projectId !== context.projectId ||
          selectedProjectId !== context.projectId || projectGeneration !== context.generation) {
        throw makeError("PROJECT_CHANGED", "匯出期間目前專案已切換；沒有回傳混合版本的專案包。");
      }
      if (currentProject.revision !== context.revision || stableStringify(currentProject) !== context.projectJson) {
        throw makeError("REVISION_CONFLICT", "匯出期間目前專案 revision 或內容已變更；沒有回傳混合版本的專案包。");
      }
      if (!currentLeaseValid || lifecycle.phase !== "ready") {
        throw makeError("LEASE_LOST", "匯出完整專案包前或匯出期間編輯權已失效。");
      }
    }

    async function verifyExportContext(context) {
      assertExportContext(context);
      if (typeof repository.renewLease !== "function" || typeof repository.loadProject !== "function") {
        throw makeError("PACKAGE_EXPORT_UNSUPPORTED", "Repository 無法核對專案編輯權與固定 revision。");
      }
      try { await serializeLeaseOperation(context.projectId, function () { return repository.renewLease(context.projectId); }); }
      catch (cause) {
        if (currentProject && currentProject.projectId === context.projectId) {
          currentLeaseValid = false;
          const error = normalizeError(cause, "LEASE_LOST", "無法確認專案編輯權。");
          setLifecycle({ phase: "read_only", error: error, readOnlyReason: "匯出完整專案包時無法確認編輯權。" });
        }
        throw normalizeError(cause, "LEASE_LOST", "無法確認專案編輯權。");
      }
      assertExportContext(context);
      const stored = await repository.loadProject(context.projectId);
      assertExportContext(context);
      if (!stored) throw makeError("PROJECT_NOT_FOUND", "固定 revision 的來源專案已不存在。");
      let validated;
      try { validated = deps.schema.validateProject(stored); }
      catch (cause) { throw makeError("CORRUPT_PROJECT", "Repository 目前資料未通過 Project schema 驗證。", cause); }
      if (validated.projectId !== context.projectId || validated.revision !== context.revision ||
          stableStringify(validated) !== context.projectJson) {
        throw makeError("REVISION_CONFLICT", "匯出期間 Repository 中的專案內容或 revision 已變更。");
      }
    }

    async function loadPackageAsset(project, metadata) {
      if (metadata.state !== "available") throw makeError("ASSET_MISSING", "完整專案包不可省略 missing Asset。", { id: metadata.id });
      if (!repository || typeof repository.loadAsset !== "function") {
        throw makeError("ASSET_LOAD_UNSUPPORTED", "Repository 未提供完整專案包需要的 Asset 讀取介面。");
      }
      const record = await repository.loadAsset(project.projectId, metadata.id);
      if (!record) throw makeError("ASSET_MISSING", "Project metadata 存在，但原圖 Blob 不存在。", { id: metadata.id });
      if (!isRecord(record) || record.projectId !== project.projectId || record.id !== metadata.id || !isRecord(record.metadata)) {
        throw makeError("CORRUPT_ASSET", "Repository Asset identity 無效。", { id: metadata.id });
      }
      if (stableStringify(record.metadata) !== stableStringify(metadata)) {
        throw makeError("ASSET_METADATA_MISMATCH", "Repository Asset metadata 與固定 Project revision 不一致。", { id: metadata.id });
      }
      if (!record.blob) throw makeError("ASSET_MISSING", "完整專案包缺少 Asset 原始 Blob。", { id: metadata.id });
      return { projectId: project.projectId, id: metadata.id, metadata: cloneJson(metadata), blob: record.blob };
    }

    async function exportCompletePackage(exportOptions) {
      requireInitialized();
      const services = packageServices();
      requireNoUncommittedPackageWork();
      requireProject();
      if (!currentLeaseValid || lifecycle.phase !== "ready") {
        throw makeError("READ_ONLY", lifecycle.readOnlyReason || "匯出完整專案包前需要有效的本機編輯權。");
      }
      const project = deps.schema.validateProject(cloneJson(currentProject));
      const context = {
        projectId: project.projectId,
        revision: project.revision,
        projectJson: stableStringify(project),
        generation: projectGeneration
      };
      const packageOptions = completePackageOptions(exportOptions, services.zipAdapter);
      packageOptions.expectedRevision = context.revision;
      packageOptions.projectJsonBytes = new TextEncoder().encode(context.projectJson);
      await verifyExportContext(context);
      const sourceAssets = [];
      for (const metadata of project.assets) {
        sourceAssets.push(await loadPackageAsset(project, metadata));
      }
      const result = await services.projectPackage.exportProjectPackage(project, sourceAssets, packageOptions);
      let verifiedProject = null;
      if (result.workerRoundTripVerified !== true) {
        const verified = await services.projectPackage.parseProjectPackage(result.archiveBytes, packageOptions);
        verifiedProject = assertVerifiedPackage(verified);
      }
      if ((verifiedProject && (verifiedProject.projectId !== context.projectId || verifiedProject.revision !== context.revision ||
          stableStringify(verifiedProject) !== context.projectJson)) || result.projectId !== context.projectId ||
          result.revision !== context.revision) {
        throw makeError("PACKAGE_ROUNDTRIP_MISMATCH", "輸出的 ZIP 無法完整還原固定 canonical Project/revision。");
      }
      await verifyExportContext(context);
      return result;
    }

    async function parseCompletePackage(archiveInput, importOptions) {
      requireInitialized();
      const services = packageServices();
      const packageOptions = completePackageOptions(importOptions, services.zipAdapter);
      const input = packageArchiveInput(archiveInput, packageOptions, services.projectPackage);
      const verified = await services.projectPackage.parseProjectPackage(input, packageOptions);
      assertVerifiedPackage(verified);
      return { services: services, packageOptions: packageOptions, verified: verified };
    }

    async function validatePackageOriginalPhotos(verified, importOptions) {
      const signal = importOptions && importOptions.signal;
      throwIfPackageAborted(signal);
      const photoAssets = verified.assets.filter(function (asset) {
        return asset && asset.metadata && asset.metadata.role === "photoOriginal";
      });
      if (photoAssets.length === 0) return;
      const importer = photoImportService();
      if (!importer || typeof importer.preparePhotoImport !== "function") {
        throw makeError("PHOTO_IMPORT_UNAVAILABLE", "尚未載入照片驗證模組；無法確認專案包內的原始照片。");
      }

      const photoOptions = snapshotPhotoImportOptions();
      const overrides = importOptions && importOptions.photoImportOptions;
      if (isRecord(overrides)) {
        Object.assign(photoOptions, overrides);
        if (isRecord(overrides.policy)) photoOptions.policy = Object.assign({}, photoOptions.policy || {}, overrides.policy);
        if (isRecord(overrides.apis)) photoOptions.apis = Object.assign({}, photoOptions.apis || {}, overrides.apis);
      }
      const BlobCtor = getBlobConstructor(photoOptions);
      if (typeof BlobCtor !== "function") {
        throw makeError("BLOB_API_UNAVAILABLE", "完整專案包的原始照片驗證需要原生 Blob API。");
      }

      for (let index = 0; index < photoAssets.length; index += 1) {
        throwIfPackageAborted(signal);
        const asset = photoAssets[index];
        const expected = asset.metadata;
        if (expected.state !== "available") throw makeError("ASSET_MISSING", "完整專案包不可標記 missing 原始照片。", { id: asset.id });
        const originalBlob = new BlobCtor([asset.bytes], { type: expected.mime });
        const prepared = await importer.preparePhotoImport(originalBlob, Object.assign({}, photoOptions, {
          projectId: asset.projectId,
          id: asset.id,
          originalName: "package-photo-" + (index + 1) + ".image",
          preferCancellableDecode: true,
          signal: signal || null
        }));
        throwIfPackageAborted(signal);
        const actual = prepared && prepared.metadata;
        const fields = ["projectId", "id", "role", "sha256", "mime", "byteLength", "width", "height", "state"];
        if (!isRecord(actual) || fields.some(function (field) { return actual[field] !== expected[field]; })) {
          throw makeError("ASSET_METADATA_MISMATCH", "原始照片解碼後的 MIME、尺寸、雜湊或 identity 與 canonical metadata 不一致。", {
            id: asset.id,
            expected: expected,
            actual: actual || null
          });
        }
      }
    }

    async function previewCompletePackage(archiveInput, previewOptions) {
      const mode = validatePackageMode(previewOptions || {});
      const settings = Object.assign({}, previewOptions || {}, { mode: mode });
      const parsed = await parseCompletePackage(archiveInput, settings);
      try {
        await validatePackageOriginalPhotos(parsed.verified, settings);
        if (mode === "copy") {
          const projects = await repository.listProjects();
          const projectIds = new Set(projects.map(function (item) { return item.projectId; }));
          await makePackageCopy(parsed.verified, settings, projectIds, parsed.services.projectPackage, parsed.packageOptions);
        }
        return packagePreview(parsed.verified, mode);
      } finally {
        if (parsed.verified.workerTicket && typeof parsed.services.projectPackage.releaseProjectPackageWorkerTicket === "function") {
          await parsed.services.projectPackage.releaseProjectPackageWorkerTicket(parsed.verified.workerTicket);
          delete parsed.verified.workerTicket;
        }
      }
    }

    async function importCompletePackage(archiveInput, importOptions) {
      requireInitialized();
      requireNoUncommittedPackageWork();
      const services = assertPackageSupportForImport();
      const settings = importOptions || {};
      const mode = validatePackageMode(settings);
      const parsed = await parseCompletePackage(archiveInput, settings);
      let sourceProject;
      let targetProject;
      let importResult;
      let staged = parsed.verified;
      try {
        sourceProject = assertVerifiedPackage(parsed.verified);
        await validatePackageOriginalPhotos(parsed.verified, settings);
        if (mode === "copy") {
          const summaries = await repository.listProjects();
          const existingProjectIds = new Set(summaries.map(function (item) { return item.projectId; }));
          staged = await makePackageCopy(parsed.verified, settings, existingProjectIds, parsed.services.projectPackage, parsed.packageOptions);
        }
        targetProject = assertVerifiedPackage(staged);
        requireNoUncommittedPackageWork();
        importResult = await repository.importProjectPackage(staged);
      } finally {
        if (parsed.verified.workerTicket && typeof parsed.services.projectPackage.releaseProjectPackageWorkerTicket === "function") {
          await parsed.services.projectPackage.releaseProjectPackageWorkerTicket(parsed.verified.workerTicket);
          delete parsed.verified.workerTicket;
        }
      }

      // The atomic repository import has committed. Keep the in-memory list
      // useful even if a follow-up listing read fails; never report a committed
      // import as failed or switch the current Project as a side effect.
      try { projects = await repository.listProjects(); }
      catch (_) { /* Keep the last complete list and merge the committed summary below. */ }
      updateProjectSummary(targetProject);
      setLifecycle({ projects: cloneJson(projects), error: null });
      return {
        projectId: importResult && importResult.projectId || targetProject.projectId,
        revision: importResult && importResult.revision !== undefined ? importResult.revision : targetProject.revision,
        mode: mode,
        sourceProjectId: sourceProject.projectId,
        sourceRevision: sourceProject.revision,
        idRemap: mode === "copy" ? cloneJson(staged.idRemap || []) : [],
        projectsUpdated: true
      };
    }

    function exportRescue(rescueOptions) {
      const opts = rescueOptions || {};
      const records = queue.map(function (item, index) {
        const prepared = item.prepared || null;
        return {
          type: item.type || (item.spec && item.spec.kind === "migration" ? "confirmMigration" : "createProject"),
          commandId: item.commandId,
          args: safeJson(item.args || []),
          projectId: prepared && prepared.candidate ? prepared.candidate.projectId : item.spec && item.spec.projectId || null,
          baseRevision: prepared ? prepared.baseRevision : null,
          candidate: prepared && prepared.candidate ? cloneJson(prepared.candidate) : item.candidate ? cloneJson(item.candidate) : null,
          status: index === 0 && paused ? "failed" : "queued",
          error: item.error ? cloneJson(item.error) : null
        };
      });
      const failedCommand = records.length && paused ? records[0] : null;
      const queuedCommands = records.length ? records.slice(paused ? 1 : 0) : [];
      const project = currentProject ? cloneJson(currentProject) : null;
      const candidates = records.map(function (item) { return item.candidate; }).filter(Boolean);
      const manifests = new Map();
      [project].concat(candidates).filter(Boolean).forEach(function (item) {
        (item.assets || []).forEach(function (asset) {
          manifests.set(item.projectId + ":" + asset.id, {
            projectId: item.projectId,
            id: asset.id,
            metadata: cloneJson(asset),
            blobIncluded: false
          });
        });
      });
      const drafts = Object.prototype.hasOwnProperty.call(opts, "drafts") ? captureJson(opts.drafts) : cloneJson(draftsSnapshot);
      return {
        format: "director-storyboard-rescue",
        version: 1,
        committedProject: project,
        failedCommand: failedCommand,
        queuedCommands: queuedCommands,
        drafts: safeJson(drafts),
        sourceRaw: legacySourceRaw,
        assetManifest: Array.from(manifests.values()),
        complete: false
      };
    }

    function canUndo() { return Boolean(historyReady && historyState && currentProject && currentLeaseValid && lifecycle.phase !== "read_only" && !activationPending && !paused && queue.length === 0 && historyState.undoEntryIds.length > 0); }
    function canRedo() { return Boolean(historyReady && historyState && currentProject && currentLeaseValid && lifecycle.phase !== "read_only" && !activationPending && !paused && queue.length === 0 && historyState.redoEntryIds.length > 0); }

    function historyStatus() {
      return {
        available: historyReady,
        canUndo: canUndo(),
        canRedo: canRedo(),
        undoDepth: historyReady && historyState ? historyState.undoEntryIds.length : 0,
        redoDepth: historyReady && historyState ? historyState.redoEntryIds.length : 0,
        error: historyFailure ? errorInfo(historyFailure) : null
      };
    }

    async function reclaimLeaseCore() {
      requireInitialized();
      requireProject();
      if (queue.length > 0 || paused || hasDrafts()) throw makeError("PENDING_CHANGES", "尚有未保存命令或欄位草稿；請先重試、保存或匯出救援。");
      const generation = beginProjectOperation();
      const projectId = currentProject.projectId;
      currentLeaseValid = false;
      setLifecycle({ phase: "read_only", error: null, readOnlyReason: "正在重新取得專案編輯權…" });
      let claim = null;
      try {
        claim = await claimLeaseForGeneration(projectId, generation);
        if (claim.stale) return false;
        if (claim.error) throw claim.error;
        const stored = await repository.loadProject(projectId);
        if (!isCurrentGeneration(generation)) {
          await releaseOperationClaim(projectId, claim);
          return false;
        }
        if (!stored) throw makeError("PROJECT_NOT_FOUND", "專案不存在。");
        const validated = deps.schema.validateProject(stored);
        if (queue.length > 0 || paused || hasDrafts()) {
          await releaseOperationClaim(projectId, claim);
          throw makeError("PENDING_CHANGES", "取得編輯權期間出現未保存工作；沒有載入較新的專案內容。請先處理未保存輸入。");
        }
        const changed = stableStringify(validated) !== stableStringify(currentProject);
        if (changed) throw makeError("REVISION_CONFLICT", "專案內容已變更；請重新載入最新專案，不會自動替換目前內容。");
        let loadedHistory = null;
        let historyError = null;
        try { loadedHistory = await readOrInitializeHistory(validated, true, generation); }
        catch (historyCause) {
          if (historyCause && historyCause.code === "OPERATION_STALE") throw historyCause;
          historyError = historyUnavailable(historyCause);
        }
        if (!isCurrentGeneration(generation)) {
          if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
          return false;
        }
        if (historyError) clearHistoryBundle(historyError);
        else installHistoryBundle(loadedHistory);
        currentLeaseValid = true;
        setLifecycle({
          phase: historyError ? "read_only" : "ready",
          error: historyError,
          readOnlyReason: historyError ? historyErrorReason() : null
        });
        return true;
      } catch (cause) {
        if (claim && claim.claimed) await releaseOperationClaim(projectId, claim);
        if (!isCurrentGeneration(generation)) return false;
        const error = normalizeError(cause, "LEASE_LOST", "無法重新取得專案編輯權。");
        currentLeaseValid = false;
        setLifecycle({ phase: "read_only", error: error, readOnlyReason: withHistoryErrorReason("此專案仍為唯讀；請稍後重試或重新載入。") });
        if (error.code === "LEASE_CONFLICT") startLeaseRecovery(projectId, generation);
        throw error;
      }
    }

    function reclaimLease() {
      return trackLeaseActivity(reclaimLeaseCore());
    }

    async function release() {
      if (!repository) return false;
      if (queue.length > 0 || paused) throw makeError("PENDING_CHANGES", "尚有未保存命令；請先保存、匯出救援或明確放棄後再釋放編輯權。");
      const generation = beginProjectOperation();
      const projectId = currentProject ? currentProject.projectId : null;
      activationPending = false;
      currentLeaseValid = false;
      await releaseOwnedLeasesBestEffort();
      if (!isCurrentGeneration(generation) || (projectId && currentProject && currentProject.projectId !== projectId)) return true;
      currentLeaseValid = false;
      if (currentProject) setLifecycle({ phase: "read_only", readOnlyReason: withHistoryErrorReason("編輯權已釋放。") });
      return true;
    }

    async function close() {
      if (queue.length > 0 || paused) throw makeError("PENDING_CHANGES", "尚有未保存命令；請先保存、匯出救援或明確放棄後再關閉 Model。");
      beginProjectOperation();
      modelClosed = true;
      activationPending = false;
      removeLifecycleHandlers();
      await release();
      await waitForLeaseActivities();
      if (repository && typeof repository.close === "function") repository.close();
      repository = null;
      initialized = false;
      initFlight = null;
      currentProject = null;
      selectedProjectId = null;
      currentLeaseValid = false;
      projects = [];
      migrationProject = null;
      migrationPreview = null;
      migrationReport = null;
      migrationReturnPhase = null;
      legacySourceRaw = null;
      clearHistoryBundle();
      setLifecycle({ phase: "opening", error: null, projects: [], migrationPreview: null, readOnlyReason: "repository 已關閉。" });
      return true;
    }

    const api = {
      initialize: initialize,
      open: initialize,
      ready: function () {
        if (!initFlight) return rejectPromise("NOT_INITIALIZED", "請先呼叫 initialize()。");
        return initFlight;
      },
      getLifecycle: lifecycleSnapshot,
      subscribeLifecycle: subscribeLifecycle,
      getState: getState,
      getProject: getProject,
      resolveShotNumbers: resolveShotNumbers,
      previewShotRenumber: previewShotRenumber,
      getTimeline: getTimeline,
      exportProject: getProject,
      subscribe: subscribe,
      setDraftSnapshot: setDraftSnapshot,
      exportCompletePackage: exportCompletePackage,
      previewCompletePackage: previewCompletePackage,
      importCompletePackage: importCompletePackage,
      getSaveStatus: currentSaveStatus,
      canUndo: canUndo,
      canRedo: canRedo,
      getHistoryStatus: historyStatus,
      selectProject: selectProject,
      refreshProjects: async function () {
        requireInitialized();
        projects = await repository.listProjects();
        setLifecycle({ projects: cloneJson(projects), error: null });
        return cloneJson(projects);
      },
      createProject: createProject,
      previewMigration: refreshMigrationPreview,
      confirmMigration: confirmMigration,
      cancelMigration: cancelMigration,
      retryPending: retryPending,
      cancelPending: cancelPending,
      discardPending: cancelPending,
      exportRescue: exportRescue,
      reacquireLease: reclaimLease,
      release: release,
      close: close,
      updateProjectMetadata: function (metadata) { return queueCommand("updateProjectMetadata", [metadata]); },
      addScene: function (title) { return queueCommand("addScene", [title]); },
      updateScene: function (id, patch) { return queueCommand("updateScene", [id, patch]); },
      addShot: function (sceneId) { return queueCommand("addShot", [sceneId]); },
      updateShot: function (id, patch) { return queueCommand("updateShot", [id, patch]); },
      setShotNumberLocked: function (id, locked) { return queueCommand("setShotNumberLocked", [id, locked]); },
      renumberShots: function (preview) { return queueCommand("renumberShots", [preview]); },
      duplicateShot: function (id) { return queueCommand("duplicateShot", [id]); },
      deleteShot: function (id) { return queueCommand("deleteShot", [id]); },
      moveShot: function (id, delta) { return queueCommand("moveShot", [id, delta]); },
      reorderShots: function (sceneId, orderedIds) { return queueCommand("reorderShots", [sceneId, orderedIds]); },
      scheduleShot: function (shotId, dayId) { return queueCommand("scheduleShot", [shotId, dayId]); },
      removeEntry: function (id) { return queueCommand("removeEntry", [id]); },
      moveEntry: function (id, delta) { return queueCommand("moveEntry", [id, delta]); },
      reorderScheduleEntries: function (dayId, orderedIds) { return queueCommand("reorderScheduleEntries", [dayId, orderedIds]); },
      updateEntry: function (id, patch) { return queueCommand("updateEntry", [id, patch]); },
      addBreak: function (dayId) { return queueCommand("addBreak", [dayId]); },
      addDay: function (date, title, start) { return queueCommand("addDay", [date, title, start]); },
      updateDay: function (id, patch) { return queueCommand("updateDay", [id, patch]); },
      addProductionTask: function (title, startDate, endDate, notes) {
        return queueCommand("addProductionTask", arguments.length > 3 && notes !== undefined
          ? [title, startDate, endDate, notes]
          : [title, startDate, endDate]);
      },
      updateProductionTask: function (id, patch) { return queueCommand("updateProductionTask", [id, patch]); },
      moveProductionTask: function (id, startDate) { return queueCommand("moveProductionTask", [id, startDate]); },
      reorderProductionTasks: function (orderedIds) { return queueCommand("reorderProductionTasks", [orderedIds]); },
      reorderProductionTimeline: function (orderedRows) { return queueCommand("reorderProductionTimeline", [orderedRows]); },
      deleteProductionTask: function (id) { return queueCommand("deleteProductionTask", [id]); },
      setAspectRatio: function (value) { return queueCommand("setAspectRatio", [value]); },
      updateOutputPreferences: function (patch) { return queueCommand("updateOutputPreferences", [patch]); },
      createDrawingForShot: function (shotId, backgroundAssetId, backgroundCrop) {
        return queueDrawingCreate(shotId, backgroundAssetId, arguments.length > 1 && backgroundAssetId !== undefined,
          null, null, backgroundCrop, arguments.length > 2);
      },
      createDrawingForShotWithInitialEdit: queueDrawingCreateWithInitialEdit,
      appendDrawingStroke: function (drawingId, layerId, strokeDraft) { return queueCommand("appendDrawingStroke", [drawingId, layerId, strokeDraft]); },
      eraseDrawingStroke: function (drawingId, layerId, strokeId) { return queueCommand("eraseDrawingStroke", [drawingId, layerId, strokeId]); },
      clearDrawingLayer: function (drawingId, layerId) { return queueCommand("clearDrawingLayer", [drawingId, layerId]); },
      setDrawingLayerState: function (drawingId, layerId, patch) { return queueCommand("setDrawingLayerState", [drawingId, layerId, patch]); },
      reuseSceneLayer: function (sourceDrawingId, targetDrawingId) { return queueCommand("reuseSceneLayer", [sourceDrawingId, targetDrawingId]); },
      setDrawingBackground: function (drawingId, assetId) { return queueDrawingBackground(drawingId, assetId); },
      getDrawing: getDrawing,
      getDrawingsForShot: getDrawingsForShot,
      addShotPhotos: function (shotId, files, photoOptions) { return queuePhotoCommand("addShotPhotos", shotId, null, files, photoOptions); },
      reorderShotPhotos: function (shotId, orderedAssetIds) { return queueCommand("reorderShotPhotos", [shotId, orderedAssetIds]); },
      setShotPhotoCrop: function (shotId, assetId, crop) { return queueCommand("setShotPhotoCrop", [shotId, assetId, crop]); },
      removeShotPhoto: function (shotId, assetId) { return queueCommand("removeShotPhoto", [shotId, assetId]); },
      replaceShotPhoto: function (shotId, previousAssetId, file, photoOptions) { return queuePhotoCommand("replaceShotPhoto", shotId, previousAssetId, file, photoOptions); },
      getAsset: getAsset,
      getShotPhoto: getShotPhoto,
      undo: function () { return queueCommand("undo", []); },
      redo: function () { return queueCommand("redo", []); },
      restoreDemo: function () { return createProject({ title: "分鏡示範專案", demo: true }); },
      createModel: createModel
    };
    return Object.freeze(api);
  }

  const singleton = createModel();
  return singleton;
});
