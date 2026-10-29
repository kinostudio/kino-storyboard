(function attachIndexedDbRepository(root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DirectorStoryboardRepository = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createIndexedDbRepositoryModule(root) {
  "use strict";

  const DATABASE_VERSION = 2;
  const capturedBlobPrototype = root && typeof root.Blob === "function" ? root.Blob.prototype : null;
  const capturedBlobArrayBuffer = capturedBlobPrototype && capturedBlobPrototype.arrayBuffer;
  const capturedBlobSizeDescriptor = capturedBlobPrototype && Object.getOwnPropertyDescriptor(capturedBlobPrototype, "size");
  const capturedBlobSizeGetter = capturedBlobSizeDescriptor && capturedBlobSizeDescriptor.get;
  const capturedFunctionToString = Function.prototype.toString;

  function isNativeIntrinsic(value) {
    if (typeof value !== "function") return false;
    try {
      return capturedFunctionToString.call(value).indexOf("[native code]") !== -1;
    } catch (_) {
      return false;
    }
  }

  function isTrustedNodeBlob() {
    if (!root || typeof root.Blob !== "function" || typeof process === "undefined" ||
        !process.versions || !process.versions.node || typeof require !== "function") return false;
    try {
      // Node's genuine Blob methods are JavaScript wrappers over Node internals,
      // so Function#toString does not label them native. Trust only the exact
      // constructor exported by node:buffer; ordinary lookalikes still fail.
      return require("node:buffer").Blob === root.Blob;
    } catch (_) {
      return false;
    }
  }

  const trustedBlobRuntime = isTrustedNodeBlob();
  const nativeBlobArrayBuffer = isNativeIntrinsic(capturedBlobArrayBuffer) || trustedBlobRuntime ? capturedBlobArrayBuffer : null;
  const nativeBlobSizeGetter = isNativeIntrinsic(capturedBlobSizeGetter) || trustedBlobRuntime ? capturedBlobSizeGetter : null;
  const STORE_DEFINITIONS = Object.freeze({
    projects: Object.freeze({ keyPath: "projectId", indexes: Object.freeze([]) }),
    assets: Object.freeze({ keyPath: Object.freeze(["projectId", "id"]), indexes: Object.freeze([
      Object.freeze({ name: "byProject", keyPath: "projectId" })
    ]) }),
    drawings: Object.freeze({ keyPath: Object.freeze(["projectId", "id"]), indexes: Object.freeze([
      Object.freeze({ name: "byProject", keyPath: "projectId" })
    ]) }),
    history: Object.freeze({ keyPath: Object.freeze(["projectId", "commandId"]), indexes: Object.freeze([
      Object.freeze({ name: "byProject", keyPath: "projectId" })
    ]) }),
    historyState: Object.freeze({ keyPath: "projectId", indexes: Object.freeze([]) }),
    historyEntries: Object.freeze({ keyPath: Object.freeze(["projectId", "entryId"]), indexes: Object.freeze([
      Object.freeze({ name: "byProject", keyPath: "projectId" })
    ]) }),
    snapshots: Object.freeze({ keyPath: Object.freeze(["projectId", "id"]), indexes: Object.freeze([
      Object.freeze({ name: "byProject", keyPath: "projectId" })
    ]) }),
    locks: Object.freeze({ keyPath: "projectId", indexes: Object.freeze([]) })
  });

  class RepositoryError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = "RepositoryError";
      this.code = code;
      if (cause !== undefined) this.cause = cause;
    }
  }

  function error(code, message, cause) {
    return new RepositoryError(code, message, cause);
  }

  function asRepositoryError(value, fallbackCode, fallbackMessage) {
    if (value instanceof RepositoryError) return value;
    return error(fallbackCode || "IDB_ERROR", fallbackMessage || "IndexedDB 操作失敗。", value);
  }

  function idbError(value, action) {
    const name = value && value.name;
    if (name === "QuotaExceededError") return error("QUOTA_EXCEEDED", "瀏覽器儲存空間不足。", value);
    if (name === "VersionError") return error("UNSUPPORTED_DB_VERSION", "資料庫版本比此 repository 新，拒絕降級開啟。", value);
    if (name === "DataCloneError") return error("UNSUPPORTED_STORAGE_VALUE", "資料包含瀏覽器無法持久化的值。", value);
    if (name === "ConstraintError") return error("IDB_CONSTRAINT", "資料庫唯一鍵或索引條件不符。", value);
    if (name === "AbortError") return error("TX_ABORTED", "IndexedDB 交易已中止。", value);
    return error("IDB_ERROR", (action || "IndexedDB 操作") + "失敗。", value);
  }

  function transactionAbortError(cause) {
    if (cause instanceof RepositoryError) return cause;
    const nativeExceptionNames = ["QuotaExceededError", "DataCloneError", "ConstraintError", "AbortError", "VersionError"];
    if (cause && nativeExceptionNames.indexOf(cause.name) !== -1 &&
        Object.prototype.toString.call(cause) === "[object DOMException]") {
      return idbError(cause, "執行交易");
    }
    return error("TX_ABORTED", "IndexedDB 交易已中止。", cause);
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function cloneStrictJson(value, label) {
    const ancestors = new Set();
    const rootLabel = label || "資料";

    function inspect(current, path) {
      if (current === null || typeof current === "string" || typeof current === "boolean") return;
      if (typeof current === "number") {
        if (!Number.isFinite(current)) throw error("UNSUPPORTED_JSON_DATA", path + " 含有非有限數值。");
        return;
      }
      if (typeof current !== "object") {
        throw error("UNSUPPORTED_JSON_DATA", path + " 不是受支援的 JSON 值。");
      }
      if (ancestors.has(current)) throw error("UNSUPPORTED_JSON_DATA", path + " 含有循環參照。");
      ancestors.add(current);

      if (Array.isArray(current)) {
        if (Object.getOwnPropertySymbols(current).length) throw error("UNSUPPORTED_JSON_DATA", path + " 含有 Symbol 欄位。");
        const ownNames = Object.getOwnPropertyNames(current);
        ownNames.forEach(function (name) {
          if (name === "length") return;
          const index = Number(name);
          if (!Number.isInteger(index) || index < 0 || String(index) !== name || index >= current.length) {
            throw error("UNSUPPORTED_JSON_DATA", path + " 含有非 JSON 陣列欄位。");
          }
        });
        for (let index = 0; index < current.length; index += 1) {
          if (!hasOwn(current, index)) throw error("UNSUPPORTED_JSON_DATA", path + " 含有稀疏陣列。");
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!descriptor || !descriptor.enumerable || !hasOwn(descriptor, "value")) {
            throw error("UNSUPPORTED_JSON_DATA", path + " 含有非資料陣列欄位。");
          }
          inspect(descriptor.value, path + "[" + index + "]");
        }
      } else {
        if (!isPlainObject(current)) throw error("UNSUPPORTED_JSON_DATA", path + " 必須是純 JSON 物件。");
        if (Object.getOwnPropertySymbols(current).length) throw error("UNSUPPORTED_JSON_DATA", path + " 含有 Symbol 欄位。");
        Object.getOwnPropertyNames(current).forEach(function (name) {
          const descriptor = Object.getOwnPropertyDescriptor(current, name);
          if (!descriptor || !descriptor.enumerable || !hasOwn(descriptor, "value")) {
            throw error("UNSUPPORTED_JSON_DATA", path + "." + name + " 必須是可列舉資料欄位。");
          }
          inspect(descriptor.value, path + "." + name);
        });
      }

      ancestors.delete(current);
    }

    inspect(value, rootLabel);
    let encoded;
    try {
      encoded = JSON.stringify(value);
      if (encoded === undefined) throw new Error("JSON.stringify returned undefined");
      return JSON.parse(encoded);
    } catch (cause) {
      throw error("UNSUPPORTED_JSON_DATA", rootLabel + " 無法安全複製為 JSON。", cause);
    }
  }

  function stableJson(value) {
    if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + stableJson(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function validTextId(value, label) {
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 200) {
      throw error("INVALID_ARGUMENT", (label || "ID") + " 必須是長度 1–200 的非空文字。");
    }
    return value;
  }

  function exactObjectKeys(value, expected, code, label) {
    if (!isPlainObject(value)) throw error(code, label + " 必須是 JSON 物件。");
    const actual = Object.keys(value).sort();
    const wanted = expected.slice().sort();
    if (actual.length !== wanted.length || actual.some(function (key, index) { return key !== wanted[index]; })) {
      throw error(code, label + " 欄位不符合契約。");
    }
  }

  function normalizeEntryIds(value, code, label) {
    if (!Array.isArray(value)) throw error(code, label + " 必須是 ID 陣列。");
    const safe = cloneStrictJson(value, label);
    const seen = new Set();
    safe.forEach(function (entryId) {
      if (typeof entryId !== "string" || !entryId.trim() || entryId !== entryId.trim() || entryId.length > 200) {
        throw error(code, label + " 含有無效 entryId。");
      }
      if (seen.has(entryId)) throw error(code, label + " 不可包含重複 entryId。");
      seen.add(entryId);
    });
    return safe;
  }

  function normalizeHistoryState(value, projectId, expectedRevision, code) {
    const failureCode = code || "CORRUPT_HISTORY_STATE";
    const label = "historyState";
    const safe = cloneStrictJson(value, label);
    exactObjectKeys(safe, ["projectId", "schemaVersion", "projectRevision", "undoEntryIds", "redoEntryIds"], failureCode, label);
    if (safe.projectId !== projectId || safe.schemaVersion !== 1 || !Number.isInteger(safe.projectRevision) || safe.projectRevision < 0) {
      throw error(failureCode, label + " projectId、schemaVersion 或 projectRevision 無效。");
    }
    if (expectedRevision !== undefined && safe.projectRevision !== expectedRevision) {
      throw error(failureCode, label + " projectRevision 與目前 Project revision 不符。");
    }
    safe.undoEntryIds = normalizeEntryIds(safe.undoEntryIds, failureCode, "historyState.undoEntryIds");
    safe.redoEntryIds = normalizeEntryIds(safe.redoEntryIds, failureCode, "historyState.redoEntryIds");
    if (safe.undoEntryIds.length + safe.redoEntryIds.length > 100) {
      throw error(failureCode, "historyState 可達歷史不可超過 100 筆。");
    }
    const allIds = new Set(safe.undoEntryIds);
    safe.redoEntryIds.forEach(function (entryId) {
      if (allIds.has(entryId)) throw error(failureCode, "historyState 的 undo/redo entryId 不可重複。");
      allIds.add(entryId);
    });
    return safe;
  }

  function normalizeJsonPointer(value, label, code) {
    if (typeof value !== "string" || (value !== "" && value.charAt(0) !== "/")) {
      throw error(code, label + " 必須是 RFC 6901 JSON Pointer。");
    }
    if (/(^|[^~])~(?![01])/.test(value)) throw error(code, label + " 含有無效的 JSON Pointer 跳脫。");
    return value;
  }

  function normalizeJsonPatch(value, label, code) {
    if (!Array.isArray(value)) throw error(code, label + " 必須是 RFC 6902 patch 陣列。");
    const patch = cloneStrictJson(value, label);
    patch.forEach(function (operation, index) {
      const path = label + "[" + index + "]";
      if (!isPlainObject(operation) || typeof operation.op !== "string") throw error(code, path + " 必須是 JSON Patch operation。");
      const op = operation.op;
      let keys;
      if (op === "add" || op === "replace" || op === "test") keys = ["op", "path", "value"];
      else if (op === "remove") keys = ["op", "path"];
      else if (op === "move" || op === "copy") keys = ["op", "path", "from"];
      else throw error(code, path + " 含有不支援的 JSON Patch operation。");
      exactObjectKeys(operation, keys, code, path);
      normalizeJsonPointer(operation.path, path + ".path", code);
      if (hasOwn(operation, "from")) normalizeJsonPointer(operation.from, path + ".from", code);
    });
    return patch;
  }

  function normalizeHistoryEntry(value, projectId, code) {
    const failureCode = code || "CORRUPT_HISTORY_ENTRY";
    const label = "historyEntry";
    const safe = cloneStrictJson(value, label);
    exactObjectKeys(safe, ["projectId", "entryId", "kind", "baseRevision", "revision", "inversePatch", "forwardPatch"], failureCode, label);
    if (safe.projectId !== projectId || typeof safe.kind !== "string" || !safe.kind.trim() ||
        !Number.isInteger(safe.baseRevision) || safe.baseRevision < 0 || !Number.isInteger(safe.revision) ||
        safe.revision !== safe.baseRevision + 1) {
      throw error(failureCode, label + " key、kind 或 revision 無效。");
    }
    if (typeof safe.entryId !== "string" || !safe.entryId.trim() || safe.entryId !== safe.entryId.trim() || safe.entryId.length > 200) {
      throw error(failureCode, label + ".entryId 無效。");
    }
    safe.inversePatch = normalizeJsonPatch(safe.inversePatch, label + ".inversePatch", failureCode);
    safe.forwardPatch = normalizeJsonPatch(safe.forwardPatch, label + ".forwardPatch", failureCode);
    return safe;
  }

  function normalizeHistoryDelta(value, projectId, projectRevision, baseRevision) {
    const label = "historyDelta";
    const safe = cloneStrictJson(value, label);
    exactObjectKeys(safe, ["expectedStateRevision", "nextState", "entryWrites", "entryDeletes"], "INVALID_HISTORY_DELTA", label);
    if (safe.expectedStateRevision !== null && (!Number.isInteger(safe.expectedStateRevision) || safe.expectedStateRevision < 0)) {
      throw error("INVALID_HISTORY_DELTA", "historyDelta.expectedStateRevision 必須是 null 或非負整數。");
    }
    if (safe.expectedStateRevision !== baseRevision) {
      throw error("INVALID_HISTORY_DELTA", "historyDelta.expectedStateRevision 必須等於 baseRevision。");
    }
    safe.nextState = normalizeHistoryState(safe.nextState, projectId, projectRevision, "INVALID_HISTORY_STATE");
    if (!Array.isArray(safe.entryWrites) || !Array.isArray(safe.entryDeletes)) {
      throw error("INVALID_HISTORY_DELTA", "historyDelta.entryWrites 與 entryDeletes 必須是陣列。");
    }
    safe.entryWrites = safe.entryWrites.map(function (row) {
      return normalizeHistoryEntry(row, projectId, "INVALID_HISTORY_ENTRY");
    });
    safe.entryDeletes = normalizeEntryIds(safe.entryDeletes, "INVALID_HISTORY_DELTA", "historyDelta.entryDeletes");
    const writeIds = new Set();
    safe.entryWrites.forEach(function (entry) {
      if (writeIds.has(entry.entryId)) throw error("INVALID_HISTORY_DELTA", "historyDelta.entryWrites 不可包含重複 entryId。");
      writeIds.add(entry.entryId);
    });
    const deleteIds = new Set(safe.entryDeletes);
    safe.entryWrites.forEach(function (entry) {
      if (deleteIds.has(entry.entryId)) throw error("INVALID_HISTORY_DELTA", "historyDelta 不可同時新增及刪除相同 entryId。");
    });
    const nextIds = new Set(safe.nextState.undoEntryIds.concat(safe.nextState.redoEntryIds));
    safe.entryWrites.forEach(function (entry) {
      if (entry.baseRevision !== baseRevision || entry.revision !== projectRevision) {
        throw error("INVALID_HISTORY_DELTA", "新 history entry revision 必須對應目前 command revision。");
      }
      if (!nextIds.has(entry.entryId)) throw error("INVALID_HISTORY_DELTA", "新 history entry 必須由 nextState 參照。");
    });
    safe.entryDeletes.forEach(function (entryId) {
      if (nextIds.has(entryId)) throw error("INVALID_HISTORY_DELTA", "nextState 不可參照同一交易刪除的 history entry。");
    });
    if (baseRevision === null && (safe.nextState.undoEntryIds.length || safe.nextState.redoEntryIds.length ||
        safe.entryWrites.length || safe.entryDeletes.length)) {
      throw error("INVALID_HISTORY_DELTA", "新 Project 的 history baseline 必須是空狀態。");
    }
    return safe;
  }

  function normalizeExpectedHistory(value, projectId, baseRevision) {
    const label = "expectedHistory";
    const safe = cloneStrictJson(value, label);
    exactObjectKeys(safe, ["state", "entries"], "INVALID_EXPECTED_HISTORY", label);
    if (!Array.isArray(safe.entries)) throw error("INVALID_EXPECTED_HISTORY", label + ".entries 必須是陣列。");
    if (baseRevision === null) {
      if (safe.state !== null || safe.entries.length) {
        throw error("INVALID_EXPECTED_HISTORY", "新 Project 的 expectedHistory 必須是空快照。");
      }
    } else {
      safe.state = normalizeHistoryState(safe.state, projectId, baseRevision, "INVALID_EXPECTED_HISTORY");
    }
    safe.entries = safe.entries.map(function (entry) {
      return normalizeHistoryEntry(entry, projectId, "INVALID_EXPECTED_HISTORY");
    });
    const expectedIds = safe.state
      ? safe.state.undoEntryIds.concat(safe.state.redoEntryIds) : [];
    const entryIds = new Set();
    safe.entries.forEach(function (entry) {
      if (entryIds.has(entry.entryId)) throw error("INVALID_EXPECTED_HISTORY", label + ".entries 不可包含重複 entryId。");
      entryIds.add(entry.entryId);
    });
    if (entryIds.size !== expectedIds.length || expectedIds.some(function (entryId) { return !entryIds.has(entryId); })) {
      throw error("INVALID_EXPECTED_HISTORY", label + ".entries 必須與 state 的可達 entry IDs 完全一致。");
    }
    return safe;
  }

  function sameKeyPath(actual, expected) {
    if (Array.isArray(expected)) {
      return Array.isArray(actual) && actual.length === expected.length && expected.every(function (part, index) {
        return actual[index] === part;
      });
    }
    return actual === expected;
  }

  function ensureStore(db, upgradeTransaction, name, definition) {
    let store;
    if (db.objectStoreNames.contains(name)) {
      store = upgradeTransaction.objectStore(name);
      if (!sameKeyPath(store.keyPath, definition.keyPath)) {
        throw error("STORAGE_SCHEMA_ERROR", "資料庫 object store " + name + " 的 keyPath 不符合 schema。");
      }
    } else {
      store = db.createObjectStore(name, { keyPath: definition.keyPath });
    }

    definition.indexes.forEach(function (indexDefinition) {
      if (store.indexNames.contains(indexDefinition.name)) {
        const index = store.index(indexDefinition.name);
        if (!sameKeyPath(index.keyPath, indexDefinition.keyPath)) {
          throw error("STORAGE_SCHEMA_ERROR", "資料庫 index " + name + "." + indexDefinition.name + " 不符合 schema。");
        }
      } else {
        store.createIndex(indexDefinition.name, indexDefinition.keyPath, { unique: false });
      }
    });
  }

  function validateDatabase(db) {
    Object.keys(STORE_DEFINITIONS).forEach(function (name) {
      const definition = STORE_DEFINITIONS[name];
      if (!db.objectStoreNames.contains(name)) throw error("STORAGE_SCHEMA_ERROR", "資料庫缺少必要 object store：" + name + "。");
      const store = db.transaction([name], "readonly").objectStore(name);
      if (!sameKeyPath(store.keyPath, definition.keyPath)) throw error("STORAGE_SCHEMA_ERROR", "object store " + name + " 的 keyPath 損毀。");
      definition.indexes.forEach(function (indexDefinition) {
        if (!store.indexNames.contains(indexDefinition.name)) throw error("STORAGE_SCHEMA_ERROR", "資料庫缺少必要 index：" + name + "." + indexDefinition.name + "。");
        const index = store.index(indexDefinition.name);
        if (!sameKeyPath(index.keyPath, indexDefinition.keyPath) || index.unique !== false || index.multiEntry !== false) {
          throw error("STORAGE_SCHEMA_ERROR", "index " + name + "." + indexDefinition.name + " 的 keyPath 或 flags 不符合 v1 schema。");
        }
      });
    });
  }

  function requireBlobIntrinsics() {
    if (!nativeBlobArrayBuffer || !nativeBlobSizeGetter) {
      throw error("BLOB_API_UNAVAILABLE", "此環境缺少可驗證 Blob bytes 的原生 Blob API。");
    }
  }

  function nativeBlobSize(value) {
    requireBlobIntrinsics();
    if (!value || (typeof value !== "object" && typeof value !== "function")) return null;
    try {
      const size = nativeBlobSizeGetter.call(value);
      return typeof size === "number" && Number.isFinite(size) && size >= 0 ? size : null;
    } catch (_) {
      // The native Web IDL getter performs the Blob brand check, including File
      // instances, without consulting an overridable instance property/tag.
      return null;
    }
  }

  function isBlob(value) {
    return nativeBlobSize(value) !== null;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function createRepository(options) {
    const config = options || {};
    const dbName = config.dbName;
    const ownerToken = config.ownerToken;
    const indexedDb = config.indexedDB || (root && root.indexedDB);
    const now = config.now === undefined ? function () { return Date.now(); } : config.now;
    const leaseMs = config.leaseMs === undefined ? 15000 : config.leaseMs;
    const cryptoProvider = config.crypto || (root && root.crypto);

    if (typeof dbName !== "string" || !dbName.trim()) throw error("INVALID_ARGUMENT", "dbName 必須明確提供非空名稱。");
    if (typeof ownerToken !== "string" || !ownerToken.trim()) throw error("INVALID_ARGUMENT", "ownerToken 必須是非空的本機 session 身分。");
    if (!indexedDb || typeof indexedDb.open !== "function") throw error("IDB_UNAVAILABLE", "此環境沒有可用的 IndexedDB。");
    if (typeof now !== "function") throw error("INVALID_ARGUMENT", "now 必須是回傳 epoch milliseconds 的函式。");
    if (typeof leaseMs !== "number" || !Number.isFinite(leaseMs) || leaseMs <= 0) {
      throw error("INVALID_ARGUMENT", "編輯權有效期間必須是有限正數。");
    }

    let db = null;
    let opening = null;
    let openGeneration = 0;
    let fatalError = null;
    let lastClockSample = null;
    let isManuallyClosed = false;
    let api;

    function currentTime() {
      let sample;
      try {
        sample = now();
      } catch (cause) {
        throw error("CLOCK_INVALID", "系統時間讀取失敗，已停止專案編輯權操作。", cause);
      }
      if (typeof sample !== "number" || !Number.isFinite(sample)) {
        throw error("CLOCK_INVALID", "系統時鐘必須回傳有限 epoch milliseconds。");
      }
      if (lastClockSample !== null && sample < lastClockSample) {
        throw error("CLOCK_ROLLBACK", "系統時間異常，已停止專案編輯權操作。");
      }
      lastClockSample = sample;
      return sample;
    }

    function requireConnection() {
      if (fatalError) throw fatalError;
      if (!db) throw error(isManuallyClosed ? "DB_CLOSED" : "DB_NOT_OPEN", "IndexedDB 尚未開啟或已關閉。");
      return db;
    }

    function open() {
      if (db) return Promise.resolve(api);
      if (fatalError) return Promise.reject(fatalError);
      if (opening) return opening.promise;
      isManuallyClosed = false;
      const generation = openGeneration;

      let openState;
      const openPromise = new Promise(function (resolve, reject) {
        openState = {
          generation: generation,
          settled: false,
          resolve: resolve,
          reject: reject,
          promise: null
        };
        opening = openState;
        let upgradeFailure = null;
        let request;

        function isCurrentOpen() {
          return !openState.settled && openState.generation === openGeneration && opening === openState;
        }

        function rejectOpen(cause) {
          if (!isCurrentOpen()) return;
          openState.settled = true;
          opening = null;
          reject(cause);
        }

        try {
          request = indexedDb.open(dbName, DATABASE_VERSION);
        } catch (cause) {
          rejectOpen(idbError(cause, "開啟資料庫"));
          return;
        }

        request.onupgradeneeded = function (event) {
          if (!isCurrentOpen()) {
            try { request.transaction.abort(); } catch (_) { /* cancelled open has already rejected */ }
            return;
          }
          try {
            if (event.newVersion !== DATABASE_VERSION) {
              throw error("STORAGE_SCHEMA_ERROR", "只允許建立 IndexedDB v2 stores 與 indexes。");
            }
            const upgradeDb = request.result;
            Object.keys(STORE_DEFINITIONS).forEach(function (name) {
              ensureStore(upgradeDb, request.transaction, name, STORE_DEFINITIONS[name]);
            });
          } catch (cause) {
            upgradeFailure = asRepositoryError(cause, "STORAGE_SCHEMA_ERROR", "建立 IndexedDB schema 失敗。");
            try { request.transaction.abort(); } catch (_) { /* the open request will report the abort */ }
          }
        };

        request.onblocked = function (event) {
          rejectOpen(error("OPEN_BLOCKED", "資料庫開啟被其他連線阻擋；請關閉舊分頁後重試。", event));
        };

        request.onerror = function () {
          if (!isCurrentOpen()) return;
          const cause = request.error;
          rejectOpen(upgradeFailure || idbError(cause, "開啟資料庫"));
        };

        request.onsuccess = function () {
          const connection = request.result;
          if (!isCurrentOpen()) {
            // close() or a newer open attempt may invalidate this still-live request.
            connection.close();
            return;
          }
          try {
            validateDatabase(connection);
          } catch (cause) {
            connection.close();
            rejectOpen(asRepositoryError(cause, "STORAGE_SCHEMA_ERROR", "IndexedDB schema 驗證失敗。"));
            return;
          }

          db = connection;
          connection.onversionchange = function (event) {
            if (db !== connection) return;
            fatalError = error("VERSION_CHANGE", "資料庫版本已變更；此連線已關閉，請重新建立 repository。", event);
            db = null;
            connection.close();
          };
          connection.onclose = function (event) {
            if (db !== connection) return;
            fatalError = error("DATABASE_CLOSED", "瀏覽器已關閉資料庫連線。", event);
            db = null;
          };
          openState.settled = true;
          opening = null;
          resolve(api);
        };
      });

      openState.promise = openPromise;
      return openPromise;
    }

    function close() {
      openGeneration += 1;
      const pendingOpen = opening;
      if (pendingOpen && !pendingOpen.settled) {
        pendingOpen.settled = true;
        if (opening === pendingOpen) opening = null;
        pendingOpen.reject(error("DB_CLOSED", "repository 在 IndexedDB 開啟完成前已關閉。"));
      }
      const connection = db;
      db = null;
      fatalError = null;
      isManuallyClosed = true;
      if (connection) {
        connection.onversionchange = null;
        connection.onclose = null;
        connection.close();
      }
    }

    function runTransaction(storeNames, mode, enqueue) {
      const connection = requireConnection();
      return new Promise(function (resolve, reject) {
        let tx;
        let result;
        let failure = null;
        try {
          tx = connection.transaction(storeNames, mode);
        } catch (cause) {
          reject(idbError(cause, "建立交易"));
          return;
        }

        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function (event) {
          const eventTargetError = event && event.target && event.target.error;
          if (!failure) failure = idbError(eventTargetError || tx.error || new Error("IDBTransaction error"), "執行交易");
        };
        tx.onabort = function () {
          reject(failure || fatalError || idbError(tx.error || new Error("IDBTransaction abort"), "執行交易"));
        };

        function setResult(value) { result = value; }
        function abort(cause) {
          if (!failure) failure = transactionAbortError(cause);
          try { tx.abort(); } catch (_) { /* onabort/oncomplete will settle the promise */ }
        }
        function observe(request, onSuccess) {
          request.onsuccess = function () {
            try { onSuccess(request.result); } catch (cause) { abort(cause); }
          };
          request.onerror = function () {
            if (!failure) failure = idbError(request.error || new Error("IDBRequest error"), "執行資料請求");
          };
        }

        try {
          enqueue(tx, setResult, abort, observe);
        } catch (cause) {
          abort(cause);
        }
      });
    }

    function getSchema() {
      if (root && root.DirectorStoryboardProjectSchema && typeof root.DirectorStoryboardProjectSchema.validateProject === "function") {
        return root.DirectorStoryboardProjectSchema;
      }
      if (typeof require === "function") {
        try {
          const schema = require("./project-schema.js");
          if (schema && typeof schema.validateProject === "function") return schema;
        } catch (_) { /* report the stable error below */ }
      }
      throw error("SCHEMA_UNAVAILABLE", "請先載入 DirectorStoryboardProjectSchema。");
    }

    function validateProject(input, code, label) {
      const schema = getSchema();
      let safeInput;
      try {
        safeInput = cloneStrictJson(input, label || "Project");
        return schema.validateProject(safeInput);
      } catch (cause) {
        if (cause instanceof RepositoryError && cause.code === "SCHEMA_UNAVAILABLE") throw cause;
        throw error(code || "INVALID_PROJECT", (label || "Project") + " 未通過 schema 驗證。", cause);
      }
    }

    function validateSnapshotInput(snapshot) {
      if (snapshot === null || snapshot === undefined) return null;
      const safe = cloneStrictJson(snapshot, "snapshot");
      const keys = Object.keys(safe).sort();
      if (keys.length !== 2 || keys[0] !== "id" || keys[1] !== "name") {
        throw error("INVALID_SNAPSHOT", "snapshot 只接受 {id, name}。");
      }
      validTextId(safe.id, "snapshot.id");
      if (typeof safe.name !== "string") throw error("INVALID_SNAPSHOT", "snapshot.name 必須是文字。");
      return safe;
    }

    async function prepareAssetWrites(candidate, assetWrites) {
      if (!Array.isArray(assetWrites)) throw error("INVALID_ASSET_WRITE", "assetWrites 必須是陣列。");
      const seen = new Set();
      const prepared = [];
      // Snapshot every id/blob reference synchronously before the first await.
      // Blob bytes are immutable, and later caller mutations of the input array
      // or its item objects cannot swap the bytes that are eventually stored.
      const writes = assetWrites.map(function (item, index) {
        if (!item || typeof item !== "object") throw error("INVALID_ASSET_WRITE", "assetWrites[" + index + "] 必須是 {id, blob}。");
        const id = validTextId(item.id, "assetWrites[" + index + "].id");
        if (seen.has(id)) throw error("DUPLICATE_ASSET_WRITE", "同一筆提交不能重複提供 Asset ID：" + id + "。");
        seen.add(id);
        const blob = item.blob;
        if (!isBlob(blob)) throw error("INVALID_ASSET_WRITE", "assetWrites[" + index + "].blob 必須是 Blob。");
        return { id: id, blob: blob };
      });

      for (let index = 0; index < writes.length; index += 1) {
        const id = writes[index].id;
        const blob = writes[index].blob;
        const metadata = candidate.assets.find(function (asset) { return asset.id === id; });
        if (!metadata) throw error("ASSET_METADATA_MISSING", "assetWrites 的 Asset ID 不在候選 Project.assets 中：" + id + "。");
        if (metadata.state !== "available") throw error("ASSET_MISSING", "新寫入的 Asset metadata 必須標記 available：" + id + "。");
        const actualSize = nativeBlobSize(blob);
        if (actualSize === null) throw error("INVALID_ASSET_WRITE", "assetWrites[" + index + "].blob 未通過原生 Blob brand check。");
        if (actualSize !== metadata.byteLength) throw error("ASSET_SIZE_MISMATCH", "Asset byteLength 與 Blob 大小不符：" + id + "。");
        if (!cryptoProvider || !cryptoProvider.subtle || typeof cryptoProvider.subtle.digest !== "function") {
          throw error("CRYPTO_UNAVAILABLE", "提供圖檔 bytes 時需要 Web Crypto SHA-256。");
        }

        let bytes;
        let digest;
        try {
          bytes = await nativeBlobArrayBuffer.call(blob);
          digest = await cryptoProvider.subtle.digest("SHA-256", bytes);
        } catch (cause) {
          throw error("ASSET_HASH_FAILED", "無法在 IndexedDB 交易外計算 Asset SHA-256：" + id + "。", cause);
        }
        const actualHash = Array.from(new Uint8Array(digest)).map(function (byte) {
          return byte.toString(16).padStart(2, "0");
        }).join("");
        if (actualHash !== metadata.sha256) throw error("ASSET_HASH_MISMATCH", "Asset SHA-256 與 Project metadata 不符：" + id + "。");
        prepared.push({ id: id, blob: blob, metadata: cloneStrictJson(metadata, "Asset metadata") });
      }
      return prepared;
    }

    function snapshotPackageBytes(value, label) {
      let bytes;
      if (value instanceof Uint8Array) {
        bytes = new Uint8Array(value);
      } else if (value instanceof ArrayBuffer) {
        bytes = new Uint8Array(value.slice(0));
      } else if (ArrayBuffer.isView(value)) {
        bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      } else {
        throw error("INVALID_PACKAGE_ASSET", label + " 必須包含原始 Uint8Array bytes。");
      }
      if (!Number.isSafeInteger(bytes.byteLength) || bytes.byteLength < 0) {
        throw error("INVALID_PACKAGE_ASSET", label + " bytes 長度無效。");
      }
      return bytes;
    }

    function importProjectPackage(input) {
      let candidate;
      let projectId;
      let assetBlobs;
      try {
        if (!isPlainObject(input) || !isPlainObject(input.project) || !Array.isArray(input.assets)) {
          throw error("INVALID_PACKAGE", "匯入資料必須包含 canonical project 與 assets 陣列。");
        }
        candidate = validateProject(input.project, "INVALID_PROJECT", "匯入 Project");
        projectId = validTextId(candidate.projectId, "projectId");
        if (input.projectId !== projectId || input.revision !== candidate.revision) {
          throw error("PACKAGE_IDENTITY_MISMATCH", "匯入封裝 projectId/revision 必須等於 canonical Project。");
        }
        if (input.project.projectId !== projectId || input.project.revision !== candidate.revision) {
          throw error("PACKAGE_IDENTITY_MISMATCH", "canonical Project 身分無效。");
        }
        if (!root || typeof root.Blob !== "function") throw error("BLOB_API_UNAVAILABLE", "匯入完整專案需要原生 Blob API。");

        const expectedAssets = new Map(candidate.assets.map(function (asset) { return [asset.id, asset]; }));
        const seenAssetIds = new Set();
        assetBlobs = input.assets.map(function (source, index) {
          const label = "匯入 Asset " + index;
          if (!isPlainObject(source)) throw error("INVALID_PACKAGE_ASSET", label + " 必須是物件。");
          const id = validTextId(source.id, label + ".id");
          if (source.projectId !== projectId) {
            throw error("CROSS_PROJECT_REFERENCE", label + " projectId 必須與 canonical Project 相同。");
          }
          if (seenAssetIds.has(id)) throw error("DUPLICATE_ASSET_ID", "匯入封裝含重複 Asset ID：" + id + "。");
          seenAssetIds.add(id);
          const metadata = expectedAssets.get(id);
          if (!metadata) throw error("ASSET_METADATA_MISSING", "匯入封裝含有不屬於 canonical Project 的 Asset：" + id + "。");
          if (source.role !== metadata.role || !source.metadata ||
              stableJson(cloneStrictJson(source.metadata, label + ".metadata")) !== stableJson(metadata)) {
            throw error("ASSET_METADATA_MISMATCH", label + " role/metadata 與 canonical Project 不一致。");
          }
          if (metadata.state !== "available") throw error("ASSET_MISSING", "完整專案包不可缺少或降級 Asset：" + id + "。");
          const bytes = snapshotPackageBytes(source.bytes, label + ".bytes");
          const blob = new root.Blob([bytes], { type: metadata.mime });
          if (nativeBlobSize(blob) !== bytes.byteLength) {
            throw error("ASSET_SIZE_MISMATCH", label + " 無法建立固定長度的 Blob。");
          }
          return { id: id, blob: blob };
        });
        if (seenAssetIds.size !== expectedAssets.size || Array.from(expectedAssets.keys()).some(function (id) { return !seenAssetIds.has(id); })) {
          throw error("ASSET_SET_MISMATCH", "匯入封裝 Asset set 必須恰好對應 canonical Project.assets。");
        }
      } catch (cause) {
        return Promise.reject(cause instanceof RepositoryError ? cause : error("INVALID_PACKAGE", "匯入完整專案封裝無效。", cause));
      }

      // Blob construction above pins a private copy of every source byte array.
      // Hashing remains outside IndexedDB; no caller-controlled bytes or async
      // work are allowed to outlive the transaction's captured inputs.
      return prepareAssetWrites(candidate, assetBlobs).then(function (stagedAssets) {
        const storedProject = cloneStrictJson(candidate, "匯入 Project storage record");
        const drawingWrites = candidate.drawings.map(function (drawing, ordinal) {
          return { projectId: projectId, id: drawing.id, ordinal: ordinal, drawing: cloneStrictJson(drawing, "匯入 Drawing") };
        });
        storedProject.drawings = [];
        const importedHistoryState = normalizeHistoryState({
          projectId: projectId,
          schemaVersion: 1,
          projectRevision: candidate.revision,
          undoEntryIds: [],
          redoEntryIds: []
        }, projectId, candidate.revision, "INVALID_HISTORY_STATE");

        return runTransaction(
          ["projects", "drawings", "assets", "history", "historyEntries", "historyState", "snapshots", "locks"],
          "readwrite",
          function (tx, setResult, abort, observe) {
            const values = {};
            let pending = 8;
            function allReadsReady() {
              pending -= 1;
              if (pending !== 0) return;
              try {
                if (values.project) throw error("PROJECT_EXISTS", "此 Project ID 已存在；完整還原不會覆寫或另存副本。");
                if (values.lock) {
                  assertLeaseRecord(values.lock, projectId);
                  throw error("PROJECT_LOCKED", "此 Project ID 已有本機編輯權記錄，拒絕匯入。");
                }
                if (values.drawings.length || values.assets.length || values.receipts.length ||
                    values.historyEntries.length || values.historyState || values.snapshots.length) {
                  throw error("PROJECT_DATA_EXISTS", "Project ID 已有孤立資料，拒絕匯入以避免覆蓋或串接本機狀態。");
                }

                const assetStore = tx.objectStore("assets");
                const drawingStore = tx.objectStore("drawings");
                const projectStore = tx.objectStore("projects");
                const historyStateStore = tx.objectStore("historyState");
                stagedAssets.forEach(function (asset) {
                  assetStore.add({ projectId: projectId, id: asset.id, metadata: asset.metadata, blob: asset.blob });
                });
                drawingWrites.forEach(function (drawing) { drawingStore.add(drawing); });
                projectStore.add(storedProject);
                // Handoff packages deliberately omit local undo commands. The
                // imported revision therefore starts with an empty, aligned
                // local cursor and no fabricated history receipts or entries.
                historyStateStore.add(importedHistoryState);
                setResult({ projectId: projectId, revision: candidate.revision });
              } catch (cause) {
                abort(cause);
              }
            }

            observe(tx.objectStore("projects").get(projectId), function (value) { values.project = value; allReadsReady(); });
            observe(tx.objectStore("drawings").index("byProject").getAll(projectId), function (value) { values.drawings = value; allReadsReady(); });
            observe(tx.objectStore("assets").index("byProject").getAll(projectId), function (value) { values.assets = value; allReadsReady(); });
            observe(tx.objectStore("history").index("byProject").getAll(projectId), function (value) { values.receipts = value; allReadsReady(); });
            observe(tx.objectStore("historyEntries").index("byProject").getAll(projectId), function (value) { values.historyEntries = value; allReadsReady(); });
            observe(tx.objectStore("historyState").get(projectId), function (value) { values.historyState = value; allReadsReady(); });
            observe(tx.objectStore("snapshots").index("byProject").getAll(projectId), function (value) { values.snapshots = value; allReadsReady(); });
            observe(tx.objectStore("locks").get(projectId), function (value) { values.lock = value; allReadsReady(); });
          }
        );
      });
    }

    function assertLeaseRecord(lease, projectId) {
      if (!lease || lease.projectId !== projectId || typeof lease.ownerToken !== "string" ||
          !Number.isFinite(lease.heartbeatAt) || !Number.isFinite(lease.expiresAt) || lease.expiresAt < lease.heartbeatAt) {
        throw error("CORRUPT_LEASE", "專案編輯權資料格式有誤。");
      }
    }

    function claimLease(projectId) {
      validTextId(projectId, "projectId");
      return runTransaction(["locks"], "readwrite", function (tx, setResult, abort, observe) {
        const request = tx.objectStore("locks").get(projectId);
        observe(request, function (existing) {
          const nowValue = currentTime();
          if (existing) {
            assertLeaseRecord(existing, projectId);
            if (existing.ownerToken !== ownerToken && existing.expiresAt > nowValue) {
              throw error("LEASE_CONFLICT", "編輯權可能仍由其他分頁或重新載入前的頁面持有，正在嘗試重新取得。");
            }
          }
          const expiresAt = nowValue + leaseMs;
          if (!Number.isFinite(expiresAt)) throw error("CLOCK_INVALID", "專案編輯權期限無效。");
          const lease = { projectId: projectId, ownerToken: ownerToken, heartbeatAt: nowValue, expiresAt: expiresAt };
          tx.objectStore("locks").put(lease);
          setResult(lease);
        });
      });
    }

    function renewLease(projectId) {
      validTextId(projectId, "projectId");
      return runTransaction(["locks"], "readwrite", function (tx, setResult, abort, observe) {
        const request = tx.objectStore("locks").get(projectId);
        observe(request, function (existing) {
          const nowValue = currentTime();
          if (!existing) throw error("LEASE_LOST", "此頁面目前沒有此專案的編輯權。");
          assertLeaseRecord(existing, projectId);
          if (existing.ownerToken !== ownerToken || existing.expiresAt <= nowValue) {
            throw error("LEASE_LOST", "此專案編輯權已失效或由其他頁面持有。");
          }
          const expiresAt = nowValue + leaseMs;
          if (!Number.isFinite(expiresAt)) throw error("CLOCK_INVALID", "專案編輯權期限無效。");
          const lease = { projectId: projectId, ownerToken: ownerToken, heartbeatAt: nowValue, expiresAt: expiresAt };
          tx.objectStore("locks").put(lease);
          setResult(lease);
        });
      });
    }

    function releaseLease(projectId) {
      validTextId(projectId, "projectId");
      return runTransaction(["locks"], "readwrite", function (tx, setResult, abort, observe) {
        const request = tx.objectStore("locks").get(projectId);
        observe(request, function (existing) {
          if (!existing) {
            setResult(false);
            return;
          }
          assertLeaseRecord(existing, projectId);
          if (existing.ownerToken !== ownerToken) {
            setResult(false);
            return;
          }
          tx.objectStore("locks").delete(projectId);
          setResult(true);
        });
      });
    }

    function listProjects() {
      return runTransaction(["projects"], "readonly", function (tx, setResult, abort, observe) {
        const request = tx.objectStore("projects").getAll();
        observe(request, function (rows) {
          const summaries = rows.map(function (row) {
            if (!row || typeof row.projectId !== "string" || typeof row.title !== "string" ||
                !Number.isInteger(row.revision) || row.revision < 0) {
              throw error("CORRUPT_PROJECT", "projects store 含有無效 Project 摘要。");
            }
            return { projectId: row.projectId, title: row.title, revision: row.revision };
          });
          summaries.sort(function (left, right) { return left.projectId < right.projectId ? -1 : left.projectId > right.projectId ? 1 : 0; });
          setResult(summaries);
        });
      });
    }

    function loadProject(projectId) {
      validTextId(projectId, "projectId");
      return runTransaction(["projects", "drawings"], "readonly", function (tx, setResult, abort, observe) {
        let projectRecord;
        let drawingRecords;
        let pending = 2;
        function finishPart() {
          pending -= 1;
          if (pending !== 0) return;
          if (!projectRecord) {
            setResult(null);
            return;
          }
          if (!Array.isArray(drawingRecords)) throw error("CORRUPT_DRAWING", "drawings store 未回傳有效資料。");
          drawingRecords.sort(function (left, right) { return left.ordinal - right.ordinal; });
          const ordinals = new Set();
          const project = cloneStrictJson(projectRecord, "儲存中的 Project");
          project.drawings = drawingRecords.map(function (record) {
            if (!record || record.projectId !== projectId || typeof record.id !== "string" ||
                !Number.isInteger(record.ordinal) || record.ordinal < 0 || ordinals.has(record.ordinal) || !record.drawing) {
              throw error("CORRUPT_DRAWING", "drawings store 含有無效或重複順序的 Drawing。");
            }
            ordinals.add(record.ordinal);
            if (record.drawing.id !== record.id || record.drawing.projectId !== projectId) {
              throw error("CORRUPT_DRAWING", "Drawing key 與內容不一致。");
            }
            return cloneStrictJson(record.drawing, "儲存中的 Drawing");
          });
          setResult(validateProject(project, "CORRUPT_PROJECT", "儲存中的 Project"));
        }
        observe(tx.objectStore("projects").get(projectId), function (value) {
          projectRecord = value;
          finishPart();
        });
        observe(tx.objectStore("drawings").index("byProject").getAll(projectId), function (value) {
          drawingRecords = value;
          finishPart();
        });
      });
    }

    function loadAsset(projectId, id) {
      validTextId(projectId, "projectId");
      validTextId(id, "assetId");
      return runTransaction(["assets"], "readonly", function (tx, setResult, abort, observe) {
        observe(tx.objectStore("assets").get([projectId, id]), function (record) {
          if (!record) {
            setResult(null);
            return;
          }
          if (record.projectId !== projectId || record.id !== id || !record.metadata || !isBlob(record.blob)) {
            throw error("CORRUPT_ASSET", "assets store 含有無效 Asset 記錄。");
          }
          setResult({ projectId: projectId, id: id, metadata: cloneStrictJson(record.metadata, "Asset metadata"), blob: record.blob });
        });
      });
    }

    function readUndoHistory(projectId) {
      validTextId(projectId, "projectId");
      return runTransaction(["projects", "historyState", "historyEntries", "history"], "readonly",
        function (tx, setResult, abort, observe) {
          const values = {};
          let pending = 3;
          function partReady() {
            pending -= 1;
            if (pending !== 0) return;
            try {
              if (!values.project || values.project.projectId !== projectId ||
                  !Number.isInteger(values.project.revision) || values.project.revision < 0) {
                throw error(values.project ? "CORRUPT_PROJECT" : "PROJECT_NOT_FOUND", "history 讀取時找不到有效 Project revision。");
              }
              const projectRevision = values.project.revision;
              const state = values.state === undefined || values.state === null
                ? null : normalizeHistoryState(values.state, projectId, projectRevision, "HISTORY_REVISION_MISMATCH");
              const receipts = cloneStrictJson(values.receipts, "history receipts");
              if (!Array.isArray(receipts)) throw error("CORRUPT_HISTORY_RECEIPT", "history store 未回傳有效 receipt 陣列。");
              receipts.forEach(function (receipt) {
                if (!isPlainObject(receipt) || receipt.projectId !== projectId || typeof receipt.commandId !== "string") {
                  throw error("CORRUPT_HISTORY_RECEIPT", "history store 含有無效 receipt。");
                }
              });
              receipts.sort(function (left, right) {
                const leftRevision = Number.isInteger(left.revision) ? left.revision : Number.MAX_SAFE_INTEGER;
                const rightRevision = Number.isInteger(right.revision) ? right.revision : Number.MAX_SAFE_INTEGER;
                if (leftRevision !== rightRevision) return leftRevision - rightRevision;
                return left.commandId < right.commandId ? -1 : left.commandId > right.commandId ? 1 : 0;
              });
              const entryIds = state ? state.undoEntryIds.concat(state.redoEntryIds) : [];
              const entries = new Map();
              if (!entryIds.length) {
                setResult({ projectRevision: projectRevision, state: state, entries: [], receipts: receipts });
                return;
              }
              let entryPending = entryIds.length;
              entryIds.forEach(function (entryId) {
                observe(tx.objectStore("historyEntries").get([projectId, entryId]), function (row) {
                  if (!row) throw error("HISTORY_ENTRY_MISSING", "historyState 參照的 entry 不存在：" + entryId + "。");
                  const entry = normalizeHistoryEntry(row, projectId, "CORRUPT_HISTORY_ENTRY");
                  if (entry.entryId !== entryId) throw error("CORRUPT_HISTORY_ENTRY", "historyEntries key 與內容不一致。");
                  entries.set(entryId, entry);
                  entryPending -= 1;
                  if (entryPending === 0) {
                    setResult({
                      projectRevision: projectRevision,
                      state: state,
                      entries: entryIds.map(function (id) { return entries.get(id); }),
                      receipts: receipts
                    });
                  }
                });
              });
            } catch (cause) {
              abort(cause);
            }
          }

          observe(tx.objectStore("projects").get(projectId), function (value) { values.project = value; partReady(); });
          observe(tx.objectStore("historyState").get(projectId), function (value) { values.state = value; partReady(); });
          observe(tx.objectStore("history").index("byProject").getAll(projectId), function (value) { values.receipts = value; partReady(); });
        });
    }

    function initializeUndoHistory(input) {
      const command = input || {};
      let projectId;
      let expectedRevision;
      let state;
      let entries;
      try {
        projectId = validTextId(command.projectId, "projectId");
        expectedRevision = command.expectedRevision;
        if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
          throw error("INVALID_ARGUMENT", "expectedRevision 必須是非負整數。");
        }
        state = normalizeHistoryState(command.state, projectId, expectedRevision, "INVALID_HISTORY_STATE");
        if (!Array.isArray(command.entries)) throw error("INVALID_HISTORY_ENTRIES", "entries 必須是 history entry 陣列。");
        entries = command.entries.map(function (entry) {
          return normalizeHistoryEntry(entry, projectId, "INVALID_HISTORY_ENTRY");
        });
        const entryIds = new Set(entries.map(function (entry) { return entry.entryId; }));
        if (entryIds.size !== entries.length) throw error("INVALID_HISTORY_ENTRIES", "entries 不可包含重複 entryId。");
        const referenced = new Set(state.undoEntryIds.concat(state.redoEntryIds));
        if (referenced.size !== entryIds.size || Array.from(referenced).some(function (entryId) { return !entryIds.has(entryId); })) {
          throw error("INVALID_HISTORY_ENTRIES", "entries 必須恰好對應 state 參照的所有 entryId。");
        }
      } catch (cause) {
        throw cause instanceof RepositoryError ? cause : error("INVALID_ARGUMENT", "initializeUndoHistory 參數無效。", cause);
      }

      return runTransaction(["projects", "locks", "historyState", "historyEntries"], "readwrite",
        function (tx, setResult, abort, observe) {
          const values = { entryRows: new Map() };
          let pending = 3 + entries.length;
          function allReadsReady() {
            pending -= 1;
            if (pending !== 0) return;
            try {
              if (values.state) throw error("HISTORY_STATE_EXISTS", "此 Project 已有持久 history state；請重讀後再決定。");
              if (!values.project || values.project.projectId !== projectId || !Number.isInteger(values.project.revision)) {
                throw error("PROJECT_NOT_FOUND", "找不到待初始化 history 的 Project。");
              }
              if (values.project.revision !== expectedRevision) {
                throw error("REVISION_CONFLICT", "history 初始化時 Project revision 已改變。");
              }
              if (values.lease) assertLeaseRecord(values.lease, projectId);
              const sampledNow = currentTime();
              if (!values.lease || values.lease.ownerToken !== ownerToken || values.lease.expiresAt <= sampledNow) {
                throw error("LEASE_LOST", "history 初始化前已無法確認此專案的編輯權。");
              }
              entries.forEach(function (entry) {
                if (values.entryRows.get(entry.entryId)) throw error("HISTORY_ENTRY_EXISTS", "history entry ID 已存在，拒絕覆寫。");
              });

              const entryStore = tx.objectStore("historyEntries");
              entries.forEach(function (entry) {
                const writeNow = currentTime();
                if (!values.lease || values.lease.ownerToken !== ownerToken || values.lease.expiresAt <= writeNow ||
                    values.project.revision !== expectedRevision) {
                  throw error("LEASE_LOST", "history 初始化寫入時編輯權或 revision 已失效。");
                }
                entryStore.add(entry);
              });
              const finalNow = currentTime();
              if (!values.lease || values.lease.ownerToken !== ownerToken || values.lease.expiresAt <= finalNow ||
                  values.project.revision !== expectedRevision) {
                throw error("LEASE_LOST", "history state 寫入時編輯權或 revision 已失效。");
              }
              tx.objectStore("historyState").add(state);
              setResult({ projectId: projectId, projectRevision: expectedRevision, entryCount: entries.length });
            } catch (cause) {
              abort(cause);
            }
          }

          observe(tx.objectStore("projects").get(projectId), function (value) { values.project = value; allReadsReady(); });
          observe(tx.objectStore("locks").get(projectId), function (value) { values.lease = value; allReadsReady(); });
          observe(tx.objectStore("historyState").get(projectId), function (value) { values.state = value; allReadsReady(); });
          entries.forEach(function (entry) {
            observe(tx.objectStore("historyEntries").get([projectId, entry.entryId]), function (value) {
              values.entryRows.set(entry.entryId, value);
              allReadsReady();
            });
          });
        });
    }

    function commitTransaction(input) {
      const command = input || {};
      let candidate;
      let commandId;
      let historyData;
      let historyDelta;
      let expectedHistory;
      let snapshotInput;
      let baseRevision;
      let stagedAssets;
      try {
        candidate = validateProject(command.project, "INVALID_PROJECT", "Project");
        commandId = validTextId(command.commandId, "commandId");
        baseRevision = command.baseRevision;
        if (baseRevision !== null && (!Number.isInteger(baseRevision) || baseRevision < 0)) {
          throw error("INVALID_ARGUMENT", "baseRevision 必須是 null 或非負整數。");
        }
        if (baseRevision === null && candidate.revision !== 0) {
          throw error("INVALID_ARGUMENT", "新 Project 的 revision 必須是 0。");
        }
        if (baseRevision !== null && candidate.revision !== baseRevision + 1) {
          throw error("INVALID_ARGUMENT", "更新 Project 的 revision 必須等於 baseRevision + 1。");
        }
        historyData = command.history === null || command.history === undefined
          ? null : cloneStrictJson(command.history, "history");
        historyDelta = command.historyDelta === null || command.historyDelta === undefined
          ? null : normalizeHistoryDelta(command.historyDelta, candidate.projectId, candidate.revision, baseRevision);
        expectedHistory = command.expectedHistory === null || command.expectedHistory === undefined
          ? null : normalizeExpectedHistory(command.expectedHistory, candidate.projectId, baseRevision);
        if (expectedHistory && !historyDelta) {
          throw error("INVALID_EXPECTED_HISTORY", "expectedHistory 必須與 historyDelta 一起提交。");
        }
        if (historyDelta && historyDelta.entryWrites.some(function (entry) { return entry.entryId !== commandId; })) {
          throw error("INVALID_HISTORY_DELTA", "新 history entry ID 必須等於該創作命令的 commandId。");
        }
        snapshotInput = validateSnapshotInput(command.snapshot);
      } catch (cause) {
        return Promise.reject(cause instanceof RepositoryError ? cause : error("INVALID_ARGUMENT", "commitTransaction 參數無效。", cause));
      }

      const suppliedAssets = command.assetWrites === undefined ? [] : command.assetWrites;
      return prepareAssetWrites(candidate, suppliedAssets).then(function (preparedAssets) {
        stagedAssets = preparedAssets;
        const projectId = candidate.projectId;
        const storedProject = cloneStrictJson(candidate, "Project storage record");
        storedProject.drawings = [];
        const drawingWrites = candidate.drawings.map(function (drawing, ordinal) {
          return { projectId: projectId, id: drawing.id, ordinal: ordinal, drawing: cloneStrictJson(drawing, "Drawing") };
        });
        const stagedById = new Map(stagedAssets.map(function (asset) { return [asset.id, asset]; }));

        return runTransaction(["projects", "drawings", "assets", "history", "snapshots", "locks", "historyState", "historyEntries"], "readwrite",
          function (tx, setResult, abort, observe) {
            const values = { assetRows: new Map(), historyEntryRows: new Map() };
            let pending = 5 + candidate.assets.length + (snapshotInput ? 1 : 0);
            function allReadsReady() {
              pending -= 1;
              if (pending !== 0) return;
              try { writeCommit(); } catch (cause) { abort(cause); }
            }

            observe(tx.objectStore("locks").get(projectId), function (value) { values.lease = value; allReadsReady(); });
            observe(tx.objectStore("projects").get(projectId), function (value) { values.project = value; allReadsReady(); });
            observe(tx.objectStore("history").get([projectId, commandId]), function (value) { values.receipt = value; allReadsReady(); });
            observe(tx.objectStore("drawings").index("byProject").getAll(projectId), function (value) { values.drawings = value; allReadsReady(); });
            observe(tx.objectStore("historyState").get(projectId), function (value) {
              values.historyState = value === undefined || value === null
                ? null : normalizeHistoryState(value, projectId, undefined, "CORRUPT_HISTORY_STATE");
              const entryIds = new Set();
              if (values.historyState) {
                values.historyState.undoEntryIds.concat(values.historyState.redoEntryIds).forEach(function (entryId) { entryIds.add(entryId); });
              }
              if (historyDelta) {
                historyDelta.nextState.undoEntryIds.concat(historyDelta.nextState.redoEntryIds).forEach(function (entryId) { entryIds.add(entryId); });
                historyDelta.entryWrites.forEach(function (entry) { entryIds.add(entry.entryId); });
                historyDelta.entryDeletes.forEach(function (entryId) { entryIds.add(entryId); });
              }
              if (expectedHistory) {
                expectedHistory.entries.forEach(function (entry) { entryIds.add(entry.entryId); });
              }
              pending += entryIds.size;
              entryIds.forEach(function (entryId) {
                observe(tx.objectStore("historyEntries").get([projectId, entryId]), function (row) {
                  values.historyEntryRows.set(entryId, row || null);
                  allReadsReady();
                });
              });
              allReadsReady();
            });
            candidate.assets.forEach(function (asset) {
              observe(tx.objectStore("assets").get([projectId, asset.id]), function (value) {
                values.assetRows.set(asset.id, value);
                allReadsReady();
              });
            });
            if (snapshotInput) {
              observe(tx.objectStore("snapshots").get([projectId, snapshotInput.id]), function (value) {
                values.snapshot = value;
                allReadsReady();
              });
            }

            function writeCommit() {
              if (values.receipt) throw error("DUPLICATE_COMMAND", "此 commandId 已提交過，不能建立第二個 revision。");
              if (snapshotInput && values.snapshot) throw error("SNAPSHOT_EXISTS", "snapshot ID 已存在，checkpoint 不可覆寫。");
              if (baseRevision === null) {
                if (values.project) throw error("PROJECT_EXISTS", "此 Project ID 已存在。");
              } else {
                if (!values.project || !Number.isInteger(values.project.revision) || values.project.revision !== baseRevision) {
                  throw error("REVISION_CONFLICT", "Project revision 已改變或 Project 不存在。");
                }
              }
              if (historyDelta) {
                if (baseRevision === null) {
                  if (values.historyState) throw error("HISTORY_STATE_EXISTS", "新 Project 已有 history state，拒絕覆寫。");
                  if (historyDelta.expectedStateRevision !== null) throw error("INVALID_HISTORY_DELTA", "新 Project 的 expectedStateRevision 必須是 null。");
                } else {
                  if (!values.historyState) throw error("HISTORY_STATE_MISSING", "持久 history state 不存在；請先初始化或安全回填。");
                  if (values.historyState.projectRevision !== baseRevision || historyDelta.expectedStateRevision !== values.historyState.projectRevision) {
                    throw error("HISTORY_REVISION_CONFLICT", "history state revision 與 Project baseRevision 不一致。");
                  }
                }

                if (expectedHistory) {
                  const actualHistory = {
                    state: values.historyState,
                    entries: expectedHistory.entries.map(function (expectedEntry) {
                      const row = values.historyEntryRows.get(expectedEntry.entryId);
                      if (!row) throw error("HISTORY_CONTENT_CONFLICT", "已驗證的 history entry 不存在：" + expectedEntry.entryId + "。");
                      return normalizeHistoryEntry(row, projectId, "CORRUPT_HISTORY_ENTRY");
                    })
                  };
                  if (stableJson(actualHistory) !== stableJson(expectedHistory)) {
                    throw error("HISTORY_CONTENT_CONFLICT", "持久 history 已偏離 model 驗證時的快照；拒絕套用舊命令。");
                  }
                }

                const writeIds = new Set(historyDelta.entryWrites.map(function (entry) { return entry.entryId; }));
                const nextIds = new Set(historyDelta.nextState.undoEntryIds.concat(historyDelta.nextState.redoEntryIds));
                const priorIds = values.historyState
                  ? values.historyState.undoEntryIds.concat(values.historyState.redoEntryIds) : [];
                priorIds.forEach(function (entryId) {
                  const row = values.historyEntryRows.get(entryId);
                  if (!row) throw error("CORRUPT_HISTORY_ENTRY", "目前 historyState 參照的 entry 不存在：" + entryId + "。");
                  const entry = normalizeHistoryEntry(row, projectId, "CORRUPT_HISTORY_ENTRY");
                  if (entry.entryId !== entryId) throw error("CORRUPT_HISTORY_ENTRY", "historyEntries key 與內容不一致。");
                });
                historyDelta.entryWrites.forEach(function (entry) {
                  if (values.historyEntryRows.get(entry.entryId)) throw error("HISTORY_ENTRY_EXISTS", "history entry ID 已存在，拒絕覆寫。");
                });
                nextIds.forEach(function (entryId) {
                  if (writeIds.has(entryId)) return;
                  const row = values.historyEntryRows.get(entryId);
                  if (!row) throw error("HISTORY_ENTRY_MISSING", "nextState 參照的 entry 不存在：" + entryId + "。");
                  const entry = normalizeHistoryEntry(row, projectId, "CORRUPT_HISTORY_ENTRY");
                  if (entry.entryId !== entryId) throw error("CORRUPT_HISTORY_ENTRY", "historyEntries key 與內容不一致。");
                });
                historyDelta.entryDeletes.forEach(function (entryId) {
                  const row = values.historyEntryRows.get(entryId);
                  if (row) {
                    const entry = normalizeHistoryEntry(row, projectId, "CORRUPT_HISTORY_ENTRY");
                    if (entry.entryId !== entryId) throw error("CORRUPT_HISTORY_ENTRY", "historyEntries key 與內容不一致。");
                  }
                });
              } else if (values.historyState) {
                throw error("HISTORY_DELTA_REQUIRED", "此 Project 已有持久 history state，提交必須同時提供 historyDelta。");
              }
              if (values.lease) assertLeaseRecord(values.lease, projectId);
              const writeLease = values.lease;
              const capturedProjectRevision = values.project ? values.project.revision : null;
              const checkAuthority = function () {
                const sampledNow = currentTime();
                if (!writeLease || writeLease.ownerToken !== ownerToken || writeLease.expiresAt <= sampledNow) {
                  throw error("LEASE_LOST", "提交前已無法確認此專案的編輯權。");
                }
                if (baseRevision === null) {
                  if (capturedProjectRevision !== null) throw error("PROJECT_EXISTS", "此 Project ID 已存在。");
                } else if (capturedProjectRevision !== baseRevision) {
                  throw error("REVISION_CONFLICT", "Project revision 已改變。");
                }
                return sampledNow;
              };

              candidate.assets.forEach(function (metadata) {
                const existing = values.assetRows.get(metadata.id);
                const staged = stagedById.get(metadata.id);
                if (staged) {
                  if (existing) throw error("IMMUTABLE_ASSET_EXISTS", "不可覆寫既有 Asset ID：" + metadata.id + "。");
                  return;
                }
                if (!existing) throw error("ASSET_MISSING", "候選 Project 缺少必要 Asset bytes：" + metadata.id + "。");
                if (!existing.metadata || stableJson(existing.metadata) !== stableJson(metadata) || !isBlob(existing.blob) ||
                    nativeBlobSize(existing.blob) !== metadata.byteLength || metadata.state !== "available") {
                  throw error("ASSET_METADATA_MISMATCH", "既有 Asset 記錄與候選 metadata 不符：" + metadata.id + "。");
                }
              });

              const existingDrawingIds = new Set((values.drawings || []).map(function (record) { return record.id; }));
              const candidateDrawingIds = new Set(drawingWrites.map(function (record) { return record.id; }));
              const assetStore = tx.objectStore("assets");
              const drawingStore = tx.objectStore("drawings");
              const projectStore = tx.objectStore("projects");
              const historyStore = tx.objectStore("history");
              const snapshotStore = tx.objectStore("snapshots");
              const historyEntryStore = tx.objectStore("historyEntries");
              const historyStateStore = tx.objectStore("historyState");

              stagedAssets.forEach(function (asset) {
                checkAuthority();
                assetStore.add({ projectId: projectId, id: asset.id, metadata: asset.metadata, blob: asset.blob });
              });
              existingDrawingIds.forEach(function (drawingId) {
                if (!candidateDrawingIds.has(drawingId)) {
                  checkAuthority();
                  drawingStore.delete([projectId, drawingId]);
                }
              });
              drawingWrites.forEach(function (record) {
                checkAuthority();
                drawingStore.put(record);
              });
              checkAuthority();
              if (baseRevision === null) projectStore.add(storedProject);
              else projectStore.put(storedProject);

              const recordedAt = checkAuthority();
              const receipt = { projectId: projectId, commandId: commandId, revision: candidate.revision, recordedAt: recordedAt, receipt: true };
              if (historyData !== null) receipt.data = historyData;
              checkAuthority();
              historyStore.add(receipt);

              if (historyDelta) {
                historyDelta.entryDeletes.forEach(function (entryId) {
                  checkAuthority();
                  historyEntryStore.delete([projectId, entryId]);
                });
                historyDelta.entryWrites.forEach(function (entry) {
                  checkAuthority();
                  historyEntryStore.add(entry);
                });
                checkAuthority();
                if (baseRevision === null) historyStateStore.add(historyDelta.nextState);
                else historyStateStore.put(historyDelta.nextState);
              }

              if (snapshotInput) {
                const timestamp = checkAuthority();
                const snapshotRecord = {
                  projectId: projectId,
                  id: snapshotInput.id,
                  name: snapshotInput.name,
                  revision: candidate.revision,
                  timestamp: timestamp,
                  project: cloneStrictJson(candidate, "Recovery snapshot Project"),
                  assetRefs: candidate.assets.map(function (asset) { return asset.id; })
                };
                checkAuthority();
                snapshotStore.add(snapshotRecord);
              }

              setResult({ projectId: projectId, revision: candidate.revision, commandId: commandId });
            }
          });
      });
    }

    function normalizeSnapshotRecord(record, projectId) {
      if (!record || record.projectId !== projectId || typeof record.id !== "string" || typeof record.name !== "string" ||
          !Number.isInteger(record.revision) || !Number.isFinite(record.timestamp) || !Array.isArray(record.assetRefs)) {
        throw error("CORRUPT_SNAPSHOT", "Recovery snapshot 記錄格式損毀。");
      }
      const project = validateProject(record.project, "CORRUPT_SNAPSHOT", "Recovery snapshot Project");
      if (project.projectId !== projectId || project.revision !== record.revision) {
        throw error("CORRUPT_SNAPSHOT", "Recovery snapshot Project key 或 revision 不一致。");
      }
      const expectedRefs = project.assets.map(function (asset) { return asset.id; });
      if (stableJson(record.assetRefs) !== stableJson(expectedRefs)) {
        throw error("CORRUPT_SNAPSHOT", "Recovery snapshot assetRefs 與 Project 不一致。");
      }
      return deepFreeze({
        projectId: projectId,
        id: record.id,
        name: record.name,
        revision: record.revision,
        timestamp: record.timestamp,
        project: project,
        assetRefs: expectedRefs.slice()
      });
    }

    function readRecoverySnapshot(projectId, snapshotId) {
      validTextId(projectId, "projectId");
      if (snapshotId !== undefined && snapshotId !== null) validTextId(snapshotId, "snapshotId");
      return runTransaction(["snapshots"], "readonly", function (tx, setResult, abort, observe) {
        if (snapshotId !== undefined && snapshotId !== null) {
          observe(tx.objectStore("snapshots").get([projectId, snapshotId]), function (record) {
            setResult(record ? normalizeSnapshotRecord(record, projectId) : null);
          });
          return;
        }
        observe(tx.objectStore("snapshots").index("byProject").getAll(projectId), function (records) {
          if (!records.length) {
            setResult(null);
            return;
          }
          records.sort(function (left, right) {
            if (left.revision !== right.revision) return right.revision - left.revision;
            if (left.timestamp !== right.timestamp) return right.timestamp - left.timestamp;
            if (left.id === right.id) return 0;
            return left.id < right.id ? 1 : -1;
          });
          setResult(normalizeSnapshotRecord(records[0], projectId));
        });
      });
    }

    api = Object.freeze({
      open: open,
      close: close,
      listProjects: listProjects,
      loadProject: loadProject,
      claimLease: claimLease,
      renewLease: renewLease,
      releaseLease: releaseLease,
      readUndoHistory: readUndoHistory,
      initializeUndoHistory: initializeUndoHistory,
      importProjectPackage: importProjectPackage,
      commitTransaction: commitTransaction,
      readRecoverySnapshot: readRecoverySnapshot,
      loadAsset: loadAsset
    });
    return api;
  }

  return Object.freeze({
    DATABASE_VERSION: DATABASE_VERSION,
    RepositoryError: RepositoryError,
    createRepository: createRepository
  });
});
