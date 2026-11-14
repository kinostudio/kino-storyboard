(function attachScreenplayEditor(root) {
  "use strict";
  if (!root || !root.document) return;
  if (!root.document.querySelector("link[data-screenplay-editor-styles]")) {
    const scriptUrl = root.document.currentScript && root.document.currentScript.src;
    const link = root.document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.screenplayEditorStyles = "true";
    link.href = new URL("screenplay-editor.css", scriptUrl || root.location.href).href;
    root.document.head.appendChild(link);
  }

  const model = root.StoryModel;
  const entries = new Map();
  const composingFields = new WeakSet();
  const state = { projectId: "", composing: 0, renderPending: false, compareSceneId: "", compareOpen: false, overviewOpen: true, initialized: false, selections: new Map(), importPreview: null, activeSurface: null };
  const $ = (selector, host) => (host || root.document).querySelector(selector);
  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const makeId = (prefix) => prefix + "-" + (root.crypto && typeof root.crypto.randomUUID === "function" ? root.crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));

  function emptyScene() {
    return { id: makeId("script-scene"), sceneId: null, location: "", time: "", people: "", interiorExterior: "", blocks: [{ id: makeId("script-block"), type: "text", character: "", text: "" }] };
  }

  function emptyScreenplay() {
    return { subject: "", outline: "", format: "tw", scenes: [] };
  }

  function normalizeScreenplay(value) {
    const screenplay = value && typeof value === "object" ? clone(value) : emptyScreenplay();
    screenplay.subject = typeof screenplay.subject === "string" ? screenplay.subject : "";
    screenplay.outline = typeof screenplay.outline === "string" ? screenplay.outline : "";
    screenplay.format = screenplay.format === "us" ? "us" : "tw";
    screenplay.scenes = Array.isArray(screenplay.scenes) ? screenplay.scenes : [];
    screenplay.scenes.forEach((scene) => {
      if (!scene.id) scene.id = makeId("script-scene");
      scene.sceneId = typeof scene.sceneId === "string" ? scene.sceneId : null;
      ["location", "time", "people", "interiorExterior"].forEach((field) => { if (typeof scene[field] !== "string") scene[field] = ""; });
      scene.blocks = Array.isArray(scene.blocks) ? scene.blocks : [];
      scene.blocks.forEach((block) => {
        if (!block.id) block.id = makeId("script-block");
        if (!["action", "dialogue", "text"].includes(block.type)) block.type = "text";
        if (typeof block.character !== "string") block.character = "";
        if (typeof block.text !== "string") block.text = "";
      });
      if (!scene.blocks.length) scene.blocks.push({ id: makeId("script-block"), type: "text", character: "", text: "" });
    });
    return screenplay;
  }

  function currentProjectId() {
    try {
      const snapshot = model && typeof model.getState === "function" ? model.getState() : null;
      const project = model && typeof model.getProject === "function" ? model.getProject() : null;
      return String(snapshot && snapshot.projectId || project && project.projectId || "");
    } catch (_) { return ""; }
  }

  function currentProject() {
    try { return model && typeof model.getProject === "function" ? model.getProject() : null; }
    catch (_) { return null; }
  }

  function getEntry(projectId) {
    if (!projectId) return null;
    let entry = entries.get(projectId);
    if (entry) return entry;
    let saved = null;
    try { saved = model && typeof model.getScreenplay === "function" ? model.getScreenplay() : null; }
    catch (_) { saved = null; }
    if (saved == null) {
      const project = currentProject();
      saved = project && project.screenplay || null;
    }
    entry = {
      projectId: projectId,
      value: normalizeScreenplay(saved),
      saved: saved == null ? null : normalizeScreenplay(saved),
      dirty: false,
      version: 0,
      savedVersion: 0,
      timer: null,
      pending: null,
      error: null,
      actionError: "",
      busyScenes: new Set()
    };
    entries.set(projectId, entry);
    return entry;
  }

  function canEdit() {
    try {
      const lifecycle = model && typeof model.getLifecycle === "function" ? model.getLifecycle() : null;
      if (!lifecycle) return true;
      return lifecycle.writable !== false && lifecycle.phase !== "read_only" && lifecycle.phase !== "save_failed";
    } catch (_) { return false; }
  }

  function errorMessage(error) {
    if (!error) return "保存失敗；草稿仍保留。";
    return (error.code ? error.code + " · " : "") + (error.message || "保存失敗；草稿仍保留。");
  }

  function refreshStatus(entry) {
    const host = $("#view-screenplay");
    if (!host || !entry || entry.projectId !== state.projectId) return;
    const status = $("[data-screenplay-save-status]", host);
    if (!status) return;
    status.classList.toggle("is-error", !!entry.error || !!entry.actionError);
    status.textContent = entry.actionError || (entry.error ? errorMessage(entry.error) : entry.pending ? "正在保存…" : entry.dirty ? "尚未保存" : entry.saved ? "已保存" : "草稿尚未保存");
    const retry = $("[data-screenplay-action='retry-save']", host);
    if (retry) retry.hidden = !(entry.error && entry.dirty);
    refreshEditability();
  }

  function refreshEditability() {
    const host = $("#view-screenplay");
    if (!host) return;
    const writable = canEdit();
    host.querySelectorAll("[data-screenplay-edit-control]").forEach((control) => {
      control.disabled = !writable || control.dataset.screenplayFixedDisabled === "true";
    });
  }

  function scheduleSave(entry, delay) {
    if (!entry || state.composing > 0) return;
    if (entry.timer) root.clearTimeout(entry.timer);
    entry.timer = root.setTimeout(() => {
      entry.timer = null;
      saveEntry(entry).catch(() => {});
    }, delay == null ? 450 : delay);
    refreshStatus(entry);
  }

  function saveEntry(entry) {
    if (!entry || !entry.dirty) return Promise.resolve(true);
    if (entry.pending) return entry.pending;
    const reject = (error) => { entry.error = error; refreshStatus(entry); return Promise.reject(error); };
    if (currentProjectId() !== entry.projectId) return reject(Object.assign(new Error("專案已切換；草稿仍保留，請返回原專案保存。"), { code: "PROJECT_CHANGED" }));
    if (!model || typeof model.saveScreenplay !== "function") return reject(Object.assign(new Error("劇本保存功能尚未載入；草稿仍保留。"), { code: "SCREENPLAY_API_UNAVAILABLE" }));
    if (!canEdit()) return reject(Object.assign(new Error("目前專案為唯讀；劇本草稿仍保留。"), { code: "READ_ONLY" }));
    const version = entry.version;
    const snapshot = clone(entry.value);
    const pending = Promise.resolve().then(() => model.saveScreenplay(snapshot)).then(() => {
      entry.saved = snapshot;
      entry.savedVersion = Math.max(entry.savedVersion, version);
      entry.dirty = entry.version > entry.savedVersion;
      entry.error = null;
      return true;
    }).catch((error) => {
      entry.dirty = true;
      entry.error = error;
      throw error;
    }).finally(() => {
      entry.pending = null;
      refreshStatus(entry);
      if (entry.dirty && entry.version > version) scheduleSave(entry, 0);
    });
    entry.pending = pending;
    refreshStatus(entry);
    return pending;
  }

  async function flushEntry(entry) {
    if (!entry) return true;
    if (state.composing > 0) throw new Error("請先完成輸入，再切換或輸出劇本。");
    while (entry.pending || entry.dirty || entry.timer) {
      if (entry.timer) { root.clearTimeout(entry.timer); entry.timer = null; }
      if (entry.pending) await entry.pending;
      else if (entry.dirty) await saveEntry(entry);
    }
    return true;
  }

  function hasPending() {
    const entry = entries.get(currentProjectId());
    return state.composing > 0 || !!(entry && (entry.dirty || entry.pending || entry.timer));
  }

  async function flush() {
    if (state.composing > 0) throw new Error("請先完成輸入，再切換或輸出劇本。");
    const entry = entries.get(currentProjectId());
    await flushEntry(entry);
    return true;
  }

  function markDirty(entry) {
    if (!entry) return;
    entry.version += 1;
    entry.dirty = true;
    entry.error = null;
    entry.actionError = "";
    scheduleSave(entry);
  }

  function focusKey(parts) {
    return parts.map((part) => encodeURIComponent(String(part || ""))).join("|");
  }

  function labelField(label, field, value, sceneId, options) {
    const opts = options || {};
    const attrs = ' data-screenplay-edit-control="true" data-screenplay-field="' + escapeHtml(field) + '" data-focus-key="' + escapeHtml(focusKey([field, sceneId])) + '"' +
      (sceneId ? ' data-screenplay-scene-id="' + escapeHtml(sceneId) + '"' : "") + (opts.extra || "");
    const disabled = canEdit() ? "" : " disabled";
    if (opts.select) {
      const values = opts.select.map((item) => '<option value="' + escapeHtml(item.value) + '"' + (String(value || "") === item.value ? " selected" : "") + '>' + escapeHtml(item.label) + '</option>').join("");
      return '<label class="se-field"><span>' + escapeHtml(label) + '</span><select' + attrs + disabled + ' aria-label="' + escapeHtml(label) + '">' + values + '</select></label>';
    }
    if (opts.multiline) {
      return '<label class="se-field se-field-wide"><span>' + escapeHtml(label) + '</span><textarea rows="' + (opts.rows || 3) + '"' + attrs + disabled + ' aria-label="' + escapeHtml(label) + '" placeholder="' + escapeHtml(opts.placeholder || "") + '">' + escapeHtml(value || "") + '</textarea></label>';
    }
    return '<label class="se-field"><span>' + escapeHtml(label) + '</span><input type="text"' + attrs + disabled + ' aria-label="' + escapeHtml(label) + '" value="' + escapeHtml(value || "") + '" placeholder="' + escapeHtml(opts.placeholder || "") + '"></label>';
  }

  function screenplaySceneTitle(scene, index, screenplay) {
    const heading = [scene.interiorExterior, scene.location, scene.time].filter(Boolean).join(" · ");
    if (screenplay.format === "us") {
      const place = [scene.interiorExterior, scene.location].filter(Boolean).join(" ");
      return [place, scene.time].filter(Boolean).join(" - ") || "未命名場次";
    }
    return "場次 " + (index + 1) + (heading ? " · " + heading : "");
  }

  function sceneOptions(project, selectedId, currentScreenplaySceneId, screenplay) {
    const scenes = Array.isArray(project && project.scenes) ? project.scenes : [];
    const claimed = new Set((screenplay.scenes || []).filter((scene) => scene.id !== currentScreenplaySceneId && scene.sceneId).map((scene) => scene.sceneId));
    const options = [{ value: "", label: "不連結分鏡場次" }];
    scenes.forEach((scene, index) => {
      if (claimed.has(scene.id) && scene.id !== selectedId) return;
      options.push({ value: scene.id, label: "場次 " + (index + 1) + (scene.title ? " · " + scene.title : "") });
    });
    return options;
  }

  function blockDisplay(block) {
    return block.type === "dialogue" && block.character ? block.character + ": " + block.text : block.text;
  }

  function blockMarkup(block, hideEmpty) {
    if (hideEmpty && !block.text && !block.character) return "";
    return '<span class="se-script-run is-' + escapeHtml(block.type) + '" data-screenplay-run="true" data-screenplay-run-id="' + escapeHtml(block.id) + '" data-screenplay-run-type="' + escapeHtml(block.type) + '" data-screenplay-run-character="' + escapeHtml(block.character || "") + '">' + escapeHtml(blockDisplay(block)) + '</span>';
  }

  function firstColon(value) {
    const ascii = value.indexOf(":");
    const wide = value.indexOf("：");
    const colon = ascii < 0 ? wide : wide < 0 ? ascii : Math.min(ascii, wide);
    const newline = value.indexOf("\n");
    return newline >= 0 && colon > newline ? -1 : colon;
  }

  function dialogueParts(value, knownCharacter) {
    const raw = String(value || "");
    if (knownCharacter) {
      const prefix = knownCharacter + ": ";
      const widePrefix = knownCharacter + "： ";
      if (raw.startsWith(prefix)) return { character: knownCharacter, text: raw.slice(prefix.length) };
      if (raw.startsWith(widePrefix)) return { character: knownCharacter, text: raw.slice(widePrefix.length) };
      if (raw.startsWith(knownCharacter + ":")) return { character: knownCharacter, text: raw.slice(knownCharacter.length + 1).replace(/^[ \t]/, "") };
      if (raw.startsWith(knownCharacter + "：")) return { character: knownCharacter, text: raw.slice(knownCharacter.length + 1).replace(/^[ \t]/, "") };
    }
    const colon = firstColon(raw);
    if (colon > 0) return { character: raw.slice(0, colon).trim(), text: raw.slice(colon + 1).replace(/^[ \t]/, "") };
    return { character: "", text: raw };
  }

  function blockFromVisible(id, type, character, visibleText) {
    if (type === "dialogue") {
      const parts = dialogueParts(visibleText, character);
      return { id: id || makeId("script-block"), type: "dialogue", character: parts.character, text: parts.text };
    }
    return { id: id || makeId("script-block"), type: type === "action" ? "action" : "text", character: "", text: String(visibleText || "") };
  }

  function appendVisible(node, output) {
    if (!node) return;
    if (node.nodeType === 3) { output.push(node.nodeValue || ""); return; }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.nodeType === 1 && node.tagName === "BR") {
      output.push("\n");
      return;
    }
    if (node.nodeType === 1 && /^(DIV|P)$/.test(node.tagName) && output.length && !String(output[output.length - 1]).endsWith("\n")) output.push("\n");
    Array.from(node.childNodes).forEach((child) => appendVisible(child, output));
    if (node.nodeType === 1 && /^(DIV|P)$/.test(node.tagName) && output.length && !String(output[output.length - 1]).endsWith("\n")) output.push("\n");
  }

  function visibleText(node) {
    const output = [];
    appendVisible(node, output);
    return output.join("");
  }

  function surfaceText(surface) { return surface ? visibleText(surface) : ""; }

  function surfacePointOffset(surface, node, nodeOffset) {
    try {
      const range = surface.ownerDocument.createRange();
      range.selectNodeContents(surface);
      range.setEnd(node, nodeOffset);
      return visibleText(range.cloneContents()).length;
    } catch (_) { return 0; }
  }

  function surfaceSelection(surface) {
    const selection = root.getSelection && root.getSelection();
    if (!surface || !selection || !selection.rangeCount || !surface.contains(selection.anchorNode) || !surface.contains(selection.focusNode)) return null;
    const range = selection.getRangeAt(0);
    const start = surfacePointOffset(surface, range.startContainer, range.startOffset);
    const end = surfacePointOffset(surface, range.endContainer, range.endOffset);
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }

  function setSurfaceSelection(surface, start, end) {
    if (!surface) return;
    const doc = surface.ownerDocument;
    const total = surfaceText(surface).length;
    function pointAt(position) {
      const target = Math.max(0, Math.min(total, Number(position) || 0));
      let seen = 0;
      let found = null;
      function visit(node) {
        if (found) return;
        if (node.nodeType === 3) {
          const length = (node.nodeValue || "").length;
          if (target <= seen + length) { found = { node: node, offset: target - seen }; return; }
          seen += length;
          return;
        }
        if (node.nodeType !== 1 && node.nodeType !== 11) return;
        if (node.nodeType === 1 && node.tagName === "BR") {
          const length = 1;
          const parent = node.parentNode;
          const index = Array.prototype.indexOf.call(parent.childNodes, node);
          if (length && target <= seen + 1) { found = { node: parent, offset: index + (target > seen ? 1 : 0) }; return; }
          seen += length;
          return;
        }
        Array.from(node.childNodes).forEach((child) => { if (!found) visit(child); });
      }
      visit(surface);
      return found || { node: surface, offset: surface.childNodes.length };
    }
    const first = pointAt(start);
    const last = pointAt(end == null ? start : end);
    const range = doc.createRange();
    try { range.setStart(first.node, first.offset); range.setEnd(last.node, last.offset); }
    catch (_) { range.selectNodeContents(surface); range.collapse(false); }
    const selection = root.getSelection && root.getSelection();
    if (selection) { selection.removeAllRanges(); selection.addRange(range); }
  }

  function rememberSurfaceSelection(surface) {
    if (!surface) return;
    const selection = surfaceSelection(surface);
    if (selection) state.selections.set(surface.dataset.screenplaySceneId, selection);
  }

  function blocksFromSurface(surface, scene) {
    const fallbackId = surface.dataset.screenplayEmptyBlockId || scene.blocks[0] && scene.blocks[0].id || makeId("script-block");
    const collected = [];
    function add(text, context) {
      if (!text) return;
      const type = context && context.type || "text";
      const id = context && context.id || fallbackId;
      const character = context && context.character || "";
      const last = collected[collected.length - 1];
      if (last && last.id === id && last.type === type && last.character === character) last.visibleText += text;
      else collected.push({ id: id, type: type, character: character, visibleText: text });
    }
    function walk(node, inherited) {
      if (node.nodeType === 3) { add(node.nodeValue || "", inherited); return; }
      if (node.nodeType !== 1) return;
      let context = inherited;
      if (node.dataset && node.dataset.screenplayRun === "true") {
        context = { id: node.dataset.screenplayRunId, type: node.dataset.screenplayRunType, character: node.dataset.screenplayRunCharacter || "" };
        if (!(node.textContent || "")) collected.push({ id: context.id, type: context.type, character: context.character, visibleText: "" });
      }
      if (node.tagName === "BR") { if (!node.dataset || node.dataset.screenplaySeparator !== "true") add("\n", context); return; }
      const isBlock = /^(DIV|P)$/.test(node.tagName);
      if (isBlock && collected.length && !String(collected[collected.length - 1].visibleText).endsWith("\n")) add("\n", context);
      Array.from(node.childNodes).forEach((child) => walk(child, context));
      if (isBlock && collected.length && !String(collected[collected.length - 1].visibleText).endsWith("\n")) add("\n", context);
    }
    Array.from(surface.childNodes).forEach((child) => walk(child, null));
    const result = [];
    const seen = new Set();
    collected.forEach((run) => {
      let id = run.id || makeId("script-block");
      const previous = result[result.length - 1];
      if (previous && previous.id === id && previous.type === run.type && previous.character === run.character) {
        const merged = blockFromVisible(id, run.type, run.character, blockDisplay(previous) + run.visibleText);
        result[result.length - 1] = merged;
        return;
      }
      if (seen.has(id)) id = makeId("script-block");
      seen.add(id);
      result.push(blockFromVisible(id, run.type, run.character, run.visibleText));
    });
    if (!result.length) {
      const old = scene.blocks.find((block) => !blockDisplay(block));
      result.push(old ? clone(old) : { id: fallbackId, type: "text", character: "", text: "" });
    }
    return result;
  }

  function selectedDialogueBlock(text, id) {
    const parts = dialogueParts(text, "");
    return { id: id || makeId("script-block"), type: "dialogue", character: parts.character, text: parts.text };
  }

  function tagRange(entry, scene, surface, type) {
    let selection = surfaceSelection(surface) || state.selections.get(scene.id) || { start: 0, end: 0 };
    const content = surfaceText(surface);
    let start = Math.max(0, Math.min(content.length, selection.start));
    let end = Math.max(start, Math.min(content.length, selection.end));
    if (start === end && content.length) {
      const before = content.lastIndexOf("\n", Math.max(0, start - 1));
      const after = content.indexOf("\n", start);
      start = before < 0 ? 0 : before + 1;
      end = after < 0 ? content.length : after;
    }
    if (start === end) {
      const blocks = scene.blocks;
      let cursor = 0;
      const target = blocks.find((block, index) => { if (index) cursor += 1; const length = blockDisplay(block).length; const match = start >= cursor && start <= cursor + length; cursor += length; return match; });
      if (!target) return false;
      Object.assign(target, blockFromVisible(target.id, type, target.character, blockDisplay(target)));
      markDirty(entry);
      render();
      focusSurface(scene.id, start, end);
      return true;
    }
    const before = [];
    const after = [];
    const seen = new Set();
    const intersected = [];
    let cursor = 0;
    function keepPiece(block, visible, collection) {
      if (!visible) return;
      let id = block.id;
      if (seen.has(id)) id = makeId("script-block");
      seen.add(id);
      collection.push(blockFromVisible(id, block.type, block.character, visible));
    }
    scene.blocks.forEach((block, index) => {
      if (index) cursor += 1;
      const visible = blockDisplay(block);
      const blockStart = cursor;
      const blockEnd = blockStart + visible.length;
      cursor = blockEnd;
      if (!visible.length) { (blockStart <= start ? before : after).push(clone(block)); seen.add(block.id); return; }
      if (blockEnd <= start) { before.push(clone(block)); seen.add(block.id); return; }
      if (blockStart >= end) { after.push(clone(block)); seen.add(block.id); return; }
      intersected.push({ block: block, start: blockStart, end: blockEnd, visible: visible });
      const prefixLength = Math.max(0, Math.min(visible.length, start - blockStart));
      const suffixStart = Math.max(0, Math.min(visible.length, end - blockStart));
      if (prefixLength) keepPiece(block, visible.slice(0, prefixLength), before);
      if (suffixStart < visible.length) keepPiece(block, visible.slice(suffixStart), after);
    });
    const selectionText = content.slice(start, end);
    const wholeCandidate = intersected.find((part) => start <= part.start && end >= part.end);
    const selectedId = wholeCandidate && !seen.has(wholeCandidate.block.id) ? wholeCandidate.block.id : makeId("script-block");
    const selected = type === "dialogue" ? selectedDialogueBlock(selectionText, selectedId) : { id: selectedId, type: type, character: "", text: selectionText };
    scene.blocks = before.concat([selected], after);
    markDirty(entry);
    render();
    focusSurface(scene.id, start, end);
    return true;
  }

  function focusSurface(sceneId, start, end) {
    root.setTimeout(() => {
      const host = $("#view-screenplay");
      const surface = host && Array.from(host.querySelectorAll("[data-screenplay-writing-surface]")).find((node) => node.dataset.screenplaySceneId === sceneId);
      if (!surface) return;
      surface.focus({ preventScroll: true });
      setSurfaceSelection(surface, start, end);
    }, 0);
  }

  function insertPlainText(surface, value) {
    const selection = root.getSelection && root.getSelection();
    let range;
    if (selection && selection.rangeCount && surface.contains(selection.anchorNode) && surface.contains(selection.focusNode)) range = selection.getRangeAt(0);
    else { range = surface.ownerDocument.createRange(); range.selectNodeContents(surface); range.collapse(false); }
    range.deleteContents();
    const node = surface.ownerDocument.createTextNode(String(value || ""));
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    if (selection) { selection.removeAllRanges(); selection.addRange(range); }
    surface.focus();
  }

  function iconMarkup(name) {
    const paths = {
      action: "M11.2 2.5 4.8 11h4l-.5 6.5 6.9-9h-4.4l.4-6Z",
      dialogue: "M4 4.5h12v8H9l-4 3v-3H4zM7 7.5h6M7 9.8h4",
      text: "M4 5h12M4 8.5h12M4 12h8M4 15.5h7"
    };
    return '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="' + (paths[name] || paths.text) + '"></path></svg>';
  }

  function sceneMarkup(scene, index, screenplay, project, entry) {
    const editable = canEdit();
    const linked = scene.sceneId && Array.isArray(project && project.scenes) && project.scenes.some((item) => item.id === scene.sceneId);
    const title = screenplaySceneTitle(scene, index, screenplay);
    const indexLabel = title === "場次 " + (index + 1) ? "" : "場次 " + (index + 1);
    const blocks = scene.blocks.map((block, blockIndex) => blockMarkup(block, scene.blocks.length === 1 && blockIndex === 0)).join('<br data-screenplay-separator="true">');
    const emptyId = scene.blocks.find((block) => !blockDisplay(block))?.id || "";
    const linkOptions = sceneOptions(project, scene.sceneId, scene.id, screenplay).map((item) => '<option value="' + escapeHtml(item.value) + '"' + (scene.sceneId === item.value ? " selected" : "") + '>' + escapeHtml(item.label) + '</option>').join("");
    const canCreate = editable && model && typeof model.addScene === "function" && !scene.sceneId;
    const disabled = editable ? "" : " disabled";
    const editAttr = ' data-screenplay-edit-control="true"';
    const runButtons = ["action", "dialogue", "text"].map((type) => '<button type="button" class="se-tag-button"' + editAttr + ' data-screenplay-action="tag-selection" data-screenplay-scene-id="' + escapeHtml(scene.id) + '" data-tag-type="' + type + '" aria-label="標記選取文字為' + (type === "text" ? "一般文字" : type === "action" ? "動作" : "對白") + '" title="' + (type === "text" ? "一般文字" : type === "action" ? "動作" : "對白") + '"' + disabled + '>' + iconMarkup(type) + '</button>').join("");
    return '<section class="se-scene-card" data-screenplay-scene-card="' + escapeHtml(scene.id) + '">' +
      '<header class="se-scene-card-head"><div class="se-scene-title-wrap"><span class="se-scene-index" data-screenplay-scene-index="' + escapeHtml(scene.id) + '"' + (indexLabel ? "" : " hidden") + '>' + escapeHtml(indexLabel) + '</span><h3 data-screenplay-scene-title="' + escapeHtml(scene.id) + '">' + escapeHtml(title) + '</h3></div>' +
      '<div class="se-scene-tools"><button type="button" class="se-icon-button"' + editAttr + ' data-screenplay-action="move-scene-up" data-screenplay-scene-id="' + escapeHtml(scene.id) + '"' + (index === 0 ? ' data-screenplay-fixed-disabled="true"' : "") + ' aria-label="場次上移" title="上移"' + (index === 0 || !editable ? " disabled" : "") + '>↑</button>' +
      '<button type="button" class="se-icon-button"' + editAttr + ' data-screenplay-action="move-scene-down" data-screenplay-scene-id="' + escapeHtml(scene.id) + '"' + (index === screenplay.scenes.length - 1 ? ' data-screenplay-fixed-disabled="true"' : "") + ' aria-label="場次下移" title="下移"' + (index === screenplay.scenes.length - 1 || !editable ? " disabled" : "") + '>↓</button>' +
      '<button type="button" class="se-icon-button is-danger"' + editAttr + ' data-screenplay-action="remove-scene" data-screenplay-scene-id="' + escapeHtml(scene.id) + '" aria-label="刪除劇本場次" title="刪除劇本場次"' + disabled + '>×</button></div></header>' +
      '<div class="se-scene-meta-row"><span class="se-meta-label" aria-hidden="true">場景</span><select data-screenplay-meta="true" data-screenplay-field="interiorExterior" data-screenplay-edit-control="true" data-focus-key="' + escapeHtml(focusKey(["interiorExterior", scene.id])) + '" data-screenplay-scene-id="' + escapeHtml(scene.id) + '" aria-label="場景內外景"' + disabled + '><option value=""' + (!scene.interiorExterior ? " selected" : "") + '>內外景</option><option value="INT."' + (scene.interiorExterior === "INT." ? " selected" : "") + '>內景</option><option value="EXT."' + (scene.interiorExterior === "EXT." ? " selected" : "") + '>外景</option><option value="INT./EXT."' + (scene.interiorExterior === "INT./EXT." ? " selected" : "") + '>內外景</option></select><input type="text" data-screenplay-meta="true" data-screenplay-field="location" data-screenplay-edit-control="true" data-focus-key="' + escapeHtml(focusKey(["location", scene.id])) + '" data-screenplay-scene-id="' + escapeHtml(scene.id) + '" value="' + escapeHtml(scene.location) + '" placeholder="地點" aria-label="場景地點"' + disabled + '>' +
      '<span class="se-meta-label" aria-hidden="true">時</span><input type="text" data-screenplay-meta="true" data-screenplay-field="time" data-screenplay-edit-control="true" data-focus-key="' + escapeHtml(focusKey(["time", scene.id])) + '" data-screenplay-scene-id="' + escapeHtml(scene.id) + '" value="' + escapeHtml(scene.time) + '" placeholder="日／夜" aria-label="時間"' + disabled + '>' +
      '<span class="se-meta-label" aria-hidden="true">人</span><input type="text" data-screenplay-meta="true" data-screenplay-field="people" data-screenplay-edit-control="true" data-focus-key="' + escapeHtml(focusKey(["people", scene.id])) + '" data-screenplay-scene-id="' + escapeHtml(scene.id) + '" value="' + escapeHtml(scene.people) + '" placeholder="人物" aria-label="人物"' + disabled + '>' +
      '<select class="se-scene-link-select" data-screenplay-field="sceneId" data-screenplay-edit-control="true" data-focus-key="' + escapeHtml(focusKey(["sceneId", scene.id])) + '" data-screenplay-scene-id="' + escapeHtml(scene.id) + '" aria-label="連結分鏡場次"' + disabled + '>' + linkOptions + '</select>' +
      (linked ? '<span class="se-link-state">已連結</span>' : canCreate ? '<button type="button" class="se-secondary-button"' + editAttr + ' data-screenplay-action="create-board-scene" data-screenplay-scene-id="' + escapeHtml(scene.id) + '"' + (entry.busyScenes.has(scene.id) ? ' data-screenplay-fixed-disabled="true" disabled' : "") + '>建立分鏡場次</button>' : '<span class="se-link-state">未連結</span>') + '</div>' +
      '<div class="se-writing-tools"><div class="se-tag-group" role="group" aria-label="標記選取文字">' + runButtons + '</div><span class="se-writing-hint">選取文字後可標記；Enter 換行，Ctrl/⌘+Enter 下一場</span><button type="button" class="se-next-scene-button"' + editAttr + ' data-screenplay-action="next-scene" data-screenplay-scene-id="' + escapeHtml(scene.id) + '" aria-label="下一場" title="下一場（Ctrl/⌘+Enter）"' + disabled + '><svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 10h12M10 5l5 5-5 5"/></svg></button></div>' +
      '<div class="se-writing-surface" contenteditable="' + (editable ? "true" : "false") + '" role="textbox" aria-multiline="true" aria-label="劇本內容，場次 ' + (index + 1) + '" data-screenplay-edit-control="true" data-screenplay-writing-surface="true" data-screenplay-field="body" data-focus-key="' + escapeHtml(focusKey(["body", scene.id])) + '" data-screenplay-scene-id="' + escapeHtml(scene.id) + '" data-screenplay-empty-block-id="' + escapeHtml(emptyId) + '" data-placeholder="在這裡連續書寫或貼上內容…">' + blocks + '</div>' +
      '</section>';
  }

  function focusSnapshot(host, compareHost) {
    const active = root.document.activeElement;
    const owner = host && host.contains(active) ? host : compareHost && compareHost.contains(active) ? compareHost : null;
    if (!owner || !active || !active.dataset || !active.dataset.focusKey) return null;
    const richSelection = active.matches && active.matches("[data-screenplay-writing-surface]") ? surfaceSelection(active) : null;
    return { owner: owner.id, key: active.dataset.focusKey, start: richSelection ? richSelection.start : typeof active.selectionStart === "number" ? active.selectionStart : null, end: richSelection ? richSelection.end : typeof active.selectionEnd === "number" ? active.selectionEnd : null, rich: !!richSelection };
  }

  function restoreFocus(host, compareHost, saved) {
    if (!saved) return;
    const owner = saved.owner === "screenplay-compare-host" ? compareHost : host;
    if (!owner) return;
    const target = Array.from(owner.querySelectorAll("[data-focus-key]")).find((element) => element.dataset.focusKey === saved.key);
    if (!target) return;
    try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
    if (saved.rich) setSurfaceSelection(target, saved.start, saved.end);
    else if (saved.start != null && typeof target.setSelectionRange === "function") {
      try { target.setSelectionRange(saved.start, saved.end == null ? saved.start : saved.end); } catch (_) {}
    }
  }

  function compareMarkup(project, screenplay) {
    const host = $("#screenplay-compare-host");
    if (!host) return;
    host.hidden = !state.compareOpen;
    const toggle = $("#screenplay-compare-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", state.compareOpen ? "true" : "false");
    if (!state.compareOpen) return;
    const scripts = screenplay.scenes || [];
    const canonical = state.compareSceneId && project ? (project.scenes || []).find((item) => item.id === state.compareSceneId) || null : null;
    const chosen = state.compareSceneId
      ? scripts.find((item) => item.sceneId === state.compareSceneId || (!canonical && item.id === state.compareSceneId)) || null
      : scripts.find((item) => item.sceneId) || scripts[0] || null;
    const shots = canonical && project && Array.isArray(project.shots) ? project.shots.filter((shot) => shot.sceneId === canonical.id) : [];
    const displayIndex = chosen ? scripts.indexOf(chosen) : -1;
    const title = chosen ? screenplaySceneTitle(chosen, displayIndex, screenplay) : canonical ? "未連結文字腳本" : state.compareSceneId ? "找不到對應場次" : "尚未建立劇本場次";
    const scriptBlocks = chosen && chosen.blocks.length ? chosen.blocks.map((block) => '<div class="se-compare-block se-compare-' + escapeHtml(block.type) + '">' + (block.type === "dialogue" && block.character ? '<strong>' + escapeHtml(block.character) + '</strong>' : "") + '<p>' + escapeHtml(block.text || "") + '</p></div>').join("") : '<p class="se-compare-empty">尚無劇本內容。</p>';
    const shotCards = shots.length ? shots.map((shot, index) => '<article class="se-compare-shot"><span class="se-compare-shot-number">' + escapeHtml(shot.shotNumber || String(index + 1)) + '</span><div><strong>' + escapeHtml(shot.title || "未命名鏡次") + '</strong><p>' + escapeHtml(shot.visual || "尚無畫面描述。") + '</p>' + (shot.script ? '<p class="se-compare-vo">' + escapeHtml(shot.script) + '</p>' : "") + '</div></article>').join("") : '<p class="se-compare-empty">' + (canonical ? "此分鏡場次尚無鏡次。" : "這個劇本場次尚未連結分鏡場次。") + '</p>';
    host.innerHTML = '<section class="se-compare-panel" aria-label="分鏡對照"><header class="se-compare-header"><div><span class="se-eyebrow">SCREENPLAY / STORYBOARD</span><h2>劇本與分鏡對照</h2></div><button type="button" class="se-icon-button" data-screenplay-action="close-compare" aria-label="關閉對照">×</button></header>' +
      '<div class="se-compare-grid"><section class="se-compare-side"><span class="se-compare-label">文字腳本</span><h3>' + escapeHtml(title) + '</h3>' + (chosen && chosen.people ? '<p class="se-compare-meta">人物：' + escapeHtml(chosen.people) + '</p>' : "") + '<div class="se-compare-script">' + (chosen ? scriptBlocks : '<p class="se-compare-empty">未連結文字腳本。</p>') + '</div></section>' +
      '<section class="se-compare-side"><span class="se-compare-label">分鏡' + (canonical ? ' · ' + escapeHtml(canonical.title || "") : "") + '</span><div class="se-compare-shots">' + shotCards + '</div></section></div></section>';
  }

  function renderComparison() {
    const projectId = currentProjectId();
    const entry = getEntry(projectId);
    state.projectId = projectId;
    const host = $("#screenplay-compare-host");
    if (!host) return;
    if (state.compareOpen && entry) compareMarkup(currentProject(), entry.value);
    else {
      host.hidden = true;
      const toggle = $("#screenplay-compare-toggle");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    }
    bindCompareHost(host);
  }

  function render() {
    const host = $("#view-screenplay");
    const compareHost = $("#screenplay-compare-host");
    if (!host) return false;
    if (state.composing > 0) { state.renderPending = true; return false; }
    bindToggle();
    const previousOverview = $(".se-overview", host);
    if (previousOverview) state.overviewOpen = previousOverview.open;
    const savedFocus = focusSnapshot(host, compareHost);
    const projectId = currentProjectId();
    state.projectId = projectId;
    const entry = getEntry(projectId);
    const project = currentProject();
    const screenplay = entry ? entry.value : emptyScreenplay();
    const editable = canEdit();
    if (!project || !entry) {
      host.innerHTML = '<div class="se-empty-state"><h2>先開啟一個專案</h2><p>劇本草稿會保存在目前專案中。</p></div>';
      if (compareHost) { compareHost.hidden = true; compareHost.innerHTML = ""; }
      restoreFocus(host, compareHost, savedFocus);
      return true;
    }
    const sceneCards = screenplay.scenes.map((scene, index) => sceneMarkup(scene, index, screenplay, project, entry)).join("");
    const format = '<div class="se-format-toggle" role="group" aria-label="劇本格式"><button type="button" data-screenplay-edit-control="true" data-screenplay-format="tw" data-focus-key="format|tw" aria-label="台灣劇本格式" aria-pressed="' + (screenplay.format === "tw" ? "true" : "false") + '"' + (!editable ? " disabled" : "") + '>台灣格式</button><button type="button" data-screenplay-edit-control="true" data-screenplay-format="us" data-focus-key="format|us" aria-label="美式劇本格式" aria-pressed="' + (screenplay.format === "us" ? "true" : "false") + '"' + (!editable ? " disabled" : "") + '>美式格式</button></div>';
    const status = entry.actionError || (entry.error ? errorMessage(entry.error) : entry.pending ? "正在保存…" : entry.dirty ? "尚未保存" : entry.saved ? "已保存" : "草稿尚未保存");
    host.innerHTML = '<div class="se-editor-shell" data-screenplay-project="' + escapeHtml(projectId) + '" data-screenplay-format="' + escapeHtml(screenplay.format) + '"><header class="se-editor-header"><div><span class="se-eyebrow">OPTIONAL WRITING SPACE</span><h2>劇本草稿</h2><p>整理主旨、故事大綱與場次內容；劇本草稿不會改寫分鏡。</p></div><div class="se-editor-actions">' + format + '<div data-screenplay-markdown-host="true"></div></div></header>' +
      '<div class="se-save-row"><span data-screenplay-save-status="true"' + (entry.error || entry.actionError ? ' class="is-error"' : "") + ' aria-live="polite">' + escapeHtml(status) + '</span><button type="button" class="se-retry-button" data-screenplay-action="retry-save"' + (!(entry.error && entry.dirty) ? " hidden" : "") + '>重試保存</button></div>' +
      '<details class="se-overview"' + (state.overviewOpen ? " open" : "") + '><summary class="se-overview-summary"><div><span class="se-eyebrow">PROJECT NOTES</span><h3>主旨與大綱</h3></div><span class="se-overview-chevron" aria-hidden="true">⌄</span></summary><div class="se-overview-grid">' +
      labelField("主旨", "subject", screenplay.subject, "", { multiline: true, rows: 5, placeholder: "一句話描述故事核心" }) +
      labelField("故事大綱", "outline", screenplay.outline, "", { multiline: true, rows: 5, placeholder: "整理故事起承轉合…" }) + '</div></details>' +
      '<section class="se-scene-section"><div class="se-section-heading"><div><span class="se-eyebrow">SCENE OUTLINE</span><h3>場次與內容</h3><p>可建立場次並選擇連結分鏡。可直接貼上並保留換行；開頭輸入 /a 加空格或 △ 會標記為動作。</p></div><button type="button" class="se-primary-button" data-screenplay-edit-control="true" data-screenplay-action="add-scene" aria-label="新增劇本場次"' + (!editable ? " disabled" : "") + '>＋ 新增劇本場次</button></div>' +
      (sceneCards || '<div class="se-empty-scenes"><span>＋</span><strong>還沒有劇本場次</strong><p>新增一場，從場景設定或劇本內容開始。</p></div>') + '</section></div>';
    if (compareHost) compareMarkup(project, screenplay);
    bindHost(host);
    bindToggle();
    bindCompareHost(compareHost);
    const markdownHost = $("[data-screenplay-markdown-host]", host);
    if (markdownHost && root.ScreenplayMarkdownUI && typeof root.ScreenplayMarkdownUI.render === "function") {
      root.ScreenplayMarkdownUI.render(markdownHost, {
        getDraft: () => state.projectId === projectId ? clone(getEntry(projectId).value) : null,
        flush: flush,
        replaceDraft: async (value) => {
          if (state.composing > 0) throw new Error("請先完成目前輸入，再匯入劇本。");
          if (currentProjectId() !== projectId) throw new Error("專案已切換，請重新開啟匯入預覽。");
          const target = getEntry(projectId);
          await flushEntry(target);
          target.value = normalizeScreenplay(value);
          markDirty(target);
          render();
          await flushEntry(target);
          return true;
        }
      });
    }
    restoreFocus(host, compareHost, savedFocus);
    refreshStatus(entry);
    return true;
  }

  function updateSceneTitle(entry, sceneId) {
    const host = $("#view-screenplay");
    const screenplay = entry && entry.value;
    const index = screenplay ? screenplay.scenes.findIndex((item) => item.id === sceneId) : -1;
    const scene = index >= 0 ? screenplay.scenes[index] : null;
    const text = scene ? screenplaySceneTitle(scene, index, screenplay) : "";
    const title = scene && host && Array.from(host.querySelectorAll("[data-screenplay-scene-title]")).find((item) => item.dataset.screenplaySceneTitle === sceneId);
    const eyebrow = scene && host && Array.from(host.querySelectorAll("[data-screenplay-scene-index]")).find((item) => item.dataset.screenplaySceneIndex === sceneId);
    if (title) title.textContent = text;
    if (eyebrow) { eyebrow.hidden = text === "場次 " + (index + 1); eyebrow.textContent = eyebrow.hidden ? "" : "場次 " + (index + 1); }
  }

  function updateFromElement(element, runShortcut) {
    const entry = getEntry(state.projectId);
    if (!entry || !element) return;
    const field = element.dataset.screenplayField;
    const sceneId = element.dataset.screenplaySceneId || "";
    let scene = sceneId && entry.value.scenes.find((item) => item.id === sceneId);
    let changed = false;
    if ((field === "subject" || field === "outline") && entry.value[field] !== element.value) { entry.value[field] = element.value; changed = true; }
    else if (field === "format" && entry.value.format !== (element.value === "us" ? "us" : "tw")) { entry.value.format = element.value === "us" ? "us" : "tw"; changed = true; }
    else if (field === "sceneId" && scene && scene.sceneId !== (element.value || null)) { scene.sceneId = element.value || null; changed = true; }
    else if (["location", "time", "people", "interiorExterior"].includes(field) && scene && scene[field] !== element.value) { scene[field] = element.value; changed = true; }
    else return;
    if (!changed) return;
    markDirty(entry);
    if (scene && ["location", "time", "interiorExterior"].includes(field)) updateSceneTitle(entry, sceneId);
  }

  function deleteVisiblePrefix(element, length) {
    const walker = element.ownerDocument.createTreeWalker(element, 4);
    let remaining = length;
    while (walker.nextNode() && remaining > 0) {
      const text = walker.currentNode;
      if (!text.nodeValue) continue;
      const remove = Math.min(remaining, text.nodeValue.length);
      text.deleteData(0, remove);
      remaining -= remove;
    }
    return remaining === 0;
  }

  function applyActionShortcut(surface) {
    if (!surface) return false;
    let run = surface.querySelector("[data-screenplay-run='true']");
    if (run && run !== surface) {
      const prior = visibleText(run);
      const markerLength = prior.startsWith("/a ") ? 3 : prior.startsWith("△") ? (prior.charAt(1) === " " ? 2 : 1) : 0;
      if (!markerLength || run.dataset.screenplayRunType !== "text") return false;
      deleteVisiblePrefix(run, markerLength);
    } else {
      const value = surfaceText(surface);
      const markerLength = value.startsWith("/a ") ? 3 : value.startsWith("△") ? (value.charAt(1) === " " ? 2 : 1) : 0;
      if (!markerLength) return false;
      run = surface.ownerDocument.createElement("span");
      run.className = "se-script-run is-action";
      run.dataset.screenplayRun = "true";
      run.dataset.screenplayRunId = surface.dataset.screenplayEmptyBlockId || makeId("script-block");
      run.dataset.screenplayRunType = "action";
      run.dataset.screenplayRunCharacter = "";
      while (surface.firstChild) run.appendChild(surface.firstChild);
      surface.appendChild(run);
      deleteVisiblePrefix(run, markerLength);
    }
    run.dataset.screenplayRunType = "action";
    run.dataset.screenplayRunCharacter = "";
    run.classList.remove("is-text", "is-dialogue");
    run.classList.add("is-action");
    return true;
  }

  function ensureRunSeparators(surface) {
    const runs = Array.from(surface.querySelectorAll(":scope > [data-screenplay-run='true']"));
    runs.slice(1).forEach((run) => {
      const previous = run.previousSibling;
      if (previous && previous.nodeType === 1 && previous.tagName === "BR" && previous.dataset.screenplaySeparator === "true") return;
      const separator = surface.ownerDocument.createElement("br");
      separator.dataset.screenplaySeparator = "true";
      surface.insertBefore(separator, run);
    });
  }

  function updateBodyFromElement(surface) {
    const entry = getEntry(state.projectId);
    const scene = surface && findScene(entry, surface.dataset.screenplaySceneId);
    if (!entry || !scene) return;
    if (state.composing === 0) applyActionShortcut(surface);
    ensureRunSeparators(surface);
    scene.blocks = blocksFromSurface(surface, scene);
    rememberSurfaceSelection(surface);
    markDirty(entry);
  }

  function findScene(entry, id) { return entry && entry.value.scenes.find((scene) => scene.id === id); }

  function focusAfterRender(key, caretAtEnd) {
    root.setTimeout(() => {
      const host = $("#view-screenplay");
      const target = host && Array.from(host.querySelectorAll("[data-focus-key]")).find((element) => element.dataset.focusKey === key);
      if (!target) return;
      target.focus();
      if (target.matches("[data-screenplay-writing-surface]") && caretAtEnd) setSurfaceSelection(target, surfaceText(target).length);
      else if (typeof target.setSelectionRange === "function") target.setSelectionRange(target.value.length, target.value.length);
    }, 0);
  }

  function addSceneAfter(entry, scene) {
    const added = emptyScene();
    const index = scene ? entry.value.scenes.indexOf(scene) : -1;
    if (index < 0) entry.value.scenes.push(added);
    else entry.value.scenes.splice(index + 1, 0, added);
    markDirty(entry);
    render();
    focusAfterRender(focusKey(["body", added.id]), true);
    return added;
  }

  async function nextScene(entry, scene) {
    if (!entry || !scene || state.composing > 0) return;
    const active = state.activeSurface;
    if (active && active.isConnected && active.dataset.screenplaySceneId === scene.id) updateBodyFromElement(active);
    entry.actionError = "";
    try {
      await flushEntry(entry);
      if (currentProjectId() !== entry.projectId) throw new Error("專案已切換；請返回原專案繼續編輯。");
      const index = entry.value.scenes.indexOf(scene);
      const next = entry.value.scenes[index + 1];
      if (next) focusAfterRender(focusKey(["body", next.id]), true);
      else addSceneAfter(entry, scene);
    } catch (error) {
      entry.actionError = errorMessage(error);
      refreshStatus(entry);
    }
  }

  async function createBoardScene(entry, scene) {
    if (!entry || !scene || !model || typeof model.addScene !== "function") return;
    entry.actionError = "";
    entry.busyScenes.add(scene.id);
    render();
    try {
      await flushEntry(entry);
      const title = scene.location.trim() || "劇本場次 " + (entry.value.scenes.indexOf(scene) + 1);
      const sceneId = await model.addScene(title);
      const project = currentProject();
      if (!sceneId || !(project && Array.isArray(project.scenes) && project.scenes.some((item) => item.id === sceneId))) throw new Error("分鏡場次已建立，但未能讀回場次 ID；請手動連結。 ");
      scene.sceneId = sceneId;
      markDirty(entry);
      await flushEntry(entry);
    } catch (error) {
      entry.actionError = errorMessage(error);
    } finally {
      entry.busyScenes.delete(scene.id);
      render();
    }
  }

  function action(button) {
    const entry = getEntry(state.projectId);
    if (!entry || state.composing > 0) return;
    const actionName = button.dataset.screenplayAction;
    const sceneId = button.dataset.screenplaySceneId || "";
    const scene = findScene(entry, sceneId);
    if (actionName === "compare-toggle") {
      state.compareOpen = !state.compareOpen;
      renderComparison();
      return;
    }
    if (actionName === "close-compare") {
      state.compareOpen = false;
      renderComparison();
      return;
    }
    if (actionName === "retry-save") { entry.error = null; flushEntry(entry).catch((error) => { entry.error = error; refreshStatus(entry); }); return; }
    if (actionName === "tag-selection" && scene) {
      const host = $("#view-screenplay");
      const surface = host && Array.from(host.querySelectorAll("[data-screenplay-writing-surface]")).find((item) => item.dataset.screenplaySceneId === scene.id);
      if (surface) {
        updateBodyFromElement(surface);
        tagRange(entry, scene, surface, button.dataset.tagType);
      }
      return;
    }
    if (actionName === "next-scene" && scene) { nextScene(entry, scene); return; }
    if (actionName === "create-board-scene") { createBoardScene(entry, scene); return; }
    if (!canEdit()) return;
    if (actionName === "add-scene") {
      const added = emptyScene(); entry.value.scenes.push(added); markDirty(entry); render(); focusAfterRender(focusKey(["body", added.id]), true); return;
    }
    if (actionName === "remove-scene" && scene) {
      entry.value.scenes = entry.value.scenes.filter((item) => item.id !== scene.id); markDirty(entry); render(); return;
    }
    if ((actionName === "move-scene-up" || actionName === "move-scene-down") && scene) {
      const index = entry.value.scenes.indexOf(scene); const next = index + (actionName === "move-scene-up" ? -1 : 1);
      if (index >= 0 && next >= 0 && next < entry.value.scenes.length) { entry.value.scenes.splice(index, 1); entry.value.scenes.splice(next, 0, scene); markDirty(entry); render(); }
      return;
    }
  }

  function bindHost(host) {
    if (!host || host.__screenplayEditorBound) return;
    host.__screenplayEditorBound = true;
    if (!state.selectionListenerBound) {
      state.selectionListenerBound = true;
      root.document.addEventListener("selectionchange", () => {
        const surface = state.activeSurface;
        if (surface && surface.isConnected) rememberSurfaceSelection(surface);
      });
    }
    host.addEventListener("focusin", (event) => {
      if (event.target && event.target.matches && event.target.matches("[data-screenplay-writing-surface]")) {
        state.activeSurface = event.target;
        rememberSurfaceSelection(event.target);
      }
    });
    host.addEventListener("compositionstart", (event) => {
      if (event.target && event.target.matches && event.target.matches("[data-screenplay-writing-surface]")) { composingFields.add(event.target); state.composing += 1; }
    });
    host.addEventListener("compositionend", (event) => {
      const element = event.target;
      if (!element || !composingFields.has(element)) return;
      composingFields.delete(element); state.composing = Math.max(0, state.composing - 1);
      updateBodyFromElement(element);
      if (state.composing === 0 && state.renderPending) { state.renderPending = false; render(); }
    });
    host.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229 || event.key !== "Enter") return;
      const surface = event.target && event.target.matches && event.target.matches("[data-screenplay-writing-surface]") ? event.target : null;
      if (surface && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        nextScene(getEntry(state.projectId), findScene(getEntry(state.projectId), surface.dataset.screenplaySceneId));
        return;
      }
      if (surface) {
        event.preventDefault();
        insertPlainText(surface, "\n");
        updateBodyFromElement(surface);
        return;
      }
      const meta = event.target && event.target.matches && event.target.matches("[data-screenplay-meta], .se-scene-link-select") ? event.target : null;
      if (!meta) return;
      event.preventDefault();
      const row = meta.closest(".se-scene-meta-row");
      if (!row) return;
      const fields = Array.from(row.querySelectorAll("[data-screenplay-meta], .se-scene-link-select"));
      const index = fields.indexOf(meta);
      const next = fields[index + 1];
      if (next) next.focus();
      else {
        const body = meta.closest("[data-screenplay-scene-card]")?.querySelector("[data-screenplay-writing-surface]");
        if (body) { body.focus(); setSurfaceSelection(body, 0, 0); }
      }
    });
    host.addEventListener("input", (event) => {
      const element = event.target;
      if (!element || !element.dataset || !element.dataset.screenplayField) return;
      if (element.matches("[data-screenplay-writing-surface]")) {
        if (!event.isComposing && !composingFields.has(element)) updateBodyFromElement(element);
      } else updateFromElement(element, false);
    });
    host.addEventListener("change", (event) => {
      const element = event.target;
      if (!element || !element.dataset || !element.dataset.screenplayField) return;
      if (element.dataset.screenplayField === "format") return;
      updateFromElement(element, false);
      if (element.dataset.screenplayField === "sceneId") render();
    });
    host.addEventListener("paste", (event) => {
      const surface = event.target && event.target.matches && event.target.matches("[data-screenplay-writing-surface]") ? event.target : null;
      if (!surface || !event.clipboardData) return;
      const text = event.clipboardData.getData("text/plain");
      event.preventDefault();
      insertPlainText(surface, text);
      updateBodyFromElement(surface);
    });
    host.addEventListener("pointerdown", (event) => {
      const button = event.target.closest && event.target.closest("button[data-screenplay-action='tag-selection']");
      if (!button) return;
      if (event.pointerType === "mouse") event.preventDefault();
      const selected = state.activeSurface;
      if (selected && selected.isConnected && selected.dataset.screenplaySceneId === button.dataset.screenplaySceneId) rememberSurfaceSelection(selected);
    });
    host.addEventListener("click", (event) => {
      const format = event.target.closest && event.target.closest("button[data-screenplay-format]");
      if (format) {
        const entry = getEntry(state.projectId); if (!entry || !canEdit() || state.composing > 0) return;
        entry.value.format = format.dataset.screenplayFormat === "us" ? "us" : "tw"; markDirty(entry); render(); return;
      }
      const button = event.target.closest && event.target.closest("[data-screenplay-action]");
      if (button) action(button);
    });
  }

  function bindCompareHost(host) {
    if (!host || host.__screenplayCompareBound) return;
    host.__screenplayCompareBound = true;
    host.addEventListener("click", (event) => {
      const button = event.target.closest && event.target.closest("[data-screenplay-action='close-compare']");
      if (button) { state.compareOpen = false; renderComparison(); }
    });
  }

  function bindToggle() {
    const toggle = $("#screenplay-compare-toggle");
    if (!toggle || toggle.__screenplayEditorBound) return;
    toggle.__screenplayEditorBound = true;
    toggle.addEventListener("click", () => { state.compareOpen = !state.compareOpen; renderComparison(); });
  }

  function subscribe() {
    if (state.initialized || !model) return;
    state.initialized = true;
    if (typeof model.subscribeLifecycle === "function") {
      try { model.subscribeLifecycle(() => { const host = $("#view-screenplay"); if (host && !host.hidden && state.projectId) refreshStatus(entries.get(state.projectId)); }); } catch (_) {}
    }
  }

  function compare(sceneId) {
    state.compareSceneId = sceneId == null ? "" : String(sceneId);
    renderComparison();
  }

  function getDraft() {
    const entry = getEntry(currentProjectId());
    return entry ? clone(entry.value) : null;
  }

  async function replaceDraft(value) {
    if (state.composing > 0) throw new Error("請先完成目前輸入，再匯入劇本。");
    const projectId = currentProjectId();
    const entry = getEntry(projectId);
    if (!entry) throw new Error("目前沒有開啟中的專案。");
    await flushEntry(entry);
    if (currentProjectId() !== projectId) throw new Error("專案已切換，請重新開啟匯入預覽。");
    entry.value = normalizeScreenplay(value);
    markDirty(entry);
    render();
    await flushEntry(entry);
    return true;
  }

  bindToggle();
  subscribe();
  root.ScreenplayEditor = Object.freeze({ render: render, compare: compare, flush: flush, hasPending: hasPending, getDraft: getDraft, replaceDraft: replaceDraft });
})(typeof window !== "undefined" ? window : null);
