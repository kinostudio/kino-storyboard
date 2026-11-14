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

  const CAMERA_FONT = {
    A: [[[0,6],[0,2],[2,0],[4,2],[4,6]], [[0,4],[4,4]]],
    B: [[[0,0],[0,6]], [[0,0],[3,0],[4,1],[4,2],[3,3],[0,3]], [[3,3],[4,4],[4,5],[3,6],[0,6]]],
    C: [[[4,0],[1,0],[0,1],[0,5],[1,6],[4,6]]],
    D: [[[0,0],[0,6],[3,6],[4,5],[4,1],[3,0],[0,0]]],
    E: [[[4,0],[0,0],[0,6],[4,6]], [[0,3],[3,3]]],
    F: [[[0,6],[0,0],[4,0]], [[0,3],[3,3]]],
    G: [[[4,0],[1,0],[0,1],[0,5],[1,6],[4,6],[4,3],[2,3]]],
    H: [[[0,0],[0,6]], [[4,0],[4,6]], [[0,3],[4,3]]],
    I: [[[0,0],[4,0]], [[2,0],[2,6]], [[0,6],[4,6]]],
    L: [[[0,0],[0,6],[4,6]]],
    M: [[[0,6],[0,0],[2,3],[4,0],[4,6]]],
    N: [[[0,6],[0,0],[4,6],[4,0]]],
    O: [[[1,0],[3,0],[4,1],[4,5],[3,6],[1,6],[0,5],[0,1],[1,0]]],
    P: [[[0,6],[0,0],[3,0],[4,1],[4,2],[3,3],[0,3]]],
    R: [[[0,6],[0,0],[3,0],[4,1],[4,2],[3,3],[0,3]], [[2,3],[4,6]]],
    S: [[[4,0],[1,0],[0,1],[0,2],[1,3],[3,3],[4,4],[4,5],[3,6],[0,6]]],
    T: [[[0,0],[4,0]], [[2,0],[2,6]]],
    U: [[[0,0],[0,5],[1,6],[3,6],[4,5],[4,0]]],
    V: [[[0,0],[2,6],[4,0]]],
    W: [[[0,0],[0,6],[2,4],[4,6],[4,0]]],
    X: [[[0,0],[4,6]], [[4,0],[0,6]]],
    Y: [[[0,0],[2,3],[4,0]], [[2,3],[2,6]]],
    Z: [[[0,0],[4,0],[0,6],[4,6]]],
    "/": [[[4,0],[0,6]]]
  };

  function cameraTextPaths(text, left, top, height, role) {
    const cell = (height || 42) / 6;
    const advance = cell * 6;
    const start = left === undefined ? (1000 - Math.max(0, text.length * advance - cell)) / 2 : left;
    const paths = [];
    Array.from(text).forEach(function (character, index) {
      const glyph = CAMERA_FONT[character];
      if (!glyph) return;
      glyph.forEach(function (path) {
        paths.push({ kind: "pen", keepOrientation: true, role: role || "label", points: path.map(function (point) {
          return [start + index * advance + point[0] * cell, (top === undefined ? 42 : top) + point[1] * cell];
        }) });
      });
    });
    return paths;
  }

  const cameraPen = function (points, keepOrientation) { return { kind: "pen", points: points, keepOrientation: Boolean(keepOrientation) }; };
  const cameraArrow = function (from, to) { return { kind: "cameraArrow", points: [from, to] }; };
  const cameraBox = function (x, y, width, height) {
    return cameraPen([[x,y],[x+width,y],[x+width,y+height],[x,y+height],[x,y]]);
  };
  const cameraMark = function (x, y) {
    return [cameraBox(x,y,112,62), cameraPen([[x+24,y],[x+24,y-18],[x+70,y-18],[x+70,y]]),
      cameraPen([[x+112,y+18],[x+142,y+5],[x+142,y+57],[x+112,y+44]])];
  };
  const cameraCircle = function (cx, cy, radius) {
    const points = [];
    for (let index = 0; index <= 24; index += 1) {
      const angle = Math.PI * 2 * index / 24;
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }
    return cameraPen(points);
  };
  const cameraPreset = function (label, paths, annotations) {
    return Object.freeze({ label: label, paths: paths.flat(), annotations: annotations || [] });
  };
  const CAMERA_PRESETS = Object.freeze([
    cameraPreset("ZOOM IN", [cameraBox(210,150,580,300), cameraBox(360,225,280,150),
      cameraArrow([245,180],[385,245]), cameraArrow([755,180],[615,245]), cameraArrow([245,420],[385,355]), cameraArrow([755,420],[615,355])]),
    cameraPreset("ZOOM OUT", [cameraBox(210,150,580,300), cameraBox(360,225,280,150),
      cameraArrow([385,245],[245,180]), cameraArrow([615,245],[755,180]), cameraArrow([385,355],[245,420]), cameraArrow([615,355],[755,420])]),
    cameraPreset("DOLLY IN", [cameraPen([[200,150],[800,150],[900,430],[100,430],[200,150]]), cameraPen([[380,230],[620,230],[660,350],[340,350],[380,230]]),
      cameraArrow([230,180],[390,245]), cameraArrow([770,180],[610,245]), cameraArrow([160,405],[350,345]), cameraArrow([840,405],[650,345])]),
    cameraPreset("DOLLY OUT", [cameraPen([[200,150],[800,150],[900,430],[100,430],[200,150]]), cameraPen([[380,230],[620,230],[660,350],[340,350],[380,230]]),
      cameraArrow([390,245],[230,180]), cameraArrow([610,245],[770,180]), cameraArrow([350,345],[160,405]), cameraArrow([650,345],[840,405])]),
    cameraPreset("PAN L", [cameraBox(230,150,540,300), cameraPen([[500,245],[500,355]]), cameraPen([[465,300],[535,300]]),
      cameraArrow([690,205],[350,205]), cameraArrow([650,400],[380,400])]),
    cameraPreset("PAN R", [cameraBox(230,150,540,300), cameraPen([[500,245],[500,355]]), cameraPen([[465,300],[535,300]]),
      cameraArrow([350,205],[690,205]), cameraArrow([380,400],[650,400])]),
    cameraPreset("TILT UP", [cameraBox(230,150,540,300), cameraPen([[500,240],[500,360]]),
      cameraArrow([360,385],[360,220]), cameraArrow([640,385],[640,220])]),
    cameraPreset("TILT DOWN", [cameraBox(230,150,540,300), cameraPen([[500,240],[500,360]]),
      cameraArrow([360,220],[360,385]), cameraArrow([640,220],[640,385])]),
    cameraPreset("TRUCK L", [cameraMark(420,255), cameraPen([[160,420],[840,420]]), cameraPen([[200,400],[200,440]]), cameraPen([[800,400],[800,440]]), cameraArrow([700,370],[300,370])]),
    cameraPreset("TRUCK R", [cameraMark(420,255), cameraPen([[160,420],[840,420]]), cameraPen([[200,400],[200,440]]), cameraPen([[800,400],[800,440]]), cameraArrow([300,370],[700,370])]),
    cameraPreset("BOOM UP", [cameraPen([[500,150],[500,430]]), cameraPen([[390,425],[610,425]]), cameraMark(445,300), cameraArrow([650,390],[650,205])]),
    cameraPreset("BOOM DOWN", [cameraPen([[500,150],[500,430]]), cameraPen([[390,155],[610,155]]), cameraMark(445,190), cameraArrow([650,205],[650,390])]),
    cameraPreset("ARC L", [cameraCircle(500,300,52), cameraPen([[760,385],[810,320],[800,245],[755,180],[680,135],[600,120]]),
      cameraArrow([680,135],[600,120]), cameraMark(220,250)]),
    cameraPreset("ARC R", [cameraCircle(500,300,52), cameraPen([[240,385],[190,320],[200,245],[245,180],[320,135],[400,120]]),
      cameraArrow([320,135],[400,120]), cameraMark(670,250)]),
    cameraPreset("FOLLOW", [cameraBox(160,150,680,300), cameraCircle(330,300,40), cameraCircle(670,300,40),
      cameraArrow([280,390],[720,390]), cameraPen([[330,235],[330,365]]), cameraPen([[670,235],[670,365]])]),
    cameraPreset("DOLLY ZOOM", [cameraBox(210,150,580,300), cameraBox(360,225,280,150),
      cameraArrow([245,185],[385,245]), cameraArrow([615,355],[755,420]), cameraPen([[300,390],[400,330],[500,300],[600,330],[700,390]])]),
    cameraPreset("A / B", [cameraBox(115,190,330,220), cameraBox(555,190,330,220), cameraArrow([455,300],[545,300])],
      cameraTextPaths("A", 230, 270, 60, "annotation").concat(cameraTextPaths("B", 670, 270, 60, "annotation")))
  ]);

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

  function shapeStrokePoints(tool, first, last) {
    if (tool === "cameraArrow") return [first, last];
    const left = Math.min(first.x, last.x);
    const right = Math.max(first.x, last.x);
    const top = Math.min(first.y, last.y);
    const bottom = Math.max(first.y, last.y);
    const span = Math.max(0, last.t - first.t);
    if (tool === "rectangle") {
      return [
        { x: left, y: top, t: first.t, pressure: null },
        { x: right, y: top, t: first.t + span / 4, pressure: null },
        { x: right, y: bottom, t: first.t + span / 2, pressure: null },
        { x: left, y: bottom, t: first.t + span * 3 / 4, pressure: null },
        { x: left, y: top, t: last.t, pressure: null }
      ];
    }
    if (tool === "circle") {
      const points = [];
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      for (let index = 0; index <= 48; index += 1) {
        const angle = -Math.PI / 2 + Math.PI * 2 * index / 48;
        points.push({
          x: centerX + (right - left) / 2 * Math.cos(angle),
          y: centerY + (bottom - top) / 2 * Math.sin(angle),
          t: first.t + span * index / 48,
          pressure: null
        });
      }
      return points;
    }
    return null;
  }

  function rgbaWithOpacity(hex, opacity) {
    const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || "");
    if (!match) return hex || "#111827";
    return "rgba(" + parseInt(match[1], 16) + ", " + parseInt(match[2], 16) + ", " + parseInt(match[3], 16) + ", " + opacity + ")";
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

  function appendIcon(node, name) {
    const paths = {
      pencil: "M4 16.5 16.4 4.1a2.1 2.1 0 0 1 3 3L7 19.5 3.5 20.5 4 17z",
      brush: "M4 18c3-1 3-5 6-5s3 4 6 3 2-5 5-6M4 21h16",
      marker: "M5 16 15.5 5.5a2.1 2.1 0 0 1 3 3L8 19H5zM4 21h16",
      arrow: "M4 18 19 5M11 5h8v8",
      circle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
      rectangle: "M4 5h16v14H4z",
      eraser: "m4 15 9-10 7 7-7 8H7l-3-3zM10 20l5-6",
      eye: "M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
      eyeOff: "m3 3 18 18M10.6 6.2A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3 3.5M6.2 6.3C3.9 7.7 2.5 12 2.5 12s3.5 6 9.5 6c1.1 0 2.1-.2 3-.5",
      lock: "M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3",
      unlock: "M5 10h14v11H5zM8 10V7a4 4 0 0 1 7-2.6",
      up: "m6 14 6-6 6 6",
      down: "m6 10 6 6 6-6",
      trash: "M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3",
      undo: "M9 5 4 10l5 5M4 10h10a6 6 0 0 1 6 6",
      redo: "m15 5 5 5-5 5M20 10H10a6 6 0 0 0-6 6",
      minus: "M5 12h14",
      fit: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
      back: "m14 5-7 7 7 7",
      layers: "m3 8 9-5 9 5-9 5-9-5M3 12l9 5 9-5M3 16l9 5 9-5",
      settings: "M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6",
      plus: "M12 5v14M5 12h14",
      camera: "M3 7h4l2-3h6l2 3h4v13H3zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", paths[name] || paths.pencil);
    svg.appendChild(path);
    node.prepend(svg);
    return node;
  }

  function iconOnly(node, name) {
    node.title = node.getAttribute("aria-label") || node.textContent;
    node.textContent = "";
    node.classList.add("ds-de-icon-button");
    appendIcon(node, name);
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
      schemaVersion: 3,
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

  function drawingSnapshotForShotCreate(drawing) {
    return {
      kind: "snapshot",
      backgroundAssetId: drawing.backgroundAssetId || null,
      backgroundCrop: drawing.backgroundCrop ? clone(drawing.backgroundCrop) : null,
      layers: drawing.layers.slice().sort(function (a, b) { return a.order - b.order; }).map(function (layer) {
        const snapshot = {
          kind: layer.kind,
          visible: Boolean(layer.visible),
          locked: Boolean(layer.locked),
          strokes: layer.strokes.map(function (stroke) {
            return {
              kind: stroke.kind,
              color: stroke.color,
              baseWidth: stroke.baseWidth,
              points: stroke.points.map(function (point) {
                const normalized = { x: point.x, y: point.y, t: point.t };
                if (Object.prototype.hasOwnProperty.call(point, "pressure")) normalized.pressure = point.pressure;
                return normalized;
              })
            };
          })
        };
        if (layer.kind === "custom") snapshot.name = layer.name;
        return snapshot;
      })
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
    this.isDraft = Boolean(opts.draft || opts.placeholder);
    this.placeholder = opts.placeholder && typeof opts.placeholder === "object" ? {
      sceneId: opts.placeholder.sceneId,
      initialShotPatch: clone(opts.placeholder.initialShotPatch || {})
    } : null;
    if (this.placeholder && (typeof this.placeholder.sceneId !== "string" || !this.placeholder.sceneId.trim())) {
      throw new TypeError("placeholder.sceneId 需要有效的 Scene ID。");
    }
    this.isPlaceholder = Boolean(this.placeholder);
    this.placeholderBaseRevision = null;
    this.placeholderDirty = false;
    this.placeholderHistory = [];
    this.placeholderRedo = [];
    this.placeholderStrokeSequence = 0;
    this.placeholderCommitted = false;
    this.placeholderResult = null;
    this.onCreated = typeof opts.onCreated === "function" ? opts.onCreated : null;
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
    if (this.isPlaceholder) this.placeholderBaseRevision = this.currentProjectRevision();
    this.writableOverride = typeof opts.writable === "boolean" ? opts.writable : null;
    this.readOnlyReason = opts.readOnlyReason || "尚未確認可編輯狀態。";
    this.writable = false;
    this.layerId = null;
    this.tool = "brush";
    this.inputMode = "pen";
    this.touchPointers = new Map();
    this.touchGesture = null;
    this.touchEraserCandidate = null;
    this.viewTransform = { scale: 1, x: 0, y: 0 };
    this.color = opts.color || "#e94f3d";
    this.baseWidth = Number.isFinite(opts.baseWidth) && opts.baseWidth > 0 ? opts.baseWidth : 8;
    this.opacity = Number.isFinite(opts.opacity) ? clamp(opts.opacity, 0.05, 1) : 0.45;
    this.pencilOnly = Boolean(opts.pencilOnly);
    this.mode = "focus";
    this.activeStroke = null;
    this.cameraPresetSelection = null;
    this.cameraPresetTransform = { x: 0, y: 0, scale: 100, flipX: false, flipY: false };
    this.cameraPresetEdit = null;
    this.strokeQueue = [];
    this.renderFrame = null;
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
    this.closeBusy = false;
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
    this.saveCloseButton = button("儲存並關閉", "ds-de-save-close");
    this.saveCloseButton.hidden = !this.onBack;
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
    this.headerActions.append(this.retryButton, this.discardButton, this.reloadButton, this.saveCloseButton);
    header.append(this.backButton, this.title, this.status, this.headerActions);
    shell.appendChild(header);

    this.controls = create("div", "ds-de-controls");
    this.layerGroup = create("div", "ds-de-control-group ds-de-layers");
    this.layerGroup.appendChild(create("span", "ds-de-label", "圖層"));
    this.layerControls = create("div", "ds-de-layer-list");
    this.layerButtons = new Map();
    this.layerStateButtons = new Map();
    this.layerGroup.appendChild(this.layerControls);
    this.addLayerButton = button("新增圖層", "ds-de-choice ds-de-add-layer");
    this.addLayerButton.dataset.layerAction = "add";
    this.layerGroup.querySelector(".ds-de-label").remove();
    const layerHeader = create("div", "ds-de-layer-header");
    layerHeader.append(create("strong","","圖層"), iconOnly(this.addLayerButton,"plus"));
    this.layerGroup.prepend(layerHeader);

    this.layerStateGroup = create("div", "ds-de-control-group");
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
      { id: "pencil", label: "鉛筆" },
      { id: "brush", label: "畫筆" },
      { id: "marker", label: "麥克筆" },
      { id: "cameraArrow", label: "箭頭" },
      { id: "circle", label: "圓形" },
      { id: "rectangle", label: "四邊形" },
      { id: "eraser", label: "橡皮擦" }
    ].forEach(function (tool) {
      const control = button(tool.label, "ds-de-choice ds-de-tool");
      iconOnly(control, tool.id === "cameraArrow" ? "arrow" : tool.id);
      control.dataset.tool = tool.id;
      this.toolButtons.set(tool.id, control);
      this.toolGroup.appendChild(control);
    }, this);

    this.cameraPresetDrawer = create("details", "ds-de-camera-presets");
    this.cameraPresetToggle = create("summary", "ds-de-camera-preset-toggle");
    this.cameraPresetToggle.setAttribute("aria-label", "鏡頭運動預設");
    this.cameraPresetToggle.title = "鏡頭運動預設";
    appendIcon(this.cameraPresetToggle, "camera");
    this.cameraPresetPanel = create("div", "ds-de-camera-preset-panel");
    this.cameraPresetGrid = create("div", "ds-de-camera-preset-grid");
    CAMERA_PRESETS.forEach(function (preset) {
      const choice = button(preset.label, "ds-de-camera-preset-choice");
      choice.dataset.cameraPreset = preset.label;
      choice.textContent = "";
      const thumbnail = document.createElement("canvas");
      thumbnail.width = 128; thumbnail.height = 72;
      thumbnail.className = "ds-de-camera-preset-thumbnail";
      thumbnail.setAttribute("aria-hidden", "true");
      choice.append(thumbnail, create("span", "", preset.label));
      this.cameraPresetGrid.appendChild(choice);
      this.drawCameraPresetThumbnail(thumbnail, preset);
    }, this);
    this.cameraPresetPreview = document.createElement("canvas");
    this.cameraPresetPreview.width = 320; this.cameraPresetPreview.height = 180;
    this.cameraPresetPreview.className = "ds-de-camera-preset-preview";
    this.cameraPresetPreview.setAttribute("aria-label", "鏡頭運動預覽");
    const makePresetRange = function (label, min, max, value, ariaLabel) {
      const wrapper = create("label", "ds-de-camera-preset-range");
      const title = create("span", "", label);
      const input = document.createElement("input");
      input.type = "range"; input.min = String(min); input.max = String(max); input.step = "1"; input.value = String(value);
      input.setAttribute("aria-label", ariaLabel);
      const output = create("output", "", String(value));
      wrapper.append(title, input, output);
      return { wrapper: wrapper, input: input, output: output };
    };
    this.cameraPresetX = makePresetRange("水平", -20, 20, 0, "運鏡圖層水平位置");
    this.cameraPresetY = makePresetRange("垂直", -20, 20, 0, "運鏡圖層垂直位置");
    this.cameraPresetScale = makePresetRange("縮放", 50, 150, 100, "運鏡圖層大小");
    this.cameraPresetFlipX = document.createElement("input");
    this.cameraPresetFlipX.type = "checkbox";
    this.cameraPresetFlipX.setAttribute("aria-label", "水平翻轉運鏡圖層");
    const flipX = create("label", "ds-de-camera-preset-flip", "水平翻轉");
    flipX.prepend(this.cameraPresetFlipX);
    this.cameraPresetFlipY = document.createElement("input");
    this.cameraPresetFlipY.type = "checkbox";
    this.cameraPresetFlipY.setAttribute("aria-label", "垂直翻轉運鏡圖層");
    const flipY = create("label", "ds-de-camera-preset-flip", "垂直翻轉");
    flipY.prepend(this.cameraPresetFlipY);
    this.cameraPresetEditLabel = create("strong", "ds-de-camera-preset-edit-label", "先選擇一個預設");
    this.cameraPresetAdjustments = create("div", "ds-de-camera-preset-adjustments");
    this.cameraPresetAdjustments.append(this.cameraPresetX.wrapper, this.cameraPresetY.wrapper, this.cameraPresetScale.wrapper, flipX, flipY);
    this.cameraPresetApplyButton = button("加入圖層", "ds-de-camera-preset-apply");
    this.cameraPresetPanel.append(this.cameraPresetGrid, this.cameraPresetEditLabel, this.cameraPresetPreview,
      this.cameraPresetAdjustments, this.cameraPresetApplyButton);
    this.cameraPresetDrawer.append(this.cameraPresetToggle, this.cameraPresetPanel);
    this.toolGroup.appendChild(this.cameraPresetDrawer);

    this.colorLabel = create("label", "ds-de-control-group ds-de-color-label");
    this.colorLabel.appendChild(create("span", "ds-de-label", "筆色"));
    this.colorInput = document.createElement("input");
    this.colorInput.type = "color";
    this.colorInput.value = this.color;
    this.colorInput.setAttribute("aria-label", "新筆畫顏色");
    this.colorLabel.appendChild(this.colorInput);
    this.colorSwatches = create("div", "ds-de-color-swatches");
    [["#111827", "黑"], ["#e94f3d", "紅"], ["#315b98", "藍"]].forEach(function (entry) {
      const swatch = button(entry[1], "ds-de-color-swatch");
      swatch.dataset.color = entry[0];
      swatch.title = entry[1];
      swatch.textContent = "";
      swatch.style.setProperty("--ds-de-swatch", entry[0]);
      this.colorSwatches.appendChild(swatch);
    }, this);
    this.colorLabel.appendChild(this.colorSwatches);

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
    this.widthPreview = create("span", "ds-de-brush-preview");
    this.widthPreviewDot = create("span", "ds-de-brush-preview-dot");
    this.widthPreview.appendChild(this.widthPreviewDot);
    this.widthLabel.append(this.widthInput, this.widthValue, this.widthPreview);

    this.opacityLabel = create("label", "ds-de-control-group ds-de-opacity-label");
    this.opacityLabel.appendChild(create("span", "ds-de-label", "不透明度"));
    this.opacityInput = document.createElement("input");
    this.opacityInput.type = "range";
    this.opacityInput.min = "5";
    this.opacityInput.max = "100";
    this.opacityInput.step = "1";
    this.opacityInput.value = String(Math.round(this.opacity * 100));
    this.opacityInput.setAttribute("aria-label", "筆刷不透明度");
    this.opacityValue = create("output", "ds-de-width-value", this.opacityInput.value + "%");
    this.opacityLabel.append(this.opacityInput, this.opacityValue);

    this.inputLabel = create("label", "ds-de-control-group ds-de-input-label");
    this.inputLabel.appendChild(create("span", "ds-de-label", "輸入方式"));
    this.pencilOnlyInput = document.createElement("input");
    this.pencilOnlyInput.type = "checkbox";
    this.pencilOnlyInput.checked = this.pencilOnly;
    this.pencilOnlyInput.setAttribute("role", "switch");
    this.pencilOnlyInput.setAttribute("aria-label", "只用 Apple Pencil 塗鴉");
    const pencilOnlyText = create("span", "", "只用 Apple Pencil 塗鴉");
    this.inputLabel.append(this.pencilOnlyInput, pencilOnlyText);

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
    iconOnly(this.backButton, "back");
    iconOnly(this.undoButton, "undo");
    iconOnly(this.redoButton, "redo");
    iconOnly(this.zoomOutButton, "minus");
    iconOnly(this.zoomInButton, "plus");
    iconOnly(this.fitCanvasButton, "fit");
    const drawers = [];
    const makeDrawer = (label, icon, groups) => {
      const details = create("details", "ds-de-drawer");
      const summary = create("summary", "ds-de-drawer-toggle");
      summary.setAttribute("aria-label", label);
      summary.title = label;
      appendIcon(summary, icon);
      const panel = create("div", "ds-de-drawer-panel");
      panel.append(...groups);
      details.append(summary, panel);
      this.listen(details, "toggle", () => {
        if (details.open) { this.cameraPresetDrawer.open = false; drawers.forEach(other => { if (other !== details) other.open = false; }); if (label === "圖層") this.renderLayerControls(); }
      });
      drawers.push(details);
      return details;
    };
    this.controls.append(
      this.toolGroup, this.colorLabel, this.widthLabel, this.opacityLabel,
      this.historyGroup, this.zoomGroup,
      makeDrawer("圖層", "layers", [this.layerGroup, this.layerStateGroup]),
      makeDrawer("繪圖設定", "settings", [this.inputLabel, this.modeGroup, this.sceneReuseGroup])
    );
    this.listen(document, "pointerdown", (event) => {
      if (!drawers.some(drawer => drawer.contains(event.target))) drawers.forEach(drawer => { drawer.open = false; });
      if (!this.cameraPresetDrawer.contains(event.target)) this.cameraPresetDrawer.open = false;
    });
    this.listen(shell, "keydown", (event) => {
      if (event.key !== "Escape" || !drawers.some(drawer => drawer.open) && !this.cameraPresetDrawer.open) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.cameraPresetDrawer.open) {
        this.cameraPresetDrawer.open = false;
        this.cameraPresetToggle.focus();
        return;
      }
      const open = drawers.find(drawer => drawer.open);
      open.open = false;
      open.querySelector("summary").focus();
    });
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

    this.closeDialog = create("dialog", "ds-de-close-dialog");
    this.closeDialog.setAttribute("aria-labelledby", "ds-de-close-heading");
    this.closeDialogTitle = create("h3", "", "要儲存手繪後關閉嗎？");
    this.closeDialogTitle.id = "ds-de-close-heading";
    this.closeDialogCopy = create("p", "", "已完成的筆畫會逐筆自動保存。選擇「儲存並關閉」會先完成待處理的保存；空白畫布不會另建 Drawing。");
    this.closeDialogStatus = create("p", "ds-de-close-status", "");
    this.closeDialogStatus.setAttribute("role", "status");
    this.closeDialogStatus.setAttribute("aria-live", "polite");
    this.closeDialogActions = create("div", "ds-de-close-actions");
    this.closeDialogContinueButton = button("繼續編輯", "ds-de-utility");
    this.closeDialogBackButton = button("返回關閉", "ds-de-utility");
    this.closeDialogSaveButton = button("儲存並關閉", "ds-de-save-close");
    this.closeDialogActions.append(this.closeDialogContinueButton, this.closeDialogBackButton, this.closeDialogSaveButton);
    this.closeDialog.append(this.closeDialogTitle, this.closeDialogCopy, this.closeDialogStatus, this.closeDialogActions);
    shell.appendChild(this.closeDialog);
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
    this.listen(this.backButton, "click", function () { self.closeWithoutSaving(); });
    this.listen(this.saveCloseButton, "click", function () { self.saveAndClose(); });
    this.listen(this.closeDialogContinueButton, "click", function () { self.dismissCloseDialog(); });
    this.listen(this.closeDialogBackButton, "click", function () { self.closeWithoutSaving(); });
    this.listen(this.closeDialogSaveButton, "click", function () { self.saveAndClose(); });
    this.listen(this.closeDialog, "click", function (event) {
      if (event.target === self.closeDialog && self.closeDialog.open) self.closeDialog.close();
    });
    this.listen(this.closeDialog, "cancel", function (event) { event.preventDefault(); self.dismissCloseDialog(); });
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
    this.listen(this.addLayerButton, "click", function () { self.addLayer(); });
    this.listen(this.layerControls, "click", function (event) {
      const control = event.target && event.target.closest ? event.target.closest("button[data-layer-action]") : null;
      if (!control || !self.layerControls.contains(control)) return;
      const layer = self.findLayerById(control.dataset.layerId);
      if (!layer) return;
      const action = control.dataset.layerAction;
      if (action === "select") {
        if (self.activeStroke) self.cancelActiveStroke("作用圖層已切換，未完成筆畫已取消。");
        self.layerId = layer.id;
        self.updateControls();
        self.render();
        self.updateCanvasLabel();
      } else if (action === "visibility") self.runLayerState(layer.id, { visible: !layer.visible });
      else if (action === "lock") self.runLayerState(layer.id, { locked: !layer.locked });
      else if (action === "up") self.moveLayer(layer.id, 1);
      else if (action === "down") self.moveLayer(layer.id, -1);
      else if (action === "adjustPreset") self.openCameraPresetEditorForLayer(layer.id);
      else if (action === "delete") self.deleteLayer(layer.id);
    });
    this.listen(this.cameraPresetDrawer, "toggle", function () {
      if (!self.cameraPresetDrawer.open) return;
      self.controls.querySelectorAll(".ds-de-drawer[open]").forEach(function (drawer) { drawer.open = false; });
      self.positionCameraPresetPanel();
      self.updateCameraPresetControls();
    });
    this.listen(this.cameraPresetGrid, "click", function (event) {
      const choice = event.target && event.target.closest ? event.target.closest("button[data-camera-preset]") : null;
      if (choice && self.cameraPresetGrid.contains(choice)) self.selectCameraPreset(choice.dataset.cameraPreset);
    });
    [this.cameraPresetX, this.cameraPresetY, this.cameraPresetScale].forEach(function (range) {
      self.listen(range.input, "input", function () { self.updateCameraPresetTransform(range); });
    });
    [this.cameraPresetFlipX, this.cameraPresetFlipY].forEach(function (checkbox) {
      self.listen(checkbox, "change", function () { self.updateCameraPresetTransform(); });
    });
    this.listen(this.cameraPresetApplyButton, "click", function () { self.applyCameraPreset(); });
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
    this.listen(this.colorInput, "input", function () { self.color = self.colorInput.value; self.renderBrushPreview(); self.updateControls(); });
    this.listen(this.colorSwatches, "click", function (event) {
      const swatch = event.target && event.target.closest ? event.target.closest("button[data-color]") : null;
      if (!swatch || !self.colorSwatches.contains(swatch)) return;
      self.color = swatch.dataset.color;
      self.colorInput.value = self.color;
      self.renderBrushPreview();
      self.updateControls();
    });
    this.listen(this.widthInput, "input", function () {
      self.baseWidth = Number(self.widthInput.value);
      self.widthValue.value = String(self.baseWidth) + " px";
      self.widthValue.textContent = self.widthValue.value;
      self.renderBrushPreview();
    });
    this.listen(this.opacityInput, "input", function () {
      self.opacity = Number(self.opacityInput.value) / 100;
      self.opacityValue.value = self.opacityInput.value + "%";
      self.opacityValue.textContent = self.opacityValue.value;
      self.renderBrushPreview();
    });
    this.listen(this.pencilOnlyInput, "change", function () {
      if (self.activeStroke) self.cancelActiveStroke("輸入方式已切換，未完成筆畫已取消。");
      self.clearTouchInteraction(false);
      self.pencilOnly = self.pencilOnlyInput.checked;
      self.updateCanvasLabel();
      self.updateControls();
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
      self.positionCameraPresetPanel();
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
    if (this.isDraft && this.capturedShotId && !this.pendingOperation && this.model && typeof this.model.getDrawingsForShot === "function") {
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
    if (changedId && this.drawingBusy && this.pendingOperation && this.pendingOperation.kind === "createDrawing" && this.pendingOperation.initialEdit.kind === "snapshot") {
      this.rebaseBufferedStrokes(drawing);
    } else if (changedId) {
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
    if (this.pendingOperation && this.pendingOperation.committed && !this.drawingBusy) this.pendingOperation = null;
    if (this.backgroundFailure) {
      this.setStatus("照片載入失敗；目前暫停編輯。", "error");
    } else if (this.drawingBusy) {
      this.setStatus("正在保存…", "saving");
    } else if (this.pendingOperation && this.pendingOperation.reloadRequired) {
      this.setStatus("內容已載入，但這筆筆畫尚未保存。請取消後重新操作。", "error");
    } else if (this.pendingOperation) {
      this.setStatus("尚未保存：有一筆操作待重試。", "error");
    } else if (this.isDraft && this.writable) {
      this.setStatus(this.isPlaceholder
        ? "此佔位鏡頭尚未建立；儲存並關閉時才會建立，返回關閉會捨棄草稿。"
        : "空白畫布尚未保存；開始繪製或調整設定後會自動保存。", "info");
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

  DrawingEditor.prototype.findLayerById = function (id) {
    return this.drawing && this.drawing.layers.find(function (layer) { return layer.id === id; }) || null;
  };

  DrawingEditor.prototype.layerKey = function (layer) {
    return layer && layer.kind === "custom" ? "custom:" + layer.name : layer && layer.kind;
  };

  DrawingEditor.prototype.findLayerByKey = function (key) {
    return this.drawing && this.drawing.layers.find(function (layer) { return this.layerKey(layer) === key; }, this) || null;
  };

  DrawingEditor.prototype.layerName = function (layer) {
    return layer.kind === "scene" ? "場景" : layer.kind === "subject" ? "人物動作" : layer.name;
  };

  DrawingEditor.prototype.renderLayerControls = function () {
    if (!this.layerControls || !this.layerGroup.closest("details").open) return;
    const focus = document.activeElement;
    const focusKey = focus && this.layerControls.contains(focus)
      ? { id: focus.dataset.layerId, action: focus.dataset.layerAction }
      : null;
    this.layerButtons.clear();
    this.layerStateButtons.clear();
    this.layerControls.replaceChildren();
    const layers = this.drawing ? this.drawing.layers.slice().sort(function (a, b) { return b.order - a.order; }) : [];
    layers.forEach(function (layer, index) {
      const row = create("div", "ds-de-layer-row" + (layer.id === this.layerId ? " is-selected" : ""));
      const select = button(this.layerName(layer), "ds-de-layer-select");
      select.dataset.layerId = layer.id;
      select.dataset.layerAction = "select";
      select.setAttribute("aria-pressed", String(layer.id === this.layerId));
      select.textContent = "";
      const thumbnail = document.createElement("canvas");
      thumbnail.width = 96; thumbnail.height = 54;
      thumbnail.className = "ds-de-layer-thumbnail";
      thumbnail.setAttribute("aria-hidden", "true");
      const ctx = thumbnail.getContext("2d");
      const fitted = fitContain(96,54,this.drawing.canvas.width,this.drawing.canvas.height);
      ctx.translate(fitted.x,fitted.y);
      ctx.scale(fitted.scale,fitted.scale);
      ctx.globalAlpha = layer.opacity;
      layer.strokes.forEach(stroke => this.drawStroke(ctx,stroke,this.drawing.canvas));
      const copy = create("span", "ds-de-layer-copy");
      copy.append(create("strong","",this.layerName(layer)), create("small","",
        layer.locked ? "已鎖定" : !layer.visible ? "已隱藏" : layer.strokes.length ? layer.strokes.length + " 筆畫" : "空白圖層"));
      select.append(thumbnail,copy);
      select.disabled = !this.drawing || Boolean(this.pendingOperation) || this.drawingBusy;
      row.appendChild(select);
      this.layerButtons.set(layer.id, select);
      const visibility = button(layer.visible ? "隱藏" : "顯示", "ds-de-icon-button");
      appendIcon(visibility, layer.visible ? "eye" : "eyeOff");
      visibility.dataset.layerId = layer.id;
      visibility.dataset.layerAction = "visibility";
      visibility.setAttribute("aria-pressed", String(layer.visible));
      visibility.setAttribute("aria-label", (layer.visible ? "隱藏" : "顯示") + this.layerName(layer));
      visibility.disabled = !this.canWriteLayerState(layer.id);
      row.appendChild(visibility);
      const lock = button(layer.locked ? "解鎖" : "鎖定", "ds-de-icon-button");
      appendIcon(lock, layer.locked ? "lock" : "unlock");
      lock.dataset.layerId = layer.id;
      lock.dataset.layerAction = "lock";
      lock.setAttribute("aria-pressed", String(layer.locked));
      lock.setAttribute("aria-label", (layer.locked ? "解鎖" : "鎖定") + this.layerName(layer));
      lock.disabled = !this.canWriteLayerState(layer.id);
      row.appendChild(lock);
      const up = button("上移", "ds-de-icon-button");
      appendIcon(up, "up");
      up.dataset.layerId = layer.id;
      up.dataset.layerAction = "up";
      up.disabled = index === 0 || !this.canReorderLayers();
      const actions = create("div", "ds-de-layer-actions");
      actions.hidden = layer.id !== this.layerId;
      actions.appendChild(up);
      const down = button("下移", "ds-de-icon-button");
      appendIcon(down, "down");
      down.dataset.layerId = layer.id;
      down.dataset.layerAction = "down";
      down.disabled = index === layers.length - 1 || !this.canReorderLayers();
      actions.appendChild(down);
      const remove = button("刪除", "ds-de-icon-button ds-de-danger-icon");
      appendIcon(remove, "trash");
      remove.dataset.layerId = layer.id;
      remove.dataset.layerAction = "delete";
      remove.disabled = layer.kind !== "custom" || !this.canDeleteLayer();
      remove.title = layer.kind === "custom" ? "刪除自訂圖層（可復原）" : "場景與人物動作為必要圖層";
      actions.appendChild(remove);
      if (layer.kind === "custom" && /^運鏡\s/.test(layer.name)) {
        const adjust = button("調整圖層", "ds-de-icon-button ds-de-layer-adjust");
        iconOnly(adjust, "settings");
        adjust.dataset.layerId = layer.id;
        adjust.dataset.layerAction = "adjustPreset";
        adjust.disabled = layer.id !== this.layerId || !this.canTransformCameraPreset(layer.id);
        adjust.title = layer.id === this.layerId ? "移動、縮放或翻轉此圖層的全部筆畫" : "先選取此運鏡圖層，再調整全部筆畫";
        actions.appendChild(adjust);
      }
      row.appendChild(actions);
      this.layerControls.appendChild(row);
      this.layerStateButtons.set(layer.id, { visibility: visibility, lock: lock });
    }, this);
    this.addLayerButton.disabled = !this.canAddLayer();
    this.addLayerButton.setAttribute("aria-label", "新增自訂圖層");
    this.addLayerButton.title = "最多 12 個圖層；場景與人物動作圖層會保留";
    if (focusKey) {
      const restore = Array.from(this.layerControls.querySelectorAll("button[data-layer-action]")).find(function (node) {
        return node.dataset.layerId === focusKey.id && node.dataset.layerAction === focusKey.action;
      });
      if (restore) restore.focus({ preventScroll: true });
    }
  };

  DrawingEditor.prototype.cameraPresetDirectionLabel = function (preset, transform) {
    let label = preset.label;
    const settings = transform || this.cameraPresetTransform;
    const horizontal = { "PAN L": "PAN R", "PAN R": "PAN L", "TRUCK L": "TRUCK R", "TRUCK R": "TRUCK L", "ARC L": "ARC R", "ARC R": "ARC L", "A / B": "B / A", "B / A": "A / B" };
    const vertical = { "TILT UP": "TILT DOWN", "TILT DOWN": "TILT UP", "BOOM UP": "BOOM DOWN", "BOOM DOWN": "BOOM UP" };
    if (settings.flipX && horizontal[label]) label = horizontal[label];
    if (settings.flipY && vertical[label]) label = vertical[label];
    return label;
  };

  DrawingEditor.prototype.cameraPresetBasePaths = function (preset, canvas, labelOverride) {
    if (!preset || !canvas || !Number.isFinite(canvas.width) || !Number.isFinite(canvas.height) || canvas.width <= 0 || canvas.height <= 0) return [];
    const scale = Math.min(canvas.width * 0.76 / 1000, canvas.height * 0.76 / 560);
    const label = labelOverride || this.cameraPresetDirectionLabel(preset);
    let paths = preset.paths.concat(cameraTextPaths(label));
    if (preset.label === "A / B") {
      const annotations = label === "B / A"
        ? cameraTextPaths("B", 230, 270, 60, "annotation").concat(cameraTextPaths("A", 670, 270, 60, "annotation"))
        : preset.annotations;
      paths = paths.concat(annotations);
    }
    return paths.map(function (path) {
      return { kind: path.kind, keepOrientation: path.keepOrientation, points: path.points.map(function (point) {
        return [0.5 + (point[0] - 500) * scale / canvas.width, 0.5 + (point[1] - 280) * scale / canvas.height];
      }) };
    });
  };

  DrawingEditor.prototype.cameraPresetBounds = function (paths, scale, flipX, flipY) {
    const points = [];
    paths.forEach(function (path) {
      path.points.forEach(function (point) {
        const useFlipX = flipX && !path.keepOrientation;
        const useFlipY = flipY && !path.keepOrientation;
        points.push({
          x: 0.5 + (point[0] - 0.5) * scale * (useFlipX ? -1 : 1),
          y: 0.5 + (point[1] - 0.5) * scale * (useFlipY ? -1 : 1)
        });
      });
    });
    if (!points.length) return { minX: 0.5, maxX: 0.5, minY: 0.5, maxY: 0.5 };
    return {
      minX: Math.min.apply(null, points.map(function (point) { return point.x; })),
      maxX: Math.max.apply(null, points.map(function (point) { return point.x; })),
      minY: Math.min.apply(null, points.map(function (point) { return point.y; })),
      maxY: Math.max.apply(null, points.map(function (point) { return point.y; }))
    };
  };

  DrawingEditor.prototype.cameraPresetOffsetLimits = function (paths, scale, flipX, flipY) {
    const bounds = this.cameraPresetBounds(paths, scale, flipX, flipY);
    return {
      x: { min: Math.ceil(-bounds.minX * 100), max: Math.floor((1 - bounds.maxX) * 100) },
      y: { min: Math.ceil(-bounds.minY * 100), max: Math.floor((1 - bounds.maxY) * 100) }
    };
  };

  DrawingEditor.prototype.cameraPresetScaleMax = function (paths, flipX, flipY, editing) {
    const bounds = this.cameraPresetBounds(paths, 1, flipX, flipY);
    const fit = Math.min(
      bounds.minX < 0.5 ? 0.5 / (0.5 - bounds.minX) : 2,
      bounds.maxX > 0.5 ? 0.5 / (bounds.maxX - 0.5) : 2,
      bounds.minY < 0.5 ? 0.5 / (0.5 - bounds.minY) : 2,
      bounds.maxY > 0.5 ? 0.5 / (bounds.maxY - 0.5) : 2
    );
    return Math.max(editing ? 25 : 50, Math.min(editing ? 200 : 150, Math.floor(fit * 100)));
  };

  DrawingEditor.prototype.cameraPresetTransformPaths = function (paths, transform) {
    const scale = clamp(Number(transform.scale) / 100, 0.25, 2);
    const limits = this.cameraPresetOffsetLimits(paths, scale, transform.flipX, transform.flipY);
    const xLimits = limits.x.min <= limits.x.max ? limits.x : { min: 0, max: 0 };
    const yLimits = limits.y.min <= limits.y.max ? limits.y : { min: 0, max: 0 };
    const x = clamp(Number(transform.x) / 100 || 0, xLimits.min / 100, xLimits.max / 100);
    const y = clamp(Number(transform.y) / 100 || 0, yLimits.min / 100, yLimits.max / 100);
    return paths.map(function (path) {
      const useFlipX = transform.flipX && !path.keepOrientation;
      const useFlipY = transform.flipY && !path.keepOrientation;
      return {
        kind: path.kind,
        points: path.points.map(function (point) {
          return [0.5 + (point[0] - 0.5) * scale * (useFlipX ? -1 : 1) + x,
            0.5 + (point[1] - 0.5) * scale * (useFlipY ? -1 : 1) + y];
        })
      };
    });
  };

  DrawingEditor.prototype.makeCameraPresetStrokes = function (presetOrLabel, transform, canvas, color, opacity, width) {
    const preset = typeof presetOrLabel === "string"
      ? CAMERA_PRESETS.find(function (item) { return item.label === presetOrLabel; })
      : presetOrLabel;
    const targetCanvas = canvas || this.drawing && this.drawing.canvas;
    if (!preset || !targetCanvas) return [];
    const settings = transform || { x: 0, y: 0, scale: 100, flipX: false, flipY: false };
    const paths = this.cameraPresetTransformPaths(this.cameraPresetBasePaths(preset, targetCanvas, this.cameraPresetDirectionLabel(preset, settings)), settings);
    const strokeColor = rgbaWithOpacity(color || this.color, opacity === undefined ? this.opacity : opacity);
    const baseWidth = Number.isFinite(width) && width > 0 ? width : this.baseWidth;
    return paths.map(function (path) {
      return {
        kind: path.kind,
        color: strokeColor,
        baseWidth: baseWidth,
        points: path.points.map(function (point, index) { return { x: point[0], y: point[1], t: index, pressure: null }; })
      };
    });
  };

  DrawingEditor.prototype.transformDrawingStrokes = function (strokes, transform) {
    const paths = strokes.map(function (stroke) {
      return { kind: stroke.kind, points: stroke.points.map(function (point) { return [point.x, point.y]; }) };
    });
    const points = this.cameraPresetTransformPaths(paths, transform);
    return strokes.map(function (stroke, strokeIndex) {
      const next = clone(stroke);
      delete next.id;
      next.points = stroke.points.map(function (point, pointIndex) {
        return Object.assign({}, point, { x: points[strokeIndex].points[pointIndex][0], y: points[strokeIndex].points[pointIndex][1] });
      });
      return next;
    });
  };

  DrawingEditor.prototype.drawCameraPresetThumbnail = function (canvas, preset) {
    const context = canvas.getContext("2d");
    if (!context) return;
    const board = { width: 1920, height: 1080 };
    const strokes = this.makeCameraPresetStrokes(preset, { x: 0, y: 0, scale: 100, flipX: false, flipY: false }, board, "#315b98", 1, 6);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.scale(canvas.width / board.width, canvas.height / board.height);
    strokes.forEach(function (stroke) { this.drawStroke(context, stroke, board); }, this);
    context.restore();
  };

  DrawingEditor.prototype.positionCameraPresetPanel = function () {
    if (!this.cameraPresetDrawer || !this.cameraPresetDrawer.open) return;
    const anchor = this.cameraPresetToggle.getBoundingClientRect();
    const panel = this.cameraPresetPanel;
    const width = Math.min(360, Math.max(200, window.innerWidth - 24));
    panel.style.width = width + "px";
    const left = clamp(anchor.left, 12, Math.max(12, window.innerWidth - width - 12));
    const top = clamp(anchor.bottom + 8, 12, Math.max(12, window.innerHeight - panel.offsetHeight - 12));
    panel.style.left = left + "px";
    panel.style.top = top + "px";
  };

  DrawingEditor.prototype.cameraPresetSourcePaths = function () {
    if (this.cameraPresetEdit) {
      return this.cameraPresetEdit.strokes.map(function (stroke) {
        return { kind: stroke.kind, points: stroke.points.map(function (point) { return [point.x, point.y]; }) };
      });
    }
    const preset = CAMERA_PRESETS.find(function (item) { return item.label === this.cameraPresetSelection; }, this);
    return preset ? this.cameraPresetBasePaths(preset, this.drawing && this.drawing.canvas, this.cameraPresetDirectionLabel(preset)) : [];
  };

  DrawingEditor.prototype.updateCameraPresetRanges = function (paths) {
    if (!paths.length) return;
    const editing = Boolean(this.cameraPresetEdit);
    const scaleMax = this.cameraPresetScaleMax(paths, this.cameraPresetTransform.flipX, this.cameraPresetTransform.flipY, editing);
    this.cameraPresetScale.input.min = editing ? "25" : "50";
    this.cameraPresetScale.input.max = String(scaleMax);
    this.cameraPresetTransform.scale = clamp(Number(this.cameraPresetTransform.scale) || 100, editing ? 25 : 50, scaleMax);
    this.cameraPresetScale.input.value = String(this.cameraPresetTransform.scale);
    this.cameraPresetScale.output.value = this.cameraPresetTransform.scale + "%";
    this.cameraPresetScale.output.textContent = this.cameraPresetScale.output.value;
    const limits = this.cameraPresetOffsetLimits(paths, this.cameraPresetTransform.scale / 100,
      this.cameraPresetTransform.flipX, this.cameraPresetTransform.flipY);
    [[this.cameraPresetX, "x"], [this.cameraPresetY, "y"]].forEach(function (entry) {
      const range = entry[0];
      const axis = entry[1];
      let min = limits[axis].min;
      let max = limits[axis].max;
      if (min > max) min = max = 0;
      range.input.min = String(min);
      range.input.max = String(max);
      this.cameraPresetTransform[axis] = clamp(Number(this.cameraPresetTransform[axis]) || 0, min, max);
      range.input.value = String(this.cameraPresetTransform[axis]);
      range.output.value = this.cameraPresetTransform[axis] + "%";
      range.output.textContent = range.output.value;
    }, this);
  };

  DrawingEditor.prototype.renderCameraPresetPreview = function () {
    const canvas = this.cameraPresetPreview;
    const context = canvas && canvas.getContext("2d");
    if (!context || !this.drawing || !this.drawing.canvas) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const fitted = fitContain(canvas.width, canvas.height, this.drawing.canvas.width, this.drawing.canvas.height);
    const strokes = this.cameraPresetEdit
      ? this.transformDrawingStrokes(this.cameraPresetEdit.strokes, this.cameraPresetTransform)
      : this.cameraPresetSelection && this.makeCameraPresetStrokes(this.cameraPresetSelection, this.cameraPresetTransform);
    context.save();
    context.translate(fitted.x, fitted.y);
    context.scale(fitted.scale, fitted.scale);
    (strokes || []).forEach(function (stroke) { this.drawStroke(context, stroke, this.drawing.canvas); }, this);
    context.restore();
    const layer = this.cameraPresetEdit && this.findLayerById(this.cameraPresetEdit.layerId);
    const preset = CAMERA_PRESETS.find(function (item) { return item.label === this.cameraPresetSelection; }, this);
    this.cameraPresetPreview.setAttribute("aria-label", this.cameraPresetEdit
      ? "調整「" + (layer && layer.name || "運鏡圖層") + "」全部筆畫的預覽"
      : "「" + (preset ? this.cameraPresetDirectionLabel(preset) : "鏡頭運動") + "」預設預覽");
  };

  DrawingEditor.prototype.canAddCameraPreset = function () {
    return Boolean(this.canAddLayer() && (this.isDraft || this.isPlaceholder ||
      this.model && typeof this.model.addDrawingLayerWithStrokes === "function"));
  };

  DrawingEditor.prototype.canTransformCameraPreset = function (layerId) {
    const layer = this.findLayerById(layerId);
    if (!layer || layer.kind !== "custom" || !/^運鏡\s/.test(layer.name) || !layer.visible || layer.locked || !layer.strokes.length ||
        !this.writable || !this.canQueueCommand() || this.activeStroke || this.pendingOperation || this.drawingBusy || !this.backgroundReady || this.backgroundFailure ||
        !Number.isInteger(this.currentProjectRevision())) return false;
    return Boolean(this.isDraft || this.isPlaceholder || this.model && typeof this.model.replaceDrawingLayerStrokes === "function");
  };

  DrawingEditor.prototype.updateCameraPresetControls = function () {
    if (!this.cameraPresetPanel) return;
    const editing = Boolean(this.cameraPresetEdit);
    const selected = CAMERA_PRESETS.find(function (preset) { return preset.label === this.cameraPresetSelection; }, this);
    const label = selected && this.cameraPresetDirectionLabel(selected);
    const paths = this.cameraPresetSourcePaths();
    this.cameraPresetGrid.hidden = editing;
    this.cameraPresetEditLabel.hidden = !editing && !selected;
    this.cameraPresetEditLabel.textContent = editing
      ? "調整「" + (this.findLayerById(this.cameraPresetEdit.layerId) || {}).name + "」全部筆畫"
      : selected ? "預覽「" + label + "」" : "";
    this.cameraPresetPreview.hidden = !editing && !selected;
    this.cameraPresetAdjustments.hidden = !editing && !selected;
    this.cameraPresetApplyButton.hidden = !editing && !selected;
    if (paths.length) this.updateCameraPresetRanges(paths);
    const unavailable = editing ? !this.canTransformCameraPreset(this.cameraPresetEdit.layerId) : !selected || !this.canAddCameraPreset();
    this.cameraPresetApplyButton.disabled = unavailable;
    this.cameraPresetApplyButton.textContent = editing ? "更新圖層" : selected ? "加入「" + label + "」圖層" : "選擇預設";
    this.cameraPresetApplyButton.title = editing
      ? "以預覽內容更新此圖層的全部筆畫；可用復原還原"
      : !this.canAddCameraPreset() ? "目前無法新增運鏡圖層，請確認畫布可編輯且尚未達 12 個圖層" : "新增透明的獨立運鏡圖層";
    const disabled = !editing && !selected;
    [this.cameraPresetX.input, this.cameraPresetY.input, this.cameraPresetScale.input].forEach(function (input) { input.disabled = disabled; });
    this.cameraPresetFlipX.disabled = this.cameraPresetFlipY.disabled = disabled || editing;
    this.cameraPresetX.output.value = this.cameraPresetX.input.value + "%";
    this.cameraPresetX.output.textContent = this.cameraPresetX.output.value;
    this.cameraPresetY.output.value = this.cameraPresetY.input.value + "%";
    this.cameraPresetY.output.textContent = this.cameraPresetY.output.value;
    this.cameraPresetFlipX.checked = Boolean(this.cameraPresetTransform.flipX);
    this.cameraPresetFlipY.checked = Boolean(this.cameraPresetTransform.flipY);
    this.cameraPresetGrid.querySelectorAll("button[data-camera-preset]").forEach(function (choice) {
      const active = choice.dataset.cameraPreset === this.cameraPresetSelection;
      choice.classList.toggle("is-selected", active);
      choice.setAttribute("aria-pressed", String(active));
    }, this);
    this.renderCameraPresetPreview();
    this.positionCameraPresetPanel();
  };

  DrawingEditor.prototype.selectCameraPreset = function (label) {
    if (!CAMERA_PRESETS.some(function (preset) { return preset.label === label; })) return false;
    this.cameraPresetEdit = null;
    this.cameraPresetSelection = label;
    this.cameraPresetTransform = { x: 0, y: 0, scale: 100, flipX: false, flipY: false };
    this.updateCameraPresetControls();
    return true;
  };

  DrawingEditor.prototype.updateCameraPresetTransform = function (range) {
    if (range === this.cameraPresetX) this.cameraPresetTransform.x = Number(range.input.value);
    if (range === this.cameraPresetY) this.cameraPresetTransform.y = Number(range.input.value);
    if (range === this.cameraPresetScale) this.cameraPresetTransform.scale = Number(range.input.value);
    this.cameraPresetTransform.flipX = this.cameraPresetFlipX.checked;
    this.cameraPresetTransform.flipY = this.cameraPresetFlipY.checked;
    this.updateCameraPresetControls();
  };

  DrawingEditor.prototype.uniqueCameraPresetLayerName = function (label) {
    const names = new Set(this.drawing.layers.filter(function (layer) { return layer.kind === "custom"; }).map(function (layer) { return layer.name; }));
    const base = "運鏡 " + label;
    if (!names.has(base)) return base;
    let suffix = 2;
    while (names.has(base + " " + suffix)) suffix += 1;
    return base + " " + suffix;
  };

  DrawingEditor.prototype.createLocalCameraPresetLayer = function (drawing, name, strokeDrafts) {
    let suffix = 1;
    let id = drawing.id + ":preset:" + suffix;
    while (drawing.layers.some(function (layer) { return layer.id === id; })) id = drawing.id + ":preset:" + (++suffix);
    const layer = { projectId: this.capturedProjectId, drawingId: drawing.id, id: id, kind: "custom", name: name,
      visible: true, locked: false, opacity: 1, order: drawing.layers.length, strokes: [] };
    layer.strokes = strokeDrafts.map(function (stroke, index) {
      return Object.assign({ id: id + ":stroke:" + (index + 1) }, clone(stroke));
    });
    drawing.schemaVersion = 3;
    drawing.layers.push(layer);
    this.layerId = layer.id;
  };

  DrawingEditor.prototype.openCameraPresetEditorForLayer = function (layerId) {
    const layer = this.findLayerById(layerId);
    if (layerId !== this.layerId || !this.canTransformCameraPreset(layerId)) return false;
    this.cameraPresetSelection = null;
    this.cameraPresetEdit = { layerId: layer.id, drawingId: this.drawing.id, drawingRevision: this.drawing.revision, strokes: clone(layer.strokes) };
    this.cameraPresetTransform = { x: 0, y: 0, scale: 100, flipX: false, flipY: false };
    this.cameraPresetDrawer.open = true;
    this.updateCameraPresetControls();
    return true;
  };

  DrawingEditor.prototype.applyCameraPreset = function () {
    if (this.cameraPresetEdit) {
      const edit = this.cameraPresetEdit;
      const layer = this.findLayerById(edit.layerId);
      if (!layer || this.drawing.id !== edit.drawingId || this.drawing.revision !== edit.drawingRevision || JSON.stringify(layer.strokes) !== JSON.stringify(edit.strokes)) {
        this.setStatus("圖層內容已更新；沒有套用舊預覽，請重新開啟調整。", "error");
        return false;
      }
      if (!this.canTransformCameraPreset(layer.id)) return false;
      const strokes = this.transformDrawingStrokes(edit.strokes, this.cameraPresetTransform);
      this.cameraPresetEdit = null;
      this.cameraPresetDrawer.open = false;
      if (this.isPlaceholder) {
        this.recordPlaceholderEdit(function (drawing) {
          const target = drawing.layers.find(function (item) { return item.id === edit.layerId; });
          if (target) target.strokes = strokes.map(function (stroke, index) {
            return Object.assign({ id: edit.strokes[index] && edit.strokes[index].id || edit.layerId + ":stroke:" + (index + 1) }, stroke);
          });
        });
        return true;
      }
      if (this.isDraft) {
        layer.strokes = strokes.map(function (stroke, index) {
          return Object.assign({ id: edit.strokes[index] && edit.strokes[index].id || "draft:" + edit.layerId + ":" + (index + 1) }, stroke);
        });
        const snapshot = drawingSnapshotForShotCreate(this.drawing);
        snapshot.backgroundAssetId = null;
        snapshot.backgroundCrop = null;
        return this.createFromDraft(snapshot);
      }
      this.pendingOperation = { kind: "replaceLayerStrokes", projectId: this.capturedProjectId, shotId: this.capturedShotId,
        baseRevision: this.currentProjectRevision(), drawingRevision: this.drawing.revision, drawingId: this.drawing.id,
        layerId: layer.id, strokeDrafts: strokes, originalStrokeIds: this.collectStrokeIds() };
      return this.submitPending();
    }

    const preset = CAMERA_PRESETS.find(function (item) { return item.label === this.cameraPresetSelection; }, this);
    if (!preset || !this.canAddCameraPreset()) return false;
    const strokes = this.makeCameraPresetStrokes(preset, this.cameraPresetTransform);
    if (!strokes.length) return false;
    const name = this.uniqueCameraPresetLayerName(this.cameraPresetDirectionLabel(preset));
    this.cameraPresetDrawer.open = false;
    if (this.isPlaceholder) {
      return this.recordPlaceholderEdit(function (drawing) { this.createLocalCameraPresetLayer(drawing, name, strokes); }.bind(this));
    }
    if (this.isDraft) {
      this.createLocalCameraPresetLayer(this.drawing, name, strokes);
      const snapshot = drawingSnapshotForShotCreate(this.drawing);
      snapshot.backgroundAssetId = null;
      snapshot.backgroundCrop = null;
      this.updateControls();
      this.render();
      return this.createFromDraft(snapshot);
    }
    this.pendingOperation = { kind: "addPresetLayer", projectId: this.capturedProjectId, shotId: this.capturedShotId,
      baseRevision: this.currentProjectRevision(), drawingRevision: this.drawing.revision, drawingId: this.drawing.id,
      layerName: name, strokeDrafts: strokes, originalStrokeIds: this.collectStrokeIds() };
    this.updateControls();
    return this.submitPending();
  };

  DrawingEditor.prototype.activeLayer = function () {
    return this.drawing && this.drawing.layers.find(function (layer) { return layer.id === this.layerId; }, this) || null;
  };

  DrawingEditor.prototype.canQueueCommand = function () {
    const lifecycle = this.model && typeof this.model.getLifecycle === "function" ? this.model.getLifecycle() : null;
    return !lifecycle || Boolean(lifecycle.writable && lifecycle.pendingCount === 0 && lifecycle.phase !== "save_failed");
  };

  DrawingEditor.prototype.canCreateFromDraft = function () {
    return Boolean(this.isDraft && this.model && (this.isPlaceholder
      ? typeof this.model.addShotWithDrawing === "function"
      : typeof this.model.createDrawingForShotWithInitialEdit === "function"));
  };

  DrawingEditor.prototype.recordPlaceholderEdit = function (mutate) {
    if (!this.isPlaceholder || !this.isDraft || !this.drawing || typeof mutate !== "function") return false;
    this.placeholderHistory.push(clone(this.drawing));
    if (this.placeholderHistory.length > 100) this.placeholderHistory.shift();
    this.placeholderRedo = [];
    mutate(this.drawing);
    if (!this.activeLayer()) this.layerId = this.findLayer("scene").id;
    this.placeholderDirty = true;
    this.setStatus("尚未儲存；按「儲存並關閉」才會建立鏡頭。", "info");
    this.updateControls();
    this.render();
    return true;
  };

  DrawingEditor.prototype.placeholderHasStrokes = function () {
    return Boolean(this.drawing && this.drawing.layers.some(function (layer) {
      return Array.isArray(layer.strokes) && layer.strokes.length > 0;
    }));
  };

  DrawingEditor.prototype.createPlaceholderSnapshot = function () {
    if (!this.drawing || !this.placeholderHasStrokes()) return null;
    return drawingSnapshotForShotCreate(this.drawing);
  };

  DrawingEditor.prototype.assertCurrentPlaceholderTarget = function (pending) {
    const project = this.getCurrentProjectSnapshot();
    const lifecycle = this.model && typeof this.model.getLifecycle === "function" ? this.model.getLifecycle() : null;
    const sceneExists = project && Array.isArray(project.scenes) && project.scenes.some(function (scene) {
      return scene && scene.id === pending.sceneId;
    });
    if (!project || !sceneExists || project.revision !== pending.baseRevision || this.currentProjectRevision() !== pending.baseRevision ||
        lifecycle && lifecycle.selectedProjectId !== pending.projectId) {
      const error = new Error("專案或場次已更新；草稿尚未送出，請重新開啟佔位卡片。");
      error.code = "DRAWING_TARGET_REVISION_CHANGED";
      throw error;
    }
    if (lifecycle && (!lifecycle.writable || lifecycle.pendingCount > 0)) {
      const error = new Error(lifecycle.readOnlyReason || "目前無法保存；草稿仍保留在畫布。");
      error.code = lifecycle.writable ? "MODEL_COMMAND_PENDING" : "DRAWING_READ_ONLY";
      throw error;
    }
  };

  DrawingEditor.prototype.verifyPlaceholderCommit = function (pending, result) {
    if (!result || typeof result.shotId !== "string" || !result.shotId ||
        typeof result.drawingId !== "string" || !result.drawingId || !Number.isInteger(result.revision)) {
      throw new Error("Model 未回傳可核對的 Shot、Drawing ID 與 Revision。");
    }
    const project = this.getCurrentProjectSnapshot();
    const shot = project && project.shots && project.shots.find(function (item) { return item.id === result.shotId; });
    const drawing = this.getDrawingSnapshot(result.drawingId, project);
    if (!project || project.revision !== result.revision || !shot || shot.sceneId !== pending.sceneId ||
        !Array.isArray(shot.drawingIds) || !shot.drawingIds.includes(result.drawingId) || !drawing ||
        drawing.projectId !== pending.projectId || drawing.shotId !== result.shotId) {
      throw new Error("鏡頭已建立，但目前無法核對 Shot 與 Drawing 關係；請重新載入確認，避免重複保存。");
    }
    const expected = pending.initialEdit;
    const actual = drawingSnapshotForShotCreate(drawing);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error("鏡頭已建立，但目前無法核對 Drawing 初始內容；請重新載入確認，避免重複保存。");
    }
    return { shotId: result.shotId, drawingId: result.drawingId, revision: result.revision, drawing: drawing };
  };

  DrawingEditor.prototype.adoptPlaceholderCommit = function (pending, result) {
    pending.committed = true;
    const committed = this.verifyPlaceholderCommit(pending, result);
    this.capturedShotId = committed.shotId;
    this.initialDrawing = { id: committed.drawingId };
    this.drawing = committed.drawing;
    this.isDraft = false;
    this.isPlaceholder = false;
    this.placeholderCommitted = true;
    this.placeholder = null;
    const activeKind = this.activeLayer() && this.activeLayer().kind || "scene";
    this.layerId = (this.drawing.layers.find(function (layer) { return layer.kind === activeKind; }) || this.drawing.layers[0] || {}).id || null;
    this.stage.style.aspectRatio = this.drawing.canvas.width + " / " + this.drawing.canvas.height;
    if (this.onCreated && !pending.notified) {
      pending.notified = true;
      try { this.onCreated({ shotId: committed.shotId, drawingId: committed.drawingId, revision: committed.revision }); }
      catch (_) { /* host observation must not affect a committed Model command */ }
    }
    return committed.drawing;
  };

  DrawingEditor.prototype.canBufferStroke = function () {
    const pending = this.pendingOperation;
    const layer = this.activeLayer();
    return Boolean(this.writable && this.tool !== "eraser" && this.backgroundReady && !this.backgroundFailure &&
      layer && layer.visible && !layer.locked && pending && !pending.error &&
      (pending.kind === "append" || pending.kind === "createDrawing" && pending.initialEdit.kind === "snapshot"));
  };

  DrawingEditor.prototype.rebaseBufferedStrokes = function (drawing) {
    const oldId = this.drawing && this.drawing.id;
    if (oldId === drawing.id) return;
    const remap = entry => {
      if (entry.drawingId !== oldId) return;
      const previous = this.drawing.layers.find(layer => layer.id === entry.layerId);
      const layer = previous && drawing.layers.find(layer => layer.kind === previous.kind && layer.order === previous.order);
      if (!layer) return;
      entry.drawingId = drawing.id; entry.layerId = layer.id;
    };
    this.strokeQueue.forEach(remap);
    if (this.activeStroke && this.activeStroke.buffered) remap(this.activeStroke);
  };

  DrawingEditor.prototype.drainStrokeQueue = function () {
    if (this.destroyed || this.pendingOperation || this.drawingBusy || !this.strokeQueue.length || !this.writable || !this.canQueueCommand()) return;
    const entry = this.strokeQueue[0];
    const layer = this.drawing.layers.find(layer => layer.id === entry.layerId);
    if (entry.projectId !== this.capturedProjectId || entry.drawingId !== this.drawing.id || !layer || !layer.visible || layer.locked) {
      this.setStatus("後續筆畫尚未保存，目標圖層已變更。請保留此畫面並恢復圖層後重試。", "error");
      return;
    }
    this.strokeQueue.shift();
    this.pendingOperation = { kind: "append", projectId: this.capturedProjectId, shotId: this.capturedShotId,
      baseRevision: this.currentProjectRevision(), drawingRevision: this.drawing.revision,
      drawingId: this.drawing.id, layerId: layer.id, strokeDraft: entry.strokeDraft, originalStrokeIds: this.collectStrokeIds() };
    void this.submitPending();
  };

  DrawingEditor.prototype.isEditable = function () {
    const layer = this.activeLayer();
    const hasCommand = this.tool === "eraser"
      ? this.isPlaceholder || this.model && typeof this.model.eraseDrawingStroke === "function"
      : this.canCreateFromDraft() || this.model && typeof this.model.appendDrawingStroke === "function";
    const canVerifyTarget = this.model && (typeof this.model.getDrawing === "function" || typeof this.model.getProject === "function");
    return Boolean(this.writable && this.canQueueCommand() && hasCommand && canVerifyTarget && Number.isInteger(this.currentProjectRevision()) && this.backgroundReady && !this.backgroundFailure && this.drawing && layer && layer.visible && !layer.locked && !this.pendingOperation && !this.drawingBusy);
  };

  DrawingEditor.prototype.canAddLayer = function () {
    const canVerifyTarget = this.model && (typeof this.model.getDrawing === "function" || typeof this.model.getProject === "function");
    const canSave = this.isPlaceholder || this.isDraft || this.model && typeof this.model.addDrawingLayer === "function";
    return Boolean(this.drawing && this.drawing.layers.length < 12 && this.writable && this.canQueueCommand() && canSave && canVerifyTarget &&
      Number.isInteger(this.currentProjectRevision()) && this.backgroundReady && !this.backgroundFailure && !this.pendingOperation && !this.drawingBusy);
  };

  DrawingEditor.prototype.canDeleteLayer = function () {
    const canVerifyTarget = this.model && (typeof this.model.getDrawing === "function" || typeof this.model.getProject === "function");
    const canSave = this.isPlaceholder || this.isDraft || this.model && typeof this.model.deleteDrawingLayer === "function";
    return Boolean(this.drawing && this.writable && this.canQueueCommand() && canSave && canVerifyTarget && Number.isInteger(this.currentProjectRevision()) &&
      this.backgroundReady && !this.backgroundFailure && !this.pendingOperation && !this.drawingBusy);
  };

  DrawingEditor.prototype.canReorderLayers = function () {
    const canVerifyTarget = this.model && (typeof this.model.getDrawing === "function" || typeof this.model.getProject === "function");
    const canSave = this.isPlaceholder || this.isDraft || this.model && typeof this.model.reorderDrawingLayers === "function";
    return Boolean(this.drawing && this.writable && this.canQueueCommand() && canSave && canVerifyTarget && Number.isInteger(this.currentProjectRevision()) &&
      this.backgroundReady && !this.backgroundFailure && !this.pendingOperation && !this.drawingBusy);
  };

  DrawingEditor.prototype.canWriteLayerState = function (idOrKind) {
    const layer = this.findLayerById(idOrKind) || this.findLayer(idOrKind);
    const canVerifyTarget = this.model && (typeof this.model.getDrawing === "function" || typeof this.model.getProject === "function");
    const canSave = this.canCreateFromDraft() || this.model && typeof this.model.setDrawingLayerState === "function";
    return Boolean(layer && this.drawing && this.writable && this.canQueueCommand() && canSave && canVerifyTarget && Number.isInteger(this.currentProjectRevision()) && this.backgroundReady && !this.backgroundFailure && !this.pendingOperation && !this.drawingBusy);
  };

  DrawingEditor.prototype.canClearActiveLayer = function () {
    const layer = this.activeLayer();
    const canVerifyTarget = this.model && (typeof this.model.getDrawing === "function" || typeof this.model.getProject === "function");
    const canSave = this.isPlaceholder || this.model && typeof this.model.clearDrawingLayer === "function";
    return Boolean(layer && layer.visible && !layer.locked && layer.strokes.length > 0 && !this.activeStroke && this.drawing && this.writable && this.canQueueCommand() && canSave && canVerifyTarget && Number.isInteger(this.currentProjectRevision()) && this.backgroundReady && !this.backgroundFailure && !this.pendingOperation && !this.drawingBusy);
  };

  DrawingEditor.prototype.canWriteHistory = function (kind) {
    if (this.isPlaceholder) {
      const available = kind === "redo" ? this.placeholderRedo.length > 0 : this.placeholderHistory.length > 0;
      return Boolean(available && this.writable && this.canQueueCommand() && this.drawing && this.backgroundReady && !this.backgroundFailure &&
        Number.isInteger(this.currentProjectRevision()) && !this.pendingOperation && !this.drawingBusy);
    }
    const method = kind === "redo" ? "redo" : "undo";
    const canRedoDraft = this.isDraft && kind === "redo";
    return Boolean((!this.isDraft || canRedoDraft) && this.writable && this.canQueueCommand() && this.drawing && this.backgroundReady && !this.backgroundFailure && Number.isInteger(this.currentProjectRevision()) && !this.pendingOperation && !this.drawingBusy && this.model && typeof this.model[method] === "function");
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
    if (this.isPlaceholder) return false;
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
    const canWrite = Boolean(!this.isPlaceholder && numbering.ok && source && this.drawing && targetScene && targetScene.visible && !targetScene.locked &&
      this.writable && this.canQueueCommand() && canSaveReuse &&
      Number.isInteger(this.currentProjectRevision()) && this.backgroundReady && !this.backgroundFailure &&
      !this.activeStroke && !this.pendingOperation && !this.drawingBusy);
    this.sceneReuseSelect.disabled = this.isPlaceholder || !numbering.ok || !this.writable || !sources.size || Boolean(this.pendingOperation) || this.drawingBusy;
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
    this.updateCameraPresetControls();
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
    this.renderLayerControls();
    const activeLayerName = activeLayer ? this.layerName(activeLayer) : "作用圖層";
    this.clearLayerButton.disabled = !this.canClearActiveLayer();
    this.clearLayerButton.textContent = "清空 " + activeLayerName;
    this.clearLayerButton.setAttribute("aria-label", "清空" + activeLayerName + "圖層中的全部筆跡；執行前會要求確認，並可復原");
    this.clearLayerButton.title = activeLayer ? "只清空目前作用圖層的全部筆跡；相片底圖和另一圖層不會改變" : "尚未載入作用圖層";
    this.toolButtons.forEach(function (control, tool) {
      const hasCommand = tool === "eraser"
        ? this.isPlaceholder || this.model && typeof this.model.eraseDrawingStroke === "function"
        : this.canCreateFromDraft() || this.model && typeof this.model.appendDrawingStroke === "function";
      const canVerifyTarget = this.model && (typeof this.model.getDrawing === "function" || typeof this.model.getProject === "function");
      control.disabled = !this.drawing || !activeLayer || !this.writable || !this.canQueueCommand() || !hasCommand || !canVerifyTarget || !Number.isInteger(this.currentProjectRevision()) || !this.backgroundReady || Boolean(this.backgroundFailure) || Boolean(this.pendingOperation) || this.drawingBusy;
      control.setAttribute("aria-pressed", String(this.tool === tool));
    }, this);
    this.colorInput.disabled = !this.writable || Boolean(this.pendingOperation) || this.drawingBusy;
    this.widthInput.disabled = !this.writable || Boolean(this.pendingOperation) || this.drawingBusy;
    this.opacityInput.disabled = !this.writable || Boolean(this.pendingOperation) || this.drawingBusy;
    this.pencilOnlyInput.disabled = !this.writable || Boolean(this.pendingOperation) || this.drawingBusy;
    this.renderBrushPreview();
    this.focusButton.disabled = this.mode === "focus";
    this.splitButton.disabled = this.mode === "split";
    this.zoomOutButton.disabled = !this.drawing || this.viewTransform.scale <= 1.001;
    this.zoomInButton.disabled = !this.drawing || this.viewTransform.scale >= 3.999;
    this.fitCanvasButton.disabled = !this.drawing || this.viewTransform.scale <= 1.001 && this.viewTransform.x === 0 && this.viewTransform.y === 0;
    const zoomPercent = Math.round(this.viewTransform.scale * 100);
    this.zoomOutButton.setAttribute("aria-label", "縮小畫布，目前 " + zoomPercent + "%");
    this.zoomInButton.setAttribute("aria-label", "放大畫布，目前 " + zoomPercent + "%");
    this.fitCanvasButton.setAttribute("aria-label", "將畫布調整為適合檢視；目前 " + zoomPercent + "%");
    this.undoButton.disabled = !this.canWriteHistory("undo") || (this.isPlaceholder
      ? this.placeholderHistory.length === 0
      : !(typeof this.model.canUndo === "function" ? this.model.canUndo() : true));
    this.redoButton.disabled = !this.canWriteHistory("redo") || (this.isPlaceholder
      ? this.placeholderRedo.length === 0
      : !(typeof this.model.canRedo === "function" ? this.model.canRedo() : true));
    this.updateSceneReuseControls();
    this.backButton.disabled = Boolean(this.drawingBusy || this.pendingOperation);
    const placeholderReadRetry = Boolean(this.pendingOperation && this.pendingOperation.kind === "createShotWithDrawing" && this.pendingOperation.readFailed && this.pendingOperation.result);
    this.retryButton.hidden = !this.pendingOperation || Boolean(this.pendingOperation.committed && !placeholderReadRetry) || Boolean(this.pendingOperation.reloadRequired);
    if (this.pendingOperation && this.pendingOperation.queued && (!this.model || typeof this.model.retryPending !== "function") && !placeholderReadRetry) this.retryButton.hidden = true;
    this.retryButton.disabled = !this.pendingOperation || Boolean(this.pendingOperation.queued && (!this.model || typeof this.model.retryPending !== "function") && !placeholderReadRetry) || this.drawingBusy;
    this.discardButton.hidden = !this.canDiscardFailedCandidate();
    this.discardButton.disabled = this.drawingBusy;
    this.reloadButton.hidden = !this.readDrawing || Boolean(this.drawing && !(this.pendingOperation && (this.pendingOperation.readFailed || this.pendingOperation.reloadRequired)));
    this.saveCloseButton.hidden = !this.onBack;
    this.saveCloseButton.disabled = this.closeBusy;
    this.changeBackgroundButton.hidden = this.isPlaceholder || !this.model || !this.canCreateFromDraft() && typeof this.model.setDrawingBackground !== "function" || typeof this.model.getProject !== "function";
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
    this.updateCloseDialogControls();
    const missingCommands = [];
    if (!this.model || typeof this.model.appendDrawingStroke !== "function" || typeof this.model.eraseDrawingStroke !== "function") missingCommands.push("筆畫與橡皮功能尚未就緒");
    if (!this.model || typeof this.model.getDrawing !== "function" && typeof this.model.getProject !== "function") missingCommands.push("手繪內容讀取功能尚未就緒");
    const unavailableLayerFeatures = [];
    if (!this.model || typeof this.model.clearDrawingLayer !== "function") unavailableLayerFeatures.push("清空圖層功能尚未就緒");
    if (!this.isDraft && !this.isPlaceholder && (!this.model || typeof this.model.setDrawingLayerState !== "function" ||
        typeof this.model.addDrawingLayer !== "function" || typeof this.model.deleteDrawingLayer !== "function" || typeof this.model.reorderDrawingLayers !== "function")) unavailableLayerFeatures.push("圖層新增、刪除、排序、顯示與鎖定功能尚未就緒");
    this.featureNote.textContent = this.isPlaceholder
      ? "這是尚未建立的鏡頭草稿；「儲存並關閉」會一併建立鏡頭與手繪內容，返回關閉會捨棄草稿。"
      : this.isDraft
      ? "此鏡頭尚未建立手繪內容；返回鏡頭不會保存空白畫布。第一次繪製或調整設定時自動保存。"
      : unavailableLayerFeatures.length
      ? unavailableLayerFeatures.join("；") + "，相關操作已停用。"
      : "圖層可新增、排序、隱藏、鎖定與刪除；場景和人物動作是必要圖層。畫筆可平滑模擬筆壓，麥克筆遵循所選不透明度。";
    if (!this.writable) this.hint.textContent = "唯讀：" + (this.readOnlyReason || "目前沒有編輯權。") + " 兩指可縮放／平移，也可用畫布檢視按鈕。照片僅供參考。";
    else if (missingCommands.length) this.hint.textContent = missingCommands.join("；") + "，目前不接受筆畫輸入。";
    else if (activeLayer && (!activeLayer.visible || activeLayer.locked)) this.hint.textContent = "目前作用圖層" + (activeLayer.visible ? "已顯示" : "已隱藏") + (activeLayer.locked ? "且已鎖定" : "") + "；可使用圖層設定控制顯示與鎖定狀態。兩指可縮放／平移。";
    else this.hint.textContent = "兩指可縮放／平移，也可用畫布檢視按鈕。畫筆會平滑模擬筆壓；鉛筆與麥克筆維持固定筆觸。";
    this.hint.classList.toggle("ds-de-sr-only", this.writable && !missingCommands.length && !(activeLayer && (!activeLayer.visible || activeLayer.locked)));
    this.updateCanvasLabel();
  };

  DrawingEditor.prototype.renderBrushPreview = function () {
    const size = Math.max(2, Math.min(40, this.baseWidth));
    this.widthPreviewDot.style.cssText = "display:block;border-radius:50%;width:" + size + "px;height:" + size + "px;background:" + this.color + ";opacity:" + this.opacity;
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
    this.strokeQueue = [];
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
    const inputName = this.pencilOnly ? "只用 Apple Pencil 塗鴉" : "滑鼠與觸控筆繪圖";
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

  DrawingEditor.prototype.requestClose = function () {
    if (this.destroyed || !this.onBack) return false;
    if (this.activeStroke) this.cancelActiveStroke("離開手繪畫布時取消未完成筆畫。");
    this.clearTouchInteraction(true);
    this.closeDialogStatus.textContent = this.pendingOperation || this.drawingBusy
      ? "目前有保存作業進行中；可選擇儲存並關閉，等待結果確認。"
      : this.isPlaceholder
        ? this.placeholderHasStrokes() ? "鏡頭與手繪都尚未保存；「儲存並關閉」會一併建立，返回關閉會捨棄草稿。" : "尚未建立鏡頭；返回關閉或儲存並關閉都不會建立空白鏡頭。"
        : this.isDraft ? "空白畫布尚未建立 Drawing。" : "已完成的筆畫會逐筆自動保存。";
    this.updateCloseDialogControls();
    if (this.closeDialog.open) return true;
    if (typeof this.closeDialog.showModal === "function") this.closeDialog.showModal();
    else this.closeDialog.setAttribute("open", "");
    this.closeDialogContinueButton.focus({ preventScroll: true });
    return true;
  };

  DrawingEditor.prototype.updateCloseDialogControls = function () {
    if (!this.closeDialog) return;
    const busy = Boolean(this.drawingBusy || this.closeBusy);
    if (this.saveCloseButton) this.saveCloseButton.disabled = Boolean(this.closeBusy);
    this.closeDialogBackButton.disabled = busy || Boolean(this.pendingOperation);
    this.closeDialogSaveButton.disabled = Boolean(this.closeBusy);
    if (this.closeBusy) {
      this.closeDialogStatus.textContent = "正在確認保存狀態…";
      this.closeDialogContinueButton.disabled = true;
      this.closeDialogBackButton.disabled = true;
    } else {
      this.closeDialogContinueButton.disabled = false;
    }
  };

  DrawingEditor.prototype.dismissCloseDialog = function () {
    if (this.closeBusy) return false;
    if (this.closeDialog.open) this.closeDialog.close();
    else this.closeDialog.removeAttribute("open");
    this.backButton.focus({ preventScroll: true });
    return true;
  };

  DrawingEditor.prototype.finishClose = function () {
    if (this.destroyed || !this.onBack || this.drawingBusy || this.pendingOperation) return false;
    if (this.closeDialog.open) this.closeDialog.close();
    else this.closeDialog.removeAttribute("open");
    this.clearTouchInteraction(true);
    const result = { drawingId: this.isDraft ? null : this.drawing && this.drawing.id, shotId: this.capturedShotId, projectId: this.capturedProjectId };
    if (this.placeholder || this.placeholderCommitted) {
      result.saved = Boolean(this.placeholderCommitted);
      if (this.placeholderResult) result.revision = this.placeholderResult.revision;
    }
    this.onBack(result);
    return true;
  };

  DrawingEditor.prototype.closeWithoutSaving = function () {
    if (this.destroyed || !this.onBack) return false;
    if (this.drawingBusy || this.pendingOperation) {
      this.closeDialogStatus.textContent = "尚有保存作業待確認；請先選擇「儲存並關閉」或返回處理保存。";
      this.updateCloseDialogControls();
      return false;
    }
    return this.finishClose();
  };

  DrawingEditor.prototype.saveAndClose = async function () {
    if (this.destroyed || !this.onBack || this.closeBusy) return false;
    if (this.activeStroke) this.cancelActiveStroke("準備保存並關閉時取消未完成筆畫。");
    this.clearTouchInteraction(true);
    this.closeBusy = true;
    this.updateCloseDialogControls();
    const startedAt = Date.now();
    try {
      while (this.drawingBusy && Date.now() - startedAt < 20000) {
        await new Promise(function (resolve) { setTimeout(resolve, 25); });
      }
      if (this.drawingBusy) {
        this.closeDialogStatus.textContent = "保存仍在進行中；畫布保持開啟，請稍候再試。";
        return false;
      }
      if (this.pendingOperation) await this.retry();
      if (this.isPlaceholder) {
        if (this.pendingOperation) {
          this.closeDialogStatus.textContent = "鏡頭尚未建立成功；草稿仍保留，請重試或取消保存作業。";
          return false;
        }
        const initialEdit = this.createPlaceholderSnapshot();
        if (initialEdit) {
          const pending = {
            kind: "createShotWithDrawing",
            projectId: this.capturedProjectId,
            sceneId: this.placeholder.sceneId,
            initialPatch: clone(this.placeholder.initialShotPatch),
            initialEdit: initialEdit,
            baseRevision: this.placeholderBaseRevision,
            queued: false
          };
          this.pendingOperation = pending;
          await this.submitPlaceholderCreate(pending);
          if (!this.placeholderCommitted || this.pendingOperation) {
            this.closeDialogStatus.textContent = "鏡頭尚未確認保存；草稿仍保留在畫布。可重試同一保存。";
            return false;
          }
        } else {
          this.setStatus("沒有可保存的筆畫；尚未建立空白鏡頭。", "info");
        }
        return this.finishClose();
      }
      if (this.drawingBusy) {
        while (this.drawingBusy && Date.now() - startedAt < 20000) {
          await new Promise(function (resolve) { setTimeout(resolve, 25); });
        }
      }
      if (this.drawingBusy || this.pendingOperation) {
        this.closeDialogStatus.textContent = "目前操作尚未確認保存；畫布仍保持開啟，請重試保存或重新載入確認。";
        return false;
      }
      return this.finishClose();
    } catch (error) {
      this.closeDialogStatus.textContent = "保存未完成：" + (error && error.message || "請留在畫布重試。");
      return false;
    } finally {
      this.closeBusy = false;
      if (!this.destroyed) this.updateCloseDialogControls();
    }
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
    if (this.pencilOnly) return event.pointerType === "pen";
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
    if ((!this.isEditable() && !this.canBufferStroke()) || !event.isPrimary || this.activeStroke) return;
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
      buffered: this.canBufferStroke(),
      drawingId: this.drawing.id,
      projectId: this.capturedProjectId,
      projectRevision: projectRevision,
      drawingRevision: this.drawing.revision,
      layerId: layer.id,
      tool: this.tool,
      pointerType: event.pointerType,
      color: rgbaWithOpacity(this.color, this.opacity),
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
    const active = this.activeStroke;
    const last = active && active.points[active.points.length - 1];
    let pressure = null;
    if ((active ? active.tool : this.tool) === "brush") {
      const speed = last ? Math.hypot((point.x - last.x) * this.drawing.canvas.width,
        (point.y - last.y) * this.drawing.canvas.height) / Math.max(8, time - last.t) : 0;
      const target = 0.3 + 0.7 * (1 - clamp(speed / 2, 0, 1));
      pressure = last ? last.pressure + (target - last.pressure) * 0.12 : 0.65;
    }
    return { x: pressure !== null && last ? last.x + (point.x-last.x) * 0.45 : point.x,
      y: pressure !== null && last ? last.y + (point.y-last.y) * 0.45 : point.y, t: Math.max(0, time), pressure: pressure };
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
          this.requestRender();
          return;
        }
        const point = this.pointerPoint(event);
        if (point) this.touchEraserCandidate.point = point;
        const bounds = this.stage.getBoundingClientRect();
        this.eraserPointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, pointerType: event.pointerType };
        this.requestRender();
        return;
      }
    }
    const active = this.activeStroke;
    if (!active) {
      if (this.tool === "eraser" && this.acceptsPointer(event)) {
        const bounds = this.stage.getBoundingClientRect();
        this.eraserPointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, pointerType: event.pointerType };
        this.requestRender();
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
    this.requestRender();
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
      points: shapeStrokePoints(active.tool, active.points[0], active.points[active.points.length - 1]) || active.points
    };
    const currentLayer = this.activeLayer();
    if (active.drawingId !== (this.drawing && this.drawing.id) || active.projectId !== this.capturedProjectId || active.layerId !== this.layerId || (!active.buffered && (active.projectRevision !== this.currentProjectRevision() || active.drawingRevision !== (this.drawing && this.drawing.revision))) || !currentLayer || !currentLayer.visible || currentLayer.locked || !this.writable) {
      this.setStatus("目標已改變，未完成筆畫已取消。", "info");
      this.render();
      return;
    }
    if (active.buffered) {
      this.strokeQueue.push({ projectId: active.projectId, drawingId: active.drawingId, layerId: active.layerId, strokeDraft: clone(draft) });
      this.render();
      this.drainStrokeQueue();
      return;
    }
    if (this.isDraft) {
      if (this.isPlaceholder) {
        this.recordPlaceholderEdit(function (drawing) {
          const layer = drawing.layers.find(function (item) { return item.id === active.layerId; });
          if (!layer) return;
          layer.strokes.push(Object.assign({
            id: "draft:" + this.capturedProjectId + ":stroke:" + (++this.placeholderStrokeSequence)
          }, clone(draft)));
        }.bind(this));
        return;
      }
      currentLayer.strokes.push(Object.assign({ id: "draft:initial-stroke" }, clone(draft)));
      const snapshot = drawingSnapshotForShotCreate(this.drawing);
      snapshot.backgroundAssetId = null;
      snapshot.backgroundCrop = null;
      this.createFromDraft(snapshot);
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

  DrawingEditor.prototype.addLayer = function () {
    if (!this.canAddLayer()) return false;
    const names = new Set(this.drawing.layers.filter(function (layer) { return layer.kind === "custom"; }).map(function (layer) { return layer.name; }));
    let suffix = 1;
    while (names.has("圖層 " + suffix)) suffix += 1;
    const name = "圖層 " + suffix;
    const addLocal = function (drawing) {
      drawing.schemaVersion = 3;
      const layer = { projectId: this.capturedProjectId, drawingId: drawing.id, id: drawing.id + ":custom:" + suffix,
        kind: "custom", name: name, visible: true, locked: false, opacity: 1, order: drawing.layers.length, strokes: [] };
      drawing.layers.push(layer);
      this.layerId = layer.id;
    }.bind(this);
    if (this.isPlaceholder) return this.recordPlaceholderEdit(addLocal);
    if (this.isDraft) {
      addLocal(this.drawing);
      this.layerId = this.drawing.layers[this.drawing.layers.length - 1].id;
      this.setStatus("草稿未保存；完成第一筆後會一併保存圖層。", "info");
      this.updateControls();
      this.render();
      return true;
    }
    this.pendingOperation = { kind: "addLayer", projectId: this.capturedProjectId, shotId: this.capturedShotId,
      baseRevision: this.currentProjectRevision(), drawingRevision: this.drawing.revision, drawingId: this.drawing.id,
      layerName: name, originalStrokeIds: this.collectStrokeIds() };
    this.submitPending();
    return true;
  };

  DrawingEditor.prototype.deleteLayer = function (layerId) {
    const layer = this.findLayerById(layerId);
    if (!layer || layer.kind !== "custom" || !this.canDeleteLayer()) return false;
    const count = layer.strokes.length;
    if (typeof window === "undefined" || typeof window.confirm !== "function" || !window.confirm("確定刪除「" + layer.name + "」圖層？其中 " + count + " 筆筆跡會一併移除；可用復原還原。")) return false;
    const removeLocal = function (drawing) {
      drawing.layers = drawing.layers.filter(function (item) { return item.id !== layer.id; });
      drawing.layers.sort(function (a, b) { return a.order - b.order; });
      drawing.layers.forEach(function (item, order) { item.order = order; });
    };
    if (this.isPlaceholder) return this.recordPlaceholderEdit(removeLocal);
    if (this.isDraft) {
      removeLocal(this.drawing);
      this.layerId = this.findLayer("scene").id;
      this.setStatus("草稿圖層已移除；下一筆保存時會一併更新。", "info");
      this.updateControls();
      this.render();
      return true;
    }
    this.pendingOperation = { kind: "deleteLayer", projectId: this.capturedProjectId, shotId: this.capturedShotId,
      baseRevision: this.currentProjectRevision(), drawingRevision: this.drawing.revision, drawingId: this.drawing.id,
      layerId: layer.id, originalLayer: clone(layer), originalStrokeIds: this.collectStrokeIds() };
    this.submitPending();
    return true;
  };

  DrawingEditor.prototype.moveLayer = function (layerId, delta) {
    if (!this.canReorderLayers()) return false;
    const layers = this.drawing.layers.slice().sort(function (a, b) { return a.order - b.order; });
    const index = layers.findIndex(function (layer) { return layer.id === layerId; });
    const next = index + delta;
    if (index < 0 || next < 0 || next >= layers.length) return false;
    const moved = layers.splice(index, 1)[0];
    layers.splice(next, 0, moved);
    const ids = layers.map(function (layer) { return layer.id; });
    if (this.isPlaceholder || this.isDraft) {
      const reorderLocal = function (drawing) {
        const byId = new Map(drawing.layers.map(function (layer) { return [layer.id, layer]; }));
        drawing.layers = ids.map(function (id, order) { const layer = byId.get(id); layer.order = order; return layer; });
        drawing.schemaVersion = 3;
      };
      if (this.isPlaceholder) return this.recordPlaceholderEdit(reorderLocal);
      reorderLocal(this.drawing);
      this.updateControls();
      this.render();
      return true;
    }
    this.pendingOperation = { kind: "reorderLayers", projectId: this.capturedProjectId, shotId: this.capturedShotId,
      baseRevision: this.currentProjectRevision(), drawingRevision: this.drawing.revision, drawingId: this.drawing.id,
      layerIds: ids, originalStrokeIds: this.collectStrokeIds() };
    this.submitPending();
    return true;
  };

  DrawingEditor.prototype.runLayerState = function (idOrKind, patch) {
    const layer = this.findLayerById(idOrKind) || this.findLayer(idOrKind);
    if (!layer || !this.canWriteLayerState(layer.id)) return false;
    if (this.activeStroke) this.cancelActiveStroke("圖層設定已變更，未完成筆畫已取消。");
    if (this.isPlaceholder || this.isDraft) {
      if (this.isPlaceholder) return this.recordPlaceholderEdit(function (drawing) {
        const target = drawing.layers.find(function (item) { return item.id === layer.id; });
        if (target) Object.keys(patch).forEach(function (key) { target[key] = patch[key]; });
      });
      const target = this.findLayerById(layer.id);
      if (target) Object.keys(patch).forEach(function (key) { target[key] = patch[key]; });
      this.setStatus("草稿未保存；完成第一筆後會一併保存圖層設定。", "info");
      this.updateControls();
      this.render();
      return true;
    }
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
    if (this.isPlaceholder) {
      return this.recordPlaceholderEdit(function (drawing) {
        const target = drawing.layers.find(function (item) { return item.id === layer.id; });
        if (target) target.strokes = [];
      });
    }
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
    if (this.isPlaceholder) {
      this.recordPlaceholderEdit(function (drawing) {
        const target = drawing.layers.find(function (item) { return item.id === layer.id; });
        if (target) target.strokes = target.strokes.filter(function (stroke) { return stroke.id !== hit.id; });
      });
      return;
    }
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
    this.rebaseBufferedStrokes(fresh);
    this.isDraft = false;
    this.drawing = fresh;
    this.layerId = (fresh.layers.find(function (layer) { return layer.kind === activeKind; }) || fresh.layers[0] || {}).id || null;
    return fresh;
  };

  DrawingEditor.prototype.completePlaceholderCreate = async function (pending, result) {
    this.adoptPlaceholderCommit(pending, result);
    this.placeholderResult = { shotId: result.shotId, drawingId: result.drawingId, revision: result.revision };
    this.pendingOperation = null;
    this.setStatus("鏡頭與手繪已一併保存。", "saved");
    this.updateControls();
    await this.refreshBackground();
    return true;
  };

  DrawingEditor.prototype.submitPlaceholderCreate = async function (pending) {
    if (!pending || pending.kind !== "createShotWithDrawing" || this.drawingBusy) return false;
    if (!this.model || typeof this.model.addShotWithDrawing !== "function") {
      pending.error = new Error("目前無法原子建立鏡頭與手繪內容；草稿仍保留。請重新載入後再試。");
      this.setStatus(pending.error.message, "error");
      this.updateControls();
      return false;
    }
    this.drawingBusy = true;
    this.setStatus("正在一併保存鏡頭與手繪內容…", "saving");
    this.updateControls();
    this.render();
    try {
      this.assertCurrentPlaceholderTarget(pending);
      pending.queued = true;
      const result = await this.model.addShotWithDrawing(
        pending.sceneId, clone(pending.initialPatch), clone(pending.initialEdit), pending.baseRevision
      );
      pending.result = clone(result);
      return await this.completePlaceholderCreate(pending, result);
    } catch (error) {
      pending.error = error;
      const lifecycle = this.model && typeof this.model.getLifecycle === "function" ? this.model.getLifecycle() : null;
      if (lifecycle && lifecycle.pendingCount === 0 && lifecycle.phase !== "save_failed") pending.queued = false;
      if (pending.committed) {
        pending.readFailed = true;
        this.setStatus("鏡頭已建立，但目前無法確認最新 Drawing；請重試確認，避免重複保存。", "error");
      } else {
        this.setStatus("鏡頭與手繪尚未保存：" + (error && error.message || "請重試同一保存。"), "error");
      }
      return false;
    } finally {
      this.drawingBusy = false;
      this.updateControls();
      this.render();
      this.drainStrokeQueue();
    }
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
      addLayer: "addDrawingLayer",
      addPresetLayer: "addDrawingLayerWithStrokes",
      replaceLayerStrokes: "replaceDrawingLayerStrokes",
      deleteLayer: "deleteDrawingLayer",
      reorderLayers: "reorderDrawingLayers",
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
      else if (pending.kind === "addLayer") pending.addedLayerId = await this.model.addDrawingLayer(pending.drawingId, pending.layerName);
      else if (pending.kind === "addPresetLayer") pending.addedLayerId = await this.model.addDrawingLayerWithStrokes(pending.drawingId, pending.layerName, clone(pending.strokeDrafts));
      else if (pending.kind === "replaceLayerStrokes") await this.model.replaceDrawingLayerStrokes(pending.drawingId, pending.layerId, clone(pending.strokeDrafts));
      else if (pending.kind === "deleteLayer") await this.model.deleteDrawingLayer(pending.drawingId, pending.layerId);
      else if (pending.kind === "reorderLayers") await this.model.reorderDrawingLayers(pending.drawingId, pending.layerIds);
      else if (pending.kind === "reuseScene") await this.model.reuseSceneLayer(pending.sourceDrawingId, pending.drawingId);
      else if (pending.kind === "background") await this.model.setDrawingBackground(pending.drawingId, pending.assetId);
      else throw new Error("目前無法執行此操作。");
      let fresh = this.drawing;
      if (pending.kind !== "createDrawing") {
        pending.committed = true;
        fresh = await this.readCurrentDrawing();
        if (!this.didCommitPending(pending, fresh)) throw new Error("操作已送出，但目前無法確認結果；請重新載入內容，避免重複操作。");
        this.drawing = fresh;
        if (pending.kind === "addLayer" || pending.kind === "addPresetLayer") this.layerId = pending.addedLayerId;
        if (!this.activeLayer()) this.layerId = this.findLayer("scene").id;
      }
      this.pendingOperation = null;
      if (pending.kind === "replaceLayerStrokes") this.cameraPresetEdit = null;
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
      this.drainStrokeQueue();
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
    if (pending.kind === "history" && pending.historyKind === "redo" && this.isDraft) {
      const project = this.getCurrentProjectSnapshot();
      const shot = project && project.shots.find(function (item) { return item.id === pending.shotId; });
      if (!project || project.revision !== pending.baseRevision || this.currentProjectRevision() !== pending.baseRevision || !shot || !Array.isArray(shot.drawingIds) || shot.drawingIds.length) {
        const error = new Error("專案或鏡頭已更新；此重做尚未送出，請重新載入後再試。");
        error.code = "DRAWING_TARGET_REVISION_CHANGED";
        throw error;
      }
      return;
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
    if (["addLayer", "addPresetLayer", "reorderLayers"].includes(pending.kind)) return;
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
    if (["append", "erase", "clear", "reuseScene", "replaceLayerStrokes"].includes(pending.kind) && (!layer.visible || layer.locked || (pending.kind === "reuseScene" && layer.kind !== "scene"))) {
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
      if (edit.kind === "snapshot") return JSON.stringify(drawingSnapshotForShotCreate(drawing).layers) === JSON.stringify(edit.layers);
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
    if (pending.kind === "addLayer") return drawing.layers.some(function (layer) { return layer.id === pending.addedLayerId && layer.name === pending.layerName; });
    if (pending.kind === "addPresetLayer") {
      const layer = drawing.layers.find(function (item) { return item.id === pending.addedLayerId && item.name === pending.layerName; });
      if (!layer) return false;
      const withoutIds = function (strokes) { return strokes.map(function (stroke) { const copy = clone(stroke); delete copy.id; return copy; }); };
      return JSON.stringify(withoutIds(layer.strokes)) === JSON.stringify(pending.strokeDrafts);
    }
    if (pending.kind === "deleteLayer") return !drawing.layers.some(function (layer) { return layer.id === pending.layerId; });
    if (pending.kind === "reorderLayers") return JSON.stringify(drawing.layers.slice().sort(function (a,b) { return a.order-b.order; }).map(function (layer) { return layer.id; })) === JSON.stringify(pending.layerIds);
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
    if (pending.kind === "replaceLayerStrokes") {
      const withoutIds = function (strokes) { return strokes.map(function (stroke) { const copy = clone(stroke); delete copy.id; return copy; }); };
      return JSON.stringify(withoutIds(layer.strokes)) === JSON.stringify(pending.strokeDrafts);
    }
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
    if (this.pendingOperation.kind === "createShotWithDrawing") {
      const pendingPlaceholder = this.pendingOperation;
      if (!pendingPlaceholder.queued && !(pendingPlaceholder.committed && pendingPlaceholder.result)) {
        await this.submitPlaceholderCreate(pendingPlaceholder);
        return;
      }
      if (!pendingPlaceholder.committed && typeof this.model.retryPending !== "function") return;
      this.drawingBusy = true;
      this.setStatus("正在確認並重試鏡頭與手繪保存…", "saving");
      this.updateControls();
      try {
        let result = pendingPlaceholder.result;
        if (!pendingPlaceholder.committed || !result) result = await this.model.retryPending();
        if (result === false || !result) throw new Error("目前沒有可重試的保存；草稿仍保留，請重新載入確認。");
        pendingPlaceholder.result = clone(result);
        await this.completePlaceholderCreate(pendingPlaceholder, result);
      } catch (error) {
        pendingPlaceholder.error = error;
        const lifecycle = this.model && typeof this.model.getLifecycle === "function" ? this.model.getLifecycle() : null;
        if (lifecycle && lifecycle.pendingCount === 0 && lifecycle.phase !== "save_failed") pendingPlaceholder.queued = false;
        if (pendingPlaceholder.committed) {
          pendingPlaceholder.readFailed = true;
          this.setStatus("鏡頭已建立，但目前仍無法確認 Drawing；請重新載入檢查。", "error");
        } else {
          this.setStatus("鏡頭與手繪仍未保存；請重試同一保存。", "error");
        }
      } finally {
        this.drawingBusy = false;
        this.updateControls();
        this.render();
      }
      return;
    }
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
      this.drainStrokeQueue();
    }
  };

  DrawingEditor.prototype.runHistory = async function (kind) {
    if (!this.canWriteHistory(kind)) return;
    if (this.isPlaceholder) {
      const activeKind = this.activeLayer() && this.activeLayer().kind;
      if (kind === "undo") {
        this.placeholderRedo.push(clone(this.drawing));
        this.drawing = this.placeholderHistory.pop();
      } else {
        this.placeholderHistory.push(clone(this.drawing));
        this.drawing = this.placeholderRedo.pop();
      }
      const activeLayer = this.findLayer(activeKind) || this.findLayer("scene") || this.drawing.layers[0];
      this.layerId = activeLayer ? activeLayer.id : null;
      this.placeholderDirty = true;
      this.setStatus("草稿已" + (kind === "undo" ? "復原" : "重做") + "；按「儲存並關閉」才會建立鏡頭。", "info");
      this.updateControls();
      this.render();
      return;
    }
    const projectRevision = this.currentProjectRevision();
    const layer = this.activeLayer();
    if (!Number.isInteger(projectRevision) || !layer) return;
    const wasDraft = this.isDraft;
    const activeLayerKind = layer.kind;
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
      if (kind === "redo" && wasDraft) {
        const restoredDrawings = this.model && typeof this.model.getDrawingsForShot === "function"
          ? this.model.getDrawingsForShot(this.capturedShotId)
          : projectAfterHistory && Array.isArray(projectAfterHistory.drawings)
            ? projectAfterHistory.drawings.filter(function (item) { return item.shotId === this.capturedShotId; }, this)
            : null;
        if (!Array.isArray(restoredDrawings)) throw new Error("無法確認重做後此鏡頭的 Drawing；請重新載入後再操作。");
        if (restoredDrawings.length > 1) throw new Error("重做後此鏡頭有多個 Drawing；請重新開啟鏡頭並選擇要編輯的版本。");
        if (restoredDrawings.length === 1) {
          const restored = restoredDrawings[0];
          if (!restored || restored.projectId !== this.capturedProjectId || restored.shotId !== this.capturedShotId || !restored.id) {
            throw new Error("重做後 Drawing 的專案或鏡頭關係不符；請重新載入後再操作。");
          }
          this.isDraft = false;
          this.initialDrawing = { id: restored.id };
          this.drawing = clone(restored);
          const restoredLayer = this.findLayer(activeLayerKind) || this.findLayer("scene") || this.drawing.layers[0];
          this.layerId = restoredLayer ? restoredLayer.id : null;
          this.stage.style.aspectRatio = this.drawing.canvas.width + " / " + this.drawing.canvas.height;
        } else {
          await this.refreshBackground();
          this.pendingOperation = null;
          this.setStatus("已重做；此鏡頭目前仍為空白畫布。", "info");
          return;
        }
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
      this.drainStrokeQueue();
    }
  };

  DrawingEditor.prototype.requestRender = function () {
    if (this.destroyed || this.renderFrame !== null) return;
    this.renderFrame = window.requestAnimationFrame(() => {
      this.renderFrame = null;
      if (!this.destroyed) this.render();
    });
  };

  DrawingEditor.prototype.render = function () {
    if (this.renderFrame !== null) { window.cancelAnimationFrame(this.renderFrame); this.renderFrame = null; }
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
        points: shapeStrokePoints(this.activeStroke.tool, this.activeStroke.points[0], this.activeStroke.points[this.activeStroke.points.length - 1]) || this.activeStroke.points
      }, canvas, true);
    }
    if (this.pendingOperation && this.pendingOperation.kind === "append" && !this.didCommitPending(this.pendingOperation, this.drawing)) this.drawStroke(ctx, this.pendingOperation.strokeDraft, canvas, true);
    this.strokeQueue.forEach(entry => this.drawStroke(ctx, entry.strokeDraft, canvas, true));
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

  DrawingEditor.prototype.drawStroke = function (ctx, stroke, canvas) {
    if (stroke && stroke.points.length >= 2) storyboardRenderer.drawStroke(ctx, stroke, canvas);
  };

  DrawingEditor.prototype.destroy = function () {
    this.destroyed = true;
    if (this.renderFrame !== null) window.cancelAnimationFrame(this.renderFrame);
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
      this.saveCloseButton.hidden = !this.onBack;
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
        requestClose: editor.requestClose.bind(editor),
        saveAndClose: editor.saveAndClose.bind(editor),
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
