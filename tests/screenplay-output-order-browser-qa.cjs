"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const browserPath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || chromium.executablePath();
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

async function waitForOutput(page, marker) {
  await page.waitForFunction(value => document.querySelector("#print-document")?.innerText.includes(value) && !document.querySelector("#print-output")?.disabled, marker, {timeout:30000});
}

async function main() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({headless:true, executablePath:browserPath});
  try {
    const page = await browser.newPage({viewport:{width:1600,height:1200}});
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:" + server.address().port);
    await page.getByRole("button", {name:"新建專案", exact:true}).click();
    await page.locator("body.project-ready").waitFor();
    await page.evaluate(async () => {
      const model = window.StoryModel;
      const firstScene = await model.addScene("場次一");
      const secondScene = await model.addScene("場次二");
      const firstShot = await model.addShot(firstScene);
      await model.updateShot(firstShot, {title:"第一場連續鏡", visual:"SHOT-1-A"});
      await model.addSequenceFrame(firstShot, null, {visual:"SHOT-1-B"});
      const nextShot = await model.addShot(firstScene);
      await model.updateShot(nextShot, {title:"第一場第二鏡", visual:"SHOT-1-C"});
      const finalShot = await model.addShot(secondScene);
      await model.updateShot(finalShot, {title:"第二場鏡頭", visual:"SHOT-2-A"});
      await model.saveScreenplay({
        subject:"SUBJECT-ONCE",
        outline:"OUTLINE-ONCE",
        format:"tw",
        scenes:[
          {id:"draft-scene-one", sceneId:firstScene, location:"地點一", time:"日", people:"甲", interiorExterior:"內景", blocks:[{id:"block-one", type:"action", character:"", text:"SCRIPT-SCENE-1"}]},
          {id:"draft-scene-two", sceneId:secondScene, location:"地點二".repeat(450), time:"夜", people:"乙", interiorExterior:"外景", blocks:[{id:"block-two", type:"dialogue", character:"乙", text:"SCRIPT-SCENE-2"}]},
          {id:"draft-unlinked", sceneId:null, location:"未連結地點", time:"", people:"", interiorExterior:"", blocks:[{id:"block-unlinked", type:"text", character:"", text:"SCRIPT-UNLINKED " + "長文描述。".repeat(1200) + " LONG-SCRIPT-END"}]}
        ]
      });
    });

    await page.locator('.rail-button[data-view="output"]').click();
    await page.selectOption("#output-type", "screenplay");
    await waitForOutput(page, "SCRIPT-UNLINKED");
    let text = await page.locator("#print-document").innerText();
    assert.equal(text.split("SUBJECT-ONCE").length - 1, 1);
    assert.equal(text.split("OUTLINE-ONCE").length - 1, 1);
    assert.equal(text.split("LONG-SCRIPT-END").length - 1, 1, "long script text should survive overflow splitting once");
    assert.ok(!text.includes("SHOT-1-A"), "screenplay-only output must not contain storyboard shots");
    const twMarker = await page.locator(".output-screenplay-block.is-tw.is-action").first().evaluate(element => getComputedStyle(element.querySelector("div"), "::before").content);
    assert.equal(twMarker, '"△ "', "Taiwan screenplay action should print its marker");

    await page.evaluate(async () => {
      const screenplay = window.StoryModel.getScreenplay();
      await window.StoryModel.saveScreenplay(Object.assign({},screenplay,{format:"us"}));
    });
    await waitForOutput(page, "SCRIPT-UNLINKED");
    await page.waitForFunction(() => !document.querySelector("#print-output").disabled && document.querySelector("#print-document .output-screenplay-block.is-us.is-action"));
    const usStyles = await page.locator("#print-document .output-screenplay-block.is-us.is-dialogue").first().evaluate(element => ({
      marker:getComputedStyle(element.querySelector("div"),"::before").content,
      characterCount:element.querySelectorAll(".output-screenplay-character").length,
      dialogueIndent:element.getBoundingClientRect().left - element.parentElement.getBoundingClientRect().left
    }));
    assert.notEqual(usStyles.marker, '"△ "', "US screenplay should not show the Taiwan action marker");
    assert.equal(usStyles.characterCount, 1, "US dialogue role should remain separate from its dialogue");
    assert.ok(parseFloat(usStyles.dialogueIndent) > 0, "US dialogue should be indented");

    await page.selectOption("#output-type", "combined");
    await waitForOutput(page, "SHOT-2-A");
    text = await page.locator("#print-document").innerText();
    for (const marker of ["SUBJECT-ONCE","OUTLINE-ONCE"]) assert.equal(text.split(marker).length - 1, 1, marker + " should appear once");
    const ordered = ["SUBJECT-ONCE","OUTLINE-ONCE","SCRIPT-SCENE-1","SHOT-1-A","SHOT-1-B","SHOT-1-C","SCRIPT-SCENE-2","SHOT-2-A","SCRIPT-UNLINKED","LONG-SCRIPT-END"];
    for (const marker of ordered) assert.equal(text.split(marker).length - 1, 1, marker + " must appear exactly once");
    const positions = ordered.map(marker => text.indexOf(marker));
    assert.ok(positions.every(position => position >= 0), "combined output should include every linked/unlinked screenplay entry and every shot frame");
    assert.deepEqual(positions, positions.slice().sort((a,b) => a-b), "each linked scene's screenplay must precede its shots and ABC frames before the next scene");
    assert.deepEqual(errors, []);
    console.log("PASS screenplay-only and combined output: one subject/outline, per-scene script then all shot frames, unlinked screenplay retained");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
