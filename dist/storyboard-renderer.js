(function attachStoryboardRenderer(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DirectorStoryboardRenderer = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function createStoryboardRenderer() {
  "use strict";

  // Bump this whenever raster output changes. Callers should include this value
  // in preview/export cache keys; previewDrawingRevision is deliberately unused.
  const VERSION = "1.1.0";
  const SNAPSHOT_VERSION = 1;
  const ASPECT_RATIOS = new Set(["1:1", "4:3", "16:9", "2.35:1"]);

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function finitePositive(value, name) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      fail("INVALID_RENDER_SIZE", name + " 必須是正的有限數字。");
    }
    return value;
  }

  function fitContain(viewWidth, viewHeight, contentWidth, contentHeight) {
    [viewWidth, viewHeight, contentWidth, contentHeight].forEach(function (value, index) {
      finitePositive(value, ["viewWidth", "viewHeight", "contentWidth", "contentHeight"][index]);
    });
    const scale = Math.min(viewWidth / contentWidth, viewHeight / contentHeight);
    const width = contentWidth * scale;
    const height = contentHeight * scale;
    return {
      x: (viewWidth - width) / 2,
      y: (viewHeight - height) / 2,
      width: width,
      height: height,
      scale: scale
    };
  }

  function imageDimensions(image) {
    if (!image || (typeof image !== "object" && typeof image !== "function")) {
      fail("INVALID_BACKGROUND_IMAGE", "背景照片必須是已解碼的 CanvasImageSource。");
    }
    const width = Number("naturalWidth" in image ? image.naturalWidth : ("videoWidth" in image ? image.videoWidth : image.width));
    const height = Number("naturalHeight" in image ? image.naturalHeight : ("videoHeight" in image ? image.videoHeight : image.height));
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      fail("BACKGROUND_IMAGE_NOT_READY", "背景照片尚未完成解碼或尺寸無效。");
    }
    return { width: width, height: height };
  }

  function copyPoint(point, path) {
    if (!point || typeof point !== "object") fail("INVALID_DRAWING", path + " 必須是座標物件。");
    const x = point.x;
    const y = point.y;
    if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 1 ||
        typeof y !== "number" || !Number.isFinite(y) || y < 0 || y > 1) {
      fail("INVALID_DRAWING", path + " 的 x/y 必須介於 0 與 1。");
    }
    return { x: x, y: y };
  }

  function copyBackgroundCrop(crop) {
    if (crop === undefined || crop === null) return null;
    if (!crop || typeof crop !== "object" || Array.isArray(crop)) {
      fail("INVALID_DRAWING", "Drawing backgroundCrop 必須是 normalized rect 或 null。");
    }
    const fields = ["x", "y", "width", "height"];
    const keys = Object.keys(crop);
    if (keys.length !== fields.length || keys.some(function (key) { return fields.indexOf(key) < 0; })) {
      fail("INVALID_DRAWING", "Drawing backgroundCrop 只接受 x、y、width、height 四個欄位。");
    }
    fields.forEach(function (key) {
      const value = crop[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
        fail("INVALID_DRAWING", "Drawing backgroundCrop." + key + " 必須是 0 到 1 之間的有限數字。");
      }
    });
    if (crop.width === 0 || crop.height === 0 || crop.x + crop.width > 1 || crop.y + crop.height > 1) {
      fail("INVALID_DRAWING", "Drawing backgroundCrop 必須是原圖範圍內的非零矩形。");
    }
    return { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
  }

  function backgroundDrawGeometry(canvasWidth, canvasHeight, sourceWidth, sourceHeight, crop) {
    const sourceRect = copyBackgroundCrop(crop);
    const x = sourceRect ? sourceRect.x : 0;
    const y = sourceRect ? sourceRect.y : 0;
    const width = sourceRect ? sourceRect.width : 1;
    const height = sourceRect ? sourceRect.height : 1;
    const source = Object.freeze({
      x: x * finitePositive(sourceWidth, "backgroundWidth"),
      y: y * finitePositive(sourceHeight, "backgroundHeight"),
      width: width * sourceWidth,
      height: height * sourceHeight
    });
    const destination = Object.freeze(fitContain(canvasWidth, canvasHeight, source.width, source.height));
    return Object.freeze({ source: source, destination: destination });
  }

  function copyStroke(stroke, path) {
    if (!stroke || typeof stroke !== "object") fail("INVALID_DRAWING", path + " 必須是筆跡物件。");
    if (stroke.kind !== "pen" && stroke.kind !== "cameraArrow") {
      fail("INVALID_DRAWING", path + ".kind 不受支援。");
    }
    if (typeof stroke.color !== "string" || !stroke.color.trim()) {
      fail("INVALID_DRAWING", path + ".color 必須是非空字串。");
    }
    if (typeof stroke.baseWidth !== "number" || !Number.isFinite(stroke.baseWidth) || stroke.baseWidth <= 0) {
      fail("INVALID_DRAWING", path + ".baseWidth 必須是正的有限數字。");
    }
    if (!Array.isArray(stroke.points) || stroke.points.length < 2) {
      fail("INVALID_DRAWING", path + ".points 至少需要兩點。");
    }
    if (stroke.kind === "cameraArrow" && stroke.points.length !== 2) {
      fail("INVALID_DRAWING", path + " 的 cameraArrow 必須恰有兩點。");
    }
    return {
      kind: stroke.kind,
      color: stroke.color,
      baseWidth: stroke.baseWidth,
      points: stroke.points.map(function (point, index) { return copyPoint(point, path + ".points[" + index + "]"); })
    };
  }

  function copyDrawing(drawing) {
    if (!drawing || typeof drawing !== "object") fail("INVALID_DRAWING", "Drawing 必須是物件或 null。");
    const canvas = drawing.canvas;
    if (!canvas || typeof canvas !== "object" || !Number.isInteger(canvas.width) || canvas.width <= 0 ||
        !Number.isInteger(canvas.height) || canvas.height <= 0 || !ASPECT_RATIOS.has(canvas.aspectRatio)) {
      fail("INVALID_DRAWING", "Drawing canvas 必須有有效比例與正整數寬高。");
    }
    if (!Array.isArray(drawing.layers) || drawing.layers.length !== 2) {
      fail("INVALID_DRAWING", "Drawing 必須包含 scene 與 subject 兩個 Layer。");
    }
    const seenKinds = new Set();
    const seenOrders = new Set();
    const layers = drawing.layers.map(function (layer, index) {
      if (!layer || typeof layer !== "object" || (layer.kind !== "scene" && layer.kind !== "subject")) {
        fail("INVALID_DRAWING", "Drawing Layer kind 只能是 scene 或 subject。");
      }
      if (seenKinds.has(layer.kind) || !Number.isInteger(layer.order) || layer.order < 0 || seenOrders.has(layer.order)) {
        fail("INVALID_DRAWING", "Drawing Layer kind/order 必須唯一且有效。");
      }
      if (typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean") {
        fail("INVALID_DRAWING", "Drawing Layer visible/locked 必須是布林值。");
      }
      if (typeof layer.opacity !== "number" || !Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) {
        fail("INVALID_DRAWING", "Drawing Layer opacity 必須介於 0 與 1。");
      }
      if (!Array.isArray(layer.strokes)) fail("INVALID_DRAWING", "Drawing Layer strokes 必須是陣列。");
      seenKinds.add(layer.kind);
      seenOrders.add(layer.order);
      return {
        kind: layer.kind,
        order: layer.order,
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity,
        strokes: layer.strokes.map(function (stroke, strokeIndex) {
          return copyStroke(stroke, "layers[" + index + "].strokes[" + strokeIndex + "]");
        })
      };
    });
    if (!seenKinds.has("scene") || !seenKinds.has("subject") || !seenOrders.has(0) || !seenOrders.has(1)) {
      fail("INVALID_DRAWING", "Drawing 必須有 order 0 的 Layer 與 order 1 的 Layer，並各含 scene/subject。");
    }
    const backgroundAssetId = drawing.backgroundAssetId;
    if (backgroundAssetId !== null && typeof backgroundAssetId !== "string") {
      fail("INVALID_DRAWING", "Drawing backgroundAssetId 必須是字串或 null。");
    }
    const backgroundCrop = copyBackgroundCrop(drawing.backgroundCrop);
    if (backgroundAssetId === null && backgroundCrop !== null) {
      fail("INVALID_DRAWING", "Drawing 沒有照片底圖時 backgroundCrop 必須是 null 或省略。");
    }
    return {
      id: typeof drawing.id === "string" ? drawing.id : null,
      revision: Number.isInteger(drawing.revision) && drawing.revision >= 0 ? drawing.revision : null,
      canvas: { aspectRatio: canvas.aspectRatio, width: canvas.width, height: canvas.height },
      backgroundAssetId: backgroundAssetId,
      backgroundCrop: backgroundCrop,
      layers: layers
    };
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function snapshotKey(drawing, backgroundFingerprint) {
    return JSON.stringify({
      rendererVersion: VERSION,
      drawing: drawing,
      backgroundFingerprint: backgroundFingerprint
    });
  }

  /**
   * Capture the render-relevant Drawing fields once. The optional photo must
   * already have been loaded and integrity-checked by the caller; its verified
   * SHA-256 hex digest is required as backgroundFingerprint. This module checks
   * digest format, not photo bytes. The caller owns async freshness checks and
   * should compare sourceKey with its current snapshot before publishing an
   * async preview/export result.
   */
  function createSnapshot(drawing, options) {
    const config = options || {};
    const backgroundImage = config.backgroundImage || null;
    let backgroundFingerprint = config.backgroundFingerprint == null ? null : config.backgroundFingerprint;
    if (backgroundFingerprint !== null && typeof backgroundFingerprint !== "string") {
      fail("INVALID_BACKGROUND_FINGERPRINT", "backgroundFingerprint 必須是 SHA-256 十六進位字串。");
    }
    if (drawing == null) {
      if (backgroundImage) fail("UNEXPECTED_BACKGROUND_IMAGE", "沒有 Drawing 時不能合成背景照片。");
      const empty = {
        snapshotVersion: SNAPSHOT_VERSION,
        rendererVersion: VERSION,
        drawing: null,
        backgroundImage: null,
        backgroundWidth: null,
        backgroundHeight: null,
        backgroundFingerprint: null
      };
      empty.sourceKey = snapshotKey(null, null);
      return Object.freeze(empty);
    }

    const copied = copyDrawing(drawing);
    let dimensions = null;
    if (copied.backgroundAssetId === null) {
      if (backgroundImage) fail("UNEXPECTED_BACKGROUND_IMAGE", "Drawing 未綁定照片底圖，不能傳入背景照片。");
      if (backgroundFingerprint !== null) fail("UNEXPECTED_BACKGROUND_IMAGE", "Drawing 未綁定照片底圖，不能傳入照片指紋。");
    } else {
      if (!backgroundImage) fail("BACKGROUND_IMAGE_REQUIRED", "Drawing 有鎖定照片底圖；必須傳入呼叫方已驗證的照片影像。");
      if (backgroundFingerprint === null) {
        fail("BACKGROUND_FINGERPRINT_REQUIRED", "Drawing 背景照片必須提供呼叫方已驗證的 SHA-256 指紋。");
      }
      if (!/^[0-9a-f]{64}$/i.test(backgroundFingerprint)) {
        fail("INVALID_BACKGROUND_FINGERPRINT", "backgroundFingerprint 必須是 64 位 SHA-256 十六進位字串。");
      }
      backgroundFingerprint = backgroundFingerprint.toLowerCase();
      dimensions = imageDimensions(backgroundImage);
    }
    const frozenDrawing = deepFreeze(copied);
    const snapshot = {
      snapshotVersion: SNAPSHOT_VERSION,
      rendererVersion: VERSION,
      drawing: frozenDrawing,
      backgroundImage: backgroundImage,
      backgroundWidth: dimensions ? dimensions.width : null,
      backgroundHeight: dimensions ? dimensions.height : null,
      backgroundFingerprint: backgroundFingerprint
    };
    snapshot.sourceKey = snapshotKey(frozenDrawing, backgroundFingerprint);
    return Object.freeze(snapshot);
  }

  function pointToCanvas(point, canvas) {
    return { x: point.x * canvas.width, y: point.y * canvas.height };
  }

  function drawStroke(context, stroke, canvas) {
    const points = stroke.points.map(function (point) { return pointToCanvas(point, canvas); });
    context.save();
    context.strokeStyle = stroke.color || "#e94f3d";
    context.fillStyle = stroke.color || "#e94f3d";
    context.lineWidth = Number(stroke.baseWidth) || 1;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
    context.stroke();
    const samePoint = points.every(function (point) { return point.x === points[0].x && point.y === points[0].y; });
    if (samePoint) {
      context.beginPath();
      context.arc(points[0].x, points[0].y, Math.max(0.5, context.lineWidth / 2), 0, Math.PI * 2);
      context.fill();
    }
    if (stroke.kind === "cameraArrow") {
      const start = points[0];
      const end = points[points.length - 1];
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const head = Math.max(context.lineWidth * 4, 18);
      context.beginPath();
      context.moveTo(end.x, end.y);
      context.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
      context.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  function assertSnapshot(snapshot) {
    if (!snapshot || snapshot.snapshotVersion !== SNAPSHOT_VERSION || snapshot.rendererVersion !== VERSION) {
      fail("INVALID_SNAPSHOT", "Renderer snapshot 缺失或版本不相容。");
    }
  }

  /** Render into a CanvasRenderingContext2D using logical viewport dimensions. */
  function render(context, snapshot, viewport, options) {
    assertSnapshot(snapshot);
    if (!context || typeof context.save !== "function" || typeof context.clearRect !== "function" ||
        typeof context.drawImage !== "function" || typeof context.setTransform !== "function") {
      fail("INVALID_CONTEXT", "Renderer 需要支援 Canvas 2D 的 context。");
    }
    const width = finitePositive(viewport && viewport.width, "viewport.width");
    const height = finitePositive(viewport && viewport.height, "viewport.height");
    const pixelRatio = options && options.pixelRatio != null ? finitePositive(options.pixelRatio, "pixelRatio") : 1;
    context.save();
    try {
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      const drawing = snapshot.drawing;
      if (!drawing) {
        return { empty: true, rect: null, sourceKey: snapshot.sourceKey, rendererVersion: VERSION };
      }
      const canvas = drawing.canvas;
      const rect = fitContain(width, height, canvas.width, canvas.height);
      context.save();
      try {
        context.translate(rect.x, rect.y);
        context.scale(rect.width / canvas.width, rect.height / canvas.height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (snapshot.backgroundImage) {
          if (drawing.backgroundCrop) {
            const geometry = backgroundDrawGeometry(canvas.width, canvas.height,
              snapshot.backgroundWidth, snapshot.backgroundHeight, drawing.backgroundCrop);
            context.drawImage(snapshot.backgroundImage,
              geometry.source.x, geometry.source.y, geometry.source.width, geometry.source.height,
              geometry.destination.x, geometry.destination.y, geometry.destination.width, geometry.destination.height);
          } else {
            const photo = fitContain(canvas.width, canvas.height, snapshot.backgroundWidth, snapshot.backgroundHeight);
            context.drawImage(snapshot.backgroundImage, photo.x, photo.y, photo.width, photo.height);
          }
        }
        drawing.layers.slice().sort(function (a, b) { return a.order - b.order; }).forEach(function (layer) {
          if (!layer.visible) return;
          context.save();
          try {
            context.globalAlpha = layer.opacity;
            layer.strokes.forEach(function (stroke) { drawStroke(context, stroke, canvas); });
          } finally {
            context.restore();
          }
        });
      } finally {
        context.restore();
      }
      return {
        empty: false,
        rect: rect,
        sourceKey: snapshot.sourceKey,
        rendererVersion: VERSION,
        drawingId: drawing.id,
        drawingRevision: drawing.revision
      };
    } finally {
      context.restore();
    }
  }

  /** Convenience wrapper for an HTMLCanvasElement or OffscreenCanvas. */
  function renderToCanvas(canvasElement, snapshot, options) {
    const config = options || {};
    if (!canvasElement || typeof canvasElement.getContext !== "function") {
      fail("INVALID_CANVAS", "renderToCanvas 需要 Canvas 或 OffscreenCanvas。");
    }
    const width = finitePositive(config.width != null ? config.width : (canvasElement.clientWidth || canvasElement.width), "width");
    const height = finitePositive(config.height != null ? config.height : (canvasElement.clientHeight || canvasElement.height), "height");
    const pixelRatio = config.pixelRatio == null ? 1 : finitePositive(config.pixelRatio, "pixelRatio");
    canvasElement.width = Math.max(1, Math.round(width * pixelRatio));
    canvasElement.height = Math.max(1, Math.round(height * pixelRatio));
    const context = canvasElement.getContext("2d");
    if (!context) fail("INVALID_CONTEXT", "無法建立 Canvas 2D context。");
    return render(context, snapshot, { width: width, height: height }, { pixelRatio: pixelRatio });
  }

  return Object.freeze({
    VERSION: VERSION,
    SNAPSHOT_VERSION: SNAPSHOT_VERSION,
    fitContain: fitContain,
    copyBackgroundCrop: copyBackgroundCrop,
    backgroundDrawGeometry: backgroundDrawGeometry,
    createSnapshot: createSnapshot,
    render: render,
    renderToCanvas: renderToCanvas
  });
});
