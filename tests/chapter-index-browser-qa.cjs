"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const dist = path.resolve(__dirname, "../dist");
const browserPath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || chromium.executablePath();
const contentTypes = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml" };

async function main() {
  assert.ok(fs.existsSync(browserPath), "Pinned Chromium executable is missing.");
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(dist, relative);
    if (file !== dist && !file.startsWith(dist + path.sep)) return response.writeHead(403).end();
    fs.readFile(file, (error, bytes) => {
      if (error) return response.writeHead(404).end();
      response.setHeader("Content-Type", contentTypes[path.extname(file)] || "application/octet-stream");
      response.setHeader("Cache-Control", "no-store");
      response.end(bytes);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: browserPath });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    await page.locator("#lifecycle-project-title").waitFor({ state: "visible" });
    await page.locator("#lifecycle-project-title").fill("Chapter Index QA");
    await page.locator('#lifecycle-create-form button[name="createKind"][value="blank"]').click();
    await page.locator("body.project-ready").waitFor({ state: "attached" });

    const ids = await page.evaluate(async () => {
      const model = window.StoryModel;
      const pool = await model.addScene("Pool");
      const street = await model.addScene("Street");
      const first = await model.addShot(pool, { title: "Pool opener", visual: "Wide shot" });
      await model.addShot(pool, { title: "Water detail", visual: "Ripples" });
      const third = await model.addShot(street, { title: "Street reflection", visual: "Pool reflection" });
      return { pool, street, first, third };
    });

    await page.locator("#chapter-search").fill("pool");
    await page.waitForFunction(({ pool, street }) => {
      const quantity = (id) => document.querySelector('#chapter-list [data-chapter="' + id + '"] .chapter-quantity')?.textContent;
      return quantity("all") === "3" && quantity(pool) === "2" && quantity(street) === "1";
    }, ids);
    const counts = await page.evaluate(({ pool, street }) => ({
      all: document.querySelector('#chapter-list [data-chapter="all"] .chapter-quantity').textContent,
      pool: document.querySelector('#chapter-list [data-chapter="' + pool + '"] .chapter-quantity').textContent,
      street: document.querySelector('#chapter-list [data-chapter="' + street + '"] .chapter-quantity').textContent,
      visible: document.querySelectorAll('#shot-list .shot-card[data-shot]:not([hidden])').length
    }), ids);
    assert.deepEqual(counts, { all: "3", pool: "2", street: "1", visible: 3 });

    await page.locator('#chapter-list [data-chapter="' + ids.street + '"]').click();
    const streetChapterNumber = await page.locator('#chapter-list [data-chapter="' + ids.street + '"] .chapter-number').textContent();
    const streetNumbers = await page.locator('#shot-list .shot-card[data-shot="' + ids.third + '"] .number-value').allTextContents();
    assert.deepEqual(streetNumbers, [streetChapterNumber, "1"], "chapter and shot numbers use the same indexed ordering");

    await page.locator('[data-voiceover-action="open"]').click();
    const transcriptCounts = await page.locator("#voiceover-transcript .voiceover-chapter").evaluateAll((chapters) => chapters.map((chapter) => chapter.querySelectorAll(".voiceover-entry").length));
    assert.deepEqual(transcriptCounts, [2, 1], "transcript uses indexed per-chapter rows");
    assert.deepEqual(pageErrors, [], "application emitted no browser errors");
    console.log(JSON.stringify({ result: "passed", counts, streetNumbers, transcriptCounts }));
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
