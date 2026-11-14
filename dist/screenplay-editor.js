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
  const activeTextFields = new WeakMap();
  const state = { projectId: "", composing: 0, renderPending: false, compareSceneId: "", compareOpen: false, overviewOpen: true, initialized: false };
  const $ = (selector, host) => (host || root.document).querySelector(selector);
  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const makeId = (prefix) => prefix + "-" + (root.crypto && typeof root.crypto.randomUUID === "function" ? root.crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));

  function emptyScene() {
    return { id: makeId("script-scene"), sceneId: null, location: "", time: "", people: "", interiorExterior: "", blocks: [] };
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
    if (entry.timer) { root.clearTimeout(entry.timer); entry.timer = null; }
    if (entry.pending) await entry.pending;
    if (entry.dirty) await saveEntry(entry);
    if (entry.dirty) throw entry.error || new Error("劇本草稿尚未保存。");
    return true;
  }

  function hasPending() {
    const entry = entries.get(currentProjectId());
    return !!(entry && (entry.dirty || entry.pending || entry.timer));
  }

  async function flush() {
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
    return "△ " + (index + 1) + (heading ? " · " + heading : "");
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

  function roleSuggestions(screenplay, scene) {
    const names = [];
    String(scene.people || "").split(/[,，、/\n]+/).forEach((name) => { if (name.trim()) names.push(name.trim()); });
    (screenplay.scenes || []).forEach((row) => (row.blocks || []).forEach((block) => {
      if (block.type === "dialogue" && String(block.character || "").trim()) names.push(String(block.character).trim());
    }));
    return Array.from(new Set(names));
  }

  function roleListId(sceneId) { return "se-roles-" + encodeURIComponent(sceneId).replace(/%/g, "_"); }

  function blockMarkup(block, scene, sceneIndex, blockIndex, editable, screenplay) {
    const type = block.type || "text";
    const name = type === "dialogue" ? "對白" : type === "action" ? "動作" : "文字";
    const placeholder = type === "dialogue" ? "輸入台詞，可直接貼上並保留換行…" : type === "action" ? "動作或畫面描述，可直接貼上並保留換行…" : "輸入文字…";
    const disabled = editable ? "" : " disabled";
    const id = escapeHtml(block.id);
    const sceneId = escapeHtml(scene.id);
    const index = String(blockIndex + 1);
    const suggestions = roleSuggestions(screenplay, scene);
    const marker = type === "action" && screenplay.format === "tw" ? '<span class="se-action-marker" aria-hidden="true">△</span>' : "";
    return '<article class="se-block" data-block-id="' + id + '" data-block-type="' + escapeHtml(type) + '">' +
      '<div class="se-block-toolbar"><label class="se-block-kind"><span class="se-sr-only">區塊類型</span><select data-screenplay-edit-control="true" data-screenplay-field="blockType" data-screenplay-scene-id="' + sceneId + '" data-screenplay-block-id="' + id + '" data-focus-key="' + escapeHtml(focusKey(["blockType", scene.id, block.id])) + '" aria-label="第 ' + index + ' 區塊類型"' + disabled + '>' +
      '<option value="action"' + (type === "action" ? " selected" : "") + '>動作</option><option value="dialogue"' + (type === "dialogue" ? " selected" : "") + '>對白</option><option value="text"' + (type === "text" ? " selected" : "") + '>文字</option></select></label>' +
      '<button type="button" class="se-symbol-button" data-screenplay-edit-control="true" data-screenplay-action="insert-triangle" data-screenplay-scene-id="' + sceneId + '" data-screenplay-block-id="' + id + '" aria-label="標記為動作 △" title="標記為動作"' + disabled + '>△</button>' +
      '<button type="button" class="se-icon-button" data-screenplay-edit-control="true" data-screenplay-action="remove-block" data-screenplay-scene-id="' + sceneId + '" data-screenplay-block-id="' + id + '" aria-label="刪除第 ' + index + ' 區塊" title="刪除區塊"' + disabled + '>×</button></div>' +
      (type === "dialogue" ? '<label class="se-role"><span>角色</span><input type="text" list="' + escapeHtml(roleListId(scene.id)) + '" data-screenplay-edit-control="true" data-screenplay-field="character" data-screenplay-scene-id="' + sceneId + '" data-screenplay-block-id="' + id + '" data-focus-key="' + escapeHtml(focusKey(["character", scene.id, block.id])) + '" value="' + escapeHtml(block.character || "") + '" placeholder="角色名稱" aria-label="對白角色"' + disabled + '></label>' : "") +
      '<label class="se-block-copy"><span class="se-sr-only">' + name + '內容</span><div class="se-action-copy">' + marker + '<textarea rows="' + (String(block.text || "").split("\n").length > 2 ? Math.min(12, String(block.text).split("\n").length) : "3") + '" data-screenplay-edit-control="true" data-screenplay-block-text="true" data-screenplay-field="blockText" data-screenplay-scene-id="' + sceneId + '" data-screenplay-block-id="' + id + '" data-focus-key="' + escapeHtml(focusKey(["blockText", scene.id, block.id])) + '" aria-label="' + name + '內容，第 ' + index + ' 區塊" placeholder="' + escapeHtml(placeholder) + '"' + disabled + '>' + escapeHtml(block.text || "") + '</textarea></div></label>' +
      '</article>';
  }

  function sceneMarkup(scene, index, screenplay, project, entry) {
    const editable = canEdit();
    const linked = scene.sceneId && Array.isArray(project && project.scenes) && project.scenes.some((item) => item.id === scene.sceneId);
    const title = screenplaySceneTitle(scene, index, screenplay);
    const blocks = scene.blocks.map((block, blockIndex) => blockMarkup(block, scene, index, blockIndex, editable, screenplay)).join("");
    const suggestions = roleSuggestions(screenplay, scene);
    const roleList = suggestions.length ? '<datalist id="' + escapeHtml(roleListId(scene.id)) + '">' + suggestions.map((nameValue) => '<option value="' + escapeHtml(nameValue) + '"></option>').join("") + '</datalist>' : "";
    const linkOptions = sceneOptions(project, scene.sceneId, scene.id, screenplay).map((item) => '<option value="' + escapeHtml(item.value) + '"' + (scene.sceneId === item.value ? " selected" : "") + '>' + escapeHtml(item.label) + '</option>').join("");
    const canCreate = editable && model && typeof model.addScene === "function" && !scene.sceneId;
    return '<section class="se-scene-card" data-screenplay-scene-card="' + escapeHtml(scene.id) + '">' +
      '<header class="se-scene-card-head"><div class="se-scene-title-wrap"><span class="se-scene-index">場次 ' + (index + 1) + '</span><h3 data-screenplay-scene-title="' + escapeHtml(scene.id) + '">' + escapeHtml(title) + '</h3></div>' +
      '<div class="se-scene-tools"><button type="button" class="se-icon-button" data-screenplay-edit-control="true" data-screenplay-action="move-scene-up" data-screenplay-scene-id="' + escapeHtml(scene.id) + '"' + (index === 0 ? ' data-screenplay-fixed-disabled="true"' : "") + ' aria-label="場次上移" title="上移"' + (index === 0 || !editable ? " disabled" : "") + '>↑</button>' +
      '<button type="button" class="se-icon-button" data-screenplay-edit-control="true" data-screenplay-action="move-scene-down" data-screenplay-scene-id="' + escapeHtml(scene.id) + '"' + (index === screenplay.scenes.length - 1 ? ' data-screenplay-fixed-disabled="true"' : "") + ' aria-label="場次下移" title="下移"' + (index === screenplay.scenes.length - 1 || !editable ? " disabled" : "") + '>↓</button>' +
      '<button type="button" class="se-icon-button is-danger" data-screenplay-edit-control="true" data-screenplay-action="remove-scene" data-screenplay-scene-id="' + escapeHtml(scene.id) + '" aria-label="刪除劇本場次" title="刪除劇本場次"' + (!editable ? " disabled" : "") + '>×</button></div></header>' +
      '<div class="se-scene-link"><label class="se-field"><span>連結分鏡場次</span><select data-screenplay-edit-control="true" data-screenplay-field="sceneId" data-screenplay-scene-id="' + escapeHtml(scene.id) + '" data-focus-key="' + escapeHtml(focusKey(["sceneId", scene.id])) + '" aria-label="連結分鏡場次"' + (!editable ? " disabled" : "") + '>' + linkOptions + '</select></label>' +
      (linked ? '<span class="se-link-state">已連結</span>' : canCreate ? '<button type="button" class="se-secondary-button" data-screenplay-edit-control="true" data-screenplay-action="create-board-scene" data-screenplay-scene-id="' + escapeHtml(scene.id) + '"' + (entry.busyScenes.has(scene.id) ? ' data-screenplay-fixed-disabled="true" disabled' : "") + '>建立對應分鏡場次</button>' : '<span class="se-link-state">可稍後連結</span>') + '</div>' +
      '<div class="se-scene-fields">' +
      labelField("內／外景", "interiorExterior", scene.interiorExterior, scene.id, { select: [{ value: "", label: "未設定" }, { value: "INT.", label: "內景 INT." }, { value: "EXT.", label: "外景 EXT." }, { value: "INT./EXT.", label: "內外景 INT./EXT." }] }) +
      labelField("地點", "location", scene.location, scene.id, { placeholder: "例如：咖啡店" }) +
      labelField("時間", "time", scene.time, scene.id, { placeholder: "例如：日／夜" }) +
      labelField("人物", "people", scene.people, scene.id, { placeholder: "人物名稱，以逗號分隔" }) + '</div>' +
      '<div class="se-blocks-heading"><div><h4>劇本內容</h4><p>直接貼上並保留換行；/a 加空格或開頭的 △ 會標記為動作。</p></div></div>' +
      '<div class="se-block-list">' + (blocks || '<p class="se-empty-blocks">新增動作或對白區塊開始寫作。</p>') + '</div>' + roleList +
      '<div class="se-add-blocks"><button type="button" class="se-secondary-button" data-screenplay-edit-control="true" data-screenplay-action="add-block" data-block-type="action" data-screenplay-scene-id="' + escapeHtml(scene.id) + '"' + (!editable ? " disabled" : "") + '>＋ 動作</button><button type="button" class="se-secondary-button" data-screenplay-edit-control="true" data-screenplay-action="add-block" data-block-type="dialogue" data-screenplay-scene-id="' + escapeHtml(scene.id) + '"' + (!editable ? " disabled" : "") + '>＋ 對白</button><button type="button" class="se-secondary-button" data-screenplay-edit-control="true" data-screenplay-action="add-block" data-block-type="text" data-screenplay-scene-id="' + escapeHtml(scene.id) + '"' + (!editable ? " disabled" : "") + '>＋ 文字</button></div>' +
      '</section>';
  }

  function focusSnapshot(host, compareHost) {
    const active = root.document.activeElement;
    const owner = host && host.contains(active) ? host : compareHost && compareHost.contains(active) ? compareHost : null;
    if (!owner || !active || !active.dataset || !active.dataset.focusKey) return null;
    return { owner: owner.id, key: active.dataset.focusKey, start: typeof active.selectionStart === "number" ? active.selectionStart : null, end: typeof active.selectionEnd === "number" ? active.selectionEnd : null };
  }

  function restoreFocus(host, compareHost, saved) {
    if (!saved) return;
    const owner = saved.owner === "screenplay-compare-host" ? compareHost : host;
    if (!owner) return;
    const target = Array.from(owner.querySelectorAll("[data-focus-key]")).find((element) => element.dataset.focusKey === saved.key);
    if (!target) return;
    try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
    if (saved.start != null && typeof target.setSelectionRange === "function") {
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
    const chosen = state.compareSceneId
      ? scripts.find((item) => item.id === state.compareSceneId || item.sceneId === state.compareSceneId) || null
      : scripts.find((item) => item.sceneId) || scripts[0] || null;
    const canonical = chosen && project ? (project.scenes || []).find((item) => item.id === chosen.sceneId) : project && state.compareSceneId ? (project.scenes || []).find((item) => item.id === state.compareSceneId) : null;
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
    host.innerHTML = '<div class="se-editor-shell" data-screenplay-project="' + escapeHtml(projectId) + '" data-screenplay-format="' + escapeHtml(screenplay.format) + '"><header class="se-editor-header"><div><span class="se-eyebrow">OPTIONAL WRITING SPACE</span><h2>劇本草稿</h2><p>整理主旨、故事大綱與場次內容；劇本草稿不會改寫分鏡。</p></div><div class="se-editor-actions">' + format + '</div></header>' +
      '<div class="se-save-row"><span data-screenplay-save-status="true"' + (entry.error || entry.actionError ? ' class="is-error"' : "") + ' aria-live="polite">' + escapeHtml(status) + '</span><button type="button" class="se-retry-button" data-screenplay-action="retry-save"' + (!(entry.error && entry.dirty) ? " hidden" : "") + '>重試保存</button></div>' +
      '<details class="se-overview"' + (state.overviewOpen ? " open" : "") + '><summary class="se-overview-summary"><div><span class="se-eyebrow">PROJECT NOTES</span><h3>主旨與大綱</h3></div><span class="se-overview-chevron" aria-hidden="true">⌄</span></summary><div class="se-overview-grid">' +
      labelField("主旨", "subject", screenplay.subject, "", { multiline: true, rows: 2, placeholder: "一句話描述故事核心" }) +
      labelField("故事大綱", "outline", screenplay.outline, "", { multiline: true, rows: 5, placeholder: "整理故事起承轉合…" }) + '</div></details>' +
      '<section class="se-scene-section"><div class="se-section-heading"><div><span class="se-eyebrow">SCENE OUTLINE</span><h3>場次與內容</h3><p>可建立劇本場次，再選擇連結既有分鏡場次。</p></div><button type="button" class="se-primary-button" data-screenplay-edit-control="true" data-screenplay-action="add-scene" aria-label="新增劇本場次"' + (!editable ? " disabled" : "") + '>＋ 新增劇本場次</button></div>' +
      (sceneCards || '<div class="se-empty-scenes"><span>△</span><strong>還沒有劇本場次</strong><p>新增一場，從場景設定或劇本內容開始。</p></div>') + '</section></div>';
    if (compareHost) compareMarkup(project, screenplay);
    bindHost(host);
    bindToggle();
    bindCompareHost(compareHost);
    restoreFocus(host, compareHost, savedFocus);
    refreshStatus(entry);
    return true;
  }

  function updateSceneTitle(entry, sceneId) {
    const host = $("#view-screenplay");
    const screenplay = entry && entry.value;
    const index = screenplay ? screenplay.scenes.findIndex((item) => item.id === sceneId) : -1;
    const scene = index >= 0 ? screenplay.scenes[index] : null;
    const title = scene && host && Array.from(host.querySelectorAll("[data-screenplay-scene-title]")).find((item) => item.dataset.screenplaySceneTitle === sceneId);
    if (title) title.textContent = screenplaySceneTitle(scene, index, screenplay);
  }

  function updateFromElement(element, runShortcut) {
    const entry = getEntry(state.projectId);
    if (!entry || !element) return;
    const field = element.dataset.screenplayField;
    const sceneId = element.dataset.screenplaySceneId || "";
    const blockId = element.dataset.screenplayBlockId || "";
    let scene = sceneId && entry.value.scenes.find((item) => item.id === sceneId);
    let block = scene && blockId && scene.blocks.find((item) => item.id === blockId);
    if (field === "subject" || field === "outline") entry.value[field] = element.value;
    else if (field === "format") entry.value.format = element.value === "us" ? "us" : "tw";
    else if (field === "sceneId" && scene) scene.sceneId = element.value || null;
    else if (["location", "time", "people", "interiorExterior"].includes(field) && scene) scene[field] = element.value;
    else if (field === "blockType" && block) block.type = ["action", "dialogue", "text"].includes(element.value) ? element.value : "text";
    else if (field === "character" && block) block.character = element.value;
    else if (field === "blockText" && block) {
      if (runShortcut && !composingFields.has(element)) applyActionMarker(element, block);
      block.text = element.value;
    } else return;
    markDirty(entry);
    if (scene && ["location", "time", "interiorExterior"].includes(field)) updateSceneTitle(entry, sceneId);
    if (field === "blockText" && block && block.type === "action" && !element.closest(".se-block")?.matches('[data-block-type="action"]')) render();
  }

  function applyActionMarker(element, block) {
    let markerLength = 0;
    if (element.value.startsWith("/a ")) markerLength = 3;
    else if (element.value.startsWith("△")) markerLength = element.value.charAt(1) === " " ? 2 : 1;
    if (!markerLength) return false;
    const cursor = typeof element.selectionStart === "number" ? element.selectionStart : element.value.length;
    element.value = element.value.slice(markerLength);
    const nextCursor = Math.max(0, cursor - markerLength);
    try { element.setSelectionRange(nextCursor, nextCursor); } catch (_) {}
    block.type = "action";
    return true;
  }

  function findScene(entry, id) { return entry && entry.value.scenes.find((scene) => scene.id === id); }

  function insertTriangle(button) {
    const sceneId = button.dataset.screenplaySceneId;
    const blockId = button.dataset.screenplayBlockId;
    const entry = getEntry(state.projectId);
    const scene = findScene(entry, sceneId);
    const block = scene && scene.blocks.find((item) => item.id === blockId);
    if (!entry || !block) return;
    const host = $("#view-screenplay");
    const active = activeTextFields.get(host);
    const target = active && active.isConnected && active.dataset.screenplayBlockId === blockId ? active : Array.from(host.querySelectorAll("[data-screenplay-block-text]")).find((item) => item.dataset.screenplayBlockId === blockId);
    if (!target) return;
    if (target.value.startsWith("/a ")) target.value = target.value.slice(3);
    else if (target.value.startsWith("△")) target.value = target.value.slice(target.value.charAt(1) === " " ? 2 : 1);
    block.type = "action";
    block.text = target.value;
    markDirty(entry);
    render();
    setFocusAfterRender(focusKey(["blockText", scene.id, block.id]));
  }

  function setFocusAfterRender(key) {
    root.setTimeout(() => {
      const host = $("#view-screenplay");
      const target = host && Array.from(host.querySelectorAll("[data-focus-key]")).find((element) => element.dataset.focusKey === key);
      if (target) { target.focus(); if (typeof target.setSelectionRange === "function") target.setSelectionRange(target.value.length, target.value.length); }
    }, 0);
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
    if (!entry) return;
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
    if (actionName === "insert-triangle") { insertTriangle(button); return; }
    if (actionName === "create-board-scene") { createBoardScene(entry, scene); return; }
    if (!canEdit()) return;
    if (actionName === "add-scene") {
      const added = emptyScene(); entry.value.scenes.push(added); markDirty(entry); render(); setFocusAfterRender(focusKey(["location", added.id])); return;
    }
    if (actionName === "remove-scene" && scene) {
      entry.value.scenes = entry.value.scenes.filter((item) => item.id !== scene.id); markDirty(entry); render(); return;
    }
    if ((actionName === "move-scene-up" || actionName === "move-scene-down") && scene) {
      const index = entry.value.scenes.indexOf(scene); const next = index + (actionName === "move-scene-up" ? -1 : 1);
      if (index >= 0 && next >= 0 && next < entry.value.scenes.length) { entry.value.scenes.splice(index, 1); entry.value.scenes.splice(next, 0, scene); markDirty(entry); render(); }
      return;
    }
    if (actionName === "add-block" && scene) {
      const type = ["action", "dialogue", "text"].includes(button.dataset.blockType) ? button.dataset.blockType : "text";
      const block = { id: makeId("script-block"), type: type, character: "", text: "" };
      scene.blocks.push(block); markDirty(entry); render();
      setFocusAfterRender(focusKey([type === "dialogue" ? "character" : "blockText", scene.id, block.id])); return;
    }
    if (actionName === "remove-block" && scene) {
      scene.blocks = scene.blocks.filter((block) => block.id !== button.dataset.screenplayBlockId); markDirty(entry); render(); return;
    }
  }

  function bindHost(host) {
    if (!host || host.__screenplayEditorBound) return;
    host.__screenplayEditorBound = true;
    host.addEventListener("focusin", (event) => {
      if (event.target && event.target.matches && event.target.matches("[data-screenplay-block-text]")) activeTextFields.set(host, event.target);
    });
    host.addEventListener("compositionstart", (event) => {
      if (event.target && event.target.matches && event.target.matches("[data-screenplay-block-text]")) { composingFields.add(event.target); state.composing += 1; }
    });
    host.addEventListener("compositionend", (event) => {
      const element = event.target;
      if (!element || !composingFields.has(element)) return;
      composingFields.delete(element); state.composing = Math.max(0, state.composing - 1);
      updateFromElement(element, true);
      if (state.composing === 0 && state.renderPending) { state.renderPending = false; render(); }
    });
    host.addEventListener("keydown", (event) => {
      const role = event.target;
      if (event.isComposing || event.keyCode === 229 || event.key !== "Enter" || !role.matches || !role.matches(".se-role input")) return;
      event.preventDefault();
      const blockId = role.dataset.screenplayBlockId;
      const text = Array.from(host.querySelectorAll("[data-screenplay-block-text]")).find((item) => item.dataset.screenplayBlockId === blockId);
      if (text) { text.focus(); text.setSelectionRange(text.value.length, text.value.length); }
    });
    host.addEventListener("input", (event) => {
      const element = event.target;
      if (!element || !element.dataset || !element.dataset.screenplayField) return;
      updateFromElement(element, element.dataset.screenplayField === "blockText" && !event.isComposing && !composingFields.has(element));
    });
    host.addEventListener("change", (event) => {
      const element = event.target;
      if (!element || !element.dataset || !element.dataset.screenplayField) return;
      if (element.dataset.screenplayField === "format") return;
      updateFromElement(element, false);
      if (["blockType", "sceneId"].includes(element.dataset.screenplayField)) render();
    });
    host.addEventListener("click", (event) => {
      const format = event.target.closest && event.target.closest("button[data-screenplay-format]");
      if (format) {
        const entry = getEntry(state.projectId); if (!entry || !canEdit()) return;
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

  bindToggle();
  subscribe();
  root.ScreenplayEditor = Object.freeze({ render: render, compare: compare, flush: flush, hasPending: hasPending });
})(typeof window !== "undefined" ? window : null);
