(function attachPhotoCropRenderer(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.PhotoCropRenderer = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function createPhotoCropRenderer() {
  "use strict";

  const VERSION = "1.0.0";

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function finiteNumber(value, name) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail("INVALID_PHOTO_CROP_RECT", name + " 必須是有限數字。");
    }
    return value;
  }

  function imageDimensions(source) {
    if (!source || (typeof source !== "object" && typeof source !== "function")) {
      fail("INVALID_PHOTO_SOURCE", "照片必須是已解碼的 CanvasImageSource。");
    }
    const width = Number("naturalWidth" in source ? source.naturalWidth : ("videoWidth" in source ? source.videoWidth : source.width));
    const height = Number("naturalHeight" in source ? source.naturalHeight : ("videoHeight" in source ? source.videoHeight : source.height));
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      fail("PHOTO_SOURCE_NOT_READY", "照片尚未完成解碼或尺寸無效。");
    }
    return { width: width, height: height };
  }

  function normalizedRect(rect) {
    if (rect === null || rect === undefined) return { x: 0, y: 0, width: 1, height: 1 };
    if (!rect || typeof rect !== "object" || Array.isArray(rect)) {
      fail("INVALID_PHOTO_CROP_RECT", "裁切範圍必須是 normalized source rect 物件。");
    }
    const x = finiteNumber(rect.x, "x");
    const y = finiteNumber(rect.y, "y");
    const width = finiteNumber(rect.width, "width");
    const height = finiteNumber(rect.height, "height");
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
      fail("INVALID_PHOTO_CROP_RECT", "裁切 x/y 必須不小於 0，正寬高的右下界不可超過 1。");
    }
    return { x: x, y: y, width: width, height: height };
  }

  function createPresentation(source, sourceRect) {
    const dimensions = imageDimensions(source);
    const rect = normalizedRect(sourceRect);
    const pixelWidth = dimensions.width * rect.width;
    const pixelHeight = dimensions.height * rect.height;
    return Object.freeze({
      source: source,
      sourceRect: Object.freeze(rect),
      sourceWidth: dimensions.width,
      sourceHeight: dimensions.height,
      aspectRatio: pixelWidth / pixelHeight,
      isCropped: sourceRect !== null && sourceRect !== undefined
    });
  }

  function destinationRect(rect) {
    if (!rect || typeof rect !== "object") fail("INVALID_PHOTO_DESTINATION", "照片目的框必須是矩形物件。");
    const x = finiteNumber(rect.x, "destination.x");
    const y = finiteNumber(rect.y, "destination.y");
    const width = finiteNumber(rect.width, "destination.width");
    const height = finiteNumber(rect.height, "destination.height");
    if (width <= 0 || height <= 0) fail("INVALID_PHOTO_DESTINATION", "照片目的框必須有正寬高。");
    return { x: x, y: y, width: width, height: height };
  }

  function draw(context, presentation, destination) {
    if (!context || typeof context.drawImage !== "function") {
      fail("INVALID_PHOTO_CONTEXT", "照片呈現需要支援 drawImage 的 Canvas 2D context。");
    }
    if (!presentation || !presentation.source || !presentation.sourceRect) {
      fail("INVALID_PHOTO_PRESENTATION", "請先以 createPresentation 建立照片呈現資料。");
    }
    const sourceWidth = Number(presentation.sourceWidth);
    const sourceHeight = Number(presentation.sourceHeight);
    const rect = presentation.sourceRect;
    if (!Number.isFinite(sourceWidth) || sourceWidth <= 0 || !Number.isFinite(sourceHeight) || sourceHeight <= 0 ||
        !rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) ||
        rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > 1 || rect.y + rect.height > 1) {
      fail("INVALID_PHOTO_PRESENTATION", "照片呈現資料中的 source rect 或來源尺寸無效。");
    }

    const target = destinationRect(destination);
    const sourceX = rect.x * sourceWidth;
    const sourceY = rect.y * sourceHeight;
    const cropWidth = rect.width * sourceWidth;
    const cropHeight = rect.height * sourceHeight;
    const scale = Math.min(target.width / cropWidth, target.height / cropHeight);
    const drawWidth = cropWidth * scale;
    const drawHeight = cropHeight * scale;
    const drawRect = Object.freeze({
      x: target.x + (target.width - drawWidth) / 2,
      y: target.y + (target.height - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight
    });

    // Draw directly from the decoded source. This does not mutate its Blob,
    // encode a replacement, or allocate a source-sized intermediate canvas.
    context.drawImage(presentation.source, sourceX, sourceY, cropWidth, cropHeight,
      drawRect.x, drawRect.y, drawRect.width, drawRect.height);
    return drawRect;
  }

  return Object.freeze({
    VERSION: VERSION,
    createPresentation: createPresentation,
    draw: draw
  });
});
