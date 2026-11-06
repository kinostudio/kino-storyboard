(function attachKinoShotIndex(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.KinoShotIndex = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createKinoShotIndex() {
  "use strict";

  function create(chapters, shots) {
    const chapterRows = Array.isArray(chapters) ? chapters : [];
    const shotRows = Array.isArray(shots) ? shots : [];
    const chapterNumbers = new Map();
    const shotsByChapter = new Map();
    const shotsById = new Map();
    const shotPositionsById = new Map();
    const globalPositionsById = new Map();

    chapterRows.forEach(function (chapter, index) {
      if (!chapter || chapter.id == null) return;
      chapterNumbers.set(chapter.id, index + 1);
      shotsByChapter.set(chapter.id, []);
    });
    shotRows.forEach(function (shot, index) {
      if (!shot || shot.id == null) return;
      const group = shotsByChapter.get(shot.chapterId) || [];
      if (!shotsByChapter.has(shot.chapterId)) shotsByChapter.set(shot.chapterId, group);
      group.push(shot);
      shotsById.set(shot.id, shot);
      shotPositionsById.set(shot.id, group.length);
      globalPositionsById.set(shot.id, index);
    });

    let cachedSearchQuery = null;
    let cachedSearchMatcher = null;
    let cachedSearch = null;

    function titleMatches(query) {
      const normalized = String(query == null ? "" : query).trim().toLocaleLowerCase();
      const matches = new Set();
      if (!normalized) return matches;
      chapterRows.forEach(function (chapter) {
        if (chapter && chapter.id != null && String(chapter.title || "").toLocaleLowerCase().includes(normalized)) {
          matches.add(chapter.id);
        }
      });
      return matches;
    }

    function search(query, matchesShot) {
      const normalized = String(query == null ? "" : query).trim().toLocaleLowerCase();
      if (cachedSearch && normalized === cachedSearchQuery && matchesShot === cachedSearchMatcher) return cachedSearch;

      const titleMatchedChapterIds = titleMatches(normalized);
      const matchingCountsByChapter = new Map();
      shotsByChapter.forEach(function (_group, chapterId) { matchingCountsByChapter.set(chapterId, 0); });
      const matchedChapterIds = new Set(titleMatchedChapterIds);
      const matchingShots = normalized ? [] : shotRows;
      let matchingCount = 0;

      if (!normalized) {
        shotsByChapter.forEach(function (group, chapterId) { matchingCountsByChapter.set(chapterId, group.length); });
        chapterNumbers.forEach(function (_number, chapterId) { matchedChapterIds.add(chapterId); });
        matchingCount = shotRows.length;
      } else {
        shotRows.forEach(function (shot) {
          if (!shot || shot.id == null) return;
          const chapterId = shot.chapterId;
          if (!titleMatchedChapterIds.has(chapterId) && !(typeof matchesShot === "function" && matchesShot(shot, normalized))) return;
          matchingShots.push(shot);
          matchingCount += 1;
          if (matchingCountsByChapter.has(chapterId)) {
            matchingCountsByChapter.set(chapterId, matchingCountsByChapter.get(chapterId) + 1);
          }
          matchedChapterIds.add(chapterId);
        });
      }

      cachedSearchQuery = normalized;
      cachedSearchMatcher = matchesShot;
      cachedSearch = Object.freeze({
        query: normalized,
        titleMatchedChapterIds: titleMatchedChapterIds,
        matchedChapterIds: matchedChapterIds,
        matchingCountsByChapter: matchingCountsByChapter,
        matchingCount: matchingCount,
        matchingShots: matchingShots
      });
      return cachedSearch;
    }

    return Object.freeze({
      chapterNumbers: chapterNumbers,
      shotsByChapter: shotsByChapter,
      shotsById: shotsById,
      shotPositionsById: shotPositionsById,
      globalPositionsById: globalPositionsById,
      titleMatches: titleMatches,
      search: search
    });
  }

  return Object.freeze({ create: create });
});
