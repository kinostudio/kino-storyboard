"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create } = require("../dist/shot-index.js");

test("shot index groups once and preserves chapter, local, and global order", () => {
  const chapters = [{ id: "a", title: "Pool" }, { id: "b", title: "Street" }];
  const shots = [
    { id: "a1", chapterId: "a" },
    { id: "b1", chapterId: "b" },
    { id: "a2", chapterId: "a" }
  ];
  const index = create(chapters, shots);

  assert.deepEqual(index.shotsByChapter.get("a").map((shot) => shot.id), ["a1", "a2"]);
  assert.deepEqual(index.shotsByChapter.get("b").map((shot) => shot.id), ["b1"]);
  assert.equal(index.chapterNumbers.get("b"), 2);
  assert.equal(index.shotPositionsById.get("a2"), 2);
  assert.equal(index.shotPositionsById.get("b1"), 1);
  assert.equal(index.globalPositionsById.get("a2"), 2);
  assert.equal(index.shotsById.get("b1"), shots[1]);
});

test("search counts title matches, scans only once, and reuses same-query results", () => {
  const chapters = [{ id: "a", title: "Pool" }, { id: "b", title: "Street" }, { id: "c", title: "Pool inserts" }];
  const shots = [
    { id: "a1", chapterId: "a", text: "no match" },
    { id: "a2", chapterId: "a", text: "no match" },
    { id: "b1", chapterId: "b", text: "pool reflection" },
    { id: "b2", chapterId: "b", text: "no match" }
  ];
  const index = create(chapters, shots);
  let matcherCalls = 0;
  const matchShot = (shot, query) => {
    matcherCalls += 1;
    return shot.text.includes(query);
  };

  const result = index.search("Pool", matchShot);
  assert.equal(result.matchingCount, 3);
  assert.deepEqual(result.matchingShots.map((shot) => shot.id), ["a1", "a2", "b1"]);
  assert.equal(result.matchingCountsByChapter.get("a"), 2);
  assert.equal(result.matchingCountsByChapter.get("b"), 1);
  assert.equal(result.matchingCountsByChapter.get("c"), 0);
  assert.deepEqual(Array.from(result.matchedChapterIds).sort(), ["a", "b", "c"]);
  assert.equal(matcherCalls, 2, "title-matching chapters should not rescan each shot's text");
  assert.strictEqual(index.search("pool", matchShot), result, "same normalized query should reuse its computed counts");
  assert.equal(matcherCalls, 2, "cached queries should not rescan the shot table");
});

test("empty search returns existing rows and grouped counts", () => {
  const chapters = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
  const shots = [{ id: "a1", chapterId: "a" }, { id: "a2", chapterId: "a" }];
  const index = create(chapters, shots);
  let matcherCalls = 0;
  const result = index.search("  ", () => { matcherCalls += 1; return false; });

  assert.strictEqual(result.matchingShots, shots);
  assert.equal(result.matchingCount, 2);
  assert.equal(result.matchingCountsByChapter.get("a"), 2);
  assert.equal(result.matchingCountsByChapter.get("b"), 0);
  assert.equal(matcherCalls, 0);
});
