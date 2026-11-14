(function attachScreenplayMarkdown(root, factory) {
  "use strict";
  const schema = typeof module === "object" && module && module.exports
    ? require("./project-schema.js")
    : root && root.DirectorStoryboardProjectSchema;
  const api = factory(schema);
  if (root) root.ScreenplayMarkdown = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createScreenplayMarkdown(schema) {
  "use strict";

  const TITLE = "# KINO Storyboard Screenplay";
  const VERSION = 1;

  class ScreenplayMarkdownError extends Error {
    constructor(code, message, path) {
      super(message || code || "Screenplay Markdown error");
      this.name = "ScreenplayMarkdownError";
      this.code = code || "SCREENPLAY_MARKDOWN_ERROR";
      this.path = path || null;
    }
  }

  function fail(code, message, path) {
    throw new ScreenplayMarkdownError(code, message, path);
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function exactKeys(value, expected, path) {
    if (!isRecord(value)) fail("INVALID_SCREENPLAY_MARKDOWN", path + " 必須是 JSON 物件。", path);
    const keys = Object.keys(value);
    if (keys.length !== expected.length || keys.some(function (key) { return expected.indexOf(key) < 0; })) {
      fail("INVALID_SCREENPLAY_MARKDOWN", path + " 欄位不完整或含有未支援欄位。", path);
    }
  }

  function getSchema() {
    if (!schema || typeof schema.validateProject !== "function") {
      fail("SCHEMA_UNAVAILABLE", "請先載入 Project schema。");
    }
    return schema;
  }

  function validateProject(project) {
    return getSchema().validateProject(project);
  }

  function fenceLength(value) {
    let longest = 0;
    const runs = String(value).match(/`+/g) || [];
    runs.forEach(function (run) { longest = Math.max(longest, run.length); });
    return Math.max(3, longest + 1);
  }

  function fence(language, value) {
    const text = String(value);
    const marker = "`".repeat(fenceLength(text));
    return marker + language + "\n" + text + (text.endsWith("\n") ? "" : "\n") + marker;
  }

  function textFence(value) {
    return fence("text trailing-newline=" + (String(value).endsWith("\n") ? "1" : "0"), value);
  }

  function jsonFence(language, value) {
    return fence(language, JSON.stringify(value, null, 2));
  }

  function exportMarkdown(projectInput) {
    const project = validateProject(projectInput);
    const screenplay = project.screenplay || { subject: "", outline: "", format: "tw", scenes: [] };
    const lines = [
      TITLE,
      "",
      jsonFence("kino-screenplay-meta", {
        version: VERSION,
        projectId: project.projectId,
        format: screenplay.format
      }),
      "",
      "## Subject",
      "",
      textFence(screenplay.subject),
      "",
      "## Outline",
      "",
      textFence(screenplay.outline),
      "",
      "## Scenes"
    ];
    screenplay.scenes.forEach(function (scene, sceneIndex) {
      lines.push(
        "",
        "## Scene " + (sceneIndex + 1),
        "",
        jsonFence("kino-screenplay-scene", {
          id: scene.id,
          sceneId: scene.sceneId,
          location: scene.location,
          time: scene.time,
          people: scene.people,
          interiorExterior: scene.interiorExterior
        })
      );
      scene.blocks.forEach(function (block) {
        const labels = { action: "Action", dialogue: "Dialogue", text: "Text" };
        lines.push(
          "",
          "### " + labels[block.type],
          "",
          jsonFence("kino-screenplay-block", { id: block.id, type: block.type, character: block.character }),
          "",
          textFence(block.text)
        );
      });
    });
    return lines.join("\n") + "\n";
  }

  function normalizedLine(line) {
    return line.endsWith("\r") ? line.slice(0, -1) : line;
  }

  function skipBlank(lines, index) {
    while (index < lines.length && normalizedLine(lines[index]).trim() === "") index += 1;
    return index;
  }

  function readFence(lines, start, expectedLanguage, path) {
    const opener = start < lines.length && normalizedLine(lines[start]).match(/^( {0,3})(`{3,})(.*)$/);
    if (!opener) fail("INVALID_SCREENPLAY_MARKDOWN", path + " 缺少 fenced code block。", path);
    const fenceSize = opener[2].length;
    const info = opener[3].trim();
    let trailingNewline = false;
    if (expectedLanguage === "text") {
      const match = info.match(/^text(?: trailing-newline=(0|1))?$/);
      if (!match) fail("INVALID_SCREENPLAY_MARKDOWN", path + " 需要 text code block。", path);
      trailingNewline = match[1] === "1";
    } else if (info !== expectedLanguage) {
      fail("INVALID_SCREENPLAY_MARKDOWN", path + " 需要 " + expectedLanguage + " code block。", path);
    }
    let end = start + 1;
    while (end < lines.length && normalizedLine(lines[end]) !== "`".repeat(fenceSize)) end += 1;
    if (end >= lines.length) fail("INVALID_SCREENPLAY_MARKDOWN", path + " 的 code block 沒有結束標記。", path);
    const body = lines.slice(start + 1, end).join("\n");
    return {
      value: expectedLanguage === "text" && trailingNewline ? body + "\n" : body,
      next: end + 1
    };
  }

  function parseJsonBlock(lines, index, language, path) {
    const block = readFence(lines, index, language, path);
    let value;
    try { value = JSON.parse(block.value); }
    catch (cause) { fail("INVALID_SCREENPLAY_MARKDOWN_JSON", path + " 的 JSON 無效。", path); }
    return { value: value, next: block.next };
  }

  function parseDocument(markdown, options) {
    if (typeof markdown !== "string") fail("INVALID_SCREENPLAY_MARKDOWN", "Markdown 必須是文字。");
    const settings = options || {};
    if (!isRecord(settings.project)) fail("PROJECT_REQUIRED", "匯入 Markdown 需要目前 Project，才能安全檢查場次連結。");
    const project = validateProject(settings.project);
    const lines = markdown.replace(/^\uFEFF/, "").split("\n");
    let index = 0;
    if (normalizedLine(lines[index] || "") !== TITLE) fail("INVALID_SCREENPLAY_MARKDOWN", "不是 KINO Storyboard Screenplay Markdown。");
    index = skipBlank(lines, index + 1);
    const header = parseJsonBlock(lines, index, "kino-screenplay-meta", "metadata");
    index = skipBlank(lines, header.next);
    const meta = header.value;
    exactKeys(meta, ["version", "projectId", "format"], "metadata");
    if (meta.version !== VERSION) fail("UNSUPPORTED_SCREENPLAY_MARKDOWN_VERSION", "不支援此 screenplay Markdown 版本。", "metadata.version");
    if (meta.projectId !== null && (typeof meta.projectId !== "string" || !meta.projectId.trim())) {
      fail("INVALID_SCREENPLAY_MARKDOWN", "metadata.projectId 必須是 Project ID 或 null。", "metadata.projectId");
    }
    if (meta.format !== "tw" && meta.format !== "us") fail("INVALID_SCREENPLAY_MARKDOWN", "metadata.format 必須是 tw 或 us。", "metadata.format");

    if (normalizedLine(lines[index] || "") !== "## Subject") fail("INVALID_SCREENPLAY_MARKDOWN", "缺少 Subject 區段。", "subject");
    const subject = readFence(lines, skipBlank(lines, index + 1), "text", "subject");
    index = skipBlank(lines, subject.next);
    if (normalizedLine(lines[index] || "") !== "## Outline") fail("INVALID_SCREENPLAY_MARKDOWN", "缺少 Outline 區段。", "outline");
    const outline = readFence(lines, skipBlank(lines, index + 1), "text", "outline");
    index = skipBlank(lines, outline.next);
    if (normalizedLine(lines[index] || "") !== "## Scenes") fail("INVALID_SCREENPLAY_MARKDOWN", "缺少 Scenes 區段。", "scenes");
    index = skipBlank(lines, index + 1);

    const scenes = [];
    while (index < lines.length) {
      index = skipBlank(lines, index);
      if (index >= lines.length) break;
      if (!/^## Scene [1-9]\d*$/.test(normalizedLine(lines[index]))) {
        fail("INVALID_SCREENPLAY_MARKDOWN", "場次區段標題格式無效。", "scenes[" + scenes.length + "]");
      }
      index = skipBlank(lines, index + 1);
      const sceneMetadata = parseJsonBlock(lines, index, "kino-screenplay-scene", "scenes[" + scenes.length + "].metadata");
      index = skipBlank(lines, sceneMetadata.next);
      const scene = sceneMetadata.value;
      exactKeys(scene, ["id", "sceneId", "location", "time", "people", "interiorExterior"], "scenes[" + scenes.length + "].metadata");
      if (typeof scene.id !== "string" || (scene.sceneId !== null && typeof scene.sceneId !== "string")) {
        fail("INVALID_SCREENPLAY_MARKDOWN", "場次 id 與 sceneId 格式無效。", "scenes[" + scenes.length + "]");
      }
      ["location", "time", "people", "interiorExterior"].forEach(function (field) {
        if (typeof scene[field] !== "string") fail("INVALID_SCREENPLAY_MARKDOWN", "場次 " + field + " 必須是文字。", "scenes[" + scenes.length + "]." + field);
      });
      scene.blocks = [];
      while (index < lines.length) {
        index = skipBlank(lines, index);
        if (index >= lines.length || /^## Scene [1-9]\d*$/.test(normalizedLine(lines[index]))) break;
        const heading = normalizedLine(lines[index]).match(/^### (Action|Dialogue|Text)$/);
        if (!heading) fail("INVALID_SCREENPLAY_MARKDOWN", "劇本區塊標題格式無效。", "scenes[" + scenes.length + "].blocks");
        const headingType = { Action: "action", Dialogue: "dialogue", Text: "text" }[heading[1]];
        index = skipBlank(lines, index + 1);
        const blockMetadata = parseJsonBlock(lines, index, "kino-screenplay-block", "scenes[" + scenes.length + "].blocks[" + scene.blocks.length + "].metadata");
        index = skipBlank(lines, blockMetadata.next);
        const block = blockMetadata.value;
        exactKeys(block, ["id", "type", "character"], "scenes[" + scenes.length + "].blocks[" + scene.blocks.length + "].metadata");
        if (typeof block.id !== "string" || typeof block.character !== "string" ||
            !["action", "dialogue", "text"].includes(block.type) || block.type !== headingType) {
          fail("INVALID_SCREENPLAY_MARKDOWN", "區塊 metadata 與標題不一致。", "scenes[" + scenes.length + "].blocks[" + scene.blocks.length + "]");
        }
        const text = readFence(lines, index, "text", "scenes[" + scenes.length + "].blocks[" + scene.blocks.length + "].text");
        scene.blocks.push({ id: block.id, type: block.type, character: block.character, text: text.value });
        index = text.next;
      }
      scenes.push(scene);
    }

    const screenplay = {
      subject: subject.value,
      outline: outline.value,
      format: meta.format,
      scenes: scenes
    };
    const foreignProject = meta.projectId !== project.projectId;
    const linksUnlinked = foreignProject && scenes.some(function (scene) { return scene.sceneId !== null; });
    if (foreignProject) scenes.forEach(function (scene) {
      scene.sceneId = null;
      scene.id = "";
      scene.blocks.forEach(function (block) { block.id = ""; });
    });
    if (typeof settings.makeId === "function") {
      screenplay.scenes.forEach(function (scene) {
        if (!scene.id) scene.id = settings.makeId("screenplayScene");
        scene.blocks.forEach(function (block) {
          if (!block.id) block.id = settings.makeId("screenplayBlock");
        });
      });
    } else if (screenplay.scenes.some(function (scene) {
      return !scene.id || scene.blocks.some(function (block) { return !block.id; });
    })) {
      fail("ID_FACTORY_REQUIRED", "匯入新增場次或區塊需要 makeId(kind) 產生穩定 ID。");
    }
    const candidate = Object.assign({}, project, { screenplay: screenplay });
    return {
      screenplay: validateProject(candidate).screenplay,
      sourceProjectId: meta.projectId,
      linksUnlinked: linksUnlinked
    };
  }

  function parseScreenplay(markdown, options) { return parseDocument(markdown, options).screenplay; }

  function parseWithInfo(markdown, options) { return parseDocument(markdown, options); }

  function conversionPrompt(projectInput) {
    const project = projectInput == null ? null : validateProject(projectInput);
    const screenplay = project && project.screenplay;
    const context = {
      version: VERSION,
      projectId: project ? project.projectId : null,
      format: screenplay ? screenplay.format : "tw",
      availableScenes: project ? project.scenes.map(function (scene) { return { id: scene.id, title: scene.title }; }) : []
    };
    return [
      "請將接下來提供的文字整理成 KINO Storyboard Screenplay Markdown v1。",
      "只輸出 Markdown，不要加說明、HTML 或其他格式。保留原文用字、人物、事件與所有換行；可整理段落，但不要改寫內容。",
      "輸出主旨與大綱兩個 text code fence，再按順序輸出 screenplay scenes。每個場次要有 metadata JSON fence，並用 action、dialogue 或 text 區塊；dialogue 的角色只放 character，text 只放台詞內容，不要把角色前綴重複放進 text。",
      "新場次與區塊的 id 填空字串；匯入器會建立穩定 ID。sceneId 只能是 null，或是下方清單中的精確 ID；不可猜測、改寫或新造 Scene ID。只有來源明確指定連結時才填該 ID，否則填 null。不要新增或修改任何 Shot。",
      "metadata JSON 的 key、版本和區塊型別必須照範本保留。所有自由文字放在 text code fence，保留多行內容；若正文含反引號 fence，改用比正文內最長反引號串更長的 fence。JSON 字串不可用來取代場次或區塊正文。",
      "目前專案與可用場次：",
      jsonFence("json", context),
      "請依這個結構輸出（替換範例內容，不要照抄空白佔位文字）：",
      TITLE,
      "",
      jsonFence("kino-screenplay-meta", { version: VERSION, projectId: context.projectId, format: context.format }),
      "",
      "## Subject",
      "",
      textFence("主旨內容"),
      "",
      "## Outline",
      "",
      textFence("大綱內容"),
      "",
      "## Scenes",
      "",
      "## Scene 1",
      "",
      jsonFence("kino-screenplay-scene", { id: "", sceneId: null, location: "地點", time: "時間", people: "人物", interiorExterior: "INT." }),
      "",
      "### Action",
      "",
      jsonFence("kino-screenplay-block", { id: "", type: "action", character: "" }),
      "",
      textFence("動作內容")
    ].join("\n");
  }

  return Object.freeze({
    VERSION: VERSION,
    ScreenplayMarkdownError: ScreenplayMarkdownError,
    export: exportMarkdown,
    parse: parseScreenplay,
    parseWithInfo: parseWithInfo,
    conversionPrompt: conversionPrompt
  });
});
