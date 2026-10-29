(function attachPackageCopy(root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DirectorStoryboardPackageCopy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPackageCopy(root) {
  "use strict";

  class PackageCopyError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = "PackageCopyError";
      this.code = code;
      this.details = details || null;
    }
  }

  function fail(code, message, details) {
    throw new PackageCopyError(code, message, details);
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function requireRecord(value, label) {
    if (!isRecord(value)) fail("INVALID_PACKAGE", label + " 必須是物件。");
    return value;
  }

  function requireId(value, label) {
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 200) {
      fail("INVALID_ID", label + " 必須是長度 1–200 的穩定不透明 ID。", { value: value });
    }
    return value;
  }

  function exactShape(value, allowed, path) {
    requireRecord(value, path);
    Object.keys(value).forEach(function (key) {
      if (!allowed.has(key)) {
        fail("UNSUPPORTED_EXTENSION_FIELD", "另存副本遇到尚未定義的擴充欄位，無法安全判斷其中是否含 ID 或引用。", {
          path: path + "." + key,
          field: key
        });
      }
    });
  }

  function shape(keys) {
    return new Set(keys.split(" "));
  }

  const PROJECT_KEYS = shape("projectId schemaVersion revision title createdAt updatedAt aspectRatio projectType scenes sceneOrder shots shotOrderByScene shootingDays shootingDayOrder scheduleEntries scheduleOrderByDay productionTasks productionTaskOrder productionTimelineOrder assets drawings outputPreferences");
  const SCENE_KEYS = shape("projectId id title displayNo");
  const SHOT_KEYS = shape("projectId id sceneId shotNo shotNoLocked displayNo title visual script sound move tags super durationSeconds legacyArt assetIds photoCropsByAssetId drawingIds");
  const DAY_KEYS = shape("projectId id date title start location contactName contactPhone productionCompany businessNumber expectedWrap notices contacts groupCalls vehicles");
  const CALLSHEET_ROW_FIELDS = Object.freeze(["notices", "contacts", "groupCalls", "vehicles"]);
  const CALLSHEET_ROW_KEYS = Object.freeze({
    notices: shape("id text"),
    contacts: shape("id position name phone onCall"),
    groupCalls: shape("id group location time"),
    vehicles: shape("id label plate driver driverPhone passengers")
  });
  const CALLSHEET_ROW_ID_KINDS = Object.freeze({
    notices: "notice",
    contacts: "contact",
    groupCalls: "groupCall",
    vehicles: "vehicle"
  });
  const ENTRY_KEYS = shape("projectId id dayId type shotId title minutes status notes timingMode startTime endTime startNextDay endNextDay");
  const PRODUCTION_TASK_KEYS = shape("projectId id title startDate endDate notes color");
  const ASSET_KEYS = shape("projectId id role sha256 mime originalName byteLength width height state thumbnail");
  const THUMBNAIL_KEYS = shape("mime byteLength width height version");
  const DRAWING_KEYS = shape("projectId id schemaVersion shotId canvas backgroundAssetId backgroundCrop revision previewAssetId previewDrawingRevision layers");
  const CANVAS_KEYS = shape("aspectRatio width height");
  const LAYER_KEYS = shape("projectId drawingId id kind visible locked opacity order strokes");
  const STROKE_KEYS = shape("id kind color baseWidth points");
  const POINT_KEYS = shape("x y t pressure tiltX tiltY");
  const PREFERENCES_KEYS = shape("schemaVersion revision mode orientation density fields schedule densityByMode");
  const FLAT_PREFERENCE_FIELDS_KEYS = shape("visual script super sound move duration");
  const GROUPED_PREFERENCE_FIELDS_KEYS = shape("visual script super sound move duration images details");
  const SCHEDULE_PREFERENCE_KEYS = shape("dayScope selectedDayId showEstimatedWrap rundownThumbnails rundownNotes rundownStatus storyboardShotNumber storyboardTitle");

  function checkProjectShape(project) {
    exactShape(project, PROJECT_KEYS, "project");
    project.scenes.forEach(function (scene, index) { exactShape(scene, SCENE_KEYS, "project.scenes[" + index + "]"); });
    project.shots.forEach(function (shot, index) { exactShape(shot, SHOT_KEYS, "project.shots[" + index + "]"); });
    project.shootingDays.forEach(function (day, index) {
      const dayPath = "project.shootingDays[" + index + "]";
      exactShape(day, DAY_KEYS, dayPath);
      CALLSHEET_ROW_FIELDS.forEach(function (field) {
        if (!Object.prototype.hasOwnProperty.call(day, field)) return;
        day[field].forEach(function (row, rowIndex) {
          exactShape(row, CALLSHEET_ROW_KEYS[field], dayPath + "." + field + "[" + rowIndex + "]");
        });
      });
    });
    project.scheduleEntries.forEach(function (entry, index) { exactShape(entry, ENTRY_KEYS, "project.scheduleEntries[" + index + "]"); });
    (project.productionTasks || []).forEach(function (task, index) { exactShape(task, PRODUCTION_TASK_KEYS, "project.productionTasks[" + index + "]"); });
    project.assets.forEach(function (asset, index) {
      exactShape(asset, ASSET_KEYS, "project.assets[" + index + "]");
      if (asset.thumbnail !== null) exactShape(asset.thumbnail, THUMBNAIL_KEYS, "project.assets[" + index + "].thumbnail");
    });
    project.drawings.forEach(function (drawing, drawingIndex) {
      const path = "project.drawings[" + drawingIndex + "]";
      exactShape(drawing, DRAWING_KEYS, path);
      exactShape(drawing.canvas, CANVAS_KEYS, path + ".canvas");
      drawing.layers.forEach(function (layer, layerIndex) {
        const layerPath = path + ".layers[" + layerIndex + "]";
        exactShape(layer, LAYER_KEYS, layerPath);
        layer.strokes.forEach(function (stroke, strokeIndex) {
          const strokePath = layerPath + ".strokes[" + strokeIndex + "]";
          exactShape(stroke, STROKE_KEYS, strokePath);
          stroke.points.forEach(function (point, pointIndex) {
            exactShape(point, POINT_KEYS, strokePath + ".points[" + pointIndex + "]");
          });
        });
      });
    });

    const preferences = project.outputPreferences;
    exactShape(preferences, PREFERENCES_KEYS, "project.outputPreferences");
    const fields = requireRecord(preferences.fields, "project.outputPreferences.fields");
    const groupedFields = preferences.schemaVersion === 2 &&
      (Object.prototype.hasOwnProperty.call(fields, "images") || Object.prototype.hasOwnProperty.call(fields, "details"));
    exactShape(fields, groupedFields ? GROUPED_PREFERENCE_FIELDS_KEYS : FLAT_PREFERENCE_FIELDS_KEYS, "project.outputPreferences.fields");
    Object.keys(fields).forEach(function (key) {
      if (key === "images" || key === "details") return;
      if (typeof fields[key] !== "boolean") {
        fail("INVALID_OUTPUT_FIELD", "project.outputPreferences.fields." + key + " 必須是布林值。");
      }
    });
    if (groupedFields) {
      if (Object.prototype.hasOwnProperty.call(fields, "images")) {
        exactShape(fields.images, shape("shotNumber title voiceover super duration"), "project.outputPreferences.fields.images");
      }
      if (Object.prototype.hasOwnProperty.call(fields, "details")) {
        exactShape(fields.details, FLAT_PREFERENCE_FIELDS_KEYS, "project.outputPreferences.fields.details");
      }
    }
    if (Object.prototype.hasOwnProperty.call(preferences, "schedule")) {
      exactShape(preferences.schedule, SCHEDULE_PREFERENCE_KEYS, "project.outputPreferences.schedule");
    }
    if (Object.prototype.hasOwnProperty.call(preferences, "densityByMode")) {
      exactShape(preferences.densityByMode, shape("images details"), "project.outputPreferences.densityByMode");
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
  }

  function ownJsonClone(value, label) {
    try {
      const encoded = JSON.stringify(value);
      if (encoded === undefined) fail("INVALID_PACKAGE", label + " 必須是 JSON 資料。");
      return JSON.parse(encoded);
    } catch (cause) {
      if (cause instanceof PackageCopyError) throw cause;
      fail("INVALID_PACKAGE", label + " 必須是可序列化的 JSON 資料。");
    }
  }

  function bytesSnapshot(value, label) {
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }
    fail("INVALID_PACKAGE_ASSET", label + " 必須包含原始 Uint8Array bytes。");
  }

  function stableJson(value) {
    if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
    if (isRecord(value)) {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + stableJson(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function collectSourceIds(project) {
    const entries = [{ kind: "project", id: project.projectId }];
    function collect(kind, records) {
      records.forEach(function (record) { entries.push({ kind: kind, id: record.id }); });
    }
    collect("scene", project.scenes);
    collect("shot", project.shots);
    collect("day", project.shootingDays);
    collect("entry", project.scheduleEntries);
    collect("productionTask", project.productionTasks || []);
    collect("asset", project.assets);
    collect("drawing", project.drawings);
    project.drawings.forEach(function (drawing) {
      collect("layer", drawing.layers);
      drawing.layers.forEach(function (layer) { collect("stroke", layer.strokes); });
    });
    return entries;
  }

  function getSchema(options) {
    const schema = options && options.schema || (root && root.DirectorStoryboardProjectSchema);
    if (!schema || typeof schema.validateProject !== "function") {
      fail("SCHEMA_UNAVAILABLE", "請先載入 DirectorStoryboardProjectSchema。");
    }
    return schema;
  }

  /**
   * Create an independent, revision-zero Project copy from a verified package.
   * `newId(kind, oldId)` must return a fresh opaque ID. `targetProjectId` may
   * provide the new Project ID directly; it is checked against every old and
   * newly generated ID. This function remaps JSON only and performs no storage.
   */
  function createProjectCopy(input, options) {
    const settings = options || {};
    const metadataOnly = settings.metadataOnly === true;
    const schema = getSchema(settings);
    const envelope = requireRecord(input, "package");
    exactShape(envelope, shape("format formatVersion projectId revision project assets manifest"), "package");
    if (!isRecord(envelope.project) || !Array.isArray(envelope.assets)) {
      fail("INVALID_PACKAGE", "封裝必須包含 canonical Project 與 assets 陣列。");
    }

    let sourceProject;
    try {
      sourceProject = schema.validateProject(envelope.project);
    } catch (cause) {
      fail("INVALID_PROJECT", "另存副本來源 Project 未通過 schema 驗證。", {
        causeCode: cause && cause.code || null,
        causePath: cause && cause.path || null
      });
    }
    checkProjectShape(sourceProject);

    if (Object.prototype.hasOwnProperty.call(envelope, "projectId") && envelope.projectId !== sourceProject.projectId) {
      fail("PACKAGE_IDENTITY_MISMATCH", "封裝 projectId 必須符合 canonical Project。");
    }
    if (Object.prototype.hasOwnProperty.call(envelope, "revision") && envelope.revision !== sourceProject.revision) {
      fail("PACKAGE_IDENTITY_MISMATCH", "封裝 revision 必須符合 canonical Project。");
    }

    const sourceAssetById = new Map(sourceProject.assets.map(function (asset) { return [asset.id, asset]; }));
    const inputAssetById = new Map();
    envelope.assets.forEach(function (asset, index) {
      const path = "package.assets[" + index + "]";
      exactShape(asset, metadataOnly ? shape("projectId id role metadata") : shape("projectId id role metadata bytes"), path);
      requireId(asset.id, path + ".id");
      if (inputAssetById.has(asset.id)) fail("DUPLICATE_ASSET_ID", "封裝含重複 Asset ID。", { id: asset.id });
      if (asset.projectId !== sourceProject.projectId) {
        fail("CROSS_PROJECT_REFERENCE", path + ".projectId 必須符合來源 Project。");
      }
      const metadata = sourceAssetById.get(asset.id);
      if (!metadata) fail("ASSET_METADATA_MISSING", "封裝包含不屬於來源 Project 的 Asset。", { id: asset.id });
      if (asset.role !== metadata.role || !isRecord(asset.metadata) || stableJson(asset.metadata) !== stableJson(metadata)) {
        fail("ASSET_METADATA_MISMATCH", "Asset role/metadata 必須與 canonical Project 一致。", { id: asset.id });
      }
      if (metadataOnly) {
        inputAssetById.set(asset.id, { source: asset, metadata: metadata, bytes: null });
      } else {
        const bytes = bytesSnapshot(asset.bytes, path + ".bytes");
        if (bytes.byteLength !== metadata.byteLength) {
          fail("ASSET_SIZE_MISMATCH", "Asset bytes 長度必須符合 canonical metadata。", {
            id: asset.id,
            expected: metadata.byteLength,
            actual: bytes.byteLength
          });
        }
        inputAssetById.set(asset.id, { source: asset, metadata: metadata, bytes: bytes });
      }
    });
    if (inputAssetById.size !== sourceAssetById.size || Array.from(sourceAssetById.keys()).some(function (id) { return !inputAssetById.has(id); })) {
      fail("ASSET_SET_MISMATCH", "封裝 Asset set 必須恰好對應 canonical Project.assets。", {
        projectAssetIds: Array.from(sourceAssetById.keys()),
        packageAssetIds: Array.from(inputAssetById.keys())
      });
    }

    const sourceIds = collectSourceIds(sourceProject);
    const sourceIdSet = new Set(sourceIds.map(function (entry) { return entry.id; }));
    if (sourceIdSet.size !== sourceIds.length) {
      fail("DUPLICATE_ID", "來源 Project 內可變實體 ID 必須全域唯一。");
    }
    sourceProject.shootingDays.forEach(function (day) {
      CALLSHEET_ROW_FIELDS.forEach(function (field) {
        (day[field] || []).forEach(function (row) { sourceIdSet.add(row.id); });
      });
    });
    if (typeof settings.newId !== "function") {
      fail("ID_FACTORY_REQUIRED", "另存副本需要明確提供 newId(kind, oldId) 產生器。");
    }

    const newIds = new Set();
    const idRemap = [];
    const remap = new Map();
    function registerId(kind, oldId, proposed) {
      const nextId = requireId(proposed, "newId(" + kind + ")");
      if (sourceIdSet.has(nextId) || newIds.has(nextId)) {
        fail("ID_COLLISION", "新 ID 必須不同於來源所有 ID 與此副本已配置的 ID。", {
          kind: kind,
          sourceId: oldId,
          proposedId: nextId
        });
      }
      newIds.add(nextId);
      remap.set(oldId, nextId);
      idRemap.push({ kind: kind, from: oldId, to: nextId });
      return nextId;
    }

    function registerCallsheetRowId(kind, oldId) {
      const nextId = requireId(settings.newId(kind, oldId), "newId(" + kind + ")");
      if (sourceIdSet.has(nextId) || newIds.has(nextId)) {
        fail("ID_COLLISION", "新 ID 必須不同於來源所有 ID 與此副本已配置的 ID。", {
          kind: kind,
          sourceId: oldId,
          proposedId: nextId
        });
      }
      newIds.add(nextId);
      idRemap.push({ kind: kind, from: oldId, to: nextId });
      return nextId;
    }

    const targetProjectId = Object.prototype.hasOwnProperty.call(settings, "targetProjectId")
      ? settings.targetProjectId
      : settings.newId("project", sourceProject.projectId);
    registerId("project", sourceProject.projectId, targetProjectId);
    sourceIds.slice(1).forEach(function (entry) {
      registerId(entry.kind, entry.id, settings.newId(entry.kind, entry.id));
    });

    function mapped(id, label) {
      if (id === null) return null;
      const nextId = remap.get(id);
      if (!nextId) fail("UNMAPPED_REFERENCE", label + " 沒有對應的 ID remap。", { id: id });
      return nextId;
    }

    const project = ownJsonClone(sourceProject, "Project copy");
    project.projectId = mapped(project.projectId, "project.projectId");
    project.revision = 0;
    project.scenes.forEach(function (scene) {
      scene.projectId = project.projectId;
      scene.id = mapped(scene.id, "scene.id");
    });
    project.sceneOrder = project.sceneOrder.map(function (id) { return mapped(id, "sceneOrder"); });
    project.shots.forEach(function (shot) {
      shot.projectId = project.projectId;
      shot.id = mapped(shot.id, "shot.id");
      shot.sceneId = mapped(shot.sceneId, "shot.sceneId");
      shot.assetIds = shot.assetIds.map(function (id) { return mapped(id, "shot.assetIds"); });
      if (Object.prototype.hasOwnProperty.call(shot, "photoCropsByAssetId")) {
        const photoCropsByAssetId = Object.create(null);
        Object.keys(shot.photoCropsByAssetId).forEach(function (assetId) {
          photoCropsByAssetId[mapped(assetId, "shot.photoCropsByAssetId key")] = shot.photoCropsByAssetId[assetId];
        });
        shot.photoCropsByAssetId = photoCropsByAssetId;
      }
      shot.drawingIds = shot.drawingIds.map(function (id) { return mapped(id, "shot.drawingIds"); });
    });
    const shotOrderByScene = Object.create(null);
    Object.keys(project.shotOrderByScene).forEach(function (sceneId) {
      shotOrderByScene[mapped(sceneId, "shotOrderByScene key")] = project.shotOrderByScene[sceneId].map(function (id) {
        return mapped(id, "shotOrderByScene value");
      });
    });
    project.shotOrderByScene = shotOrderByScene;
    project.shootingDays.forEach(function (day) {
      day.projectId = project.projectId;
      day.id = mapped(day.id, "shootingDay.id");
      CALLSHEET_ROW_FIELDS.forEach(function (field) {
        (day[field] || []).forEach(function (row) {
          row.id = registerCallsheetRowId(CALLSHEET_ROW_ID_KINDS[field], row.id);
        });
      });
    });
    project.shootingDayOrder = project.shootingDayOrder.map(function (id) { return mapped(id, "shootingDayOrder"); });
    project.scheduleEntries.forEach(function (entry) {
      entry.projectId = project.projectId;
      entry.id = mapped(entry.id, "scheduleEntry.id");
      entry.dayId = mapped(entry.dayId, "scheduleEntry.dayId");
      entry.shotId = mapped(entry.shotId, "scheduleEntry.shotId");
    });
    const scheduleOrderByDay = Object.create(null);
    Object.keys(project.scheduleOrderByDay).forEach(function (dayId) {
      scheduleOrderByDay[mapped(dayId, "scheduleOrderByDay key")] = project.scheduleOrderByDay[dayId].map(function (id) {
        return mapped(id, "scheduleOrderByDay value");
      });
    });
    project.scheduleOrderByDay = scheduleOrderByDay;
    if (Object.prototype.hasOwnProperty.call(project, "productionTasks")) {
      project.productionTasks.forEach(function (task) {
        task.projectId = project.projectId;
        task.id = mapped(task.id, "productionTask.id");
      });
      project.productionTaskOrder = project.productionTaskOrder.map(function (id) { return mapped(id, "productionTaskOrder"); });
    }
    if (Object.prototype.hasOwnProperty.call(project, "productionTimelineOrder")) {
      project.productionTimelineOrder.forEach(function (row) {
        if (row.kind === "productionTask") row.id = mapped(row.id, "productionTimelineOrder.id");
      });
    }
    project.assets.forEach(function (asset) {
      asset.projectId = project.projectId;
      asset.id = mapped(asset.id, "asset.id");
    });
    project.drawings.forEach(function (drawing) {
      drawing.projectId = project.projectId;
      drawing.id = mapped(drawing.id, "drawing.id");
      drawing.shotId = mapped(drawing.shotId, "drawing.shotId");
      drawing.backgroundAssetId = mapped(drawing.backgroundAssetId, "drawing.backgroundAssetId");
      drawing.previewAssetId = mapped(drawing.previewAssetId, "drawing.previewAssetId");
      drawing.layers.forEach(function (layer) {
        layer.projectId = project.projectId;
        layer.drawingId = mapped(layer.drawingId, "layer.drawingId");
        layer.id = mapped(layer.id, "layer.id");
        layer.strokes.forEach(function (stroke) { stroke.id = mapped(stroke.id, "stroke.id"); });
      });
    });
    if (project.outputPreferences.schedule && project.outputPreferences.schedule.selectedDayId !== null) {
      project.outputPreferences.schedule.selectedDayId = mapped(project.outputPreferences.schedule.selectedDayId, "outputPreferences.schedule.selectedDayId");
    }

    let canonicalProject;
    try {
      canonicalProject = schema.validateProject(project);
    } catch (cause) {
      fail("INVALID_REMAPPED_PROJECT", "另存副本 remap 結果未通過 schema 驗證。", {
        causeCode: cause && cause.code || null,
        causePath: cause && cause.path || null
      });
    }

    const assets = canonicalProject.assets.map(function (metadata) {
      const source = inputAssetById.get(idRemap.find(function (entry) { return entry.to === metadata.id; }).from);
      if (metadataOnly) {
        return {
          projectId: canonicalProject.projectId,
          id: metadata.id,
          role: metadata.role,
          metadata: ownJsonClone(metadata, "Asset metadata copy")
        };
      }
      return {
        projectId: canonicalProject.projectId,
        id: metadata.id,
        role: metadata.role,
        metadata: ownJsonClone(metadata, "Asset metadata copy"),
        bytes: new Uint8Array(source.bytes)
      };
    });

    return {
      projectId: canonicalProject.projectId,
      revision: canonicalProject.revision,
      project: canonicalProject,
      assets: assets,
      sourceProjectId: sourceProject.projectId,
      sourceRevision: sourceProject.revision,
      idRemap: idRemap
    };
  }

  return Object.freeze({
    PackageCopyError: PackageCopyError,
    createProjectCopy: createProjectCopy
  });
});
