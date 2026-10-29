(function () {
  "use strict";

  const base = self.location.href;
  importScripts(
    new URL("project-schema.js?v=20261029v48", base).href,
    new URL("vendor/fflate/fflate-0.8.3.umd.js", base).href,
    new URL("zip-adapter.js", base).href,
    new URL("project-package.js?v=20261029v48", base).href,
    new URL("package-copy.js?v=20261029v48", base).href
  );

  const Schema = self.DirectorStoryboardProjectSchema;
  const ProjectPackage = self.DirectorStoryboardProjectPackage;
  const ZipAdapter = self.DirectorStoryboardZipAdapter;
  const PackageCopy = self.DirectorStoryboardPackageCopy;
  const copyTickets = new Map();
  let ticketSequence = 0;

  function packageOptions(input) {
    return Object.assign({}, input || {}, {
      schema: Schema,
      zipAdapter: ZipAdapter,
      crypto: self.crypto
    });
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + stableStringify(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function makeTicket() {
    let token = "";
    try { if (self.crypto && typeof self.crypto.randomUUID === "function") token = self.crypto.randomUUID(); }
    catch (_) { token = ""; }
    if (!token) {
      ticketSequence += 1;
      token = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + ticketSequence.toString(36);
    }
    return "package-copy-" + token;
  }

  function newCopyId(kind) {
    return "copy-" + kind + "-" + makeTicket().slice("package-copy-".length);
  }

  function addTransfer(transfers, seen, value) {
    if (!(value instanceof Uint8Array) || !(value.buffer instanceof ArrayBuffer) || value.buffer.byteLength === 0) return;
    if (seen.has(value.buffer)) return;
    seen.add(value.buffer);
    transfers.push(value.buffer);
  }

  function responseTransfers(result) {
    const transfers = [];
    const seen = new Set();
    if (result && result.archiveBytes) addTransfer(transfers, seen, result.archiveBytes);
    const verified = result && result.verified;
    if (verified && Array.isArray(verified.assets)) {
      verified.assets.forEach(function (asset) { addTransfer(transfers, seen, asset.bytes); });
    }
    if (result && Array.isArray(result.assets)) {
      result.assets.forEach(function (asset) { addTransfer(transfers, seen, asset.bytes); });
    }
    if (Array.isArray(result)) {
      result.forEach(function (entry) { addTransfer(transfers, seen, entry && entry.bytes); });
    }
    return transfers;
  }

  async function execute(action, payload) {
    const options = packageOptions(payload && payload.options);
    if (action === "export") {
      let project = payload.project;
      if (payload.projectJsonBytes instanceof Uint8Array) {
        try { project = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload.projectJsonBytes)); }
        catch (cause) {
          const error = new Error("封裝 Worker 收到的固定 Project JSON 無效。");
          error.code = "INVALID_PROJECT";
          error.details = { cause: cause && cause.message || String(cause) };
          throw error;
        }
      }
      const result = await ProjectPackage.exportProjectPackage(project, payload.assets, options);
      const verified = await ProjectPackage.parseProjectPackage(result.archiveBytes, options);
      if (verified.projectId !== project.projectId || verified.revision !== project.revision ||
          stableStringify(verified.project) !== stableStringify(project)) {
        const error = new Error("輸出的 ZIP 無法完整還原固定 canonical Project/revision。");
        error.code = "PACKAGE_ROUNDTRIP_MISMATCH";
        throw error;
      }
      result.workerRoundTripVerified = true;
      return result;
    }
    if (action === "parse") {
      const verified = await ProjectPackage.parseProjectPackage(payload.archive, options);
      let ticket = null;
      if (payload.keepForCopy === true) {
        ticket = makeTicket();
        copyTickets.set(ticket, {
          format: verified.format,
          formatVersion: verified.formatVersion,
          projectId: verified.projectId,
          revision: verified.revision,
          project: verified.project,
          assets: verified.assets.map(function (asset) {
            return { projectId: asset.projectId, id: asset.id, role: asset.role, metadata: asset.metadata };
          }),
          manifest: verified.manifest
        });
        setTimeout(function () { copyTickets.delete(ticket); }, 60000);
      }
      return { verified: verified, ticket: ticket };
    }
    if (action === "verify") {
      return ProjectPackage.verifyProjectPackageEntries(payload.entries, options);
    }
    if (action === "decode") {
      const archive = payload.archive instanceof Blob
        ? new Uint8Array(await payload.archive.arrayBuffer())
        : payload.archive;
      return ZipAdapter.decode(archive, {
        maxArchiveBytes: options.limits && options.limits.maxArchiveBytes || ProjectPackage.DEFAULT_LIMITS.maxArchiveBytes,
        maxUncompressedPackageBytes: options.limits && options.limits.maxUncompressedPackageBytes || ProjectPackage.DEFAULT_LIMITS.maxUncompressedPackageBytes,
        maxEntries: options.limits && options.limits.maxEntries || ProjectPackage.DEFAULT_LIMITS.maxEntries,
        preserveDuplicateNames: true,
        preserveEntryNames: true,
        rejectUnsafePaths: true,
        extractToFilesystem: false
      });
    }
    if (action === "copy-ticket") {
      const verified = copyTickets.get(payload.ticket);
      if (!verified) {
        const error = new Error("另存副本的驗證工作階段已逾時或已結束。");
        error.code = "PACKAGE_COPY_SESSION_EXPIRED";
        throw error;
      }
      try {
        return PackageCopy.createProjectCopy(verified, {
          schema: Schema,
          targetProjectId: payload.targetProjectId,
          newId: newCopyId,
          metadataOnly: true
        });
      } finally {
        copyTickets.delete(payload.ticket);
      }
    }
    if (action === "release-ticket") {
      copyTickets.delete(payload.ticket);
      return true;
    }
    const error = new Error("不支援的 Package Worker action。");
    error.code = "PACKAGE_WORKER_ACTION_UNSUPPORTED";
    throw error;
  }

  self.onmessage = async function (event) {
    const data = event && event.data;
    const id = data && data.id;
    try {
      const result = await execute(data && data.action, data && data.payload || {});
      self.postMessage({ id: id, ok: true, result: result }, responseTransfers(result));
    } catch (error) {
      self.postMessage({
        id: id,
        ok: false,
        error: {
          name: error && error.name || "Error",
          code: error && error.code || "PACKAGE_WORKER_OPERATION_FAILED",
          message: error && error.message || "完整專案包 Worker 作業失敗。",
          details: error && error.details || null
        }
      });
    }
  };
})();
