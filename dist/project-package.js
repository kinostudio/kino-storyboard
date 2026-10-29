(function attachProjectPackage(root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DirectorStoryboardProjectPackage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProjectPackage(root) {
  "use strict";

  const FORMAT = "director-storyboard-project-package";
  const FORMAT_VERSION = 1;
  const MANIFEST_PATH = "manifest.json";
  const PROJECT_PATH = "project.json";
  const DEFAULT_LIMITS = Object.freeze({
    maxSingleImageBytes: 20 * 1024 * 1024,
    maxUncompressedPackageBytes: 500 * 1024 * 1024,
    maxArchiveBytes: 500 * 1024 * 1024 + 16 * 1024 * 1024,
    maxEntries: 10002
  });
  const LIMITS_STATUS = "provisional_precheck";
  const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const packageScriptBase = (function () {
    if (!root || !root.document) return null;
    const current = root.document.currentScript;
    if (current && current.src) return current.src;
    const scripts = Array.from(root.document.scripts || []);
    const packageScript = scripts.find(function (script) { return /(?:^|\/)project-package\.js(?:[?#]|$)/.test(script.src || ""); });
    return packageScript && packageScript.src || root.document.baseURI;
  })();

  class ProjectPackageError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = "ProjectPackageError";
      this.code = code;
      this.details = details || null;
    }
  }

  function fail(code, message, details) {
    throw new ProjectPackageError(code, message, details);
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function exactKeys(value, expected, code, label) {
    if (!isRecord(value)) fail(code, label + " 必須是物件。");
    const actual = Object.keys(value).sort();
    const wanted = expected.slice().sort();
    if (actual.length !== wanted.length || actual.some(function (key, index) { return key !== wanted[index]; })) {
      fail(code, label + " 欄位不完整或含有未支援欄位。", { expected: wanted, actual: actual });
    }
  }

  function getSchema(options) {
    const schema = options && options.schema || (root && root.DirectorStoryboardProjectSchema);
    if (!schema || typeof schema.validateProject !== "function") {
      fail("SCHEMA_UNAVAILABLE", "請先載入 DirectorStoryboardProjectSchema。");
    }
    return schema;
  }

  function limits(options) {
    const result = Object.assign({}, DEFAULT_LIMITS, options && options.limits || {});
    Object.keys(DEFAULT_LIMITS).forEach(function (name) {
      if (!Number.isSafeInteger(result[name]) || result[name] < 1) {
        fail("INVALID_PACKAGE_LIMIT", "專案包限制值必須是正的安全整數。", { name: name, value: result[name] });
      }
    });
    return result;
  }

  function assertSafePath(path) {
    if (typeof path !== "string" || !path || path.length > 4096 || path.indexOf("\u0000") !== -1 ||
        path.indexOf("\\") !== -1 || path.charAt(0) === "/" || /^[A-Za-z]:/.test(path) || path.indexOf(":") !== -1) {
      fail("UNSAFE_ENTRY_PATH", "專案包包含無效或不安全的 entry path。", { path: path });
    }
    const segments = path.split("/");
    if (segments.some(function (part) { return !part || part === "." || part === ".."; })) {
      fail("UNSAFE_ENTRY_PATH", "專案包 entry path 不可包含空白、. 或 .. 路徑段。", { path: path });
    }
  }

  function isWellFormedUnicode(value) {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
        index += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        return false;
      }
    }
    return true;
  }

  function encodeBase64Url(bytes) {
    let result = "";
    for (let index = 0; index < bytes.length; index += 3) {
      const a = bytes[index];
      const hasB = index + 1 < bytes.length;
      const hasC = index + 2 < bytes.length;
      const b = hasB ? bytes[index + 1] : 0;
      const c = hasC ? bytes[index + 2] : 0;
      result += BASE64URL.charAt(a >> 2);
      result += BASE64URL.charAt(((a & 3) << 4) | (b >> 4));
      if (hasB) result += BASE64URL.charAt(((b & 15) << 2) | (c >> 6));
      if (hasC) result += BASE64URL.charAt(c & 63);
    }
    return result;
  }

  function assetPath(assetId) {
    if (typeof assetId !== "string" || !isWellFormedUnicode(assetId)) {
      fail("INVALID_ASSET_ID", "Asset ID 必須是有效 Unicode 文字，才能安全封裝成 ZIP entry path。", { assetId: assetId });
    }
    const encoder = new TextEncoder();
    return "assets/" + encodeBase64Url(encoder.encode(assetId)) + ".bin";
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    if (isRecord(value)) {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + stableStringify(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function encodeUtf8(value) {
    return new TextEncoder().encode(value);
  }

  function asBytes(value, label) {
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }
    fail("INVALID_ENTRY_BYTES", label + " 必須是原始位元組。", { valueType: typeof value });
  }

  function utf8Json(bytes, label) {
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (cause) {
      fail("INVALID_PACKAGE_JSON", label + " 必須是有效 UTF-8 JSON。", { cause: cause && cause.message });
    }
  }

  function sha256(options) {
    if (options && typeof options.sha256 === "function") return options.sha256;
    const cryptoApi = options && options.crypto || (root && root.crypto);
    if (!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.subtle.digest !== "function") {
      fail("CRYPTO_UNAVAILABLE", "專案包驗證需要 SHA-256；請提供可用的 Web Crypto 或 sha256 adapter。");
    }
    return async function digestSha256(bytes) {
      const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map(function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
    };
  }

  async function hashBytes(bytes, options) {
    let value;
    try {
      value = await sha256(options)(bytes);
    } catch (cause) {
      if (cause instanceof ProjectPackageError) throw cause;
      fail("HASH_FAILED", "無法計算 package entry 的 SHA-256。", { cause: cause && cause.message });
    }
    if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
      fail("INVALID_HASH_RESULT", "sha256 adapter 必須回傳小寫 64 位十六進位雜湊。");
    }
    return value;
  }

  function blobIntrinsics() {
    const BlobCtor = root && root.Blob;
    if (typeof BlobCtor !== "function" || !BlobCtor.prototype) {
      fail("BLOB_API_UNAVAILABLE", "專案包匯出需要原生 Blob API。");
    }
    const sizeDescriptor = Object.getOwnPropertyDescriptor(BlobCtor.prototype, "size");
    const sizeGetter = sizeDescriptor && sizeDescriptor.get;
    const arrayBuffer = BlobCtor.prototype.arrayBuffer;
    if (typeof sizeGetter !== "function" || typeof arrayBuffer !== "function") {
      fail("BLOB_API_UNAVAILABLE", "此環境缺少可驗證 Blob bytes 的原生 Blob API。");
    }
    return { sizeGetter: sizeGetter, arrayBuffer: arrayBuffer };
  }

  async function readBlobBytes(blob, label, sizeLimit) {
    const intrinsics = blobIntrinsics();
    let size;
    try {
      size = intrinsics.sizeGetter.call(blob);
    } catch (cause) {
      fail("INVALID_BLOB", label + " 必須是真正的瀏覽器 Blob 或 File。", { cause: cause && cause.message });
    }
    if (!Number.isSafeInteger(size) || size < 0) fail("INVALID_BLOB", label + " Blob 大小無效。");
    if (size > sizeLimit) fail("IMAGE_SIZE_LIMIT", label + " 超過單一圖片大小上限。", { size, limit: sizeLimit });
    let buffer;
    try {
      buffer = await intrinsics.arrayBuffer.call(blob);
    } catch (cause) {
      fail("BLOB_READ_FAILED", label + " 的原始 Blob bytes 無法讀取。", { cause: cause && cause.message });
    }
    const bytes = asBytes(buffer, label);
    if (bytes.byteLength !== size) fail("ASSET_SIZE_MISMATCH", label + " 讀出的 bytes 長度與 Blob size 不符。", { expected: size, actual: bytes.byteLength });
    return bytes;
  }

  function validateProject(projectInput, options) {
    const schema = getSchema(options);
    let project;
    try {
      project = schema.validateProject(projectInput);
    } catch (cause) {
      if (cause instanceof ProjectPackageError) throw cause;
      fail("INVALID_PROJECT", "canonical Project 未通過 schema 驗證。", {
        causeCode: cause && cause.code || null,
        causePath: cause && cause.path || null,
        cause: cause && cause.message || String(cause)
      });
    }
    const assetsById = new Map(project.assets.map(function (asset) { return [asset.id, asset]; }));
    project.shots.forEach(function (shot) {
      const seenAssetIds = new Set();
      shot.assetIds.forEach(function (assetId) {
        if (seenAssetIds.has(assetId)) {
          fail("DUPLICATE_SHOT_ASSET_REFERENCE", "同一 Shot 不可重複引用相同照片 Asset。", {
            shotId: shot.id,
            assetId: assetId
          });
        }
        seenAssetIds.add(assetId);
        const asset = assetsById.get(assetId);
        if (!asset || asset.role !== "photoOriginal") {
          fail("INVALID_SHOT_PHOTO_ASSET", "Shot 的照片清單只能引用 photoOriginal Asset。", {
            shotId: shot.id,
            assetId: assetId,
            role: asset && asset.role || null
          });
        }
      });
    });
    return project;
  }

  function verifyRevision(project, expectedRevision) {
    if (expectedRevision !== undefined && expectedRevision !== project.revision) {
      fail("REVISION_MISMATCH", "匯出固定 revision 與 Project snapshot 不符。", {
        expectedRevision: expectedRevision,
        actualRevision: project.revision
      });
    }
  }

  function normalizeSourceAssets(project, sourceAssets) {
    if (!Array.isArray(sourceAssets)) fail("INVALID_ASSET_INPUT", "assets 必須是包含 projectId、id 與 Blob 的陣列。");
    const expected = new Map(project.assets.map(function (asset) { return [asset.id, asset]; }));
    const seen = new Set();
    return sourceAssets.map(function (source, index) {
      if (!isRecord(source)) fail("INVALID_ASSET_INPUT", "assets[" + index + "] 必須是物件。");
      const id = source.id;
      if (typeof id !== "string" || !expected.has(id)) {
        fail("ASSET_METADATA_MISSING", "Asset bytes 沒有對應 canonical Project metadata。", { id: id });
      }
      if (seen.has(id)) fail("DUPLICATE_ASSET_ID", "輸入 bytes 含重複 Asset ID。", { id: id });
      seen.add(id);
      if (source.projectId !== project.projectId) {
        fail("CROSS_PROJECT_REFERENCE", "Asset bytes 必須與固定 Project snapshot 屬於同一 projectId。", { id: id, projectId: source.projectId, expectedProjectId: project.projectId });
      }
      const metadata = expected.get(id);
      if (source.metadata !== undefined && stableStringify(source.metadata) !== stableStringify(metadata)) {
        fail("ASSET_METADATA_MISMATCH", "Repository Asset metadata 與固定 Project revision 不一致。", { id: id });
      }
      if (metadata.state !== "available") fail("ASSET_MISSING", "完整專案包不可省略 missing Asset。", { id: id });
      const blob = source.blob || source.originalBlob;
      if (!blob) fail("ASSET_MISSING", "完整專案包缺少 Asset 原始 Blob。", { id: id });
      return { projectId: source.projectId, id: id, blob: blob, metadata: metadata };
    });
  }

  async function prepareProjectPackageEntries(projectInput, sourceAssets, options) {
    const policy = limits(options);
    const project = validateProject(projectInput, options);
    verifyRevision(project, options && options.expectedRevision);
    const assets = normalizeSourceAssets(project, sourceAssets);
    if (assets.length !== project.assets.length) {
      const missing = project.assets.filter(function (asset) { return !assets.some(function (item) { return item.id === asset.id; }); }).map(function (asset) { return asset.id; });
      fail("ASSET_MISSING", "完整專案包必須包含 canonical Project.assets 的每個原始 Blob。", { missingAssetIds: missing });
    }

    const encoder = new TextEncoder();
    const projectBytes = encoder.encode(stableStringify(project));
    const projectEntry = {
      path: PROJECT_PATH,
      bytes: projectBytes,
      byteLength: projectBytes.byteLength,
      sha256: await hashBytes(projectBytes, options)
    };
    const payloadEntries = [projectEntry];
    const manifestEntries = [{
      path: projectEntry.path,
      kind: "project",
      byteLength: projectEntry.byteLength,
      sha256: projectEntry.sha256
    }];
    let totalBytes = projectBytes.byteLength;
    if (totalBytes > policy.maxUncompressedPackageBytes) {
      fail("PACKAGE_SIZE_LIMIT", "Project JSON 已超過專案包未壓縮大小上限。", { size: totalBytes, limit: policy.maxUncompressedPackageBytes });
    }

    for (let index = 0; index < assets.length; index += 1) {
      const source = assets[index];
      const metadata = source.metadata;
      if (!Number.isSafeInteger(metadata.byteLength) || metadata.byteLength < 0 || metadata.byteLength > policy.maxSingleImageBytes) {
        fail("IMAGE_SIZE_LIMIT", "Asset metadata.byteLength 超過單一圖片大小上限。", { id: source.id, size: metadata.byteLength, limit: policy.maxSingleImageBytes });
      }
      const bytes = await readBlobBytes(source.blob, "Asset " + source.id, policy.maxSingleImageBytes);
      if (bytes.byteLength !== metadata.byteLength) {
        fail("ASSET_SIZE_MISMATCH", "Asset Blob byteLength 與 canonical metadata 不符。", { id: source.id, expected: metadata.byteLength, actual: bytes.byteLength });
      }
      const digest = await hashBytes(bytes, options);
      if (digest !== metadata.sha256) {
        fail("ASSET_HASH_MISMATCH", "Asset 原始 Blob SHA-256 與 canonical metadata 不符。", { id: source.id, expected: metadata.sha256, actual: digest });
      }
      totalBytes += bytes.byteLength;
      if (totalBytes > policy.maxUncompressedPackageBytes) {
        fail("PACKAGE_SIZE_LIMIT", "專案包未壓縮大小超過上限。", { size: totalBytes, limit: policy.maxUncompressedPackageBytes });
      }
      const path = assetPath(source.id);
      const entry = { path: path, bytes: bytes, byteLength: bytes.byteLength, sha256: digest };
      payloadEntries.push(entry);
      manifestEntries.push({
        path: path,
        kind: "asset",
        assetId: source.id,
        role: metadata.role,
        byteLength: bytes.byteLength,
        sha256: digest
      });
    }

    const manifest = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      projectId: project.projectId,
      revision: project.revision,
      entries: manifestEntries
    };
    const manifestBytes = encoder.encode(stableStringify(manifest));
    totalBytes += manifestBytes.byteLength;
    if (totalBytes > policy.maxUncompressedPackageBytes) {
      fail("PACKAGE_SIZE_LIMIT", "含 manifest 的專案包未壓縮大小超過上限。", { size: totalBytes, limit: policy.maxUncompressedPackageBytes });
    }
    return {
      manifest: manifest,
      project: project,
      entries: [{ path: MANIFEST_PATH, bytes: manifestBytes, byteLength: manifestBytes.byteLength }].concat(payloadEntries),
      totalUncompressedBytes: totalBytes
    };
  }

  function validateEntryArray(inputEntries, policy, internalOptions) {
    if (!Array.isArray(inputEntries)) fail("INVALID_ARCHIVE_ENTRIES", "ZIP adapter 必須回傳 raw archive entries 陣列。");
    if (inputEntries.length < 2 || inputEntries.length > policy.maxEntries) {
      fail("ENTRY_COUNT_LIMIT", "專案包 entry 數量為空或超過上限。", { count: inputEntries.length, limit: policy.maxEntries });
    }
    const names = new Set();
    const entries = inputEntries.map(function (entry, index) {
      if (!isRecord(entry) || typeof entry.path !== "string") fail("INVALID_ARCHIVE_ENTRY", "archive entry 必須包含 path 與 bytes。", { index: index });
      assertSafePath(entry.path);
      if (names.has(entry.path)) fail("DUPLICATE_ARCHIVE_ENTRY", "專案包含重複 entry path。", { path: entry.path });
      names.add(entry.path);
      const bytes = internalOptions && internalOptions.takeOwnership === true && entry.bytes instanceof Uint8Array
        ? entry.bytes
        : asBytes(entry.bytes, "archive entry " + entry.path);
      return { path: entry.path, bytes: bytes };
    });
    const total = entries.reduce(function (sum, entry) { return sum + entry.bytes.byteLength; }, 0);
    if (!Number.isSafeInteger(total) || total > policy.maxUncompressedPackageBytes) {
      fail("PACKAGE_SIZE_LIMIT", "專案包未壓縮大小超過上限。", { size: total, limit: policy.maxUncompressedPackageBytes });
    }
    return entries;
  }

  function checkManifest(manifest) {
    exactKeys(manifest, ["format", "formatVersion", "projectId", "revision", "entries"], "INVALID_MANIFEST", "manifest");
    if (manifest.format !== FORMAT) fail("UNKNOWN_PACKAGE_FORMAT", "不支援此專案包格式。", { format: manifest.format });
    if (manifest.formatVersion !== FORMAT_VERSION) fail("UNSUPPORTED_PACKAGE_VERSION", "不支援此專案包版本。", { formatVersion: manifest.formatVersion });
    if (typeof manifest.projectId !== "string" || !manifest.projectId.trim() || !Number.isSafeInteger(manifest.revision) || manifest.revision < 0) {
      fail("INVALID_MANIFEST", "manifest.projectId 或 revision 無效。");
    }
    if (!Array.isArray(manifest.entries) || manifest.entries.length < 1) fail("INVALID_MANIFEST", "manifest.entries 必須至少包含 project.json。");
  }

  async function verifyProjectPackageEntriesLocal(inputEntries, options, internalOptions) {
    const policy = limits(options);
    const entries = validateEntryArray(inputEntries, policy, internalOptions);
    const archiveByPath = new Map(entries.map(function (entry) { return [entry.path, entry]; }));
    if (!archiveByPath.has(MANIFEST_PATH)) fail("PACKAGE_ENTRY_MISSING", "專案包缺少 manifest.json。");
    const manifest = utf8Json(archiveByPath.get(MANIFEST_PATH).bytes, MANIFEST_PATH);
    checkManifest(manifest);

    if (manifest.entries.length + 1 !== entries.length) {
      fail("PACKAGE_ENTRY_SET_MISMATCH", "ZIP entries 必須恰好包含 manifest 與 manifest 所列的 payload。", {
        archiveEntryCount: entries.length,
        manifestEntryCount: manifest.entries.length
      });
    }
    const manifestByPath = new Map();
    const manifestAssetIds = new Set();
    let projectItem = null;
    manifest.entries.forEach(function (item, index) {
      if (!isRecord(item)) fail("INVALID_MANIFEST_ENTRY", "manifest.entries[" + index + "] 必須是物件。");
      if (item.kind === "project") {
        exactKeys(item, ["path", "kind", "byteLength", "sha256"], "INVALID_MANIFEST_ENTRY", "project manifest entry");
        if (projectItem) fail("DUPLICATE_PROJECT_ENTRY", "manifest 只能列一個 Project entry。");
        if (item.path !== PROJECT_PATH) fail("INVALID_PROJECT_PATH", "Project entry path 必須是 project.json。", { path: item.path });
        projectItem = item;
      } else if (item.kind === "asset") {
        exactKeys(item, ["path", "kind", "assetId", "role", "byteLength", "sha256"], "INVALID_MANIFEST_ENTRY", "asset manifest entry");
        if (typeof item.assetId !== "string" || !item.assetId.trim()) fail("INVALID_MANIFEST_ENTRY", "Asset entry 必須有 assetId。");
        if (manifestAssetIds.has(item.assetId)) fail("DUPLICATE_ASSET_ID", "manifest 含重複 Asset ID。", { id: item.assetId });
        manifestAssetIds.add(item.assetId);
        if (item.path !== assetPath(item.assetId)) fail("INVALID_ASSET_PATH", "Asset entry path 必須由 Asset ID 確定產生。", { id: item.assetId, path: item.path });
      } else {
        fail("INVALID_MANIFEST_ENTRY", "manifest entry kind 只能是 project 或 asset。", { kind: item.kind });
      }
      assertSafePath(item.path);
      if (manifestByPath.has(item.path)) fail("DUPLICATE_MANIFEST_ENTRY", "manifest 含重複 entry path。", { path: item.path });
      manifestByPath.set(item.path, item);
      if (!Number.isSafeInteger(item.byteLength) || item.byteLength < 0 || typeof item.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(item.sha256)) {
        fail("INVALID_MANIFEST_ENTRY", "manifest entry byteLength 或 SHA-256 無效。", { path: item.path });
      }
      if (item.byteLength > policy.maxSingleImageBytes && item.kind === "asset") {
        fail("IMAGE_SIZE_LIMIT", "Asset entry 超過單一圖片大小上限。", { path: item.path, size: item.byteLength, limit: policy.maxSingleImageBytes });
      }
      if (!archiveByPath.has(item.path)) fail("PACKAGE_ENTRY_MISSING", "ZIP 缺少 manifest 指定 entry。", { path: item.path });
    });
    if (!projectItem) fail("PACKAGE_ENTRY_MISSING", "manifest 缺少 Project entry。");
    if (manifestByPath.has(MANIFEST_PATH)) fail("INVALID_MANIFEST_ENTRY", "manifest 不可將自己列為 payload entry。");
    entries.forEach(function (entry) {
      if (entry.path !== MANIFEST_PATH && !manifestByPath.has(entry.path)) {
        fail("UNLISTED_PACKAGE_ENTRY", "ZIP 含有未列在 manifest 的 payload entry。", { path: entry.path });
      }
    });

    for (const item of manifest.entries) {
      throwIfAborted(options && options.signal);
      const entry = archiveByPath.get(item.path);
      if (entry.bytes.byteLength !== item.byteLength) {
        fail("ENTRY_SIZE_MISMATCH", "entry bytes 長度與 manifest 不符。", { path: item.path, expected: item.byteLength, actual: entry.bytes.byteLength });
      }
      const digest = await hashBytes(entry.bytes, options);
      throwIfAborted(options && options.signal);
      if (digest !== item.sha256) fail("ENTRY_HASH_MISMATCH", "entry SHA-256 與 manifest 不符。", { path: item.path, expected: item.sha256, actual: digest });
    }

    const projectBytes = archiveByPath.get(PROJECT_PATH).bytes;
    const project = validateProject(utf8Json(projectBytes, PROJECT_PATH), options);
    if (project.projectId !== manifest.projectId || project.revision !== manifest.revision) {
      fail("PROJECT_IDENTITY_MISMATCH", "manifest projectId/revision 必須等於固定 canonical Project。", {
        manifestProjectId: manifest.projectId,
        projectId: project.projectId,
        manifestRevision: manifest.revision,
        revision: project.revision
      });
    }
    const projectManifestEntry = manifestByPath.get(PROJECT_PATH);
    if (!projectManifestEntry || projectManifestEntry.kind !== "project") fail("INVALID_MANIFEST", "manifest 必須以 project.json 標記 canonical Project entry。");

    const assetsById = new Map(project.assets.map(function (asset) { return [asset.id, asset]; }));
    if (assetsById.size !== manifestAssetIds.size || Array.from(assetsById.keys()).some(function (id) { return !manifestAssetIds.has(id); })) {
      fail("ASSET_SET_MISMATCH", "manifest Asset set 必須恰好對應 canonical Project.assets。", {
        projectAssetIds: Array.from(assetsById.keys()),
        manifestAssetIds: Array.from(manifestAssetIds)
      });
    }
    const stagedAssets = [];
    manifest.entries.forEach(function (item) {
      if (item.kind !== "asset") return;
      const metadata = assetsById.get(item.assetId);
      if (!metadata) fail("ASSET_METADATA_MISSING", "manifest Asset 不在 canonical Project.assets 中。", { id: item.assetId });
      if (metadata.state !== "available") fail("ASSET_MISSING", "完整專案包不可標記 missing Asset。", { id: item.assetId });
      if (metadata.projectId !== project.projectId) fail("CROSS_PROJECT_REFERENCE", "Asset metadata 跨越 Project 邊界。", { id: item.assetId });
      if (metadata.role !== item.role || metadata.byteLength !== item.byteLength || metadata.sha256 !== item.sha256) {
        fail("ASSET_METADATA_MISMATCH", "Asset entry role/size/hash 必須與 canonical Project metadata 一致。", { id: item.assetId });
      }
      stagedAssets.push({
        projectId: project.projectId,
        id: item.assetId,
        role: item.role,
        metadata: metadata,
        bytes: internalOptions && internalOptions.takeOwnership === true
          ? archiveByPath.get(item.path).bytes
          : new Uint8Array(archiveByPath.get(item.path).bytes)
      });
    });
    return {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      projectId: project.projectId,
      revision: project.revision,
      project: project,
      assets: stagedAssets,
      manifest: manifest
    };
  }

  function getZipAdapter(options) {
    const adapter = options && options.zipAdapter;
    if (!adapter || typeof adapter.encode !== "function" || typeof adapter.decode !== "function") {
      fail("ZIP_ADAPTER_UNAVAILABLE", "尚未提供經核准的 ZIP adapter；專案包 JSON 不能代替 .storyboard.zip。");
    }
    return adapter;
  }

  async function exportProjectPackageLocal(projectInput, sourceAssets, options) {
    const policy = limits(options);
    const adapter = getZipAdapter(options);
    const prepared = await prepareProjectPackageEntries(projectInput, sourceAssets, options);
    let archiveBytes;
    try {
      archiveBytes = asBytes(await adapter.encode(prepared.entries, {
        maxArchiveBytes: policy.maxArchiveBytes,
        maxUncompressedPackageBytes: policy.maxUncompressedPackageBytes,
        maxEntries: policy.maxEntries,
        preserveEntryNames: true
      }), "ZIP output");
    } catch (cause) {
      if (cause instanceof ProjectPackageError) throw cause;
      fail("ZIP_ENCODE_FAILED", "ZIP adapter 無法建立 .storyboard.zip。", { cause: cause && cause.message });
    }
    if (archiveBytes.byteLength > policy.maxArchiveBytes) {
      fail("ARCHIVE_SIZE_LIMIT", "ZIP archive 大小超過上限。", { size: archiveBytes.byteLength, limit: policy.maxArchiveBytes });
    }
    return {
      fileName: "director-storyboard-r" + prepared.project.revision + ".storyboard.zip",
      mediaType: "application/zip",
      archiveBytes: new Uint8Array(archiveBytes),
      projectId: prepared.project.projectId,
      revision: prepared.project.revision,
      manifest: prepared.manifest
    };
  }

  async function readArchiveBytes(archiveValue, maxArchiveBytes) {
    if (archiveValue instanceof Uint8Array || archiveValue instanceof ArrayBuffer || ArrayBuffer.isView(archiveValue)) {
      let bytes;
      if (archiveValue instanceof Uint8Array) bytes = new Uint8Array(archiveValue.buffer, archiveValue.byteOffset, archiveValue.byteLength);
      else if (archiveValue instanceof ArrayBuffer) bytes = new Uint8Array(archiveValue);
      else bytes = new Uint8Array(archiveValue.buffer, archiveValue.byteOffset, archiveValue.byteLength);
      if (bytes.byteLength > maxArchiveBytes) {
        fail("ARCHIVE_SIZE_LIMIT", "ZIP archive 大小超過上限。", { size: bytes.byteLength, limit: maxArchiveBytes });
      }
      return bytes;
    }
    const BlobCtor = root && root.Blob;
    const prototype = BlobCtor && BlobCtor.prototype;
    const sizeDescriptor = prototype && Object.getOwnPropertyDescriptor(prototype, "size");
    const nativeArrayBuffer = prototype && prototype.arrayBuffer;
    if (!archiveValue || !sizeDescriptor || typeof sizeDescriptor.get !== "function" || typeof nativeArrayBuffer !== "function") {
      fail("INVALID_ARCHIVE_INPUT", "完整專案包必須是原始 bytes 或原生 Blob/File。");
    }
    let size;
    try { size = sizeDescriptor.get.call(archiveValue); }
    catch (cause) { fail("INVALID_ARCHIVE_INPUT", "完整專案包必須是原生 Blob/File。", { cause: cause && cause.message }); }
    if (!Number.isSafeInteger(size) || size < 0) fail("INVALID_ARCHIVE_INPUT", "ZIP archive 大小無效。");
    if (size > maxArchiveBytes) fail("ARCHIVE_SIZE_LIMIT", "ZIP archive 大小超過上限。", { size: size, limit: maxArchiveBytes });
    let buffer;
    try { buffer = await nativeArrayBuffer.call(archiveValue); }
    catch (cause) { fail("ARCHIVE_READ_FAILED", "無法讀取完整專案包 Blob。", { cause: cause && cause.message }); }
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== size) {
      fail("INVALID_ARCHIVE_INPUT", "完整專案包 Blob 讀取後的 bytes 長度不一致。");
    }
    return new Uint8Array(buffer);
  }

  function throwIfAborted(signal) {
    if (!signal || signal.aborted !== true) return;
    const error = new Error("完整專案包作業已取消。");
    error.name = "AbortError";
    error.code = "ABORT_ERR";
    throw error;
  }

  async function parseProjectPackageLocal(archiveValue, options) {
    const policy = limits(options);
    const adapter = getZipAdapter(options);
    throwIfAborted(options && options.signal);
    const archiveBytes = await readArchiveBytes(archiveValue, policy.maxArchiveBytes);
    throwIfAborted(options && options.signal);
    let entries;
    try {
      // ZIP adapters must inspect central-directory metadata before allocating
      // expanded payloads, reject encryption/CRC errors, never extract to the
      // filesystem, and preserve duplicate raw names so this verifier can fail
      // closed. Limits here are repeated after decoding as a second boundary.
      entries = await adapter.decode(archiveBytes, {
        maxArchiveBytes: policy.maxArchiveBytes,
        maxUncompressedPackageBytes: policy.maxUncompressedPackageBytes,
        maxEntries: policy.maxEntries,
        preserveDuplicateNames: true,
        preserveEntryNames: true,
        rejectUnsafePaths: true,
        extractToFilesystem: false
      });
    } catch (cause) {
      if (cause instanceof ProjectPackageError) throw cause;
      fail("ZIP_DECODE_FAILED", "ZIP adapter 無法安全解析 .storyboard.zip。", { cause: cause && cause.message });
    }
    throwIfAborted(options && options.signal);
    return verifyProjectPackageEntriesLocal(entries, options, { takeOwnership: true });
  }

  class PackageWorkerTransportError extends Error {
    constructor(message, cause) {
      super(message);
      this.name = "PackageWorkerTransportError";
      this.code = "PACKAGE_WORKER_UNAVAILABLE";
      this.workerTransportFailure = true;
      this.details = cause ? { cause: String(cause.message || cause) } : null;
    }
  }

  let packageWorker = null;
  let workerSequence = 0;
  let activeWorkerJobs = new Map();
  let workerDiagnostics = {
    supported: !!(root && root.document && typeof root.Worker === "function"),
    attempts: 0,
    succeeded: 0,
    fallbacks: 0,
    lastAction: null,
    lastFallbackReason: null,
    lastTransportError: null,
    lastWorkerUrl: null
  };

  function abortError() {
    const error = new Error("完整專案包作業已取消。");
    error.name = "AbortError";
    error.code = "ABORT_ERR";
    return error;
  }

  function packageWorkerUrl() {
    return new URL("package-worker.js?v=20261029v48", packageScriptBase || root.document.baseURI).href;
  }

  function rejectWorkerJobs(error, abortingJob) {
    activeWorkerJobs.forEach(function (job, id) {
      activeWorkerJobs.delete(id);
      if (job.signal && job.abortHandler) job.signal.removeEventListener("abort", job.abortHandler);
      job.reject(abortingJob
        ? (job === abortingJob ? error : new PackageWorkerTransportError("Package Worker was restarted."))
        : error);
    });
  }

  function stopPackageWorker(error, abortingJob) {
    if (packageWorker) {
      packageWorker.onmessage = null;
      packageWorker.onerror = null;
      packageWorker.onmessageerror = null;
      try { packageWorker.terminate(); } catch (_) { /* A terminating Worker is already unusable. */ }
    }
    packageWorker = null;
    rejectWorkerJobs(error, abortingJob);
  }

  function getPackageWorker() {
    if (!workerDiagnostics.supported || !root || typeof root.Worker !== "function") {
      throw new PackageWorkerTransportError("此瀏覽器未提供 Web Worker。");
    }
    if (packageWorker) return packageWorker;
    try {
      workerDiagnostics.lastWorkerUrl = packageWorkerUrl();
      packageWorker = new root.Worker(workerDiagnostics.lastWorkerUrl, { name: "director-storyboard-package" });
    } catch (cause) {
      workerDiagnostics.lastTransportError = String(cause && (cause.name + ": " + cause.message) || cause);
      throw new PackageWorkerTransportError("無法建立完整專案包 Worker。", cause);
    }
    packageWorker.onmessage = function (event) {
      const data = event && event.data;
      const job = data && activeWorkerJobs.get(data.id);
      if (!job) return;
      activeWorkerJobs.delete(data.id);
      if (job.signal && job.abortHandler) job.signal.removeEventListener("abort", job.abortHandler);
      if (data.ok === true) {
        workerDiagnostics.succeeded += 1;
        job.resolve(data.result);
        return;
      }
      const error = new Error(data.error && data.error.message || "Package Worker 作業失敗。");
      error.name = data.error && data.error.name || "PackageWorkerOperationError";
      error.code = data.error && data.error.code || "PACKAGE_WORKER_OPERATION_FAILED";
      error.details = data.error && data.error.details || null;
      error.workerBusinessError = true;
      job.reject(error);
    };
    packageWorker.onerror = function (event) {
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      const cause = event && (event.error || event.message) || null;
      workerDiagnostics.lastTransportError = cause
        ? String(cause && (cause.message || cause) || cause)
        : JSON.stringify({ message: event && event.message || null, filename: event && event.filename || null, line: event && event.lineno || null, column: event && event.colno || null });
      stopPackageWorker(new PackageWorkerTransportError("完整專案包 Worker 載入或執行失敗。", cause));
    };
    packageWorker.onmessageerror = function (event) {
      workerDiagnostics.lastTransportError = "messageerror";
      stopPackageWorker(new PackageWorkerTransportError("完整專案包 Worker 回傳資料無法解碼。", event));
    };
    return packageWorker;
  }

  function runPackageWorker(action, payload, signal, transferList) {
    throwIfAborted(signal);
    const worker = getPackageWorker();
    const id = ++workerSequence;
    workerDiagnostics.attempts += 1;
    workerDiagnostics.lastAction = action;
    return new Promise(function (resolve, reject) {
      const job = { resolve: resolve, reject: reject, signal: signal || null, abortHandler: null };
      activeWorkerJobs.set(id, job);
      if (signal && typeof signal.addEventListener === "function") {
        job.abortHandler = function () {
          stopPackageWorker(abortError(), job);
        };
        signal.addEventListener("abort", job.abortHandler, { once: true });
        if (signal.aborted) {
          job.abortHandler();
          return;
        }
      }
      try {
        worker.postMessage({ id: id, action: action, payload: payload }, transferList || []);
      } catch (cause) {
        activeWorkerJobs.delete(id);
        if (job.signal && job.abortHandler) job.signal.removeEventListener("abort", job.abortHandler);
        workerDiagnostics.lastTransportError = String(cause && (cause.name + ": " + cause.message) || cause);
        reject(new PackageWorkerTransportError("無法將完整專案包資料送至 Worker。", cause));
      }
    });
  }

  function serializablePackageOptions(options) {
    return {
      limits: options && options.limits ? Object.assign({}, options.limits) : undefined,
      expectedRevision: options && options.expectedRevision
    };
  }

  function workerEligible(options) {
    if (!workerDiagnostics.supported || !root || !root.document || typeof root.Worker !== "function") return false;
    if (options && typeof options.sha256 === "function") return false;
    if (options && options.schema && options.schema !== root.DirectorStoryboardProjectSchema) return false;
    if (options && options.zipAdapter && options.zipAdapter !== root.DirectorStoryboardZipAdapter) return false;
    if (options && options.crypto && options.crypto !== root.crypto) return false;
    return true;
  }

  function workerFallback(error, options) {
    if (!error || error.workerTransportFailure !== true) return false;
    throwIfAborted(options && options.signal);
    workerDiagnostics.fallbacks += 1;
    workerDiagnostics.lastFallbackReason = error.details && error.details.cause || error.message;
    return true;
  }

  async function exportProjectPackage(projectInput, sourceAssets, options) {
    throwIfAborted(options && options.signal);
    if (!workerEligible(options)) return exportProjectPackageLocal(projectInput, sourceAssets, options);
    const projectJsonBytes = options && options.projectJsonBytes instanceof Uint8Array ? options.projectJsonBytes : null;
    const exactProjectJsonBuffer = projectJsonBytes && projectJsonBytes.buffer instanceof ArrayBuffer &&
      projectJsonBytes.byteOffset === 0 && projectJsonBytes.byteLength === projectJsonBytes.buffer.byteLength;
    const projectJsonTransferBytes = !projectJsonBytes
      ? null
      : exactProjectJsonBuffer ? projectJsonBytes : new Uint8Array(projectJsonBytes);
    const transferList = projectJsonTransferBytes && projectJsonTransferBytes.buffer instanceof ArrayBuffer
      ? [projectJsonTransferBytes.buffer]
      : [];
    try {
      const result = await runPackageWorker("export", {
        project: projectJsonTransferBytes ? null : projectInput,
        projectJsonBytes: projectJsonTransferBytes,
        assets: sourceAssets,
        options: serializablePackageOptions(options)
      }, options && options.signal, transferList);
      result.workerRoundTripVerified = true;
      return result;
    } catch (error) {
      if (workerFallback(error, options)) return exportProjectPackageLocal(projectInput, sourceAssets, options);
      throw error;
    }
  }

  async function verifyProjectPackageEntries(inputEntries, options) {
    throwIfAborted(options && options.signal);
    if (!workerEligible(options)) return verifyProjectPackageEntriesLocal(inputEntries, options);
    try {
      return await runPackageWorker("verify", {
        entries: inputEntries,
        options: serializablePackageOptions(options)
      }, options && options.signal);
    } catch (error) {
      if (workerFallback(error, options)) return verifyProjectPackageEntriesLocal(inputEntries, options);
      throw error;
    }
  }

  async function decodeProjectPackageEntries(archiveValue, options) {
    throwIfAborted(options && options.signal);
    if (!workerEligible(options)) {
      const policy = limits(options);
      const adapter = getZipAdapter(options);
      const bytes = await readArchiveBytes(archiveValue, policy.maxArchiveBytes);
      return adapter.decode(bytes, {
        maxArchiveBytes: policy.maxArchiveBytes,
        maxUncompressedPackageBytes: policy.maxUncompressedPackageBytes,
        maxEntries: policy.maxEntries,
        preserveDuplicateNames: true,
        preserveEntryNames: true,
        rejectUnsafePaths: true,
        extractToFilesystem: false
      });
    }
    try {
      return await runPackageWorker("decode", {
        archive: archiveValue,
        options: serializablePackageOptions(options)
      }, options && options.signal);
    } catch (error) {
      if (workerFallback(error, options)) {
        const policy = limits(options);
        const adapter = getZipAdapter(options);
        const bytes = await readArchiveBytes(archiveValue, policy.maxArchiveBytes);
        return adapter.decode(bytes, {
          maxArchiveBytes: policy.maxArchiveBytes,
          maxUncompressedPackageBytes: policy.maxUncompressedPackageBytes,
          maxEntries: policy.maxEntries,
          preserveDuplicateNames: true,
          preserveEntryNames: true,
          rejectUnsafePaths: true,
          extractToFilesystem: false
        });
      }
      throw error;
    }
  }

  async function parseProjectPackage(archiveValue, options) {
    throwIfAborted(options && options.signal);
    if (!workerEligible(options)) return parseProjectPackageLocal(archiveValue, options);
    try {
      const result = await runPackageWorker("parse", {
        archive: archiveValue,
        options: serializablePackageOptions(options),
        keepForCopy: options && options.keepWorkerCopyTicket === true
      }, options && options.signal);
      if (result.ticket) result.verified.workerTicket = result.ticket;
      return result.verified;
    } catch (error) {
      if (workerFallback(error, options)) return parseProjectPackageLocal(archiveValue, options);
      throw error;
    }
  }

  async function createProjectCopyFromWorker(ticket, targetProjectId, options) {
    if (typeof ticket !== "string" || !ticket) throw new PackageWorkerTransportError("Package copy ticket is missing.");
    if (!workerEligible(options)) throw new PackageWorkerTransportError("Package Worker is unavailable for copy remapping.");
    return runPackageWorker("copy-ticket", {
      ticket: ticket,
      targetProjectId: targetProjectId
    }, options && options.signal);
  }

  async function releaseProjectPackageWorkerTicket(ticket) {
    if (typeof ticket !== "string" || !ticket || !packageWorker) return false;
    try {
      await runPackageWorker("release-ticket", { ticket: ticket }, null);
      return true;
    } catch (error) {
      return false;
    }
  }

  function getWorkerDiagnostics() {
    return Object.assign({}, workerDiagnostics, { running: !!packageWorker, pending: activeWorkerJobs.size });
  }

  return Object.freeze({
    FORMAT: FORMAT,
    FORMAT_VERSION: FORMAT_VERSION,
    MANIFEST_PATH: MANIFEST_PATH,
    PROJECT_PATH: PROJECT_PATH,
    DEFAULT_LIMITS: DEFAULT_LIMITS,
    LIMITS_STATUS: LIMITS_STATUS,
    ProjectPackageError: ProjectPackageError,
    assetPath: assetPath,
    prepareProjectPackageEntries: prepareProjectPackageEntries,
    decodeProjectPackageEntries: decodeProjectPackageEntries,
    verifyProjectPackageEntries: verifyProjectPackageEntries,
    exportProjectPackage: exportProjectPackage,
    parseProjectPackage: parseProjectPackage,
    createProjectCopyFromWorker: createProjectCopyFromWorker,
    releaseProjectPackageWorkerTicket: releaseProjectPackageWorkerTicket,
    getWorkerDiagnostics: getWorkerDiagnostics
  });
});
