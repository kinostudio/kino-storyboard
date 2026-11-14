"use strict";

// Exercises the same writing-to-delivery workflow locally and on a released site.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const browserPath = (process.env.PLAYWRIGHT_EXECUTABLE_PATH || chromium.executablePath());
const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\//, "") || "index.html";
  const file = path.resolve(dist, relative);
  if (file !== dist && !file.startsWith(dist + path.sep)) return response.writeHead(403).end();
  fs.readFile(file, (error, bytes) => {
    if (error) return response.writeHead(404).end();
    const ext = path.extname(file);
    response.setHeader("Content-Type", ext === ".css" ? "text/css" : ext === ".html" ? "text/html" : ext === ".svg" ? "image/svg+xml" : "text/javascript");
    response.setHeader("Cache-Control", "no-store");
    response.end(bytes);
  });
});


async function main() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({headless: true, executablePath: browserPath});
  try {
    const page = await browser.newPage({viewport: {width: 1180, height: 820}});
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(process.env.KINO_QA_URL || "http://127.0.0.1:" + server.address().port);
    await page.getByRole("button", {name:"新建專案", exact:true}).click();
    await page.locator("#view-storyboard.is-active").waitFor();
    const navigate = async view => { await page.locator(".workspace-tab[data-view=" + view + "]").click(); };
    await navigate("screenplay");
    const subject = page.locator("[data-screenplay-field=subject]");
    await subject.fill("泳池開場主旨");
    await page.locator("[data-screenplay-action=add-scene]").click();
    const body = page.locator("[data-screenplay-writing-surface]").first();
    await body.fill("/a 小安停在池邊");
    await page.waitForFunction(() => StoryModel.getScreenplay()?.scenes[0]?.blocks[0]?.type === "action" && StoryModel.getScreenplay().scenes[0].blocks[0].text === "小安停在池邊");
    await page.locator("[data-screenplay-action=add-scene]").click();
    await page.waitForFunction(() => StoryModel.getScreenplay()?.scenes.length === 2);
    const secondDraftId = await page.locator("[data-screenplay-scene-card]").nth(1).getAttribute("data-screenplay-scene-card");
    const secondCard = page.locator('[data-screenplay-scene-card="' + secondDraftId + '"]');
    const secondBody = secondCard.locator("[data-screenplay-writing-surface]");
    await secondBody.fill("前段 李：你好");
    await secondBody.press("End");
    await secondBody.press("Enter");
    await secondBody.pressSequentially("再見 中 王:早安 後段");
    const selectBodyText = async (surface, selectedText) => surface.evaluate((element, needle) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let text = "";
      while (walker.nextNode()) {
        const node = walker.currentNode;
        nodes.push({node, start: text.length, end: text.length + node.nodeValue.length});
        text += node.nodeValue;
      }
      const start = text.indexOf(needle);
      if (start < 0) throw new Error("找不到要測試的劇本文字：" + needle);
      const point = offset => {
        const item = nodes.find(part => offset >= part.start && offset <= part.end);
        if (!item) throw new Error("劇本選取位置不在文字節點中");
        return {node:item.node, offset:offset-item.start};
      };
      const range = document.createRange();
      const from = point(start);
      const to = point(start + needle.length);
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }, selectedText);
    await selectBodyText(secondBody, "李：你好\n再見");
    await secondCard.locator("button[data-tag-type=dialogue]").click();
    await page.waitForFunction(() => {
      const blocks = StoryModel.getScreenplay()?.scenes[1]?.blocks || [];
      return blocks.some(block => block.type === "dialogue" && block.character === "李" && block.text === "你好\n再見");
    });
    await selectBodyText(secondBody, "王:早安");
    await secondCard.locator("button[data-tag-type=dialogue]").click();
    await page.waitForFunction(() => {
      const blocks = StoryModel.getScreenplay()?.scenes[1]?.blocks || [];
      return blocks.some(block => block.type === "dialogue" && block.character === "王" && block.text === "早安");
    });
    await secondBody.scrollIntoViewIfNeeded();
    fs.mkdirSync(path.join(root, "tmp", "screenplay-qa"), {recursive:true});
    await page.screenshot({path:path.join(root, "tmp", "screenplay-qa", "editor.png")});
    await body.press("Control+Enter");
    await page.waitForFunction(() => {
      const scenes = StoryModel.getScreenplay().scenes;
      return scenes.length === 3 && document.activeElement?.dataset.screenplaySceneId === scenes[1].id && scenes[1].id !== scenes[2].id;
    });
    await secondBody.press("Control+Enter");
    await page.waitForFunction(id => {
      const scenes = StoryModel.getScreenplay().scenes;
      return scenes.length === 4 && scenes[2].id === id && document.activeElement?.dataset.screenplaySceneId === scenes[3].id;
    }, secondDraftId);
    const sceneId = await page.evaluate(() => StoryModel.getProject().scenes[0].id);
    await page.locator("select[data-screenplay-field=sceneId]").first().selectOption(sceneId);
    await page.locator("button[data-screenplay-format=us]").click();
    await page.locator("button[data-screenplay-format=tw]").click();
    await navigate("storyboard");
    await page.locator("#chapter-list [data-chapter=" + JSON.stringify(sceneId) + "]").click();
    await page.locator("#screenplay-compare-toggle").click();
    await page.locator("#screenplay-compare-host").getByText("小安停在池邊", {exact:true}).waitFor();
    await page.locator("#screenplay-compare-toggle").click();
    const copyId = await page.evaluate(async () => {
      const model = window.StoryModel;
      const doc = model.getScreenplay();
      if (doc.subject !== "泳池開場主旨" || !doc.scenes.some(scene => scene.blocks.some(block => block.text.includes("小安停在池邊")))) throw Error("離開編輯頁後原文不符");
      const data = await model.exportCompletePackage();
      return (await model.importCompletePackage(data.archiveBytes, {mode:"copy"})).projectId;
    });
    await page.evaluate(id => StoryModel.selectProject(id), copyId);
    await navigate("screenplay");
    await body.fill("還原後繼續撰寫");
    await navigate("output");
    await page.selectOption("#output-type", "screenplay");
    await page.waitForFunction(() => document.querySelector("#print-document")?.innerText.includes("還原後繼續撰寫"));
    const text = await page.locator("#print-document").innerText();
    assert.equal(text.split("還原後繼續撰寫").length - 1, 1);
    await page.screenshot({path:path.join(root, "tmp", "screenplay-qa", "restored-output.png")});
    await require("./screenplay-md-ui.cjs")(page);
    assert.deepEqual(errors, []);
    console.log("PASS default storyboard, screenplay writing, format switch, ZIP restore, editing and output.");
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
