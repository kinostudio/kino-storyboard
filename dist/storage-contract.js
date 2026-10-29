(function attachStorageContract(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DirectorStoryboardStorageContract = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createStorageContract() {
  "use strict";

  const LEGACY_STORAGE_KEY = "kino-storyboard-demo-v1";
  const BOOT_ADAPTER_METHODS = Object.freeze(["open", "loadProject"]);
  const FULL_ADAPTER_METHODS = Object.freeze([
    "open",
    "loadProject",
    "commitTransaction",
    "claimLease",
    "readRecoverySnapshot"
  ]);

  class StorageContractError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = "StorageContractError";
      this.code = code;
      this.details = details || null;
    }
  }

  function assertMethods(target, methods, label) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) {
      throw new StorageContractError("INVALID_ADAPTER", label + " 必須是物件。");
    }
    methods.forEach(function (method) {
      if (typeof target[method] !== "function") {
        throw new StorageContractError("INVALID_ADAPTER", label + " 缺少 " + method + "().");
      }
    });
    return target;
  }

  function assertBootAdapter(adapter) {
    return assertMethods(adapter, BOOT_ADAPTER_METHODS, "storage adapter");
  }

  function assertFullAdapter(adapter) {
    return assertMethods(adapter, FULL_ADAPTER_METHODS, "storage adapter");
  }

  function readLegacyRaw(legacyStorage) {
    if (!legacyStorage || typeof legacyStorage.getItem !== "function") {
      throw new StorageContractError("LEGACY_STORAGE_UNAVAILABLE", "無法讀取舊版 localStorage 草稿。");
    }

    let raw;
    try {
      // Deliberately access exactly one key. Never enumerate, rewrite or remove
      // the user's legacy storage.
      raw = legacyStorage.getItem(LEGACY_STORAGE_KEY);
    } catch (error) {
      throw new StorageContractError(
        "LEGACY_STORAGE_READ_FAILED",
        "讀取舊版 localStorage 草稿失敗。",
        { cause: error && error.message ? error.message : String(error) }
      );
    }

    if (raw !== null && typeof raw !== "string") {
      throw new StorageContractError("INVALID_LEGACY_STORAGE_VALUE", "舊版 localStorage 必須回傳字串或 null。");
    }

    return raw === null
      ? Object.freeze({ found: false, key: LEGACY_STORAGE_KEY, raw: null })
      : Object.freeze({ found: true, key: LEGACY_STORAGE_KEY, raw: raw });
  }

  return Object.freeze({
    LEGACY_STORAGE_KEY: LEGACY_STORAGE_KEY,
    BOOT_ADAPTER_METHODS: BOOT_ADAPTER_METHODS,
    FULL_ADAPTER_METHODS: FULL_ADAPTER_METHODS,
    StorageContractError: StorageContractError,
    assertBootAdapter: assertBootAdapter,
    assertFullAdapter: assertFullAdapter,
    readLegacyRaw: readLegacyRaw
  });
});
