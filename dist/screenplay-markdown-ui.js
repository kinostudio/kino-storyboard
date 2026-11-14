(function attachScreenplayMarkdownUI(root, factory) {
  "use strict";
  const api = factory(root, root && root.ScreenplayMarkdown);
  if (root) root.ScreenplayMarkdownUI = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createScreenplayMarkdownUI(root, markdown) {
  "use strict";

  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const boundHosts = new WeakSet();
  let activeHost = null;
  let editor = null;
  let state = { busy: false, status: "", error: "", preview: null };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function fail(code, message) {
    const error = new Error(message || code);
    error.code = code;
    throw error;
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function stableJson(value) {
    if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + stableJson(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value);
  }

  function currentProject() {
    const model = root && root.StoryModel;
    return model && typeof model.getProject === "function" ? model.getProject() : null;
  }

  function currentDraft() {
    if (!editor || typeof editor.getDraft !== "function") fail("SCREENPLAY_EDITOR_UNAVAILABLE", "劇本編輯器尚未就緒。");
    return clone(editor.getDraft());
  }

  function newId(kind) {
    const random = root && root.crypto && typeof root.crypto.randomUUID === "function"
      ? root.crypto.randomUUID()
      : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    return kind + "-" + random;
  }

  function projectForDraft() {
    const project = currentProject();
    if (!project) fail("PROJECT_NOT_READY", "目前沒有可用的專案。");
    project.screenplay = currentDraft() || { subject: "", outline: "", format: "tw", scenes: [] };
    return project;
  }

  function ensureHost(host) {
    if (boundHosts.has(host)) return;
    host.innerHTML = '<div class="se-markdown-tools" data-screenplay-markdown-tools>' +
      '<div class="se-markdown-actions">' +
      '<button type="button" class="se-secondary-button" data-screenplay-action="export-markdown">下載 Markdown</button>' +
      '<button type="button" class="se-secondary-button" data-screenplay-action="import-markdown">匯入 Markdown</button>' +
      '<button type="button" class="se-secondary-button" data-screenplay-action="copy-ai-prompt">複製 AI 轉換指令</button>' +
      '<input type="file" accept=".md,text/markdown,text/plain" data-screenplay-file="markdown" hidden>' +
      '</div>' +
      '<p class="se-markdown-status" data-screenplay-markdown-status aria-live="polite"></p>' +
      '<section class="se-markdown-preview" data-screenplay-markdown-preview hidden aria-label="Markdown 匯入預覽">' +
      '<h3>Markdown 匯入預覽</h3>' +
      '<p data-screenplay-markdown-summary></p>' +
      '<p data-screenplay-markdown-link-warning role="alert" hidden>此檔案來自其他專案；匯入後會清除原分鏡場次連結，需重新連結。</p>' +
      '<p data-screenplay-markdown-stale role="alert" hidden></p>' +
      '<pre data-screenplay-markdown-content></pre>' +
      '<div class="se-markdown-actions"><button type="button" class="se-primary-button" data-screenplay-action="confirm-import-markdown">確認匯入</button>' +
      '<button type="button" class="se-secondary-button" data-screenplay-action="cancel-import-markdown">取消</button></div>' +
      '</section>' +
      '</div>';
    host.addEventListener("click", handleClick);
    host.addEventListener("change", handleChange);
    boundHosts.add(host);
  }

  function previewStaleReason(preview) {
    try {
      const project = currentProject();
      if (!project || project.projectId !== preview.projectId) return "目前專案已切換；請重新選取 Markdown。";
      const sceneIds = (project.scenes || []).map(function (scene) { return scene.id; });
      if (stableJson(sceneIds) !== preview.sceneIdsJson) return "分鏡場次已變更；請重新預覽 Markdown 以確認連結。";
      if (stableJson(currentDraft()) !== preview.draftJson) return "劇本草稿已變更；請重新預覽 Markdown，避免覆蓋新內容。";
      return "";
    } catch (_) {
      return "目前專案狀態已變更；請重新選取 Markdown。";
    }
  }

  function renderState() {
    const host = activeHost;
    if (!host || !host.isConnected) return;
    const status = host.querySelector("[data-screenplay-markdown-status]");
    if (status) status.textContent = state.error || state.status;
    const preview = host.querySelector("[data-screenplay-markdown-preview]");
    if (!preview) return;
    const data = state.preview;
    preview.hidden = !data;
    if (!data) return;
    const stale = previewStaleReason(data);
    const warning = host.querySelector("[data-screenplay-markdown-link-warning]");
    const staleNotice = host.querySelector("[data-screenplay-markdown-stale]");
    const confirm = host.querySelector('[data-screenplay-action="confirm-import-markdown"]');
    const summary = host.querySelector("[data-screenplay-markdown-summary]");
    const content = host.querySelector("[data-screenplay-markdown-content]");
    if (warning) warning.hidden = !data.info.linksUnlinked;
    if (staleNotice) {
      staleNotice.hidden = !stale;
      staleNotice.textContent = stale;
    }
    if (confirm) confirm.disabled = state.busy || !!stale;
    if (summary) {
      const sceneCount = data.info.screenplay.scenes.length;
      const blockCount = data.info.screenplay.scenes.reduce(function (sum, scene) { return sum + scene.blocks.length; }, 0);
      summary.textContent = data.fileName + " · " + sceneCount + " 場 · " + blockCount + " 個內容區塊";
    }
    if (content) {
      const previewText = data.markdown.slice(0, 5000);
      content.textContent = previewText + (data.markdown.length > previewText.length ? "\n…（預覽截斷；匯入仍使用完整檔案）" : "");
    }
    host.querySelectorAll("[data-screenplay-action]").forEach(function (button) {
      if (button.dataset.screenplayAction === "cancel-import-markdown") button.disabled = state.busy;
      else if (button.dataset.screenplayAction !== "confirm-import-markdown") button.disabled = state.busy;
    });
  }

  function captureBaseline() {
    const project = currentProject();
    if (!project || !project.projectId) fail("PROJECT_NOT_READY", "目前沒有可用的專案。");
    const draft = currentDraft();
    const target = clone(project);
    target.screenplay = draft || { subject: "", outline: "", format: "tw", scenes: [] };
    return {
      project: target,
      projectId: project.projectId,
      sceneIdsJson: stableJson((project.scenes || []).map(function (scene) { return scene.id; })),
      draftJson: stableJson(draft)
    };
  }

  function makeDownload(markdownText) {
    if (!root || typeof root.Blob !== "function" || !root.URL || typeof root.URL.createObjectURL !== "function") {
      fail("DOWNLOAD_UNAVAILABLE", "此瀏覽器無法建立 Markdown 下載。");
    }
    const url = root.URL.createObjectURL(new root.Blob([markdownText], { type: "text/markdown;charset=utf-8" }));
    const anchor = root.document.createElement("a");
    anchor.href = url;
    anchor.download = "screenplay.md";
    anchor.hidden = true;
    root.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 0);
  }

  async function exportMarkdown() {
    if (!markdown || typeof markdown.export !== "function") fail("MARKDOWN_CODEC_UNAVAILABLE", "Markdown 匯出功能尚未載入。");
    const project = projectForDraft();
    const value = markdown.export(project);
    makeDownload(value);
    state.status = "Markdown 已下載。";
    state.error = "";
    renderState();
  }

  async function copyPrompt() {
    if (!markdown || typeof markdown.conversionPrompt !== "function") fail("MARKDOWN_CODEC_UNAVAILABLE", "AI 轉換指令尚未載入。");
    if (!root.navigator || !root.navigator.clipboard || typeof root.navigator.clipboard.writeText !== "function") {
      fail("CLIPBOARD_UNAVAILABLE", "此瀏覽器無法複製指令；請從安全連線開啟本機專案。 ");
    }
    await root.navigator.clipboard.writeText(markdown.conversionPrompt(projectForDraft()));
    state.status = "AI 轉換指令已複製。";
    state.error = "";
    renderState();
  }

  async function readMarkdownFile(file, input) {
    state.preview = null;
    state.error = "";
    state.status = "";
    if (!file) return;
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) {
      fail("SCREENPLAY_MARKDOWN_SIZE_LIMIT", "Markdown 檔案不可超過 5 MiB。");
    }
    if (typeof file.arrayBuffer !== "function") fail("INVALID_MARKDOWN_FILE", "無法讀取此 Markdown 檔案。");
    if (!markdown || typeof markdown.parseWithInfo !== "function") fail("MARKDOWN_CODEC_UNAVAILABLE", "Markdown 匯入功能尚未載入。");
    const baseline = captureBaseline();
    state.busy = true;
    state.status = "正在讀取 Markdown…";
    renderState();
    try {
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength !== file.size || bytes.byteLength > MAX_FILE_BYTES) {
        fail("SCREENPLAY_MARKDOWN_SIZE_LIMIT", "Markdown 檔案大小無效或超過 5 MiB。");
      }
      let markdownText;
      try { markdownText = new root.TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch (_) { fail("INVALID_MARKDOWN_ENCODING", "Markdown 檔案必須使用有效 UTF-8 編碼。"); }
      const info = markdown.parseWithInfo(markdownText, { project: baseline.project, makeId: newId });
      state.preview = {
        fileName: String(file.name || "screenplay.md"),
        markdown: markdownText,
        info: info,
        projectId: baseline.projectId,
        sceneIdsJson: baseline.sceneIdsJson,
        draftJson: baseline.draftJson
      };
      state.status = "請檢查匯入預覽，再確認或取消。";
    } finally {
      state.busy = false;
      if (input) input.value = "";
      renderState();
    }
  }

  async function confirmImport() {
    const preview = state.preview;
    if (!preview) return;
    const stale = previewStaleReason(preview);
    if (stale) {
      state.error = stale;
      renderState();
      return;
    }
    if (!editor || typeof editor.replaceDraft !== "function") fail("SCREENPLAY_EDITOR_UNAVAILABLE", "劇本編輯器尚未提供匯入保存功能。");
    state.busy = true;
    state.error = "";
    state.status = "正在匯入並保存…";
    renderState();
    try {
      await editor.replaceDraft(clone(preview.info.screenplay));
      state.preview = null;
      state.status = preview.info.linksUnlinked
        ? "已匯入；原專案的分鏡連結已清除，請重新連結。"
        : "Markdown 已匯入並保存。";
    } catch (error) {
      state.error = (error && error.code ? error.code + " · " : "") + (error && error.message || "匯入失敗；目前草稿仍保留。");
    } finally {
      state.busy = false;
      renderState();
    }
  }

  function cancelImport() {
    state.preview = null;
    state.error = "";
    state.status = "已取消匯入；原稿保留。";
    renderState();
  }

  function run(action) {
    const actions = {
      "export-markdown": exportMarkdown,
      "copy-ai-prompt": copyPrompt,
      "confirm-import-markdown": confirmImport,
      "cancel-import-markdown": cancelImport
    };
    if (action === "import-markdown") {
      const input = activeHost && activeHost.querySelector('[data-screenplay-file="markdown"]');
      if (input) input.click();
      return;
    }
    if (!actions[action]) return;
    Promise.resolve(actions[action]()).catch(function (error) {
      state.error = (error && error.code ? error.code + " · " : "") + (error && error.message || "操作失敗。");
      state.status = "";
      state.busy = false;
      renderState();
    });
  }

  function handleClick(event) {
    const button = event.target && event.target.closest && event.target.closest("[data-screenplay-action]");
    if (!button || !activeHost || !activeHost.contains(button)) return;
    event.preventDefault();
    run(button.dataset.screenplayAction);
  }

  function handleChange(event) {
    const input = event.target;
    if (!input || !input.matches || !input.matches('[data-screenplay-file="markdown"]')) return;
    readMarkdownFile(input.files && input.files[0], input).catch(function (error) {
      state.preview = null;
      state.error = (error && error.code ? error.code + " · " : "") + (error && error.message || "Markdown 匯入失敗。");
      state.status = "";
      state.busy = false;
      input.value = "";
      renderState();
    });
  }

  function render(host, editorApi) {
    if (!host || typeof host.querySelector !== "function") return false;
    activeHost = host;
    editor = editorApi || editor;
    ensureHost(host);
    renderState();
    return true;
  }

  return Object.freeze({
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    render: render
  });
});
