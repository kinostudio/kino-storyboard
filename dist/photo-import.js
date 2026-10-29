(function attachPhotoImport(root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DirectorStoryboardPhotoImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPhotoImport(root) {
  "use strict";

  const TRIAL_MAX_BYTES = 20 * 1024 * 1024;
  const ACCEPTED_MIME_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
  const PHOTO_IMPORT_POLICY = Object.freeze({
    maxBytes: TRIAL_MAX_BYTES,
    maxBytesStatus: "trial",
    maxWidth: null,
    maxHeight: null,
    maxPixels: null,
    acceptedMimeTypes: ACCEPTED_MIME_TYPES
  });

  class PhotoImportError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = "PhotoImportError";
      this.code = code;
      this.details = details || null;
    }
  }

  function fail(code, message, details) {
    throw new PhotoImportError(code, message, details);
  }

  function abortError() {
    const error = new Error("照片匯入作業已取消。");
    error.name = "AbortError";
    error.code = "ABORT_ERR";
    return error;
  }

  function isAbortError(error) {
    return !!error && (error.name === "AbortError" || error.code === "ABORT_ERR");
  }

  function throwIfAborted(signal) {
    if (signal && signal.aborted === true) throw abortError();
  }

  function closeDecoded(decoded) {
    if (decoded && typeof decoded.close === "function") {
      try { decoded.close(); } catch (error) { /* Releasing a decoded bitmap is best effort. */ }
    }
  }

  function awaitWithSignal(value, signal, onLateValue) {
    const pending = Promise.resolve(value);
    if (!signal || typeof signal.addEventListener !== "function") return pending;
    if (signal.aborted) {
      pending.then(function (result) {
        if (typeof onLateValue === "function") onLateValue(result);
      }, function () {});
      return Promise.reject(abortError());
    }
    return new Promise(function (resolve, reject) {
      let settled = false;
      function cleanup() { signal.removeEventListener("abort", handleAbort); }
      function handleAbort() {
        if (settled) return;
        settled = true;
        cleanup();
        reject(abortError());
      }
      signal.addEventListener("abort", handleAbort, { once: true });
      pending.then(function (result) {
        if (settled) {
          if (typeof onLateValue === "function") onLateValue(result);
          return;
        }
        settled = true;
        cleanup();
        resolve(result);
      }, function (error) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });
      if (signal.aborted) handleAbort();
    });
  }

  function isPositiveLimit(value) {
    return value === null || (Number.isSafeInteger(value) && value > 0);
  }

  function resolvePolicy(override) {
    const policy = Object.assign({}, PHOTO_IMPORT_POLICY, override || {});
    if (!(policy.maxBytes === null || (Number.isSafeInteger(policy.maxBytes) && policy.maxBytes > 0))) {
      fail("INVALID_IMPORT_POLICY", "照片匯入政策的 maxBytes 必須是正整數或 null。");
    }
    if (!isPositiveLimit(policy.maxWidth) || !isPositiveLimit(policy.maxHeight) || !isPositiveLimit(policy.maxPixels)) {
      fail("INVALID_IMPORT_POLICY", "照片匯入政策的尺寸限制必須是正整數或 null。");
    }
    if (!Array.isArray(policy.acceptedMimeTypes) || policy.acceptedMimeTypes.length === 0 ||
        policy.acceptedMimeTypes.some(function (mime) { return ACCEPTED_MIME_TYPES.indexOf(mime) < 0; })) {
      fail("INVALID_IMPORT_POLICY", "照片匯入政策只允許 JPEG、PNG 與 WebP。");
    }
    return policy;
  }

  function resolveApis(apis) {
    const injected = apis || {};
    const BlobCtor = Object.prototype.hasOwnProperty.call(injected, "Blob") ? injected.Blob : root && root.Blob;
    const cryptoApi = Object.prototype.hasOwnProperty.call(injected, "crypto") ? injected.crypto : root && root.crypto;
    const bitmapFactory = Object.prototype.hasOwnProperty.call(injected, "createImageBitmap")
      ? injected.createImageBitmap
      : root && root.createImageBitmap;
    const ImageCtor = Object.prototype.hasOwnProperty.call(injected, "Image") ? injected.Image : root && root.Image;
    const urlApi = Object.prototype.hasOwnProperty.call(injected, "URL") ? injected.URL : root && root.URL;
    return {
      Blob: BlobCtor,
      crypto: cryptoApi,
      createImageBitmap: bitmapFactory,
      Image: ImageCtor,
      URL: urlApi,
      isBlob: injected.isBlob,
      decodeImage: injected.decodeImage
    };
  }

  function assertNativeBlob(file, apis) {
    let valid = false;
    try {
      valid = typeof apis.isBlob === "function"
        ? apis.isBlob(file) === true
        : typeof apis.Blob === "function" && file instanceof apis.Blob;
    } catch (error) {
      valid = false;
    }
    if (!valid) fail("INVALID_BLOB", "匯入來源必須是瀏覽器原生 Blob 或 File。");
    if (!Number.isSafeInteger(file.size) || file.size < 0) fail("INVALID_BLOB", "原始檔案大小無效。");
    if (typeof file.slice !== "function") fail("INVALID_BLOB", "原始檔案不支援安全讀取。");
  }

  function resolveOriginalName(file, options) {
    const name = typeof file.name === "string" ? file.name : options.originalName;
    if (typeof name !== "string" || name.trim().length === 0) {
      fail("INVALID_ORIGINAL_NAME", "照片必須有檔名；Blob 請另外提供 originalName。");
    }
    // Browser File.name contains the selected basename. Reject path-like names
    // from synthetic/custom Blobs rather than persisting any device path.
    if (/[\\/]/.test(name)) fail("INVALID_ORIGINAL_NAME", "檔名不可包含裝置路徑。");
    return name;
  }

  async function readOriginalBytes(file, apis, signal) {
    try {
      throwIfAborted(signal);
      const blobPrototype = apis.Blob && apis.Blob.prototype;
      const read = blobPrototype && typeof blobPrototype.arrayBuffer === "function"
        ? blobPrototype.arrayBuffer.call(file)
        : file.arrayBuffer();
      const buffer = await awaitWithSignal(read, signal);
      throwIfAborted(signal);
      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== file.size) {
        fail("FILE_READ_SIZE_MISMATCH", "讀取到的原始 bytes 與檔案大小不一致。");
      }
      return new Uint8Array(buffer);
    } catch (error) {
      if (error instanceof PhotoImportError || isAbortError(error)) throw error;
      fail("FILE_READ_FAILED", "讀取原始照片失敗。", { cause: error && error.message ? error.message : String(error) });
    }
  }

  function detectMime(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
        bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
    return null;
  }

  async function decodeWithImageElement(file, apis, signal) {
    if (typeof apis.Image !== "function" || !apis.URL || typeof apis.URL.createObjectURL !== "function" ||
        typeof apis.URL.revokeObjectURL !== "function") {
      fail("IMAGE_DECODER_UNAVAILABLE", "此瀏覽器沒有可用的圖片解碼器。");
    }
    throwIfAborted(signal);
    let objectUrl;
    let image;
    try {
      objectUrl = apis.URL.createObjectURL(file);
      image = new apis.Image();
      image.decoding = "async";
      await new Promise(function (resolve, reject) {
        let settled = false;
        function cleanup() {
          if (signal && typeof signal.removeEventListener === "function") signal.removeEventListener("abort", handleAbort);
          image.onload = null;
          image.onerror = null;
        }
        function finish(error) {
          if (settled) return;
          settled = true;
          cleanup();
          if (error) reject(error);
          else resolve();
        }
        function handleAbort() {
          finish(abortError());
          try { image.src = ""; } catch (_) { /* The pending image load is best-effort cancellable. */ }
          if (objectUrl) apis.URL.revokeObjectURL(objectUrl);
        }
        image.onload = function () { finish(); };
        image.onerror = function () { finish(new Error("image decode failed")); };
        if (signal && typeof signal.addEventListener === "function") {
          signal.addEventListener("abort", handleAbort, { once: true });
          if (signal.aborted) { handleAbort(); return; }
        }
        image.src = objectUrl;
      });
      throwIfAborted(signal);
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: function () {
          image.onload = null;
          image.onerror = null;
          image.src = "";
          apis.URL.revokeObjectURL(objectUrl);
        }
      };
    } catch (error) {
      if (objectUrl) apis.URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  async function decodeImage(file, apis, signal, preferCancellableDecode) {
    try {
      throwIfAborted(signal);
      if (typeof apis.decodeImage === "function") {
        const decodeOptions = { imageOrientation: "from-image" };
        if (signal) decodeOptions.signal = signal;
        const pending = apis.decodeImage(file, decodeOptions);
        return await awaitWithSignal(pending, signal, closeDecoded);
      }
      if (preferCancellableDecode === true && signal && typeof apis.Image === "function" && apis.URL &&
          typeof apis.URL.createObjectURL === "function" && typeof apis.URL.revokeObjectURL === "function") {
        // createImageBitmap has no cancellation API. For cancellable previews,
        // prefer the Image-element path so abort can clear its pending source.
        return await decodeWithImageElement(file, apis, signal);
      }
      if (typeof apis.createImageBitmap === "function") {
        const pending = apis.createImageBitmap.call(root, file, { imageOrientation: "from-image" });
        return await awaitWithSignal(pending, signal, closeDecoded);
      }
      return await decodeWithImageElement(file, apis, signal);
    } catch (error) {
      if (error instanceof PhotoImportError || isAbortError(error)) throw error;
      fail("IMAGE_DECODE_FAILED", "瀏覽器無法解碼這張照片。", { cause: error && error.message ? error.message : String(error) });
    }
  }

  async function readDimensions(file, apis, policy, signal, preferCancellableDecode) {
    throwIfAborted(signal);
    const decoded = await decodeImage(file, apis, signal, preferCancellableDecode);
    try {
      throwIfAborted(signal);
      const width = decoded && decoded.width;
      const height = decoded && decoded.height;
      if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
        fail("INVALID_IMAGE_DIMENSIONS", "解碼器回報的照片寬高無效。");
      }
      if ((policy.maxWidth !== null && width > policy.maxWidth) ||
          (policy.maxHeight !== null && height > policy.maxHeight) ||
          (policy.maxPixels !== null && width > Math.floor(policy.maxPixels / height))) {
        fail("IMAGE_DIMENSIONS_EXCEEDED", "照片尺寸超過目前匯入政策限制。", { width: width, height: height });
      }
      throwIfAborted(signal);
      return { width: width, height: height };
    } finally {
      closeDecoded(decoded);
    }
  }

  async function digestSha256(bytes, cryptoApi, signal) {
    throwIfAborted(signal);
    if (!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.subtle.digest !== "function") {
      fail("CRYPTO_UNAVAILABLE", "Web Crypto SHA-256 不可用，照片未匯入。");
    }
    let digest;
    try {
      digest = await awaitWithSignal(cryptoApi.subtle.digest("SHA-256", bytes), signal);
    } catch (error) {
      if (isAbortError(error)) throw error;
      fail("HASH_FAILED", "計算原始照片 SHA-256 失敗。", { cause: error && error.message ? error.message : String(error) });
    }
    throwIfAborted(signal);
    const hashBytes = new Uint8Array(digest);
    if (hashBytes.byteLength !== 32) fail("HASH_FAILED", "SHA-256 回傳結果長度無效。");
    let hex = "";
    for (let index = 0; index < hashBytes.length; index += 1) hex += hashBytes[index].toString(16).padStart(2, "0");
    return hex;
  }

  function requireIdentifier(value, field) {
    if (typeof value !== "string" || value.trim().length === 0) {
      fail("INVALID_METADATA", field + " 必須是非空字串。");
    }
  }

  async function preparePhotoImport(file, options) {
    const opts = options || {};
    const signal = opts.signal || null;
    throwIfAborted(signal);
    const policy = resolvePolicy(opts.policy);
    const apis = resolveApis(opts.apis);
    assertNativeBlob(file, apis);
    if (file.size === 0) fail("EMPTY_FILE", "空白檔案不能匯入為照片。");
    if (policy.maxBytes !== null && file.size > policy.maxBytes) {
      fail("FILE_TOO_LARGE", "照片超過目前匯入大小上限。", { byteLength: file.size, maxBytes: policy.maxBytes, status: policy.maxBytesStatus });
    }

    requireIdentifier(opts.projectId, "projectId");
    requireIdentifier(opts.id, "Asset id");
    const originalName = resolveOriginalName(file, opts);
    const bytes = await readOriginalBytes(file, apis, signal);
    throwIfAborted(signal);
    const mime = detectMime(bytes);
    if (!mime || policy.acceptedMimeTypes.indexOf(mime) < 0) {
      fail("UNSUPPORTED_IMAGE_FORMAT", "只接受可解碼的 JPEG、PNG 或 WebP；HEIC 目前未列入支援格式。");
    }
    const declaredMime = typeof file.type === "string" ? file.type.trim().toLowerCase() : "";
    if (declaredMime && declaredMime !== mime) {
      fail("MIME_MISMATCH", "檔案宣告的 MIME 與實際內容格式不一致。", { declaredMime: declaredMime, detectedMime: mime });
    }

    // Decode the original immutable Blob before hashing. The browser decoder
    // applies EXIF display orientation where supported; the source Blob itself
    // is never transformed or replaced.
    throwIfAborted(signal);
    const dimensions = await readDimensions(file, apis, policy, signal, opts.preferCancellableDecode === true);
    throwIfAborted(signal);
    const sha256 = await digestSha256(bytes, apis.crypto, signal);
    throwIfAborted(signal);
    const metadata = {
      projectId: opts.projectId,
      id: opts.id,
      role: "photoOriginal",
      sha256: sha256,
      mime: mime,
      originalName: originalName,
      byteLength: file.size,
      width: dimensions.width,
      height: dimensions.height,
      state: "available",
      thumbnail: null
    };

    return {
      metadata: metadata,
      originalBlob: file,
      sha256: sha256
    };
  }

  return Object.freeze({
    PHOTO_IMPORT_POLICY: PHOTO_IMPORT_POLICY,
    PhotoImportError: PhotoImportError,
    preparePhotoImport: preparePhotoImport
  });
});
