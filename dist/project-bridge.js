(function attachStoryProjectBridge(root, factory) {
  "use strict";
  const ProjectSchema = typeof module === "object" && module && module.exports
    ? require("./project-schema.js")
    : root.DirectorStoryboardProjectSchema;
  const api = factory(ProjectSchema);
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.StoryProjectBridge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createStoryProjectBridge(ProjectSchema) {
  "use strict";

  if (!ProjectSchema || typeof ProjectSchema.validateProject !== "function") {
    throw new Error("DirectorStoryboardProjectSchema must load before StoryProjectBridge.");
  }

  const own = function (value, key) { return Object.prototype.hasOwnProperty.call(value, key); };
  // New drawings have a fixed canonical pixel grid. Existing drawings keep
  // their saved canvas dimensions and stroke widths without reinterpretation.
  const DRAWING_CANVAS_SIZES = Object.freeze({
    "1:1": Object.freeze({ width: 1920, height: 1920 }),
    "4:3": Object.freeze({ width: 1920, height: 1440 }),
    "16:9": Object.freeze({ width: 1920, height: 1080 }),
    "2.35:1": Object.freeze({ width: 2350, height: 1000 })
  });

  class BridgeError extends Error {
    constructor(code, message, path) {
      super(message);
      this.name = "StoryProjectBridgeError";
      this.code = code;
      this.path = path || "$";
    }
  }

  function fail(code, message, path) {
    throw new BridgeError(code, message, path);
  }

  function clone(value) {
    return ProjectSchema.cloneJson(value);
  }

  function isRecord(value) {
    return ProjectSchema.isRecord(value);
  }

  function record(value, path) {
    if (!isRecord(value)) fail("INVALID_ARGUMENT", path + " 必須是物件。", path);
    return value;
  }

  function text(value, path, allowEmpty) {
    if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
      fail("INVALID_ARGUMENT", path + (allowEmpty ? " 必須是文字。" : " 不可空白。"), path);
    }
    return value;
  }

  function shotSuperValue(shot, path) {
    if (own(shot, "super")) return text(shot.super, path + ".super", true);
    // Accept the legacy alias before migration. Keep it on the cloned record.
    if (own(shot, "superText")) return text(shot.superText, path + ".superText", true);
    return "";
  }

  function nonnegativeInteger(value, path) {
    if (!Number.isInteger(value) || value < 0) fail("INVALID_ARGUMENT", path + " 必須是大於或等於 0 的整數。", path);
    return value;
  }

  function assertArgs(type, args, min, max) {
    if (!Array.isArray(args)) fail("INVALID_ARGUMENT", "args 必須是公開 Model 方法的參數陣列。", "$.args");
    if (args.length < min || args.length > max) {
      fail("INVALID_ARGUMENT", type + " 的參數數量不正確。", "$.args");
    }
  }

  function assertPatch(patch, allowed, label, path) {
    record(patch, path);
    Object.keys(patch).forEach(function (key) {
      if (allowed.indexOf(key) < 0) fail("UNSUPPORTED_FIELD", label + "不支援修改欄位：" + key, path + "." + key);
    });
    return patch;
  }

  function sameJson(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  const IMAGE_OUTPUT_DEFAULTS = Object.freeze({
    shotNumber: false,
    title: false,
    voiceover: false,
    super: false,
    duration: false
  });
  const DETAIL_OUTPUT_DEFAULTS = Object.freeze({
    visual: true,
    script: true,
    super: false,
    sound: true,
    move: true,
    duration: true
  });
  const SCHEDULE_BOOLEAN_DEFAULTS = Object.freeze({
    rundownThumbnails: false,
    rundownNotes: false,
    rundownStatus: false,
    storyboardShotNumber: false,
    storyboardTitle: false
  });

  function makeDefaultOutputPreferences() {
    const details = Object.assign({}, DETAIL_OUTPUT_DEFAULTS);
    const fields = {
      images: Object.assign({}, IMAGE_OUTPUT_DEFAULTS),
      details: details
    };
    // Flat aliases let older renderers continue reading detail preferences
    // while the v2 UI uses fields.details as its canonical group. The old
    // renderer defaulted SUPER on; preserve that alias without enabling it in
    // the v2 details group.
    ProjectSchema.OUTPUT_FIELDS.forEach(function (name) { fields[name] = details[name]; });
    fields.super = true;
    return {
      schemaVersion: ProjectSchema.PREFERENCE_SCHEMA_VERSION,
      revision: 0,
      mode: "details",
      orientation: "auto",
      density: 4,
      densityByMode: { images: 4, details: 4 },
      fields: fields,
      schedule: Object.assign({ dayScope: "selected", selectedDayId: null, showEstimatedWrap: false }, SCHEDULE_BOOLEAN_DEFAULTS)
    };
  }

  function upgradeOutputPreferences(source) {
    const next = clone(source);
    const isGrouped = next.schemaVersion === ProjectSchema.PREFERENCE_SCHEMA_VERSION &&
      isRecord(next.fields) && isRecord(next.fields.images) && isRecord(next.fields.details);
    if (isGrouped) {
      next.densityByMode = Object.assign({ images: next.density, details: next.density }, next.densityByMode || {});
      next.schedule = Object.assign({ dayScope: "selected", selectedDayId: null, showEstimatedWrap: false }, SCHEDULE_BOOLEAN_DEFAULTS, next.schedule || {});
      return next;
    }
    if (next.schemaVersion === ProjectSchema.PREFERENCE_SCHEMA_VERSION) {
      // Tolerate v2 callers still using the pre-v2 flat shape. This path is
      // only for compatibility; newly created Projects use grouped fields.
      next.densityByMode = Object.assign({ images: next.density, details: next.density }, next.densityByMode || {});
      next.schedule = Object.assign({ dayScope: "selected", selectedDayId: null, showEstimatedWrap: false }, SCHEDULE_BOOLEAN_DEFAULTS, next.schedule || {});
      return next;
    }

    const previousFields = isRecord(next.fields) ? next.fields : {};
    const details = Object.assign({}, DETAIL_OUTPUT_DEFAULTS);
    ProjectSchema.OUTPUT_FIELDS.forEach(function (name) {
      if (typeof previousFields[name] === "boolean") details[name] = previousFields[name];
    });
    const fields = {};
    Object.keys(previousFields).forEach(function (name) {
      if (ProjectSchema.OUTPUT_FIELDS.indexOf(name) < 0) fields[name] = clone(previousFields[name]);
    });
    fields.images = Object.assign({}, IMAGE_OUTPUT_DEFAULTS);
    fields.details = details;
    ProjectSchema.OUTPUT_FIELDS.forEach(function (name) { fields[name] = details[name]; });
    next.schemaVersion = ProjectSchema.PREFERENCE_SCHEMA_VERSION;
    next.densityByMode = { images: next.density, details: next.density };
    next.fields = fields;
    next.schedule = Object.assign({ dayScope: "selected", selectedDayId: null, showEstimatedWrap: false }, SCHEDULE_BOOLEAN_DEFAULTS);
    return next;
  }

  function mergeOutputFieldPatch(targetFields, fieldPatch) {
    record(fieldPatch, "$.args[0].fields");
    const updatedDetails = new Set();
    Object.keys(fieldPatch).forEach(function (groupOrName) {
      if (groupOrName === "images" || groupOrName === "details") {
        const names = groupOrName === "images" ? ProjectSchema.IMAGE_OUTPUT_FIELDS : ProjectSchema.OUTPUT_FIELDS;
        const patch = assertPatch(fieldPatch[groupOrName], names, "輸出偏好欄位", "$.args[0].fields." + groupOrName);
        Object.keys(patch).forEach(function (name) {
          if (typeof patch[name] !== "boolean") fail("INVALID_OUTPUT_FIELD", "輸出欄位必須是布林值。", "$.args[0].fields." + groupOrName + "." + name);
          targetFields[groupOrName][name] = patch[name];
          if (groupOrName === "details") updatedDetails.add(name);
        });
        return;
      }
      if (ProjectSchema.OUTPUT_FIELDS.indexOf(groupOrName) < 0) {
        fail("UNSUPPORTED_FIELD", "輸出偏好欄位不支援修改欄位：" + groupOrName, "$.args[0].fields." + groupOrName);
      }
      if (typeof fieldPatch[groupOrName] !== "boolean") {
        fail("INVALID_OUTPUT_FIELD", "輸出欄位必須是布林值。", "$.args[0].fields." + groupOrName);
      }
      targetFields.details[groupOrName] = fieldPatch[groupOrName];
      updatedDetails.add(groupOrName);
    });
    updatedDetails.forEach(function (name) { targetFields[name] = targetFields.details[name]; });
  }

  function mergeDensityByMode(target, value) {
    const patch = assertPatch(value, ["images", "details"], "每種模式的輸出密度", "$.args[0].densityByMode");
    Object.keys(patch).forEach(function (mode) {
      if (!Number.isInteger(patch[mode]) || patch[mode] < 1 || patch[mode] > 12) {
        fail("INVALID_DENSITY", "每頁密度必須介於 1–12。", "$.args[0].densityByMode." + mode);
      }
      target[mode] = patch[mode];
    });
  }

  function projectAndValidate(project) {
    try {
      return ProjectSchema.validateProject(project);
    } catch (error) {
      if (error && typeof error.code === "string") throw error;
      fail("INVALID_PROJECT", error && error.message ? error.message : "Project 驗證失敗。");
    }
  }

  function findById(collection, id, code, label) {
    const found = collection.find(function (item) { return item.id === id; });
    if (!found) fail(code, label + "不存在。");
    return found;
  }

  function orderedIdsForScene(project, sceneId) {
    const order = project.shotOrderByScene[sceneId];
    if (!order) fail("SCENE_NOT_FOUND", "場次不存在。");
    return order;
  }

  function orderedIdsForDay(project, dayId) {
    const order = project.scheduleOrderByDay[dayId];
    if (!order) fail("DAY_NOT_FOUND", "拍攝日不存在。");
    return order;
  }

  function validateExactOrder(project, orderedIds, currentIds, records, groupKey, groupId, path) {
    if (!Array.isArray(orderedIds)) fail("INVALID_ORDER", path + " 必須是 ID 陣列。", path);

    const expected = new Set(currentIds);
    const seen = new Set();
    orderedIds.forEach(function (id, index) {
      const itemPath = path + "[" + index + "]";
      text(id, itemPath, false);
      if (seen.has(id)) fail("DUPLICATE_ORDER_ID", "排序清單不可重複包含相同 ID。", itemPath);
      seen.add(id);

      const record = records.find(function (item) { return item.id === id; });
      if (!record) {
        fail("ORDER_MEMBERSHIP_MISMATCH", "排序清單必須完整且只包含此群組現有的資料。", itemPath);
      }
      if (record.projectId !== project.projectId) {
        fail("CROSS_PROJECT_RECORD", "排序項目必須屬於目前 Project。", itemPath);
      }
      if (record[groupKey] !== groupId) {
        fail("ORDER_GROUP_MISMATCH", "排序項目不可跨場次或拍攝日。", itemPath);
      }
      if (!expected.has(id)) {
        fail("ORDER_MEMBERSHIP_MISMATCH", "排序清單必須完整且只包含此群組現有的資料。", itemPath);
      }
    });

    if (seen.size !== expected.size) {
      fail("ORDER_MEMBERSHIP_MISMATCH", "排序清單不可遺漏此群組的資料。", path);
    }
    return orderedIds.slice();
  }

  function shotNumberCandidate(project, sceneId, shotPosition) {
    const scenePosition = project.sceneOrder.indexOf(sceneId);
    if (scenePosition < 0) fail("SCENE_NOT_FOUND", "場次不存在。");
    return String(scenePosition + 1).padStart(2, "0") + "-" + String(shotPosition).padStart(3, "0");
  }

  function uniqueShotNumber(project, sceneId, startingPosition, excludedShotId) {
    const used = new Set(project.shots
      .filter(function (shot) { return shot.sceneId === sceneId && shot.id !== excludedShotId; })
      .map(function (shot) { return shot.shotNo; }));
    let position = Math.max(1, startingPosition);
    let candidate = shotNumberCandidate(project, sceneId, position);
    while (used.has(candidate)) {
      position += 1;
      candidate = shotNumberCandidate(project, sceneId, position);
    }
    return candidate;
  }

  function hasShotNumberCollision(project, shot, sceneId) {
    return project.shots.some(function (other) {
      return other.id !== shot.id && other.sceneId === sceneId && other.shotNo === shot.shotNo;
    });
  }

  function resolveShotNumbers(projectInput) {
    const project = projectAndValidate(projectInput);
    const shotsById = new Map(project.shots.map(function (shot) { return [shot.id, shot]; }));
    const numberEntries = [];
    const conflicts = [];

    project.sceneOrder.forEach(function (sceneId) {
      const orderedIds = project.shotOrderByScene[sceneId];
      const lockedByNumber = new Map();
      orderedIds.forEach(function (shotId) {
        const shot = shotsById.get(shotId);
        if (shot.shotNoLocked !== true) return;
        const ids = lockedByNumber.get(shot.shotNo) || [];
        ids.push(shot.id);
        lockedByNumber.set(shot.shotNo, ids);
      });

      lockedByNumber.forEach(function (shotIds, shotNo) {
        if (shotIds.length > 1) {
          conflicts.push({
            code: "LOCKED_SHOT_NUMBER_COLLISION",
            sceneId: sceneId,
            shotNo: shotNo,
            shotIds: shotIds.slice()
          });
        }
      });

      const used = new Set(lockedByNumber.keys());
      let nextNumber = 1;
      orderedIds.forEach(function (shotId) {
        const shot = shotsById.get(shotId);
        if (shot.shotNoLocked === true) {
          numberEntries.push([shot.id, shot.shotNo]);
          return;
        }
        while (used.has(String(nextNumber))) nextNumber += 1;
        const shotNo = String(nextNumber);
        numberEntries.push([shot.id, shotNo]);
        used.add(shotNo);
        nextNumber += 1;
      });
    });

    const shotNumbers = {};
    numberEntries.forEach(function (entry) {
      Object.defineProperty(shotNumbers, entry[0], {
        value: entry[1], enumerable: true, configurable: true, writable: true
      });
    });
    return { shotNumbers: shotNumbers, conflicts: conflicts };
  }

  function previewShotRenumber(projectInput, sceneId) {
    const project = projectAndValidate(projectInput);
    findById(project.scenes, sceneId, "SCENE_NOT_FOUND", "場次");
    const resolved = resolveShotNumbers(project);
    const shotById = new Map(project.shots.map(function (shot) { return [shot.id, shot]; }));
    const assignments = project.shotOrderByScene[sceneId]
      .map(function (shotId) { return shotById.get(shotId); })
      .filter(function (shot) { return shot.shotNoLocked !== true; })
      .map(function (shot) {
        return { shotId: shot.id, expectedShotNo: shot.shotNo, shotNo: resolved.shotNumbers[shot.id] };
      });
    return {
      sceneId: sceneId,
      baseRevision: project.revision,
      assignments: assignments,
      conflicts: resolved.conflicts.filter(function (conflict) { return conflict.sceneId === sceneId; })
    };
  }

  function hasLockedShotNumberCollision(project, shot, sceneId) {
    return project.shots.some(function (other) {
      return other.id !== shot.id && other.sceneId === sceneId && other.shotNoLocked === true &&
        other.shotNo === shot.shotNo;
    });
  }

  function allEntityIds(project) {
    const ids = new Set();
    function add(id) { if (typeof id === "string") ids.add(id); }
    project.scenes.forEach(function (item) { add(item.id); });
    project.shots.forEach(function (item) { add(item.id); });
    project.shootingDays.forEach(function (item) { add(item.id); });
    project.scheduleEntries.forEach(function (item) { add(item.id); });
    (project.productionTasks || []).forEach(function (item) { add(item.id); });
    project.assets.forEach(function (item) { add(item.id); });
    project.drawings.forEach(function (drawing) {
      add(drawing.id);
      drawing.layers.forEach(function (layer) {
        add(layer.id);
        layer.strokes.forEach(function (stroke) { add(stroke.id); });
      });
    });
    return ids;
  }

  function idFactory(project, newId) {
    if (typeof newId !== "function") fail("MISSING_ID_FACTORY", "需要由 Model 注入 newId(kind)。");
    const used = allEntityIds(project);
    return function allocate(kind) {
      let value;
      try {
        value = newId(kind);
      } catch (error) {
        fail("ID_GENERATION_FAILED", error && error.message ? error.message : "無法產生資料 ID。");
      }
      if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 200) {
        fail("INVALID_GENERATED_ID", "newId(kind) 必須回傳長度 1–200 的穩定 ID。");
      }
      if (used.has(value)) fail("DUPLICATE_ID", "newId(kind) 回傳了已使用的 ID：" + value);
      used.add(value);
      return value;
    };
  }

  function makeResult(original, draft, value, undoable) {
    const changed = !sameJson(original, draft);
    return {
      project: changed ? projectAndValidate(draft) : clone(original),
      value: value,
      changed: changed,
      undoable: undoable !== false
    };
  }

  // WP-05 photo commands operate only on prepared canonical metadata. File / Blob
  // validation, byte hashing, persistence, and atomic transactions belong to
  // Model and Repository; this bridge never receives or stores photo bytes.
  function validatePreparedPhotoMetadata(project, metadata, path) {
    record(metadata, path);
    const forbiddenByteFields = new Set([
      "blob", "originalblob", "thumbnailblob", "bytes", "originalbytes", "thumbnailbytes",
      "dataurl", "objecturl"
    ]);
    Object.keys(metadata).forEach(function (key) {
      if (forbiddenByteFields.has(key.toLowerCase())) {
        fail("PHOTO_BYTES_NOT_ALLOWED", "純資料 bridge 只能接收 Asset metadata，不可接收照片 bytes。", path + "." + key);
      }
    });

    if (metadata.projectId !== project.projectId) {
      fail("CROSS_PROJECT_RECORD", "照片 Asset 必須屬於目前 Project。", path + ".projectId");
    }
    if (typeof metadata.id !== "string" || !metadata.id.trim() || metadata.id !== metadata.id.trim() || metadata.id.length > 200) {
      fail("INVALID_PHOTO_METADATA", "照片 Asset 必須有長度 1–200 的穩定 ID。", path + ".id");
    }
    if (metadata.role !== "photoOriginal") {
      fail("INVALID_ASSET_ROLE", "Shot 照片只能引用 photoOriginal Asset。", path + ".role");
    }
    if (typeof metadata.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(metadata.sha256)) {
      fail("INVALID_ASSET_HASH", "照片 Asset 必須有小寫 SHA-256。", path + ".sha256");
    }
    if (["image/jpeg", "image/png", "image/webp"].indexOf(metadata.mime) < 0) {
      fail("INVALID_ASSET_MIME", "目前照片匯入只接受 JPEG、PNG 與 WebP。", path + ".mime");
    }
    if (typeof metadata.originalName !== "string" || !metadata.originalName.trim() || /[\\/]/.test(metadata.originalName)) {
      fail("INVALID_PHOTO_METADATA", "照片檔名必須是非空 basename，不可包含裝置路徑。", path + ".originalName");
    }
    if (!Number.isSafeInteger(metadata.byteLength) || metadata.byteLength <= 0 ||
        !Number.isSafeInteger(metadata.width) || metadata.width <= 0 ||
        !Number.isSafeInteger(metadata.height) || metadata.height <= 0) {
      fail("INVALID_PHOTO_METADATA", "照片原圖 bytes 與尺寸必須是正整數。", path);
    }
    if (metadata.state !== "available") {
      fail("INVALID_ASSET_STATE", "新匯入照片必須先完成驗證並標記 available。", path + ".state");
    }
    if (metadata.thumbnail !== null) {
      const thumbnail = record(metadata.thumbnail, path + ".thumbnail");
      if (["image/jpeg", "image/png", "image/webp"].indexOf(thumbnail.mime) < 0 ||
          !Number.isSafeInteger(thumbnail.byteLength) || thumbnail.byteLength <= 0 ||
          !Number.isSafeInteger(thumbnail.width) || thumbnail.width <= 0 ||
          !Number.isSafeInteger(thumbnail.height) || thumbnail.height <= 0 ||
          !Number.isSafeInteger(thumbnail.version) || thumbnail.version <= 0) {
        fail("INVALID_THUMBNAIL_METADATA", "照片縮圖 metadata 無效。", path + ".thumbnail");
      }
    }
    return clone(metadata);
  }

  function assertShotHasPhotoOnlyReferences(project, shot) {
    const seen = new Set();
    shot.assetIds.forEach(function (assetId) {
      if (seen.has(assetId)) {
        fail("DUPLICATE_SHOT_ASSET_REFERENCE", "同一 Shot 不可重複引用相同照片 Asset。", "$.shots." + shot.id + ".assetIds");
      }
      seen.add(assetId);
      const asset = project.assets.find(function (item) { return item.id === assetId; });
      if (!asset || asset.role !== "photoOriginal") {
        fail("INVALID_SHOT_PHOTO_ASSET", "Shot 的照片清單只能引用 photoOriginal Asset。", "$.shots." + shot.id + ".assetIds");
      }
    });
  }

  function findPhotoByHash(project, sha256) {
    return project.assets.find(function (asset) {
      return asset.role === "photoOriginal" && asset.sha256 === sha256;
    }) || null;
  }

  function clearShotPhotoCrop(shot, assetId) {
    const crops = shot.photoCropsByAssetId;
    if (!isRecord(crops) || !own(crops, assetId)) return false;
    delete crops[assetId];
    if (Object.keys(crops).length === 0) delete shot.photoCropsByAssetId;
    return true;
  }

  function applyAddShotPhotos(project, args) {
    assertArgs("addShotPhotos", args, 2, 2);
    const shotId = text(args[0], "$.args[0]", false);
    const shot = findById(project.shots, shotId, "SHOT_NOT_FOUND", "分鏡");
    assertShotHasPhotoOnlyReferences(project, shot);
    if (!Array.isArray(args[1])) fail("INVALID_ARGUMENT", "照片 metadata 必須是陣列。", "$.args[1]");

    const addedAssetIds = [];
    const duplicateAssetIds = [];
    const addedSet = new Set();
    const duplicateSet = new Set();
    const usedIds = allEntityIds(project);

    args[1].forEach(function (input, index) {
      const metadata = validatePreparedPhotoMetadata(project, input, "$.args[1][" + index + "]");
      let asset = findPhotoByHash(project, metadata.sha256);
      if (asset) {
        if (asset.state !== "available") {
          fail("ASSET_MISSING", "相同原圖的既有 Asset 尚未確認可讀，不能建立第二筆相同 hash。", "$.args[1][" + index + "]");
        }
        if (!duplicateSet.has(asset.id)) {
          duplicateAssetIds.push(asset.id);
          duplicateSet.add(asset.id);
        }
      } else {
        if (usedIds.has(metadata.id)) {
          fail("DUPLICATE_ID", "新照片 Asset ID 已被 Project 內其他資料使用：" + metadata.id, "$.args[1][" + index + "].id");
        }
        usedIds.add(metadata.id);
        project.assets.push(metadata);
        asset = metadata;
      }

      if (shot.assetIds.indexOf(asset.id) >= 0) {
        if (!duplicateSet.has(asset.id)) {
          duplicateAssetIds.push(asset.id);
          duplicateSet.add(asset.id);
        }
        return;
      }
      shot.assetIds.push(asset.id);
      if (!addedSet.has(asset.id)) {
        addedAssetIds.push(asset.id);
        addedSet.add(asset.id);
      }
    });

    return { addedAssetIds: addedAssetIds, duplicateAssetIds: duplicateAssetIds };
  }

  function applyReplaceShotPhoto(project, args) {
    assertArgs("replaceShotPhoto", args, 3, 3);
    const shotId = text(args[0], "$.args[0]", false);
    const previousAssetId = text(args[1], "$.args[1]", false);
    const shot = findById(project.shots, shotId, "SHOT_NOT_FOUND", "分鏡");
    assertShotHasPhotoOnlyReferences(project, shot);
    const previousIndex = shot.assetIds.indexOf(previousAssetId);
    if (previousIndex < 0) fail("SHOT_ASSET_NOT_FOUND", "此分鏡目前沒有要替換的照片。", "$.args[1]");
    const previousAsset = findById(project.assets, previousAssetId, "ASSET_NOT_FOUND", "照片 Asset");
    const metadata = validatePreparedPhotoMetadata(project, args[2], "$.args[2]");
    const matchingAsset = findPhotoByHash(project, metadata.sha256);

    if (matchingAsset && matchingAsset.state !== "available") {
      fail("ASSET_MISSING", "相同原圖的既有 Asset 尚未確認可讀，不能建立第二筆相同 hash。", "$.args[2]");
    }
    if (previousAsset.sha256 === metadata.sha256) {
      return { assetId: previousAsset.id, replacedAssetId: previousAsset.id, reused: true, noOp: true };
    }

    let replacementAsset;
    if (matchingAsset) {
      replacementAsset = matchingAsset;
    } else {
      const usedIds = allEntityIds(project);
      if (usedIds.has(metadata.id)) {
        fail("DUPLICATE_ID", "新照片 Asset ID 已被 Project 內其他資料使用：" + metadata.id, "$.args[2].id");
      }
      project.assets.push(metadata);
      replacementAsset = metadata;
    }

    const nextIds = shot.assetIds.slice();
    nextIds[previousIndex] = replacementAsset.id;
    shot.assetIds = nextIds.filter(function (assetId, index) { return nextIds.indexOf(assetId) === index; });
    if (replacementAsset.id !== previousAssetId) clearShotPhotoCrop(shot, previousAssetId);
    return {
      assetId: replacementAsset.id,
      replacedAssetId: previousAsset.id,
      reused: replacementAsset !== metadata,
      noOp: false
    };
  }

  function applyReorderShotPhotos(project, args) {
    assertArgs("reorderShotPhotos", args, 2, 2);
    const shotId = text(args[0], "$.args[0]", false);
    const shot = findById(project.shots, shotId, "SHOT_NOT_FOUND", "分鏡");
    assertShotHasPhotoOnlyReferences(project, shot);
    if (!Array.isArray(args[1])) fail("INVALID_SHOT_PHOTO_ORDER", "照片排序必須是完整的 Asset ID 陣列。", "$.args[1]");

    const currentIds = shot.assetIds.slice();
    const expected = new Set(currentIds);
    const seen = new Set();
    const orderedAssetIds = args[1].map(function (assetId, index) {
      const path = "$.args[1][" + index + "]";
      text(assetId, path, false);
      if (seen.has(assetId)) fail("INVALID_SHOT_PHOTO_ORDER", "照片排序不可重複包含相同 Asset ID。", path);
      seen.add(assetId);
      if (!expected.has(assetId)) fail("INVALID_SHOT_PHOTO_ORDER", "照片排序必須只包含此 Shot 目前引用的照片。", path);
      return assetId;
    });
    if (seen.size !== expected.size) {
      fail("INVALID_SHOT_PHOTO_ORDER", "照片排序必須完整包含此 Shot 目前引用的所有照片。", "$.args[1]");
    }

    const noOp = sameJson(currentIds, orderedAssetIds);
    if (!noOp) shot.assetIds = orderedAssetIds.slice();
    return { orderedAssetIds: orderedAssetIds, noOp: noOp };
  }

  function applyRemoveShotPhoto(project, args) {
    assertArgs("removeShotPhoto", args, 2, 2);
    const shotId = text(args[0], "$.args[0]", false);
    const assetId = text(args[1], "$.args[1]", false);
    const shot = findById(project.shots, shotId, "SHOT_NOT_FOUND", "分鏡");
    assertShotHasPhotoOnlyReferences(project, shot);

    const currentIds = shot.assetIds.slice();
    const index = currentIds.indexOf(assetId);
    if (index < 0) {
      return {
        assetId: assetId,
        removedAssetId: null,
        nextPrimaryAssetId: currentIds[0] || null,
        orderedAssetIds: currentIds,
        noOp: true
      };
    }

    const orderedAssetIds = currentIds.filter(function (candidate) { return candidate !== assetId; });
    shot.assetIds = orderedAssetIds;
    clearShotPhotoCrop(shot, assetId);
    return {
      assetId: assetId,
      removedAssetId: assetId,
      nextPrimaryAssetId: orderedAssetIds[0] || null,
      orderedAssetIds: orderedAssetIds.slice(),
      noOp: false
    };
  }

  function applySetShotPhotoCrop(project, args) {
    assertArgs("setShotPhotoCrop", args, 3, 3);
    const shotId = text(args[0], "$.args[0]", false);
    const assetId = text(args[1], "$.args[1]", false);
    const shot = findById(project.shots, shotId, "SHOT_NOT_FOUND", "分鏡");
    if (shot.assetIds.indexOf(assetId) < 0) {
      fail("SHOT_ASSET_NOT_FOUND", "此分鏡目前沒有引用這張照片。", "$.args[1]");
    }
    const asset = findById(project.assets, assetId, "ASSET_NOT_FOUND", "照片 Asset");
    if (asset.role !== "photoOriginal") {
      fail("INVALID_SHOT_PHOTO_ASSET", "裁切只能套用於不可變 photoOriginal Asset。", "$.args[1]");
    }
    const crop = args[2] === null ? null : ProjectSchema.validatePhotoCrop(args[2], "$.args[2]");
    const crops = shot.photoCropsByAssetId || {};
    const hasCurrentCrop = own(crops, assetId);
    if (crop === null) {
      if (!hasCurrentCrop) return { shotId: shotId, assetId: assetId, crop: null, reset: true, noOp: true };
      clearShotPhotoCrop(shot, assetId);
      return { shotId: shotId, assetId: assetId, crop: null, reset: true, noOp: false };
    }
    if (hasCurrentCrop && sameJson(crops[assetId], crop)) {
      return { shotId: shotId, assetId: assetId, crop: clone(crop), reset: false, noOp: true };
    }
    const nextCrops = clone(crops);
    Object.defineProperty(nextCrops, assetId, {
      value: clone(crop),
      enumerable: true,
      configurable: true,
      writable: true
    });
    shot.photoCropsByAssetId = nextCrops;
    return { shotId: shotId, assetId: assetId, crop: clone(crop), reset: false, noOp: false };
  }

  function createShot(projectId, id, sceneId, shotNo) {
    return {
      projectId: projectId,
      id: id,
      sceneId: sceneId,
      shotNo: shotNo,
      title: "",
      visual: "",
      script: "",
      super: "",
      sound: "",
      move: "",
      tags: "",
      durationSeconds: 0,
      assetIds: [],
      drawingIds: []
    };
  }

  function copyDrawingForShot(project, drawing, shotId, allocate) {
    const copy = clone(drawing);
    copy.id = allocate("drawing");
    copy.shotId = shotId;
    copy.layers = copy.layers.map(function (layer) {
      const copiedLayer = clone(layer);
      copiedLayer.id = allocate("layer");
      copiedLayer.drawingId = copy.id;
      copiedLayer.strokes = copiedLayer.strokes.map(function (stroke) {
        const copiedStroke = clone(stroke);
        copiedStroke.id = allocate("stroke");
        return copiedStroke;
      });
      return copiedLayer;
    });
    return copy;
  }

  function drawingLayer(drawing, layerId) {
    const layer = drawing.layers.find(function (item) { return item.id === layerId; });
    if (!layer) fail("LAYER_NOT_FOUND", "此 Drawing 沒有指定的可編輯圖層。", "$.args[1]");
    return layer;
  }

  function editableDrawingLayer(project, drawingId, layerId) {
    const drawing = findById(project.drawings, drawingId, "DRAWING_NOT_FOUND", "Drawing");
    const layer = drawingLayer(drawing, layerId);
    if (!layer.visible || layer.locked) {
      fail("LAYER_NOT_EDITABLE", "只能編輯可見且未鎖定的作用圖層。", "$.args[1]");
    }
    return { drawing: drawing, layer: layer };
  }

  function validateStrokeDraft(stroke, path) {
    record(stroke, path);
    if (own(stroke, "id")) {
      fail("STROKE_ID_MANAGED", "Stroke ID 由 Model 產生，不接受草稿自帶 ID。", path + ".id");
    }
    if (stroke.kind !== "pen" && stroke.kind !== "cameraArrow") {
      fail("INVALID_STROKE_KIND", "筆跡種類只能是 pen 或 cameraArrow。", path + ".kind");
    }
    text(stroke.color, path + ".color", false);
    if (typeof stroke.baseWidth !== "number" || !Number.isFinite(stroke.baseWidth) || stroke.baseWidth <= 0) {
      fail("INVALID_STROKE_WIDTH", "新筆跡 baseWidth 必須是正的 canonical canvas pixel 數值。", path + ".baseWidth");
    }
    if (!Array.isArray(stroke.points) || stroke.points.length < 2) {
      fail("INVALID_STROKE_POINTS", "筆跡至少需要兩個正規化點。", path + ".points");
    }
    if (stroke.kind === "cameraArrow" && stroke.points.length !== 2) {
      fail("INVALID_CAMERA_ARROW", "兩點運鏡箭頭必須恰有起點與終點。", path + ".points");
    }
    let lastTime = -1;
    stroke.points.forEach(function (point, index) {
      const pointPath = path + ".points[" + index + "]";
      record(point, pointPath);
      ["x", "y"].forEach(function (axis) {
        if (typeof point[axis] !== "number" || !Number.isFinite(point[axis]) || point[axis] < 0 || point[axis] > 1) {
          fail("INVALID_STROKE_COORDINATE", pointPath + "." + axis + " 必須介於 0–1。", pointPath + "." + axis);
        }
      });
      if (typeof point.t !== "number" || !Number.isFinite(point.t) || point.t < 0 || point.t < lastTime) {
        fail("INVALID_STROKE_TIME", pointPath + ".t 必須是非遞減的非負時間。", pointPath + ".t");
      }
      lastTime = point.t;
      if (point.pressure !== null && point.pressure !== undefined &&
          (typeof point.pressure !== "number" || !Number.isFinite(point.pressure) || point.pressure < 0 || point.pressure > 1)) {
        fail("INVALID_PRESSURE", pointPath + ".pressure 必須介於 0–1 或為 null。", pointPath + ".pressure");
      }
      ["tiltX", "tiltY"].forEach(function (axis) {
        if (point[axis] !== null && point[axis] !== undefined &&
            (typeof point[axis] !== "number" || !Number.isFinite(point[axis]))) {
          fail("INVALID_TILT", pointPath + "." + axis + " 必須是有限數值或 null。", pointPath + "." + axis);
        }
      });
    });
    // Clone the complete draft so schema-accepted stroke metadata survives.
    return clone(stroke);
  }

  function createDrawingRecord(project, shotId, drawingId, sceneLayerId, subjectLayerId) {
    const size = DRAWING_CANVAS_SIZES[project.aspectRatio];
    if (!size) fail("INVALID_ASPECT_RATIO", "不支援此 Drawing 畫幅。");
    const drawing = {
      projectId: project.projectId,
      id: drawingId,
      schemaVersion: ProjectSchema.DRAWING_SCHEMA_VERSION,
      shotId: shotId,
      canvas: { aspectRatio: project.aspectRatio, width: size.width, height: size.height },
      backgroundAssetId: null,
      backgroundCrop: null,
      revision: 0,
      previewAssetId: null,
      previewDrawingRevision: null,
      layers: []
    };
    drawing.layers.push({
      projectId: project.projectId,
      drawingId: drawingId,
      id: sceneLayerId,
      kind: "scene",
      visible: true,
      locked: false,
      opacity: 1,
      order: 0,
      strokes: []
    });
    drawing.layers.push({
      projectId: project.projectId,
      drawingId: drawingId,
      id: subjectLayerId,
      kind: "subject",
      visible: true,
      locked: false,
      opacity: 1,
      order: 1,
      strokes: []
    });
    return drawing;
  }

  function moveId(order, id, delta) {
    const index = order.indexOf(id);
    if (index < 0) return false;
    const next = index + delta;
    if (delta === 0 || next < 0 || next >= order.length) return false;
    order.splice(index, 1);
    order.splice(next, 0, id);
    return true;
  }

  function dateIsValid(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T00:00:00.000Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function dateOrdinal(value) {
    return Math.floor(new Date(value + "T00:00:00.000Z").getTime() / 86400000);
  }

  function dateFromOrdinal(value) {
    if (!Number.isInteger(value)) return null;
    const date = new Date(value * 86400000);
    if (!Number.isFinite(date.getTime())) return null;
    const formatted = date.toISOString().slice(0, 10);
    return dateIsValid(formatted) ? formatted : null;
  }

  function ensureProductionTaskCollections(project) {
    if (!Array.isArray(project.productionTasks) && !Array.isArray(project.productionTaskOrder)) {
      project.productionTasks = [];
      project.productionTaskOrder = [];
    }
    if (!Array.isArray(project.productionTasks) || !Array.isArray(project.productionTaskOrder)) {
      fail("INCOMPLETE_PRODUCTION_TASK_DATA", "製作任務清單資料不完整，拒絕修改。", "$.productionTasks");
    }
  }

  function orderedIdsForProductionTasks(project) {
    return project.productionTaskOrder || [];
  }

  function defaultProductionTimelineOrder(project) {
    return [{ kind: "shootingDayMarkers" }].concat(orderedIdsForProductionTasks(project).map(function (id) {
      return { kind: "productionTask", id: id };
    }));
  }

  function orderedProductionTimeline(project) {
    return Array.isArray(project.productionTimelineOrder)
      ? project.productionTimelineOrder
      : defaultProductionTimelineOrder(project);
  }

  function validateProductionTimelineOrder(order, currentOrder) {
    if (!Array.isArray(order)) fail("INVALID_ORDER", "製作時程列排序必須是列參照陣列。", "$.args[0]");
    const expected = new Map(currentOrder.map(function (row) {
      return [JSON.stringify(row.kind === "productionTask" ? [row.kind, row.id] : [row.kind]), row];
    }));
    const seen = new Set();
    const result = order.map(function (row, index) {
      const path = "$.args[0][" + index + "]";
      record(row, path);
      let key;
      if (row.kind === "shootingDayMarkers") {
        if (Object.keys(row).length !== 1) fail("INVALID_PRODUCTION_TIMELINE_ROW", "拍攝日標記列只接受 kind 欄位。", path);
        key = JSON.stringify([row.kind]);
      } else if (row.kind === "productionTask") {
        if (Object.keys(row).length !== 2 || !own(row, "id")) fail("INVALID_PRODUCTION_TIMELINE_ROW", "製作任務列只接受 kind 和 id 欄位。", path);
        text(row.id, path + ".id", false);
        key = JSON.stringify([row.kind, row.id]);
      } else {
        fail("INVALID_PRODUCTION_TIMELINE_ROW", "時間軸列類型無效。", path + ".kind");
      }
      if (seen.has(key)) fail("DUPLICATE_ORDER_ID", "製作時程列排序不可重複。", path);
      if (!expected.has(key)) fail("ORDER_MEMBERSHIP_MISMATCH", "製作時程列排序包含不存在的列。", path);
      seen.add(key);
      return row.kind === "productionTask" ? { kind: row.kind, id: row.id } : { kind: row.kind };
    });
    if (seen.size !== expected.size) fail("ORDER_MEMBERSHIP_MISMATCH", "製作時程列排序必須包含每一列一次。", "$.args[0]");
    return result;
  }

  function productionTaskOrderFromTimeline(order) {
    return order.filter(function (row) { return row.kind === "productionTask"; }).map(function (row) { return row.id; });
  }

  function replaceTaskSlotsInTimeline(order, taskIds) {
    let index = 0;
    return order.map(function (row) {
      if (row.kind !== "productionTask") return row;
      return { kind: "productionTask", id: taskIds[index++] };
    });
  }

  function validateProductionTaskRange(startDate, endDate, startPath, endPath) {
    if (!dateIsValid(startDate)) fail("INVALID_DATE", "製作任務日期必須是有效 YYYY-MM-DD。", startPath);
    if (!dateIsValid(endDate)) fail("INVALID_DATE", "製作任務日期必須是有效 YYYY-MM-DD。", endPath);
    if (endDate < startDate) fail("INVALID_PRODUCTION_TASK_RANGE", "製作任務結束日期不可早於開始日期。", endPath);
  }

  function validateProductionTaskOrder(order, currentOrder) {
    if (!Array.isArray(order)) fail("INVALID_ORDER", "製作任務排序必須是 ID 陣列。", "$.args[0]");
    const expected = new Set(currentOrder);
    const seen = new Set();
    order.forEach(function (id, index) {
      text(id, "$.args[0][" + index + "]", false);
      if (seen.has(id)) fail("DUPLICATE_ORDER_ID", "製作任務排序不可重複包含相同 ID。", "$.args[0][" + index + "]");
      if (!expected.has(id)) fail("ORDER_MEMBERSHIP_MISMATCH", "製作任務排序必須完整且只包含目前的製作任務。", "$.args[0][" + index + "]");
      seen.add(id);
    });
    if (seen.size !== expected.size) fail("ORDER_MEMBERSHIP_MISMATCH", "製作任務排序不可遺漏現有任務。", "$.args[0]");
    return order.slice();
  }

  function clockMinutes(value) {
    if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  }

  function updateEntry(project, entryId, patch) {
    assertPatch(
      patch,
      ["dayId", "type", "shotId", "title", "minutes", "status", "notes", "timingMode", "startTime", "endTime", "startNextDay", "endNextDay"],
      "拍攝項目",
      "$.args[1]"
    );
    const entry = findById(project.scheduleEntries, entryId, "ENTRY_NOT_FOUND", "拍攝項目");
    const oldDayId = entry.dayId;
    const next = Object.assign({}, entry, patch);
    const nextType = own(patch, "type") ? patch.type : entry.type;

    if (own(patch, "dayId")) {
      findById(project.shootingDays, patch.dayId, "DAY_NOT_FOUND", "拍攝日");
    }
    if (nextType !== "shot" && nextType !== "break") {
      fail("INVALID_ENTRY_TYPE", "拍攝項目類型只能是 shot 或 break。", "$.args[1].type");
    }
    if (own(patch, "title")) text(patch.title, "$.args[1].title", true);
    if (own(patch, "notes")) text(patch.notes, "$.args[1].notes", true);
    if (own(patch, "minutes")) nonnegativeInteger(patch.minutes, "$.args[1].minutes");
    if (own(patch, "status") && ProjectSchema.ENTRY_STATUSES.indexOf(patch.status) < 0) {
      fail("INVALID_ENTRY_STATUS", "拍攝狀態無效。", "$.args[1].status");
    }
    if (own(patch, "timingMode") && patch.timingMode !== "auto" && patch.timingMode !== "fixed") {
      fail("INVALID_TIMING_MODE", "時間模式只能是 auto 或 fixed。", "$.args[1].timingMode");
    }
    ["startTime", "endTime"].forEach(function (key) {
      if (own(patch, key) && patch[key] !== null && clockMinutes(patch[key]) === null) {
        fail("INVALID_TIME", key + " 必須使用 HH:mm。", "$.args[1]." + key);
      }
    });
    if (own(patch, "endNextDay") && typeof patch.endNextDay !== "boolean") {
      fail("INVALID_END_NEXT_DAY", "endNextDay 必須是布林值。", "$.args[1].endNextDay");
    }
    if (own(patch, "startNextDay") && typeof patch.startNextDay !== "boolean") {
      fail("INVALID_START_NEXT_DAY", "startNextDay 必須是布林值。", "$.args[1].startNextDay");
    }

    if (nextType === "break") {
      if (own(patch, "shotId") && patch.shotId !== null) {
        fail("BREAK_HAS_SHOT", "break 排程不可引用 Shot。", "$.args[1].shotId");
      }
      next.shotId = null;
    } else {
      const shotId = own(patch, "shotId") ? patch.shotId : entry.shotId;
      if (typeof shotId !== "string" || !shotId) fail("SHOT_ID_REQUIRED", "shot 排程需要有效的 Shot ID。", "$.args[1].shotId");
      const linkedShot = findById(project.shots, shotId, "SHOT_NOT_FOUND", "分鏡");
      const duplicate = project.scheduleEntries.some(function (other) {
        return other.id !== entryId && other.type === "shot" && other.shotId === shotId;
      });
      if (duplicate) fail("DUPLICATE_SHOT_SCHEDULE", "同一分鏡不可重複排程。", "$.args[1].shotId");
      next.shotId = shotId;
      if (own(patch, "title")) {
        linkedShot.title = patch.title;
        project.scheduleEntries.forEach(function (other) {
          if (other.type === "shot" && other.shotId === shotId) other.title = patch.title;
        });
      }
    }
    next.type = nextType;

    if (next.timingMode === "fixed") {
      if (own(patch, "minutes")) {
        fail("FIXED_MINUTES_DERIVED", "固定時間的分鐘數由起迄時間推導，不接受直接修改。", "$.args[1].minutes");
      }
      if (next.startTime === null || next.endTime === null) {
        fail("MISSING_FIXED_TIME", "固定時段需要開始與結束時間。", "$.args[1]");
      }
      const start = clockMinutes(next.startTime);
      const end = clockMinutes(next.endTime);
      const elapsed = end + (next.endNextDay ? 1440 : 0) - start;
      if (elapsed <= 0) {
        fail("INVALID_FIXED_DURATION", "結束時間需晚於開始時間；跨日必須明確設定 endNextDay。", "$.args[1]");
      }
      next.minutes = elapsed;
    }

    Object.keys(patch).forEach(function (key) { entry[key] = patch[key]; });
    entry.type = next.type;
    entry.shotId = next.shotId;
    entry.minutes = next.minutes;
    if (entry.dayId !== oldDayId) {
      const oldOrder = orderedIdsForDay(project, oldDayId);
      const oldIndex = oldOrder.indexOf(entryId);
      if (oldIndex >= 0) oldOrder.splice(oldIndex, 1);
      orderedIdsForDay(project, entry.dayId).push(entryId);
    }
  }

  function applyCommand(projectInput, type, args, options) {
    const original = projectAndValidate(projectInput);
    const draft = clone(original);
    const values = args === undefined ? [] : clone(args);
    const opts = options || {};
    let value;
    let undoable = true;
    let allocate = null;

    if (typeof type !== "string") fail("UNSUPPORTED_COMMAND", "command type 必須是字串。");

    switch (type) {
      case "updateProjectMetadata": {
        assertArgs(type, values, 1, 1);
        const patch = assertPatch(values[0], ["title", "projectType"], "專案資料", "$.args[0]");
        if (!own(patch, "title")) fail("INVALID_PROJECT_TITLE", "專案名稱不可空白。", "$.args[0].title");
        const title = text(patch.title, "$.args[0].title", true).trim();
        if (!title) fail("INVALID_PROJECT_TITLE", "專案名稱不可空白。", "$.args[0].title");
        draft.title = title;
        if (own(patch, "projectType")) {
          draft.projectType = text(patch.projectType, "$.args[0].projectType", true).trim();
        }
        value = {
          title: draft.title,
          projectType: typeof draft.projectType === "string" ? draft.projectType : ""
        };
        break;
      }
      case "addShotPhotos": {
        value = applyAddShotPhotos(draft, values);
        break;
      }
      case "reorderShotPhotos": {
        value = applyReorderShotPhotos(draft, values);
        break;
      }
      case "removeShotPhoto": {
        value = applyRemoveShotPhoto(draft, values);
        break;
      }
      case "setShotPhotoCrop": {
        value = applySetShotPhotoCrop(draft, values);
        break;
      }
      case "replaceShotPhoto": {
        value = applyReplaceShotPhoto(draft, values);
        break;
      }
      case "createDrawingForShot": {
        assertArgs(type, values, 1, 1);
        const shotId = text(values[0], "$.args[0]", false);
        const shot = findById(draft.shots, shotId, "SHOT_NOT_FOUND", "分鏡");
        allocate = idFactory(draft, opts.newId);
        const drawingId = allocate("drawing");
        const sceneLayerId = allocate("layer");
        const subjectLayerId = allocate("layer");
        const drawing = createDrawingRecord(draft, shot.id, drawingId, sceneLayerId, subjectLayerId);
        // The pure bridge receives metadata only and cannot verify photo bytes.
        // Keep the card's original photo references intact; WP-05 may attach a
        // verified background through its dedicated command.
        draft.drawings.push(drawing);
        shot.drawingIds.push(drawing.id);
        value = drawing.id;
        break;
      }
      case "setDrawingBackground": {
        assertArgs(type, values, 2, 3);
        const drawingId = text(values[0], "$.args[0]", false);
        const assetId = values[1] === null ? null : text(values[1], "$.args[1]", false);
        const target = findById(draft.drawings, drawingId, "DRAWING_NOT_FOUND", "Drawing");
        const hasCropOverride = values.length === 3;
        const cropOverride = hasCropOverride && values[2] !== null
          ? ProjectSchema.validatePhotoCrop(values[2], "$.args[2]")
          : null;

        if (assetId === null && cropOverride !== null) {
          fail("INVALID_DRAWING_BACKGROUND_CROP", "沒有照片底圖時 backgroundCrop 必須是 null。", "$.args[2]");
        }

        if (assetId !== null) {
          const asset = findById(draft.assets, assetId, "ASSET_NOT_FOUND", "照片 Asset");
          if (asset.projectId !== draft.projectId) {
            fail("CROSS_PROJECT_RECORD", "底圖 Asset 必須屬於目前 Project。", "$.args[1]");
          }
          if (asset.role !== "photoOriginal") {
            fail("INVALID_BACKGROUND_ASSET", "Drawing 背景只能使用 photoOriginal Asset。", "$.args[1]");
          }
          if (asset.state !== "available") {
            fail("ASSET_MISSING", "底圖 Asset 尚未確認可用。", "$.args[1]");
          }
          const shot = findById(draft.shots, target.shotId, "SHOT_NOT_FOUND", "分鏡");
          if (shot.assetIds.indexOf(asset.id) < 0) {
            fail("SHOT_ASSET_NOT_FOUND", "Drawing 底圖必須是所屬分鏡目前引用的照片。", "$.args[1]");
          }
        }

        const currentCrop = target.schemaVersion === ProjectSchema.DRAWING_SCHEMA_VERSION ? target.backgroundCrop : null;
        let nextCrop = hasCropOverride ? cropOverride : currentCrop;
        if (!hasCropOverride && target.backgroundAssetId !== assetId) nextCrop = null;
        const nextVersion = hasCropOverride ? ProjectSchema.DRAWING_SCHEMA_VERSION : target.schemaVersion;
        const cropChanged = nextVersion === ProjectSchema.DRAWING_SCHEMA_VERSION &&
          JSON.stringify(currentCrop) !== JSON.stringify(nextCrop);
        const versionChanged = target.schemaVersion !== nextVersion;

        if (target.backgroundAssetId === assetId && !cropChanged && !versionChanged) {
          value = assetId;
          break;
        }

        target.backgroundAssetId = assetId;
        if (nextVersion === ProjectSchema.DRAWING_SCHEMA_VERSION) {
          target.schemaVersion = nextVersion;
          target.backgroundCrop = nextCrop;
        }
        target.revision += 1;
        // Keep the immutable preview reference and its generated revision. The
        // increment makes that preview stale without deleting Asset metadata
        // or bytes; a renderer can rebuild it from canonical vectors later.
        value = assetId;
        break;
      }
      case "appendDrawingStroke": {
        assertArgs(type, values, 3, 3);
        const drawingId = text(values[0], "$.args[0]", false);
        const layerId = text(values[1], "$.args[1]", false);
        const target = editableDrawingLayer(draft, drawingId, layerId);
        const stroke = validateStrokeDraft(values[2], "$.args[2]");
        allocate = idFactory(draft, opts.newId);
        stroke.id = allocate("stroke");
        target.layer.strokes.push(stroke);
        value = stroke.id;
        break;
      }
      case "eraseDrawingStroke": {
        assertArgs(type, values, 3, 3);
        const drawingId = text(values[0], "$.args[0]", false);
        const layerId = text(values[1], "$.args[1]", false);
        const strokeId = text(values[2], "$.args[2]", false);
        const target = editableDrawingLayer(draft, drawingId, layerId);
        const strokeIndex = target.layer.strokes.findIndex(function (stroke) { return stroke.id === strokeId; });
        if (strokeIndex < 0) fail("STROKE_NOT_FOUND", "指定 Stroke 不在此 Drawing 的作用圖層內。", "$.args[2]");
        target.layer.strokes.splice(strokeIndex, 1);
        value = true;
        break;
      }
      case "clearDrawingLayer": {
        assertArgs(type, values, 2, 2);
        const drawingId = text(values[0], "$.args[0]", false);
        const layerId = text(values[1], "$.args[1]", false);
        const targetDrawing = findById(draft.drawings, drawingId, "DRAWING_NOT_FOUND", "Drawing");
        const targetLayer = drawingLayer(targetDrawing, layerId);
        const removedCount = targetLayer.strokes.length;
        if (removedCount > 0) {
          if (!targetLayer.visible || targetLayer.locked) {
            fail("LAYER_NOT_EDITABLE", "只能清空可見且未鎖定的圖層。", "$.args[1]");
          }
          targetLayer.strokes = [];
        }
        value = removedCount;
        break;
      }
      case "setDrawingLayerState": {
        assertArgs(type, values, 3, 3);
        const drawingId = text(values[0], "$.args[0]", false);
        const layerId = text(values[1], "$.args[1]", false);
        const patch = assertPatch(values[2], ["visible", "locked"], "Drawing 圖層", "$.args[2]");
        const targetDrawing = findById(draft.drawings, drawingId, "DRAWING_NOT_FOUND", "Drawing");
        const targetLayer = drawingLayer(targetDrawing, layerId);
        ["visible", "locked"].forEach(function (key) {
          if (own(patch, key) && typeof patch[key] !== "boolean") {
            fail("INVALID_LAYER_STATE", "圖層「" + key + "」狀態必須是布林值。", "$.args[2]." + key);
          }
        });
        if (own(patch, "visible")) targetLayer.visible = patch.visible;
        if (own(patch, "locked")) targetLayer.locked = patch.locked;
        value = { visible: targetLayer.visible, locked: targetLayer.locked };
        break;
      }
      case "reuseSceneLayer": {
        assertArgs(type, values, 2, 2);
        const sourceDrawingId = text(values[0], "$.args[0]", false);
        const targetDrawingId = text(values[1], "$.args[1]", false);
        if (sourceDrawingId === targetDrawingId) {
          fail("SAME_DRAWING", "Scene 圖層沿用需要不同的來源與目標 Drawing。", "$.args[1]");
        }
        const sourceDrawing = findById(draft.drawings, sourceDrawingId, "DRAWING_NOT_FOUND", "來源 Drawing");
        const targetDrawing = findById(draft.drawings, targetDrawingId, "DRAWING_NOT_FOUND", "目標 Drawing");
        const sourceScene = sourceDrawing.layers.find(function (layer) { return layer.kind === "scene"; });
        const targetScene = targetDrawing.layers.find(function (layer) { return layer.kind === "scene"; });
        if (!sourceScene || !targetScene) fail("INVALID_DRAWING_LAYERS", "來源與目標 Drawing 都必須有 Scene 圖層。");
        if (!targetScene.visible || targetScene.locked) {
          fail("LAYER_NOT_EDITABLE", "目標 Scene 圖層必須可見且未鎖定，才能沿用筆跡。", "$.args[1]");
        }
        allocate = idFactory(draft, opts.newId);
        targetScene.strokes = sourceScene.strokes.map(function (sourceStroke) {
          const copiedStroke = clone(sourceStroke);
          copiedStroke.id = allocate("stroke");
          return copiedStroke;
        });
        // Only the target Scene stroke array changes. Its layer identity/state,
        // Subject layer, photo reference, preview metadata, and source stay put.
        value = targetDrawingId;
        break;
      }
      case "addScene": {
        assertArgs(type, values, 1, 1);
        const title = text(values[0], "$.args[0]", false).trim();
        if (!title) fail("INVALID_SCENE_TITLE", "場次名稱不可空白。", "$.args[0]");
        allocate = idFactory(draft, opts.newId);
        const id = allocate("scene");
        draft.scenes.push({ projectId: draft.projectId, id: id, title: title });
        draft.sceneOrder.push(id);
        draft.shotOrderByScene[id] = [];
        value = id;
        break;
      }
      case "updateScene": {
        assertArgs(type, values, 2, 2);
        const scene = findById(draft.scenes, values[0], "SCENE_NOT_FOUND", "場次");
        const patch = assertPatch(values[1], ["title"], "場次", "$.args[1]");
        if (own(patch, "title")) {
          const title = text(patch.title, "$.args[1].title", false).trim();
          if (!title) fail("INVALID_SCENE_TITLE", "場次名稱不可空白。", "$.args[1].title");
          scene.title = title;
        }
        value = values[0];
        break;
      }
      case "addShot": {
        assertArgs(type, values, 0, 1);
        const sceneId = values.length === 0 || values[0] === null
          ? draft.sceneOrder[0]
          : values[0];
        if (sceneId === undefined) fail("NO_SCENE", "新增分鏡需要先新增場次。");
        findById(draft.scenes, sceneId, "SCENE_NOT_FOUND", "場次");
        const order = orderedIdsForScene(draft, sceneId);
        allocate = idFactory(draft, opts.newId);
        const id = allocate("shot");
        draft.shots.push(createShot(draft.projectId, id, sceneId, uniqueShotNumber(draft, sceneId, order.length + 1)));
        order.push(id);
        value = id;
        break;
      }
      case "updateShot": {
        assertArgs(type, values, 2, 2);
        const shot = findById(draft.shots, values[0], "SHOT_NOT_FOUND", "分鏡");
        const patch = assertPatch(
          values[1],
          ["chapterId", "title", "visual", "script", "super", "sound", "move", "tags", "duration", "art"],
          "分鏡",
          "$.args[1]"
        );
        const oldSceneId = shot.sceneId;
        if (own(patch, "chapterId")) findById(draft.scenes, patch.chapterId, "SCENE_NOT_FOUND", "場次");
        ["title", "visual", "script", "super", "sound", "move", "tags"].forEach(function (key) {
          if (own(patch, key)) text(patch[key], "$.args[1]." + key, true);
        });
        if (own(patch, "duration")) {
          if (typeof patch.duration !== "number" || !Number.isFinite(patch.duration) || patch.duration < 0 || !Number.isInteger(patch.duration * 10)) {
            fail("INVALID_DURATION", "影片秒數必須是非負數且最多一位小數。", "$.args[1].duration");
          }
          shot.durationSeconds = patch.duration;
        }
        if (own(patch, "chapterId")) shot.sceneId = patch.chapterId;
        ["title", "visual", "script", "super", "sound", "move", "tags"].forEach(function (key) {
          if (own(patch, key)) shot[key] = patch[key];
        });
        if (own(patch, "art")) {
          text(patch.art, "$.args[1].art", true);
          shot.legacyArt = patch.art;
        }
        if (own(patch, "title")) {
          draft.scheduleEntries.forEach(function (entry) {
            if (entry.type === "shot" && entry.shotId === shot.id) entry.title = patch.title;
          });
        }
        if (shot.sceneId !== oldSceneId) {
          const oldOrder = orderedIdsForScene(draft, oldSceneId);
          const oldIndex = oldOrder.indexOf(shot.id);
          if (oldIndex >= 0) oldOrder.splice(oldIndex, 1);
          const newOrder = orderedIdsForScene(draft, shot.sceneId);
          newOrder.push(shot.id);
          if (shot.shotNoLocked === true && hasLockedShotNumberCollision(draft, shot, shot.sceneId)) {
            fail("LOCKED_SHOT_NUMBER_COLLISION", "無法搬入此場次：已有鏡頭鎖定相同鏡次。", "$.args[1].chapterId");
          }
          if (shot.shotNoLocked !== true && hasShotNumberCollision(draft, shot, shot.sceneId)) {
            shot.shotNo = uniqueShotNumber(draft, shot.sceneId, newOrder.length, shot.id);
          }
        }
        value = values[0];
        break;
      }
      case "setShotNumberLocked": {
        assertArgs(type, values, 2, 2);
        const shot = findById(draft.shots, values[0], "SHOT_NOT_FOUND", "分鏡");
        const locked = values[1];
        if (typeof locked !== "boolean") fail("INVALID_SHOT_NUMBER_LOCK", "鎖號狀態必須是布林值。", "$.args[1]");
        if (shot.shotNoLocked === locked || (!own(shot, "shotNoLocked") && !locked)) {
          value = shot.id;
          break;
        }
        if (locked) {
          const resolved = resolveShotNumbers(draft);
          if (resolved.conflicts.some(function (conflict) { return conflict.sceneId === shot.sceneId; })) {
            fail("LOCKED_SHOT_NUMBER_COLLISION", "此場次已有鎖號衝突，請先解除其中一個鎖號。", "$.args[0]");
          }
          shot.shotNo = resolved.shotNumbers[shot.id];
          shot.shotNoLocked = true;
        } else {
          delete shot.shotNoLocked;
        }
        value = shot.id;
        break;
      }
      case "duplicateShot": {
        assertArgs(type, values, 1, 1);
        const source = findById(draft.shots, values[0], "SHOT_NOT_FOUND", "分鏡");
        allocate = idFactory(draft, opts.newId);
        const newShotId = allocate("shot");
        const order = orderedIdsForScene(draft, source.sceneId);
        const sourceIndex = order.indexOf(source.id);
        if (sourceIndex < 0) fail("ORDER_MEMBERSHIP_MISMATCH", "分鏡排序缺少來源分鏡。");
        const copy = clone(source);
        copy.id = newShotId;
        delete copy.shotNoLocked;
        copy.shotNo = uniqueShotNumber(draft, source.sceneId, sourceIndex + 2);
        copy.super = shotSuperValue(source, "$.shots." + source.id);
        const newDrawingIds = [];
        source.drawingIds.forEach(function (drawingId) {
          const drawing = findById(draft.drawings, drawingId, "DRAWING_NOT_FOUND", "Drawing");
          const copiedDrawing = copyDrawingForShot(draft, drawing, newShotId, allocate);
          draft.drawings.push(copiedDrawing);
          newDrawingIds.push(copiedDrawing.id);
        });
        copy.drawingIds = newDrawingIds;
        draft.shots.push(copy);
        order.splice(sourceIndex + 1, 0, newShotId);
        value = newShotId;
        break;
      }
      case "deleteShot": {
        assertArgs(type, values, 1, 1);
        const id = values[0];
        const shot = draft.shots.find(function (item) { return item.id === id; });
        if (!shot) {
          value = false;
          break;
        }
        draft.shots = draft.shots.filter(function (item) { return item.id !== id; });
        const shotOrder = orderedIdsForScene(draft, shot.sceneId);
        const shotIndex = shotOrder.indexOf(id);
        if (shotIndex >= 0) shotOrder.splice(shotIndex, 1);
        const removedEntryIds = new Set(draft.scheduleEntries
          .filter(function (entry) { return entry.type === "shot" && entry.shotId === id; })
          .map(function (entry) { return entry.id; }));
        draft.scheduleEntries = draft.scheduleEntries.filter(function (entry) { return !removedEntryIds.has(entry.id); });
        draft.shootingDayOrder.forEach(function (dayId) {
          draft.scheduleOrderByDay[dayId] = draft.scheduleOrderByDay[dayId].filter(function (entryId) {
            return !removedEntryIds.has(entryId);
          });
        });
        const drawingIds = new Set(shot.drawingIds);
        draft.drawings = draft.drawings.filter(function (drawing) {
          return drawing.shotId !== id && !drawingIds.has(drawing.id);
        });
        value = true;
        break;
      }
      case "moveShot": {
        assertArgs(type, values, 2, 2);
        const shot = findById(draft.shots, values[0], "SHOT_NOT_FOUND", "分鏡");
        const delta = values[1];
        if (!Number.isInteger(delta)) fail("INVALID_DELTA", "移動距離必須是整數。", "$.args[1]");
        value = moveId(orderedIdsForScene(draft, shot.sceneId), shot.id, delta);
        break;
      }
      case "reorderShots": {
        assertArgs(type, values, 2, 2);
        const sceneId = text(values[0], "$.args[0]", false);
        findById(draft.scenes, sceneId, "SCENE_NOT_FOUND", "場次");
        const currentOrder = orderedIdsForScene(draft, sceneId);
        const nextOrder = validateExactOrder(
          draft,
          values[1],
          currentOrder,
          draft.shots,
          "sceneId",
          sceneId,
          "$.args[1]"
        );
        value = !sameJson(currentOrder, nextOrder);
        if (value) draft.shotOrderByScene[sceneId] = nextOrder;
        break;
      }
      case "renumberShots": {
        assertArgs(type, values, 1, 1);
        const preview = record(values[0], "$.args[0]");
        assertPatch(preview, ["sceneId", "baseRevision", "assignments", "conflicts"], "重編預覽", "$.args[0]");
        const sceneId = text(preview.sceneId, "$.args[0].sceneId", false);
        findById(draft.scenes, sceneId, "SCENE_NOT_FOUND", "場次");
        if (!Number.isInteger(preview.baseRevision) || preview.baseRevision < 0 || !Array.isArray(preview.assignments) || !Array.isArray(preview.conflicts)) {
          fail("INVALID_SHOT_RENUMBER_PREVIEW", "重編預覽資料格式無效。", "$.args[0]");
        }
        if (preview.conflicts.length) {
          fail("LOCKED_SHOT_NUMBER_COLLISION", "此場次有鎖號衝突，不能套用重編。", "$.args[0].conflicts");
        }
        if (preview.baseRevision !== original.revision) {
          fail("STALE_SHOT_RENUMBER_PREVIEW", "專案已變更，請重新預覽鏡次重編。", "$.args[0].baseRevision");
        }
        const currentPreview = previewShotRenumber(draft, sceneId);
        if (!sameJson(preview, currentPreview)) {
          fail("STALE_SHOT_RENUMBER_PREVIEW", "鏡頭或排序已變更，請重新預覽鏡次重編。", "$.args[0]");
        }
        let changedShotCount = 0;
        preview.assignments.forEach(function (assignment) {
          const shot = findById(draft.shots, assignment.shotId, "SHOT_NOT_FOUND", "分鏡");
          if (shot.shotNo !== assignment.shotNo) {
            shot.shotNo = assignment.shotNo;
            changedShotCount += 1;
          }
        });
        value = changedShotCount;
        break;
      }
      case "scheduleShot": {
        assertArgs(type, values, 2, 2);
        const shot = findById(draft.shots, values[0], "SHOT_NOT_FOUND", "分鏡");
        const day = findById(draft.shootingDays, values[1], "DAY_NOT_FOUND", "拍攝日");
        if (draft.scheduleEntries.some(function (entry) { return entry.type === "shot" && entry.shotId === shot.id; })) {
          fail("DUPLICATE_SHOT_SCHEDULE", "此分鏡已排入拍攝日。");
        }
        allocate = idFactory(draft, opts.newId);
        const id = allocate("entry");
        draft.scheduleEntries.push({
          projectId: draft.projectId,
          id: id,
          dayId: day.id,
          type: "shot",
          shotId: shot.id,
          title: shot.title,
          minutes: 0,
          status: "待拍",
          notes: "",
          timingMode: "auto",
          startTime: null,
          endTime: null,
          endNextDay: false
        });
        orderedIdsForDay(draft, day.id).push(id);
        value = id;
        break;
      }
      case "removeEntry": {
        assertArgs(type, values, 1, 1);
        const id = values[0];
        const entry = draft.scheduleEntries.find(function (item) { return item.id === id; });
        if (!entry) {
          value = false;
          break;
        }
        draft.scheduleEntries = draft.scheduleEntries.filter(function (item) { return item.id !== id; });
        const order = orderedIdsForDay(draft, entry.dayId);
        const index = order.indexOf(id);
        if (index >= 0) order.splice(index, 1);
        value = true;
        break;
      }
      case "moveEntry": {
        assertArgs(type, values, 2, 2);
        const entry = findById(draft.scheduleEntries, values[0], "ENTRY_NOT_FOUND", "拍攝項目");
        const delta = values[1];
        if (!Number.isInteger(delta)) fail("INVALID_DELTA", "移動距離必須是整數。", "$.args[1]");
        value = moveId(orderedIdsForDay(draft, entry.dayId), entry.id, delta);
        break;
      }
      case "reorderScheduleEntries": {
        assertArgs(type, values, 2, 2);
        const dayId = text(values[0], "$.args[0]", false);
        findById(draft.shootingDays, dayId, "DAY_NOT_FOUND", "拍攝日");
        const currentOrder = orderedIdsForDay(draft, dayId);
        const nextOrder = validateExactOrder(
          draft,
          values[1],
          currentOrder,
          draft.scheduleEntries,
          "dayId",
          dayId,
          "$.args[1]"
        );
        value = !sameJson(currentOrder, nextOrder);
        if (value) draft.scheduleOrderByDay[dayId] = nextOrder;
        break;
      }
      case "updateEntry": {
        assertArgs(type, values, 2, 2);
        updateEntry(draft, values[0], values[1]);
        value = values[0];
        break;
      }
      case "addBreak": {
        assertArgs(type, values, 1, 1);
        const day = findById(draft.shootingDays, values[0], "DAY_NOT_FOUND", "拍攝日");
        allocate = idFactory(draft, opts.newId);
        const id = allocate("entry");
        draft.scheduleEntries.push({
          projectId: draft.projectId,
          id: id,
          dayId: day.id,
          type: "break",
          shotId: null,
          title: "休息",
          minutes: 10,
          status: "待拍",
          notes: "",
          timingMode: "auto",
          startTime: null,
          endTime: null,
          endNextDay: false
        });
        orderedIdsForDay(draft, day.id).push(id);
        value = id;
        break;
      }
      case "addDay": {
        assertArgs(type, values, 3, 3);
        if (!dateIsValid(values[0])) fail("INVALID_DATE", "拍攝日期必須是有效 YYYY-MM-DD。", "$.args[0]");
        text(values[1], "$.args[1]", true);
        if (clockMinutes(values[2]) === null) fail("INVALID_TIME", "拍攝開始時間必須使用 HH:mm。", "$.args[2]");
        allocate = idFactory(draft, opts.newId);
        const id = allocate("day");
        draft.shootingDays.push({ projectId: draft.projectId, id: id, date: values[0], title: values[1], start: values[2] });
        draft.shootingDayOrder.push(id);
        draft.scheduleOrderByDay[id] = [];
        value = id;
        break;
      }
      case "updateDay": {
        assertArgs(type, values, 2, 2);
        const day = findById(draft.shootingDays, values[0], "DAY_NOT_FOUND", "拍攝日");
        const patch = assertPatch(values[1], ["date", "title", "start", "location", "contactName", "contactPhone", "expectedWrap", "productionCompany", "businessNumber", "contacts", "groupCalls", "vehicles", "notices"], "拍攝日", "$.args[1]");
        if (own(patch, "date") && !dateIsValid(patch.date)) fail("INVALID_DATE", "拍攝日期必須是有效 YYYY-MM-DD。", "$.args[1].date");
        if (own(patch, "title")) text(patch.title, "$.args[1].title", true);
        if (own(patch, "start") && clockMinutes(patch.start) === null) fail("INVALID_TIME", "拍攝開始時間必須使用 HH:mm。", "$.args[1].start");
        ["location", "contactName", "contactPhone"].forEach(function (name) {
          if (own(patch, name)) text(patch[name], "$.args[1]." + name, true);
        });
        ["productionCompany", "businessNumber"].forEach(function (name) {
          if (own(patch, name)) text(patch[name], "$.args[1]." + name, true);
        });
        if (own(patch, "expectedWrap") && patch.expectedWrap !== "" && clockMinutes(patch.expectedWrap) === null) {
          fail("INVALID_TIME", "預計收工時間必須使用 HH:mm。", "$.args[1].expectedWrap");
        }
        Object.assign(day, patch);
        if (own(patch, "contacts") && Array.isArray(patch.contacts)) {
          // Structured rows are authoritative on edit. projectToUi surfaces a
          // distinct legacy scalar pair as a synthetic row, and the first
          // populated structured row remains mirrored for older clients.
          const primary = patch.contacts.find(function (item) { return item && typeof item === "object" && (String(item.name || "").trim() || String(item.phone || "").trim()); });
          day.contactName = primary ? primary.name : "";
          day.contactPhone = primary ? primary.phone : "";
        } else if (Array.isArray(day.contacts) && (own(patch, "contactName") || own(patch, "contactPhone"))) {
          const primary = day.contacts.find(function (item) { return String(item.name || "").trim() || String(item.phone || "").trim(); }) || day.contacts[0];
          if (primary) {
            if (own(patch, "contactName")) primary.name = patch.contactName;
            if (own(patch, "contactPhone")) primary.phone = patch.contactPhone;
          } else if (String(day.contactName || "").trim() || String(day.contactPhone || "").trim()) {
            day.contacts = [{ id:"legacy-primary", position:"", name:day.contactName || "", phone:day.contactPhone || "", onCall:true }];
          }
        }
        value = values[0];
        break;
      }
      case "addProductionTask": {
        assertArgs(type, values, 3, 4);
        ensureProductionTaskCollections(draft);
        text(values[0], "$.args[0]", true);
        validateProductionTaskRange(values[1], values[2], "$.args[1]", "$.args[2]");
        const notes = values.length > 3 ? values[3] : "";
        text(notes, "$.args[3]", true);
        allocate = idFactory(draft, opts.newId);
        const id = allocate("productionTask");
        draft.productionTasks.push({
          projectId: draft.projectId,
          id: id,
          title: values[0],
          startDate: values[1],
          endDate: values[2],
          notes: notes
        });
        orderedIdsForProductionTasks(draft).push(id);
        if (Array.isArray(draft.productionTimelineOrder)) draft.productionTimelineOrder.push({ kind: "productionTask", id: id });
        value = id;
        break;
      }
      case "updateProductionTask": {
        assertArgs(type, values, 2, 2);
        const task = findById(draft.productionTasks || [], values[0], "PRODUCTION_TASK_NOT_FOUND", "製作任務");
        const patch = assertPatch(values[1], ["title", "startDate", "endDate", "notes", "color"], "製作任務", "$.args[1]");
        if (own(patch, "title")) text(patch.title, "$.args[1].title", true);
        if (own(patch, "notes")) text(patch.notes, "$.args[1].notes", true);
        if (own(patch, "color")) {
          text(patch.color, "$.args[1].color", true);
          if (patch.color !== "" && !/^#[0-9a-fA-F]{6}$/.test(patch.color)) {
            fail("INVALID_PRODUCTION_TASK_COLOR", "製作任務顏色必須是 #RRGGBB 十六進位色碼或空白。", "$.args[1].color");
          }
        }
        const nextStartDate = own(patch, "startDate") ? patch.startDate : task.startDate;
        const nextEndDate = own(patch, "endDate") ? patch.endDate : task.endDate;
        validateProductionTaskRange(nextStartDate, nextEndDate, "$.args[1].startDate", "$.args[1].endDate");
        Object.assign(task, patch);
        value = task.id;
        break;
      }
      case "moveProductionTask": {
        assertArgs(type, values, 2, 2);
        const task = findById(draft.productionTasks || [], values[0], "PRODUCTION_TASK_NOT_FOUND", "製作任務");
        const nextStartDate = values[1];
        if (!dateIsValid(nextStartDate)) fail("INVALID_DATE", "製作任務日期必須是有效 YYYY-MM-DD。", "$.args[1]");
        const spanDays = dateOrdinal(task.endDate) - dateOrdinal(task.startDate);
        const nextEndDate = dateFromOrdinal(dateOrdinal(nextStartDate) + spanDays);
        if (!nextEndDate) fail("INVALID_DATE", "移動後的製作任務結束日期超出支援範圍。", "$.args[1]");
        task.startDate = nextStartDate;
        task.endDate = nextEndDate;
        value = task.id;
        break;
      }
      case "reorderProductionTasks": {
        assertArgs(type, values, 1, 1);
        const currentOrder = orderedIdsForProductionTasks(draft);
        const nextOrder = validateProductionTaskOrder(values[0], currentOrder);
        value = !sameJson(currentOrder, nextOrder);
        if (value) {
          if (!Array.isArray(draft.productionTasks)) draft.productionTasks = [];
          draft.productionTaskOrder = nextOrder;
          if (Array.isArray(draft.productionTimelineOrder)) {
            draft.productionTimelineOrder = replaceTaskSlotsInTimeline(draft.productionTimelineOrder, nextOrder);
          }
        }
        break;
      }
      case "reorderProductionTimeline": {
        assertArgs(type, values, 1, 1);
        const currentOrder = orderedProductionTimeline(draft);
        const nextOrder = validateProductionTimelineOrder(values[0], currentOrder);
        value = !sameJson(currentOrder, nextOrder);
        if (value) {
          draft.productionTimelineOrder = nextOrder;
          if (Array.isArray(draft.productionTasks) && Array.isArray(draft.productionTaskOrder)) {
            draft.productionTaskOrder = productionTaskOrderFromTimeline(nextOrder);
          }
        }
        break;
      }
      case "deleteProductionTask": {
        assertArgs(type, values, 1, 1);
        const task = findById(draft.productionTasks || [], values[0], "PRODUCTION_TASK_NOT_FOUND", "製作任務");
        draft.productionTasks = draft.productionTasks.filter(function (item) { return item.id !== task.id; });
        const order = orderedIdsForProductionTasks(draft);
        const index = order.indexOf(task.id);
        if (index >= 0) order.splice(index, 1);
        if (Array.isArray(draft.productionTimelineOrder)) {
          draft.productionTimelineOrder = draft.productionTimelineOrder.filter(function (row) {
            return row.kind !== "productionTask" || row.id !== task.id;
          });
        }
        value = task.id;
        break;
      }
      case "setAspectRatio": {
        assertArgs(type, values, 1, 1);
        if (ProjectSchema.ASPECT_RATIOS.indexOf(values[0]) < 0) {
          fail("INVALID_ASPECT_RATIO", "不支援此畫幅。", "$.args[0]");
        }
        draft.aspectRatio = values[0];
        value = values[0];
        break;
      }
      case "updateOutputPreferences": {
        assertArgs(type, values, 1, 1);
        const patch = assertPatch(
          values[0],
          ["mode", "orientation", "density", "densityByMode", "fields", "schedule"],
          "輸出偏好",
          "$.args[0]"
        );
        const current = draft.outputPreferences;
        const next = upgradeOutputPreferences(current);
        if (own(patch, "fields")) {
          if (isRecord(next.fields.images) && isRecord(next.fields.details)) {
            mergeOutputFieldPatch(next.fields, patch.fields);
          } else {
            const flatPatch = assertPatch(patch.fields, ProjectSchema.OUTPUT_FIELDS, "輸出偏好欄位", "$.args[0].fields");
            Object.keys(flatPatch).forEach(function (name) {
              if (typeof flatPatch[name] !== "boolean") fail("INVALID_OUTPUT_FIELD", "輸出欄位必須是布林值。", "$.args[0].fields." + name);
              next.fields[name] = flatPatch[name];
            });
          }
        }
        if (own(patch, "schedule")) {
          const schedulePatch = assertPatch(patch.schedule, ["dayScope", "selectedDayId", "showEstimatedWrap"].concat(ProjectSchema.SCHEDULE_BOOLEAN_FIELDS || []), "輸出拍攝日範圍", "$.args[0].schedule");
          if (own(schedulePatch, "dayScope") && schedulePatch.dayScope !== "selected" && schedulePatch.dayScope !== "all") {
            fail("INVALID_DAY_SCOPE", "拍攝日範圍只能是 selected 或 all。", "$.args[0].schedule.dayScope");
          }
          if (own(schedulePatch, "selectedDayId") && schedulePatch.selectedDayId !== null) {
            text(schedulePatch.selectedDayId, "$.args[0].schedule.selectedDayId", false);
            if (!draft.shootingDays.some(function (day) { return day.id === schedulePatch.selectedDayId; })) {
              fail("ORPHAN_SELECTED_DAY", "輸出偏好引用了目前 Project 不存在的拍攝日。", "$.args[0].schedule.selectedDayId");
            }
          }
          if (own(schedulePatch, "showEstimatedWrap") && typeof schedulePatch.showEstimatedWrap !== "boolean") {
            fail("INVALID_ESTIMATED_WRAP_PREFERENCE", "預估收工輸出設定必須是布林值。", "$.args[0].schedule.showEstimatedWrap");
          }
          (ProjectSchema.SCHEDULE_BOOLEAN_FIELDS || []).forEach(function (name) {
            if (own(schedulePatch, name) && typeof schedulePatch[name] !== "boolean") {
              fail("INVALID_SCHEDULE_PREFERENCE", "輸出拍攝偏好必須是布林值。", "$.args[0].schedule." + name);
            }
          });
          Object.assign(next.schedule, clone(schedulePatch));
        }
        ["mode", "orientation"].forEach(function (key) { if (own(patch, key)) next[key] = patch[key]; });
        if (own(patch, "densityByMode")) mergeDensityByMode(next.densityByMode, patch.densityByMode);
        if (own(patch, "density")) {
          if (!Number.isInteger(patch.density) || patch.density < 1 || patch.density > 12) {
            fail("INVALID_DENSITY", "每頁密度必須介於 1–12。", "$.args[0].density");
          }
          next.densityByMode[next.mode] = patch.density;
        }
        next.density = next.densityByMode[next.mode];
        if (!sameJson(current, next)) {
          next.revision = current.revision + 1;
          draft.outputPreferences = next;
        }
        value = clone(draft.outputPreferences);
        undoable = false;
        break;
      }
      default:
        fail("UNSUPPORTED_COMMAND", "不支援的純資料命令：" + type + "。");
    }

    return makeResult(original, draft, value, undoable);
  }

  function projectToUi(projectInput) {
    const project = projectAndValidate(projectInput);
    const scenesById = new Map(project.scenes.map(function (scene) { return [scene.id, scene]; }));
    const shotsById = new Map(project.shots.map(function (shot) { return [shot.id, shot]; }));
    const daysById = new Map(project.shootingDays.map(function (day) { return [day.id, day]; }));
    const entriesById = new Map(project.scheduleEntries.map(function (entry) { return [entry.id, entry]; }));
    const productionTasksById = new Map((project.productionTasks || []).map(function (task) { return [task.id, task]; }));
    const chapters = project.sceneOrder.map(function (id) { return clone(scenesById.get(id)); });
    const shots = [];
    project.sceneOrder.forEach(function (sceneId) {
      project.shotOrderByScene[sceneId].forEach(function (id) {
        const source = shotsById.get(id);
        const shot = clone(source);
        shot.super = shotSuperValue(source, "$.shots." + source.id);
        shot.chapterId = source.sceneId;
        shot.no = source.shotNo;
        shot.duration = source.durationSeconds;
        if (own(source, "legacyArt")) shot.art = source.legacyArt;
        else delete shot.art;
        shots.push(shot);
      });
    });
    const days = project.shootingDayOrder.map(function (id) {
      const day = clone(daysById.get(id));
      // Keep the UI shape stable for pre-callsheet Projects without writing
      // empty values back to canonical data until the user changes a field.
      ["location", "contactName", "contactPhone"].forEach(function (name) {
        if (!own(day, name)) day[name] = "";
      });
      const legacyName = String(day.contactName || "");
      const legacyPhone = String(day.contactPhone || "");
      const projectedContacts = Array.isArray(day.contacts) ? day.contacts : [];
      const hasLegacyContact = !!(legacyName.trim() || legacyPhone.trim());
      const legacyContactIsRepresented = projectedContacts.some(function (item) {
        const structuredName = String(item && item.name || "").trim();
        const structuredPhone = String(item && item.phone || "").trim();
        return (!legacyName.trim() || structuredName === legacyName.trim()) &&
          (!legacyPhone.trim() || structuredPhone === legacyPhone.trim());
      });
      // Structured contacts remain first and in saved order. Preserve a distinct
      // legacy scalar pair as a projected row; scalar fields are compatibility
      // mirrors, not a replacement for a different structured contact.
      if (hasLegacyContact && !legacyContactIsRepresented) {
        const usedIds = new Set(projectedContacts.map(function (item) { return item.id; }));
        let projectedId = "legacy-primary";
        let suffix = 2;
        while (usedIds.has(projectedId)) projectedId = "legacy-primary-" + suffix++;
        day.contacts = projectedContacts.concat([{ id: projectedId, position: "", name: legacyName, phone: legacyPhone, onCall: true }]);
      } else day.contacts = projectedContacts;
      ["groupCalls", "vehicles", "notices"].forEach(function (name) {
        if (!own(day, name)) day[name] = [];
      });
      return day;
    });
    const entries = [];
    project.shootingDayOrder.forEach(function (dayId) {
      project.scheduleOrderByDay[dayId].forEach(function (id) {
        entries.push(clone(entriesById.get(id)));
      });
    });
    const productionTasks = (project.productionTaskOrder || []).map(function (id) {
      return clone(productionTasksById.get(id));
    });

    return {
      projectId: project.projectId,
      title: project.title,
      projectType: typeof project.projectType === "string" ? project.projectType : "",
      revision: project.revision,
      aspectRatio: project.aspectRatio,
      chapters: chapters,
      shots: shots,
      days: days,
      entries: entries,
      productionTasks: productionTasks,
      productionTimelineOrder: clone(orderedProductionTimeline(project)),
      outputPreferences: clone(project.outputPreferences)
    };
  }

  function makeEmptyProject(options) {
    const opts = record(options, "$.options");
    const projectId = text(opts.projectId, "$.options.projectId", false);
    if (projectId !== projectId.trim() || projectId.length > 200) {
      fail("INVALID_PROJECT_ID", "projectId 必須是長度 1–200 的非空穩定 ID。", "$.options.projectId");
    }
    const title = text(opts.title, "$.options.title", false).trim();
    if (!title) fail("INVALID_PROJECT_TITLE", "專案名稱不可空白。", "$.options.title");
    const projectType = opts.projectType === undefined
      ? ""
      : text(opts.projectType, "$.options.projectType", true).trim();
    const now = text(opts.now, "$.options.now", false);
    const millis = Date.parse(now);
    if (!Number.isFinite(millis) || new Date(millis).toISOString() !== now) {
      fail("INVALID_TIMESTAMP", "now 必須是標準 UTC ISO 時間。", "$.options.now");
    }
    return projectAndValidate({
      projectId: projectId,
      schemaVersion: ProjectSchema.SCHEMA_VERSION,
      revision: 0,
      title: title,
      projectType: projectType,
      createdAt: now,
      updatedAt: now,
      aspectRatio: "16:9",
      scenes: [],
      sceneOrder: [],
      shots: [],
      shotOrderByScene: {},
      shootingDays: [],
      shootingDayOrder: [],
      scheduleEntries: [],
      scheduleOrderByDay: {},
      productionTasks: [],
      productionTaskOrder: [],
      productionTimelineOrder: [{ kind: "shootingDayMarkers" }],
      assets: [],
      drawings: [],
      outputPreferences: makeDefaultOutputPreferences()
    });
  }

  return Object.freeze({
    BridgeError: BridgeError,
    projectToUi: projectToUi,
    resolveShotNumbers: resolveShotNumbers,
    previewShotRenumber: previewShotRenumber,
    applyCommand: applyCommand,
    makeEmptyProject: makeEmptyProject
  });
});
