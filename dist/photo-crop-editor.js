(function attachPhotoCropEditor(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.DirectorStoryboardPhotoCropEditor = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function createPhotoCropEditor() {
  "use strict";

  const MAX_ZOOM = 4;

  function parseAspectRatio(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    const text = String(value || "16:9").trim();
    const match = text.match(/^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/);
    if (match) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (width > 0 && height > 0) return width / height;
    }
    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    throw new RangeError("裁切畫幅必須是正數或有效的寬:高比例。");
  }

  function assertDimensions(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new RangeError("照片尺寸必須是正的有限數字。");
    }
  }

  function validateCrop(crop) {
    if (!crop || typeof crop !== "object" || Array.isArray(crop)) throw new TypeError("裁切資料必須是矩形物件。");
    const keys = Object.keys(crop).sort();
    if (keys.join(",") !== "height,width,x,y") throw new TypeError("裁切資料只接受 x、y、width、height。");
    ["x", "y", "width", "height"].forEach(function (key) {
      if (typeof crop[key] !== "number" || !Number.isFinite(crop[key])) throw new RangeError("裁切座標必須是有限數字。");
    });
    if (crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 ||
        crop.x + crop.width > 1 + 1e-9 || crop.y + crop.height > 1 + 1e-9) {
      throw new RangeError("裁切範圍必須位於原圖內。");
    }
    return { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function initialCrop(imageWidth, imageHeight, aspectRatio) {
    assertDimensions(imageWidth, imageHeight);
    const target = parseAspectRatio(aspectRatio);
    const source = imageWidth / imageHeight;
    if (source > target) {
      const width = target / source;
      return { x: (1 - width) / 2, y: 0, width: width, height: 1 };
    }
    const height = source / target;
    return { x: 0, y: (1 - height) / 2, width: 1, height: height };
  }

  // Pointer movement follows the photo: dragging right moves the visible crop left.
  function panCrop(cropValue, deltaX, deltaY, viewportWidth, viewportHeight) {
    const crop = validateCrop(cropValue);
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) ||
        !Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) || viewportWidth <= 0 || viewportHeight <= 0) {
      throw new RangeError("拖曳位移與預覽尺寸必須是有效數字。");
    }
    return {
      x: clamp(crop.x - deltaX / viewportWidth * crop.width, 0, 1 - crop.width),
      y: clamp(crop.y - deltaY / viewportHeight * crop.height, 0, 1 - crop.height),
      width: crop.width,
      height: crop.height
    };
  }

  function zoomCrop(imageWidth, imageHeight, aspectRatio, cropValue, zoom) {
    assertDimensions(imageWidth, imageHeight);
    const base = initialCrop(imageWidth, imageHeight, aspectRatio);
    const current = cropValue ? validateCrop(cropValue) : base;
    const targetZoom = clamp(Number(zoom), 1, MAX_ZOOM);
    if (!Number.isFinite(targetZoom)) throw new RangeError("縮放比例無效。");
    const width = base.width / targetZoom;
    const height = base.height / targetZoom;
    const centerX = current.x + current.width / 2;
    const centerY = current.y + current.height / 2;
    return {
      x: clamp(centerX - width / 2, 0, 1 - width),
      y: clamp(centerY - height / 2, 0, 1 - height),
      width: width,
      height: height
    };
  }

  function cropAspectRatio(crop, imageWidth, imageHeight) {
    return crop.width * imageWidth / (crop.height * imageHeight);
  }

  function PhotoCropEditor(container, options) {
    if (!container || typeof container.appendChild !== "function") throw new TypeError("裁切編輯器需要 DOM 容器。");
    if (typeof Blob === "undefined" || !(options && options.imageBlob instanceof Blob)) throw new TypeError("裁切編輯器需要不可變原圖 Blob。");
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") throw new Error("目前瀏覽器不支援安全的照片預覽。");
    this.container = container;
    this.options = options;
    this.imageBlob = options.imageBlob;
    this.requestedAspectRatio = parseAspectRatio(options.aspectRatio || "16:9");
    this.originalCrop = options.crop == null ? null : validateCrop(options.crop);
    this.imageUrl = URL.createObjectURL(this.imageBlob);
    this.image = new Image();
    this.dialog = null;
    this.preview = null;
    this.window = null;
    this.range = null;
    this.status = null;
    this.confirmButton = null;
    this.resetButton = null;
    this.cancelButton = null;
    this.crop = null;
    this.frameAspectRatio = this.requestedAspectRatio;
    this.zoom = 1;
    this.pointer = null;
    this.busy = false;
    this.destroyed = false;
    this.listeners = [];
    this.readyPromise = this.loadImage();
    this.readyPromise.catch(function () { /* open() reports the decode failure to the host */ });
    this.build();
  }

  PhotoCropEditor.prototype.loadImage = function () {
    const image = this.image;
    if (image.complete && image.naturalWidth > 0) return Promise.resolve(image);
    const promise = new Promise(function (resolve, reject) {
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("原始照片無法解碼，裁切沒有套用。")); };
    });
    image.src = this.imageUrl;
    return promise;
  };

  PhotoCropEditor.prototype.listen = function (target, type, callback, options) {
    target.addEventListener(type, callback, options);
    this.listeners.push(function () { target.removeEventListener(type, callback, options); });
  };

  PhotoCropEditor.prototype.make = function (tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  };

  PhotoCropEditor.prototype.build = function () {
    const self = this;
    const dialog = this.make("dialog", "photo-crop-editor");
    dialog.setAttribute("aria-labelledby", "photo-crop-editor-title");
    dialog.setAttribute("aria-describedby", "photo-crop-editor-help");
    const heading = this.make("h2", "photo-crop-editor-title", this.options.title || "手動裁切照片");
    heading.id = "photo-crop-editor-title";
    const help = this.make("p", "photo-crop-editor-help", "在照片上拖曳調整位置，再用縮放滑桿細調。套用後只影響此鏡頭的照片呈現。原始照片不會修改。");
    help.id = "photo-crop-editor-help";
    const preview = this.make("div", "photo-crop-editor-preview");
    this.preview = preview;
    this.window = this.make("div", "photo-crop-editor-window");
    this.window.setAttribute("role", "img");
    this.window.setAttribute("aria-label", this.options.imageLabel || "照片裁切預覽；拖曳照片以調整取景");
    this.window.tabIndex = 0;
    this.image.className = "photo-crop-editor-image";
    this.image.alt = this.options.imageLabel || "照片裁切預覽";
    this.image.draggable = false;
    this.window.appendChild(this.image);
    preview.appendChild(this.window);
    const controls = this.make("div", "photo-crop-editor-zoom-control");
    const zoomLabel = this.make("label", "", "縮放");
    this.range = this.make("input", "photo-crop-editor-zoom");
    this.range.type = "range";
    this.range.min = "1";
    this.range.max = String(MAX_ZOOM);
    this.range.step = "0.01";
    this.range.value = "1";
    zoomLabel.appendChild(this.range);
    zoomLabel.setAttribute("aria-label", "縮放照片取景");
    controls.append(zoomLabel, this.make("span", "photo-crop-editor-zoom-value", "100%"));
    this.zoomValue = controls.querySelector(".photo-crop-editor-zoom-value");
    this.status = this.make("p", "photo-crop-editor-status", "拖曳照片調整取景；未套用前不會保存。");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    const actions = this.make("div", "photo-crop-editor-actions");
    this.resetButton = this.make("button", "photo-crop-editor-button is-quiet", "還原原圖");
    this.resetButton.type = "button";
    this.confirmButton = this.make("button", "photo-crop-editor-button is-primary", "套用裁切");
    this.confirmButton.type = "button";
    this.cancelButton = this.make("button", "photo-crop-editor-button", "取消");
    this.cancelButton.type = "button";
    actions.append(this.resetButton, this.cancelButton, this.confirmButton);
    dialog.append(heading, help, preview, controls, this.status, actions);
    this.dialog = dialog;
    this.container.appendChild(dialog);

    this.listen(this.window, "pointerdown", function (event) { self.pointerDown(event); });
    this.listen(this.window, "pointermove", function (event) { self.pointerMove(event); });
    this.listen(this.window, "pointerup", function (event) { self.pointerEnd(event); });
    this.listen(this.window, "pointercancel", function (event) { self.pointerEnd(event); });
    this.listen(this.window, "lostpointercapture", function (event) { self.pointerEnd(event); });
    this.listen(this.range, "input", function () { self.changeZoom(Number(self.range.value)); });
    this.listen(this.resetButton, "click", function () { self.resetDraft(); });
    this.listen(this.cancelButton, "click", function () { self.cancel(); });
    this.listen(this.confirmButton, "click", function () { self.confirm(); });
    this.listen(dialog, "cancel", function (event) { event.preventDefault(); self.cancel(); });
    this.listen(window, "resize", function () { self.fitPreviewWindow(); });
  };

  PhotoCropEditor.prototype.resetForOpen = function () {
    this.pointer = null;
    if (this.originalCrop) {
      this.crop = validateCrop(this.originalCrop);
      this.frameAspectRatio = cropAspectRatio(this.crop, this.image.naturalWidth, this.image.naturalHeight);
      const base = initialCrop(this.image.naturalWidth, this.image.naturalHeight, this.frameAspectRatio);
      this.zoom = clamp(Math.max(base.width / this.crop.width, base.height / this.crop.height), 1, MAX_ZOOM);
    } else {
      this.frameAspectRatio = this.requestedAspectRatio;
      this.crop = initialCrop(this.image.naturalWidth, this.image.naturalHeight, this.frameAspectRatio);
      this.zoom = 1;
    }
    this.busy = false;
    this.updateView();
  };

  PhotoCropEditor.prototype.open = async function () {
    if (this.destroyed) throw new Error("裁切編輯器已 destroy；請重新 mount。");
    if (this.dialog.open) return this;
    await this.readyPromise;
    this.resetForOpen();
    if (!this.dialog.open) this.dialog.showModal();
    this.fitPreviewWindow();
    return this;
  };

  PhotoCropEditor.prototype.fitPreviewWindow = function () {
    if (!this.window || !this.frameAspectRatio) return;
    const measuredWidth = this.preview && this.preview.clientWidth;
    const maxWidth = Math.max(1, Math.min(measuredWidth || window.innerWidth * 0.84, 760));
    const maxHeight = Math.max(1, window.innerHeight * 0.55);
    const width = Math.min(maxWidth, maxHeight * this.frameAspectRatio);
    this.window.style.width = Math.round(width) + "px";
    this.window.style.height = Math.round(width / this.frameAspectRatio) + "px";
    this.window.style.aspectRatio = String(this.frameAspectRatio);
  };

  PhotoCropEditor.prototype.setStatus = function (text, isError) {
    this.status.textContent = text;
    this.status.classList.toggle("is-error", Boolean(isError));
  };

  PhotoCropEditor.prototype.updateView = function () {
    if (!this.window || !this.image.naturalWidth) return;
    const hasCrop = Boolean(this.crop);
    this.window.classList.toggle("is-cropping", hasCrop);
    if (hasCrop) {
      const crop = this.crop;
      this.frameAspectRatio = cropAspectRatio(crop, this.image.naturalWidth, this.image.naturalHeight);
      this.image.style.position = "absolute";
      this.image.style.width = (100 / crop.width) + "%";
      this.image.style.height = (100 / crop.height) + "%";
      this.image.style.left = (-crop.x / crop.width * 100) + "%";
      this.image.style.top = (-crop.y / crop.height * 100) + "%";
      this.image.style.objectFit = "fill";
    } else {
      this.frameAspectRatio = this.image.naturalWidth / this.image.naturalHeight;
      this.image.style.position = "relative";
      this.image.style.left = "auto";
      this.image.style.top = "auto";
      this.image.style.width = "100%";
      this.image.style.height = "100%";
      this.image.style.objectFit = "contain";
    }
    this.fitPreviewWindow();
    this.range.value = String(clamp(this.zoom, 1, MAX_ZOOM));
    this.zoomValue.textContent = Math.round(clamp(this.zoom, 1, MAX_ZOOM) * 100) + "%";
    this.range.disabled = !hasCrop;
    this.resetButton.disabled = !hasCrop;
    this.confirmButton.disabled = this.busy;
    this.cancelButton.disabled = this.busy;
    this.resetButton.disabled = this.busy || !hasCrop;
    this.window.setAttribute("aria-label", hasCrop
      ? (this.options.imageLabel || "照片裁切預覽") + "；拖曳照片以調整取景"
      : (this.options.imageLabel || "原始照片完整預覽") + "；將以原圖套用");
  };

  PhotoCropEditor.prototype.beginCrop = function () {
    if (this.crop) return;
    this.frameAspectRatio = this.requestedAspectRatio;
    this.crop = initialCrop(this.image.naturalWidth, this.image.naturalHeight, this.frameAspectRatio);
    this.zoom = 1;
  };

  PhotoCropEditor.prototype.changeZoom = function (value) {
    if (this.busy) return;
    this.beginCrop();
    this.zoom = clamp(Number(value), 1, MAX_ZOOM);
    this.crop = zoomCrop(this.image.naturalWidth, this.image.naturalHeight, this.frameAspectRatio, this.crop, this.zoom);
    this.setStatus("縮放 " + Math.round(this.zoom * 100) + "%；套用後才會保存。", false);
    this.updateView();
  };

  PhotoCropEditor.prototype.pointerDown = function (event) {
    if (this.busy || !event.isPrimary || event.button !== 0) return;
    const wasReset = !this.crop;
    this.beginCrop();
    if (wasReset) this.updateView();
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    try { this.window.setPointerCapture(event.pointerId); } catch (_) { /* pointer capture is optional; window remains a direct target */ }
    event.preventDefault();
  };

  PhotoCropEditor.prototype.pointerMove = function (event) {
    if (!this.pointer || event.pointerId !== this.pointer.id || this.busy) return;
    const rect = this.window.getBoundingClientRect();
    const deltaX = event.clientX - this.pointer.x;
    const deltaY = event.clientY - this.pointer.y;
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    this.crop = panCrop(this.crop, deltaX, deltaY, rect.width, rect.height);
    this.setStatus("取景位置已調整；套用後才會保存。", false);
    this.updateView();
    event.preventDefault();
  };

  PhotoCropEditor.prototype.pointerEnd = function (event) {
    if (this.pointer && (!event || event.pointerId === this.pointer.id)) this.pointer = null;
  };

  PhotoCropEditor.prototype.resetDraft = function () {
    if (this.busy) return;
    this.pointer = null;
    this.crop = null;
    this.zoom = 1;
    this.setStatus("已預覽原圖；按「套用裁切」才會保存還原。", false);
    this.updateView();
  };

  PhotoCropEditor.prototype.setBusy = function (busy) {
    this.busy = Boolean(busy);
    this.updateView();
  };

  PhotoCropEditor.prototype.confirm = async function () {
    if (this.busy) return false;
    const crop = this.crop ? validateCrop(this.crop) : null;
    this.setBusy(true);
    this.setStatus("正在確認裁切…", false);
    try {
      if (typeof this.options.onConfirm === "function") await this.options.onConfirm(crop ? Object.assign({}, crop) : null);
      if (this.destroyed) return false;
      this.originalCrop = crop ? Object.assign({}, crop) : null;
      this.dialog.close("confirm");
      return true;
    } catch (error) {
      if (!this.destroyed) {
        this.setStatus((error && error.message) || "裁切保存失敗；可重試或取消。", true);
        this.setBusy(false);
      }
      return false;
    }
  };

  PhotoCropEditor.prototype.cancel = function () {
    if (this.busy || this.destroyed) return false;
    this.pointer = null;
    if (typeof this.options.onCancel === "function") this.options.onCancel();
    if (this.dialog.open) this.dialog.close("cancel");
    return true;
  };

  PhotoCropEditor.prototype.getDraftCrop = function () {
    return this.crop ? Object.assign({}, this.crop) : null;
  };

  PhotoCropEditor.prototype.close = function () {
    if (this.dialog && this.dialog.open && !this.busy) this.cancel();
  };

  PhotoCropEditor.prototype.destroy = function () {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pointer = null;
    if (this.dialog && this.dialog.open) this.dialog.close("destroy");
    this.listeners.splice(0).forEach(function (remove) { remove(); });
    if (this.imageUrl) {
      try { URL.revokeObjectURL(this.imageUrl); } catch (_) { /* URL may already be revoked by the host */ }
      this.imageUrl = null;
    }
    if (this.dialog && this.dialog.parentNode) this.dialog.parentNode.removeChild(this.dialog);
  };

  return Object.freeze({
    mount: function (container, options) {
      const editor = new PhotoCropEditor(container, options || {});
      return Object.freeze({
        open: editor.open.bind(editor),
        close: editor.close.bind(editor),
        destroy: editor.destroy.bind(editor),
        getDraftCrop: editor.getDraftCrop.bind(editor),
        editor: editor
      });
    },
    parseAspectRatio: parseAspectRatio,
    initialCrop: initialCrop,
    panCrop: panCrop,
    zoomCrop: zoomCrop,
    MAX_ZOOM: MAX_ZOOM
  });
});
