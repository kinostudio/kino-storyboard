(function attachProjectMigrations(root, factory) {
  "use strict";
  const api = factory(
    typeof module === "object" && module && module.exports ? require("./project-schema.js") : root.DirectorStoryboardProjectSchema,
    typeof module === "object" && module && module.exports ? require("./storage-contract.js") : root.DirectorStoryboardStorageContract
  );
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DirectorStoryboardProjectMigrations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProjectMigrations(ProjectSchema, StorageContract) {
  "use strict";

  const SUPPORTED_WRAPPER_FORMAT = "director-storyboard-demo";
  const SUPPORTED_WRAPPER_VERSION = 1;
  const DEFAULT_ASPECT_RATIO = "16:9";

  class MigrationError extends Error {
    constructor(code, path, message, details) {
      super(message);
      this.name = "MigrationError";
      this.code = code;
      this.path = path || "$";
      this.details = details || null;
    }
  }

  function fail(code, path, message, details) {
    throw new MigrationError(code, path, message, details);
  }

  function isRecord(value) {
    return ProjectSchema.isRecord(value);
  }

  function clone(value) {
    return ProjectSchema.cloneJson(value);
  }

  function parseInput(rawOrValue) {
    let parsed = rawOrValue;
    if (typeof rawOrValue === "string") {
      try {
        parsed = JSON.parse(rawOrValue);
      } catch (error) {
        fail("CORRUPT_LEGACY_JSON", "$", "舊版 localStorage 不是有效 JSON。", {
          cause: error && error.message ? error.message : String(error)
        });
      }
    }
    if (!isRecord(parsed)) fail("INVALID_LEGACY_PROJECT", "$", "舊版草稿必須是 JSON 物件。");

    if (Object.prototype.hasOwnProperty.call(parsed, "format") || Object.prototype.hasOwnProperty.call(parsed, "version")) {
      if (parsed.format !== SUPPORTED_WRAPPER_FORMAT || parsed.version !== SUPPORTED_WRAPPER_VERSION || !isRecord(parsed.project)) {
        fail("UNSUPPORTED_LEGACY_WRAPPER", "$", "備份 wrapper 版本不支援；原始字串已保留。");
      }
      parsed = parsed.project;
    }

    if (Object.prototype.hasOwnProperty.call(parsed, "schemaVersion")) {
      fail(
        parsed.schemaVersion > ProjectSchema.SCHEMA_VERSION ? "UNSUPPORTED_FUTURE_SCHEMA" : "NOT_LEGACY_SCHEMA",
        "$.schemaVersion",
        "來源包含 schemaVersion，不是本 migrator 支援的 localStorage v1 來源。"
      );
    }

    if (!Array.isArray(parsed.chapters) || !Array.isArray(parsed.shots) || !Array.isArray(parsed.days) || !Array.isArray(parsed.entries)) {
      fail("INVALID_LEGACY_PROJECT", "$", "舊版草稿缺少 chapters、shots、days 或 entries 陣列。");
    }
    if (typeof parsed.title !== "string") fail("INVALID_LEGACY_PROJECT", "$.title", "舊版專案名稱必須是文字。");
    if (Object.prototype.hasOwnProperty.call(parsed, "projectType") && typeof parsed.projectType !== "string") {
      fail("INVALID_LEGACY_PROJECT_TYPE", "$.projectType", "舊版專案類型必須是文字。");
    }
    if (!Number.isInteger(parsed.revision) || parsed.revision < 0) fail("INVALID_LEGACY_PROJECT", "$.revision", "舊版 revision 無效。");
    if (parsed.aspectRatio !== undefined && !ProjectSchema.ASPECT_RATIOS.includes(parsed.aspectRatio)) {
      fail("INVALID_ASPECT_RATIO", "$.aspectRatio", "舊版畫幅不受支援。");
    }

    return clone(parsed);
  }

  function validTimestamp(value) {
    if (typeof value !== "string") return false;
    const millis = Date.parse(value);
    return Number.isFinite(millis) && new Date(millis).toISOString() === value;
  }

  function projectIdentifier(options, legacy) {
    if (options.projectId !== undefined) {
      if (typeof options.projectId !== "string" || !options.projectId.trim() || options.projectId !== options.projectId.trim() || options.projectId.length > 200) {
        fail("INVALID_PROJECT_ID", "$.projectId", "projectId 必須是長度 1–200 的非空穩定 ID 字串。");
      }
      return options.projectId;
    }
    if (typeof options.idFactory !== "function") {
      fail("MISSING_ID_FACTORY", "$.projectId", "缺少 projectId 時必須注入 idFactory。");
    }
    const value = options.idFactory({
      kind: "project",
      legacyTitle: legacy.title,
      legacyRevision: legacy.revision
    });
    if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
      fail("INVALID_GENERATED_ID", "$.projectId", "idFactory 必須回傳非空穩定字串。");
    }
    return value;
  }

  function migrationTimestamp(options) {
    if (typeof options.now !== "function") fail("MISSING_CLOCK", "$.createdAt", "必須注入 now() 以保持遷移結果 deterministic。");
    const value = options.now();
    if (!validTimestamp(value)) fail("INVALID_CLOCK_VALUE", "$.createdAt", "now() 必須回傳標準 UTC ISO 時間。");
    return value;
  }

  function legacyShotSuper(shot, path) {
    const hasSuper = Object.prototype.hasOwnProperty.call(shot, "super");
    const hasSuperText = Object.prototype.hasOwnProperty.call(shot, "superText");
    if (hasSuper && typeof shot.super !== "string") {
      fail("INVALID_LEGACY_SUPER", path + ".super", "舊版 SUPER 字卡必須是文字。");
    }
    if (hasSuperText && typeof shot.superText !== "string") {
      fail("INVALID_LEGACY_SUPER", path + ".superText", "舊版 SUPER 字卡必須是文字。");
    }
    if (hasSuper && hasSuperText && shot.super !== shot.superText) {
      fail("AMBIGUOUS_LEGACY_SUPER", path, "舊版 super 與 superText 欄位內容不同；來源已保留，需人工確認。");
    }
    if (hasSuper) return shot.super;
    if (hasSuperText) return shot.superText;
    return "";
  }

  function makeProject(legacy, projectId, now) {
    const scenes = legacy.chapters.map(function (chapter, index) {
      if (!isRecord(chapter) || typeof chapter.id !== "string" || !chapter.id.trim() || typeof chapter.title !== "string") {
        fail("INVALID_SCENE", "$.chapters[" + index + "]", "舊版場次資料格式無效。");
      }
      return { projectId: projectId, id: chapter.id, title: chapter.title };
    });

    const sceneIds = new Set(scenes.map(function (scene) { return scene.id; }));
    const shots = legacy.shots.map(function (shot, index) {
      const path = "$.shots[" + index + "]";
      if (!isRecord(shot) || typeof shot.id !== "string" || !shot.id.trim()) fail("INVALID_SHOT", path, "舊版分鏡資料格式無效。");
      if (!sceneIds.has(shot.chapterId)) fail("ORPHAN_SCENE_REFERENCE", path + ".chapterId", "舊版分鏡引用了不存在的 chapter。");
      if (typeof shot.no !== "string") fail("INVALID_SHOT_NUMBER", path + ".no", "舊版分鏡編號必須是文字。");
      ["title", "visual", "script", "sound", "move", "tags"].forEach(function (name) {
        if (typeof shot[name] !== "string") fail("INVALID_SHOT_TEXT", path + "." + name, "舊版分鏡文字欄位無效。");
      });
      if (typeof shot.duration !== "number" || !Number.isFinite(shot.duration) || shot.duration < 0 || !Number.isInteger(shot.duration * 10)) {
        fail("INVALID_DURATION", path + ".duration", "舊版影片秒數必須是非負數且最多一位小數。");
      }
      const superText = legacyShotSuper(shot, path);
      if (shot.art !== undefined && typeof shot.art !== "string") fail("INVALID_LEGACY_ART", path + ".art", "legacy art 示意值必須保留為文字。");

      const converted = {
        projectId: projectId,
        id: shot.id,
        sceneId: shot.chapterId,
        shotNo: shot.no,
        title: shot.title,
        visual: shot.visual,
        script: shot.script,
        super: superText,
        sound: shot.sound,
        move: shot.move,
        tags: shot.tags,
        durationSeconds: shot.duration,
        assetIds: [],
        drawingIds: []
      };
      if (Object.prototype.hasOwnProperty.call(shot, "art")) converted.legacyArt = shot.art;
      return converted;
    });

    const shootingDays = legacy.days.map(function (day, index) {
      const path = "$.days[" + index + "]";
      if (!isRecord(day) || typeof day.id !== "string" || !day.id.trim()) fail("INVALID_SHOOTING_DAY", path, "舊版拍攝日資料格式無效。");
      if (typeof day.date !== "string" || typeof day.title !== "string" || typeof day.start !== "string") {
        fail("INVALID_SHOOTING_DAY", path, "舊版拍攝日欄位無效。");
      }
      const converted = {
        projectId: projectId,
        id: day.id,
        date: day.date,
        title: day.title,
        start: day.start
      };
      ["location", "contactName", "contactPhone"].forEach(function (name) {
        if (Object.prototype.hasOwnProperty.call(day, name)) {
          if (typeof day[name] !== "string") {
            fail("INVALID_SHOOTING_DAY", path + "." + name, "舊版拍攝日通告欄位必須是文字。");
          }
          converted[name] = day[name];
        }
      });
      ["expectedWrap", "productionCompany", "businessNumber"].forEach(function (name) {
        if (Object.prototype.hasOwnProperty.call(day, name)) converted[name] = day[name];
      });
      ["contacts", "groupCalls", "vehicles", "notices"].forEach(function (name) {
        if (Object.prototype.hasOwnProperty.call(day, name)) converted[name] = clone(day[name]);
      });
      return converted;
    });

    const shotIds = new Set(shots.map(function (shot) { return shot.id; }));
    const dayIds = new Set(shootingDays.map(function (day) { return day.id; }));
    const scheduledShotIds = new Set();
    const scheduleEntries = legacy.entries.map(function (entry, index) {
      const path = "$.entries[" + index + "]";
      if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id.trim()) fail("INVALID_SCHEDULE_ENTRY", path, "舊版拍攝項目資料格式無效。");
      if (!dayIds.has(entry.dayId)) fail("ORPHAN_DAY_REFERENCE", path + ".dayId", "舊版拍攝項目引用了不存在的拍攝日。");
      if (entry.type !== "shot" && entry.type !== "break") fail("INVALID_ENTRY_TYPE", path + ".type", "舊版拍攝項目類型無效。");
      if (typeof entry.title !== "string" || typeof entry.notes !== "string") fail("INVALID_ENTRY_TEXT", path, "舊版拍攝項目文字欄位無效。");
      if (!Number.isInteger(entry.minutes) || entry.minutes < 0) fail("INVALID_MINUTES", path + ".minutes", "舊版拍攝分鐘必須是大於或等於 0 的整數。");
      if (ProjectSchema.ENTRY_STATUSES.indexOf(entry.status) < 0) fail("INVALID_ENTRY_STATUS", path + ".status", "舊版拍攝狀態無效。");

      let timingMode = entry.timingMode === undefined ? null : entry.timingMode;
      const startTime = entry.startTime === undefined ? null : entry.startTime;
      const endTime = entry.endTime === undefined ? null : entry.endTime;
      let endNextDay = entry.endNextDay === undefined ? null : entry.endNextDay;
      const minutes = entry.minutes;

      if (startTime !== null && (typeof startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime))) {
        fail("INVALID_TIME", path + ".startTime", "舊版指定開始時間無效。");
      }
      if (endTime !== null && (typeof endTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime))) {
        fail("INVALID_TIME", path + ".endTime", "舊版指定結束時間無效。");
      }
      if (endNextDay !== null && typeof endNextDay !== "boolean") fail("INVALID_END_NEXT_DAY", path + ".endNextDay", "舊版隔日標記必須是布林值。");
      if (timingMode === null) {
        if (startTime === null && endTime === null) {
          timingMode = "auto";
          if (endNextDay === null) endNextDay = false;
        } else {
          if (startTime === null || endTime === null) {
            fail("AMBIGUOUS_LEGACY_TIMING_MODE", path, "舊版有不完整起迄時間但缺少 timingMode，需人工確認後才能遷移。");
          }
          const start = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5));
          const end = Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5));
          const candidates = [false, true].filter(function (nextDay) {
            const elapsed = end + (nextDay ? 1440 : 0) - start;
            return elapsed > 0 && elapsed === minutes && (endNextDay === null || endNextDay === nextDay);
          });
          if (candidates.length !== 1) {
            fail("AMBIGUOUS_LEGACY_TIMING_MODE", path, "舊版起迄時間與分鐘數無法唯一證明固定時段語意，需人工確認。");
          }
          timingMode = "fixed";
          endNextDay = candidates[0];
        }
      } else if (endNextDay === null) {
        endNextDay = false;
      }
      if (timingMode !== "auto" && timingMode !== "fixed") fail("INVALID_TIMING_MODE", path + ".timingMode", "舊版時間模式無效。");
      if (timingMode === "fixed") {
        if (startTime === null || endTime === null) fail("MISSING_FIXED_TIME", path, "固定時段缺少起迄時間。");
        const start = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5));
        const end = Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5));
        const elapsed = end + (endNextDay ? 1440 : 0) - start;
        if (elapsed <= 0) fail("INVALID_FIXED_DURATION", path, "固定時段結束早於開始且沒有有效隔日設定。");
        if (minutes !== elapsed) {
          fail("FIXED_DURATION_MISMATCH", path + ".minutes", "固定時段分鐘數與起迄時間不一致；需保留來源並人工修復。");
        }
      }

      let shotId = entry.shotId;
      if (entry.type === "shot") {
        if (typeof shotId !== "string" || !shotIds.has(shotId)) fail("ORPHAN_SHOT_REFERENCE", path + ".shotId", "舊版拍攝項目引用了不存在的分鏡。");
        if (scheduledShotIds.has(shotId)) fail("DUPLICATE_SHOT_SCHEDULE", path + ".shotId", "舊版同一分鏡有重複拍攝安排。");
        scheduledShotIds.add(shotId);
      } else if (shotId !== null) {
        fail("BREAK_HAS_SHOT", path + ".shotId", "休息項目不可引用分鏡。");
      }

      return {
        projectId: projectId,
        id: entry.id,
        dayId: entry.dayId,
        type: entry.type,
        shotId: shotId,
        title: entry.title,
        minutes: minutes,
        status: entry.status,
        notes: entry.notes,
        timingMode: timingMode,
        startTime: startTime,
        endTime: endTime,
        endNextDay: endNextDay
      };
    });

    const shotOrderByScene = Object.create(null);
    scenes.forEach(function (scene) {
      shotOrderByScene[scene.id] = shots
        .filter(function (shot) { return shot.sceneId === scene.id; })
        .map(function (shot) { return shot.id; });
    });
    const scheduleOrderByDay = Object.create(null);
    shootingDays.forEach(function (day) {
      scheduleOrderByDay[day.id] = scheduleEntries
        .filter(function (entry) { return entry.dayId === day.id; })
        .map(function (entry) { return entry.id; });
    });

    const details = {
      visual: true,
      script: true,
      super: false,
      sound: true,
      move: true,
      duration: true
    };
    const fields = {
      images: { shotNumber: true, title: true, voiceover: false, super: false, duration: true },
      details: details
    };
    // Keep the former flat detail flags available to old renderers while all
    // v2 callers use the independent images/details groups. The flat alias
    // retains its historical SUPER-on default; v2 details SUPER starts off.
    ProjectSchema.OUTPUT_FIELDS.forEach(function (name) { fields[name] = details[name]; });
    fields.super = true;

    const project = {
      projectId: projectId,
      schemaVersion: ProjectSchema.SCHEMA_VERSION,
      revision: legacy.revision,
      title: legacy.title,
      createdAt: now,
      updatedAt: now,
      aspectRatio: legacy.aspectRatio === undefined ? DEFAULT_ASPECT_RATIO : legacy.aspectRatio,
      scenes: scenes,
      sceneOrder: scenes.map(function (scene) { return scene.id; }),
      shots: shots,
      shotOrderByScene: shotOrderByScene,
      shootingDays: shootingDays,
      shootingDayOrder: shootingDays.map(function (day) { return day.id; }),
      scheduleEntries: scheduleEntries,
      scheduleOrderByDay: scheduleOrderByDay,
      productionTasks: [],
      productionTaskOrder: [],
      productionTimelineOrder: [{ kind: "shootingDayMarkers" }],
      assets: [],
      drawings: [],
      outputPreferences: {
        schemaVersion: ProjectSchema.PREFERENCE_SCHEMA_VERSION,
        revision: 0,
        mode: "details",
        orientation: "auto",
        density: 4,
        densityByMode: { images: 4, details: 4 },
        template: "worksheet",
        densityByTemplate: { worksheet: 4, proposal: 4, production: 6, av: 4, contact: 8, vo: 8 },
        fields: fields,
        schedule: { dayScope: "selected", selectedDayId: null }
      }
    };
    // Migrate only an explicitly stored field. Older drafts remain untyped;
    // their title is not a reliable source for a project type.
    if (Object.prototype.hasOwnProperty.call(legacy, "projectType")) {
      project.projectType = legacy.projectType;
    }
    return project;
  }

  function migrateLegacyProject(rawOrValue, options) {
    const opts = options || {};
    const legacy = parseInput(rawOrValue);
    const projectId = projectIdentifier(opts, legacy);
    const now = migrationTimestamp(opts);
    const project = ProjectSchema.validateProject(makeProject(legacy, projectId, now));
    const demoShotIds = project.shots.filter(function (shot) {
      return Object.prototype.hasOwnProperty.call(shot, "legacyArt");
    }).map(function (shot) { return shot.id; });

    return Object.freeze({
      project: project,
      report: Object.freeze({
        sourceFormat: "kino-storyboard-demo-v1",
        sourceRevision: legacy.revision,
        projectId: project.projectId,
        preservedIds: true,
        remappedIds: [],
        sceneCount: project.scenes.length,
        shotCount: project.shots.length,
        shootingDayCount: project.shootingDays.length,
        scheduleEntryCount: project.scheduleEntries.length,
        assetCount: 0,
        drawingCount: 0,
        legacyArtMetadataShotIds: demoShotIds,
        warnings: demoShotIds.length
          ? ["舊版 art 欄位是 SVG 示意圖類型，只以 legacyArt metadata 保留，不會建立或假稱為原圖 Asset。"]
          : []
      })
    });
  }

  return Object.freeze({
    SUPPORTED_WRAPPER_FORMAT: SUPPORTED_WRAPPER_FORMAT,
    SUPPORTED_WRAPPER_VERSION: SUPPORTED_WRAPPER_VERSION,
    MigrationError: MigrationError,
    migrateLegacyProject: migrateLegacyProject
  });
});
