"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const schema = require("../dist/project-schema.js");
const migrations = require("../dist/project-migrations.js");
const markdown = require("../dist/screenplay-markdown.js");

function makeProject(projectId, sceneId) {
  return migrations.migrateLegacyProject({
    revision: 0,
    title: "Markdown test",
    aspectRatio: "16:9",
    chapters: [{ id: sceneId || "board-scene-1", title: "Opening" }],
    shots: [],
    days: [],
    entries: []
  }, {
    projectId: projectId || "project-markdown-test",
    now: function () { return "2026-11-14T00:00:00.000Z"; }
  }).project;
}

function screenplay() {
  return {
    subject: "A first line\nA second line\n\n",
    outline: "Keep literal `ticks`, HTML-shaped text </script>, and \r\nline endings.",
    format: "us",
    scenes: [{
      id: "draft-scene-1",
      sceneId: "board-scene-1",
      location: "Cafe\nBack room",
      time: "Night",
      people: "Lin, Mei",
      interiorExterior: "INT.",
      blocks: [
        { id: "draft-block-1", type: "action", character: "", text: "Rain begins.\n\n  Two spaces stay.\n````\nThe fence is longer than four ticks." },
        { id: "draft-block-2", type: "dialogue", character: "MEI", text: "You came back.\n" },
        { id: "draft-block-3", type: "text", character: "", text: "-->" }
      ]
    }, {
      id: "draft-scene-2",
      sceneId: null,
      location: "",
      time: "",
      people: "",
      interiorExterior: "",
      blocks: []
    }]
  };
}

function makeIdFactory() {
  let id = 0;
  return function (kind) { id += 1; return "imported-" + kind + "-" + id; };
}

test("Markdown v1 preserves multiline fields, block text, tags, and safe Scene links", () => {
  const project = makeProject();
  project.screenplay = screenplay();
  const serialized = markdown.export(project);
  const restored = markdown.parse(serialized, { project: project, makeId: makeIdFactory() });

  assert.deepEqual(restored, project.screenplay);
  assert.match(serialized, /kino-screenplay-meta/);
  assert.match(serialized, /kino-screenplay-scene/);
  assert.match(serialized, /kino-screenplay-block/);
});

test("Markdown rejects unknown and malformed same-project links, but unlinks foreign-project links", () => {
  const source = makeProject();
  source.screenplay = screenplay();
  const serialized = markdown.export(source);
  const futureVersion = serialized.replace('"version": 1', '"version": 2');
  assert.throws(() => markdown.parse(futureVersion, { project: source, makeId: makeIdFactory() }), {
    code: "UNSUPPORTED_SCREENPLAY_MARKDOWN_VERSION"
  });

  const unknownSceneMarkdown = serialized.replace('"sceneId": "board-scene-1"', '"sceneId": "not-in-this-project"');
  assert.throws(() => markdown.parse(unknownSceneMarkdown, { project: source, makeId: makeIdFactory() }), {
    code: "ORPHAN_SCREENPLAY_SCENE_REFERENCE"
  });

  const otherProject = makeProject("another-project", "another-scene");
  const foreignImport = markdown.parseWithInfo(serialized, { project: otherProject, makeId: makeIdFactory() });
  assert.equal(foreignImport.sourceProjectId, source.projectId);
  assert.equal(foreignImport.linksUnlinked, true);
  assert.ok(foreignImport.screenplay.scenes.every((scene) => scene.sceneId === null));
  assert.notEqual(foreignImport.screenplay.scenes[0].id, source.screenplay.scenes[0].id);
  assert.notEqual(foreignImport.screenplay.scenes[0].blocks[0].id, source.screenplay.scenes[0].blocks[0].id);
  assert.equal(foreignImport.screenplay.subject, source.screenplay.subject);
});

test("AI-converted empty IDs receive fresh IDs and unlinked drafts stay unlinked", () => {
  const project = makeProject();
  const doc = {
    subject: "Subject",
    outline: "Outline",
    format: "tw",
    scenes: [{
      id: "",
      sceneId: null,
      location: "Pool",
      time: "Day",
      people: "A",
      interiorExterior: "EXT.",
      blocks: [{ id: "", type: "dialogue", character: "A", text: "Line one\nLine two" }]
    }]
  };
  const serialized = markdown.export(Object.assign({}, project, { screenplay: Object.assign({}, doc, {
    scenes: doc.scenes.map((scene) => Object.assign({}, scene, { id: "draft-scene-placeholder", blocks: scene.blocks.map((block) => Object.assign({}, block, { id: "draft-block-placeholder" })) }))
  }) }));
  const editable = serialized
    .replace('"id": "draft-scene-placeholder"', '"id": ""')
    .replace('"id": "draft-block-placeholder"', '"id": ""');
  const restored = markdown.parse(editable, { project: project, makeId: makeIdFactory() });

  assert.equal(restored.scenes[0].sceneId, null);
  assert.equal(restored.scenes[0].id, "imported-screenplayScene-1");
  assert.equal(restored.scenes[0].blocks[0].id, "imported-screenplayBlock-2");
  assert.equal(restored.scenes[0].blocks[0].text, "Line one\nLine two");
});

test("conversion prompt supplies the current safe Scene IDs and Markdown structure", () => {
  const project = makeProject();
  const prompt = markdown.conversionPrompt(project);

  assert.match(prompt, /board-scene-1/);
  assert.match(prompt, /不可猜測、改寫或新造 Scene ID/);
  assert.match(prompt, /kino-screenplay-meta/);
  assert.match(prompt, /kino-screenplay-block/);
});
