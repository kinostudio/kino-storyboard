(function () {
  "use strict";
  const attached = new WeakSet();
  let gesture = null;
  function finish(cancel) {
    const current = gesture;
    if (!current) return;
    gesture = null;
    const {field, target, options} = current;
    const valid = field.isConnected && options.context() === current.context && options.canEdit() && !field.disabled && !field.readOnly;
    if (cancel || !valid || !current.dragging) field.value = current.original;
    field.classList.remove("is-duration-scrubbing");
    current.handle.style.removeProperty("--scrub-fill");
    current.handle.dataset.scale = "1";
    if (target.hasPointerCapture(current.pointerId)) target.releasePointerCapture(current.pointerId);
    if (!current.dragging && !cancel && valid) {
      field.focus({preventScroll: true});
      field.select();
    } else if (!cancel && valid && field.value !== current.original) {
      options.commit(field);
    }
  }

  function attach(field, options) {
    if (attached.has(field)) return;
    attached.add(field);
    field.classList.add("duration-scrubbable");
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "duration-scrub-handle";
    handle.setAttribute("aria-label", "拖曳調整秒數");
    handle.title = "上下拖曳，往上增加；橫向拉開細調";
    handle.dataset.scale = "1";
    handle.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path class="duration-scrub-base" d="M10 2 5 7h3.5v6H5l5 5 5-5h-3.5V7H15Z"/><path class="duration-scrub-fill" d="M10 2 5 7h3.5v6H5l5 5 5-5h-3.5V7H15Z"/></svg>';
    field.parentElement.appendChild(handle);
    [field, handle].forEach(target => {
      target.addEventListener("pointerdown", event => {
        if (event.button !== 0 || gesture || !options.canEdit() || field.disabled || field.readOnly) return;
        const original = field.value;
        const initial = original.trim() ? Number(original) : 0;
        if (!Number.isFinite(initial) || initial < 0) return;
        event.preventDefault();
        event.stopPropagation();
        gesture = {field, target, options, context: options.context(), pointerId: event.pointerId,
          handle, original, raw: initial, startX: event.clientX, startY: event.clientY, lastY: event.clientY, dragging: false};
        target.setPointerCapture(event.pointerId);
      });
      target.addEventListener("pointermove", event => {
        const current = gesture;
        if (!current || current.target !== target || current.pointerId !== event.pointerId) return;
        if (!field.isConnected || options.context() !== current.context || !options.canEdit()) {finish(true); return;}
        event.preventDefault();
        event.stopPropagation();
        if (!current.dragging) {
          if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 4) return;
          current.dragging = true;
          field.classList.add("is-duration-scrubbing");
        }
        const depth = Math.abs(event.clientX - current.startX);
        const scale = Math.max(.25, 1 - depth / 192);
        const delta = (current.lastY - event.clientY) / 8 * scale;
        current.lastY = event.clientY;
        current.raw = Math.max(0, current.raw + delta);
        field.value = String(Math.round(current.raw));
        handle.dataset.scale = String(scale);
        handle.style.setProperty("--scrub-fill", String(scale * 100) + "%");
      });
      target.addEventListener("pointerup", event => {if (gesture?.pointerId === event.pointerId) finish(false);});
      target.addEventListener("pointercancel", event => {if (gesture?.pointerId === event.pointerId) finish(true);});
      target.addEventListener("lostpointercapture", () => {if (gesture?.target === target) finish(true);});
      target.addEventListener("click", event => {event.preventDefault(); event.stopPropagation();});
    });
  }

  document.addEventListener("keydown", event => {
    if (gesture && event.key === "Escape") {event.preventDefault(); event.stopImmediatePropagation(); finish(true);}
  }, true);
  window.addEventListener("blur", () => finish(true));
  document.addEventListener("visibilitychange", () => {if (document.hidden) finish(true);});
  window.DurationScrub = Object.freeze({attach, cancel: () => finish(true)});
})();
