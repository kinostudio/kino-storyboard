"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const schema = require("../dist/project-schema.js");
const migrations = require("../dist/project-migrations.js");
const projectPackage = require("../dist/project-package.js");
const packageCopy = require("../dist/package-copy.js");
const zipAdapter = require("../dist/zip-adapter.js");

function makeProject() {
  return migrations.migrateLegacyProject({
    revision: 0,
    title: "Screenplay test",
    aspectRatio: "16:9",
    chapters: [{ id: "board-scene-1", title: "Coffee shop" }],
    shots: [{
      id: "board-shot-1",
      chapterId: "board-scene-1",
      no: "1",
      title: "Wide shot",
      visual: "Rain on the cafe window.",
      script: "",
      sound: "Rain",
      move: "Static",
      tags: "",
      duration: 3
    }],
    days: [],
    entries: []
  }, {
    projectId: "project-screenplay-test",
    now: function () { return "2026-11-14T00:00:00.000Z"; }
  }).project;
}

function screenplay() {
  return {
    subject: "A late-night reunion",
    outline: "They return to the place where they first met.",
    format: "tw",
    scenes: [
      {
        id: "draft-scene-1",
        sceneId: "board-scene-1",
        location: "Coffee shop",
        time: "Night",
        people: "Lin, Mei",
        interiorExterior: "INT.",
        blocks: [
          { id: "screenplay-block-1", type: "action", character: "", text: "Rain taps against the window." },
          { id: "screenplay-block-2", type: "dialogue", character: "MEI", text: "You came back." }
        ]
      },
      {
        id: "draft-scene-2",
        sceneId: null,
        location: "Unassigned",
        time: "",
        people: "",
        interiorExterior: "",
        blocks: [{ id: "screenplay-block-3", type: "text", character: "", text: "A separate draft scene." }]
      }
    ]
  };
}

function packageOptions() {
  return { schema: schema, zipAdapter: zipAdapter, crypto: webcrypto };
}

test("screenplay is optional and validates the declared fields and stable IDs", () => {
  const project = makeProject();
  assert.equal(Object.prototype.hasOwnProperty.call(schema.validateProject(project), "screenplay"), false);

  const withScreenplay = Object.assign({}, project, { screenplay: screenplay() });
  assert.deepEqual(schema.validateProject(withScreenplay).screenplay, withScreenplay.screenplay);
});

test("screenplay links are one-to-one and block types are checked", () => {
  const project = makeProject();
  const linkedTwice = screenplay();
  linkedTwice.scenes[1].sceneId = "board-scene-1";
  assert.throws(() => schema.validateProject(Object.assign({}, project, { screenplay: linkedTwice })), {
    code: "DUPLICATE_SCREENPLAY_SCENE_LINK"
  });

  const missingScene = screenplay();
  missingScene.scenes[0].sceneId = "missing-scene";
  assert.throws(() => schema.validateProject(Object.assign({}, project, { screenplay: missingScene })), {
    code: "ORPHAN_SCREENPLAY_SCENE_REFERENCE"
  });

  const invalidBlock = screenplay();
  invalidBlock.scenes[0].blocks[0].type = "transition";
  assert.throws(() => schema.validateProject(Object.assign({}, project, { screenplay: invalidBlock })), {
    code: "INVALID_SCREENPLAY_BLOCK_TYPE"
  });
});

test("removing a linked draft scene preserves its storyboard Scene", () => {
  const project = makeProject();
  project.screenplay = screenplay();
  const edited = Object.assign({}, project, {
    screenplay: Object.assign({}, project.screenplay, { scenes: project.screenplay.scenes.slice(1) })
  });
  const saved = schema.validateProject(edited);

  assert.equal(saved.screenplay.scenes.length, 1);
  assert.deepEqual(saved.scenes, project.scenes);
  assert.deepEqual(saved.shots, project.shots);
});

test("ZIP round trip preserves screenplay and copy remaps its IDs and Scene links", async () => {
  const project = makeProject();
  project.screenplay = screenplay();
  const options = packageOptions();
  const archive = await projectPackage.exportProjectPackage(project, [], options);
  const restored = await projectPackage.parseProjectPackage(archive.archiveBytes, options);
  assert.deepEqual(restored.project.screenplay, project.screenplay);
  assert.deepEqual(restored.project.shots, project.shots);

  let nextId = 0;
  const copy = packageCopy.createProjectCopy(restored, {
    schema: schema,
    newId: function (kind) { nextId += 1; return "copy-" + kind + "-" + nextId; }
  });
  const sourceLinked = project.screenplay.scenes[0];
  const copiedLinked = copy.project.screenplay.scenes[0];
  const copiedUnlinked = copy.project.screenplay.scenes[1];
  assert.notEqual(copiedLinked.id, sourceLinked.id);
  assert.notEqual(copiedLinked.blocks[0].id, sourceLinked.blocks[0].id);
  assert.equal(copiedLinked.sceneId, copy.project.scenes[0].id);
  assert.notEqual(copiedLinked.sceneId, sourceLinked.sceneId);
  assert.equal(copiedUnlinked.sceneId, null);
  assert.notEqual(copy.project.shots[0].id, project.shots[0].id);
  assert.equal(copy.project.shots[0].sceneId, copy.project.scenes[0].id);
  assert.equal(copy.project.shots[0].visual, project.shots[0].visual);
  assert.equal(copy.project.shots[0].script, project.shots[0].script);
});

test("older ZIP packages without screenplay remain importable and copy without it", async () => {
  const project = makeProject();
  const options = packageOptions();
  const archive = await projectPackage.exportProjectPackage(project, [], options);
  const restored = await projectPackage.parseProjectPackage(archive.archiveBytes, options);
  assert.equal(Object.prototype.hasOwnProperty.call(restored.project, "screenplay"), false);

  let nextId = 0;
  const copy = packageCopy.createProjectCopy(restored, {
    schema: schema,
    newId: function (kind) { nextId += 1; return "legacy-copy-" + kind + "-" + nextId; }
  });
  assert.equal(Object.prototype.hasOwnProperty.call(copy.project, "screenplay"), false);
});
