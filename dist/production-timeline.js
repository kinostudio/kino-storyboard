(function attachProductionTimeline(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DirectorProductionTimeline = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function createProductionTimelineModule() {
  "use strict";

  const DAY_MS = 86400000;
  const TASK_COLOR_OPTIONS = [
    { value: "", label: "預設藍", swatch: "#e9edf6" },
    { value: "#6579A8", label: "藍色", swatch: "#6579A8" },
    { value: "#64875D", label: "綠色", swatch: "#64875D" },
    { value: "#B08A46", label: "琥珀色", swatch: "#B08A46" },
    { value: "#B36D6A", label: "玫瑰色", swatch: "#B36D6A" },
    { value: "#856AA8", label: "紫色", swatch: "#856AA8" },
    { value: "#4D8881", label: "青綠色", swatch: "#4D8881" },
    { value: "#707B8B", label: "石板灰", swatch: "#707B8B" }
  ];
  let instanceSequence = 0;

  function makeError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parts = value.split("-").map(Number);
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
    return Math.floor(date.getTime() / DAY_MS);
  }

  function dateFromOrdinal(ordinal) {
    const date = new Date(ordinal * DAY_MS);
    if (!Number.isFinite(date.getTime())) return null;
    const year = date.getUTCFullYear();
    if (year < 0 || year > 9999) return null;
    return String(year).padStart(4, "0") + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0");
  }

  function addDays(value, days) {
    const ordinal = parseDate(value);
    return ordinal === null ? null : dateFromOrdinal(ordinal + days);
  }

  function localToday() {
    const now = new Date();
    return String(now.getFullYear()).padStart(4, "0") + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  }

  function dayLabel(value) {
    if (!value) return "";
    const day = value.slice(8, 10);
    if (value.slice(5, 7) === "01" && day === "01") return value.slice(0, 4) + "年";
    return day === "01" ? Number(value.slice(5, 7)) + "月" : String(Number(day));
  }

  function fullDateLabel(value) {
    return value ? value.slice(0, 4) + "/" + Number(value.slice(5, 7)) + "/" + Number(value.slice(8, 10)) : "";
  }

  function lightenHexColor(value, whiteRatio) {
    if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) return "";
    const channels = [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
    return "#" + channels.map((channel) => Math.round(channel + (255 - channel) * whiteRatio).toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  function inclusiveDays(startDate, endDate) {
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    return start === null || end === null ? 0 : end - start + 1;
  }

  function overlaps(left, right) {
    return left.id !== right.id && left.startDate <= right.endDate && right.startDate <= left.endDate;
  }

  function createElement(document, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }

  function setData(element, key, value) {
    if (!element.dataset) element.dataset = {};
    element.dataset[key] = String(value);
  }

  function setText(element, value) {
    element.textContent = value == null ? "" : String(value);
  }

  function readDraftValues(record) {
    if (!record || typeof record !== "object" || !record.value || typeof record.value !== "object") return null;
    const stored = record.value;
    if (!stored.values || !stored.kind) return null;
    return {
      kind: stored.kind,
      taskId: stored.taskId || null,
      values: {
        title: String(stored.values.title || ""),
        startDate: String(stored.values.startDate || ""),
        endDate: String(stored.values.endDate || ""),
        notes: String(stored.values.notes || ""),
        color: String(stored.values.color || "")
      },
      original: stored.original && typeof stored.original === "object" ? Object.assign({}, stored.original) : null,
      dirty: true,
      error: record.error || null
    };
  }

  function mount(host, options) {
    const opts = options || {};
    if (!host || typeof host.appendChild !== "function" || !host.ownerDocument) throw makeError("INVALID_HOST", "製作時程需要有效的掛載容器。");
    if (!opts.model || typeof opts.model.getState !== "function" || typeof opts.model.subscribe !== "function") throw makeError("INVALID_MODEL", "製作時程需要 StoryModel instance。");
    if (typeof opts.projectId !== "string" || !opts.projectId) throw makeError("INVALID_PROJECT_ID", "製作時程需要 projectId。");

    const document = host.ownerDocument;
    const model = opts.model;
    const projectId = opts.projectId;
    const onClose = typeof opts.onClose === "function" ? opts.onClose : null;
    const onDraftChange = typeof opts.onDraftChange === "function" ? opts.onDraftChange : null;
    const onSelectShootingDay = typeof opts.onSelectShootingDay === "function" ? opts.onSelectShootingDay : null;
    const instanceId = "production-timeline-" + (++instanceSequence);
    const namespaceFor = (draft) => "production-timeline:" + projectId + ":" + (draft && draft.taskId ? draft.taskId : "new");
    const root = createElement(document, "section", "pt-root");
    root.setAttribute("data-production-timeline", "");

    const heading = createElement(document, "div", "pt-heading");
    const titleBlock = createElement(document, "div", "pt-title-block");
    const headingTitle = createElement(document, "h2", "pt-title", "製作時程");
    const headingCopy = createElement(document, "p", "pt-heading-copy", "以日期安排前期、拍攝與後期工作；列空白處或拍攝日標記可上下排序，標記也可左右拖曳改期。");
    titleBlock.appendChild(headingTitle);
    titleBlock.appendChild(headingCopy);
    const toolbar = createElement(document, "div", "pt-toolbar");
    const status = createElement(document, "span", "pt-save-status", "");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const addButton = createElement(document, "button", "pt-button pt-primary", "新增任務");
    addButton.type = "button";
    addButton.setAttribute("data-action", "add-task");
    const todayButton = createElement(document, "button", "pt-button", "移至今天");
    todayButton.type = "button";
    todayButton.setAttribute("data-action", "today");
    const zoomOutButton = createElement(document, "button", "pt-button pt-zoom", "縮小日期");
    zoomOutButton.type = "button";
    zoomOutButton.setAttribute("data-action", "zoom-out");
    const zoomInButton = createElement(document, "button", "pt-button pt-zoom", "放大日期");
    zoomInButton.type = "button";
    zoomInButton.setAttribute("data-action", "zoom-in");
    const closeButton = createElement(document, "button", "pt-button pt-close", "關閉時程");
    closeButton.type = "button";
    closeButton.setAttribute("data-action", "close");
    toolbar.appendChild(status);
    toolbar.appendChild(todayButton);
    toolbar.appendChild(zoomOutButton);
    toolbar.appendChild(zoomInButton);
    toolbar.appendChild(addButton);
    toolbar.appendChild(closeButton);
    heading.appendChild(titleBlock);
    heading.appendChild(toolbar);

    const message = createElement(document, "p", "pt-message");
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    const editorHost = createElement(document, "div", "pt-editor-host");
    const legend = createElement(document, "div", "pt-legend");
    legend.appendChild(createElement(document, "span", "pt-legend-item", "條身拖曳：移動整段日期；左右端點：調整起訖日。"));
    legend.appendChild(createElement(document, "span", "pt-legend-item pt-legend-day", "拍攝日標記上下拖曳可排序、左右拖曳可改期；點選可切換拍攝日。"));
    legend.appendChild(createElement(document, "span", "pt-legend-item pt-legend-order", "拖曳任務／拍攝日列空白處上下排序；任務可移到標記列上方。"));
    const scroll = createElement(document, "div", "pt-scroll");
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-label", "製作時程日期軸；可水平滑動瀏覽");
    const grid = createElement(document, "div", "pt-grid");
    scroll.appendChild(grid);
    const footer = createElement(document, "p", "pt-footnote", "水平滑動瀏覽日期；拖曳列空白處上下排序。任務可平行重疊，不會自動改期。");
    root.appendChild(heading);
    root.appendChild(message);
    root.appendChild(editorHost);
    root.appendChild(legend);
    root.appendChild(scroll);
    root.appendChild(footer);
    host.appendChild(root);

    let currentState = null;
    let lifecycle = typeof model.getLifecycle === "function" ? model.getLifecycle() : { writable: true, phase: "ready", pendingCount: 0 };
    let editorDraft = null;
    let confirmDiscard = false;
    let confirmDelete = false;
    let busy = false;
    let destroyed = false;
    let dayWidth = 72;
    let lastRange = null;
    let activeDrag = null;
    let activeMarkerDrag = null;
    let activeTimelineRowDrag = null;
    let suppressClick = false;
    let suppressClickTaskId = null;
    let suppressClickDayId = null;
    let suppressTimelineRowClick = false;
    let messageText = "";
    let messageError = false;
    let draftVersion = 0;
    const barsByTaskId = new Map();

    function announce(text, isError) {
      messageText = text || "";
      messageError = Boolean(isError);
      setText(message, messageText);
      message.className = "pt-message" + (messageError ? " pt-message-error" : "");
    }

    function lifecycleWritable() {
      if (!lifecycle || lifecycle.writable !== true || Number(lifecycle.pendingCount || 0) > 0 || busy) return false;
      return !["read_only", "save_failed", "opening", "error", "choosing"].includes(lifecycle.phase);
    }

    function boundProject() {
      currentState = typeof model.getState === "function" ? model.getState() : null;
      return Boolean(currentState && currentState.projectId === projectId);
    }

    function timelineRowsForState(state) {
      if (state && Array.isArray(state.productionTimelineOrder)) {
        return state.productionTimelineOrder.map((row) => Object.assign({}, row));
      }
      const tasks = state && Array.isArray(state.productionTasks) ? state.productionTasks : [];
      return [{ kind: "shootingDayMarkers" }].concat(tasks.map((task) => ({ kind: "productionTask", id: task.id })));
    }

    function timelineRowKey(row) {
      return row && row.kind === "productionTask" ? "productionTask:" + row.id : "shootingDayMarkers";
    }

    function isDraftDirty(draft) {
      if (!draft || !draft.values) return false;
      if (!draft.original) return Boolean(draft.values.title || draft.values.notes || draft.values.startDate || draft.values.endDate);
      return ["title", "startDate", "endDate", "notes", "color"].some((field) => String(draft.values[field] == null ? "" : draft.values[field]) !== String(draft.original[field] == null ? "" : draft.original[field]));
    }

    function hasUnsavedDraft() {
      return Boolean(editorDraft && isDraftDirty(editorDraft));
    }

    function notifyDraft() {
      if (!onDraftChange || !editorDraft) return true;
      const namespace = namespaceFor(editorDraft);
      const dirty = isDraftDirty(editorDraft);
      try {
        if (!dirty) onDraftChange(namespace, null);
        else {
          draftVersion += 1;
          onDraftChange(namespace, {
            projectId: projectId,
            entityType: "productionTask",
            entityId: editorDraft.taskId || null,
            field: "productionTimeline",
            value: {
              kind: editorDraft.kind,
              taskId: editorDraft.taskId || null,
              values: Object.assign({}, editorDraft.values),
              original: editorDraft.original ? Object.assign({}, editorDraft.original) : null
            },
            version: draftVersion,
            composing: false,
            error: editorDraft.error ? { code: editorDraft.error.code || "SAVE_FAILED", message: editorDraft.error.message || String(editorDraft.error) } : null
          });
        }
        return true;
      } catch (error) {
        announce("草稿登記失敗，仍保留在此時程畫面：" + (error && error.message ? error.message : String(error)), true);
        return false;
      }
    }

    function clearRegisteredDraft(draft) {
      if (!onDraftChange || !draft) return null;
      try {
        onDraftChange(namespaceFor(draft), null);
        return null;
      } catch (error) {
        return error;
      }
    }

    function createDraft(kind, task, values, dirty, error) {
      const original = task ? {
        title: task.title || "",
        startDate: task.startDate || "",
        endDate: task.endDate || "",
        notes: task.notes || "",
        color: task.color || ""
      } : null;
      const nextValues = Object.assign({}, original || { title: "", startDate: localToday(), endDate: localToday(), notes: "", color: "" }, values || {});
      const baseline = original || Object.assign({}, nextValues);
      editorDraft = {
        kind: kind,
        taskId: task ? task.id : null,
        values: nextValues,
        original: baseline,
        dirty: Boolean(dirty),
        error: error || null
      };
      confirmDiscard = false;
      confirmDelete = false;
      render();
      if (isDraftDirty(editorDraft)) notifyDraft();
    }

    function taskById(id) {
      const tasks = currentState && Array.isArray(currentState.productionTasks) ? currentState.productionTasks : [];
      return tasks.find((task) => task.id === id) || null;
    }

    function reconcileFailedDraft(state) {
      if (!editorDraft || !editorDraft.error || !editorDraft.taskId || !state || state.projectId !== projectId) return false;
      const values = editorDraft.values;
      const matchesDraft = (task) => task && task.title === values.title.trim() && task.startDate === values.startDate && task.endDate === values.endDate && (task.notes || "") === values.notes && (task.color || "") === (values.color || "");
      const persisted = (state.productionTasks || []).find((task) => task.id === editorDraft.taskId && matchesDraft(task));
      if (!persisted) return false;
      const previous = editorDraft;
      editorDraft = null;
      confirmDiscard = false;
      confirmDelete = false;
      const cleanupError = clearRegisteredDraft(previous);
      announce(cleanupError
        ? "原保存命令已完成，但宿主草稿清理失敗：" + (cleanupError.message || String(cleanupError))
        : "先前未完成的保存命令已完成；草稿已與專案資料同步。", Boolean(cleanupError));
      return true;
    }

    function canStartNewDraft() {
      if (!lifecycleWritable()) {
        announce(lifecycle && (lifecycle.readOnlyReason || lifecycle.saveStatus) || "目前為唯讀，無法修改製作時程。", true);
        return false;
      }
      if (hasUnsavedDraft()) {
        announce("目前編輯尚未保存；請先保存或明確放棄草稿。", true);
        return false;
      }
      return true;
    }

    function openTaskEditor(task) {
      if (!task) return;
      if (editorDraft && isDraftDirty(editorDraft) && editorDraft.taskId !== task.id) {
        announce("目前編輯尚未保存；請先保存或明確放棄草稿。", true);
        return;
      }
      if (editorDraft && isDraftDirty(editorDraft) && editorDraft.taskId === task.id) {
        renderEditor();
        return;
      }
      createDraft("edit", task, null, false, null);
      const titleInput = editorHost.querySelector ? editorHost.querySelector("[data-field='title']") : null;
      if (titleInput && typeof titleInput.focus === "function") titleInput.focus();
    }

    function validDraft(draft) {
      if (!draft || !draft.values || !draft.values.title.trim()) return { field: "title", message: "請輸入任務名稱。" };
      if (parseDate(draft.values.startDate) === null) return { field: "startDate", message: "請輸入有效的開始日期。" };
      if (parseDate(draft.values.endDate) === null) return { field: "endDate", message: "請輸入有效的結束日期。" };
      if (draft.values.endDate < draft.values.startDate) return { field: "endDate", message: "結束日期不可早於開始日期。" };
      if (draft.values.color && !/^#[0-9a-fA-F]{6}$/.test(draft.values.color)) return { field: "color", message: "任務顏色格式無效，請重新選擇。" };
      return null;
    }

    function updateDraftField(field, value) {
      if (!editorDraft) return;
      editorDraft.values[field] = String(value == null ? "" : value);
      editorDraft.error = null;
      editorDraft.dirty = isDraftDirty(editorDraft);
      confirmDiscard = false;
      notifyDraft();
      if (field === "startDate" || field === "endDate") {
        render();
        const replacement = editorHost.querySelector ? editorHost.querySelector("[data-field='" + field + "']") : null;
        if (replacement && typeof replacement.focus === "function") replacement.focus();
      }
      const error = validDraft(editorDraft);
      const errorNode = editorHost.querySelector ? editorHost.querySelector("[data-draft-error]") : null;
      if (errorNode) setText(errorNode, error ? error.message : "");
      const saveButton = editorHost.querySelector ? editorHost.querySelector("[data-action='save-task']") : null;
      if (saveButton) saveButton.disabled = !lifecycleWritable() || !editorDraft.dirty || Boolean(error);
      if (messageText && messageError && !editorDraft.error) announce("", false);
    }

    function appendField(form, labelText, fieldName, type, value) {
      const wrapper = createElement(document, "label", "pt-field");
      const fieldId = instanceId + "-" + fieldName;
      const label = createElement(document, "span", "pt-field-label", labelText);
      label.setAttribute("for", fieldId);
      const input = createElement(document, type === "textarea" ? "textarea" : "input", "pt-input");
      input.id = fieldId;
      if (type !== "textarea") input.type = type;
      input.value = value || "";
      input.setAttribute("data-field", fieldName);
      input.setAttribute("aria-label", labelText);
      if (fieldName === "title") input.maxLength = 120;
      if (fieldName === "notes") input.maxLength = 4000;
      input.disabled = !lifecycleWritable();
      wrapper.appendChild(label);
      wrapper.appendChild(input);
      form.appendChild(wrapper);
      return input;
    }

    function createTaskColorField(taskId, selectedColor) {
      const wrapper = createElement(document, "div", "pt-field pt-color-field");
      const label = createElement(document, "span", "pt-field-label", "任務顏色");
      const optionsHost = createElement(document, "div", "pt-color-options");
      optionsHost.setAttribute("role", "group");
      optionsHost.setAttribute("aria-label", "選擇任務顏色");
      const options = TASK_COLOR_OPTIONS.slice();
      if (selectedColor && !options.some((option) => option.value.toUpperCase() === selectedColor.toUpperCase())) {
        options.push({ value: selectedColor, label: "目前色", swatch: selectedColor });
      }
      options.forEach((option) => {
        const button = createElement(document, "button", "pt-color-swatch" + (!option.value ? " pt-color-default" : ""), !option.value ? "預設" : "");
        button.type = "button";
        button.setAttribute("data-action", "choose-task-color");
        button.setAttribute("data-task-id", taskId);
        button.setAttribute("data-color", option.value);
        button.setAttribute("aria-label", option.value ? "選擇" + option.label + "任務顏色" : "使用預設藍色任務顏色");
        button.setAttribute("aria-pressed", option.value.toUpperCase() === selectedColor.toUpperCase() ? "true" : "false");
        button.title = option.value ? option.label : "預設藍色";
        button.disabled = !lifecycleWritable();
        button.style.backgroundColor = option.swatch;
        if (option.value) button.style.borderColor = option.value;
        if (option.value && option.value.toUpperCase() === selectedColor.toUpperCase()) {
          button.appendChild(createElement(document, "span", "pt-color-selected-mark", "✓"));
        }
        optionsHost.appendChild(button);
      });
      wrapper.appendChild(label);
      wrapper.appendChild(optionsHost);
      return wrapper;
    }

    function renderEditor() {
      editorHost.replaceChildren();
      if (!editorDraft) return;
      const draft = editorDraft;
      const title = draft.kind === "add" ? "新增製作任務" : "編輯製作任務";
      const form = createElement(document, "form", "pt-editor");
      form.setAttribute("aria-label", title);
      form.noValidate = true;
      const formTitle = createElement(document, "div", "pt-editor-heading");
      formTitle.appendChild(createElement(document, "h3", "pt-editor-title", title));
      if (draft.taskId) formTitle.appendChild(createElement(document, "span", "pt-task-id", "任務日期包含首尾兩天"));
      form.appendChild(formTitle);
      appendField(form, "任務名稱", "title", "text", draft.values.title);
      if (draft.taskId) form.appendChild(createTaskColorField(draft.taskId, draft.values.color || ""));
      const dateRow = createElement(document, "div", "pt-date-row");
      const startFieldHost = createElement(document, "div", "pt-date-field-host");
      const endFieldHost = createElement(document, "div", "pt-date-field-host");
      const startField = appendField(startFieldHost, "開始日期", "startDate", "date", draft.values.startDate);
      const endField = appendField(endFieldHost, "結束日期", "endDate", "date", draft.values.endDate);
      const dateButtons = [];
      [
        ["startDate", -1, "開始日提前一天"], ["startDate", 1, "開始日晚一天"],
        ["endDate", -1, "結束日提前一天"], ["endDate", 1, "結束日晚一天"]
      ].forEach(([field, delta, label]) => {
        const button = createElement(document, "button", "pt-step-button", delta < 0 ? "−1 日" : "+1 日");
        button.type = "button";
        button.setAttribute("data-action", "step-date");
        button.setAttribute("data-field", field);
        button.setAttribute("data-delta", delta);
        button.setAttribute("aria-label", label);
        button.disabled = !lifecycleWritable();
        dateButtons.push(button);
      });
      const startStepper = createElement(document, "div", "pt-date-stepper");
      const endStepper = createElement(document, "div", "pt-date-stepper");
      startStepper.appendChild(dateButtons[0]);
      startStepper.appendChild(dateButtons[1]);
      endStepper.appendChild(dateButtons[2]);
      endStepper.appendChild(dateButtons[3]);
      startFieldHost.appendChild(startStepper);
      endFieldHost.appendChild(endStepper);
      dateRow.appendChild(startFieldHost);
      dateRow.appendChild(endFieldHost);
      form.appendChild(dateRow);
      appendField(form, "備註", "notes", "textarea", draft.values.notes);
      const validation = validDraft(draft);
      const draftError = createElement(document, "p", "pt-field-error", draft.error ? (draft.error.code ? draft.error.code + " · " : "") + draft.error.message : validation ? validation.message : "");
      draftError.setAttribute("data-draft-error", "");
      draftError.setAttribute("aria-live", "polite");
      form.appendChild(draftError);

      if (confirmDiscard) {
        const confirm = createElement(document, "div", "pt-confirm pt-confirm-warning");
        confirm.setAttribute("role", "alertdialog");
        confirm.setAttribute("aria-label", "確認放棄草稿");
        confirm.appendChild(createElement(document, "span", "pt-confirm-copy", "放棄目前未保存的欄位與日期預覽？"));
        const yes = createElement(document, "button", "pt-button pt-danger", "放棄草稿");
        yes.type = "button";
        yes.setAttribute("data-action", "confirm-discard");
        const no = createElement(document, "button", "pt-button", "繼續編輯");
        no.type = "button";
        no.setAttribute("data-action", "cancel-discard");
        confirm.appendChild(yes);
        confirm.appendChild(no);
        form.appendChild(confirm);
      }

      if (confirmDelete) {
        const confirm = createElement(document, "div", "pt-confirm pt-confirm-warning");
        confirm.setAttribute("role", "alertdialog");
        confirm.setAttribute("aria-label", "確認刪除任務");
        confirm.appendChild(createElement(document, "span", "pt-confirm-copy", "刪除此任務？可用全域復原還原。"));
        const yes = createElement(document, "button", "pt-button pt-danger", "確認刪除");
        yes.type = "button";
        yes.setAttribute("data-action", "confirm-delete");
        const no = createElement(document, "button", "pt-button", "保留任務");
        no.type = "button";
        no.setAttribute("data-action", "cancel-delete");
        confirm.appendChild(yes);
        confirm.appendChild(no);
        form.appendChild(confirm);
      }

      const actions = createElement(document, "div", "pt-editor-actions");
      if (draft.taskId) {
        const orderedRows = timelineRowsForState(currentState);
        const taskIndex = orderedRows.findIndex((row) => row.kind === "productionTask" && row.id === draft.taskId);
        const orderActions = createElement(document, "div", "pt-task-order-actions");
        const moveUp = createElement(document, "button", "pt-button pt-task-order-button", "上移一列");
        moveUp.type = "button";
        moveUp.setAttribute("data-action", "move-task-up");
        moveUp.setAttribute("data-task-id", draft.taskId);
        moveUp.setAttribute("aria-label", "將任務上移一列");
        moveUp.disabled = !lifecycleWritable() || hasUnsavedDraft() || taskIndex <= 0;
        const moveDown = createElement(document, "button", "pt-button pt-task-order-button", "下移一列");
        moveDown.type = "button";
        moveDown.setAttribute("data-action", "move-task-down");
        moveDown.setAttribute("data-task-id", draft.taskId);
        moveDown.setAttribute("aria-label", "將任務下移一列");
        moveDown.disabled = !lifecycleWritable() || hasUnsavedDraft() || taskIndex < 0 || taskIndex >= orderedRows.length - 1;
        orderActions.appendChild(moveUp);
        orderActions.appendChild(moveDown);
        actions.appendChild(orderActions);
      }
      const save = createElement(document, "button", "pt-button pt-primary", "保存任務");
      save.type = "submit";
      save.setAttribute("data-action", "save-task");
      save.disabled = !lifecycleWritable() || !draft.dirty || Boolean(validation);
      const discard = createElement(document, "button", "pt-button", draft.dirty ? "放棄草稿" : "關閉編輯");
      discard.type = "button";
      discard.setAttribute("data-action", "discard-task");
      discard.disabled = busy;
      actions.appendChild(save);
      actions.appendChild(discard);
      if (draft.taskId) {
        const remove = createElement(document, "button", "pt-button pt-danger", "刪除任務");
        remove.type = "button";
        remove.setAttribute("data-action", "delete-task");
        remove.disabled = !lifecycleWritable() || draft.dirty;
        actions.appendChild(remove);
      }
      form.appendChild(actions);
      if (!lifecycleWritable()) form.appendChild(createElement(document, "p", "pt-readonly-note", lifecycle && (lifecycle.readOnlyReason || lifecycle.saveStatus) || "目前為唯讀；草稿仍保留。"));
      editorHost.appendChild(form);
    }

    function chooseRange(state) {
      const values = [localToday()];
      (state.productionTasks || []).forEach((task) => { values.push(task.startDate, task.endDate); });
      (state.days || []).forEach((day) => values.push(day.date));
      if (editorDraft && isDraftDirty(editorDraft)) values.push(editorDraft.values.startDate, editorDraft.values.endDate);
      const ordinals = values.map(parseDate).filter((value) => value !== null);
      const min = Math.min.apply(null, ordinals);
      const max = Math.max.apply(null, ordinals);
      const start = dateFromOrdinal(min - 7);
      const end = dateFromOrdinal(max + 14);
      const startOrdinal = parseDate(start);
      const endOrdinal = parseDate(end);
      return { start: start, end: end, startOrdinal: startOrdinal, days: Math.max(1, endOrdinal - startOrdinal + 1) };
    }

    function applyGridItem(element, row, columnStart, columnEnd) {
      element.style.gridRow = String(row);
      element.style.gridColumn = columnEnd === undefined ? String(columnStart) : String(columnStart) + " / " + String(columnEnd);
    }

    function applyTimelineRowMetadata(element, row, rowIndex, reorderSurface) {
      if (!row || !Number.isInteger(rowIndex)) return;
      setData(element, "timelineRowIndex", rowIndex);
      setData(element, "timelineRowKind", row.kind);
      if (row.kind === "productionTask") setData(element, "timelineTaskId", row.id);
      if (reorderSurface) element.classList.add("pt-row-reorder-surface");
    }

    function createEmptyDateCell(date, row, col, extraClass, timelineRow, timelineIndex) {
      const cell = createElement(document, "div", "pt-day-cell" + (extraClass ? " " + extraClass : ""));
      setData(cell, "date", date);
      setData(cell, "newDate", date);
      applyTimelineRowMetadata(cell, timelineRow, timelineIndex, Boolean(timelineRow));
      cell.setAttribute("aria-label", "在 " + fullDateLabel(date) + " 新增製作任務");
      cell.title = "點選此空白日期新增任務：" + fullDateLabel(date);
      applyGridItem(cell, row, col);
      return cell;
    }

    function createTaskLabel(task, row, overlappingTasks, selected, timelineIndex) {
      const cell = createElement(document, "div", "pt-sticky-label pt-task-label" + (selected ? " is-selected" : ""));
      const timelineRow = { kind: "productionTask", id: task.id };
      applyTimelineRowMetadata(cell, timelineRow, timelineIndex, true);
      applyGridItem(cell, row, 1);
      const edit = createElement(document, "button", "pt-task-edit", "");
      edit.type = "button";
      edit.setAttribute("data-action", "edit-task");
      edit.setAttribute("data-task-id", task.id);
      edit.setAttribute("aria-label", "編輯任務：" + (task.title || "未命名任務") + "，" + fullDateLabel(task.startDate) + " 至 " + fullDateLabel(task.endDate));
      edit.appendChild(createElement(document, "strong", "pt-task-name", task.title || "未命名任務"));
      edit.appendChild(createElement(document, "span", "pt-task-date", fullDateLabel(task.startDate) + " – " + fullDateLabel(task.endDate) + " · " + inclusiveDays(task.startDate, task.endDate) + " 天"));
      if (overlappingTasks.length) {
        const labels = overlappingTasks.map((other) => other.title || "未命名任務");
        const overlapBadge = createElement(document, "span", "pt-overlap-badge", "平行任務 " + overlappingTasks.length);
        overlapBadge.title = "日期重疊：" + labels.join("、");
        edit.appendChild(overlapBadge);
      }
      cell.appendChild(edit);
      return cell;
    }

    function createBar(task, row, range, selected, isGhost, timelineIndex) {
      const previewValues = isGhost ? editorDraft.values : null;
      const startDate = previewValues ? previewValues.startDate : task.startDate;
      const endDate = previewValues ? previewValues.endDate : task.endDate;
      const startIndex = parseDate(startDate) - range.startOrdinal;
      const endIndex = parseDate(endDate) - range.startOrdinal;
      if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex) || endIndex < startIndex) return null;
      const bar = createElement(document, "div", "pt-task-bar" + (selected ? " is-selected" : "") + (isGhost ? " is-draft-ghost" : ""));
      const previewColor = previewValues && previewValues.color !== undefined ? previewValues.color : task.color;
      if (previewColor && /^#[0-9a-fA-F]{6}$/.test(previewColor)) {
        bar.style.backgroundColor = lightenHexColor(previewColor, 0.8);
        bar.style.borderColor = previewColor;
        bar.style.color = "#27344f";
      }
      bar.setAttribute("role", "group");
      bar.setAttribute("aria-label", (isGhost ? "未保存日期預覽：" : "任務：") + (task.title || "未命名任務") + "，" + fullDateLabel(startDate) + " 至 " + fullDateLabel(endDate));
      bar.setAttribute("data-task-bar", task.id);
      setData(bar, "taskId", task.id);
      applyTimelineRowMetadata(bar, { kind: "productionTask", id: task.id }, timelineIndex, false);
      if (isGhost) bar.setAttribute("data-draft-bar", "");
      applyGridItem(bar, row, startIndex + 2, endIndex + 3);
      const handleStart = createElement(document, "button", "pt-resize-handle pt-resize-start", "");
      handleStart.type = "button";
      handleStart.setAttribute("data-action", "resize-start");
      handleStart.setAttribute("data-task-id", task.id);
      handleStart.setAttribute("aria-label", "調整「" + (task.title || "未命名任務") + "」開始日；左右方向鍵可移動一天，也可使用開始日期欄位");
      handleStart.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight");
      handleStart.title = "拖曳調整開始日；日期欄位也可編輯";
      const content = createElement(document, isGhost ? "span" : "button", "pt-bar-content");
      if (!isGhost) {
        content.type = "button";
        content.setAttribute("data-action", "edit-task-bar");
        content.setAttribute("data-task-id", task.id);
        content.setAttribute("aria-label", "選取任務「" + (task.title || "未命名任務") + "」並編輯；左右方向鍵可移動一天");
        content.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight");
      }
      content.appendChild(createElement(document, "span", "pt-bar-title", task.title || "未命名任務"));
      content.appendChild(createElement(document, "span", "pt-bar-dates", fullDateLabel(startDate) + " – " + fullDateLabel(endDate)));
      const handleEnd = createElement(document, "button", "pt-resize-handle pt-resize-end", "");
      handleEnd.type = "button";
      handleEnd.setAttribute("data-action", "resize-end");
      handleEnd.setAttribute("data-task-id", task.id);
      handleEnd.setAttribute("aria-label", "調整「" + (task.title || "未命名任務") + "」結束日；左右方向鍵可移動一天，也可使用結束日期欄位");
      handleEnd.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight");
      handleEnd.title = "拖曳調整結束日；日期欄位也可編輯";
      bar.appendChild(handleStart);
      bar.appendChild(content);
      bar.appendChild(handleEnd);
      return bar;
    }

    function createMarkerCell(date, row, col, days, timelineIndex) {
      const cell = createElement(document, "div", "pt-day-cell pt-marker-cell" + (days.length ? " has-markers" : ""));
      cell.setAttribute("data-date", date);
      applyTimelineRowMetadata(cell, { kind: "shootingDayMarkers" }, timelineIndex, true);
      applyGridItem(cell, row, col);
      days.forEach((day, index) => {
        const marker = createElement(document, "button", "pt-day-marker" + (index ? " pt-day-marker-secondary" : ""), "");
        marker.type = "button";
        marker.setAttribute("data-action", "select-shooting-day");
        marker.setAttribute("data-day-id", day.id);
        applyTimelineRowMetadata(marker, { kind: "shootingDayMarkers" }, timelineIndex, false);
        marker.setAttribute("aria-label", "拍攝日「" + (day.title || "拍攝日") + "」，" + fullDateLabel(day.date) + "；上下拖曳排序、左右拖曳改期，點選切換拍攝日");
        marker.title = (day.title || "拍攝日") + " · " + fullDateLabel(day.date) + "（上下拖曳排序；左右拖曳改期；點選以切換拍攝日）";
        marker.appendChild(createElement(document, "span", "pt-marker-dot", ""));
        marker.appendChild(createElement(document, "span", "pt-marker-text", day.title || "拍攝日"));
        cell.appendChild(marker);
      });
      return cell;
    }

    function drawGrid(preserveEditor) {
      const matched = boundProject();
      const previousScrollLeft = scroll.scrollLeft || 0;
      grid.replaceChildren();
      barsByTaskId.clear();
      if (!matched) {
        lastRange = null;
        grid.style.gridTemplateColumns = "minmax(180px, 220px) 1fr";
        const label = createElement(document, "div", "pt-sticky-label pt-grid-heading", "此時程綁定的專案目前未開啟");
        applyGridItem(label, 1, 1);
        const note = createElement(document, "div", "pt-project-mismatch", "草稿留在此元件；請回到原專案保存或放棄草稿後再離開。");
        applyGridItem(note, 1, 2);
        grid.appendChild(label);
        grid.appendChild(note);
        if (!preserveEditor) renderEditor();
        return;
      }

      const range = chooseRange(currentState);
      lastRange = range;
      const dayCount = range.days;
      const tasks = Array.isArray(currentState.productionTasks) ? currentState.productionTasks : [];
      const days = Array.isArray(currentState.days) ? currentState.days : [];
      const timelineRows = timelineRowsForState(currentState);
      const tasksById = new Map(tasks.map((task) => [task.id, task]));
      grid.style.setProperty("--pt-day-width", dayWidth + "px");
      grid.style.gridTemplateColumns = "minmax(180px, 220px) repeat(" + dayCount + ", " + dayWidth + "px)";
      grid.style.gridTemplateRows = "auto repeat(" + Math.max(1, timelineRows.length) + ", minmax(58px, auto)) auto";

      const headerLabel = createElement(document, "div", "pt-sticky-label pt-grid-heading", "任務／拍攝日");
      applyGridItem(headerLabel, 1, 1);
      grid.appendChild(headerLabel);
      for (let index = 0; index < dayCount; index += 1) {
        const date = dateFromOrdinal(range.startOrdinal + index);
        const axis = createElement(document, "div", "pt-axis-cell" + (date.slice(8, 10) === "01" ? " is-month-start" : "") + (date === localToday() ? " is-today" : ""), dayLabel(date));
        axis.title = fullDateLabel(date);
        axis.setAttribute("aria-label", fullDateLabel(date));
        applyGridItem(axis, 1, index + 2);
        grid.appendChild(axis);
      }

      const daysByDate = new Map();
      days.forEach((day) => {
        if (parseDate(day.date) === null) return;
        if (!daysByDate.has(day.date)) daysByDate.set(day.date, []);
        daysByDate.get(day.date).push(day);
      });
      timelineRows.forEach((timelineRow, timelineIndex) => {
        const row = timelineIndex + 2;
        if (timelineRow.kind === "shootingDayMarkers") {
          const markerLabel = createElement(document, "div", "pt-sticky-label pt-grid-heading pt-marker-heading", "拍攝日標記");
          applyTimelineRowMetadata(markerLabel, timelineRow, timelineIndex, true);
          applyGridItem(markerLabel, row, 1);
          grid.appendChild(markerLabel);
          for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
            const date = dateFromOrdinal(range.startOrdinal + dayIndex);
            grid.appendChild(createMarkerCell(date, row, dayIndex + 2, daysByDate.get(date) || [], timelineIndex));
          }
          return;
        }
        const task = tasksById.get(timelineRow.id);
        if (!task) return;
        const overlappingTasks = tasks.filter((other) => overlaps(task, other));
        const selected = Boolean(editorDraft && editorDraft.taskId === task.id);
        grid.appendChild(createTaskLabel(task, row, overlappingTasks, selected, timelineIndex));
        for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
          const date = dateFromOrdinal(range.startOrdinal + dayIndex);
          grid.appendChild(createEmptyDateCell(date, row, dayIndex + 2, date === localToday() ? "is-today" : "", timelineRow, timelineIndex));
        }
        const bar = createBar(task, row, range, selected, false, timelineIndex);
        if (bar) {
          grid.appendChild(bar);
          barsByTaskId.set(task.id, bar);
        }
        if (selected && editorDraft && isDraftDirty(editorDraft) && (
          editorDraft.values.startDate !== task.startDate ||
          editorDraft.values.endDate !== task.endDate ||
          editorDraft.values.color !== (task.color || "")
        )) {
          const ghost = createBar(task, row, range, false, true, timelineIndex);
          if (ghost) grid.appendChild(ghost);
        }
      });

      const emptyRow = timelineRows.length + 2;
      const emptyLabel = createElement(document, "div", "pt-sticky-label pt-empty-label", "空白日期可新增任務");
      applyGridItem(emptyLabel, emptyRow, 1);
      grid.appendChild(emptyLabel);
      for (let index = 0; index < dayCount; index += 1) {
        const date = dateFromOrdinal(range.startOrdinal + index);
        const cell = createEmptyDateCell(date, emptyRow, index + 2, date === localToday() ? "is-today" : "pt-empty-create-cell");
        cell.appendChild(createElement(document, "span", "pt-create-plus", "+"));
        grid.appendChild(cell);
      }
      scroll.scrollLeft = previousScrollLeft;
      if (!preserveEditor) renderEditor();
    }

    function refreshStatus() {
      if (!lifecycle || !currentState) {
        setText(status, lifecycle && (lifecycle.saveStatus || lifecycle.readOnlyReason) || "正在讀取專案");
      } else if (currentState.projectId !== projectId) {
        setText(status, "專案已切換；此時程草稿仍保留");
      } else {
        setText(status, lifecycle.saveStatus || (lifecycle.writable ? "已儲存" : "唯讀"));
      }
      const enabled = lifecycleWritable() && boundProject();
      addButton.disabled = !enabled || hasUnsavedDraft();
      todayButton.disabled = !lastRange;
      zoomOutButton.disabled = !lastRange || dayWidth <= 64;
      zoomInButton.disabled = !lastRange || dayWidth >= 112;
      closeButton.disabled = false;
      if (messageText) announce(messageText, messageError);
    }

    function render(preserveEditor) {
      if (destroyed) return;
      drawGrid(Boolean(preserveEditor));
      refreshStatus();
    }

    function lifecycleSignature(value) {
      const source = value || {};
      return JSON.stringify({
        phase: source.phase || "",
        writable: source.writable === true,
        pendingCount: Number(source.pendingCount || 0),
        readOnlyReason: source.readOnlyReason || "",
        saveStatus: source.saveStatus || "",
        error: source.error || null
      });
    }

    function removeDraft() {
      if (editorDraft && onDraftChange) {
        try { onDraftChange(namespaceFor(editorDraft), null); }
        catch (error) { announce("草稿登記無法清除；資料仍保留在宿主草稿清單：" + (error && error.message ? error.message : String(error)), true); }
      }
      editorDraft = null;
      confirmDiscard = false;
      confirmDelete = false;
      render();
    }

    async function saveDraft() {
      if (!editorDraft || !isDraftDirty(editorDraft)) return;
      if (!lifecycleWritable() || !boundProject()) {
        announce(lifecycle && (lifecycle.readOnlyReason || lifecycle.saveStatus) || "目前無法保存；草稿仍保留。", true);
        return;
      }
      const validation = validDraft(editorDraft);
      if (validation) {
        announce(validation.message, true);
        const field = editorHost.querySelector ? editorHost.querySelector("[data-field='" + validation.field + "']") : null;
        if (field && typeof field.focus === "function") field.focus();
        return;
      }
      const draft = editorDraft;
      const values = Object.assign({}, draft.values);
      busy = true;
      render();
      try {
        if (draft.kind === "add") await model.addProductionTask(values.title.trim(), values.startDate, values.endDate, values.notes);
        else {
          const patch = { title: values.title.trim(), startDate: values.startDate, endDate: values.endDate, notes: values.notes };
          const originalColor = draft.original && draft.original.color || "";
          if (values.color !== originalColor) patch.color = values.color;
          await model.updateProductionTask(draft.taskId, patch);
        }
        let cleanupError = null;
        if (editorDraft === draft) {
          cleanupError = clearRegisteredDraft(draft);
          editorDraft = null;
          confirmDiscard = false;
          confirmDelete = false;
        }
        announce(cleanupError ? "任務已保存，但宿主草稿清理失敗：" + (cleanupError.message || String(cleanupError)) : "任務已保存。", Boolean(cleanupError));
      } catch (error) {
        draft.error = error || makeError("SAVE_FAILED", "保存失敗。");
        draft.dirty = true;
        notifyDraft();
        announce("保存失敗，輸入與日期草稿仍保留：" + (error && error.message ? error.message : String(error)), true);
      } finally {
        busy = false;
        render();
      }
    }

    async function saveTimelineOrder(orderedRows, options) {
      const settings = options || {};
      if (typeof model.reorderProductionTimeline !== "function") {
        announce("目前的專案模型不支援時程列排序。", true);
        return false;
      }
      busy = true;
      refreshStatus();
      try {
        const changed = await model.reorderProductionTimeline(orderedRows);
        announce(changed === false ? "時程列順序沒有改變。" : (settings.successMessage || "時程列順序已保存。"), false);
        return changed !== false;
      } catch (error) {
        announce("時程列順序未保存；原順序保留，請重試：" + (error && error.message ? error.message : String(error)), true);
        return false;
      } finally {
        busy = false;
        render();
        if (settings.focusTaskId && settings.focusAction && typeof root.querySelectorAll === "function") {
          const control = Array.from(root.querySelectorAll("[data-action]"))
            .find((item) => item.dataset.action === settings.focusAction && item.dataset.taskId === settings.focusTaskId);
          if (control && typeof control.focus === "function") control.focus();
        }
      }
    }

    async function reorderTask(taskId, delta) {
      if (!lifecycleWritable() || !boundProject()) {
        announce(lifecycle && (lifecycle.readOnlyReason || lifecycle.saveStatus) || "目前無法調整任務列順序。", true);
        return;
      }
      if (hasUnsavedDraft()) {
        announce("先保存或放棄目前草稿，才可調整任務列順序。", true);
        return;
      }
      const orderedRows = timelineRowsForState(currentState);
      const from = orderedRows.findIndex((row) => row.kind === "productionTask" && row.id === taskId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= orderedRows.length) return;
      const movedRow = orderedRows.splice(from, 1)[0];
      orderedRows.splice(to, 0, movedRow);
      return saveTimelineOrder(orderedRows, {
        successMessage: delta < 0 ? "任務已上移一列並保存。" : "任務已下移一列並保存。",
        focusTaskId: taskId,
        focusAction: delta < 0 ? "move-task-down" : "move-task-up"
      });
    }

    async function deleteTask() {
      if (!editorDraft || !editorDraft.taskId || !confirmDelete || !lifecycleWritable() || hasUnsavedDraft()) return;
      const id = editorDraft.taskId;
      const draft = editorDraft;
      busy = true;
      render();
      try {
        await model.deleteProductionTask(id);
        let cleanupError = null;
        if (editorDraft === draft) {
          cleanupError = clearRegisteredDraft(draft);
          editorDraft = null;
        }
        confirmDelete = false;
        announce(cleanupError ? "任務已刪除，但宿主草稿清理失敗：" + (cleanupError.message || String(cleanupError)) : "任務已刪除。", Boolean(cleanupError));
      } catch (error) {
        draft.error = error || makeError("DELETE_FAILED", "刪除失敗。");
        notifyDraft();
        announce("刪除失敗，任務與草稿仍保留：" + (error && error.message ? error.message : String(error)), true);
      } finally {
        busy = false;
        render();
      }
    }

    function requestClose() {
      if (hasUnsavedDraft()) {
        if (!onDraftChange) {
          announce("尚有未保存草稿。請先保存或明確放棄草稿，再離開此時程。", true);
          return false;
        }
        if (!notifyDraft()) return false;
      }
      if (onClose) onClose();
      else announce("時程草稿已保留；宿主尚未提供關閉動作。", false);
      return true;
    }

    function scrollToToday() {
      if (!lastRange) return;
      const today = parseDate(localToday());
      const index = today - lastRange.startOrdinal;
      scroll.scrollLeft = Math.max(0, index * dayWidth - Math.max(0, (scroll.clientWidth || 480) / 2 - dayWidth));
    }

    function selectShootingDay(dayId) {
      if (!dayId) return;
      const day = (currentState && currentState.days || []).find((item) => item.id === dayId);
      if (!day) return;
      if (hasUnsavedDraft() && !onDraftChange) {
        announce("草稿尚未登記給宿主，請先保存或放棄草稿後再切換拍攝日。", true);
        return;
      }
      if (hasUnsavedDraft() && !notifyDraft()) return;
      if (onSelectShootingDay) onSelectShootingDay(dayId);
      const EventConstructor = document.defaultView && document.defaultView.CustomEvent || (typeof CustomEvent !== "undefined" ? CustomEvent : null);
      if (EventConstructor && typeof host.dispatchEvent === "function") host.dispatchEvent(new EventConstructor("productiontimeline:select-shooting-day", { bubbles: true, detail: { projectId: projectId, dayId: dayId } }));
    }

    function startGesture(event, taskId, mode) {
      if (activeMarkerDrag || activeTimelineRowDrag) return;
      if (!lifecycleWritable() || !boundProject()) {
        announce(lifecycle && (lifecycle.readOnlyReason || lifecycle.saveStatus) || "目前為唯讀，無法調整日期。", true);
        return;
      }
      if (hasUnsavedDraft()) {
        announce("先保存或放棄目前草稿，才可移動其他任務。", true);
        return;
      }
      const task = taskById(taskId);
      if (!task) return;
      if (event.button !== undefined && event.button !== 0) return;
      activeDrag = {
        task: Object.assign({}, task),
        mode: mode,
        pointerId: event.pointerId,
        startX: Number(event.clientX || 0),
        originStart: task.startDate,
        originEnd: task.endDate,
        nextStart: task.startDate,
        nextEnd: task.endDate,
        moved: false,
        bar: barsByTaskId.get(taskId) || null
      };
      if (event.target && typeof event.target.setPointerCapture === "function" && event.pointerId !== undefined) {
        try { event.target.setPointerCapture(event.pointerId); } catch (_) { /* Pointer capture is optional in embedded/test environments. */ }
      }
    }

    function startMarkerGesture(event, marker) {
      if (activeDrag || activeMarkerDrag || activeTimelineRowDrag) return;
      if (!lifecycleWritable() || !boundProject()) {
        announce(lifecycle && (lifecycle.readOnlyReason || lifecycle.saveStatus) || "目前為唯讀，無法調整拍攝日期。", true);
        return;
      }
      if (hasUnsavedDraft()) {
        announce("先保存或放棄目前草稿，才可調整拍攝日期。", true);
        return;
      }
      if (event.button !== undefined && event.button !== 0) return;
      const dayId = marker && marker.dataset ? marker.dataset.dayId : "";
      const day = (currentState && Array.isArray(currentState.days) ? currentState.days : []).find((item) => item.id === dayId);
      if (!day || parseDate(day.date) === null) return;
      activeMarkerDrag = {
        day: Object.assign({}, day),
        pointerId: event.pointerId,
        startX: Number(event.clientX || 0),
        originDate: day.date,
        nextDate: day.date,
        moved: false,
        marker: marker,
        originAriaLabel: marker.getAttribute("aria-label") || "",
        originTitle: marker.title || ""
      };
      if (marker && typeof marker.setPointerCapture === "function" && event.pointerId !== undefined) {
        try { marker.setPointerCapture(event.pointerId); } catch (_) { /* Pointer capture is optional in embedded/test environments. */ }
      }
    }

    function visibleDateBounds() {
      if (!lastRange || !Number.isFinite(lastRange.startOrdinal) || !Number.isFinite(lastRange.days)) return null;
      return { start: lastRange.startOrdinal, end: lastRange.startOrdinal + lastRange.days - 1 };
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function previewMarkerDate(drag, delta) {
      const bounds = visibleDateBounds();
      const originOrdinal = parseDate(drag.originDate);
      const boundedDelta = bounds ? clamp(delta, bounds.start - originOrdinal, bounds.end - originOrdinal) : delta;
      drag.clamped = boundedDelta !== delta;
      drag.nextDate = addDays(drag.originDate, boundedDelta) || drag.originDate;
      if (drag.marker) {
        drag.marker.style.transform = "translateX(" + (boundedDelta * dayWidth) + "px)";
        drag.marker.classList.add("is-drag-preview");
        drag.marker.setAttribute("aria-label", "拍攝日「" + (drag.day.title || "拍攝日") + "」日期預覽：" + fullDateLabel(drag.nextDate) + "；放開後保存");
        drag.marker.title = (drag.day.title || "拍攝日") + " · " + fullDateLabel(drag.nextDate) + "（放開後保存）";
      }
    }

    function restoreMarkerPreview(drag) {
      if (!drag || !drag.marker) return;
      drag.marker.style.transform = "";
      drag.marker.classList.remove("is-drag-preview");
      drag.marker.setAttribute("aria-label", drag.originAriaLabel);
      drag.marker.title = drag.originTitle;
    }

    async function commitMarkerGesture(drag) {
      if (drag.nextDate === drag.originDate) return;
      const currentDay = (currentState && Array.isArray(currentState.days) ? currentState.days : []).find((item) => item.id === drag.day.id);
      if (!currentDay || currentDay.date !== drag.originDate) {
        restoreMarkerPreview(drag);
        announce("拍攝日資料已更新；此次日期預覽取消，請重新拖曳。", true);
        return;
      }
      if (!lifecycleWritable() || !boundProject()) {
        restoreMarkerPreview(drag);
        announce(lifecycle && (lifecycle.readOnlyReason || lifecycle.saveStatus) || "目前無法保存拍攝日期；原日期保留。", true);
        return;
      }
      busy = true;
      refreshStatus();
      try {
        await model.updateDay(drag.day.id, { date: drag.nextDate });
        announce("拍攝日日期已保存；拍攝日 ID、集合時間與日內安排維持不變。", false);
      } catch (error) {
        announce("拍攝日日期未保存；原日期與日內安排保留，請重試：" + (error && error.message ? error.message : String(error)), true);
      } finally {
        busy = false;
        render();
        if (typeof root.querySelectorAll === "function") {
          const control = Array.from(root.querySelectorAll("[data-action]")).find((item) => item.dataset.action === "select-shooting-day" && item.dataset.dayId === drag.day.id);
          if (control && typeof control.focus === "function") control.focus();
        }
      }
    }

    function dragDates(drag, delta) {
      const requestedDelta = delta;
      const bounds = drag.bar ? visibleDateBounds() : null;
      if (bounds) {
        const originStart = parseDate(drag.originStart);
        const originEnd = parseDate(drag.originEnd);
        if (drag.mode === "move") delta = clamp(delta, bounds.start - originStart, bounds.end - originEnd);
        else if (drag.mode === "resize-start") delta = clamp(delta, bounds.start - originStart, originEnd - originStart);
        else delta = clamp(delta, originStart - originEnd, bounds.end - originEnd);
      }
      drag.clamped = delta !== requestedDelta;
      if (drag.mode === "move") {
        drag.nextStart = addDays(drag.originStart, delta) || drag.originStart;
        drag.nextEnd = addDays(drag.originEnd, delta) || drag.originEnd;
      } else if (drag.mode === "resize-start") {
        const candidate = addDays(drag.originStart, delta) || drag.originStart;
        drag.nextStart = candidate <= drag.originEnd ? candidate : drag.originEnd;
        drag.nextEnd = drag.originEnd;
      } else {
        const candidate = addDays(drag.originEnd, delta) || drag.originEnd;
        drag.nextStart = drag.originStart;
        drag.nextEnd = candidate >= drag.originStart ? candidate : drag.originStart;
      }
      if (drag.bar && lastRange) {
        const startIndex = parseDate(drag.nextStart) - lastRange.startOrdinal;
        const endIndex = parseDate(drag.nextEnd) - lastRange.startOrdinal;
        drag.bar.style.gridColumn = (startIndex + 2) + " / " + (endIndex + 3);
        drag.bar.classList.add("is-drag-preview");
        drag.bar.setAttribute("aria-valuetext", fullDateLabel(drag.nextStart) + " 至 " + fullDateLabel(drag.nextEnd));
        const dateText = drag.bar.querySelector ? drag.bar.querySelector(".pt-bar-dates") : null;
        if (dateText) setText(dateText, fullDateLabel(drag.nextStart) + " – " + fullDateLabel(drag.nextEnd));
      }
    }

    function restoreDragPreview(drag) {
      if (!drag || !drag.bar || !lastRange) return;
      const startIndex = parseDate(drag.originStart) - lastRange.startOrdinal;
      const endIndex = parseDate(drag.originEnd) - lastRange.startOrdinal;
      drag.bar.style.gridColumn = (startIndex + 2) + " / " + (endIndex + 3);
      drag.bar.classList.remove("is-drag-preview");
      const dateText = drag.bar.querySelector ? drag.bar.querySelector(".pt-bar-dates") : null;
      if (dateText) setText(dateText, fullDateLabel(drag.originStart) + " – " + fullDateLabel(drag.originEnd));
    }

    async function commitGesture(drag) {
      const changed = drag.nextStart !== drag.originStart || drag.nextEnd !== drag.originEnd;
      if (!changed) return;
      const task = drag.task;
      const failedValues = {
        title: task.title || "",
        startDate: drag.nextStart,
        endDate: drag.nextEnd,
        notes: task.notes || ""
      };
      busy = true;
      refreshStatus();
      try {
        if (drag.mode === "move") await model.moveProductionTask(task.id, drag.nextStart);
        else await model.updateProductionTask(task.id, drag.mode === "resize-start"
          ? { startDate: drag.nextStart }
          : { endDate: drag.nextEnd });
        announce("日期已保存；這次手勢只建立一筆命令。", false);
      } catch (error) {
        createDraft("edit", task, failedValues, true, error || makeError("SAVE_FAILED", "日期保存失敗。"));
        announce("日期未保存；原排程保留，草稿預覽仍可編輯或重試：" + (error && error.message ? error.message : String(error)), true);
      } finally {
        busy = false;
        render();
        if (drag.focusControl && typeof root.querySelectorAll === "function") {
          const control = Array.from(root.querySelectorAll("[data-action]")).find((item) => item.dataset.action === drag.focusControl.action && item.dataset.taskId === drag.focusControl.taskId);
          if (control && typeof control.focus === "function") control.focus();
        }
      }
    }

    function closest(element, selector) {
      return element && typeof element.closest === "function" ? element.closest(selector) : null;
    }

    function onClick(event) {
      const target = event.target;
      if (suppressTimelineRowClick) {
        suppressTimelineRowClick = false;
        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
        return;
      }
      const actionElement = closest(target, "[data-action]");
      const action = actionElement && actionElement.dataset ? actionElement.dataset.action : null;
      if (suppressClick && actionElement) {
        const matchesTask = actionElement.dataset.taskId && actionElement.dataset.taskId === suppressClickTaskId;
        const matchesDay = actionElement.dataset.dayId && actionElement.dataset.dayId === suppressClickDayId;
        if (matchesTask || matchesDay) {
          suppressClick = false;
          suppressClickTaskId = null;
          suppressClickDayId = null;
          return;
        }
      }
      if (activeDrag || activeMarkerDrag || activeTimelineRowDrag) return;
      if (action === "select-shooting-day") {
        event.preventDefault();
        selectShootingDay(actionElement.dataset.dayId);
        return;
      }
      if (action === "close") { requestClose(); return; }
      if (action === "add-task") {
        if (!canStartNewDraft()) return;
        createDraft("add", null, { startDate: localToday(), endDate: localToday() }, false, null);
        const titleInput = editorHost.querySelector ? editorHost.querySelector("[data-field='title']") : null;
        if (titleInput && typeof titleInput.focus === "function") titleInput.focus();
        return;
      }
      if (action === "today") { scrollToToday(); return; }
      if (action === "zoom-in" || action === "zoom-out") {
        const before = scroll.scrollLeft || 0;
        dayWidth = Math.max(64, Math.min(112, dayWidth + (action === "zoom-in" ? 8 : -8)));
        drawGrid();
        scroll.scrollLeft = before * (dayWidth / Math.max(1, dayWidth + (action === "zoom-in" ? -8 : 8)));
        refreshStatus();
        return;
      }
      if (action === "edit-task") {
        const task = taskById(actionElement.dataset.taskId);
        if (!task) return;
        if (editorDraft && editorDraft.taskId === task.id && isDraftDirty(editorDraft)) return;
        if (editorDraft && isDraftDirty(editorDraft) && !canStartNewDraft()) return;
        openTaskEditor(task);
        return;
      }
      if (action === "edit-task-bar") {
        const task = taskById(actionElement.dataset.taskId);
        if (!task) return;
        if (editorDraft && isDraftDirty(editorDraft) && editorDraft.taskId !== task.id && !canStartNewDraft()) return;
        openTaskEditor(task);
        return;
      }
      if (action === "step-date") {
        if (!editorDraft || !lifecycleWritable()) return;
        const field = actionElement.dataset.field;
        const shifted = addDays(editorDraft.values[field], Number(actionElement.dataset.delta));
        if (shifted) {
          const input = editorHost.querySelector ? editorHost.querySelector("[data-field='" + field + "']") : null;
          if (input) input.value = shifted;
          updateDraftField(field, shifted);
        }
        return;
      }
      if (action === "choose-task-color") {
        if (!editorDraft || editorDraft.taskId !== actionElement.dataset.taskId || !lifecycleWritable()) return;
        updateDraftField("color", actionElement.dataset.color || "");
        render();
        const selected = editorHost.querySelectorAll ? Array.from(editorHost.querySelectorAll("[data-action='choose-task-color']")).find((item) => item.dataset.color === (editorDraft.values.color || "")) : null;
        if (selected && typeof selected.focus === "function") selected.focus();
        return;
      }
      if (action === "move-task-up" || action === "move-task-down") {
        reorderTask(actionElement.dataset.taskId, action === "move-task-up" ? -1 : 1);
        return;
      }
      if (action === "discard-task") {
        if (!editorDraft) return;
        if (isDraftDirty(editorDraft)) { confirmDiscard = true; renderEditor(); }
        else removeDraft();
        return;
      }
      if (action === "confirm-discard") { removeDraft(); announce("草稿已放棄。", false); return; }
      if (action === "cancel-discard") { confirmDiscard = false; renderEditor(); return; }
      if (action === "delete-task") {
        if (!editorDraft || isDraftDirty(editorDraft) || !lifecycleWritable()) return;
        confirmDelete = true;
        renderEditor();
        return;
      }
      if (action === "confirm-delete") { deleteTask(); return; }
      if (action === "cancel-delete") { confirmDelete = false; renderEditor(); return; }
      if (action === "new-at-date") {
        if (!canStartNewDraft()) return;
        const date = actionElement.dataset.date;
        createDraft("add", null, { startDate: date, endDate: date }, false, null);
        const input = editorHost.querySelector ? editorHost.querySelector("[data-field='title']") : null;
        if (input && typeof input.focus === "function") input.focus();
        return;
      }
      if (!action) {
        const emptyCell = closest(target, "[data-new-date]");
        if (emptyCell && !closest(target, "[data-task-bar]") && !closest(target, "[data-action='select-shooting-day']")) {
          if (!canStartNewDraft()) return;
          const date = emptyCell.dataset.date;
          createDraft("add", null, { startDate: date, endDate: date }, false, null);
          const input = editorHost.querySelector ? editorHost.querySelector("[data-field='title']") : null;
          if (input && typeof input.focus === "function") input.focus();
        }
      }
    }

    function onSubmit(event) {
      const form = closest(event.target, "[aria-label='新增製作任務'], [aria-label='編輯製作任務']");
      if (!form) return;
      if (event.preventDefault) event.preventDefault();
      saveDraft();
    }

    function onInput(event) {
      const field = closest(event.target, "[data-field]");
      if (!field || !editorDraft) return;
      updateDraftField(field.dataset.field, field.value);
    }

    function markTimelineRow(index, className, add) {
      if (!grid.querySelectorAll) return;
      Array.from(grid.querySelectorAll("[data-timeline-row-index]")).forEach((element) => {
        if (Number(element.dataset.timelineRowIndex) !== index) return;
        if (add) element.classList.add(className);
        else element.classList.remove(className);
      });
    }

    function clearTimelineRowDrag(drag) {
      if (!drag) return;
      markTimelineRow(drag.sourceIndex, "is-row-reorder-source", false);
      if (drag.targetIndex !== null) markTimelineRow(drag.targetIndex, "is-row-reorder-target", false);
      activeTimelineRowDrag = null;
    }

    function beginTimelineRowGesture(event, rowElement) {
      if (activeDrag || activeTimelineRowDrag || busy) return;
      if (event.button !== undefined && event.button !== 0) return;
      const surface = closest(event.target, ".pt-row-reorder-surface");
      if (!surface) return;
      if (!lifecycleWritable() || !boundProject()) {
        announce(lifecycle && (lifecycle.readOnlyReason || lifecycle.saveStatus) || "目前為唯讀，無法調整時程列順序。", true);
        return;
      }
      if (hasUnsavedDraft()) {
        announce("先保存或放棄目前草稿，才可調整時程列順序。", true);
        return;
      }
      const sourceIndex = Number(rowElement && rowElement.dataset && rowElement.dataset.timelineRowIndex);
      const orderedRows = timelineRowsForState(currentState);
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= orderedRows.length || orderedRows.length < 2) return;
      activeTimelineRowDrag = {
        pointerId: event.pointerId,
        sourceIndex: sourceIndex,
        targetIndex: sourceIndex,
        startX: Number(event.clientX || 0),
        startY: Number(event.clientY || 0),
        moved: false,
        orderedRows: orderedRows,
        sourceKey: timelineRowKey(orderedRows[sourceIndex])
      };
    }

    function previewTimelineRowGesture(event) {
      const drag = activeTimelineRowDrag;
      if (!drag) return;
      if (drag.pointerId !== undefined && event.pointerId !== undefined && drag.pointerId !== event.pointerId) return;
      const dx = Number(event.clientX || 0) - drag.startX;
      const dy = Number(event.clientY || 0) - drag.startY;
      if (!drag.moved) {
        if (Math.abs(dy) < 6 || Math.abs(dy) <= Math.abs(dx)) return;
        drag.moved = true;
        markTimelineRow(drag.sourceIndex, "is-row-reorder-source", true);
      }
      let hitTarget = event.target;
      if (typeof document.elementFromPoint === "function" && Number.isFinite(Number(event.clientX)) && Number.isFinite(Number(event.clientY))) {
        hitTarget = document.elementFromPoint(Number(event.clientX), Number(event.clientY)) || hitTarget;
      }
      const targetRow = closest(hitTarget, "[data-timeline-row-index]");
      const targetIndexFromEvent = targetRow ? Number(targetRow.dataset.timelineRowIndex) : NaN;
      const rowDelta = Math.round(dy / 58);
      const targetIndex = Number.isInteger(targetIndexFromEvent) && targetIndexFromEvent !== drag.sourceIndex
        ? targetIndexFromEvent
        : Math.max(0, Math.min(drag.orderedRows.length - 1, drag.sourceIndex + rowDelta));
      if (drag.targetIndex !== targetIndex) {
        if (drag.targetIndex !== drag.sourceIndex) markTimelineRow(drag.targetIndex, "is-row-reorder-target", false);
        drag.targetIndex = targetIndex;
        if (targetIndex !== drag.sourceIndex) markTimelineRow(targetIndex, "is-row-reorder-target", true);
      }
      const row = drag.orderedRows[drag.sourceIndex];
      const label = row.kind === "shootingDayMarkers" ? "拍攝日標記列" : "任務列";
      const direction = targetIndex < drag.sourceIndex ? "上方" : targetIndex > drag.sourceIndex ? "下方" : "原位置";
      announce(label + "排序預覽 · 目標位置：「" + direction + "」；放開後保存。", false);
    }

    async function finishTimelineRowGesture(event) {
      const drag = activeTimelineRowDrag;
      if (!drag) return;
      if (drag.pointerId !== undefined && event.pointerId !== undefined && drag.pointerId !== event.pointerId) return;
      const targetIndex = drag.targetIndex;
      const moved = drag.moved;
      const sourceIndex = drag.sourceIndex;
      const originalRows = drag.orderedRows;
      clearTimelineRowDrag(drag);
      if (!moved) return;
      suppressTimelineRowClick = true;
      setTimeout(() => { suppressTimelineRowClick = false; }, 0);
      if (targetIndex === sourceIndex) {
        announce("時程列順序沒有改變。", false);
        return;
      }
      const currentRows = timelineRowsForState(currentState);
      if (currentRows.length !== originalRows.length || currentRows.some((row, index) => timelineRowKey(row) !== timelineRowKey(originalRows[index]))) {
        announce("時程資料已更新；列排序已取消，請重新操作。", true);
        render();
        return;
      }
      const reorderedRows = originalRows.slice();
      const movedRow = reorderedRows.splice(sourceIndex, 1)[0];
      reorderedRows.splice(targetIndex, 0, movedRow);
      const label = movedRow.kind === "shootingDayMarkers" ? "拍攝日標記列" : "任務列";
      const direction = targetIndex < sourceIndex ? "上移" : "下移";
      await saveTimelineOrder(reorderedRows, { successMessage: label + "已" + direction + "並保存。" });
    }

    function onPointerDown(event) {
      const target = event.target;
      const marker = closest(target, "[data-action='select-shooting-day']");
      if (marker) {
        startMarkerGesture(event, marker);
        if (activeMarkerDrag) {
          const rowElement = closest(target, "[data-timeline-row-index]");
          if (rowElement) beginTimelineRowGesture(event, rowElement);
        }
        return;
      }
      const actionElement = closest(target, "[data-action='resize-start'], [data-action='resize-end']");
      if (actionElement) {
        startGesture(event, actionElement.dataset.taskId, actionElement.dataset.action);
        return;
      }
      const bar = closest(target, "[data-task-bar]");
      if (bar && !bar.hasAttribute("data-draft-bar")) startGesture(event, bar.dataset.taskId, "move");
      const rowElement = closest(target, "[data-timeline-row-index]");
      if (rowElement) beginTimelineRowGesture(event, rowElement);
    }

    function onPointerMove(event) {
      if (activeTimelineRowDrag && activeMarkerDrag) {
        if (activeTimelineRowDrag.pointerId !== undefined && event.pointerId !== undefined && activeTimelineRowDrag.pointerId !== event.pointerId) return;
        const dx = Number(event.clientX || 0) - activeTimelineRowDrag.startX;
        const dy = Number(event.clientY || 0) - activeTimelineRowDrag.startY;
        if (Math.abs(dy) >= 6 && Math.abs(dy) > Math.abs(dx)) {
          activeMarkerDrag = null;
        } else if (Math.abs(dx) >= 5 && Math.abs(dx) >= Math.abs(dy)) {
          clearTimelineRowDrag(activeTimelineRowDrag);
        }
      }
      if (activeTimelineRowDrag) {
        previewTimelineRowGesture(event);
        return;
      }
      if (activeMarkerDrag) {
        if (activeMarkerDrag.pointerId !== undefined && event.pointerId !== undefined && activeMarkerDrag.pointerId !== event.pointerId) return;
        const markerDx = Number(event.clientX || 0) - activeMarkerDrag.startX;
        if (Math.abs(markerDx) >= 5) activeMarkerDrag.moved = true;
        if (!activeMarkerDrag.moved) return;
        const markerDelta = Math.round(markerDx / dayWidth);
        previewMarkerDate(activeMarkerDrag, markerDelta);
        const markerMessage = "拍攝日預覽 · " + (activeMarkerDrag.day.title || "拍攝日") + " · " + fullDateLabel(activeMarkerDrag.nextDate) + (activeMarkerDrag.clamped ? "；已限制在目前可見日期範圍" : "") + "；放開後才提交。";
        if (!messageText || !messageText.startsWith("拍攝日預覽")) announce(markerMessage, false);
        else setText(message, markerMessage);
        return;
      }
      if (!activeDrag) return;
      if (activeDrag.pointerId !== undefined && event.pointerId !== undefined && activeDrag.pointerId !== event.pointerId) return;
      const dx = Number(event.clientX || 0) - activeDrag.startX;
      if (Math.abs(dx) >= 5) activeDrag.moved = true;
      if (!activeDrag.moved) return;
      const delta = Math.round(dx / dayWidth);
      dragDates(activeDrag, delta);
      const dragMessage = "日期預覽 · " + fullDateLabel(activeDrag.nextStart) + " 至 " + fullDateLabel(activeDrag.nextEnd) + (activeDrag.clamped ? "；已限制在目前可見日期範圍" : "") + "；放開後才提交。";
      if (!messageText || !messageText.startsWith("日期預覽")) announce(dragMessage, false);
      else setText(message, dragMessage);
    }

    function onPointerUp(event) {
      if (activeTimelineRowDrag && activeMarkerDrag) {
        if (activeTimelineRowDrag.pointerId !== undefined && event.pointerId !== undefined && activeTimelineRowDrag.pointerId !== event.pointerId) return;
        if (activeTimelineRowDrag.moved) activeMarkerDrag = null;
        else clearTimelineRowDrag(activeTimelineRowDrag);
      }
      if (activeTimelineRowDrag) {
        void finishTimelineRowGesture(event);
        return;
      }
      if (activeMarkerDrag) {
        if (activeMarkerDrag.pointerId !== undefined && event.pointerId !== undefined && activeMarkerDrag.pointerId !== event.pointerId) return;
        const markerDrag = activeMarkerDrag;
        activeMarkerDrag = null;
        if (!markerDrag.moved) return;
        suppressClick = true;
        suppressClickDayId = markerDrag.day.id;
        suppressClickTaskId = null;
        setTimeout(() => { suppressClick = false; suppressClickTaskId = null; suppressClickDayId = null; }, 0);
        if (markerDrag.nextDate === markerDrag.originDate) {
          restoreMarkerPreview(markerDrag);
          announce("拍攝日期沒有改變。", false);
          return;
        }
        if (markerDrag.marker) markerDrag.marker.classList.remove("is-drag-preview");
        commitMarkerGesture(markerDrag);
        return;
      }
      if (!activeDrag) return;
      if (activeDrag.pointerId !== undefined && event.pointerId !== undefined && activeDrag.pointerId !== event.pointerId) return;
      const drag = activeDrag;
      activeDrag = null;
      if (!drag.moved) return;
      const changed = drag.nextStart !== drag.originStart || drag.nextEnd !== drag.originEnd;
      if (!changed) { restoreDragPreview(drag); announce("日期沒有改變。", false); return; }
      if (drag.bar) drag.bar.classList.remove("is-drag-preview");
      suppressClick = true;
      suppressClickTaskId = drag.task.id;
      suppressClickDayId = null;
      setTimeout(() => { suppressClick = false; suppressClickTaskId = null; suppressClickDayId = null; }, 0);
      commitGesture(drag);
    }

    function onPointerCancel(event) {
      if (activeTimelineRowDrag && activeMarkerDrag) {
        if (activeTimelineRowDrag.pointerId !== undefined && event.pointerId !== undefined && activeTimelineRowDrag.pointerId !== event.pointerId) return;
        const rowDrag = activeTimelineRowDrag;
        const markerDrag = activeMarkerDrag;
        clearTimelineRowDrag(rowDrag);
        activeMarkerDrag = null;
        restoreMarkerPreview(markerDrag);
        render();
        announce("拍攝日期與時程列預覽已取消；資料未更動。", false);
        return;
      }
      if (activeTimelineRowDrag) {
        const drag = activeTimelineRowDrag;
        if (drag.pointerId !== undefined && event.pointerId !== undefined && drag.pointerId !== event.pointerId) return;
        clearTimelineRowDrag(drag);
        render();
        announce("時程列排序已取消；資料未更動。", false);
        return;
      }
      if (activeMarkerDrag) {
        if (activeMarkerDrag.pointerId !== undefined && event.pointerId !== undefined && activeMarkerDrag.pointerId !== event.pointerId) return;
        restoreMarkerPreview(activeMarkerDrag);
        activeMarkerDrag = null;
        announce("拍攝日期預覽已取消；排程未更動。", false);
        return;
      }
      if (!activeDrag) return;
      if (activeDrag.pointerId !== undefined && event.pointerId !== undefined && activeDrag.pointerId !== event.pointerId) return;
      restoreDragPreview(activeDrag);
      activeDrag = null;
      announce("日期預覽已取消；排程未更動。", false);
    }

    async function keyboardDateChange(taskId, mode, delta) {
      if (!lifecycleWritable() || hasUnsavedDraft()) return;
      const task = taskById(taskId);
      if (!task) return;
      const drag = {
        task: Object.assign({}, task),
        mode: mode,
        originStart: task.startDate,
        originEnd: task.endDate,
        nextStart: task.startDate,
        nextEnd: task.endDate,
        bar: null,
        focusControl: { action: mode === "move" ? "edit-task-bar" : mode, taskId: taskId }
      };
      dragDates(drag, delta);
      await commitGesture(drag);
    }

    function onKeyDown(event) {
      const target = event.target;
      const actionElement = closest(target, "[data-action='resize-start'], [data-action='resize-end']");
      if (actionElement && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        if (event.preventDefault) event.preventDefault();
        keyboardDateChange(actionElement.dataset.taskId, actionElement.dataset.action, event.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      const bar = closest(target, "[data-task-bar]");
      if (bar && !bar.hasAttribute("data-draft-bar") && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        if (event.preventDefault) event.preventDefault();
        keyboardDateChange(bar.dataset.taskId, "move", event.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (event.key === "Escape" && editorDraft && !busy) {
        if (isDraftDirty(editorDraft)) { confirmDiscard = true; renderEditor(); }
        else removeDraft();
      }
    }

    root.addEventListener("click", onClick);
    root.addEventListener("submit", onSubmit);
    root.addEventListener("input", onInput);
    root.addEventListener("change", onInput);
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerCancel);
    root.addEventListener("keydown", onKeyDown);

    const unsubscribeData = model.subscribe((state, event) => {
      currentState = state;
      if (event && event.projectId && event.projectId !== projectId && hasUnsavedDraft()) {
        notifyDraft();
        announce("已切換專案；原專案的未保存時程草稿仍保留。", true);
      }
      reconcileFailedDraft(state);
      render(true);
    });
    const unsubscribeLifecycle = typeof model.subscribeLifecycle === "function" ? model.subscribeLifecycle((next) => {
      const previous = lifecycleSignature(lifecycle);
      lifecycle = next || lifecycle;
      if (previous === lifecycleSignature(lifecycle)) refreshStatus();
      else render();
    }) : null;

    if (opts.initialDraft) {
      const restored = readDraftValues(opts.initialDraft);
      if (restored && (!opts.initialDraft.projectId || opts.initialDraft.projectId === projectId)) {
        editorDraft = restored;
        announce("已還原上一筆未保存的製作時程草稿。", true);
        reconcileFailedDraft(currentState);
      }
    }
    render();

    function destroy() {
      if (destroyed) return true;
      if (hasUnsavedDraft()) {
        if (!onDraftChange) {
          announce("尚有未保存草稿；已保留此元件。請先保存、放棄草稿或接上宿主草稿保存 callback。", true);
          return false;
        }
        if (!notifyDraft()) return false;
      }
      destroyed = true;
      if (typeof unsubscribeData === "function") unsubscribeData();
      if (typeof unsubscribeLifecycle === "function") unsubscribeLifecycle();
      root.removeEventListener("click", onClick);
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("input", onInput);
      root.removeEventListener("change", onInput);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerCancel);
      root.removeEventListener("keydown", onKeyDown);
      if (root.parentNode) root.parentNode.removeChild(root);
      return true;
    }

    return {
      destroy: destroy,
      render: render,
      getDraft: function () {
        return editorDraft ? {
          namespace: namespaceFor(editorDraft),
          projectId: projectId,
          kind: editorDraft.kind,
          taskId: editorDraft.taskId,
          values: Object.assign({}, editorDraft.values),
          dirty: isDraftDirty(editorDraft),
          error: editorDraft.error ? { code: editorDraft.error.code || "SAVE_FAILED", message: editorDraft.error.message || String(editorDraft.error) } : null
        } : null;
      },
      element: root
    };
  }

  return { mount: mount, parseDate: parseDate, addDays: addDays };
});
