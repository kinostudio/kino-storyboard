(function attachZipAdapter(root, factory) {
  "use strict";

  let codec = root && root.fflate;
  if (!codec && typeof module === "object" && module && module.exports) {
    codec = require("./vendor/fflate/fflate-0.8.3.umd.js");
  }
  const api = factory(codec, root);
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DirectorStoryboardZipAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createZipAdapter(fflate, root) {
  "use strict";

  const DEFAULT_LIMITS = Object.freeze({
    maxArchiveBytes: 516 * 1024 * 1024,
    maxUncompressedPackageBytes: 500 * 1024 * 1024,
    maxEntries: 10002
  });
  const EOCD_SIGNATURE = 0x06054b50;
  const CENTRAL_SIGNATURE = 0x02014b50;
  const LOCAL_SIGNATURE = 0x04034b50;
  const MAX_COMPRESSION_RATIO = 1000;
  const utf8Encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;
  const utf8Decoder = typeof TextDecoder === "function" ? new TextDecoder("utf-8", { fatal: true }) : null;
  const CRC32_TABLE = new Uint32Array(256);
  for (let tableIndex = 0; tableIndex < CRC32_TABLE.length; tableIndex += 1) {
    let tableValue = tableIndex;
    for (let bit = 0; bit < 8; bit += 1) {
      tableValue = (tableValue & 1) ? (tableValue >>> 1) ^ 0xedb88320 : tableValue >>> 1;
    }
    CRC32_TABLE[tableIndex] = tableValue >>> 0;
  }

  class ZipAdapterError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = "ZipAdapterError";
      this.code = code;
      this.details = details || null;
    }
  }

  function fail(code, message, details) {
    throw new ZipAdapterError(code, message, details);
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function getLimits(options) {
    const overrides = options && options.limits || options || {};
    const result = Object.assign({}, DEFAULT_LIMITS, overrides);
    Object.keys(DEFAULT_LIMITS).forEach(function (key) {
      if (!Number.isSafeInteger(result[key]) || result[key] < 1) {
        fail("INVALID_ZIP_LIMIT", "ZIP adapter 限制值必須是正的安全整數。", { name: key, value: result[key] });
      }
    });
    if (result.maxEntries > 65535) {
      fail("INVALID_ZIP_LIMIT", "classic ZIP 格式最多支援 65535 個 entries。", { maxEntries: result.maxEntries });
    }
    return result;
  }

  function asBytes(value, label) {
    if (value instanceof Uint8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    fail("INVALID_ZIP_BYTES", label + " 必須是原始位元組。", { valueType: typeof value });
  }

  function byteLength(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
      fail("INVALID_ZIP_SIZE", label + " 大小無效。", { value: value });
    }
    return value;
  }

  function encodeName(path) {
    if (!utf8Encoder) fail("UTF8_UNAVAILABLE", "此環境缺少 TextEncoder，無法安全編碼 ZIP 路徑。", null);
    return utf8Encoder.encode(path);
  }

  function decodeName(bytes, flags, entryIndex) {
    if (flags & 0x0800) {
      if (!utf8Decoder) fail("UTF8_UNAVAILABLE", "此環境缺少 TextDecoder，無法安全讀取 ZIP 路徑。", null);
      try {
        return utf8Decoder.decode(bytes);
      } catch (cause) {
        fail("INVALID_ENTRY_NAME", "ZIP entry 名稱不是有效 UTF-8。", { entryIndex: entryIndex, cause: cause && cause.message });
      }
    }
    let name = "";
    for (let index = 0; index < bytes.length; index += 1) {
      if (bytes[index] > 0x7f) {
        fail("UNSUPPORTED_FILENAME_ENCODING", "未標記 UTF-8 的 ZIP entry 名稱只接受 ASCII。", { entryIndex: entryIndex });
      }
      name += String.fromCharCode(bytes[index]);
    }
    return name;
  }

  function validatePath(path, entryIndex) {
    if (typeof path !== "string" || !path || path.length > 4096 || /[\u0000-\u001f\u007f]/.test(path) ||
        path.indexOf("\\") !== -1 || path.indexOf(":") !== -1 || path.charAt(0) === "/" || path.charAt(path.length - 1) === "/") {
      fail("UNSAFE_ENTRY_PATH", "專案包包含無效或不安全的 ZIP entry path。", { path: path, entryIndex: entryIndex });
    }
    if (typeof path.normalize === "function" && path.normalize("NFC") !== path) {
      fail("UNSAFE_ENTRY_PATH", "ZIP entry path 必須使用 NFC 正規化。", { path: path, entryIndex: entryIndex });
    }
    const parts = path.split("/");
    if (parts.some(function (part) { return !part || part === "." || part === ".."; })) {
      fail("UNSAFE_ENTRY_PATH", "ZIP entry path 不可包含空白、. 或 .. 路徑段。", { path: path, entryIndex: entryIndex });
    }
    return path;
  }

  function addUniqueName(path, exactNames, portableNames, entryIndex) {
    validatePath(path, entryIndex);
    const portableKey = path.toLowerCase();
    if (exactNames.has(path) || portableNames.has(portableKey)) {
      fail("DUPLICATE_ENTRY_PATH", "ZIP 包含重複或大小寫衝突的 entry path。", { path: path, entryIndex: entryIndex });
    }
    exactNames.add(path);
    portableNames.add(portableKey);
  }

  function getCodec() {
    if (!fflate || typeof fflate.zipSync !== "function" || typeof fflate.Inflate !== "function") {
      fail("ZIP_CODEC_UNAVAILABLE", "尚未載入核定版本的 fflate ZIP codec。", null);
    }
    return fflate;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function requireRange(offset, size, total, label) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset > total - size) {
      fail("INVALID_ZIP_STRUCTURE", "ZIP 結構超出 archive 範圍。", { offset: offset, size: size, total: total, label: label });
    }
  }

  function bytesEqual(left, right) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
    return true;
  }

  function locateCentralDirectory(bytes, policy) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.byteLength < 22) fail("INVALID_ZIP_STRUCTURE", "ZIP archive 太短，缺少 EOCD。", null);

    const minEocd = Math.max(0, bytes.byteLength - 65557);
    let eocdOffset = -1;
    for (let offset = bytes.byteLength - 22; offset >= minEocd; offset -= 1) {
      if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
        const commentLength = view.getUint16(offset + 20, true);
        if (offset + 22 + commentLength === bytes.byteLength) {
          eocdOffset = offset;
          break;
        }
      }
    }
    if (eocdOffset < 0) fail("INVALID_ZIP_STRUCTURE", "ZIP archive 缺少有效的 EOCD 或含有尾隨資料。", null);
    const commentLength = view.getUint16(eocdOffset + 20, true);
    if (commentLength !== 0) fail("UNSUPPORTED_ZIP_FEATURE", "專案 ZIP 不接受 EOCD comment。", null);

    const disk = view.getUint16(eocdOffset + 4, true);
    const centralDisk = view.getUint16(eocdOffset + 6, true);
    const diskEntries = view.getUint16(eocdOffset + 8, true);
    const entryCount = view.getUint16(eocdOffset + 10, true);
    const centralSize = view.getUint32(eocdOffset + 12, true);
    const centralOffset = view.getUint32(eocdOffset + 16, true);
    if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) {
      fail("UNSUPPORTED_ZIP_FEATURE", "專案 ZIP 不接受多磁碟 archive。", null);
    }
    if (entryCount === 0 || entryCount > policy.maxEntries) {
      fail("ENTRY_COUNT_LIMIT", "ZIP entry 數量為空或超過上限。", { count: entryCount, limit: policy.maxEntries });
    }
    if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      fail("UNSUPPORTED_ZIP_FEATURE", "專案 ZIP 不接受 ZIP64 archive。", null);
    }
    if (centralOffset + centralSize !== eocdOffset) {
      fail("INVALID_ZIP_STRUCTURE", "Central directory 必須緊鄰 EOCD，且 archive 不可有前置或隱藏資料。", null);
    }
    requireRange(centralOffset, centralSize, eocdOffset, "central directory");

    const entries = [];
    const exactNames = new Set();
    const portableNames = new Set();
    let cursor = centralOffset;
    let declaredTotal = 0;
    for (let index = 0; index < entryCount; index += 1) {
      requireRange(cursor, 46, eocdOffset, "central directory entry");
      if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
        fail("INVALID_ZIP_STRUCTURE", "Central directory entry signature 無效。", { entryIndex: index });
      }
      const versionMadeBy = view.getUint16(cursor + 4, true);
      const flags = view.getUint16(cursor + 8, true);
      const method = view.getUint16(cursor + 10, true);
      const crc = view.getUint32(cursor + 16, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const uncompressedSize = view.getUint32(cursor + 24, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentSize = view.getUint16(cursor + 32, true);
      const diskStart = view.getUint16(cursor + 34, true);
      const externalAttributes = view.getUint32(cursor + 38, true);
      const localOffset = view.getUint32(cursor + 42, true);
      if (nameLength === 0 || extraLength !== 0 || commentSize !== 0 || diskStart !== 0) {
        fail("UNSUPPORTED_ZIP_FEATURE", "Entry 名稱必須存在，且不接受 extra field、entry comment 或多磁碟欄位。", { entryIndex: index });
      }
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
        fail("UNSUPPORTED_ZIP_FEATURE", "專案 ZIP 不接受 ZIP64 entry。", { entryIndex: index });
      }
      if (flags & (0x0001 | 0x0040 | 0x2000)) {
        fail("ENCRYPTED_ENTRY", "ZIP 加密 entry 不受支援。", { entryIndex: index });
      }
      const supportedFlags = method === 8 ? 0x0806 : 0x0800;
      if ((flags & ~supportedFlags) !== 0) {
        fail("UNSUPPORTED_ZIP_FEATURE", "ZIP entry 含有不支援的 general-purpose flags。", { entryIndex: index, flags: flags });
      }
      if (method !== 0 && method !== 8) {
        fail("UNSUPPORTED_COMPRESSION_METHOD", "ZIP 僅支援 stored 與 DEFLATE 壓縮方式。", { entryIndex: index, method: method });
      }
      if (method === 0 && (flags & 0x0006)) {
        fail("UNSUPPORTED_ZIP_FEATURE", "Stored entry 不可設定 DEFLATE 壓縮選項。", { entryIndex: index });
      }
      const host = versionMadeBy >>> 8;
      const unixFileType = (externalAttributes >>> 16) & 0xf000;
      if (host === 3 && unixFileType !== 0 && unixFileType !== 0x8000) {
        fail("UNSUPPORTED_ENTRY_TYPE", "ZIP 只接受一般檔案 entry，不接受目錄或特殊檔案。", { entryIndex: index, unixFileType: unixFileType });
      }
      const nameStart = cursor + 46;
      requireRange(nameStart, nameLength, eocdOffset, "entry name");
      const nameBytes = bytes.subarray(nameStart, nameStart + nameLength);
      const path = decodeName(nameBytes, flags, index);
      addUniqueName(path, exactNames, portableNames, index);
      const entryEnd = nameStart + nameLength + extraLength + commentSize;
      if (entryEnd > eocdOffset) fail("INVALID_ZIP_STRUCTURE", "Central directory entry 超出 archive 範圍。", { entryIndex: index });

      declaredTotal += uncompressedSize;
      if (!Number.isSafeInteger(declaredTotal) || declaredTotal > policy.maxUncompressedPackageBytes) {
        fail("PACKAGE_SIZE_LIMIT", "ZIP 宣告的總解壓大小超過上限；尚未解壓任何 entry。", {
          size: declaredTotal,
          limit: policy.maxUncompressedPackageBytes,
          entryIndex: index
        });
      }
      if (uncompressedSize > 0 && (compressedSize === 0 || uncompressedSize > compressedSize * MAX_COMPRESSION_RATIO)) {
        fail("COMPRESSION_RATIO_LIMIT", "ZIP entry 壓縮比例超過安全上限。", { path: path, limit: MAX_COMPRESSION_RATIO });
      }
      entries.push({
        path: path,
        nameBytes: new Uint8Array(nameBytes),
        flags: flags,
        method: method,
        crc: crc,
        compressedSize: compressedSize,
        uncompressedSize: uncompressedSize,
        localOffset: localOffset,
        centralOffset: cursor
      });
      cursor = entryEnd;
    }
    if (cursor !== centralOffset + centralSize) {
      fail("INVALID_ZIP_STRUCTURE", "Central directory 大小與 entry 數量不一致。", null);
    }

    let localCursor = 0;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const offset = entry.localOffset;
      if (offset !== localCursor) {
        fail("INVALID_ZIP_STRUCTURE", "Local entries 必須依 central order 緊密排列，不可含前置、重疊或隱藏資料。", {
          entryIndex: index,
          expectedOffset: localCursor,
          actualOffset: offset
        });
      }
      requireRange(offset, 30, centralOffset, "local entry header");
      if (view.getUint32(offset, true) !== LOCAL_SIGNATURE) {
        fail("INVALID_ZIP_STRUCTURE", "Local entry signature 無效。", { entryIndex: index });
      }
      const localFlags = view.getUint16(offset + 6, true);
      const localMethod = view.getUint16(offset + 8, true);
      const localCrc = view.getUint32(offset + 14, true);
      const localCompressedSize = view.getUint32(offset + 18, true);
      const localUncompressedSize = view.getUint32(offset + 22, true);
      const localNameLength = view.getUint16(offset + 26, true);
      const localExtraLength = view.getUint16(offset + 28, true);
      if (localFlags !== entry.flags || localMethod !== entry.method || localCrc !== entry.crc ||
          localCompressedSize !== entry.compressedSize || localUncompressedSize !== entry.uncompressedSize ||
          localNameLength !== entry.nameBytes.length || localExtraLength !== 0) {
        fail("LOCAL_CENTRAL_MISMATCH", "Local header 與 central directory metadata 不一致。", { path: entry.path });
      }
      const localNameStart = offset + 30;
      requireRange(localNameStart, localNameLength, centralOffset, "local entry name");
      const localName = bytes.subarray(localNameStart, localNameStart + localNameLength);
      if (!bytesEqual(localName, entry.nameBytes)) {
        fail("LOCAL_CENTRAL_MISMATCH", "Local header entry path 與 central directory 不一致。", { path: entry.path });
      }
      const dataOffset = localNameStart + localNameLength;
      requireRange(dataOffset, entry.compressedSize, centralOffset, "entry data");
      entry.dataOffset = dataOffset;
      localCursor = dataOffset + entry.compressedSize;
    }
    if (localCursor !== centralOffset) {
      fail("INVALID_ZIP_STRUCTURE", "Local entries 與 central directory 之間不可有未索引資料。", null);
    }
    return entries;
  }

  function inflateEntry(entry, compressed, output, state, policy) {
    if (entry.method === 0) {
      if (entry.compressedSize !== entry.uncompressedSize) {
        fail("ENTRY_SIZE_MISMATCH", "Stored entry 的 compressed size 必須等於 uncompressed size。", { path: entry.path });
      }
      if (compressed.byteLength > policy.maxUncompressedPackageBytes - state.actualTotal) {
        fail("PACKAGE_SIZE_LIMIT", "實際累計解壓大小超過上限。", { limit: policy.maxUncompressedPackageBytes });
      }
      state.actualTotal += compressed.byteLength;
      output.set(compressed);
      return;
    }

    const inflater = new (getCodec().Inflate)(function onInflatedChunk(chunk, final) {
      if (chunk.byteLength > policy.maxUncompressedPackageBytes - state.actualTotal) {
        fail("PACKAGE_SIZE_LIMIT", "實際累計解壓大小超過上限。", { limit: policy.maxUncompressedPackageBytes });
      }
      if (chunk.byteLength > entry.uncompressedSize - state.entryWritten) {
        fail("ENTRY_SIZE_MISMATCH", "DEFLATE 實際輸出超過 central directory 宣告長度。", {
          path: entry.path,
          expected: entry.uncompressedSize
        });
      }
      output.set(chunk, state.entryWritten);
      state.actualTotal += chunk.byteLength;
      state.entryWritten += chunk.byteLength;
      if (final) state.sawFinal = true;
    });
    try {
      // Inflate in small compressed slices. A single large push lets fflate
      // expand its working buffer to the full output before invoking ondata;
      // chunking keeps any one unchecked expansion bounded while the callback
      // enforces the cumulative cap.
      const inputChunkBytes = 1024;
      if (compressed.byteLength === 0) {
        inflater.push(compressed, true);
      } else {
        for (let offset = 0; offset < compressed.byteLength; offset += inputChunkBytes) {
          const end = Math.min(offset + inputChunkBytes, compressed.byteLength);
          inflater.push(compressed.subarray(offset, end), end === compressed.byteLength);
        }
      }
    } catch (cause) {
      if (cause instanceof ZipAdapterError) throw cause;
      fail("INVALID_DEFLATE_DATA", "ZIP entry 含有無效或截斷的 DEFLATE stream。", {
        path: entry.path,
        cause: cause && cause.message || String(cause)
      });
    }
    if (!state.sawFinal || inflater.p.length !== 0 || inflater.s.p !== 0) {
      fail("INVALID_DEFLATE_DATA", "DEFLATE stream 未完整消耗 compressed bytes。", { path: entry.path });
    }
    if (state.entryWritten !== entry.uncompressedSize) {
      fail("ENTRY_SIZE_MISMATCH", "DEFLATE 實際輸出長度與 central directory 宣告不符。", {
        path: entry.path,
        expected: entry.uncompressedSize,
        actual: state.entryWritten
      });
    }
  }

  async function encode(entriesInput, options) {
    const policy = getLimits(options);
    const codec = getCodec();
    if (!Array.isArray(entriesInput) || entriesInput.length < 1 || entriesInput.length > policy.maxEntries) {
      fail("ENTRY_COUNT_LIMIT", "ZIP encode entries 為空或超過上限。", { count: entriesInput && entriesInput.length, limit: policy.maxEntries });
    }
    const exactNames = new Set();
    const portableNames = new Set();
    const files = Object.create(null);
    let total = 0;
    let archiveUpperBound = 22;
    entriesInput.forEach(function (entry, index) {
      if (!isRecord(entry) || typeof entry.path !== "string") {
        fail("INVALID_ARCHIVE_ENTRY", "ZIP encode entry 必須包含 path 與 bytes。", { entryIndex: index });
      }
      addUniqueName(entry.path, exactNames, portableNames, index);
      const nameBytes = encodeName(entry.path);
      if (nameBytes.byteLength > 65535) fail("INVALID_ENTRY_NAME", "ZIP entry UTF-8 path 過長。", { path: entry.path });
      const bytes = asBytes(entry.bytes, "archive entry " + entry.path);
      total += bytes.byteLength;
      if (!Number.isSafeInteger(total) || total > policy.maxUncompressedPackageBytes) {
        fail("PACKAGE_SIZE_LIMIT", "ZIP encode entries 的總大小超過上限。", { size: total, limit: policy.maxUncompressedPackageBytes });
      }
      archiveUpperBound += 76 + nameBytes.byteLength * 2 + bytes.byteLength + 32;
      if (!Number.isSafeInteger(archiveUpperBound) || archiveUpperBound > policy.maxArchiveBytes) {
        fail("ARCHIVE_SIZE_LIMIT", "ZIP encode 預估 archive 大小超過上限；尚未開始壓縮。", {
          sizeUpperBound: archiveUpperBound,
          limit: policy.maxArchiveBytes
        });
      }
      Object.defineProperty(files, entry.path, { value: bytes, enumerable: true, configurable: false, writable: false });
    });

    let archive;
    try {
      // Stored entries avoid a second unbounded compression workspace and make
      // the archive-size preflight exact apart from the conservative 32-byte cushion.
      archive = codec.zipSync(files, { level: 0 });
    } catch (cause) {
      if (cause instanceof ZipAdapterError) throw cause;
      fail("ZIP_ENCODE_FAILED", "fflate 無法建立 ZIP archive。", { cause: cause && cause.message || String(cause) });
    }
    const archiveBytes = asBytes(archive, "ZIP output");
    if (archiveBytes.byteLength > policy.maxArchiveBytes) {
      fail("ARCHIVE_SIZE_LIMIT", "建立後的 ZIP archive 超過上限。", { size: archiveBytes.byteLength, limit: policy.maxArchiveBytes });
    }
    return new Uint8Array(archiveBytes);
  }

  async function decode(archiveInput, options) {
    const policy = getLimits(options);
    const bytes = asBytes(archiveInput, "ZIP archive");
    if (bytes.byteLength > policy.maxArchiveBytes) {
      fail("ARCHIVE_SIZE_LIMIT", "ZIP archive 大小超過上限。", { size: bytes.byteLength, limit: policy.maxArchiveBytes });
    }
    const parsed = locateCentralDirectory(bytes, policy);
    const outputEntries = [];
    const state = { actualTotal: 0 };
    parsed.forEach(function (entry) {
      const compressed = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
      const output = new Uint8Array(entry.uncompressedSize);
      state.entryWritten = 0;
      state.sawFinal = false;
      inflateEntry(entry, compressed, output, state, policy);
      if (entry.method === 0) state.entryWritten = entry.uncompressedSize;
      if (state.entryWritten !== entry.uncompressedSize) {
        fail("ENTRY_SIZE_MISMATCH", "ZIP entry 實際輸出長度與 central directory 宣告不符。", {
          path: entry.path,
          expected: entry.uncompressedSize,
          actual: state.entryWritten
        });
      }
      const actualCrc = crc32(output);
      if (actualCrc !== entry.crc) {
        fail("ENTRY_CRC_MISMATCH", "ZIP entry CRC-32 不符。", { path: entry.path, expected: entry.crc, actual: actualCrc });
      }
      outputEntries.push({ path: entry.path, bytes: output });
    });
    return outputEntries;
  }

  return Object.freeze({
    VERSION: "fflate@0.8.3",
    DEFAULT_LIMITS: DEFAULT_LIMITS,
    ZipAdapterError: ZipAdapterError,
    encode: encode,
    decode: decode
  });
});
