(function attachDrawingEditor(root, factory) {
  "use strict";
  const renderer = root && root.DirectorStoryboardRenderer ||
    (typeof module === "object" && module && typeof require === "function" ? require("./storyboard-renderer.js") : null);
  const api = factory(renderer);
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DirectorStoryboardDrawingEditor = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function createDrawingEditor(storyboardRenderer) {
  "use strict";

  const CANONICAL_CANVASES = Object.freeze({
    "1:1": Object.freeze({ width: 1920, height: 1920 }),
    "4:3": Object.freeze({ width: 1920, height: 1440 }),
    "16:9": Object.freeze({ width: 1920, height: 1080 }),
    "2.35:1": Object.freeze({ width: 2350, height: 1000 })
  });

  function getCanonicalCanvasSize(aspectRatio) {
    const size = CANONICAL_CANVASES[aspectRatio];
    if (!size) throw new RangeError("不支援的 Drawing 畫幅：" + aspectRatio);
    return { width: size.width, height: size.height };
  }

  function fitContain(viewWidth, viewHeight, canvasWidth, canvasHeight) {
    [viewWidth, viewHeight, canvasWidth, canvasHeight].forEach(function (value) {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new RangeError("fitContain 尺寸必須是正的有限數字。");
      }
    });
    const scale = Math.min(viewWidth / canvasWidth, viewHeight / canvasHeight);
    const width = canvasWidth * scale;
    const height = canvasHeight * scale;
    return { x: (viewWidth - width) / 2, y: (viewHeight - height) / 2, width: width, height: height, scale: scale };
  }

  function clientToNormalized(clientX, clientY, rect) {
    if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) return null;
    const x = (clientX - rect.x) / rect.width;
    const y = (clientY - rect.y) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x: x, y: y };
  }

  function pointToCanvas(point, canvasWidth, canvasHeight) {
    return { x: point.x * canvasWidth, y: point.y * canvasHeight };
  }

  function midpoint(first, second) {
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }

  function distanceBetween(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
  }

  function hitTestStroke(stroke, normalizedPoint, canvas, toleranceCanvasPx) {
    if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 2) return false;
    const point = pointToCanvas(normalizedPoint, canvas.width, canvas.height);
    const radius = Math.max(0, toleranceCanvasPx || 0) + Number(stroke.baseWidth || 0) / 2;
    for (let index = 1; index < stroke.points.length; index += 1) {
      if (distanceToSegment(point, pointToCanvas(stroke.points[index - 1], canvas.width, canvas.height), pointToCanvas(stroke.points[index], canvas.width, canvas.height)) <= radius) return true;
    }
    return false;
  }

  function createLatestPromiseSlot() {
    let generation = 0;
    let promise = null;
    return {
      begin: function (operation) {
        if (typeof operation !== "function") throw new TypeError("request operation 必須是函式。");
        const requestGeneration = ++generation;
        let trackedPromise;
        trackedPromise = Promise.resolve().then(function () { return operation(requestGeneration); }).finally(function () {
          if (generation === requestGeneration && promise === trackedPromise) promise = null;
        });
        promise = trackedPromise;
        return { generation: requestGeneration, promise: trackedPromise };
      },
      invalidate: function () {
        generation += 1;
        promise = null;
        return generation;
      },
      isCurrent: function (requestGeneration) { return generation === requestGeneration; },
      get generation() { return generation; },
      get promise() { return promise; }
    };
  }

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, className) {
    const node = create("button", className || "", label);
    node.type = "button";
    node.setAttribute("aria-label", label);
    return node;
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function createDraftDrawing(projectId, shotId, aspectRatio, backgroundAssetId, backgroundCrop) {
    const size = getCanonicalCanvasSize(aspectRatio);
    const id = "draft:" + String(projectId || "project") + ":" + String(shotId || "shot");
    return {
      projectId: projectId,
      id: id,
      schemaVersion: 2,
      shotId: shotId,
      canvas: { aspectRatio: aspectRatio, width: size.width, height: size.height },
      backgroundAssetId: backgroundAssetId || null,
      backgroundCrop: backgroundCrop || null,
      revision: 0,
      previewAssetId: null,
      previewDrawingRevision: null,
      layers: [
        { projectId: projectId, drawingId: id, id: id + ":scene", kind: "scene", visible: true, locked: false, opacity: 1, order: 0, strokes: [] },
        { projectId: projectId, drawingId: id, id: id + ":subject", kind: "subject", visible: true, locked: false, opacity: 1, order: 1, strokes: [] }
      ]
    };
  }

  function DrawingEditor(container, options) {
    if (!container || typeof container.appendChild !== "function") throw new TypeError("mount(container, options) 需要一個 DOM 容器。");
    const opts = options || {};
    this.container = container;
    this.model = opts.model || opts.store || null;
    this.readDrawing = typeof opts.getDrawing === "function"
      ? opts.getDrawing
      : this.model && typeof this.model.getDrawing === "function"
        ? this.model.getDrawing.bind(this.model)
        : null;
    this.loadBackground = typeof opts.loadBackground === "function" ? opts.loadBackground : null;
    this.onBack = typeof opts.onBack === "function" ? opts.onBack : null;
    this.onStateChange = typeof opts.onStateChange === "function" ? opts.onStateChange : null;
    this.shotLabel = opts.shotLabel || "目前鏡頭";
    this.isDraft = Boolean(opts.draft);
    this.initialDrawing = this.isDraft ? null : clone(opts.drawing || (opts.drawingId ? { id: opts.drawingId } : null));
    this.capturedProjectId = opts.projectId || this.initialDrawing && this.initialDrawing.projectId || null;
    this.capturedShotId = opts.shotId || this.initialDrawing && this.initialDrawing.shotId || null;
    this.defaultBackgroundCropOverride = opts.defaultBackgroundCrop === undefined
      ? undefined
      : storyboardRenderer.copyBackgroundCrop(opts.defaultBackgroundCrop);
    this.drawing = this.isDraft
      ? createDraftDrawing(this.capturedProjectId, this.capturedShotId, opts.aspectRatio || "16:9", opts.defaultBackgroundAssetId,
        this.resolveDraftBackgroundCrop(opts.defaultBackgroundAssetId))
      : this.initialDrawing;
    this.writableOverride = typeof opts.writable === "boolean" ? opts.writable : null;
    this.readOnlyReason = opts.readOnlyReason || "尚未確認可編輯狀態。";
    this.writable = false;
    this.layerId = null;
    this.tool = "pen";
    this.inputMode = "pen";
    this.touchPointers = new Map();
    this.touchGesture = null;
    this.touchEraserCandidate = null;
    this.viewTransform = { scale: 1, x: 0, y: 0 };
    this.color = opts.color || "#e94f3d";
    this.baseWidth = Number.isFinite(opts.baseWidth) && opts.baseWidth > 0 ? opts.baseWidth : 8;
    this.mode = "focus";
    this.activeStroke = null;
    this.eraserPointer = null;
    this.pendingOperation = null;
    this.drawingBusy = false;
    this.backgroundAssetId = undefined;
    this.backgroundImage = null;
    this.backgroundReady = false;
    this.backgroundRequests = createLatestPromiseSlot();
    this.backgroundObjectUrl = null;
    this.backgroundFailure = null;
    this.backgroundPreviewRequests = createLatestPromiseSlot();
    this.backgroundPreviewObjectUrl = null;
    this.backgroundPreviewAsset = null;
    this.backgroundPreviewReady = false;
    this.drawingRefreshRequests = createLatestPromiseSlot();
    this.sceneReusePreview = null;
    this.statusText = "正在載入手繪內容";
    this.statusKind = "loading";
    this.destroyed = false;
    this.unsubscribeData = null;
    this.unsubscribeLifecycle = null;
    this.resizeObserver = null;
    this.listeners = [];
    this.build();
    this.bind();
    this.refreshLifecycle();
    this.refreshDrawing().catch(this.showLoadError.bind(this));
    this.observeSize();
  }

  DrawingEditor.prototype.createBackgroundPreviewPanel = function (heading, altText) {
    const panel = create("section", "ds-de-background-panel");
    Object.assign(panel.style, {
      border: "1px solid #d8dee8",
      borderRadius: "10px",
      minWidth: "0",
      padding: "10px"
    });
    const title = create("h4", "", heading);
    title.style.margin = "0 0 4px";
    const image = document.createElement("img");
    image.alt = altText;
    image.hidden = true;
    Object.assign(image.style, {
      background: "#f2f4f7",
      border: "1px solid #d8dee8",
      borderRadius: "8px",
      display: "block",
      maxHeight: "min(50vh, 360px)",
      maxWidth: "100%",
      objectFit: "contain"
    });
    const message = create("p", "", "無照片底圖");
    message.style.margin = "7px 0 0";
    message.style.minHeight = "1.5em";
    panel.append(title, image, message);
    return { panel: panel, image: image, message: message };
  };

  DrawingEditor.prototype.createSceneReusePreviewPanel = function (heading) {
    const panel = create("section", "ds-de-reuse-panel");
    panel.style.border = "1px solid #d8dee8";
    panel.style.borderRadius = "10px";
    panel.style.minWidth = "0";
    panel.style.padding = "10px";
    const title = create("h4", "", heading);
    title.style.margin = "0 0 4px";
    const label = create("p", "ds-de-reuse-shot-label", "");
    label.style.margin = "0 0 8px";
    label.style.minHeight = "2.8em";
    const canvas = document.createElement("canvas");
    canvas.width = 540;
    canvas.height = 304;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", heading + "的場景筆跡預覽");
    canvas.style.aspectRatio = "540 / 304";
    canvas.style.background = "#f2f4f7";
    canvas.style.border = "1px solid #d8dee8";
    canvas.style.borderRadius = "8px";
    canvas.style.display = "block";
    canvas.style.height = "auto";
    canvas.style.maxWidth = "100%";
    const count = create("p", "ds-de-reuse-stroke-count", "");
    count.style.margin = "7px 0 0";
    panel.append(title, label, canvas, count);
    return { heading: heading, panel: panel, label: label, canvas: canvas, count: count };
  };

  DrawingEditor.prototype.listen = function (target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.listeners.push(function () { target.removeEventListener(type, handler, options); });
  };

  DrawingEditor.prototype.build = function () {
    const shell = create("section", "ds-drawing-editor");
    shell.setAttribute("aria-label", "分鏡手繪編輯器");
    this.shell = shell;
    this.changeBackgroundButton = button("更換照片底圖", "ds-de-change-background");
    this.changeBackgroundButton.setAttribute("aria-haspopup", "dialog");

    const header = create("header", "ds-de-header");
    this.backButton = button("返回鏡頭", "ds-de-back");
    this.backButton.hidden = !this.onBack;
    this.title = create("div", "ds-de-title");
    this.title.appendChild(create("h2", "", "分鏡手繪"));
    this.context = create("p", "", this.shotLabel);
    this.title.appendChild(this.context);
    this.status = create("div", "ds-de-status", this.statusText);
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.status.setAttribute("aria-atomic", "true");
    this.retryButton = button("重試保存", "ds-de-retry");
    this.discardButton = button("取消未保存筆畫", "ds-de-discard");
    this.reloadButton = button("重試讀取", "ds-de-reload");
    this.retryButton.hidden = true;
    this.discardButton.hidden = true;
    this.reloadButton.hidden = true;
    this.headerActions = create("div", "ds-de-header-actions");
    this.headerActions.hidden = true;
    this.headerActions.append(this.retryButton, this.discardButton, this.reloadButton);
    header.append(this.backButton, this.title, this.status, this.headerActions);
    shell.appendChild(header);

    this.controls = create("div", "ds-de-controls");
    this.layerGroup = create("div", "ds-de-control-group");
    this.layerGroup.appendChild(create("span", "ds-de-label", "作用圖層"));
    this.layerButtons = new Map();
    this.layerStateButtons = new Map();
    [
      { kind: "scene", label: "場景" },
      { kind: "subject", label: "人物動作" }
    ].forEach(function (layer) {
      const control = button(layer.label, "ds-de-choice");
      control.dataset.layerKind = layer.kind;
      this.layerButtons.set(layer.kind, control);
      this.layerGroup.appendChild(control);
    }, this);

    this.layerStateGroup = create("div", "ds-de-control-group");
    this.layerStateGroup.appendChild(create("span", "ds-de-label", "圖層設定"));
    [
      { kind: "scene", label: "場景" },
      { kind: "subject", label: "人物動作" }
    ].forEach(function (layer) {
      const visibility = button("隱藏 " + layer.label, "ds-de-choice");
      const lock = button("鎖定 " + layer.label, "ds-de-choice");
      visibility.dataset.layerVisibilityKind = layer.kind;
      lock.dataset.layerLockKind = layer.kind;
      this.layerStateButtons.set(layer.kind, { visibility: visibility, lock: lock });
      this.layerStateGroup.append(visibility, lock);
    }, this);
    this.clearLayerButton = button("清空作用圖層", "ds-de-utility");
    this.layerStateGroup.appendChild(this.clearLayerButton);

    this.sceneReuseGroup = create("div", "ds-de-control-group");
    this.sceneReuseGroup.style.flex = "1 1 100%";
    this.sceneReuseGroup.appendChild(create("span", "ds-de-label", "沿用場景"));
    this.sceneReuseSelect = document.createElement("select");
    this.sceneReuseSelect.setAttribute("aria-label", "選擇先前鏡頭的場景圖層來源");
    this.sceneReuseSelect.style.background = "#fff";
    this.sceneReuseSelect.style.border = "1px solid var(--ds-de-line)";
    this.sceneReuseSelect.style.borderRadius = "8px";
    this.sceneReuseSelect.style.minHeight = "44px";
    this.sceneReuseSelect.style.maxWidth = "min(420px, 100%)";
    this.sceneReuseSelect.style.padding = "6px 9px";
    this.sceneReuseButton = button("預覽場景複製…", "ds-de-utility");
    this.sceneReuseStatus = create("span", "ds-de-reuse-status", "選擇另一個鏡頭的場景圖層；人物動作與照片會保留。");
    this.sceneReuseStatus.setAttribute("role", "status");
    this.sceneReuseStatus.setAttribute("aria-live", "polite");
    this.sceneReuseGroup.append(this.sceneReuseSelect, this.sceneReuseButton, this.sceneReuseStatus);

    this.toolGroup = create("div", "ds-de-control-group");
    this.toolGroup.appendChild(create("span", "ds-de-label", "工具"));
    this.toolButtons = new Map();
    [
      { id: "pen", label: "自由筆" },
      { id: "cameraArrow", label: "運鏡箭頭" },
      { id: "eraser", label: "逐筆橡皮" }
    ].forEach(function (tool) {
      const control = button(tool.label, "ds-de-choice");
      control.dataset.tool = tool.id;
      this.toolButtons.set(tool.id, control);
      this.toolGroup.appendChild(control);
    }, this);

    this.colorLabel = create("label", "ds-de-control-group ds-de-color-label");
    this.colorLabel.appendChild(create("span", "ds-de-label", "筆色"));
    this.colorInput = document.createElement("input");
    this.colorInput.type = "color";
    this.colorInput.value = this.color;
    this.colorInput.setAttribute("aria-label", "新筆畫顏色");
    this.colorLabel.appendChild(this.colorInput);

    this.widthLabel = create("label", "ds-de-control-group ds-de-width-label");
    this.widthLabel.appendChild(create("span", "ds-de-label", "線寬"));
    this.widthInput = document.createElement("input");
    this.widthInput.type = "range";
    this.widthInput.min = "1";
    this.widthInput.max = "80";
    this.widthInput.step = "1";
    this.widthInput.value = String(Math.round(this.baseWidth));
    this.widthInput.setAttribute("aria-label", "新筆畫線寬，像素");
    this.widthValue = create("output", "ds-de-width-value", this.widthInput.value + " px");
    this.widthLabel.append(this.widthInput, this.widthValue);

    this.inputLabel = create("label", "ds-de-control-group ds-de-input-label");
    this.inputLabel.appendChild(create("span", "ds-de-label", "輸入方式"));
    this.inputSelect = document.createElement("select");
    this.inputSelect.setAttribute("aria-label", "畫布輸入方式");
    [
      ["pen", "筆優先（手指停用）"],
      ["touch", "手指／滑鼠繪圖"]
    ].forEach(function (entry) {
      const option = document.createElement("option");
      option.value = entry[0];
      option.textContent = entry[1];
      this.inputSelect.appendChild(option);
    }, this);
    this.inputLabel.appendChild(this.inputSelect);

    this.modeGroup = create("div", "ds-de-control-group ds-de-mode-group");
    this.modeGroup.appendChild(create("span", "ds-de-label", "檢視"));
    this.focusButton = button("專注畫布", "ds-de-choice");
    this.splitButton = button("參考並排", "ds-de-choice");
    this.modeGroup.append(this.focusButton, this.splitButton);
    this.modeGroup.appendChild(this.changeBackgroundButton);

    this.zoomGroup = create("div", "ds-de-control-group ds-de-zoom-group");
    this.zoomGroup.appendChild(create("span", "ds-de-label", "畫布檢視"));
    this.zoomOutButton = button("縮小", "ds-de-choice");
    this.zoomInButton = button("放大", "ds-de-choice");
    this.fitCanvasButton = button("適合畫布", "ds-de-choice");
    this.zoomGroup.append(this.zoomOutButton, this.zoomInButton, this.fitCanvasButton);

    this.historyGroup = create("div", "ds-de-control-group ds-de-history");
    this.undoButton = button("復原上一筆", "ds-de-utility");
    this.redoButton = button("重做上一筆", "ds-de-utility");
    this.historyGroup.append(this.undoButton, this.redoButton);
    this.controls.append(this.layerGroup, this.layerStateGroup, this.sceneReuseGroup, this.toolGroup, this.colorLabel, this.widthLabel, this.inputLabel, this.modeGroup, this.zoomGroup, this.historyGroup);
    shell.appendChild(this.controls);

    this.sceneReuseDialog = create("dialog", "ds-de-reuse-dialog");
    this.sceneReuseDialog.setAttribute("aria-labelledby", "ds-de-reuse-heading");
    Object.assign(this.sceneReuseDialog.style, {
      border: "1px solid #cbd3df",
      borderRadius: "14px",
      boxShadow: "0 18px 64px rgba(20, 30, 48, .28)",
      color: "#1f2734",
      maxHeight: "min(88vh, 780px)",
      maxWidth: "min(820px, calc(100vw - 24px))",
      overflow: "auto",
      padding: "18px",
      width: "min(820px, calc(100vw - 24px))"
    });
    this.sceneReuseDialogTitle = create("h3", "", "複製場景圖層預覽");
    this.sceneReuseDialogTitle.id = "ds-de-reuse-heading";
    this.sceneReuseDialogTitle.style.margin = "0 0 6px";
    this.sceneReuseDialogDescription = create("p", "", "確認後會以來源場景取代目標場景，目標人物動作與照片底圖保留。這是一筆可撤銷操作。");
    this.sceneReuseDialogDescription.style.margin = "0 0 14px";
    this.sceneReusePanels = create("div", "ds-de-reuse-panels");
    this.sceneReusePanels.style.display = "grid";
    this.sceneReusePanels.style.gap = "12px";
    this.sceneReusePanels.style.gridTemplateColumns = "repeat(auto-fit, minmax(min(100%, 280px), 1fr))";
    this.sceneReuseSourcePanel = this.createSceneReusePreviewPanel("來源場景");
    this.sceneReuseTargetPanel = this.createSceneReusePreviewPanel("目前目標場景");
    this.sceneReusePanels.append(this.sceneReuseSourcePanel.panel, this.sceneReuseTargetPanel.panel);
    this.sceneReuseDifference = create("p", "ds-de-reuse-difference", "");
    this.sceneReuseDifference.style.margin = "12px 0";
    this.sceneReuseDifference.setAttribute("role", "status");
    this.sceneReuseDialogActions = create("div", "ds-de-reuse-actions");
    this.sceneReuseDialogActions.style.display = "flex";
    this.sceneReuseDialogActions.style.flexWrap = "wrap";
    this.sceneReuseDialogActions.style.gap = "8px";
    this.sceneReuseDialogActions.style.justifyContent = "flex-end";
    this.sceneReuseCancelButton = button("取消複製", "ds-de-utility");
    this.sceneReuseConfirmButton = button("套用來源場景", "ds-de-utility");
    this.sceneReuseDialogActions.append(this.sceneReuseCancelButton, this.sceneReuseConfirmButton);
    this.sceneReuseDialog.append(this.sceneReuseDialogTitle, this.sceneReuseDialogDescription, this.sceneReusePanels, this.sceneReuseDifference, this.sceneReuseDialogActions);
    shell.appendChild(this.sceneReuseDialog);

    const hint = create("p", "ds-de-hint", "兩指可縮放／平移，也可用畫布檢視按鈕。照片僅供參考；壓力感應尚未啟用。");
    this.hint = hint;
    shell.appendChild(hint);

    this.workspace = create("div", "ds-de-workspace ds-de-focus");
    this.stage = create("div", "ds-de-stage");
    this.canvas = document.createElement("canvas");
    this.canvas.className = "ds-de-canvas";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", this.shotLabel + "；場景圖層；自由筆；筆優先輸入。照片為鎖定參考");
    this.canvasInstructions = create("span", "ds-de-sr-only", this.canvas.getAttribute("aria-label"));
    this.stageBadge = create("span", "ds-de-stage-badge", "鎖定照片底圖");
    this.stage.append(this.canvas, this.stageBadge);
    this.reference = create("aside", "ds-de-reference");
    this.referenceTitle = create("h3", "", "鎖定照片底圖");
    this.referenceMessage = create("p", "", "正在載入照片…");
    this.retryBackgroundButton = button("重試底圖讀取", "ds-de-reload-background");
    this.retryBackgroundButton.hidden = true;
    this.referenceImage = document.createElement("img");
    this.referenceImage.alt = "鎖定照片參考，唯讀";
    this.referenceImage.hidden = true;
    this.reference.append(this.referenceTitle, this.referenceImage, this.referenceMessage, this.retryBackgroundButton);
    this.workspace.append(this.stage, this.reference);
    shell.appendChild(this.workspace);

    this.backgroundChangeDialog = create("dialog", "ds-de-background-dialog");
    this.backgroundChangeDialog.setAttribute("aria-labelledby", "ds-de-background-heading");
    Object.assign(this.backgroundChangeDialog.style, {
      border: "1px solid #cbd3df",
      borderRadius: "14px",
      boxShadow: "0 18px 64px rgba(20, 30, 48, .28)",
      color: "#1f2734",
      maxHeight: "min(88vh, 780px)",
      maxWidth: "min(900px, calc(100vw - 24px))",
      overflow: "auto",
      padding: "18px",
      width: "min(900px, calc(100vw - 24px))"
    });
    this.backgroundChangeDialogTitle = create("h3", "", "更換手繪照片底圖");
    this.backgroundChangeDialogTitle.id = "ds-de-background-heading";
    this.backgroundChangeDialogTitle.style.margin = "0 0 6px";
    this.backgroundChangeDescription = create("p", "", "比較面板顯示原始照片，不套用 Drawing 裁切。確認更換會以完整新原圖作為底圖並清除舊裁切；既有筆跡與畫布座標不變。只有按「確認更換底圖」後才會保存。");
    this.backgroundChangeDescription.style.margin = "0 0 12px";
    this.backgroundAssetSelect = document.createElement("select");
    this.backgroundAssetSelect.setAttribute("aria-label", "選擇新的照片底圖");
    Object.assign(this.backgroundAssetSelect.style, {
      background: "#fff",
      border: "1px solid var(--ds-de-line)",
      borderRadius: "8px",
      minHeight: "44px",
      maxWidth: "100%",
      padding: "6px 9px",
      width: "100%"
    });
    this.backgroundChangePanels = create("div", "ds-de-background-panels");
    Object.assign(this.backgroundChangePanels.style, {
      display: "grid",
      gap: "12px",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
      marginTop: "12px"
    });
    this.backgroundBeforePanel = this.createBackgroundPreviewPanel("目前底圖原圖（未套用裁切）", "目前 Drawing 的原始照片；Drawing 裁切只在主畫布與輸出呈現");
    this.backgroundAfterPanel = this.createBackgroundPreviewPanel("候選原圖（未裁切）", "候選原始照片；不套用目前 Drawing 裁切");
    this.backgroundChangePanels.append(this.backgroundBeforePanel.panel, this.backgroundAfterPanel.panel);
    this.backgroundChangeStatus = create("p", "ds-de-background-status", "候選預覽為完整原圖；確認更換後會清除舊裁切並保留筆跡。取消不會寫入資料。");
    this.backgroundChangeStatus.setAttribute("role", "status");
    this.backgroundChangeStatus.setAttribute("aria-live", "polite");
    this.backgroundChangeActions = create("div", "ds-de-background-actions");
    Object.assign(this.backgroundChangeActions.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      justifyContent: "flex-end",
      marginTop: "12px"
    });
    this.backgroundChangeCancelButton = button("取消底圖更換", "ds-de-utility");
    this.backgroundChangeConfirmButton = button("確認更換底圖", "ds-de-utility");
    this.backgroundChangeActions.append(this.backgroundChangeCancelButton, this.backgroundChangeConfirmButton);
    this.backgroundChangeDialog.append(this.backgroundChangeDialogTitle, this.backgroundChangeDescription, this.backgroundAssetSelect, this.backgroundChangePanels, this.backgroundChangeStatus, this.backgroundChangeActions);
    shell.appendChild(this.backgroundChangeDialog);
    shell.appendChild(this.canvasInstructions);

    this.featureNote = create("p", "ds-de-feature-note", "圖層設定會自動保存，並可復原。");
    shell.appendChild(this.featureNote);
    this.container.replaceChildren(shell);
    this.context = shell.querySelector(".ds-de-title p");
    this.ctx = this.canvas.getContext("2d");
    this.updateControls();
  };

  DrawingEditor.prototype.bind = function () {
    const self = this;
    this.listen(this.backButton, "click", function () {
      if (self.pendingOperation || self.drawingBusy) return;
      if (self.activeStroke) self.cancelActiveStroke("返回鏡頭時取消未完成筆畫。");
      self.clearTouchInteraction(true);
      if (self.onBack) self.onBack({ drawingId: self.isDraft ? null : self.drawing && self.drawing.id, shotId: self.capturedShotId, projectId: self.capturedProjectId });
    });
    this.listen(this.retryButton, "click", function () { self.retry(); });
    this.listen(this.discardButton, "click", function () { self.discardFailedCandidate(); });
    this.listen(this.reloadButton, "click", function () { self.refreshDrawing().catch(self.showLoadError.bind(self)); });
    this.listen(this.retryBackgroundButton, "click", function () { self.retryBackground(); });
    this.listen(this.changeBackgroundButton, "click", function () { self.openBackgroundChangeDialog(); });
    this.listen(this.backgroundAssetSelect, "change", function () { self.loadBackgroundChangeCandidate(); });
    this.listen(this.backgroundChangeCancelButton, "click", function () { self.closeBackgroundChangeDialog(); });
    this.listen(this.backgroundChangeConfirmButton, "click", function () { self.confirmBackgroundChange(); });
    this.listen(this.backgroundChangeDialog, "close", function () {
      self.resetBackgroundChangePreview();
      self.updateControls();
      if (!self.destroyed && self.changeBackgroundButton && !self.changeBackgroundButton.disabled) self.changeBackgroundButton.focus({ preventScroll: true });
    });
    this.listen(this.sceneReuseSelect, "change", function () {
      self.updateSceneReuseControls();
      self.sceneReuseStatus.textContent = self.sceneReuseSelect.value
        ? "預覽會並排顯示來源與目標的場景筆跡；確認後只替換目標場景。"
        : "選擇來源鏡頭後，可先檢視兩邊場景再確認。";
    });
    this.listen(this.sceneReuseButton, "click", function () { self.openSceneReusePreview(); });
    this.listen(this.sceneReuseCancelButton, "click", function () { self.closeSceneReusePreview(); });
    this.listen(this.sceneReuseConfirmButton, "click", function () { self.confirmSceneReuse(); });
    this.listen(this.sceneReuseDialog, "close", function () {
      self.sceneReusePreview = null;
      if (!self.destroyed && self.sceneReuseButton && !self.sceneReuseButton.disabled) self.sceneReuseButton.focus({ preventScroll: true });
    });
    this.layerButtons.forEach(function (control, kind) {
      self.listen(control, "click", function () {
        if (self.activeStroke) self.cancelActiveStroke("作用圖層已切換，未完成筆畫已取消。");
        if (self.touchEraserCandidate) {
          self.touchEraserCandidate = null;
          self.eraserPointer = null;
        }
        const layer = self.findLayer(kind);
        if (!layer) return;
        self.layerId = layer.id;
        self.updateControls();
        self.render();
        self.updateCanvasLabel();
      });
    });
    this.layerStateButtons.forEach(function (controls, kind) {
      self.listen(controls.visibility, "click", function () {
        const layer = self.findLayer(kind);
        if (!layer) return;
        self.runLayerState(kind, { visible: !layer.visible });
      });
      self.listen(controls.lock, "click", function () {
        const layer = self.findLayer(kind);
        if (!layer) return;
        self.runLayerState(kind, { locked: !layer.locked });
      });
    });
    this.listen(this.clearLayerButton, "click", function () { self.clearActiveLayer(); });
    this.toolButtons.forEach(function (control, tool) {
      self.listen(control, "click", function () {
        if (self.activeStroke) self.cancelActiveStroke("工具已切換，未完成筆畫已取消。");
        if (self.touchEraserCandidate) {
          self.touchEraserCandidate = null;
          self.eraserPointer = null;
        }
        self.tool = tool;
        self.updateControls();
        self.updateCanvasLabel();
      });
    });
    this.listen(this.colorInput, "input", function () { self.color = self.colorInput.value; });
    this.listen(this.widthInput, "input", function () {
      self.baseWidth = Number(self.widthInput.value);
      self.widthValue.value = String(self.baseWidth) + " px";
      self.widthValue.textContent = self.widthValue.value;
    });
    this.listen(this.inputSelect, "change", function () {
      if (self.activeStroke) self.cancelActiveStroke("輸入方式已切換，未完成筆畫已取消。");
      self.clearTouchInteraction(false);
      self.inputMode = self.inputSelect.value;
      self.updateCanvasLabel();
    });
    this.listen(this.focusButton, "click", function () { self.setMode("focus"); });
    this.listen(this.splitButton, "click", function () { self.setMode("split"); });
    this.listen(this.zoomOutButton, "click", function () { self.zoomBy(1 / 1.25); });
    this.listen(this.zoomInButton, "click", function () { self.zoomBy(1.25); });
    this.listen(this.fitCanvasButton, "click", function () { self.fitCanvasToView(); });
    this.listen(this.undoButton, "click", function () { self.runHistory("undo"); });
    this.listen(this.redoButton, "click", function () { self.runHistory("redo"); });
    this.listen(this.canvas, "pointerdown", function (event) { self.pointerDown(event); });
    this.listen(this.canvas, "pointermove", function (event) { self.pointerMove(event); });
    this.listen(this.canvas, "pointerleave", function () { self.eraserPointer = null; self.render(); });
    this.listen(this.canvas, "pointerup", function (event) { self.pointerUp(event); });
    this.listen(this.canvas, "pointercancel", function (event) { self.pointerInterrupted(event, "輸入已中斷，未完成筆畫已取消。"); });
    this.listen(this.canvas, "lostpointercapture", function (event) { self.pointerInterrupted(event, "指標捕捉已中斷，未完成筆畫已取消。"); });
    this.listen(document, "visibilitychange", function () {
      if (document.hidden) {
        if (self.activeStroke) self.cancelActiveStroke("頁面切到背景，未完成筆畫已取消。");
        self.clearTouchInteraction(false);
      }
    });
    this.listen(window, "blur", function () {
      if (self.activeStroke) self.cancelActiveStroke("視窗焦點已離開，未完成筆畫已取消。");
      self.clearTouchInteraction(false);
    });
    this.listen(window, "resize", function () {
      if (self.activeStroke) self.cancelActiveStroke("畫布尺寸改變，未完成筆畫已取消。");
      self.clearTouchInteraction(false);
      self.clampViewTransform();
      self.render();
    });
    if (this.model && typeof this.model.subscribeLifecycle === "function") {
      this.unsubscribeLifecycle = this.model.subscribeLifecycle(function (snapshot) { self.refreshLifecycle(snapshot); });
    }
    if (this.model && typeof this.model.subscribe === "function") {
      this.unsubscribeData = this.model.subscribe(function (_state, event) {
        if (event && event.projectId && self.capturedProjectId && event.projectId !== self.capturedProjectId) {
          if (self.activeStroke) self.cancelActiveStroke("專案已切換，未完成筆畫已取消。");
          self.writable = false;
          self.readOnlyReason = "目前已切換至其他專案；此畫布為唯讀。";
          self.setStatus("唯讀：" + self.readOnlyReason, "readonly");
          self.updateControls();
          return;
        }
        self.refreshLifecycle();
        self.refreshDrawing().catch(self.showLoadError.bind(self));
      });
    }
  };

  DrawingEditor.prototype.observeSize = function () {
    const self = this;
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(function () {
        if (self.activeStroke) self.cancelActiveStroke("畫布尺寸改變，未完成筆畫已取消。");
        self.clearTouchInteraction(false);
        self.clampViewTransform();
        self.render();
      });
      this.resizeObserver.observe(this.stage);
    }
  };

  DrawingEditor.prototype.refreshLifecycle = function (snapshot) {
    const state = snapshot || this.model && typeof this.model.getLifecycle === "function" && this.model.getLifecycle();
    const hasSelectedProject = Boolean(state && Object.prototype.hasOwnProperty.call(state, "selectedProjectId"));
    const projectMatches = !this.capturedProjectId || !state || !hasSelectedProject || state.selectedProjectId === this.capturedProjectId;
    this.writable = state && typeof state.writable === "boolean"
      ? Boolean(projectMatches && state.writable)
      : Boolean(this.writableOverride && projectMatches);
    const reason = !projectMatches ? "目前已切換至其他專案；此畫布為唯讀。" : state && (state.readOnlyReason || state.error && state.error.message);
    if (!this.writable && reason) this.readOnlyReason = reason;
    if (!this.writable && this.activeStroke) this.cancelActiveStroke("編輯權已中斷，未完成筆畫已取消。");
    this.updateControls();
    this.notifyState();
  };

  DrawingEditor.prototype.refreshDrawing = function () {
    if (this.destroyed) return Promise.resolve();
    const request = this.drawingRefreshRequests.begin(function (generation) {
      return this.refreshDrawingSnapshot(generation);
    }.bind(this));
    return request.promise;
  };

  DrawingEditor.prototype.refreshDrawingSnapshot = async function (generation) {
    if (this.destroyed || !this.drawingRefreshRequests.isCurrent(generation)) return;
    if (this.isDraft && !this.pendingOperation) {
      const project = this.getCurrentProjectSnapshot();
      if (project && project.aspectRatio && this.drawing && this.drawing.canvas.aspectRatio !== project.aspectRatio) {
        const previousLayerKind = this.activeLayer() && this.activeLayer().kind;
        if (this.activeStroke) this.cancelActiveStroke("專案畫幅已變更，未完成筆畫已取消。");
        this.clearTouchInteraction(true);
        this.drawing = createDraftDrawing(this.capturedProjectId, this.capturedShotId, project.aspectRatio,
          this.drawing.backgroundAssetId, this.resolveDraftBackgroundCrop(this.drawing.backgroundAssetId));
        const matchingLayer = this.drawing.layers.find(function (layer) { return layer.kind === previousLayerKind; }) || this.drawing.layers[0];
        this.layerId = matchingLayer.id;
      }
      this.drawing.backgroundCrop = this.resolveDraftBackgroundCrop(this.drawing.backgroundAssetId);
    }
    let drawing = this.drawing;
    if (this.isDraft && !this.pendingOperation && this.model && typeof this.model.getDrawingsForShot === "function") {
      const savedDrawings = this.model.getDrawingsForShot(this.capturedShotId);
      if (Array.isArray(savedDrawings) && savedDrawings.length === 1) {
        drawing = savedDrawings[0];
        this.initialDrawing = { id: drawing.id };
      }
    }
    if (this.readDrawing && this.initialDrawing && this.initialDrawing.id) {
      try { drawing = await this.readDrawing(this.initialDrawing.id); }
      catch (error) {
        if (this.destroyed || !this.drawingRefreshRequests.isCurrent(generation)) return;
        if (error && error.code === "DRAWING_NOT_FOUND" && this.pendingOperation && this.pendingOperation.kind === "history" && this.pendingOperation.historyKind === "undo") return;
        throw error;
      }
    }
    if (this.destroyed || !this.drawingRefreshRequests.isCurrent(generation)) return;
    if (!drawing || !drawing.id || !drawing.canvas || !Array.isArray(drawing.layers)) throw new Error("找不到有效的手繪內容；目前無法編輯。");
    if (this.capturedProjectId && drawing.projectId !== this.capturedProjectId) throw new Error("專案已切換；為避免編輯錯誤內容，畫布已設為唯讀。");
    if (!this.capturedProjectId) this.capturedProjectId = drawing.projectId || null;
    if (this.capturedShotId && drawing.shotId !== this.capturedShotId) throw new Error("鏡頭已改變；為避免編輯錯誤內容，畫布已設為唯讀。");
    if (!this.capturedShotId) this.capturedShotId = drawing.shotId || null;
    this.refreshLifecycle();
    const previousLayerKind = this.activeLayer() && this.activeLayer().kind;
    const changedId = this.drawing && this.drawing.id !== drawing.id;
    if (changedId) {
      if (this.activeStroke) this.cancelActiveStroke("畫布已切換，未完成筆畫已取消。");
      this.clearTouchInteraction(true);
    }
    this.drawing = clone(drawing);
    if (this.isDraft && this.initialDrawing && this.initialDrawing.id === drawing.id) this.isDraft = false;
    if (!this.drawingBusy && this.pendingOperation && this.pendingOperation.queued && !this.pendingOperation.committed && ["append", "erase", "background"].includes(this.pendingOperation.kind) && this.didCommitPending(this.pendingOperation, this.drawing)) {
      this.pendingOperation.committed = true;
    }
    this.stage.style.aspectRatio = this.drawing.canvas.width + " / " + this.drawing.canvas.height;
    this.context.textContent = this.shotLabel;
    if (!this.layerId || !this.drawing.layers.some(function (layer) { return layer.id === this.layerId; }, this)) {
      const preferred = this.findLayer(previousLayerKind) || this.findLayer("scene") || this.drawing.layers[0];
      this.layerId = preferred ? preferred.id : null;
    }
    await this.refreshBackground();
    if (this.destroyed || !this.drawingRefreshRequests.isCurrent(generation)) return;
    if (this.pendingOperation && this.pendingOperation.committed) this.pendingOperation = null;
    if (this.backgroundFailure) {
      this.setStatus("照片載入失敗；目前暫停編輯。", "error");
    } else if (this.drawingBusy) {
      this.setStatus("正在保存…", "saving");
    } else if (this.pendingOperation && this.pendingOperation.reloadRequired) {
      this.setStatus("內容已載入，但這筆筆畫尚未保存。請取消後重新操作。", "error");
    } else if (this.pendingOperation) {
      this.setStatus("尚未保存：有一筆操作待重試。", "error");
    } else if (this.isDraft && this.writable) {
      this.setStatus("空白畫布尚未保存；開始繪製或調整設定後會自動保存。", "info");
    } else if (this.writable) {
      this.setStatus("已保存", "saved");
    } else {
      this.setStatus("唯讀：" + (this.readOnlyReason || "目前沒有編輯權。"), "readonly");
    }
    this.updateControls();
    this.updateCanvasLabel();
    this.render();
  };

  DrawingEditor.prototype.refreshBackground = function () {
    const drawing = this.drawing;
    const assetId = drawing.backgroundAssetId || null;
    if (assetId === this.backgroundAssetId && this.backgroundReady) return Promise.resolve();
    if (assetId === this.backgroundAssetId && this.backgroundFailure) return Promise.resolve();
    if (assetId === this.backgroundAssetId && this.backgroundRequests.promise) return this.backgroundRequests.promise;
    this.revokeBackgroundUrl();
    this.backgroundImage = null;
    this.referenceImage.hidden = true;
    this.referenceImage.removeAttribute("src");
    this.backgroundFailure = null;
    this.backgroundAssetId = assetId;
    this.backgroundReady = false;
    if (!assetId) {
      this.backgroundRequests.invalidate();
      this.backgroundReady = true;
      this.referenceMessage.textContent = "此鏡頭沒有照片底圖；畫布為空白。";
      this.stageBadge.textContent = "無照片底圖";
      this.retryBackgroundButton.hidden = true;
      return Promise.resolve();
    }
    this.referenceMessage.textContent = "正在載入鎖定照片…";
    this.stageBadge.textContent = "正在載入照片";
    const request = this.backgroundRequests.begin(function (generation) {
      return this.loadAndDisplayBackground(drawing, assetId, generation);
    }.bind(this));
    this.retryBackgroundButton.hidden = true;
    return request.promise;
  };

  DrawingEditor.prototype.loadAndDisplayBackground = async function (drawing, assetId, generation) {
    let objectUrl = null;
    let committedUrl = null;
    const isCurrentRequest = function () {
      return !this.destroyed && this.backgroundRequests.isCurrent(generation) && this.drawing &&
        this.drawing.id === drawing.id && this.drawing.backgroundAssetId === assetId && this.backgroundAssetId === assetId;
    }.bind(this);
    try {
      let asset;
      if (this.loadBackground) asset = await this.loadBackground(clone(drawing));
      else if (this.model && typeof this.model.getAsset === "function") asset = await this.model.getAsset(drawing.projectId, assetId);
      else if (this.model && typeof this.model.getShotPhoto === "function") asset = await this.model.getShotPhoto(drawing.shotId, assetId);
      else throw new Error("照片讀取功能尚未就緒。");
      if (!isCurrentRequest()) return;
      if (!asset || asset.projectId !== drawing.projectId || asset.id !== assetId || !asset.metadata || asset.metadata.role !== "photoOriginal" || !asset.originalBlob) {
        throw new Error("照片資料無法驗證，請重試載入。");
      }
      if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") throw new Error("目前瀏覽器不支援安全的原圖顯示。");
      objectUrl = URL.createObjectURL(asset.originalBlob);
      const image = new Image();
      await new Promise(function (resolve, reject) {
        image.onload = resolve;
        image.onerror = function () { reject(new Error("原圖無法解碼")); };
        image.src = objectUrl;
      });
      if (!isCurrentRequest()) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
        return;
      }
      this.revokeBackgroundUrl();
      this.backgroundObjectUrl = objectUrl;
      committedUrl = objectUrl;
      objectUrl = null;
      this.backgroundImage = image;
      this.backgroundReady = true;
      this.referenceImage.src = committedUrl;
      this.referenceImage.hidden = false;
      this.retryBackgroundButton.hidden = true;
      this.referenceMessage.textContent = asset.metadata.originalName || "原始照片（唯讀）";
      this.stageBadge.textContent = "鎖定照片底圖";
      this.render();
    } catch (error) {
      if (objectUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(objectUrl);
      if (!isCurrentRequest()) return;
      if (committedUrl && this.backgroundObjectUrl === committedUrl) this.revokeBackgroundUrl();
      this.backgroundFailure = "無法載入照片，請重試。";
      this.backgroundReady = false;
      this.retryBackgroundButton.hidden = !(this.loadBackground || this.model && (typeof this.model.getAsset === "function" || typeof this.model.getShotPhoto === "function"));
      this.referenceMessage.textContent = "底圖讀取失敗：" + this.backgroundFailure;
      this.stageBadge.textContent = "底圖載入失敗";
      this.updateControls();
    }
  };

  DrawingEditor.prototype.revokeBackgroundUrl = function () {
    if (this.backgroundObjectUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(this.backgroundObjectUrl);
    this.backgroundObjectUrl = null;
  };

  DrawingEditor.prototype.showLoadError = function (error) {
    if (this.destroyed) return;
    this.readOnlyReason = "手繪內容載入失敗，請重試。";
    this.writable = false;
    this.drawing = null;
    this.setStatus("無法載入手繪內容：" + this.readOnlyReason, "error");
    this.reloadButton.hidden = !this.readDrawing;
    this.updateControls();
    this.render();
  };

  DrawingEditor.prototype.findLayer = function (kind) {
    return this.drawing && this.drawing.layers.find(function (layer) { return layer.kind === kind; }) || null;
  };

  DrawingEditor.prototype.activeLayer = function () {
    return this.drawing && this.drawing.layers.find(function (layer) { return layer.id === this.layerId; }, this) || null;
  };

  DrawingEditor.prototype.canQueueCommand = function () {
    const lifecycle = this.model && typeof this.model.getLifecycle === "function" ? this.model.getLifecycle() : null;
    return !lifecycle || Boolean(lifecycle.writable && lifecycle.pendingCount === 0 && lifecycle.phase !== "save_failed");
  };

  DrawingEditor.prototype.canCreateFromDraft = function () {
    return Boolean(this.isDraft && this.model && typeof this.model.createDrawingForShotWithInitialEdit === "function");
  };

  DrawingEditor.prototype.isEditable = function () {
    const layer = this.activeLayer();
    const hasCommand = this.tool === "eraser"
      ? this.model && typeof this.model.eraseDrawingStroke === "function"
      : this.canCreateFromDraft() || this.model && typeof this.model.appendDrawingStroke === "function";
    const canVerifyTarget = this.model && (typeof this.model.getDrawing === "function" || typeof this.model.getProject === "function");
    return Boolean(this.writable && this.canQueueCommand() && hasCommand && canVerifyTarget && Number.isInteger(this.currentProjectRevision()) && this.backgroundReady && !this.backgroundFailure && this.drawing && layer && layer.visible && !layer.locked && !this.pendingOperation && !this.drawingBusy);
  };

  DrawingEditor.prototype.canWriteLayerState = function (kind) {
    const layer = this.findLayer(kind);
    const canVerifyTarget = this.model && (typeof this.model.getDrawing === "function" || typeof this.model.getProject === "function");
    const canSave = this.canCreateFromDraft() || this.model && typeof this.model.setDrawingLayerState === "function";
    return Boolean(layer && this.drawing && this.writable && this.canQueueCommand() && canSave && canVerifyTarget && Number.isInteger(this.currentProjectRevision()) && this.backgroundReady && !this.backgroundFailure && !this.pendingOperation && !this.drawingBusy);
  };

  DrawingEditor.prototype.canClearActiveLayer = function () {
    const layer = this.activeLayer();
    const canVerifyTarget = this.model && (typeof this.model.getDrawing === "function" || typeof this.model.getProject === "function");
    return Boolean(layer && layer.visible && !layer.locked && layer.strokes.length > 0 && !this.activeStroke && this.drawing && this.writable && this.canQueueCommand() && this.model && typeof this.model.clearDrawingLayer === "function" && canVerifyTarget && Number.isInteger(this.currentProjectRevision()) && this.backgroundReady && !this.backgroundFailure && !this.pendingOperation && !this.drawingBusy);
  };

  DrawingEditor.prototype.canWriteHistory = function (kind) {
    const method = kind === "redo" ? "redo" : "undo";
    return Boolean(!this.isDraft && this.writable && this.canQueueCommand() && this.drawing && this.backgroundReady && !this.backgroundFailure && Number.isInteger(this.currentProjectRevision()) && !this.pendingOperation && !this.drawingBusy && this.model && typeof this.model[method] === "function");
  };

  DrawingEditor.prototype.getCurrentProjectSnapshot = function () {
    if (!this.model || typeof this.model.getProject !== "function") return null;
    const project = this.model.getProject();
    return project && project.projectId === this.capturedProjectId ? clone(project) : null;
  };

  DrawingEditor.prototype.getShotBackgroundCrop = function (assetId) {
    if (!assetId) return null;
    const project = this.getCurrentProjectSnapshot();
    const shot = project && project.shots.find(function (item) { return item.id === this.capturedShotId; }, this);
    const crops = shot && shot.photoCropsByAssetId;
    return crops && Object.prototype.hasOwnProperty.call(crops, assetId)
      ? storyboardRenderer.copyBackgroundCrop(crops[assetId])
      : null;
  };

  DrawingEditor.prototype.resolveDraftBackgroundCrop = function (assetId) {
    if (!assetId) {
      if (this.defaultBackgroundCropOverride) throw new RangeError("沒有照片底圖時不能指定 backgroundCrop。");
      return null;
    }
    return this.defaultBackgroundCropOverride === undefined
      ? this.getShotBackgroundCrop(assetId)
      : storyboardRenderer.copyBackgroundCrop(this.defaultBackgroundCropOverride);
  };

  DrawingEditor.prototype.getBackgroundChoices = function (project) {
    const current = project || this.getCurrentProjectSnapshot();
    const shot = current && Array.isArray(current.shots) && current.shots.find(function (item) { return item.id === this.capturedShotId; }, this);
    if (!shot || !Array.isArray(shot.assetIds) || !Array.isArray(current.assets)) return [];
    return shot.assetIds.map(function (assetId) {
      return current.assets.find(function (asset) { return asset.id === assetId; });
    }).filter(function (asset) {
      return Boolean(asset && asset.projectId === this.capturedProjectId && asset.role === "photoOriginal" && asset.state === "available");
    }, this);
  };

  DrawingEditor.prototype.canWriteBackgroundChange = function () {
    const canReadProject = this.model && typeof this.model.getProject === "function";
    const canReadAsset = this.model && (typeof this.model.getAsset === "function" || this.loadBackground || typeof this.model.getShotPhoto === "function");
    const canVerifyTarget = this.model && (typeof this.model.getDrawing === "function" || canReadProject);
    const canSave = this.canCreateFromDraft() || this.model && typeof this.model.setDrawingBackground === "function";
    return Boolean(this.drawing && this.writable && this.canQueueCommand() && canReadProject && canReadAsset && canVerifyTarget &&
      canSave && Number.isInteger(this.currentProjectRevision()) &&
      !this.activeStroke && !this.pendingOperation && !this.drawingBusy);
  };

  DrawingEditor.prototype.canOpenBackgroundChange = function () {
    if (!this.canWriteBackgroundChange()) return false;
    return Boolean(this.drawing.backgroundAssetId || this.getBackgroundChoices().length);
  };

  DrawingEditor.prototype.canCommitBackgroundChange = function () {
    if (!this.backgroundChangeDialog || !this.backgroundChangeDialog.open || !this.canWriteBackgroundChange()) return false;
    const selectedAssetId = this.backgroundAssetSelect.value || null;
    if (this.backgroundAssetSelect.value === "__select__") return false;
    if (selectedAssetId === (this.drawing.backgroundAssetId || null)) return false;
    if (selectedAssetId === null) return true;
    return Boolean(this.backgroundPreviewReady && this.backgroundPreviewAsset && this.backgroundPreviewAsset.id === selectedAssetId);
  };

  DrawingEditor.prototype.openBackgroundChangeDialog = function () {
    if (!this.canOpenBackgroundChange()) return;
    if (this.activeStroke) this.cancelActiveStroke("開啟底圖預覽時取消未完成筆畫。");
    const project = this.getCurrentProjectSnapshot();
    const choices = this.getBackgroundChoices(project);
    this.backgroundAssetSelect.replaceChildren();
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "不使用照片底圖（空白畫布）";
    this.backgroundAssetSelect.appendChild(blank);
    const currentId = this.drawing.backgroundAssetId || "";
    const currentIsAvailable = choices.some(function (asset) { return asset.id === currentId; });
    if (currentId && !currentIsAvailable) {
      const placeholder = document.createElement("option");
      placeholder.value = "__select__";
      placeholder.textContent = "選擇新照片，或明確選擇空白底圖";
      this.backgroundAssetSelect.insertBefore(placeholder, this.backgroundAssetSelect.firstChild);
    }
    choices.forEach(function (asset) {
      const option = document.createElement("option");
      option.value = asset.id;
      option.textContent = asset.originalName || "未命名照片";
      this.backgroundAssetSelect.appendChild(option);
    }, this);
    this.backgroundAssetSelect.value = currentIsAvailable ? currentId : currentId ? "__select__" : "";
    this.backgroundBeforePanel.image.hidden = true;
    this.backgroundBeforePanel.image.removeAttribute("src");
    this.backgroundBeforePanel.message.textContent = this.drawing.backgroundAssetId
      ? this.backgroundFailure ? "目前底圖讀取失敗；可以換成已保存照片修復。" : this.referenceMessage.textContent
      : "目前沒有照片底圖。";
    if (this.drawing.backgroundAssetId && this.backgroundReady && this.backgroundObjectUrl && !this.backgroundFailure) {
      this.backgroundBeforePanel.image.src = this.backgroundObjectUrl;
      this.backgroundBeforePanel.image.hidden = false;
    }
    this.backgroundChangeStatus.textContent = choices.length
      ? "選擇此鏡頭已保存的照片以預覽候選原圖（不套用 Drawing 裁切）；按確認後才會保存。"
      : "此鏡頭目前沒有可選照片；可以移除既有底圖。取消不會寫入。";
    this.backgroundPreviewAsset = null;
    this.backgroundPreviewReady = false;
    this.backgroundAfterPanel.image.hidden = true;
    this.backgroundAfterPanel.image.removeAttribute("src");
    this.backgroundAfterPanel.message.textContent = "請選擇候選照片。";
    if (typeof this.backgroundChangeDialog.showModal === "function") this.backgroundChangeDialog.showModal();
    else this.backgroundChangeDialog.setAttribute("open", "open");
    this.loadBackgroundChangeCandidate();
    this.updateControls();
  };

  DrawingEditor.prototype.loadBackgroundChangeCandidate = function () {
    const selectedValue = this.backgroundAssetSelect.value;
    const assetId = selectedValue || null;
    const confirmLabel = selectedValue === "" && this.drawing && this.drawing.backgroundAssetId
      ? "確認移除底圖"
      : "確認更換底圖";
    this.backgroundChangeConfirmButton.textContent = confirmLabel;
    this.backgroundChangeConfirmButton.setAttribute("aria-label", confirmLabel);
    this.backgroundPreviewRequests.invalidate();
    this.revokeBackgroundPreviewUrl();
    this.backgroundPreviewAsset = null;
    this.backgroundPreviewReady = assetId === null;
    this.backgroundAfterPanel.image.hidden = true;
    this.backgroundAfterPanel.image.removeAttribute("src");
    if (selectedValue === "__select__") {
      this.backgroundPreviewReady = false;
      this.backgroundAfterPanel.message.textContent = "請選擇候選照片或明確選擇空白底圖。";
      this.backgroundChangeStatus.textContent = "目前底圖已不在此鏡頭照片清單；先選擇新照片或空白底圖。";
      this.updateControls();
      return Promise.resolve();
    }
    if (!assetId) {
      this.backgroundAfterPanel.message.textContent = "不使用照片底圖（空白畫布）。";
      this.backgroundChangeStatus.textContent = this.drawing.backgroundAssetId
        ? "候選為空白底圖；按確認後只會移除 Drawing 的照片引用，原圖資料與筆跡都會保留。"
        : "目前已是空白底圖，無需更換。";
      this.updateControls();
      return Promise.resolve();
    }
    this.backgroundAfterPanel.message.textContent = "正在驗證並載入未裁切的候選原圖…";
    this.backgroundChangeStatus.textContent = "候選原圖仍未保存；正在驗證原始照片。確認更換會清除舊裁切。";
    this.updateControls();
    const drawing = clone(this.drawing);
    const request = this.backgroundPreviewRequests.begin(async function (generation) {
      let objectUrl = null;
      const isCurrent = function () {
        return !this.destroyed && this.backgroundChangeDialog.open && this.backgroundPreviewRequests.isCurrent(generation) &&
          this.drawing && this.drawing.id === drawing.id && this.backgroundAssetSelect.value === assetId;
      }.bind(this);
      try {
        let asset;
        if (this.model && typeof this.model.getAsset === "function") asset = await this.model.getAsset(drawing.projectId, assetId);
        else if (this.loadBackground) asset = await this.loadBackground(Object.assign({}, drawing, { backgroundAssetId: assetId }));
        else if (this.model && typeof this.model.getShotPhoto === "function") asset = await this.model.getShotPhoto(drawing.shotId, assetId);
        else throw new Error("照片驗證功能尚未就緒。");
        if (!isCurrent()) return;
        if (!asset || asset.projectId !== drawing.projectId || asset.id !== assetId || !asset.metadata || asset.metadata.role !== "photoOriginal" || !asset.originalBlob) {
          throw new Error("候選照片資料無法驗證。請重新載入此鏡頭照片。");
        }
        if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") throw new Error("目前瀏覽器不支援安全的照片預覽。");
        objectUrl = URL.createObjectURL(asset.originalBlob);
        const image = new Image();
        await new Promise(function (resolve, reject) {
          image.onload = resolve;
          image.onerror = function () { reject(new Error("候選原圖無法解碼。")); };
          image.src = objectUrl;
        });
        if (!isCurrent()) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
          return;
        }
        this.revokeBackgroundPreviewUrl();
        this.backgroundPreviewObjectUrl = objectUrl;
        objectUrl = null;
        this.backgroundPreviewAsset = { projectId: asset.projectId, id: asset.id, metadata: clone(asset.metadata) };
        this.backgroundPreviewReady = true;
        this.backgroundAfterPanel.image.src = this.backgroundPreviewObjectUrl;
        this.backgroundAfterPanel.image.hidden = false;
        this.backgroundAfterPanel.message.textContent = (asset.metadata.originalName || "候選原始照片") + "（完整原圖預覽）";
        this.backgroundChangeStatus.textContent = "候選原圖已驗證；尚未保存。確認更換後會清除舊裁切，保留筆跡。";
      } catch (error) {
        if (objectUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(objectUrl);
        if (!isCurrent()) return;
        this.backgroundAfterPanel.message.textContent = "候選照片載入失敗。";
        this.backgroundChangeStatus.textContent = "底圖未更換：" + (error && error.message || "候選照片無法驗證。");
        this.backgroundPreviewReady = false;
      } finally {
        if (isCurrent()) this.updateControls();
      }
    }.bind(this));
    return request.promise;
  };

  DrawingEditor.prototype.confirmBackgroundChange = function () {
    if (!this.canCommitBackgroundChange()) return;
    const projectRevision = this.currentProjectRevision();
    const target = this.isDraft ? clone(this.drawing) : this.currentDrawingSnapshot();
    if (target.id !== this.drawing.id || target.revision !== this.drawing.revision || !Number.isInteger(projectRevision)) {
      this.backgroundChangeStatus.textContent = "底圖尚未更換：鏡頭資料已更新，請關閉預覽後重新載入。";
      return;
    }
    const assetId = this.backgroundAssetSelect.value || null;
    const project = this.getCurrentProjectSnapshot();
    const shot = project && project.shots.find(function (item) { return item.id === this.capturedShotId; }, this);
    if (assetId && (!shot || !shot.assetIds.includes(assetId))) {
      this.backgroundChangeStatus.textContent = "底圖尚未更換：候選照片已不屬於此鏡頭，請重新載入照片清單。";
      return;
    }
    if (this.isDraft) {
      this.createFromDraft({ kind: "background", assetId: assetId });
      return;
    }
    const layer = this.findLayer("scene") || this.activeLayer();
    if (!layer) return;
    this.pendingOperation = {
      kind: "background",
      projectId: this.capturedProjectId,
      shotId: this.capturedShotId,
      baseRevision: projectRevision,
      drawingRevision: target.revision,
      drawingId: target.id,
      layerId: layer.id,
      previousAssetId: target.backgroundAssetId || null,
      assetId: assetId,
      assetName: assetId && this.backgroundPreviewAsset && this.backgroundPreviewAsset.metadata.originalName || "空白畫布",
      targetDrawingSnapshot: clone(target)
    };
    this.submitPending();
  };

  DrawingEditor.prototype.closeBackgroundChangeDialog = function () {
    this.backgroundPreviewRequests.invalidate();
    if (this.backgroundChangeDialog.open && typeof this.backgroundChangeDialog.close === "function") this.backgroundChangeDialog.close();
    else {
      this.backgroundChangeDialog.removeAttribute("open");
      this.resetBackgroundChangePreview();
      this.updateControls();
    }
  };

  DrawingEditor.prototype.resetBackgroundChangePreview = function () {
    this.backgroundPreviewRequests.invalidate();
    this.revokeBackgroundPreviewUrl();
    this.backgroundPreviewAsset = null;
    this.backgroundPreviewReady = false;
    if (this.backgroundBeforePanel) {
      this.backgroundBeforePanel.image.hidden = true;
      this.backgroundBeforePanel.image.removeAttribute("src");
    }
    if (this.backgroundAfterPanel) {
      this.backgroundAfterPanel.image.hidden = true;
      this.backgroundAfterPanel.image.removeAttribute("src");
      this.backgroundAfterPanel.message.textContent = "請選擇候選照片。";
    }
  };

  DrawingEditor.prototype.revokeBackgroundPreviewUrl = function () {
    if (this.backgroundPreviewObjectUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(this.backgroundPreviewObjectUrl);
    this.backgroundPreviewObjectUrl = null;
  };

  DrawingEditor.prototype.getDrawingSnapshot = function (drawingId, project) {
    let drawing = null;
    if (this.model && typeof this.model.getDrawing === "function") drawing = this.model.getDrawing(drawingId);
    else {
      const current = project || this.getCurrentProjectSnapshot();
      drawing = current && Array.isArray(current.drawings) && current.drawings.find(function (item) { return item.id === drawingId; });
    }
    if (!drawing || typeof drawing.then === "function" || drawing.projectId !== this.capturedProjectId) return null;
    return clone(drawing);
  };

  DrawingEditor.prototype.getOrderedProjectShots = function (project) {
    if (!project || !Array.isArray(project.shots)) return [];
    const byId = new Map(project.shots.map(function (shot) { return [shot.id, shot]; }));
    const result = [];
    const included = new Set();
    const sceneOrder = Array.isArray(project.sceneOrder) ? project.sceneOrder : (project.scenes || []).map(function (scene) { return scene.id; });
    sceneOrder.forEach(function (sceneId) {
      const orderedIds = project.shotOrderByScene && project.shotOrderByScene[sceneId];
      const ids = Array.isArray(orderedIds) ? orderedIds : project.shots.filter(function (shot) { return shot.sceneId === sceneId; }).map(function (shot) { return shot.id; });
      ids.forEach(function (id) {
        const shot = byId.get(id);
        if (shot && !included.has(id)) { result.push(shot); included.add(id); }
      });
    });
    project.shots.forEach(function (shot) {
      if (!included.has(shot.id)) { result.push(shot); included.add(shot.id); }
    });
    return result;
  };

  DrawingEditor.prototype.resolveSceneReuseNumbering = function (project) {
    if (!project || !project.projectId) {
      return { ok: false, message: "專案鏡次資料尚未載入；場景複用已停用。" };
    }
    const current = this.getCurrentProjectSnapshot();
    if (!current || current.projectId !== project.projectId || current.revision !== project.revision) {
      return { ok: false, message: "鏡次資料已更新；請重新載入後再複用場景。" };
    }
    if (!this.model || typeof this.model.resolveShotNumbers !== "function") {
      return { ok: false, message: "鏡次解析器尚未就緒；為避免選錯來源，場景複用已停用。" };
    }
    let resolution;
    try { resolution = this.model.resolveShotNumbers(); }
    catch (_) {
      return { ok: false, message: "鏡次解析失敗；為避免選錯來源，場景複用已停用。請先檢查鏡次後重試。" };
    }
    if (!resolution || !resolution.shotNumbers || typeof resolution.shotNumbers !== "object" || !Array.isArray(resolution.conflicts)) {
      return { ok: false, message: "鏡次解析結果無效；為避免選錯來源，場景複用已停用。" };
    }
    if (resolution.conflicts.length) {
      return { ok: false, message: "鏡次存在鎖號衝突；請先處理衝突後再複用場景。" };
    }
    const shotNumbers = resolution.shotNumbers;
    const hasOwn = Object.prototype.hasOwnProperty;
    const complete = this.getOrderedProjectShots(project).every(function (shot) {
      if (!hasOwn.call(shotNumbers, shot.id)) return false;
      const value = String(shotNumbers[shot.id]);
      return /^[1-9][0-9]*$/.test(value);
    });
    if (!complete) {
      return { ok: false, message: "鏡次解析不完整；為避免選錯來源，場景複用已停用。" };
    }
    return { ok: true, shotNumbers: shotNumbers };
  };

  DrawingEditor.prototype.sceneReuseShotLabel = function (project, shot, numbering) {
    const scenes = Array.isArray(project && project.scenes) ? project.scenes : [];
    const sceneOrder = Array.isArray(project && project.sceneOrder) ? project.sceneOrder : scenes.map(function (scene) { return scene.id; });
    const sceneIndex = sceneOrder.indexOf(shot.sceneId);
    const shotNumbers = numbering && numbering.shotNumbers;
    const hasShotNumber = shotNumbers && Object.prototype.hasOwnProperty.call(shotNumbers, shot.id);
    const sceneNumber = sceneIndex >= 0 ? sceneIndex + 1 : "未解析";
    const shotNumber = hasShotNumber ? String(shotNumbers[shot.id]) : "未解析";
    const title = String(shot.title || "");
    const shotLabel = "場次 " + sceneNumber + "／鏡次 " + shotNumber;
    return title.trim() ? shotLabel + " · " + title : shotLabel;
  };

  DrawingEditor.prototype.updateSceneReuseControls = function () {
    if (!this.sceneReuseSelect || !this.sceneReuseButton) return;
    const previousValue = this.sceneReuseSelect.value;
    const project = this.getCurrentProjectSnapshot();
    const numbering = this.resolveSceneReuseNumbering(project);
    const orderedShots = this.getOrderedProjectShots(project);
    const shotIndexById = new Map(orderedShots.map(function (shot, index) { return [shot.id, index]; }));
    const sources = new Map();
    if (numbering.ok && project && Array.isArray(project.drawings)) {
      const targetShotId = this.drawing && this.drawing.shotId || this.capturedShotId;
      const targetOrderIndex = shotIndexById.has(targetShotId) ? shotIndexById.get(targetShotId) : -1;
      orderedShots.forEach(function (shot) {
        const sourceOrderIndex = shotIndexById.get(shot.id);
        if (targetOrderIndex < 0 || sourceOrderIndex >= targetOrderIndex || !Array.isArray(shot.drawingIds)) return;
        shot.drawingIds.forEach(function (drawingId) {
          const drawing = project.drawings.find(function (item) { return item.id === drawingId; });
          if (drawing && drawing.projectId === this.capturedProjectId && drawing.shotId === shot.id && drawing.layers.some(function (layer) { return layer.kind === "scene"; })) {
            sources.set(drawing.id, {
              drawing: clone(drawing),
              label: this.sceneReuseShotLabel(project, shot, numbering)
            });
          }
        }, this);
      }, this);
    }
    this.sceneReuseSources = sources;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = !numbering.ok ? numbering.message : sources.size ? "選擇先前場次／鏡次" : "沒有更早鏡頭的已保存 Drawing";
    this.sceneReuseSelect.replaceChildren(placeholder);
    sources.forEach(function (source, drawingId) {
      const option = document.createElement("option");
      option.value = drawingId;
      option.textContent = source.label;
      this.sceneReuseSelect.appendChild(option);
    }, this);
    if (previousValue && sources.has(previousValue)) this.sceneReuseSelect.value = previousValue;
    const source = sources.get(this.sceneReuseSelect.value);
    const targetScene = this.findLayer("scene");
    const canSaveReuse = this.canCreateFromDraft() || this.model && typeof this.model.reuseSceneLayer === "function";
    const reason = !numbering.ok
      ? numbering.message
      : !canSaveReuse
      ? "場景沿用保存功能尚未就緒。"
      : !this.writable
        ? "唯讀狀態不能沿用場景。"
        : !sources.size
          ? "同專案目前沒有更早且已保存的 Drawing 可作來源。"
          : !targetScene
            ? "目標場景圖層尚未載入。"
            : !targetScene.visible || targetScene.locked
              ? "請先顯示並解鎖目標場景圖層。"
              : !source
                ? "選擇先前鏡頭後，可先檢視兩邊場景再確認。"
                : "預覽會並排顯示來源與目標的場景筆跡；確認後只替換目標場景。";
    const canWrite = Boolean(numbering.ok && source && this.drawing && targetScene && targetScene.visible && !targetScene.locked &&
      this.writable && this.canQueueCommand() && canSaveReuse &&
      Number.isInteger(this.currentProjectRevision()) && this.backgroundReady && !this.backgroundFailure &&
      !this.activeStroke && !this.pendingOperation && !this.drawingBusy);
    this.sceneReuseSelect.disabled = !numbering.ok || !this.writable || !sources.size || Boolean(this.pendingOperation) || this.drawingBusy;
    this.sceneReuseButton.disabled = !canWrite;
    this.sceneReuseButton.setAttribute("aria-label", source ? "預覽「" + source.label + "」的場景圖層，確認後複製到目前鏡頭" : "預覽場景複製；請先選擇來源鏡頭");
    this.sceneReuseButton.title = reason;
    this.sceneReuseStatus.textContent = reason;
  };

  DrawingEditor.prototype.drawSceneReusePreview = function (preview, drawing) {
    const context = preview.canvas.getContext("2d");
    const bounds = preview.canvas;
    context.clearRect(0, 0, bounds.width, bounds.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, bounds.width, bounds.height);
    const fitted = fitContain(bounds.width, bounds.height, drawing.canvas.width, drawing.canvas.height);
    context.save();
    context.translate(fitted.x, fitted.y);
    context.scale(fitted.width / drawing.canvas.width, fitted.height / drawing.canvas.height);
    const scene = drawing.layers.find(function (layer) { return layer.kind === "scene"; });
    if (scene && scene.visible) scene.strokes.forEach(function (stroke) { this.drawStroke(context, stroke, drawing.canvas); }, this);
    context.restore();
    preview.canvas.setAttribute("aria-label", preview.heading + "「" + preview.label.textContent + "」的場景筆跡預覽；" + (scene ? scene.strokes.length : 0) + " 筆場景筆跡");
    preview.count.textContent = (scene ? scene.strokes.length : 0) + " 筆場景筆跡" + (scene && !scene.visible ? "（圖層目前隱藏）" : "");
  };

  DrawingEditor.prototype.openSceneReusePreview = function () {
    this.updateSceneReuseControls();
    if (this.sceneReuseButton.disabled || !this.sceneReuseSelect.value) return;
    const project = this.getCurrentProjectSnapshot();
    const numbering = this.resolveSceneReuseNumbering(project);
    const selectedSource = this.sceneReuseSources && this.sceneReuseSources.get(this.sceneReuseSelect.value);
    const sourceDrawing = selectedSource && this.getDrawingSnapshot(selectedSource.drawing.id, project);
    const source = sourceDrawing && { drawing: sourceDrawing };
    const target = this.drawing && (this.isDraft ? clone(this.drawing) : this.getDrawingSnapshot(this.drawing.id, project));
    if (!numbering.ok || !project || !source || !target || source.drawing.id === target.id || source.drawing.shotId === target.shotId) {
      this.setStatus(!numbering.ok ? numbering.message : "無法確認場景來源與目標；請重新載入後再試。", "error");
      return;
    }
    const sourceShot = project.shots.find(function (shot) { return shot.id === source.drawing.shotId; });
    const targetShot = project.shots.find(function (shot) { return shot.id === target.shotId; });
    const orderedShots = this.getOrderedProjectShots(project);
    const sourceOrderIndex = orderedShots.findIndex(function (shot) { return shot.id === source.drawing.shotId; });
    const targetOrderIndex = orderedShots.findIndex(function (shot) { return shot.id === target.shotId; });
    if (!sourceShot || !targetShot || sourceOrderIndex < 0 || sourceOrderIndex >= targetOrderIndex ||
        !Array.isArray(sourceShot.drawingIds) || !sourceShot.drawingIds.includes(source.drawing.id) ||
        !Array.isArray(targetShot.drawingIds) || (this.isDraft ? targetShot.drawingIds.length !== 0 : !targetShot.drawingIds.includes(target.id))) {
      this.setStatus("場景 Drawing 已不再由原鏡頭引用；沒有送出複製。", "error");
      return;
    }
    const sourceLabel = this.sceneReuseShotLabel(project, sourceShot, numbering);
    const targetLabel = this.sceneReuseShotLabel(project, targetShot, numbering);
    const sourceScene = source.drawing.layers.find(function (layer) { return layer.kind === "scene"; });
    const targetScene = target.layers.find(function (layer) { return layer.kind === "scene"; });
    if (!sourceScene || !targetScene) {
      this.setStatus("找不到來源或目標場景圖層；沒有送出複製。", "error");
      return;
    }
    this.sceneReusePreview = {
      baseRevision: project.revision,
      sourceDrawing: clone(source.drawing),
      sourceLabel: sourceLabel,
      targetDrawing: target,
      targetLabel: targetLabel,
      restoreFocus: document.activeElement
    };
    this.sceneReuseDialogTitle.textContent = "複製場景圖層預覽";
    this.sceneReuseSourcePanel.label.textContent = sourceLabel;
    this.sceneReuseTargetPanel.label.textContent = targetLabel;
    this.sceneReuseSourcePanel.heading = "來源場景";
    this.sceneReuseTargetPanel.heading = "目前目標場景";
    this.drawSceneReusePreview(this.sceneReuseSourcePanel, source.drawing);
    this.drawSceneReusePreview(this.sceneReuseTargetPanel, target);
    this.sceneReuseDifference.textContent = "來源 " + sourceScene.strokes.length + " 筆 → 目標 " + targetScene.strokes.length + " 筆。確認後目標場景會以來源內容取代；目標人物動作、場景圖層設定與照片底圖保留。";
    this.sceneReuseConfirmButton.disabled = !this.canReuseSceneWithPreview(this.sceneReusePreview);
    if (typeof this.sceneReuseDialog.showModal === "function") this.sceneReuseDialog.showModal();
    else this.sceneReuseDialog.setAttribute("open", "");
    this.sceneReuseCancelButton.focus({ preventScroll: true });
  };

  DrawingEditor.prototype.canReuseSceneWithPreview = function (preview) {
    const targetScene = preview && preview.targetDrawing && preview.targetDrawing.layers.find(function (layer) { return layer.kind === "scene"; });
    const canSave = this.canCreateFromDraft() || this.model && typeof this.model.reuseSceneLayer === "function";
    return Boolean(preview && targetScene && targetScene.visible && !targetScene.locked && this.writable && this.canQueueCommand() &&
      canSave && Number.isInteger(preview.baseRevision) &&
      this.backgroundReady && !this.backgroundFailure && !this.activeStroke && !this.pendingOperation && !this.drawingBusy);
  };

  DrawingEditor.prototype.closeSceneReusePreview = function () {
    if (!this.sceneReuseDialog) return;
    if (this.sceneReuseDialog.open && typeof this.sceneReuseDialog.close === "function") this.sceneReuseDialog.close();
    else {
      const restore = this.sceneReusePreview && this.sceneReusePreview.restoreFocus;
      this.sceneReuseDialog.removeAttribute("open");
      this.sceneReusePreview = null;
      if (restore && typeof restore.focus === "function") restore.focus({ preventScroll: true });
    }
  };

  DrawingEditor.prototype.confirmSceneReuse = function () {
    const preview = this.sceneReusePreview;
    if (!preview) return;
    const projectAtConfirm = this.getCurrentProjectSnapshot();
    const numberingAtConfirm = this.resolveSceneReuseNumbering(projectAtConfirm);
    if (!numberingAtConfirm.ok || !projectAtConfirm || projectAtConfirm.revision !== preview.baseRevision) {
      this.closeSceneReusePreview();
      this.setStatus(!numberingAtConfirm.ok ? numberingAtConfirm.message : "場景複用預覽已過期；鏡次或專案資料已更新，未套用任何內容。請重新預覽後重試。", "error");
      this.updateControls();
      this.render();
      return;
    }
    if (!this.canReuseSceneWithPreview(preview)) return;
    const targetScene = preview.targetDrawing.layers.find(function (layer) { return layer.kind === "scene"; });
    if (this.isDraft) {
      const project = this.getCurrentProjectSnapshot();
      const source = project && this.getDrawingSnapshot(preview.sourceDrawing.id, project);
      if (!project || project.revision !== preview.baseRevision || this.currentProjectRevision() !== preview.baseRevision ||
          !source || JSON.stringify(source) !== JSON.stringify(preview.sourceDrawing)) {
        this.closeSceneReusePreview();
        this.setStatus("場景複用預覽已過期；來源或專案資料已更新，未套用任何內容。請重新預覽後重試。", "error");
        this.updateControls();
        this.render();
        return;
      }
      const sourceDrawingId = preview.sourceDrawing.id;
      this.sceneReusePreview = null;
      if (this.sceneReuseDialog.open && typeof this.sceneReuseDialog.close === "function") this.sceneReuseDialog.close();
      else this.sceneReuseDialog.removeAttribute("open");
      this.createFromDraft({ kind: "reuseScene", sourceDrawingId: sourceDrawingId });
      return;
    }
    const sourceStrokeIds = new Set();
    const allStrokeIds = new Set();
    const project = this.getCurrentProjectSnapshot();
    if (project && Array.isArray(project.drawings)) project.drawings.forEach(function (drawing) {
      drawing.layers.forEach(function (layer) { layer.strokes.forEach(function (stroke) { allStrokeIds.add(stroke.id); }); });
    });
    preview.sourceDrawing.layers.forEach(function (layer) { layer.strokes.forEach(function (stroke) { sourceStrokeIds.add(stroke.id); }); });
    sourceStrokeIds.forEach(function (id) { allStrokeIds.add(id); });
    this.pendingOperation = {
      kind: "reuseScene",
      projectId: this.capturedProjectId,
      shotId: preview.targetDrawing.shotId,
      baseRevision: preview.baseRevision,
      drawingRevision: preview.targetDrawing.revision,
      drawingId: preview.targetDrawing.id,
      layerId: targetScene.id,
      sourceDrawingId: preview.sourceDrawing.id,
      sourceDrawingRevision: preview.sourceDrawing.revision,
      sourceDrawingSnapshot: clone(preview.sourceDrawing),
      targetDrawingSnapshot: clone(preview.targetDrawing),
      sourceStrokeIds: sourceStrokeIds,
      originalStrokeIds: allStrokeIds
    };
    this.sceneReusePreview = null;
    if (this.sceneReuseDialog.open && typeof this.sceneReuseDialog.close === "function") this.sceneReuseDialog.close();
    else this.sceneReuseDialog.removeAttribute("open");
    this.submitPending();
  };

  DrawingEditor.prototype.updateControls = function () {
    const activeLayer = this.activeLayer();
    this.layerButtons.forEach(function (control, kind) {
      const layer = this.findLayer(kind);
      control.disabled = !layer || this.pendingOperation !== null || this.drawingBusy;
      control.setAttribute("aria-pressed", String(Boolean(layer && activeLayer && layer.id === activeLayer.id)));
      control.textContent = layer ? (kind === "scene" ? "場景" : "人物動作") + (layer.visible ? " · 顯示" : " · 隱藏") + (layer.locked ? " · 鎖定" : " · 可編輯") : "圖層";
      control.setAttribute("aria-label", control.textContent);
      control.title = layer ? "已保存狀態：" + (layer.visible ? "顯示" : "隱藏") + "、" + (layer.locked ? "鎖定" : "未鎖定") : "尚未載入圖層";
    }, this);
    this.layerStateButtons.forEach(function (controls, kind) {
      const layer = this.findLayer(kind);
      const name = kind === "scene" ? "場景" : "人物動作";
      const canWrite = this.canWriteLayerState(kind);
      controls.visibility.disabled = !canWrite;
      controls.visibility.textContent = layer ? (layer.visible ? "隱藏 " : "顯示 ") + name : "顯示／隱藏 " + name;
      controls.visibility.setAttribute("aria-label", layer ? (layer.visible ? "隱藏" : "顯示") + name + " 圖層；目前" + (layer.visible ? "顯示" : "隱藏") : "顯示／隱藏" + name + "圖層；尚未載入");
      controls.visibility.setAttribute("aria-pressed", String(Boolean(layer && layer.visible)));
      controls.visibility.title = layer ? "已保存狀態：" + (layer.visible ? "顯示" : "隱藏") : "尚未載入圖層";
      controls.lock.disabled = !canWrite;
      controls.lock.textContent = layer ? (layer.locked ? "解鎖 " : "鎖定 ") + name : "鎖定／解鎖 " + name;
      controls.lock.setAttribute("aria-label", layer ? (layer.locked ? "解鎖" : "鎖定") + name + " 圖層；目前" + (layer.locked ? "鎖定" : "可編輯") : "鎖定／解鎖" + name + "圖層；尚未載入");
      controls.lock.setAttribute("aria-pressed", String(Boolean(layer && layer.locked)));
      controls.lock.title = layer ? "已保存狀態：" + (layer.locked ? "鎖定" : "未鎖定") : "尚未載入圖層";
    }, this);
    const activeLayerName = activeLayer ? (activeLayer.kind === "scene" ? "場景" : "人物動作") : "作用圖層";
    this.clearLayerButton.disabled = !this.canClearActiveLayer();
    this.clearLayerButton.textContent = "清空 " + activeLayerName;
    this.clearLayerButton.setAttribute("aria-label", "清空" + activeLayerName + "圖層中的全部筆跡；執行前會要求確認，並可復原");
    this.clearLayerButton.title = activeLayer ? "只清空目前作用圖層的全部筆跡；相片底圖和另一圖層不會改變" : "尚未載入作用圖層";
    this.toolButtons.forEach(function (control, tool) {
      const hasCommand = tool === "eraser"
        ? this.model && typeof this.model.eraseDrawingStroke === "function"
        : this.canCreateFromDraft() || this.model && typeof this.model.appendDrawingStroke === "function";
      const canVerifyTarget = this.model && (typeof this.model.getDrawing === "function" || typeof this.model.getProject === "function");
      control.disabled = !this.drawing || !activeLayer || !this.writable || !this.canQueueCommand() || !hasCommand || !canVerifyTarget || !Number.isInteger(this.currentProjectRevision()) || !this.backgroundReady || Boolean(this.backgroundFailure) || Boolean(this.pendingOperation) || this.drawingBusy;
      control.setAttribute("aria-pressed", String(this.tool === tool));
    }, this);
    this.colorInput.disabled = !this.writable || Boolean(this.pendingOperation) || this.drawingBusy;
    this.widthInput.disabled = !this.writable || Boolean(this.pendingOperation) || this.drawingBusy;
    this.inputSelect.disabled = !this.writable || Boolean(this.pendingOperation) || this.drawingBusy;
    this.focusButton.disabled = this.mode === "focus";
    this.splitButton.disabled = this.mode === "split";
    this.zoomOutButton.disabled = !this.drawing || this.viewTransform.scale <= 1.001;
    this.zoomInButton.disabled = !this.drawing || this.viewTransform.scale >= 3.999;
    this.fitCanvasButton.disabled = !this.drawing || this.viewTransform.scale <= 1.001 && this.viewTransform.x === 0 && this.viewTransform.y === 0;
    const zoomPercent = Math.round(this.viewTransform.scale * 100);
    this.zoomOutButton.setAttribute("aria-label", "縮小畫布，目前 " + zoomPercent + "%");
    this.zoomInButton.setAttribute("aria-label", "放大畫布，目前 " + zoomPercent + "%");
    this.fitCanvasButton.setAttribute("aria-label", "將畫布調整為適合檢視；目前 " + zoomPercent + "%");
    this.undoButton.disabled = !this.canWriteHistory("undo") || !(typeof this.model.canUndo === "function" ? this.model.canUndo() : true);
    this.redoButton.disabled = !this.canWriteHistory("redo") || !(typeof this.model.canRedo === "function" ? this.model.canRedo() : true);
    this.updateSceneReuseControls();
    this.backButton.disabled = Boolean(this.drawingBusy || this.pendingOperation);
    this.retryButton.hidden = !this.pendingOperation || Boolean(this.pendingOperation.committed) || Boolean(this.pendingOperation.reloadRequired);
    if (this.pendingOperation && this.pendingOperation.queued && (!this.model || typeof this.model.retryPending !== "function")) this.retryButton.hidden = true;
    this.retryButton.disabled = !this.pendingOperation || Boolean(this.pendingOperation.queued && (!this.model || typeof this.model.retryPending !== "function")) || this.drawingBusy;
    this.discardButton.hidden = !this.canDiscardFailedCandidate();
    this.discardButton.disabled = this.drawingBusy;
    this.reloadButton.hidden = !this.readDrawing || Boolean(this.drawing && !(this.pendingOperation && (this.pendingOperation.readFailed || this.pendingOperation.reloadRequired)));
    this.changeBackgroundButton.hidden = !this.model || !this.canCreateFromDraft() && typeof this.model.setDrawingBackground !== "function" || typeof this.model.getProject !== "function";
    this.changeBackgroundButton.disabled = !this.canOpenBackgroundChange();
    this.changeBackgroundButton.title = this.writable
      ? (this.drawing && this.drawing.backgroundAssetId ? "預覽並確認此鏡頭的新照片底圖；目前照片和筆跡不會被修改" : "預覽並確認此鏡頭的新照片底圖")
      : "唯讀瀏覽；重新取得編輯權後才能更換並保存底圖。";
    if (this.backgroundAssetSelect) {
      this.backgroundAssetSelect.disabled = !this.canWriteBackgroundChange() || this.drawingBusy || Boolean(this.pendingOperation);
      this.backgroundChangeCancelButton.disabled = this.drawingBusy;
      this.backgroundChangeConfirmButton.disabled = !this.canCommitBackgroundChange();
    }
    this.retryBackgroundButton.disabled = this.drawingBusy;
    this.featureNote.hidden = false;
    this.headerActions.hidden = this.retryButton.hidden && this.discardButton.hidden && this.reloadButton.hidden;
    const missingCommands = [];
    if (!this.model || typeof this.model.appendDrawingStroke !== "function" || typeof this.model.eraseDrawingStroke !== "function") missingCommands.push("筆畫與橡皮功能尚未就緒");
    if (!this.model || typeof this.model.getDrawing !== "function" && typeof this.model.getProject !== "function") missingCommands.push("手繪內容讀取功能尚未就緒");
    const unavailableLayerFeatures = [];
    if (!this.model || typeof this.model.clearDrawingLayer !== "function") unavailableLayerFeatures.push("清空圖層功能尚未就緒");
    if (!this.model || typeof this.model.setDrawingLayerState !== "function") unavailableLayerFeatures.push("圖層顯示與鎖定功能尚未就緒");
    this.featureNote.textContent = this.isDraft
      ? "此鏡頭尚未建立手繪內容；返回鏡頭不會保存空白畫布。第一次繪製或調整設定時自動保存。"
      : unavailableLayerFeatures.length
      ? unavailableLayerFeatures.join("；") + "，相關操作已停用。"
      : "圖層清空、顯示與鎖定都會自動保存，並可復原。";
    if (!this.writable) this.hint.textContent = "唯讀：" + (this.readOnlyReason || "目前沒有編輯權。") + " 兩指可縮放／平移，也可用畫布檢視按鈕。照片僅供參考；壓力感應尚未啟用。";
    else if (missingCommands.length) this.hint.textContent = missingCommands.join("；") + "，目前不接受筆畫輸入。";
    else if (activeLayer && (!activeLayer.visible || activeLayer.locked)) this.hint.textContent = "目前作用圖層" + (activeLayer.visible ? "已顯示" : "已隱藏") + (activeLayer.locked ? "且已鎖定" : "") + "；可使用圖層設定控制顯示與鎖定狀態。兩指可縮放／平移。";
    else this.hint.textContent = "兩指可縮放／平移，也可用畫布檢視按鈕。照片僅供參考；線寬以畫布像素保存。壓力感應尚未啟用。";
    this.updateCanvasLabel();
  };

  DrawingEditor.prototype.canDiscardFailedCandidate = function () {
    if (!this.pendingOperation || this.pendingOperation.committed || !this.pendingOperation.error || !this.model || typeof this.model.getLifecycle !== "function") return false;
    const error = this.pendingOperation.error;
    if (error.storageStage === true || ["COMMIT_UNCERTAIN", "LEASE_LOST", "LEASE_CONFLICT", "REVISION_CONFLICT"].includes(error.code)) return false;
    const lifecycle = this.model.getLifecycle();
    return Boolean(lifecycle && lifecycle.pendingCount === 0 && lifecycle.phase !== "save_failed");
  };

  DrawingEditor.prototype.discardFailedCandidate = function () {
    if (!this.canDiscardFailedCandidate()) return;
    const operation = this.pendingOperation;
    const labels = {
      createDrawing: "這次尚未保存的手繪建立與初始編輯",
      append: "這筆尚未保存的筆畫",
      erase: "這筆尚未保存的橡皮操作",
      clear: "這次未保存的圖層清空操作",
      layerState: "這次未保存的圖層設定",
      reuseScene: "這次未保存的場景沿用操作",
      background: "這次未保存的照片底圖更換操作",
      history: "這次未保存的復原／重做操作"
    };
    const label = labels[operation.kind] || "這次未保存的操作";
    if (typeof window === "undefined" || typeof window.confirm !== "function" || !window.confirm("確定取消" + label + "？已保存的內容不會改變。")) return;
    if (!this.canDiscardFailedCandidate() || this.pendingOperation !== operation) return;
    this.pendingOperation = null;
    if (operation.kind === "background" || operation.kind === "createDrawing" && operation.initialEdit.kind === "background") this.closeBackgroundChangeDialog();
    if (operation.kind === "createDrawing" && operation.initialEdit.kind === "reuseScene") this.closeSceneReusePreview();
    this.setStatus("已取消尚未保存的操作；已保存內容未變。", "info");
    this.updateControls();
    this.render();
  };

  DrawingEditor.prototype.retryBackground = async function () {
    if (!this.drawing || !this.drawing.backgroundAssetId || this.drawingBusy) return;
    const drawingId = this.drawing.id;
    const assetId = this.drawing.backgroundAssetId;
    this.backgroundAssetId = undefined;
    this.backgroundFailure = null;
    this.backgroundReady = false;
    this.setStatus("正在重新載入照片…", "loading");
    this.updateControls();
    const pending = this.refreshBackground();
    const generation = this.backgroundRequests.generation;
    await pending;
    if (this.destroyed || !this.backgroundRequests.isCurrent(generation) || !this.drawing || this.drawing.id !== drawingId || this.drawing.backgroundAssetId !== assetId) return;
    if (this.backgroundFailure) this.setStatus("照片載入失敗；目前暫停編輯。", "error");
    else this.setStatus(this.writable ? "照片已載入；可繼續編輯。" : "唯讀：" + this.readOnlyReason, this.writable ? "saved" : "readonly");
    this.updateControls();
  };

  DrawingEditor.prototype.updateCanvasLabel = function () {
    const layer = this.activeLayer();
    const layerName = layer ? (layer.kind === "scene" ? "場景圖層" : "人物動作圖層") : "未選取圖層";
    const toolName = this.tool === "cameraArrow" ? "運鏡箭頭" : this.tool === "eraser" ? "逐筆橡皮" : "自由筆";
    const inputName = this.inputMode === "pen" ? "筆優先輸入，手指繪圖停用" : "手指與滑鼠繪圖";
    const label = this.shotLabel + "；" + layerName + "；" + toolName + "；" + inputName + "；兩指可縮放／平移，畫布檢視按鈕可重設；照片為鎖定參考";
    this.canvas.setAttribute("aria-label", label);
    this.canvasInstructions.textContent = label;
  };

  DrawingEditor.prototype.setStatus = function (text, kind) {
    this.statusText = text;
    this.statusKind = kind || "info";
    this.status.textContent = text;
    this.status.dataset.kind = this.statusKind;
    this.notifyState();
  };

  DrawingEditor.prototype.notifyState = function () {
    if (!this.onStateChange) return;
    let lifecycle = null;
    try { lifecycle = this.model && typeof this.model.getLifecycle === "function" ? this.model.getLifecycle() : null; }
    catch (_) { lifecycle = null; }
    try {
      this.onStateChange({
        status: this.statusText,
        statusKind: this.statusKind,
        writable: this.writable,
        readOnlyReason: this.writable ? null : this.readOnlyReason,
        projectId: this.capturedProjectId,
        shotId: this.capturedShotId,
        drawingId: this.isDraft ? null : this.drawing && this.drawing.id || this.initialDrawing && this.initialDrawing.id || null,
        draft: this.isDraft,
        revision: this.drawing && this.drawing.revision,
        pending: Boolean(this.pendingOperation),
        pendingCount: lifecycle && lifecycle.pendingCount,
        modelPhase: lifecycle && lifecycle.phase,
        modelSaveStatus: lifecycle && lifecycle.saveStatus,
        modelError: lifecycle && lifecycle.error || null
      });
    } catch (_) { /* host observation must not affect Model commands */ }
  };

  DrawingEditor.prototype.setMode = function (mode) {
    if (this.activeStroke) this.cancelActiveStroke("檢視模式已切換，未完成筆畫已取消。");
    this.clearTouchInteraction(false);
    this.mode = mode;
    this.workspace.classList.toggle("ds-de-focus", mode === "focus");
    this.workspace.classList.toggle("ds-de-split", mode === "split");
    this.clampViewTransform();
    this.updateControls();
    this.render();
  };

  DrawingEditor.prototype.displayRect = function (bounds, view) {
    if (!this.drawing || !bounds || !bounds.width || !bounds.height) return null;
    const canvas = this.drawing.canvas;
    const fitted = fitContain(bounds.width, bounds.height, canvas.width, canvas.height);
    const transform = view || this.viewTransform;
    const scale = clamp(Number(transform.scale) || 1, 1, 4);
    const centerX = bounds.width / 2;
    const centerY = bounds.height / 2;
    return {
      x: centerX + (fitted.x - centerX) * scale + (Number(transform.x) || 0),
      y: centerY + (fitted.y - centerY) * scale + (Number(transform.y) || 0),
      width: fitted.width * scale,
      height: fitted.height * scale,
      scale: fitted.scale * scale
    };
  };

  DrawingEditor.prototype.clampViewTransform = function (bounds) {
    if (!this.drawing || !this.viewTransform) return;
    const rect = bounds || this.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const fitted = fitContain(rect.width, rect.height, this.drawing.canvas.width, this.drawing.canvas.height);
    this.viewTransform.scale = clamp(Number(this.viewTransform.scale) || 1, 1, 4);
    const maxX = Math.max(0, (fitted.width * this.viewTransform.scale - rect.width) / 2);
    const maxY = Math.max(0, (fitted.height * this.viewTransform.scale - rect.height) / 2);
    this.viewTransform.x = clamp(Number(this.viewTransform.x) || 0, -maxX, maxX);
    this.viewTransform.y = clamp(Number(this.viewTransform.y) || 0, -maxY, maxY);
  };

  DrawingEditor.prototype.zoomBy = function (factor) {
    if (!this.drawing || !Number.isFinite(factor) || factor <= 0) return;
    if (this.activeStroke) this.cancelActiveStroke("畫布檢視已改變，未完成筆畫已取消。");
    this.clearTouchInteraction(false);
    this.viewTransform.scale = clamp(this.viewTransform.scale * factor, 1, 4);
    this.clampViewTransform();
    this.updateControls();
    this.render();
  };

  DrawingEditor.prototype.fitCanvasToView = function () {
    if (!this.drawing) return;
    if (this.activeStroke) this.cancelActiveStroke("畫布檢視已改變，未完成筆畫已取消。");
    this.clearTouchInteraction(false);
    this.viewTransform = { scale: 1, x: 0, y: 0 };
    this.updateControls();
    this.render();
  };

  DrawingEditor.prototype.clearTouchInteraction = function (resetView) {
    this.touchPointers.clear();
    this.touchGesture = null;
    this.touchEraserCandidate = null;
    this.eraserPointer = null;
    if (resetView) this.viewTransform = { scale: 1, x: 0, y: 0 };
    else this.clampViewTransform();
  };

  DrawingEditor.prototype.beginTouchGesture = function (event) {
    if (this.touchGesture || this.touchPointers.size < 2) return;
    if (!this.anchorTouchGesture()) return;
    if (this.activeStroke && this.activeStroke.pointerType === "touch") {
      this.cancelActiveStroke("雙指檢視開始；尚未保存的手指筆畫已取消。", { releaseCapture: false, keepTouchTracking: true });
    } else if (this.touchEraserCandidate) {
      this.setStatus("雙指檢視開始；手指橡皮尚未執行。", "info");
    }
    this.touchEraserCandidate = null;
    this.eraserPointer = null;
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    this.render();
  };

  DrawingEditor.prototype.anchorTouchGesture = function () {
    if (this.touchPointers.size < 2) {
      this.touchGesture = null;
      return false;
    }
    const pointers = Array.from(this.touchPointers.entries()).slice(0, 2);
    const first = pointers[0] && pointers[0][1];
    const second = pointers[1] && pointers[1][1];
    const bounds = this.stage.getBoundingClientRect();
    const center = midpoint(first, second);
    const initialRect = this.displayRect(bounds);
    if (!initialRect) {
      this.touchGesture = null;
      return false;
    }
    this.touchGesture = {
      pointerIds: new Set([pointers[0][0], pointers[1][0]]),
      startDistance: Math.max(1, distanceBetween(first, second)),
      startView: { scale: this.viewTransform.scale, x: this.viewTransform.x, y: this.viewTransform.y },
      anchor: {
        x: (center.x - bounds.left - initialRect.x) / initialRect.width,
        y: (center.y - bounds.top - initialRect.y) / initialRect.height
      }
    };
    return true;
  };

  DrawingEditor.prototype.updateTouchGesture = function (event) {
    const gesture = this.touchGesture;
    if (!gesture || !gesture.pointerIds.has(event.pointerId)) return false;
    const pointers = Array.from(gesture.pointerIds).map(function (id) { return this.touchPointers.get(id); }, this);
    if (!pointers[0] || !pointers[1]) return true;
    const bounds = this.stage.getBoundingClientRect();
    const center = midpoint(pointers[0], pointers[1]);
    const scale = clamp(gesture.startView.scale * distanceBetween(pointers[0], pointers[1]) / gesture.startDistance, 1, 4);
    const centeredRect = this.displayRect(bounds, { scale: scale, x: 0, y: 0 });
    this.viewTransform = {
      scale: scale,
      x: center.x - bounds.left - centeredRect.x - gesture.anchor.x * centeredRect.width,
      y: center.y - bounds.top - centeredRect.y - gesture.anchor.y * centeredRect.height
    };
    this.clampViewTransform(bounds);
    this.updateControls();
    this.render();
    if (typeof event.preventDefault === "function") event.preventDefault();
    return true;
  };

  DrawingEditor.prototype.forgetTouchPointer = function (event) {
    const pointerId = event && event.pointerId;
    if (!Number.isFinite(pointerId)) return false;
    const tracked = this.touchPointers.has(pointerId);
    if (tracked) this.touchPointers.delete(pointerId);
    if (this.touchEraserCandidate && this.touchEraserCandidate.pointerId === pointerId) {
      this.touchEraserCandidate = null;
      this.eraserPointer = null;
    }
    if (this.touchGesture && this.touchGesture.pointerIds.has(pointerId)) this.anchorTouchGesture();
    return tracked;
  };

  DrawingEditor.prototype.pointerInterrupted = function (event, message) {
    if (this.destroyed) return;
    const wasGesture = this.touchGesture && this.touchGesture.pointerIds.has(event.pointerId);
    this.forgetTouchPointer(event);
    if (wasGesture) {
      this.render();
      return;
    }
    if (this.activeStroke && this.activeStroke.pointerId === event.pointerId) {
      const wasPen = this.activeStroke.pointerType !== "touch";
      this.cancelActiveStroke(message);
      if (wasPen && this.touchGesture) this.anchorTouchGesture();
    }
  };

  DrawingEditor.prototype.contentRect = function () {
    const bounds = this.stage.getBoundingClientRect();
    const fitted = this.displayRect(bounds);
    return fitted ? { x: bounds.left + fitted.x, y: bounds.top + fitted.y, width: fitted.width, height: fitted.height, scale: fitted.scale } : null;
  };

  DrawingEditor.prototype.pointerPoint = function (event) {
    const rect = this.contentRect();
    return rect ? clientToNormalized(event.clientX, event.clientY, rect) : null;
  };

  DrawingEditor.prototype.acceptsPointer = function (event) {
    if (event.pointerType === "mouse" || event.pointerType === "pen") return true;
    return event.pointerType === "touch" && this.inputMode === "touch";
  };

  DrawingEditor.prototype.isCurrentTouchEraserCandidate = function (candidate) {
    return Boolean(candidate && this.tool === "eraser" && this.isEditable()
      && candidate.drawingId === (this.drawing && this.drawing.id)
      && candidate.projectId === this.capturedProjectId
      && candidate.projectRevision === this.currentProjectRevision()
      && candidate.drawingRevision === (this.drawing && this.drawing.revision)
      && candidate.layerId === this.layerId);
  };

  DrawingEditor.prototype.pointerDown = function (event) {
    if (this.destroyed) return;
    if (event.pointerType === "touch") {
      if (this.activeStroke && this.activeStroke.pointerType !== "touch") return;
      this.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.touchGesture) {
        if (typeof event.preventDefault === "function") event.preventDefault();
        return;
      }
      if (this.touchPointers.size >= 2) {
        this.beginTouchGesture(event);
        return;
      }
    }
    if (!this.isEditable() || !event.isPrimary || this.activeStroke) return;
    if (!this.acceptsPointer(event)) {
      this.setStatus("筆優先模式已停用手指繪圖；可在「輸入方式」切換。", "info");
      return;
    }
    const layer = this.activeLayer();
    const point = this.pointerPoint(event);
    if (!point || !layer) return;
    if (this.tool === "eraser") {
      if (event.pointerType === "touch") {
        this.touchEraserCandidate = {
          pointerId: event.pointerId,
          point: point,
          drawingId: this.drawing.id,
          projectId: this.capturedProjectId,
          projectRevision: this.currentProjectRevision(),
          drawingRevision: this.drawing.revision,
          layerId: layer.id
        };
        const bounds = this.stage.getBoundingClientRect();
        this.eraserPointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, pointerType: event.pointerType };
        this.render();
      } else this.eraseAt(point, event.pointerType);
      return;
    }
    const projectRevision = this.currentProjectRevision();
    if (!Number.isInteger(projectRevision)) {
      this.setStatus("目前無法確認編輯狀態，畫布維持唯讀。", "error");
      return;
    }
    const capture = {
      pointerId: event.pointerId,
      drawingId: this.drawing.id,
      projectId: this.capturedProjectId,
      projectRevision: projectRevision,
      drawingRevision: this.drawing.revision,
      layerId: layer.id,
      tool: this.tool,
      pointerType: event.pointerType,
      color: this.color,
      baseWidth: this.baseWidth,
      startedAt: Number.isFinite(event.timeStamp) ? event.timeStamp : Date.now(),
      points: [this.makePoint(point, 0)]
    };
    this.activeStroke = capture;
    try { this.canvas.setPointerCapture(event.pointerId); }
    catch (_) {
      this.cancelActiveStroke("瀏覽器無法捕捉指標，未完成筆畫已取消。");
      return;
    }
    event.preventDefault();
    this.render();
  };

  DrawingEditor.prototype.makePoint = function (point, time) {
    return { x: point.x, y: point.y, t: Math.max(0, time), pressure: null };
  };

  DrawingEditor.prototype.pointerMove = function (event) {
    if (this.destroyed) return;
    if (event.pointerType === "touch" && this.touchPointers.has(event.pointerId)) {
      this.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.touchGesture) {
        if (this.activeStroke && this.activeStroke.pointerType !== "touch") {
          if (typeof event.preventDefault === "function") event.preventDefault();
          return;
        }
        this.updateTouchGesture(event);
        return;
      }
      if (this.touchEraserCandidate && this.touchEraserCandidate.pointerId === event.pointerId) {
        if (!this.isCurrentTouchEraserCandidate(this.touchEraserCandidate)) {
          this.touchEraserCandidate = null;
          this.eraserPointer = null;
          this.render();
          return;
        }
        const point = this.pointerPoint(event);
        if (point) this.touchEraserCandidate.point = point;
        const bounds = this.stage.getBoundingClientRect();
        this.eraserPointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, pointerType: event.pointerType };
        this.render();
        return;
      }
    }
    const active = this.activeStroke;
    if (!active) {
      if (this.tool === "eraser" && this.acceptsPointer(event)) {
        const bounds = this.stage.getBoundingClientRect();
        this.eraserPointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, pointerType: event.pointerType };
        this.render();
      }
      return;
    }
    if (active.pointerId !== event.pointerId) return;
    const point = this.pointerPoint(event);
    if (!point) return;
    const time = Math.max(active.points[active.points.length - 1].t, (Number.isFinite(event.timeStamp) ? event.timeStamp : Date.now()) - active.startedAt);
    const last = active.points[active.points.length - 1];
    if (last.x === point.x && last.y === point.y && last.t === time) return;
    active.points.push(this.makePoint(point, time));
    this.render();
    event.preventDefault();
  };

  DrawingEditor.prototype.pointerUp = function (event) {
    if (this.destroyed) return;
    const trackedTouch = event.pointerType === "touch" && this.touchPointers.has(event.pointerId);
    if (event.pointerType === "touch" && this.touchGesture) {
      if (trackedTouch) this.forgetTouchPointer(event);
      this.touchEraserCandidate = null;
      this.render();
      if (typeof event.preventDefault === "function") event.preventDefault();
      return;
    }
    if (this.touchEraserCandidate && this.touchEraserCandidate.pointerId === event.pointerId) {
      const candidate = this.touchEraserCandidate;
      this.touchEraserCandidate = null;
      if (trackedTouch) this.forgetTouchPointer(event);
      this.eraserPointer = null;
      if (this.isCurrentTouchEraserCandidate(candidate) && this.acceptsPointer(event)) {
        this.eraseAt(this.pointerPoint(event) || candidate.point, event.pointerType);
      } else this.render();
      return;
    }
    if (trackedTouch) this.forgetTouchPointer(event);
    const active = this.activeStroke;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = this.pointerPoint(event);
    if (point) {
      const last = active.points[active.points.length - 1];
      const time = Math.max(last.t, (Number.isFinite(event.timeStamp) ? event.timeStamp : Date.now()) - active.startedAt);
      if (last.x !== point.x || last.y !== point.y || active.points.length < 2) active.points.push(this.makePoint(point, time));
    }
    if (active.points.length < 2) active.points.push(clone(active.points[0]));
    this.activeStroke = null;
    try { if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId); } catch (_) { /* capture can already be gone on pointerup */ }
    if (this.touchGesture && active.pointerType !== "touch") this.anchorTouchGesture();
    const draft = {
      kind: active.tool === "cameraArrow" ? "cameraArrow" : "pen",
      color: active.color,
      baseWidth: active.baseWidth,
      points: active.tool === "cameraArrow" ? [active.points[0], active.points[active.points.length - 1]] : active.points
    };
    const currentLayer = this.activeLayer();
    if (active.drawingId !== (this.drawing && this.drawing.id) || active.projectId !== this.capturedProjectId || active.layerId !== this.layerId || active.projectRevision !== this.currentProjectRevision() || active.drawingRevision !== (this.drawing && this.drawing.revision) || !currentLayer || !currentLayer.visible || currentLayer.locked || !this.writable) {
      this.setStatus("目標已改變，未完成筆畫已取消。", "info");
      this.render();
      return;
    }
    if (this.isDraft) {
      this.createFromDraft({ kind: "stroke", layerKind: currentLayer.kind, strokeDraft: clone(draft) });
      return;
    }
    this.pendingOperation = { kind: "append", projectId: active.projectId, shotId: this.capturedShotId, baseRevision: active.projectRevision, drawingRevision: active.drawingRevision, drawingId: active.drawingId, layerId: active.layerId, strokeDraft: clone(draft), originalStrokeIds: this.collectStrokeIds() };
    this.submitPending();
  };

  DrawingEditor.prototype.collectStrokeIds = function () {
    const ids = new Set();
    if (this.drawing) this.drawing.layers.forEach(function (layer) { layer.strokes.forEach(function (stroke) { ids.add(stroke.id); }); });
    return ids;
  };

  DrawingEditor.prototype.cancelActiveStroke = function (message, options) {
    if (!this.activeStroke) return;
    const active = this.activeStroke;
    this.activeStroke = null;
    if (active.pointerType === "touch" && !(options && options.keepTouchTracking)) {
      this.touchPointers.clear();
      this.touchGesture = null;
      this.touchEraserCandidate = null;
    }
    try {
      if (!(options && options.releaseCapture === false) && this.canvas.hasPointerCapture(active.pointerId)) this.canvas.releasePointerCapture(active.pointerId);
    } catch (_) { /* capture may already be released */ }
    if (message) this.setStatus(message, "info");
    this.render();
  };

  DrawingEditor.prototype.runLayerState = function (kind, patch) {
    const layer = this.findLayer(kind);
    if (!layer || !this.canWriteLayerState(kind)) return false;
    if (this.activeStroke) this.cancelActiveStroke("圖層設定已變更，未完成筆畫已取消。");
    if (this.isDraft) return this.createFromDraft({ kind: "layerState", layerKind: kind, patch: clone(patch) });
    const projectRevision = this.currentProjectRevision();
    if (!Number.isInteger(projectRevision)) {
      this.setStatus("目前無法確認編輯狀態；圖層設定未變更。", "error");
      return false;
    }
    this.pendingOperation = {
      kind: "layerState",
      projectId: this.capturedProjectId,
      shotId: this.capturedShotId,
      baseRevision: projectRevision,
      drawingRevision: this.drawing.revision,
      drawingId: this.drawing.id,
      layerId: layer.id,
      layerPatch: clone(patch),
      originalStrokeIds: this.collectStrokeIds()
    };
    return this.submitPending();
  };

  DrawingEditor.prototype.clearActiveLayer = function () {
    const layer = this.activeLayer();
    if (!layer || !this.canClearActiveLayer()) return false;
    if (typeof window === "undefined" || typeof window.confirm !== "function") {
      this.setStatus("目前環境無法顯示確認視窗；圖層未變更。", "error");
      return false;
    }
    const label = layer.kind === "scene" ? "場景" : "人物動作";
    const count = layer.strokes.length;
    if (!window.confirm("確定清空目前的「" + label + "」圖層？將移除 " + count + " 筆筆跡；此操作可用復原還原。照片底圖與另一圖層不會改變。")) {
      this.setStatus("已取消清空；圖層未變更。", "info");
      return false;
    }
    if (this.activeLayer() !== layer || !this.canClearActiveLayer()) return false;
    const projectRevision = this.currentProjectRevision();
    if (!Number.isInteger(projectRevision)) {
      this.setStatus("目前無法確認編輯狀態；圖層未變更。", "error");
      return false;
    }
    this.pendingOperation = {
      kind: "clear",
      projectId: this.capturedProjectId,
      shotId: this.capturedShotId,
      baseRevision: projectRevision,
      drawingRevision: this.drawing.revision,
      drawingId: this.drawing.id,
      layerId: layer.id,
      originalLayer: clone(layer),
      originalStrokeIds: this.collectStrokeIds()
    };
    return this.submitPending();
  };

  DrawingEditor.prototype.eraseAt = function (point, pointerType) {
    const layer = this.activeLayer();
    if (!layer || !layer.visible || layer.locked) return;
    const toleranceCss = pointerType === "touch" ? 18 : 9;
    const rect = this.contentRect();
    const toleranceCanonical = rect && rect.scale > 0 ? toleranceCss / rect.scale : 0;
    let hit = null;
    for (let index = layer.strokes.length - 1; index >= 0; index -= 1) {
      if (hitTestStroke(layer.strokes[index], point, this.drawing.canvas, toleranceCanonical)) {
        hit = layer.strokes[index];
        break;
      }
    }
    if (!hit) return;
    const projectRevision = this.currentProjectRevision();
    if (!Number.isInteger(projectRevision)) {
      this.setStatus("目前無法確認編輯狀態，無法使用橡皮擦。", "error");
      return;
    }
    this.pendingOperation = { kind: "erase", projectId: this.capturedProjectId, shotId: this.capturedShotId, baseRevision: projectRevision, drawingRevision: this.drawing.revision, drawingId: this.drawing.id, layerId: layer.id, strokeId: hit.id, originalStrokeIds: this.collectStrokeIds() };
    this.submitPending();
  };

  DrawingEditor.prototype.createFromDraft = function (initialEdit) {
    if (!this.isDraft || !this.canCreateFromDraft() || this.pendingOperation || this.drawingBusy) return false;
    const projectRevision = this.currentProjectRevision();
    if (!Number.isInteger(projectRevision)) {
      this.setStatus("目前無法確認專案狀態；手繪內容尚未保存。", "error");
      return false;
    }
    const expectedBackgroundAssetId = initialEdit.kind === "background" ? initialEdit.assetId : this.drawing.backgroundAssetId || null;
    const changesBackgroundAsset = initialEdit.kind === "background" && expectedBackgroundAssetId !== (this.drawing.backgroundAssetId || null);
    const backgroundCropOverride = changesBackgroundAsset ? null : this.defaultBackgroundCropOverride;
    const expectedBackgroundCrop = !expectedBackgroundAssetId
      ? null
      : backgroundCropOverride === undefined
        ? this.getShotBackgroundCrop(expectedBackgroundAssetId)
        : storyboardRenderer.copyBackgroundCrop(backgroundCropOverride);
    const targetDrawingSnapshot = clone(this.drawing);
    targetDrawingSnapshot.backgroundAssetId = expectedBackgroundAssetId;
    targetDrawingSnapshot.backgroundCrop = expectedBackgroundCrop;
    const pending = {
      kind: "createDrawing",
      projectId: this.capturedProjectId,
      shotId: this.capturedShotId,
      baseRevision: projectRevision,
      drawingRevision: this.drawing.revision,
      drawingId: null,
      initialEdit: clone(initialEdit),
      targetDrawingSnapshot: targetDrawingSnapshot,
      expectedBackgroundAssetId: expectedBackgroundAssetId,
      expectedBackgroundCrop: expectedBackgroundCrop,
      backgroundCropOverride: backgroundCropOverride === undefined ? undefined : clone(backgroundCropOverride)
    };
    if (initialEdit.kind === "reuseScene") {
      const source = this.getDrawingSnapshot(initialEdit.sourceDrawingId);
      if (!source) {
        this.setStatus("場景來源已更新；尚未建立 Drawing，請重新預覽。", "error");
        return false;
      }
      pending.sourceDrawingId = source.id;
      pending.sourceDrawingRevision = source.revision;
      pending.sourceDrawingSnapshot = source;
    }
    this.pendingOperation = pending;
    this.submitPending();
    return true;
  };

  DrawingEditor.prototype.adoptCreatedDrawing = function (pending, drawingId) {
    if (typeof drawingId !== "string" || !drawingId) throw new Error("Model 未回傳可核對的 Drawing ID。");
    pending.drawingId = drawingId;
    pending.committed = true;
    this.initialDrawing = { id: drawingId };
    const fresh = this.getDrawingSnapshot(drawingId);
    if (!fresh) throw new Error("Drawing 已建立，但目前無法重新讀取；請重新載入確認，避免重複保存。");
    if (!this.didCommitPending(pending, fresh)) throw new Error("Drawing 初始編輯已送出，但目前無法確認結果；請重新載入，避免重複操作。");
    const activeKind = this.activeLayer() && this.activeLayer().kind || pending.initialEdit.layerKind || "scene";
    this.isDraft = false;
    this.drawing = fresh;
    this.layerId = (fresh.layers.find(function (layer) { return layer.kind === activeKind; }) || fresh.layers[0] || {}).id || null;
    return fresh;
  };

  DrawingEditor.prototype.submitPending = async function () {
    const pending = this.pendingOperation;
    if (!pending || this.drawingBusy) return;
    const methods = {
      append: "appendDrawingStroke",
      createDrawing: "createDrawingForShotWithInitialEdit",
      erase: "eraseDrawingStroke",
      clear: "clearDrawingLayer",
      layerState: "setDrawingLayerState",
      reuseScene: "reuseSceneLayer",
      background: "setDrawingBackground"
    };
    const method = methods[pending.kind];
    if (!this.model || typeof this.model[method] !== "function") {
      const subject = pending.kind === "createDrawing" ? "手繪建立與初始編輯" : pending.kind === "append" ? "筆畫" : pending.kind === "erase" ? "橡皮操作" : pending.kind === "clear" ? "清空操作" : pending.kind === "reuseScene" ? "場景沿用操作" : pending.kind === "background" ? "底圖更換操作" : "圖層狀態變更";
      this.setStatus("尚未保存：目前無法執行此操作；" + subject + "未完成。", "error");
      this.updateControls();
      this.render();
      return;
    }
    this.drawingBusy = true;
    this.setStatus("正在保存…", "saving");
    this.updateControls();
    this.render();
    try {
      this.assertCurrentTarget(pending);
      pending.queued = true;
      if (pending.kind === "createDrawing") {
        const createArgs = [pending.shotId, clone(pending.initialEdit), pending.baseRevision];
        if (pending.backgroundCropOverride !== undefined) createArgs.push(pending.backgroundCropOverride);
        const drawingId = await this.model.createDrawingForShotWithInitialEdit.apply(this.model, createArgs);
        if (drawingId === null) {
          this.pendingOperation = null;
          if (pending.initialEdit.kind === "background") this.closeBackgroundChangeDialog();
          if (pending.initialEdit.kind === "reuseScene") this.closeSceneReusePreview();
          this.setStatus("沒有內容變更；空白畫布尚未保存。", "info");
          return;
        }
        this.adoptCreatedDrawing(pending, drawingId);
      } else if (pending.kind === "append") await this.model.appendDrawingStroke(pending.drawingId, pending.layerId, clone(pending.strokeDraft));
      else if (pending.kind === "erase") await this.model.eraseDrawingStroke(pending.drawingId, pending.layerId, pending.strokeId);
      else if (pending.kind === "clear") await this.model.clearDrawingLayer(pending.drawingId, pending.layerId);
      else if (pending.kind === "layerState") await this.model.setDrawingLayerState(pending.drawingId, pending.layerId, clone(pending.layerPatch));
      else if (pending.kind === "reuseScene") await this.model.reuseSceneLayer(pending.sourceDrawingId, pending.drawingId);
      else if (pending.kind === "background") await this.model.setDrawingBackground(pending.drawingId, pending.assetId);
      else throw new Error("目前無法執行此操作。");
      let fresh = this.drawing;
      if (pending.kind !== "createDrawing") {
        pending.committed = true;
        fresh = await this.readCurrentDrawing();
        if (!this.didCommitPending(pending, fresh)) throw new Error("操作已送出，但目前無法確認結果；請重新載入內容，避免重複操作。");
        this.drawing = fresh;
      }
      this.pendingOperation = null;
      if (pending.kind === "background" || pending.kind === "createDrawing" && pending.initialEdit.kind === "background") this.closeBackgroundChangeDialog();
      if (pending.kind === "createDrawing" && pending.initialEdit.kind === "reuseScene") this.closeSceneReusePreview();
      this.setStatus("已保存", "saved");
      await this.refreshBackground();
      if (pending.kind === "background" && this.backgroundFailure) this.setStatus("底圖更換已保存，但新照片載入失敗；可重試讀取。", "error");
    } catch (error) {
      pending.error = error;
      const lifecycle = this.model && typeof this.model.getLifecycle === "function" ? this.model.getLifecycle() : null;
      if (lifecycle && lifecycle.pendingCount === 0 && lifecycle.phase !== "save_failed") pending.queued = false;
      if (["DRAWING_TARGET_CHANGED", "DRAWING_READ_ONLY", "MODEL_COMMAND_PENDING", "DRAWING_TARGET_REVISION_CHANGED", "DRAWING_LAYER_NOT_EDITABLE", "LAYER_NOT_EDITABLE", "LAYER_NOT_FOUND", "SHOT_ASSET_NOT_FOUND"].includes(error && error.code)) pending.reloadRequired = true;
      if (pending.committed) {
        pending.readFailed = true;
        this.setStatus("操作已完成，但無法確認最新內容。請重新載入，避免重複操作。", "error");
      } else {
        if (pending.kind === "background" || pending.kind === "createDrawing" && pending.initialEdit.kind === "background") {
          this.closeBackgroundChangeDialog();
          this.setStatus("底圖尚未更換" + (pending.assetName ? "（" + pending.assetName + "）" : "") + "；尚未保存。可重試同一操作或取消。", "error");
        } else this.setStatus("尚未保存：操作未完成。可重試同一操作。", "error");
      }
    } finally {
      this.drawingBusy = false;
      this.updateControls();
      this.render();
    }
  };

  DrawingEditor.prototype.currentProjectRevision = function () {
    const lifecycle = this.model && typeof this.model.getLifecycle === "function" ? this.model.getLifecycle() : null;
    if (lifecycle && lifecycle.selectedProjectId === this.capturedProjectId && Number.isInteger(lifecycle.committedRevision)) return lifecycle.committedRevision;
    if (this.model && typeof this.model.getProject === "function") {
      const project = this.model.getProject();
      if (!project || project.projectId !== this.capturedProjectId) return null;
      return project.revision;
    }
    return null;
  };

  DrawingEditor.prototype.currentDrawingSnapshot = function () {
    let drawing = null;
    if (this.model && typeof this.model.getDrawing === "function" && this.drawing) drawing = this.model.getDrawing(this.drawing.id);
    else if (this.model && typeof this.model.getProject === "function" && this.drawing) {
      const project = this.model.getProject();
      drawing = project && project.drawings && project.drawings.find(function (item) { return item.id === this.drawing.id; }, this);
    } else if (this.readDrawing && this.drawing) drawing = this.readDrawing(this.drawing.id);
    if (drawing && typeof drawing.then === "function") throw new Error("目前無法確認畫布內容；請重新載入後再操作。");
    if (!drawing) throw new Error("目前無法確認畫布內容；請重新載入後再操作。");
    drawing = clone(drawing);
    if (this.capturedProjectId && drawing.projectId !== this.capturedProjectId) throw new Error("目前已切換至其他專案；畫布為唯讀。");
    if (this.capturedShotId && drawing.shotId !== this.capturedShotId) throw new Error("目前畫布已連結其他鏡頭；請重新載入。");
    return drawing;
  };

  DrawingEditor.prototype.readCurrentDrawing = async function () {
    if (this.drawing) return this.currentDrawingSnapshot();
    throw new Error("目前無法確認畫布內容；請重新載入後再操作。");
  };

  DrawingEditor.prototype.restoreDraftAfterUndo = function () {
    const project = this.getCurrentProjectSnapshot();
    const shot = project && project.projectId === this.capturedProjectId && project.shots.find(function (item) { return item.id === this.capturedShotId; }, this);
    if (!project || !shot || !Array.isArray(shot.drawingIds) || shot.drawingIds.length) return false;
    const activeLayerKind = this.activeLayer() && this.activeLayer().kind;
    const aspectRatio = this.drawing && this.drawing.canvas && this.drawing.canvas.aspectRatio || project.aspectRatio || "16:9";
    if (this.activeStroke) this.cancelActiveStroke("Drawing 已復原，未完成筆畫已取消。");
    this.clearTouchInteraction(true);
    this.isDraft = true;
    this.initialDrawing = null;
    const backgroundAssetId = shot.assetIds[0] || null;
    this.drawing = createDraftDrawing(this.capturedProjectId, this.capturedShotId, aspectRatio,
      backgroundAssetId, this.resolveDraftBackgroundCrop(backgroundAssetId));
    const activeLayer = this.findLayer(activeLayerKind) || this.findLayer("scene") || this.drawing.layers[0];
    this.layerId = activeLayer ? activeLayer.id : null;
    this.stage.style.aspectRatio = this.drawing.canvas.width + " / " + this.drawing.canvas.height;
    this.notifyState();
    return true;
  };

  DrawingEditor.prototype.assertCurrentTarget = function (pending) {
    const lifecycle = this.model && typeof this.model.getLifecycle === "function" ? this.model.getLifecycle() : null;
    if (lifecycle) {
      if (this.capturedProjectId && lifecycle.selectedProjectId !== this.capturedProjectId) {
        const error = new Error("專案已切換；此操作尚未送出，請返回原鏡頭。");
        error.code = "DRAWING_TARGET_CHANGED";
        throw error;
      }
      if (!lifecycle.writable) {
        const error = new Error(lifecycle.readOnlyReason || "目前沒有編輯權；此操作尚未送出。");
        error.code = "DRAWING_READ_ONLY";
        throw error;
      }
      if (lifecycle.pendingCount > 0) {
        const error = new Error("仍有其他操作正在保存；此操作尚未送出。");
        error.code = "MODEL_COMMAND_PENDING";
        throw error;
      }
    }
    if (pending.kind === "createDrawing") {
      const project = this.getCurrentProjectSnapshot();
      const shot = project && project.shots.find(function (item) { return item.id === pending.shotId; });
      if (!project || project.revision !== pending.baseRevision || this.currentProjectRevision() !== pending.baseRevision || !shot || !Array.isArray(shot.drawingIds) || shot.drawingIds.length) {
        const error = new Error("鏡頭或專案已更新；初始編輯尚未送出，請重新開啟草稿。草稿內容未保存。");
        error.code = "DRAWING_TARGET_REVISION_CHANGED";
        throw error;
      }
      if (pending.expectedBackgroundAssetId && !shot.assetIds.includes(pending.expectedBackgroundAssetId)) {
        const error = new Error("照片已不屬於此鏡頭；初始編輯尚未送出，請重新載入照片清單。");
        error.code = "SHOT_ASSET_NOT_FOUND";
        throw error;
      }
      if (pending.initialEdit.kind === "reuseScene") {
        const source = this.getDrawingSnapshot(pending.sourceDrawingId, project);
        const sourceShot = source && project.shots.find(function (item) { return item.id === source.shotId; });
        const targetIndex = this.getOrderedProjectShots(project).findIndex(function (item) { return item.id === pending.shotId; });
        const sourceIndex = source && this.getOrderedProjectShots(project).findIndex(function (item) { return item.id === source.shotId; });
        if (!source || JSON.stringify(source) !== JSON.stringify(pending.sourceDrawingSnapshot) || source.revision !== pending.sourceDrawingRevision ||
            !sourceShot || !sourceShot.drawingIds.includes(source.id) || source.shotId === pending.shotId || sourceIndex < 0 || sourceIndex >= targetIndex) {
          const error = new Error("場景來源已更新或不再早於此鏡頭；尚未建立 Drawing，請重新預覽。");
          error.code = "DRAWING_SOURCE_CHANGED";
          throw error;
        }
      }
      return;
    }
    const latest = this.currentDrawingSnapshot();
    const projectRevision = this.currentProjectRevision();
    if (latest.projectId !== pending.projectId || latest.shotId !== pending.shotId || latest.revision !== pending.drawingRevision || projectRevision !== pending.baseRevision) {
      const error = new Error("內容已更新；此操作尚未送出，請重新載入後再試。");
      error.code = "DRAWING_TARGET_REVISION_CHANGED";
      throw error;
    }
    const layer = latest.layers.find(function (item) { return item.id === pending.layerId; });
    if (!layer) {
      const error = new Error("找不到原作用圖層；此操作尚未送出，請重新載入後再試。");
      error.code = "DRAWING_LAYER_NOT_FOUND";
      throw error;
    }
    if (pending.kind === "background" && pending.assetId !== null) {
      const project = this.getCurrentProjectSnapshot();
      const shot = project && project.shots.find(function (item) { return item.id === pending.shotId; });
      if (!shot || !Array.isArray(shot.assetIds) || !shot.assetIds.includes(pending.assetId)) {
        const error = new Error("候選照片已不屬於此鏡頭；底圖尚未更換，請重新載入照片清單。");
        error.code = "SHOT_ASSET_NOT_FOUND";
        throw error;
      }
    }
    if (pending.kind === "reuseScene") {
      const source = this.getDrawingSnapshot(pending.sourceDrawingId);
      const project = this.getCurrentProjectSnapshot();
      const sourceShot = project && project.shots.find(function (shot) { return shot.id === pending.sourceDrawingSnapshot.shotId; });
      const targetShot = project && project.shots.find(function (shot) { return shot.id === pending.shotId; });
      if (pending.sourceDrawingId === pending.drawingId || !source || JSON.stringify(source) !== JSON.stringify(pending.sourceDrawingSnapshot) ||
          source.revision !== pending.sourceDrawingRevision || source.shotId === pending.shotId ||
          !sourceShot || !Array.isArray(sourceShot.drawingIds) || !sourceShot.drawingIds.includes(source.id) ||
          !targetShot || !Array.isArray(targetShot.drawingIds) || !targetShot.drawingIds.includes(pending.drawingId)) {
        const error = new Error("來源場景已更新或不再屬於原鏡頭；此次複製未送出，請重新預覽。");
        error.code = "DRAWING_SOURCE_CHANGED";
        throw error;
      }
    }
    if (["append", "erase", "clear", "reuseScene"].includes(pending.kind) && (!layer.visible || layer.locked || (pending.kind === "reuseScene" && layer.kind !== "scene"))) {
      const error = new Error("作用圖層已隱藏或鎖定；本筆尚未送出。");
      error.code = "DRAWING_LAYER_NOT_EDITABLE";
      throw error;
    }
  };

  DrawingEditor.prototype.didCommitPending = function (pending, drawing) {
    if (pending.kind === "createDrawing") {
      if (!drawing || drawing.id !== pending.drawingId || drawing.projectId !== pending.projectId || drawing.shotId !== pending.shotId ||
          drawing.backgroundAssetId !== pending.expectedBackgroundAssetId ||
          JSON.stringify(storyboardRenderer.copyBackgroundCrop(drawing.backgroundCrop)) !== JSON.stringify(pending.expectedBackgroundCrop)) return false;
      const project = this.getCurrentProjectSnapshot();
      const shot = project && project.shots.find(function (item) { return item.id === pending.shotId; });
      if (!shot || !shot.drawingIds.includes(drawing.id)) return false;
      const edit = pending.initialEdit;
      if (edit.kind === "background") return drawing.backgroundAssetId === edit.assetId;
      if (edit.kind === "stroke") {
        const layer = drawing.layers.find(function (item) { return item.kind === edit.layerKind; });
        return Boolean(layer && layer.strokes.some(function (stroke) {
          return stroke.kind === edit.strokeDraft.kind && stroke.color === edit.strokeDraft.color && stroke.baseWidth === edit.strokeDraft.baseWidth && JSON.stringify(stroke.points) === JSON.stringify(edit.strokeDraft.points);
        }));
      }
      if (edit.kind === "layerState") {
        const layer = drawing.layers.find(function (item) { return item.kind === edit.layerKind; });
        return Boolean(layer && Object.keys(edit.patch || {}).every(function (key) {
          return ["visible", "locked"].includes(key) && layer[key] === edit.patch[key];
        }));
      }
      if (edit.kind === "reuseScene") {
        const source = this.getDrawingSnapshot(pending.sourceDrawingId);
        const sourceLayer = source && source.layers.find(function (item) { return item.kind === "scene"; });
        const targetLayer = drawing.layers.find(function (item) { return item.kind === "scene"; });
        const targetSubject = drawing.layers.find(function (item) { return item.kind === "subject"; });
        const originalSubject = pending.targetDrawingSnapshot.layers.find(function (item) { return item.kind === "subject"; });
        const withoutIds = function (strokes) { return strokes.map(function (stroke) { const copy = clone(stroke); delete copy.id; return copy; }); };
        const normalizeLayer = function (layer) {
          const copy = clone(layer);
          delete copy.projectId;
          delete copy.drawingId;
          delete copy.id;
          copy.strokes = withoutIds(copy.strokes);
          return copy;
        };
        return Boolean(source && JSON.stringify(source) === JSON.stringify(pending.sourceDrawingSnapshot) && sourceLayer && targetLayer && targetSubject &&
          JSON.stringify(withoutIds(targetLayer.strokes)) === JSON.stringify(withoutIds(sourceLayer.strokes)) && JSON.stringify(normalizeLayer(targetSubject)) === JSON.stringify(normalizeLayer(originalSubject)));
      }
      return false;
    }
    if (!drawing || drawing.id !== pending.drawingId) return false;
    const layer = drawing.layers.find(function (item) { return item.id === pending.layerId; });
    if (!layer) return false;
    if (pending.kind === "background") {
      if (drawing.backgroundAssetId !== pending.assetId) return false;
      const expected = clone(pending.targetDrawingSnapshot);
      const actual = clone(drawing);
      expected.backgroundAssetId = pending.assetId;
      expected.backgroundCrop = null;
      expected.revision = actual.revision;
      return JSON.stringify(actual) === JSON.stringify(expected);
    }
    if (pending.kind === "erase") return !layer.strokes.some(function (stroke) { return stroke.id === pending.strokeId; });
    if (pending.kind === "clear") return layer.strokes.length === 0;
    if (pending.kind === "layerState") return Object.keys(pending.layerPatch || {}).every(function (key) {
      return ["visible", "locked"].includes(key) && layer[key] === pending.layerPatch[key];
    });
    if (pending.kind === "reuseScene") {
      const source = this.getDrawingSnapshot(pending.sourceDrawingId);
      if (!source || JSON.stringify(source) !== JSON.stringify(pending.sourceDrawingSnapshot)) return false;
      const sourceLayer = source.layers.find(function (item) { return item.kind === "scene"; });
      const targetLayer = drawing.layers.find(function (item) { return item.kind === "scene"; });
      const targetSubject = drawing.layers.find(function (item) { return item.kind === "subject"; });
      const originalSubject = pending.targetDrawingSnapshot.layers.find(function (item) { return item.kind === "subject"; });
      if (!sourceLayer || !targetLayer || !targetSubject || JSON.stringify(targetSubject) !== JSON.stringify(originalSubject)) return false;
      const withoutStrokeIds = function (strokes) {
        return strokes.map(function (stroke) { const copy = clone(stroke); delete copy.id; return copy; });
      };
      if (JSON.stringify(withoutStrokeIds(targetLayer.strokes)) !== JSON.stringify(withoutStrokeIds(sourceLayer.strokes))) return false;
      const copiedIds = targetLayer.strokes.map(function (stroke) { return stroke.id; });
      if (new Set(copiedIds).size !== copiedIds.length || copiedIds.some(function (id) { return pending.originalStrokeIds.has(id) || pending.sourceStrokeIds.has(id); })) return false;
      const normalizeDrawing = function (item) {
        const copy = clone(item);
        delete copy.revision;
        const scene = copy.layers.find(function (candidate) { return candidate.kind === "scene"; });
        if (scene) scene.strokes = [];
        return copy;
      };
      return JSON.stringify(normalizeDrawing(drawing)) === JSON.stringify(normalizeDrawing(pending.targetDrawingSnapshot));
    }
    if (pending.kind !== "append") return false;
    return layer.strokes.some(function (stroke) {
      return !pending.originalStrokeIds.has(stroke.id) && stroke.kind === pending.strokeDraft.kind && stroke.color === pending.strokeDraft.color && stroke.baseWidth === pending.strokeDraft.baseWidth && JSON.stringify(stroke.points) === JSON.stringify(pending.strokeDraft.points);
    });
  };

  DrawingEditor.prototype.retry = async function () {
    if (!this.pendingOperation || !this.model) return;
    if (!this.pendingOperation.queued) {
      if (this.pendingOperation.kind === "history") {
        const kind = this.pendingOperation.historyKind;
        this.pendingOperation = null;
        await this.runHistory(kind);
      } else await this.submitPending();
      return;
    }
    if (typeof this.model.retryPending !== "function") return;
    this.drawingBusy = true;
    this.setStatus("正在確認並重試保存…", "saving");
    this.updateControls();
    try {
      const result = await this.model.retryPending();
      if (result === false) throw new Error("目前沒有可重試的操作；內容仍保留，尚未確認保存。");
      const pending = this.pendingOperation;
      if (pending.kind === "createDrawing" && result === null) {
        this.pendingOperation = null;
        if (pending.initialEdit.kind === "background") this.closeBackgroundChangeDialog();
        if (pending.initialEdit.kind === "reuseScene") this.closeSceneReusePreview();
        this.setStatus("沒有內容變更；空白畫布尚未保存。", "info");
        return;
      }
      let fresh;
      if (pending.kind === "createDrawing") fresh = this.adoptCreatedDrawing(pending, result);
      else {
        pending.committed = true;
        fresh = await this.readCurrentDrawing();
        if (pending.kind !== "history" && !this.didCommitPending(pending, fresh)) throw new Error("重試後仍無法確認結果；內容保留，請重新載入。");
        this.drawing = fresh;
      }
      this.pendingOperation = null;
      if (pending.kind === "background" || pending.kind === "createDrawing" && pending.initialEdit.kind === "background") this.closeBackgroundChangeDialog();
      if (pending.kind === "createDrawing" && pending.initialEdit.kind === "reuseScene") this.closeSceneReusePreview();
      this.setStatus("已保存", "saved");
      await this.refreshBackground();
      if (pending.kind === "background" && this.backgroundFailure) this.setStatus("底圖更換已保存，但新照片載入失敗；可重試讀取。", "error");
    } catch (error) {
      this.pendingOperation.error = error;
      const lifecycle = this.model && typeof this.model.getLifecycle === "function" ? this.model.getLifecycle() : null;
      if (lifecycle && lifecycle.pendingCount === 0 && lifecycle.phase !== "save_failed") this.pendingOperation.queued = false;
      if (["DRAWING_TARGET_CHANGED", "DRAWING_READ_ONLY", "MODEL_COMMAND_PENDING", "DRAWING_TARGET_REVISION_CHANGED", "DRAWING_LAYER_NOT_EDITABLE", "DRAWING_LAYER_NOT_FOUND", "LAYER_NOT_EDITABLE", "LAYER_NOT_FOUND", "SHOT_ASSET_NOT_FOUND"].includes(error && error.code)) this.pendingOperation.reloadRequired = true;
      if (this.pendingOperation.committed) {
        this.pendingOperation.readFailed = true;
        this.setStatus("操作已完成，但無法確認最新內容。請重新載入，避免重複操作。", "error");
      } else {
        this.setStatus("仍未確認保存；請稍後重試。", "error");
      }
    } finally {
      this.drawingBusy = false;
      this.updateControls();
      this.render();
    }
  };

  DrawingEditor.prototype.runHistory = async function (kind) {
    if (!this.canWriteHistory(kind)) return;
    const projectRevision = this.currentProjectRevision();
    const layer = this.activeLayer();
    if (!Number.isInteger(projectRevision) || !layer) return;
    this.pendingOperation = { kind: "history", projectId: this.capturedProjectId, shotId: this.capturedShotId, baseRevision: projectRevision, drawingRevision: this.drawing.revision, historyKind: kind, drawingId: this.drawing.id, layerId: layer.id, originalStrokeIds: this.collectStrokeIds() };
    this.drawingBusy = true;
    this.setStatus(kind === "undo" ? "正在復原…" : "正在重做…", "saving");
    this.updateControls();
    try {
      this.assertCurrentTarget(this.pendingOperation);
      this.pendingOperation.queued = true;
      const result = await this.model[kind]();
      if (result === false) {
        this.pendingOperation = null;
        this.setStatus(kind === "undo" ? "沒有可復原的操作。" : "沒有可重做的操作。", "info");
        return;
      }
      this.pendingOperation.committed = true;
      const projectAfterHistory = this.getCurrentProjectSnapshot();
      const drawingAfterHistory = projectAfterHistory && projectAfterHistory.drawings && projectAfterHistory.drawings.find(function (item) { return item.id === this.drawing.id; }, this);
      if (kind === "undo" && !drawingAfterHistory) {
        if (!this.restoreDraftAfterUndo()) throw new Error("Drawing 已復原，但無法安全回到此鏡頭的空白草稿；請重新開啟鏡頭確認。");
        await this.refreshBackground();
        this.pendingOperation = null;
        this.setStatus("已復原；空白畫布尚未保存。", "info");
        return;
      }
      const fresh = await this.readCurrentDrawing();
      this.drawing = fresh;
      await this.refreshBackground();
      this.pendingOperation = null;
      if (this.backgroundFailure) this.setStatus("復原／重做已保存，但底圖載入失敗：" + this.backgroundFailure, "error");
      else this.setStatus("已保存", "saved");
    } catch (error) {
      this.pendingOperation.error = error;
      const lifecycle = this.model && typeof this.model.getLifecycle === "function" ? this.model.getLifecycle() : null;
      if (lifecycle && lifecycle.pendingCount === 0 && lifecycle.phase !== "save_failed") this.pendingOperation.queued = false;
      if (["DRAWING_TARGET_CHANGED", "DRAWING_READ_ONLY", "MODEL_COMMAND_PENDING", "DRAWING_TARGET_REVISION_CHANGED", "DRAWING_LAYER_NOT_EDITABLE", "DRAWING_LAYER_NOT_FOUND", "LAYER_NOT_EDITABLE", "LAYER_NOT_FOUND"].includes(error && error.code)) this.pendingOperation.reloadRequired = true;
      if (this.pendingOperation.committed) {
        this.pendingOperation.readFailed = true;
        this.setStatus((kind === "undo" ? "復原" : "重做") + "已完成，但無法確認最新內容。請重新載入，避免重複操作。", "error");
      } else {
        this.setStatus((kind === "undo" ? "復原" : "重做") + "失敗，尚未保存；請重試。", "error");
      }
    } finally {
      this.drawingBusy = false;
      this.updateControls();
      this.render();
    }
  };

  DrawingEditor.prototype.render = function () {
    if (!this.ctx || !this.canvas) return;
    const bounds = this.stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dpr = Math.max(1, Math.min(3, typeof window !== "undefined" && window.devicePixelRatio || 1));
    const pixelWidth = Math.max(1, Math.round(bounds.width * dpr));
    const pixelHeight = Math.max(1, Math.round(bounds.height * dpr));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.canvas.style.width = bounds.width + "px";
    this.canvas.style.height = bounds.height + "px";
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, bounds.width, bounds.height);
    if (!this.drawing) return;
    const fitted = this.displayRect(bounds);
    const canvas = this.drawing.canvas;
    ctx.save();
    ctx.translate(fitted.x, fitted.y);
    ctx.scale(fitted.width / canvas.width, fitted.height / canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (this.backgroundImage && this.backgroundImage.naturalWidth && this.backgroundImage.naturalHeight) {
      if (this.drawing.backgroundCrop) {
        const geometry = storyboardRenderer.backgroundDrawGeometry(canvas.width, canvas.height,
          this.backgroundImage.naturalWidth, this.backgroundImage.naturalHeight, this.drawing.backgroundCrop);
        ctx.drawImage(this.backgroundImage,
          geometry.source.x, geometry.source.y, geometry.source.width, geometry.source.height,
          geometry.destination.x, geometry.destination.y, geometry.destination.width, geometry.destination.height);
      } else {
        const photo = fitContain(canvas.width, canvas.height, this.backgroundImage.naturalWidth, this.backgroundImage.naturalHeight);
        ctx.drawImage(this.backgroundImage, photo.x, photo.y, photo.width, photo.height);
      }
    }
    this.drawing.layers.slice().sort(function (a, b) { return a.order - b.order; }).forEach(function (layer) {
      if (!layer.visible) return;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      layer.strokes.forEach(function (stroke) { this.drawStroke(ctx, stroke, canvas); }, this);
      ctx.restore();
    }, this);
    if (this.activeStroke) {
      this.drawStroke(ctx, {
        kind: this.activeStroke.tool === "cameraArrow" ? "cameraArrow" : "pen",
        color: this.activeStroke.color,
        baseWidth: this.activeStroke.baseWidth,
        points: this.activeStroke.tool === "cameraArrow" && this.activeStroke.points.length > 1
          ? [this.activeStroke.points[0], this.activeStroke.points[this.activeStroke.points.length - 1]]
          : this.activeStroke.points
      }, canvas, true);
    }
    if (this.pendingOperation && this.pendingOperation.kind === "append" && !this.pendingOperation.committed) this.drawStroke(ctx, this.pendingOperation.strokeDraft, canvas, true);
    ctx.restore();
    if (this.pendingOperation && this.pendingOperation.kind === "erase" && !this.pendingOperation.committed) {
      const layer = this.drawing.layers.find(function (item) { return item.id === this.pendingOperation.layerId; }, this);
      const stroke = layer && layer.strokes.find(function (item) { return item.id === this.pendingOperation.strokeId; }, this);
      if (stroke) {
        ctx.save();
        ctx.translate(fitted.x, fitted.y);
        ctx.scale(fitted.width / canvas.width, fitted.height / canvas.height);
        this.drawStroke(ctx, Object.assign({}, stroke, { color: "#ff3b30" }), canvas, true);
        ctx.restore();
      }
    }
    if (this.tool === "eraser" && this.eraserPointer && !this.backgroundFailure) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = "#1d2430";
      ctx.fillStyle = "rgba(255,255,255,.66)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(this.eraserPointer.x, this.eraserPointer.y, this.eraserPointer.pointerType === "touch" ? 18 : 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };

  DrawingEditor.prototype.drawStroke = function (ctx, stroke, canvas, preview) {
    if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 2) return;
    const points = stroke.points.map(function (point) { return pointToCanvas(point, canvas.width, canvas.height); });
    ctx.save();
    ctx.strokeStyle = stroke.color || "#e94f3d";
    ctx.fillStyle = stroke.color || "#e94f3d";
    ctx.lineWidth = Number(stroke.baseWidth) || 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (preview) ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    ctx.stroke();
    const samePoint = points.every(function (point) { return point.x === points[0].x && point.y === points[0].y; });
    if (samePoint) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, Math.max(0.5, ctx.lineWidth / 2), 0, Math.PI * 2);
      ctx.fill();
    }
    if (stroke.kind === "cameraArrow") {
      const start = points[0];
      const end = points[points.length - 1];
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const head = Math.max(ctx.lineWidth * 4, 18);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  DrawingEditor.prototype.destroy = function () {
    this.destroyed = true;
    this.backgroundRequests.invalidate();
    this.backgroundPreviewRequests.invalidate();
    this.drawingRefreshRequests.invalidate();
    this.clearTouchInteraction(true);
    this.cancelActiveStroke();
    this.listeners.splice(0).forEach(function (remove) { remove(); });
    if (this.unsubscribeData) this.unsubscribeData();
    if (this.unsubscribeLifecycle) this.unsubscribeLifecycle();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.revokeBackgroundUrl();
    this.revokeBackgroundPreviewUrl();
    this.container.replaceChildren();
  };

  DrawingEditor.prototype.update = function (nextOptions) {
    if (this.destroyed) throw new Error("Drawing editor 已 destroy；請使用新容器 mount()。");
    const next = nextOptions || {};
    const nextDrawingId = next.drawingId || next.drawing && next.drawing.id;
    const nextProjectId = next.projectId || next.drawing && next.drawing.projectId;
    const nextShotId = next.shotId || next.drawing && next.drawing.shotId;
    if ((nextDrawingId && nextDrawingId !== this.initialDrawing.id) || (nextProjectId && nextProjectId !== this.capturedProjectId) || (nextShotId && nextShotId !== this.capturedShotId)) {
      throw new Error("Drawing 的 Project／Shot／Drawing ID 已改變；請先 destroy()，再以新目標 mount()，不會沿用舊編輯器寫入新鏡頭。");
    }
    if ((next.model && next.model !== this.model) || (next.store && next.store !== this.model)) {
      throw new Error("StoryModel store 不可在同一個 mount 生命週期內替換；請 destroy() 後重新 mount()。");
    }
    if (Object.prototype.hasOwnProperty.call(next, "defaultBackgroundCrop") && this.isDraft) {
      if (this.pendingOperation || this.drawingBusy) throw new Error("手繪建立保存中，不能再變更預設底圖裁切。");
      this.defaultBackgroundCropOverride = next.defaultBackgroundCrop === undefined
        ? undefined : storyboardRenderer.copyBackgroundCrop(next.defaultBackgroundCrop);
      this.drawing.backgroundCrop = this.resolveDraftBackgroundCrop(this.drawing.backgroundAssetId);
      this.render();
    }
    if (typeof next.writable === "boolean") this.writableOverride = next.writable;
    if (typeof next.readOnlyReason === "string") this.readOnlyReason = next.readOnlyReason;
    if (typeof next.shotLabel === "string") {
      this.shotLabel = next.shotLabel;
      this.context.textContent = this.shotLabel;
    }
    if (typeof next.onBack === "function" || next.onBack === null) {
      this.onBack = next.onBack;
      this.backButton.hidden = !this.onBack;
    }
    if (typeof next.onStateChange === "function" || next.onStateChange === null) this.onStateChange = next.onStateChange;
    this.refreshLifecycle();
    this.notifyState();
    return this.refreshDrawing();
  };

  return Object.freeze({
    mount: function (container, options) {
      const editor = new DrawingEditor(container, options);
      return Object.freeze({
        destroy: editor.destroy.bind(editor),
        refresh: editor.refreshDrawing.bind(editor),
        update: editor.update.bind(editor),
        editor: editor
      });
    },
    getCanonicalCanvasSize: getCanonicalCanvasSize,
    fitContain: fitContain,
    clientToNormalized: clientToNormalized,
    pointToCanvas: pointToCanvas,
    distanceToSegment: distanceToSegment,
    hitTestStroke: hitTestStroke,
    createLatestPromiseSlot: createLatestPromiseSlot,
    CANONICAL_CANVASES: CANONICAL_CANVASES
  });
});
