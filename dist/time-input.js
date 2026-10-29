(function installStoryboardTimeInputs(globalObject, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (globalObject) {
    globalObject.StoryboardTimeInputs = api;
    if (globalObject.document && !(typeof module === "object" && module.exports)) {
      globalObject.storyboardTimeInputEnhancer = api.mount({ document: globalObject.document, root: globalObject.document });
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createStoryboardTimeInputs() {
  "use strict";

  const INPUT_CLASS = "storyboard-time-input";
  const INVALID_CLASS = "storyboard-time-input-invalid";
  const ERROR_CLASS = "storyboard-time-input-error";
  const ERROR_MESSAGE = "請輸入有效時間，例如 09:30、9.30、930 或 2359。";
  const NORMALIZED_INPUT = typeof Symbol === "function" ? Symbol("storyboardTimeInputNormalized") : "__storyboardTimeInputNormalized__";

  function parseTime(value) {
    const text = String(value == null ? "" : value).trim();
    if (!text) return { valid: true, value: "" };

    let hour;
    let minute;
    const separated = /^(\d{1,2})[:.](\d{2})$/.exec(text);
    if (separated) {
      hour = Number(separated[1]);
      minute = Number(separated[2]);
    } else if (/^\d{1,4}$/.test(text)) {
      if (text.length <= 2) {
        hour = Number(text);
        minute = 0;
      } else if (text.length === 3) {
        hour = Number(text.slice(0, 1));
        minute = Number(text.slice(1));
      } else {
        hour = Number(text.slice(0, 2));
        minute = Number(text.slice(2));
      }
    } else {
      return { valid: false, value: null };
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { valid: false, value: null };
    return { valid: true, value: String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0") };
  }

  function isMobileDevice(view) {
    const browser = view || {};
    const navigatorObject = browser.navigator || {};
    try {
      if (typeof browser.matchMedia === "function" && browser.matchMedia("(pointer: coarse)").matches) return true;
    } catch (_error) {
      // Older browsers may not support matchMedia; use the platform hint below.
    }
    const userAgent = String(navigatorObject.userAgent || "");
    const platform = String(navigatorObject.platform || "");
    return /Android|iPhone|iPad|iPod|Mobile|IEMobile/i.test(userAgent) ||
      (platform === "MacIntel" && Number(navigatorObject.maxTouchPoints || 0) > 1);
  }

  function stopEvent(event) {
    if (event && typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    else if (event && typeof event.stopPropagation === "function") event.stopPropagation();
  }

  function addClass(element, className) {
    if (element.classList && typeof element.classList.add === "function") element.classList.add(className);
  }

  function removeClass(element, className) {
    if (element.classList && typeof element.classList.remove === "function") element.classList.remove(className);
  }

  function createMount(options) {
    const opts = options || {};
    const fallbackGlobal = typeof globalThis !== "undefined" ? globalThis : {};
    const documentObject = opts.document || fallbackGlobal.document || null;
    const view = opts.window || (documentObject && documentObject.defaultView) || fallbackGlobal.window || fallbackGlobal;
    const root = opts.root || documentObject;
    const mobile = typeof opts.mobile === "boolean" ? opts.mobile : isMobileDevice(view);
    let observer = null;
    let nextErrorId = 1;

    if (!root || typeof root.addEventListener !== "function") {
      return { mobile, enhance: function () { return false; }, disconnect: function () {} };
    }

    function saveOriginalAccessibility(element) {
      if (element.dataset.timeInputAccessibilitySaved === "true") return;
      element.dataset.timeInputAccessibilitySaved = "true";
      element.dataset.timeInputHadAriaInvalid = element.hasAttribute("aria-invalid") ? "true" : "false";
      element.dataset.timeInputOriginalAriaInvalid = element.getAttribute("aria-invalid") || "";
      element.dataset.timeInputHadAriaDescribedby = element.hasAttribute("aria-describedby") ? "true" : "false";
      element.dataset.timeInputOriginalAriaDescribedby = element.getAttribute("aria-describedby") || "";
    }

    function updateDescription(element, errorId) {
      const original = String(element.dataset.timeInputOriginalAriaDescribedby || "").trim();
      const ids = original ? original.split(/\s+/) : [];
      if (errorId && !ids.includes(errorId)) ids.push(errorId);
      if (ids.length) element.setAttribute("aria-describedby", ids.join(" "));
      else element.removeAttribute("aria-describedby");
    }

    function showInvalid(element) {
      saveOriginalAccessibility(element);
      element.setAttribute("aria-invalid", "true");
      addClass(element, INVALID_CLASS);
      if (element.dataset.timeInputErrorId) return;

      const owner = element.ownerDocument || documentObject;
      if (!owner || typeof owner.createElement !== "function" || !element.parentNode || typeof element.parentNode.insertBefore !== "function") return;
      const error = owner.createElement("small");
      const errorId = "storyboard-time-input-error-" + nextErrorId++;
      error.id = errorId;
      error.className = ERROR_CLASS;
      error.textContent = ERROR_MESSAGE;
      if (typeof error.setAttribute === "function") error.setAttribute("role", "alert");
      element.parentNode.insertBefore(error, element.nextSibling || null);
      element.dataset.timeInputErrorId = errorId;
      updateDescription(element, errorId);
    }

    function clearInvalid(element) {
      removeClass(element, INVALID_CLASS);
      const errorId = element.dataset.timeInputErrorId;
      if (errorId) {
        const owner = element.ownerDocument || documentObject;
        const error = owner && typeof owner.getElementById === "function" ? owner.getElementById(errorId) : null;
        if (error && error.parentNode) error.parentNode.removeChild(error);
        delete element.dataset.timeInputErrorId;
      }
      if (element.dataset.timeInputAccessibilitySaved === "true") {
        if (element.dataset.timeInputHadAriaInvalid === "true") element.setAttribute("aria-invalid", element.dataset.timeInputOriginalAriaInvalid);
        else element.removeAttribute("aria-invalid");
        if (element.dataset.timeInputHadAriaDescribedby === "true") element.setAttribute("aria-describedby", element.dataset.timeInputOriginalAriaDescribedby);
        else element.removeAttribute("aria-describedby");
      }
    }

    function markNormalized(element) {
      const EventConstructor = (view && view.Event) || (typeof Event === "function" ? Event : null);
      if (!EventConstructor || typeof element.dispatchEvent !== "function") return;
      const event = new EventConstructor("input", { bubbles: true });
      try { event[NORMALIZED_INPUT] = true; } catch (_error) { /* The event may be non-extensible in an older browser. */ }
      element.dispatchEvent(event);
    }

    function normalizeForCommit(element) {
      const parsed = parseTime(element.value);
      if (!parsed.valid) {
        showInvalid(element);
        return false;
      }
      element.value = parsed.value;
      clearInvalid(element);
      markNormalized(element);
      return true;
    }

    function enhance(element) {
      if (mobile || !element || String(element.tagName || "").toUpperCase() !== "INPUT" || element.type !== "time") return false;
      const originalValue = String(element.value || "");
      element.type = "text";
      element.value = originalValue;
      element.dataset.timeInputEnhanced = "true";
      addClass(element, INPUT_CLASS);
      element.inputMode = "numeric";
      element.spellcheck = false;
      if (element.getAttribute && element.getAttribute("maxlength") == null) element.setAttribute("maxlength", "5");
      saveOriginalAccessibility(element);
      return true;
    }

    function isEnhanced(element) {
      return !!(element && element.dataset && element.dataset.timeInputEnhanced === "true");
    }

    function scan(node) {
      if (!node) return;
      if (String(node.tagName || "").toUpperCase() === "INPUT" && node.type === "time") enhance(node);
      if (typeof node.querySelectorAll === "function") node.querySelectorAll('input[type="time"]').forEach(enhance);
    }

    function eventInput(event) {
      const element = event.target;
      if (!isEnhanced(element) || event[NORMALIZED_INPUT]) return;
      if (parseTime(element.value).valid) clearInvalid(element);
      // The app's input handler captures a recoverable draft; only change/focusout may commit it.
      // Let raw input reach that handler so unload or rerender recovery does not lose in-progress text.
    }

    function eventCommit(event) {
      const element = event.target;
      if (!isEnhanced(element)) return;
      if (!normalizeForCommit(element)) stopEvent(event);
    }

    function eventKeydown(event) {
      const element = event.target;
      if (!isEnhanced(element) || event.key !== "Enter") return;
      if (!normalizeForCommit(element)) {
        if (typeof event.preventDefault === "function") event.preventDefault();
        stopEvent(event);
      }
    }

    if (mobile) return { mobile, enhance, disconnect: function () {} };

    scan(root);
    root.addEventListener("input", eventInput, true);
    root.addEventListener("change", eventCommit, true);
    root.addEventListener("focusout", eventCommit, true);
    root.addEventListener("keydown", eventKeydown, true);

    const Observer = opts.MutationObserver || (view && view.MutationObserver);
    if (typeof Observer === "function") {
      observer = new Observer((records) => records.forEach((record) => Array.from(record.addedNodes || []).forEach(scan)));
      observer.observe(root, { childList: true, subtree: true });
    }

    return {
      mobile,
      enhance,
      disconnect() {
        if (observer) observer.disconnect();
        root.removeEventListener("input", eventInput, true);
        root.removeEventListener("change", eventCommit, true);
        root.removeEventListener("focusout", eventCommit, true);
        root.removeEventListener("keydown", eventKeydown, true);
      }
    };
  }

  return { parseTime, isMobileDevice, mount: createMount };
});
