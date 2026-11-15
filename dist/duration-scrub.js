(function () {
  "use strict";
  const attached = new WeakSet();
  let gesture = null;
  let hud = null;

  function hideHud() {
    if (hud) hud.hidden = true;
  }

  function showHud(field, scale) {
    if (!hud) {
      hud = document.createElement("div");
      hud.className = "duration-scrub-hud";
      hud.setAttribute("aria-hidden", "true");
      hud.innerHTML = '<svg viewBox="0 0 108 28"><g fill="currentColor">' +
        Array.from({length:9},(_,index)=>'<rect x="'+(10+index*11)+'" y="'+(5+index*.8)+'" width="3" height="'+(18-index*1.6)+'" rx="1"/>').join("") +
        '</g><circle class="duration-scrub-position" cy="14" r="4"/></svg>';
      document.body.appendChild(hud);
    }
    hud.hidden = false;
    hud.dataset.scale = String(scale);
    hud.querySelector("circle").setAttribute("cx",String(11+(1-scale)/.75*88));
    const box = field.getBoundingClientRect();
    hud.style.left = Math.max(8, Math.min(window.innerWidth - 132, box.right - 124)) + "px";
    hud.style.top = Math.max(8, Math.min(window.innerHeight - 44, box.top > 48 ? box.top - 42 : box.bottom + 6)) + "px";
  }

  function finish(cancel) {
    const current = gesture;
    if (!current) return;
    gesture = null;
    const {field, target, options} = current;
    const valid = field.isConnected && options.context() === current.context && options.canEdit() && !field.disabled && !field.readOnly;
    if (cancel || !valid || !current.dragging) field.value = current.original;
    field.classList.remove("is-duration-scrubbing");
    hideHud();
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
    handle.title = "左右拖曳，向下拉細調";
    handle.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h14M6 7l-3 3 3 3M14 7l3 3-3 3"/></svg>';
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
          original, raw: initial, startX: event.clientX, startY: event.clientY, lastX: event.clientX, dragging: false};
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
        const depth = Math.max(0, event.clientY - current.startY);
        const scale = Math.max(.25, 1 - depth / 192);
        const delta = (event.clientX - current.lastX) / 8 * scale;
        current.lastX = event.clientX;
        current.raw = Math.max(0, current.raw + delta);
        field.value = String(Math.round(current.raw));
        showHud(field, scale);
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
