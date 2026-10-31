(function () {
  "use strict";
  if (!document.querySelector("link[data-shot-photo-management-styles]")) {
    const currentScriptUrl = document.currentScript && document.currentScript.src;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    const stylesheetUrl = new URL("photo-management.css", currentScriptUrl || window.location.href);
    stylesheetUrl.searchParams.set("v", "20261029r04");
    stylesheet.href = stylesheetUrl.href;
    stylesheet.dataset.shotPhotoManagementStyles = "true";
    document.head.appendChild(stylesheet);
  }
  const model = window.StoryModel;
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  let drawingPopup = null;
  function requestDrawingPopupClose() {
    if (drawingEditorHandle && typeof drawingEditorHandle.requestClose === "function") {
      drawingEditorHandle.requestClose("backdrop");
      return;
    }
    message("手繪畫布仍在載入或尚未就緒，請稍候再關閉。", true);
  }
  function ensureDrawingPopup() {
    if (drawingPopup) return drawingPopup;
    const drawingView = $("#view-drawing");
    if (!drawingView) return null;
    drawingPopup = document.createElement("dialog");
    drawingPopup.className = "ds-drawing-popup";
    drawingPopup.setAttribute("aria-label", "手繪畫布");
    drawingPopup.appendChild(drawingView);
    document.body.appendChild(drawingPopup);
    drawingPopup.addEventListener("click", (event) => {
      if (event.target === drawingPopup) requestDrawingPopupClose();
    });
    drawingPopup.addEventListener("cancel", (event) => {
      event.preventDefault();
      requestDrawingPopupClose();
    });
    return drawingPopup;
  }
  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const icon = (name, size) => {
    const paths = {
      dots: '<circle cx="4" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="16" cy="10" r="1"/>',
      copy: '<rect x="7" y="7" width="9" height="10" rx="1.5"/><path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v8A1.5 1.5 0 0 0 5 14.5h2"/>',
      trash: '<path d="M4 6h12M8 6V4h4v2m3 0-.7 10H6.7L6 6m3 3v4m2-4v4"/>',
      up: '<path d="m5 11 5-5 5 5M10 6v9"/>', down: '<path d="m5 9 5 5 5-5M10 14V5"/>',
      close: '<path d="m5 5 10 10M15 5 5 15"/>',
      plus: '<path d="M10 4v12M4 10h12"/>', clock: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/>',
      chevron: '<path d="m7 8 3 3 3-3"/>', calendar: '<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M6 2.5v3M13 2.5v3M3 8h14"/>',
      break: '<path d="M6 7h8M6 10h6M6 13h8"/>',
      info: '<circle cx="10" cy="10" r="7"/><path d="M10 9v5m0-8v.1"/>',
      draw: '<path d="m4 14.8-.8 3.1 3.1-.8L17.7 5.7a1.7 1.7 0 0 0-2.4-2.4L4 14.8Z"/><path d="m13.9 4.7 2.4 2.4M3.5 19h13"/>'
    };
    return '<svg viewBox="0 0 20 20" aria-hidden="true" style="width:' + (size || 15) + 'px;height:' + (size || 15) + 'px">' + (paths[name] || paths.info) + '</svg>';
  };
  const svgArt = (type, index) => {
    const variants = {
      pool: '<rect width="640" height="360" fill="url(#sky)"/><path d="M0 145 103 75l105 22 92-68 128 50 83-36 129 36v131H0Z" fill="#b5c8c6"/><path d="M0 164h640v196H0Z" fill="#769da3"/><path d="M0 182h640v15H0z" fill="#d4e1da" opacity=".78"/><path d="M0 205h640M0 241h640M0 278h640M0 315h640" stroke="#b5d1d0" stroke-width="2" opacity=".62"/><path d="M54 159v201M208 159v201M438 159v201M586 159v201" stroke="#eef0e4" stroke-width="4" opacity=".7"/><path d="M0 352h640v8H0z" fill="#243d4a"/>',
      water: '<rect width="640" height="360" fill="url(#water)"/><path d="M0 36q83 24 160 0t160 0 160 0 160 0M0 104q83 24 160 0t160 0 160 0 160 0M0 176q83 24 160 0t160 0 160 0 160 0M0 248q83 24 160 0t160 0 160 0 160 0" fill="none" stroke="#daebe4" stroke-width="17" opacity=".24"/><circle cx="118" cy="119" r="21" fill="#fff7d7" opacity=".22"/><circle cx="433" cy="220" r="33" fill="#f6edce" opacity=".18"/><path d="M0 318q100-32 200 0t200 0 240 0v42H0Z" fill="#315868" opacity=".48"/>',
      swimmer: '<rect width="640" height="360" fill="url(#sky)"/><path d="M0 122h640v238H0Z" fill="#789ba0"/><path d="M0 147h640v12H0z" fill="#edf0e5" opacity=".8"/><path d="M55 170v190M228 170v190M410 170v190M583 170v190" stroke="#d2e0d8" stroke-width="3" opacity=".63"/><path d="M287 116c30-14 72-4 83 24 10 27-10 48-39 51l-22 31-23-10 23-44c-28-5-43-34-22-52Z" fill="#30434c"/><path d="m327 202-26 48 23 10 39-48m-51-38-35 35-31 7 5 14 42-9 42-30" fill="none" stroke="#30434c" stroke-width="17" stroke-linecap="round"/><path d="M0 266h640M0 321h640" stroke="#d0ded9" stroke-width="2" opacity=".5"/>',
      architecture: '<rect width="640" height="360" fill="url(#sky)"/><path d="M0 129 116 71l118 57V260H0ZM237 111l125-53 129 51v151H237ZM487 132l82-42 71 36v158H487Z" fill="#a6b8b5"/><path d="M20 155h28v53H20zm56 0h28v53H76zm104-18h30v72h-30zm95 4h30v76h-30zm66-22h30v98h-30zm88 22h30v76h-30zm91 12h28v64h-28zm54-1h24v66h-24z" fill="#e4dfc8" opacity=".78"/><path d="M0 249h640v111H0Z" fill="#7a9da2"/><path d="M0 281q130-21 260 0t260 0 120 0M0 318q120-20 240 0t240 0 160 0" fill="none" stroke="#d5e2db" stroke-width="3" opacity=".54"/><path d="M0 250h640" stroke="#ebe8d7" stroke-width="5"/>',
      sunset: '<rect width="640" height="360" fill="url(#sunset)"/><circle cx="463" cy="109" r="48" fill="#f1d6a9" opacity=".82"/><path d="M0 197h640v163H0Z" fill="#607d83"/><path d="M0 227q80-18 160 0t160 0 160 0 160 0v16q-80 18-160 0t-160 0-160 0-160 0Z" fill="#d0bc98" opacity=".55"/><path d="M0 267h640M0 308h640" stroke="#c7d8cf" stroke-width="2" opacity=".35"/><path d="M0 350h640v10H0z" fill="#283a48"/>'
    };
    const id = "g" + String(index).replace(/[^a-z0-9]/gi, "");
    return '<svg viewBox="0 0 640 360" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="sky' + id + '" x2="0" y2="1"><stop stop-color="#dce0d5"/><stop offset="1" stop-color="#a9bfbb"/></linearGradient><linearGradient id="water' + id + '" x2="0" y2="1"><stop stop-color="#6f9fa3"/><stop offset="1" stop-color="#264f60"/></linearGradient><linearGradient id="sunset' + id + '" x2="0" y2="1"><stop stop-color="#f1cfaa"/><stop offset=".55" stop-color="#d7997a"/><stop offset="1" stop-color="#738b8d"/></linearGradient><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#dce0d5"/><stop offset="1" stop-color="#a9bfbb"/></linearGradient><linearGradient id="water" x2="0" y2="1"><stop stop-color="#6f9fa3"/><stop offset="1" stop-color="#264f60"/></linearGradient><linearGradient id="sunset" x2="0" y2="1"><stop stop-color="#f1cfaa"/><stop offset=".55" stop-color="#d7997a"/><stop offset="1" stop-color="#738b8d"/></linearGradient></defs>' + (variants[type] || variants.pool) + '<path d="M0 0h640v360H0z" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="2"/></svg>';
  };
  let state = null;
  let lifecycle = { phase: "opening", pendingCount: 0, writable: false, projects: [], error: null, rescueAvailable: false };
  let lifecycleUnsubscribe = null;
  let dataUnsubscribe = null;
  let activeProjectId = null;
  let lifecycleInitialized = false;
  let lifecycleGateForced = false;
  let lifecycleBusy = false;
  let uiPending = 0;
  const pendingMutationPromises = new Set();
  let pendingPreferencePatch = null;
  let pendingPreferenceVersion = 0;
  const fieldDrafts = new Map();
  const composingFields = new Set();
  const draftVersions = new Map();
  const productionTimelineDrafts = new Map();
  let productionTimelineHandle = null;
  let productionTimelineProjectId = null;
  let productionTimelineError = null;
  let selectedShotId = null;
  let shotPlaceholderContextKey = "";
  let shotPlaceholderDraft = null;
  const shotPlaceholderDrafts = new Map();
  const shotPlaceholderDraftVersions = new Map();
  let shotPlaceholderPromotionPromise = null;
  let shotPlaceholderAutoPromotionTimer = null;
  let shotPlaceholderFocusTransfer = null;
  const shotPlaceholderPromotedShots = new Map();
  let shotPlaceholderRetryContext = null;
  let shotPlaceholderMessage = "";
  const shotPlaceholderComposingFields = new Set();
  let shotNumberResolution = null;
  let shotNumberResolutionKey = "";
  let shotNumberResolutionError = null;
  let shotNumberConflictIds = new Set();
  let shotNumberPreviewSession = null;
  const outputShotNumberResolutions = new WeakMap();
  let shotReorderSelection = new Set();
  let shotSelectionAnchorId = null;
  let shotMultiSelectMode = false;
  let activeChapterId = "all";
  let selectedDayId = null;
  let selectedEntryId = null;
  let entryReorderSelection = new Set();
  let entrySelectionAnchorId = null;
  let scheduleMultiSelectMode = false;
  const pendingEntryDayMoves = new Set();
  let selectedEntryMeta = null;
  let currentView = "storyboard";
  let shotView = "list";
  let pendingShotView = null;
  let pendingShotListRender = false;
  let pendingShotSearchRender = false;
  let searchComposing = false;
  let outputScope = "all";
  let outputType = "storyboard";
  let outputDayId = null;
  let outputShowEstimatedWrap = false;
  let orientation = "landscape";
  let confirmAction = null;
  let toastTimer = null;
  let photoPickerTarget = null;
  let photoImportSession = null;
  let photoImportSessionSequence = 0;
  let photoCropSession = null;
  let photoCropSessionSequence = 0;
  let photoCropProjectGeneration = 0;
  let photoIntegrityCheck = null;
  let photoIntegrityCheckSequence = 0;
  let completePackageImportSession = null;
  let completePackageImportSequence = 0;
  let completePackageImportOrigin = "project-menu";
  let completePackageExportBusy = false;
  let googleDriveOperation = null;
  let googleDriveStatus = null;
  let googleDriveResumeAvailable = false;
  let googleDriveReadyState = "unknown";
  let googleDriveReadyStarted = false;
  let googleDriveDestinationSession = null;
  let drawingRoute = null;
  let drawingEditorHandle = null;
  let drawingChooserContext = null;
  let drawingBackgroundChoiceContext = null;
  let reorderGesture = null;
  let reorderCommandInFlight = false;
  let suppressReorderClick = null;
  const shotPhotoObjectUrls = new Map();
  const shotPhotoReadErrors = new Map();
  const shotPhotoReadsPending = new Map();
  const shotPhotoManagerOpen = new Set();
  let shotPhotoObserver = null;
  let shotPhotoObserverRoot = null;
  let shotPhotoObserverList = null;
  const shotPhotoLoadQueue = new Map();
  let shotPhotoLoadQueueScheduled = false;
  let shotPhotoLoadQueueTimer = null;
  let shotPhotoFallbackTimer = null;
  let shotPhotoFallbackGeneration = 0;
  let shotPhotoUrlReconcileFrame = null;
  const SHOT_PHOTO_OBSERVER_ROOT_MARGIN = "480px 0px";
  const SHOT_PHOTO_LOADS_PER_TASK = 1;
  const SHOT_PHOTO_FALLBACK_SCAN_PER_TASK = 32;
  let shotPhotoMetadataCache = null;
  const shotDrawingObjectUrls = new Map();
  const shotDrawingUrlByCapture = new Map();
  const shotDrawingReadErrors = new Map();
  const shotDrawingReadsPending = new Map();
  let shotDrawingUrlEpoch = 0;
  const READ_ONLY_HELP = "唯讀瀏覽；重新取得編輯權後才能修改並保存。";
  const READ_ONLY_CONTROL_SELECTOR = [
    ".scene-add-button", "#add-shot", ".empty-add", ".scene-edit-button", "#add-break", "#day-create",
    "#shot-pool [data-action='schedule-shot']", "#shot-list [data-shot-field]", "#inspector input", "#inspector textarea", "#inspector select", "#inspector button:not([data-action='preview-shot-number-renumber'])",
    "#schedule-inspector input", "#schedule-inspector textarea", "#schedule-inspector select", "#schedule-inspector button",
    "#day-summary [data-day-field]", "#day-callsheet-fields [data-day-field]", "#day-callsheet-fields [data-callsheet-action]", "#output-show-estimated-wrap", "[data-schedule-pref]", "#output-items-per-page", "#output-density-less", "#output-density-more",
    "#output-include-details", "[data-output-field]", "[data-orientation]", "#undo-btn", "#redo-btn",
    "#shot-list .shot-photo-write-action", "#shot-photo-import-banner .shot-photo-write-action", "#shot-photo-picker",
    "#project-popover #project-aspect-ratio", "#project-popover [data-project-field]", "#project-popover [data-project-metadata-save]", "#scene-dialog input", "#scene-dialog button[type='submit']",
    "#day-dialog input", "#day-dialog button[type='submit']", "#shot-number-preview-dialog [data-action='apply-shot-number-renumber']"
  ].join(",");
  const READ_ONLY_ACTIONS = new Set([
    "add-scene", "edit-scene", "apply-entry-time", "toggle-entry-timing", "add-shot", "duplicate", "delete", "move-up", "move-down",
    "schedule-shot", "entry-up", "entry-down", "remove-entry", "move-entry-day", "toggle-shot-number-lock", "apply-shot-number-renumber"
  ]);
  const byId = (id, list) => (list || state.shots).find((item) => item.id === id);
  const inChapter = (chapterId) => state.shots.filter((shot) => shot.chapterId === chapterId);
  const entryForShot = (shotId) => state.entries.find((entry) => entry.type === "shot" && entry.shotId === shotId);
  const activeDay = () => state.days.find((day) => day.id === selectedDayId) || state.days[0] || null;
  const activeEntries = () => state.entries.filter((entry) => entry.dayId === selectedDayId);
  const sortShotIdx = (id) => state.shots.findIndex((shot) => shot.id === id);
  function isReadOnly() {
    if (!state || !document.body.classList.contains("project-ready")) return false;
    const phase = lifecycle && lifecycle.phase;
    if (phase === "save_failed") return Boolean(lifecycle.readOnlyReason);
    return phase === "read_only" || (lifecycle.writable === false && phase !== "error");
  }
  let lastReadonlyControlsKey = null;
  function readonlyControlsKey(locked, drawingAvailable, canCreateDrawing) {
    const current = lifecycle || {};
    return [
      Boolean(state && document.body.classList.contains("project-ready")),
      locked,
      current.phase || "",
      current.writable === true,
      Number(current.pendingCount || 0),
      drawingAvailable,
      canCreateDrawing
    ].join("\u0000");
  }
  function readonlyFieldControl(element) {
    return element.matches("textarea,input:not([type]),input[type='text'],input[type='search'],input[type='number'],input[type='email'],input[type='tel'],input[type='url'],input[type='password']");
  }
  function lockReadonlyControl(element, locked) {
    if (locked) {
      if (!element.dataset.readonlyLocked) {
        element.dataset.readonlyLocked = "true";
        element.dataset.readonlyWasDisabled = element.disabled ? "true" : "false";
        element.dataset.readonlyWasReadonly = "readOnly" in element && element.readOnly ? "true" : "false";
        element.dataset.readonlyWasAriaDisabled = element.getAttribute("aria-disabled") || "";
        element.dataset.readonlyHadAriaDisabled = element.hasAttribute("aria-disabled") ? "true" : "false";
        element.dataset.readonlyWasAriaReadonly = element.getAttribute("aria-readonly") || "";
        element.dataset.readonlyHadAriaReadonly = element.hasAttribute("aria-readonly") ? "true" : "false";
        element.dataset.readonlyWasDescription = element.getAttribute("aria-description") || "";
        element.dataset.readonlyHadDescription = element.hasAttribute("aria-description") ? "true" : "false";
        if (element.matches("[data-shot-field],[data-entry-field],[data-day-field],[data-project-field],[data-time-draft]")) {
          if (composingFields.has(element)) {
            const draft = fieldDraftFor(element) || captureFieldDraft(element);
            composingFields.delete(element);
            if (draft) { draft.composing = false; draft.blurPending = false; syncDraftSnapshot(); }
          } else if (document.activeElement === element && !fieldDraftFor(element)) captureFieldDraft(element);
        }
      }
      if (readonlyFieldControl(element)) {
        element.readOnly = true;
        element.setAttribute("aria-readonly", "true");
      } else {
        element.disabled = true;
        element.setAttribute("aria-disabled", "true");
      }
      element.setAttribute("aria-description", READ_ONLY_HELP);
      return;
    }
    if (!element.dataset.readonlyLocked) return;
    element.disabled = element.dataset.readonlyWasDisabled === "true";
    if ("readOnly" in element) element.readOnly = element.dataset.readonlyWasReadonly === "true";
    if (element.dataset.readonlyHadAriaDisabled === "true") element.setAttribute("aria-disabled", element.dataset.readonlyWasAriaDisabled);
    else element.removeAttribute("aria-disabled");
    if (element.dataset.readonlyHadAriaReadonly === "true") element.setAttribute("aria-readonly", element.dataset.readonlyWasAriaReadonly);
    else element.removeAttribute("aria-readonly");
    if (element.dataset.readonlyHadDescription === "true") element.setAttribute("aria-description", element.dataset.readonlyWasDescription);
    else element.removeAttribute("aria-description");
    ["readonlyLocked", "readonlyWasDisabled", "readonlyWasReadonly", "readonlyWasAriaDisabled", "readonlyHadAriaDisabled", "readonlyWasAriaReadonly", "readonlyHadAriaReadonly", "readonlyWasDescription", "readonlyHadDescription"].forEach((key) => delete element.dataset[key]);
  }
  function applyReadonlyControls(skipIfUnchanged) {
    const locked = isReadOnly();
    const drawingAvailable = drawingUiAvailable();
    const canCreateDrawing = drawingAvailable && lifecycle && lifecycle.writable === true && Number(lifecycle.pendingCount || 0) === 0 && lifecycle.phase !== "save_failed";
    const nextKey = readonlyControlsKey(locked, drawingAvailable, canCreateDrawing);
    if (skipIfUnchanged === true && nextKey === lastReadonlyControlsKey) return false;
    document.body.classList.toggle("is-read-only", locked);
    $$(READ_ONLY_CONTROL_SELECTOR).forEach((element) => lockReadonlyControl(element, locked));
    $$("#shot-list .shot-thumb[role='button']").forEach((element) => element.setAttribute("aria-disabled", locked ? "true" : "false"));
    $$("#shot-list .shot-drawing-entry").forEach((button) => {
      const existingDrawing = button.dataset.hasDrawing === "true";
      const staleEntry = button.dataset.drawingEntryStale === "true";
      const disabled = staleEntry || !drawingAvailable || (!existingDrawing && !canCreateDrawing);
      button.disabled = disabled;
      const reason = staleEntry ? "此手繪入口已離開目前鏡頭清單；請從目前鏡頭卡重新開啟。" : !drawingAvailable ? "手繪畫布尚未載入。" : existingDrawing ? "開啟此鏡頭的手繪 Drawing。" : canCreateDrawing ? "建立並編輯此鏡頭的 Drawing。" : locked ? "唯讀瀏覽；重新取得編輯權後才能建立 Drawing。" : "目前有保存命令待處理，完成保存後才能建立 Drawing。";
      button.title = reason; button.setAttribute("aria-description", reason);
    });
    refreshShotPlaceholderControls($("#shot-list [data-shot-placeholder]"));
    lastReadonlyControlsKey = nextKey;
    return true;
  }
  function readOnlyFailure() {
    const error = new Error("目前專案為唯讀；請重新取得編輯權後再修改。");
    error.code = "READ_ONLY";
    return error;
  }
  const message = (text, error) => {
    const region = $("#toast-region");
    if (!region) return;
    const toast = document.createElement("div"); toast.className = "toast" + (error ? " is-error" : ""); toast.textContent = text; region.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };
  function draftKey(entityId, field) { return [state && state.projectId || "", entityId || "", field || ""].join("\u0000"); }
  function productionTimelineDraftsForProject(projectId) {
    return Array.from(productionTimelineDrafts.values()).filter((draft) => !projectId || draft.projectId === projectId);
  }
  function hasProductionTimelineDrafts(projectId) { return productionTimelineDraftsForProject(projectId).length > 0; }
  function hasUncommittedWorkForUnload() {
    const currentLifecycle = lifecycle || {};
    return fieldDrafts.size > 0 || !!pendingPreferencePatch || hasProductionTimelineDrafts(state && state.projectId) ||
      pendingMutationPromises.size > 0 || uiPending > 0 || Number(currentLifecycle.pendingCount || 0) > 0 ||
      currentLifecycle.phase === "saving" || currentLifecycle.phase === "save_failed";
  }
  function guardBeforeUnload(event) {
    if (!hasUncommittedWorkForUnload()) return;
    event.preventDefault();
    event.returnValue = "";
  }
  window.addEventListener("beforeunload", guardBeforeUnload);
  function registerProductionTimelineDraft(namespace, draft) {
    if (typeof namespace !== "string" || !namespace.startsWith("production-timeline:")) throw fieldFailure("INVALID_TIMELINE_DRAFT", "製作時程草稿命名空間無效。");
    if (draft) {
      const projectId = String(draft.projectId || "");
      if (!projectId || !namespace.startsWith("production-timeline:" + projectId + ":")) throw fieldFailure("TIMELINE_DRAFT_PROJECT_MISMATCH", "製作時程草稿與專案不一致；草稿未被覆蓋。");
      const value = draft.value && typeof draft.value === "object" ? draft.value : {};
      productionTimelineDrafts.set(namespace, {
        projectId,
        entityType: "productionTask",
        entityId: draft.entityId || value.taskId || null,
        field: "productionTimeline",
        value: Object.assign({}, value, {
          values: Object.assign({}, value.values || {}),
          original: value.original ? Object.assign({}, value.original) : null
        }),
        version: Number(draft.version || 0),
        composing: false,
        error: draft.error ? Object.assign({}, draft.error) : null
      });
    } else productionTimelineDrafts.delete(namespace);
    syncDraftSnapshot();
    renderDurableStatus();
  }
  function renderProductionTimelineControl() {
    const toggle = $("#production-timeline-toggle");
    const status = $("#production-timeline-status");
    if (!toggle || !status) return;
    const available = !!(window.DirectorProductionTimeline && typeof window.DirectorProductionTimeline.mount === "function");
    const open = !!productionTimelineHandle && productionTimelineProjectId === (state && state.projectId);
    const drafts = productionTimelineDraftsForProject(state && state.projectId);
    toggle.disabled = !available || !state || !state.projectId;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "收合製作時程" : drafts.length ? "繼續製作時程草稿" : "展開製作時程";
    if (productionTimelineError) status.textContent = productionTimelineError;
    else if (!available) status.textContent = "製作時程模組未載入；目前無法開啟互動時程。";
    else if (drafts.length && !open) status.textContent = "有未保存草稿已保留；展開後可繼續保存或明確放棄。";
    else if (drafts.length) status.textContent = "時程草稿尚未保存；可在時程內保存或放棄。";
    else status.textContent = "拍攝日標記可直接切換下方日期分頁。";
  }
  function closeProductionTimeline() {
    if (!productionTimelineHandle) {
      const host = $("#production-timeline-mount"); if (host) host.hidden = true;
      renderProductionTimelineControl();
      return true;
    }
    const handle = productionTimelineHandle;
    if (typeof handle.destroy === "function" && handle.destroy() === false) return false;
    productionTimelineHandle = null;
    productionTimelineProjectId = null;
    const host = $("#production-timeline-mount");
    if (host) { host.hidden = true; host.replaceChildren(); }
    renderProductionTimelineControl();
    return true;
  }
  function selectShootingDayFromTimeline(dayId) {
    const day = state && state.days.find((item) => item.id === dayId);
    if (!day) return false;
    selectedDayId = dayId;
    const first = state.entries.find((entry) => entry.dayId === selectedDayId);
    selectedEntryId = first ? first.id : null;
    entryReorderSelection = new Set(); entrySelectionAnchorId = null;
    setView("schedule");
    renderSchedule();
    const activeTab = $$("#shoot-day-tabs [data-day-id]").find((tab) => tab.dataset.dayId === dayId);
    if (activeTab) activeTab.focus({ preventScroll: true });
    return true;
  }
  function openProductionTimeline() {
    if (!state || !state.projectId) return false;
    if (productionTimelineHandle) {
      if (productionTimelineProjectId === state.projectId) {
        const host = $("#production-timeline-mount"); if (host) host.hidden = false;
        renderProductionTimelineControl();
        return true;
      }
      if (!closeProductionTimeline()) return false;
    }
    const api = window.DirectorProductionTimeline;
    const host = $("#production-timeline-mount");
    if (!api || typeof api.mount !== "function" || !host) {
      productionTimelineError = "製作時程模組未載入；目前無法開啟互動時程。";
      renderProductionTimelineControl();
      return false;
    }
    host.replaceChildren(); host.hidden = false;
    productionTimelineProjectId = state.projectId;
    productionTimelineError = null;
    try {
      productionTimelineHandle = api.mount(host, {
        model,
        projectId: state.projectId,
        initialDraft: productionTimelineDraftsForProject(state.projectId)[0] || null,
        onDraftChange: registerProductionTimelineDraft,
        onClose: () => { if (!closeProductionTimeline()) message("時程仍有未保存草稿；草稿已保留，請先保存或放棄後再收合。", true); },
        onSelectShootingDay: selectShootingDayFromTimeline
      });
      renderProductionTimelineControl();
      return true;
    } catch (error) {
      productionTimelineHandle = null; productionTimelineProjectId = null;
      productionTimelineError = "製作時程無法開啟：" + (error && error.message || String(error));
      host.hidden = true; host.replaceChildren();
      renderProductionTimelineControl();
      message(productionTimelineError, true);
      return false;
    }
  }
  function toggleProductionTimeline() {
    if (productionTimelineHandle) {
      if (!closeProductionTimeline()) message("製作時程未能收合；未保存草稿仍留在畫面中。", true);
    } else openProductionTimeline();
  }
  function draftSnapshot() {
    const items = Array.from(fieldDrafts.values()).map((draft) => ({
      projectId: draft.projectId, entityId: draft.entityId, field: draft.field,
      entityType: draft.entityType, value: draft.value, version: draft.version, composing: !!draft.composing,
      error: draft.error || null
    }));
    productionTimelineDrafts.forEach((draft) => items.push({
      projectId: draft.projectId, entityId: draft.entityId, field: draft.field,
      entityType: draft.entityType, value: draft.value, version: draft.version, composing: false,
      error: draft.error || null
    }));
    if (pendingPreferencePatch) items.push({ projectId: state && state.projectId || "", entityId: "project", field: "outputPreferences", value: pendingPreferencePatch, version: pendingPreferenceVersion, composing: false });
    return items;
  }
  function syncDraftSnapshot() {
    if (!model || typeof model.setDraftSnapshot !== "function") return;
    try { model.setDraftSnapshot(draftSnapshot()); } catch (error) { console.error("Unable to update draft snapshot", error); }
  }
  function captureFieldDraft(field) {
    const entityId = field.dataset.entityId || field.closest("[data-entry]")?.dataset.entry || (field.dataset.projectField ? state && state.projectId : field.dataset.shotField ? selectedShotId : field.dataset.dayField ? selectedDayId : selectedEntryId);
    const fieldName = field.dataset.shotField || field.dataset.entryField || field.dataset.dayField || field.dataset.projectField || field.dataset.field;
    if (!entityId || !fieldName) return null;
    field.dataset.entityId = entityId;
    const key = draftKey(entityId, fieldName);
    const version = (draftVersions.get(key) || 0) + 1;
    draftVersions.set(key, version);
    const prior = fieldDrafts.get(key);
    const entityType = field.dataset.projectField ? "project" : field.dataset.shotField ? "shot" : field.dataset.dayField ? "day" : field.dataset.entryField || field.dataset.timeDraft || field.dataset.field ? "entry" : null;
    const draft = { key, projectId: state && state.projectId || "", entityId, entityType, field: fieldName, value: field.type === "checkbox" ? !!field.checked : field.value, version, composing: composingFields.has(field), blurPending: prior && prior.blurPending || false, error: null, submittedVersion: null, deferred: !!field.dataset.timeDraft };
    fieldDrafts.set(key, draft);
    syncDraftSnapshot(); renderDurableStatus();
    clearFieldError(field);
    return draft;
  }
  function callsheetFieldPath(collection, rowId, field) {
    return "callsheet-row:" + collection + ":" + encodeURIComponent(rowId) + ":" + field;
  }
  function parseCallsheetFieldPath(value) {
    const match = /^callsheet-row:(contacts|groupCalls|vehicles|notices):([^:]+):(position|name|phone|onCall|group|location|time|label|plate|driver|driverPhone|passengers|text)$/.exec(String(value || ""));
    if (!match) return null;
    try { return { collection:match[1], rowId:decodeURIComponent(match[2]), field:match[3] }; }
    catch (_) { return null; }
  }
  function newCallsheetRowId(kind) {
    callsheetRowSequence += 1;
    const cryptoApi = typeof window !== "undefined" && window.crypto;
    const random = cryptoApi && typeof cryptoApi.randomUUID === "function"
      ? cryptoApi.randomUUID()
      : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + callsheetRowSequence.toString(36);
    return String(kind || "row") + "-" + random;
  }
  function fieldDraftFor(field) {
    const entityId = field.dataset.entityId || field.closest("[data-entry]")?.dataset.entry;
    const fieldName = field.dataset.shotField || field.dataset.entryField || field.dataset.dayField || field.dataset.projectField || field.dataset.field;
    return entityId && fieldName ? fieldDrafts.get(draftKey(entityId, fieldName)) : null;
  }
  function setFieldError(field, error) {
    let target = field;
    if (target && !target.isConnected && target.dataset && target.dataset.shotField) {
      target = $$("#shot-list [data-shot-field]").find((candidate) => candidate.dataset.entityId === field.dataset.entityId && candidate.dataset.shotField === field.dataset.shotField) || field;
    }
    const draft = target && fieldDraftFor(target) || field && field.dataset && field.dataset.shotField && fieldDrafts.get(draftKey(field.dataset.entityId, field.dataset.shotField));
    if (draft) draft.error = { code: error && error.code || "SAVE_FAILED", message: error && error.message || String(error) };
    const group = target && (target.closest(".field-group") || target.parentElement);
    if (!group) { syncDraftSnapshot(); renderDurableStatus(); return; }
    let node = group.querySelector(":scope > .field-save-error");
    if (!node) { node = document.createElement("span"); node.className = "field-save-error"; node.setAttribute("role", "alert"); group.appendChild(node); }
    node.textContent = (error && error.code ? error.code + " · " : "") + (error && error.message || "欄位保存失敗；輸入仍保留。");
    syncDraftSnapshot(); renderDurableStatus();
  }
  function renderDraftError(field, draft) {
    if (!field || !draft || !draft.error) return;
    const group = field.closest(".field-group") || field.parentElement; if (!group) return;
    let node = group.querySelector(":scope > .field-save-error");
    if (!node) { node = document.createElement("span"); node.className = "field-save-error"; node.setAttribute("role", "alert"); group.appendChild(node); }
    node.textContent = (draft.error.code ? draft.error.code + " · " : "") + (draft.error.message || "欄位保存失敗；輸入仍保留。");
  }
  function renderDraftError(field, draft) {
    if (!field || !draft || !draft.error) return;
    const group = field.closest(".field-group") || field.parentElement; if (!group) return;
    let node = group.querySelector(":scope > .field-save-error");
    if (!node) { node = document.createElement("span"); node.className = "field-save-error"; node.setAttribute("role", "alert"); group.appendChild(node); }
    node.textContent = (draft.error.code ? draft.error.code + " · " : "") + (draft.error.message || "欄位保存失敗；輸入仍保留。");
  }
  function clearFieldError(field) {
    const group = field.closest(".field-group") || field.parentElement;
    const node = group && group.querySelector(":scope > .field-save-error"); if (node) node.remove();
    const draft = fieldDraftFor(field); if (draft) draft.error = null;
  }
  function clearDraftIfCurrent(key, version) {
    const latest = fieldDrafts.get(key);
    if (!latest || latest.version !== version) return false;
    const committedShotField = latest.entityType === "shot" && ["title", "visual", "script", "super", "duration"].includes(latest.field)
      ? { shotId: latest.entityId, field: latest.field }
      : null;
    fieldDrafts.delete(key); syncDraftSnapshot(); renderDurableStatus();
    if (committedShotField) syncShotFieldCounterparts(committedShotField.shotId, committedShotField.field);
    flushPendingShotSearch();
    return true;
  }
  function hasPendingShotDrafts() {
    return Array.from(fieldDrafts.values()).some((draft) => draft.entityType === "shot");
  }
  function deferShotSearchUntilDraftsSettle() {
    if (!hasPendingShotDrafts()) return false;
    pendingShotSearchRender = true;
    const hint = $("#view-storyboard .hint-text"); if (hint) hint.textContent = "搜尋結果等待鏡頭欄位保存或取消後更新";
    return true;
  }
  function flushPendingShotSearch() {
    if (!pendingShotSearchRender || searchComposing || hasPendingShotDrafts()) return false;
    pendingShotSearchRender = false;
    const focusedCard = document.activeElement && document.activeElement.closest ? document.activeElement.closest("#shot-list .shot-card") : null;
    const focusedShotId = focusedCard && focusedCard.dataset.shot;
    if (!renderStoryboardSearchInPlace()) renderStoryboard();
    const hint = $("#view-storyboard .hint-text"); if (hint) hint.textContent = "選取鏡頭以編輯細節";
    if (focusedShotId && !$$("#shot-list .shot-card").some((card) => card.dataset.shot === focusedShotId)) $("#chapter-search").focus({preventScroll:true});
    return true;
  }
  function reconcileSavedDrafts() {
    if (!state || (!fieldDrafts.size && !pendingPreferencePatch) || lifecycle.phase === "save_failed" || lifecycle.pendingCount) return;
    let changed = false;
    const reconciledShotFields = [];
    for (const [key, draft] of Array.from(fieldDrafts.entries())) {
      const collection = draft.entityType === "shot" ? state.shots
        : draft.entityType === "entry" ? state.entries
        : draft.entityType === "day" ? state.days
        : [state.chapters, state.shots, state.days, state.entries].flat();
      const entity = draft.entityType === "project" ? (draft.entityId === state.projectId ? state : null) : collection.find((item) => item.id === draft.entityId);
      if (!entity || !Object.prototype.hasOwnProperty.call(entity, draft.field)) continue;
      const current = entity[draft.field];
      const matches = typeof current === "number" ? Number(draft.value) === current : typeof current === "boolean" ? !!draft.value === current : String(current == null ? "" : current) === String(draft.value == null ? "" : draft.value);
      if (matches && draft.submittedVersion === draft.version) {
        fieldDrafts.delete(key); changed = true;
        if (draft.entityType === "shot" && ["title", "visual", "script", "super", "duration"].includes(draft.field)) reconciledShotFields.push({shotId:draft.entityId,field:draft.field});
      }
    }
    if (pendingPreferencePatch && state.outputPreferences) {
      const committed = state.outputPreferences; const pending = pendingPreferencePatch;
      const fieldsMatch = Object.keys(pending.fields || {}).every((key) => committed.fields && committed.fields[key] === pending.fields[key]);
      if (committed.mode === pending.mode && committed.orientation === pending.orientation && committed.density === pending.density && fieldsMatch) {
        pendingPreferencePatch = null; hydrateOutputPreferences(committed); changed = true;
      }
    }
    if (changed) {
      syncDraftSnapshot(); renderDurableStatus(); flushPendingShotSearch();
      reconciledShotFields.forEach(({shotId,field}) => syncShotFieldCounterparts(shotId,field));
    }
  }
  const saveStatus = (status) => {
    const node = $("#save-state");
    const value = status || (lifecycle && lifecycle.saveStatus) || (model && model.getSaveStatus ? model.getSaveStatus() : "本機專案");
    if (node) { node.textContent = value; node.classList.toggle("is-error", /失敗|不可用|錯誤|唯讀/.test(value)); node.title = value; }
  };
  const updateHistoryButtons = () => {
    const locked = !lifecycle.writable || Number(lifecycle.pendingCount || 0) > 0 || uiPending > 0 || !state;
    $("#undo-btn").disabled = locked || !model.canUndo();
    $("#redo-btn").disabled = locked || !model.canRedo();
  };
  function modelLifecycle() {
    try { return model && typeof model.getLifecycle === "function" ? model.getLifecycle() : lifecycle; }
    catch (_) { return lifecycle; }
  }
  function gateButton(label, action, primary) {
    return '<button type="button" class="' + (primary ? 'primary-button' : 'outline-button') + '" data-lifecycle-action="' + escapeHtml(action) + '">' + escapeHtml(label) + '</button>';
  }
  function renderLifecycleGate() {
    const gate = $("#lifecycle-gate"); const content = $("#lifecycle-content");
    if (!gate || !content) return;
    gate.classList.toggle("is-forced", lifecycleGateForced);
    const isReady = document.body.classList.contains("project-ready");
    if (isReady && !lifecycleGateForced) return;
    const phase = lifecycle.phase || "opening";
    const error = lifecycle.error;
    const projects = Array.isArray(lifecycle.projects) ? lifecycle.projects : [];
    const preview = lifecycle.migrationPreview || lifecycle.migration || null;
    let title = "正在讀取本機專案"; let body = '<p>請稍候，正在開啟專案資料庫。</p><div class="loading-indicator" aria-hidden="true"></div>';
    if (phase === "saving") { title = "正在建立並保存專案"; body = '<p>只有完成本機資料庫交易後，才會開啟新專案。</p><div class="loading-indicator" aria-hidden="true"></div>'; }
    if (phase === "error" || phase === "save_failed") {
      title = phase === "save_failed" ? "新專案尚未保存" : "無法開啟本機專案";
      body = phase === "save_failed"
        ? '<p>專案資料尚未確認寫入。請重試保存或下載救援資料；目前專案與未提交內容都會保留。</p><div class="lifecycle-actions">' + gateButton("重試保存", "retry-pending", true) + gateButton("下載救援資料", "download-rescue", false) + '</div>'
        : '<p>沒有載入示範資料，也沒有修改舊稿。請檢查錯誤、下載原始資料，或明確建立新的空白專案；建立新案不會覆寫舊稿。</p><div class="lifecycle-actions">' + gateButton("重新嘗試", "retry-initialize", true) + (preview && preview.sourceRaw != null || lifecycle.sourceRaw != null ? gateButton("下載舊稿原始資料", "download-legacy", false) : '') + '</div>';
      if (phase === "error" && !isReady) {
        body += '<form class="lifecycle-create-form" id="lifecycle-create-form"><label for="lifecycle-project-title">新建專案</label><input id="lifecycle-project-title" name="title" maxlength="120" placeholder="待命名專案"><div class="lifecycle-actions"><button class="primary-button" type="submit" name="createKind" value="blank">新建專案</button></div></form>';
      }
    } else if (phase === "choosing" || lifecycleGateForced) {
      title = "選擇要開啟的專案";
      const rows = projects.length ? '<div class="lifecycle-project-list">' + projects.map((project) => '<button type="button" class="lifecycle-project" data-lifecycle-action="select-project" data-project-id="' + escapeHtml(project.projectId || project.id) + '"><span><strong>' + escapeHtml(project.title || "未命名專案") + '</strong><small>revision ' + escapeHtml(project.revision == null ? 0 : project.revision) + (String(project.projectId || "") === String(lifecycle.selectedProjectId || "") ? ' · 目前專案' : '') + '</small></span><span class="project-arrow" aria-hidden="true">›</span></button>').join("") + '</div>' : '<p>目前還沒有已保存的專案。</p>';
      body = rows + '<form class="lifecycle-create-form" id="lifecycle-create-form"><label for="lifecycle-project-title">新建專案</label><input id="lifecycle-project-title" name="title" maxlength="120" placeholder="待命名專案"><div class="lifecycle-actions"><button class="primary-button" type="submit" name="createKind" value="blank">新建專案</button><button class="outline-button" type="submit" name="createKind" value="demo">建立示範專案</button></div></form><div class="lifecycle-actions">' + (lifecycleGateForced ? gateButton("返回目前專案", "return-project", false) : '') + '</div>';
    } else if (phase === "needs_migration_confirmation" || preview && phase !== "saving") {
      title = "確認舊版草稿遷移";
      const report = preview && (preview.migrationReport || preview.report || preview);
      const project = preview && preview.project;
      const previewTitle = preview.title || (project && project.title) || (report && report.title) || "舊版草稿";
      const sourceRevision = preview.sourceRevision != null ? preview.sourceRevision : (report && report.sourceRevision != null ? report.sourceRevision : (project && project.migrationSource && project.migrationSource.sourceRevision));
      const count = (key, fallback) => preview[key] != null ? preview[key] : (report && report[key] != null ? report[key] : fallback);
      const warnings = Array.isArray(preview.warnings) ? preview.warnings : (report && Array.isArray(report.warnings) ? report.warnings : []);
      body = '<p>這是唯讀預覽。只有按下確認後，才會建立新的專案；來源舊稿會保留。</p><div class="lifecycle-report"><strong>' + escapeHtml(previewTitle) + '</strong><ul><li>來源 revision：' + escapeHtml(sourceRevision == null ? "未提供" : sourceRevision) + '</li><li>場次：' + escapeHtml(count("sceneCount", "—")) + '</li><li>鏡頭：' + escapeHtml(count("shotCount", "—")) + '</li><li>拍攝日：' + escapeHtml(count("shootingDayCount", "—")) + '</li><li>排程項目：' + escapeHtml(count("scheduleEntryCount", "—")) + '</li></ul>' + (warnings.length ? '<div class="lifecycle-warning"><strong>請檢視警告</strong><ul>' + warnings.map((warning) => '<li>' + escapeHtml(typeof warning === "string" ? warning : warning.message || warning.code || JSON.stringify(warning)) + '</li>').join("") + '</ul></div>' : '<div class="lifecycle-warning">來源 revision 會記錄於新專案；新專案從 revision 0 開始。</div>') + '</div><form class="lifecycle-create-form" id="lifecycle-migration-form"><label for="lifecycle-migration-title">新專案名稱</label><input id="lifecycle-migration-title" name="title" maxlength="120" placeholder="待命名專案" value="' + escapeHtml(previewTitle) + '"><div class="lifecycle-actions"><button class="primary-button" type="submit">確認建立新專案</button><button class="outline-button" type="button" data-lifecycle-action="cancel-migration">取消遷移</button></div></form>';
    } else if (phase === "needs_project_creation") {
      title = "建立第一個專案";
      body = '<p>資料庫目前沒有已保存專案。你可以新建專案，或建立示範專案。</p><form class="lifecycle-create-form" id="lifecycle-create-form"><label for="lifecycle-project-title">專案名稱</label><input id="lifecycle-project-title" name="title" maxlength="120" placeholder="待命名專案"><div class="lifecycle-actions"><button class="primary-button" type="submit" name="createKind" value="blank">新建專案</button><button class="outline-button" type="submit" name="createKind" value="demo">建立示範專案</button></div></form>';
    }
    const packageApiReady = !!(model && typeof model.previewCompletePackage === "function" && typeof model.importCompletePackage === "function");
    const packageGateEnabled = packageApiReady && ["choosing", "needs_project_creation", "needs_migration_confirmation", "ready", "read_only"].includes(phase);
    const driveCapability = kinoDriveCapability();
    const driveImportBlockReason = !packageApiReady
      ? "完整專案 ZIP 預覽功能尚未載入。"
      : !packageGateEnabled
        ? "本機專案資料庫尚未準備好。"
      : !driveCapability.available
        ? driveCapability.message
        : googleDriveOperation
          ? "Google Drive 操作進行中，請等候完成。"
          : completePackageImportSession && completePackageImportSession.status === "importing"
            ? "完整專案 ZIP 正在匯入。"
            : "";
    const driveImportEnabled = packageGateEnabled && !driveImportBlockReason;
    body += '<div class="lifecycle-actions package-gate-actions"><button type="button" class="outline-button" data-lifecycle-action="import-complete-package" ' + (packageGateEnabled ? "" : "disabled") + '>匯入完整專案 ZIP</button><button type="button" class="outline-button" data-lifecycle-action="import-google-drive" title="' + escapeHtml(driveImportBlockReason) + '" ' + (driveImportEnabled ? "" : "disabled") + '>從 Google Drive 匯入專案</button></div><p class="package-gate-note">ZIP 匯入會先完整驗證；確認後只新增專案，不覆寫或切換目前專案。</p><p class="package-gate-note" role="status" data-kind="' + escapeHtml(googleDriveStatus && googleDriveStatus.kind || (driveImportBlockReason ? "error" : "info")) + '">' + escapeHtml(googleDriveStatus && googleDriveStatus.text || (driveImportBlockReason || "Google Drive 匯入只會讀取你手動選取的 ZIP；取消不會修改本機專案。")) + '</p>';
    if (googleDriveOperation && googleDriveOperation.kind === "import") {
      body += '<div class="lifecycle-actions package-gate-actions"><button type="button" class="outline-button" data-lifecycle-action="cancel-drive-import" ' + (googleDriveOperation.cancelable ? "" : "disabled") + '>' + (googleDriveOperation.cancelable ? "取消 Google Drive 匯入" : "正在取消 Google Drive 匯入…") + '</button></div>';
    }
    if (error) body += '<div class="lifecycle-error"><strong>' + escapeHtml(error.code || "UNKNOWN_ERROR") + '</strong><br>' + escapeHtml(error.message || "發生未分類錯誤。") + '</div>';
    if (lifecycleGateForced && phase !== "choosing") body += '<div class="lifecycle-actions">' + gateButton("返回目前專案", "return-project", false) + '</div>';
    content.innerHTML = '<p class="lifecycle-kicker">本機專案 · ' + escapeHtml(phase.replaceAll("_", " ")) + '</p><h1 id="lifecycle-title">' + escapeHtml(title) + '</h1>' + body;
    if (lifecycleBusy) gate.querySelectorAll("button,input").forEach((element) => { element.disabled = true; });
  }
  function renderDurableStatus() {
    const panel = $("#durable-status"); if (!panel) return;
    renderProductionTimelineControl();
    if (!document.body.classList.contains("project-ready")) { panel.hidden = true; return; }
    const phase = lifecycle.phase || "ready";
    const pending = Number(lifecycle.pendingCount || 0) + uiPending;
    const hasTimelineDrafts = hasProductionTimelineDrafts(state && state.projectId);
    const hasDrafts = fieldDrafts.size > 0 || !!pendingPreferencePatch || hasTimelineDrafts;
    let title = "已儲存"; let detail = "revision " + (lifecycle.committedRevision == null ? (state && state.revision || 0) : lifecycle.committedRevision);
    panel.classList.remove("is-error", "is-read-only");
    const readOnly = phase === "read_only" || (!lifecycle.writable && phase !== "save_failed" && phase !== "error");
    if (phase === "save_failed" || phase === "error" && lifecycle.error || !readOnly && lifecycle.saveStatus && /失敗|錯誤|尚未儲存/.test(lifecycle.saveStatus)) {
      title = "尚未保存"; detail = [lifecycle.error && lifecycle.error.code, lifecycle.error && lifecycle.error.message || lifecycle.saveStatus].filter(Boolean).join(" · ") || "保存失敗，輸入仍保留。"; panel.classList.add("is-error");
    } else if (readOnly) {
      title = "唯讀"; detail = lifecycle.readOnlyReason || (lifecycle.error && lifecycle.error.message) || "此專案目前沒有編輯權。"; panel.classList.add("is-read-only");
    } else if (pending > 0 || phase === "saving") {
      title = "正在儲存"; detail = "變更尚未確認寫入；完成前不會標記為已保存。";
    } else if (hasDrafts) {
      title = "尚未保存"; detail = hasTimelineDrafts ? "製作時程或其他欄位有尚未提交的草稿。" : "有欄位或輸出偏好尚未提交。"; panel.classList.add("is-error");
    } else if (lifecycle.saveStatus) { detail = lifecycle.saveStatus + (lifecycle.committedRevision == null ? "" : " · revision " + lifecycle.committedRevision); }
    $("#durable-status-title").textContent = title;
    $("#durable-status-detail").textContent = detail;
    const actions = $("#durable-status-actions");
    actions.innerHTML = '';
    if (hasTimelineDrafts) actions.insertAdjacentHTML("beforeend", '<button type="button" data-status-action="timeline">處理製作時程草稿</button>');
    else if (hasDrafts && lifecycle.writable) actions.insertAdjacentHTML("beforeend", '<button type="button" data-status-action="save-drafts">保存欄位</button>');
    if ((hasDrafts || pending > 0 || phase === "save_failed") && !hasTimelineDrafts) actions.insertAdjacentHTML("beforeend", '<button type="button" data-status-action="discard">放棄未保存變更</button>');
    if (phase === "save_failed") actions.insertAdjacentHTML("beforeend", '<button type="button" class="primary" data-status-action="retry">重試保存</button>');
    if (phase === "save_failed" || pending > 0 || hasDrafts || lifecycle.rescueAvailable) actions.insertAdjacentHTML("beforeend", '<button type="button" data-status-action="rescue">下載救援資料</button>');
    if (phase === "read_only" && state) actions.insertAdjacentHTML("beforeend", '<button type="button" data-status-action="reclaim">重新取得編輯權</button>');
    panel.hidden = !detail && !actions.children.length;
  }
  function refreshLifecycle(next) {
    lifecycle = next || modelLifecycle() || lifecycle;
    applyReadonlyControls(true);
    refreshShotPhotoCropControls();
    const moveButton = $("#schedule-inspector [data-action='move-entry-day']");
    const moveEntry = moveButton && state && state.entries.find((entry) => entry.id === moveButton.dataset.entryTarget);
    if (moveEntry) syncEntryDayTransferControls(moveEntry, $("#schedule-inspector"));
    saveStatus(lifecycle.saveStatus);
    renderLifecycleGate(); renderDurableStatus(); updateHistoryButtons();
    renderDrawingRouteStatus();
  }
  function showProjectUI() {
    const snapshot = model.getState();
    if (!snapshot) return false;
    document.body.classList.add("project-ready"); lifecycleGateForced = false;
    if (snapshot !== state) renderForModelChange(snapshot, { type: "init", saveStatus: lifecycle.saveStatus });
    refreshLifecycle(modelLifecycle());
    return true;
  }
  async function withMutation(action) {
    if (isReadOnly()) throw readOnlyFailure();
    uiPending += 1; renderDurableStatus(); updateHistoryButtons();
    let promise;
    try { promise = Promise.resolve(action()); }
    catch (error) { promise = Promise.reject(error); }
    pendingMutationPromises.add(promise);
    try { const result = await promise; refreshLifecycle(modelLifecycle()); return result; }
    finally { pendingMutationPromises.delete(promise); uiPending = Math.max(0, uiPending - 1); renderDurableStatus(); updateHistoryButtons(); }
  }
  async function downloadJsonFile(name, value, successText) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message(successText);
  }
  const shotSearchMatches = (shot, query) => !query || [shotSequence(shot), shotNumber(shot), shot.no, shot.title, shot.visual, shot.script, shot.super, shot.sound, shot.move, shot.tags].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase());
  function matchedSceneIdsForSearch(query) {
    if (!state || !query) return new Set();
    const normalized = query.toLocaleLowerCase();
    return new Set(state.chapters.filter((chapter) => chapter.title.toLocaleLowerCase().includes(normalized)).map((chapter) => chapter.id));
  }
  function shotMatchesSearch(shot, query, matchedSceneIds) {
    return !query || matchedSceneIds.has(shot.chapterId) || shotSearchMatches(shot, query);
  }
  const activeShots = () => {
    const query = $("#chapter-search").value.trim();
    const matchedSceneIds = matchedSceneIdsForSearch(query);
    return state.shots.filter((shot) => (activeChapterId === "all" || shot.chapterId === activeChapterId) && shotMatchesSearch(shot, query, matchedSceneIds));
  };
  const formatSeconds = (value) => Number(value) === 0 ? "未估" : Number(value).toFixed(Number(value) % 1 ? 1 : 0) + " 秒";
  const totalShotSeconds = (shots) => shots.reduce((sum, shot) => sum + (Number(shot.duration) || 0), 0);
  const formatDuration = (seconds) => { const tenths = Math.round(seconds * 10), mins = Math.floor(tenths / 600), secs = (tenths % 600) / 10; return mins ? mins + " 分 " + String(secs).padStart(2, "0") + " 秒" : secs + " 秒"; };
  function refreshShotNumberResolution(force) {
    if (!state) {
      shotNumberResolution = null; shotNumberResolutionKey = ""; shotNumberResolutionError = null; shotNumberConflictIds = new Set();
      return null;
    }
    const key = String(state.projectId || "") + "\u0000" + String(state.revision == null ? "" : state.revision);
    if (!force && key === shotNumberResolutionKey) return shotNumberResolution;
    shotNumberResolutionKey = key;
    shotNumberResolution = null; shotNumberResolutionError = null; shotNumberConflictIds = new Set();
    if (!model || typeof model.resolveShotNumbers !== "function") return null;
    try {
      const resolved = model.resolveShotNumbers();
      if (!resolved || !resolved.shotNumbers || typeof resolved.shotNumbers !== "object" || !Array.isArray(resolved.conflicts)) {
        throw new Error("鏡次解析器回傳格式無效。");
      }
      shotNumberResolution = resolved;
      resolved.conflicts.forEach((conflict) => (conflict.shotIds || []).forEach((id) => shotNumberConflictIds.add(id)));
      return resolved;
    } catch (error) {
      shotNumberResolutionError = error;
      return null;
    }
  }
  function currentShotNumberResolution() {
    const key = String(state && state.projectId || "") + "\u0000" + String(state && state.revision == null ? "" : state && state.revision);
    if (key !== shotNumberResolutionKey) refreshShotNumberResolution(true);
    return shotNumberResolution;
  }
  function shotNumberConflictsForScene(sceneId) {
    const resolved = currentShotNumberResolution();
    return resolved ? resolved.conflicts.filter((conflict) => conflict.sceneId === sceneId) : [];
  }
  function sceneNumber(chapterId) { return "場次 " + (state.chapters.findIndex((chapter) => chapter.id === chapterId) + 1); }
  function shotSequence(shot) {
    if (!shot) return "";
    const resolved = currentShotNumberResolution();
    if (shotNumberResolutionError) return "—";
    if (resolved) return Object.prototype.hasOwnProperty.call(resolved.shotNumbers, shot.id) ? String(resolved.shotNumbers[shot.id]) : "—";
    return String(inChapter(shot.chapterId).findIndex((item) => item.id === shot.id) + 1);
  }
  function shotNumber(shot) { return sceneNumber(shot.chapterId) + "／鏡次 " + shotSequence(shot); }
  function shotTitleText(shot) { return shot && typeof shot.title === "string" ? shot.title : ""; }
  function shotHasTitle(shot) { return shotTitleText(shot).trim().length > 0; }
  function shotTitleOrNumber(shot, resolvedNumber) {
    return shotHasTitle(shot) ? shotTitleText(shot) : resolvedNumber == null ? shotNumber(shot) : resolvedNumber;
  }
  function shotNumberWithTitle(shot, separator, resolvedNumber) {
    return (resolvedNumber == null ? shotNumber(shot) : resolvedNumber) + (shotHasTitle(shot) ? (separator == null ? " " : separator) + shotTitleText(shot) : "");
  }
  function shotNumberWithQuotedTitle(shot, resolvedNumber) {
    return (resolvedNumber == null ? shotNumber(shot) : resolvedNumber) + (shotHasTitle(shot) ? "「" + shotTitleText(shot) + "」" : "");
  }
  function numberLabel(label, value) { return '<span class="number-part"><span class="number-label">' + escapeHtml(label) + '</span><span class="number-value">' + escapeHtml(value) + '</span></span>'; }
  function shotLabel(shot, chapterNumberOverride) { return '<span class="shot-identifiers">' + numberLabel('場次', chapterNumberOverride == null ? state.chapters.findIndex(chapter => chapter.id === shot.chapterId) + 1 : chapterNumberOverride) + '<span class="number-divider" aria-hidden="true">／</span>' + numberLabel('鏡次', shotSequence(shot)) + '</span>'; }
  function shotCardNumberMarkup(shot) {
    return shotLabel(shot) + (shot.shotNoLocked === true ? '<span class="shot-number-lock-badge" aria-label="鏡次已鎖定" title="鏡次已鎖定">鎖定</span>' : "") +
      (shotNumberConflictIds.has(shot.id) ? '<span class="shot-number-conflict-badge" aria-label="鎖號衝突">衝突</span>' : "");
  }
  function shotNumberConflictCopy(conflicts, shots) {
    return conflicts.map((conflict) => {
      const titles = (conflict.shotIds || []).map((id) => {
        const shot = shots.find((item) => item.id === id);
        return shot ? shotTitleOrNumber(shot) : id;
      });
      return "鏡次 " + conflict.shotNo + " 重複鎖定" + (titles.length ? "（" + titles.join("、") + "）" : "");
    }).join("；");
  }
  function shotNumberManagementMarkup(shot) {
    const conflicts = shotNumberConflictsForScene(shot.chapterId);
    const lockAvailable = !!(model && typeof model.setShotNumberLocked === "function" && currentShotNumberResolution() && !shotNumberResolutionError);
    const previewAvailable = !!(model && typeof model.previewShotRenumber === "function" && typeof model.renumberShots === "function" && currentShotNumberResolution() && !shotNumberResolutionError);
    const locked = shot.shotNoLocked === true;
    const helper = shotNumberResolutionError
      ? "無法解析鏡次；請重新載入專案後再試。"
      : locked ? "排序不會改變已鎖定鏡次；解鎖後回到自動編號。" : "自動鏡次依本場順序排列；鎖定可保留目前號碼。";
    const warning = conflicts.length
      ? '<p class="shot-number-warning" role="alert">' + escapeHtml(shotNumberConflictCopy(conflicts, state.shots)) + '。請解除其中一個鎖號後再重試。</p>'
      : "";
    return '<div class="shot-number-management"><div class="shot-number-actions"><button type="button" class="small-action shot-number-action" data-action="toggle-shot-number-lock" data-shot-id="' + escapeHtml(shot.id) + '" aria-pressed="' + (locked ? "true" : "false") + '" ' + (lockAvailable ? "" : "disabled") + '>' + (locked ? "解除鏡次鎖定" : "鎖定目前鏡次") + '</button><button type="button" class="small-action shot-number-action" data-action="preview-shot-number-renumber" data-scene-id="' + escapeHtml(shot.chapterId) + '" ' + (previewAvailable ? "" : "disabled") + '>預覽本場重編</button></div><small class="field-note">' + helper + '</small>' + warning + '</div>';
  }
  function syncShotNumberManagement(shot, container) {
    const host = container.querySelector(".shot-number-management") || document.createElement("div");
    host.className = "shot-number-management";
    const number = container.querySelector(".inspector-number");
    if (!host.isConnected && number) number.insertAdjacentElement("afterend", host);
    host.outerHTML = shotNumberManagementMarkup(shot);
  }
  function ensureShotNumberPreviewDialog() {
    let dialog = $("#shot-number-preview-dialog");
    if (dialog) return dialog;
    document.body.insertAdjacentHTML("beforeend", '<dialog class="app-dialog shot-number-preview-dialog" id="shot-number-preview-dialog" aria-labelledby="shot-number-preview-title" aria-describedby="shot-number-preview-status"><div class="dialog-top"><span class="dialog-mark" aria-hidden="true">#</span><button class="dialog-close" type="button" data-close="shot-number-preview-dialog" aria-label="關閉鏡次重編預覽">×</button></div><h2 id="shot-number-preview-title">預覽本場鏡次重編</h2><p class="dialog-lead" id="shot-number-preview-status" role="status" aria-live="polite"></p><div class="shot-number-preview-list" id="shot-number-preview-list"></div><div class="dialog-actions"><button type="button" class="outline-button" data-close="shot-number-preview-dialog">取消</button><button type="button" class="outline-button" data-action="refresh-shot-number-preview">重新預覽</button><button type="button" class="primary-button" data-action="apply-shot-number-renumber">套用重編</button></div></dialog>');
    dialog = $("#shot-number-preview-dialog");
    dialog.addEventListener("close", () => { shotNumberPreviewSession = null; });
    return dialog;
  }
  function captureShotNumberPreview(sceneId) {
    if (!state || !model || typeof model.previewShotRenumber !== "function" || typeof model.resolveShotNumbers !== "function") {
      throw new Error("鏡次預覽功能尚未載入。");
    }
    const preview = model.previewShotRenumber(sceneId);
    const resolved = model.resolveShotNumbers();
    const shots = state.shots.filter((shot) => shot.chapterId === sceneId).map((shot) => ({
      id: shot.id, chapterId: shot.chapterId, title: shot.title || "", shotNoLocked: shot.shotNoLocked === true
    }));
    if (preview.sceneId !== sceneId || preview.baseRevision !== state.revision || !Array.isArray(preview.assignments) || !Array.isArray(preview.conflicts)) {
      throw Object.assign(new Error("專案已變更，請重新預覽鏡次重編。"), { code: "STALE_SHOT_RENUMBER_PREVIEW" });
    }
    shotNumberPreviewSession = {
      projectId: state.projectId,
      sceneId: sceneId,
      preview: preview,
      shots: shots,
      currentNumbers: Object.assign({}, resolved.shotNumbers),
      stale: false
    };
    const dialog = ensureShotNumberPreviewDialog();
    renderShotNumberPreviewDialog();
    if (!dialog.open) { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", ""); }
    return shotNumberPreviewSession;
  }
  function shotNumberPreviewRows(session) {
    const assignmentById = new Map(session.preview.assignments.map((item) => [item.shotId, item]));
    return session.shots.map((shot) => {
      const current = String(session.currentNumbers[shot.id] == null ? "—" : session.currentNumbers[shot.id]);
      const assignment = assignmentById.get(shot.id);
      const next = shot.shotNoLocked || !assignment ? current : String(assignment.shotNo);
      return { shot: shot, current: current, next: next, changed: current !== next };
    });
  }
  function renderShotNumberPreviewDialog() {
    const dialog = $("#shot-number-preview-dialog");
    const session = shotNumberPreviewSession;
    if (!dialog || !session) return;
    const status = $("#shot-number-preview-status", dialog);
    const list = $("#shot-number-preview-list", dialog);
    const apply = $("[data-action='apply-shot-number-renumber']", dialog);
    const refresh = $("[data-action='refresh-shot-number-preview']", dialog);
    const rows = shotNumberPreviewRows(session);
    const visibleChanges = rows.filter((row) => row.changed).length;
    const conflicts = session.preview.conflicts;
    const stale = session.stale || !state || state.projectId !== session.projectId || state.revision !== session.preview.baseRevision;
    const scene = state && state.chapters.find((item) => item.id === session.sceneId);
    const sceneLabel = scene ? sceneTitle(scene) : "此場次";
    if (status) {
      if (stale) status.textContent = "專案內容已變更；這份預覽已過期，請重新預覽後再決定。";
      else if (conflicts.length) status.textContent = shotNumberConflictCopy(conflicts, session.shots) + "。解除重複鎖號後再重新預覽。";
      else if (!visibleChanges) status.textContent = sceneLabel + "：目前鏡次已符合規則，沒有可見號碼變更。";
      else status.textContent = sceneLabel + "：預覽只會調整未鎖定鏡次，共 " + visibleChanges + " 個號碼會改變。";
    }
    if (list) {
      list.innerHTML = '<div class="shot-number-preview-row shot-number-preview-head" role="row"><span role="columnheader">鏡頭</span><span role="columnheader">目前鏡次</span><span role="columnheader">重編後</span><span role="columnheader">狀態</span></div>' + rows.map((row) => '<div class="shot-number-preview-row" role="row"><span role="cell" class="shot-number-preview-title">' + escapeHtml(shotTitleOrNumber(row.shot, row.current)) + '</span><span role="cell">' + escapeHtml(row.current) + '</span><span role="cell">' + escapeHtml(row.next) + '</span><span role="cell">' + (row.shot.shotNoLocked ? "鎖定" : row.changed ? "自動" : "自動，保留") + '</span></div>').join("");
      list.setAttribute("role", "table");
      list.setAttribute("aria-label", sceneLabel + "鏡次重編預覽");
      if (!rows.length) list.innerHTML += '<p class="shot-number-preview-empty">此場次目前沒有鏡頭。</p>';
    }
    if (apply) {
      apply.disabled = stale || conflicts.length > 0 || visibleChanges === 0 || isReadOnly() || !model || typeof model.renumberShots !== "function";
      apply.textContent = visibleChanges ? "套用重編" : "目前無須重編";
    }
    if (refresh) refresh.disabled = !model || typeof model.previewShotRenumber !== "function";
  }
  async function toggleShotNumberLock(shotId) {
    if (isReadOnly()) { message("目前為唯讀瀏覽；無法變更鏡次鎖定。", true); return; }
    const shot = state && state.shots.find((item) => item.id === shotId);
    if (!shot || !model || typeof model.setShotNumberLocked !== "function") { message("鏡次鎖定功能尚未載入。", true); return; }
    const lock = shot.shotNoLocked !== true;
    const number = shotSequence(shot);
    try {
      await withMutation(() => model.setShotNumberLocked(shot.id, lock));
      message(lock ? "已鎖定鏡次 " + number + "。" : "已解除鏡次鎖定；此鏡回到自動編號。", false);
    } catch (error) {
      if (error && error.code === "LOCKED_SHOT_NUMBER_COLLISION") {
        message("本場有重複鎖號；請先解除衝突鏡頭的鎖定。", true);
        return;
      }
      throw error;
    }
  }
  async function applyShotNumberRenumber() {
    const session = shotNumberPreviewSession;
    if (!session) return;
    if (isReadOnly()) { message("目前為唯讀瀏覽；無法套用鏡次重編。", true); return; }
    if (!state || session.projectId !== state.projectId || session.preview.baseRevision !== state.revision || session.stale) {
      session.stale = true; renderShotNumberPreviewDialog();
      message("專案內容已變更；請重新預覽後再套用。", true); return;
    }
    if (session.preview.conflicts.length) {
      renderShotNumberPreviewDialog(); message("本場有重複鎖號，無法套用重編。", true); return;
    }
    const visibleChanges = shotNumberPreviewRows(session).filter((row) => row.changed).length;
    if (!visibleChanges) {
      renderShotNumberPreviewDialog(); message("目前鏡次已符合規則，沒有需要套用的可見變更。", false); return;
    }
    const apply = $("[data-action='apply-shot-number-renumber']", $("#shot-number-preview-dialog"));
    if (apply) apply.disabled = true;
    try {
      const changed = await withMutation(() => model.renumberShots(session.preview));
      closeShotNumberPreview();
      message(changed ? "已重編本場 " + changed + " 個鏡次。" : "目前鏡次已符合規則。", false);
    } catch (error) {
      if (error && (error.code === "STALE_SHOT_RENUMBER_PREVIEW" || error.code === "LOCKED_SHOT_NUMBER_COLLISION")) {
        session.stale = true; renderShotNumberPreviewDialog();
        message(error.code === "STALE_SHOT_RENUMBER_PREVIEW" ? "專案內容已變更；請重新預覽後再套用。" : "本場有重複鎖號，無法套用重編；請解除衝突後重新預覽。", true);
        return;
      }
      throw error;
    } finally {
      if (apply && apply.isConnected && shotNumberPreviewSession && !shotNumberPreviewSession.stale) renderShotNumberPreviewDialog();
    }
  }
  function refreshShotNumberPreview() {
    const session = shotNumberPreviewSession;
    if (!session) return;
    try { captureShotNumberPreview(session.sceneId); }
    catch (error) { message((error.code ? error.code + " · " : "") + (error.message || "鏡次預覽失敗。"), true); }
  }
  function closeShotNumberPreview() {
    const dialog = $("#shot-number-preview-dialog");
    if (dialog && dialog.open) closeDialog(dialog.id);
    shotNumberPreviewSession = null;
  }
  function syncShotNumberPreviewAfterProjectChange(snapshot) {
    if (!shotNumberPreviewSession) return;
    if (!snapshot || snapshot.projectId !== shotNumberPreviewSession.projectId) {
      closeShotNumberPreview();
      return;
    }
    if (snapshot.revision !== shotNumberPreviewSession.preview.baseRevision) shotNumberPreviewSession.stale = true;
    renderShotNumberPreviewDialog();
  }
  function sceneTitle(chapter) { return sceneNumber(chapter.id) + (chapter.title ? "／" + chapter.title : ""); }
  function applyProjectAspectRatio(value) {
    const ratio = value || "16:9";
    const cssValues = {"16:9":"16 / 9","1:1":"1 / 1","4:3":"4 / 3","2.35:1":"2.35 / 1"};
    document.documentElement.style.setProperty("--storyboard-aspect-ratio", cssValues[ratio] || cssValues["16:9"]);
    document.documentElement.dataset.aspectRatio = ratio;
    const control = $("#project-aspect-ratio"); if (control && control.value !== ratio) control.value = ratio;
  }
  function resizeShotVisual(field, expanded) {
    if (!field) return;
    field.style.height = "auto";
    const contentHeight = Math.max(field.scrollHeight, 48);
    const height = expanded ? contentHeight : Math.min(contentHeight, 58);
    field.style.height = height + "px";
    field.style.overflowY = expanded && contentHeight > height ? "auto" : "hidden";
  }
  function resizeShotVisualBatch(fields) {
    fields.forEach((field) => { field.style.height = "auto"; });
    const measurements = fields.map((field) => ({ field: field, contentHeight: Math.max(field.scrollHeight, 48) }));
    measurements.forEach(({ field, contentHeight }) => {
      const height = Math.min(contentHeight, 58);
      field.style.height = height + "px";
      field.style.overflowY = "hidden";
    });
  }

  function photoImportModule() { return window.DirectorStoryboardPhotoImport || null; }
  function photoUrlKey(projectId, assetId) { return String(projectId || "") + "\u0000" + String(assetId || ""); }
  function photoReadKey(projectId, shotId, assetId) { return [projectId || "", shotId || "", assetId || ""].join("\u0000"); }
  function photoShotUsesAsset(projectId, shotId, assetId) {
    return !!(state && state.projectId === projectId && state.shots.some((shot) => shot.id === shotId && Array.isArray(shot.assetIds) && shot.assetIds.includes(assetId)));
  }
  function visibleShotPhotoCards(projectId, assetId) {
    return $$("#shot-list .shot-card").filter((card) => !card.hidden && card.dataset.photoProject === projectId && card.dataset.photoAssetId === assetId);
  }
  function clearShotPhotoCardImage(card, entry) {
    const image = card && card.querySelector(".shot-photo-content img.shot-photo-image");
    if (!image || !entry || image.src !== entry.url) return false;
    image.removeAttribute("src");
    const status = document.createElement("span");
    status.className = "shot-photo-message";
    status.textContent = "照片預覽待載入";
    setPhotoCardContent(card, status);
    card.classList.remove("has-loaded-photo");
    return true;
  }
  function releaseShotPhotoUrl(key, clearCards) {
    const entry = shotPhotoObjectUrls.get(key);
    if (!entry) return;
    shotPhotoObjectUrls.delete(key);
    if (clearCards !== false) {
      $$("#shot-list .shot-card[data-photo-asset-id]").forEach((card) => {
        if (card.dataset.photoProject === entry.projectId && card.dataset.photoAssetId === entry.assetId) clearShotPhotoCardImage(card, entry);
      });
    }
    try { URL.revokeObjectURL(entry.url); } catch (_) {}
  }
  function releaseAllShotPhotoUrls() {
    disconnectShotPhotoObservation($("#shot-list"));
    Array.from(shotPhotoObjectUrls.keys()).forEach((key) => releaseShotPhotoUrl(key));
  }
  function reconcileShotPhotoUrls() {
    const list = $("#shot-list");
    if (!list) {
      Array.from(shotPhotoObjectUrls.keys()).forEach((key) => releaseShotPhotoUrl(key, false));
      return;
    }
    if (!shotPhotoObjectUrls.size) return;
    const rootRect = shotPhotoRootRect(shotPhotoScrollRoot(list));
    const margin = parseFloat(SHOT_PHOTO_OBSERVER_ROOT_MARGIN) || 0;
    const nearby = new Set();
    const cards = $$("#shot-list .shot-card[data-photo-asset-id]");
    cards.forEach((card) => {
      const key = photoUrlKey(card.dataset.photoProject, card.dataset.photoAssetId);
      const entry = shotPhotoObjectUrls.get(key);
      const inRange = !card.hidden && card.dataset.photoProject === (state && state.projectId) &&
        shotPhotoCardDistance(card, rootRect, margin) !== Infinity;
      if (inRange) nearby.add(key);
      else if (entry) clearShotPhotoCardImage(card, entry);
    });
    Array.from(shotPhotoObjectUrls.keys()).forEach((key) => { if (!nearby.has(key)) releaseShotPhotoUrl(key, false); });
  }
  function scheduleShotPhotoUrlReconciliation() {
    if (shotPhotoUrlReconcileFrame !== null) return;
    const reconcile = () => {
      shotPhotoUrlReconcileFrame = null;
      reconcileShotPhotoUrls();
    };
    if (typeof window.requestAnimationFrame === "function") {
      shotPhotoUrlReconcileFrame = { kind: "raf", id: window.requestAnimationFrame(reconcile) };
    } else {
      shotPhotoUrlReconcileFrame = { kind: "timeout", id: window.setTimeout(reconcile, 16) };
    }
  }
  function disconnectShotPhotoObservation(list) {
    if (shotPhotoObserver && (!list || shotPhotoObserverList === list)) {
      shotPhotoObserver.disconnect();
      shotPhotoObserver = null;
      shotPhotoObserverRoot = null;
      shotPhotoObserverList = null;
    }
    if (shotPhotoFallbackTimer !== null) window.clearTimeout(shotPhotoFallbackTimer);
    shotPhotoFallbackTimer = null;
    shotPhotoFallbackGeneration += 1;
    if (shotPhotoLoadQueueTimer !== null) window.clearTimeout(shotPhotoLoadQueueTimer);
    shotPhotoLoadQueueTimer = null;
    shotPhotoLoadQueueScheduled = false;
    shotPhotoLoadQueue.clear();
    if (shotPhotoUrlReconcileFrame !== null) {
      if (shotPhotoUrlReconcileFrame.kind === "raf" && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(shotPhotoUrlReconcileFrame.id);
      else window.clearTimeout(shotPhotoUrlReconcileFrame.id);
      shotPhotoUrlReconcileFrame = null;
    }
  }
  function shotPhotoScrollRoot(list) {
    if (!list || !list.isConnected) return null;
    const overflowY = window.getComputedStyle(list).overflowY;
    const hasOwnScrollRange = list.scrollHeight > list.clientHeight + 1;
    return hasOwnScrollRange && /^(auto|scroll|overlay)$/.test(overflowY) ? list : null;
  }
  function shotPhotoRootRect(root) {
    if (root) return root.getBoundingClientRect();
    const width = document.documentElement.clientWidth || window.innerWidth;
    const height = document.documentElement.clientHeight || window.innerHeight;
    return { left: 0, top: 0, right: width, bottom: height, width, height };
  }
  function shotPhotoCardDistance(card, rootRect, margin) {
    if (!card || !card.isConnected || card.hidden || !rootRect) return Infinity;
    if (rootRect.width <= 0 || rootRect.height <= 0) return Infinity;
    const rect = card.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return Infinity;
    if (rect.right < rootRect.left || rect.left > rootRect.right) return Infinity;
    const top = rootRect.top - margin;
    const bottom = rootRect.bottom + margin;
    if (rect.bottom < top || rect.top > bottom) return Infinity;
    if (rect.bottom < rootRect.top) return rootRect.top - rect.bottom;
    if (rect.top > rootRect.bottom) return rect.top - rootRect.bottom;
    return 0;
  }
  function nearbyShotPhotoCards(projectId, assetId, rootRect, margin) {
    const list = $("#shot-list");
    if (!list) return [];
    const rect = rootRect || shotPhotoRootRect(shotPhotoScrollRoot(list));
    const distanceMargin = margin == null ? parseFloat(SHOT_PHOTO_OBSERVER_ROOT_MARGIN) || 0 : margin;
    return visibleShotPhotoCards(projectId, assetId).filter((card) => shotPhotoCardDistance(card, rect, distanceMargin) !== Infinity);
  }
  function shotPhotoRequestKey(card) {
    return photoReadKey(card.dataset.photoProject, card.dataset.shot, card.dataset.photoAssetId);
  }
  function scheduleShotPhotoLoadQueue(delay) {
    if (shotPhotoLoadQueueScheduled || !shotPhotoLoadQueue.size) return;
    shotPhotoLoadQueueScheduled = true;
    shotPhotoLoadQueueTimer = window.setTimeout(processShotPhotoLoadQueue, delay == null ? 0 : delay);
  }
  function queueShotPhotoLoad(card) {
    if (!card || !card.isConnected || !card.dataset.photoProject || !card.dataset.shot || !card.dataset.photoAssetId) return;
    const projectId = card.dataset.photoProject;
    const shotId = card.dataset.shot;
    const assetId = card.dataset.photoAssetId;
    if (!state || state.projectId !== projectId || !photoShotUsesAsset(projectId, shotId, assetId)) return;
    const key = photoUrlKey(projectId, assetId);
    const cached = shotPhotoObjectUrls.get(key);
    if (cached) {
      const list = $("#shot-list");
      const rootRect = list && shotPhotoRootRect(shotPhotoScrollRoot(list));
      if (rootRect && shotPhotoCardDistance(card, rootRect, parseFloat(SHOT_PHOTO_OBSERVER_ROOT_MARGIN) || 0) !== Infinity) applyShotPhotoUrl(card, cached);
      return;
    }
    const requestKey = shotPhotoRequestKey(card);
    if (shotPhotoReadErrors.has(requestKey) || shotPhotoReadsPending.has(requestKey)) return;
    const existing = shotPhotoLoadQueue.get(requestKey);
    if (existing) existing.card = card;
    else shotPhotoLoadQueue.set(requestKey, { requestKey, projectId, shotId, assetId, card });
    scheduleShotPhotoLoadQueue();
  }
  function processShotPhotoLoadQueue() {
    shotPhotoLoadQueueScheduled = false;
    shotPhotoLoadQueueTimer = null;
    const list = $("#shot-list");
    if (!list || !shotPhotoLoadQueue.size) return;
    const rootRect = shotPhotoRootRect(shotPhotoScrollRoot(list));
    const margin = parseFloat(SHOT_PHOTO_OBSERVER_ROOT_MARGIN) || 0;
    const queued = Array.from(shotPhotoLoadQueue.values()).sort((left, right) =>
      shotPhotoCardDistance(left.card, rootRect, margin) - shotPhotoCardDistance(right.card, rootRect, margin));
    let inspected = 0;
    let started = 0;
    for (const item of queued) {
      if (inspected >= SHOT_PHOTO_FALLBACK_SCAN_PER_TASK || started >= SHOT_PHOTO_LOADS_PER_TASK) break;
      if (shotPhotoLoadQueue.get(item.requestKey) !== item) continue;
      shotPhotoLoadQueue.delete(item.requestKey);
      inspected += 1;
      const card = item.card;
      if (!card || !card.isConnected || card.dataset.photoProject !== item.projectId || card.dataset.shot !== item.shotId || card.dataset.photoAssetId !== item.assetId) continue;
      if (!state || state.projectId !== item.projectId || !photoShotUsesAsset(item.projectId, item.shotId, item.assetId)) continue;
      if (shotPhotoCardDistance(card, rootRect, margin) === Infinity) continue;
      const cached = shotPhotoObjectUrls.get(photoUrlKey(item.projectId, item.assetId));
      if (cached) { applyShotPhotoUrl(card, cached); continue; }
      if (shotPhotoReadErrors.has(item.requestKey) || shotPhotoReadsPending.has(item.requestKey)) continue;
      started += 1;
      void loadShotPhoto(item.projectId, item.shotId, item.assetId);
    }
    if (shotPhotoLoadQueue.size) scheduleShotPhotoLoadQueue(16);
  }
  function ensureShotPhotoObserver(list) {
    if (typeof window.IntersectionObserver !== "function") return null;
    const root = shotPhotoScrollRoot(list);
    if (shotPhotoObserver && shotPhotoObserverList === list && shotPhotoObserverRoot === root) return shotPhotoObserver;
    if (shotPhotoObserver) shotPhotoObserver.disconnect();
    shotPhotoObserver = null;
    shotPhotoObserverRoot = root;
    shotPhotoObserverList = list;
    try {
      shotPhotoObserver = new window.IntersectionObserver((entries) => {
        let leftPreloadRange = false;
        entries.forEach((entry) => {
          if (entry.isIntersecting) queueShotPhotoLoad(entry.target);
          else if (entry.target && entry.target.dataset && entry.target.dataset.photoAssetId &&
              shotPhotoObjectUrls.has(photoUrlKey(entry.target.dataset.photoProject, entry.target.dataset.photoAssetId))) leftPreloadRange = true;
        });
        if (leftPreloadRange) scheduleShotPhotoUrlReconciliation();
      }, { root: root, rootMargin: SHOT_PHOTO_OBSERVER_ROOT_MARGIN, threshold: 0.01 });
    } catch (_) {
      shotPhotoObserver = null;
      shotPhotoObserverRoot = null;
      shotPhotoObserverList = null;
    }
    return shotPhotoObserver;
  }
  function scheduleShotPhotoFallback(list) {
    if (shotPhotoFallbackTimer !== null) return;
    const cards = $$("#shot-list .shot-card[data-photo-asset-id]");
    const generation = ++shotPhotoFallbackGeneration;
    let index = 0;
    const scan = () => {
      shotPhotoFallbackTimer = null;
      if (generation !== shotPhotoFallbackGeneration) return;
      const currentList = $("#shot-list");
      if (!currentList || currentList !== list) return;
      const rootRect = shotPhotoRootRect(shotPhotoScrollRoot(currentList));
      const margin = parseFloat(SHOT_PHOTO_OBSERVER_ROOT_MARGIN) || 0;
      let scanned = 0;
      while (index < cards.length && scanned < SHOT_PHOTO_FALLBACK_SCAN_PER_TASK) {
        const card = cards[index++];
        scanned += 1;
        if (shotPhotoCardDistance(card, rootRect, margin) !== Infinity) queueShotPhotoLoad(card);
      }
      if (index < cards.length) shotPhotoFallbackTimer = window.setTimeout(scan, 0);
      else reconcileShotPhotoUrls();
    };
    shotPhotoFallbackTimer = window.setTimeout(scan, 0);
  }
  function shotArtworkSource(shot) {
    const projectId = state && state.projectId || "";
    const photoIds = Array.isArray(shot.assetIds) ? shot.assetIds : [];
    const drawingIds = Array.isArray(shot.drawingIds) ? shot.drawingIds : [];
    // The ordered photo reference is the durable storyboard card primary.
    // Keep every Drawing reference intact and available through its own entry
    // and the output source chooser.
    if (photoIds.length) return { type: "photo", id: photoIds[0] };
    if (drawingIds.length === 1) return { type: "drawing", id: drawingIds[0] };
    if (drawingIds.length > 1) {
      const choice = outputImageSourceChoices.get(outputImageSourceKey(projectId, shot.id));
      if (choice && choice.type === "drawing" && drawingIds.includes(choice.id)) return { type: "drawing", id: choice.id };
      if (choice && choice.type === "photo" && photoIds.includes(choice.id)) return { type: "photo", id: choice.id };
      return { type: "ambiguous", drawingCount: drawingIds.length };
    }
    return { type: "schematic" };
  }
  function renderShotPhotoMarkup(shot, index, artwork) {
    const source = artwork || shotArtworkSource(shot);
    const assetId = source.type === "photo" ? source.id : null;
    const projectId = state && state.projectId || "";
    const photoInputAvailable = !!(photoImportPolicy() && model && typeof model.addShotPhotos === "function" && typeof model.getShotPhoto === "function");
    const readonly = isReadOnly();
    const photoActionAttrs = photoInputAvailable
      ? ' role="button" aria-label="' + escapeHtml(readonly ? shotNumber(shot) + ' 唯讀瀏覽照片；目前不可修改' : (assetId ? '點擊選取照片以更新' : '點擊選取照片至') + shotNumberWithQuotedTitle(shot)) + '" data-shot-photo-action="add" data-shot-id="' + escapeHtml(shot.id) + '" tabindex="0" aria-keyshortcuts="Enter Space" aria-disabled="' + (readonly ? "true" : "false") + '"'
      : ' role="img" aria-label="' + escapeHtml(shotNumber(shot) + ' 分鏡主圖') + '"';
    const tapHint = photoInputAvailable ? '<span class="shot-photo-tap-hint' + (source.type === "drawing" ? ' is-drawing-tap-hint' : '') + '">' + (readonly ? '唯讀瀏覽' : (assetId ? '點圖更新照片' : '點圖選取照片')) + '</span>' : '';
    if (!assetId) {
      if (source.type === "drawing") {
        const content = '<span class="shot-photo-message">正在合成已保存手繪…</span>';
        const count = Array.isArray(shot.assetIds) && shot.assetIds.length ? '<span class="shot-photo-count">' + shot.assetIds.length + ' 張照片</span>' : '';
        const thumb = '<div class="shot-thumb is-saved-drawing"' + photoActionAttrs + ' data-drawing-project="' + escapeHtml(projectId) + '" data-drawing-shot="' + escapeHtml(shot.id) + '" data-drawing-id="' + escapeHtml(source.id) + '" aria-busy="true"><span class="shot-photo-content">' + content + '</span><span class="shot-artwork-badge">手繪合成</span>' + count + tapHint + '</div>';
        return '<div class="shot-art-wrap">' + thumb + renderShotDrawingEntry(shot) + '</div>';
      }
      if (source.type === "ambiguous") {
        const messageText = '此鏡頭有多個照片／手繪來源；請在「文件交付」選擇主圖。';
      const thumb = '<div class="shot-thumb is-artwork-ambiguous"' + photoActionAttrs + '><span class="shot-photo-content"><span class="shot-photo-message is-artwork-choice">' + escapeHtml(messageText) + '</span></span><span class="shot-artwork-badge">主圖待選</span>' + tapHint + '</div>';
        return '<div class="shot-art-wrap">' + thumb + renderShotDrawingEntry(shot) + '</div>';
      }
      const actionAttrs = photoActionAttrs;
      const thumb = '<div class="shot-thumb is-schematic"' + actionAttrs + '><div class="shot-illustration">' + svgArt(shot.art, index) + '</div><span class="shot-placeholder-note">示意圖 · 尚無照片' + (photoInputAvailable && !readonly ? ' · 點擊選取照片' : '') + '</span></div>';
      return '<div class="shot-art-wrap">' + thumb + renderShotDrawingEntry(shot) + '</div>';
    }
    const readKey = photoReadKey(projectId, shot.id, assetId);
    const readError = shotPhotoReadErrors.get(readKey);
    const content = readError
      ? '<span class="shot-photo-message is-error">照片讀取失敗 · ' + escapeHtml((readError.code ? readError.code + ' · ' : '') + (readError.message || '請重新載入或還原照片來源。')) + '</span>'
      : '<span class="shot-photo-message">照片預覽待載入</span>';
    const thumb = '<div class="shot-thumb is-saved-photo" role="button" aria-label="' + escapeHtml(readonly ? shotNumber(shot) + ' 唯讀瀏覽主圖；目前不可修改' : '點擊選取照片以更新' + shotNumberWithQuotedTitle(shot)) + '" data-shot-photo-action="add" data-shot-id="' + escapeHtml(shot.id) + '" data-photo-project="' + escapeHtml(projectId) + '" data-photo-asset-id="' + escapeHtml(assetId) + '" tabindex="0" aria-keyshortcuts="Enter Space" aria-disabled="' + (readonly ? "true" : "false") + '"><span class="shot-photo-content">' + content + '</span><span class="shot-photo-count">' + shot.assetIds.length + ' 張照片</span><span class="shot-photo-tap-hint">' + (readonly ? '唯讀瀏覽' : '點圖更新照片') + '</span><span class="shot-photo-thumbnail-note" hidden></span></div>';
    return '<div class="shot-art-wrap">' + thumb + renderShotDrawingEntry(shot) + '</div>';
  }
  function drawingUiAvailable() {
    return !!(window.DirectorStoryboardDrawingEditor && typeof window.DirectorStoryboardDrawingEditor.mount === "function" &&
      model && typeof model.createDrawingForShot === "function" && typeof model.createDrawingForShotWithInitialEdit === "function" && typeof model.getDrawing === "function" && typeof model.getDrawingsForShot === "function" &&
      typeof model.getAsset === "function");
  }
  function renderShotDrawingEntry(shot) {
    const drawingIds = Array.isArray(shot.drawingIds) ? shot.drawingIds : [];
    const canCreate = lifecycle && lifecycle.writable === true && Number(lifecycle.pendingCount || 0) === 0 && lifecycle.phase !== "save_failed";
    const canOpen = drawingUiAvailable() && (drawingIds.length > 0 || canCreate);
    const reason = !drawingUiAvailable() ? "手繪畫布尚未載入。" : drawingIds.length ? "開啟此鏡頭的手繪 Drawing。" : canCreate ? "開啟手繪草稿；首次繪製或調整設定時才建立 Drawing。" : isReadOnly() ? "唯讀瀏覽；重新取得編輯權後才能建立 Drawing。" : "目前有保存命令待處理，完成保存後才能建立 Drawing。";
    const disabled = canOpen ? "" : " disabled";
    const projectId = state && state.projectId || "";
    const revision = state && Number.isInteger(state.revision) ? state.revision : 0;
    const label = shotNumberWithQuotedTitle(shot) + "編輯分鏡圖";
    return '<button type="button" class="shot-drawing-entry" data-drawing-action="open" data-has-drawing="' + (drawingIds.length ? "true" : "false") + '" data-project-id="' + escapeHtml(projectId) + '" data-shot-id="' + escapeHtml(shot.id) + '" data-base-revision="' + revision + '" aria-label="' + escapeHtml(label) + '" aria-description="' + escapeHtml(reason) + '" title="' + escapeHtml(reason) + '"' + disabled + '>' + icon("draw", 15) + '<span>手繪</span></button>';
  }
  function renderShotPhotoActions(shot) {
    const assetId = Array.isArray(shot.assetIds) ? shot.assetIds[0] : null;
    const shotName = shotNumberWithQuotedTitle(shot);
    const available = !!(photoImportPolicy() && model && typeof model.addShotPhotos === "function" && typeof model.getShotPhoto === "function");
    const reload = assetId && shotPhotoReadErrors.has(photoReadKey(state && state.projectId, shot.id, assetId))
      ? '<button type="button" class="shot-photo-action" data-shot-photo-action="reload" data-shot-id="' + escapeHtml(shot.id) + '" data-asset-id="' + escapeHtml(assetId) + '" aria-label="重新載入' + escapeHtml(shotName) + '的照片">重新載入</button>'
      : '';
    const manager = renderShotPhotoManager(shot);
    const readonlyNote = '<span class="shot-photo-readonly-note">' + READ_ONLY_HELP + '</span>';
    return '<div class="shot-photo-actions">' + reload + manager + readonlyNote + '</div><span class="shot-photo-card-status" data-photo-status-shot="' + escapeHtml(shot.id) + '" hidden></span>';
  }
  function shotPhotoManagerKey(projectId, shotId) {
    return String(projectId || "") + "\u0000" + String(shotId || "");
  }
  function currentCanonicalPhotoProject(projectId) {
    if (!model || typeof model.getProject !== "function") return null;
    const project = model.getProject();
    return project && project.projectId === projectId ? project : null;
  }
  function photoAssetsById(projectId) {
    const stateRevision = state && state.projectId === projectId && Number.isInteger(state.revision) ? state.revision : null;
    const cached = shotPhotoMetadataCache;
    if (stateRevision !== null && cached && cached.projectId === projectId && cached.revision === stateRevision) return cached.assetsById;
    const project = currentCanonicalPhotoProject(projectId);
    if (!project || !Array.isArray(project.assets)) {
      shotPhotoMetadataCache = null;
      return new Map();
    }
    const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
    shotPhotoMetadataCache = { projectId: projectId, revision: project.revision, assetsById: assetsById };
    return assetsById;
  }
  function currentPhotoAssetMetadata(projectId, assetId) {
    return photoAssetsById(projectId).get(assetId) || null;
  }
  function photoCropForShot(shot, assetId) {
    const crops = shot && shot.photoCropsByAssetId;
    const crop = crops && Object.prototype.hasOwnProperty.call(crops, assetId) ? crops[assetId] : null;
    return crop ? { x: crop.x, y: crop.y, width: crop.width, height: crop.height } : null;
  }
  function photoCropsEqual(left, right) {
    if (left === null || left === undefined) return right === null || right === undefined;
    if (right === null || right === undefined) return false;
    return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
  }
  function canEditShotPhotoCrop() {
    const current = modelLifecycle() || lifecycle || {};
    return !!(state && model && typeof model.setShotPhotoCrop === "function" &&
      window.DirectorStoryboardPhotoCropEditor && typeof window.DirectorStoryboardPhotoCropEditor.mount === "function" &&
      window.PhotoCropRenderer && typeof window.PhotoCropRenderer.createPresentation === "function" &&
      current.phase === "ready" && current.writable === true && Number(current.pendingCount || 0) === 0 &&
      uiPending === 0 && pendingMutationPromises.size === 0 && !lifecycleBusy);
  }
  function refreshShotPhotoCropControls() {
    const buttons = $$("#shot-list [data-shot-photo-action='crop']");
    if (!buttons.length) return;
    const editable = canEditShotPhotoCrop();
    const currentProjectId = state && state.projectId;
    const canonical = currentCanonicalPhotoProject(currentProjectId);
    const shotsById = new Map((state && state.shots || []).map((shot) => [shot.id, shot]));
    const canonicalShotsById = new Map((canonical && canonical.shots || []).map((shot) => [shot.id, shot]));
    buttons.forEach((button) => {
      const shot = state && currentProjectId === button.dataset.projectId && shotsById.get(button.dataset.shotId);
      const referenced = !!(shot && Array.isArray(shot.assetIds) && shot.assetIds.includes(button.dataset.assetId));
      const canonicalShot = referenced && currentProjectId === button.dataset.projectId && canonicalShotsById.get(button.dataset.shotId);
      const cropMatches = !!(canonicalShot && Array.isArray(canonicalShot.assetIds) && canonicalShot.assetIds.includes(button.dataset.assetId) &&
        photoCropsEqual(photoCropForShot(canonicalShot, button.dataset.assetId), photoCropForShot(shot, button.dataset.assetId)));
      const disabled = !editable || !referenced || !cropMatches || Number(button.dataset.baseRevision) !== state.revision;
      button.disabled = disabled;
      button.setAttribute("aria-disabled", disabled ? "true" : "false");
    });
  }
  function photoCropSessionIsCurrent(session, requireBaseRevision) {
    if (!session || photoCropSession !== session || session.projectGeneration !== photoCropProjectGeneration) return false;
    const project = currentCanonicalPhotoProject(session.projectId);
    if (!project || project.projectId !== session.projectId ||
        requireBaseRevision && project.revision !== session.baseRevision) return false;
    const shot = Array.isArray(project.shots) && project.shots.find((item) => item.id === session.shotId);
    return !!(shot && Array.isArray(shot.assetIds) && shot.assetIds.includes(session.assetId) &&
      photoCropsEqual(photoCropForShot(shot, session.assetId), session.initialCrop));
  }
  function disposePhotoCropSession(session) {
    if (!session || photoCropSession !== session) return false;
    photoCropSession = null;
    const editor = session.editor;
    session.editor = null;
    if (editor && typeof editor.destroy === "function") editor.destroy();
    return true;
  }
  function syncPhotoCropSessionForSnapshot(snapshot, event) {
    const isNewProjectSession = Boolean(event && event.type === "init") ||
      Boolean(activeProjectId && snapshot.projectId !== activeProjectId);
    if (isNewProjectSession) photoCropProjectGeneration += 1;
    const session = photoCropSession;
    if (!session) return;
    if (session.projectId !== snapshot.projectId || session.projectGeneration !== photoCropProjectGeneration) {
      disposePhotoCropSession(session);
      message("專案工作階段已切換；已關閉過期的照片裁切。", true);
      return;
    }
    const shot = Array.isArray(snapshot.shots) && snapshot.shots.find((item) => item.id === session.shotId);
    if (!shot || !Array.isArray(shot.assetIds) || !shot.assetIds.includes(session.assetId)) {
      disposePhotoCropSession(session);
      message("目標鏡頭或照片引用已變更；已關閉過期的照片裁切。", true);
      return;
    }
    if (!session.saving && (snapshot.revision !== session.baseRevision ||
        !photoCropsEqual(photoCropForShot(shot, session.assetId), session.initialCrop))) {
      disposePhotoCropSession(session);
      message("專案資料已更新；已關閉過期的照片裁切，請重新開啟。", true);
    }
  }
  async function commitShotPhotoCrop(session, crop) {
    if (!photoCropSessionIsCurrent(session, true)) {
      disposePhotoCropSession(session);
      throw Object.assign(new Error("專案或目標照片已更新；裁切沒有套用。請重新開啟照片裁切。"), { code: "PHOTO_CROP_STALE" });
    }
    if (!canEditShotPhotoCrop()) throw Object.assign(new Error("目前有其他保存命令或編輯權限制；請先完成保存，再套用照片裁切。"), { code: "PHOTO_CROP_WRITE_BLOCKED" });
    session.saving = true;
    try {
      const result = await withMutation(() => model.setShotPhotoCrop(session.shotId, session.assetId, crop));
      if (photoCropSession !== session || session.projectGeneration !== photoCropProjectGeneration) {
        throw Object.assign(new Error("專案工作階段已切換；裁切結果需要重新確認。"), { code: "PHOTO_CROP_STALE" });
      }
      const canonical = currentCanonicalPhotoProject(session.projectId);
      const savedShot = canonical && canonical.shots.find((item) => item.id === session.shotId);
      if (!savedShot || !Array.isArray(savedShot.assetIds) || !savedShot.assetIds.includes(session.assetId) ||
          !photoCropsEqual(photoCropForShot(savedShot, session.assetId), crop)) {
        throw Object.assign(new Error("Model 尚未確認照片裁切；請依目前保存狀態重新檢查。"), { code: "PHOTO_CROP_NOT_VISIBLE" });
      }
      session.saving = false;
      session.status = "committed";
      message(crop ? "照片裁切已保存；原始照片與手繪作品維持不變。" : "照片裁切已還原；原始照片與手繪作品維持不變。");
      return result;
    } catch (error) {
      session.saving = false;
      const current = modelLifecycle() || {};
      if (photoCropSession === session && (current.phase === "save_failed" || Number(current.pendingCount || 0) > 0)) {
        disposePhotoCropSession(session);
        message("裁切尚未保存；原命令仍在保存佇列。請使用全域「重試保存」處理原命令，不要重新套用。", true);
        return false;
      }
      throw error;
    }
  }
  function startShotPhotoCrop(target) {
    if (!canEditShotPhotoCrop()) {
      message("目前無法編輯照片裁切；請先完成保存並確認專案可編輯。", true);
      return;
    }
    const projectId = target && target.dataset.projectId;
    const shotId = target && target.dataset.shotId;
    const assetId = target && target.dataset.assetId;
    const baseRevision = Number(target && target.dataset.baseRevision);
    const canonical = currentCanonicalPhotoProject(projectId);
    const shot = canonical && canonical.shots.find((item) => item.id === shotId);
    if (!projectId || !shot || !Array.isArray(shot.assetIds) || !shot.assetIds.includes(assetId) ||
        !Number.isInteger(baseRevision) || canonical.revision !== baseRevision || !state ||
        state.projectId !== projectId || state.revision !== baseRevision) {
      message("專案、鏡頭或照片清單已更新；請重新整理照片管理後再裁切。", true);
      return;
    }
    if (photoCropSession) disposePhotoCropSession(photoCropSession);
    const session = {
      id: ++photoCropSessionSequence,
      projectId: projectId,
      projectGeneration: photoCropProjectGeneration,
      shotId: shotId,
      assetId: assetId,
      baseRevision: baseRevision,
      initialCrop: photoCropForShot(shot, assetId),
      editor: null,
      saving: false,
      status: "loading"
    };
    photoCropSession = session;
    const mount = $("#photo-crop-editor-mount");
    if (!mount || !model || typeof model.getShotPhoto !== "function") {
      disposePhotoCropSession(session);
      message("照片裁切所需的原始照片讀取功能尚未載入。", true);
      return;
    }
    void (async () => {
      try {
        const photo = await model.getShotPhoto(shotId, assetId);
        if (!photoCropSessionIsCurrent(session, true) || !canEditShotPhotoCrop()) throw Object.assign(new Error("讀取照片期間專案或編輯狀態已改變；請重新開啟裁切。"), { code: "PHOTO_CROP_STALE" });
        if (!photo || photo.projectId !== projectId || photo.shotId !== shotId || photo.id !== assetId || !(photo.originalBlob instanceof Blob)) {
          throw Object.assign(new Error("無法驗證此鏡頭的不可變原始照片。"), { code: "PHOTO_CROP_SOURCE_INVALID" });
        }
        const metadata = currentPhotoAssetMetadata(projectId, assetId);
        const label = metadata && metadata.originalName || "分鏡照片";
        const editor = window.DirectorStoryboardPhotoCropEditor.mount(mount, {
          imageBlob: photo.originalBlob,
          aspectRatio: canonical.aspectRatio || "16:9",
          crop: session.initialCrop,
          imageLabel: label,
          title: "裁切照片（只影響卡片與輸出；手繪底圖與筆跡不變）",
          onConfirm: (nextCrop) => commitShotPhotoCrop(session, nextCrop),
          onCancel: () => disposePhotoCropSession(session)
        });
        session.editor = editor;
        const dialog = editor.editor && editor.editor.dialog;
        if (dialog) dialog.addEventListener("close", () => disposePhotoCropSession(session), { once: true });
        await editor.open();
        if (!photoCropSessionIsCurrent(session, true) || !canEditShotPhotoCrop()) {
          disposePhotoCropSession(session);
          message("照片或專案資料已更新；已關閉過期的照片裁切。", true);
          return;
        }
        session.status = "open";
      } catch (error) {
        disposePhotoCropSession(session);
        if (error && error.code === "PHOTO_CROP_STALE") message(error.message, true);
        else message((error && error.code ? error.code + " · " : "") + (error && error.message || "無法開啟照片裁切。"), true);
      }
    })();
  }
  function renderShotPhotoManager(shot) {
    const assetIds = Array.isArray(shot.assetIds) ? shot.assetIds : [];
    if (!assetIds.length || !model || typeof model.reorderShotPhotos !== "function" || typeof model.removeShotPhoto !== "function") return "";
    const projectId = state && state.projectId || "";
    const assetsById = photoAssetsById(projectId);
    const shotName = shotNumberWithQuotedTitle(shot);
    const key = shotPhotoManagerKey(projectId, shot.id);
    const rows = assetIds.map((assetId, index) => {
      const asset = assetsById.get(assetId);
      const name = asset && asset.originalName || "照片 " + (index + 1);
      const primary = index === 0;
      const upLabel = "將「" + name + "」上移";
      const downLabel = "將「" + name + "」下移";
      const removeLabel = "從" + shotName + "解除「" + name + "」的照片引用；保留原始照片";
      const cropAvailable = !!(typeof window !== "undefined" && window.DirectorStoryboardPhotoCropEditor && model && typeof model.setShotPhotoCrop === "function");
      const crops = shot.photoCropsByAssetId;
      const crop = crops && Object.prototype.hasOwnProperty.call(crops, assetId) ? crops[assetId] : null;
      const cropButton = cropAvailable ? '<button type="button" class="shot-photo-action shot-photo-write-action shot-photo-crop-action" data-shot-photo-action="crop" data-project-id="' + escapeHtml(projectId) + '" data-base-revision="' + Number(state && state.revision || 0) + '" data-shot-id="' + escapeHtml(shot.id) + '" data-asset-id="' + escapeHtml(assetId) + '" aria-label="' + escapeHtml((crop ? "調整" : "設定") + shotName + '照片裁切') + '"' + (canEditShotPhotoCrop() ? "" : " disabled") + '>' + (crop ? "調整裁切" : "裁切照片") + '</button>' : '';
      return '<li class="shot-photo-manager-item" data-photo-manager-asset="' + escapeHtml(assetId) + '"><div class="shot-photo-manager-copy"><strong>' + escapeHtml(name) + '</strong><span class="shot-photo-manager-position">' + (primary ? "主圖" : "第 " + (index + 1) + " 張") + '</span>' + (crop ? '<span class="shot-photo-manager-cropped">已裁切</span>' : '') + '</div><div class="shot-photo-manager-controls">' + cropButton + '<button type="button" class="shot-photo-action shot-photo-write-action shot-photo-order-action" data-shot-photo-action="photo-up" data-shot-id="' + escapeHtml(shot.id) + '" data-asset-id="' + escapeHtml(assetId) + '" aria-label="' + escapeHtml(upLabel) + '"' + (index === 0 ? ' disabled' : '') + '>上移</button><button type="button" class="shot-photo-action shot-photo-write-action shot-photo-order-action" data-shot-photo-action="photo-down" data-shot-id="' + escapeHtml(shot.id) + '" data-asset-id="' + escapeHtml(assetId) + '" aria-label="' + escapeHtml(downLabel) + '"' + (index === assetIds.length - 1 ? ' disabled' : '') + '>下移</button><button type="button" class="shot-photo-action shot-photo-write-action shot-photo-remove-action" data-shot-photo-action="photo-remove" data-shot-id="' + escapeHtml(shot.id) + '" data-asset-id="' + escapeHtml(assetId) + '" aria-label="' + escapeHtml(removeLabel) + '">移除</button></div></li>';
    }).join("");
    return '<details class="shot-photo-manager" data-shot-photo-manager="' + escapeHtml(shot.id) + '" data-project-id="' + escapeHtml(projectId) + '"' + (shotPhotoManagerOpen.has(key) ? ' open' : '') + '><summary aria-label="管理' + escapeHtml(shotName) + '的 ' + assetIds.length + ' 張照片">管理照片 · ' + assetIds.length + ' 張</summary><div class="shot-photo-manager-panel"><p class="shot-photo-manager-help">第一張照片會作為分鏡主圖。上移或下移可調整順序。</p><ol class="shot-photo-manager-list" aria-label="' + escapeHtml(shotName) + '的照片順序">' + rows + '</ol><p class="shot-photo-manager-help">移除只會解除此鏡的照片引用；原始照片、其他鏡頭引用與手繪底圖都會保留。照片裁切只影響照片卡片與文件輸出；已有手繪作品仍使用原底圖，筆跡位置不變。</p></div></details>';
  }
  function reorderedShotPhotoIds(currentIds, assetId, delta) {
    if (!Array.isArray(currentIds) || !Number.isInteger(delta) || Math.abs(delta) !== 1) return null;
    const orderedIds = currentIds.slice();
    const fromIndex = orderedIds.indexOf(assetId);
    const toIndex = fromIndex + delta;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= orderedIds.length) return null;
    [orderedIds[fromIndex], orderedIds[toIndex]] = [orderedIds[toIndex], orderedIds[fromIndex]];
    return orderedIds;
  }
  function photoManagerCanonicalState(projectId, shotId) {
    const canonical = currentCanonicalPhotoProject(projectId);
    if (!canonical || canonical.projectId !== projectId) throw Object.assign(new Error("目前專案已切換；照片整理沒有套用到其他專案。"), { code: "PHOTO_PROJECT_CHANGED" });
    const shot = Array.isArray(canonical.shots) && canonical.shots.find((item) => item.id === shotId);
    if (!shot) throw Object.assign(new Error("找不到原目標鏡頭。"), { code: "SHOT_NOT_FOUND" });
    return { canonical, shot };
  }
  async function reorderShotPhoto(shotId, assetId, delta) {
    if (isReadOnly()) throw readOnlyFailure();
    const projectId = state && state.projectId;
    const shot = state && state.shots.find((item) => item.id === shotId);
    if (!projectId || !shot || !model || typeof model.reorderShotPhotos !== "function") throw Object.assign(new Error("照片排序功能尚未載入或目標鏡頭已變更。"), { code: "PHOTO_REORDER_UNAVAILABLE" });
    const orderedAssetIds = reorderedShotPhotoIds(shot.assetIds, assetId, delta);
    if (!orderedAssetIds) throw Object.assign(new Error("照片順序已變更；請重新檢查目前照片清單。"), { code: "PHOTO_TARGET_CHANGED" });
    const result = await withMutation(() => model.reorderShotPhotos(shotId, orderedAssetIds));
    const { shot: canonicalShot } = photoManagerCanonicalState(projectId, shotId);
    if (JSON.stringify(canonicalShot.assetIds) !== JSON.stringify(orderedAssetIds) || result && Array.isArray(result.orderedAssetIds) && JSON.stringify(result.orderedAssetIds) !== JSON.stringify(orderedAssetIds)) {
      throw Object.assign(new Error("Model 尚未確認新的照片順序；目前主圖仍以已保存資料為準。"), { code: "PHOTO_ORDER_NOT_VISIBLE" });
    }
    message(result && result.noOp ? "照片順序未變更。" : canonicalShot.assetIds[0] === assetId ? "照片順序已更新；此照片現在是分鏡主圖。" : "照片順序已更新。");
    return true;
  }
  function confirmRemoveShotPhoto(target) {
    if (isReadOnly()) { message("目前為唯讀瀏覽；請重新取得編輯權後再整理照片。", true); return; }
    const shotId = target.dataset.shotId;
    const assetId = target.dataset.assetId;
    const shot = state && state.shots.find((item) => item.id === shotId);
    const projectId = state && state.projectId;
    const asset = currentPhotoAssetMetadata(projectId, assetId);
    if (!shot || !assetId || !Array.isArray(shot.assetIds) || !shot.assetIds.includes(assetId) || !model || typeof model.removeShotPhoto !== "function") {
      message("這張照片已不在此鏡；請重新整理照片清單後再試。", true); return;
    }
    const name = asset && asset.originalName || "未命名照片";
    const copy = "鏡頭：" + shotNumberWithQuotedTitle(shot) + "\n照片：「" + name + "」\n\n只解除此鏡對這張照片的引用。專案內的原始照片資料、其他鏡頭引用與手繪底圖都會保留。";
    showConfirm("從此鏡移除照片", copy, "解除此鏡引用", async () => {
      if (isReadOnly()) { message("目前為唯讀瀏覽；照片沒有移除。", true); return false; }
      try {
        const result = await withMutation(() => model.removeShotPhoto(shotId, assetId));
        const { canonical, shot: canonicalShot } = photoManagerCanonicalState(projectId, shotId);
        const nextOrder = result && Array.isArray(result.orderedAssetIds) ? result.orderedAssetIds : canonicalShot.assetIds;
        if (JSON.stringify(canonicalShot.assetIds) !== JSON.stringify(nextOrder) || canonicalShot.assetIds.includes(assetId)) {
          throw Object.assign(new Error("Model 尚未確認解除此鏡的照片引用；照片仍以目前已保存資料為準。"), { code: "PHOTO_REMOVE_NOT_VISIBLE" });
        }
        if (!canonical.assets.some((item) => item.id === assetId)) {
          throw Object.assign(new Error("照片引用已解除，但原始 Asset metadata 不在目前專案中；請檢查救援資料。"), { code: "PHOTO_ASSET_NOT_RETAINED" });
        }
        message(result && result.noOp ? "這張照片已不在此鏡，未變更。" : "已解除此鏡的照片引用；原始照片仍保留在專案中。");
        return true;
      } catch (error) {
        message((error && error.code ? error.code + " · " : "") + (error && error.message || "移除照片引用失敗；原始照片資料仍保留。"), true);
        return false;
      }
    });
  }
  function setPhotoCardContent(card, content) {
    const host = card && card.querySelector(".shot-photo-content");
    if (!host) return;
    host.replaceChildren(content);
  }
  function photoFrameAspectRatio(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (match && Number(match[1]) > 0 && Number(match[2]) > 0) return Number(match[1]) / Number(match[2]);
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback || 16 / 9;
  }
  function photoCropViewportMetrics(presentation, frameAspect) {
    const aspect = presentation && Number(presentation.aspectRatio);
    const frame = Number(frameAspect);
    if (!Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(frame) || frame <= 0) {
      throw Object.assign(new Error("照片裁切框尺寸無效。"), { code: "PHOTO_CROP_GEOMETRY_INVALID" });
    }
    return aspect > frame
      ? { width: 100, height: frame / aspect * 100 }
      : { width: aspect / frame * 100, height: 100 };
  }
  function applyPhotoCropImageGeometry(image, crop) {
    image.style.position = "absolute";
    image.style.width = (100 / crop.width) + "%";
    image.style.height = (100 / crop.height) + "%";
    image.style.left = (-crop.x / crop.width * 100) + "%";
    image.style.top = (-crop.y / crop.height * 100) + "%";
    image.style.maxWidth = "none";
    image.style.maxHeight = "none";
    image.style.objectFit = "fill";
    image.style.visibility = "visible";
  }
  function makePhotoCropViewport(image, crop, presentation, frameAspect, frameClass, viewportClass) {
    const metrics = photoCropViewportMetrics(presentation, frameAspect);
    const frame = document.createElement("span");
    frame.className = frameClass;
    const viewport = document.createElement("span");
    viewport.className = viewportClass;
    viewport.style.width = metrics.width + "%";
    viewport.style.height = metrics.height + "%";
    applyPhotoCropImageGeometry(image, crop);
    viewport.appendChild(image);
    frame.appendChild(viewport);
    return frame;
  }
  function applyShotPhotoUrl(card, entry) {
    if (!card || !card.isConnected) return;
    const list = $("#shot-list");
    const rootRect = list && shotPhotoRootRect(shotPhotoScrollRoot(list));
    if (!rootRect || card.hidden || card.dataset.photoProject !== entry.projectId || card.dataset.photoAssetId !== entry.assetId ||
        shotPhotoCardDistance(card, rootRect, parseFloat(SHOT_PHOTO_OBSERVER_ROOT_MARGIN) || 0) === Infinity) return;
    if (shotPhotoObserver) shotPhotoObserver.observe(card);
    const image = document.createElement("img");
    image.className = "shot-photo-image"; image.alt = ""; image.draggable = false;
    image.addEventListener("error", () => handleShotPhotoImageError(card, image, entry), { once: true });
    const shot = state && state.projectId === entry.projectId && state.shots.find((item) => item.id === card.dataset.shot);
    const crop = photoCropForShot(shot, entry.assetId);
    if (crop) image.style.visibility = "hidden";
    setPhotoCardContent(card, image);
    image.src = entry.url;
    if (crop) {
      const applyCrop = () => {
        if (!isCurrentShotPhotoImage(card, image, entry)) return;
        const latestShot = state && state.projectId === entry.projectId && state.shots.find((item) => item.id === card.dataset.shot);
        const latestCrop = photoCropForShot(latestShot, entry.assetId);
        if (!photoCropsEqual(latestCrop, crop)) { applyShotPhotoUrl(card, entry); return; }
        try {
          const renderer = window.PhotoCropRenderer;
          if (!renderer || typeof renderer.createPresentation !== "function") throw Object.assign(new Error("照片裁切呈現元件尚未載入。"), { code: "PHOTO_CROP_RENDERER_UNAVAILABLE" });
          const presentation = renderer.createPresentation(image, crop);
          const host = card.querySelector(".shot-photo-content");
          const hostRect = host && host.getBoundingClientRect();
          const frameAspect = hostRect && hostRect.width > 0 && hostRect.height > 0
            ? hostRect.width / hostRect.height
            : photoFrameAspectRatio(state && state.aspectRatio, presentation.aspectRatio);
          const frame = makePhotoCropViewport(image, crop, presentation, frameAspect, "shot-photo-crop-frame", "shot-photo-crop-viewport");
          host.replaceChildren(frame);
        } catch (error) {
          image.style.visibility = "visible";
          const status = document.createElement("span");
          status.className = "shot-photo-message is-error";
          status.textContent = (error && error.code ? error.code + " · " : "") + (error && error.message || "照片裁切呈現失敗。");
          setPhotoCardContent(card, status);
        }
      };
      image.addEventListener("load", applyCrop, { once: true });
      if (image.complete && image.naturalWidth > 0) window.requestAnimationFrame(applyCrop);
    }
    const note = card.querySelector(".shot-photo-thumbnail-note");
    if (note) {
      const thumbnailPending = entry.thumbnailStatus === "rebuild_pending" || entry.thumbnailStatus === "not_generated";
      note.textContent = entry.usedOriginal ? (thumbnailPending ? "使用原圖 · 縮圖待建立" : "使用原圖") : "";
      note.hidden = !entry.usedOriginal;
    }
    card.classList.add("has-loaded-photo");
  }
  function showShotPhotoReadError(projectId, shotId, assetId, error) {
    if (!photoShotUsesAsset(projectId, shotId, assetId)) return;
    const cards = visibleShotPhotoCards(projectId, assetId).filter((card) => card.dataset.shot === shotId && photoShotUsesAsset(projectId, card.dataset.shot, assetId));
    if (!cards.length) return false;
    const readKey = photoReadKey(projectId, shotId, assetId);
    shotPhotoReadErrors.set(readKey, { code: error && error.code || "PHOTO_READ_FAILED", message: error && error.message || "照片無法讀取。" });
    cards.forEach((card) => {
      const status = document.createElement("span"); status.className = "shot-photo-message is-error"; status.textContent = "照片讀取失敗 · " + (error && error.code ? error.code + " · " : "") + (error && error.message || "請重新載入或還原照片來源。");
      setPhotoCardContent(card, status); card.classList.remove("has-loaded-photo");
      const actions = card.querySelector(".shot-photo-actions");
      if (actions && !actions.querySelector('[data-shot-photo-action="reload"]')) {
        const button = document.createElement("button"); button.type = "button"; button.className = "shot-photo-action"; button.dataset.shotPhotoAction = "reload"; button.dataset.shotId = shotId; button.dataset.assetId = assetId; button.setAttribute("aria-label", "重新載入照片"); button.textContent = "重新載入";
        actions.insertBefore(button, actions.querySelector(".shot-photo-readonly-note"));
      }
    });
    return true;
  }
  function isCurrentShotPhotoImage(card, image, entry) {
    if (!card || !image || !entry || !card.isConnected || card.hidden || !image.isConnected) return false;
    if (!state || state.projectId !== entry.projectId || card.dataset.photoProject !== entry.projectId ||
        card.dataset.photoAssetId !== entry.assetId || !photoShotUsesAsset(entry.projectId, card.dataset.shot, entry.assetId)) return false;
    const list = $("#shot-list");
    if (!list || shotPhotoCardDistance(card, shotPhotoRootRect(shotPhotoScrollRoot(list)), parseFloat(SHOT_PHOTO_OBSERVER_ROOT_MARGIN) || 0) === Infinity) return false;
    if (shotPhotoObjectUrls.get(photoUrlKey(entry.projectId, entry.assetId)) !== entry) return false;
    const host = card.querySelector(".shot-photo-content");
    return !!(host && host.querySelector("img.shot-photo-image") === image && image.classList.contains("shot-photo-image") && image.src === entry.url);
  }
  function handleShotPhotoImageError(card, image, entry) {
    if (!isCurrentShotPhotoImage(card, image, entry)) return false;
    const key = photoUrlKey(entry.projectId, entry.assetId);
    const affectedCards = visibleShotPhotoCards(entry.projectId, entry.assetId).filter((candidate) =>
      isCurrentShotPhotoImage(candidate, candidate.querySelector(".shot-photo-content img.shot-photo-image"), entry));
    if (!affectedCards.includes(card)) return false;
    if (shotPhotoObjectUrls.get(key) === entry) releaseShotPhotoUrl(key);
    const error = { code: "PHOTO_DECODE_FAILED", message: "瀏覽器無法顯示已驗證的照片。" };
    Array.from(new Set(affectedCards.map((candidate) => candidate.dataset.shot))).forEach((shotId) => {
      showShotPhotoReadError(entry.projectId, shotId, entry.assetId, error);
    });
    return true;
  }
  async function loadShotPhoto(projectId, shotId, assetId) {
    const requestKey = photoReadKey(projectId, shotId, assetId);
    if (shotPhotoReadsPending.has(requestKey) || shotPhotoReadErrors.has(requestKey)) return;
    if (!model || typeof model.getShotPhoto !== "function") {
      showShotPhotoReadError(projectId, shotId, assetId, { code: "PHOTO_API_UNAVAILABLE", message: "照片讀取功能尚未載入。" });
      return;
    }
    const pending = (async () => {
      try {
        const photo = await model.getShotPhoto(shotId, assetId);
        const blob = photo && (photo.thumbnailBlob || photo.originalBlob);
        if (!blob || typeof URL.createObjectURL !== "function") throw Object.assign(new Error("已保存照片沒有可顯示的 Blob。"), { code: "ASSET_MISSING" });
        const stillReferenced = photoShotUsesAsset(projectId, shotId, assetId);
        const cards = nearbyShotPhotoCards(projectId, assetId);
        if (!stillReferenced || !cards.length) return;
        const usedOriginal = !photo.thumbnailBlob;
        const entry = { projectId, assetId, blob, url: URL.createObjectURL(blob), thumbnailStatus: photo.thumbnailStatus || "not_generated", usedOriginal };
        const key = photoUrlKey(projectId, assetId);
        const existing = shotPhotoObjectUrls.get(key);
        if (existing) { try { URL.revokeObjectURL(entry.url); } catch (_) {} }
        else shotPhotoObjectUrls.set(key, entry);
        const selected = existing || entry;
        shotPhotoReadErrors.delete(requestKey);
        nearbyShotPhotoCards(projectId, assetId).forEach((card) => applyShotPhotoUrl(card, selected));
      } catch (error) {
        showShotPhotoReadError(projectId, shotId, assetId, error);
      } finally {
        shotPhotoReadsPending.delete(requestKey);
      }
    })();
    shotPhotoReadsPending.set(requestKey, pending);
    await pending;
  }
  function syncVisibleShotPhotos() {
    reconcileShotPhotoUrls();
    const list = $("#shot-list");
    if (!list) return;
    const cards = $$("#shot-list .shot-card[data-photo-asset-id]");
    const observer = ensureShotPhotoObserver(list);
    if (!observer) {
      scheduleShotPhotoFallback(list);
      scheduleShotPhotoLoadQueue();
      return;
    }
    const rootRect = shotPhotoRootRect(shotPhotoScrollRoot(list));
    const margin = parseFloat(SHOT_PHOTO_OBSERVER_ROOT_MARGIN) || 0;
    cards.forEach((card) => {
      if (card.hidden) { observer.unobserve(card); return; }
      observer.observe(card);
      const key = photoUrlKey(card.dataset.photoProject, card.dataset.photoAssetId);
      const cached = shotPhotoObjectUrls.get(key);
      if (cached) {
        if (shotPhotoCardDistance(card, rootRect, margin) !== Infinity) applyShotPhotoUrl(card, cached);
        return;
      }
      const requestKey = shotPhotoRequestKey(card);
      if (shotPhotoReadErrors.has(requestKey)) { observer.unobserve(card); return; }
    });
    scheduleShotPhotoLoadQueue();
  }
  function shotDrawingCapture(projectId, shotId, drawingId) {
    const renderer = window.DirectorStoryboardRenderer;
    if (!renderer || typeof renderer.createSnapshot !== "function" || typeof renderer.renderToCanvas !== "function") {
      throw Object.assign(new Error("storyboard-renderer 尚未載入，無法顯示已保存手繪。"), { code: "DRAWING_RENDERER_UNAVAILABLE" });
    }
    if (!model || typeof model.getProject !== "function" || typeof model.getDrawing !== "function" || typeof model.getAsset !== "function") {
      throw Object.assign(new Error("Model 尚未提供 Drawing 或已驗證底圖讀取功能。"), { code: "DRAWING_PREVIEW_API_UNAVAILABLE" });
    }
    const project = model.getProject();
    if (!project || project.projectId !== projectId) throw Object.assign(new Error("目前專案已切換，不能讀取舊手繪。"), { code: "DRAWING_PREVIEW_PROJECT_MISMATCH" });
    const shot = (project.shots || []).find((item) => item.id === shotId);
    if (!shot || !(shot.drawingIds || []).includes(drawingId)) throw Object.assign(new Error("此鏡頭已不再引用指定 Drawing。"), { code: "SHOT_DRAWING_MISMATCH" });
    const drawing = model.getDrawing(drawingId);
    if (!drawing || drawing.projectId !== projectId || drawing.shotId !== shotId || drawing.id !== drawingId) {
      throw Object.assign(new Error("Drawing 的專案或鏡頭關係不符。"), { code: "DRAWING_PREVIEW_IDENTITY_MISMATCH" });
    }
    const canonicalDrawing = (project.drawings || []).find((item) => item.id === drawingId);
    if (!canonicalDrawing || JSON.stringify(canonicalDrawing) !== JSON.stringify(drawing)) {
      throw Object.assign(new Error("Drawing 與目前專案快照不一致。"), { code: "DRAWING_PREVIEW_SNAPSHOT_MISMATCH" });
    }
    let backgroundAsset = null;
    let backgroundFingerprint = null;
    if (drawing.backgroundAssetId !== null && drawing.backgroundAssetId !== undefined) {
      const backgroundAssetId = drawing.backgroundAssetId;
      if (typeof backgroundAssetId !== "string" || !backgroundAssetId || !(shot.assetIds || []).includes(backgroundAssetId)) {
        throw Object.assign(new Error("Drawing 綁定的底圖已不屬於此鏡頭。"), { code: "DRAWING_BACKGROUND_REFERENCE_INVALID" });
      }
      backgroundAsset = (project.assets || []).find((asset) => asset.id === backgroundAssetId);
      if (!backgroundAsset || backgroundAsset.role !== "photoOriginal" || !/^[0-9a-f]{64}$/i.test(String(backgroundAsset.sha256 || ""))) {
        throw Object.assign(new Error("Drawing 底圖缺少可驗證的原始照片或 SHA-256。"), { code: "DRAWING_BACKGROUND_METADATA_INVALID" });
      }
      backgroundFingerprint = String(backgroundAsset.sha256).toLowerCase();
    }
    const signature = JSON.stringify([renderer.VERSION, projectId, shotId, drawingId, drawing, backgroundFingerprint]);
    return { projectId, shotId, drawingId, drawing, backgroundAsset, backgroundFingerprint, signature, rendererVersion: renderer.VERSION };
  }
  function visibleShotDrawingCards(capture) {
    return $$("#shot-list .shot-card[data-drawing-id]").filter((card) => !card.hidden && card.dataset.drawingProject === capture.projectId &&
      card.dataset.drawingShot === capture.shotId && card.dataset.drawingId === capture.drawingId && card.__drawingCaptureSignature === capture.signature);
  }
  function releaseShotDrawingUrl(key) {
    const entry = shotDrawingObjectUrls.get(key);
    if (!entry) return;
    shotDrawingObjectUrls.delete(key);
    if (shotDrawingUrlByCapture.get(entry.captureSignature) === key) shotDrawingUrlByCapture.delete(entry.captureSignature);
    try { URL.revokeObjectURL(entry.url); } catch (_) {}
  }
  function reconcileShotDrawingUrls() {
    const referenced = new Set($$("#shot-list .shot-card[data-drawing-id]").filter((card) => !card.hidden).map((card) => card.__drawingCaptureSignature).filter(Boolean));
    Array.from(shotDrawingObjectUrls.keys()).forEach((key) => {
      const entry = shotDrawingObjectUrls.get(key);
      if (!entry || !referenced.has(entry.captureSignature)) releaseShotDrawingUrl(key);
    });
    Array.from(shotDrawingReadErrors.keys()).forEach((signature) => { if (!referenced.has(signature)) shotDrawingReadErrors.delete(signature); });
  }
  function setShotDrawingStatus(card, text, isError) {
    const host = card && card.querySelector(".shot-photo-content");
    if (!host) return;
    const status = document.createElement("span");
    status.className = "shot-photo-message" + (isError ? " is-error" : "");
    status.textContent = text;
    if (isError) status.setAttribute("role", "alert");
    host.replaceChildren(status);
    card.classList.remove("has-loaded-drawing");
    card.setAttribute("aria-busy", isError ? "false" : "true");
  }
  function showShotDrawingReadError(capture, error) {
    if (!visibleShotDrawingCards(capture).length) return;
    const stored = { code: error && error.code || "DRAWING_PREVIEW_FAILED", message: error && error.message || "已保存手繪無法合成顯示。" };
    shotDrawingReadErrors.set(capture.signature, stored);
    visibleShotDrawingCards(capture).forEach((card) => setShotDrawingStatus(card, "手繪合成失敗 · " + (stored.code ? stored.code + " · " : "") + stored.message, true));
  }
  function applyShotDrawingUrl(card, entry) {
    if (!card || !card.isConnected || card.__drawingCaptureSignature !== entry.captureSignature) return;
    const host = card.querySelector(".shot-photo-content");
    if (!host) return;
    const image = document.createElement("img");
    image.className = "shot-drawing-image";
    image.alt = "已保存手繪合成圖";
    image.draggable = false;
    image.src = entry.url;
    image.addEventListener("error", () => {
      if (shotDrawingObjectUrls.get(entry.urlKey) === entry) releaseShotDrawingUrl(entry.urlKey);
      const capture = { projectId: entry.projectId, shotId: entry.shotId, drawingId: entry.drawingId, signature: entry.captureSignature };
      showShotDrawingReadError(capture, { code: "DRAWING_PREVIEW_DECODE_FAILED", message: "瀏覽器無法顯示合成後的手繪圖片。" });
    }, { once: true });
    host.replaceChildren(image);
    card.classList.add("has-loaded-drawing");
    card.setAttribute("aria-busy", "false");
  }
  function shotDrawingCaptureIsCurrent(capture, epoch) {
    if (epoch !== shotDrawingUrlEpoch || !state || state.projectId !== capture.projectId || !visibleShotDrawingCards(capture).length) return false;
    try { return shotDrawingCapture(capture.projectId, capture.shotId, capture.drawingId).signature === capture.signature; }
    catch (_) { return false; }
  }
  function decodeShotDrawingBackground(blob) {
    if (!(blob instanceof Blob) || typeof URL.createObjectURL !== "function") {
      return Promise.reject(Object.assign(new Error("Model 未提供可顯示的已驗證底圖 Blob。"), { code: "DRAWING_BACKGROUND_BLOB_MISSING" }));
    }
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    let decoded;
    try {
      decoded = typeof image.decode === "function"
        ? image.decode()
        : new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Object.assign(new Error("底圖照片解碼失敗。"), { code: "DRAWING_BACKGROUND_DECODE_FAILED" })); });
    } catch (error) { try { URL.revokeObjectURL(url); } catch (_) {} return Promise.reject(error); }
    return decoded.then(() => {
      if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw Object.assign(new Error("底圖照片解碼後沒有有效尺寸。"), { code: "DRAWING_BACKGROUND_DECODE_FAILED" });
      return { url, image };
    }).catch((error) => { try { URL.revokeObjectURL(url); } catch (_) {} throw error; });
  }
  function canvasPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      if (!canvas || typeof canvas.toBlob !== "function") {
        reject(Object.assign(new Error("此瀏覽器無法建立手繪預覽 PNG。"), { code: "DRAWING_PREVIEW_RASTER_UNAVAILABLE" }));
        return;
      }
      try {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(Object.assign(new Error("Drawing PNG 建立失敗。"), { code: "DRAWING_PREVIEW_RASTER_FAILED" })), "image/png");
      } catch (error) { reject(error); }
    });
  }
  async function loadShotDrawingPreview(capture, epoch) {
    const request = { epoch: epoch, promise: null };
    shotDrawingReadsPending.set(capture.signature, request);
    const pending = (async () => {
      let background = null;
      try {
        if (!shotDrawingCaptureIsCurrent(capture, epoch)) return;
        let snapshotOptions;
        if (capture.backgroundAsset) {
          const loaded = await model.getAsset(capture.projectId, capture.drawing.backgroundAssetId);
          if (!loaded || loaded.projectId !== capture.projectId || loaded.id !== capture.backgroundAsset.id || !loaded.metadata ||
              loaded.metadata.role !== "photoOriginal" || String(loaded.metadata.sha256 || "").toLowerCase() !== capture.backgroundFingerprint) {
            throw Object.assign(new Error("已驗證底圖與目前 Drawing 快照不一致。"), { code: "DRAWING_BACKGROUND_SNAPSHOT_MISMATCH" });
          }
          background = await decodeShotDrawingBackground(loaded.originalBlob);
          snapshotOptions = { backgroundImage: background.image, backgroundFingerprint: capture.backgroundFingerprint };
        }
        if (!shotDrawingCaptureIsCurrent(capture, epoch)) return;
        const renderer = window.DirectorStoryboardRenderer;
        const snapshot = renderer.createSnapshot(capture.drawing, snapshotOptions);
        const aspect = capture.drawing.canvas.width / capture.drawing.canvas.height;
        const width = 960;
        const height = Math.max(1, Math.round(width / aspect));
        const canvas = document.createElement("canvas");
        const rendered = renderer.renderToCanvas(canvas, snapshot, { width, height, pixelRatio: 1 });
        if (!rendered || rendered.sourceKey !== snapshot.sourceKey || rendered.rendererVersion !== capture.rendererVersion) {
          throw Object.assign(new Error("Drawing renderer 回傳的來源版本不一致。"), { code: "DRAWING_PREVIEW_SOURCE_MISMATCH" });
        }
        const blob = await canvasPngBlob(canvas);
        if (!shotDrawingCaptureIsCurrent(capture, epoch)) return;
        const fresh = shotDrawingCapture(capture.projectId, capture.shotId, capture.drawingId);
        const freshSnapshot = renderer.createSnapshot(fresh.drawing, fresh.backgroundAsset ? { backgroundImage: background && background.image, backgroundFingerprint: fresh.backgroundFingerprint } : undefined);
        if (fresh.signature !== capture.signature || freshSnapshot.sourceKey !== snapshot.sourceKey) {
          throw Object.assign(new Error("合成期間 Drawing 或底圖來源已變更；已取消這張過期預覽。"), { code: "DRAWING_PREVIEW_STALE" });
        }
        const urlKey = JSON.stringify([capture.projectId, capture.shotId, capture.drawingId, snapshot.sourceKey]);
        let entry = shotDrawingObjectUrls.get(urlKey);
        if (!entry) {
          const url = URL.createObjectURL(blob);
          entry = { urlKey, url, projectId: capture.projectId, shotId: capture.shotId, drawingId: capture.drawingId,
            captureSignature: capture.signature, sourceKey: snapshot.sourceKey, backgroundFingerprint: capture.backgroundFingerprint, rendererVersion: capture.rendererVersion };
          const previousKey = shotDrawingUrlByCapture.get(capture.signature);
          if (previousKey && previousKey !== urlKey) releaseShotDrawingUrl(previousKey);
          shotDrawingObjectUrls.set(urlKey, entry);
          shotDrawingUrlByCapture.set(capture.signature, urlKey);
        }
        shotDrawingReadErrors.delete(capture.signature);
        visibleShotDrawingCards(capture).forEach((card) => applyShotDrawingUrl(card, entry));
      } catch (error) {
        if (shotDrawingCaptureIsCurrent(capture, epoch)) showShotDrawingReadError(capture, error);
      } finally {
        if (background && background.url) { try { URL.revokeObjectURL(background.url); } catch (_) {} }
        if (shotDrawingReadsPending.get(capture.signature) === request) shotDrawingReadsPending.delete(capture.signature);
      }
    })();
    request.promise = pending;
    await pending;
  }
  function syncVisibleShotDrawings() {
    const cards = $$("#shot-list .shot-card[data-drawing-id]");
    cards.forEach((card) => {
      if (card.hidden) return;
      let capture;
      try {
        capture = shotDrawingCapture(card.dataset.drawingProject, card.dataset.drawingShot, card.dataset.drawingId);
        card.__drawingCaptureSignature = capture.signature;
        const cachedKey = shotDrawingUrlByCapture.get(capture.signature);
        const cached = cachedKey && shotDrawingObjectUrls.get(cachedKey);
        if (cached && cached.sourceKey && cached.rendererVersion === capture.rendererVersion && cached.backgroundFingerprint === capture.backgroundFingerprint) {
          shotDrawingReadErrors.delete(capture.signature);
          applyShotDrawingUrl(card, cached);
          return;
        }
        const readError = shotDrawingReadErrors.get(capture.signature);
        if (readError) {
          setShotDrawingStatus(card, "手繪合成失敗 · " + (readError.code ? readError.code + " · " : "") + readError.message, true);
          return;
        }
        setShotDrawingStatus(card, "正在合成已保存手繪…", false);
        const pending = shotDrawingReadsPending.get(capture.signature);
        if (!pending || pending.epoch !== shotDrawingUrlEpoch) void loadShotDrawingPreview(capture, shotDrawingUrlEpoch);
      } catch (error) {
        card.__drawingCaptureSignature = null;
        setShotDrawingStatus(card, "手繪合成失敗 · " + (error && error.code ? error.code + " · " : "") + (error && error.message || "Drawing 無法驗證。"), true);
      }
    });
    reconcileShotDrawingUrls();
  }
  function updatePhotoSessionCardStatus() {
    $$("#shot-list [data-photo-status-shot]").forEach((node) => {
      const session = photoImportSession;
      const active = !!(session && session.shotId === node.dataset.photoStatusShot && state && state.projectId === session.projectId);
      node.hidden = !active;
      if (!active) { node.textContent = ""; return; }
      const labels = { cropping: "照片裁切尚未確認，沒有寫入。", importing: "照片正在驗證、保存照片與裁切…", retrying: "正在重試原照片與裁切命令…", save_failed: "照片與裁切尚未保存；保存失敗，可重試。", reconcile_required: "保存結果待 Model 核對；請重試原命令，不要重新選檔。", recovery_required: "保存已停止；先重新取得編輯權或重新載入比對。", failed: "照片尚未保存；請檢查錯誤或重新選取。" };
      node.textContent = labels[session.status] || "照片匯入進度已更新。";
    });
  }
  function photoImportPolicy() { const module = photoImportModule(); return module && module.PHOTO_IMPORT_POLICY || null; }
  function photoNeedsModelReconcile(error) { return !!(error && ["COMMIT_UNCERTAIN", "DUPLICATE_COMMAND"].includes(error.code)); }
  function photoErrorStatus(error, fallbackStatus) {
    if (photoNeedsModelReconcile(error)) return "reconcile_required";
    if (error && ["LEASE_LOST", "REVISION_CONFLICT"].includes(error.code)) return "recovery_required";
    return fallbackStatus;
  }
  function configureShotPhotoPicker() {
    const input = $("#shot-photo-picker");
    const policy = photoImportPolicy();
    if (!input || !policy) return false;
    input.accept = Array.isArray(policy.acceptedMimeTypes) ? policy.acceptedMimeTypes.join(",") : "";
    input.multiple = false;
    return true;
  }
  function photoTargetTitle(session) {
    if (session && session.mode === "new-shot") return "新鏡頭草稿";
    const shot = state && state.projectId === session.projectId && state.shots.find((item) => item.id === session.shotId);
    return shot ? shotNumberWithQuotedTitle(shot) : "指定鏡頭";
  }
  function photoTargetAssetName(session) {
    const asset = session && currentPhotoAssetMetadata(session.projectId, session.previousAssetId);
    return asset && asset.originalName || "目前主圖";
  }
  function renderPhotoImportBanner() {
    const banner = $("#shot-photo-import-banner");
    if (!banner) return;
    const session = photoImportSession;
    if (!session) { banner.hidden = true; banner.replaceChildren(); updatePhotoSessionCardStatus(); return; }
    if (["cropping", "importing", "retrying"].includes(session.status)) {
      banner.hidden = true; banner.replaceChildren(); updatePhotoSessionCardStatus(); return;
    }
    const sameProject = !!(state && state.projectId === session.projectId);
    const policy = photoImportPolicy();
    const statusText = session.status === "save_failed" ? (session.mode === "new-shot" ? "新鏡頭、照片與裁切尚未保存；候選仍保留，鏡頭尚未建立。" : "照片與裁切尚未保存；候選檔和目標鏡頭仍保留。") : session.status === "reconcile_required" ? "保存結果仍待 Model 核對；請使用下方按鈕重試原命令，不要重新選檔。" : session.status === "recovery_required" ? "保存已停止；請先重新取得編輯權或重新載入比對，再決定後續操作。" : session.status === "failed" ? "照片尚未保存；請查看錯誤並重新選取。" : "照片資料仍保留，尚未完成。";
    const files = session.files.map((file) => '<li>' + escapeHtml(file.name || "未命名檔案") + ' <span>' + Math.ceil((file.size || 0) / 1024) + ' KB</span></li>').join("");
    const progress = session.progress ? '<p class="shot-photo-import-progress" aria-live="polite">' + escapeHtml(session.progress) + '</p>' : '';
    const error = session.error ? '<p class="shot-photo-import-error" role="alert">' + escapeHtml((session.error.code ? session.error.code + ' · ' : '') + (session.error.message || "照片匯入失敗。")) + '</p>' : '';
    const mismatch = sameProject ? '' : '<p class="shot-photo-import-error" role="alert">目前已切換到其他專案；候選仍保留在原專案「' + escapeHtml(session.projectTitle || "未命名專案") + '」。請切回原專案後再提交，或放棄候選。</p>';
    const replacement = session.mode === "replace" ? '<p class="shot-photo-import-summary">只更新此鏡頭的主圖引用；原始照片與其他鏡頭的引用都會保留，這項變更可復原。</p>' : '';
    let controls = '';
    const canWrite = sameProject && !isReadOnly();
    if (["save_failed", "reconcile_required"].includes(session.status)) controls += '<button type="button" class="shot-photo-action shot-photo-write-action" data-shot-photo-action="retry" ' + (!canWrite ? 'disabled' : '') + '>' + (session.status === "reconcile_required" ? "重試並核對原命令" : "重試保存") + '</button>';
    if (sameProject && session.status === "failed") controls += '<button type="button" class="shot-photo-action shot-photo-write-action" data-shot-photo-action="reselect" ' + (!canWrite ? 'disabled' : '') + '>重新選照片</button>';
    if (["failed", "recovery_required"].includes(session.status)) controls += '<button type="button" class="shot-photo-action is-quiet" data-shot-photo-action="cancel">清除提示</button>';
    const trial = policy && policy.maxBytesStatus === "trial" ? '<p class="shot-photo-import-footnote">可選格式依目前照片匯入政策；容量限制仍是試作設定。</p>' : '';
    banner.hidden = false;
    banner.innerHTML = '<div class="shot-photo-import-copy"><strong>' + (session.mode === "replace" ? "更新主圖" : "設定主圖") + ' · ' + escapeHtml(photoTargetTitle(session)) + '</strong><p>' + statusText + '</p><ul>' + files + '</ul>' + replacement + progress + error + mismatch + trial + '</div><div class="shot-photo-import-controls">' + controls + '</div>';
    applyPhotoReadonlyControls(); updatePhotoSessionCardStatus();
  }
  function applyPhotoReadonlyControls() {
    const locked = isReadOnly();
    $$("#shot-list .shot-photo-write-action, #shot-photo-picker, #shot-photo-import-banner .shot-photo-write-action").forEach((element) => lockReadonlyControl(element, locked));
  }
  function openShotPhotoPicker(target) {
    if (isReadOnly()) { message("目前為唯讀瀏覽；請重新取得編輯權後再選取照片。", true); return; }
    if (!photoImportPolicy() || !model || typeof model.getShotPhoto !== "function" || typeof model.addShotPhotos !== "function") { message("照片匯入功能尚未載入，請重新整理工作區後再試。", true); return; }
    if (photoImportSession) { message("目前仍有待處理照片；請先匯入、重試或清除候選。", true); return; }
    const shotId = target.dataset.shotId || target.closest("[data-shot]")?.dataset.shot;
    const shot = state && state.shots.find((item) => item.id === shotId);
    if (!shot || !state.projectId) { message("找不到此照片操作的目標鏡頭。", true); return; }
    const previousAssetId = Array.isArray(shot.assetIds) ? shot.assetIds[0] || null : null;
    const mode = previousAssetId ? "replace" : "add";
    if (mode === "replace" && (!previousAssetId || !Array.isArray(shot.assetIds) || shot.assetIds[0] !== previousAssetId || typeof model.replaceShotPhoto !== "function")) { message("主圖已變更；請重新整理卡片後再開始替換。", true); return; }
    const input = $("#shot-photo-picker");
    if (!input || !configureShotPhotoPicker()) { message("照片匯入政策尚未載入，無法開啟檔案選擇器。", true); return; }
    photoPickerTarget = { projectId: state.projectId, projectTitle: state.title || "未命名專案", shotId, mode, previousAssetId, initialAssetIds: shot.assetIds.slice(), initialPrimaryCrop: previousAssetId ? photoCropForShot(shot, previousAssetId) : null, startRevision: state.revision, projectGeneration: photoCropProjectGeneration };
    input.value = "";
    input.click();
  }
  function disposePhotoImportEditor(session) {
    if (!session || !session.editor) return false;
    const editor = session.editor;
    session.editor = null;
    if (typeof editor.destroy === "function") editor.destroy();
    return true;
  }
  function photoImportSessionIsCurrent(session, requireBaseRevision) {
    if (!session || photoImportSession !== session || session.projectGeneration !== photoCropProjectGeneration) return false;
    const project = currentCanonicalPhotoProject(session.projectId);
    if (!project || project.projectId !== session.projectId || requireBaseRevision && project.revision !== session.startRevision) return false;
    if (session.mode === "new-shot") return !!(session.sceneId && project.scenes.some((scene) => scene.id === session.sceneId));
    const shot = Array.isArray(project.shots) && project.shots.find((item) => item.id === session.shotId);
    return !!(shot && Array.isArray(shot.assetIds) && JSON.stringify(shot.assetIds) === JSON.stringify(session.initialAssetIds));
  }
  function syncPhotoImportSessionForSnapshot(snapshot) {
    const session = photoImportSession;
    if (!session || session.status !== "cropping") return;
    if (photoImportSessionIsCurrent(session, true)) return;
    disposePhotoImportEditor(session);
    session.status = "failed";
    session.error = { code: "PHOTO_IMPORT_STALE", message: "專案、鏡頭或照片清單已更新；候選沒有寫入，請重新選取照片。" };
    renderPhotoImportBanner();
    if (snapshot && snapshot.projectId !== session.projectId) message("專案已切換；照片候選沒有寫入，請切回原專案後重新選取。", true);
  }
  function startShotPhotoImportCrop(session) {
    const cropEditor = window.DirectorStoryboardPhotoCropEditor;
    const mount = $("#photo-crop-editor-mount");
    if (!cropEditor || typeof cropEditor.mount !== "function" || !mount) {
      session.status = "failed";
      session.error = { code: "PHOTO_CROP_EDITOR_UNAVAILABLE", message: "照片裁切視窗尚未載入；照片沒有寫入。" };
      renderPhotoImportBanner();
      return;
    }
    if (!photoImportSessionIsCurrent(session, true)) {
      session.status = "failed";
      session.error = { code: session.mode === "new-shot" ? "PHOTO_TARGET_REVISION_CHANGED" : "PHOTO_IMPORT_STALE", message: "專案或目標資料已更新；照片沒有寫入，請重新選取。" };
      renderPhotoImportBanner();
      return;
    }
    try {
      const editor = cropEditor.mount(mount, {
        imageBlob: session.files[0],
        aspectRatio: state && state.aspectRatio || "16:9",
        crop: null,
        imageLabel: session.files[0].name || "待匯入照片",
        title: (session.mode === "replace" ? "更新分鏡主圖" : "設定分鏡主圖") + " · " + photoTargetTitle(session),
        onConfirm: (crop) => submitShotPhotoImport(session, crop),
        onCancel: () => {
          if (photoImportSession === session) {
            photoImportSession = null;
            renderPhotoImportBanner();
            if (session.placeholder) resumeShotPlaceholderAutoPromotion(session.contextKey);
          }
        }
      });
      session.editor = editor;
      const dialog = editor.editor && editor.editor.dialog;
      if (dialog) dialog.addEventListener("close", () => {
        if (session.editor === editor) disposePhotoImportEditor(session);
        if (photoImportSession === session && session.status === "cropping") {
          photoImportSession = null;
          renderPhotoImportBanner();
          if (session.placeholder) resumeShotPlaceholderAutoPromotion(session.contextKey);
        }
      }, { once: true });
      void editor.open().catch((error) => {
        if (photoImportSession === session) {
          session.status = "failed";
          session.error = { code: error && error.code || "PHOTO_CROP_OPEN_FAILED", message: error && error.message || "無法開啟照片裁切。照片沒有寫入。" };
          renderPhotoImportBanner();
        }
        disposePhotoImportEditor(session);
      });
    } catch (error) {
      session.status = "failed";
      session.error = { code: error && error.code || "PHOTO_CROP_OPEN_FAILED", message: error && error.message || "無法開啟照片裁切。照片沒有寫入。" };
      renderPhotoImportBanner();
    }
  }
  function handleShotPhotoPickerChange(input) {
    const target = photoPickerTarget; photoPickerTarget = null;
    const files = Array.from(input.files || []); input.value = "";
    if (target && target.placeholder) {
      if (!files.length) { resumeShotPlaceholderAutoPromotion(target.contextKey); return; }
      if (!state || state.projectId !== target.projectId || !state.chapters.some((chapter) => chapter.id === target.sceneId)) {
        message("專案或場次已切換；照片沒有寫入，也沒有建立鏡頭。", true);
        resumeShotPlaceholderAutoPromotion(target.contextKey);
        return;
      }
      if (files.length !== 1) {
        message("每個鏡頭一次只選取一張照片；沒有建立鏡頭。", true);
        resumeShotPlaceholderAutoPromotion(target.contextKey);
        return;
      }
      const policy = photoImportPolicy();
      if (policy && policy.maxBytes !== null && files[0].size > policy.maxBytes) {
        message("照片超過目前匯入大小上限；沒有建立鏡頭。", true);
        resumeShotPlaceholderAutoPromotion(target.contextKey);
        return;
      }
      const session = {
        id: ++photoImportSessionSequence,
        ...target,
        mode: "new-shot",
        shotId: null,
        files: [files[0]],
        initialAssetIds: [],
        initialPrimaryCrop: null,
        status: "cropping",
        progress: "",
        error: null,
        savedAssetIds: [],
        savedAssetId: null,
        importResult: null,
        crop: null,
        editor: null
      };
      photoImportSession = session;
      startShotPhotoImportCrop(session);
      return;
    }
    if (!target || !files.length) return;
    const policy = photoImportPolicy();
    const session = { id: ++photoImportSessionSequence, ...target, files: files.slice(0, 1), status: "cropping", progress: "", error: null, savedAssetIds: [], savedAssetId: null, importResult: null, crop: null, editor: null };
    photoImportSession = session;
    if (files.length !== 1) {
      session.status = "failed";
      session.error = { code: "INVALID_SELECTION", message: "每個鏡頭一次只選取一張照片；照片沒有寫入。" };
      renderPhotoImportBanner();
      return;
    }
    if (policy && policy.maxBytes !== null && files[0].size > policy.maxBytes) {
      session.status = "failed";
      session.error = { code: "FILE_TOO_LARGE", message: "照片超過目前匯入大小上限；照片沒有寫入。" };
      renderPhotoImportBanner();
      return;
    }
    startShotPhotoImportCrop(session);
  }
  function updatePhotoImportProgress(session, event) {
    if (photoImportSession !== session || !event) return;
    const stageLabels = { validating: "正在驗證照片", validated: "照片已驗證，尚未保存", saving: "正在保存照片", saved: "照片已保存", save_failed: "保存失敗，候選檔仍保留", failed: "照片驗證或匯入失敗" };
    session.progress = (stageLabels[event.stage] || "照片匯入進度已更新") + (event.originalName ? " · " + event.originalName : "") + (event.index != null && event.total != null ? " · " + Math.min(event.index + (event.stage === "saving" ? 1 : 0), event.total) + "/" + event.total : "");
    if (event.assetId && event.stage === "saved" && !session.savedAssetIds.includes(event.assetId)) session.savedAssetIds.push(event.assetId);
    if (event.error) session.error = { code: event.error.code || "PHOTO_IMPORT_FAILED", message: event.error.message || String(event.error) };
    if (event.stage === "save_failed") session.status = photoErrorStatus(session.error, "save_failed");
    else if (event.stage === "failed") session.status = photoErrorStatus(session.error, "failed");
    else if (event.stage === "saved") session.status = "importing";
    renderPhotoImportBanner();
  }
  function refreshPhotoCanonicalState(session) {
    const canonical = model && typeof model.getState === "function" ? model.getState() : null;
    if (!canonical || canonical.projectId !== session.projectId) return null;
    if (!state || state.projectId !== canonical.projectId || state.revision !== canonical.revision) {
      state = canonical;
      if (activeProjectId !== canonical.projectId) activeProjectId = canonical.projectId;
      renderShotList(); renderOutput();
    }
    return canonical;
  }
  async function finishPhotoImportSession(session, result, retried) {
    if (photoImportSession !== session) return false;
    const canonical = refreshPhotoCanonicalState(session);
    if (session.mode === "new-shot") {
      const shotId = result && result.shotId;
      const shot = canonical && canonical.shots.find((item) => item.id === shotId);
      const committedIds = [result && result.assetId, ...(result && result.addedAssetIds || []), ...(result && result.duplicateAssetIds || []), ...session.savedAssetIds].filter(Boolean);
      const assetId = committedIds.find((candidate) => shot && Array.isArray(shot.assetIds) && shot.assetIds.includes(candidate)) || null;
      if (!shot || shot.chapterId !== session.sceneId || !Array.isArray(shot.assetIds) || shot.assetIds.length !== 1 || !assetId || !shot.assetIds.includes(assetId)) {
        throw Object.assign(new Error("Model 尚未確認新鏡頭與單張照片已一併保存；候選仍保留。"), { code: "SHOT_PHOTO_COMMIT_NOT_VISIBLE" });
      }
      if (!photoCropsEqual(photoCropForShot(shot, assetId), session.crop)) {
        throw Object.assign(new Error("Model 尚未確認照片與裁切在同一命令保存；候選仍保留。"), { code: "PHOTO_CROP_NOT_VISIBLE" });
      }
      session.shotId = shotId;
      session.savedAssetId = assetId;
      session.importResult = result || null;
      const contextKey = session.contextKey;
      const emptyDraft = { title: "", visual: "", script: "", super: "", sound: "", move: "", tags: "", duration: "" };
      shotPlaceholderDrafts.set(contextKey, emptyDraft);
      const sameDraftContext = shotPlaceholderContextKey === contextKey && state && state.projectId === session.projectId;
      if (sameDraftContext) {
        shotPlaceholderDraft = emptyDraft;
        shotPlaceholderMessage = "";
        selectedShotId = shotId;
        activeChapterId = session.sceneId;
      }
      photoImportSession = null;
      renderPhotoImportBanner();
      renderAll();
      const duplicateCount = result && result.duplicateAssetIds ? result.duplicateAssetIds.length : 0;
      message(duplicateCount ? "照片已保存；新鏡頭已建立並引用專案中的既有原圖。" : "照片與裁切已保存；新鏡頭已建立。");
      return true;
    }
    const shot = canonical && canonical.shots.find((item) => item.id === session.shotId);
    if (!shot) throw Object.assign(new Error("原目標鏡頭已不存在；候選照片仍保留。"), { code: "SHOT_NOT_FOUND" });
    let committedIds = [];
    if (session.mode === "replace") committedIds = [result && result.assetId, ...session.savedAssetIds].filter(Boolean);
    else committedIds = [...(result && result.addedAssetIds || []), ...(result && result.duplicateAssetIds || []), ...session.savedAssetIds];
    if (retried && !committedIds.length) committedIds = shot.assetIds.filter((assetId) => !session.initialAssetIds.includes(assetId));
    const assetId = session.savedAssetId || committedIds.find((candidate) => shot.assetIds.includes(candidate)) || null;
    if (!assetId || !shot.assetIds.includes(assetId)) throw Object.assign(new Error("Model 尚未在目標鏡頭確認照片引用；候選仍保留。"), { code: "PHOTO_COMMIT_NOT_VISIBLE" });
    if (!photoCropsEqual(photoCropForShot(shot, assetId), session.crop)) {
      throw Object.assign(new Error("Model 尚未在同一保存命令確認照片與裁切；候選保留，請重新載入檢查。"), { code: "PHOTO_CROP_NOT_VISIBLE" });
    }
    session.savedAssetId = assetId;
    if (!session.importResult) session.importResult = result || null;
    const duplicateCount = result && result.duplicateAssetIds ? result.duplicateAssetIds.length : 0;
    const noOp = !!(result && result.noOp) && photoCropsEqual(session.initialPrimaryCrop, session.crop);
    photoImportSession = null; renderPhotoImportBanner(); renderShotList();
    if (noOp) message("照片與裁切沒有變更。");
    else if (session.mode === "replace") message("分鏡主圖已更新；舊照片仍保留，可復原。");
    else if (duplicateCount) message("照片已設定為分鏡主圖；既有原圖沒有重複保存。");
    else message(retried ? "原照片命令已重試；分鏡主圖與裁切已保存。" : "分鏡主圖與照片裁切已保存。");
    return true;
  }
  async function submitShotPhotoImport(session, crop) {
    if (photoImportSession !== session) return false;
    if (isReadOnly()) throw readOnlyFailure();
    if (!state || state.projectId !== session.projectId) throw Object.assign(new Error("請先切回選取照片時的原專案；候選與原鏡頭目標已保留。"), { code: "PROJECT_SWITCH_PENDING" });
    if (!session.files.length || session.files.length !== 1) throw Object.assign(new Error("每個鏡頭一次只選取一張照片。"), { code: "INVALID_SELECTION" });
    if (!session.savedAssetId && !photoImportSessionIsCurrent(session, true)) throw Object.assign(new Error("專案、鏡頭或主圖已更新；照片沒有寫入，請重新選取。"), { code: "PHOTO_IMPORT_STALE" });
    if (session.mode === "replace") {
      const shot = state.shots.find((item) => item.id === session.shotId);
      if (!shot || !Array.isArray(shot.assetIds) || shot.assetIds[0] !== session.previousAssetId) throw Object.assign(new Error("等待裁切期間主圖已變更；照片沒有寫入，請重新選取。"), { code: "REPLACE_TARGET_CHANGED" });
    }
    session.crop = crop == null ? null : { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
    session.status = "importing"; session.error = null; session.progress = "等待照片驗證…"; renderPhotoImportBanner();
    const options = { crop: session.crop, onProgress: (event) => updatePhotoImportProgress(session, event) };
    if (session.mode === "new-shot") options.expectedRevision = session.startRevision;
    try {
      const result = session.savedAssetId
        ? session.importResult
        : await withMutation(() => session.mode === "new-shot"
          ? model.addShotWithPhoto(session.sceneId, session.files[0], session.initialPatch || {}, options)
          : session.mode === "replace"
            ? model.replaceShotPhoto(session.shotId, session.previousAssetId, session.files[0], options)
            : model.addShotPhotos(session.shotId, session.files, options));
      session.importResult = result || session.importResult;
      await finishPhotoImportSession(session, result, false);
      return true;
    } catch (error) {
      if (photoImportSession === session) {
        const currentLifecycle = modelLifecycle();
        session.status = photoErrorStatus(error, session.progress && session.progress.includes("保存失敗") || currentLifecycle && currentLifecycle.phase === "save_failed" ? "save_failed" : "failed");
        session.error = { code: error && error.code || "PHOTO_IMPORT_FAILED", message: error && error.message || "照片匯入失敗。" };
        renderPhotoImportBanner();
        if (["save_failed", "reconcile_required", "recovery_required"].includes(session.status) || currentLifecycle && Number(currentLifecycle.pendingCount || 0) > 0) disposePhotoImportEditor(session);
      }
      throw error;
    }
  }
  async function retryShotPhotoImport(session) {
    if (photoImportSession !== session || !["save_failed", "reconcile_required"].includes(session.status)) return false;
    if (isReadOnly()) throw readOnlyFailure();
    if (!state || state.projectId !== session.projectId) throw Object.assign(new Error("請切回原專案後再重試；候選不會轉投其他專案。"), { code: "PROJECT_SWITCH_PENDING" });
    if (!model || typeof model.retryPending !== "function") throw Object.assign(new Error("目前 Model 無法重試待保存命令。"), { code: "RETRY_UNAVAILABLE" });
    session.status = "retrying"; session.error = null; session.progress = "重用原照片命令與候選資料進行重試…"; renderPhotoImportBanner();
    try {
      const result = await withMutation(() => model.retryPending());
      if (result === false) throw Object.assign(new Error("Model 沒有可重試的待保存照片命令；候選仍保留。"), { code: "NO_PENDING_RETRY" });
      await finishPhotoImportSession(session, result, true);
      return true;
    } catch (error) {
      if (photoImportSession === session) {
        const currentLifecycle = modelLifecycle();
        session.status = error && error.code === "NO_PENDING_RETRY" ? "reconcile_required" : photoErrorStatus(error, currentLifecycle && currentLifecycle.phase === "save_failed" ? "save_failed" : "failed");
        session.error = { code: error && error.code || "PHOTO_RETRY_FAILED", message: error && error.message || "照片保存重試失敗。" };
        renderPhotoImportBanner();
      }
      throw error;
    }
  }
  function clearPhotoImportSession() {
    if (!photoImportSession || ["importing", "retrying", "save_failed", "reconcile_required"].includes(photoImportSession.status)) return;
    const session = photoImportSession;
    disposePhotoImportEditor(session);
    photoImportSession = null; renderPhotoImportBanner();
    if (session.placeholder) resumeShotPlaceholderAutoPromotion(session.contextKey);
  }
  function handleShotPhotoAction(action, target) {
    const session = photoImportSession;
    if (action === "add" || action === "replace") { openShotPhotoPicker(target); return; }
    if (action === "crop") { startShotPhotoCrop(target); return; }
    if (action === "photo-up" || action === "photo-down") {
      void reorderShotPhoto(target.dataset.shotId, target.dataset.assetId, action === "photo-up" ? -1 : 1)
        .catch((error) => message((error && error.code ? error.code + " · " : "") + (error && error.message || "照片排序失敗；請重新檢查照片順序。"), true));
      return;
    }
    if (action === "photo-remove") { confirmRemoveShotPhoto(target); return; }
    if (action === "retry") { if (session) void retryShotPhotoImport(session).catch((error) => message((error.code ? error.code + " · " : "") + (error.message || "照片保存重試失敗。"), true)); return; }
    if (action === "cancel") { clearPhotoImportSession(); return; }
    if (action === "reselect") {
      if (!session) return;
      if (session.mode === "new-shot") {
        const card = $("#shot-list [data-shot-placeholder]");
        const canReselect = state && state.projectId === session.projectId && shotPlaceholderContextKey === session.contextKey && card && card.dataset.placeholderSceneId === session.sceneId;
        photoImportSession = null; renderPhotoImportBanner();
        if (!canReselect) { message("請切回原專案與場次，再從尾端草稿重新選取照片；沒有建立鏡頭。", true); return; }
        openShotPlaceholderPhotoPicker(card);
        return;
      }
      const previous = { shotId: session.shotId };
      photoImportSession = null; renderPhotoImportBanner();
      openShotPhotoPicker({ dataset: { shotId: previous.shotId }, closest: () => null });
      return;
    }
    if (action === "reload") {
      const shotId = target.dataset.shotId; const assetId = target.dataset.assetId;
      const key = photoReadKey(state && state.projectId, shotId, assetId); shotPhotoReadErrors.delete(key);
      const thumb = target.closest(".shot-card")?.querySelector(".shot-photo-content");
      if (thumb) { const status = document.createElement("span"); status.className = "shot-photo-message"; status.textContent = "正在重新載入照片…"; thumb.replaceChildren(status); }
      const reloadButton = target; reloadButton.remove();
      const cached = shotPhotoObjectUrls.get(photoUrlKey(state && state.projectId, assetId));
      if (cached) { visibleShotPhotoCards(state && state.projectId, assetId).forEach((card) => applyShotPhotoUrl(card, cached)); return; }
      loadShotPhoto(state && state.projectId, shotId, assetId); return;
    }
  }

  function renderChapters() {
    $("#chapter-list").style.setProperty("--scene-number-width", String(Math.max(1, String(state.chapters.length).length)) + "ch");
    const query = $("#chapter-search").value.trim().toLocaleLowerCase();
    const matchedSceneIds = matchedSceneIdsForSearch(query);
    const searchableChapters = state.chapters.filter((chapter) => {
      if (!query) return true;
      return matchedSceneIds.has(chapter.id) || inChapter(chapter.id).some((shot) => shotSearchMatches(shot, query));
    });
    const allCount = query ? state.shots.filter((shot) => shotMatchesSearch(shot, query, matchedSceneIds)).length : state.shots.length;
    const entries = [{ id: "all", title: "全部場次", count: allCount }, ...searchableChapters.map((chapter) => {
      const shots = inChapter(chapter.id);
      return { id: chapter.id, title: chapter.title, count: query ? matchedSceneIds.has(chapter.id) ? shots.length : shots.filter((shot) => shotSearchMatches(shot, query)).length : shots.length };
    })];
    $("#chapter-list").innerHTML = entries.map((chapter) => '<div class="chapter-row ' + (chapter.id === 'all' ? 'is-all' : '') + '"><button class="chapter-item ' + (activeChapterId === chapter.id ? "is-active" : "") + '" data-chapter="' + escapeHtml(chapter.id) + '"><span class="chapter-bullet"></span>' + (chapter.id === "all" ? "" : '<span class="chapter-label">場次</span><span class="chapter-number">' + (state.chapters.findIndex(item => item.id === chapter.id) + 1) + '</span>') + '<span class="chapter-name">' + escapeHtml(chapter.title) + '</span><span class="chapter-quantity">' + chapter.count + '</span></button>' + (chapter.id === 'all' ? '' : '<button class="scene-edit-button" data-action="edit-scene" data-scene-id="' + escapeHtml(chapter.id) + '" aria-label="編輯' + escapeHtml(sceneNumber(chapter.id)) + '" title="編輯場次名稱">編輯</button>') + '</div>').join("");
    $("#chapter-count").textContent = state.chapters.length;
  }
  const SHOT_PLACEHOLDER_TEXT_FIELDS = ["title", "visual", "script", "super", "sound", "move", "tags"];
  const SHOT_PLACEHOLDER_AUTO_PROMOTION_DELAY = 850;
  function cancelShotPlaceholderAutoPromotion() {
    if (shotPlaceholderAutoPromotionTimer !== null) {
      clearTimeout(shotPlaceholderAutoPromotionTimer);
      shotPlaceholderAutoPromotionTimer = null;
    }
  }
  function shotPlaceholderSceneId() {
    if (!state || !Array.isArray(state.chapters) || !state.chapters.length) return null;
    return activeChapterId !== "all" && state.chapters.some((chapter) => chapter.id === activeChapterId)
      ? activeChapterId
      : state.chapters[0].id;
  }
  function ensureShotPlaceholderDraft(sceneId) {
    const key = sceneId && state ? String(state.projectId) + "\u0000" + String(sceneId) : "";
    if (key !== shotPlaceholderContextKey) {
      cancelShotPlaceholderAutoPromotion();
      shotPlaceholderContextKey = key;
      if (key && !shotPlaceholderDrafts.has(key)) shotPlaceholderDrafts.set(key, { title: "", visual: "", script: "", super: "", sound: "", move: "", tags: "", duration: "" });
      if (key && !shotPlaceholderDraftVersions.has(key)) shotPlaceholderDraftVersions.set(key, 0);
      shotPlaceholderDraft = key ? shotPlaceholderDrafts.get(key) : null;
      shotPlaceholderMessage = "";
    }
    if (!shotPlaceholderDraft && key) {
      shotPlaceholderDraft = { title: "", visual: "", script: "", super: "", sound: "", move: "", tags: "", duration: "" };
      shotPlaceholderDrafts.set(key, shotPlaceholderDraft);
    }
    return key;
  }
  function shotPlaceholderAssessment(draft) {
    draft = draft || shotPlaceholderDraft;
    const patch = {};
    let hasText = false;
    SHOT_PLACEHOLDER_TEXT_FIELDS.forEach((key) => {
      const value = String(draft && draft[key] || "");
      if (value.replace(/[\s\u200B\uFEFF]/gu, "")) {
        hasText = true;
        patch[key] = value;
      }
    });
    const rawDuration = String(draft && draft.duration || "").trim();
    let positiveDuration = false;
    if (rawDuration) {
      const duration = Number(rawDuration);
      if (!Number.isFinite(duration) || duration < 0 || Math.abs(duration * 10 - Math.round(duration * 10)) > 1e-8) {
        return { valid: false, meaningful: false, patch, error: "秒數需為大於或等於 0 的數值，最多一位小數。" };
      }
      patch.duration = duration;
      positiveDuration = duration > 0;
    }
    return { valid: true, meaningful: hasText || positiveDuration, patch, error: "" };
  }
  function shotPlaceholderCompletePatch(draft) {
    const patch = {};
    SHOT_PLACEHOLDER_TEXT_FIELDS.forEach((key) => { patch[key] = String(draft && draft[key] || ""); });
    const rawDuration = String(draft && draft.duration || "").trim();
    patch.duration = rawDuration ? Number(rawDuration) : 0;
    return patch;
  }
  function shotPlaceholderEmptySnapshot() {
    const snapshot = {};
    SHOT_PLACEHOLDER_TEXT_FIELDS.forEach((key) => { snapshot[key] = ""; });
    snapshot.duration = 0;
    return snapshot;
  }
  function shotPlaceholderSnapshotFromShot(shot) {
    const snapshot = {};
    SHOT_PLACEHOLDER_TEXT_FIELDS.forEach((key) => { snapshot[key] = String(shot && shot[key] || ""); });
    snapshot.duration = Number(shot && (shot.durationSeconds == null ? shot.duration : shot.durationSeconds)) || 0;
    return snapshot;
  }
  function shotPlaceholderChangedPatch(base, draft) {
    const snapshot = shotPlaceholderCompletePatch(draft);
    const patch = {};
    const previous = base || shotPlaceholderEmptySnapshot();
    SHOT_PLACEHOLDER_TEXT_FIELDS.concat("duration").forEach((key) => {
      if (!Object.is(previous[key], snapshot[key])) patch[key] = snapshot[key];
    });
    return { snapshot, patch };
  }
  function rememberShotPlaceholderPromotedShot(contextKey, shotId, base) {
    shotPlaceholderPromotedShots.set(contextKey, { shotId, base: Object.assign({}, base || shotPlaceholderEmptySnapshot()) });
  }
  function shotPlaceholderPromotedAnchor(contextKey, shotId, canonical) {
    const remembered = shotPlaceholderPromotedShots.get(contextKey);
    if (remembered && remembered.shotId === shotId && remembered.base) return remembered;
    const shot = canonical && Array.isArray(canonical.shots) && canonical.shots.find((item) => item.id === shotId);
    if (!shot) return null;
    return { shotId, base: shotPlaceholderSnapshotFromShot(shot) };
  }
  function shotPlaceholderCardMarkup() {
    const sceneId = shotPlaceholderSceneId();
    if (!sceneId) return "";
    ensureShotPlaceholderDraft(sceneId);
    const modeClass = shotView === "gallery" ? "is-gallery" : "is-list";
    const readonly = isReadOnly();
    const disabled = readonly ? " disabled" : "";
    const canCreatePhoto = !!(photoImportPolicy() && model && typeof model.addShotWithPhoto === "function" && window.DirectorStoryboardPhotoCropEditor && typeof window.DirectorStoryboardPhotoCropEditor.mount === "function");
    const canCreateDrawing = !!(drawingUiAvailable() && model && typeof model.addShotWithDrawing === "function");
    const value = (key) => escapeHtml(String(shotPlaceholderDraft[key] == null ? "" : shotPlaceholderDraft[key]));
    const assessment = shotPlaceholderAssessment();
    return '<article class="shot-card shot-placeholder-card ' + modeClass + '" data-shot-placeholder="true" data-placeholder-project-id="' + escapeHtml(state.projectId) + '" data-placeholder-scene-id="' + escapeHtml(sceneId) + '" aria-label="新增鏡頭草稿">' +
      '<div class="shot-art-wrap"><div class="shot-thumb shot-placeholder-thumb" aria-hidden="true"><span class="shot-placeholder-plus">＋</span><span class="shot-placeholder-thumb-label">輸入內容建立鏡頭</span></div></div>' +
      '<div class="shot-number"><span class="shot-placeholder-number">＋　待新增</span></div>' +
      '<div class="field-group shot-inline-field shot-title-field"><label class="field-label" for="shot-placeholder-title">鏡頭標題</label><input id="shot-placeholder-title" class="shot-inline-title" type="text" data-shot-placeholder-field="title" aria-label="新鏡頭標題" value="' + value("title") + '" placeholder="輸入鏡頭標題" autocomplete="off"' + disabled + '></div>' +
      '<div class="field-group shot-inline-field shot-visual-field"><label class="field-label" for="shot-placeholder-visual">畫面描述</label><textarea id="shot-placeholder-visual" class="shot-inline-visual" data-shot-placeholder-field="visual" aria-label="新鏡頭畫面描述" rows="2" placeholder="描述畫面、人物動作與視覺重點…"' + disabled + '>' + value("visual") + '</textarea></div>' +
      '<div class="shot-card-text-preview shot-card-script-preview"><label class="shot-preview-label" for="shot-placeholder-script"><strong>VO</strong><span>台詞／旁白</span></label><textarea id="shot-placeholder-script" class="shot-preview-text shot-inline-script" data-shot-placeholder-field="script" aria-label="新鏡頭台詞或旁白" rows="2" placeholder="輸入台詞或旁白…"' + disabled + '>' + value("script") + '</textarea></div>' +
      '<div class="shot-card-text-preview shot-card-super-preview"><label class="shot-preview-label" for="shot-placeholder-super"><strong>SUPER</strong><span>字卡</span></label><textarea id="shot-placeholder-super" class="shot-preview-text shot-inline-super" data-shot-placeholder-field="super" aria-label="新鏡頭字卡" rows="2" placeholder="輸入畫面字卡…"' + disabled + '>' + value("super") + '</textarea></div>' +
      '<div class="field-group shot-inline-field shot-duration-field"><label class="field-label" for="shot-placeholder-duration">影片秒數</label><div class="shot-duration-control"><input id="shot-placeholder-duration" class="shot-inline-duration" type="text" inputmode="decimal" data-shot-placeholder-field="duration" aria-label="新鏡頭影片秒數" value="' + value("duration") + '" placeholder="0" autocomplete="off"' + disabled + '><span class="shot-duration-unit">秒</span></div><span class="shot-duration-estimate">未估</span></div>' +
      '<details class="shot-placeholder-extra"><summary>其他鏡頭資料</summary><div class="shot-placeholder-extra-fields"><label>聲音設計<textarea class="textarea-field" data-shot-placeholder-field="sound" placeholder="環境音、音樂或轉場…"' + disabled + '>' + value("sound") + '</textarea></label><label>景別／運鏡<input class="text-field" type="text" data-shot-placeholder-field="move" value="' + value("move") + '" placeholder="例如：中景・推近"' + disabled + '></label><label>標籤<input class="text-field" type="text" data-shot-placeholder-field="tags" value="' + value("tags") + '" placeholder="以頓號分隔，例如：人物、黃昏"' + disabled + '></label></div></details>' +
      '<div class="shot-photo-actions shot-placeholder-actions"><span class="shot-placeholder-media-note">' + (canCreatePhoto ? "選擇照片後，確認裁切時才建立鏡頭。" : "照片保存流程尚未載入。") + (canCreateDrawing ? " 手繪按下「儲存並關閉」時才建立鏡頭；返回會捨棄畫布。" : " 手繪保存流程尚未載入。") + '</span>' + (canCreatePhoto ? '<button type="button" class="outline-button" data-placeholder-action="photo"' + disabled + '>選擇照片</button>' : '') + (canCreateDrawing ? '<button type="button" class="outline-button" data-placeholder-action="drawing"' + disabled + '>手繪</button>' : '') + '</div>' +
      '<div class="shot-placeholder-status" role="status" aria-live="polite" data-kind="' + (shotPlaceholderMessage || shotPlaceholderAssessment().error ? "error" : "info") + '">' + escapeHtml(shotPlaceholderMessage || shotPlaceholderAssessment().error || "輸入完成後會自動保存；空白與 0 秒會保留為草稿。") + '</div>' +
      '</article>';
  }
  function refreshShotPlaceholderControls(card) {
    if (!card || !card.isConnected || !card.matches("[data-shot-placeholder]")) return;
    const assessment = shotPlaceholderAssessment();
    const readonly = isReadOnly();
    card.querySelectorAll("[data-shot-placeholder-field]").forEach((field) => { field.disabled = readonly; });
    card.querySelectorAll("[data-placeholder-action]").forEach((field) => { field.disabled = readonly || !!shotPlaceholderPromotionPromise; });
    const photo = card.querySelector('[data-placeholder-action="photo"]');
    if (photo) photo.disabled = isReadOnly() || !assessment.valid || !!shotPlaceholderPromotionPromise;
    const drawing = card.querySelector('[data-placeholder-action="drawing"]');
    if (drawing) drawing.disabled = isReadOnly() || !assessment.valid || !!shotPlaceholderPromotionPromise || !!photoImportSession;
    const status = card.querySelector(".shot-placeholder-status");
    if (status) {
      const text = shotPlaceholderMessage || assessment.error || (assessment.meaningful
        ? shotPlaceholderPromotionPromise ? "正在保存鏡頭…" : "停止輸入片刻後會自動保存。"
        : "輸入文字或大於 0 的秒數後，才會建立鏡頭。空白與 0 秒會保留為草稿。");
      status.textContent = text;
      status.dataset.kind = shotPlaceholderMessage || assessment.error ? "error" : "info";
    }
  }
  function handleShotPlaceholderInput(field) {
    const card = field && field.closest && field.closest("[data-shot-placeholder]");
    const key = field && field.dataset && field.dataset.shotPlaceholderField;
    if (!card || !key || card.dataset.placeholderProjectId !== (state && state.projectId) || card.dataset.placeholderSceneId !== shotPlaceholderSceneId()) return false;
    if (!shotPlaceholderDraft) ensureShotPlaceholderDraft(card.dataset.placeholderSceneId);
    if (shotPlaceholderContextKey !== String(state.projectId) + "\u0000" + String(card.dataset.placeholderSceneId)) return false;
    shotPlaceholderDraft[key] = field.value;
    shotPlaceholderDrafts.set(shotPlaceholderContextKey, shotPlaceholderDraft);
    shotPlaceholderDraftVersions.set(shotPlaceholderContextKey, (shotPlaceholderDraftVersions.get(shotPlaceholderContextKey) || 0) + 1);
    shotPlaceholderMessage = "";
    if (key === "duration") {
      const estimate = card.querySelector(".shot-duration-estimate");
      const raw = String(field.value || "").trim();
      const duration = Number(raw);
      if (estimate) estimate.hidden = !!raw && Number.isFinite(duration) && duration > 0 && Math.abs(duration * 10 - Math.round(duration * 10)) < 1e-8;
    }
    refreshShotPlaceholderControls(card);
    return true;
  }
  function scheduleShotPlaceholderAutoPromotion() {
    cancelShotPlaceholderAutoPromotion();
    if (isReadOnly() || modelLifecycle().phase === "save_failed" || shotPlaceholderMessage || shotPlaceholderPromotionPromise || photoImportSession || drawingRoute || shotPlaceholderComposingFields.size) return;
    const contextKey = shotPlaceholderContextKey;
    const assessment = shotPlaceholderAssessment();
    if (!contextKey || !assessment.valid || !assessment.meaningful) return;
    shotPlaceholderAutoPromotionTimer = setTimeout(() => {
      shotPlaceholderAutoPromotionTimer = null;
      if (contextKey !== shotPlaceholderContextKey || isReadOnly() || modelLifecycle().phase === "save_failed" || shotPlaceholderMessage || shotPlaceholderPromotionPromise || photoImportSession || drawingRoute || shotPlaceholderComposingFields.size) return;
      const current = shotPlaceholderAssessment();
      if (current.valid && current.meaningful) void promoteShotPlaceholder();
    }, SHOT_PLACEHOLDER_AUTO_PROMOTION_DELAY);
  }
  function flushShotPlaceholderAutoPromotion() {
    if (shotPlaceholderAutoPromotionTimer === null) return false;
    cancelShotPlaceholderAutoPromotion();
    const assessment = shotPlaceholderAssessment();
    if (assessment.valid && assessment.meaningful) void promoteShotPlaceholder();
    return true;
  }
  function resumeShotPlaceholderAutoPromotion(contextKey) {
    if (!contextKey) return;
    setTimeout(() => {
      if (contextKey !== shotPlaceholderContextKey || !state || !shotPlaceholderDrafts.has(contextKey) || photoImportSession || drawingRoute) return;
      scheduleShotPlaceholderAutoPromotion();
    }, 0);
  }
  function openShotPlaceholderPhotoPicker(card) {
    cancelShotPlaceholderAutoPromotion();
    if (isReadOnly()) { message("目前為唯讀瀏覽；請重新取得編輯權後再選取照片。", true); return; }
    if (!photoImportPolicy() || !model || typeof model.addShotWithPhoto !== "function" || typeof model.getShotPhoto !== "function" || !window.DirectorStoryboardPhotoCropEditor || typeof window.DirectorStoryboardPhotoCropEditor.mount !== "function") {
      message("新鏡頭照片保存流程尚未載入；沒有建立鏡頭。", true);
      resumeShotPlaceholderAutoPromotion(shotPlaceholderContextKey);
      return;
    }
    if (photoImportSession) { message("目前仍有待處理照片；請先完成、重試或清除候選。", true); return; }
    if (!card || card.dataset.placeholderProjectId !== (state && state.projectId) || card.dataset.placeholderSceneId !== shotPlaceholderSceneId()) return;
    const assessment = shotPlaceholderAssessment();
    if (!assessment.valid) { shotPlaceholderMessage = assessment.error; refreshShotPlaceholderControls(card); return; }
    const input = $("#shot-photo-picker");
    if (!input || !configureShotPhotoPicker()) {
      message("照片匯入政策尚未載入，無法開啟檔案選擇器。", true);
      resumeShotPlaceholderAutoPromotion(shotPlaceholderContextKey);
      return;
    }
    photoPickerTarget = {
      placeholder: true,
      projectId: state.projectId,
      projectTitle: state.title || "未命名專案",
      sceneId: card.dataset.placeholderSceneId,
      initialPatch: assessment.patch,
      contextKey: shotPlaceholderContextKey,
      startRevision: state.revision,
      projectGeneration: photoCropProjectGeneration
    };
    input.value = "";
    input.click();
  }
  function openShotPlaceholderDrawingRoute(card) {
    cancelShotPlaceholderAutoPromotion();
    if (isReadOnly()) { message("目前為唯讀瀏覽；請重新取得編輯權後再開啟手繪。", true); return; }
    if (!drawingUiAvailable() || !model || typeof model.addShotWithDrawing !== "function") {
      message("新鏡頭手繪保存流程尚未載入；沒有建立鏡頭。", true);
      resumeShotPlaceholderAutoPromotion(shotPlaceholderContextKey);
      return;
    }
    if (photoImportSession) { message("目前有待處理照片；先完成或取消照片裁切，再開啟手繪。", true); return; }
    if (!card || card.dataset.placeholderProjectId !== (state && state.projectId) || card.dataset.placeholderSceneId !== shotPlaceholderSceneId()) return;
    const assessment = shotPlaceholderAssessment();
    if (!assessment.valid) { shotPlaceholderMessage = assessment.error; refreshShotPlaceholderControls(card); return; }
    const current = model.getState && model.getState();
    const sceneId = card.dataset.placeholderSceneId;
    if (!current || current.projectId !== state.projectId || current.revision !== state.revision || !current.chapters.some((chapter) => chapter.id === sceneId)) {
      message("專案或場次已更新；手繪草稿沒有開啟，也沒有建立鏡頭。", true); return;
    }
    const route = {
      placeholder: true,
      projectId: current.projectId,
      sceneId,
      shotId: null,
      drawingId: null,
      initialShotPatch: assessment.patch,
      contextKey: shotPlaceholderContextKey,
      baseRevision: current.revision,
      status: "loading",
      error: null
    };
    drawingRoute = route;
    setView("drawing");
    renderDrawingRouteStatus();
    try { mountDrawingRoute(route, null, true); }
    catch (error) {
      if (route === drawingRoute) { route.error = error; route.status = "error"; renderDrawingRouteStatus(); }
    }
  }
  async function handleShotPlaceholderAction(action, card) {
    if (action === "photo") { openShotPlaceholderPhotoPicker(card); return; }
    if (action === "drawing") { openShotPlaceholderDrawingRoute(card); return; }
  }
  async function reconcileShotPlaceholderDraft(context, shotId, appliedVersion) {
    let currentVersion = shotPlaceholderDraftVersions.get(context.contextKey) || 0;
    let preserveDraft = false;
    let preserveEmptyDraft = false;
    let anchor = shotPlaceholderPromotedAnchor(context.contextKey, shotId, model && model.getState && model.getState());
    if (!anchor) throw Object.assign(new Error("找不到已保存鏡頭的欄位基線；草稿仍保留。"), { code: "SHOT_PROMOTION_ANCHOR_MISSING" });
    while (currentVersion !== appliedVersion) {
      const latestDraft = shotPlaceholderDrafts.get(context.contextKey);
      const latestAssessment = shotPlaceholderAssessment(latestDraft);
      if (!latestAssessment.valid) { preserveDraft = true; break; }
      if (!latestAssessment.meaningful) { preserveDraft = true; preserveEmptyDraft = true; break; }
      const versionBeingSaved = currentVersion;
      const changed = shotPlaceholderChangedPatch(anchor.base, latestDraft);
      if (Object.keys(changed.patch).length) {
        shotPlaceholderRetryContext = Object.assign({}, context, {
          kind: "update",
          shotId,
          appliedVersion: versionBeingSaved,
          baseSnapshot: Object.assign({}, anchor.base),
          patch: Object.assign({}, changed.patch)
        });
        await withMutation(() => model.updateShot(shotId, changed.patch));
        const canonical = model.getState && model.getState();
        if (!canonical || canonical.projectId !== context.projectId || !canonical.shots.some((shot) => shot.id === shotId && shot.chapterId === context.sceneId)) {
          throw Object.assign(new Error("鏡頭更新尚未在目前專案確認；草稿仍保留。"), { code: "SHOT_PROMOTION_NOT_VISIBLE" });
        }
        state = canonical;
        anchor = { shotId, base: Object.assign({}, anchor.base, changed.patch) };
        rememberShotPlaceholderPromotedShot(context.contextKey, shotId, anchor.base);
      }
      appliedVersion = versionBeingSaved;
      currentVersion = shotPlaceholderDraftVersions.get(context.contextKey) || 0;
    }
    const finalDraft = shotPlaceholderDrafts.get(context.contextKey);
    const finalAssessment = shotPlaceholderAssessment(finalDraft);
    if (!preserveDraft && currentVersion === appliedVersion && finalAssessment.valid && finalAssessment.meaningful) {
      const emptyDraft = { title: "", visual: "", script: "", super: "", sound: "", move: "", tags: "", duration: "" };
      shotPlaceholderDrafts.set(context.contextKey, emptyDraft);
      shotPlaceholderDraftVersions.set(context.contextKey, 0);
      if (shotPlaceholderContextKey === context.contextKey) shotPlaceholderDraft = emptyDraft;
      const remembered = shotPlaceholderPromotedShots.get(context.contextKey);
      if (remembered && remembered.shotId === shotId) shotPlaceholderPromotedShots.delete(context.contextKey);
    } else {
      preserveDraft = true;
      if (finalAssessment.valid && !finalAssessment.meaningful) preserveEmptyDraft = true;
      if (preserveEmptyDraft) {
        const remembered = shotPlaceholderPromotedShots.get(context.contextKey);
        if (remembered && remembered.shotId === shotId) shotPlaceholderPromotedShots.delete(context.contextKey);
      } else rememberShotPlaceholderPromotedShot(context.contextKey, shotId, anchor.base);
    }
    return { preserveDraft, preserveEmptyDraft, assessment: finalAssessment, version: currentVersion };
  }
  async function finishShotPlaceholderPromotionRetry(result) {
    const pending = shotPlaceholderRetryContext;
    if (!pending || !pending.projectId || !pending.contextKey) return false;
    const shotId = pending.shotId || result;
    const canonical = model && model.getState && model.getState();
    if (!shotId || !canonical || canonical.projectId !== pending.projectId || !canonical.shots.some((shot) => shot.id === shotId && shot.chapterId === pending.sceneId)) return false;
    state = canonical;
    const retryBase = pending.kind === "create"
      ? pending.baseSnapshot
      : Object.assign({}, pending.baseSnapshot || shotPlaceholderEmptySnapshot(), pending.patch || {});
    rememberShotPlaceholderPromotedShot(pending.contextKey, shotId, retryBase);
    const reconciled = await reconcileShotPlaceholderDraft(pending, shotId, pending.appliedVersion);
    shotPlaceholderRetryContext = null;
    const sameDraftContext = shotPlaceholderContextKey === pending.contextKey && state.projectId === pending.projectId && shotPlaceholderSceneId() === pending.sceneId;
    if (sameDraftContext) {
      shotPlaceholderDraft = shotPlaceholderDrafts.get(pending.contextKey);
      shotPlaceholderMessage = reconciled.preserveDraft ? reconciled.assessment.error : "";
      selectedShotId = shotId;
      activeChapterId = pending.sceneId;
    } else shotPlaceholderMessage = "";
    renderAll();
    message(reconciled.preserveEmptyDraft
      ? "先前已輸入的鏡頭已保存；空白與 0 秒草稿不會清除該鏡頭。"
      : reconciled.preserveDraft ? "原鏡頭已保存；未完成輸入仍保留於尾端草稿。" : "原鏡頭保存重試成功；尾端草稿已清空。");
    return true;
  }
  async function promoteShotPlaceholder() {
    cancelShotPlaceholderAutoPromotion();
    if (shotPlaceholderPromotionPromise) return shotPlaceholderPromotionPromise;
    if (isReadOnly() || modelLifecycle().phase === "save_failed" || !state || !model || typeof model.addShot !== "function") return false;
    const sceneId = shotPlaceholderSceneId();
    const contextKey = ensureShotPlaceholderDraft(sceneId);
    const draft = shotPlaceholderDrafts.get(contextKey) || shotPlaceholderDraft;
    const assessment = shotPlaceholderAssessment(draft);
    const card = $("#shot-list [data-shot-placeholder]");
    if (!assessment.valid || !assessment.meaningful) { refreshShotPlaceholderControls(card); return false; }
    const active = document.activeElement;
    const activeField = active && active.closest ? active.closest("[data-shot-placeholder-field]") : null;
    const focusFieldName = activeField && card && card.contains(activeField) ? activeField.dataset.shotPlaceholderField : "";
    const projectId = state.projectId;
    const appliedVersion = shotPlaceholderDraftVersions.get(contextKey) || 0;
    const context = { projectId, sceneId, contextKey, appliedVersion };
    const rememberedAnchor = shotPlaceholderPromotedShots.get(contextKey);
    const contextPromotedShotId = rememberedAnchor && rememberedAnchor.shotId;
    const existingShotId = contextPromotedShotId && state.shots.some((shot) => shot.id === contextPromotedShotId && shot.chapterId === sceneId)
      ? contextPromotedShotId
      : null;
    const initialBase = shotPlaceholderEmptySnapshot();
    Object.assign(initialBase, assessment.patch);
    const anchor = existingShotId
      ? shotPlaceholderPromotedAnchor(contextKey, existingShotId, state)
      : null;
    if (existingShotId && !anchor) return false;
    const changed = existingShotId ? shotPlaceholderChangedPatch(anchor.base, draft) : { patch: assessment.patch };
    const retryBase = existingShotId ? anchor.base : initialBase;
    shotPlaceholderMessage = "正在保存新鏡頭…";
    shotPlaceholderRetryContext = Object.assign({}, context, {
      kind: existingShotId ? "update" : "create",
      shotId: existingShotId,
      baseSnapshot: Object.assign({}, retryBase),
      patch: Object.assign({}, changed.patch)
    });
    refreshShotPlaceholderControls(card);
    shotPlaceholderPromotionPromise = (async () => {
      const shotId = existingShotId
        ? Object.keys(changed.patch).length
          ? await withMutation(() => model.updateShot(existingShotId, changed.patch))
          : existingShotId
        : await withMutation(() => model.addShot(sceneId, assessment.patch));
      const canonical = model.getState && model.getState();
      if (!canonical || canonical.projectId !== projectId || !canonical.shots.some((shot) => shot.id === shotId && shot.chapterId === sceneId)) {
        throw Object.assign(new Error("新鏡頭保存尚未在目前專案確認；草稿仍保留。"), { code: "SHOT_PROMOTION_NOT_VISIBLE" });
      }
      state = canonical;
      rememberShotPlaceholderPromotedShot(contextKey, shotId, existingShotId
        ? Object.assign({}, anchor.base, changed.patch)
        : initialBase);
      const reconciled = await reconcileShotPlaceholderDraft(context, shotId, appliedVersion);
      shotPlaceholderRetryContext = null;
      const sameDraftContext = shotPlaceholderContextKey === contextKey && state.projectId === projectId && shotPlaceholderSceneId() === sceneId;
      if (sameDraftContext) {
        shotPlaceholderMessage = reconciled.preserveDraft ? reconciled.assessment.error : "";
        shotPlaceholderDraft = shotPlaceholderDrafts.get(contextKey);
        selectedShotId = shotId;
        activeChapterId = sceneId;
      } else shotPlaceholderMessage = "";
      const activeNow = document.activeElement;
      const currentPlaceholderField = activeNow && activeNow.closest ? activeNow.closest("[data-shot-placeholder-field]") : null;
      const currentPlaceholderCard = currentPlaceholderField && currentPlaceholderField.closest("[data-shot-placeholder]");
      if (sameDraftContext && !reconciled.preserveDraft && currentPlaceholderCard && currentPlaceholderCard.dataset.placeholderProjectId === projectId && currentPlaceholderCard.dataset.placeholderSceneId === sceneId) {
        shotPlaceholderFocusTransfer = {
          shotId,
          field: currentPlaceholderField.dataset.shotPlaceholderField || focusFieldName,
          start: typeof currentPlaceholderField.selectionStart === "number" ? currentPlaceholderField.selectionStart : null,
          end: typeof currentPlaceholderField.selectionEnd === "number" ? currentPlaceholderField.selectionEnd : null
        };
      }
      renderAll();
      shotPlaceholderFocusTransfer = null;
      message(reconciled.preserveEmptyDraft
        ? "先前已輸入的鏡頭已保存；空白與 0 秒草稿不會清除該鏡頭。"
        : reconciled.preserveDraft ? "鏡頭已保存；未完成輸入仍保留於尾端草稿。" : sameDraftContext ? "已保存新鏡頭；尾端保留下一張空白草稿。" : "新鏡頭已保存至原場次。");
      return true;
    })().catch((error) => {
      if (modelLifecycle().phase !== "save_failed") shotPlaceholderRetryContext = null;
      shotPlaceholderMessage = (error && error.code ? error.code + " · " : "") + (error && error.message || "新鏡頭保存失敗；輸入仍保留。");
      refreshShotPlaceholderControls($("#shot-list [data-shot-placeholder]"));
      return false;
    }).finally(() => {
      shotPlaceholderPromotionPromise = null;
      const placeholder = $("#shot-list [data-shot-placeholder]");
      refreshShotPlaceholderControls(placeholder);
      if (placeholder && !shotPlaceholderRetryContext) scheduleShotPlaceholderAutoPromotion();
    });
    refreshShotPlaceholderControls(card);
    return shotPlaceholderPromotionPromise;
  }
  function renderShotList() {
    const list = $("#shot-list");
    cancelReorderGesture("shots");
    const focused = document.activeElement;
    const focusedCard = focused && focused.closest ? focused.closest("#shot-list .shot-card") : null;
    const focusSnapshot = focusedCard ? {
      shotId: focusedCard.dataset.shot,
      placeholder: focusedCard.matches("[data-shot-placeholder]"),
      placeholderField: focused.dataset && focused.dataset.shotPlaceholderField || "",
      field: focused.dataset && focused.dataset.shotField || "",
      photoAction: focused.dataset && focused.dataset.shotPhotoAction || "",
      photoAssetId: focused.dataset && focused.dataset.assetId || "",
      photoManager: !!(focused.closest && focused.closest(".shot-photo-manager")),
      start: typeof focused.selectionStart === "number" ? focused.selectionStart : null,
      end: typeof focused.selectionEnd === "number" ? focused.selectionEnd : null
    } : null;
    const composingInList = Array.from(composingFields).some((field) => field && field.isConnected && field.closest("#shot-list"));
    if (searchComposing || composingInList) { pendingShotListRender = true; return; }
    pendingShotListRender = false;
    list.dataset.shotView = shotView;
    list.classList.toggle("is-list", shotView === "list");
    list.classList.toggle("is-gallery", shotView === "gallery");
    $(".shot-view-switch [data-shot-view='list']")?.classList.toggle("is-active", shotView === "list");
    $(".shot-view-switch [data-shot-view='gallery']")?.classList.toggle("is-active", shotView === "gallery");
    $(".shot-view-switch [data-shot-view='list']")?.setAttribute("aria-pressed", shotView === "list" ? "true" : "false");
    $(".shot-view-switch [data-shot-view='gallery']")?.setAttribute("aria-pressed", shotView === "gallery" ? "true" : "false");
    const scrollTop = list.scrollTop;
    const shots = activeShots();
    list.dataset.renderedProjectId = state.projectId;
    list.dataset.renderedChapterId = String(activeChapterId);
    list.dataset.renderedQuery = $("#chapter-search").value.trim();
    const chapter = state.chapters.find((item) => item.id === activeChapterId);
    const query = $("#chapter-search").value.trim();
    const placeholderMarkup = query ? "" : shotPlaceholderCardMarkup();
    $("#chapter-eyebrow").textContent = chapter ? "SCENE " + String(state.chapters.indexOf(chapter) + 1) : query ? "SCENE SEARCH" : "ALL SCENES";
    $("#storyboard-heading").textContent = chapter ? sceneTitle(chapter) : "全部分鏡";
    $("#storyboard-subtitle").textContent = chapter ? "保留場次節奏，鏡頭內容與拍攝安排共用。" : "以鏡頭為單位，整理畫面、節奏與聲音。";
    $("#visible-count").textContent = shots.length + " 個鏡頭";
    $("#shot-count").textContent = state.shots.length;
    const seconds = totalShotSeconds(shots); const unknown = shots.filter((shot) => Number(shot.duration) === 0).length;
    $("#runtime-label").textContent = "預估片長 " + formatDuration(seconds) + (unknown ? " · " + unknown + " 鏡未估" : "");
    if (!shots.length) {
      disconnectShotPhotoObservation(list);
      list.innerHTML = placeholderMarkup || '<div class="empty-state"><div class="empty-icon">' + icon("info", 16) + '</div><strong>沒有符合條件的鏡頭</strong><p>調整搜尋文字或切換場次，查看其他分鏡。</p><button class="small-action" data-action="clear-search">清除搜尋</button></div>';
      reconcileShotPhotoUrls(); reconcileShotDrawingUrls(); renderPhotoImportBanner(); updateReorderSelectionUi();
      applyReadonlyControls();
      if (focusSnapshot && focusSnapshot.placeholder && focusSnapshot.placeholderField) {
        const target = list.querySelector('[data-shot-placeholder-field="' + focusSnapshot.placeholderField + '"]');
        if (target) target.focus({ preventScroll: true });
      }
      return;
    }
    disconnectShotPhotoObservation(list);
    list.innerHTML = shots.map((shot) => {
      const index = state.shots.indexOf(shot);
      const titleDraft = fieldDrafts.get(draftKey(shot.id, "title"));
      const visualDraft = fieldDrafts.get(draftKey(shot.id, "visual"));
      const scriptDraft = fieldDrafts.get(draftKey(shot.id, "script"));
      const superDraft = fieldDrafts.get(draftKey(shot.id, "super"));
      const durationDraft = fieldDrafts.get(draftKey(shot.id, "duration"));
      const titleValue = titleDraft ? titleDraft.value : shot.title || "";
      const visualValue = visualDraft ? visualDraft.value : shot.visual || "";
      const scriptValue = String(scriptDraft ? scriptDraft.value : shot.script || "");
      const superValue = String(superDraft ? superDraft.value : shot.super || "");
      const durationValue = durationDraft ? durationDraft.value : Number(shot.duration) === 0 || shot.duration == null ? "" : String(shot.duration);
      const modeClass = shotView === "gallery" ? "is-gallery" : "is-list";
      const durationIsUnknown = durationDraft ? String(durationDraft.value).trim() !== "" && Number(durationDraft.value) === 0 : Number(shot.duration) === 0;
      const artwork = shotArtworkSource(shot);
      const primaryAssetId = artwork.type === "photo" ? artwork.id : null;
      const photoDataAttrs = primaryAssetId ? ' data-photo-project="' + escapeHtml(state.projectId) + '" data-photo-asset-id="' + escapeHtml(primaryAssetId) + '"' : '';
      const drawingDataAttrs = artwork.type === "drawing" ? ' data-drawing-project="' + escapeHtml(state.projectId) + '" data-drawing-shot="' + escapeHtml(shot.id) + '" data-drawing-id="' + escapeHtml(artwork.id) + '"' : '';
      return '<article class="shot-card ' + modeClass + ' ' + (selectedShotId === shot.id ? "is-selected" : "") + ' ' + (shotReorderSelection.has(shot.id) && (shotMultiSelectMode || shotReorderSelection.size > 1) ? "is-reorder-selected" : "") + '" data-shot="' + escapeHtml(shot.id) + '"' + photoDataAttrs + drawingDataAttrs + ' tabindex="0" aria-label="' + escapeHtml(shotNumberWithTitle(shot)) + '">' +
        renderShotPhotoMarkup(shot, index, artwork) + renderShotPhotoActions(shot) +
        '<div class="shot-number">' + shotCardNumberMarkup(shot) + '</div>' +
        '<div class="field-group shot-inline-field shot-title-field"><label class="field-label" for="shot-title-' + escapeHtml(shot.id) + '">鏡頭標題</label><input id="shot-title-' + escapeHtml(shot.id) + '" class="shot-inline-title" type="text" data-shot-field="title" data-entity-id="' + escapeHtml(shot.id) + '" aria-label="' + escapeHtml(shotNumber(shot) + "鏡頭標題") + '" value="' + escapeHtml(titleValue) + '" placeholder="輸入鏡頭標題" autocomplete="off"></div>' +
        '<div class="field-group shot-inline-field shot-visual-field"><label class="field-label" for="shot-visual-' + escapeHtml(shot.id) + '">畫面描述</label><textarea id="shot-visual-' + escapeHtml(shot.id) + '" class="shot-inline-visual" data-shot-field="visual" data-entity-id="' + escapeHtml(shot.id) + '" aria-label="' + escapeHtml(shotNumber(shot) + "畫面描述") + '" rows="2" placeholder="描述畫面、人物動作與視覺重點…">' + escapeHtml(visualValue) + '</textarea></div>' +
        '<div class="shot-card-text-preview shot-card-script-preview" data-shot-preview="script" title="' + escapeHtml(scriptValue) + '"><label class="shot-preview-label" for="shot-script-' + escapeHtml(shot.id) + '"><strong>VO</strong><span>台詞／旁白</span></label><textarea id="shot-script-' + escapeHtml(shot.id) + '" class="shot-preview-text shot-inline-script" data-shot-field="script" data-entity-id="' + escapeHtml(shot.id) + '" aria-label="' + escapeHtml(shotNumber(shot) + "台詞／旁白") + '" rows="2" placeholder="輸入台詞或旁白…">' + escapeHtml(scriptValue) + '</textarea></div>' +
        '<div class="shot-card-text-preview shot-card-super-preview" data-shot-preview="super" title="' + escapeHtml(superValue) + '"><label class="shot-preview-label" for="shot-super-' + escapeHtml(shot.id) + '"><strong>SUPER</strong><span>字卡</span></label><textarea id="shot-super-' + escapeHtml(shot.id) + '" class="shot-preview-text shot-inline-super" data-shot-field="super" data-entity-id="' + escapeHtml(shot.id) + '" aria-label="' + escapeHtml(shotNumber(shot) + "字卡 SUPER") + '" rows="2" placeholder="輸入畫面字卡…">' + escapeHtml(superValue) + '</textarea></div>' +
        '<div class="field-group shot-inline-field shot-duration-field"><label class="field-label" for="shot-duration-' + escapeHtml(shot.id) + '">影片秒數</label><div class="shot-duration-control"><input id="shot-duration-' + escapeHtml(shot.id) + '" class="shot-inline-duration" type="text" inputmode="decimal" data-shot-field="duration" data-entity-id="' + escapeHtml(shot.id) + '" aria-label="' + escapeHtml(shotNumber(shot) + "影片秒數") + '" value="' + escapeHtml(durationValue) + '" placeholder="0" autocomplete="off"><span class="shot-duration-unit">秒</span></div><span class="shot-duration-estimate"' + (durationIsUnknown ? "" : " hidden") + '>未估</span></div>' +
        '</article>';
    }).join("") + placeholderMarkup;
    list.scrollTop = scrollTop;
    syncVisibleShotDrawings(); syncVisibleShotPhotos(); renderPhotoImportBanner();
    const visualFields = [];
    list.querySelectorAll("[data-shot-field]").forEach((field) => {
      const draft = fieldDraftFor(field);
      if (draft) renderDraftError(field, draft);
      if (field.matches(".shot-inline-visual")) visualFields.push(field);
    });
    if (shotView === "gallery") resizeShotVisualBatch(visualFields);
    applyReadonlyControls(); updateReorderSelectionUi();
    if (focusSnapshot || shotPlaceholderFocusTransfer) {
      const focusTransfer = shotPlaceholderFocusTransfer && (!focusSnapshot || focusSnapshot.placeholder) ? shotPlaceholderFocusTransfer : null;
      const card = focusTransfer
        ? $$("#shot-list .shot-card[data-shot]").find((item) => item.dataset.shot === focusTransfer.shotId)
        : focusSnapshot.placeholder
          ? $("#shot-list [data-shot-placeholder]")
          : $$("#shot-list .shot-card[data-shot]").find((item) => item.dataset.shot === focusSnapshot.shotId);
      let target = null;
      if (focusTransfer && card) target = card.querySelector('[data-shot-field="' + focusTransfer.field + '"]');
      else if (card && focusSnapshot.placeholderField) target = card.querySelector('[data-shot-placeholder-field="' + focusSnapshot.placeholderField + '"]');
      else if (card && focusSnapshot.field) target = card.querySelector('[data-shot-field="' + focusSnapshot.field + '"]');
      else if (card && focusSnapshot.photoAction && focusSnapshot.photoAssetId) {
        target = Array.from(card.querySelectorAll("[data-shot-photo-action][data-asset-id]")).find((item) => item.dataset.shotPhotoAction === focusSnapshot.photoAction && item.dataset.assetId === focusSnapshot.photoAssetId) || null;
      }
      if (!target && card && focusSnapshot && focusSnapshot.photoManager) target = card.querySelector(".shot-photo-manager summary");
      if (!target && card && focusSnapshot && !focusSnapshot.placeholder) target = card;
      if (target) {
        target.focus({preventScroll:true});
        const start = focusTransfer ? focusTransfer.start : focusSnapshot && focusSnapshot.start;
        const end = focusTransfer ? focusTransfer.end : focusSnapshot && focusSnapshot.end;
        if (start != null && typeof target.setSelectionRange === "function") {
          try { target.setSelectionRange(start, end); } catch (_) {}
        }
      }
    }
  }

  function renderInspector() {
    const shot = byId(selectedShotId);
    const container = $("#inspector");
    if (!shot) { container.dataset.shotId = ""; container.innerHTML = '<div class="empty-state"><div class="empty-icon">' + icon("info", 16) + '</div><strong>尚未選取鏡頭</strong><p>從分鏡清單選擇一個鏡頭，即可在這裡編輯。</p></div>'; applyReadonlyControls(); return; }
    const shotIndex = state.shots.indexOf(shot); const group = inChapter(shot.chapterId); const groupIndex = group.findIndex((item) => item.id === shot.id); const linked = state.entries.filter((entry) => entry.type === "shot" && entry.shotId === shot.id);
    if (container.dataset.shotId === shot.id && container.querySelector("[data-shot-field]")) {
      const valueOf = (key) => shot[key] == null || (key === "duration" && Number(shot[key]) === 0) ? "" : String(shot[key]);
      container.querySelector(".inspector-number").innerHTML = shotLabel(shot) + ' <span style="color:#a8adb2;font-weight:400">· ' + (shotIndex + 1) + ' / ' + state.shots.length + '</span>';
      syncShotNumberManagement(shot, container);
      ["title","visual","script","super","sound","move","duration","tags","art","chapterId"].forEach((key) => {
        const field = container.querySelector('[data-shot-field="' + key + '"]'); if (!field) return;
        const draft = fieldDrafts.get(draftKey(shot.id, key));
        if (document.activeElement !== field && !draft) field.value = valueOf(key);
        if (draft) renderDraftError(field, draft);
      });
      const chapter = container.querySelector('[data-shot-field="chapterId"]');
      if (chapter && document.activeElement !== chapter) {
        const options = state.chapters.map((item) => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(sceneTitle(item)) + '</option>').join("");
        if (chapter.dataset.optionsRevision !== String(state.chapters.length) || chapter.options.length !== state.chapters.length) { chapter.innerHTML = options; chapter.dataset.optionsRevision = String(state.chapters.length); }
        chapter.value = shot.chapterId;
      }
      const linkedText = container.querySelector(".inspector-foot > span"); if (linkedText) linkedText.textContent = linked.length + " 筆拍攝安排引用此鏡頭";
      const moves = container.querySelectorAll("[data-action='move-up'],[data-action='move-down']");
      moves.forEach((button) => { button.disabled = !canMoveReorderSelection("shots", shot.chapterId, shot.id, button.dataset.action === "move-up" ? -1 : 1); });
      applyReadonlyControls(true);
      return;
    }
    const chapterOptions = state.chapters.map((chapter) => '<option value="' + escapeHtml(chapter.id) + '" ' + (chapter.id === shot.chapterId ? "selected" : "") + '>' + escapeHtml(sceneTitle(chapter)) + '</option>').join("");
    const arts = [["pool","泳池遠景"],["water","水下光影"],["swimmer","泳者動作"],["architecture","空間細節"],["sunset","黃昏光線"]].map(([key,label]) => '<option value="' + key + '" ' + (shot.art === key ? "selected" : "") + '>' + label + '</option>').join("");
    container.innerHTML = '<div class="inspector-top"><p class="inspector-title">鏡頭細節</p><div class="inspector-actions"><button class="micro-icon-button" data-action="duplicate" title="複製鏡頭" aria-label="複製鏡頭">' + icon("copy") + '</button><button class="micro-icon-button danger" data-action="delete" title="刪除鏡頭" aria-label="刪除鏡頭">' + icon("trash") + '</button></div></div><div class="inspector-number">' + shotLabel(shot) + ' <span style="color:#a8adb2;font-weight:400">· ' + (shotIndex + 1) + ' / ' + state.shots.length + '</span></div><input class="inspector-shot-title" data-shot-field="title" aria-label="鏡頭標題" value="' + escapeHtml(shot.title) + '" placeholder="鏡頭標題"><div class="field-group"><label class="field-label" for="shot-visual">畫面描述</label><textarea id="shot-visual" class="textarea-field" data-shot-field="visual" placeholder="描述畫面、人物動作與視覺重點…">' + escapeHtml(shot.visual) + '</textarea></div><div class="field-group"><label class="field-label" for="shot-script">台詞／旁白</label><textarea id="shot-script" class="textarea-field tall" data-shot-field="script" placeholder="需要的台詞或旁白…">' + escapeHtml(shot.script) + '</textarea></div><div class="field-group super-field-group"><label class="field-label" for="shot-super">字卡（SUPER）</label><textarea id="shot-super" class="textarea-field" data-shot-field="super" placeholder="畫面上出現的字卡文字…">' + escapeHtml(shot.super || "") + '</textarea><span class="field-note">原文保存，換行與大小寫會保留。</span></div><div class="inspector-section-title">聲音與拍攝</div><div class="field-group"><label class="field-label" for="shot-sound">聲音設計</label><textarea id="shot-sound" class="textarea-field" data-shot-field="sound" placeholder="環境音、音樂或轉場…">' + escapeHtml(shot.sound) + '</textarea></div><div class="field-row"><div class="field-group"><label class="field-label" for="shot-move">景別／運鏡</label><input id="shot-move" class="text-field" data-shot-field="move" value="' + escapeHtml(shot.move) + '" placeholder="例如：中景・推近"></div><div class="field-group"><label class="field-label" for="shot-duration">影片秒數</label><div class="duration-input-wrap"><input id="shot-duration" class="number-field" type="number" min="0" step="0.1" inputmode="decimal" data-shot-field="duration" value="' + escapeHtml(shot.duration) + '"><span class="input-suffix">秒</span></div></div></div><span class="field-note">0 秒保留為「未估」；不會自動補入預設秒數。</span><div class="field-group" style="margin-top:14px"><label class="field-label" for="shot-tags">標籤</label><input id="shot-tags" class="text-field" data-shot-field="tags" value="' + escapeHtml(shot.tags) + '" placeholder="以頓號分隔，例如：人物、黃昏"></div><div class="field-row"><div class="field-group"><label class="field-label" for="shot-art">分鏡示意</label><select id="shot-art" class="select-control" data-shot-field="art">' + arts + '</select></div><div class="field-group"><label class="field-label" for="shot-chapter">所在場次</label><select id="shot-chapter" class="select-control" data-shot-field="chapterId">' + chapterOptions + '</select></div></div><div class="inspector-foot"><span>' + linked.length + ' 筆拍攝安排引用此鏡頭</span><div class="move-controls"><button class="small-action" data-action="move-up" ' + (groupIndex <= 0 ? "disabled" : "") + '>上移</button><button class="small-action" data-action="move-down" ' + (groupIndex >= group.length - 1 ? "disabled" : "") + '>下移</button></div></div>';
    container.dataset.shotId = shot.id;
    syncShotNumberManagement(shot, container);
    container.querySelectorAll("[data-action='move-up'],[data-action='move-down']").forEach((button) => { button.disabled = !canMoveReorderSelection("shots", shot.chapterId, shot.id, button.dataset.action === "move-up" ? -1 : 1); });
    container.querySelectorAll("[data-shot-field]").forEach((field) => {
      field.dataset.entityId = shot.id;
      const draft = fieldDrafts.get(draftKey(shot.id, field.dataset.shotField));
      if (draft) { field.value = draft.value; renderDraftError(field, draft); }
    });
    applyReadonlyControls();
  }

  function syncShotFieldCounterparts(shotId, fieldName) {
    if (!state || !["title", "visual", "script", "super", "duration"].includes(fieldName)) return false;
    const key = draftKey(shotId, fieldName);
    if (fieldDrafts.has(key)) return false;
    const shot = state.shots.find((item) => item.id === shotId);
    if (!shot || !Object.prototype.hasOwnProperty.call(shot, fieldName)) return false;
    const value = shot[fieldName] == null || (fieldName === "duration" && Number(shot[fieldName]) === 0) ? "" : String(shot[fieldName]);
    let updated = false;
    $$('[data-shot-field="' + fieldName + '"]').forEach((field) => {
      if (field.dataset.entityId !== shotId || !field.isConnected || document.activeElement === field || composingFields.has(field) || fieldDraftFor(field)) return;
      if (field.value !== value) field.value = value;
      if (shotView === "gallery" && fieldName === "visual" && field.matches("#shot-list .shot-inline-visual")) resizeShotVisual(field, false);
      if (fieldName === "duration" && field.matches("#shot-list .shot-inline-duration")) {
        const estimate = field.closest(".shot-duration-field")?.querySelector(".shot-duration-estimate");
        if (estimate) estimate.hidden = Number(shot.duration) !== 0;
      }
      clearFieldError(field);
      updated = true;
    });
    if (fieldName === "script" || fieldName === "super") {
      const card = $$('#shot-list .shot-card').find((item) => item.dataset.shot === shotId);
      const preview = card && card.querySelector('[data-shot-preview="' + fieldName + '"]');
      if (preview) {
        const text = String(shot[fieldName] == null ? "" : shot[fieldName]);
        preview.title = text;
      }
      updated = !!preview || updated;
    }
    return updated;
  }

  function setShotView(nextView) {
    if (nextView !== "list" && nextView !== "gallery") return;
    if (Array.from(composingFields).some((field) => field && field.isConnected && field.closest("#shot-list"))) {
      pendingShotView = nextView;
      return;
    }
    pendingShotView = null;
    shotView = nextView;
    const list = $("#shot-list");
    list.dataset.shotView = shotView;
    list.classList.toggle("is-list", shotView === "list");
    list.classList.toggle("is-gallery", shotView === "gallery");
    $$("#shot-list .shot-card").forEach((card) => {
      card.classList.toggle("is-list", shotView === "list");
      card.classList.toggle("is-gallery", shotView === "gallery");
    });
    $$(".shot-view-switch [data-shot-view]").forEach((button) => {
      const active = button.dataset.shotView === shotView;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function flushPendingShotListWork() {
    if (pendingShotView) setShotView(pendingShotView);
    if (!pendingShotListRender || searchComposing || Array.from(composingFields).some((field) => field && field.isConnected && field.closest("#shot-list"))) return;
    renderChapters();
    renderShotList();
  }

  function renderVoiceover() {
    const host = $("#voiceover-transcript");
    if (!host || !state) return;
    const draftShotCount = state.shots.filter((shot) => fieldDrafts.has(draftKey(shot.id, "script"))).length;
    const summary = $("#voiceover-summary");
    if (summary) summary.textContent = state.shots.length + " 鏡 · 依場次與鏡次排列 · 唯讀整理" + (draftShotCount ? " · 顯示中包含 " + draftShotCount + " 鏡未保存草稿" : "");
    if (!state.shots.length) {
      host.innerHTML = '<div class="voiceover-empty"><strong>目前沒有分鏡</strong><p>新增鏡頭後，台詞／旁白會依場次和鏡次出現在這裡。</p></div>';
      return;
    }
    host.innerHTML = state.chapters.map((chapter, chapterIndex) => {
      const shots = state.shots.filter((shot) => shot.chapterId === chapter.id);
      if (!shots.length) return "";
      const chapterHeading = '<header class="voiceover-chapter-heading"><span>' + escapeHtml("場次 " + (chapterIndex + 1)) + '</span><h3>' + escapeHtml(chapter.title || "未命名場次") + '</h3></header>';
      const entries = shots.map((shot) => {
        const draft = fieldDrafts.get(draftKey(shot.id, "script"));
        const raw = draft ? draft.value : shot.script;
        const value = String(raw == null ? "" : raw);
        const draftMark = draft ? '<span class="voiceover-draft-mark">未保存草稿</span>' : "";
        const title = shotHasTitle(shot) ? '<strong>' + escapeHtml(shotTitleText(shot)) + '</strong>' : '';
        return '<article class="voiceover-entry"><header><span class="voiceover-shot-number">鏡次 ' + escapeHtml(shotSequence(shot)) + '</span>' + title + draftMark + '</header><p class="voiceover-entry-text">' + escapeHtml(value || "尚未填寫") + '</p></article>';
      }).join("");
      return '<section class="voiceover-chapter">' + chapterHeading + '<div class="voiceover-chapter-entries">' + entries + '</div></section>';
    }).join("");
  }
  function renderStoryboard() { renderChapters(); renderShotList(); renderInspector(); }
  function renderStoryboardSearchInPlace() {
    const list = $("#shot-list");
    if (!list || !state || !state.shots.length || list.dataset.renderedProjectId !== state.projectId || list.dataset.renderedChapterId !== String(activeChapterId)) return false;
    const baseShots = activeChapterId === "all" ? state.shots : state.shots.filter((shot) => shot.chapterId === activeChapterId);
    const cards = $$(".shot-card", list);
    if (cards.length !== baseShots.length) return false;
    const cardsById = new Map(cards.map((card) => [card.dataset.shot, card]));
    if (baseShots.some((shot) => !cardsById.has(shot.id))) return false;

    const query = $("#chapter-search").value.trim();
    const matchedSceneIds = matchedSceneIdsForSearch(query);
    const visibleShots = baseShots.filter((shot) => shotMatchesSearch(shot, query, matchedSceneIds));
    const visibleIds = new Set(visibleShots.map((shot) => shot.id));
    const focusedCard = document.activeElement && document.activeElement.closest ? document.activeElement.closest("#shot-list .shot-card") : null;
    cards.forEach((card) => { card.hidden = !visibleIds.has(card.dataset.shot); });
    if (focusedCard && !visibleIds.has(focusedCard.dataset.shot)) $("#chapter-search").focus({ preventScroll: true });
    list.dataset.renderedQuery = query;

    let empty = list.querySelector(".search-empty-state");
    if (!visibleShots.length) {
      if (!empty) {
        empty = document.createElement("div");
        empty.className = "empty-state search-empty-state";
        empty.innerHTML = '<div class="empty-icon">' + icon("info", 16) + '</div><strong>沒有符合條件的鏡頭</strong><p>調整搜尋文字或切換場次，查看其他分鏡。</p><button class="small-action" data-action="clear-search">清除搜尋</button>';
        list.appendChild(empty);
      }
    } else if (empty) empty.remove();

    const chapter = state.chapters.find((item) => item.id === activeChapterId);
    $("#chapter-eyebrow").textContent = chapter ? "SCENE " + String(state.chapters.indexOf(chapter) + 1) : query ? "SCENE SEARCH" : "ALL SCENES";
    $("#storyboard-heading").textContent = chapter ? sceneTitle(chapter) : "全部分鏡";
    $("#storyboard-subtitle").textContent = chapter ? "保留場次節奏，鏡頭內容與拍攝安排共用。" : "以鏡頭為單位，整理畫面、節奏與聲音。";
    $("#visible-count").textContent = visibleShots.length + " 個鏡頭";
    $("#shot-count").textContent = state.shots.length;
    const seconds = totalShotSeconds(visibleShots);
    const unknown = visibleShots.filter((shot) => Number(shot.duration) === 0).length;
    $("#runtime-label").textContent = "預估片長 " + formatDuration(seconds) + (unknown ? " · " + unknown + " 鏡未估" : "");

    renderChapters();
    renderInspector();
    syncVisibleShotDrawings();
    syncVisibleShotPhotos();
    renderPhotoImportBanner();
    updateReorderSelectionUi();
    applyReadonlyControls();
    return true;
  }
  function selectShot(id, refreshInspectorWhenUnchanged) {
    const changed = selectedShotId !== id;
    selectedShotId = id;
    if (changed) {
      $$("#shot-list .shot-card").forEach((card) => card.classList.toggle("is-selected", card.dataset.shot === id));
    }
    if (changed || refreshInspectorWhenUnchanged) renderInspector();
    updateReorderSelectionUi();
  }
  function selectEntry(id) {
    selectedEntryId = id;
    $$("#schedule-list .schedule-entry").forEach((row) => row.classList.toggle("is-selected", row.dataset.entry === id));
    renderScheduleInspector(activeDay(), activeEntries());
    updateReorderSelectionUi();
  }
  function dateParts(dateText) { const [year,month,day] = String(dateText || "").split("-").map(Number); return {year,month,day}; }
  function formatDate(dateText, withWeekday) {
    if (!dateText) return "未設定日期";
    const {year,month,day} = dateParts(dateText); const date = new Date(Date.UTC(year, month - 1, day));
    const weekday = ["日","一","二","三","四","五","六"][date.getUTCDay()];
    return year + " 年 " + month + " 月 " + day + " 日" + (withWeekday ? "・週" + weekday : "");
  }
  function addDateDays(dateText, offset) { const d = new Date(dateText + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0,10); }
  function minuteOfDay(timeText) { const [h,m] = String(timeText || "00:00").split(":").map(Number); return h * 60 + m; }
  function clockAt(day, offset) {
    const start = minuteOfDay(day.start); const total = start + offset; const dayShift = Math.floor(total / 1440); const mins = ((total % 1440) + 1440) % 1440;
    const date = addDateDays(day.date, dayShift); const hh = String(Math.floor(mins / 60)).padStart(2,"0"), mm = String(mins % 60).padStart(2,"0");
    return {time:hh + ":" + mm, date:date, dayShift:dayShift, label:hh + ":" + mm + (dayShift === 1 ? " · 翌日 " + date : dayShift > 1 ? " · +" + dayShift + " 日 " + date : "")};
  }
  function scheduleOrderWarning(slot) {
    if (!slot) return "";
    if (slot.orderWarning === "before_day_start") return "指定時間早於拍攝日開始";
    if (slot.orderWarning === "before_previous_schedule") return "指定時間早於前項排程，請確認日期／順序";
    return "";
  }
  function scheduleGapNotice(slot, formatOffset) {
    if (!slot || Number(slot.gapMinutes) <= 0) return "";
    const intervals = Array.isArray(slot.gapIntervals) && slot.gapIntervals.length
      ? slot.gapIntervals
      : [{ startOffset: Number(slot.startOffset) - Number(slot.gapMinutes), endOffset: Number(slot.startOffset) }];
    const labels = intervals.map((interval) => formatOffset(interval.startOffset) + "–" + formatOffset(interval.endOffset));
    return labels.join("、") + " · 空檔 " + Number(slot.gapMinutes) + " 分鐘";
  }
  function dayEstimate(entries) { let total = 0, unknown = 0; entries.forEach((entry) => { const value = Number(entry.minutes) || 0; total += value; if (!value && entry.type === "shot") unknown += 1; }); return {total,unknown}; }
  function estimatedWrapForDay(day, entries) {
    if (!day || !entries || !entries.length || !model || typeof model.getTimeline !== "function") return "";
    const timeline = model.getTimeline(day.id) || [];
    if (timeline.length !== entries.length || timeline.some((slot) => slot.unknown || !Number.isFinite(Number(slot.endOffset)))) return "";
    const latestEnd = Math.max(...timeline.map((slot) => Number(slot.endOffset)));
    return clockAt(day, latestEnd).label;
  }
  function daySummaryEstimateMarkup(day, entries, estimates) {
    const wrap = estimatedWrapForDay(day, entries);
    return '<div class="day-summary-total"><div><strong>' + (estimates.total ? estimates.total + " 分" : "未估") + '</strong><span>預估拍攝時間' + (estimates.unknown ? " · " + estimates.unknown + " 鏡未估" : "") + '</span></div>' + (wrap ? '<span class="derived-wrap">依排程預估收工 ' + escapeHtml(wrap) + '</span>' : '') + '</div>';
  }
  function timingModeHelp(entry) {
    return entry && entry.timingMode === "fixed"
      ? "目前採指定起訖；關閉後會依拍攝分鐘自動順延，已指定的時間會保留。若開始或結束在翌日，請明確勾選對應選項。"
      : "目前依拍攝分鐘自動順延；啟用指定起訖後，後續時段會依此重新計算。未估時鏡頭的後續自動時段會暫待估。";
  }
  function timingModePatch(nextMode, values) {
    return {
      timingMode: nextMode,
      startTime: values.startTime || null,
      endTime: values.endTime || null,
      startNextDay: !!values.startNextDay,
      endNextDay: !!values.endNextDay
    };
  }
  function timingValuesForEntry(day, entry) {
    const hasSavedTimes = !!(entry.startTime && entry.endTime);
    const timeline = model.getTimeline(day.id) || [];
    const slot = timeline.find((item) => item.entryId === entry.id);
    const slotStart = slot && !slot.unknown ? clockAt(day, slot.startOffset) : null;
    const slotEnd = slot && !slot.unknown ? clockAt(day, slot.endOffset) : null;
    const startTime = hasSavedTimes
      ? entry.startTime
      : slotStart ? slotStart.time : day.start;
    const endTime = hasSavedTimes
      ? entry.endTime
      : slot && !slot.unknown && slot.minutes > 0
        ? slotEnd.time
        : clockAt(day, minuteOfDay(startTime) - minuteOfDay(day.start) + 30).time;
    return {
      startTime,
      endTime,
      startNextDay: hasSavedTimes ? entry.startNextDay === true : !!(slotStart && slotStart.dayShift > 0),
      endNextDay: hasSavedTimes ? !!entry.endNextDay : !!(slotStart && slotEnd && slotEnd.dayShift > slotStart.dayShift)
    };
  }
  function callsheetValue(day, fieldName) {
    const path = parseCallsheetFieldPath(fieldName);
    if (path) {
      const row = (Array.isArray(day[path.collection]) ? day[path.collection] : []).find((item) => item.id === path.rowId);
      return row && row[path.field] != null ? row[path.field] : path.field === "onCall" ? false : "";
    }
    return day[fieldName] == null ? "" : day[fieldName];
  }
  function callsheetRowField(collection, row, field, label, options) {
    const opts = options || {};
    const path = callsheetFieldPath(collection, row.id, field);
    const common = 'class="text-field callsheet-row-field" data-day-field="' + escapeHtml(path) + '" data-entity-id="' + escapeHtml(row.dayId || "") + '" aria-label="' + escapeHtml(label) + '"';
    if (opts.checkbox) return '<label class="callsheet-on-call"><input type="checkbox" ' + common + (row[field] ? ' checked' : '') + '>通告顯示</label>';
    if (opts.textarea) return '<textarea ' + common + ' rows="2" maxlength="1000" placeholder="' + escapeHtml(opts.placeholder || "") + '">' + escapeHtml(row[field] || "") + '</textarea>';
    return '<input ' + common + ' type="' + escapeHtml(opts.type || "text") + '"' + (opts.inputmode ? ' inputmode="' + escapeHtml(opts.inputmode) + '"' : '') + ' maxlength="' + escapeHtml(opts.maxlength || 200) + '" value="' + escapeHtml(row[field] || "") + '" placeholder="' + escapeHtml(opts.placeholder || "") + '">';
  }
  function renderCallsheetRows(day, collection) {
    const rows = Array.isArray(day[collection]) ? day[collection] : [];
    return rows.map((source, index) => {
      const row = Object.assign({ id:"", dayId:day.id }, source);
      const rowAttrs = 'data-call-row="' + escapeHtml(collection) + '" data-call-row-id="' + escapeHtml(row.id) + '"';
      if (collection === "contacts") return '<div class="day-callsheet-row contact-row" ' + rowAttrs + '>' +
        '<div class="field-group"><label class="field-label">職位</label>' + callsheetRowField(collection,row,"position","聯絡人職位",{maxlength:80,placeholder:"職位"}) + '</div>' +
        '<div class="field-group"><label class="field-label">姓名</label>' + callsheetRowField(collection,row,"name","聯絡人姓名",{maxlength:100,placeholder:"姓名"}) + '</div>' +
        '<div class="field-group"><label class="field-label">電話</label>' + callsheetRowField(collection,row,"phone","聯絡人電話",{maxlength:50,inputmode:"tel",placeholder:"電話"}) + '</div>' +
        '<div class="callsheet-row-actions">' + callsheetRowField(collection,row,"onCall","通告顯示",{checkbox:true}) + '<button type="button" class="micro-icon-button callsheet-delete" data-callsheet-action="remove" data-callsheet-collection="contacts" data-callsheet-row-id="' + escapeHtml(row.id) + '" aria-label="刪除聯絡人">刪除</button></div></div>';
      if (collection === "groupCalls") return '<div class="day-callsheet-row group-call-row" ' + rowAttrs + '>' +
        '<div class="field-group"><label class="field-label">組別</label>' + callsheetRowField(collection,row,"group","大組別",{maxlength:100,placeholder:"攝影組、燈光組…"}) + '</div>' +
        '<div class="field-group"><label class="field-label">集合地點</label>' + callsheetRowField(collection,row,"location","大組集合地點",{maxlength:200,placeholder:"集合地點"}) + '</div>' +
        '<div class="field-group"><label class="field-label">時間</label>' + callsheetRowField(collection,row,"time","大組集合時間",{type:"time",maxlength:5}) + '</div>' +
        '<div class="callsheet-row-actions"><button type="button" class="micro-icon-button" data-callsheet-action="up" data-callsheet-collection="groupCalls" data-callsheet-row-id="' + escapeHtml(row.id) + '" aria-label="大組通告上移"' + (index === 0 ? ' disabled' : '') + '>↑</button><button type="button" class="micro-icon-button" data-callsheet-action="down" data-callsheet-collection="groupCalls" data-callsheet-row-id="' + escapeHtml(row.id) + '" aria-label="大組通告下移"' + (index === rows.length - 1 ? ' disabled' : '') + '>↓</button><button type="button" class="micro-icon-button callsheet-delete" data-callsheet-action="remove" data-callsheet-collection="groupCalls" data-callsheet-row-id="' + escapeHtml(row.id) + '" aria-label="刪除大組通告">刪除</button></div></div>';
      if (collection === "vehicles") return '<div class="day-callsheet-row vehicle-row" ' + rowAttrs + '>' +
        '<div class="field-group"><label class="field-label">車輛</label>' + callsheetRowField(collection,row,"label","車輛名稱",{maxlength:100,placeholder:"車輛／用途"}) + '</div>' +
        '<div class="field-group"><label class="field-label">車牌</label>' + callsheetRowField(collection,row,"plate","車牌號碼",{maxlength:30,placeholder:"車牌"}) + '</div>' +
        '<div class="field-group"><label class="field-label">駕駛人</label>' + callsheetRowField(collection,row,"driver","駕駛人",{maxlength:100,placeholder:"姓名"}) + '</div>' +
        '<div class="field-group"><label class="field-label">駕駛人電話</label>' + callsheetRowField(collection,row,"driverPhone","駕駛人電話",{maxlength:50,inputmode:"tel",placeholder:"電話"}) + '</div>' +
        '<div class="field-group vehicle-passengers"><label class="field-label">乘客名單</label>' + callsheetRowField(collection,row,"passengers","車輛乘客名單",{textarea:true,placeholder:"每行一位乘客"}) + '</div>' +
        '<div class="callsheet-row-actions"><button type="button" class="micro-icon-button callsheet-delete" data-callsheet-action="remove" data-callsheet-collection="vehicles" data-callsheet-row-id="' + escapeHtml(row.id) + '" aria-label="刪除車輛">刪除</button></div></div>';
      return '<div class="day-callsheet-row notice-row" ' + rowAttrs + '><div class="field-group"><label class="field-label">注意事項</label>' + callsheetRowField(collection,row,"text","注意事項",{textarea:true,placeholder:"輸入注意事項"}) + '</div><button type="button" class="micro-icon-button callsheet-delete" data-callsheet-action="remove" data-callsheet-collection="notices" data-callsheet-row-id="' + escapeHtml(row.id) + '" aria-label="刪除注意事項">刪除</button></div>';
    }).join("");
  }
  function renderDayCallsheetFields(day) {
    const host = $("#day-callsheet-fields");
    if (!host) return;
    if (!day) { host.hidden = true; host.dataset.dayId = ""; host.replaceChildren(); return; }
    host.hidden = false;
    const reuse = host.dataset.dayId === day.id && !!host.querySelector("[data-day-field='location']");
    if (!reuse) {
      host.dataset.dayId = day.id;
      host.innerHTML = '<header class="day-callsheet-heading"><div><h3 id="day-callsheet-title">通告資料</h3><p>通告資料只保存於此拍攝日；預計收工與依排程推算的時間分開顯示。</p></div></header>' +
        '<div class="day-callsheet-grid">' +
        '<div class="field-group"><label class="field-label" for="day-location">主要拍攝地點</label><input class="text-field" id="day-location" type="text" maxlength="200" data-day-field="location" aria-label="主要拍攝地點" placeholder="主要拍攝地點或地址"></div>' +
        '<div class="field-group"><label class="field-label" for="day-expected-wrap">預計收工</label><input class="text-field" id="day-expected-wrap" type="time" data-day-field="expectedWrap" aria-label="手填預計收工時間"></div>' +
        '<div class="field-group"><label class="field-label" for="day-production-company">製作公司</label><input class="text-field" id="day-production-company" type="text" maxlength="200" data-day-field="productionCompany" aria-label="製作公司"></div>' +
        '<div class="field-group"><label class="field-label" for="day-business-number">統編</label><input class="text-field" id="day-business-number" type="text" maxlength="40" data-day-field="businessNumber" aria-label="統一編號"></div>' +
        '</div>' +
        callsheetCollectionSection("contacts","聯絡人","新增聯絡人") +
        callsheetCollectionSection("groupCalls","大組通告時間","新增大組通告") +
        callsheetCollectionSection("vehicles","車輛","新增車輛") +
        callsheetCollectionSection("notices","注意事項","新增注意事項");
    }
    ["contacts", "groupCalls", "vehicles", "notices"].forEach((collection) => {
      const rowsHost = host.querySelector('[data-callsheet-rows="' + collection + '"]');
      if (rowsHost) rowsHost.innerHTML = renderCallsheetRows(day, collection);
    });
    host.querySelectorAll("[data-day-field]").forEach((field) => {
      const fieldName = field.dataset.dayField;
      field.dataset.entityId = day.id;
      const draft = fieldDrafts.get(draftKey(day.id, fieldName));
      const value = draft ? draft.value : callsheetValue(day, fieldName);
      if (document.activeElement !== field && !composingFields.has(field)) {
        if (field.type === "checkbox") field.checked = !!value;
        else field.value = String(value == null ? "" : value);
      }
      if (draft) renderDraftError(field, draft);
      else clearFieldError(field);
    });
    applyReadonlyControls();
  }
  function callsheetCollectionSection(name, title, addLabel) {
    return '<section class="day-callsheet-list" aria-labelledby="day-callsheet-' + name + '-title"><div class="day-callsheet-list-heading"><h4 id="day-callsheet-' + name + '-title">' + escapeHtml(title) + '</h4><button type="button" class="text-action callsheet-add" data-callsheet-action="add" data-callsheet-collection="' + escapeHtml(name) + '">＋ ' + escapeHtml(addLabel) + '</button></div><div data-callsheet-rows="' + escapeHtml(name) + '"></div></section>';
  }
  function renderSchedule(options) {
    options = options || {};
    cancelReorderGesture("entries");
    const focusedElement = document.activeElement;
    const focusedRow = focusedElement && focusedElement.closest ? focusedElement.closest("#schedule-list .schedule-entry") : null;
    const focusEntrySnapshot = focusedRow ? { id: focusedRow.dataset.entry, action: focusedElement.dataset && focusedElement.dataset.action || "" } : null;
    if (!state.days.some((day) => day.id === selectedDayId)) selectedDayId = state.days[0] ? state.days[0].id : null;
    const day = activeDay(); const entries = activeEntries(); const assigned = new Set(state.entries.filter((entry) => entry.type === "shot").map((entry) => entry.shotId));
    $("#day-count").textContent = state.days.length;
    $("#shoot-day-tabs").innerHTML = state.days.map((item,index) => '<button type="button" role="tab" class="shoot-day-tab ' + (item.id === selectedDayId ? "is-active" : "") + '" aria-selected="' + (item.id === selectedDayId ? "true" : "false") + '" tabindex="' + (item.id === selectedDayId ? "0" : "-1") + '" data-day-id="' + escapeHtml(item.id) + '"><span>拍攝日 ' + String(index + 1).padStart(2,"0") + '</span><strong>' + escapeHtml(item.title || "未命名拍攝日") + '</strong><time datetime="' + escapeHtml(item.date) + '">' + escapeHtml(formatDate(item.date, true)) + '</time></button>').join("");
    const poolQuery = $("#pool-search").value.trim().toLocaleLowerCase();
    const unscheduled = state.shots.filter((shot) => !assigned.has(shot.id) && (!poolQuery || [shot.no,shot.title,shot.visual].join(" ").toLocaleLowerCase().includes(poolQuery)));
    $("#unscheduled-count").textContent = state.shots.filter((shot) => !assigned.has(shot.id)).length;
    $("#shot-pool").innerHTML = unscheduled.length ? unscheduled.map((shot) => {
      const subtitleMarkup = (shotHasTitle(shot) ? shotLabel(shot) + " · " : "") + escapeHtml(formatSeconds(shot.duration));
      return '<div class="pool-card"><div class="pool-card-copy"><strong>' + escapeHtml(shotTitleOrNumber(shot)) + '</strong><span>' + subtitleMarkup + '</span></div><button class="pool-add" data-action="schedule-shot" data-shot-id="' + escapeHtml(shot.id) + '" aria-label="加入拍攝日" title="加入目前拍攝日">' + icon("plus",13) + '</button></div>';
    }).join("") : '<div class="empty-state schedule-empty"><strong>' + (state.shots.length && !poolQuery ? "所有鏡頭都已排入拍攝日" : "沒有符合條件的待排鏡頭") + '</strong><p>' + (poolQuery ? "調整搜尋文字再試一次。" : "新增鏡頭後，可從這裡安排拍攝日。") + '</p></div>';
    if (!day) {
      $("#day-summary").innerHTML = '<div class="empty-state"><strong>尚未建立拍攝日</strong><p>建立日期與開始時間，再安排鏡頭。</p></div>';
      renderDayCallsheetFields(null);
      $("#schedule-list").innerHTML = ""; if (!options.skipInspector) $("#schedule-inspector").innerHTML = ""; applyReadonlyControls(); updateReorderSelectionUi(); return;
    }
    const estimates = dayEstimate(entries);
    const daySummary = $("#day-summary");
    const reuseSummary = daySummary.dataset.dayId === day.id && daySummary.querySelector("[data-day-field]");
    if (!options.preserveSummary && !reuseSummary) daySummary.innerHTML = '<div class="day-summary-date"><span class="calendar-badge"><small>拍攝日</small><strong>' + dateParts(day.date).day + '</strong></span><div><input aria-label="拍攝日名稱" data-day-field="title" value="' + escapeHtml(day.title) + '" placeholder="拍攝日名稱"><input type="date" aria-label="拍攝日期" data-day-field="date" value="' + escapeHtml(day.date) + '"><input type="time" aria-label="開始時間" data-day-field="start" value="' + escapeHtml(day.start) + '" title="開始時間"></div></div>' + daySummaryEstimateMarkup(day, entries, estimates);
    daySummary.dataset.dayId = day.id;
    if (reuseSummary) {
      const dateBadge = daySummary.querySelector(".calendar-badge strong"); if (dateBadge) dateBadge.textContent = String(dateParts(day.date).day);
      daySummary.querySelectorAll("[data-day-field]").forEach((field) => {
        const key = field.dataset.dayField; const draft = fieldDrafts.get(draftKey(day.id, key));
        if (document.activeElement !== field && !draft) field.value = day[key] == null ? "" : String(day[key]);
      });
      const total = daySummary.querySelector(".day-summary-total"); if (total) total.outerHTML = daySummaryEstimateMarkup(day, entries, estimates);
    }
    else if (options.preserveSummary) { const dateBadge = daySummary.querySelector(".calendar-badge strong"); if (dateBadge) dateBadge.textContent = String(dateParts(day.date).day); }
    $("#day-summary").querySelectorAll("[data-day-field]").forEach((field) => {
      field.dataset.entityId = day.id;
      const draft = fieldDrafts.get(draftKey(day.id, field.dataset.dayField));
      if (draft) { if (document.activeElement !== field) field.value = draft.value; renderDraftError(field, draft); }
    });
    renderDayCallsheetFields(day);
    if (selectedEntryId === null && entries.length) selectedEntryId = entries[0].id;
    const timeline = model.getTimeline(day.id);
    $("#schedule-list").innerHTML = entries.length ? entries.map((entry,index) => {
      const slot = timeline[index]; const minutes = slot.minutes; const isBreak = entry.type === "break"; const linked = entry.shotId ? byId(entry.shotId) : null;
      const durationLabel = slot.unknown ? "時段待估" : clockAt(day,slot.startOffset).label + "–" + clockAt(day,slot.endOffset).label;
      const timingModeText = entry.timingMode === "fixed"
        ? "指定起訖 " + String(entry.startTime || "—") + "–" + String(entry.endTime || "—") + (entry.startNextDay ? " · 開始翌日" : "") + (entry.endNextDay ? " · 結束翌日" : "")
        : "自動順延 · " + (entry.type === "shot" && Number(entry.minutes) === 0 ? "分鐘未估" : String(Number(entry.minutes) || 0) + " 分");
      const gapNotice = scheduleGapNotice(slot, (offset) => clockAt(day, offset).label);
      const gap = gapNotice ? '<p class="schedule-gap">' + escapeHtml(gapNotice) + '</p>' : '';
      const warning = slot.overlapMinutes > 0 ? ' · 重疊 ' + slot.overlapMinutes + ' 分鐘' : scheduleOrderWarning(slot) ? ' · ' + scheduleOrderWarning(slot) : '';
      const hasSavedTitle = typeof entry.title === "string" && entry.title.trim().length > 0;
      const displayTitle = hasSavedTitle ? entry.title : (linked ? shotTitleOrNumber(linked) : "");
      const isNumberFallback = !hasSavedTitle && !!linked && !shotHasTitle(linked);
      const visualText = String(linked && linked.visual || "");
      const displaySub = isBreak ? "休息／現場活動" : (linked
        ? isNumberFallback ? (visualText.trim() ? visualText : "") : shotNumber(linked) + (visualText.trim() ? " · " + visualText : "")
        : "來源鏡頭不存在");
      const displayTitleText = displayTitle || (isBreak ? "休息" : linked ? shotNumber(linked) : "來源鏡頭不存在");
      const displaySubHtml = displaySub ? '<small>' + escapeHtml(displaySub) + '</small>' : '';
      return gap + '<article class="schedule-entry ' + (selectedEntryId === entry.id ? "is-selected " : "") + (entryReorderSelection.has(entry.id) && (scheduleMultiSelectMode || entryReorderSelection.size > 1) ? "is-reorder-selected " : "") + (isBreak ? "is-break" : "") + '" data-entry="' + escapeHtml(entry.id) + '" tabindex="0"><div class="entry-order"><span class="entry-order-number">' + String(index + 1).padStart(2,"0") + '</span></div><div class="entry-copy"><button class="entry-title" data-action="select-entry">' + escapeHtml(displayTitleText) + '</button>' + displaySubHtml + '</div><div class="entry-time"><strong>' + escapeHtml(durationLabel) + '</strong><span class="entry-timing-mode ' + (entry.timingMode === "fixed" ? "is-fixed" : "is-auto") + '">' + escapeHtml(timingModeText) + '</span><small class="' + (warning ? 'timing-conflict' : '') + '">' + escapeHtml(entry.status + warning) + '</small></div><div class="entry-order-controls"><button class="micro-icon-button" data-action="entry-up" aria-label="上移項目" title="上移" ' + (index === 0 ? "disabled" : "") + '>' + icon("up",13) + '</button><button class="micro-icon-button" data-action="entry-down" aria-label="下移項目" title="下移" ' + (index === entries.length - 1 ? "disabled" : "") + '>' + icon("down",13) + '</button></div></article>';
    }).join("") : '<div class="empty-state"><div class="empty-icon">' + icon("calendar",16) + '</div><strong>這一天還沒有拍攝項目</strong><p>從待排鏡頭加入分鏡，或先插入休息與換景時間。</p></div>';
    $$("#schedule-list .schedule-entry").forEach((row) => row.querySelectorAll("[data-action='entry-up'],[data-action='entry-down']").forEach((button) => { button.disabled = !canMoveReorderSelection("entries", day.id, row.dataset.entry, button.dataset.action === "entry-up" ? -1 : 1); }));
    if (!options.skipInspector) renderScheduleInspector(day, entries);
    applyReadonlyControls(); updateReorderSelectionUi();
    if (focusEntrySnapshot) {
      const row = $$("#schedule-list .schedule-entry").find((item) => item.dataset.entry === focusEntrySnapshot.id);
      const target = row && (focusEntrySnapshot.action ? row.querySelector('[data-action="' + focusEntrySnapshot.action + '"]') : focusEntrySnapshot.action === "select-entry" ? row.querySelector("[data-action='select-entry']") : row);
      if (target) target.focus({ preventScroll: true });
    }
  }
  function renderScheduleInspector(day, entries) {
    const entry = entries.find((item) => item.id === selectedEntryId); const container = $("#schedule-inspector");
    if (!entry) { container.dataset.entryId = ""; container.innerHTML = '<div class="empty-state"><strong>選取拍攝項目</strong><p>選取一個鏡頭或休息時間，編輯現場細節。</p></div>'; applyReadonlyControls(); return; }
    const linked = entry.shotId ? byId(entry.shotId) : null; const groupIndex = entries.findIndex((item) => item.id === entry.id); const isBreak = entry.type === "break";
    if (container.dataset.entryId === entry.id && container.dataset.entryType === entry.type && container.querySelector("[data-entry-field]")) {
      ["title","minutes","status","notes"].forEach((key) => {
        const field = container.querySelector('[data-entry-field="' + key + '"]'); if (!field) return;
        const draft = fieldDrafts.get(draftKey(entry.id, key));
        if (document.activeElement !== field && !draft) field.value = entry[key] == null ? "" : String(entry[key]);
      });
      const start = container.querySelector('[data-time-draft="startTime"]'); const end = container.querySelector('[data-time-draft="endTime"]'); const startNextDay = container.querySelector('[data-time-draft="startNextDay"]'); const nextDay = container.querySelector('[data-time-draft="endNextDay"]');
      const timingDraftValues = timingValuesForEntry(day, entry);
      const startDraft = start && fieldDraftFor(start); const endDraft = end && fieldDraftFor(end); const startNextDayDraft = startNextDay && fieldDraftFor(startNextDay); const nextDayDraft = nextDay && fieldDraftFor(nextDay);
      if (start && document.activeElement !== start && !startDraft) start.value = timingDraftValues.startTime;
      if (end && document.activeElement !== end && !endDraft) end.value = timingDraftValues.endTime;
      if (startNextDay && document.activeElement !== startNextDay && !startNextDayDraft) startNextDay.checked = timingDraftValues.startNextDay;
      if (nextDay && document.activeElement !== nextDay && !nextDayDraft) nextDay.checked = timingDraftValues.endNextDay;
      const number = container.querySelector(".inspector-number"); if (number) number.textContent = linked ? shotNumber(linked) : "拍攝活動";
      const readonly = container.querySelector(".readonly-value"); if (readonly && linked) readonly.textContent = shotTitleOrNumber(linked);
      refreshEntryDayTarget(entry, container);
      const moves = container.querySelectorAll("[data-action='entry-up'],[data-action='entry-down']");
      moves.forEach((button) => { button.disabled = !canMoveReorderSelection("entries", entry.dayId, entry.id, button.dataset.action === "entry-up" ? -1 : 1); });
      const minuteField = container.querySelector("#entry-minutes"); if (minuteField) { minuteField.disabled = entry.timingMode === "fixed"; if (entry.timingMode === "fixed") minuteField.title = "依指定起訖時間計算"; }
      const fixed = entry.timingMode === "fixed";
      const timingToggle = container.querySelector(".timing-mode-toggle"); if (timingToggle) timingToggle.setAttribute("aria-pressed", fixed ? "true" : "false");
      const timingRow = container.querySelector("#entry-timing-fields"); if (timingRow) timingRow.hidden = !fixed;
      const startNextDayLabel = container.querySelector(".timing-start-next-day"); if (startNextDayLabel) startNextDayLabel.hidden = !fixed;
      const nextDayLabel = container.querySelector(".timing-end-next-day"); if (nextDayLabel) nextDayLabel.hidden = !fixed;
      const applyTime = container.querySelector('[data-action="apply-entry-time"]'); if (applyTime) applyTime.hidden = !fixed;
      const modeNote = container.querySelector(".timing-mode-note"); if (modeNote) modeNote.textContent = timingModeHelp(entry);
      const fixedNote = container.querySelector(".timing-fixed-note"); if (fixedNote) fixedNote.hidden = !fixed;
      applyReadonlyControls();
      return;
    }
    const statuses = ["待拍","拍攝中","完成","略過"].map((status) => '<option value="' + status + '" ' + (status === entry.status ? "selected" : "") + '>' + status + '</option>').join("");
    container.innerHTML = '<div class="inspector-top"><p class="inspector-title">現場安排</p><span class="count-chip">' + (isBreak ? "活動" : "鏡頭") + '</span></div><div class="inspector-number">' + escapeHtml(linked ? shotNumber(linked) : "拍攝活動") + '</div>' + (isBreak ? '<div class="field-group"><label class="field-label" for="entry-title">活動名稱</label><input id="entry-title" class="text-field" data-entry-field="title" value="' + escapeHtml(entry.title) + '"></div>' : '<div class="field-group"><label class="field-label">鏡頭名稱</label><div class="readonly-value">' + escapeHtml(linked ? shotTitleOrNumber(linked) : entry.title) + '</div><span class="field-note">名稱與分鏡共用；在分鏡工作區編輯。</span></div>') + '<div class="field-row"><div class="field-group"><label class="field-label" for="entry-minutes">拍攝分鐘</label><div class="duration-input-wrap"><input id="entry-minutes" class="number-field" type="number" min="0" step="1" inputmode="numeric" data-entry-field="minutes" value="' + escapeHtml(entry.minutes) + '"><span class="input-suffix">分</span></div></div><div class="field-group"><label class="field-label" for="entry-status">狀態</label><select id="entry-status" class="select-control" data-entry-field="status">' + statuses + '</select></div></div><span class="field-note">' + (isBreak ? "0 分鐘是合法的零長度活動，不會增加時程。" : "0 分鐘代表尚未估時；之後時段會標示待估。") + '</span><div class="field-group" style="margin-top:14px"><label class="field-label" for="entry-notes">現場備註</label><textarea id="entry-notes" class="textarea-field" data-entry-field="notes" placeholder="道具、肖像同意、光線或現場準備…">' + escapeHtml(entry.notes) + '</textarea></div><div class="field-group entry-day-transfer"><label class="field-label" for="entry-move-day">移至拍攝日</label><div class="entry-day-transfer-controls"><select class="select-control" id="entry-move-day" aria-label="移動至目標拍攝日" style="height:44px;min-height:44px">' + entryDayTargetOptions(entry.dayId) + '</select><button type="button" class="outline-button" data-action="move-entry-day" data-entry-target="' + escapeHtml(entry.id) + '" aria-label="將此拍攝項目移至選取拍攝日" style="height:44px;min-height:44px">移至此日</button></div><small class="field-note" id="entry-day-transfer-note">' + escapeHtml(entryDayTransferHelp(entry)) + '</small></div><div class="inspector-foot"><div class="move-controls"><button class="small-action" data-action="entry-up" ' + (groupIndex <= 0 ? "disabled" : "") + '>上移</button><button class="small-action" data-action="entry-down" ' + (groupIndex >= entries.length - 1 ? "disabled" : "") + '>下移</button></div><button class="small-action" data-action="remove-entry">移出拍攝日</button></div>';
    container.dataset.entryId = entry.id; container.dataset.entryType = entry.type;
    container.querySelectorAll("[data-action='entry-up'],[data-action='entry-down']").forEach((button) => { button.disabled = !canMoveReorderSelection("entries", entry.dayId, entry.id, button.dataset.action === "entry-up" ? -1 : 1); });
    container.querySelectorAll("[data-entry-field]").forEach((field) => {
      field.dataset.entityId = entry.id;
      const draft = fieldDrafts.get(draftKey(entry.id, field.dataset.entryField));
      if (draft) { field.value = draft.value; renderDraftError(field, draft); }
    });
    const fixed = entry.timingMode === 'fixed';
    const timingValues = timingValuesForEntry(day, entry);
    const startValue = timingValues.startTime;
    const endValue = timingValues.endTime;
    const controls = '<div class="timing-controls"><span class="field-label" id="entry-timing-label">時間安排</span><button type="button" class="outline-button apply-time-button timing-mode-toggle" data-action="toggle-entry-timing" data-entry-target="'+escapeHtml(entry.id)+'" aria-pressed="'+(fixed?'true':'false')+'" aria-controls="entry-timing-fields" aria-describedby="entry-timing-mode-note">指定開始與結束</button><small class="field-note timing-mode-note" id="entry-timing-mode-note">'+escapeHtml(timingModeHelp(entry))+'</small><div class="field-row" id="entry-timing-fields" '+(!fixed?'hidden':'')+'><div><label class="field-label" for="entry-start-time">開始時間</label><input class="text-field" id="entry-start-time" type="time" value="'+startValue+'" data-time-draft="startTime"></div><div><label class="field-label" for="entry-end-time">結束時間</label><input class="text-field" id="entry-end-time" type="time" value="'+endValue+'" data-time-draft="endTime"></div></div><label class="timing-next-day timing-start-next-day" '+(!fixed?'hidden':'')+'><input type="checkbox" data-time-draft="startNextDay" '+(timingValues.startNextDay?'checked':'')+'> 開始於翌日</label><label class="timing-next-day timing-end-next-day" '+(!fixed?'hidden':'')+'><input type="checkbox" data-time-draft="endNextDay" '+(timingValues.endNextDay?'checked':'')+'> 結束於翌日</label><button class="outline-button apply-time-button" data-action="apply-entry-time" data-entry-target="'+escapeHtml(entry.id)+'" ' + (!fixed ? 'hidden' : '') + '>套用指定時段</button><small class="field-note timing-fixed-note" '+(!fixed?'hidden':'')+'>起訖與日期修改完成後按「套用指定時段」。</small></div>';
    container.querySelector('.field-row').insertAdjacentHTML('beforebegin',controls);
    container.querySelectorAll("[data-time-draft]").forEach((field) => {
      field.dataset.entityId = entry.id; field.dataset.field = field.dataset.timeDraft;
      const draft = fieldDrafts.get(draftKey(entry.id, field.dataset.field));
      if (draft) { if (field.type === "checkbox") field.checked = !!draft.value; else field.value = draft.value; renderDraftError(field, draft); }
    });
    container.querySelector('#entry-minutes').disabled = fixed;
    if (fixed) container.querySelector('#entry-minutes').title = '依指定起訖時間計算';
    refreshEntryDayTarget(entry, container);
    applyReadonlyControls();
  }
  function entryDayTargetOptions(currentDayId, selectedTargetDayId) {
    const targets = state.days.filter((item) => item.id !== currentDayId);
    if (!targets.length) return '<option value="" selected>尚無其他拍攝日</option>';
    const prompt = '<option value="" ' + (selectedTargetDayId ? "" : "selected") + '>選擇目標拍攝日</option>';
    return prompt + targets.map((item) => {
      const index = state.days.findIndex((day) => day.id === item.id) + 1;
      const label = "拍攝日 " + String(index).padStart(2, "0") + " · " + (item.title || "未命名拍攝日") + " · " + formatDate(item.date, true);
      return '<option value="' + escapeHtml(item.id) + '" ' + (item.id === selectedTargetDayId ? "selected" : "") + '>' + escapeHtml(label) + '</option>';
    }).join("");
  }
  function entryDayTransferHelp(entry) {
    return entry.timingMode === "fixed"
      ? "移動會保留指定起訖；項目將加入目標日拍攝順序末尾。"
      : "移動後，自動時段會依目標日拍攝順序重新計算。";
  }
  function refreshEntryDayTarget(entry, container) {
    const select = container.querySelector("#entry-move-day");
    if (!select) return;
    const previousTargetDayId = select.value;
    const targets = state.days.filter((item) => item.id !== entry.dayId);
    const stillValid = targets.some((item) => item.id === previousTargetDayId);
    select.innerHTML = entryDayTargetOptions(entry.dayId, stillValid ? previousTargetDayId : null);
    select.value = stillValid ? previousTargetDayId : "";
    const note = container.querySelector("#entry-day-transfer-note");
    if (note) note.textContent = entryDayTransferHelp(entry);
    syncEntryDayTransferControls(entry, container);
  }
  function syncEntryDayTransferControls(entry, container) {
    const select = container && container.querySelector("#entry-move-day");
    const button = container && container.querySelector("[data-action='move-entry-day']");
    if (!select || !button) return;
    const hasTargets = state.days.some((item) => item.id !== entry.dayId);
    const blocked = lifecycle.phase === "save_failed" || lifecycle.phase === "saving" || Number(lifecycle.pendingCount || 0) > 0 || uiPending > 0 || pendingEntryDayMoves.has(entry.id) || isReadOnly();
    select.disabled = blocked || !hasTargets;
    button.disabled = blocked || !select.value || !hasTargets;
  }
  async function moveEntryToDay(entryId, targetDayId) {
    if (pendingEntryDayMoves.has(entryId)) return false;
    const currentLifecycle = modelLifecycle();
    if (currentLifecycle && currentLifecycle.phase === "save_failed" || lifecycle.phase === "save_failed") {
      if (currentLifecycle) refreshLifecycle(currentLifecycle);
      throw fieldFailure("SAVE_PENDING", "尚有原命令等待保存；請先按「重試保存」完成原命令，再繼續移動。");
    }
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) throw fieldFailure("ENTRY_NOT_FOUND", "拍攝項目已不存在，請重新選取。");
    const targetDay = state.days.find((item) => item.id === targetDayId);
    if (!targetDay) throw fieldFailure("DAY_NOT_FOUND", "請選擇有效的目標拍攝日。");
    if (entry.dayId === targetDayId) throw fieldFailure("SAME_SHOOTING_DAY", "此項目已在選取的拍攝日。");
    pendingEntryDayMoves.add(entryId);
    const moveButton = $("#schedule-inspector [data-action='move-entry-day']");
    if (moveButton) moveButton.disabled = true;
    try {
      await withMutation(() => model.updateEntry(entry.id, { dayId: targetDayId }));
      selectedDayId = targetDayId;
      selectedEntryId = entry.id;
      entryReorderSelection = new Set();
      entrySelectionAnchorId = null;
      renderAll();
      const latestEntry = state.entries.find((item) => item.id === entry.id) || entry;
      const latestTargetDay = state.days.find((item) => item.id === latestEntry.dayId) || targetDay;
      const selectedRowTitle = $("#schedule-list [data-entry='" + escapeHtml(latestEntry.id) + "'] [data-action='select-entry']");
      if (selectedRowTitle) selectedRowTitle.focus({ preventScroll: true });
      const linkedShot = latestEntry.type === "shot" ? byId(latestEntry.shotId) : null;
      const label = latestEntry.type === "shot" ? linkedShot ? shotTitleOrNumber(linkedShot) : "來源鏡頭不存在" : (latestEntry.title || "拍攝活動");
      const timingNote = latestEntry.timingMode === "fixed" ? "指定時段已保留" : "自動時段已依目標日拍攝順序重新計算";
      message("已將「" + label + "」移至「" + (latestTargetDay.title || "未命名拍攝日") + "」；" + timingNote + "。", false);
      return true;
    } finally {
      pendingEntryDayMoves.delete(entryId);
      const currentEntry = state.entries.find((item) => item.id === entryId);
      if (currentEntry) syncEntryDayTransferControls(currentEntry, $("#schedule-inspector"));
    }
  }

  function ensureDayDialog() {
    if ($("#day-dialog")) return;
    document.body.insertAdjacentHTML("beforeend", '<dialog class="app-dialog day-dialog" id="day-dialog"><div class="dialog-top"><span class="dialog-mark">' + icon("calendar",18) + '</span><button class="dialog-close" data-close="day-dialog" aria-label="關閉">' + icon("close",13) + '</button></div><h2>新增拍攝日</h2><p class="dialog-lead">新增一個獨立工作日，再把待排鏡頭加入此日。</p><form id="day-form"><div class="field-row" style="margin-top:18px"><div class="field-group"><label class="field-label" for="new-day-title">拍攝日名稱</label><input id="new-day-title" class="text-field" name="title" required maxlength="80"></div><div class="field-group"><label class="field-label" for="new-day-date">日期</label><input id="new-day-date" class="text-field" type="date" name="date" required></div></div><div class="field-group"><label class="field-label" for="new-day-start">開始時間</label><input id="new-day-start" class="text-field" type="time" name="start" required></div><div class="dialog-actions"><button class="outline-button" type="button" data-close="day-dialog">取消</button><button class="primary-button" type="submit" style="height:34px;padding:0 13px">建立拍攝日</button></div></form></dialog>');
  }
  function openSceneDialog(sceneId) {
    let dialog = $('#scene-dialog');
    if (!dialog) {
      document.body.insertAdjacentHTML('beforeend','<dialog class="app-dialog scene-dialog" id="scene-dialog"><div class="dialog-top"><span class="eyebrow">SCENE</span><button class="dialog-close" data-close="scene-dialog" aria-label="關閉場次設定">' + icon('close',14) + '</button></div><h2 id="scene-dialog-title">新增場次</h2><p class="dialog-lead" id="scene-dialog-note"></p><form id="scene-form"><div class="field-group"><label class="field-label" for="scene-title">場次名稱</label><input class="text-field" id="scene-title" name="title" maxlength="120" required placeholder="例如：室內泳池・清晨"></div><div class="dialog-actions"><button class="outline-button" type="button" data-close="scene-dialog">取消</button><button class="primary-button" id="scene-save" type="submit">建立場次</button></div></form></dialog>');
      dialog = $('#scene-dialog');
    }
    const scene = state.chapters.find(item => item.id === sceneId);
    $('#scene-form').dataset.sceneId = scene ? scene.id : '';
    $('#scene-dialog-title').textContent = scene ? '編輯' + sceneNumber(scene.id) : '新增場次';
    $('#scene-dialog-note').textContent = scene ? '名稱會同步更新於場次導覽與輸出，分鏡與拍攝安排的引用保持連結。' : '場次編號自動接續；建立後即可加入分鏡。';
    $('#scene-title').value = scene ? scene.title : '';
    $('#scene-save').textContent = scene ? '儲存變更' : '建立場次';
    dialog.showModal(); $('#scene-title').focus();
  }
  function getOutputShots() {
    if (outputScope === "selected") return state.shots.filter((shot) => shot.id === selectedShotId);
    if (outputScope === "chapter") {
      const chapterId = activeChapterId !== "all" ? activeChapterId : (byId(selectedShotId) || {}).chapterId;
      return state.shots.filter((shot) => shot.chapterId === chapterId);
    }
    return state.shots.slice();
  }
  let outputItemsPerPage = 4;
  let outputIncludeDetails = true;
  const outputFields = {
    images: { shotNumber:false, title:false, voiceover:false, super:false, duration:false },
    details: { visual:true, script:true, super:false, sound:true, move:true, duration:true }
  };
  let outputDayScope = "selected";
  let outputScheduleSection = "timeline";
  const outputScheduleFields = { rundownThumbnails:false, rundownNotes:false, rundownStatus:false, storyboardShotNumber:false, storyboardTitle:false };
  let outputDensityByMode = { images:4, details:4 };
  const outputImageSourceChoices = new Map();
  let outputCaptureVersion = 0;
  let outputCapturePromise = Promise.resolve(null);
  let outputCaptureError = null;
  let activeOutputObjectUrls = new Set();
  let outputLayoutVersion = 0;
  let outputLayoutObserver = null;
  let outputLayoutBound = false;
  let outputStageWidth = 0;
  let activeOutputContext = null;
  let outputDensityPreviewFrame = 0;
  let outputDensityPreferenceSaveContext = null;
  let outputPrintPreparation = null;
  let callsheetDrag = null;
  let callsheetRowSequence = 0;
  function activeOutputMode() { return outputIncludeDetails ? "details" : "images"; }
  function outputPreferenceSnapshot() {
    const base = state && state.outputPreferences || {};
    return {
      schemaVersion: base.schemaVersion || 2,
      revision: Number(base.revision) || 0,
      mode: activeOutputMode(),
      orientation: orientation,
      density: outputItemsPerPage,
      densityByMode: { images:Number(outputDensityByMode.images) || 4, details:Number(outputDensityByMode.details) || 4 },
      fields: {
        images:Object.assign({},outputFields.images),
        details:Object.assign({},outputFields.details)
      },
      schedule: Object.assign({},base.schedule || {},{ dayScope:outputDayScope, selectedDayId:outputDayId || selectedDayId || null, showEstimatedWrap:outputShowEstimatedWrap },outputScheduleFields)
    };
  }
  function selectedOutputFields(mode) { return outputFields[mode] || {}; }
  function outputFieldCount(mode) { return Object.values(selectedOutputFields(mode)).filter(Boolean).length; }
  function outputImageSourceKey(projectId, shotId) { return String(projectId || "") + "\u0000" + String(shotId || ""); }
  function releaseOutputObjectUrls(urls) {
    (urls || []).forEach((url) => { try { URL.revokeObjectURL(url); } catch (_) {} });
  }
  function releaseActiveOutputResources() {
    releaseOutputObjectUrls(activeOutputObjectUrls);
    activeOutputObjectUrls = new Set();
  }
  function estimateOutputDensityLimit(mode, resolvedOrientation, aspectRatio, fieldValues, scheduleMode) {
    const landscape = resolvedOrientation !== "portrait";
    const pageWidth = landscape ? 271 : 184;
    const pageHeight = landscape ? 184 : 271;
    const contentHeight = Math.max(80,pageHeight - 57); // A4 inner area minus page header/footer.
    const aspectParts = String(aspectRatio || "16:9").split(":").map(Number);
    const aspect = (aspectParts[0] || 16) / (aspectParts[1] || 9);
    if (scheduleMode) {
      const nonemptyShots = Array.isArray(fieldValues) ? fieldValues : [];
      const averageLines = nonemptyShots.length ? Math.max(1,Math.min(7,Math.ceil(nonemptyShots.reduce((sum,value) => sum + String(value || "").length,0) / nonemptyShots.length / (landscape ? 42 : 28)))) : 1;
      const rowHeight = 17 + averageLines * 4.8;
      return Math.max(1,Math.min(12,Math.floor(contentHeight / rowHeight)));
    }
    if (mode === "details") {
      const records = Array.isArray(fieldValues) && fieldValues.length ? fieldValues : [[]];
      const pageBodyWidth = Math.max(1,pageWidth - 4);
      const textLinesFor = (value, columns) => String(value || "").split(/\r?\n/).reduce((sum,line) => sum + Math.max(1,Math.ceil(Array.from(line).length / Math.max(1,columns))),0);
      let maximumFit = 1;
      for (let density = 1; density <= 12; density += 1) {
        const rowGap = 2.3;
        const rowHeight = (contentHeight - rowGap * (density - 1)) / density;
        if (rowHeight <= 24) continue; // leave room for 9 pt text and card padding
        const stackedPortrait = !landscape;
        const frameWidth = stackedPortrait ? Math.max(1,pageBodyWidth - 4) : pageBodyWidth * 0.46;
        const frameHeight = Math.max(20,stackedPortrait ? frameWidth / aspect : Math.min(rowHeight - 4,frameWidth / aspect));
        const textWidth = Math.max(1,stackedPortrait ? pageBodyWidth - 4 : pageBodyWidth - frameHeight * aspect - 9);
        const columns = Math.max(1,Math.floor(textWidth / (stackedPortrait ? 3.2 : 2.4)));
        const fitsEveryRecord = records.every((record) => {
          const rows = Array.isArray(record) ? record : [];
          const title = rows.title || "";
          const titleLines = title ? Math.max(1,Math.ceil(Array.from(String(title)).length / Math.max(1,Math.floor(columns * 0.72)))) : 0;
          const details = rows.filter((value) => typeof value === "string");
          const detailLines = details.reduce((sum,value) => sum + textLinesFor(value,columns),0);
          const headerHeight = 4.8 + titleLines * 4.6 + (titleLines ? 1 : 0);
          const textHeight = headerHeight + detailLines * 4.1;
          const availableArtHeight = stackedPortrait ? rowHeight - textHeight - 6.5 : frameHeight;
          const fittedFrameHeight = stackedPortrait ? Math.min(frameWidth / aspect,availableArtHeight) : frameHeight;
          const cardHeight = stackedPortrait ? fittedFrameHeight + textHeight + 6.5 : Math.max(frameHeight,textHeight) + 4;
          return (!stackedPortrait || fittedFrameHeight >= 36) && cardHeight <= rowHeight + 0.5;
        });
        if (fitsEveryRecord) maximumFit = density;
      }
      return Math.max(1,Math.min(12,maximumFit));
    }
    const enabled = Object.keys(fieldValues || {}).filter((key) => fieldValues[key]);
    const annotationHeight = enabled.reduce((sum,key) => sum + (key === "voiceover" ? 12 : key === "title" ? 7 : 5),0);
    const minImageHeight = 31;
    const cellWidth = Math.max(1,Math.max(minImageHeight * aspect,48));
    const columns = Math.max(1,Math.floor(pageWidth / cellWidth));
    const rows = Math.max(1,Math.floor(contentHeight / (minImageHeight + annotationHeight)));
    return Math.max(1,Math.min(12,columns * rows));
  }
  function effectiveOutputDensityLimit(mode, resolvedOrientation, snapshotUi, scheduleMode) {
    const aspectRatio = snapshotUi && snapshotUi.aspectRatio || state && state.aspectRatio;
    if (scheduleMode) {
      const entries = snapshotUi ? snapshotUi.entries || [] : [];
      const shots = new Map((snapshotUi ? snapshotUi.shots || [] : []).map((shot) => [shot.id,shot]));
      const values = entries.map((entry) => {
        const shot = entry.shotId && shots.get(entry.shotId);
        return [entry.title,entry.notes,shot && shot.title,shot && shot.visual,shot && shot.script,shot && shot.super].filter(Boolean).join(" ");
      });
      return estimateOutputDensityLimit(mode,resolvedOrientation,aspectRatio,values,true);
    }
    if (mode === "details") {
      const allShots = snapshotUi ? snapshotUi.shots || [] : [];
      let shots = allShots;
      if (outputScope === "selected") shots = allShots.filter((shot) => shot.id === selectedShotId);
      else if (outputScope === "chapter") {
        const selected = allShots.find((shot) => shot.id === selectedShotId);
        const chapterId = activeChapterId !== "all" ? activeChapterId : selected && selected.chapterId;
        shots = allShots.filter((shot) => shot.chapterId === chapterId);
      }
      const fields = selectedOutputFields("details");
      const records = shots.map((shot) => {
        const rows = [];
        if (fields.visual && String(shot.visual || "").trim()) rows.push("畫面描述｜" + shot.visual);
        if (fields.script && String(shot.script || "").trim()) rows.push("VO／台詞旁白｜" + shot.script);
        if (fields.super && String(shot.super || "").trim()) rows.push("SUPER｜" + shot.super);
        if (fields.sound && String(shot.sound || "").trim()) rows.push("聲音設計｜" + shot.sound);
        if (fields.move && String(shot.move || "").trim()) rows.push("景別／運鏡｜" + shot.move);
        if (fields.duration) rows.push("秒數｜" + (Number(shot.duration) === 0 ? "秒數未估" : formatSeconds(shot.duration)));
        rows.title = String(shot.title || "").trim();
        return rows;
      });
      return estimateOutputDensityLimit(mode,resolvedOrientation,aspectRatio,records,false);
    }
    return estimateOutputDensityLimit(mode,resolvedOrientation,aspectRatio,selectedOutputFields(mode),false);
  }
  function resolveOutputOrientation(mode, aspectRatio, fields, scheduleMode, snapshotUi) {
    if (orientation === "portrait" || orientation === "landscape") return orientation;
    const ratioParts = String(aspectRatio || "16:9").split(":").map(Number);
    const ratio = (ratioParts[0] || 16) / (ratioParts[1] || 9);
    if (Math.abs(ratio - 16 / 9) < 0.001) return "landscape";
    const densitySnapshot = snapshotUi || state;
    const portraitLimit = effectiveOutputDensityLimit(mode,"portrait",densitySnapshot,scheduleMode);
    const landscapeLimit = effectiveOutputDensityLimit(mode,"landscape",densitySnapshot,scheduleMode);
    const requestedDensity = Math.max(1,Math.min(12,Number(outputDensityByMode[mode]) || outputItemsPerPage || 4));
    const portraitFits = portraitLimit >= requestedDensity;
    const landscapeFits = landscapeLimit >= requestedDensity;
    if (portraitFits !== landscapeFits) return portraitFits ? "portrait" : "landscape";
    if (!portraitFits && !landscapeFits && portraitLimit !== landscapeLimit) return portraitLimit > landscapeLimit ? "portrait" : "landscape";
    if (scheduleMode) return "landscape";
    const density = Math.max(1,Math.min(12,outputItemsPerPage));
    const fieldCount = typeof fields === "number" ? fields : Object.values(fields || {}).filter(Boolean).length;
    function score(orientationName) {
      const width = orientationName === "landscape" ? 271 : 184;
      const height = orientationName === "landscape" ? 127 : 214;
      if (mode === "details") {
        const imageWidth = width * (orientationName === "landscape" ? 0.36 : 0.72);
        const imageHeight = imageWidth / ratio;
        const cardHeight = height / density;
        const visibleHeight = Math.min(imageHeight,Math.max(20,cardHeight - fieldCount * 5));
        return Math.min(imageWidth,visibleHeight * ratio) * visibleHeight * density;
      }
      let best = 0;
      const annotationHeight = fieldCount * 5;
      for (let columns = 1; columns <= Math.min(density,6); columns += 1) {
        const rows = Math.ceil(density / columns);
        const cellWidth = width / columns;
        const cellHeight = height / rows - annotationHeight;
        const frameWidth = Math.max(0,Math.min(cellWidth,cellHeight * ratio));
        best = Math.max(best,frameWidth * frameWidth / ratio * density);
      }
      return best;
    }
    return score("portrait") > score("landscape") ? "portrait" : "landscape";
  }
  function ensureEstimatedWrapControl() {
    const group = $("#schedule-scope-group");
    if (!group) return null;
    let checkbox = $("#output-show-estimated-wrap");
    if (!checkbox) {
      const label = document.createElement("label");
      label.className = "output-toggle-row schedule-estimated-wrap-toggle";
      label.innerHTML = '<span><strong>輸出依排程預估收工</strong><small>僅在當日每個時段都可推算時顯示，與手填預計收工分開。</small></span><input type="checkbox" role="switch" id="output-show-estimated-wrap"><span class="toggle-track" aria-hidden="true"></span>';
      group.insertBefore(label, group.querySelector(".field-note"));
      checkbox = $("#output-show-estimated-wrap");
    }
    checkbox.checked = outputShowEstimatedWrap;
    return checkbox;
  }
  function adoptLatestOutputDensity(context, mode) {
    const scheduleMode = outputType === "schedule";
    if (!context || context.mode !== mode || context.kind !== (scheduleMode ? "schedule" : "storyboard")) return false;
    context.density = outputItemsPerPage;
    context.preferences.density = outputItemsPerPage;
    context.preferences.densityByMode = Object.assign({},context.preferences.densityByMode,{[mode]:outputItemsPerPage});
    return true;
  }
  function updateOutputDensityPreview(mode) {
    const context = activeOutputContext;
    if (context && context.version === outputCaptureVersion && !context.capturePending && adoptLatestOutputDensity(context,mode)) {
      try { assertOutputCaptureCurrent(context); }
      catch (_) { void renderOutput(); return null; }
      if (!context.pages || Number(context._renderedDensity) !== context.density) {
        context.pages = paginateOutputRecords(context.records,context.density);
        renderPagedOutput(context);
        context._renderedDensity = context.density;
      }
      return context;
    }
    if (!$("#print-document .output-capture-progress") && !outputCaptureError) void renderOutput();
    return null;
  }
  function scheduleOutputDensityPreview(mode, immediate) {
    if (outputDensityPreviewFrame) {
      cancelAnimationFrame(outputDensityPreviewFrame);
      outputDensityPreviewFrame = 0;
    }
    if (immediate) return updateOutputDensityPreview(mode);
    outputDensityPreviewFrame = requestAnimationFrame(() => {
      outputDensityPreviewFrame = 0;
      updateOutputDensityPreview(mode);
    });
    return null;
  }
  function adoptOutputDensityPreferenceCommit(snapshot, event) {
    const context = outputDensityPreferenceSaveContext;
    outputDensityPreferenceSaveContext = null;
    if (!context || currentView !== "output" || activeOutputContext !== context || context.capturePending || context.version !== outputCaptureVersion) return false;
    if (!event || event.type !== "updateOutputPreferences" || Number(event.previousRevision) !== Number(context.projectRevision)) return false;
    if (context.mode !== activeOutputMode() || context.kind !== (outputType === "schedule" ? "schedule" : "storyboard")) return false;
    const project = model && typeof model.getProject === "function" ? model.getProject() : null;
    if (!project || project.projectId !== context.projectId || Number(project.revision) !== Number(snapshot.revision)) return false;
    const preferences = normalizeOutputPreferences(project.outputPreferences);
    const expected = context.preferences;
    if (preferences.mode !== expected.mode || preferences.orientation !== expected.orientation ||
        JSON.stringify(preferences.densityByMode) !== JSON.stringify(expected.densityByMode) ||
        JSON.stringify(preferences.fields) !== JSON.stringify(expected.fields) ||
        JSON.stringify(preferences.schedule) !== JSON.stringify(expected.schedule)) return false;
    context.project = project;
    context.projectRevision = Number(project.revision);
    context.preferenceRevision = Number(project.outputPreferences && project.outputPreferences.revision) || 0;
    context.preferences = preferences;
    $$("#print-document .output-page-footer > span:first-child").forEach((span) => {
      span.textContent = span.textContent.replace(/Project revision \d+/,"Project revision " + context.projectRevision).replace(/Preference revision \d+/,"Preference revision " + context.preferenceRevision);
    });
    return true;
  }
  function ensureOutputSettings(scheduleMode) {
    const estimatedWrapToggle = ensureEstimatedWrapControl();
    const slider = $("#output-items-per-page");
    if (!slider) return;
    if (!slider.dataset.bound) {
      const changeDensity = (value, persist) => {
        const limit = Number(slider.max) || 12;
        outputItemsPerPage = Math.max(1,Math.min(limit,Math.round(Number(value) || 1)));
        const mode = activeOutputMode();
        outputDensityByMode[mode] = outputItemsPerPage;
        ensureOutputSettings(outputType === "schedule");
        const patch = { density:outputItemsPerPage, densityByMode:{ [mode]:outputItemsPerPage } };
        stageOutputPreference(patch);
        const scheduleMode = outputType === "schedule";
        const previewContext = scheduleMode ? (renderOutput(),null) : scheduleOutputDensityPreview(mode,!!persist);
        if (persist) {
          if (scheduleMode) return saveOutputPreference(patch);
          const save = () => {
            const context = previewContext || (activeOutputContext && activeOutputContext.version === outputCaptureVersion ? activeOutputContext : null);
            if (context && context.mode === mode && context.kind === (outputType === "schedule" ? "schedule" : "storyboard")) outputDensityPreferenceSaveContext = context;
            return saveOutputPreference(patch).finally(() => { if (outputDensityPreferenceSaveContext === context) outputDensityPreferenceSaveContext = null; });
          };
          if ($("#print-document .output-capture-progress")) return outputCapturePromise.then(() => {
            scheduleOutputDensityPreview(mode,true);
            return save();
          });
          return save();
        }
        return Promise.resolve(true);
      };
      slider.addEventListener("input", () => { void changeDensity(slider.value,false); });
      slider.addEventListener("change", async () => { try { await changeDensity(slider.value,true); } catch (error) { message(error.message || "輸出偏好保存失敗。", true); } });
      $("#output-density-less").addEventListener("click", async () => { try { await changeDensity(outputItemsPerPage - 1,true); } catch (error) { message(error.message || "輸出偏好保存失敗。", true); } });
      $("#output-density-more").addEventListener("click", async () => { try { await changeDensity(outputItemsPerPage + 1,true); } catch (error) { message(error.message || "輸出偏好保存失敗。", true); } });
      $("#output-include-details").addEventListener("change", async event => {
        const nextMode = event.target.checked ? "details" : "images";
        outputIncludeDetails = nextMode === "details";
        outputItemsPerPage = Math.max(1,Number(outputDensityByMode[nextMode]) || 4);
        renderOutput();
        try { await saveOutputPreference({ mode:nextMode }); } catch (error) { message(error.message || "輸出偏好保存失敗。", true); }
      });
      $$('[data-output-field]').forEach(input => input.addEventListener("change", async () => {
        const [mode,key] = input.dataset.outputField.split(".");
        if (!outputFields[mode] || !Object.prototype.hasOwnProperty.call(outputFields[mode],key)) return;
        outputFields[mode][key] = input.checked;
        renderOutput();
        try { await saveOutputPreference({ fields:{ [mode]:{ [key]:input.checked } } }); }
        catch (error) { message(error.message || "輸出偏好保存失敗。", true); }
      }));
      $("#output-day-scope").addEventListener("change", async (event) => {
        outputDayScope = event.target.value === "all" ? "all" : "selected";
        renderOutput();
        try { await saveOutputPreference({ schedule:{ dayScope:outputDayScope, selectedDayId:outputDayId || null } }); }
        catch (error) { message(error.message || "拍攝日範圍保存失敗。", true); }
      });
      $("#output-day").addEventListener("change", async (event) => {
        outputDayId = event.target.value || null;
        renderOutput();
        try { await saveOutputPreference({ schedule:{ dayScope:outputDayScope, selectedDayId:outputDayId } }); }
        catch (error) { message(error.message || "拍攝日選擇保存失敗。", true); }
      });
      if (estimatedWrapToggle) estimatedWrapToggle.addEventListener("change", async (event) => {
        outputShowEstimatedWrap = !!event.target.checked;
        renderOutput();
        try { await saveOutputPreference({ schedule:{ showEstimatedWrap:outputShowEstimatedWrap } }); }
        catch (error) { message(error.message || "預估收工輸出設定保存失敗。", true); }
      });
      $$('[data-schedule-pref]').forEach(input => input.addEventListener("change", async () => {
        const key = input.dataset.schedulePref;
        if (!Object.prototype.hasOwnProperty.call(outputScheduleFields,key)) return;
        outputScheduleFields[key] = !!input.checked;
        renderOutput();
        try { await saveOutputPreference({ schedule:{ [key]:outputScheduleFields[key] } }); }
        catch (error) { message(error.message || "通告輸出偏好保存失敗。", true); }
      }));
      $("#output-image-source-list").addEventListener("change", (event) => {
        const select = event.target.closest("[data-output-source-shot]");
        if (!select || !state) return;
        const key = outputImageSourceKey(state.projectId,select.dataset.outputSourceShot);
        try {
          const value = select.value ? JSON.parse(select.value) : null;
          if (value && (value.type === "photo" || value.type === "drawing") && typeof value.id === "string") outputImageSourceChoices.set(key,value);
          else outputImageSourceChoices.delete(key);
        } catch (_) { outputImageSourceChoices.delete(key); }
        renderOutput();
        renderShotList();
      });
      slider.dataset.bound = "true";
    }
    const currentMode = activeOutputMode();
    const resolved = resolveOutputOrientation(currentMode,state && state.aspectRatio,selectedOutputFields(currentMode),scheduleMode);
    const limit = effectiveOutputDensityLimit(currentMode,resolved,state,scheduleMode);
    slider.min = "1"; slider.max = String(limit);
    const previous = outputItemsPerPage;
    const requestedDensity = Math.max(1,Math.min(12,Number(outputDensityByMode[currentMode]) || outputItemsPerPage || 4));
    outputItemsPerPage = Math.min(requestedDensity,limit);
    const densityUnit = scheduleMode ? "項目／頁" : "鏡／頁";
    const note = $("#output-density-limit-note");
    if (requestedDensity > limit) {
      const prefix = isReadOnly() ? "唯讀預覽：" : "";
      if (note) note.textContent = prefix + "目前可讀性上限為 " + limit + "；已將偏好 " + requestedDensity + " " + densityUnit + "暫時夾限至 " + limit + "，偏好仍保留，版面可容納時會自動恢復。";
    } else if (previous < requestedDensity) {
      if (note) note.textContent = "目前可讀性上限為 " + limit + "；版面已可容納偏好，已自動恢復為 " + requestedDensity + " " + densityUnit + "。";
    } else if (note) {
      note.textContent = "依目前模式、方向、畫幅與欄位選項計算，上限 " + limit + "；目前偏好 " + requestedDensity + " " + densityUnit + "。";
    }
    slider.value = String(outputItemsPerPage);
    const densityText = outputItemsPerPage + (scheduleMode ? " 項目／頁" : " 鏡／頁");
    $("#output-density-value").textContent = densityText;
    slider.setAttribute("aria-valuetext",densityText);
    $("#output-density-less").disabled = outputItemsPerPage === 1;
    $("#output-density-more").disabled = outputItemsPerPage === limit;
    $("#output-density-limit-value").textContent = String(limit);
    $("#output-content-settings").hidden = scheduleMode;
    $("#output-field-options").hidden = !outputIncludeDetails;
    $("#output-image-field-options").hidden = outputIncludeDetails;
    $("#output-day-scope").value = outputDayScope;
    $("#output-selected-day-group").hidden = outputDayScope === "all";
    $("#output-selected-field-count").textContent = outputFieldCount("details") + " 項";
    $("#output-image-field-count").textContent = outputFieldCount("images") + " 項";
    slider.setAttribute("aria-label",scheduleMode ? "每頁拍攝項目" : "每頁鏡數");
    $("#output-density-hint").textContent = "上限依模式、方向、畫幅與實際文字估算；超出時暫時夾限並保留偏好，版面可容納時自動恢復。長文會續頁，不會裁字或縮至 9 pt 以下。";
    $("#output-layout-hint").textContent = scheduleMode ? "拍攝安排按拍攝日分組，保留現場順序與時段資訊。" : outputIncludeDetails ? "細項模式保留鏡次；空標題不會顯示佔位文字。" : outputFieldCount("images") ? "純圖附加欄位依鏡次、標題、VO、SUPER、秒數順序排列。" : "純圖不顯示附加文字；四鏡預設採 2×2。";
    const label = $("#output-page-density-label");
    if (label) label.textContent = scheduleMode ? "每頁拍攝項目" : "每頁鏡數";
  }
  function outputShotLabel(shot) {
    return typeof shotLabel === "function" ? shotLabel(shot) : escapeHtml(shotNumber(shot));
  }
  function outputShortTitle(value, limit) {
    return String(value == null ? "" : value);
  }
  function scheduleSectionLabel(section) {
    return ({timeline:"通告時間軸",rundown:"Rundown",storyboard:"分鏡圖"})[section] || "通告";
  }
  function setOutputScheduleSection(section, focusTab) {
    if (!["timeline","rundown","storyboard"].includes(section)) return;
    outputScheduleSection = section;
    const tabs = $("#schedule-output-tabs");
    if (tabs) {
      $$("#schedule-output-tabs [data-output-section]").forEach((tab) => {
        const active = tab.dataset.outputSection === section;
        tab.setAttribute("aria-selected",active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
        if (active && focusTab) tab.focus({preventScroll:true});
      });
    }
    const doc = $("#print-document");
    if (doc && outputType === "schedule") {
      doc.dataset.activeSection = section;
      $$("#print-document .output-page[data-section]").forEach((page) => page.setAttribute("aria-hidden",page.dataset.section === section ? "false" : "true"));
    }
    if (activeOutputContext && activeOutputContext.kind === "schedule") {
      activeOutputContext.activeSection = section;
      updateOutputPageSummary(activeOutputContext);
    }
  }
  function outputTextChunks(text, limit) {
    const source = String(text || "");
    if (!source) return [""];
    const chunks = [];
    let cursor = 0;
    while (cursor < source.length) {
      let end = Math.min(source.length,cursor + limit);
      if (end < source.length) {
        const candidates = [source.lastIndexOf("\n",end),source.lastIndexOf("。",end),source.lastIndexOf("；",end),source.lastIndexOf("，",end),source.lastIndexOf(" ",end)];
        const split = Math.max.apply(null,candidates);
        if (split > cursor + Math.floor(limit * 0.62)) end = split + 1;
      }
      if (end > cursor && end < source.length) {
        const previousCodeUnit = source.charCodeAt(end - 1);
        const nextCodeUnit = source.charCodeAt(end);
        if (previousCodeUnit >= 0xD800 && previousCodeUnit <= 0xDBFF && nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF) end += 1;
      }
      chunks.push(source.slice(cursor,end)); cursor = end;
    }
    return chunks;
  }
  function splitImageOnlyFieldRows(rows) {
    const sourceRows = (Array.isArray(rows) ? rows : []).filter((row) => row && String(row.value == null ? "" : row.value).trim() !== "");
    if (!sourceRows.length) return null;
    if (sourceRows.length === 1) {
      const row = sourceRows[0];
      const value = String(row.value == null ? "" : row.value);
      const points = Array.from(value);
      if (points.length < 2) return null;
      const splitAt = Math.ceil(points.length / 2);
      return [[Object.assign({},row,{value:points.slice(0,splitAt).join("")})],[Object.assign({},row,{value:points.slice(splitAt).join(""),continuationValue:true})]];
    }
    const total = sourceRows.reduce((sum,row) => sum + Math.max(1,Array.from(String(row.value == null ? "" : row.value)).length),0);
    let bestAt = 1, before = 0, bestDistance = Infinity;
    for (let index = 1; index < sourceRows.length; index += 1) {
      before += Math.max(1,Array.from(String(sourceRows[index - 1].value == null ? "" : sourceRows[index - 1].value)).length);
      const distance = Math.abs(total - before * 2);
      if (distance < bestDistance) { bestDistance = distance; bestAt = index; }
    }
    return [sourceRows.slice(0,bestAt),sourceRows.slice(bestAt)];
  }
  function fittedImageOutputFrameWidth(cellWidth, cellHeight, ratio, fieldsHeight, cardGap, verticalPadding, minimumFrameHeight) {
    const safeRatio = Math.max(.01,Number(ratio) || 16 / 9);
    const cellW = Math.max(0,Number(cellWidth) || 0), cellH = Math.max(0,Number(cellHeight) || 0);
    const maxWidth = Math.min(cellW,cellH * safeRatio);
    const minWidth = Math.min(maxWidth,Math.max(0,Number(minimumFrameHeight) || 0) * safeRatio);
    const availableHeight = Math.max(0,cellH - Math.max(0,Number(fieldsHeight) || 0) - Math.max(0,Number(cardGap) || 0) - Math.max(0,Number(verticalPadding) || 0));
    return Math.max(minWidth,Math.min(maxWidth,availableHeight * safeRatio));
  }
  function splitOutputRecord(record) {
    if (record.kind === "day-callsheet") {
      const value = String(record.value || "");
      if (value.length > 1) {
        const chunks = outputTextChunks(value,Math.max(1,Math.ceil(value.length / 2)));
        if (chunks.length > 1) return [Object.assign({},record,{value:chunks[0]}),Object.assign({},record,{value:chunks.slice(1).join(""),continuation:true,label:String(record.label || "通告資料") + "（續）"})];
      }
      return null;
    }
    if (record.kind === "timeline-entry") {
      const title = String(record.title || "");
      if (title.length > 1) {
        const chunks = outputTextChunks(title,Math.max(1,Math.ceil(title.length / 2)));
      if (chunks.length > 1) return [Object.assign({},record,{title:chunks[0]}),Object.assign({},record,{title:chunks.slice(1).join(""),continuation:true,order:"",timeLabel:"",durationLabel:"",numberHtml:"",gapNotice:"",overlapNotice:"",orderNotice:""})];
      }
      return null;
    }
    if (record.kind === "shot" && record.mode === "images") {
      const split = splitImageOnlyFieldRows(record.imageFields);
      if (!split) return null;
      const originalImageFieldLabels = record.originalImageFieldLabels || (record.imageFields || []).map((row) => String(row && row.label || ""));
      return [
        Object.assign({},record,{imageFields:split[0],originalImageFieldLabels:originalImageFieldLabels}),
        Object.assign({},record,{imageFields:split[1],originalImageFieldLabels:originalImageFieldLabels,continuation:true,densityItem:false,art:"",showArt:false})
      ];
    }
    const text = String(record.text || "");
    if (text.length > 1) {
      const chunks = outputTextChunks(text,Math.max(1,Math.floor(text.length / 2)));
      if (chunks.length > 1) return [Object.assign({},record,{text:chunks[0]}),Object.assign({},record,{text:chunks.slice(1).join(""),continuation:true,art:"",gapNotice:""})];
    }
    if (Array.from(text).length === 1 && record.art) return [Object.assign({},record,{text:""}),Object.assign({},record,{text:text,continuation:true,art:"",gapNotice:""})];
    return null;
  }
  function outputRecordHtml(record) {
    if (record.kind === "day-heading") {
      return '<div class="output-day-heading" data-density-item="false"><div class="output-day-heading-copy"><strong>' + escapeHtml(record.projectTitle || record.title || "拍攝日") + '</strong><span>' + escapeHtml(record.title || "拍攝日") + ' · ' + escapeHtml(record.date || "") + ' · 集合 ' + escapeHtml(record.start || "") + '</span></div></div>';
    }
    if (record.kind === "day-callsheet") return '<div class="output-day-call-sheet-field' + (record.className ? " " + escapeHtml(record.className) : "") + (record.continuation ? " is-continuation" : "") + '" data-density-item="false"><strong>' + escapeHtml(record.label || "通告資料") + '</strong><span>' + escapeHtml(record.value || "") + '</span></div>';
    if (record.kind === "day-empty") return '<div class="output-day-empty" data-density-item="false">尚無排程項目</div>';
    if (record.kind === "section-empty") return '<div class="output-day-empty output-section-empty" data-density-item="false">' + escapeHtml(record.text || "此區目前沒有項目。") + '</div>';
    if (record.kind === "timeline-entry") {
      const timing = record.continuation ? "" : [record.timeLabel,record.durationLabel].filter(Boolean).join("　·　");
      const notices = [record.gapNotice ? '<span class="output-card-note">' + escapeHtml(record.gapNotice) + '</span>' : "",record.overlapNotice ? '<span class="output-card-note is-overlap">' + escapeHtml(record.overlapNotice) + '</span>' : "",record.orderNotice ? '<span class="output-card-note is-overlap">' + escapeHtml(record.orderNotice) + '</span>' : ""].filter(Boolean).join("");
      const hasTitle = String(record.title == null ? "" : record.title).trim() !== "";
      const title = hasTitle ? String(record.title) : record.entryType === "shot" ? "" : (record.title || "未命名活動");
      const titleMarkup = title ? '<strong>' + escapeHtml(title + (record.continuation ? "（續）" : "")) + '</strong>' : "";
      return '<div class="output-record-wrap" data-output-record="' + escapeHtml(record.key || "") + '"><article class="output-timeline-entry ' + (record.isBreak ? "is-break " : "") + (record.continuation ? "is-continuation" : "") + '"><span class="output-timeline-order">' + escapeHtml(record.continuation ? "" : record.order || "") + '</span><div class="output-timeline-main"><div class="output-timeline-top">' + titleMarkup + '<span>' + escapeHtml(timing) + '</span></div>' + (!record.continuation && record.numberHtml ? '<div class="output-timeline-shot">' + record.numberHtml + '</div>' : "") + (notices ? '<div class="output-card-notes">' + notices + '</div>' : "") + '</div></article></div>';
    }
    const artMarkup = record.art || '<div class="output-empty-art ' + (record.imageMessage ? "is-error" : "") + '" role="img" aria-label="' + escapeHtml(record.imageMessage || "尚未建立分鏡圖") + '">' + escapeHtml(record.imageMessage || "尚未建立分鏡圖") + '</div>';
    if (record.kind === "shot" && record.mode === "images") {
      const continuation = Boolean(record.continuation);
      const rows = (record.imageFields || []).filter((row) => String(row.value == null ? "" : row.value).trim() !== "").map((row) => '<div class="output-image-field' + (row.continuationValue ? ' is-value-continuation' : '') + '"><strong>' + escapeHtml(row.label) + (row.continuationValue ? ' <span class="output-field-continuation-mark">（續）</span>' : '') + '</strong><span>' + escapeHtml(row.value).replace(/\r?\n/g,"<br>") + '</span></div>').join("");
      const hasFields = !!rows;
      const originalLabels = record.originalImageFieldLabels || (record.imageFields || []).map((row) => String(row && row.label || ""));
      const continuationNumber = record.numberHtml && !originalLabels.includes("鏡次") ? '<span>' + record.numberHtml + '</span>' : "";
      const continuationTitle = record.title && !originalLabels.includes("標題") ? '<strong>' + escapeHtml(record.title) + '</strong>' : "";
      const continuationHeading = continuation ? '<div class="output-image-only-continuation-label">' + (continuationNumber || continuationTitle ? continuationNumber + continuationTitle : '<strong>分鏡圖欄位續頁</strong>') + '</div>' : "";
      return '<div class="output-record-wrap is-image-only' + (continuation ? ' is-image-only-continuation' : '') + '" data-output-record="' + escapeHtml(record.key || "") + '"><article class="output-card is-image-only ' + (hasFields ? "has-image-fields " : "") + (continuation ? "is-image-only-continuation" : "") + '">' + continuationHeading + (!continuation ? '<div class="output-card-art">' + artMarkup + '</div>' : "") + (hasFields ? '<div class="output-image-fields">' + rows + '</div>' : '') + '</article></div>';
    }
    const isSchedule = record.kind === "schedule"; const continuation = Boolean(record.continuation);
    const showArt = !continuation && record.showArt;
    const art = showArt ? '<div class="output-card-art">' + artMarkup + '</div>' : '<div class="output-card-art is-empty" aria-hidden="true"></div>';
    const baseTitle = outputShortTitle(record.title,48);
    const title = continuation ? (isSchedule ? "拍攝項目說明（續）" : (baseTitle || "鏡頭內容") + "（續）") : baseTitle;
    const detail = escapeHtml(record.text || "").replace(/\r?\n/g,"<br>");
    const gap = !continuation && record.gapNotice ? '<div class="output-gap-note">' + escapeHtml(record.gapNotice) + '</div>' : "";
    const extras = [record.overlapNotice ? '<span class="output-card-note is-overlap">' + escapeHtml(record.overlapNotice) + '</span>' : "",record.status ? '<span class="output-card-note">' + escapeHtml(record.status) + '</span>' : ""].filter(Boolean).join("");
    const scheduleOrder = isSchedule ? '<span class="output-card-order">現場 ' + escapeHtml(record.order || "") + '</span>' : "";
    return '<div class="output-record-wrap" data-output-record="' + escapeHtml(record.key || "") + '">' + gap + '<article class="output-card ' + (isSchedule ? "is-schedule " : "") + (showArt ? "has-art " : "") + (record.isBreak ? "is-break " : "") + (continuation ? "is-continuation " : "") + (record.forceCompact ? "is-force-compact" : "") + '">' + art + '<div class="output-card-main"><div class="output-card-top"><div class="output-card-heading">' + scheduleOrder + '<div class="output-card-number">' + (record.numberHtml || "") + '</div>' + (title ? '<h3>' + escapeHtml(title) + '</h3>' : '') + '</div><div class="output-card-time">' + (record.timeLabel ? '<strong>' + escapeHtml(record.timeLabel) + '</strong>' : "") + (record.durationLabel ? '<small>' + escapeHtml(record.durationLabel) + '</small>' : "") + '</div></div>' + (extras ? '<div class="output-card-notes">' + extras + '</div>' : "") + (detail ? '<div class="output-card-detail">' + detail + '</div>' : '') + '</div></article></div>';
  }
  function outputPageHtml(context, records, pageIndex, pageCount) {
    const body = records.length ? records.map(outputRecordHtml).join("") : '<div class="output-page-empty">此輸出範圍目前沒有項目。</div>';
    const section = records.map((record) => record && record.section).find(Boolean) || context.activeSection || "timeline";
    const pageDayIds = Array.from(new Set(records.map((record) => record.dayId).filter(Boolean)));
    const pageDay = pageDayIds.length === 1 && context.dayMeta ? context.dayMeta[pageDayIds[0]] : null;
    const pageSubtitle = context.kind === "schedule" ? scheduleSectionLabel(section) + "　·　" + (context.subtitle || "") : pageDay ? (context.subtitle || "") + "　·　" + formatDate(pageDay.date,true) + "　·　" + pageDay.title : context.subtitle || "";
    const pageFooter = pageDay ? (pageDay.title || "拍攝日") + " · " + pageDay.date : context.footer || context.projectTitle || state.title;
    const layout = context.kind === "schedule" ? (section === "timeline" ? "schedule-timeline" : section === "storyboard" ? "images" : "schedule") : (context.kind === "storyboard" && context.mode === "images" ? "images" : "details");
    return '<section class="output-page ' + (context.orientation === "portrait" ? "is-portrait" : "is-landscape") + '" data-section="' + escapeHtml(section) + '" data-layout="' + layout + '" data-density="' + context.density + '"><header class="output-page-header"><div class="output-page-heading"><div class="output-page-brand">KINO STORYBOARD　·　' + escapeHtml(context.brand || "OUTPUT") + '</div><h1>' + escapeHtml(context.projectTitle || state.title) + '</h1><p>' + escapeHtml(pageSubtitle) + '</p></div><div class="output-page-summary"><strong>' + escapeHtml(context.scope || "") + '</strong><span>' + escapeHtml(context.summary || "") + '</span></div></header><div class="output-page-body">' + body + '</div><footer class="output-page-footer"><span>' + escapeHtml(pageFooter) + ' · Project revision ' + escapeHtml(context.projectRevision == null ? "—" : context.projectRevision) + ' · Preference revision ' + escapeHtml(context.preferenceRevision == null ? "—" : context.preferenceRevision) + '</span><span>第 ' + (pageIndex + 1) + ' 頁／共 ' + pageCount + ' 頁</span></footer></section>';
  }
  function paginateOutputRecords(records, pageSize) {
    const pages = [];
    for (let i = 0; i < records.length; i += pageSize) pages.push(records.slice(i,i + pageSize));
    return pages.length ? pages : [[]];
  }
  function schedulePageHeading(page) {
    return (page || []).find((record) => record && record.kind === "day-heading") || null;
  }
  function insertScheduleRecordAfterHeading(page, record) {
    const headingIndex = (page || []).findIndex((item) => item && item.kind === "day-heading");
    page.splice(headingIndex < 0 ? 0 : headingIndex + 1,0,record);
  }
  function insertScheduleCarryPage(pages, sourceIndex, record) {
    const sourceHeading = schedulePageHeading(pages[sourceIndex]);
    const nextIndex = sourceIndex + 1;
    const nextHeading = schedulePageHeading(pages[nextIndex]);
    if (nextHeading && sourceHeading && nextHeading.dayId === sourceHeading.dayId && nextHeading.section === sourceHeading.section) {
      insertScheduleRecordAfterHeading(pages[nextIndex],record);
      return;
    }
    if (sourceHeading) pages.splice(nextIndex,0,[Object.assign({},sourceHeading),record]);
    else if (pages[nextIndex]) pages[nextIndex].unshift(record);
    else pages.splice(nextIndex,0,[record]);
  }
  function carryLastCallsheetRecord(pages, sourceIndex) {
    const page = pages[sourceIndex] || [];
    let moveAt = -1;
    for (let index = page.length - 1; index >= 0; index -= 1) {
      if (page[index] && page[index].kind === "day-callsheet") { moveAt = index; break; }
    }
    if (moveAt < 0) return false;
    insertScheduleCarryPage(pages,sourceIndex,page.splice(moveAt,1)[0]);
    return true;
  }
  function enforceOutputPageLimit(pages, pageSize, scheduleMode) {
    const schedulePages = scheduleMode === true || pages.some((page) => schedulePageHeading(page));
    const countsTowardDensity = (record) => !(record && record.densityItem === false);
    for (let i = 0; i < pages.length; i += 1) while (pages[i].filter(countsTowardDensity).length > pageSize) {
      let moveAt = -1;
      for (let index = pages[i].length - 1; index >= 0; index -= 1) if (countsTowardDensity(pages[i][index])) { moveAt = index; break; }
      if (moveAt < 0) break;
      const carry = pages[i].splice(moveAt,1)[0];
      if (schedulePages) insertScheduleCarryPage(pages,i,carry);
      else {
        if (!pages[i + 1]) pages.splice(i + 1,0,[]);
        pages[i + 1].unshift(carry);
      }
    }
    for (let i = pages.length - 1; i > 0; i -= 1) if (!pages[i].length) pages.splice(i,1);
    return pages.length ? pages : [[]];
  }
  function buildScheduleEntryViews(dayRows, options) {
    const prefs = options || {};
    const timeline = dayRows.map((row) => Object.assign({},row,{kind:"timeline-entry",section:"timeline"}));
    const rundown = dayRows.map((row) => {
      const isBreak = row.entryType === "break";
      const showArt = !!prefs.rundownThumbnails && !isBreak && !!row.shotId;
      const details = [];
      if (prefs.rundownNotes && String(row.notes || "").trim()) details.push("現場備註｜" + row.notes);
      return Object.assign({},row,{
        kind:"schedule",section:"rundown",showArt:showArt,art:showArt ? row.art || "" : "",
        imageMessage:showArt ? row.imageMessage || "" : "",text:details.join("\n"),
        status:prefs.rundownStatus ? row.status || "" : "",gapNotice:"",overlapNotice:"",orderNotice:""
      });
    });
    const storyboard = dayRows.filter((row) => row.entryType === "shot" && row.shotId).map((row) => {
      const imageFields = [];
      if (prefs.storyboardShotNumber && String(row.shotNumber || "").trim()) imageFields.push({label:"鏡次",value:row.shotNumber});
      if (prefs.storyboardTitle && String(row.shotTitle || "").trim()) imageFields.push({label:"標題",value:row.shotTitle});
      return Object.assign({},row,{
        kind:"shot",mode:"images",section:"storyboard",imageFields:imageFields,gapNotice:"",overlapNotice:"",orderNotice:"",
        numberHtml:"",title:"",text:"",status:"",showArt:true
      });
    });
    return {timeline:timeline,rundown:rundown,storyboard:storyboard};
  }
  function buildScheduleSectionPages(daySections, pageSize) {
    const pages = [];
    const sections = [
      {key:"timeline",rowsKey:"timelineRows",empty:"尚無排程項目。"},
      {key:"rundown",rowsKey:"rundownRows",empty:"尚無 Rundown 項目。"},
      {key:"storyboard",rowsKey:"storyboardRows",empty:"此日沒有已排入的拍攝鏡頭；休息項目只列在 Rundown。"}
    ];
    const size = Math.max(1,Number(pageSize) || 1);
    (daySections || []).forEach((day) => {
      sections.forEach((section) => {
        const rows = (day[section.rowsKey] || []).map((row) => Object.assign({},row,{dayId:day.dayId,section:section.key}));
        const metaRows = section.key === "timeline" ? (day.callsheetRows || []).map((row) => Object.assign({},row,{dayId:day.dayId,section:section.key})) : [];
        const content = rows.length ? rows : [{kind:"section-empty",text:section.empty,dayId:day.dayId,section:section.key,densityItem:false}];
        for (let cursor=0;cursor<content.length;cursor+=size) {
          const header = Object.assign({},day.header,{dayId:day.dayId,section:section.key});
          pages.push([header,...(cursor === 0 ? metaRows : []),...content.slice(cursor,cursor+size)]);
        }
      });
    });
    return pages.length ? pages : [[]];
  }
  function outputImageGridRows(imageCount, columns, fullWidthRows) {
    const images = Math.max(0,Number(imageCount) || 0);
    const cols = Math.max(1,Number(columns) || 1);
    const prelude = Math.max(0,Number(fullWidthRows) || 0);
    return Math.max(1,Math.ceil(images / cols) + prelude);
  }
  function outputImageGridCapacity(pages) {
    return (pages || []).reduce((capacity,page) => Math.max(capacity,(page || []).filter((record) => record && record.kind === "shot" && record.mode === "images" && record.continuation !== true && record.densityItem !== false).length),0);
  }
  function updateOutputPageSummary(context) {
    const activeSection = context.kind === "schedule" ? (context.activeSection || outputScheduleSection) : null;
    const visiblePages = activeSection ? context.pages.filter((page) => page.some((record) => record && record.section === activeSection)) : context.pages;
    const pageCount = visiblePages.length;
    const itemCount = activeSection && context.sectionCounts ? context.sectionCounts[activeSection] : context.itemCount;
    const itemLabel = activeSection === "storyboard" ? "鏡" : activeSection ? "項目" : context.itemLabel;
    $("#preview-count").textContent = pageCount + " 頁 · " + itemCount + " " + itemLabel;
    const note = $("#scope-note");
    const hasImageFieldContinuations = context.mode === "images" && context.pages.some((page) => page.some((record) => record && record.kind === "shot" && record.continuation));
    const imageContinuationNote = hasImageFieldContinuations ? "；純圖欄位已依原序續頁，原每頁鏡數偏好保留。" : "";
    if (note) note.textContent = context.kind === "schedule" ? context.noteBase + "；目前預覽「" + scheduleSectionLabel(activeSection) + "」" + pageCount + " 頁，列印會依序包含三區共 " + context.pages.length + " 頁。" : context.noteBase + "；依每頁 " + context.density + " " + (context.kind === "schedule" ? "項目" : "鏡") + " 上限分頁，共 " + pageCount + " 頁。" + imageContinuationNote;
  }
  function renderOutputPages(context) {
    context.doc.innerHTML = context.pages.map((records,index) => outputPageHtml(context,records,index,context.pages.length)).join("");
    context.doc.classList.remove("has-overflow");
    if (context.kind === "schedule") {
      context.doc.dataset.activeSection = context.activeSection || outputScheduleSection;
      $$("#print-document .output-page[data-section]").forEach((page) => page.setAttribute("aria-hidden",page.dataset.section === context.doc.dataset.activeSection ? "false" : "true"));
    }
    updateOutputPageSummary(context);
  }
  function updateOutputPageScale(context) {
    const referenceWidth = context.orientation === "portrait" ? 793.7 : 1122.5;
    const pages = $$("#print-document .output-page");
    pages.forEach((page) => {
      const width = page.getBoundingClientRect().width;
      if (width > 0) page.style.setProperty("--page-scale",String(Math.min(1.35,width / referenceWidth)));
    });
    const imageLayouts = pages.filter((page) => page.dataset.layout === "images").map((page) => {
      const body = page.querySelector(".output-page-body");
      const imageWraps = Array.from(body.querySelectorAll(".output-record-wrap.is-image-only:not(.is-image-only-continuation)"));
      const sample = imageWraps[0] && imageWraps[0].querySelector(".output-card") || body.querySelector(".output-card");
      if (!sample || body.clientHeight <= 0) return null;
      const cardStyle = getComputedStyle(sample);
      return {
        page:page,body:body,imageWraps:imageWraps,
        imagePreludeRows:body.querySelectorAll(".output-record-wrap.is-image-only-continuation, .output-day-heading").length,
        padX:(parseFloat(cardStyle.paddingLeft) || 0) + (parseFloat(cardStyle.paddingRight) || 0) + 2,
        padY:(parseFloat(cardStyle.paddingTop) || 0) + (parseFloat(cardStyle.paddingBottom) || 0) + 2
      };
    }).filter(Boolean);
    const imageCapacity = Math.max(1,Number(context.density) || 1,outputImageGridCapacity(context.pages),...imageLayouts.map((layout) => layout.imageWraps.length));
    const parts = String(context.aspectRatio || "16:9").split(":").map(Number);
    const ratio = (parts[0] || 16) / (parts[1] || 9);
    let sharedImageColumns = 1;
    if (imageLayouts.length) {
      let bestArea = -1;
      for (let candidate = 1; candidate <= Math.min(imageCapacity,6); candidate++) {
        imageLayouts.forEach((layout) => {
          layout.page.style.setProperty("--output-columns",String(candidate));
          const imageCount = layout.imageWraps.length ? imageCapacity : 0;
          layout.page.style.setProperty("--output-rows",String(outputImageGridRows(imageCount,candidate,layout.imagePreludeRows)));
        });
        const candidateFrameWidths = [];
        imageLayouts.forEach((layout) => layout.imageWraps.forEach((wrap) => {
          const cellW = Math.max(1,wrap.clientWidth - layout.padX);
          const cellH = Math.max(1,wrap.clientHeight - layout.padY);
          const fields = wrap.querySelector(".output-image-fields");
          const fieldsHeight = fields ? Math.max(fields.getBoundingClientRect().height,fields.scrollHeight) : 0;
          const card = wrap.querySelector(".output-card");
          const cardGap = card ? (parseFloat(getComputedStyle(card).rowGap) || 0) : 0;
          const minimumFrameHeight = fields ? 31 * 96 / 25.4 : 0;
          candidateFrameWidths.push(fittedImageOutputFrameWidth(cellW,cellH,ratio,fieldsHeight,cardGap,layout.padY,minimumFrameHeight));
        }));
        const sharedFrameWidth = candidateFrameWidths.length ? Math.min(...candidateFrameWidths) : 0;
        const area = sharedFrameWidth * sharedFrameWidth / ratio * candidateFrameWidths.length;
        if (area > bestArea) { bestArea = area; sharedImageColumns = candidate; }
      }
      if (imageCapacity === 4 && !context.imageFieldCount) sharedImageColumns = 2;
      imageLayouts.forEach((layout) => {
        const imageCount = layout.imageWraps.length ? imageCapacity : 0;
        layout.page.style.setProperty("--output-columns",String(sharedImageColumns));
        layout.page.style.setProperty("--output-rows",String(outputImageGridRows(imageCount,sharedImageColumns,layout.imagePreludeRows)));
      });
    }
    pages.forEach((page) => {
      const body = page.querySelector(".output-page-body");
      if (!body || body.clientHeight <= 0) return;
      const imageLayout = imageLayouts.find((layout) => layout.page === page);
      if (!imageLayout) return;
      const imageCount = imageLayout.imageWraps.length ? imageCapacity : 0;
      const rows = outputImageGridRows(imageCount,sharedImageColumns,imageLayout.imagePreludeRows);
      page.style.setProperty("--output-columns",String(sharedImageColumns));
      page.style.setProperty("--output-rows",String(rows));
    });
    const imageFrameMeasurements = [];
    imageLayouts.forEach((layout) => layout.imageWraps.forEach((wrap) => {
      const art = wrap.querySelector(".output-card-art");
      if (!art) return;
      const localCellW = Math.max(1,wrap.clientWidth - layout.padX);
      const localCellH = Math.max(1,wrap.clientHeight - layout.padY);
      const fields = wrap.querySelector(".output-image-fields");
      const fieldsHeight = fields ? Math.max(fields.getBoundingClientRect().height,fields.scrollHeight) : 0;
      const card = wrap.querySelector(".output-card");
      const cardGap = card ? (parseFloat(getComputedStyle(card).rowGap) || 0) : 0;
      const minimumFrameHeight = fields ? 31 * 96 / 25.4 : 0;
      imageFrameMeasurements.push({art:art,cellWidth:localCellW,frameWidth:fittedImageOutputFrameWidth(localCellW,localCellH,ratio,fieldsHeight,cardGap,layout.padY,minimumFrameHeight)});
    }));
    const sharedImageFrameWidth = imageFrameMeasurements.length ? Math.min(...imageFrameMeasurements.map((measurement) => measurement.frameWidth)) : 0;
    imageFrameMeasurements.forEach((measurement) => measurement.art.style.setProperty("--output-frame-width",String(Math.min(100,sharedImageFrameWidth / measurement.cellWidth * 100)) + "%"));
    pages.forEach((page) => {
      const body = page.querySelector(".output-page-body");
      if (!body || body.clientHeight <= 0 || imageLayouts.some((layout) => layout.page === page)) return;
      const sample = body.querySelector(".output-card");
      if (!sample) {
        page.style.setProperty("--output-columns","1");
        page.style.setProperty("--output-rows",String(Math.max(1,body.children.length)));
        return;
      }
      const bodyStyle = getComputedStyle(body), cardStyle = getComputedStyle(sample);
      const gap = parseFloat(bodyStyle.rowGap) || 0, colGap = parseFloat(bodyStyle.columnGap) || 0;
      const padX = (parseFloat(cardStyle.paddingLeft) || 0) + (parseFloat(cardStyle.paddingRight) || 0) + 2;
      const padY = (parseFloat(cardStyle.paddingTop) || 0) + (parseFloat(cardStyle.paddingBottom) || 0) + 2;
      let columns = 1;
      const rows = Math.max(1,body.children.length);
      page.style.setProperty("--output-columns",String(columns));
      page.style.setProperty("--output-rows",String(rows));
      const cellW = Math.max(1,(body.clientWidth - colGap * (columns - 1)) / columns - padX);
      const cellH = Math.max(1,(body.clientHeight - gap * (rows - 1)) / rows - padY);
      if (page.classList.contains("is-portrait") && page.dataset.layout === "details") {
        const cardGap = parseFloat(cardStyle.rowGap) || 0;
        Array.from(body.children).forEach((wrap) => {
          const art = wrap.querySelector(".output-card-art");
          const main = wrap.querySelector(".output-card-main");
          if (!art || !main) return;
          const availableArtHeight = Math.max(1,cellH - main.getBoundingClientRect().height - cardGap);
          const maxFrameWidth = Math.max(1,Math.min(cellW,cellH * ratio));
          const minFrameWidth = maxFrameWidth * .4;
          const frameWidth = Math.max(minFrameWidth,Math.min(cellW,availableArtHeight * ratio));
          art.style.setProperty("--output-frame-width",String(Math.min(100,frameWidth / cellW * 100)) + "%");
        });
        return;
      }
      const frameW = Math.max(1,Math.min(cellW * .46,cellH * ratio));
      page.style.setProperty("--output-frame-width",String(Math.min(100,frameW / cellW * 100)) + "%");
    });
    return pages;
  }
  function scheduleOutputLayout(context) {
    const version = ++outputLayoutVersion;
    activeOutputContext = context;
    context.layoutReady = false;
    context.layoutBlocked = false;
    updateOutputPrintAvailability(context);
    requestAnimationFrame(() => balanceOutputPages(context,version,0));
  }
  function updateOutputPrintAvailability(context) {
    const button = $("#print-output");
    if (button) button.disabled = !!outputPrintPreparation || !context || !context.layoutReady || context.layoutBlocked || context.printGeometryBlocked || context.capturePending || !!(context.captureBlockers && context.captureBlockers.length);
  }
  function finishOutputPrintPreparation(session, restorePreview) {
    if (!session || session.finished) return;
    session.finished = true;
    if (session.afterPrintTimer) clearTimeout(session.afterPrintTimer);
    if (outputPrintPreparation === session) outputPrintPreparation = null;
    document.documentElement.classList.remove("output-print-preparing");
    if (restorePreview && session.context && activeOutputContext === session.context && !session.context.capturePending) scheduleOutputLayout(session.context);
    else updateOutputPrintAvailability(activeOutputContext);
  }
  function cancelOutputPrintPreparation() {
    const session = outputPrintPreparation;
    if (!session || session.printInvoked) return;
    session.cancelled = true;
    finishOutputPrintPreparation(session,true);
  }
  function assertOutputPrintPreparationCurrent(session) {
    if (!session || session.cancelled || session.finished || outputPrintPreparation !== session) throw Object.assign(new Error("輸出選項或預覽已切換；本次列印準備已取消。"),{code:"OUTPUT_PRINT_PREPARATION_CANCELLED"});
    if (session.context && (session.context !== activeOutputContext || session.context.version !== outputCaptureVersion)) throw Object.assign(new Error("列印準備期間輸出快照已更新；請確認新的預覽再列印。"),{code:"OUTPUT_PRINT_SNAPSHOT_CHANGED"});
  }
  function outputPrintLayoutFingerprint(context) {
    const pages = $$("#print-document .output-page");
    return JSON.stringify([pages.map((page) => {
      const rect = page.getBoundingClientRect();
      const body = page.querySelector(".output-page-body");
      const header = page.querySelector(".output-page-header");
      const footer = page.querySelector(".output-page-footer");
      const measure = (element) => {
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return [box.width,box.height,element.clientWidth,element.clientHeight,element.scrollWidth,element.scrollHeight].map((value) => Math.round(value * 4) / 4);
      };
      return [Math.round(rect.width * 4) / 4,Math.round(rect.height * 4) / 4,measure(header),measure(body),measure(footer),body ? body.children.length : 0];
    }),context.pages.length,outputLayoutVersion]);
  }
  async function waitForOutputPrintResource(promise, label) {
    let timer = 0;
    try {
      return await Promise.race([promise,new Promise((_,reject) => { timer = setTimeout(() => reject(Object.assign(new Error(label + " 準備逾時；本次列印已取消。"),{code:"OUTPUT_PRINT_RESOURCE_TIMEOUT"})),12000); })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  async function waitForOutputPrintResources(context, session) {
    if (document.fonts && document.fonts.ready) await waitForOutputPrintResource(Promise.resolve(document.fonts.ready),"字型");
    assertOutputPrintPreparationCurrent(session);
    const images = Array.from(context.doc.querySelectorAll(".output-real-image"));
    await Promise.all(images.map(async (image) => {
      if (!image.isConnected) throw Object.assign(new Error("輸出圖像在列印準備期間被替換；請重新確認預覽。"),{code:"OUTPUT_PRINT_IMAGE_REPLACED"});
      if (typeof image.decode === "function") await waitForOutputPrintResource(image.decode(),"分鏡圖像");
      else if (!image.complete) await waitForOutputPrintResource(new Promise((resolve,reject) => {
        image.addEventListener("load",resolve,{once:true});
        image.addEventListener("error",() => reject(Object.assign(new Error("分鏡圖像載入失敗。"),{code:"OUTPUT_PRINT_IMAGE_FAILED"})),{once:true});
      }),"分鏡圖像");
      if (!(image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)) throw Object.assign(new Error("分鏡圖像未完整解碼；本次列印已取消。"),{code:"OUTPUT_PRINT_IMAGE_FAILED"});
    }));
    assertOutputPrintPreparationCurrent(session);
  }
  async function waitForOutputPrintLayout(context, session) {
    let previous = "";
    let stableFrames = 0;
    for (let frame = 0; frame < 240; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      assertOutputPrintPreparationCurrent(session);
      if (!context.layoutReady) { previous = ""; stableFrames = 0; continue; }
      if (context.layoutBlocked) {
        context.printGeometryBlocked = true;
        updateOutputPrintAvailability(context);
        throw Object.assign(new Error("A4 實際紙張幾何仍有內容溢出，內容已保留並暫停列印。"),{code:"OUTPUT_PRINT_GEOMETRY_BLOCKED"});
      }
      const fingerprint = outputPrintLayoutFingerprint(context);
      stableFrames = fingerprint === previous ? stableFrames + 1 : 0;
      previous = fingerprint;
      if (stableFrames >= 2) return;
    }
    throw Object.assign(new Error("A4 列印版面在限定時間內沒有穩定；本次列印已取消。"),{code:"OUTPUT_PRINT_LAYOUT_UNSTABLE"});
  }
  async function prepareOutputForPrint(session, context) {
    assertOutputPrintPreparationCurrent(session);
    if (context !== activeOutputContext || context.capturePending) throw Object.assign(new Error("輸出快照尚未就緒；本次列印已取消。"),{code:"OUTPUT_CAPTURE_NOT_READY"});
    assertOutputCaptureCurrent(context);
    await waitForOutputPrintResources(context,session);
    assertOutputCaptureCurrent(context);
    document.documentElement.classList.add("output-print-preparing");
    session.geometryPrepared = true;
    scheduleOutputLayout(context);
    await waitForOutputPrintLayout(context,session);
    assertOutputCaptureCurrent(context);
    assertOutputPrintPreparationCurrent(session);
  }
  function balanceOutputPages(context, version, pass) {
    if (version !== outputLayoutVersion || activeOutputContext !== context) return;
    const stage = $("#preview-stage");
    if (!stage || stage.clientWidth < 20) return;
    const pages = updateOutputPageScale(context);
    let overflowIndex = -1;
    pages.forEach((page,index) => {
      const body = page.querySelector(".output-page-body");
      if (overflowIndex >= 0 || !body || body.clientHeight <= 0) return;
      const wraps = Array.from(body.children);
      const pageBox = page.getBoundingClientRect();
      const pageStyle = getComputedStyle(page);
      const innerTop = pageBox.top + (parseFloat(pageStyle.paddingTop) || 0);
      const innerBottom = pageBox.bottom - (parseFloat(pageStyle.paddingBottom) || 0);
      const header = page.querySelector(".output-page-header");
      const footer = page.querySelector(".output-page-footer");
      const pageChromeOverflow = page.scrollHeight > page.clientHeight + 2 ||
        !!(header && (header.getBoundingClientRect().top < innerTop - 2 || header.getBoundingClientRect().bottom > body.getBoundingClientRect().top + 2)) ||
        !!(footer && (footer.getBoundingClientRect().top < body.getBoundingClientRect().bottom - 2 || footer.getBoundingClientRect().bottom > innerBottom + 2));
      const childOverflow = wraps.some((wrap) => {
        const main = wrap.querySelector(".output-card-main");
        const card = wrap.querySelector(".output-card");
        return [main,card,wrap].filter(Boolean).some(el => el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2);
      });
      if (pageChromeOverflow || childOverflow || body.scrollHeight > body.clientHeight + 2) overflowIndex = index;
    });
    if (overflowIndex < 0) { context.layoutReady = true; updateOutputPageSummary(context); updateOutputPrintAvailability(context); return; }
    if (pass >= 120) {
      context.layoutBlocked = true; context.layoutReady = true;
      message("A4 分頁仍有溢出，內容完整保留但暫停列印；請調低每頁數量或調整紙張方向。",true);
      updateOutputPrintAvailability(context);
      return;
    }
    const pageRecords = context.pages[overflowIndex];
    const densityIndexes = pageRecords.map((record,index) => record && record.densityItem === false ? -1 : index).filter((index) => index >= 0);
    const scheduleMode = context.kind === "schedule";
    const callsheetIndexes = scheduleMode ? pageRecords.map((record,index) => record && record.kind === "day-callsheet" ? index : -1).filter((index) => index >= 0) : [];
    if (densityIndexes.length > 1 || (!scheduleMode && pageRecords.length > 1)) {
      const moveAt = densityIndexes.length ? densityIndexes[densityIndexes.length - 1] : pageRecords.length - 1;
      const moved = pageRecords.splice(moveAt,1)[0];
      if (scheduleMode) insertScheduleCarryPage(context.pages,overflowIndex,moved);
      else {
        if (!context.pages[overflowIndex + 1]) context.pages.splice(overflowIndex + 1,0,[]);
        context.pages[overflowIndex + 1].unshift(moved);
      }
    } else if (scheduleMode && callsheetIndexes.length && (densityIndexes.length > 0 || callsheetIndexes.length > 1)) {
      carryLastCallsheetRecord(context.pages,overflowIndex);
    } else if (densityIndexes.length === 1 || (!scheduleMode && pageRecords.length === 1)) {
      const recordIndex = densityIndexes.length ? densityIndexes[0] : 0;
      const split = splitOutputRecord(pageRecords[recordIndex]);
      if (split) {
        pageRecords[recordIndex] = split[0];
        if (scheduleMode) insertScheduleCarryPage(context.pages,overflowIndex,split[1]);
        else {
          if (!context.pages[overflowIndex + 1]) context.pages.splice(overflowIndex + 1,0,[]);
          context.pages[overflowIndex + 1].unshift(split[1]);
        }
      } else {
        context.layoutBlocked = true; context.layoutReady = true;
        message("單一項目仍超出 A4 可用高度，內容已保留並暫停列印。",true);
        updateOutputPrintAvailability(context);
        return;
      }
    } else if (scheduleMode && callsheetIndexes.length === 1) {
      const recordIndex = callsheetIndexes[0];
      const split = splitOutputRecord(pageRecords[recordIndex]);
      if (split) {
        pageRecords[recordIndex] = split[0];
        insertScheduleCarryPage(context.pages,overflowIndex,split[1]);
      } else {
        context.layoutBlocked = true; context.layoutReady = true;
        message("單一通告欄位仍超出 A4 可用高度，內容已保留並暫停列印。",true);
        updateOutputPrintAvailability(context);
        return;
      }
    } else {
      context.layoutBlocked = true; context.layoutReady = true;
      message("頁面標題或空日資訊仍超出 A4 可用高度，內容已保留並暫停列印。",true);
      updateOutputPrintAvailability(context);
      return;
    }
    context.pages = enforceOutputPageLimit(context.pages,context.density,scheduleMode);
    renderOutputPages(context);
    requestAnimationFrame(() => balanceOutputPages(context,version,pass + 1));
  }
  function bindOutputResize() {
    if (outputLayoutBound) return;
    outputLayoutBound = true;
    const stage = $("#preview-stage");
    const handleWidth = (width) => {
      if (!width || Math.abs(width - outputStageWidth) < 2) return;
      outputStageWidth = width;
      if (activeOutputContext) {
        activeOutputContext.pages = enforceOutputPageLimit(activeOutputContext.pages || paginateOutputRecords(activeOutputContext.records,activeOutputContext.density),activeOutputContext.density,activeOutputContext.kind === "schedule");
        renderOutputPages(activeOutputContext); scheduleOutputLayout(activeOutputContext);
      }
    };
    if (window.ResizeObserver && stage) {
      outputLayoutObserver = new ResizeObserver((entries) => { if (entries[0]) handleWidth(entries[0].contentRect.width); });
      outputLayoutObserver.observe(stage);
    } else window.addEventListener("resize",() => handleWidth(stage ? stage.clientWidth : window.innerWidth));
  }
  function renderPagedOutput(context) {
    context.pages = enforceOutputPageLimit(context.pages || paginateOutputRecords(context.records,context.density),context.density,context.kind === "schedule");
    renderOutputPages(context); bindOutputResize(); scheduleOutputLayout(context);
  }
  function outputShotNumberResolution(snapshot) {
    const project = snapshot && snapshot.project;
    if (!project || typeof project !== "object") throw Object.assign(new Error("輸出快照缺少 Project，無法解析鏡次。"),{code:"OUTPUT_SHOT_NUMBER_UNAVAILABLE"});
    if (outputShotNumberResolutions.has(project)) return outputShotNumberResolutions.get(project);
    const bridge = window.StoryProjectBridge;
    if (!bridge || typeof bridge.resolveShotNumbers !== "function") throw Object.assign(new Error("鏡次解析器尚未載入，無法建立輸出。"),{code:"OUTPUT_SHOT_NUMBER_UNAVAILABLE"});
    const resolution = bridge.resolveShotNumbers(project);
    if (!resolution || !resolution.shotNumbers || typeof resolution.shotNumbers !== "object" || !Array.isArray(resolution.conflicts)) throw Object.assign(new Error("鏡次解析結果無效，無法建立輸出。"),{code:"OUTPUT_SHOT_NUMBER_UNAVAILABLE"});
    outputShotNumberResolutions.set(project,resolution);
    return resolution;
  }
  function outputShotNumberConflictError(snapshot, conflict) {
    const sceneIndex = snapshot.ui.chapters.findIndex((scene) => scene.id === conflict.sceneId);
    const sceneLabel = sceneIndex >= 0 ? "場次 " + (sceneIndex + 1) : "某場次";
    const order = snapshot.project.shotOrderByScene && snapshot.project.shotOrderByScene[conflict.sceneId];
    const names = (conflict.shotIds || []).map((id) => {
      const shot = snapshot.ui.shots.find((item) => item.id === id);
      const title = shot ? shotTitleOrNumber(shot, snapshotShotNumber(snapshot, shot)) : "";
      const index = Array.isArray(order) ? order.indexOf(id) : -1;
      return "「" + title + "」" + (index >= 0 ? "（第 " + (index + 1) + " 鏡）" : "");
    });
    const number = conflict.shotNo == null ? "未知" : String(conflict.shotNo);
    return Object.assign(new Error("輸出範圍中的" + sceneLabel + "有鏡次 " + number + " 重複鎖定" + (names.length ? "：" + names.join("、") : "") + "。請回到「分鏡創作」，在其中一張鏡頭卡按「解除鏡次鎖定」，再重新預覽輸出。"), {code:"OUTPUT_SHOT_NUMBER_CONFLICT"});
  }
  function snapshotShotSequence(snapshot, shot) {
    const resolution = outputShotNumberResolution(snapshot);
    const conflict = resolution.conflicts.find((item) => item && Array.isArray(item.shotIds) && item.shotIds.includes(shot.id));
    if (conflict) throw outputShotNumberConflictError(snapshot, conflict);
    return Object.prototype.hasOwnProperty.call(resolution.shotNumbers,shot.id) ? String(resolution.shotNumbers[shot.id]) : "—";
  }
  function snapshotShotNumber(snapshot, shot) {
    const sceneIndex = snapshot.ui.chapters.findIndex((scene) => scene.id === shot.chapterId);
    return "場次 " + (sceneIndex + 1) + "／鏡次 " + snapshotShotSequence(snapshot,shot);
  }
  function snapshotShotLabel(snapshot, shot) {
    const sceneIndex = snapshot.ui.chapters.findIndex((scene) => scene.id === shot.chapterId);
    return '<span class="shot-identifiers">' + numberLabel("場次",sceneIndex + 1) + '<span class="number-divider" aria-hidden="true">／</span>' + numberLabel("鏡次",snapshotShotSequence(snapshot,shot)) + '</span>';
  }
  function snapshotOutputShots(snapshot) {
    if (outputScope === "selected") return snapshot.ui.shots.filter((shot) => shot.id === selectedShotId);
    if (outputScope === "chapter") {
      const selected = snapshot.ui.shots.find((shot) => shot.id === selectedShotId);
      const chapterId = activeChapterId !== "all" ? activeChapterId : selected && selected.chapterId;
      return snapshot.ui.shots.filter((shot) => shot.chapterId === chapterId);
    }
    return snapshot.ui.shots.slice();
  }
  function snapshotImageSources(snapshot, shot) {
    const canonical = snapshot.project.shots.find((item) => item.id === shot.id);
    if (!canonical) throw Object.assign(new Error("捕獲快照找不到來源鏡頭。"),{code:"OUTPUT_SHOT_MISSING"});
    const sources = [];
    (canonical.assetIds || []).forEach((id,index) => {
      const metadata = snapshot.project.assets.find((asset) => asset.id === id);
      sources.push({type:"photo",id:id,metadata:metadata || null,label:"照片 · " + String(metadata && (metadata.originalName || metadata.fileName || metadata.name) || "照片 " + (index + 1))});
    });
    (canonical.drawingIds || []).forEach((id,index) => {
      const drawing = snapshot.project.drawings.find((item) => item.id === id);
      sources.push({type:"drawing",id:id,drawing:drawing || null,label:"手繪 · " + (drawing ? "revision " + drawing.revision + " · " + drawing.canvas.aspectRatio : "Drawing " + (index + 1))});
    });
    return sources;
  }
  function renderOutputSourceChoices(snapshot, shots) {
    const host = $("#output-image-source-list"); const rows = [];
    (shots || []).forEach((shot) => {
      const sources = snapshotImageSources(snapshot,shot); const key = outputImageSourceKey(snapshot.project.projectId,shot.id);
      if (sources.length === 1 && !outputImageSourceChoices.has(key)) outputImageSourceChoices.set(key,{type:sources[0].type,id:sources[0].id});
      if (sources.length < 2) return;
      const current = outputImageSourceChoices.get(key);
      const currentValid = current && sources.some((source) => source.type === current.type && source.id === current.id);
      if (!currentValid) outputImageSourceChoices.delete(key);
      const selected = currentValid ? JSON.stringify(current) : "";
      const options = ['<option value="">選擇本次輸出的照片或 Drawing</option>'].concat(sources.map((source) => {
        const value = JSON.stringify({type:source.type,id:source.id});
        return '<option value="' + escapeHtml(value) + '" ' + (value === selected ? "selected" : "") + '>' + escapeHtml(source.label) + '</option>';
      })).join("");
      rows.push('<label class="output-image-source-row"><span>' + escapeHtml(shotNumberWithTitle(shot, " · ", snapshotShotNumber(snapshot, shot))) + '</span><select class="select-control" data-output-source-shot="' + escapeHtml(shot.id) + '">' + options + '</select></label>');
    });
    host.innerHTML = rows.join("");
    $("#output-image-source-panel").hidden = rows.length === 0;
    return rows.length;
  }
  function outputSourceForShot(snapshot, shot) {
    const sources = snapshotImageSources(snapshot,shot);
    if (!sources.length) return {source:null,sources:sources};
    const key = outputImageSourceKey(snapshot.project.projectId,shot.id); const choice = outputImageSourceChoices.get(key);
    const selected = choice && sources.find((source) => source.type === choice.type && source.id === choice.id);
    if (selected) return {source:selected,sources:sources};
    if (sources.length === 1) return {source:sources[0],sources:sources};
    return {source:null,sources:sources};
  }
  async function decodeOutputBlob(blob, context) {
    if (!(blob instanceof Blob)) throw Object.assign(new Error("Model 沒有提供可驗證的原圖 Blob。"),{code:"OUTPUT_ASSET_MISSING"});
    const url = URL.createObjectURL(blob); context.objectUrls.add(url);
    try {
      const image = new Image(); image.decoding = "async"; image.src = url;
      if (typeof image.decode === "function") await image.decode();
      else await new Promise((resolve,reject) => { image.onload = resolve; image.onerror = () => reject(Object.assign(new Error("原圖解碼失敗。"),{code:"OUTPUT_IMAGE_DECODE_FAILED"})); });
      if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw Object.assign(new Error("原圖解碼後沒有有效尺寸。"),{code:"OUTPUT_IMAGE_DECODE_FAILED"});
      return {url:url,image:image};
    } catch (error) {
      context.objectUrls.delete(url);
      try { URL.revokeObjectURL(url); } catch (_) {}
      throw error;
    }
  }
  function renderOutputPhotoMarkup(context, shot, assetId, decoded) {
    const crop = photoCropForShot(shot, assetId);
    if (!crop) return '<img class="output-real-image" src="' + escapeHtml(decoded.url) + '" alt="分鏡照片" draggable="false">';
    const renderer = window.PhotoCropRenderer;
    if (!renderer || typeof renderer.createPresentation !== "function") throw Object.assign(new Error("照片裁切呈現元件尚未載入；輸出已暫停。"), { code: "PHOTO_CROP_RENDERER_UNAVAILABLE" });
    const presentation = renderer.createPresentation(decoded.image, crop);
    const metrics = photoCropViewportMetrics(presentation, photoFrameAspectRatio(context.aspectRatio, presentation.aspectRatio));
    const imageStyle = "position:absolute;width:" + (100 / crop.width) + "%;height:" + (100 / crop.height) + "%;left:" + (-crop.x / crop.width * 100) + "%;top:" + (-crop.y / crop.height * 100) + "%;max-width:none;max-height:none;object-fit:fill";
    return '<span class="output-photo-crop-frame"><span class="output-photo-crop-viewport" style="width:' + metrics.width + '%;height:' + metrics.height + '%"><img class="output-real-image output-photo-crop-image" src="' + escapeHtml(decoded.url) + '" alt="分鏡照片（依鏡頭裁切）" draggable="false" style="' + imageStyle + '"></span></span>';
  }
  async function renderOutputSource(context, shot, source) {
    if (!source) return "";
    if (source.type === "photo") {
      const expected = source.metadata;
      if (!expected || expected.role !== "photoOriginal" || expected.state !== "available" || !/^[0-9a-f]{64}$/i.test(String(expected.sha256 || ""))) throw Object.assign(new Error("照片 Asset metadata 缺失、狀態無效或沒有 SHA-256：" + source.id),{code:"OUTPUT_ASSET_METADATA_INVALID"});
      const loaded = await model.getShotPhoto(shot.id,source.id);
      if (!loaded || loaded.projectId !== context.projectId || loaded.shotId !== shot.id || loaded.id !== source.id || !loaded.metadata || loaded.metadata.role !== "photoOriginal" || loaded.metadata.sha256 !== expected.sha256) throw Object.assign(new Error("照片 Asset 與捕獲快照不一致：" + source.id),{code:"OUTPUT_ASSET_SNAPSHOT_MISMATCH"});
      const decoded = await decodeOutputBlob(loaded.originalBlob,context);
      context.imageSources.push({shotId:shot.id,type:"photo",id:source.id,sha256:loaded.metadata.sha256});
      return renderOutputPhotoMarkup(context, shot, source.id, decoded);
    }
    if (source.type !== "drawing" || !source.drawing || source.drawing.shotId !== shot.id || source.drawing.id !== source.id) throw Object.assign(new Error("Drawing source 不屬於捕獲鏡頭：" + source.id),{code:"OUTPUT_DRAWING_MISMATCH"});
    const canonicalDrawing = model.getDrawing(source.id);
    if (!canonicalDrawing || canonicalDrawing.revision !== source.drawing.revision || JSON.stringify(canonicalDrawing) !== JSON.stringify(source.drawing)) throw Object.assign(new Error("Drawing revision 在輸出捕獲期間已變更：" + source.id),{code:"OUTPUT_CAPTURE_STALE_DRAWING"});
    let backgroundImage = null; let backgroundFingerprint = null; let backgroundUrl = null;
    if (source.drawing.backgroundAssetId) {
      const expected = context.project.assets.find((asset) => asset.id === source.drawing.backgroundAssetId);
      if (!expected || expected.role !== "photoOriginal" || !/^[0-9a-f]{64}$/i.test(String(expected.sha256 || ""))) throw Object.assign(new Error("Drawing 底圖 Asset metadata 無法驗證：" + source.drawing.backgroundAssetId),{code:"OUTPUT_DRAWING_BACKGROUND_INVALID"});
      const loaded = await model.getAsset(context.projectId,source.drawing.backgroundAssetId);
      if (!loaded || loaded.projectId !== context.projectId || loaded.id !== expected.id || !loaded.metadata || loaded.metadata.sha256 !== expected.sha256 || loaded.metadata.role !== "photoOriginal") throw Object.assign(new Error("Drawing 底圖照片與捕獲快照不一致：" + expected.id),{code:"OUTPUT_DRAWING_BACKGROUND_MISMATCH"});
      const decoded = await decodeOutputBlob(loaded.originalBlob,context);
      backgroundImage = decoded.image; backgroundFingerprint = loaded.metadata.sha256; backgroundUrl = decoded.url;
    }
    const renderer = window.DirectorStoryboardRenderer;
    try {
      if (!renderer || typeof renderer.createSnapshot !== "function" || typeof renderer.renderToCanvas !== "function") throw Object.assign(new Error("storyboard-renderer 尚未載入，無法輸出 Drawing。"),{code:"OUTPUT_RENDERER_UNAVAILABLE"});
      const drawingSnapshot = renderer.createSnapshot(source.drawing,source.drawing.backgroundAssetId ? {backgroundImage:backgroundImage,backgroundFingerprint:backgroundFingerprint} : undefined);
      const aspect = source.drawing.canvas.width / source.drawing.canvas.height; const width = 1600; const height = Math.max(1,Math.round(width / aspect));
      const canvas = document.createElement("canvas"); renderer.renderToCanvas(canvas,drawingSnapshot,{width:width,height:height,pixelRatio:1});
      const dataUrl = canvas.toDataURL("image/png");
      if (!dataUrl || !dataUrl.startsWith("data:image/png")) throw Object.assign(new Error("Drawing PNG 無法建立。"),{code:"OUTPUT_DRAWING_RASTER_FAILED"});
      context.imageSources.push({shotId:shot.id,type:"drawing",id:source.id,drawingRevision:source.drawing.revision,backgroundAssetId:source.drawing.backgroundAssetId,backgroundSha256:backgroundFingerprint,rendererVersion:renderer.VERSION});
      return '<img class="output-real-image" src="' + dataUrl + '" alt="手繪分鏡圖" draggable="false">';
    } finally {
      if (backgroundUrl) { context.objectUrls.delete(backgroundUrl); try { URL.revokeObjectURL(backgroundUrl); } catch (_) {} }
    }
  }
  function snapshotOutputShotsForSchedule(context) {
    const ids = new Set(); const days = context.ui.days.filter((day) => outputDayScope === "all" || day.id === outputDayId);
    context.ui.entries.filter((entry) => days.some((day) => day.id === entry.dayId) && entry.shotId).forEach((entry) => ids.add(entry.shotId));
    return context.ui.shots.filter((shot) => ids.has(shot.id));
  }
  function assertOutputCaptureCurrent(context) {
    const current = model && typeof model.getProject === "function" ? model.getProject() : null;
    if (!current || current.projectId !== context.projectId || current.revision !== context.projectRevision || Number(current.outputPreferences && current.outputPreferences.revision || 0) !== context.preferenceRevision) throw Object.assign(new Error("專案或輸出偏好在讀取照片／Drawing 期間已變更。這次捕獲已取消，請重新驗證預覽。"),{code:"OUTPUT_CAPTURE_STALE"});
  }
  function captureOutputSnapshot() {
    const project = model.getProject(); const bridge = window.StoryProjectBridge;
    if (!project) throw Object.assign(new Error("尚未開啟 canonical Project。"),{code:"OUTPUT_PROJECT_UNAVAILABLE"});
    if (!bridge || typeof bridge.projectToUi !== "function") throw Object.assign(new Error("Project Bridge 尚未載入，無法建立輸出快照。"),{code:"OUTPUT_BRIDGE_UNAVAILABLE"});
    return {project:project,ui:bridge.projectToUi(project)};
  }
  function snapshotOutputContext(captured, version) {
    const prefs = normalizeOutputPreferences(pendingPreferencePatch || captured.project.outputPreferences);
    prefs.mode = activeOutputMode(); prefs.orientation = orientation; prefs.density = outputItemsPerPage;
    prefs.densityByMode = Object.assign({},prefs.densityByMode,{[prefs.mode]:outputItemsPerPage});
    prefs.fields = {images:Object.assign({},outputFields.images),details:Object.assign({},outputFields.details)};
    prefs.schedule = Object.assign({},prefs.schedule,{dayScope:outputDayScope,selectedDayId:outputDayId || null,showEstimatedWrap:outputShowEstimatedWrap},outputScheduleFields);
    const scheduleMode = outputType === "schedule";
    const resolvedOrientation = orientation === "auto" ? resolveOutputOrientation(prefs.mode,captured.project.aspectRatio,prefs.fields[prefs.mode],scheduleMode,captured.ui) : orientation;
    applyOutputPageOrientation(resolvedOrientation);
    const density = Math.max(1,Math.min(12,Number(outputItemsPerPage) || 1));
    return {doc:$("#print-document"),kind:scheduleMode ? "schedule" : "storyboard",project:captured.project,ui:captured.ui,
      projectId:captured.project.projectId,projectRevision:captured.project.revision,preferenceRevision:Number(captured.project.outputPreferences && captured.project.outputPreferences.revision) || 0,
      preferences:prefs,mode:prefs.mode,orientation:resolvedOrientation,density:density,aspectRatio:captured.project.aspectRatio,imageFieldCount:scheduleMode ? Number(prefs.schedule.storyboardShotNumber) + Number(prefs.schedule.storyboardTitle) : outputFieldCount("images"),
      projectTitle:captured.project.title,brand:scheduleMode ? "SHOOTING PLAN" : "STORYBOARD",records:[],pages:null,objectUrls:new Set(),imageSources:[],captureBlockers:[],capturePending:true,version:version,
      dayMeta:Object.create(null),selectedDayId:outputDayId,itemCount:0,itemLabel:scheduleMode ? "拍攝項目" : "鏡頭",noteBase:"",subtitle:"",scope:"",summary:"",footer:""};
  }
  function appendOutputBlocker(context, shot, source, error) {
    const who = snapshotShotNumber(context,shot); const sourceText = source ? (source.type === "photo" ? "照片 Asset " : "Drawing ") + source.id : "圖像來源";
    context.captureBlockers.push({code:error && error.code || "OUTPUT_IMAGE_FAILED",message:who + " · " + sourceText + "：" + (error && error.message || "讀取或驗證失敗。")});
  }
  async function prepareShotArt(context, shot, sourceResult) {
    if (!sourceResult.source) return "";
    try { return await renderOutputSource(context,shot,sourceResult.source); }
    catch (error) {
      appendOutputBlocker(context,shot,sourceResult.source,error);
      context.imageSources.push({shotId:shot.id,type:sourceResult.source.type,id:sourceResult.source.id,failed:true,code:error.code || "OUTPUT_IMAGE_FAILED"});
      return "";
    }
  }
  function imageFieldRows(shot, context) {
    const fields = context.preferences.fields.images; const rows = [];
    if (fields.shotNumber) rows.push({label:"鏡次",value:snapshotShotNumber(context,shot)});
    if (fields.title && String(shot.title || "").trim()) rows.push({label:"標題",value:String(shot.title)});
    if (fields.voiceover && String(shot.script || "").trim()) rows.push({label:"VO／台詞旁白",value:String(shot.script)});
    if (fields.super && String(shot.super || "").trim()) rows.push({label:"SUPER",value:String(shot.super)});
    if (fields.duration) rows.push({label:"秒數",value:Number(shot.duration) === 0 ? "秒數未估" : formatSeconds(shot.duration)});
    return rows;
  }
  function detailRows(shot, context) {
    const fields = context.preferences.fields.details; const rows = [];
    if (fields.visual && String(shot.visual || "").trim()) rows.push("畫面描述｜" + shot.visual);
    if (fields.script && String(shot.script || "").trim()) rows.push("VO／台詞旁白｜" + shot.script);
    if (fields.super && String(shot.super || "").trim()) rows.push("SUPER｜" + shot.super);
    if (fields.sound && String(shot.sound || "").trim()) rows.push("聲音設計｜" + shot.sound);
    if (fields.move && String(shot.move || "").trim()) rows.push("景別／運鏡｜" + shot.move);
    if (fields.duration) rows.push("秒數｜" + (Number(shot.duration) === 0 ? "秒數未估" : formatSeconds(shot.duration)));
    return rows;
  }
  function formatStoryboardOutputSummary(shots) {
    if (!shots.length) return "0 鏡";
    const unknown = shots.filter((shot) => Number(shot.duration) === 0).length;
    if (unknown === shots.length) return shots.length + " 鏡 · 全部未估";
    const durationLabel = unknown ? "已估片長 " : "預估片長 ";
    return shots.length + " 鏡 · " + durationLabel + formatDuration(totalShotSeconds(shots)) + (unknown ? " · " + unknown + " 鏡未估" : "");
  }
  async function buildStoryboardOutputContext(context) {
    const shots = snapshotOutputShots(context); renderOutputSourceChoices(context,shots);
    const selected = shots.map((shot) => ({shot:shot,source:outputSourceForShot(context,shot)}));
    for (const item of selected) {
      if (!item.source.source && item.source.sources.length > 1) {
        context.captureBlockers.push({code:"OUTPUT_SOURCE_REQUIRED",message:snapshotShotNumber(context,item.shot) + " 有多個照片／Drawing，請在左側明確選擇本次輸出來源。"});
        context.imageSources.push({shotId:item.shot.id,type:null,id:null,requiresSelection:true});
      } else if (!item.source.source) context.imageSources.push({shotId:item.shot.id,type:null,id:null});
    }
    const chapterId = outputScope === "all" ? null : outputScope === "chapter" ? (activeChapterId !== "all" ? activeChapterId : shots[0] && shots[0].chapterId) : shots[0] && shots[0].chapterId;
    const chapter = context.ui.chapters.find((item) => item.id === chapterId);
    const scopeText = outputScope === "all" ? "全部分鏡" : outputScope === "chapter" ? (chapter ? "場次：" + (context.ui.chapters.findIndex((item) => item.id === chapter.id) + 1) + "／" + chapter.title : "目前場次") : (shots[0] ? "單鏡：" + snapshotShotNumber(context,shots[0]) : "目前選取鏡頭");
    const records = [];
    for (const item of selected) {
      const shot = item.shot; const art = await prepareShotArt(context,shot,item.source);
      records.push({kind:"shot",mode:context.mode,key:shot.id,numberHtml:snapshotShotLabel(context,shot),title:String(shot.title || "").trim() ? String(shot.title) : "",text:detailRows(shot,context).join("\n"),imageFields:imageFieldRows(shot,context),art:art,showArt:context.mode === "details",imageMessage:item.source.source && !art ? "圖像讀取失敗，列印已暫停" : "",densityItem:true});
    }
    context.records = records; context.itemCount = shots.length; context.scope = scopeText;
    context.noteBase = shots.length ? "預覽範圍：" + scopeText + "。共 " + shots.length + " 鏡；搜尋條件不影響輸出集合。" : "此輸出範圍目前沒有鏡頭。";
    context.subtitle = (context.project.projectType || "分鏡文件") + "　·　" + scopeText;
    context.summary = formatStoryboardOutputSummary(shots);
    context.footer = context.projectTitle + " · " + scopeText;
  }
  function scheduleOutputDays(context) {
    if (!context.ui.days.some((day) => day.id === outputDayId)) outputDayId = context.ui.days[0] ? context.ui.days[0].id : null;
    if (outputDayScope === "all") return context.ui.days.slice();
    const day = context.ui.days.find((item) => item.id === outputDayId);
    return day ? [day] : [];
  }
  function outputClockLabelForDay(day, offset) {
    const clock = clockAt(day,offset);
    return clock.dayShift < 0 ? clock.time + " · 前日 " + clock.date : clock.label;
  }
  function callsheetOutputRecords(day, estimatedWrap) {
    const rows = [];
    const add = (label, value, className) => {
      const text = String(value == null ? "" : value);
      if (!text.trim()) return;
      rows.push({kind:"day-callsheet",densityItem:false,dayId:day.id,label:label,value:text,continuation:false,className:className || ""});
    };
    add("主要地點",day.location);
    add("預計收工",day.expectedWrap);
    add("依排程預估收工",estimatedWrap,"is-derived");
    add("製作公司",day.productionCompany);
    add("統編",day.businessNumber);
    (day.contacts || []).filter((contact) => contact.onCall).forEach((contact) => {
      add("聯絡人",[contact.position,contact.name,contact.phone].filter((value) => String(value || "").trim()).join(" · "));
    });
    (day.groupCalls || []).forEach((item) => {
      add("大組通告",[item.group,item.location,item.time && "集合 " + item.time].filter((value) => String(value || "").trim()).join(" · "));
    });
    (day.vehicles || []).forEach((vehicle) => {
      add("車輛",[vehicle.label,vehicle.plate && "車牌 " + vehicle.plate,vehicle.driver && "駕駛 " + vehicle.driver,vehicle.driverPhone && "電話 " + vehicle.driverPhone,vehicle.passengers && "乘客\n" + vehicle.passengers].filter((value) => String(value || "").trim()).join(" · "));
    });
    (day.notices || []).forEach((notice) => add("注意事項",notice.text));
    return rows;
  }
  async function buildScheduleOutputContext(context) {
    const days = scheduleOutputDays(context); const shotsById = new Map(context.ui.shots.map((shot) => [shot.id,shot]));
    const entriesByDay = new Map(days.map((day) => [day.id,context.ui.entries.filter((entry) => entry.dayId === day.id)]));
    const linkedShots = []; entriesByDay.forEach((entries) => entries.forEach((entry) => { const shot = entry.shotId && shotsById.get(entry.shotId); if (shot && !linkedShots.some((item) => item.id === shot.id)) linkedShots.push(shot); }));
    renderOutputSourceChoices(context,linkedShots); const artByShot = new Map();
    for (const shot of linkedShots) {
      const source = outputSourceForShot(context,shot);
      if (!source.source && source.sources.length > 1) {
        context.captureBlockers.push({code:"OUTPUT_SOURCE_REQUIRED",message:snapshotShotNumber(context,shot) + " 有多個照片／Drawing，請在左側明確選擇本次輸出來源。"});
        context.imageSources.push({shotId:shot.id,type:null,id:null,requiresSelection:true});
      } else if (!source.source) context.imageSources.push({shotId:shot.id,type:null,id:null});
      artByShot.set(shot.id,await prepareShotArt(context,shot,source));
    }
    const daySections = []; let itemCount = 0; const sectionCounts = {timeline:0,rundown:0,storyboard:0};
    for (const day of days) {
      const entries = entriesByDay.get(day.id) || []; const timeline = model.getTimeline(day.id);
      const estimatedWrap = context.preferences.schedule.showEstimatedWrap ? estimatedWrapForDay(day, entries) : "";
      const callsheetMeta = {projectTitle:context.projectTitle,title:day.title,date:day.date,start:day.start};
      context.dayMeta[day.id] = callsheetMeta;
      const callsheetRows = callsheetOutputRecords(day,estimatedWrap).map((row) => Object.assign({},row,{section:"timeline"}));
      const timelineByEntry = new Map((timeline || []).map((row) => [row.entryId,row]));
      const dayRows = entries.map((entry,index) => {
        const linked = entry.type === "shot" ? shotsById.get(entry.shotId) : null; const slot = timelineByEntry.get(entry.id);
        const minutes = slot ? Number(slot.minutes) || 0 : Number(entry.minutes) || 0; const unknown = !slot || Boolean(slot.unknown);
        let timeLabel = "時段待估";
        if (slot && !unknown && Number.isFinite(Number(slot.startOffset)) && Number.isFinite(Number(slot.endOffset))) timeLabel = outputClockLabelForDay(day,Number(slot.startOffset)) + "–" + outputClockLabelForDay(day,Number(slot.endOffset));
        const gapNotice = scheduleGapNotice(slot, (offset) => outputClockLabelForDay(day, offset));
        const overlapNotice = slot && Number(slot.overlapMinutes) > 0 ? "與先前已排時段實際重疊 " + Number(slot.overlapMinutes) + " 分鐘" : "";
        const orderNotice = scheduleOrderWarning(slot);
        const title = linked ? String(entry.title || linked.title || "") : String(entry.title || (entry.type === "break" ? "休息／換景" : "未命名活動"));
        const shotArt = linked ? artByShot.get(linked.id) || "" : "";
        const shotNumber = linked ? snapshotShotNumber(context,linked) : "";
        return {kind:"schedule",key:entry.id,entryId:entry.id,entryType:entry.type,dayId:day.id,shotId:linked && linked.id || null,title:title,shotTitle:linked ? String(linked.title || "") : "",shotNumber:shotNumber,text:"",notes:String(entry.notes || ""),art:shotArt,imageMessage:linked && !shotArt && (linked.assetIds && linked.assetIds.length || linked.drawingIds && linked.drawingIds.length) ? "圖像讀取失敗，列印已暫停" : "",numberHtml:linked ? snapshotShotLabel(context,linked) : "",order:String(index + 1).padStart(2,"0"),timeLabel:timeLabel,durationLabel:(entry.type === "shot" && !minutes ? "分鐘未估" : minutes + " 分鐘"),status:entry.status || "",gapNotice:gapNotice,overlapNotice:overlapNotice,orderNotice:orderNotice,isBreak:entry.type === "break",densityItem:true};
      });
      const views = buildScheduleEntryViews(dayRows,context.preferences.schedule);
      const header = Object.assign({kind:"day-heading",densityItem:false,dayId:day.id}, callsheetMeta);
      daySections.push({dayId:day.id,header:header,callsheetRows:callsheetRows,timelineRows:views.timeline,rundownRows:views.rundown,storyboardRows:views.storyboard});
      sectionCounts.timeline += views.timeline.length;
      sectionCounts.rundown += views.rundown.length;
      sectionCounts.storyboard += views.storyboard.length;
      itemCount += entries.length;
    }
    const pages=buildScheduleSectionPages(daySections,context.density);
    context.records=pages.flat(); context.pages=pages; context.itemCount=itemCount; context.itemLabel="拍攝項目"; context.sectionCounts=sectionCounts; context.activeSection=outputScheduleSection;
    context.scope=outputDayScope === "all" ? "全部拍攝日" : (days[0] ? formatDate(days[0].date,true) : "拍攝安排");
    context.subtitle=outputDayScope === "all" ? "依已保存拍攝日順序分組" : days[0] ? formatDate(days[0].date,true) + " · 開始 " + days[0].start : "拍攝日尚未建立";
    context.summary=days.length + " 日 · " + itemCount + " 項"; context.footer=context.projectTitle + " · " + context.scope;
    context.noteBase=days.length ? "通告資料：" + context.scope + "。三個內容區依拍攝日與現場順序從同一已保存專案版本產生；時間軸保留空檔、重疊、跨午夜與未知時段。" : "尚未建立拍攝日，請回到拍攝安排工作區新增日期。";
  }
  function outputCaptureStatus(context, error) {
    const host = $("#output-capture-status"); if (!host) return;
    const blockers = error ? [{code:error.code || "OUTPUT_CAPTURE_FAILED",message:error.message || "輸出捕獲失敗。"}] : context && context.captureBlockers || [];
    if (!blockers.length && context && !context.capturePending) { host.hidden=true; host.innerHTML=""; return; }
    host.hidden=false;
    if (context && context.capturePending && !error) { host.textContent="正在驗證已保存照片與 Drawing；驗證完成前不能列印。"; return; }
    host.innerHTML='<strong>列印已暫停</strong><ul>'+blockers.map((item)=>'<li>'+escapeHtml((item.code?item.code+" · ":"")+item.message)+'</li>').join("")+'</ul><button type="button" class="outline-button" data-output-retry>重新驗證輸出</button>';
  }
  function renderOutput() {
    if (outputDensityPreviewFrame) { cancelAnimationFrame(outputDensityPreviewFrame); outputDensityPreviewFrame = 0; }
    if (outputPrintPreparation && outputPrintPreparation.context) cancelOutputPrintPreparation();
    if (!state || !model || typeof model.getProject !== "function") return Promise.resolve(null);
    outputType=$("#output-type").value || outputType; const scheduleMode=outputType === "schedule"; ensureOutputSettings(scheduleMode);
    const previewMode = activeOutputMode();
    const previewOrientation = orientation === "auto" ? resolveOutputOrientation(previewMode,state.aspectRatio,selectedOutputFields(previewMode),scheduleMode) : orientation;
    applyOutputPageOrientation(previewOrientation);
    $("#storyboard-scope-group").hidden=scheduleMode; $("#schedule-scope-group").hidden=!scheduleMode;
    $("#schedule-output-tabs").hidden=!scheduleMode;
    if (scheduleMode) setOutputScheduleSection(outputScheduleSection,false);
    else $("#print-document").removeAttribute("data-active-section");
    $("#preview-title").textContent=scheduleMode?"拍攝安排文件":"分鏡文件";
    let captured;
    try { captured=captureOutputSnapshot(); }
    catch (error) { outputCaptureStatus(null,error); $("#print-output").disabled=true; return Promise.resolve(null); }
    if (!captured.ui.days.some((day)=>day.id===outputDayId)) outputDayId=selectedDayId || (captured.ui.days[0]&&captured.ui.days[0].id) || null;
    $("#output-day").innerHTML=captured.ui.days.map((day,index)=>'<option value="'+escapeHtml(day.id)+'" '+(day.id===outputDayId?"selected":"")+'>'+(index+1)+' · '+escapeHtml(day.title||"拍攝日")+'　'+escapeHtml(day.date)+'</option>').join("");
    $("#output-day").value=outputDayId || ""; $("#output-day-scope").value=outputDayScope; $("#output-selected-day-group").hidden=outputDayScope === "all";
    const doc=$("#print-document"); const version=++outputCaptureVersion; releaseActiveOutputResources(); activeOutputContext=null; outputCaptureError=null;
    $("#print-output").disabled=true; doc.innerHTML='<div class="output-capture-progress" role="status">正在捕獲已保存 Project，驗證照片與 Drawing…</div>';
    const context=snapshotOutputContext(captured,version); outputCaptureStatus(context,null);
    outputCapturePromise=(async()=>{
      try {
        if (context.kind === "schedule") await buildScheduleOutputContext(context); else await buildStoryboardOutputContext(context);
        if (version!==outputCaptureVersion) { releaseOutputObjectUrls(context.objectUrls); return null; }
        adoptLatestOutputDensity(context,context.mode);
        context.capturePending=false; assertOutputCaptureCurrent(context);
        activeOutputObjectUrls=context.objectUrls; activeOutputContext=context; outputCaptureStatus(context,null); $("#scope-note").textContent=context.noteBase;
        renderPagedOutput(context); context._renderedDensity=context.density; return context;
      } catch (error) {
        releaseOutputObjectUrls(context.objectUrls); if (version!==outputCaptureVersion) return null;
        outputCaptureError=error; outputCaptureStatus(null,error);
        doc.innerHTML='<div class="output-capture-blocked"><strong>輸出快照未完成</strong><p>'+escapeHtml((error.code?error.code+" · ":"")+(error.message||"照片、Drawing 或 Project revision 驗證失敗。"))+'</p></div>';
        $("#preview-count").textContent="輸出已暫停"; $("#scope-note").textContent="照片或 Drawing 驗證失敗；不會使用示意圖替代，也不能列印。"; $("#print-output").disabled=true;
        return null;
      }
    })();
    return outputCapturePromise;
  }
  async function renderScheduleOutput() { return renderOutput(); }
  function applyOutputPageOrientation(resolved) {
    const pageOrientation = resolved === "portrait" ? "portrait" : "landscape";
    document.body.classList.toggle("is-portrait",pageOrientation === "portrait");
    let rule = $("#page-orientation-rule");
    if (!rule) { rule = document.createElement("style"); rule.id = "page-orientation-rule"; document.head.appendChild(rule); }
    rule.textContent = "@page { size: A4 " + pageOrientation + "; margin: 0; }";
  }
  function setOrientationUI(next) {
    orientation = next;
    const resolved = orientation === "auto" ? resolveOutputOrientation(activeOutputMode(),state && state.aspectRatio,selectedOutputFields(activeOutputMode()),outputType === "schedule") : orientation;
    document.body.classList.toggle("is-portrait",resolved === "portrait");
    $$(".orientation-button").forEach((button) => button.classList.toggle("is-active",button.dataset.orientation === orientation));
    applyOutputPageOrientation(resolved);
    if (state && $("#print-document")) renderOutput();
  }
  async function setOrientation(next) {
    if (!["auto","portrait","landscape"].includes(next)) return;
    if (isReadOnly()) { message("目前為唯讀瀏覽；紙張方向未更改或保存。", true); return; }
    setOrientationUI(next);
    await saveOutputPreference({ orientation: next });
  }
  function normalizeOutputPreferences(preferences) {
    const prefs = preferences || {};
    const rawFields = prefs.fields || {};
    const detailsDefaults = {visual:true,script:true,super:false,sound:true,move:true,duration:true};
    const imagesDefaults = {shotNumber:false,title:false,voiceover:false,super:false,duration:false};
    const details = Object.assign({},detailsDefaults,rawFields.details || {});
    if (!rawFields.details) Object.keys(detailsDefaults).forEach((key) => { if (typeof rawFields[key] === "boolean") details[key] = rawFields[key]; });
    const images = Object.assign({},imagesDefaults,rawFields.images || {});
    const mode = prefs.mode === "images" ? "images" : "details";
    const densityByMode = Object.assign({images:4,details:4},prefs.densityByMode || {});
    const density = Number(densityByMode[mode]) || Number(prefs.density) || 4;
    densityByMode[mode] = density;
    const schedule = Object.assign({dayScope:"selected",selectedDayId:null,showEstimatedWrap:false,rundownThumbnails:false,rundownNotes:false,rundownStatus:false,storyboardShotNumber:false,storyboardTitle:false},prefs.schedule || {});
    schedule.dayScope = schedule.dayScope === "all" ? "all" : "selected";
    schedule.showEstimatedWrap = schedule.showEstimatedWrap === true;
    Object.keys(outputScheduleFields).forEach((key) => { schedule[key] = schedule[key] === true; });
    return {
      schemaVersion:2, revision:Number(prefs.revision) || 0, mode:mode,
      orientation:["auto","portrait","landscape"].includes(prefs.orientation) ? prefs.orientation : "landscape",
      density:density, densityByMode:densityByMode,
      fields:{images:images,details:details},
      schedule:schedule
    };
  }
  function mergeOutputPreferencePatch(baseInput, priorInput, requestInput) {
    const base = normalizeOutputPreferences(baseInput);
    const prior = normalizeOutputPreferences(priorInput || base);
    const request = requestInput || {};
    const merged = normalizeOutputPreferences(Object.assign({},base,prior,request));
    merged.fields = {
      images:Object.assign({},base.fields.images,prior.fields.images,request.fields && request.fields.images || {}),
      details:Object.assign({},base.fields.details,prior.fields.details,request.fields && request.fields.details || {})
    };
    merged.densityByMode = Object.assign({},base.densityByMode,prior.densityByMode,request.densityByMode || {});
    merged.schedule = Object.assign({},base.schedule,prior.schedule,request.schedule || {});
    if (request.mode && request.density == null && !(request.densityByMode && request.densityByMode[request.mode] != null)) merged.density = merged.densityByMode[request.mode];
    return merged;
  }
  function stageOutputPreference(requestedPatch) {
    if (!state) return;
    if (isReadOnly()) {
      hydrateOutputPreferences(pendingPreferencePatch || state.outputPreferences);
      message("目前為唯讀瀏覽；輸出偏好未更改。", true);
      return;
    }
    pendingPreferencePatch = mergeOutputPreferencePatch(state.outputPreferences,pendingPreferencePatch,requestedPatch);
    pendingPreferenceVersion += 1; syncDraftSnapshot(); renderDurableStatus();
  }
  function hydrateOutputPreferences(preferences) {
    if (!preferences) return;
    const normalized = normalizeOutputPreferences(preferences);
    outputIncludeDetails = normalized.mode !== "images";
    orientation = normalized.orientation;
    outputDensityByMode = Object.assign({},normalized.densityByMode);
    outputItemsPerPage = Math.max(1,Math.min(12,Number(outputDensityByMode[normalized.mode]) || normalized.density || 4));
    Object.keys(outputFields).forEach((mode) => Object.keys(outputFields[mode]).forEach((key) => { outputFields[mode][key] = !!normalized.fields[mode][key]; }));
    outputDayScope = normalized.schedule.dayScope === "all" ? "all" : "selected";
    outputDayId = normalized.schedule.selectedDayId || null;
    outputShowEstimatedWrap = !!normalized.schedule.showEstimatedWrap;
    Object.keys(outputScheduleFields).forEach((key) => { outputScheduleFields[key] = !!normalized.schedule[key]; });
    setOrientationUI(orientation);
    $("#output-include-details").checked = outputIncludeDetails;
    $$('[data-output-field]').forEach((input) => { const [mode,key] = input.dataset.outputField.split("."); if (outputFields[mode]) input.checked = !!outputFields[mode][key]; });
    $("#output-day-scope").value = outputDayScope;
    const estimatedWrapToggle = $("#output-show-estimated-wrap"); if (estimatedWrapToggle) estimatedWrapToggle.checked = outputShowEstimatedWrap;
    $$('[data-schedule-pref]').forEach((input) => { if (Object.prototype.hasOwnProperty.call(outputScheduleFields,input.dataset.schedulePref)) input.checked = outputScheduleFields[input.dataset.schedulePref]; });
    ensureOutputSettings(outputType === "schedule");
  }
  async function saveOutputPreference(requestedPatch) {
    if (!state) { message("尚未開啟專案，輸出偏好尚未保存。", true); return false; }
    if (isReadOnly()) {
      hydrateOutputPreferences(pendingPreferencePatch || state.outputPreferences);
      message("目前為唯讀瀏覽；輸出偏好未更改或保存。", true);
      return false;
    }
    const captured = mergeOutputPreferencePatch(state.outputPreferences,pendingPreferencePatch,requestedPatch);
    pendingPreferencePatch = captured;
    const version = ++pendingPreferenceVersion;
    syncDraftSnapshot(); renderDurableStatus();
    if (!lifecycle.writable) { message("目前為唯讀狀態；輸出偏好保留在本機頁面，尚未保存。", true); renderDurableStatus(); return false; }
    try {
      const persistencePatch = {
        mode:captured.mode,
        orientation:captured.orientation,
        density:captured.density,
        densityByMode:captured.densityByMode,
        fields:captured.fields,
        schedule:captured.schedule
      };
      await withMutation(() => model.updateOutputPreferences(persistencePatch));
      if (pendingPreferenceVersion === version) { pendingPreferencePatch = null; syncDraftSnapshot(); }
      const committed = model.getState(); if (committed && !pendingPreferencePatch) hydrateOutputPreferences(committed.outputPreferences);
      refreshLifecycle(modelLifecycle());
      return true;
    } catch (error) {
      refreshLifecycle(modelLifecycle());
      message((error && error.code ? error.code + " · " : "") + (error && error.message || "輸出偏好保存失敗；目前選擇仍保留。"), true);
      return false;
    }
  }
  function drawingRouteIsBusy() {
    if (!drawingRoute) return false;
    if (["creating", "save_failed"].includes(drawingRoute.status)) return true;
    const editor = drawingEditorHandle && drawingEditorHandle.editor;
    return Boolean(editor && (editor.drawingBusy || editor.pendingOperation));
  }
  function destroyDrawingEditor() {
    if (!drawingEditorHandle) return;
    try { drawingEditorHandle.destroy(); } catch (_) {}
    drawingEditorHandle = null;
  }
  function renderDrawingRouteStatus() {
    const host = $("#drawing-route-status");
    if (!host) return;
    if (drawingRoute && drawingRoute.status === "save_failed" && Number(lifecycle.pendingCount || 0) === 0 && lifecycle.phase !== "save_failed") {
      drawingRoute.status = "error";
      drawingRoute.error = { code: "DRAWING_CREATE_DISCARDED", message: "建立命令已離開保存佇列；沒有建立畫布。" };
    }
    const route = drawingRoute;
    host.replaceChildren();
    if (!route || route.status === "ready") { host.hidden = true; return; }
    host.hidden = false;
    let title = "正在確認 Drawing…";
    let detail = "正在確認此鏡頭已保存的手繪資料。";
    let actions = "";
    if (route.status === "creating") {
      title = "正在建立並保存 Drawing";
      detail = "畫布只有完成本機保存後才會開啟。";
    } else if (route.status === "save_failed") {
      title = "Drawing 尚未保存";
      detail = (route.error && route.error.message || "建立命令仍保留在保存佇列。") + " 重試會核對並重送同一命令。";
      actions = '<button type="button" class="drawing-route-action is-primary" data-drawing-action="retry-create">重試保存</button>';
    } else if (route.status === "error") {
      title = "無法開啟手繪畫布";
      detail = (route.error && route.error.code ? route.error.code + " · " : "") + (route.error && route.error.message || "Drawing 載入失敗。");
    }
    if (route.status !== "creating" && route.status !== "save_failed") actions += '<button type="button" class="drawing-route-action" data-drawing-action="return">返回鏡頭</button>';
    host.innerHTML = '<div class="drawing-route-copy"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(detail) + '</span></div><div class="drawing-route-actions">' + actions + '</div>';
  }
  function returnFromDrawingRoute(expected) {
    const route = drawingRoute;
    if (!route) return false;
    if (route.placeholder) return finishPlaceholderDrawingRoute(route, expected);
    if (expected && (expected.projectId !== route.projectId || expected.shotId !== route.shotId || expected.drawingId && route.drawingId && expected.drawingId !== route.drawingId)) return false;
    if (drawingRouteIsBusy()) { message("Drawing 命令仍在保存或等待重試；完成保存或明確處理候選後才能返回。", true); return false; }
    destroyDrawingEditor(); drawingRoute = null;
    $("#view-drawing").classList.remove("has-drawing-editor");
    const dialog = $("#drawing-choice-dialog");
    if (dialog && dialog.open) dialog.close();
    drawingChooserContext = null;
    setView("storyboard");
    if (state && state.projectId === route.projectId && byId(route.shotId)) {
      selectShot(route.shotId);
      const entry = $$('#shot-list [data-drawing-action="open"]').find((item) => item.dataset.shotId === route.shotId);
      if (entry) entry.focus({ preventScroll: true });
    }
    return true;
  }
  function finishPlaceholderDrawingRoute(route, result) {
    if (!route || route !== drawingRoute) return false;
    if (result && result.projectId && result.projectId !== route.projectId) return false;
    if (result && result.shotId && route.shotId && result.shotId !== route.shotId) return false;
    if (drawingRouteIsBusy()) { message("手繪仍在保存或等待重試；畫布保持開啟。", true); return false; }
    const saved = Boolean(result && result.saved);
    let canonical = null;
    if (saved) {
      const created = route.created;
      canonical = model && model.getState && model.getState();
      const shotId = result.shotId;
      const drawingId = result.drawingId;
      const shot = canonical && canonical.projectId === route.projectId && canonical.shots.find((item) => item.id === shotId);
      let drawing = null;
      try { drawing = model && model.getDrawing && model.getDrawing(drawingId); } catch (_) {}
      const committedRevision = Number(result.revision);
      const verified = created && created.shotId === shotId && created.drawingId === drawingId && created.revision === committedRevision &&
        typeof shotId === "string" && typeof drawingId === "string" && Number.isInteger(committedRevision) &&
        canonical && canonical.revision >= committedRevision && shot && shot.chapterId === route.sceneId &&
        Array.isArray(shot.drawingIds) && shot.drawingIds.includes(drawingId) &&
        drawing && drawing.projectId === route.projectId && drawing.shotId === shotId && drawing.id === drawingId;
      if (!verified) {
        route.status = "error";
        route.error = { code: "PLACEHOLDER_DRAWING_COMMIT_NOT_VISIBLE", message: "鏡頭與手繪保存結果尚未完整核對；請留在畫布確認，不會重送新命令。" };
        renderDrawingRouteStatus();
        message(route.error.message, true);
        return false;
      }
      route.shotId = shotId;
      route.drawingId = drawingId;
      state = canonical;
      activeProjectId = canonical.projectId;
      const emptyDraft = { title: "", visual: "", script: "", super: "", sound: "", move: "", tags: "", duration: "" };
      shotPlaceholderDrafts.set(route.contextKey, emptyDraft);
      if (shotPlaceholderContextKey === route.contextKey && canonical.projectId === route.projectId) {
        shotPlaceholderDraft = emptyDraft;
        shotPlaceholderMessage = "";
        selectedShotId = shotId;
        activeChapterId = route.sceneId;
      }
    } else if (route.created) {
      route.status = "error";
      route.error = { code: "PLACEHOLDER_DRAWING_RESULT_MISMATCH", message: "Model 已回報手繪建立，但關閉結果未確認保存；畫布保持開啟，請確認狀態。" };
      renderDrawingRouteStatus();
      message(route.error.message, true);
      return false;
    }
    destroyDrawingEditor(); drawingRoute = null;
    $("#view-drawing").classList.remove("has-drawing-editor");
    const dialog = $("#drawing-choice-dialog");
    if (dialog && dialog.open) dialog.close();
    drawingChooserContext = null;
    setView("storyboard");
    if (saved && state && state.projectId === route.projectId && byId(route.shotId)) {
      renderAll();
      selectShot(route.shotId);
      const entry = $$('#shot-list [data-drawing-action="open"]').find((item) => item.dataset.shotId === route.shotId);
      if (entry) entry.focus({ preventScroll: true });
      message("鏡頭與手繪已一併保存；尾端保留下一張空白草稿。");
    } else {
      const card = $("#shot-list [data-shot-placeholder]");
      const button = card && card.querySelector('[data-placeholder-action="drawing"]');
      if (button) button.focus({ preventScroll: true });
      message("手繪草稿已捨棄；沒有建立鏡頭。");
      resumeShotPlaceholderAutoPromotion(route.contextKey);
    }
    return true;
  }
  function mountDrawingRoute(route, drawingId, draft) {
    if (!route || route !== drawingRoute || !drawingUiAvailable()) return false;
    const current = model.getState();
    if (!current || current.projectId !== route.projectId) throw new Error("目前專案已切換；停止開啟舊 Drawing。");
    let shot = null;
    if (route.placeholder) {
      if (!draft || !current.chapters.some((chapter) => chapter.id === route.sceneId) || current.revision !== route.baseRevision) throw new Error("專案或場次已更新；手繪草稿沒有開啟，也沒有建立鏡頭。");
    } else {
      if (!current.shots.some((item) => item.id === route.shotId)) throw new Error("目前鏡頭已切換；停止開啟舊 Drawing。");
      shot = current.shots.find((item) => item.id === route.shotId);
      if (!shot || !Array.isArray(shot.drawingIds)) throw new Error("鏡頭 Drawing 清單無效；沒有開放畫布。");
      if (draft ? shot.drawingIds.length !== 0 : !shot.drawingIds.includes(drawingId)) throw new Error("Drawing 清單已變更；沒有開放畫布。");
    }
    const drawing = draft ? null : model.getDrawing(drawingId);
    if (!draft && (!drawing || drawing.projectId !== route.projectId || drawing.shotId !== route.shotId || drawing.id !== drawingId)) throw new Error("Drawing 的專案或鏡頭關係不符；沒有開放畫布。");
    destroyDrawingEditor();
    route.drawingId = draft ? null : drawingId; route.status = "ready"; route.error = null;
    renderDrawingRouteStatus();
    const mount = $("#drawing-editor-mount");
    if (!mount) throw new Error("找不到 Drawing 畫布容器。");
    route.label = route.placeholder ? "新鏡頭草稿" : shotNumberWithTitle(shot, " · ");
    const editorOptions = {
      drawing: drawing, drawingId: draft ? null : drawingId, draft: Boolean(draft), aspectRatio: current.aspectRatio,
      defaultBackgroundAssetId: route.placeholder ? null : draft && Object.prototype.hasOwnProperty.call(route,"defaultBackgroundAssetId")
        ? route.defaultBackgroundAssetId
        : Array.isArray(shot.assetIds) && shot.assetIds.length ? shot.assetIds[0] : null,
      projectId: route.projectId, shotId: route.placeholder ? null : route.shotId, model: model,
      shotLabel: route.label,
      readOnlyReason: (modelLifecycle() && modelLifecycle().readOnlyReason) || READ_ONLY_HELP,
      loadBackground: (record) => record && record.backgroundAssetId ? model.getAsset(record.projectId, record.backgroundAssetId) : Promise.resolve(null),
      onCreated: route.placeholder ? (created) => {
        if (drawingRoute !== route || !created) return;
        route.created = { shotId: created.shotId, drawingId: created.drawingId, revision: created.revision };
        route.shotId = created.shotId;
        route.drawingId = created.drawingId;
      } : undefined,
      onBack: (target) => returnFromDrawingRoute(target),
      onStateChange: (snapshot) => {
        const shotMatches = route.placeholder ? (!route.shotId || snapshot.shotId === route.shotId) : snapshot.shotId === route.shotId;
        if (drawingRoute === route && snapshot.projectId === route.projectId && shotMatches &&
            (snapshot.draft || route.drawingId === null || snapshot.drawingId === route.drawingId)) {
          route.editorState = snapshot;
          route.drawingId = snapshot.draft ? null : snapshot.drawingId || route.drawingId;
        }
      }
    };
    if (route.placeholder) editorOptions.placeholder = { sceneId: route.sceneId, initialShotPatch: route.initialShotPatch };
    if (!route.placeholder && draft && Object.prototype.hasOwnProperty.call(route,"defaultBackgroundCrop")) editorOptions.defaultBackgroundCrop = route.defaultBackgroundCrop;
    drawingEditorHandle = window.DirectorStoryboardDrawingEditor.mount(mount, editorOptions);
    $("#view-drawing").classList.add("has-drawing-editor");
    return true;
  }
  function syncDrawingRouteLabel() {
    const route = drawingRoute;
    if (!route || route.placeholder || !route.shotId || route.status !== "ready" || !drawingEditorHandle || !state || state.projectId !== route.projectId) return;
    const shot = state.shots.find((item) => item.id === route.shotId);
    if (!shot) return;
    const label = shotNumberWithTitle(shot, " · ");
    if (label === route.label) return;
    route.label = label;
    try { Promise.resolve(drawingEditorHandle.update({ projectId: route.projectId, shotId: route.shotId, drawingId: route.drawingId, model: model, shotLabel: label })).catch(() => {}); }
    catch (_) {}
  }
  function finishDrawingCreate(route, drawingId) {
    if (!route || route !== drawingRoute) return false;
    if (typeof drawingId !== "string" || !drawingId) throw new Error("Model 未回傳可核對的 Drawing ID。");
    return mountDrawingRoute(route, drawingId);
  }
  function renderDrawingChooser(shot, drawings) {
    const dialog = $("#drawing-choice-dialog");
    if (!dialog) { message("此鏡頭有多個 Drawing，但目前沒有選擇介面。", true); return; }
    drawingChooserContext = { projectId: state.projectId, shotId: shot.id, drawingIds: drawings.map((drawing) => drawing.id) };
    $("#drawing-choice-list").innerHTML = drawings.map((drawing, index) => '<button type="button" class="drawing-choice-button" data-drawing-action="choose" data-drawing-id="' + escapeHtml(drawing.id) + '"><strong>Drawing ' + (index + 1) + '</strong><span>revision ' + escapeHtml(drawing.revision) + ' · ' + escapeHtml(drawing.canvas.aspectRatio) + '</span><span class="drawing-choice-arrow" aria-hidden="true">›</span></button>').join("");
    const heading = $("#drawing-choice-heading");
    if (heading) heading.textContent = shotNumberWithTitle(shot, " · ");
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    const first = $("#drawing-choice-list button"); if (first) first.focus();
  }
  function openNewDrawingRoute(projectId, shot, backgroundAssetId, backgroundCrop) {
    const route = {
      projectId: projectId,
      shotId: shot.id,
      drawingId: null,
      status: "loading",
      error: null,
      returnFocusShotId: shot.id,
      defaultBackgroundAssetId: backgroundAssetId || null,
      defaultBackgroundCrop: backgroundCrop ? { x:backgroundCrop.x, y:backgroundCrop.y, width:backgroundCrop.width, height:backgroundCrop.height } : null
    };
    drawingRoute = route;
    setView("drawing");
    renderDrawingRouteStatus();
    try { mountDrawingRoute(route, null, true); }
    catch (error) { if (route === drawingRoute) { route.error = error; route.status = "error"; renderDrawingRouteStatus(); } }
  }
  function showDrawingBackgroundChoice(projectId, shot, backgroundAssetId, backgroundCrop) {
    const dialog = $("#drawing-background-choice-dialog");
    if (!dialog || !backgroundAssetId || !backgroundCrop) return false;
    drawingBackgroundChoiceContext = {
      projectId: projectId,
      shotId: shot.id,
      baseRevision: Number(model.getState().revision),
      backgroundAssetId: backgroundAssetId,
      backgroundCrop: { x:backgroundCrop.x, y:backgroundCrop.y, width:backgroundCrop.width, height:backgroundCrop.height }
    };
    $("#drawing-background-choice-shot").textContent = shotNumberWithTitle(shot, " · ");
    const cropOption = dialog.querySelector('input[name="drawing-background-choice"][value="crop"]');
    const originalOption = dialog.querySelector('input[name="drawing-background-choice"][value="original"]');
    if (cropOption) cropOption.checked = true;
    if (originalOption) originalOption.checked = false;
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "open");
    if (cropOption) cropOption.focus();
    return true;
  }
  function confirmDrawingBackgroundChoice() {
    const dialog = $("#drawing-background-choice-dialog");
    const choice = drawingBackgroundChoiceContext;
    if (!choice || !dialog) { if (dialog && dialog.open) dialog.close(); return; }
    const latest = model.getState();
    const shot = latest && latest.projectId === choice.projectId ? latest.shots.find((item) => item.id === choice.shotId) : null;
    const currentCrop = shot && photoCropForShot(shot,choice.backgroundAssetId);
    let drawings = null;
    try { if (shot) drawings = model.getDrawingsForShot(choice.shotId); }
    catch (_) { drawings = null; }
    const isCurrent = !!(latest && shot && latest.revision === choice.baseRevision &&
      Array.isArray(shot.assetIds) && shot.assetIds[0] === choice.backgroundAssetId &&
      photoCropsEqual(currentCrop,choice.backgroundCrop) && Array.isArray(drawings) && drawings.length === 0);
    if (!isCurrent || isReadOnly() || !lifecycle.writable) {
      if (dialog.open) dialog.close();
      drawingBackgroundChoiceContext = null;
      message(isCurrent ? "目前為唯讀狀態；沒有建立手繪。" : "專案、主圖或裁切已更新；請從目前鏡頭重新開啟手繪。",true);
      return;
    }
    const selected = dialog.querySelector('input[name="drawing-background-choice"]:checked');
    const backgroundCrop = selected && selected.value === "original" ? null : choice.backgroundCrop;
    const backgroundAssetId = choice.backgroundAssetId;
    if (dialog.open) dialog.close();
    drawingBackgroundChoiceContext = null;
    openNewDrawingRoute(choice.projectId,shot,backgroundAssetId,backgroundCrop);
  }
  async function openDrawingForShot(button) {
    if (!drawingUiAvailable()) { message("手繪畫布模組尚未載入；沒有開啟無作用入口。", true); return; }
    const shotList = $("#shot-list");
    if (!button || !button.isConnected || !shotList || !shotList.contains(button) || button.dataset.drawingEntryStale === "true") {
      message("手繪入口已離開目前鏡頭清單；請從目前鏡頭卡重新開啟。", true); return;
    }
    const projectId = button.dataset.projectId; const shotId = button.dataset.shotId;
    const latest = model.getState();
    if (!state || !projectId || state.projectId !== projectId || !latest || latest.projectId !== projectId) {
      message("專案資料已更新，請確認鏡頭後再開啟手繪。", true); return;
    }
    const shot = latest.shots.find((item) => item.id === shotId);
    if (!shot) { message("這個鏡頭已不存在，無法開啟手繪。", true); return; }
    if (Number(button.dataset.baseRevision) !== latest.revision) {
      if (latest.projectId === state.projectId) renderForModelChange(latest, { type: "refresh", saveStatus: model.getSaveStatus && model.getSaveStatus() });
      message("專案資料已更新，請確認鏡頭後再開啟手繪。", true); return;
    }
    let drawings;
    try { drawings = model.getDrawingsForShot(shotId); }
    catch (error) { message((error.code ? error.code + " · " : "") + (error.message || "Drawing 讀取失敗。"), true); return; }
    if (!Array.isArray(drawings)) { message("StoryModel 沒有回傳有效的 Drawing 清單。", true); return; }
    if (drawings.length > 1) { renderDrawingChooser(shot, drawings); return; }
    if (drawings.length === 1) {
      const route = { projectId: projectId, shotId: shotId, drawingId: null, status: "loading", error: null, returnFocusShotId: shotId };
      drawingRoute = route; setView("drawing"); renderDrawingRouteStatus();
      try { mountDrawingRoute(route, drawings[0].id); }
      catch (error) { route.status = "error"; route.error = error; renderDrawingRouteStatus(); }
      return;
    }
    if (isReadOnly() || !lifecycle.writable) {
      const route = { projectId: projectId, shotId: shotId, drawingId: null, status: "loading", error: null, returnFocusShotId: shotId };
      drawingRoute = route; setView("drawing"); renderDrawingRouteStatus();
      route.status = "error"; route.error = { code: "READ_ONLY", message: "此鏡頭尚無 Drawing，唯讀狀態不能建立畫布。" }; renderDrawingRouteStatus(); return;
    }
    const backgroundAssetId = Array.isArray(shot.assetIds) && shot.assetIds.length ? shot.assetIds[0] : null;
    const backgroundCrop = backgroundAssetId ? photoCropForShot(shot,backgroundAssetId) : null;
    if (backgroundCrop && showDrawingBackgroundChoice(projectId,shot,backgroundAssetId,backgroundCrop)) return;
    openNewDrawingRoute(projectId,shot,backgroundAssetId,null);
  }
  async function retryDrawingCreate() {
    const route = drawingRoute;
    if (!route || route.status !== "save_failed") return;
    route.status = "creating"; renderDrawingRouteStatus();
    let createdId;
    try { createdId = await model.retryPending(); }
    catch (error) { if (route === drawingRoute) { route.error = error; route.status = "save_failed"; renderDrawingRouteStatus(); } return; }
    try { finishDrawingCreate(route, createdId); refreshLifecycle(modelLifecycle()); }
    catch (error) { if (route === drawingRoute) { route.error = error; route.status = "error"; renderDrawingRouteStatus(); } }
  }
  async function handleDrawingAction(action, element) {
    if (action === "open") { await openDrawingForShot(element); return; }
    if (action === "confirm-background-choice") { confirmDrawingBackgroundChoice(); return; }
    if (action === "return") { returnFromDrawingRoute(); return; }
    if (action === "retry-create") { await retryDrawingCreate(); return; }
    if (action !== "choose") return;
    const context = drawingChooserContext;
    if (!context || !state || state.projectId !== context.projectId || !context.drawingIds.includes(element.dataset.drawingId)) {
      const dialog = $("#drawing-choice-dialog"); if (dialog && dialog.open) dialog.close(); drawingChooserContext = null;
      message("Drawing 清單已變更；請從鏡頭卡片重新開啟。", true); return;
    }
    const shot = state.shots.find((item) => item.id === context.shotId);
    if (!shot || !shot.drawingIds.includes(element.dataset.drawingId)) { message("所選 Drawing 已不屬於此鏡頭。", true); return; }
    const route = { projectId: context.projectId, shotId: context.shotId, drawingId: element.dataset.drawingId, status: "loading", error: null, returnFocusShotId: context.shotId };
    const dialog = $("#drawing-choice-dialog"); if (dialog && dialog.open) dialog.close(); drawingChooserContext = null;
    drawingRoute = route; setView("drawing");
    try { mountDrawingRoute(route, route.drawingId); }
    catch (error) { route.status = "error"; route.error = error; renderDrawingRouteStatus(); }
  }
  function setView(view, options) {
    if (!["storyboard", "schedule", "output", "drawing", "voiceover"].includes(view)) return false;
    const previousView = currentView;
    if (currentView === "storyboard" && view !== "storyboard" && shotPlaceholderAutoPromotionTimer !== null && !(view === "drawing" && drawingRoute && drawingRoute.placeholder)) {
      flushShotPlaceholderAutoPromotion();
    }
    if (currentView !== view && outputPrintPreparation && !outputPrintPreparation.printInvoked && !outputPrintPreparation.allowOutputViewTransition) cancelOutputPrintPreparation();
    if (currentView !== view) cancelReorderGesture();
    if (currentView === "storyboard" && view !== "storyboard" && view !== "drawing") releaseAllShotPhotoUrls();
    if (currentView === "drawing" && view !== "drawing") {
      if (!(options && options.force) && drawingRouteIsBusy()) { message("Drawing 仍有保存命令待處理；請先完成重試或明確處理候選。", true); return false; }
      destroyDrawingEditor(); drawingRoute = null; $("#view-drawing").classList.remove("has-drawing-editor");
    }
    currentView = view;
    const popup = view === "drawing" ? ensureDrawingPopup() : drawingPopup;
    const navView = view === "voiceover" || view === "drawing" ? "storyboard" : view;
    $$('[data-view]').forEach((button) => button.classList.toggle("is-active", button.dataset.view === navView));
    const backgroundView = view === "drawing" ? "storyboard" : view;
    ["storyboard","schedule","output","drawing","voiceover"].forEach((key) => {
      const section = $("#view-" + key);
      const visible = key === view || view === "drawing" && key === backgroundView;
      section.hidden = !visible;
      section.classList.toggle("is-active", key === view || view === "drawing" && key === backgroundView);
    });
    if (popup) {
      if (view === "drawing" && !popup.open) {
        if (typeof popup.showModal === "function") popup.showModal();
        else popup.setAttribute("open", "");
      } else if (view !== "drawing" && popup.open) {
        if (typeof popup.close === "function") popup.close();
        else popup.removeAttribute("open");
      }
    }
    if (view !== previousView || options && options.force) {
      if (view === "storyboard") renderStoryboard();
      if (view === "schedule") renderSchedule();
      if (view === "output") renderOutput();
      if (view === "voiceover") renderVoiceover();
    }
    applyReadonlyControls();
    return true;
  }
  function renderAll(status) {
    if (currentView === "storyboard") renderStoryboard();
    else if (currentView === "schedule") renderSchedule();
    else if (currentView === "output") renderOutput();
    else if (currentView === "voiceover") renderVoiceover();
    saveStatus(status); updateHistoryButtons(); renderDurableStatus(); applyReadonlyControls();
  }
  function syncChapterCounts() {
    const query = $("#chapter-search").value.trim();
    const all = state.shots.filter((shot) => !query || shotSearchMatches(shot,query)).length;
    $$("#chapter-list [data-chapter]").forEach((button) => {
      const id = button.dataset.chapter;
      const count = id === "all" ? all : state.shots.filter((shot) => shot.chapterId === id && (!query || shotSearchMatches(shot,query))).length;
      const node = button.querySelector(".chapter-quantity"); if (node) node.textContent = count;
    });
  }
  function syncDrawingEntrySnapshot(snapshot) {
    if (!snapshot || !snapshot.projectId || !Array.isArray(snapshot.shots) || snapshot.revision == null) return;
    const shotsById = new Map(snapshot.shots.map((shot) => [shot.id, shot]));
    $$("#shot-list .shot-drawing-entry").forEach((button) => {
      const shot = shotsById.get(button.dataset.shotId);
      if (button.dataset.projectId !== snapshot.projectId || !shot) {
        button.dataset.drawingEntryStale = "true";
        button.removeAttribute("data-base-revision");
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
        return;
      }
      delete button.dataset.drawingEntryStale;
      button.dataset.projectId = snapshot.projectId;
      button.dataset.baseRevision = String(snapshot.revision);
      button.dataset.hasDrawing = String(Array.isArray(shot.drawingIds) && shot.drawingIds.length > 0);
    });
  }
  function syncCommittedShotViews(previousState) {
    const previousShots = previousState && previousState.shots || [];
    const previousById = new Map(previousShots.map((shot) => [shot.id, shot]));
    const changedShots = state.shots.filter((shot) => {
      const prior = previousById.get(shot.id);
      return prior && ["no", "title", "visual", "script", "super", "sound", "duration", "art", "tags", "move", "chapterId"].some((key) => prior[key] !== shot[key]);
    });
    if (!changedShots.length) return;
    if (changedShots.some((shot) => previousById.get(shot.id).chapterId !== shot.chapterId)) {
      renderChapters(); renderShotList();
      return;
    }
    const list = $("#shot-list");
    const cardsById = new Map($$(".shot-card", list).map((card) => [card.dataset.shot, card]));
    const focusedCardBeforeSync = document.activeElement && document.activeElement.closest ? document.activeElement.closest("#shot-list .shot-card") : null;
    const query = $("#chapter-search").value.trim();
    const changedShotsWithCards = changedShots.filter((shot) => cardsById.has(shot.id));
    const hiddenChangedShot = changedShotsWithCards.find((shot) => (query && !shotSearchMatches(shot, query)) || (activeChapterId !== "all" && shot.chapterId !== activeChapterId)) || null;
    const noLongerVisible = !!hiddenChangedShot;
    const shouldReturnToSearch = !!(hiddenChangedShot && query && !shotSearchMatches(hiddenChangedShot, query) && focusedCardBeforeSync && focusedCardBeforeSync.dataset.shot === hiddenChangedShot.id);
    const focusWouldDisappear = !!(hiddenChangedShot && focusedCardBeforeSync && focusedCardBeforeSync.dataset.shot === hiddenChangedShot.id);
    const committedVisualFields = [];
    changedShots.forEach((shot) => {
      const prior = previousById.get(shot.id);
      const card = cardsById.get(shot.id);
      if (!card) return;
      card.dataset.chapterId = shot.chapterId;
      card.setAttribute("aria-label", shotNumberWithTitle(shot));
      if (prior.no !== shot.no || prior.chapterId !== shot.chapterId) {
        const number = card.querySelector(".shot-number"); if (number) number.innerHTML = shotLabel(shot);
      }
      ["title", "visual", "script", "super", "duration"].forEach((key) => {
        if (prior[key] === shot[key]) return;
        const field = card.querySelector('[data-shot-field="' + key + '"]');
        if (!field) return;
        const draft = fieldDraftFor(field);
        if (document.activeElement !== field && !draft) field.value = shot[key] == null || (key === "duration" && Number(shot[key]) === 0) ? "" : String(shot[key]);
        if (draft) renderDraftError(field, draft);
        if (shotView === "gallery" && key === "visual" && field !== document.activeElement && !draft) committedVisualFields.push(field);
        if (key === "duration") {
          const estimate = card.querySelector(".shot-duration-estimate");
          if (estimate) estimate.hidden = draft ? String(draft.value).trim() === "" || !Number.isFinite(Number(draft.value)) || Number(draft.value) !== 0 : Number(shot.duration) !== 0;
        }
      });
      ["script", "super"].forEach((key) => {
        if (prior[key] === shot[key]) return;
        const preview = card.querySelector('[data-shot-preview="' + key + '"]');
        if (!preview) return;
        const draft = fieldDrafts.get(draftKey(shot.id, key));
        const raw = draft ? String(draft.value == null ? "" : draft.value) : String(shot[key] == null ? "" : shot[key]);
        preview.title = raw;
      });
      if (prior.art !== shot.art) {
        const thumb = card.querySelector(".shot-illustration"); if (thumb) thumb.innerHTML = svgArt(shot.art, state.shots.indexOf(shot));
      }
    });
    if (shotView === "gallery") resizeShotVisualBatch(committedVisualFields);
    const selectedShot = byId(selectedShotId); const inspectorNumber = $("#inspector .inspector-number");
    if (selectedShot && inspectorNumber) {
      inspectorNumber.innerHTML = shotLabel(selectedShot) + '<span style="color:#a8adb2;font-weight:400"> · ' + (state.shots.indexOf(selectedShot) + 1) + ' / ' + state.shots.length + '</span>';
    }
    syncChapterCounts();
    if (noLongerVisible) {
      renderChapters();
      if (!renderStoryboardSearchInPlace()) renderShotList();
      if (shouldReturnToSearch || document.activeElement === document.body) $("#chapter-search").focus({preventScroll:true});
      else if (focusWouldDisappear) {
        const nextCard = $("#shot-list .shot-card");
        if (nextCard) { nextCard.focus({preventScroll:true}); selectShot(nextCard.dataset.shot); }
        else $("#chapter-search").focus({preventScroll:true});
      }
      if (query && hiddenChangedShot && !shotSearchMatches(hiddenChangedShot, query)) message("已保存；此鏡不再符合目前搜尋。");
      return;
    }
    const visible = activeShots(); const seconds = totalShotSeconds(visible); const unknown = visible.filter((shot) => Number(shot.duration) === 0).length;
    $("#visible-count").textContent = visible.length + " 個鏡頭";
    $("#runtime-label").textContent = "預估片長 " + formatDuration(seconds) + (unknown ? " · " + unknown + " 鏡未估" : "");
  }
  function syncCommittedScheduleViews() {
    renderSchedule({skipInspector:true,preserveSummary:false});
  }
  function syncShotCardAccessibleLabels(card, shot) {
    if (!card || !shot) return;
    const number = shotNumber(shot);
    card.setAttribute("aria-label", shotNumberWithTitle(shot));
    const fieldLabels = { title: "鏡頭標題", visual: "畫面描述", script: "台詞／旁白", super: "字卡 SUPER", duration: "影片秒數" };
    card.querySelectorAll("[data-shot-field]").forEach((field) => {
      const label = fieldLabels[field.dataset.shotField];
      if (label) field.setAttribute("aria-label", number + label);
    });
    card.querySelectorAll(".shot-thumb").forEach((thumb) => {
      if (thumb.dataset.shotPhotoAction === "add") {
        const label = isReadOnly()
          ? number + " 唯讀瀏覽主圖；新增照片已停用"
          : "點擊新增照片至" + shotNumberWithQuotedTitle(shot);
        thumb.setAttribute("aria-label", label);
      } else if (thumb.getAttribute("role") === "img") {
        thumb.setAttribute("aria-label", number + " 分鏡主圖");
      }
    });
    card.querySelectorAll(".shot-photo-action[data-shot-photo-action]").forEach((button) => {
      const action = button.dataset.shotPhotoAction;
      if (action === "add") button.setAttribute("aria-label", "為" + shotNumberWithQuotedTitle(shot) + "新增照片");
      else if (action === "replace") button.setAttribute("aria-label", "替換" + shotNumberWithQuotedTitle(shot) + "的主圖");
      else if (action === "reload") button.setAttribute("aria-label", "重新載入" + shotNumberWithQuotedTitle(shot) + "的照片");
      else if (action === "photo-remove") {
        const name = button.closest(".shot-photo-manager-item")?.querySelector(".shot-photo-manager-copy strong")?.textContent || "照片";
        button.setAttribute("aria-label", "從" + shotNumberWithQuotedTitle(shot) + "解除「" + name + "」的照片引用；保留原始照片");
      }
    });
    const drawing = card.querySelector(".shot-drawing-entry");
    if (drawing) drawing.setAttribute("aria-label", shotNumberWithQuotedTitle(shot) + "編輯分鏡圖");
    const manager = card.querySelector(".shot-photo-manager");
    if (manager) {
      const shotName = shotNumberWithQuotedTitle(shot);
      const summary = manager.querySelector("summary");
      if (summary) summary.setAttribute("aria-label", "管理" + shotName + "的 " + (shot.assetIds || []).length + " 張照片");
      const order = manager.querySelector(".shot-photo-manager-list");
      if (order) order.setAttribute("aria-label", shotName + "的照片順序");
    }
  }
  function syncReorderedShotList(previousState) {
    const list = $("#shot-list");
    const priorShots = previousState && previousState.shots || [];
    if (!list || priorShots.length !== state.shots.length) return false;
    const priorIds = priorShots.map((shot) => shot.id);
    const nextIds = state.shots.map((shot) => shot.id);
    const firstChangedIndex = nextIds.findIndex((id, index) => id !== priorIds[index]);
    if (firstChangedIndex < 0) return false;
    const changedSceneId = state.shots[firstChangedIndex] && state.shots[firstChangedIndex].chapterId;
    if (!changedSceneId || priorShots[firstChangedIndex] && priorShots[firstChangedIndex].chapterId !== changedSceneId) return false;

    const cardNodes = $$(".shot-card", list);
    const cardsById = new Map(cardNodes.map((card) => [card.dataset.shot, card]));
    if (activeShots().some((shot) => !cardsById.has(shot.id))) return false;
    const sceneShots = state.shots.filter((shot) => shot.chapterId === changedSceneId);
    const sceneCardSet = new Set(sceneShots.map((shot) => cardsById.get(shot.id)).filter(Boolean));
    const sceneCardsInDom = Array.from(list.children).filter((node) => sceneCardSet.has(node));
    if (!sceneCardsInDom.length) return false;

    const focused = document.activeElement;
    const focusedCard = focused && focused.closest ? focused.closest("#shot-list .shot-card") : null;
    const selectionStart = focused && typeof focused.selectionStart === "number" ? focused.selectionStart : null;
    const selectionEnd = focused && typeof focused.selectionEnd === "number" ? focused.selectionEnd : null;
    const scrollTop = list.scrollTop;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const anchor = sceneCardsInDom[sceneCardsInDom.length - 1].nextSibling;
    const fragment = document.createDocumentFragment();
    sceneShots.forEach((shot) => {
      const card = cardsById.get(shot.id);
      if (!card) return;
      syncShotCardAccessibleLabels(card, shot);
      const number = card.querySelector(".shot-number");
      if (number) number.innerHTML = shotCardNumberMarkup(shot);
      fragment.appendChild(card);
    });
    list.insertBefore(fragment, anchor);
    const emptyState = list.querySelector(".empty-state");
    if (emptyState) list.appendChild(emptyState);
    list.scrollTop = scrollTop;
    window.scrollTo(scrollX, scrollY);
    if (focusedCard && focused && document.activeElement !== focused) {
      focused.focus({ preventScroll: true });
      if (selectionStart !== null && typeof focused.setSelectionRange === "function") {
        try { focused.setSelectionRange(selectionStart, selectionEnd); } catch (_) {}
      }
    }
    updateReorderSelectionUi();
    return true;
  }
  function renderForModelChange(snapshot, event) {
    if (!snapshot) return;
    const previousState = state;
    if (photoIntegrityCheck && photoIntegrityCheck.status === "checking") {
      if (snapshot.projectId !== photoIntegrityCheck.projectId) cancelPhotoIntegrityCheck("專案已切換", true);
      else if (!samePhotoIntegritySnapshot(photoIntegrityAssetSnapshot(model && model.getProject ? model.getProject() : snapshot), photoIntegrityCheck.assets)) {
        cancelPhotoIntegrityCheck("照片清單已變更，請重新檢查", false);
      }
    }
    syncPhotoCropSessionForSnapshot(snapshot, event);
    syncPhotoImportSessionForSnapshot(snapshot);
    if (productionTimelineHandle && productionTimelineProjectId !== snapshot.projectId) {
      const previousProjectId = productionTimelineProjectId;
      if (!closeProductionTimeline()) {
        const retained = productionTimelineHandle && typeof productionTimelineHandle.getDraft === "function" ? productionTimelineHandle.getDraft() : null;
        if (retained && retained.dirty) {
          try {
            registerProductionTimelineDraft(retained.namespace, {
              projectId: retained.projectId, entityType: "productionTask", entityId: retained.taskId || null,
              field: "productionTimeline", value: { kind: retained.kind, taskId: retained.taskId || null, values: retained.values, original: null },
              version: Date.now(), composing: false, error: retained.error || null
            });
          } catch (_) { /* keep the old mounted instance if its draft registry rejected the snapshot */ }
        }
        message("切換專案時無法安全收合製作時程；請先返回時程保存或放棄草稿。", true);
      } else if (hasProductionTimelineDrafts(previousProjectId)) {
        message("上一專案的製作時程草稿已保留；回到該專案可繼續處理。", true);
      }
    }
    if (activeProjectId && snapshot.projectId !== activeProjectId) {
      releaseAllShotPhotoUrls();
      shotPhotoManagerOpen.clear();
      if (drawingBackgroundChoiceContext && drawingBackgroundChoiceContext.projectId !== snapshot.projectId) {
        const choiceDialog = $("#drawing-background-choice-dialog"); if (choiceDialog && choiceDialog.open) choiceDialog.close();
        drawingBackgroundChoiceContext = null;
      }
      if (drawingChooserContext && drawingChooserContext.projectId !== snapshot.projectId) {
        const chooser = $("#drawing-choice-dialog"); if (chooser && chooser.open) chooser.close();
        drawingChooserContext = null;
      }
      if (drawingRoute && drawingRoute.projectId !== snapshot.projectId) {
        destroyDrawingEditor(); drawingRoute = null; $("#view-drawing").classList.remove("has-drawing-editor");
        setView("storyboard", { force: true });
      }
      selectedShotId = null; shotReorderSelection = new Set(); shotSelectionAnchorId = null; shotMultiSelectMode = false; activeChapterId = "all"; selectedDayId = null; selectedEntryId = null; entryReorderSelection = new Set(); entrySelectionAnchorId = null; scheduleMultiSelectMode = false; selectedEntryMeta = null;
      outputScope = "all"; outputType = "storyboard"; outputDayId = null;
    }
    if (drawingRoute && drawingRoute.projectId === snapshot.projectId && !(drawingRoute.placeholder && !drawingRoute.shotId)) {
      const routeShot = snapshot.shots.find((shot) => shot.id === drawingRoute.shotId);
      const routeEditor = drawingEditorHandle && drawingEditorHandle.editor;
      const undoingDrawingCreation = Boolean(routeEditor && routeEditor.pendingOperation && routeEditor.pendingOperation.kind === "history" && routeEditor.pendingOperation.historyKind === "undo" && routeEditor.drawing && routeEditor.drawing.id === drawingRoute.drawingId);
      if (!routeShot || drawingRoute.drawingId && (!Array.isArray(routeShot.drawingIds) || !routeShot.drawingIds.includes(drawingRoute.drawingId)) && !undoingDrawingCreation) {
        destroyDrawingEditor(); drawingRoute = null; $("#view-drawing").classList.remove("has-drawing-editor");
        setView("storyboard", { force: true });
      }
    }
    if (previousState && previousState.projectId === snapshot.projectId && selectedEntryId) {
      const previousEntry = previousState.entries.find((entry) => entry.id === selectedEntryId);
      const nextEntry = snapshot.entries.find((entry) => entry.id === selectedEntryId);
      if (previousEntry && nextEntry && previousEntry.dayId !== nextEntry.dayId) selectedDayId = nextEntry.dayId;
    }
    activeProjectId = snapshot.projectId || activeProjectId;
    state = snapshot;
    refreshShotNumberResolution(true);
    syncShotNumberPreviewAfterProjectChange(snapshot);
    $$("#shot-list [data-shot-photo-action='crop']").forEach((button) => {
      if (button.dataset.projectId === snapshot.projectId) button.dataset.baseRevision = String(snapshot.revision);
    });
    syncDrawingEntrySnapshot(snapshot);
    const dayCountNode = $("#day-count"); if (dayCountNode) dayCountNode.textContent = String(state.days.length);
    syncDrawingRouteLabel();
    document.body.classList.add("project-ready"); lifecycleGateForced = false;
    const titleNode = $("#project-title"); if (titleNode) titleNode.textContent = state.title || "未命名專案";
    const kindNode = $("#project-kind"); if (kindNode) { kindNode.textContent = String(state.projectType || "").trim() || "未設定類型"; kindNode.title = String(state.projectType || "").trim() ? "專案類型：" + state.projectType : "尚未設定專案類型"; }
    if (activeChapterId !== "all" && !state.chapters.some(chapter => chapter.id === activeChapterId)) activeChapterId = "all";
    applyProjectAspectRatio(state.aspectRatio);
    if (!selectedShotId && state.shots.length) selectedShotId = state.shots[0].id;
    if (!selectedDayId && state.days.length) selectedDayId = state.days[0].id;
    const type = event && event.type;
    if (type === "init") {
      if (!pendingPreferencePatch) hydrateOutputPreferences(state.outputPreferences);
      renderAll(event && event.saveStatus); reconcileSavedDrafts(); refreshLifecycle(modelLifecycle()); return;
    }
    if (type === "updateOutputPreferences") {
      if (!pendingPreferencePatch) hydrateOutputPreferences(state.outputPreferences);
      const retainedDensityPreview = adoptOutputDensityPreferenceCommit(snapshot,event);
      if (retainedDensityPreview) {
        saveStatus(event && event.saveStatus); updateHistoryButtons(); renderDurableStatus(); applyReadonlyControls();
      } else renderAll(event && event.saveStatus);
      reconcileSavedDrafts(); refreshLifecycle(modelLifecycle()); return;
    }
    if (type === "reorderShots" && syncReorderedShotList(previousState)) {
      renderInspector();
      if (currentView === "schedule") { syncCommittedScheduleViews(); renderScheduleInspector(activeDay(), activeEntries()); }
      else if (currentView === "output") renderOutput();
      else if (currentView === "voiceover") renderVoiceover();
      reconcileSavedDrafts(); saveStatus(event.saveStatus); updateHistoryButtons(); refreshLifecycle(modelLifecycle()); return;
    }
    if (type === "updateShot") {
      syncCommittedShotViews(previousState);
      // Clear a matching committed draft before syncing the unfocused inspector counterpart.
      // Newer drafts and composing controls remain protected by the draft/focus guards.
      reconcileSavedDrafts();
      if (currentView === "storyboard") renderInspector();
      if (currentView === "schedule") { syncCommittedScheduleViews(); renderScheduleInspector(activeDay(), activeEntries()); }
      if (currentView === "output") renderOutput();
      if (currentView === "voiceover") renderVoiceover();
      saveStatus(event.saveStatus); updateHistoryButtons(); refreshLifecycle(modelLifecycle()); return;
    }
    if (type === "updateEntry") {
      syncCommittedScheduleViews(); renderScheduleInspector(activeDay(), activeEntries()); renderOutput();
      saveStatus(event.saveStatus); updateHistoryButtons(); reconcileSavedDrafts(); refreshLifecycle(modelLifecycle()); return;
    }
    if (type === "updateDay") {
      const day = activeDay(); const badge = $("#day-summary .calendar-badge strong"); if (badge && day) badge.textContent = String(dateParts(day.date).day);
      syncCommittedScheduleViews(); renderScheduleInspector(activeDay(), activeEntries()); renderOutput();
      saveStatus(event.saveStatus); updateHistoryButtons(); reconcileSavedDrafts(); refreshLifecycle(modelLifecycle()); return;
    }
    renderAll(event && event.saveStatus); reconcileSavedDrafts(); refreshLifecycle(modelLifecycle());
  }
  function showConfirm(title, copy, actionLabel, callback) {
    confirmAction = callback; $("#confirm-title").textContent = title; $("#confirm-copy").textContent = copy; $("#confirm-accept").textContent = actionLabel;
    $("#confirm-accept").disabled = false;
    const dialog = $("#confirm-dialog"); if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
  }
  function closeDialog(id) { const dialog = $("#" + id); if (dialog.close) dialog.close(); else dialog.removeAttribute("open"); if (id === "confirm-dialog") confirmAction = null; }
  function closeFailedSaveDialog(id) {
    const current = modelLifecycle();
    if (current && current.phase === "save_failed") closeDialog(id);
  }
  function deleteSelectedShot() {
    const shot = byId(selectedShotId); if (!shot) return;
    const linked = state.entries.filter((entry) => entry.type === "shot" && entry.shotId === shot.id).length;
    const copy = linked ? '「' + shotTitleOrNumber(shot) + '」目前被 ' + linked + ' 筆拍攝安排引用。刪除後會一併移除排程引用；可用復原還原鏡頭 ID 與原位置。' : '確定刪除「' + shotTitleOrNumber(shot) + '」？此操作可透過復原還原。';
    showConfirm("刪除分鏡", copy, "刪除鏡頭", async () => { await withMutation(() => model.deleteShot(shot.id)); message("已刪除鏡頭，可立即復原。"); return true; });
  }
  function removeSelectedEntry() {
    const entry = state.entries.find((item) => item.id === selectedEntryId); if (!entry) return;
    const linked = entry.type === "shot" ? byId(entry.shotId) : null;
    showConfirm("移出拍攝日", linked ? '只會移除「' + shotTitleOrNumber(linked) + '」的拍攝安排，分鏡本身會保留在原場次。' : '只會移除此休息／活動項目，不會影響分鏡內容。', "移出拍攝日", async () => { await withMutation(() => model.removeEntry(entry.id)); message("已移出拍攝日，分鏡內容仍保留。"); return true; });
  }
  async function duplicateSelectedShot() {
    const shot = byId(selectedShotId); if (!shot) return;
    try { selectedShotId = await withMutation(() => model.duplicateShot(shot.id)); message("已複製鏡頭；新鏡頭尚未排入拍攝日。"); renderAll(); }
    catch (error) { message(error.message || "複製失敗", true); }
  }
  async function addShot() {
    const chapterId = activeChapterId === "all" ? state.chapters[0] && state.chapters[0].id : activeChapterId;
    if (!chapterId) { message("目前沒有可新增鏡頭的場次。", true); return; }
    try { selectedShotId = await withMutation(() => model.addShot(chapterId)); activeChapterId = chapterId; renderAll(); setView("storyboard"); const title = $(".inspector-shot-title"); if (title) { title.focus(); title.select(); } message("已新增未排程鏡頭。"); }
    catch (error) { message(error.message || "新增鏡頭失敗", true); }
  }
  function fieldFailure(code, messageText) { const error = new Error(messageText); error.code = code; return error; }
  async function commitDraftRecord(draft, field) {
    if (!draft || draft.composing) return false;
    if (draft.deferred) return false;
    if (draft.submittedVersion === draft.version) return true;
    let value = draft.value; const key = draft.field; let entity;
    if (draft.entityType === "shot") entity = state.shots.find((item) => item.id === draft.entityId);
    else if (draft.entityType === "entry") entity = state.entries.find((item) => item.id === draft.entityId);
    else if (draft.entityType === "day") entity = state.days.find((item) => item.id === draft.entityId);
    else if (draft.entityType === "project" && draft.entityId === state.projectId) entity = state;
    if (!entity) throw fieldFailure("ENTITY_NOT_FOUND", "欄位所屬資料已不存在；輸入仍保留於救援草稿。");
    if (draft.entityType === "project" && key === "title") {
      value = String(value == null ? "" : value).trim();
      if (!value) throw fieldFailure("INVALID_PROJECT_TITLE", "專案名稱不可空白；輸入仍保留。");
    }
    if (draft.entityType === "project" && key === "projectType") value = String(value == null ? "" : value).trim();
    if (draft.entityType === "shot" && key === "duration") {
      if (String(value).trim() === "") throw fieldFailure("INVALID_DURATION", "空白秒數尚未提交；請輸入 0 或有效秒數。");
      value = Number(value);
      if (!Number.isFinite(value) || value < 0 || field && field.validity && field.validity.stepMismatch || Math.abs(value * 10 - Math.round(value * 10)) > 1e-8) throw fieldFailure("INVALID_DURATION", "影片秒數請使用 0.1 秒刻度，且不可小於 0。");
    }
    if (draft.entityType === "entry" && key === "minutes") {
      if (String(value).trim() === "") throw fieldFailure("INVALID_MINUTES", "空白分鐘數尚未提交；請輸入 0 或有效分鐘數。");
      value = Number(value);
      if (!Number.isInteger(value) || value < 0) throw fieldFailure("INVALID_MINUTES", "拍攝分鐘需為大於或等於 0 的整數。");
    }
    if (draft.entityType === "day" && ["date", "start"].includes(key) && !value) throw fieldFailure("INVALID_DAY_FIELD", "拍攝日期與集合時間需要有效值。");
    const patch = {};
    const callsheetPath = draft.entityType === "day" ? parseCallsheetFieldPath(key) : null;
    if (callsheetPath) {
      const rows = Array.isArray(entity[callsheetPath.collection]) ? entity[callsheetPath.collection].map((item) => Object.assign({}, item)) : [];
      const row = rows.find((item) => item.id === callsheetPath.rowId);
      if (!row) throw fieldFailure("CALLSHEET_ROW_NOT_FOUND", "通告資料列已不存在；輸入仍保留於救援草稿。");
      row[callsheetPath.field] = value;
      patch[callsheetPath.collection] = rows;
      if (callsheetPath.collection === "contacts") {
        const primary = rows.find((item) => String(item.name || "").trim() || String(item.phone || "").trim());
        patch.contactName = primary ? primary.name : "";
        patch.contactPhone = primary ? primary.phone : "";
      }
    } else patch[key] = value;
    if (draft.entityType === "entry" && key === "timingMode" && value === "fixed") {
      const container = $("#schedule-inspector");
      const start = container.querySelector('[data-time-draft="startTime"]');
      const end = container.querySelector('[data-time-draft="endTime"]');
      const startNextDay = container.querySelector('[data-time-draft="startNextDay"]');
      const nextDay = container.querySelector('[data-time-draft="endNextDay"]');
      if (!start || !end || !startNextDay || !nextDay || container.dataset.entryId !== draft.entityId) throw fieldFailure("TIMING_CONTROLS_UNAVAILABLE", "固定時段欄位尚未準備好。");
      patch.startTime = start.value; patch.endTime = end.value; patch.startNextDay = !!startNextDay.checked; patch.endNextDay = !!nextDay.checked;
    }
    draft.submittedVersion = draft.version;
    try {
      if (draft.entityType === "shot") await withMutation(() => model.updateShot(draft.entityId, patch));
      else if (draft.entityType === "entry") await withMutation(() => model.updateEntry(draft.entityId, patch));
      else if (draft.entityType === "project") {
        const metadata = { title: key === "title" ? value : state.title, projectType: key === "projectType" ? value : String(state.projectType || "") };
        await withMutation(() => model.updateProjectMetadata(metadata));
      }
      else await withMutation(() => model.updateDay(draft.entityId, patch));
      clearDraftIfCurrent(draft.key, draft.version);
      if (field) clearFieldError(field);
      refreshLifecycle(modelLifecycle());
      return true;
    } catch (error) {
      const latestLifecycle = modelLifecycle();
      if (latestLifecycle.phase !== "save_failed") draft.submittedVersion = null;
      const latestDraft = fieldDrafts.get(draft.key);
      const isCurrentDraft = !!(latestDraft && latestDraft.version === draft.version);
      if (field && isCurrentDraft) setFieldError(field, error);
      else if (!field && isCurrentDraft) { draft.error = { code: error.code || "SAVE_FAILED", message: error.message || "欄位保存失敗。" }; syncDraftSnapshot(); }
      refreshLifecycle(latestLifecycle);
      throw error;
    }
  }
  async function commitDraftSafe(draft, field) {
    try { return await commitDraftRecord(draft, field); }
    catch (error) {
      const latestDraft = draft && fieldDrafts.get(draft.key);
      const isCurrentDraft = !!(latestDraft && latestDraft.version === draft.version);
      if (field && isCurrentDraft) setFieldError(field, error);
      else if (!field && isCurrentDraft) { draft.error = { code: error.code || "SAVE_FAILED", message: error.message || "欄位保存失敗。" }; syncDraftSnapshot(); renderDurableStatus(); }
      throw error;
    }
  }
  async function commitDraftField(field) {
    const draft = fieldDraftFor(field);
    if (!draft || draft.deferred) return false;
    return commitDraftSafe(draft, field);
  }
  async function commitProjectMetadataDrafts(options) {
    options = options || {};
    if (!state || !state.projectId) throw fieldFailure("PROJECT_NOT_READY", "尚未選定專案，無法保存專案資訊。");
    const projectId = state.projectId;
    const drafts = ["title", "projectType"].map((field) => fieldDrafts.get(draftKey(projectId, field))).filter(Boolean);
    if (!drafts.length) return false;
    if (drafts.some((draft) => draft.composing || composingFields.has(draft.field === "title" ? $("#project-metadata-title") : $("#project-metadata-type")))) {
      throw fieldFailure("IME_COMPOSING", "請先完成專案名稱或類型的中文輸入，再保存。");
    }
    const titleDraft = drafts.find((draft) => draft.field === "title");
    const typeDraft = drafts.find((draft) => draft.field === "projectType");
    const title = String(titleDraft ? titleDraft.value : state.title || "").trim();
    const projectType = String(typeDraft ? typeDraft.value : state.projectType || "").trim();
    if (!title) {
      const error = fieldFailure("INVALID_PROJECT_TITLE", "專案名稱不可空白；輸入仍保留。");
      const titleField = $("#project-metadata-title");
      if (titleField) setFieldError(titleField, error);
      throw error;
    }
    if (title === String(state.title || "") && projectType === String(state.projectType || "")) {
      drafts.forEach((draft) => clearDraftIfCurrent(draft.key, draft.version));
      return false;
    }
    drafts.forEach((draft) => { draft.submittedVersion = draft.version; });
    try {
      await withMutation(() => model.updateProjectMetadata({ title, projectType }));
      drafts.forEach((draft) => clearDraftIfCurrent(draft.key, draft.version));
      [$("#project-metadata-title"), $("#project-metadata-type")].filter(Boolean).forEach((field) => {
        const draft = fieldDraftFor(field);
        if (!draft || drafts.some((submitted) => submitted.key === draft.key && submitted.version === draft.version)) clearFieldError(field);
      });
      refreshLifecycle(modelLifecycle());
      if (!options.silent) message("專案名稱與類型已保存。");
      return true;
    } catch (error) {
      const latestLifecycle = modelLifecycle();
      if (latestLifecycle.phase !== "save_failed") drafts.forEach((draft) => { const latest = fieldDrafts.get(draft.key); if (latest && latest.version === draft.version) latest.submittedVersion = null; });
      drafts.forEach((draft) => {
        const latest = fieldDrafts.get(draft.key);
        if (!latest || latest.version !== draft.version) return;
        const field = draft.field === "title" ? $("#project-metadata-title") : $("#project-metadata-type");
        if (field && field.isConnected) setFieldError(field, error);
        else { latest.error = { code: error.code || "SAVE_FAILED", message: error.message || "專案資訊保存失敗。" }; syncDraftSnapshot(); }
      });
      refreshLifecycle(latestLifecycle);
      throw error;
    }
  }
  async function commitEntryTime(entityId) {
    const container = $("#schedule-inspector");
    if (!container || container.dataset.entryId !== entityId) throw fieldFailure("TIMING_CONTROLS_UNAVAILABLE", "指定時段欄位已離開畫面，請重新選取拍攝項目。");
    const start = container.querySelector('[data-time-draft="startTime"]');
    const end = container.querySelector('[data-time-draft="endTime"]');
    const startNextDay = container.querySelector('[data-time-draft="startNextDay"]');
    const nextDay = container.querySelector('[data-time-draft="endNextDay"]');
    const entry = state.entries.find((item) => item.id === entityId);
    if (!entry || !start || !end || !startNextDay || !nextDay) throw fieldFailure("TIMING_CONTROLS_UNAVAILABLE", "指定時段欄位尚未準備好。");
    const fields = [start, end, startNextDay, nextDay];
    const drafts = fields.map((field) => fieldDraftFor(field) || captureFieldDraft(field));
    if (drafts.some((draft) => draft.composing)) throw fieldFailure("IME_COMPOSING", "請先完成中文輸入，再套用時段。");
    const patch = { timingMode: "fixed", startTime: drafts[0].value, endTime: drafts[1].value, startNextDay: !!drafts[2].value, endNextDay: !!drafts[3].value };
    try {
      await withMutation(() => model.updateEntry(entityId, patch));
      drafts.forEach((draft) => clearDraftIfCurrent(draft.key, draft.version));
      fields.forEach(clearFieldError);
      refreshLifecycle(modelLifecycle());
      message("已套用指定時段，後續自動項目依此重新計算。");
      return true;
    } catch (error) {
      fields.forEach((field) => setFieldError(field, error));
      refreshLifecycle(modelLifecycle());
      throw error;
    }
  }
  async function toggleEntryTiming(entityId) {
    const container = $("#schedule-inspector");
    if (!container || container.dataset.entryId !== entityId) throw fieldFailure("TIMING_CONTROLS_UNAVAILABLE", "時間安排欄位已離開畫面，請重新選取拍攝項目。");
    if (pendingMutationPromises.size) await Promise.allSettled(Array.from(pendingMutationPromises));
    const entry = state.entries.find((item) => item.id === entityId);
    if (!entry) throw fieldFailure("TIMING_CONTROLS_UNAVAILABLE", "拍攝項目已不存在，請重新選取。");
    const start = container.querySelector('[data-time-draft="startTime"]');
    const end = container.querySelector('[data-time-draft="endTime"]');
    const startNextDay = container.querySelector('[data-time-draft="startNextDay"]');
    const nextDay = container.querySelector('[data-time-draft="endNextDay"]');
    if (!start || !end || !startNextDay || !nextDay) throw fieldFailure("TIMING_CONTROLS_UNAVAILABLE", "指定起訖欄位尚未準備好。");
    const day = state.days.find((item) => item.id === entry.dayId);
    if (!day) throw fieldFailure("TIMING_CONTROLS_UNAVAILABLE", "拍攝日不存在，無法切換時間安排。");
    if (fieldDrafts.has(draftKey(day.id, "start"))) throw fieldFailure("DAY_START_UNSAVED", "拍攝日開始時間尚未保存；請先完成保存，再切換指定起訖。");
    const fields = [start, end, startNextDay, nextDay];
    const existingDrafts = fields.map((field) => fieldDraftFor(field));
    if (existingDrafts.some((draft) => draft && draft.composing)) throw fieldFailure("IME_COMPOSING", "請先完成輸入，再切換時間安排。");
    const nextMode = entry.timingMode === "fixed" ? "auto" : "fixed";
    const savedOrCurrentValues = entry.timingMode === "fixed"
      ? { startTime: entry.startTime, endTime: entry.endTime, startNextDay: entry.startNextDay === true, endNextDay: !!entry.endNextDay }
      : timingValuesForEntry(day, entry);
    const values = {
      startTime: existingDrafts[0] ? existingDrafts[0].value : savedOrCurrentValues.startTime,
      endTime: existingDrafts[1] ? existingDrafts[1].value : savedOrCurrentValues.endTime,
      startNextDay: existingDrafts[2] ? existingDrafts[2].value : savedOrCurrentValues.startNextDay,
      endNextDay: existingDrafts[3] ? existingDrafts[3].value : savedOrCurrentValues.endNextDay
    };
    fields.forEach((field, index) => {
      if (existingDrafts[index]) return;
      if (field.type === "checkbox") field.checked = index === 2 ? !!values.startNextDay : !!values.endNextDay;
      else field.value = values[index === 0 ? "startTime" : "endTime"] || "";
    });
    const drafts = fields.map((field, index) => existingDrafts[index] || captureFieldDraft(field));
    const patch = timingModePatch(nextMode, values);
    drafts.forEach((draft) => { draft.submittedVersion = draft.version; });
    try {
      await withMutation(() => model.updateEntry(entityId, patch));
      drafts.forEach((draft) => clearDraftIfCurrent(draft.key, draft.version));
      fields.forEach(clearFieldError);
      refreshLifecycle(modelLifecycle());
      return true;
    } catch (error) {
      const latestLifecycle = modelLifecycle();
      if (latestLifecycle.phase !== "save_failed") drafts.forEach((draft) => { const latest = fieldDrafts.get(draft.key); if (latest && latest.version === draft.version) latest.submittedVersion = null; });
      fields.forEach((field) => setFieldError(field, error));
      refreshLifecycle(latestLifecycle);
      throw error;
    }
  }
  async function commitAllDrafts() {
    if (hasProductionTimelineDrafts(state && state.projectId)) throw fieldFailure("PRODUCTION_TIMELINE_DRAFTS_REMAIN", "製作時程有未保存草稿；請先展開時程並保存或明確放棄，再切換專案。草稿會保留在目前專案。 ");
    if (Array.from(fieldDrafts.values()).some((draft) => draft.composing)) throw fieldFailure("IME_COMPOSING", "請先完成正在輸入的文字，再切換專案。");
    if (pendingMutationPromises.size) await Promise.allSettled(Array.from(pendingMutationPromises));
    refreshLifecycle(modelLifecycle());
    if (lifecycle.phase === "save_failed" || Number(lifecycle.pendingCount || 0) > 0) throw fieldFailure("SAVE_PENDING", "尚有保存失敗或未完成的命令。請先重試保存或下載救援資料。");
    const drafts = Array.from(fieldDrafts.values());
    if (drafts.some((draft) => draft.entityType === "project")) await commitProjectMetadataDrafts({ silent: true });
    const deferred = new Map();
    for (const draft of drafts) {
      if (draft.entityType === "project") continue;
      if (draft.deferred) {
        if (!deferred.has(draft.entityId)) deferred.set(draft.entityId, []);
        deferred.get(draft.entityId).push(draft);
      } else {
        await commitDraftSafe(draft, null);
      }
    }
    for (const [entryId, timeDrafts] of deferred) {
      const entry = state.entries.find((item) => item.id === entryId);
      if (!entry) throw fieldFailure("ENTITY_NOT_FOUND", "拍攝項目已不存在；未保存時間仍保留。");
      const values = Object.fromEntries(timeDrafts.map((draft) => [draft.field, draft.value]));
      const patch = {
        timingMode: "fixed",
        startTime: values.startTime == null ? entry.startTime : values.startTime,
        endTime: values.endTime == null ? entry.endTime : values.endTime,
        startNextDay: values.startNextDay == null ? entry.startNextDay === true : !!values.startNextDay,
        endNextDay: values.endNextDay == null ? !!entry.endNextDay : !!values.endNextDay
      };
      await withMutation(() => model.updateEntry(entryId, patch));
      timeDrafts.forEach((draft) => clearDraftIfCurrent(draft.key, draft.version));
    }
    if (pendingPreferencePatch) await saveOutputPreference(pendingPreferencePatch);
    if (fieldDrafts.size || pendingPreferencePatch) throw fieldFailure("DRAFTS_REMAIN", "仍有欄位未完成保存，專案保持開啟。");
    return true;
  }
  async function discardUncommittedChanges() {
    if (hasProductionTimelineDrafts(state && state.projectId)) throw fieldFailure("PRODUCTION_TIMELINE_DRAFT_REQUIRES_COMPONENT", "製作時程草稿請在時程元件內明確放棄；其他草稿未被更動。");
    if (lifecycle.phase === "saving" || uiPending > 0) throw fieldFailure("SAVE_IN_PROGRESS", "目前有保存交易進行中，完成後才能放棄未保存內容。");
    if (Number(lifecycle.pendingCount || 0) > 0 || lifecycle.phase === "save_failed") {
      if (typeof model.cancelPending !== "function") throw fieldFailure("CANCEL_UNAVAILABLE", "Model 未提供取消暫停命令的入口。");
      await model.cancelPending({ confirm: true });
    }
    fieldDrafts.clear(); pendingPreferencePatch = null;
    syncDraftSnapshot(); refreshLifecycle(modelLifecycle()); flushPendingShotSearch();
  }
  async function handleChangeField(field) {
    const existing = fieldDraftFor(field);
    const rawValue = field.type === "checkbox" ? !!field.checked : field.value;
    const draft = existing && existing.value === rawValue ? existing : captureFieldDraft(field);
    if (!draft || draft.deferred) return;
    await commitDraftSafe(draft, field);
  }
  function addShootingDay() {
    ensureDayDialog(); const days = state.days.slice().sort((a,b) => a.date.localeCompare(b.date)); const nextDate = days.length ? addDateDays(days[days.length-1].date,1) : new Date().toISOString().slice(0,10);
    $("#new-day-date").value = nextDate; $("#new-day-title").value = "第" + (state.days.length + 1) + "天"; $("#new-day-start").value = "09:00";
    const dialog = $("#day-dialog"); if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
  }
  async function downloadBackup() {
    try {
      const project = model.exportProject();
      if (!project) throw fieldFailure("PROJECT_NOT_READY", "尚未選定專案，無法匯出。");
      const pending = Number(lifecycle.pendingCount || 0) + uiPending > 0 || fieldDrafts.size > 0 || !!pendingPreferencePatch || hasProductionTimelineDrafts(state.projectId);
      await downloadJsonFile("storyboard-project-" + new Date().toISOString().slice(0,10) + ".json", project,
        pending ? "已建立目前已保存 revision 的 JSON 快照下載；尚未保存的內容未包含。" : "已建立 canonical JSON 專案快照下載。");
    } catch (error) { message(error.message || "JSON 專案快照無法建立", true); }
  }
  function completePackageImportBlockReason() {
    if (!model || typeof model.importCompletePackage !== "function") return "完整專案包匯入功能尚未載入。";
    const currentLifecycle = modelLifecycle();
    if (currentLifecycle.phase === "saving" || currentLifecycle.phase === "save_failed" || Number(currentLifecycle.pendingCount || 0) > 0 || uiPending > 0 || pendingMutationPromises.size) {
      return "目前有保存交易進行中或等待重試；先處理保存佇列，再匯入完整專案包。";
    }
    if (fieldDrafts.size || pendingPreferencePatch || hasProductionTimelineDrafts(state && state.projectId)) {
      return "目前有未提交欄位或製作時程草稿；請先保存或明確處理草稿。匯入不會替目前專案保存或放棄草稿。";
    }
    if (photoImportSession) return "目前有照片候選或匯入命令；請先完成或清除照片暫存。完整專案包不包含記憶體中的候選。";
    return null;
  }
  function completePackageExportBlockReason() {
    if (!model || typeof model.exportCompletePackage !== "function") return "完整專案包匯出功能尚未載入。";
    const currentLifecycle = modelLifecycle();
    if (!state || !currentLifecycle.writable || currentLifecycle.phase !== "ready") return "需要先開啟並取得目前專案編輯權。";
    if (completePackageExportBusy) return "完整專案包正在建立中。";
    if (Number(currentLifecycle.pendingCount || 0) > 0 || uiPending > 0 || pendingMutationPromises.size || currentLifecycle.phase === "save_failed") return "請先完成或處理保存佇列。";
    if (fieldDrafts.size || pendingPreferencePatch || hasProductionTimelineDrafts(state.projectId)) return "請先保存或明確處理未提交草稿。";
    if (photoImportSession) return "請先完成或清除照片候選；完整專案包不含記憶體中的候選。";
    return null;
  }
  function formatPackageByteLength(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024 * 1024) return Math.ceil(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }
  function ensureKinoDriveReady(api) {
    if (googleDriveReadyStarted) return;
    googleDriveReadyStarted = true;
    const readiness = api && api.ready;
    if (!readiness || typeof readiness.then !== "function") { googleDriveReadyState = "ready"; return; }
    googleDriveReadyState = "loading";
    Promise.resolve(readiness).then((ready) => {
      googleDriveReadyState = ready === false ? "failed" : "ready";
      renderGoogleDriveControls();
      renderLifecycleGate();
    }, () => {
      googleDriveReadyState = "failed";
      renderGoogleDriveControls();
      renderLifecycleGate();
    });
  }
  function kinoDriveCapability() {
    const api = window.KinoDrive;
    if (!api || typeof api.importZip !== "function" || typeof api.exportZip !== "function") {
      return { api: null, available: false, message: "Google Drive 整合模組尚未載入；本機 ZIP 匯入與下載仍可使用。" };
    }
    const config = window.KinoDriveConfig;
    if (!config || !config.clientId || !config.apiKey || !config.appId) {
      return { api: api, available: false, message: "Google Drive 尚未設定。請設定 window.KinoDriveConfig.clientId、apiKey 和 appId（Google Cloud Project number）後重載。" };
    }
    ensureKinoDriveReady(api);
    if (googleDriveReadyState === "loading" || googleDriveReadyState === "unknown") return { api: api, available: false, message: "正在準備 Google Drive 授權與選取器，請稍候。" };
    if (googleDriveReadyState === "failed") {
      let status = null;
      try { status = typeof api.getStatus === "function" ? api.getStatus() : null; } catch (_) {}
      const detail = status && (status.configError || status.error);
      return { api: api, available: false, message: detail && (detail.message || detail.code) || "Google Drive 元件尚未就緒，請檢查設定與網路後重載。" };
    }
    return { api: api, available: true, message: "" };
  }
  function hasPendingGoogleDriveUpload(api) {
    try { return !!(api && typeof api.getStatus === "function" && api.getStatus().pendingUpload); }
    catch (_) { return false; }
  }
  function pendingGoogleDriveUpload(api) {
    try { return api && typeof api.getStatus === "function" ? api.getStatus().pendingUpload : null; }
    catch (_) { return null; }
  }
  function googleDriveUploadCanResume(api, error) {
    if (!api || typeof api.resumeUpload !== "function" || (error && error.code === "DRIVE_UPLOAD_SESSION_EXPIRED")) return false;
    return hasPendingGoogleDriveUpload(api);
  }
  function safeDriveWebViewLink(value) {
    try {
      const url = new URL(String(value || ""), window.location.href);
      return url.protocol === "https:" && url.hostname === "drive.google.com" ? url.href : "";
    } catch (_) { return ""; }
  }
  function finishGoogleDriveDestination(choice, closeDialog) {
    const session = googleDriveDestinationSession;
    if (!session) return;
    googleDriveDestinationSession = null;
    const dialog = $("#drive-destination-dialog");
    const nameInput = $("#drive-destination-new-folder", dialog);
    if (nameInput) { nameInput.value = ""; nameInput.setCustomValidity(""); }
    if (closeDialog !== false && dialog && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    session.resolve(choice);
  }
  function renderGoogleDriveDestinationFolder(folder) {
    const folderName = $("#drive-destination-parent-name");
    if (folderName) folderName.textContent = String(folder && folder.name || "").trim() || "所選資料夾";
    const rootButton = $("#drive-destination-return-root");
    if (rootButton) rootButton.disabled = !folder || folder.id === "root";
  }
  function showGoogleDriveDestinationDialog(focusSelector) {
    const dialog = $("#drive-destination-dialog");
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else dialog.setAttribute("open", "open");
    const focusTarget = focusSelector ? $(focusSelector, dialog) : $("#drive-destination-save-parent", dialog);
    if (focusTarget) focusTarget.focus();
  }
  function closeGoogleDriveDestinationForPicker(dialog) {
    if (!dialog || !dialog.open) return;
    dialog.dataset.suppressDestinationClose = "true";
    if (typeof dialog.close === "function") dialog.close();
    else {
      dialog.removeAttribute("open");
      delete dialog.dataset.suppressDestinationClose;
    }
  }
  async function openGoogleDriveDestinationPicker() {
    const session = googleDriveDestinationSession;
    const dialog = $("#drive-destination-dialog");
    if (!session || !dialog || typeof session.chooseFolder !== "function" || session.pickerActive) return;
    const status = $("#drive-destination-picker-status", dialog);
    if (status) { status.textContent = ""; status.hidden = true; status.removeAttribute("data-kind"); }
    session.pickerActive = true;
    closeGoogleDriveDestinationForPicker(dialog);
    try {
      const folder = await session.chooseFolder();
      if (googleDriveDestinationSession !== session) return;
      if (folder && folder.id && folder.mimeType === "application/vnd.google-apps.folder") {
        session.folder = folder;
        renderGoogleDriveDestinationFolder(folder);
      }
    } catch (error) {
      if (googleDriveDestinationSession !== session) return;
      if (!error || error.code !== "DRIVE_CANCELLED") {
        if (status) {
          status.textContent = (error && error.code ? error.code + " · " : "") + (error && error.message || "無法開啟 Google Drive 資料夾選取器。");
          status.dataset.kind = "error";
          status.hidden = false;
        }
      }
    } finally {
      if (googleDriveDestinationSession === session) {
        session.pickerActive = false;
        showGoogleDriveDestinationDialog("#drive-destination-browse-folder");
      }
    }
  }
  function chooseGoogleDriveDestination(parentFolder, chooseFolder) {
    return new Promise((resolve) => {
      const dialog = $("#drive-destination-dialog");
      const nameInput = $("#drive-destination-new-folder", dialog);
      const folderName = $("#drive-destination-parent-name", dialog);
      if (!dialog || !nameInput || !folderName) { resolve(null); return; }
      if (googleDriveDestinationSession) finishGoogleDriveDestination(null);
      const defaultFolder = parentFolder && parentFolder.id && parentFolder.mimeType === "application/vnd.google-apps.folder"
        ? parentFolder
        : { id: "root", name: "我的雲端硬碟", mimeType: "application/vnd.google-apps.folder" };
      googleDriveDestinationSession = { resolve, folder: defaultFolder, chooseFolder, pickerActive: false };
      renderGoogleDriveDestinationFolder(defaultFolder);
      nameInput.value = "";
      nameInput.setCustomValidity("");
      const pickerStatus = $("#drive-destination-picker-status", dialog);
      if (pickerStatus) { pickerStatus.textContent = ""; pickerStatus.hidden = true; pickerStatus.removeAttribute("data-kind"); }
      if (!dialog.dataset.destinationCancelBound) {
        dialog.addEventListener("cancel", () => finishGoogleDriveDestination(null, false));
        dialog.addEventListener("close", () => {
          if (dialog.dataset.suppressDestinationClose === "true") { delete dialog.dataset.suppressDestinationClose; return; }
          if (!googleDriveDestinationSession || !googleDriveDestinationSession.pickerActive) finishGoogleDriveDestination(null, false);
        });
        nameInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const button = $("#drive-destination-save-parent", dialog);
            if (button) button.click();
          }
        });
        nameInput.addEventListener("input", () => nameInput.setCustomValidity(""));
        dialog.dataset.destinationCancelBound = "true";
      }
      showGoogleDriveDestinationDialog("#drive-destination-save-parent");
    });
  }
  function setGoogleDriveStatus(text, options) {
    const opts = options || {};
    googleDriveStatus = { text: String(text || ""), kind: opts.kind || "info", link: safeDriveWebViewLink(opts.link) };
    renderGoogleDriveControls();
    renderLifecycleGate();
  }
  function renderGoogleDriveControls(root) {
    const menu = root || $("#project-popover");
    if (!menu) return;
    const capability = kinoDriveCapability();
    const unavailableMessage = capability.available ? "" : capability.message;
    const statusNode = $("#google-drive-status", menu);
    const importButton = $("[data-drive-action='import']", menu);
    const exportButton = $("[data-drive-action='export']", menu);
    const cancelButton = $("[data-drive-action='cancel']", menu);
    const resumeButton = $("[data-drive-action='resume']", menu);
    const discardButton = $("[data-drive-action='discard-pending']", menu);
    const pendingUpload = pendingGoogleDriveUpload(capability.api);
    const exportBlock = completePackageExportBlockReason();
    if (importButton) importButton.disabled = !capability.available || !!googleDriveOperation || !!(completePackageImportSession && completePackageImportSession.status === "importing");
    if (exportButton) exportButton.disabled = !capability.available || !!googleDriveOperation || !!exportBlock;
    if (cancelButton) cancelButton.hidden = !googleDriveOperation || !googleDriveOperation.cancelable;
    if (resumeButton) resumeButton.hidden = !googleDriveResumeAvailable || !!googleDriveOperation || !capability.available;
    if (discardButton) discardButton.hidden = !pendingUpload || !pendingUpload.possibleDuplicate || !!pendingUpload.canResume || !!googleDriveOperation || !capability.available;
    if (statusNode) {
      const status = googleDriveStatus && googleDriveStatus.text ? googleDriveStatus : null;
      statusNode.replaceChildren();
      statusNode.dataset.kind = status && status.kind || (unavailableMessage ? "error" : "info");
      const text = status ? status.text : unavailableMessage || "只在你點選 Drive 動作並選擇匯入檔案或匯出儲存位置後才傳輸 ZIP；不會自動同步。首次授權只要求 drive.file。";
      statusNode.appendChild(document.createTextNode(text));
      const link = status && status.link;
      if (link) {
        const anchor = document.createElement("a");
        anchor.href = link;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = "在 Google Drive 開啟檔案";
        statusNode.appendChild(document.createElement("br"));
        statusNode.appendChild(anchor);
      }
      if (!status && capability.available && exportBlock && exportButton) exportButton.title = exportBlock;
    }
  }
  function formatDriveProgress(detail) {
    const progress = detail || {};
    const phase = progress.phase === "upload" ? "上傳" : "下載";
    const loaded = Math.max(0, Number(progress.loaded) || 0);
    const total = Math.max(0, Number(progress.total) || 0);
    return total > 0
      ? "Google Drive ZIP " + phase + "中：" + formatPackageByteLength(loaded) + " / " + formatPackageByteLength(total)
      : "Google Drive ZIP " + phase + "中：" + formatPackageByteLength(loaded);
  }
  function driveUploadCompletionText(result) {
    const hasSize = result && result.size != null && Number.isFinite(Number(result.size));
    const sizeText = hasSize ? formatPackageByteLength(result.size) : "大小未回傳";
    const sizeMatches = !!(result && result.sizeMatches === true) || !!(result && result.sizeMatches == null && hasSize && Number(result.size) > 0);
    const verification = sizeMatches
      ? "Drive 回傳的檔案大小符合封包；內容尚未從 Drive 回讀驗證。"
      : "Drive 未提供可核對的檔案大小；內容尚未從 Drive 回讀驗證。";
    return sizeText + "。" + verification;
  }
  function handleGoogleDriveProgress(event) {
    const detail = event && event.detail || {};
    if (!googleDriveOperation || !["download", "upload"].includes(detail.phase)) return;
    if (googleDriveOperation.kind === "import" && detail.phase !== "download") return;
    if (googleDriveOperation.kind === "export" && detail.phase !== "upload") return;
    setGoogleDriveStatus(formatDriveProgress(detail));
  }
  function beginGoogleDriveOperation(kind, cancelable) {
    googleDriveOperation = { kind: kind, cancelable: cancelable !== false };
    window.addEventListener("kinodrive:progress", handleGoogleDriveProgress);
    renderGoogleDriveControls();
    renderLifecycleGate();
  }
  function endGoogleDriveOperation() {
    window.removeEventListener("kinodrive:progress", handleGoogleDriveProgress);
    googleDriveOperation = null;
    renderGoogleDriveControls();
    renderLifecycleGate();
  }
  async function cancelGoogleDriveOperation() {
    const capability = kinoDriveCapability();
    if (!googleDriveOperation || !capability.api || typeof capability.api.cancelCurrent !== "function") return;
    googleDriveOperation.cancelable = false;
    setGoogleDriveStatus("正在取消 Google Drive 操作；遠端狀態將依 Drive 回應確認。");
    renderGoogleDriveControls();
    try {
      const cancelled = capability.api.cancelCurrent();
      if (!cancelled) {
        if (googleDriveOperation) googleDriveOperation.cancelable = true;
        setGoogleDriveStatus("目前階段無法取消；操作仍在進行。", { kind: "error" });
      }
    } catch (error) {
      if (googleDriveOperation) googleDriveOperation.cancelable = true;
      setGoogleDriveStatus((error && error.code ? error.code + " · " : "") + (error && error.message || "無法取消 Drive 操作。"), { kind: "error" });
    }
  }
  function openDrivePackageImport(bytes, fileName, origin) {
    completePackageImportOrigin = origin || "project-menu";
    return startCompletePackageImport(bytes, fileName, bytes.byteLength, completePackageImportOrigin, "google-drive");
  }
  async function importCompletePackageFromGoogleDrive(origin) {
    const capability = kinoDriveCapability();
    if (!capability.available) { setGoogleDriveStatus(capability.message, { kind: "error" }); return; }
    if (!model || typeof model.previewCompletePackage !== "function" || typeof model.importCompletePackage !== "function") {
      setGoogleDriveStatus("完整專案 ZIP 預覽功能尚未載入；沒有下載或寫入本機專案。", { kind: "error" }); return;
    }
    if (googleDriveOperation) return;
    if (completePackageImportSession && completePackageImportSession.status === "importing") return;
    googleDriveResumeAvailable = false;
    beginGoogleDriveOperation("import");
    setGoogleDriveStatus("正在開啟 Google 授權與 ZIP 選取器；目前專案尚未變更。");
    try {
      const result = await capability.api.importZip();
      if (!result || !(result.bytes instanceof Uint8Array)) throw Object.assign(new Error("Google Drive 未回傳有效的 ZIP bytes。"), { code: "DRIVE_IMPORT_RESULT_INVALID" });
      const fileName = String(result.name || "").trim();
      if (!/\.zip$/i.test(fileName)) throw Object.assign(new Error("選取的 Google Drive 檔案名稱不是 .zip。"), { code: "DRIVE_FILE_NOT_ZIP" });
      const actualSize = result.bytes.byteLength;
      if (!actualSize) throw Object.assign(new Error("Google Drive 回傳空白 ZIP。"), { code: "DRIVE_ARCHIVE_EMPTY" });
      if (result.size != null && Number(result.size) !== actualSize) throw Object.assign(new Error("Google Drive 檔案 metadata 大小與下載 bytes 不符；沒有寫入本機專案。"), { code: "DRIVE_SIZE_MISMATCH" });
      if (actualSize > 516 * 1024 * 1024) throw Object.assign(new Error("ZIP 超過目前完整專案包上限 516 MiB。"), { code: "ARCHIVE_SIZE_LIMIT" });
      endGoogleDriveOperation();
      setGoogleDriveStatus("ZIP 已下載；正在使用既有完整封包驗證流程，確認前不會寫入本機。");
      const session = await openDrivePackageImport(result.bytes, fileName, origin || "project-menu");
      if (session && session.preview) setGoogleDriveStatus("Google Drive ZIP 完整預覽驗證通過；請在預覽視窗確認還原或另存副本。");
      else if (session && session.error) setGoogleDriveStatus("Google Drive ZIP 驗證未通過 · " + (session.error.code ? session.error.code + " · " : "") + (session.error.message || "封包無法驗證。"), { kind: "error" });
    } catch (error) {
      endGoogleDriveOperation();
      if (error && (error.cancelled || error.code === "DRIVE_CANCELLED")) { setGoogleDriveStatus("已取消 Google Drive 匯入；本機專案未變更。"); return; }
      setGoogleDriveStatus((error && error.code ? error.code + " · " : "") + (error && error.message || "Google Drive ZIP 匯入失敗；本機專案未變更。"), { kind: "error" });
      message((error && error.code ? error.code + " · " : "") + (error && error.message || "Google Drive ZIP 匯入失敗；本機專案未變更。"), true);
    } finally { endGoogleDriveOperation(); }
  }
  async function exportCompletePackageToGoogleDrive() {
    const capability = kinoDriveCapability();
    if (!capability.available) { setGoogleDriveStatus(capability.message, { kind: "error" }); return; }
    const blocker = completePackageExportBlockReason();
    if (blocker) { setGoogleDriveStatus(blocker, { kind: "error" }); message(blocker, true); return; }
    if (googleDriveOperation) return;
    googleDriveResumeAvailable = false;
    completePackageExportBusy = true;
    beginGoogleDriveOperation("export");
    setGoogleDriveStatus("正在確認保存狀態、固定 revision 並建立 ZIP。");
    try {
      let archive = null;
      const resultPromise = capability.api.exportZip(async function () {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        archive = await model.exportCompletePackage();
        if (!archive || !(archive.archiveBytes instanceof Uint8Array) || !archive.archiveBytes.byteLength || !archive.fileName) throw Object.assign(new Error("Model 未回傳有效的完整專案 ZIP bytes。"), { code: "PACKAGE_EXPORT_RESULT_INVALID" });
        setGoogleDriveStatus("本機 ZIP 已驗證；正在選擇 Google Drive 儲存位置並上傳新檔。");
        return archive;
      }, undefined, {
        chooseDestination: function (folder, chooseFolder) { return chooseGoogleDriveDestination(folder, chooseFolder); },
        onProgress: function (progress) { if (progress && progress.phase === "upload") setGoogleDriveStatus(formatDriveProgress(progress)); }
      });
      const result = await resultPromise;
      if (!result || !result.id || !result.name || (result.size != null && Number(result.size) !== archive.archiveBytes.byteLength)) {
        googleDriveResumeAvailable = hasPendingGoogleDriveUpload(capability.api);
        throw Object.assign(new Error("Drive 未回傳可核對的檔案 ID、檔名與相符大小。請先檢查 Drive，再決定是否續傳；不要直接重送。"), { code: "DRIVE_UPLOAD_RESULT_UNCONFIRMED" });
      }
      googleDriveResumeAvailable = false;
      const folder = result.folderName ? " · 資料夾：" + result.folderName : "";
      const completion = driveUploadCompletionText(result);
      setGoogleDriveStatus("上傳完成：" + result.name + folder + " · " + completion, { kind: "success", link: result.webViewLink });
      message("完整專案 ZIP 已上傳至 Google Drive。" + completion, false);
    } catch (error) {
      googleDriveResumeAvailable = googleDriveUploadCanResume(capability.api, error);
      if (error && (error.cancelled || error.code === "DRIVE_CANCELLED")) setGoogleDriveStatus("已取消 Google Drive 上傳；若有待確認傳輸，可按「續傳上傳」先查詢遠端結果，不會直接建立新檔。" + (googleDriveResumeAvailable ? "" : " 請先檢查 Drive 再決定後續操作。"), { kind: "error" });
      else if (error && error.code === "DRIVE_UPLOAD_SESSION_EXPIRED") setGoogleDriveStatus("上傳工作階段已過期，遠端結果需人工確認；請先檢查 Drive，直接重試可能建立重複檔案。", { kind: "error" });
      else {
        const code = error && error.code ? error.code + " · " : "";
        const detail = error && error.message || "Google Drive 上傳失敗。";
        setGoogleDriveStatus(code + detail + (googleDriveResumeAvailable ? " 可按「續傳上傳」查詢／恢復本次傳輸。" : ""), { kind: "error" });
        message(code + detail, true);
      }
    } finally {
      completePackageExportBusy = false;
      endGoogleDriveOperation();
    }
  }
  async function resumeGoogleDriveUpload() {
    const capability = kinoDriveCapability();
    if (!capability.available || !googleDriveResumeAvailable || typeof capability.api.resumeUpload !== "function" || googleDriveOperation) return;
    beginGoogleDriveOperation("export");
    setGoogleDriveStatus("正在查詢並續傳本次 Google Drive ZIP 上傳；不會建立另一個新檔。");
    try {
      const result = await capability.api.resumeUpload({ onProgress: function (progress) { if (progress && progress.phase === "upload") setGoogleDriveStatus(formatDriveProgress(progress)); } });
      if (!result || !result.id || !result.name) {
        googleDriveResumeAvailable = hasPendingGoogleDriveUpload(capability.api);
        throw Object.assign(new Error("Drive 未回傳可核對的檔案 ID、檔名與大小；請先檢查 Drive，不要直接重送。"), { code: "DRIVE_UPLOAD_RESULT_UNCONFIRMED" });
      }
      googleDriveResumeAvailable = false;
      setGoogleDriveStatus("上傳完成：" + String(result.name) + " · " + driveUploadCompletionText(result), { kind: "success", link: result.webViewLink });
    } catch (error) {
      googleDriveResumeAvailable = googleDriveUploadCanResume(capability.api, error);
      if (error && (error.cancelled || error.code === "DRIVE_CANCELLED")) setGoogleDriveStatus("已取消續傳；遠端上傳結果仍待確認。", { kind: "error" });
      else if (error && error.code === "DRIVE_UPLOAD_SESSION_EXPIRED") setGoogleDriveStatus("上傳工作階段已過期，遠端結果需人工確認；請先檢查 Drive，直接重試可能建立重複檔案。", { kind: "error" });
      else setGoogleDriveStatus((error && error.code ? error.code + " · " : "") + (error && error.message || "無法續傳 Google Drive 上傳。"), { kind: "error" });
    } finally { endGoogleDriveOperation(); }
  }
  function confirmDiscardGoogleDriveUpload() {
    const capability = kinoDriveCapability();
    if (!capability.available || !capability.api || typeof capability.api.discardPendingUpload !== "function" || googleDriveOperation) return;
    const pending = pendingGoogleDriveUpload(capability.api);
    if (!pending) { googleDriveResumeAvailable = false; renderGoogleDriveControls(); return; }
    showConfirm(
      "清除待確認的 Drive 上傳",
      "清除只會移除本頁記憶體中的續傳資料，不會刪除 Drive 檔案。遠端 ZIP 可能已建立；請先在 Drive 檢查。若再次上傳，可能產生重複檔案。",
      "清除記憶體暫存",
      async function () {
        try {
          capability.api.discardPendingUpload({ confirmPossibleDuplicate: true });
          googleDriveResumeAvailable = false;
          setGoogleDriveStatus("續傳暫存已清除；Drive 上可能仍有原上傳檔案。再次上傳前請先檢查 Drive。", { kind: "error" });
          return true;
        } catch (error) {
          setGoogleDriveStatus((error && error.code ? error.code + " · " : "") + (error && error.message || "無法清除待確認上傳。"), { kind: "error" });
          return false;
        }
      }
    );
  }
  async function handleGoogleDriveAction(action) {
    if (action === "import") { await importCompletePackageFromGoogleDrive(); return; }
    if (action === "export") { await exportCompletePackageToGoogleDrive(); return; }
    if (action === "cancel") { await cancelGoogleDriveOperation(); return; }
    if (action === "resume") { await resumeGoogleDriveUpload(); }
    if (action === "discard-pending") { confirmDiscardGoogleDriveUpload(); }
  }
  function safePackageImportPath(value) {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").slice(0, 240);
  }
  function packageImportButton(action, label, primary, disabled) {
    return '<button type="button" class="' + (primary ? "primary-button" : "outline-button") + '" data-package-import-action="' + escapeHtml(action) + '" ' + (disabled ? "disabled" : "") + '>' + escapeHtml(label) + '</button>';
  }
  function renderCompletePackageImportDialog() {
    const dialog = $("#complete-package-import-dialog");
    const content = $("#complete-package-import-content");
    const actions = $("#complete-package-import-actions");
    if (!dialog || !content || !actions) return;
    const session = completePackageImportSession;
    if (!session) {
      content.innerHTML = '<p class="package-import-status">選取 .storyboard.zip 後，系統會先完整驗證封包並列出內容；確認前不會匯入。</p>';
      actions.innerHTML = packageImportButton("cancel", "取消", false, false);
      return;
    }
    const busy = ["reading", "previewing", "importing"].includes(session.status);
    const sourceLabel = session.source === "google-drive" ? '<small class="package-import-source">來源：Google Drive；ZIP 僅保留在本次匯入記憶體中</small>' : "";
    const fileSummary = '<div class="package-import-file"><div><strong>' + escapeHtml(session.fileName || "未命名專案包") + '</strong>' + sourceLabel + '</div><span>' + formatPackageByteLength(session.fileSize) + '</span></div>';
    let status = "";
    if (session.status === "reading") status = '<p class="package-import-status" role="status">' + (session.source === "google-drive" ? "正在準備 Google Drive ZIP bytes；來源專案尚未變更。" : "正在讀取 ZIP bytes；來源專案尚未變更。") + '</p>';
    else if (session.status === "previewing") status = '<p class="package-import-status" role="status">正在驗證 ZIP、Manifest、完整 Asset 與專案引用…此步驟不會寫入專案。</p>';
    else if (session.status === "importing") status = '<p class="package-import-status" role="status">正在以本機交易新增專案；目前工作專案不會切換。</p>';
    else if (session.status === "failed" && !session.preview) {
      const errorPath = session.error && session.error.code === "UNSUPPORTED_EXTENSION_FIELD" ? safePackageImportPath(session.error.path) : "";
      status = '<p class="package-import-error" role="alert">完整驗證失敗 · ' + escapeHtml((session.error && session.error.code ? session.error.code + " · " : "") + (session.error && session.error.message || "封包無法驗證。")) + (errorPath ? '<br>欄位位置：<code>' + escapeHtml(errorPath) + '</code>' : "") + '</p>';
    }
    let report = "";
    if (session.preview) {
      const preview = session.preview;
      const counts = preview.counts || {};
      const rows = [
        ["場次", counts.scenes], ["鏡頭", counts.shots], ["拍攝日", counts.shootingDays], ["拍攝項目", counts.scheduleEntries],
        ["製作時程任務", counts.productionTasks], ["資產", counts.assets], ["手繪 Drawing", counts.drawings]
      ].map(([label, count]) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(count == null ? "—" : count) + '</dd></div>').join("");
      const modeText = session.mode === "copy" ? "另存副本：匯入時將建立新的專案 ID。內部引用會依新 ID 重映射。" : "還原：保留封包中的 Project ID；若本機已有相同 ID，會拒絕匯入，不覆寫。";
      const collision = session.collision
        ? '<p class="package-import-collision" role="alert">' + (session.mode === "copy" ? "另存副本 ID 與本機資料衝突；尚未匯入，請重新驗證以建立新 ID。" : session.copyBlockedByExtension ? "本機已有相同 Project ID；不會覆蓋。此封包含有無法安全重映射的欄位，不能另存副本；請使用可辨識此欄位的版本重新匯出，或選擇其他封包。" : "本機已有相同 Project ID；不會覆蓋此專案。請選擇「另存副本」並重新驗證。") + '</p>'
        : "";
      const validation = '<section class="package-validation-result"><strong>完整封包驗證通過</strong><ul><li>ZIP 結構、entry 路徑與 CRC</li><li>Manifest entry 清單、byteLength 與 SHA-256</li><li>Project schema、Asset／Drawing／Shot 引用</li><li>原始圖片 bytes、MIME、hash 與可解碼尺寸</li></ul></section>';
      const included = '<p class="package-import-scope"><strong>將保留：</strong>場次、分鏡、拍攝日與排程、製作時程、原始照片與完整手繪筆跡。</p><p class="package-import-scope"><strong>不包含：</strong>裝置本機 undo／redo 歷史、lease、未提交草稿或記憶體中的檔案候選。</p>';
      const noSwitch = '<p class="package-import-scope">' + escapeHtml(modeText) + ' 匯入成功後只加入本機專案清單，不會切換目前工作專案。</p>';
      const imageNote = '<p class="package-import-footnote">驗證結果只確認封包資料與圖片 bytes/hash/解碼尺寸；不判斷照片或手繪的視覺內容品質。</p>';
      report = '<section class="package-import-preview"><h3>' + escapeHtml(preview.title || "未命名專案") + '</h3><p>來源專案 ID：<code>' + escapeHtml(preview.projectId) + '</code> · 來源 revision：' + escapeHtml(preview.revision) + '</p><dl class="package-import-counts">' + rows + '</dl>' + validation + collision + included + noSwitch + imageNote + '</section>';
    }
    const error = session.error && session.preview && session.status !== "failed"
      ? '<p class="package-import-error" role="alert">' + escapeHtml((session.error.code ? session.error.code + " · " : "") + (session.error.message || "匯入尚未完成。")) + '</p>'
      : "";
    const unsupportedCopy = session.status === "failed" && session.mode === "copy" && session.error && session.error.code === "UNSUPPORTED_EXTENSION_FIELD";
    const copyGuidance = unsupportedCopy
      ? '<p class="package-import-scope">為避免錯接內部引用，未建立副本且未寫入。可明確改用原 Project ID 還原重新驗證；若本機已有該 ID，系統不會覆寫。若需要新副本，請使用可辨識此欄位的版本重新匯出。</p>'
      : session.status === "failed" && session.mode === "restore" && session.copyBlockedByExtension && session.error && session.error.code === "PROJECT_EXISTS"
        ? '<p class="package-import-scope">還原因相同 Project ID 而停止，沒有覆寫資料。此封包也不能安全另存副本；請使用可辨識此欄位的版本重新匯出，或選擇其他封包。</p>'
        : "";
    content.innerHTML = fileSummary + status + report + error + copyGuidance;
    let buttonMarkup = "";
    if (!busy) {
      if (session.preview && session.mode === "restore") {
        if (session.collision && session.copyBlockedByExtension) buttonMarkup += packageImportButton("choose-file", "選擇其他 ZIP", false, false);
        else if (session.collision) buttonMarkup += packageImportButton("preview-copy", "另存副本並重新驗證", true, false);
        else {
          const blocker = completePackageImportBlockReason();
          buttonMarkup += packageImportButton("confirm", "確認還原為本機專案", true, false);
          buttonMarkup += packageImportButton("preview-copy", "另存副本", false, false);
          if (blocker) content.insertAdjacentHTML("beforeend", '<p class="package-import-error" role="alert">' + escapeHtml(blocker) + '</p>');
        }
      } else if (session.preview && session.mode === "copy") {
        const blocker = completePackageImportBlockReason();
        buttonMarkup += packageImportButton("confirm", "確認另存副本", true, false);
        if (blocker) content.insertAdjacentHTML("beforeend", '<p class="package-import-error" role="alert">' + escapeHtml(blocker) + '</p>');
      } else if (session.status === "failed") {
        if (unsupportedCopy) buttonMarkup += packageImportButton("preview-restore", "改用原 ID 還原並重新驗證", true, false);
        else if (session.archiveFile) buttonMarkup += packageImportButton("retry-preview", "重新驗證封包", true, false);
        buttonMarkup += packageImportButton("choose-file", "選擇其他 ZIP", false, false);
        if (session.mode === "restore" && session.collision && !session.copyBlockedByExtension) buttonMarkup += packageImportButton("preview-copy", "改以另存副本", false, false);
      }
      buttonMarkup += packageImportButton("cancel", "取消", false, false);
    } else buttonMarkup = packageImportButton("cancel", "取消", false, session.status === "importing");
    actions.innerHTML = buttonMarkup;
    const cancel = actions.querySelector('[data-package-import-action="cancel"]');
    const close = dialog.querySelector(".dialog-close");
    if (close) close.disabled = session.status === "importing";
    if (cancel) cancel.disabled = session.status === "importing";
  }
  function openCompletePackagePicker(origin) {
    if (googleDriveOperation && googleDriveOperation.kind === "import") { message("Google Drive ZIP 正在下載；請等候這次操作完成後再選擇本機 ZIP。", true); return; }
    const input = $("#complete-package-picker");
    if (!input || !model || typeof model.previewCompletePackage !== "function" || typeof model.importCompletePackage !== "function") {
      message("完整專案包 API 尚未載入；沒有選取檔案。", true); return;
    }
    if (completePackageImportSession && completePackageImportSession.status === "importing") return;
    completePackageImportOrigin = origin || "project-menu";
    input.value = "";
    input.click();
  }
  async function previewCompletePackageImport(session, mode) {
    if (!session || completePackageImportSession !== session || !session.archiveFile) return;
    if (session.previewAbortController) session.previewAbortController.abort();
    const previewSequence = Number(session.previewSequence || 0) + 1;
    session.previewSequence = previewSequence;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    session.previewAbortController = controller;
    const isCurrentPreview = () => completePackageImportSession === session && session.previewSequence === previewSequence;
    session.mode = mode === "copy" ? "copy" : "restore";
    session.status = "previewing"; session.preview = null; session.error = null; session.collision = false;
    renderCompletePackageImportDialog();
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (completePackageImportSession !== session) return;
      const summaries = await model.refreshProjects();
      if (completePackageImportSession !== session) return;
      const preview = await model.previewCompletePackage(session.archiveFile, { mode: session.mode, signal: controller && controller.signal });
      if (!isCurrentPreview()) return;
      session.preview = preview;
      session.collision = session.mode === "restore" && (summaries || []).some((item) => String(item.projectId || item.id || "") === String(preview.projectId || ""));
      session.status = "ready";
      session.error = null;
    } catch (error) {
      if (!isCurrentPreview()) return;
      session.status = "failed";
      session.error = {
        code: error && error.code || "PACKAGE_PREVIEW_FAILED",
        message: error && error.message || "完整專案包驗證失敗。",
        path: error && error.details && typeof error.details.path === "string" ? safePackageImportPath(error.details.path) : ""
      };
      if (session.mode === "copy" && session.error.code === "UNSUPPORTED_EXTENSION_FIELD") session.copyBlockedByExtension = true;
      if (["PROJECT_EXISTS", "PROJECT_DATA_EXISTS", "PROJECT_LOCKED"].includes(session.error.code)) session.collision = true;
    }
    if (session.previewAbortController === controller) session.previewAbortController = null;
    if (isCurrentPreview()) renderCompletePackageImportDialog();
  }
  async function handleCompletePackageFile(input) {
    const file = input && input.files && input.files[0];
    if (input) input.value = "";
    if (!file) return;
    return startCompletePackageImport(file, file.name || "未命名專案包", file.size || 0, completePackageImportOrigin, "local");
  }
  async function startCompletePackageImport(archiveInput, fileName, fileSize, origin, source) {
    if (!archiveInput) return null;
    if (googleDriveOperation && googleDriveOperation.kind === "import" && source !== "google-drive") return null;
    if (!model || typeof model.previewCompletePackage !== "function" || typeof model.importCompletePackage !== "function") {
      const error = { code: "PACKAGE_IMPORT_API_UNAVAILABLE", message: "完整專案包 API 尚未載入；沒有寫入專案。" };
      message(error.code + " · " + error.message, true);
      return null;
    }
    if (completePackageImportSession && completePackageImportSession.status === "importing") return null;
    if (completePackageImportSession && completePackageImportSession.source === "google-drive" && source !== "google-drive") {
      setGoogleDriveStatus("Google Drive ZIP 預覽已被新的本機匯入取代；尚未寫入本機專案。");
    }
    if (completePackageImportSession && completePackageImportSession.previewAbortController) {
      completePackageImportSession.previewAbortController.abort();
      completePackageImportSession.previewAbortController = null;
    }
    const session = {
      id: ++completePackageImportSequence,
      origin: origin || "project-menu",
      source: source || "local",
      fileName: fileName || "未命名專案包",
      fileSize: Number(fileSize) || 0,
      archiveFile: archiveInput,
      mode: "restore",
      preview: null,
      collision: false,
      status: "reading",
      error: null
    };
    completePackageImportSession = session;
    renderCompletePackageImportDialog();
    const dialog = $("#complete-package-import-dialog");
    if (dialog && !dialog.open && typeof dialog.showModal === "function") dialog.showModal();
    else if (dialog && !dialog.open) dialog.setAttribute("open", "");
    try {
      const maxBytes = 516 * 1024 * 1024;
      if (session.fileSize > maxBytes) throw Object.assign(new Error("ZIP 超過目前完整專案包上限 516 MiB。"), { code: "ARCHIVE_SIZE_LIMIT" });
      if (completePackageImportSession !== session) return;
      await previewCompletePackageImport(session, "restore");
      return session;
    } catch (error) {
      if (completePackageImportSession !== session) return;
      session.status = "failed";
      session.error = { code: error && error.code || "PACKAGE_FILE_READ_FAILED", message: error && error.message || "無法讀取所選專案包。" };
      renderCompletePackageImportDialog();
      return session;
    }
  }
  function cancelCompletePackageImport() {
    if (completePackageImportSession && completePackageImportSession.status === "importing") return;
    const cancelledDriveImport = !!(completePackageImportSession && completePackageImportSession.source === "google-drive");
    if (completePackageImportSession && completePackageImportSession.previewAbortController) {
      completePackageImportSession.previewAbortController.abort();
      completePackageImportSession.previewAbortController = null;
    }
    completePackageImportSession = null;
    const input = $("#complete-package-picker"); if (input) input.value = "";
    const dialog = $("#complete-package-import-dialog");
    if (dialog && dialog.open && typeof dialog.close === "function") dialog.close();
    renderCompletePackageImportDialog();
    if (cancelledDriveImport) setGoogleDriveStatus("已取消 Google Drive ZIP 預覽／確認；本機專案未變更。");
  }
  async function confirmCompletePackageImport() {
    const session = completePackageImportSession;
    if (!session || !session.preview || !session.archiveFile || session.preview.mode !== session.mode) return;
    const blocker = completePackageImportBlockReason();
    if (blocker) { session.error = { code: "PACKAGE_IMPORT_BLOCKED", message: blocker }; renderCompletePackageImportDialog(); return; }
    session.status = "importing"; session.error = null; renderCompletePackageImportDialog();
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (completePackageImportSession !== session) return;
      const result = await model.importCompletePackage(session.archiveFile, { mode: session.mode });
      try { await model.refreshProjects(); } catch (_) { /* The import API already updates the local project summary after commit. */ }
      refreshLifecycle(modelLifecycle());
      if (!document.body.classList.contains("project-ready")) {
        lifecycleGateForced = true;
        refreshLifecycle(Object.assign({}, modelLifecycle(), { phase: "choosing" }));
      }
      completePackageImportSession = null;
      const dialog = $("#complete-package-import-dialog"); if (dialog && dialog.open && typeof dialog.close === "function") dialog.close();
      renderCompletePackageImportDialog();
      if (session.source === "google-drive") setGoogleDriveStatus("Google Drive ZIP 已依確認新增至本機專案清單；目前工作專案未切換。");
      const importedProjectId = result && result.projectId || (session.preview && session.preview.projectId) || "";
      message((session.mode === "copy" ? "完整專案已另存為副本" : "完整專案已還原") + "並加入本機專案清單（Project ID " + importedProjectId + "）。目前工作專案沒有切換；本機 undo／redo 不在封包內。", false);
    } catch (error) {
      session.status = "ready";
      session.error = { code: error && error.code || "PACKAGE_IMPORT_FAILED", message: error && error.message || "完整專案包匯入失敗；原專案未被此匯入修改。" };
      if (["PROJECT_EXISTS", "PROJECT_DATA_EXISTS", "PROJECT_LOCKED"].includes(session.error.code)) session.collision = true;
      refreshLifecycle(modelLifecycle());
      renderCompletePackageImportDialog();
    }
  }
  async function handleCompletePackageImportAction(action) {
    const session = completePackageImportSession;
    if (action === "cancel") { cancelCompletePackageImport(); return; }
    if (!session) return;
    if (action === "choose-file") { openCompletePackagePicker(session.origin); return; }
    if (action === "preview-copy") { await previewCompletePackageImport(session, "copy"); return; }
    if (action === "preview-restore") { session.copyBlockedByExtension = true; await previewCompletePackageImport(session, "restore"); return; }
    if (action === "retry-preview") { await previewCompletePackageImport(session, session.mode); return; }
    if (action === "confirm") await confirmCompletePackageImport();
  }
  async function downloadCompletePackage() {
    const blocker = completePackageExportBlockReason();
    if (blocker) { message(blocker, true); return; }
    completePackageExportBusy = true;
    const status = $("#complete-package-export-status"); if (status) status.textContent = "正在驗證 Asset 並建立完整 ZIP…";
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const result = await model.exportCompletePackage();
      if (!result || !(result.archiveBytes instanceof Uint8Array) || !result.archiveBytes.byteLength || !result.fileName) throw Object.assign(new Error("Model 未回傳有效的完整專案 ZIP bytes。"), { code: "PACKAGE_EXPORT_RESULT_INVALID" });
      const blob = new Blob([result.archiveBytes], { type: result.mediaType || "application/zip" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.fileName; anchor.style.display = "none";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 60000);
      if (status) status.textContent = "已建立下載：" + result.fileName + " · " + formatPackageByteLength(result.archiveBytes.byteLength);
      message("已建立完整專案 ZIP 下載；包含已保存原始照片與 Drawing。裝置本機 undo／redo 不在封包內。", false);
    } catch (error) {
      if (status) status.textContent = (error && error.code ? error.code + " · " : "") + (error && error.message || "完整專案 ZIP 建立失敗。");
      message((error && error.code ? error.code + " · " : "") + (error && error.message || "完整專案 ZIP 建立失敗；目前專案未變更。"), true);
    } finally { completePackageExportBusy = false; }
  }
  async function downloadRescue() {
    try {
      const rescued = await model.exportRescue({ drafts: draftSnapshot() });
      const payload = Object.assign({ format: "director-storyboard-rescue", version: 1, complete: false }, rescued || {});
      payload.drafts = draftSnapshot();
      if (lifecycle.migrationPreview && lifecycle.migrationPreview.sourceRaw != null && payload.sourceRaw == null) payload.sourceRaw = lifecycle.migrationPreview.sourceRaw;
      if (lifecycle.sourceRaw != null && payload.sourceRaw == null) payload.sourceRaw = lifecycle.sourceRaw;
      payload.complete = false;
      await downloadJsonFile("storyboard-rescue-" + new Date().toISOString().slice(0,10) + ".json", payload, "已建立資料救援下載；此 JSON 不含完整圖片檔案。");
    } catch (error) { message((error.code ? error.code + " · " : "") + (error.message || "救援資料無法建立"), true); }
  }
  async function downloadLegacyRaw() {
    const preview = lifecycle.migrationPreview || lifecycle.migration || {};
    const sourceRaw = preview.sourceRaw == null ? lifecycle.sourceRaw : preview.sourceRaw;
    if (sourceRaw == null) { message("目前沒有可下載的原始舊稿。", true); return; }
    const blob = new Blob([sourceRaw], { type: "application/json" }); const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "storyboard-legacy-source-" + new Date().toISOString().slice(0,10) + ".json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); message("已建立舊稿原始字串下載；來源未被修改。");
  }
  async function requestProjectSwitch() {
    cancelPhotoIntegrityCheck("已開始切換專案", true);
    try {
      await commitAllDrafts();
      lifecycleGateForced = true; refreshLifecycle(modelLifecycle()); renderLifecycleGate();
    } catch (error) { message((error.code ? error.code + " · " : "") + (error.message || "欄位保存未完成，無法切換專案。"), true); }
  }
  const PHOTO_INTEGRITY_DAMAGE_CODES = new Set([
    "ASSET_MISSING", "CORRUPT_ASSET", "ASSET_METADATA_MISMATCH", "ASSET_SIZE_MISMATCH", "ASSET_HASH_MISMATCH"
  ]);
  function photoIntegrityAssetSnapshot(project) {
    return (project && Array.isArray(project.assets) ? project.assets : [])
      .filter((asset) => asset && asset.role === "photoOriginal")
      .map((asset) => ({ id: asset.id, sha256: asset.sha256, byteLength: asset.byteLength, metadata: JSON.stringify(asset) }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  }
  function samePhotoIntegritySnapshot(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  function renderPhotoIntegrityStatus() {
    const status = $("#photo-integrity-status");
    if (!status) return;
    status.style.whiteSpace = "pre-line";
    const session = photoIntegrityCheck;
    if (!session) {
      status.textContent = "手動逐張驗證本機原始照片 bytes 與 SHA-256；不修改專案或照片，也不代表每次保存都已驗證。";
    } else {
      const lines = ["專案 ID：" + session.projectId];
      if (session.status === "checking") {
        lines.push("檢查中：" + session.checked + "/" + session.total + " · 開始時間 UTC：" + session.startedAt);
      } else if (session.status === "completed") {
        lines.push("檢查完成：" + session.checked + "/" + session.total + " · 檢查時間 UTC：" + session.finishedAt);
      } else if (session.status === "incomplete") {
        lines.push("檢查未完整：" + session.checked + "/" + session.total + " · 檢查時間 UTC：" + session.finishedAt);
      } else {
        lines.push("檢查已取消：" + session.checked + "/" + session.total + " · " + session.cancelReason + " · 時間 UTC：" + session.finishedAt);
      }
      if (session.damaged.length) {
        lines.push("損壞或缺失：");
        session.damaged.forEach((item) => lines.push(item.id + " · " + item.code));
      } else if (session.status === "completed") {
        lines.push("未發現原圖 bytes、大小或 metadata 不一致。");
      }
      if (session.unverified.length) {
        lines.push("未能驗證（不代表已確認損壞）：");
        session.unverified.forEach((item) => lines.push(item.id + " · " + item.code));
      }
      if (session.status === "completed" && session.total === 0) lines.push("此專案沒有原始照片 Asset。");
      status.textContent = lines.join("\n");
    }
    const runButton = $("#photo-integrity-run");
    if (runButton) runButton.disabled = !!(session && session.status === "checking");
    const cancelButton = $("#photo-integrity-cancel");
    if (cancelButton) {
      const checking = !!(session && session.status === "checking");
      cancelButton.hidden = !checking;
      cancelButton.style.display = checking ? "flex" : "none";
    }
  }
  function cancelPhotoIntegrityCheck(reason, notify, expectedSession) {
    const session = photoIntegrityCheck;
    if (!session || session.status !== "checking" || (expectedSession && session !== expectedSession)) return false;
    session.status = "cancelled";
    session.cancelReason = reason || "使用者取消";
    session.finishedAt = new Date().toISOString();
    renderPhotoIntegrityStatus();
    if (notify) message("" + session.cancelReason + "；照片完整性檢查已停止，已檢查 " + session.checked + "/" + session.total + " 張。", false);
    return true;
  }
  function photoIntegrityContextReason(session) {
    if (!session || photoIntegrityCheck !== session || session.status !== "checking") return "檢查已停止";
    const current = model && typeof model.getProject === "function" ? model.getProject() : state;
    if (!current || current.projectId !== session.projectId) return "專案已切換";
    if (!samePhotoIntegritySnapshot(photoIntegrityAssetSnapshot(current), session.assets)) return "照片清單已變更，請重新檢查";
    return "";
  }
  async function startPhotoIntegrityCheck() {
    if (!state || !model || typeof model.getAsset !== "function") {
      message("目前沒有可檢查的已開啟專案。", true);
      return;
    }
    if (photoIntegrityCheck && photoIntegrityCheck.status === "checking") return;
    const project = model.getProject ? model.getProject() : state;
    if (!project || !project.projectId) { message("目前沒有可檢查的已開啟專案。", true); return; }
    const assets = photoIntegrityAssetSnapshot(project);
    const session = {
      id: ++photoIntegrityCheckSequence,
      projectId: project.projectId,
      assets: assets,
      total: assets.length,
      checked: 0,
      damaged: [],
      unverified: [],
      status: "checking",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      cancelReason: ""
    };
    photoIntegrityCheck = session;
    renderPhotoIntegrityStatus();
    for (const asset of assets) {
      const staleReason = photoIntegrityContextReason(session);
      if (staleReason) {
        cancelPhotoIntegrityCheck(staleReason, staleReason === "專案已切換", session);
        return;
      }
      try {
        const loaded = await model.getAsset(session.projectId, asset.id);
        const afterReadReason = photoIntegrityContextReason(session);
        if (afterReadReason) {
          cancelPhotoIntegrityCheck(afterReadReason, afterReadReason === "專案已切換", session);
          return;
        }
        if (!loaded) session.damaged.push({ id: asset.id, code: "ASSET_MISSING" });
      } catch (error) {
        const afterErrorReason = photoIntegrityContextReason(session);
        if (afterErrorReason) {
          cancelPhotoIntegrityCheck(afterErrorReason, afterErrorReason === "專案已切換", session);
          return;
        }
        const code = error && error.code || "ASSET_READ_FAILED";
        (PHOTO_INTEGRITY_DAMAGE_CODES.has(code) ? session.damaged : session.unverified).push({ id: asset.id, code: code });
      }
      session.checked += 1;
      renderPhotoIntegrityStatus();
    }
    session.finishedAt = new Date().toISOString();
    session.status = session.unverified.length ? "incomplete" : "completed";
    renderPhotoIntegrityStatus();
  }
  function toggleProjectMenu() {
    let menu = $("#project-popover");
    if (menu) { menu.remove(); return; }
    menu = document.createElement("div"); menu.id = "project-popover"; menu.className = "project-popover";
    const projectId = state.projectId;
    const titleDraft = fieldDrafts.get(draftKey(projectId, "title"));
    const typeDraft = fieldDrafts.get(draftKey(projectId, "projectType"));
    const exportBlock = completePackageExportBlockReason();
    const packageImportAvailable = !!(model && typeof model.previewCompletePackage === "function" && typeof model.importCompletePackage === "function");
    menu.innerHTML = '<div class="popover-heading">專案資訊</div><form id="project-metadata-form"><div class="field-group"><label class="field-label" for="project-metadata-title">專案名稱</label><input class="text-field" id="project-metadata-title" type="text" maxlength="120" data-project-field="title" data-entity-id="' + escapeHtml(projectId) + '" value="' + escapeHtml(titleDraft ? titleDraft.value : state.title || "") + '"><small class="field-note">會用於專案標題與文件。</small></div><div class="field-group"><label class="field-label" for="project-metadata-type">專案類型</label><input class="text-field" id="project-metadata-type" type="text" maxlength="80" data-project-field="projectType" data-entity-id="' + escapeHtml(projectId) + '" value="' + escapeHtml(typeDraft ? typeDraft.value : state.projectType || "") + '" placeholder="例如：品牌形象影片"><small class="field-note">內容分類；留白代表尚未設定，與本機保存方式不同。</small></div><button class="outline-button project-metadata-save" type="submit" data-project-metadata-save>保存專案資訊</button></form><div class="popover-heading project-tools-heading">專案工具</div><div class="aspect-setting"><label for="project-aspect-ratio">專案畫幅</label><select id="project-aspect-ratio" aria-label="專案畫幅"><option value="16:9">16:9　寬螢幕</option><option value="1:1">1:1　方形</option><option value="4:3">4:3　標準</option><option value="2.35:1">2.35:1　寬銀幕</option></select><small>套用至所有分鏡與輸出圖；完整顯示，不會拉伸。</small></div><button data-action="download-backup">' + icon("copy",14) + '<span><strong>下載專案 JSON</strong><small>建立已保存內容的完整 canonical 快照</small></span></button><button data-action="download-complete-package" title="' + escapeHtml(exportBlock || "") + '" ' + (exportBlock ? "disabled" : "") + '>' + icon("copy",14) + '<span><strong>下載完整專案 ZIP</strong><small>含原始照片與 Drawing；不含裝置本機 undo／redo</small></span></button><button data-action="import-complete-package" ' + (packageImportAvailable ? "" : "disabled") + '>' + icon("copy",14) + '<span><strong>匯入完整專案 ZIP</strong><small>完整驗證後另增專案；不切換目前工作案</small></span></button><span class="package-export-status" id="complete-package-export-status" role="status" aria-live="polite">' + escapeHtml(exportBlock || "") + '</span><button id="photo-integrity-run" data-action="check-photo-integrity">' + icon("copy",14) + '<span><strong>檢查照片完整性</strong><small>手動逐張核對原圖 bytes 與 SHA-256；不修改專案或照片，也不代表每次保存都已驗證。</small></span></button><span class="package-export-status" id="photo-integrity-status" role="status" aria-live="polite"></span><button id="photo-integrity-cancel" data-action="cancel-photo-integrity-check" hidden>取消檢查</button><button data-action="switch-project">' + icon("calendar",14) + '<span><strong>切換／開啟專案</strong><small>先保存未提交欄位，再切換</small></span></button><button data-action="create-demo">' + icon("calendar",14) + '<span><strong>建立示範專案</strong><small>建立新案，不覆寫目前專案</small></span></button><div class="popover-foot">畫幅與輸出偏好使用本機專案保存</div>';
    const driveControls = document.createElement("section");
    driveControls.className = "google-drive-controls";
    driveControls.innerHTML = '<div class="google-drive-heading">Google Drive 手動備份</div><p class="google-drive-note">只在你按下動作並選取匯入檔案或確認匯出儲存位置後才傳輸 ZIP；匯出可選擇雲端硬碟根目錄或其他資料夾，也可新增資料夾。不會自動同步。首次授權使用 drive.file，access token 僅供本次操作使用，不會長期保存。</p><button type="button" data-drive-action="import">' + icon("copy",14) + '<span><strong>從 Google Drive 匯入 ZIP</strong><small>完整預覽驗證後，仍須確認還原或另存副本</small></span></button><button type="button" data-drive-action="export">' + icon("copy",14) + '<span><strong>匯出 ZIP 至 Google Drive</strong><small>依目前已保存 revision 建立新檔，不覆蓋既有檔案</small></span></button><div class="google-drive-status" id="google-drive-status" role="status" aria-live="polite"></div><div class="google-drive-actions"><button type="button" class="outline-button" data-drive-action="cancel" hidden>取消本次 Drive 操作</button><button type="button" class="outline-button" data-drive-action="resume" hidden>續傳上傳</button><button type="button" class="outline-button" data-drive-action="discard-pending" hidden>清除待確認上傳</button></div>';
    menu.insertBefore(driveControls, $("#complete-package-export-status", menu));
    renderGoogleDriveControls(menu);
    $("#project-menu").parentElement.appendChild(menu);
    [["#project-metadata-title", titleDraft], ["#project-metadata-type", typeDraft]].forEach(([selector, draft]) => { const field = $(selector, menu); if (draft) renderDraftError(field, draft); });
    const ratioSelect = $("#project-aspect-ratio"); ratioSelect.value = state.aspectRatio || "16:9";
    renderPhotoIntegrityStatus();
    applyReadonlyControls();
    ratioSelect.addEventListener("change", async (event) => {
      try { await withMutation(() => model.setAspectRatio(event.target.value)); message("專案畫幅已更新為 " + event.target.value + "。"); }
      catch (error) { applyProjectAspectRatio(state.aspectRatio); message(error.message || "畫幅更新失敗",true); refreshLifecycle(modelLifecycle()); }
    });
    const close = (event) => { if (!menu.contains(event.target) && !$("#project-menu").contains(event.target) && !$("#project-metadata-edit").contains(event.target)) { menu.remove(); document.removeEventListener("click",close,true); } };
    setTimeout(() => document.addEventListener("click",close,true),0);
  }
  function openInfo() { const dialog = $("#info-dialog"); if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", ""); }

  function currentReorderGroup(type, groupId) {
    if (!state) return [];
    return type === "shots"
      ? state.shots.filter((shot) => shot.chapterId === groupId)
      : state.entries.filter((entry) => entry.dayId === groupId);
  }
  function currentVisibleReorderGroup(type, groupId) {
    const items = currentReorderGroup(type, groupId);
    if (type !== "shots") return items;
    const search = $("#chapter-search");
    const query = search ? search.value.trim() : "";
    const matchedSceneIds = matchedSceneIdsForSearch(query);
    return query ? items.filter((shot) => shotMatchesSearch(shot, query, matchedSceneIds)) : items;
  }
  function canMoveReorderSelection(type, groupId, itemId, delta) {
    const ids = currentVisibleReorderGroup(type, groupId).map((item) => item.id);
    const selection = currentReorderSelection(type);
    const selected = new Set(ids.filter((id) => selection.has(id)));
    if (!selected.has(itemId)) { selected.clear(); selected.add(itemId); }
    return ids.some((id, index) => {
      if (!selected.has(id)) return false;
      const neighborIndex = index + (delta < 0 ? -1 : 1);
      return neighborIndex >= 0 && neighborIndex < ids.length && !selected.has(ids[neighborIndex]);
    });
  }
  function currentReorderSelection(type) { return type === "shots" ? shotReorderSelection : entryReorderSelection; }
  function setCurrentReorderSelection(type, ids) {
    if (type === "shots") shotReorderSelection = new Set(ids);
    else entryReorderSelection = new Set(ids);
  }
  function syncReorderStatus(type) {
    const gesture = reorderGesture && reorderGesture.type === type ? reorderGesture : null;
    const mode = type === "shots" ? shotMultiSelectMode : scheduleMultiSelectMode;
    const touchInput = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const selection = currentReorderSelection(type);
    const status = $(type === "shots" ? "#shot-reorder-status" : "#schedule-reorder-status");
    const selectionStatus = $(type === "shots" ? "#shot-reorder-selection-status" : "#schedule-reorder-selection-status");
    const scrollHint = type === "shots"
      ? (touchInput ? "捲頁請從右側滑動區開始" : "捲頁可用滑鼠滾輪或觸控板")
      : (touchInput ? "捲頁請從項目間隙開始" : "捲頁可用滑鼠滾輪或觸控板");
    const defaultText = type === "shots"
      ? "卡片空白可直接拖曳排序；" + scrollHint + " · Ctrl／⌘ 加選、Shift 範圍"
      : "項目空白可直接拖曳排序；" + scrollHint + " · Ctrl／⌘ 或 Shift 多選";
    if (status) {
      if (reorderCommandInFlight) status.textContent = "正在保存排序…";
      else if (gesture && gesture.activated) status.textContent = gesture.targetId ? "拖曳中 · 放到同場項目上以設定位置" : "拖曳中 · 放到同場項目後放開";
      else if (gesture) status.textContent = "移動即可開始拖曳；放開來源位置可取消";
      else if (mode) status.textContent = type === "shots"
        ? "多選模式 · 點選加入或移除；卡片空白可拖曳整組 · " + scrollHint
        : "多選模式 · 點選加入或移除；項目空白可拖曳整組 · " + scrollHint;
      else status.textContent = defaultText;
    }
    if (selectionStatus) {
      selectionStatus.hidden = !mode;
      if (mode) selectionStatus.textContent = "已選 " + selection.size + (type === "shots" ? " 個鏡頭" : " 個拍攝項目") + " · 可拖曳整組";
    }
  }
  function updateReorderSelectionUi() {
    if (state) {
      const validShots = new Set(state.shots.map((item) => item.id));
      shotReorderSelection = new Set(Array.from(shotReorderSelection).filter((id) => validShots.has(id)));
      const firstShot = byId(shotReorderSelection.values().next().value);
      if (firstShot) shotReorderSelection = new Set(Array.from(shotReorderSelection).filter((id) => byId(id).chapterId === firstShot.chapterId));
      const validEntries = new Set(state.entries.map((item) => item.id));
      entryReorderSelection = new Set(Array.from(entryReorderSelection).filter((id) => validEntries.has(id)));
      const firstEntry = state.entries.find((item) => item.id === entryReorderSelection.values().next().value);
      if (firstEntry) entryReorderSelection = new Set(Array.from(entryReorderSelection).filter((id) => state.entries.find((item) => item.id === id)?.dayId === firstEntry.dayId));
    }
    const shotModeButton = $("#shot-reorder-mode");
    if (shotModeButton) {
      shotModeButton.classList.toggle("is-active", shotMultiSelectMode);
      shotModeButton.setAttribute("aria-pressed", shotMultiSelectMode ? "true" : "false");
      shotModeButton.textContent = shotMultiSelectMode ? "完成多選" : "多選鏡頭";
    }
    const scheduleModeButton = $("#schedule-reorder-mode");
    if (scheduleModeButton) {
      scheduleModeButton.classList.toggle("is-active", scheduleMultiSelectMode);
      scheduleModeButton.setAttribute("aria-pressed", scheduleMultiSelectMode ? "true" : "false");
      scheduleModeButton.textContent = scheduleMultiSelectMode ? "完成多選" : "多選項目";
    }
    $$("#shot-list .shot-card").forEach((card) => card.classList.toggle("is-reorder-selected", shotReorderSelection.has(card.dataset.shot) && (shotMultiSelectMode || shotReorderSelection.size > 1)));
    $$("#schedule-list .schedule-entry").forEach((row) => row.classList.toggle("is-reorder-selected", entryReorderSelection.has(row.dataset.entry) && (scheduleMultiSelectMode || entryReorderSelection.size > 1)));
    syncReorderStatus("shots"); syncReorderStatus("entries");
  }
  function selectShotForReorder(shotId, event) {
    const shot = byId(shotId); if (!shot) return;
    const groupId = shot.chapterId;
    const current = Array.from(shotReorderSelection).filter((id) => { const item = byId(id); return item && item.chapterId === groupId; });
    const extend = shotMultiSelectMode || !!(event && (event.ctrlKey || event.metaKey || event.shiftKey));
    if (event && event.shiftKey && shotSelectionAnchorId) {
      const anchor = byId(shotSelectionAnchorId);
      if (anchor && anchor.chapterId === groupId) {
        const visible = activeShots().filter((item) => item.chapterId === groupId);
        const from = visible.findIndex((item) => item.id === shotSelectionAnchorId);
        const to = visible.findIndex((item) => item.id === shotId);
        const range = from >= 0 && to >= 0 ? visible.slice(Math.min(from, to), Math.max(from, to) + 1).map((item) => item.id) : [shotId];
        const next = new Set(event.ctrlKey || event.metaKey ? current : []); range.forEach((id) => next.add(id)); shotReorderSelection = next;
      } else { shotReorderSelection = new Set([shotId]); shotSelectionAnchorId = shotId; }
    } else if (extend) {
      const next = new Set(current);
      if (next.has(shotId)) next.delete(shotId); else next.add(shotId);
      shotReorderSelection = next;
    } else shotReorderSelection = new Set([shotId]);
    if (!(event && event.shiftKey)) shotSelectionAnchorId = shotId;
    selectShot(shotId, true); updateReorderSelectionUi();
  }
  function selectEntryForReorder(entryId, event) {
    const entry = state.entries.find((item) => item.id === entryId); if (!entry) return;
    const groupId = entry.dayId;
    const current = Array.from(entryReorderSelection).filter((id) => { const item = state.entries.find((candidate) => candidate.id === id); return item && item.dayId === groupId; });
    const extend = scheduleMultiSelectMode || !!(event && (event.ctrlKey || event.metaKey || event.shiftKey));
    if (event && event.shiftKey && entrySelectionAnchorId) {
      const anchor = state.entries.find((item) => item.id === entrySelectionAnchorId);
      if (anchor && anchor.dayId === groupId) {
        const visible = activeEntries(); const from = visible.findIndex((item) => item.id === entrySelectionAnchorId); const to = visible.findIndex((item) => item.id === entryId);
        const range = from >= 0 && to >= 0 ? visible.slice(Math.min(from, to), Math.max(from, to) + 1).map((item) => item.id) : [entryId];
        const next = new Set(event.ctrlKey || event.metaKey ? current : []); range.forEach((id) => next.add(id)); entryReorderSelection = next;
      } else { entryReorderSelection = new Set([entryId]); entrySelectionAnchorId = entryId; }
    } else if (extend) {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId); else next.add(entryId);
      entryReorderSelection = next;
    } else entryReorderSelection = new Set([entryId]);
    if (!(event && event.shiftKey)) entrySelectionAnchorId = entryId;
    selectEntry(entryId); updateReorderSelectionUi();
  }
  function toggleReorderMode(type) {
    if (type === "shots") {
      shotMultiSelectMode = !shotMultiSelectMode;
      const visibleSelectedId = selectedShotId && activeShots().some((item) => item.id === selectedShotId) ? selectedShotId : null;
      shotReorderSelection = visibleSelectedId ? new Set([visibleSelectedId]) : new Set();
      shotSelectionAnchorId = visibleSelectedId;
    } else {
      scheduleMultiSelectMode = !scheduleMultiSelectMode;
      const visibleSelectedId = selectedEntryId && activeEntries().some((item) => item.id === selectedEntryId) ? selectedEntryId : null;
      entryReorderSelection = visibleSelectedId ? new Set([visibleSelectedId]) : new Set();
      entrySelectionAnchorId = visibleSelectedId;
    }
    updateReorderSelectionUi();
  }
  function orderedAfterDrop(type, groupId, selectedIds, targetId, after) {
    const current = currentReorderGroup(type, groupId).map((item) => item.id);
    const moving = current.filter((id) => selectedIds.has(id));
    if (!moving.length || targetId && moving.includes(targetId)) return null;
    const remaining = current.filter((id) => !selectedIds.has(id));
    const targetIndex = targetId ? remaining.indexOf(targetId) : -1;
    if (targetId && targetIndex < 0) return null;
    const insertionIndex = targetId ? targetIndex + (after ? 1 : 0) : remaining.length;
    remaining.splice(insertionIndex, 0, ...moving);
    return remaining;
  }
  function orderedAfterKeyboardMove(type, groupId, selectedIds, delta) {
    const ids = currentReorderGroup(type, groupId).map((item) => item.id);
    if (!ids.some((id) => selectedIds.has(id))) return ids;
    const visibleIds = new Set(currentVisibleReorderGroup(type, groupId).map((item) => item.id));
    if (delta < 0) {
      for (let index = 0; index < ids.length; index += 1) {
        if (!visibleIds.has(ids[index]) || !selectedIds.has(ids[index])) continue;
        let neighborIndex = index - 1;
        while (neighborIndex >= 0 && (!visibleIds.has(ids[neighborIndex]) || selectedIds.has(ids[neighborIndex]))) neighborIndex -= 1;
        if (neighborIndex < 0) continue;
        const [selectedId] = ids.splice(index, 1);
        ids.splice(neighborIndex, 0, selectedId);
      }
    } else {
      for (let index = ids.length - 1; index >= 0; index -= 1) {
        if (!visibleIds.has(ids[index]) || !selectedIds.has(ids[index])) continue;
        let neighborIndex = index + 1;
        while (neighborIndex < ids.length && (!visibleIds.has(ids[neighborIndex]) || selectedIds.has(ids[neighborIndex]))) neighborIndex += 1;
        if (neighborIndex >= ids.length) continue;
        const [selectedId] = ids.splice(index, 1);
        ids.splice(neighborIndex, 0, selectedId);
      }
    }
    return ids;
  }
  async function saveReorderedIds(type, groupId, orderedIds) {
    if (isReadOnly()) { message("目前為唯讀瀏覽；排序沒有保存。", true); return false; }
    if (reorderCommandInFlight) { message("上一筆排序仍在保存，請稍候。", true); return false; }
    const current = currentReorderGroup(type, groupId).map((item) => item.id);
    if (current.length !== orderedIds.length || current.some((id) => !orderedIds.includes(id))) { message("項目已更新，請重新選取後排序。", true); return false; }
    if (current.every((id, index) => id === orderedIds[index])) return false;
    const method = type === "shots" ? model.reorderShots : model.reorderScheduleEntries;
    if (typeof method !== "function") { message("排序保存功能尚未載入；順序沒有變更。", true); return false; }
    reorderCommandInFlight = true; updateReorderSelectionUi();
    try {
      const changed = await withMutation(() => method(groupId, orderedIds));
      if (changed) message(type === "shots" ? "同場分鏡順序已保存。" : "拍攝日順序已保存。");
      return changed;
    } catch (error) {
      message((error && error.code ? error.code + " · " : "") + (error && error.message || "排序保存失敗；原順序與選取均已保留。"), true);
      refreshLifecycle(modelLifecycle());
      return false;
    } finally { reorderCommandInFlight = false; updateReorderSelectionUi(); }
  }
  async function moveReorderSelection(type, itemId, delta) {
    if (isReadOnly()) { message("目前為唯讀瀏覽；排序沒有保存。", true); return false; }
    const item = type === "shots" ? byId(itemId) : state.entries.find((entry) => entry.id === itemId);
    if (!item) return false;
    const groupId = type === "shots" ? item.chapterId : item.dayId;
    const chosen = currentReorderSelection(type);
    const selectedIds = new Set(Array.from(chosen).filter((id) => currentReorderGroup(type, groupId).some((candidate) => candidate.id === id)));
    if (!selectedIds.has(itemId)) { selectedIds.clear(); selectedIds.add(itemId); setCurrentReorderSelection(type, [itemId]); }
    if (type === "shots") { shotSelectionAnchorId = itemId; selectShot(itemId); } else { entrySelectionAnchorId = itemId; selectEntry(itemId); }
    updateReorderSelectionUi();
    return saveReorderedIds(type, groupId, orderedAfterKeyboardMove(type, groupId, selectedIds, delta));
  }
  function gestureSelection(type, sourceId) {
    const source = type === "shots" ? byId(sourceId) : state.entries.find((entry) => entry.id === sourceId);
    if (!source) return null;
    const groupId = type === "shots" ? source.chapterId : source.dayId;
    const set = currentReorderSelection(type);
    const valid = Array.from(set).filter((id) => currentReorderGroup(type, groupId).some((item) => item.id === id));
    let selected = new Set(valid);
    if (!selected.has(sourceId)) {
      const multi = type === "shots" ? shotMultiSelectMode : scheduleMultiSelectMode;
      if (multi && selected.size) selected.add(sourceId); else selected = new Set([sourceId]);
    }
    if (!selected.size) selected.add(sourceId);
    const ordered = currentReorderGroup(type, groupId).map((item) => item.id).filter((id) => selected.has(id));
    setCurrentReorderSelection(type, ordered);
    if (type === "shots") { shotSelectionAnchorId = sourceId; selectShot(sourceId); }
    else { entrySelectionAnchorId = sourceId; selectEntry(sourceId); }
    updateReorderSelectionUi();
    return { groupId, selectedIds: new Set(ordered) };
  }
  function setSuppressedReorderClick(type, itemId) {
    const record = { type, itemId, expires: Date.now() + 700 };
    suppressReorderClick = record;
    setTimeout(() => { if (suppressReorderClick === record) suppressReorderClick = null; }, 750);
  }
  function consumeSuppressedReorderClick(type, itemId) {
    if (!suppressReorderClick || suppressReorderClick.expires < Date.now() || suppressReorderClick.type !== type || suppressReorderClick.itemId !== itemId) return false;
    suppressReorderClick = null; return true;
  }
  function cancelReorderGesture(type) {
    const gesture = reorderGesture;
    if (!gesture || type && gesture.type !== type) return false;
    gesture.sourceElement.classList.remove("is-dragging", "is-drop-before", "is-drop-after", "is-drop-invalid");
    gesture.sourceElement.removeAttribute("aria-grabbed");
    if (gesture.targetElement && gesture.targetElement !== gesture.sourceElement) gesture.targetElement.classList.remove("is-drop-target", "is-drop-before", "is-drop-after", "is-drop-invalid");
    if (gesture.list) gesture.list.classList.remove("has-reorder-gesture");
    reorderGesture = null; updateReorderSelectionUi(); return true;
  }
  function reorderInteractiveTarget(target) {
    const element = target && target.nodeType === 1 ? target : target && target.parentElement;
    if (!element || !element.closest) return null;
    // Exclude actual controls; broad field/preview containers contain usable blank drag surfaces.
    return element.closest("input,textarea,select,button,a,label,summary,[contenteditable='true'],[data-shot-field],[data-entry-field],[data-shot-photo-action],[data-drawing-action],.shot-thumb,.entry-copy button,.entry-time");
  }
  function updateGestureTarget(gesture, x, y) {
    const selector = gesture.type === "shots" ? "[data-shot]" : "[data-entry]";
    const under = document.elementFromPoint(x, y);
    const target = under && under.closest ? under.closest(selector) : null;
    const targetElement = target && gesture.list.contains(target) ? target : null;
    const targetRecord = targetElement && (gesture.type === "shots" ? byId(targetElement.dataset.shot) : state.entries.find((item) => item.id === targetElement.dataset.entry));
    const groupId = targetRecord && (gesture.type === "shots" ? targetRecord.chapterId : targetRecord.dayId);
    const ids = gesture.selection && gesture.selection.selectedIds;
    const invalid = !targetRecord || groupId !== gesture.selection.groupId || ids && ids.has(targetRecord.id);
    if (gesture.targetElement) {
      gesture.targetElement.classList.remove("is-drop-before", "is-drop-after", "is-drop-invalid");
      if (gesture.targetElement !== targetElement) gesture.targetElement.classList.remove("is-drop-target");
    }
    gesture.targetElement = targetElement;
    gesture.targetId = targetRecord && !invalid ? targetRecord.id : null;
    gesture.after = false;
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      let after = y >= rect.top + rect.height / 2;
      if (gesture.type === "shots" && shotView === "gallery" && Math.abs(y - (rect.top + rect.height / 2)) < rect.height * 0.2) after = x >= rect.left + rect.width / 2;
      gesture.after = after;
      targetElement.classList.add("is-drop-target", invalid ? "is-drop-invalid" : after ? "is-drop-after" : "is-drop-before");
    }
    syncReorderStatus(gesture.type);
  }
  function activateReorderGesture(gesture) {
    if (reorderGesture !== gesture || gesture.activated) return;
    if (isReadOnly()) { setSuppressedReorderClick(gesture.type, gesture.sourceId); message("目前為唯讀瀏覽；排序沒有保存。", true); cancelReorderGesture(gesture.type); return; }
    const selection = gestureSelection(gesture.type, gesture.sourceId);
    if (!selection) { cancelReorderGesture(gesture.type); return; }
    gesture.selection = selection; gesture.activated = true;
    gesture.sourceElement.classList.add("is-dragging");
    gesture.sourceElement.setAttribute("aria-grabbed", "true");
    gesture.list.classList.add("has-reorder-gesture");
    syncReorderStatus(gesture.type);
  }
  function beginReorderGesture(list, type, event) {
    if (event.button != null && event.button !== 0 || event.isPrimary === false || reorderGesture || reorderCommandInFlight) return;
    const selector = type === "shots" ? "[data-shot]" : "[data-entry]";
    const item = event.target && event.target.closest ? event.target.closest(selector) : null;
    if (!item || !list.contains(item)) return;
    const interactive = reorderInteractiveTarget(event.target);
    if (interactive) return;
    if (isReadOnly()) { message("目前為唯讀瀏覽；排序沒有保存。", true); return; }
    reorderGesture = { list, type, pointerId: event.pointerId, pointerType: event.pointerType, sourceId: type === "shots" ? item.dataset.shot : item.dataset.entry, sourceElement: item, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, activated: false, moved: false, targetId: null, targetElement: null, after: false, selection: null };
    try { item.setPointerCapture(event.pointerId); } catch (_) { /* pointer capture is best-effort on older browsers */ }
    syncReorderStatus(type);
  }
  function moveReorderGesture(list, type, event) {
    const gesture = reorderGesture;
    if (!gesture || gesture.list !== list || gesture.type !== type || gesture.pointerId !== event.pointerId) return;
    gesture.x = event.clientX; gesture.y = event.clientY;
    const dx = event.clientX - gesture.startX; const dy = event.clientY - gesture.startY;
    if (!gesture.activated) {
      if (dx === 0 && dy === 0) return;
      activateReorderGesture(gesture);
      if (reorderGesture !== gesture || !gesture.activated) return;
    }
    gesture.moved = true;
    event.preventDefault(); updateGestureTarget(gesture, event.clientX, event.clientY);
  }
  async function finishReorderGesture(list, type, event) {
    const gesture = reorderGesture;
    if (!gesture || gesture.list !== list || gesture.type !== type || gesture.pointerId !== event.pointerId) return;
    if (!gesture.activated) { cancelReorderGesture(type); return; }
    event.preventDefault(); updateGestureTarget(gesture, event.clientX, event.clientY);
    const moved = gesture.moved; const targetId = gesture.targetId; const after = gesture.after; const selection = gesture.selection; const sourceId = gesture.sourceId;
    if (gesture.activated) setSuppressedReorderClick(type, sourceId);
    cancelReorderGesture(type);
    if (!moved || !targetId || !selection) return;
    const orderedIds = orderedAfterDrop(type, selection.groupId, selection.selectedIds, targetId, after);
    if (orderedIds) await saveReorderedIds(type, selection.groupId, orderedIds);
  }
  function bindReorderPointerHandlers(list, type) {
    const selector = type === "shots" ? "[data-shot]" : "[data-entry]";
    const preventNativeTextOrItemDrag = (event) => {
      const target = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement;
      const item = target && target.closest ? target.closest(selector) : null;
      if (!item || !list.contains(item) || reorderInteractiveTarget(target)) return;
      event.preventDefault();
    };
    list.addEventListener("pointerdown", (event) => beginReorderGesture(list, type, event));
    list.addEventListener("pointermove", (event) => moveReorderGesture(list, type, event));
    list.addEventListener("pointerup", (event) => { void finishReorderGesture(list, type, event); });
    list.addEventListener("pointercancel", () => { if (reorderGesture && reorderGesture.type === type && reorderGesture.activated) setSuppressedReorderClick(type, reorderGesture.sourceId); cancelReorderGesture(type); });
    list.addEventListener("lostpointercapture", () => { if (reorderGesture && reorderGesture.type === type && reorderGesture.activated) setSuppressedReorderClick(type, reorderGesture.sourceId); cancelReorderGesture(type); });
    list.addEventListener("touchmove", (event) => { if (reorderGesture && reorderGesture.type === type && reorderGesture.activated) event.preventDefault(); }, { passive: false });
    list.addEventListener("selectstart", preventNativeTextOrItemDrag);
    list.addEventListener("dragstart", preventNativeTextOrItemDrag);
    list.addEventListener("contextmenu", (event) => { if (reorderGesture && reorderGesture.type === type && reorderGesture.activated) event.preventDefault(); });
  }
  async function moveEntry(entryId, delta) {
    const id = entryId || selectedEntryId;
    if (!id) return;
    selectedEntryId = id;
    await moveReorderSelection("entries", id, delta);
  }
  async function flushCallsheetListDrafts(dayId) {
    const drafts = Array.from(fieldDrafts.values()).filter((draft) => draft.entityType === "day" && draft.entityId === dayId && parseCallsheetFieldPath(draft.field));
    if (drafts.some((draft) => draft.composing)) throw fieldFailure("IME_COMPOSING", "請先完成目前的中文輸入，再新增、刪除或排序通告列。");
    for (const draft of drafts) {
      if (draft.submittedVersion === draft.version) continue;
      const field = $$("#day-callsheet-fields [data-day-field]").find((item) => item.dataset.entityId === dayId && item.dataset.dayField === draft.field);
      await commitDraftSafe(draft, field || null);
    }
    if (pendingMutationPromises.size) await Promise.allSettled(Array.from(pendingMutationPromises));
    const failed = drafts.map((draft) => fieldDrafts.get(draft.key)).find((draft) => draft && draft.error);
    if (failed) throw fieldFailure(failed.error.code || "SAVE_FAILED", failed.error.message || "通告資料尚未保存；請檢查欄位後重試。");
  }
  function newCallsheetRow(collection) {
    const id = newCallsheetRowId(collection);
    if (collection === "contacts") return { id:id, position:"", name:"", phone:"", onCall:true };
    if (collection === "groupCalls") return { id:id, group:"", location:"", time:"" };
    if (collection === "vehicles") return { id:id, label:"", plate:"", driver:"", driverPhone:"", passengers:"" };
    return { id:id, text:"" };
  }
  function focusCallsheetRow(collection, rowId, field) {
    const expectedPath = callsheetFieldPath(collection, rowId, field);
    const control = $$("#day-callsheet-fields [data-day-field]").find((item) => item.dataset.dayField === expectedPath);
    if (control) { control.focus(); if (control.select && control.type !== "time" && control.type !== "checkbox") control.select(); }
  }
  async function changeCallsheetCollection(dayId, collection, rows, focusId, focusField) {
    await withMutation(() => model.updateDay(dayId, { [collection]:rows }));
    if (focusId) focusCallsheetRow(collection, focusId, focusField || (collection === "contacts" ? "position" : collection === "groupCalls" ? "group" : collection === "vehicles" ? "label" : "text"));
    else {
      const addButton = $$('#day-callsheet-fields [data-callsheet-action="add"]').find((item) => item.dataset.callsheetCollection === collection);
      if (addButton) addButton.focus();
    }
  }
  async function handleCallsheetAction(action, target) {
    if (isReadOnly()) { message("目前為唯讀瀏覽；請重新取得編輯權後再修改通告資料。", true); return; }
    const dayId = selectedDayId;
    const collection = target.dataset.callsheetCollection;
    if (!dayId || !["contacts", "groupCalls", "vehicles", "notices"].includes(collection)) throw fieldFailure("CALLSHEET_DAY_UNAVAILABLE", "請先選擇拍攝日。");
    await flushCallsheetListDrafts(dayId);
    const day = state.days.find((item) => item.id === dayId);
    if (!day) throw fieldFailure("CALLSHEET_DAY_UNAVAILABLE", "目前拍攝日已不存在。");
    const rows = Array.isArray(day[collection]) ? day[collection].map((item) => Object.assign({}, item)) : [];
    const rowId = target.dataset.callsheetRowId || "";
    if (action === "add") {
      const row = newCallsheetRow(collection); rows.push(row);
      await changeCallsheetCollection(dayId, collection, rows, row.id);
      return;
    }
    const index = rows.findIndex((item) => item.id === rowId);
    if (index < 0) throw fieldFailure("CALLSHEET_ROW_NOT_FOUND", "通告資料列已不存在。");
    if (action === "remove") rows.splice(index, 1);
    else if (action === "up" || action === "down") {
      const nextIndex = index + (action === "up" ? -1 : 1);
      if (nextIndex < 0 || nextIndex >= rows.length) return;
      const moved = rows.splice(index, 1)[0]; rows.splice(nextIndex, 0, moved);
      await changeCallsheetCollection(dayId, collection, rows, rowId);
      return;
    } else throw fieldFailure("UNSUPPORTED_CALLSHEET_ACTION", "不支援的通告資料操作。");
    await changeCallsheetCollection(dayId, collection, rows, null);
  }
  async function reorderGroupCalls(dayId, draggedId, targetId, after) {
    if (isReadOnly() || !dayId || draggedId === targetId) return;
    await flushCallsheetListDrafts(dayId);
    const day = state.days.find((item) => item.id === dayId);
    const rows = day && Array.isArray(day.groupCalls) ? day.groupCalls.map((item) => Object.assign({}, item)) : [];
    const from = rows.findIndex((item) => item.id === draggedId);
    const target = rows.findIndex((item) => item.id === targetId);
    if (from < 0 || target < 0) return;
    const moved = rows.splice(from, 1)[0];
    const targetAfterRemoval = rows.findIndex((item) => item.id === targetId);
    const insertAt = targetAfterRemoval + (after ? 1 : 0);
    rows.splice(insertAt, 0, moved);
    if (rows.every((item, index) => item.id === day.groupCalls[index].id)) return;
    await changeCallsheetCollection(dayId, "groupCalls", rows, draggedId);
  }
  async function handleAction(action, target) {
    if (isReadOnly() && READ_ONLY_ACTIONS.has(action)) { message("目前為唯讀瀏覽；請重新取得編輯權後再修改。", true); return; }
    if (action === "toggle-shot-number-lock") { await toggleShotNumberLock(target.dataset.shotId); return; }
    if (action === "preview-shot-number-renumber") {
      try { captureShotNumberPreview(target.dataset.sceneId); }
      catch (error) { message((error.code ? error.code + " · " : "") + (error.message || "鏡次預覽失敗。"), true); }
      return;
    }
    if (action === "refresh-shot-number-preview") { refreshShotNumberPreview(); return; }
    if (action === "apply-shot-number-renumber") { await applyShotNumberRenumber(); return; }
    if (action === "check-photo-integrity") { await startPhotoIntegrityCheck(); return; }
    if (action === "cancel-photo-integrity-check") { cancelPhotoIntegrityCheck("使用者取消", false); return; }
    if (action === 'add-scene') { openSceneDialog(); return; }
    if (action === 'edit-scene') { openSceneDialog(target.dataset.sceneId); return; }
    if (action === 'apply-entry-time') {
      try { await commitEntryTime(target.dataset.entryTarget); }
      catch (error) { message((error.code ? error.code + " · " : "") + (error.message || '請檢查起訖時間。'),true); }
      return;
    }
    if (action === "toggle-entry-timing") {
      try { await toggleEntryTiming(target.dataset.entryTarget); }
      catch (error) { message((error.code ? error.code + " · " : "") + (error.message || "時間安排切換失敗。"), true); }
      return;
    }
    if (action === "add-shot") { await addShot(); return; }
    if (action === "duplicate") { await duplicateSelectedShot(); return; }
    if (action === "delete") { deleteSelectedShot(); return; }
    if (action === "move-up" || action === "move-down") {
      const delta = action === "move-up" ? -1 : 1;
      const shotId = selectedShotId;
      await moveReorderSelection("shots", shotId, delta); return;
    }
    if (action === "clear-search") { $("#chapter-search").value = ""; activeChapterId = "all"; shotReorderSelection = new Set(); shotSelectionAnchorId = null; renderStoryboard(); return; }
    if (action === "schedule-shot") {
      const shotId = target.dataset.shotId; if (!selectedDayId) { message("請先新增拍攝日。", true); return; }
      const dayId = selectedDayId;
      try { selectedEntryId = await withMutation(() => model.scheduleShot(shotId, dayId)); renderAll(); message("已加入目前拍攝日；敘事順序保持不變。"); }
      catch (error) { message(error.message || "加入拍攝日失敗", true); } return;
    }
    if (action === "entry-up" || action === "entry-down") {
      const row = target.closest("[data-entry]"); await moveEntry(row ? row.dataset.entry : selectedEntryId, action === "entry-up" ? -1 : 1); return;
    }
    if (action === "select-entry") {
      const row = target.closest("[data-entry]"); if (row) selectEntry(row.dataset.entry); return;
    }
    if (action === "remove-entry") { removeSelectedEntry(); return; }
    if (action === "move-entry-day") {
      const entryId = target.dataset.entryTarget;
      const targetDayId = $("#entry-move-day") && $("#entry-move-day").value;
      try { await moveEntryToDay(entryId, targetDayId); }
      catch (error) {
        const currentLifecycle = modelLifecycle();
        if (currentLifecycle && currentLifecycle.phase === "save_failed") {
          refreshLifecycle(currentLifecycle);
          const retryButton = $("#durable-status-actions [data-status-action='retry']");
          if (retryButton) retryButton.focus();
          const moveWasSubmitted = error.code !== "SAVE_PENDING";
          message(moveWasSubmitted
            ? "移動命令尚未確認保存；請按「重試保存」完成原命令，再繼續操作。"
            : "上一筆命令尚未保存；請按「重試保存」完成原命令，再繼續操作。", true);
        } else {
          message((error.code ? error.code + " · " : "") + (error.message || "移動拍攝項目失敗。"), true);
        }
      }
      return;
    }
    if (action === "download-backup") { $("#project-popover")?.remove(); await downloadBackup(); return; }
    if (action === "download-complete-package") { await downloadCompletePackage(); return; }
    if (action === "import-complete-package") { $("#project-popover")?.remove(); openCompletePackagePicker("project-menu"); return; }
    if (action === "switch-project") { $("#project-popover")?.remove(); await requestProjectSwitch(); return; }
    if (action === "create-demo") {
      cancelPhotoIntegrityCheck("已開始建立新專案", true);
      $("#project-popover")?.remove(); lifecycleGateForced = true;
      refreshLifecycle(Object.assign({}, modelLifecycle(), { phase: "choosing" }));
      const title = $("#lifecycle-project-title");
      const currentTitle = String(state && state.title || "").trim();
      if (title) title.value = currentTitle ? currentTitle + "（示範）" : "";
      return;
    }
  }
  async function lifecycleTask(action) {
    if (lifecycleBusy) return;
    lifecycleBusy = true; renderLifecycleGate();
    try {
      await action();
      refreshLifecycle(modelLifecycle());
    } catch (error) {
      const current = modelLifecycle();
      if (!current.error) current.error = { code: error.code || "LIFECYCLE_ERROR", message: error.message || "本機專案操作失敗。" };
      refreshLifecycle(current);
      message((error.code ? error.code + " · " : "") + (error.message || "本機專案操作失敗。"), true);
    } finally {
      lifecycleBusy = false; refreshLifecycle(modelLifecycle());
    }
  }
  async function handleLifecycleAction(action, target) {
    if (action === "import-complete-package") { openCompletePackagePicker("lifecycle-gate"); return; }
    if (action === "import-google-drive") { await importCompletePackageFromGoogleDrive("lifecycle-gate"); return; }
    if (action === "cancel-drive-import") { await cancelGoogleDriveOperation(); return; }
    if (action === "return-project") {
      return lifecycleTask(async () => {
        await model.cancelMigration();
        lifecycleGateForced = false;
        if (!showProjectUI()) refreshLifecycle(modelLifecycle());
      });
    }
    if (action === "select-project") {
      const projectId = target.dataset.projectId;
      return lifecycleTask(async () => {
        if (projectId !== (state && state.projectId)) cancelPhotoIntegrityCheck("已選擇切換專案", true);
        await commitAllDrafts();
        await model.selectProject(projectId);
        fieldDrafts.clear(); pendingPreferencePatch = null; syncDraftSnapshot();
        showProjectUI();
      });
    }
    if (action === "preview-migration") {
      return lifecycleTask(async () => {
        const result = await model.previewMigration();
        const latest = modelLifecycle();
        if (!latest.migrationPreview && result) latest.migrationPreview = result.migrationPreview || result.migration || result;
        if (latest.phase === "ready") latest.phase = "needs_migration_confirmation";
        refreshLifecycle(latest);
      });
    }
    if (action === "cancel-migration") {
      return lifecycleTask(async () => { await model.cancelMigration(); });
    }
    if (action === "retry-initialize") {
      return lifecycleTask(async () => {
        const result = await model.initialize();
        if (!dataUnsubscribe) dataUnsubscribe = model.subscribe((snapshot, event) => renderForModelChange(snapshot, event));
        refreshLifecycle(modelLifecycle() || result);
        if (["ready", "read_only", "saving"].includes(lifecycle.phase)) showProjectUI();
      });
    }
    if (action === "retry-pending") {
      return lifecycleTask(async () => {
        const result = await model.retryPending();
        await finishShotPlaceholderPromotionRetry(result);
        scheduleShotPlaceholderAutoPromotion();
        refreshLifecycle(modelLifecycle());
        if (model.getState()) showProjectUI();
      });
    }
    if (action === "download-rescue") { await downloadRescue(); return; }
    if (action === "download-legacy") { await downloadLegacyRaw(); return; }
  }
  function normalizeNewProjectTitle(value) {
    const title = String(value == null ? "" : value).trim();
    return title || "待命名專案";
  }
  async function handleLifecycleSubmit(event) {
    const form = event.target;
    if (form.id === "project-metadata-form") { event.preventDefault(); await commitProjectMetadataDrafts(); return; }
    if (isReadOnly() && (form.id === "scene-form" || form.id === "day-form")) {
      event.preventDefault(); message("目前為唯讀瀏覽；這項變更沒有保存。", true); return;
    }
    if (form.id === "lifecycle-create-form") {
      event.preventDefault();
      const formData = new FormData(form); const title = normalizeNewProjectTitle(formData.get("title"));
      const kind = event.submitter && event.submitter.value === "demo" ? "demo" : "blank";
      cancelPhotoIntegrityCheck("已開始建立新專案", true);
      await lifecycleTask(async () => {
        if (document.body.classList.contains("project-ready")) await commitAllDrafts();
        await model.createProject({ title, demo: kind === "demo" });
        fieldDrafts.clear(); pendingPreferencePatch = null; syncDraftSnapshot();
        showProjectUI();
      });
      return;
    }
    if (form.id === "lifecycle-migration-form") {
      event.preventDefault();
      const title = normalizeNewProjectTitle(new FormData(form).get("title"));
      cancelPhotoIntegrityCheck("已開始建立新專案", true);
      await lifecycleTask(async () => {
        await model.confirmMigration({ title });
        fieldDrafts.clear(); pendingPreferencePatch = null; syncDraftSnapshot();
        showProjectUI();
      });
      return;
    }
    if (form.id === "scene-form") {
      event.preventDefault();
      const title = $("#scene-title").value.trim(); const sceneId = form.dataset.sceneId;
      const button = $("#scene-save"); button.disabled = true;
      try {
        if (sceneId) await withMutation(() => model.updateScene(sceneId, { title }));
        else { const newId = await withMutation(() => model.addScene(title)); activeChapterId = newId; selectedShotId = null; $("#chapter-search").value = ""; }
        closeDialog("scene-dialog"); renderAll(); message(sceneId ? "已更新場次名稱。" : "已建立場次，可以開始新增鏡頭。");
      } catch (error) {
        message((error.code ? error.code + " · " : "") + (error.message || "場次儲存失敗"), true);
        refreshLifecycle(modelLifecycle());
        closeFailedSaveDialog("scene-dialog");
      }
      finally { button.disabled = false; }
      return;
    }
    if (form.id === "day-form") {
      event.preventDefault();
      const formData = new FormData(form); const title = String(formData.get("title") || "").trim(); const date = String(formData.get("date") || ""); const start = String(formData.get("start") || "");
      const submit = form.querySelector('[type="submit"]'); if (submit) submit.disabled = true;
      try { selectedDayId = await withMutation(() => model.addDay(date, title, start)); selectedEntryId = null; closeDialog("day-dialog"); renderAll(); message("已新增拍攝日：" + title); }
      catch (error) {
        message((error.code ? error.code + " · " : "") + (error.message || "新增拍攝日失敗"), true);
        refreshLifecycle(modelLifecycle());
        closeFailedSaveDialog("day-dialog");
      }
      finally { if (submit) submit.disabled = false; }
    }
  }
  async function runHistory(action) {
    const beforeProject = model.getProject();
    try {
      const changed = await withMutation(() => model[action]());
      if (!changed) message(action === "undo" ? "沒有可復原的操作。" : "沒有可重做的操作。");
      else if (action === "undo" && beforeProject) {
        const selectedDayId = beforeProject.outputPreferences && beforeProject.outputPreferences.schedule && beforeProject.outputPreferences.schedule.selectedDayId;
        const afterProject = model.getProject();
        const afterSelectedDayId = afterProject && afterProject.outputPreferences && afterProject.outputPreferences.schedule && afterProject.outputPreferences.schedule.selectedDayId;
        if (selectedDayId && afterSelectedDayId === null && afterProject &&
            !afterProject.shootingDays.some((day) => day.id === selectedDayId)) {
          const removedDay = beforeProject.shootingDays.find((day) => day.id === selectedDayId);
          const label = removedDay ? "「" + (removedDay.title || "未命名拍攝日") + "」" : "";
          message("已撤銷拍攝日" + label + "；輸出選日已回到預設，其他輸出偏好保持不變。");
        }
      }
    } catch (error) { message((error.code ? error.code + " · " : "") + (error.message || "歷史操作失敗。"), true); refreshLifecycle(modelLifecycle()); }
  }
  async function handleStatusAction(action) {
    if (action === "timeline") {
      if (!setView("schedule")) return;
      if (!openProductionTimeline()) message("製作時程草稿仍保留；目前無法安全開啟時程。", true);
      return;
    }
    if (action === "save-drafts") {
      if (hasProductionTimelineDrafts(state && state.projectId)) {
        if (!setView("schedule")) return;
        openProductionTimeline();
        message("請在製作時程中按「保存任務」；草稿尚未提交前不會切換專案。", true);
        return;
      }
      try { await commitAllDrafts(); message("未提交欄位已保存。"); }
      catch (error) { message((error.code ? error.code + " · " : "") + (error.message || "欄位保存失敗。"), true); }
      return;
    }
    if (action === "retry") {
      const routeEditor = drawingEditorHandle && drawingEditorHandle.editor;
      if (routeEditor && routeEditor.pendingOperation) {
        await routeEditor.retry();
        refreshLifecycle(modelLifecycle()); reconcileSavedDrafts();
        if (routeEditor.pendingOperation) {
          const retryError = routeEditor.pendingOperation.error;
          message((retryError && retryError.message) || "手繪仍未確認保存；請在畫布內重試。", true);
        } else message("保存佇列已完成。");
        return;
      }
      const drawingRetryRoute = drawingRoute && drawingRoute.status === "save_failed" ? drawingRoute : null;
      if (drawingRetryRoute) { drawingRetryRoute.status = "creating"; renderDrawingRouteStatus(); }
      try {
        const result = await model.retryPending();
        if (photoImportSession && ["save_failed", "reconcile_required"].includes(photoImportSession.status)) await finishPhotoImportSession(photoImportSession, result, true);
        if (drawingRetryRoute && drawingRetryRoute === drawingRoute) {
          try { finishDrawingCreate(drawingRetryRoute, result); }
          catch (error) { drawingRetryRoute.error = error; drawingRetryRoute.status = "error"; renderDrawingRouteStatus(); }
        }
        await finishShotPlaceholderPromotionRetry(result);
        scheduleShotPlaceholderAutoPromotion();
        refreshLifecycle(modelLifecycle()); reconcileSavedDrafts(); message("保存佇列已完成。");
      }
      catch (error) {
        if (drawingRetryRoute && drawingRetryRoute === drawingRoute) { drawingRetryRoute.error = error; drawingRetryRoute.status = "save_failed"; renderDrawingRouteStatus(); }
        refreshLifecycle(modelLifecycle()); message((error.code ? error.code + " · " : "") + (error.message || "保存重試失敗。"), true);
      }
      return;
    }
    if (action === "rescue") { await downloadRescue(); return; }
    if (action === "reclaim") {
      try { await model.reacquireLease(); refreshLifecycle(modelLifecycle()); showProjectUI(); }
      catch (error) { refreshLifecycle(modelLifecycle()); message((error.code ? error.code + " · " : "") + (error.message || "目前無法重新取得編輯權。"), true); }
      return;
    }
    if (action === "discard") {
      if (hasProductionTimelineDrafts(state && state.projectId)) {
        if (!setView("schedule")) return;
        openProductionTimeline();
        message("請在製作時程中明確放棄草稿；其他草稿尚未更動。", true);
        return;
      }
      showConfirm("放棄未保存變更", "這會移除目前的欄位草稿，並取消所有已暫停且尚未保存的命令。此操作無法復原。", "放棄未保存變更", async () => {
        const pendingPhoto = photoImportSession;
        await discardUncommittedChanges();
        if (pendingPhoto && photoImportSession === pendingPhoto && pendingPhoto.status === "save_failed") {
          pendingPhoto.status = "failed"; pendingPhoto.progress = "照片命令已放棄；候選檔仍未保存。"; pendingPhoto.error = { code: "PHOTO_COMMAND_DISCARDED", message: "原保存命令已放棄；重新選照片會建立新命令。" }; renderPhotoImportBanner();
        }
        message("未保存變更已放棄。"); return true;
      });
    }
  }
  function wireEvents() {
    const safely = async (task) => {
      try { await task(); }
      catch (error) { refreshLifecycle(modelLifecycle()); message((error && error.code ? error.code + " · " : "") + (error && error.message || "操作失敗；尚未確認保存。"), true); }
    };
    window.addEventListener("beforeprint", () => {
      const session = outputPrintPreparation;
      if (!session || !session.printInvoked) return;
      session.beforePrintSeen = true;
      session.phase = "native-dialog";
    });
    window.addEventListener("afterprint", () => {
      const session = outputPrintPreparation;
      if (!session || !session.printInvoked) return;
      session.afterPrintSeen = true;
      session.afterPrintTimer = setTimeout(() => finishOutputPrintPreparation(session,true),0);
    });
    $("#production-timeline-toggle").addEventListener("click", toggleProductionTimeline);
    configureShotPhotoPicker();
    const drawingChoiceDialog = $("#drawing-choice-dialog");
    if (drawingChoiceDialog) {
      drawingChoiceDialog.addEventListener("close", () => { drawingChooserContext = null; });
      drawingChoiceDialog.addEventListener("cancel", () => { drawingChooserContext = null; });
    }
    const drawingBackgroundChoiceDialog = $("#drawing-background-choice-dialog");
    if (drawingBackgroundChoiceDialog) {
      drawingBackgroundChoiceDialog.addEventListener("close", () => { drawingBackgroundChoiceContext = null; });
      drawingBackgroundChoiceDialog.addEventListener("cancel", () => { drawingBackgroundChoiceContext = null; });
    }
    $("#shot-photo-picker").addEventListener("change", (event) => handleShotPhotoPickerChange(event.target));
    $("#shot-photo-picker").addEventListener("cancel", () => {
      const target = photoPickerTarget;
      photoPickerTarget = null;
      if (target && target.placeholder) resumeShotPlaceholderAutoPromotion(target.contextKey);
    });
    $("#complete-package-picker").addEventListener("change", (event) => { void handleCompletePackageFile(event.target); });
    const packageDialog = $("#complete-package-import-dialog");
    if (packageDialog) {
      packageDialog.addEventListener("cancel", (event) => {
        if (completePackageImportSession && completePackageImportSession.status === "importing") { event.preventDefault(); return; }
        cancelCompletePackageImport();
      });
      packageDialog.addEventListener("close", () => {
        if (completePackageImportSession && completePackageImportSession.status !== "importing") completePackageImportSession = null;
        renderCompletePackageImportDialog();
      });
    }
    window.addEventListener("pagehide", () => {
      disposePhotoCropSession(photoCropSession);
      disposePhotoImportEditor(photoImportSession);
      shotDrawingUrlEpoch += 1;
      disconnectShotPhotoObservation($("#shot-list"));
      if (shotPhotoLoadQueueTimer !== null) window.clearTimeout(shotPhotoLoadQueueTimer);
      shotPhotoLoadQueueTimer = null;
      shotPhotoLoadQueueScheduled = false;
      Array.from(shotPhotoObjectUrls.keys()).forEach((key) => releaseShotPhotoUrl(key, false));
      Array.from(shotDrawingObjectUrls.keys()).forEach(releaseShotDrawingUrl);
    });
    window.addEventListener("pageshow", () => {
      if (state && currentView === "storyboard") { syncVisibleShotDrawings(); syncVisibleShotPhotos(); }
    });
    $("#chapter-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-chapter]"); if (!button) return;
      if (button.dataset.chapter !== activeChapterId) flushShotPlaceholderAutoPromotion();
      activeChapterId = button.dataset.chapter;
      shotReorderSelection = new Set(); shotSelectionAnchorId = null;
      if (activeChapterId !== "all") selectedShotId = (inChapter(activeChapterId)[0] || {}).id || null;
      renderStoryboard();
    });
    $("#chapter-search").addEventListener("input", () => {
      shotReorderSelection = new Set(); shotSelectionAnchorId = null;
      if (!searchComposing && !deferShotSearchUntilDraftsSettle()) {
        if (!renderStoryboardSearchInPlace()) renderStoryboard();
      } else updateReorderSelectionUi();
    });
    $("#pool-search").addEventListener("input", () => renderSchedule());
    bindReorderPointerHandlers($("#shot-list"), "shots");
    $("#shot-list").addEventListener("scroll", () => {
      if (!shotPhotoObserver) scheduleShotPhotoFallback($("#shot-list"));
    }, { passive: true });
    window.addEventListener("scroll", () => {
      if (!shotPhotoObserver) scheduleShotPhotoFallback($("#shot-list"));
    }, { passive: true });
    window.addEventListener("resize", () => {
      if (state && currentView === "storyboard") syncVisibleShotPhotos();
      else if (shotPhotoObserver) scheduleShotPhotoUrlReconciliation();
      else scheduleShotPhotoFallback($("#shot-list"));
    }, { passive: true });
    bindReorderPointerHandlers($("#schedule-list"), "entries");
    $("#shot-list").addEventListener("toggle", (event) => {
      const manager = event.target && event.target.matches && event.target.matches(".shot-photo-manager") ? event.target : null;
      if (!manager) return;
      const key = shotPhotoManagerKey(manager.dataset.projectId, manager.dataset.shotPhotoManager);
      if (manager.open) shotPhotoManagerOpen.add(key); else shotPhotoManagerOpen.delete(key);
    }, true);
    const callsheetHost = $("#day-callsheet-fields");
    if (callsheetHost && !callsheetHost.dataset.dragBound) {
      callsheetHost.dataset.dragBound = "true";
      callsheetHost.addEventListener("pointerdown", (event) => {
        const row = event.target.closest && event.target.closest('[data-call-row="groupCalls"]');
        if (!row || event.target.closest("input,textarea,select,button,a,[contenteditable='true']") || isReadOnly() || event.button !== 0) return;
        callsheetDrag = { pointerId:event.pointerId, dayId:callsheetHost.dataset.dayId, rowId:row.dataset.callRowId, row:row, startX:event.clientX, startY:event.clientY, active:false };
        try { row.setPointerCapture(event.pointerId); } catch (_) {}
      });
      callsheetHost.addEventListener("pointermove", (event) => {
        const drag = callsheetDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
        drag.active = true; event.preventDefault();
        const row = drag.row;
        if (row) row.classList.add("is-dragging");
        $$("#day-callsheet-fields .group-call-row").forEach((item) => item.classList.remove("is-drop-before", "is-drop-after"));
        const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-call-row="groupCalls"]');
        if (targetRow && targetRow.dataset.callRowId !== drag.rowId) {
          const rect = targetRow.getBoundingClientRect();
          targetRow.classList.add(event.clientY > rect.top + rect.height / 2 ? "is-drop-after" : "is-drop-before");
        }
      });
      callsheetHost.addEventListener("pointerup", (event) => {
        const drag = callsheetDrag;
        if (!drag || drag.pointerId !== event.pointerId) return;
        callsheetDrag = null;
        const targetRow = drag.active ? document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-call-row="groupCalls"]') : null;
        $$("#day-callsheet-fields .group-call-row").forEach((item) => item.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
        if (targetRow && targetRow.dataset.callRowId !== drag.rowId) {
          const rect = targetRow.getBoundingClientRect();
          void safely(() => reorderGroupCalls(drag.dayId, drag.rowId, targetRow.dataset.callRowId, event.clientY > rect.top + rect.height / 2));
        }
      });
      callsheetHost.addEventListener("pointercancel", (event) => {
        if (!callsheetDrag || callsheetDrag.pointerId !== event.pointerId) return;
        callsheetDrag = null;
        $$("#day-callsheet-fields .group-call-row").forEach((item) => item.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
      });
    }
    $("#shot-list").addEventListener("input", (event) => {
      const field = event.target.closest && event.target.closest("[data-shot-placeholder-field]");
      if (field && handleShotPlaceholderInput(field)) scheduleShotPlaceholderAutoPromotion();
    });
    $("#shot-list").addEventListener("compositionstart", (event) => {
      const field = event.target.closest && event.target.closest("[data-shot-placeholder-field]");
      if (field) {
        cancelShotPlaceholderAutoPromotion();
        shotPlaceholderComposingFields.add(field);
      }
    });
    $("#shot-list").addEventListener("compositionend", (event) => {
      const field = event.target.closest && event.target.closest("[data-shot-placeholder-field]");
      if (!field) return;
      shotPlaceholderComposingFields.delete(field);
      const card = field.closest("[data-shot-placeholder]");
      if (card && handleShotPlaceholderInput(field)) setTimeout(() => { if (card.isConnected && !shotPlaceholderComposingFields.size) scheduleShotPlaceholderAutoPromotion(); }, 0);
    });
    $("#shot-list").addEventListener("click", (event) => {
      const placeholderAction = event.target.closest && event.target.closest("[data-placeholder-action]");
      const placeholderCard = placeholderAction && placeholderAction.closest("[data-shot-placeholder]");
      if (placeholderAction && placeholderCard) {
        event.preventDefault();
        cancelShotPlaceholderAutoPromotion();
        void handleShotPlaceholderAction(placeholderAction.dataset.placeholderAction, placeholderCard);
        return;
      }
      if (event.target.closest("[data-shot-placeholder]")) return;
      if (event.target.closest("[data-shot-field],[data-shot-photo-action],[data-drawing-action],.shot-photo-manager summary")) return;
      const card = event.target.closest("[data-shot]"); if (!card) return;
      if (consumeSuppressedReorderClick("shots", card.dataset.shot)) { event.preventDefault(); event.stopPropagation(); return; }
      selectShotForReorder(card.dataset.shot, event);
    });
    $("#shot-list").addEventListener("keydown", (event) => {
      const placeholderField = event.target.closest && event.target.closest("[data-shot-placeholder-field]");
      if (placeholderField) {
        if (isReadOnly()) { if (event.key === "Enter") event.preventDefault(); return; }
        if (!event.isComposing && event.key === "Enter" && (placeholderField.tagName !== "TEXTAREA" || event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          void safely(() => promoteShotPlaceholder());
        }
        return;
      }
      const photoAction = event.target.closest && event.target.closest("[data-shot-photo-action]");
      if (photoAction && photoAction.tagName !== "BUTTON" && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        if (isReadOnly()) { message("目前為唯讀瀏覽；請重新取得編輯權後再選取照片。", true); return; }
        openShotPhotoPicker(photoAction); return;
      }
      if (event.target.matches("[data-shot]") && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault(); void moveReorderSelection("shots", event.target.dataset.shot, event.key === "ArrowUp" ? -1 : 1); return;
      }
      if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-shot]")) { event.preventDefault(); selectShotForReorder(event.target.dataset.shot, event); }
    });
    $("#schedule-list").addEventListener("click", (event) => {
      const row = event.target.closest("[data-entry]"); if (!row) return;
      if (consumeSuppressedReorderClick("entries", row.dataset.entry)) { event.preventDefault(); event.stopPropagation(); return; }
      if (event.target.closest("[data-action='select-entry']")) { selectEntryForReorder(row.dataset.entry, event); event.preventDefault(); event.stopPropagation(); return; }
      if (event.target.closest("[data-action]")) return;
      selectEntryForReorder(row.dataset.entry, event);
    });
    $("#schedule-list").addEventListener("keydown", (event) => {
      if (event.target.matches("[data-entry]") && (event.key === "ArrowUp" || event.key === "ArrowDown")) { event.preventDefault(); void moveReorderSelection("entries", event.target.dataset.entry, event.key === "ArrowUp" ? -1 : 1); return; }
      if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-entry]")) { event.preventDefault(); selectEntryForReorder(event.target.dataset.entry, event); }
    });
    $("#shot-reorder-mode").addEventListener("click", () => toggleReorderMode("shots"));
    $("#schedule-reorder-mode").addEventListener("click", () => toggleReorderMode("entries"));
    document.addEventListener("click", async (event) => {
      const driveDestinationAction = event.target.closest("[data-drive-destination-action]");
      if (driveDestinationAction) {
        event.preventDefault();
        const action = driveDestinationAction.dataset.driveDestinationAction;
        if (action === "cancel") finishGoogleDriveDestination(null);
        else if (action === "save-parent") {
          const session = googleDriveDestinationSession;
          const nameInput = $("#drive-destination-new-folder");
          const name = nameInput ? nameInput.value.trim() : "";
          if (session) finishGoogleDriveDestination(name ? { folder: session.folder, createFolderName: name } : { folder: session.folder });
        }
        return;
      }
      if (event.target.closest("[data-drive-destination-browse]")) {
        event.preventDefault();
        await openGoogleDriveDestinationPicker();
        return;
      }
      if (event.target.closest("[data-drive-destination-root]")) {
        event.preventDefault();
        const session = googleDriveDestinationSession;
        if (session) {
          session.folder = { id: "root", name: "我的雲端硬碟", mimeType: "application/vnd.google-apps.folder" };
          renderGoogleDriveDestinationFolder(session.folder);
        }
        return;
      }
      const callsheetAction = event.target.closest("[data-callsheet-action]");
      if (callsheetAction) { event.preventDefault(); await safely(() => handleCallsheetAction(callsheetAction.dataset.callsheetAction, callsheetAction)); return; }
      const driveAction = event.target.closest("[data-drive-action]");
      if (driveAction) { event.preventDefault(); await safely(() => handleGoogleDriveAction(driveAction.dataset.driveAction)); return; }
      const packageImportAction = event.target.closest("[data-package-import-action]");
      if (packageImportAction) { event.preventDefault(); await safely(() => handleCompletePackageImportAction(packageImportAction.dataset.packageImportAction)); return; }
      const drawingAction = event.target.closest("[data-drawing-action]");
      if (drawingAction) { event.preventDefault(); await safely(() => handleDrawingAction(drawingAction.dataset.drawingAction, drawingAction)); return; }
      const voiceoverAction = event.target.closest("[data-voiceover-action]");
      if (voiceoverAction) {
        event.preventDefault();
        if (voiceoverAction.dataset.voiceoverAction === "open") setView("voiceover");
        else if (voiceoverAction.dataset.voiceoverAction === "return") setView("storyboard");
        return;
      }
      const photoAction = event.target.closest("[data-shot-photo-action]");
      if (photoAction) { event.preventDefault(); handleShotPhotoAction(photoAction.dataset.shotPhotoAction, photoAction); return; }
      const lifecycleButton = event.target.closest("[data-lifecycle-action]");
      if (lifecycleButton) { await safely(() => handleLifecycleAction(lifecycleButton.dataset.lifecycleAction, lifecycleButton)); return; }
      if (event.target.closest("[data-output-retry]")) { event.preventDefault(); void renderOutput(); return; }
      const statusButton = event.target.closest("[data-status-action]");
      if (statusButton) { await safely(() => handleStatusAction(statusButton.dataset.statusAction)); return; }
      const viewButton = event.target.closest("[data-view]");
      if (viewButton && (viewButton.classList.contains("rail-button") || viewButton.classList.contains("workspace-tab"))) { setView(viewButton.dataset.view); return; }
      const actionButton = event.target.closest("[data-action]");
      if (actionButton && isReadOnly() && READ_ONLY_ACTIONS.has(actionButton.dataset.action)) { event.preventDefault(); message("目前為唯讀瀏覽；請重新取得編輯權後再修改。", true); return; }
      if (actionButton) { await safely(() => handleAction(actionButton.dataset.action, actionButton)); return; }
      const closeButton = event.target.closest("[data-close]");
      if (closeButton) { if (closeButton.dataset.close === "confirm-dialog" && $("#confirm-accept").disabled) return; if (closeButton.dataset.close === "shot-number-preview-dialog") shotNumberPreviewSession = null; closeDialog(closeButton.dataset.close); return; }
      const shotViewButton = event.target.closest("button[data-shot-view]");
      if (shotViewButton) { setShotView(shotViewButton.dataset.shotView); return; }
      const orientationButton = event.target.closest("[data-orientation]");
      if (orientationButton) { await safely(() => setOrientation(orientationButton.dataset.orientation)); return; }
    });
    $("#shoot-day-tabs").addEventListener("click", (event) => { const tab = event.target.closest("[data-day-id]"); if (!tab || !state.days.some((day) => day.id === tab.dataset.dayId)) return; selectedDayId = tab.dataset.dayId; const first = state.entries.find((entry) => entry.dayId === selectedDayId); selectedEntryId = first ? first.id : null; entryReorderSelection = new Set(); entrySelectionAnchorId = null; renderSchedule(); const activeTab = $("#shoot-day-tabs [aria-selected='true']"); if (activeTab) activeTab.focus({ preventScroll: true }); });
    $("#shoot-day-tabs").addEventListener("keydown", (event) => { if (!event.target.matches("[data-day-id]") || !["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return; const tabs = $$("#shoot-day-tabs [data-day-id]"); const index = tabs.indexOf(event.target); const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; if (!tabs[nextIndex]) return; event.preventDefault(); tabs[nextIndex].click(); });
    $("#output-scope").addEventListener("change", (event) => { outputScope = event.target.value; renderOutput(); });
    $("#output-type").addEventListener("change", (event) => { outputType = event.target.value; renderOutput(); });
    $("#schedule-output-tabs").addEventListener("click", (event) => {
      const tab = event.target.closest("[data-output-section]");
      if (tab) setOutputScheduleSection(tab.dataset.outputSection,false);
    });
    $("#schedule-output-tabs").addEventListener("keydown", (event) => {
      if (!event.target.matches("[data-output-section]") || !["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
      const tabs = $$("#schedule-output-tabs [data-output-section]");
      const index = tabs.indexOf(event.target);
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      if (tabs[nextIndex]) setOutputScheduleSection(tabs[nextIndex].dataset.outputSection,true);
    });
    $("#add-shot").addEventListener("click", async () => { await safely(() => addShot()); });
    $("#add-break").addEventListener("click", async () => {
      const dayId = selectedDayId; if (!dayId) { message("請先新增拍攝日。", true); return; }
      await safely(async () => { selectedEntryId = await withMutation(() => model.addBreak(dayId)); renderAll(); message("已加入 10 分鐘休息，可在右側調整。"); });
    });
    $("#undo-btn").addEventListener("click", async () => { await safely(() => runHistory("undo")); });
    $("#redo-btn").addEventListener("click", async () => { await safely(() => runHistory("redo")); });
    $("#info-open").addEventListener("click", openInfo);
    $("#project-menu").addEventListener("click", toggleProjectMenu);
    $("#project-metadata-edit").addEventListener("click", toggleProjectMenu);
    $("#print-output").addEventListener("click", async () => {
      if (outputPrintPreparation) return;
      const session = { context:null, phase:"capturing", cancelled:false, finished:false, printInvoked:false, beforePrintSeen:false, afterPrintSeen:false };
      outputPrintPreparation = session;
      updateOutputPrintAvailability(activeOutputContext);
      await safely(async () => {
        if (pendingMutationPromises.size) await Promise.allSettled(Array.from(pendingMutationPromises));
        assertOutputPrintPreparationCurrent(session);
        refreshLifecycle(modelLifecycle());
        if (pendingPreferencePatch) {
          if (lifecycle.phase === "save_failed" || Number(lifecycle.pendingCount || 0) > 0) throw Object.assign(new Error("輸出偏好尚有保存失敗或命令待處理；完成重試前不能列印。"),{code:"OUTPUT_PREFERENCES_PENDING"});
          const saved = await saveOutputPreference({});
          assertOutputPrintPreparationCurrent(session);
          if (!saved) throw Object.assign(new Error("輸出偏好尚未成功保存；本次列印已取消。"),{code:"OUTPUT_PREFERENCES_NOT_COMMITTED"});
        }
        assertOutputPrintPreparationCurrent(session);
        session.allowOutputViewTransition = true;
        let outputViewReady = false;
        try { outputViewReady = setView("output"); }
        finally { session.allowOutputViewTransition = false; }
        if (!outputViewReady) throw Object.assign(new Error("目前畫布仍有保存命令，無法切換到列印預覽。"),{code:"OUTPUT_VIEW_BLOCKED"});
        const targetContext = await outputCapturePromise;
        assertOutputPrintPreparationCurrent(session);
        if (!targetContext || targetContext !== activeOutputContext) throw Object.assign(new Error(outputCaptureError && outputCaptureError.message || "輸出快照尚未完成；請先查看預覽中的阻塞原因。"),{code:"OUTPUT_CAPTURE_NOT_READY"});
        session.context = targetContext;
        session.phase = "preparing";
        assertOutputPrintPreparationCurrent(session);
        await prepareOutputForPrint(session,targetContext);
        if (targetContext.captureBlockers.length) throw Object.assign(new Error("照片、Drawing 或多來源選擇仍有阻塞；請先處理預覽上方提示。"),{code:"OUTPUT_CAPTURE_BLOCKED"});
        assertOutputCaptureCurrent(targetContext);
        assertOutputPrintPreparationCurrent(session);
        session.phase = "native-dialog";
        session.printInvoked = true;
        window.print();
        if (session.afterPrintSeen || !session.beforePrintSeen) finishOutputPrintPreparation(session,true);
      });
      if (!session.printInvoked && outputPrintPreparation === session) finishOutputPrintPreparation(session,true);
    });
    $("#confirm-accept").addEventListener("click", async () => {
      if (!confirmAction || $("#confirm-accept").disabled) return;
      const action = confirmAction; const button = $("#confirm-accept"); const originalLabel = button.textContent;
      button.disabled = true; button.textContent = "正在保存…";
      try { const result = await action(); if (result !== false) closeDialog("confirm-dialog"); }
      catch (error) { refreshLifecycle(modelLifecycle()); message((error.code ? error.code + " · " : "") + (error.message || "保存失敗；對話框與輸入仍保留。"), true); }
      finally { if (button.isConnected) { button.disabled = false; button.textContent = originalLabel; } }
    });
    $("#confirm-dialog").addEventListener("cancel", (event) => { if ($("#confirm-accept").disabled) event.preventDefault(); });
    document.addEventListener("beforeinput", (event) => {
      const field = event.target;
      if (isReadOnly() && field.matches && field.matches("[data-shot-field],[data-entry-field],[data-day-field],[data-project-field],[data-time-draft]")) event.preventDefault();
    }, true);
    document.addEventListener("input", (event) => {
      const field = event.target;
      if (field === $("#chapter-search") && searchComposing) return;
      if (field.matches && field.matches("[data-shot-field],[data-entry-field],[data-day-field],[data-project-field],[data-time-draft]")) {
        captureFieldDraft(field);
        if (field.matches("#shot-list .shot-inline-visual")) { field.style.height = "auto"; field.style.height = Math.max(field.scrollHeight, 48) + "px"; }
        if (field.matches("#shot-list .shot-inline-duration")) {
          const estimate = field.closest(".shot-duration-field")?.querySelector(".shot-duration-estimate");
          if (estimate) estimate.hidden = String(field.value).trim() === "" || !Number.isFinite(Number(field.value)) || Number(field.value) !== 0;
        }
      }
    });
    document.addEventListener("compositionstart", (event) => {
      const field = event.target;
      if (field === $("#chapter-search")) { searchComposing = true; return; }
      if (!field.matches || !field.matches("[data-shot-field],[data-entry-field],[data-day-field],[data-project-field]")) return;
      composingFields.add(field); const draft = captureFieldDraft(field); if (draft) { draft.composing = true; syncDraftSnapshot(); }
    });
    document.addEventListener("compositionend", (event) => {
      const field = event.target;
      if (field === $("#chapter-search")) { searchComposing = false; if (!deferShotSearchUntilDraftsSettle()) renderStoryboard(); flushPendingShotListWork(); return; }
      if (!field.matches || !field.matches("[data-shot-field],[data-entry-field],[data-day-field],[data-project-field]")) return;
      const hadBlur = !!(fieldDraftFor(field) && fieldDraftFor(field).blurPending);
      composingFields.delete(field); const draft = captureFieldDraft(field); if (draft) { draft.composing = false; draft.blurPending = false; syncDraftSnapshot(); }
      if (isReadOnly()) { flushPendingShotListWork(); return; }
      setTimeout(async () => {
        if (draft && hadBlur) await safely(() => commitDraftField(field));
        flushPendingShotListWork();
      }, 0);
    });
    document.addEventListener("change", async (event) => {
      const field = event.target;
      if (field.matches && field.matches("#entry-move-day")) {
        const button = $("#schedule-inspector [data-action='move-entry-day']");
        const entry = button && state.entries.find((item) => item.id === button.dataset.entryTarget);
        if (entry) syncEntryDayTransferControls(entry, $("#schedule-inspector"));
        return;
      }
      if (isReadOnly() && field.matches && field.matches("[data-shot-field],[data-entry-field],[data-day-field],[data-project-field],[data-time-draft]")) { captureFieldDraft(field); return; }
      if (field.matches && field.matches("[data-shot-field],[data-entry-field],[data-day-field],[data-project-field]")) {
        if (field.tagName === "SELECT" || ["date","time","checkbox"].includes(field.type)) await safely(() => handleChangeField(field));
      } else if (field.matches && field.matches("[data-time-draft]")) captureFieldDraft(field);
    });
    document.addEventListener("focusin", (event) => {
      const field = event.target;
      if (!field.matches || !field.matches("#shot-list .shot-inline-visual")) return;
      if (shotView === "gallery") resizeShotVisual(field, true);
      if (window.matchMedia && window.matchMedia("(max-width: 559px)").matches) setTimeout(() => field.scrollIntoView({block:"nearest", inline:"nearest"}), 0);
    });
    document.addEventListener("focusout", async (event) => {
      const field = event.target;
      if (!field.matches || !field.matches("[data-shot-field],[data-entry-field],[data-day-field],[data-project-field],[data-time-draft]")) return;
      if (shotView === "gallery" && field.matches("#shot-list .shot-inline-visual")) resizeShotVisual(field, false);
      if (isReadOnly()) { captureFieldDraft(field); return; }
      if (composingFields.has(field)) { const draft = fieldDraftFor(field) || captureFieldDraft(field); if (draft) { draft.blurPending = true; draft.composing = true; syncDraftSnapshot(); } return; }
      if (field.dataset.projectField) { captureFieldDraft(field); return; }
      if (field.dataset.timeDraft) { captureFieldDraft(field); return; }
      if (field.closest("#shot-list") && !fieldDraftFor(field)) return;
      if (field.tagName !== "SELECT" && !["date","time","checkbox"].includes(field.type)) await safely(() => commitDraftField(field));
    });
    $("#day-create").addEventListener("click", addShootingDay);
    document.addEventListener("submit", async (event) => { await safely(() => handleLifecycleSubmit(event)); });
    document.addEventListener("keydown", async (event) => {
      const typing = event.target.matches("input,textarea,select,[contenteditable=true]");
      if (event.isComposing || event.keyCode === 229) return;
      const shotField = event.target.closest && event.target.closest("#shot-list [data-shot-field]");
      if (shotField) {
        if (isReadOnly()) { if (event.key === "Enter") event.preventDefault(); return; }
        if (event.key === "Escape") {
          event.preventDefault();
          const draft = fieldDraftFor(shotField);
          if (draft && draft.submittedVersion === draft.version) { message("這筆修改已送出保存，無法在完成前取消。", true); return; }
          if (draft) { fieldDrafts.delete(draft.key); syncDraftSnapshot(); renderDurableStatus(); }
          const shot = state.shots.find((item) => item.id === shotField.dataset.entityId);
          if (shot) shotField.value = shot[shotField.dataset.shotField] == null || (shotField.dataset.shotField === "duration" && Number(shot.duration) === 0) ? "" : String(shot[shotField.dataset.shotField]);
          clearFieldError(shotField);
          if (shotField.matches(".shot-inline-visual")) { shotField.style.height = "auto"; shotField.style.height = Math.max(shotField.scrollHeight, 48) + "px"; }
          if (shotField.matches(".shot-inline-duration")) {
            const estimate = shotField.closest(".shot-duration-field")?.querySelector(".shot-duration-estimate");
            if (estimate) estimate.hidden = Number(shot && shot.duration) !== 0;
          }
          flushPendingShotSearch();
          return;
        }
        const multilineCommit = shotField.tagName === "TEXTAREA" && (event.ctrlKey || event.metaKey);
        if (event.key === "Enter" && (["title", "duration"].includes(shotField.dataset.shotField) || multilineCommit)) {
          event.preventDefault();
          if (fieldDraftFor(shotField)) await safely(() => commitDraftField(shotField));
          return;
        }
      }
      if (isReadOnly() && (event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); message("目前為唯讀瀏覽；復原與重做已停用。", true); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { if (typing) return; event.preventDefault(); await safely(() => runHistory(event.shiftKey ? "redo" : "undo")); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { if (typing) return; event.preventDefault(); await safely(() => runHistory("redo")); return; }
      if (event.key === "/" && !typing) { event.preventDefault(); $("#chapter-search").focus(); }
      if (event.key === "Escape") $("#project-popover")?.remove();
    });
  }

  async function initializeWorkspace() {
    lifecycle = { phase: "opening", pendingCount: 0, writable: false, projects: [], error: null, rescueAvailable: false, saveStatus: "正在讀取本機專案" };
    renderLifecycleGate(); renderDurableStatus();
    if (!model || typeof model.initialize !== "function" || typeof model.subscribeLifecycle !== "function") {
      lifecycle = { phase: "error", pendingCount: 0, writable: false, projects: [], error: { code: "MODEL_NOT_LOADED", message: "正式專案 Model 或依賴模組未載入。請確認 index.html 的 script 順序與檔案路徑。" }, rescueAvailable: false };
      renderLifecycleGate(); return;
    }
    ensureDayDialog(); selectedDayId = null; wireEvents();
    try { lifecycleUnsubscribe = model.subscribeLifecycle((snapshot) => { refreshLifecycle(snapshot); reconcileSavedDrafts(); }); }
    catch (error) { lifecycle = { ...lifecycle, phase: "error", error: { code: error.code || "LIFECYCLE_SUBSCRIBE_FAILED", message: error.message || "無法讀取本機專案狀態。" } }; renderLifecycleGate(); return; }
    try {
      const result = await model.initialize();
      lifecycleInitialized = true;
      refreshLifecycle(modelLifecycle() || result);
      if (!dataUnsubscribe) dataUnsubscribe = model.subscribe((snapshot, event) => renderForModelChange(snapshot, event));
      if (model.getState()) showProjectUI();
      else renderLifecycleGate();
    } catch (error) {
      lifecycleInitialized = true;
      const current = modelLifecycle();
      if (!current.error) current.error = { code: error.code || "INITIALIZE_FAILED", message: error.message || "讀取本機專案失敗。" };
      if (!current.phase || current.phase === "opening") current.phase = "error";
      refreshLifecycle(current);
      if (!dataUnsubscribe) {
        try { dataUnsubscribe = model.subscribe((snapshot, event) => renderForModelChange(snapshot, event)); }
        catch (_) { /* no project exists to subscribe to */ }
      }
      renderLifecycleGate();
    }
  }
  initializeWorkspace().catch((error) => {
    lifecycle = { ...modelLifecycle(), phase: "error", error: { code: error.code || "INITIALIZE_FAILED", message: error.message || "工作區初始化失敗。" } };
    renderLifecycleGate();
  });
})();

