(function attachKinoSequenceEditor(root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.KinoSequenceEditor = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function createKinoSequenceEditor(root) {
  "use strict";

  const states = new Map();
  const stateByHost = new WeakMap();
  const statesByModel = new WeakMap();
  const modelSubscriptions = new WeakMap();
  const TEXT_FIELDS = ["visual", "script", "super"];
  let renderSequence = 0;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function errorText(error) {
    return (error && error.code ? error.code + " · " : "") + (error && error.message ? error.message : "保存失敗；草稿仍保留。");
  }

  function frameId() {
    try {
      if (root && root.crypto && typeof root.crypto.randomUUID === "function") return "sequence-" + root.crypto.randomUUID();
    } catch (_) {}
    return "sequence-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function frameLabel(index) {
    let number = Math.max(0, Number(index) || 0) + 1;
    let result = "";
    while (number > 0) {
      number -= 1;
      result = String.fromCharCode(65 + number % 26) + result;
      number = Math.floor(number / 26);
    }
    return result;
  }

  function keyFor(options) {
    const snapshot = !options.projectId && !options.shot.projectId && options.model && typeof options.model.getState === "function"
      ? options.model.getState() : null;
    const projectId = options.projectId || options.shot.projectId || snapshot && snapshot.projectId || "";
    return { key: String(projectId) + "\u0000" + String(options.shot.id), projectId: projectId };
  }

  function emptyDraft() {
    return { frameId: frameId(), values: { visual: "", script: "", super: "" }, errors: {}, versions: {} };
  }

  function getState(options) {
    if (!options || !options.host || !options.model || !options.shot || !options.shot.id) {
      throw new TypeError("連續分鏡需要 host、model 與 shot。");
    }
    const identity = keyFor(options);
    let state = states.get(identity.key);
    if (!state) {
      state = {
        key: identity.key,
        projectId: identity.projectId,
        shotId: options.shot.id,
        host: null,
        model: options.model,
        shot: options.shot,
        shotNumber: options.shotNumber || "",
        onError: null,
        onChange: null,
        enabled: false,
        expanded: false,
        trailing: emptyDraft(),
        drafts: new Map(),
        photoUrls: new Map(),
        drawingUrls: new Map(),
        photoLoads: new Set(),
        drawingLoads: new Set(),
        photoErrors: new Map(),
        drawingErrors: new Map(),
        photoInput: null,
        photoTarget: null,
        photoSession: null,
        drawingSession: null,
        trailingTimer: null,
        trailingSaving: null,
        focusInfo: null,
        forceFocus: false,
        dragGesture: null,
        deferredRender: false,
        suppressClick: false,
        suppressClickTimer: null,
        listeners: null,
        renderVersion: 0,
        mutationPending: 0,
        projectBlocked: false,
        unsubscribeData: null
      };
      states.set(identity.key, state);
      bindModel(state);
    }
    if (state.host && state.host !== options.host) {
      cancelPointerDrag(state);
      if (!state.host.isConnected) releasePreviews(state);
    }
    state.projectId = identity.projectId;
    state.shot = options.shot;
    state.model = options.model;
    state.shotNumber = options.shotNumber || state.shotNumber || "";
    state.onError = typeof options.onError === "function" ? options.onError : null;
    state.onChange = typeof options.onChange === "function" ? options.onChange : null;
    state.host = options.host;
    stateByHost.set(options.host, state);
    bindHost(state, options.host);
    return state;
  }

  function sequenceFrames(state) {
    let frames = null;
    try {
      if (typeof state.model.getSequenceFrames === "function") frames = state.model.getSequenceFrames(state.shotId);
    } catch (error) { report(state, error); }
    if (!Array.isArray(frames) || !frames.length) {
      const shot = state.shot || {};
      const rootId = shot.sequenceFrameId || shot.id;
      frames = [{
        id: rootId,
        isMaster: true,
        visual: shot.visual || "",
        script: shot.script || "",
        super: shot.super || "",
        assetIds: Array.isArray(shot.assetIds) ? shot.assetIds.slice() : [],
        photoCropsByAssetId: shot.photoCropsByAssetId || {},
        drawingIds: Array.isArray(shot.drawingIds) ? shot.drawingIds.slice() : []
      }].concat(Array.isArray(shot.sequenceFrames) ? shot.sequenceFrames : []);
    }
    return frames;
  }

  function isMaster(frame, index) {
    return frame && frame.isMaster === true || index === 0;
  }

  function writable(state) {
    if (state.projectBlocked) return false;
    try {
      const lifecycle = state.model && typeof state.model.getLifecycle === "function" ? state.model.getLifecycle() : null;
      if (!lifecycle) return true;
      return lifecycle.writable !== false && lifecycle.phase !== "save_failed";
    } catch (_) { return false; }
  }

  function projectSnapshot(state) {
    try {
      const project = state.model && typeof state.model.getProject === "function" ? state.model.getProject() : null;
      return project && project.projectId === state.projectId ? project : null;
    } catch (_) { return null; }
  }

  function targetIsCurrent(state, id, placeholder) {
    const project = projectSnapshot(state);
    if (!project || !Array.isArray(project.shots) || !project.shots.some(function (shot) { return shot.id === state.shotId; })) return false;
    if (placeholder && id === state.trailing.frameId) return true;
    return sequenceFrames(state).some(function (frame) { return frame.id === id; });
  }

  function bindModel(state) {
    if (!state.model || typeof state.model.subscribe !== "function") return;
    let modelStates = statesByModel.get(state.model);
    if (!modelStates) {
      modelStates = new Set();
      statesByModel.set(state.model, modelStates);
    }
    modelStates.add(state);
    if (modelSubscriptions.has(state.model)) return;
    try {
      const unsubscribe = state.model.subscribe(function (snapshot) {
        modelStates.forEach(function (currentState) { handleModelSnapshot(currentState, snapshot); });
      });
      modelSubscriptions.set(state.model, unsubscribe);
    } catch (_) { modelSubscriptions.set(state.model, null); }
  }

  function handleModelSnapshot(state, snapshot) {
    const current = snapshot && snapshot.projectId === state.projectId && Array.isArray(snapshot.shots) &&
      snapshot.shots.some(function (shot) { return shot.id === state.shotId; });
    state.projectBlocked = !current;
    if (!current) {
      if (state.trailingTimer) { clearTimeout(state.trailingTimer); state.trailingTimer = null; }
      cancelPointerDrag(state);
      releasePreviews(state);
      if (state.photoTarget) state.photoTarget.blocked = true;
      lockPhotoSession(state, "專案或鏡頭已切換；照片沒有保存。");
      lockDrawingSession(state, "專案或鏡頭已切換；手繪保存已停用。");
    } else {
      const frames = sequenceFrames(state);
      if (state.dragGesture && (!state.host || state.host !== state.dragGesture.host || !state.host.isConnected ||
          !frames.some(function (frame) { return frame.id === state.dragGesture.sourceFrameId; }) ||
          !sameIdOrder(frames.map(function (frame) { return frame.id; }), state.dragGesture.baseFrameIds))) cancelPointerDrag(state);
      if (!state.dragGesture) flushDeferredRender(state);
      if (state.photoTarget && !state.photoTarget.placeholder && !frames.some(function (frame) { return frame.id === state.photoTarget.frameId; })) {
        state.photoTarget.blocked = true;
        lockPhotoSession(state, "目標連續分鏡已刪除；照片沒有保存。");
      }
      if (state.drawingSession && !state.drawingSession.placeholder &&
          !frames.some(function (frame) { return frame.id === state.drawingSession.frameId; })) {
        lockDrawingSession(state, "目標連續分鏡已刪除；手繪保存已停用。");
      }
    }
    refreshStateControls(state);
  }

  function report(state, error) {
    if (state.onError) {
      try { state.onError(error); } catch (_) {}
    }
  }

  function refreshStateControls(state) {
    const host = state.host;
    if (!host || !host.isConnected) {
      releasePreviews(state);
      return;
    }
    const project = projectSnapshot(state);
    const current = project && Array.isArray(project.shots) &&
      project.shots.some(function (shot) { return shot.id === state.shotId; });
    if (!current) {
      state.projectBlocked = true;
      host.querySelectorAll("[data-sequence-field]").forEach(function (field) { field.disabled = true; });
      host.querySelectorAll("[data-sequence-action]").forEach(function (button) { button.disabled = true; });
      releasePreviews(state);
      return;
    }
    state.projectBlocked = false;
    const canEdit = writable(state);
    const frames = sequenceFrames(state);
    host.querySelectorAll("[data-sequence-field]").forEach(function (field) { field.disabled = !canEdit; });
    host.querySelectorAll("[data-sequence-action]").forEach(function (button) {
      const action = button.dataset.sequenceAction;
      if (action === "toggle") return;
      const id = button.dataset.sequenceFrameId;
      const index = frames.findIndex(function (frame) { return frame.id === id; });
      const fixedDisabled = action === "move-up" && index <= 0 ||
        action === "move-down" && (index < 0 || index >= frames.length - 1) ||
        action === "delete" && frames.length < 2;
      const photoAvailable = root.DirectorStoryboardPhotoCropEditor &&
        typeof root.DirectorStoryboardPhotoCropEditor.mount === "function" &&
        (button.dataset.sequencePlaceholder === "true"
          ? typeof state.model.addSequenceFrameWithPhoto === "function"
          : typeof state.model.addShotPhotos === "function" && typeof state.model.replaceShotPhoto === "function");
      const drawingAvailable = root.DirectorStoryboardDrawingEditor &&
        typeof root.DirectorStoryboardDrawingEditor.mount === "function" &&
        typeof state.model.createDrawingForShotWithInitialEdit === "function";
      button.disabled = !canEdit || fixedDisabled ||
        action === "photo" && !photoAvailable ||
        action === "drawing" && !drawingAvailable;
    });
  }

  function refreshControls() {
    states.forEach(refreshStateControls);
  }

  function lockPhotoSession(state, message) {
    const session = state.photoSession;
    if (!session) return;
    session.blocked = true;
    const editor = session.editor && session.editor.editor;
    if (editor) {
      if (editor.confirmButton) editor.confirmButton.disabled = true;
      if (typeof editor.setStatus === "function") editor.setStatus(message, true);
    }
  }

  function lockDrawingSession(state, message) {
    const session = state.drawingSession;
    if (!session || !session.handle) return;
    try {
      const update = session.handle.update({ writable: false, readOnlyReason: message });
      if (update && typeof update.catch === "function") update.catch(function () {});
    } catch (_) {
      const editor = session.handle.editor;
      if (editor && typeof editor.update === "function") {
        try {
          const update = editor.update({ writable: false, readOnlyReason: message });
          if (update && typeof update.catch === "function") update.catch(function () {});
        } catch (_) {}
      }
    }
  }

  function draftFor(state, id) {
    let draft = state.drafts.get(id);
    if (!draft) {
      draft = { values: {}, errors: {}, versions: {} };
      state.drafts.set(id, draft);
    }
    return draft;
  }

  function fieldValue(state, frame, field, placeholder) {
    const draft = placeholder ? state.trailing : draftFor(state, frame.id);
    return Object.prototype.hasOwnProperty.call(draft.values, field) ? draft.values[field] : (frame[field] == null ? "" : String(frame[field]));
  }

  function displayError(state, frame, placeholder) {
    const draft = placeholder ? state.trailing : draftFor(state, frame.id);
    const key = TEXT_FIELDS.find(function (field) { return draft.errors[field]; });
    return key ? errorText(draft.errors[key]) : "";
  }

  function icon(name) {
    const paths = {
      photo: "M4 7h3l1.4-2h7.2L17 7h3v12H4zM12 10a3.2 3.2 0 1 0 0 6.4A3.2 3.2 0 0 0 12 10z",
      draw: "M4 16.5 16.4 4.1a2.1 2.1 0 0 1 3 3L7 19.5 3.5 20.5 4 17z",
      up: "m6 14 6-6 6 6",
      down: "m6 10 6 6 6-6",
      trash: "M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3",
      chevron: "m8 10 4 4 4-4"
    };
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + (paths[name] || paths.photo) + '"></path></svg>';
  }

  function control(action, frame, label, iconName, disabled) {
    return '<button type="button" class="sequence-tool" data-sequence-action="' + action + '" data-sequence-frame-id="' + escapeHtml(frame.id) + '" aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(label) + '"' + (disabled ? " disabled" : "") + '>' + icon(iconName) + '</button>';
  }

  function photoMarkup(state, frame, index, placeholder) {
    const assetIds = Array.isArray(frame.assetIds) ? frame.assetIds : [];
    const assetId = assetIds[0] || "";
    const drawingIds = Array.isArray(frame.drawingIds) ? frame.drawingIds : [];
    const drawing = drawingIds.length ? state.drawingUrls.get(frame.id) : null;
    const drawingError = drawingIds.length && state.drawingErrors.get(frame.id);
    const cached = assetId && state.photoUrls.get(frame.id);
    const url = cached && cached.assetId === assetId ? cached.url : "";
    const photoError = assetId && state.photoErrors.get(frame.id);
    let content = "";
    if (drawing && drawing.id === drawingIds[0]) {
      content = '<img class="sequence-drawing-image" src="' + escapeHtml(drawing.url) + '" alt="" draggable="false">';
    } else if (drawingError) {
      content = '<span class="sequence-photo-note is-error">手繪預覽失敗</span>';
    } else if (drawingIds.length) {
      content = '<span class="sequence-photo-note">載入手繪…</span>';
    } else if (url) {
      content = photoPreviewMarkup(state, frame, assetId, cached);
    } else if (photoError) {
      content = '<span class="sequence-photo-note is-error">照片讀取失敗</span>';
    } else if (assetId) {
      content = '<span class="sequence-photo-note">載入照片…</span>';
    } else {
      content = '<span class="sequence-photo-note">' + (placeholder ? "＋照片" : "點圖加入照片") + '</span>';
    }
    const label = (state.shotNumber ? state.shotNumber + " " : "") + frameLabel(index) + " 照片";
    const disabled = !writable(state);
    return '<div class="sequence-image-cell"><button type="button" class="sequence-photo" data-sequence-action="photo" data-sequence-frame-id="' + escapeHtml(frame.id) + '"' +
      (placeholder ? ' data-sequence-placeholder="true"' : "") + ' aria-label="' + escapeHtml((assetId ? "更新" : "加入") + label) + '" title="' + escapeHtml((assetId ? "更新" : "加入") + label) + '"' +
      (disabled ? " disabled" : "") + '><span class="sequence-photo-content">' + content + '</span></button>' +
      '<button type="button" class="sequence-draw-tool" data-sequence-action="drawing" data-sequence-frame-id="' + escapeHtml(frame.id) + '"' +
      (placeholder ? ' data-sequence-placeholder="true"' : "") + ' aria-label="' + escapeHtml((state.shotNumber ? state.shotNumber + " " : "") + frameLabel(index) + " 編輯手繪") + '" title="手繪"' +
      (disabled ? " disabled" : "") + '>' + icon("draw") + '</button></div>';
  }

  function photoPreviewMarkup(state, frame, assetId, cached) {
    const crop = frame.photoCropsByAssetId && frame.photoCropsByAssetId[assetId];
    const src = ' src="' + escapeHtml(cached.url) + '"';
    if (!crop) return '<img class="sequence-photo-image" ' + src + ' alt="" draggable="false">';
    const sourceWidth = Number(cached.width);
    const sourceHeight = Number(cached.height);
    const cropAspect = sourceWidth > 0 && sourceHeight > 0
      ? sourceWidth * crop.width / (sourceHeight * crop.height)
      : projectAspectRatio(state, 16 / 9);
    const frameAspect = projectAspectRatio(state, cropAspect);
    const viewport = cropAspect > frameAspect
      ? { width: 100, height: frameAspect / cropAspect * 100 }
      : { width: cropAspect / frameAspect * 100, height: 100 };
    const imageStyle = "position:absolute;width:" + (100 / crop.width) + "%;height:" + (100 / crop.height) +
      "%;left:" + (-crop.x / crop.width * 100) + "%;top:" + (-crop.y / crop.height * 100) +
      "%;max-width:none;max-height:none;object-fit:fill";
    return '<span class="sequence-photo-crop-frame"><span class="sequence-photo-crop-viewport" style="width:' +
      viewport.width + '%;height:' + viewport.height + '%"><img class="sequence-photo-image" ' + src +
      ' alt="" draggable="false" style="' + imageStyle + '"></span></span>';
  }

  function projectAspectRatio(state, fallback) {
    const project = projectSnapshot(state);
    const value = project && project.aspectRatio;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (match && Number(match[1]) > 0 && Number(match[2]) > 0) return Number(match[1]) / Number(match[2]);
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  }

  function fieldsMarkup(state, frame, index, placeholder) {
    const disabled = writable(state) ? "" : " disabled";
    const labels = { visual: "畫面", script: "VO", super: "SUPER" };
    const placeholders = { visual: "畫面描述…", script: "台詞／旁白…", super: "字卡…" };
    return TEXT_FIELDS.map(function (field) {
      return '<label class="sequence-field-wrap"><span class="sequence-field-label">' + labels[field] + '</span><textarea class="sequence-field" rows="' + (field === "visual" ? "2" : "1") + '" data-sequence-field="' + field + '"' +
        ' data-sequence-frame-id="' + escapeHtml(frame.id) + '"' + (placeholder ? ' data-sequence-placeholder="true"' : "") +
        ' aria-label="' + escapeHtml((state.shotNumber ? state.shotNumber + " " : "") + frameLabel(index) + " " + labels[field]) + '"' +
        ' placeholder="' + placeholders[field] + '"' + disabled + '>' + escapeHtml(fieldValue(state, frame, field, placeholder)) + '</textarea></label>';
    }).join("");
  }

  function rowMarkup(state, frame, index, options) {
    const placeholder = options.placeholder === true;
    const total = options.total;
    const prefix = (state.shotNumber ? state.shotNumber + " " : "") + frameLabel(index);
    const error = displayError(state, frame, placeholder);
    const disabled = !writable(state);
    return '<div class="sequence-frame-row' + (placeholder ? " is-placeholder" : "") + '"' +
      (placeholder ? ' data-sequence-placeholder-row="true"' : ' data-sequence-saved-frame="true"') +
      ' data-sequence-frame-id="' + escapeHtml(frame.id) + '">' +
      '<div class="sequence-frame-index" aria-label="' + escapeHtml(prefix) + '">' + frameLabel(index) + '</div>' +
      photoMarkup(state, frame, index, placeholder) +
      '<div class="sequence-frame-fields">' + fieldsMarkup(state, frame, index, placeholder) +
      (error ? '<span class="sequence-error" role="alert">' + escapeHtml(error) + '</span>' : "") +
      '</div><div class="sequence-frame-tools">' +
      (placeholder ? "" : control("move-up", frame, "上移 " + prefix, "up", disabled || index <= 0)) +
      (placeholder ? "" : control("move-down", frame, "下移 " + prefix, "down", disabled || index >= total - 1)) +
      (placeholder ? "" : control("delete", frame, "刪除 " + prefix, "trash", disabled)) +
      '</div></div>';
  }

  function renderMarkup(state, frames) {
    const savedCount = frames.length;
    const hasSavedExtras = savedCount > 1;
    if (hasSavedExtras) state.enabled = true;
    if (!state.enabled) return "";
    const expanded = state.expanded;
    const totalWithPlaceholder = savedCount + 1;
    const toggleLabel = expanded ? "收合連續分鏡" : "展開連續分鏡";
    const summary = hasSavedExtras ? (savedCount + " 張") : "新增中";
    let markup = '<section class="sequence-editor' + (expanded ? " is-expanded" : "") + '" aria-label="連續分鏡" data-sequence-editor="true">' +
      '<div class="sequence-group-head"><button type="button" class="sequence-toggle" data-sequence-action="toggle" aria-expanded="' + (expanded ? "true" : "false") + '">' +
      '<span class="sequence-track" aria-hidden="true">' + frames.map(function (_, index) { return frameLabel(index); }).join('<span class="sequence-track-arrow">›</span>') +
      (expanded ? "" : '<span class="sequence-track-arrow">›</span><span class="sequence-track-draft">' + frameLabel(savedCount) + '</span>') + '</span>' +
      '<span class="sequence-summary">' + summary + '</span>' + icon("chevron") +
      '<span class="sequence-sr-only">' + toggleLabel + '</span></button>' +
      '<div class="sequence-master-tools">' +
      control("move-down", frames[0], "下移 A", "down", !hasSavedExtras || !writable(state)) +
      (hasSavedExtras ? control("delete", frames[0], "刪除 A；下一格將成為 A", "trash", !writable(state)) : "") +
      '</div></div>';
    markup += '<div class="sequence-frames"' + (expanded ? "" : " hidden") + '>';
    if (hasSavedExtras) {
      frames.slice(1).forEach(function (frame, extraIndex) {
        markup += rowMarkup(state, frame, extraIndex + 1, { placeholder: false, total: savedCount });
      });
    }
    markup += rowMarkup(state, {
      id: state.trailing.frameId,
      visual: "",
      script: "",
      super: "",
      assetIds: [],
      photoCropsByAssetId: {},
      drawingIds: []
    }, savedCount, { placeholder: true, total: totalWithPlaceholder }) + '</div></section>';
    return markup;
  }

  function activeFieldSnapshot(state, host) {
    const active = root && root.document && root.document.activeElement;
    const field = active && active.matches && active.matches("[data-sequence-field]") && host.contains(active) ? active : null;
    if (field) {
      state.focusInfo = {
        frameId: field.dataset.sequenceFrameId,
        field: field.dataset.sequenceField,
        placeholder: field.dataset.sequencePlaceholder === "true",
        start: typeof field.selectionStart === "number" ? field.selectionStart : null,
        end: typeof field.selectionEnd === "number" ? field.selectionEnd : null
      };
    }
    return field;
  }

  function bindHost(state, host) {
    if (host.__kinoSequenceListeners) return;
    const input = function (event) {
      const field = event.target && event.target.closest ? event.target.closest("[data-sequence-field]") : null;
      if (!field || !host.contains(field)) return;
      const placeholder = field.dataset.sequencePlaceholder === "true";
      const id = field.dataset.sequenceFrameId;
      const name = field.dataset.sequenceField;
      const draft = placeholder ? state.trailing : draftFor(state, id);
      draft.values[name] = field.value;
      draft.versions[name] = Number(draft.versions[name] || 0) + 1;
      delete draft.errors[name];
      growField(field);
      state.focusInfo = {
        frameId: id,
        field: name,
        placeholder: placeholder,
        start: typeof field.selectionStart === "number" ? field.selectionStart : null,
        end: typeof field.selectionEnd === "number" ? field.selectionEnd : null
      };
      const error = field.closest(".sequence-frame-row") && field.closest(".sequence-frame-row").querySelector(".sequence-error");
      if (error) error.remove();
      if (placeholder) queueTrailingCommit(state, false);
    };
    const focusin = function (event) {
      const field = event.target && event.target.closest ? event.target.closest("[data-sequence-field]") : null;
      if (!field || !host.contains(field)) return;
      state.focusInfo = {
        frameId: field.dataset.sequenceFrameId,
        field: field.dataset.sequenceField,
        placeholder: field.dataset.sequencePlaceholder === "true",
        start: typeof field.selectionStart === "number" ? field.selectionStart : null,
        end: typeof field.selectionEnd === "number" ? field.selectionEnd : null
      };
    };
    const focusout = function (event) {
      const field = event.target && event.target.closest ? event.target.closest("[data-sequence-field]") : null;
      if (!field || !host.contains(field)) return;
      saveFieldOnBlur(state, field);
      const stored = state.focusInfo;
      setTimeout(function () {
        const active = root && root.document && root.document.activeElement;
        if (stored && state.focusInfo === stored && active && !host.contains(active) && active !== root.document.body && active !== root.document.documentElement) {
          state.focusInfo = null;
        }
      }, 0);
    };
    const compositionstart = function (event) {
      const field = event.target && event.target.closest ? event.target.closest("[data-sequence-field]") : null;
      if (field && host.contains(field)) {
        field.dataset.sequenceComposing = "true";
        state.composing = state.composing || new Set();
        state.composing.add(field.dataset.sequenceFrameId + "\u0000" + field.dataset.sequenceField);
        if (state.trailingTimer) { clearTimeout(state.trailingTimer); state.trailingTimer = null; }
      }
    };
    const compositionend = function (event) {
      const field = event.target && event.target.closest ? event.target.closest("[data-sequence-field]") : null;
      if (field && host.contains(field)) {
        delete field.dataset.sequenceComposing;
        if (state.composing) state.composing.delete(field.dataset.sequenceFrameId + "\u0000" + field.dataset.sequenceField);
        if (field.dataset.sequencePlaceholder === "true") queueTrailingCommit(state, false);
      }
    };
    const click = function (event) {
      if (state.suppressClick) {
        state.suppressClick = false;
        if (state.suppressClickTimer) { clearTimeout(state.suppressClickTimer); state.suppressClickTimer = null; }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const button = event.target && event.target.closest ? event.target.closest("[data-sequence-action]") : null;
      if (!button || !host.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.sequenceAction;
      const id = button.dataset.sequenceFrameId;
      if (action !== "toggle") state.focusInfo = null;
      if (action === "toggle") {
        state.expanded = !state.expanded;
        renderState(state, true);
        const toggle = state.host && state.host.querySelector(".sequence-toggle");
        if (toggle) toggle.focus({ preventScroll: true });
      } else if (action === "photo") openPhotoPicker(state, id, button.dataset.sequencePlaceholder === "true");
      else if (action === "drawing") openDrawingEditor(state, id, button.dataset.sequencePlaceholder === "true");
      else if (action === "move-up" || action === "move-down") void moveFrame(state, id, action === "move-up" ? -1 : 1);
      else if (action === "delete") void deleteFrame(state, id);
    };
    const pointerdown = function (event) { sequencePointerDown(state, host, event); };
    const pointermove = function (event) { sequencePointerMove(state, host, event); };
    const pointerup = function (event) { sequencePointerUp(state, host, event, true); };
    const pointercancel = function (event) { sequencePointerUp(state, host, event, false); };
    const lostpointercapture = function (event) {
      const gesture = state.dragGesture;
      if (gesture && gesture.host === host && gesture.pointerId === event.pointerId) {
        cancelPointerDrag(state);
        flushDeferredRender(state);
      }
    };
    const listeners = {
      input: input, focusin: focusin, focusout: focusout, compositionstart: compositionstart,
      compositionend: compositionend, click: click, pointerdown: pointerdown, pointermove: pointermove,
      pointerup: pointerup, pointercancel: pointercancel, lostpointercapture: lostpointercapture
    };
    Object.keys(listeners).forEach(function (type) { host.addEventListener(type, listeners[type]); });
    host.__kinoSequenceListeners = listeners;
  }

  function renderState(state, restoreFocus) {
    const host = state.host;
    if (!host) return;
    if (state.dragGesture) {
      state.deferredRender = true;
      refreshStateControls(state);
      return;
    }
    state.deferredRender = false;
    const active = activeFieldSnapshot(state, host);
    const focusInfo = state.focusInfo;
    const activeElement = root && root.document && root.document.activeElement;
    const shouldRestore = Boolean(focusInfo && (active || activeElement === root.document.body || activeElement === root.document.documentElement));
    const frames = sequenceFrames(state);
    const hasExtras = frames.length > 1;
    if (hasExtras) state.enabled = true;
    if (!state.enabled || !frames.length) {
      host.replaceChildren();
      state.renderVersion = ++renderSequence;
      return;
    }
    host.innerHTML = renderMarkup(state, frames);
    growFields(host);
    state.renderVersion = ++renderSequence;
    if (state.expanded && host.isConnected) ensureFramePreviews(state, frames);
    else releasePreviews(state);
    refreshStateControls(state);
    if (!restoreFocus && !shouldRestore) return;
    const focus = state.forceFocus ? { placeholder: true, field: "visual", frameId: state.trailing.frameId } : focusInfo;
    state.forceFocus = false;
    if (!focus) return;
    const selector = '[data-sequence-frame-id="' + cssEscape(focus.frameId) + '"][data-sequence-field="' + cssEscape(focus.field) + '"]';
    const target = host.querySelector(selector);
    if (target) {
      target.focus({ preventScroll: true });
      if (focus.start != null && typeof target.setSelectionRange === "function") {
        try { target.setSelectionRange(focus.start, focus.end == null ? focus.start : focus.end); } catch (_) {}
      }
    }
  }

  function growField(field) {
    if (!field || !field.style) return;
    field.style.height = "auto";
    field.style.height = Math.max(field.scrollHeight || 0, 1) + "px";
  }

  function growFields(host) {
    if (!host || !host.querySelectorAll) return;
    host.querySelectorAll(".sequence-field").forEach(growField);
  }

  function cssEscape(value) {
    if (root && root.CSS && typeof root.CSS.escape === "function") return root.CSS.escape(String(value));
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function render(options) {
    const state = getState(options);
    renderState(state, false);
    return state;
  }

  function begin(options) {
    const state = getState(options);
    state.enabled = true;
    state.expanded = true;
    state.forceFocus = true;
    renderState(state, true);
    return state;
  }

  function isExpanded(shotId, projectId) {
    const prefix = String(projectId || "") + "\u0000" + String(shotId);
    const exact = states.get(prefix);
    if (exact) return exact.expanded;
    for (const state of states.values()) {
      if (state.shotId === shotId && (!projectId || state.projectId === projectId)) return state.expanded;
    }
    return false;
  }

  function isEnabled(shotId, projectId) {
    const id = String(projectId || "") + "\u0000" + String(shotId);
    return !!(states.get(id) && states.get(id).enabled);
  }

  function meaningful(draft) {
    return TEXT_FIELDS.some(function (field) { return String(draft.values[field] || "").trim() !== ""; });
  }

  function draftPatch(draft) {
    return {
      visual: String(draft.values.visual || ""),
      script: String(draft.values.script || ""),
      super: String(draft.values.super || "")
    };
  }

  function queueTrailingCommit(state, immediate) {
    if (state.trailingTimer) { clearTimeout(state.trailingTimer); state.trailingTimer = null; }
    if (!meaningful(state.trailing) || state.trailingSaving || state.composing && state.composing.size || !writable(state)) return;
    if (immediate) {
      void commitTrailing(state);
      return;
    }
    const capturedFrameId = state.trailing.frameId;
    state.trailingTimer = setTimeout(function () {
      state.trailingTimer = null;
      if (capturedFrameId === state.trailing.frameId) void commitTrailing(state);
    }, 650);
  }

  async function commitTrailing(state) {
    const draft = state.trailing;
    if (!meaningful(draft) || state.trailingSaving || !writable(state)) return false;
    if (state.composing && state.composing.size) return false;
    const targetId = draft.frameId;
    const frames = sequenceFrames(state);
    const patch = draftPatch(draft);
    const afterFrameId = frames.length ? frames[frames.length - 1].id : null;
    if (typeof state.model.addSequenceFrame !== "function") {
      draft.errors.visual = new Error("目前無法保存連續分鏡；輸入仍保留在此草稿。");
      renderState(state, false);
      report(state, draft.errors.visual);
      return false;
    }
    state.trailingSaving = targetId;
    try {
      const result = await state.model.addSequenceFrame(state.shotId, afterFrameId, patch, targetId);
      const createdId = typeof result === "string" ? result : result && result.frameId || targetId;
      const committedFrames = sequenceFrames(state);
      if (!committedFrames.some(function (frame) { return frame.id === createdId; })) {
        throw Object.assign(new Error("連續分鏡保存結果尚未出現在目前專案；草稿仍保留。"), { code: "SEQUENCE_FRAME_NOT_VISIBLE" });
      }
      if (state.trailing.frameId === targetId) state.trailing = emptyDraft();
      state.expanded = true;
      state.trailingSaving = null;
      renderState(state, false);
      notifyChange(state);
      return true;
    } catch (error) {
      state.trailingSaving = null;
      draft.errors.visual = error;
      renderState(state, false);
      report(state, error);
      return false;
    }
  }

  function saveFieldOnBlur(state, field) {
    const id = field.dataset.sequenceFrameId;
    const name = field.dataset.sequenceField;
    const placeholder = field.dataset.sequencePlaceholder === "true";
    const draft = placeholder ? state.trailing : draftFor(state, id);
    draft.values[name] = field.value;
    if (placeholder) {
      queueTrailingCommit(state, true);
      return;
    }
    const frame = sequenceFrames(state).find(function (item) { return item.id === id; });
    if (!frame || !writable(state) || String(frame[name] == null ? "" : frame[name]) === field.value) return;
    const version = draft.versions[name] || 0;
    if (typeof state.model.updateSequenceFrame !== "function") {
      draft.errors[name] = new Error("目前無法保存連續分鏡欄位；輸入仍保留。");
      renderState(state, false);
      report(state, draft.errors[name]);
      return;
    }
    state.mutationPending += 1;
    Promise.resolve(state.model.updateSequenceFrame(state.shotId, id, { [name]: field.value })).then(function () {
      if (draft.versions[name] === version) {
        delete draft.values[name];
        delete draft.errors[name];
      }
      state.mutationPending = Math.max(0, state.mutationPending - 1);
      renderState(state, false);
      notifyChange(state);
    }).catch(function (error) {
      draft.errors[name] = error;
      state.mutationPending = Math.max(0, state.mutationPending - 1);
      renderState(state, false);
      report(state, error);
    });
  }

  function notifyChange(state) {
    if (!state.onChange) return;
    try { state.onChange(state.shotId); } catch (error) { report(state, error); }
  }

  function clearPointerDragVisuals(gesture) {
    const host = gesture && gesture.host;
    if (host && host.querySelectorAll) {
      host.querySelectorAll("[data-sequence-drop]").forEach(function (element) { delete element.dataset.sequenceDrop; });
    }
    if (gesture && gesture.sourceElement) gesture.sourceElement.classList.remove("is-sequence-dragging");
  }

  function cancelPointerDrag(state) {
    const gesture = state && state.dragGesture;
    if (!gesture) return;
    state.dragGesture = null;
    clearPointerDragVisuals(gesture);
    try {
      if (gesture.host && gesture.host.hasPointerCapture(gesture.pointerId)) gesture.host.releasePointerCapture(gesture.pointerId);
    } catch (_) {}
  }

  function flushDeferredRender(state) {
    if (!state || !state.deferredRender || state.dragGesture || state.projectBlocked) return;
    const host = state.host;
    if (!host || !host.isConnected) return;
    const project = projectSnapshot(state);
    if (!project || !Array.isArray(project.shots) || !project.shots.some(function (shot) { return shot.id === state.shotId; })) return;
    state.deferredRender = false;
    renderState(state, false);
  }

  function sameIdOrder(left, right) {
    return left.length === right.length && left.every(function (id, index) { return id === right[index]; });
  }

  function dropOrder(baseIds, sourceId, targetId, position) {
    if (sourceId === targetId) return null;
    const ids = baseIds.slice();
    const sourceIndex = ids.indexOf(sourceId);
    if (sourceIndex < 0) return null;
    ids.splice(sourceIndex, 1);
    const targetIndex = ids.indexOf(targetId);
    if (targetIndex < 0) return null;
    ids.splice(targetIndex + (position === "after" ? 1 : 0), 0, sourceId);
    return sameIdOrder(ids, baseIds) ? null : ids;
  }

  function updatePointerDrop(state, gesture, clientX, clientY) {
    const document = root && root.document;
    const pointTarget = document && document.elementFromPoint(clientX, clientY);
    const target = pointTarget && pointTarget.closest ? pointTarget.closest(".sequence-group-head, .sequence-frame-row[data-sequence-saved-frame]") : null;
    if (!target || !gesture.host.contains(target)) {
      clearPointerDragVisuals(gesture);
      gesture.dropOrder = null;
      return;
    }
    let targetId;
    let position;
    if (target.matches(".sequence-group-head")) {
      targetId = gesture.baseFrameIds[0];
      position = "before";
    } else {
      targetId = target.dataset.sequenceFrameId;
      const rect = target.getBoundingClientRect();
      position = clientY < rect.top + rect.height / 2 ? "before" : "after";
    }
    const nextOrder = dropOrder(gesture.baseFrameIds, gesture.sourceFrameId, targetId, position);
    clearPointerDragVisuals(gesture);
    if (!nextOrder) {
      gesture.dropOrder = null;
      return;
    }
    target.dataset.sequenceDrop = position;
    gesture.dropTarget = target;
    gesture.dropOrder = nextOrder;
  }

  async function saveFrameOrder(state, ids, guard) {
    if (!writable(state) || typeof state.model.reorderSequenceFrames !== "function") return false;
    const project = projectSnapshot(state);
    if (!project || !Array.isArray(project.shots) || !project.shots.some(function (shot) { return shot.id === state.shotId; })) return false;
    if (guard && (project.projectId !== guard.projectId ||
        state.host !== guard.host || !guard.host || !guard.host.isConnected)) return false;
    const frames = sequenceFrames(state);
    const currentIds = frames.map(function (frame) { return frame.id; });
    if (guard && !sameIdOrder(currentIds, guard.frameIds)) return false;
    if (ids.length !== currentIds.length || currentIds.some(function (id) { return !ids.includes(id); }) || sameIdOrder(ids, currentIds)) return false;
    state.mutationPending += 1;
    try {
      await state.model.reorderSequenceFrames(state.shotId, ids);
      notifyChange(state);
      return true;
    } catch (error) {
      report(state, error);
      return false;
    } finally { state.mutationPending = Math.max(0, state.mutationPending - 1); }
  }

  function sequencePointerDown(state, host, event) {
    if (state.dragGesture) return;
    if (state.suppressClickTimer) { clearTimeout(state.suppressClickTimer); state.suppressClickTimer = null; }
    state.suppressClick = false;
    if (!host.isConnected || event.isPrimary === false || event.button !== 0 || !writable(state)) return;
    const target = event.target && event.target.closest ? event.target : null;
    if (!target || !host.contains(target) || target.closest("button, input, textarea, select, [contenteditable='true'], [data-sequence-action], .sequence-image-cell, .sequence-frame-fields, .sequence-frame-tools, .sequence-master-tools")) return;
    const row = target.closest(".sequence-frame-row[data-sequence-saved-frame]");
    const head = !row && target.closest(".sequence-group-head");
    if ((!row && !head) || !host.contains(row || head)) return;
    const project = projectSnapshot(state);
    if (!project || !Array.isArray(project.shots) || !project.shots.some(function (shot) { return shot.id === state.shotId; })) return;
    const frames = sequenceFrames(state);
    if (frames.length < 2) return;
    const sourceFrameId = row ? row.dataset.sequenceFrameId : frames[0].id;
    const frameIds = frames.map(function (frame) { return frame.id; });
    if (!frameIds.includes(sourceFrameId)) return;
    const gesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      sourceFrameId: sourceFrameId,
      sourceElement: row || head,
      host: host,
      projectId: project.projectId,
      frameIds: frameIds,
      baseFrameIds: frameIds,
      active: false,
      dropOrder: null,
      dropTarget: null,
      startX: event.clientX,
      startY: event.clientY
    };
    state.dragGesture = gesture;
    try { host.setPointerCapture(event.pointerId); } catch (_) {}
  }

  function sequencePointerMove(state, host, event) {
    const gesture = state.dragGesture;
    if (!gesture || gesture.host !== host || gesture.pointerId !== event.pointerId) return;
    if (!gesture.active) {
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 6) return;
      const project = projectSnapshot(state);
      const liveFrames = sequenceFrames(state);
      if (!project || project.projectId !== gesture.projectId ||
          !Array.isArray(project.shots) || !project.shots.some(function (shot) { return shot.id === state.shotId; })) {
        cancelPointerDrag(state);
        flushDeferredRender(state);
        return;
      }
      if (!sameIdOrder(liveFrames.map(function (frame) { return frame.id; }), gesture.baseFrameIds) ||
          !liveFrames.some(function (frame) { return frame.id === gesture.sourceFrameId; })) {
        cancelPointerDrag(state);
        flushDeferredRender(state);
        return;
      }
      gesture.active = true;
      gesture.sourceElement.classList.add("is-sequence-dragging");
    }
    event.preventDefault();
    updatePointerDrop(state, gesture, event.clientX, event.clientY);
  }

  function sequencePointerUp(state, host, event, commit) {
    const gesture = state.dragGesture;
    if (!gesture || gesture.host !== host || gesture.pointerId !== event.pointerId) return;
    if (gesture.active && commit) updatePointerDrop(state, gesture, event.clientX, event.clientY);
    const order = gesture.active && commit ? gesture.dropOrder : null;
    const guard = { host: host, projectId: gesture.projectId, frameIds: gesture.baseFrameIds };
    const wasActive = gesture.active;
    cancelPointerDrag(state);
    if (wasActive) {
      state.suppressClick = true;
      state.suppressClickTimer = setTimeout(function () {
        state.suppressClick = false;
        state.suppressClickTimer = null;
      }, 500);
    }
    if (order) {
      void saveFrameOrder(state, order, guard).finally(function () { flushDeferredRender(state); });
    } else flushDeferredRender(state);
  }

  async function moveFrame(state, id, delta) {
    const frames = sequenceFrames(state);
    const from = frames.findIndex(function (frame) { return frame.id === id; });
    const to = from + delta;
    if (from < 0 || to < 0 || to >= frames.length) return;
    const ids = frames.map(function (frame) { return frame.id; });
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    await saveFrameOrder(state, ids);
  }

  async function deleteFrame(state, id) {
    if (!writable(state) || typeof state.model.deleteSequenceFrame !== "function") return;
    const frames = sequenceFrames(state);
    const index = frames.findIndex(function (frame) { return frame.id === id; });
    if (index < 0 || frames.length < 2) return;
    const label = frameLabel(index);
    const message = index === 0
      ? "刪除連續分鏡 A？下一格會接替 A，A 的照片與手繪也會移除。"
      : "刪除連續分鏡 " + label + "？此格的照片與手繪也會移除。";
    if (root && typeof root.confirm === "function" && !root.confirm(message)) return;
    state.mutationPending += 1;
    try {
      await state.model.deleteSequenceFrame(state.shotId, id);
      notifyChange(state);
    } catch (error) { report(state, error); }
    finally { state.mutationPending = Math.max(0, state.mutationPending - 1); }
  }

  function ensurePhotoPicker(state) {
    if (state.photoInput) return state.photoInput;
    const input = root.document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    input.setAttribute("aria-label", "選取連續分鏡照片");
    input.addEventListener("change", function () {
      const target = state.photoTarget;
      const file = input.files && input.files[0];
      input.value = "";
      state.photoTarget = null;
      if (!target || !file) return;
      openPhotoCropper(state, target, file);
    });
    root.document.body.appendChild(input);
    state.photoInput = input;
    return input;
  }

  function openPhotoPicker(state, id, placeholder) {
    if (!writable(state)) return report(state, new Error("目前無法編輯；先完成保存並取得編輯權。"));
    if (!root.DirectorStoryboardPhotoCropEditor || typeof root.DirectorStoryboardPhotoCropEditor.mount !== "function") {
      const error = new Error("照片裁切編輯器尚未載入；沒有保存照片。");
      report(state, error);
      return;
    }
    const frames = sequenceFrames(state);
    const target = placeholder
      ? id === state.trailing.frameId ? { frameId: id, placeholder: true } : null
      : frames.find(function (frame) { return frame.id === id; });
    if (!target) return;
    const project = projectSnapshot(state);
    if (!project) return report(state, new Error("專案已切換；沒有開啟照片選擇。"));
    state.returnFocus = { action: "photo", frameId: id };
    state.photoTarget = { frameId: id, placeholder: placeholder, frame: target, baseRevision: project.revision };
    const input = ensurePhotoPicker(state);
    try { input.click(); } catch (error) { state.photoTarget = null; report(state, error); }
  }

  function aspectRatio(state) {
    try {
      const project = state.model.getProject && state.model.getProject();
      if (project && project.aspectRatio) return project.aspectRatio;
      const snapshot = state.model.getState && state.model.getState();
      if (snapshot && snapshot.aspectRatio) return snapshot.aspectRatio;
    } catch (_) {}
    return "16:9";
  }

  async function submitPhoto(state, session, operation) {
    try { return await operation(); }
    catch (error) {
      let lifecycle = null;
      try { lifecycle = state.model.getLifecycle && state.model.getLifecycle(); } catch (_) {}
      if (lifecycle && (lifecycle.phase === "save_failed" || Number(lifecycle.pendingCount || 0) > 0)) session.blocked = true;
      throw error;
    }
  }

  function openPhotoCropper(state, target, file) {
    const mount = root.document.createElement("div");
    mount.className = "sequence-photo-crop-mount";
    root.document.body.appendChild(mount);
    const session = { mount: mount, editor: null, target: target, blocked: false };
    state.photoSession = session;
    const api = root.DirectorStoryboardPhotoCropEditor;
    try {
      session.editor = api.mount(mount, {
        imageBlob: file,
        aspectRatio: aspectRatio(state),
        title: "裁切連續分鏡照片（原始照片不會修改）",
        imageLabel: file.name || "連續分鏡照片",
        onConfirm: async function (crop) {
          if (session.blocked) throw new Error("照片保存命令仍在待處理狀態；先完成全域保存重試，再關閉此視窗確認結果。");
          if (!writable(state)) throw new Error("目前無法保存照片；照片仍保留在裁切視窗。");
          const currentProject = projectSnapshot(state);
          if (target.blocked || !currentProject || currentProject.revision !== target.baseRevision ||
              !targetIsCurrent(state, target.frameId, target.placeholder)) {
            session.blocked = true;
            throw Object.assign(new Error("專案或目標連續分鏡已更新；照片沒有保存。請重新開啟照片選擇。"), { code: "SEQUENCE_PHOTO_TARGET_STALE" });
          }
          const currentFrames = sequenceFrames(state);
          const frame = target.placeholder
            ? target.frameId === state.trailing.frameId ? null : target.frame
            : currentFrames.find(function (item) { return item.id === target.frameId; });
          if (!target.placeholder && !frame) throw Object.assign(new Error("目標連續分鏡已更新；照片沒有保存。"), { code: "SEQUENCE_FRAME_STALE" });
          const photoOptions = {
            crop: crop ? { x: crop.x, y: crop.y, width: crop.width, height: crop.height } : null,
            expectedRevision: target.baseRevision
          };
          let result;
          if (target.placeholder) {
            if (typeof state.model.addSequenceFrameWithPhoto !== "function") throw new Error("目前無法一併保存連續分鏡與照片；沒有建立空白格。");
            const framesBefore = sequenceFrames(state);
            const afterFrameId = framesBefore.length ? framesBefore[framesBefore.length - 1].id : null;
            result = await submitPhoto(state, session, function () {
              return state.model.addSequenceFrameWithPhoto(
                state.shotId, file, draftPatch(state.trailing), photoOptions, afterFrameId, target.frameId
              );
            });
            if (state.trailing.frameId === target.frameId) state.trailing = emptyDraft();
          } else {
            const assetIds = Array.isArray(frame.assetIds) ? frame.assetIds : [];
            if (assetIds.length) {
              if (typeof state.model.replaceShotPhoto !== "function") throw new Error("目前無法更新此格照片；沒有保存變更。");
              result = await submitPhoto(state, session, function () {
                return state.model.replaceShotPhoto(state.shotId, assetIds[0], file, photoOptions, frame.id);
              });
            } else {
              if (typeof state.model.addShotPhotos !== "function") throw new Error("目前無法新增此格照片；沒有保存變更。");
              result = await submitPhoto(state, session, function () {
                return state.model.addShotPhotos(state.shotId, [file], photoOptions, frame.id);
              });
            }
          }
          if (result === false) throw new Error("照片保存尚未完成；裁切仍保留。");
          renderState(state, false);
          notifyChange(state);
          return true;
        },
        onCancel: function () { finishPhotoSession(state, session); }
      });
      const dialog = session.editor.editor && session.editor.editor.dialog;
      if (dialog) dialog.addEventListener("close", function () { finishPhotoSession(state, session); }, { once: true });
      if (state.model.subscribe) {
        session.unsubscribe = state.model.subscribe(function (snapshot) {
          const stillExists = snapshot && snapshot.projectId === state.projectId && Array.isArray(snapshot.shots) &&
            snapshot.shots.some(function (shot) { return shot.id === state.shotId; });
          if (!stillExists) lockPhotoSession(state, "專案或鏡頭已切換；照片沒有保存。");
          else if (!target.placeholder && !sequenceFrames(state).some(function (frame) { return frame.id === target.frameId; })) {
            lockPhotoSession(state, "目標連續分鏡已刪除；照片沒有保存。");
          }
        });
      }
      Promise.resolve(session.editor.open()).catch(function (error) {
        finishPhotoSession(state, session);
        report(state, error);
      });
    } catch (error) {
      finishPhotoSession(state, session);
      report(state, error);
    }
  }

  function finishPhotoSession(state, session) {
    if (!session || state.photoSession !== session) return;
    state.photoSession = null;
    if (typeof session.unsubscribe === "function") session.unsubscribe();
    const editor = session.editor;
    session.editor = null;
    if (editor && typeof editor.destroy === "function") editor.destroy();
    if (session.mount && session.mount.parentNode) session.mount.parentNode.removeChild(session.mount);
    focusReturnTarget(state);
  }

  function focusReturnTarget(state) {
    const target = state.returnFocus;
    state.returnFocus = null;
    const host = state.host;
    if (!target || !host || !host.isConnected) return;
    const button = host.querySelector('[data-sequence-action="' + cssEscape(target.action) + '"][data-sequence-frame-id="' + cssEscape(target.frameId) + '"]');
    if (button) button.focus({ preventScroll: true });
  }

  function ensureFramePreviews(state, frames) {
    frames.slice(1).forEach(function (frame) {
      const drawingIds = Array.isArray(frame.drawingIds) ? frame.drawingIds : [];
      if (drawingIds.length) loadDrawingPreview(state, frame, drawingIds[0]);
      else {
        const assetId = Array.isArray(frame.assetIds) && frame.assetIds[0];
        if (assetId) loadPhotoPreview(state, frame, assetId);
      }
    });
    prunePreviews(state, frames);
  }

  function verifiedAssetMetadata(state, assetId) {
    const project = projectSnapshot(state);
    const metadata = project && Array.isArray(project.assets) && project.assets.find(function (asset) { return asset.id === assetId; });
    if (!metadata || metadata.role !== "photoOriginal" || metadata.state !== "available" || !/^[0-9a-f]{64}$/i.test(String(metadata.sha256 || ""))) {
      throw Object.assign(new Error("照片缺少可驗證的原圖資訊。"), { code: "SEQUENCE_PHOTO_METADATA_INVALID" });
    }
    return { project: project, metadata: metadata };
  }

  async function loadThumbnail(state, assetId, frameIdValue, useProjectAsset) {
    const verified = verifiedAssetMetadata(state, assetId);
    if (!root.KinoThumbnails || typeof root.KinoThumbnails.get !== "function") {
      throw Object.assign(new Error("照片縮圖元件尚未載入。"), { code: "SEQUENCE_THUMBNAIL_UNAVAILABLE" });
    }
    return root.KinoThumbnails.get(state.projectId, verified.metadata, async function () {
      let photo;
      if (useProjectAsset) {
        if (typeof state.model.getAsset !== "function") throw new Error("Model 尚未提供已驗證的底圖讀取功能。");
        photo = await state.model.getAsset(state.projectId, assetId);
      } else {
        if (typeof state.model.getShotPhoto !== "function") throw new Error("Model 尚未提供此格照片讀取功能。");
        photo = await state.model.getShotPhoto(state.shotId, assetId, frameIdValue);
      }
      if (!photo || photo.projectId !== state.projectId || photo.id !== assetId ||
          !photo.metadata || String(photo.metadata.sha256).toLowerCase() !== String(verified.metadata.sha256).toLowerCase() ||
          !(photo.originalBlob instanceof Blob)) {
        throw Object.assign(new Error("照片與目前專案的 Asset metadata 不一致。"), { code: "SEQUENCE_PHOTO_SOURCE_MISMATCH" });
      }
      if (!useProjectAsset && photo.shotId !== state.shotId) {
        throw Object.assign(new Error("照片不屬於目前鏡頭。"), { code: "SEQUENCE_PHOTO_SHOT_MISMATCH" });
      }
      return photo;
    });
  }

  function previewRow(state, frameIdValue) {
    const host = state.host;
    if (!host || !host.isConnected) return null;
    return Array.from(host.querySelectorAll(".sequence-frame-row[data-sequence-saved-frame]")).find(function (row) {
      return row.dataset.sequenceFrameId === frameIdValue;
    }) || null;
  }

  function loadPhotoPreview(state, frame, assetId) {
    const cached = state.photoUrls.get(frame.id);
    if (cached && cached.assetId === assetId) return;
    const requestKey = frame.id + "\u0000" + assetId;
    if (state.photoLoads.has(requestKey)) return;
    state.photoLoads.add(requestKey);
    Promise.resolve().then(function () {
      return loadThumbnail(state, assetId, frame.id, false);
    }).then(function (thumbnail) {
      if (!(thumbnail instanceof Blob) || !state.expanded || !state.host || !state.host.isConnected) return;
      return createImageBitmap(thumbnail).then(function (bitmap) {
        const imageData = { blob: thumbnail, width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return imageData;
      });
    }).then(function (imageData) {
      if (!imageData || !state.expanded || !state.host || !state.host.isConnected) return;
      const latest = sequenceFrames(state).find(function (item) { return item.id === frame.id; });
      if (!latest || !Array.isArray(latest.assetIds) || latest.assetIds[0] !== assetId ||
          (latest.drawingIds || []).length) return;
      const url = URL.createObjectURL(imageData.blob);
      const previous = state.photoUrls.get(frame.id);
      if (previous) { try { URL.revokeObjectURL(previous.url); } catch (_) {} }
      state.photoUrls.set(frame.id, { assetId: assetId, url: url, width: imageData.width, height: imageData.height });
      state.photoErrors.delete(frame.id);
      const row = previewRow(state, frame.id);
      const content = row && row.querySelector(".sequence-photo-content");
      if (content) {
        const wrapper = root.document.createElement("span");
        wrapper.innerHTML = photoPreviewMarkup(state, latest, assetId, { url: url, width: imageData.width, height: imageData.height });
        content.replaceChildren(wrapper.firstElementChild);
      }
    }).catch(function (error) {
      state.photoErrors.set(frame.id, error);
      report(state, error);
      const row = previewRow(state, frame.id);
      const content = row && row.querySelector(".sequence-photo-content");
      if (content) content.innerHTML = '<span class="sequence-photo-note is-error">照片讀取失敗</span>';
    }).finally(function () {
      state.photoLoads.delete(requestKey);
    });
  }

  async function loadDrawingPreview(state, frame, drawingId) {
    const existing = state.drawingUrls.get(frame.id);
    const initialDrawing = state.model.getDrawing && state.model.getDrawing(drawingId);
    if (existing && existing.id === drawingId && initialDrawing && existing.revision === initialDrawing.revision) return;
    const requestKey = frame.id + "\u0000" + drawingId;
    if (state.drawingLoads.has(requestKey)) return;
    state.drawingLoads.add(requestKey);
    let bitmap = null;
    try {
      const renderer = root.DirectorStoryboardRenderer;
      if (!renderer || typeof renderer.createSnapshot !== "function" || typeof renderer.renderToCanvas !== "function") {
        throw Object.assign(new Error("手繪預覽元件尚未載入。"), { code: "SEQUENCE_DRAWING_RENDERER_UNAVAILABLE" });
      }
      const project = projectSnapshot(state);
      const drawing = initialDrawing || state.model.getDrawing && state.model.getDrawing(drawingId);
      const canonical = project && Array.isArray(project.drawings) && project.drawings.find(function (item) { return item.id === drawingId; });
      if (!project || !drawing || !canonical || JSON.stringify(canonical) !== JSON.stringify(drawing) ||
          drawing.projectId !== state.projectId || drawing.shotId !== state.shotId || drawing.id !== drawingId ||
          drawing.frameId && drawing.frameId !== frame.id || !(frame.drawingIds || []).includes(drawingId)) {
        throw Object.assign(new Error("手繪與目前連續分鏡不一致。"), { code: "SEQUENCE_DRAWING_IDENTITY_MISMATCH" });
      }
      let backgroundImage = null;
      let backgroundFingerprint = null;
      if (drawing.backgroundAssetId) {
        const loaded = await loadThumbnail(state, drawing.backgroundAssetId, frame.id, true);
        if (!loaded || !(loaded instanceof Blob)) throw new Error("手繪底圖縮圖無法讀取。");
        bitmap = await createImageBitmap(loaded);
        const metadata = verifiedAssetMetadata(state, drawing.backgroundAssetId).metadata;
        backgroundImage = bitmap;
        backgroundFingerprint = String(metadata.sha256).toLowerCase();
      }
      const snapshot = renderer.createSnapshot(drawing, drawing.backgroundAssetId
        ? { backgroundImage: backgroundImage, backgroundFingerprint: backgroundFingerprint }
        : undefined);
      const ratio = drawing.canvas.width / drawing.canvas.height;
      const width = 640;
      const height = Math.max(1, Math.round(width / ratio));
      const canvas = root.document.createElement("canvas");
      renderer.renderToCanvas(canvas, snapshot, { width: width, height: height, pixelRatio: 1 });
      const blob = await new Promise(function (resolve) { canvas.toBlob(resolve, "image/png"); });
      canvas.width = 1;
      canvas.height = 1;
      if (!blob) throw new Error("手繪縮圖產生失敗。");
      const latestProject = projectSnapshot(state);
      const latestFrame = sequenceFrames(state).find(function (item) { return item.id === frame.id; });
      const latestDrawing = state.model.getDrawing(drawingId);
      if (!state.expanded || !state.host || !state.host.isConnected || !latestProject || !latestFrame ||
          !(latestFrame.drawingIds || []).includes(drawingId) || !latestDrawing || latestDrawing.revision !== drawing.revision) return;
      const url = URL.createObjectURL(blob);
      const previous = state.drawingUrls.get(frame.id);
      if (previous) { try { URL.revokeObjectURL(previous.url); } catch (_) {} }
      state.drawingUrls.set(frame.id, { id: drawingId, revision: drawing.revision, url: url });
      state.drawingErrors.delete(frame.id);
      const row = previewRow(state, frame.id);
      const content = row && row.querySelector(".sequence-photo-content");
      if (content) {
        const image = root.document.createElement("img");
        image.className = "sequence-drawing-image";
        image.alt = "";
        image.draggable = false;
        image.src = url;
        content.replaceChildren(image);
      }
    } catch (error) {
      state.drawingErrors.set(frame.id, error);
      report(state, error);
      const row = previewRow(state, frame.id);
      const content = row && row.querySelector(".sequence-photo-content");
      if (content) content.innerHTML = '<span class="sequence-photo-note is-error">手繪預覽失敗</span>';
    } finally {
      if (bitmap && typeof bitmap.close === "function") bitmap.close();
      state.drawingLoads.delete(requestKey);
    }
  }

  function releasePreviews(state) {
    state.photoUrls.forEach(function (entry) { try { URL.revokeObjectURL(entry.url); } catch (_) {} });
    state.drawingUrls.forEach(function (entry) { try { URL.revokeObjectURL(entry.url); } catch (_) {} });
    state.photoUrls.clear();
    state.drawingUrls.clear();
  }

  function prunePreviews(state, frames) {
    const ids = new Set(frames.slice(1).map(function (frame) { return frame.id; }));
    state.photoUrls.forEach(function (entry, id) {
      const frame = frames.find(function (item) { return item.id === id; });
      const assetId = frame && !(frame.drawingIds || []).length && Array.isArray(frame.assetIds) && frame.assetIds[0];
      if (!ids.has(id) || assetId !== entry.assetId) {
        try { URL.revokeObjectURL(entry.url); } catch (_) {}
        state.photoUrls.delete(id);
      }
    });
    state.drawingUrls.forEach(function (entry, id) {
      const frame = frames.find(function (item) { return item.id === id; });
      const drawingId = frame && frame.drawingIds && frame.drawingIds[0];
      if (!ids.has(id) || drawingId !== entry.id || !state.expanded) {
        try { URL.revokeObjectURL(entry.url); } catch (_) {}
        state.drawingUrls.delete(id);
      }
    });
    if (!state.expanded) {
      state.photoUrls.forEach(function (entry) { try { URL.revokeObjectURL(entry.url); } catch (_) {} });
      state.photoUrls.clear();
    }
  }

  function drawingAdapter(state, frameIdValue, isPlaceholder) {
    const model = state.model;
    const trailingPatch = isPlaceholder ? draftPatch(state.trailing) : null;
    const writeMethods = new Set([
      "createDrawingForShotWithInitialEdit", "appendDrawingStroke", "eraseDrawingStroke",
      "clearDrawingLayer", "setDrawingLayerState", "addDrawingLayer", "deleteDrawingLayer",
      "addDrawingLayerWithStrokes", "replaceDrawingLayerStrokes", "addShotWithDrawing",
      "reorderDrawingLayers", "reuseSceneLayer", "setDrawingBackground", "undo", "redo",
      "retryPending", "cancelPending", "discardPending"
    ]);
    const adapter = {};
    Object.keys(model).forEach(function (property) {
      const value = model[property];
      if (writeMethods.has(property) && typeof value === "function") {
        adapter[property] = function () {
          if (!targetIsCurrent(state, frameIdValue, isPlaceholder)) {
            throw Object.assign(new Error("專案或 Drawing 目標已切換；手繪保存已停用。"), { code: "SEQUENCE_DRAWING_TARGET_STALE" });
          }
          return value.apply(model, arguments);
        };
      } else adapter[property] = typeof value === "function" ? value.bind(model) : value;
    });
    adapter.createDrawingForShotWithInitialEdit = function (shotId, initialEdit, expectedRevision, backgroundCrop) {
      if (shotId !== state.shotId || !targetIsCurrent(state, frameIdValue, isPlaceholder)) {
        throw Object.assign(new Error("專案或 Drawing 目標已切換；手繪沒有保存。"), { code: "SEQUENCE_DRAWING_TARGET_STALE" });
      }
      const frames = sequenceFrames(state);
      const afterFrameId = frames.length ? frames[frames.length - 1].id : null;
      return model.createDrawingForShotWithInitialEdit(
        shotId, initialEdit, expectedRevision, backgroundCrop, frameIdValue, trailingPatch || undefined, afterFrameId
      );
    };
    adapter.getDrawingsForShot = function (shotId) {
      if (shotId !== state.shotId || !targetIsCurrent(state, frameIdValue, isPlaceholder)) return [];
      if (isPlaceholder && !sequenceFrames(state).some(function (frame) { return frame.id === frameIdValue; })) return [];
      return model.getDrawingsForShot(shotId, frameIdValue);
    };
    adapter.getShotPhoto = function (shotId, assetId) {
      if (!targetIsCurrent(state, frameIdValue, isPlaceholder)) return Promise.reject(new Error("專案或 Drawing 目標已切換。"));
      return model.getShotPhoto(shotId, assetId, frameIdValue);
    };
    adapter.getProject = function () {
      const project = model.getProject();
      if (!project || project.projectId !== state.projectId) return null;
      const shot = Array.isArray(project.shots) && project.shots.find(function (item) { return item.id === state.shotId; });
      if (!shot) return null;
      const persisted = sequenceFrames(state).find(function (item) { return item.id === frameIdValue; });
      const frame = persisted || (isPlaceholder
        ? { id: frameIdValue, assetIds: [], photoCropsByAssetId: {}, drawingIds: [], visual: trailingPatch.visual, script: trailingPatch.script, super: trailingPatch.super }
        : null);
      if (frame) {
        shot.visual = frame.visual || "";
        shot.script = frame.script || "";
        shot.super = frame.super || "";
        shot.assetIds = Array.isArray(frame.assetIds) ? frame.assetIds.slice() : [];
        shot.photoCropsByAssetId = Object.assign({}, frame.photoCropsByAssetId || {});
        shot.drawingIds = Array.isArray(frame.drawingIds) ? frame.drawingIds.slice() : [];
      }
      return project;
    };
    adapter.getLifecycle = function () {
      const lifecycle = model.getLifecycle();
      if (projectSnapshot(state)) return lifecycle;
      return Object.assign({}, lifecycle, { writable: false, phase: "read_only", readOnlyReason: "專案或鏡頭已切換；手繪保存已停用。" });
    };
    adapter.getState = function () {
      const snapshot = model.getState();
      return snapshot && snapshot.projectId === state.projectId ? snapshot : null;
    };
    adapter.getAsset = function (projectId, assetId) {
      if (projectId !== state.projectId || !projectSnapshot(state)) return Promise.reject(new Error("專案已切換；底圖沒有讀取。"));
      return model.getAsset(projectId, assetId);
    };
    adapter.getDrawing = function (drawingId) {
      if (!targetIsCurrent(state, frameIdValue, isPlaceholder)) return null;
      const drawing = model.getDrawing(drawingId);
      const frame = sequenceFrames(state).find(function (item) { return item.id === frameIdValue; });
      const frameMatches = drawing && (drawing.frameId === frameIdValue || !drawing.frameId && frame && frame.isMaster);
      return drawing && drawing.shotId === state.shotId && frameMatches ? drawing : null;
    };
    return adapter;
  }

  function openDrawingEditor(state, id, placeholder) {
    if (!writable(state)) return report(state, new Error("目前無法編輯手繪；先完成保存並取得編輯權。"));
    if (!root.DirectorStoryboardDrawingEditor || typeof root.DirectorStoryboardDrawingEditor.mount !== "function") {
      return report(state, new Error("手繪編輯器尚未載入；沒有建立 Drawing。"));
    }
    if (state.drawingSession) return;
    const frames = sequenceFrames(state);
    let frame;
    if (placeholder) {
      if (id !== state.trailing.frameId) return;
      frame = { id: id, isMaster: false, assetIds: [], drawingIds: [], photoCropsByAssetId: {}, ...draftPatch(state.trailing) };
    } else {
      frame = frames.find(function (item) { return item.id === id; });
      if (!frame) return;
    }
    const frameDrawings = placeholder || typeof state.model.getDrawingsForShot !== "function"
      ? []
      : state.model.getDrawingsForShot(state.shotId, frame.id) || [];
    const project = state.model.getProject && state.model.getProject();
    const dialog = root.document.createElement("dialog");
    dialog.className = "ds-drawing-popup sequence-drawing-popup";
    dialog.setAttribute("aria-label", (state.shotNumber ? state.shotNumber + " " : "") + frameLabel(frames.findIndex(function (item) { return item.id === id; }) < 0 ? frames.length : frames.findIndex(function (item) { return item.id === id; })) + " 手繪編輯器");
    const view = root.document.createElement("div");
    view.className = "drawing-view";
    const workspace = root.document.createElement("div");
    workspace.className = "drawing-workspace";
    const chooser = root.document.createElement("div");
    chooser.className = "sequence-drawing-chooser";
    const mount = root.document.createElement("div");
    mount.className = "sequence-drawing-editor-mount";
    workspace.append(chooser, mount);
    view.appendChild(workspace);
    dialog.appendChild(view);
    root.document.body.appendChild(dialog);
    const session = { dialog: dialog, mount: mount, frameId: id, placeholder: placeholder, handle: null, adapter: null, closed: false };
    state.drawingSession = session;
    state.returnFocus = { action: "drawing", frameId: id };
    dialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      if (session.handle && typeof session.handle.requestClose === "function") session.handle.requestClose();
      else closeDrawingSession(state, session);
    });
    dialog.addEventListener("close", function () { closeDrawingSession(state, session); }, { once: true });
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");

    const choose = function (drawing) {
      if (session.closed) return;
      chooser.replaceChildren();
      session.adapter = drawingAdapter(state, frame.id, placeholder);
      const drawingFrame = frame.assetIds && frame.assetIds[0] ? frame : null;
      const options = {
        drawing: drawing || null,
        drawingId: drawing ? drawing.id : null,
        draft: !drawing,
        aspectRatio: project && project.aspectRatio || aspectRatio(state),
        defaultBackgroundAssetId: drawingFrame && drawingFrame.assetIds[0] || null,
        projectId: project && project.projectId || state.projectId,
        shotId: state.shotId,
        model: session.adapter,
        shotLabel: (state.shotNumber ? state.shotNumber + " " : "") + frameLabel(placeholder ? frames.length : frames.findIndex(function (item) { return item.id === id; })) + (placeholder ? " 草稿" : " 手繪"),
        onBack: function () { closeDrawingSession(state, session); return true; },
        onStateChange: function (snapshot) {
          if (placeholder && snapshot && snapshot.draft === false) {
            const saved = sequenceFrames(state).some(function (item) { return item.id === id; });
            if (saved && state.trailing.frameId === id) state.trailing = emptyDraft();
            if (saved) { state.expanded = true; renderState(state, false); notifyChange(state); }
          }
        }
      };
      const crop = drawingFrame && drawingFrame.photoCropsByAssetId && drawingFrame.photoCropsByAssetId[drawingFrame.assetIds[0]];
      if (crop) options.defaultBackgroundCrop = { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
      try {
        session.handle = root.DirectorStoryboardDrawingEditor.mount(mount, options);
      } catch (error) {
        closeDrawingSession(state, session);
        report(state, error);
      }
    };

    if (frameDrawings.length > 1) {
      const heading = root.document.createElement("p");
      heading.className = "sequence-drawing-chooser-title";
      heading.textContent = "選擇要編輯的手繪";
      chooser.appendChild(heading);
      frameDrawings.forEach(function (drawing, index) {
        const button = root.document.createElement("button");
        button.type = "button";
        button.className = "sequence-drawing-choice";
        button.textContent = "Drawing " + (index + 1);
        button.addEventListener("click", function () { choose(drawing); });
        chooser.appendChild(button);
      });
    } else {
      choose(frameDrawings[0] || null);
    }
  }

  function closeDrawingSession(state, session) {
    if (!session || session.closed) return;
    session.closed = true;
    if (state.drawingSession === session) state.drawingSession = null;
    const handle = session.handle;
    session.handle = null;
    if (handle && typeof handle.destroy === "function") {
      try { handle.destroy(); } catch (_) {}
    }
    if (session.dialog && session.dialog.open) {
      try { session.dialog.close(); } catch (_) {}
    }
    if (session.dialog && session.dialog.parentNode) session.dialog.parentNode.removeChild(session.dialog);
    focusReturnTarget(state);
  }

  function dispose(host) {
    const state = host && stateByHost.get(host);
    const listeners = host && host.__kinoSequenceListeners;
    if (listeners) {
      Object.keys(listeners).forEach(function (type) { host.removeEventListener(type, listeners[type]); });
      delete host.__kinoSequenceListeners;
    }
    if (state && state.host === host) state.host = null;
    stateByHost.delete(host);
  }

  return Object.freeze({
    render: render,
    begin: begin,
    dispose: dispose,
    isExpanded: isExpanded,
    isEnabled: isEnabled,
    refreshControls: refreshControls
  });
});
