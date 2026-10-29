(function attachProjectBootstrap(root, factory) {
  "use strict";
  const api = factory(
    typeof module === "object" && module && module.exports ? require("./project-schema.js") : root.DirectorStoryboardProjectSchema,
    typeof module === "object" && module && module.exports ? require("./project-migrations.js") : root.DirectorStoryboardProjectMigrations,
    typeof module === "object" && module && module.exports ? require("./storage-contract.js") : root.DirectorStoryboardStorageContract
  );
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DirectorStoryboardProjectBootstrap = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProjectBootstrap(ProjectSchema, ProjectMigrations, StorageContract) {
  "use strict";

  class BootstrapError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = "BootstrapError";
      this.code = code;
      this.details = details || null;
    }
  }

  async function bootProject(options) {
    const opts = options || {};
    if (opts.projectId !== undefined && (
      typeof opts.projectId !== "string" ||
      !opts.projectId.trim() ||
      opts.projectId !== opts.projectId.trim() ||
      opts.projectId.length > 200
    )) {
      throw new BootstrapError("INVALID_PROJECT_ID", "projectId 必須是長度 1–200 的非空穩定 ID 字串。");
    }
    const adapter = StorageContract.assertBootAdapter(opts.adapter);

    // Adapter open and reads are deliberately awaited. Callers receive no
    // "ready" result while storage is still opening or loading.
    await adapter.open();

    if (opts.projectId !== undefined && opts.projectId !== null) {
      const requestedProjectId = opts.projectId;
      const stored = await adapter.loadProject(requestedProjectId);
      if (stored !== null && stored !== undefined) {
        const project = ProjectSchema.validateProject(stored);
        if (project.projectId !== requestedProjectId) {
          throw new BootstrapError("PROJECT_ID_MISMATCH", "載入的專案 ID 與請求 ID 不一致。");
        }
        return Object.freeze({
          status: "ready",
          source: "adapter",
          project: project,
          migrationReport: null
        });
      }
    }

    const legacy = StorageContract.readLegacyRaw(opts.legacyStorage);
    if (!legacy.found) {
      return Object.freeze({
        status: "needs_project_creation",
        project: null,
        sourceRaw: null,
        migrationReport: null
      });
    }

    let migrated;
    try {
      migrated = ProjectMigrations.migrateLegacyProject(legacy.raw, {
        projectId: opts.projectId,
        now: opts.now,
        idFactory: opts.idFactory
      });
    } catch (error) {
      if (error && error.code) throw error;
      throw new BootstrapError("MIGRATION_PREVIEW_FAILED", "舊版草稿無法預覽遷移。", {
        cause: error && error.message ? error.message : String(error)
      });
    }

    // No adapter write, removeItem or setItem occurs before an explicit,
    // separately owned confirmation flow.
    return Object.freeze({
      status: "needs_migration_confirmation",
      project: migrated.project,
      sourceKey: legacy.key,
      sourceRaw: legacy.raw,
      migrationReport: migrated.report
    });
  }

  return Object.freeze({
    BootstrapError: BootstrapError,
    bootProject: bootProject
  });
});
