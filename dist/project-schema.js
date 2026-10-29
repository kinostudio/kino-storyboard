(function attachProjectSchema(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DirectorStoryboardProjectSchema = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProjectSchema() {
  "use strict";

  const SCHEMA_VERSION = 1;
  const DRAWING_SCHEMA_VERSION = 2;
  const LEGACY_DRAWING_SCHEMA_VERSION = 1;
  const PREFERENCE_SCHEMA_VERSION = 2;
  const LEGACY_PREFERENCE_SCHEMA_VERSION = 1;
  const ASPECT_RATIOS = Object.freeze(["16:9", "1:1", "4:3", "2.35:1"]);
  const ENTRY_STATUSES = Object.freeze(["待拍", "拍攝中", "完成", "略過"]);
  const ENTRY_TYPES = Object.freeze(["shot", "break"]);
  const OUTPUT_FIELDS = Object.freeze(["visual", "script", "super", "sound", "move", "duration"]);
  const IMAGE_OUTPUT_FIELDS = Object.freeze(["shotNumber", "title", "voiceover", "super", "duration"]);
  const SCHEDULE_BOOLEAN_FIELDS = Object.freeze([
    "rundownThumbnails", "rundownNotes", "rundownStatus", "storyboardShotNumber", "storyboardTitle"
  ]);

  class ProjectValidationError extends Error {
    constructor(code, path, message) {
      super(message);
      this.name = "ProjectValidationError";
      this.code = code;
      this.path = path || "$";
    }
  }

  function fail(code, path, message) {
    throw new ProjectValidationError(code, path, message);
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function record(value, path) {
    if (!isRecord(value)) fail("EXPECTED_OBJECT", path, path + " 必須是物件。");
    return value;
  }

  function array(value, path) {
    if (!Array.isArray(value)) fail("EXPECTED_ARRAY", path, path + " 必須是陣列。");
    return value;
  }

  function text(value, path, allowEmpty) {
    if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
      fail("EXPECTED_TEXT", path, path + " 必須是" + (allowEmpty ? "文字。" : "非空文字。"));
    }
    return value;
  }

  function id(value, path) {
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 200) {
      fail("INVALID_ID", path, path + " 必須是長度 1–200 的穩定不透明 ID。");
    }
    return value;
  }

  function integer(value, path, min) {
    if (!Number.isInteger(value) || value < min) {
      fail("INVALID_INTEGER", path, path + " 必須是大於或等於 " + min + " 的整數。");
    }
    return value;
  }

  function finiteNonnegative(value, path) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      fail("INVALID_NUMBER", path, path + " 必須是有限的非負數。");
    }
    return value;
  }

  function validatePhotoCrop(value, path) {
    const crop = record(value, path);
    const fields = ["x", "y", "width", "height"];
    const keys = Object.keys(crop);
    if (keys.length !== fields.length || keys.some(function (key) { return fields.indexOf(key) < 0; })) {
      fail("INVALID_PHOTO_CROP", path, path + " 只接受 x、y、width、height 四個欄位。");
    }
    fields.forEach(function (name) {
      const coordinate = crop[name];
      if (typeof coordinate !== "number" || !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1) {
        fail("INVALID_PHOTO_CROP", path + "." + name, path + "." + name + " 必須是 0 到 1 之間的有限數字。");
      }
    });
    if (crop.width === 0 || crop.height === 0 || crop.x + crop.width > 1 || crop.y + crop.height > 1) {
      fail("INVALID_PHOTO_CROP", path, path + " 必須是原圖範圍內的非零矩形。");
    }
    return cloneJson(crop);
  }

  function validateShotPhotoCrops(shot, path) {
    if (!Object.prototype.hasOwnProperty.call(shot, "photoCropsByAssetId")) return;
    const crops = record(shot.photoCropsByAssetId, path + ".photoCropsByAssetId");
    const references = new Set(shot.assetIds);
    Object.keys(crops).forEach(function (assetId) {
      const cropPath = path + ".photoCropsByAssetId." + assetId;
      id(assetId, cropPath);
      if (!references.has(assetId)) {
        fail("ORPHAN_PHOTO_CROP", cropPath, "裁切只能屬於此 Shot 目前引用的照片 Asset。");
      }
      validatePhotoCrop(crops[assetId], cropPath);
    });
  }

  function validDate(value, path) {
    text(value, path, false);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("INVALID_DATE", path, path + " 日期格式必須為 YYYY-MM-DD。");
    const date = new Date(value + "T00:00:00.000Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      fail("INVALID_DATE", path, path + " 不是有效日期。");
    }
    return value;
  }

  function clockMinutes(value, path) {
    text(value, path, false);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail("INVALID_TIME", path, path + " 時間格式必須為 HH:mm。");
    return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  }

  function cloneJson(value) {
    try {
      const encoded = JSON.stringify(value);
      if (encoded === undefined) fail("NOT_JSON_DATA", "$", "Project 必須只包含 JSON 資料。");
      return JSON.parse(encoded);
    } catch (error) {
      if (error instanceof ProjectValidationError) throw error;
      fail("NOT_JSON_DATA", "$", "Project 必須是可序列化的 JSON 資料。");
    }
  }

  function addUniqueId(seen, value, path) {
    const safeId = id(value, path);
    if (seen.has(safeId)) fail("DUPLICATE_ID", path, "Project 內有重複 ID：" + safeId);
    seen.add(safeId);
    return safeId;
  }

  function sameMembers(actual, expected, path) {
    array(actual, path);
    const actualSet = new Set();
    actual.forEach(function (item, index) {
      const itemId = id(item, path + "[" + index + "]");
      if (actualSet.has(itemId)) fail("DUPLICATE_ORDER_ID", path + "[" + index + "]", "排序清單有重複 ID：" + itemId);
      actualSet.add(itemId);
    });
    const expectedSet = new Set(expected);
    if (actualSet.size !== expectedSet.size || Array.from(actualSet).some(function (itemId) { return !expectedSet.has(itemId); })) {
      fail("ORDER_MEMBERSHIP_MISMATCH", path, path + " 必須恰好列出所有所屬項目一次。");
    }
  }

  function validateProductionTimelineOrder(value, productionTaskIds, path) {
    const rows = array(value, path);
    const expectedTasks = new Set(productionTaskIds);
    const seenTasks = new Set();
    let markerRows = 0;
    rows.forEach(function (item, index) {
      const itemPath = path + "[" + index + "]";
      record(item, itemPath);
      if (item.kind === "shootingDayMarkers") {
        markerRows += 1;
        if (Object.keys(item).length !== 1) {
          fail("INVALID_PRODUCTION_TIMELINE_ROW", itemPath, "拍攝日標記列只接受 kind 欄位。");
        }
        if (markerRows > 1) fail("DUPLICATE_PRODUCTION_TIMELINE_ROW", itemPath, "拍攝日標記列只能出現一次。");
        return;
      }
      if (item.kind !== "productionTask") {
        fail("INVALID_PRODUCTION_TIMELINE_ROW", itemPath + ".kind", "時間軸列類型必須是 shootingDayMarkers 或 productionTask。");
      }
      if (Object.keys(item).length !== 2 || !Object.prototype.hasOwnProperty.call(item, "id")) {
        fail("INVALID_PRODUCTION_TIMELINE_ROW", itemPath, "製作任務列只接受 kind 和 id 欄位。");
      }
      const taskId = id(item.id, itemPath + ".id");
      if (!expectedTasks.has(taskId)) {
        fail("ORDER_MEMBERSHIP_MISMATCH", itemPath + ".id", "時間軸列引用了目前不存在的製作任務。");
      }
      if (seenTasks.has(taskId)) {
        fail("DUPLICATE_PRODUCTION_TIMELINE_ROW", itemPath + ".id", "時間軸排序不可重複包含同一製作任務。");
      }
      seenTasks.add(taskId);
    });
    if (markerRows !== 1) {
      fail("ORDER_MEMBERSHIP_MISMATCH", path, "時間軸排序必須包含唯一一列拍攝日標記。");
    }
    if (seenTasks.size !== expectedTasks.size) {
      fail("ORDER_MEMBERSHIP_MISMATCH", path, "時間軸排序必須恰好包含所有製作任務一次。");
    }
    return rows;
  }

  function validatePreferenceFields(fields, names, path, required) {
    record(fields, path);
    names.forEach(function (name) {
      if (!required && !Object.prototype.hasOwnProperty.call(fields, name)) return;
      if (typeof fields[name] !== "boolean") fail("INVALID_OUTPUT_FIELD", path + "." + name, "輸出欄位必須是布林值。");
    });
    return fields;
  }

  function validateOutputPreferences(value, path, shootingDayIds) {
    const prefs = record(value, path);
    if (prefs.schemaVersion !== PREFERENCE_SCHEMA_VERSION && prefs.schemaVersion !== LEGACY_PREFERENCE_SCHEMA_VERSION) {
      fail("UNSUPPORTED_PREFERENCE_SCHEMA", path + ".schemaVersion", "不支援此輸出偏好 schemaVersion。");
    }
    integer(prefs.revision, path + ".revision", 0);
    if (prefs.mode !== "details" && prefs.mode !== "images") fail("INVALID_OUTPUT_MODE", path + ".mode", "輸出模式只能是 details 或 images。");
    const validOrientation = prefs.schemaVersion === LEGACY_PREFERENCE_SCHEMA_VERSION
      ? ["portrait", "landscape"].includes(prefs.orientation)
      : ["auto", "portrait", "landscape"].includes(prefs.orientation);
    if (!validOrientation) {
      fail("INVALID_ORIENTATION", path + ".orientation", "紙張方向只能是 auto、portrait 或 landscape。");
    }
    integer(prefs.density, path + ".density", 1);
    if (prefs.density > 12) fail("INVALID_DENSITY", path + ".density", "每頁密度必須介於 1–12。");
    const fields = record(prefs.fields, path + ".fields");
    const groupedV2 = prefs.schemaVersion === PREFERENCE_SCHEMA_VERSION &&
      (Object.prototype.hasOwnProperty.call(fields, "images") || Object.prototype.hasOwnProperty.call(fields, "details"));
    if (!groupedV2) {
      // Stored v1 preferences (and older in-memory callers that use the flat
      // fields map) stay readable as-is. Opening a Project never rewrites it.
      validatePreferenceFields(fields, OUTPUT_FIELDS, path + ".fields", false);
    } else {
      validatePreferenceFields(fields.images, IMAGE_OUTPUT_FIELDS, path + ".fields.images", true);
      validatePreferenceFields(fields.details, OUTPUT_FIELDS, path + ".fields.details", true);
      // During the v1 -> v2 transition, keep flat aliases readable by older
      // renderers. They are optional and never used as the v2 source of truth.
      validatePreferenceFields(fields, OUTPUT_FIELDS, path + ".fields", false);
      if (!isRecord(prefs.schedule)) fail("EXPECTED_OBJECT", path + ".schedule", path + ".schedule 必須是物件。");
      if (prefs.schedule.dayScope !== "selected" && prefs.schedule.dayScope !== "all") {
        fail("INVALID_DAY_SCOPE", path + ".schedule.dayScope", "拍攝日範圍只能是 selected 或 all。");
      }
      if (Object.prototype.hasOwnProperty.call(prefs.schedule, "showEstimatedWrap") && typeof prefs.schedule.showEstimatedWrap !== "boolean") {
        fail("INVALID_ESTIMATED_WRAP_PREFERENCE", path + ".schedule.showEstimatedWrap", "預估收工輸出設定必須是布林值。");
      }
      SCHEDULE_BOOLEAN_FIELDS.forEach(function (name) {
        if (Object.prototype.hasOwnProperty.call(prefs.schedule, name) && typeof prefs.schedule[name] !== "boolean") {
          fail("INVALID_SCHEDULE_PREFERENCE", path + ".schedule." + name, path + ".schedule." + name + " 必須是布林值。");
        }
      });
      if (prefs.schedule.selectedDayId !== null) {
        const selectedDayId = id(prefs.schedule.selectedDayId, path + ".schedule.selectedDayId");
        if (shootingDayIds && !shootingDayIds.has(selectedDayId)) {
          fail("ORPHAN_SELECTED_DAY", path + ".schedule.selectedDayId", "輸出偏好引用了目前 Project 不存在的拍攝日。");
        }
      }
      if (Object.prototype.hasOwnProperty.call(prefs, "densityByMode")) {
        const densityByMode = record(prefs.densityByMode, path + ".densityByMode");
        ["images", "details"].forEach(function (mode) {
          integer(densityByMode[mode], path + ".densityByMode." + mode, 1);
          if (densityByMode[mode] > 12) fail("INVALID_DENSITY", path + ".densityByMode." + mode, "每頁密度必須介於 1–12。");
        });
        if (densityByMode[prefs.mode] !== prefs.density) {
          fail("INVALID_DENSITY", path + ".density", "density 必須與目前模式的 densityByMode 相同。");
        }
      }
    }
    return prefs;
  }

  function validateProject(input) {
    const project = cloneJson(record(input, "$"));
    const rootPath = "$";
    if (project.schemaVersion !== SCHEMA_VERSION) {
      const version = project.schemaVersion;
      fail(
        version > SCHEMA_VERSION ? "UNSUPPORTED_FUTURE_SCHEMA" : "UNSUPPORTED_SCHEMA",
        rootPath + ".schemaVersion",
        "Project schemaVersion " + String(version) + " 不受目前版本支援。"
      );
    }

    const projectId = id(project.projectId, rootPath + ".projectId");
    integer(project.revision, rootPath + ".revision", 0);
    text(project.title, rootPath + ".title", true);
    // projectType was added after the first canonical projects were stored.
    // Leave it absent on older records; do not infer a value from their title.
    if (Object.prototype.hasOwnProperty.call(project, "projectType")) {
      text(project.projectType, rootPath + ".projectType", true);
    }
    [project.createdAt, project.updatedAt].forEach(function (value, index) {
      const path = index === 0 ? rootPath + ".createdAt" : rootPath + ".updatedAt";
      text(value, path, false);
      const millis = Date.parse(value);
      if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) {
        fail("INVALID_TIMESTAMP", path, path + " 必須是標準 UTC ISO 時間。");
      }
    });
    if (!ASPECT_RATIOS.includes(project.aspectRatio)) fail("INVALID_ASPECT_RATIO", rootPath + ".aspectRatio", "不支援此畫幅。");

    const seenIds = new Set();
    const scenes = array(project.scenes, rootPath + ".scenes");
    const shots = array(project.shots, rootPath + ".shots");
    const shootingDays = array(project.shootingDays, rootPath + ".shootingDays");
    const entries = array(project.scheduleEntries, rootPath + ".scheduleEntries");
    const hasProductionTasks = Object.prototype.hasOwnProperty.call(project, "productionTasks");
    const hasProductionTaskOrder = Object.prototype.hasOwnProperty.call(project, "productionTaskOrder");
    if (hasProductionTasks !== hasProductionTaskOrder) {
      fail("INCOMPLETE_PRODUCTION_TASK_DATA", rootPath + ".productionTasks", "productionTasks 與 productionTaskOrder 必須同時存在或同時缺席。");
    }
    const productionTasks = hasProductionTasks ? array(project.productionTasks, rootPath + ".productionTasks") : [];
    const productionTaskOrder = hasProductionTaskOrder ? project.productionTaskOrder : [];
    const hasProductionTimelineOrder = Object.prototype.hasOwnProperty.call(project, "productionTimelineOrder");
    const assets = array(project.assets, rootPath + ".assets");
    const drawings = array(project.drawings, rootPath + ".drawings");

    const sceneById = new Map();
    scenes.forEach(function (scene, index) {
      const path = rootPath + ".scenes[" + index + "]";
      record(scene, path);
      if (scene.projectId !== projectId) fail("CROSS_PROJECT_RECORD", path + ".projectId", "Scene 必須屬於此 Project。");
      addUniqueId(seenIds, scene.id, path + ".id");
      text(scene.title, path + ".title", true);
      if (scene.displayNo !== undefined) text(scene.displayNo, path + ".displayNo", true);
      sceneById.set(scene.id, scene);
    });
    sameMembers(project.sceneOrder, scenes.map(function (scene) { return scene.id; }), rootPath + ".sceneOrder");

    const shotById = new Map();
    shots.forEach(function (shot, index) {
      const path = rootPath + ".shots[" + index + "]";
      record(shot, path);
      if (shot.projectId !== projectId) fail("CROSS_PROJECT_RECORD", path + ".projectId", "Shot 必須屬於此 Project。");
      addUniqueId(seenIds, shot.id, path + ".id");
      if (!sceneById.has(shot.sceneId)) fail("ORPHAN_SCENE_REFERENCE", path + ".sceneId", "Shot 引用了不存在的 Scene。");
      text(shot.shotNo, path + ".shotNo", true);
      if (Object.prototype.hasOwnProperty.call(shot, "shotNoLocked")) {
        if (typeof shot.shotNoLocked !== "boolean") fail("INVALID_SHOT_NUMBER_LOCK", path + ".shotNoLocked", "shotNoLocked 必須是布林值。");
        if (shot.shotNoLocked && (!/^[1-9]\d*$/.test(shot.shotNo) || !Number.isSafeInteger(Number(shot.shotNo)))) {
          fail("INVALID_LOCKED_SHOT_NUMBER", path + ".shotNo", "鎖定鏡次必須是無前導零的正整數。");
        }
      }
      ["title", "visual", "script", "sound", "move", "tags"].forEach(function (name) { text(shot[name], path + "." + name, true); });
      if (shot.super !== undefined) text(shot.super, path + ".super", true);
      finiteNonnegative(shot.durationSeconds, path + ".durationSeconds");
      if (!Number.isInteger(shot.durationSeconds * 10)) fail("INVALID_DURATION_PRECISION", path + ".durationSeconds", "影片秒數最多一位小數。");
      if (shot.legacyArt !== undefined) text(shot.legacyArt, path + ".legacyArt", true);
      array(shot.assetIds, path + ".assetIds").forEach(function (assetId, assetIndex) { id(assetId, path + ".assetIds[" + assetIndex + "]"); });
      validateShotPhotoCrops(shot, path);
      array(shot.drawingIds, path + ".drawingIds").forEach(function (drawingId, drawingIndex) { id(drawingId, path + ".drawingIds[" + drawingIndex + "]"); });
      shotById.set(shot.id, shot);
    });

    record(project.shotOrderByScene, rootPath + ".shotOrderByScene");
    const shotOrderKeys = Object.keys(project.shotOrderByScene);
    if (shotOrderKeys.length !== scenes.length || scenes.some(function (scene) { return !Object.prototype.hasOwnProperty.call(project.shotOrderByScene, scene.id); })) {
      fail("ORDER_GROUP_MISMATCH", rootPath + ".shotOrderByScene", "每個 Scene 必須且只能有一組 Shot 排序清單。");
    }
    scenes.forEach(function (scene) {
      const orderedIds = project.shotOrderByScene[scene.id];
      const expectedIds = shots.filter(function (shot) { return shot.sceneId === scene.id; }).map(function (shot) { return shot.id; });
      sameMembers(orderedIds, expectedIds, rootPath + ".shotOrderByScene." + scene.id);
      orderedIds.forEach(function (shotId) {
        if (shotById.get(shotId).sceneId !== scene.id) {
          fail("ORDER_GROUP_MISMATCH", rootPath + ".shotOrderByScene." + scene.id, "Shot 排序清單包含其他 Scene 的 Shot。");
        }
      });
    });

    const dayById = new Map();
    shootingDays.forEach(function (day, index) {
      const path = rootPath + ".shootingDays[" + index + "]";
      record(day, path);
      if (day.projectId !== projectId) fail("CROSS_PROJECT_RECORD", path + ".projectId", "ShootingDay 必須屬於此 Project。");
      addUniqueId(seenIds, day.id, path + ".id");
      validDate(day.date, path + ".date");
      text(day.title, path + ".title", true);
      clockMinutes(day.start, path + ".start");
      ["location", "contactName", "contactPhone"].forEach(function (name) {
        if (Object.prototype.hasOwnProperty.call(day, name)) text(day[name], path + "." + name, true);
      });
      ["productionCompany", "businessNumber"].forEach(function (name) {
        if (Object.prototype.hasOwnProperty.call(day, name)) text(day[name], path + "." + name, true);
      });
      ["expectedWrap"].forEach(function (name) {
        if (Object.prototype.hasOwnProperty.call(day, name) && day[name] !== "") clockMinutes(day[name], path + "." + name);
      });
      const repeatableTextFields = ["notices"];
      repeatableTextFields.forEach(function (name) {
        if (!Object.prototype.hasOwnProperty.call(day, name)) return;
        const rowIds = new Set();
        array(day[name], path + "." + name).forEach(function (item, itemIndex) {
          const itemPath = path + "." + name + "[" + itemIndex + "]";
          record(item, itemPath);
          const rowId = id(item.id, itemPath + ".id");
          if (rowIds.has(rowId)) fail("DUPLICATE_CALLSHEET_ROW_ID", itemPath + ".id", "同一通告清單內的列 ID 不可重複。");
          rowIds.add(rowId);
          text(item.text, itemPath + ".text", true);
        });
      });
      ["contacts", "groupCalls", "vehicles"].forEach(function (name) {
        if (!Object.prototype.hasOwnProperty.call(day, name)) return;
        const rowIds = new Set();
        array(day[name], path + "." + name).forEach(function (item, itemIndex) {
          const itemPath = path + "." + name + "[" + itemIndex + "]";
          record(item, itemPath);
          const rowId = id(item.id, itemPath + ".id");
          if (rowIds.has(rowId)) fail("DUPLICATE_CALLSHEET_ROW_ID", itemPath + ".id", "同一通告清單內的列 ID 不可重複。");
          rowIds.add(rowId);
          const fields = name === "contacts" ? ["position", "name", "phone"]
            : name === "groupCalls" ? ["group", "location", "time"]
              : ["label", "plate", "driver", "driverPhone", "passengers"];
          fields.forEach(function (field) {
            text(item[field], itemPath + "." + field, true);
          });
          if (name === "contacts" && typeof item.onCall !== "boolean") fail("INVALID_CALLSHEET_CONTACT", itemPath + ".onCall", "聯絡人通告顯示開關必須是布林值。");
          if (name === "groupCalls" && item.time !== "") clockMinutes(item.time, itemPath + ".time");
        });
      });
      dayById.set(day.id, day);
    });
    sameMembers(project.shootingDayOrder, shootingDays.map(function (day) { return day.id; }), rootPath + ".shootingDayOrder");

    const productionTaskIds = [];
    productionTasks.forEach(function (task, index) {
      const path = rootPath + ".productionTasks[" + index + "]";
      record(task, path);
      if (task.projectId !== projectId) fail("CROSS_PROJECT_RECORD", path + ".projectId", "ProductionTask 必須屬於此 Project。");
      productionTaskIds.push(addUniqueId(seenIds, task.id, path + ".id"));
      text(task.title, path + ".title", true);
      validDate(task.startDate, path + ".startDate");
      validDate(task.endDate, path + ".endDate");
      if (task.endDate < task.startDate) {
        fail("INVALID_PRODUCTION_TASK_RANGE", path + ".endDate", "製作任務結束日期不可早於開始日期。");
      }
      text(task.notes, path + ".notes", true);
      if (Object.prototype.hasOwnProperty.call(task, "color")) {
        text(task.color, path + ".color", true);
        if (task.color !== "" && !/^#[0-9a-fA-F]{6}$/.test(task.color)) {
          fail("INVALID_PRODUCTION_TASK_COLOR", path + ".color", "製作任務顏色必須是 #RRGGBB 十六進位色碼或空白。");
        }
      }
    });
    if (hasProductionTasks) sameMembers(productionTaskOrder, productionTaskIds, rootPath + ".productionTaskOrder");
    if (hasProductionTimelineOrder) {
      const timelineOrder = validateProductionTimelineOrder(project.productionTimelineOrder, productionTaskIds, rootPath + ".productionTimelineOrder");
      const timelineTaskOrder = timelineOrder.filter(function (row) { return row.kind === "productionTask"; }).map(function (row) { return row.id; });
      if (hasProductionTasks && (timelineTaskOrder.length !== productionTaskOrder.length ||
          timelineTaskOrder.some(function (taskId, index) { return taskId !== productionTaskOrder[index]; }))) {
        fail("PRODUCTION_TIMELINE_TASK_ORDER_MISMATCH", rootPath + ".productionTimelineOrder", "時間軸中的任務順序必須與 productionTaskOrder 一致。");
      }
    }

    const assetById = new Map();
    assets.forEach(function (asset, index) {
      const path = rootPath + ".assets[" + index + "]";
      record(asset, path);
      if (asset.projectId !== projectId) fail("CROSS_PROJECT_RECORD", path + ".projectId", "Asset 必須屬於此 Project。");
      addUniqueId(seenIds, asset.id, path + ".id");
      if (asset.role !== "photoOriginal" && asset.role !== "drawingPreview") {
        fail("INVALID_ASSET_ROLE", path + ".role", "Asset role 只能是 photoOriginal 或 drawingPreview。");
      }
      if (typeof asset.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(asset.sha256)) fail("INVALID_ASSET_HASH", path + ".sha256", "Asset 必須有小寫 SHA-256。");
      if (!/^image\/(jpeg|png|webp|heic)$/.test(asset.mime)) fail("INVALID_ASSET_MIME", path + ".mime", "Asset MIME 不在支援的圖片格式內。");
      text(asset.originalName, path + ".originalName", true);
      integer(asset.byteLength, path + ".byteLength", 0);
      integer(asset.width, path + ".width", 1);
      integer(asset.height, path + ".height", 1);
      if (asset.state !== "available" && asset.state !== "missing") fail("INVALID_ASSET_STATE", path + ".state", "Asset 狀態只能是 available 或 missing。");
      if (asset.thumbnail === null) {
        // Missing and original-only assets may have no derived thumbnail yet.
      } else {
        record(asset.thumbnail, path + ".thumbnail");
        if (!/^image\/(jpeg|png|webp)$/.test(asset.thumbnail.mime)) fail("INVALID_THUMBNAIL_MIME", path + ".thumbnail.mime", "縮圖格式無效。");
        integer(asset.thumbnail.byteLength, path + ".thumbnail.byteLength", 0);
        integer(asset.thumbnail.width, path + ".thumbnail.width", 1);
        integer(asset.thumbnail.height, path + ".thumbnail.height", 1);
        integer(asset.thumbnail.version, path + ".thumbnail.version", 1);
      }
      assetById.set(asset.id, asset);
    });
    const photoHashes = new Set();
    assets.forEach(function (asset) {
      if (asset.role !== "photoOriginal") return;
      if (photoHashes.has(asset.sha256)) fail("DUPLICATE_ASSET_HASH", rootPath + ".assets", "同一 Project 的原圖相同時應共用單一 Asset 記錄。");
      photoHashes.add(asset.sha256);
    });

    const drawingById = new Map();
    drawings.forEach(function (drawing, index) {
      const path = rootPath + ".drawings[" + index + "]";
      record(drawing, path);
      if (drawing.projectId !== projectId) fail("CROSS_PROJECT_RECORD", path + ".projectId", "Drawing 必須屬於此 Project。");
      addUniqueId(seenIds, drawing.id, path + ".id");
      if (drawing.schemaVersion !== LEGACY_DRAWING_SCHEMA_VERSION && drawing.schemaVersion !== DRAWING_SCHEMA_VERSION) {
        fail("UNSUPPORTED_DRAWING_SCHEMA", path + ".schemaVersion", "Drawing schemaVersion 不受支援。");
      }
      integer(drawing.revision, path + ".revision", 0);
      if (!shotById.has(drawing.shotId)) fail("ORPHAN_SHOT_REFERENCE", path + ".shotId", "Drawing 引用了不存在的 Shot。");
      const canvas = record(drawing.canvas, path + ".canvas");
      if (!ASPECT_RATIOS.includes(canvas.aspectRatio)) fail("INVALID_ASPECT_RATIO", path + ".canvas.aspectRatio", "Drawing 畫幅無效。");
      integer(canvas.width, path + ".canvas.width", 1);
      integer(canvas.height, path + ".canvas.height", 1);
      if (drawing.backgroundAssetId !== null) {
        if (!assetById.has(drawing.backgroundAssetId)) fail("ORPHAN_ASSET_REFERENCE", path + ".backgroundAssetId", "Drawing 背景引用了不存在的照片 Asset。");
        if (assetById.get(drawing.backgroundAssetId).role !== "photoOriginal") {
          fail("INVALID_BACKGROUND_ASSET", path + ".backgroundAssetId", "Drawing 背景只能引用不可變 photoOriginal Asset。");
        }
      }
      if (drawing.schemaVersion === LEGACY_DRAWING_SCHEMA_VERSION) {
        if (Object.prototype.hasOwnProperty.call(drawing, "backgroundCrop")) {
          fail("UNSUPPORTED_DRAWING_SCHEMA", path + ".backgroundCrop", "Drawing v1 不支援 backgroundCrop；請以 Drawing v2 保存固定底圖裁切。");
        }
      } else {
        if (!Object.prototype.hasOwnProperty.call(drawing, "backgroundCrop")) {
          fail("INVALID_DRAWING_BACKGROUND_CROP", path + ".backgroundCrop", "Drawing v2 必須明確保存 backgroundCrop；完整原圖請使用 null。");
        }
        if (drawing.backgroundCrop !== null) {
          if (drawing.backgroundAssetId === null) {
            fail("INVALID_DRAWING_BACKGROUND_CROP", path + ".backgroundCrop", "沒有照片底圖時 backgroundCrop 必須是 null。");
          }
          drawing.backgroundCrop = validatePhotoCrop(drawing.backgroundCrop, path + ".backgroundCrop");
        }
      }
      if (drawing.previewAssetId !== null && !assetById.has(drawing.previewAssetId)) {
        fail("ORPHAN_ASSET_REFERENCE", path + ".previewAssetId", "Drawing 預覽引用了不存在的 Asset。");
      }
      if (drawing.previewAssetId !== null && assetById.get(drawing.previewAssetId).role !== "drawingPreview") {
        fail("INVALID_PREVIEW_ASSET", path + ".previewAssetId", "Drawing 預覽只能引用 drawingPreview Asset。");
      }
      if (drawing.previewDrawingRevision !== null && drawing.previewDrawingRevision > drawing.revision) {
        fail("INVALID_PREVIEW_REVISION", path + ".previewDrawingRevision", "預覽不能比 Drawing revision 更新。");
      }
      const layers = array(drawing.layers, path + ".layers");
      if (layers.length !== 2) fail("INVALID_DRAWING_LAYERS", path + ".layers", "Drawing 必須恰有 scene 與 subject 兩層。");
      const layerKinds = new Set();
      const layerOrders = new Set();
      layers.forEach(function (layer, layerIndex) {
        const layerPath = path + ".layers[" + layerIndex + "]";
        record(layer, layerPath);
        if (layer.projectId !== projectId || layer.drawingId !== drawing.id) fail("CROSS_PROJECT_RECORD", layerPath, "Layer 必須屬於同一 Project 與 Drawing。");
        addUniqueId(seenIds, layer.id, layerPath + ".id");
        if (layer.kind !== "scene" && layer.kind !== "subject") fail("INVALID_LAYER_KIND", layerPath + ".kind", "可編輯 Layer kind 只能是 scene 或 subject。");
        if (layerKinds.has(layer.kind)) fail("DUPLICATE_LAYER_KIND", layerPath + ".kind", "Drawing 的 scene 與 subject layer 各只能一層。");
        layerKinds.add(layer.kind);
        if (typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean") fail("INVALID_LAYER_FLAGS", layerPath, "Layer visible/locked 必須是布林值。");
        finiteNonnegative(layer.opacity, layerPath + ".opacity");
        if (layer.opacity > 1) fail("INVALID_LAYER_OPACITY", layerPath + ".opacity", "Layer opacity 必須介於 0–1。");
        integer(layer.order, layerPath + ".order", 0);
        if (layerOrders.has(layer.order)) fail("DUPLICATE_LAYER_ORDER", layerPath + ".order", "Layer 順序不可重複。");
        layerOrders.add(layer.order);
        const strokes = array(layer.strokes, layerPath + ".strokes");
        strokes.forEach(function (stroke, strokeIndex) {
          const strokePath = layerPath + ".strokes[" + strokeIndex + "]";
          record(stroke, strokePath);
          addUniqueId(seenIds, stroke.id, strokePath + ".id");
          if (stroke.kind !== "pen" && stroke.kind !== "cameraArrow") fail("INVALID_STROKE_KIND", strokePath + ".kind", "筆跡種類只能是 pen 或 cameraArrow。");
          text(stroke.color, strokePath + ".color", false);
          finiteNonnegative(stroke.baseWidth, strokePath + ".baseWidth");
          if (stroke.baseWidth === 0) fail("INVALID_STROKE_WIDTH", strokePath + ".baseWidth", "筆跡線寬必須大於 0。");
          const points = array(stroke.points, strokePath + ".points");
          if (points.length < 2) fail("INVALID_STROKE_POINTS", strokePath + ".points", "筆跡至少需要兩個點。");
          if (stroke.kind === "cameraArrow" && points.length !== 2) fail("INVALID_CAMERA_ARROW", strokePath + ".points", "兩點運鏡箭頭必須恰有起點與終點。");
          let lastTime = -1;
          points.forEach(function (point, pointIndex) {
            const pointPath = strokePath + ".points[" + pointIndex + "]";
            record(point, pointPath);
            finiteNonnegative(point.x, pointPath + ".x");
            finiteNonnegative(point.y, pointPath + ".y");
            if (point.x > 1 || point.y > 1) fail("INVALID_STROKE_COORDINATE", pointPath, "筆跡座標必須正規化至 0–1。");
            finiteNonnegative(point.t, pointPath + ".t");
            if (point.t < lastTime) fail("INVALID_STROKE_TIME", pointPath + ".t", "筆跡時間必須依序增加。");
            lastTime = point.t;
            if (point.pressure !== null && point.pressure !== undefined) {
              finiteNonnegative(point.pressure, pointPath + ".pressure");
              if (point.pressure > 1) fail("INVALID_PRESSURE", pointPath + ".pressure", "pressure 必須介於 0–1。");
            }
            ["tiltX", "tiltY"].forEach(function (axis) {
              if (point[axis] !== null && point[axis] !== undefined && (typeof point[axis] !== "number" || !Number.isFinite(point[axis]))) {
                fail("INVALID_TILT", pointPath + "." + axis, "筆傾角必須是有限數值或 null。");
              }
            });
          });
        });
      });
      if (!layerKinds.has("scene") || !layerKinds.has("subject")) fail("INVALID_DRAWING_LAYERS", path + ".layers", "Drawing 必須同時有 scene 與 subject layer。");
      if (layerOrders.size !== 2 || !layerOrders.has(0) || !layerOrders.has(1)) fail("INVALID_DRAWING_LAYER_ORDER", path + ".layers", "scene/subject layer order 必須是 0 與 1。");
      drawingById.set(drawing.id, drawing);
    });

    const entriesByDay = new Map();
    const scheduledShots = new Set();
    entries.forEach(function (entry, index) {
      const path = rootPath + ".scheduleEntries[" + index + "]";
      record(entry, path);
      if (entry.projectId !== projectId) fail("CROSS_PROJECT_RECORD", path + ".projectId", "ScheduleEntry 必須屬於此 Project。");
      addUniqueId(seenIds, entry.id, path + ".id");
      if (!dayById.has(entry.dayId)) fail("ORPHAN_DAY_REFERENCE", path + ".dayId", "ScheduleEntry 引用了不存在的 ShootingDay。");
      if (!ENTRY_TYPES.includes(entry.type)) fail("INVALID_ENTRY_TYPE", path + ".type", "MVP 只支援 shot 與 break 排程項目。");
      text(entry.title, path + ".title", true);
      text(entry.notes, path + ".notes", true);
      integer(entry.minutes, path + ".minutes", 0);
      if (!ENTRY_STATUSES.includes(entry.status)) fail("INVALID_ENTRY_STATUS", path + ".status", "拍攝狀態無效。");
      if (entry.timingMode !== "auto" && entry.timingMode !== "fixed") fail("INVALID_TIMING_MODE", path + ".timingMode", "時間模式只能是 auto 或 fixed。");
      if (entry.startTime !== null) clockMinutes(entry.startTime, path + ".startTime");
      if (entry.endTime !== null) clockMinutes(entry.endTime, path + ".endTime");
      if (Object.prototype.hasOwnProperty.call(entry, "startNextDay") && typeof entry.startNextDay !== "boolean") {
        fail("INVALID_START_NEXT_DAY", path + ".startNextDay", "startNextDay 必須是布林值。");
      }
      if (typeof entry.endNextDay !== "boolean") fail("INVALID_END_NEXT_DAY", path + ".endNextDay", "endNextDay 必須是布林值。");
      if (entry.timingMode === "fixed") {
        if (entry.startTime === null || entry.endTime === null) fail("MISSING_FIXED_TIME", path, "固定時段需要開始與結束時間。");
        const elapsed = clockMinutes(entry.endTime, path + ".endTime") + (entry.endNextDay ? 1440 : 0) - clockMinutes(entry.startTime, path + ".startTime");
        if (elapsed <= 0 || entry.minutes !== elapsed) fail("INVALID_FIXED_DURATION", path + ".minutes", "固定時段分鐘數必須與起迄時間一致，跨日需明確標記。");
      }
      if (entry.type === "shot") {
        if (typeof entry.shotId !== "string" || !shotById.has(entry.shotId)) fail("ORPHAN_SHOT_REFERENCE", path + ".shotId", "shot 排程引用了不存在的 Shot。");
        if (scheduledShots.has(entry.shotId)) fail("DUPLICATE_SHOT_SCHEDULE", path + ".shotId", "一個 Shot 在 MVP 只能有一筆排程。");
        scheduledShots.add(entry.shotId);
      } else if (entry.shotId !== null) {
        fail("BREAK_HAS_SHOT", path + ".shotId", "break 排程不可引用 Shot。");
      }
      if (!entriesByDay.has(entry.dayId)) entriesByDay.set(entry.dayId, []);
      entriesByDay.get(entry.dayId).push(entry.id);
    });

    record(project.scheduleOrderByDay, rootPath + ".scheduleOrderByDay");
    const scheduleKeys = Object.keys(project.scheduleOrderByDay);
    if (scheduleKeys.length !== shootingDays.length || shootingDays.some(function (day) { return !Object.prototype.hasOwnProperty.call(project.scheduleOrderByDay, day.id); })) {
      fail("ORDER_GROUP_MISMATCH", rootPath + ".scheduleOrderByDay", "每個 ShootingDay 必須且只能有一組 ScheduleEntry 排序清單。");
    }
    shootingDays.forEach(function (day) {
      sameMembers(project.scheduleOrderByDay[day.id], entriesByDay.get(day.id) || [], rootPath + ".scheduleOrderByDay." + day.id);
    });

    shots.forEach(function (shot) {
      shot.assetIds.forEach(function (assetId) {
        if (!assetById.has(assetId)) fail("ORPHAN_ASSET_REFERENCE", rootPath + ".shots." + shot.id + ".assetIds", "Shot 引用了不存在的 Asset。");
      });
      Object.keys(shot.photoCropsByAssetId || {}).forEach(function (assetId) {
        if (assetById.get(assetId).role !== "photoOriginal") {
          fail("INVALID_PHOTO_CROP_ASSET", rootPath + ".shots." + shot.id + ".photoCropsByAssetId." + assetId, "裁切只能套用於不可變 photoOriginal Asset。");
        }
      });
      shot.drawingIds.forEach(function (drawingId) {
        if (!drawingById.has(drawingId)) fail("ORPHAN_DRAWING_REFERENCE", rootPath + ".shots." + shot.id + ".drawingIds", "Shot 引用了不存在的 Drawing。");
        if (drawingById.get(drawingId).shotId !== shot.id) fail("DRAWING_OWNER_MISMATCH", rootPath + ".shots." + shot.id + ".drawingIds", "Drawing 必須屬於引用它的 Shot。");
      });
    });
    drawings.forEach(function (drawing) {
      const owner = shotById.get(drawing.shotId);
      if (!owner || owner.drawingIds.indexOf(drawing.id) < 0) {
        fail("DRAWING_OWNER_MISMATCH", rootPath + ".drawings." + drawing.id, "Drawing 必須同時由所屬 Shot 引用。");
      }
    });

    validateOutputPreferences(
      project.outputPreferences,
      rootPath + ".outputPreferences",
      new Set(shootingDays.map(function (day) { return day.id; }))
    );
    return project;
  }

  return Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    DRAWING_SCHEMA_VERSION: DRAWING_SCHEMA_VERSION,
    LEGACY_DRAWING_SCHEMA_VERSION: LEGACY_DRAWING_SCHEMA_VERSION,
    PREFERENCE_SCHEMA_VERSION: PREFERENCE_SCHEMA_VERSION,
    LEGACY_PREFERENCE_SCHEMA_VERSION: LEGACY_PREFERENCE_SCHEMA_VERSION,
    ASPECT_RATIOS: ASPECT_RATIOS,
    ENTRY_STATUSES: ENTRY_STATUSES,
    ENTRY_TYPES: ENTRY_TYPES,
    OUTPUT_FIELDS: OUTPUT_FIELDS,
    IMAGE_OUTPUT_FIELDS: IMAGE_OUTPUT_FIELDS,
    SCHEDULE_BOOLEAN_FIELDS: SCHEDULE_BOOLEAN_FIELDS,
    ProjectValidationError: ProjectValidationError,
    validateProject: validateProject,
    validatePhotoCrop: validatePhotoCrop,
    isRecord: isRecord,
    cloneJson: cloneJson
  });
});
