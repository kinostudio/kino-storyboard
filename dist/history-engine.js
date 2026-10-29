(function attachHistoryEngine(root, factory) {
  "use strict";
  const schema = typeof module === "object" && module && module.exports
    ? require("./project-schema.js")
    : root && root.DirectorStoryboardProjectSchema;
  const api = factory(schema);
  if (root) root.DirectorStoryboardHistoryEngine = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHistoryEngine(schema) {
  "use strict";

  const HISTORY_SCHEMA_VERSION = 1;
  const HISTORY_LIMIT = 100;
  const EXCLUDED_PROJECT_FIELDS = Object.freeze(["revision", "updatedAt", "outputPreferences"]);
  const hasOwn = Function.call.bind(Object.prototype.hasOwnProperty);

  class HistoryEngineError extends Error {
    constructor(code, message, cause) {
      super(message || code || "History engine error");
      this.name = "HistoryEngineError";
      this.code = code || "HISTORY_ERROR";
      if (cause !== undefined) this.cause = cause;
    }
  }

  function fail(code, message, cause) {
    throw new HistoryEngineError(code, message, cause);
  }

  function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  // Do not use JSON stringify as the first validation step: it silently drops
  // undefined values and invokes toJSON methods. History rows must be strict JSON.
  function cloneStrictJson(value, path, ancestors) {
    const at = path || "$";
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("HISTORY_NOT_JSON", at + " must contain only finite numbers.");
      return value;
    }
    if (typeof value !== "object") fail("HISTORY_NOT_JSON", at + " must contain only JSON values.");
    if (!Array.isArray(value) && !isRecord(value)) fail("HISTORY_NOT_JSON", at + " must contain plain JSON objects.");
    const seen = ancestors || new Set();
    if (seen.has(value)) fail("HISTORY_NOT_JSON", at + " must not contain circular references.");
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.indexOf("length") < 0) fail("HISTORY_NOT_JSON", at + " must be a dense JSON array.");
      result = new Array(value.length);
      for (let index = 0; index < value.length; index += 1) {
        if (!hasOwn(value, index)) fail("HISTORY_NOT_JSON", at + " must not contain array holes.");
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !hasOwn(descriptor, "value") || !descriptor.enumerable) fail("HISTORY_NOT_JSON", at + " must contain only enumerable data properties.");
        result[index] = cloneStrictJson(descriptor.value, at + "[" + index + "]", seen);
      }
    } else {
      const ownKeys = Reflect.ownKeys(value);
      const enumerableKeys = Object.keys(value);
      if (ownKeys.length !== enumerableKeys.length || ownKeys.some(function (key) { return typeof key !== "string"; })) {
        fail("HISTORY_NOT_JSON", at + " must contain only enumerable string keys.");
      }
      result = {};
      Object.keys(value).forEach(function (key) {
        if (key === "__proto__") fail("HISTORY_UNSAFE_KEY", at + "." + key + " is not safe in a JSON Pointer patch.");
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !hasOwn(descriptor, "value") || !descriptor.enumerable) fail("HISTORY_NOT_JSON", at + "." + key + " must be an enumerable data property.");
        Object.defineProperty(result, key, {
          value: cloneStrictJson(descriptor.value, at + "." + key, seen),
          enumerable: true,
          configurable: true,
          writable: true
        });
      });
    }
    seen.delete(value);
    return result;
  }

  function deepEqual(left, right) {
    if (left === right) return true;
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
      for (let index = 0; index < left.length; index += 1) {
        if (!deepEqual(left[index], right[index])) return false;
      }
      return true;
    }
    if (!isRecord(left) || !isRecord(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      const key = leftKeys[index];
      if (!hasOwn(right, key) || !deepEqual(left[key], right[key])) return false;
    }
    return true;
  }

  function cloneValidatedProject(project) {
    const safe = cloneStrictJson(project, "$project");
    if (!schema || typeof schema.validateProject !== "function") {
      fail("HISTORY_SCHEMA_UNAVAILABLE", "Project schema validation is not available.");
    }
    try {
      return schema.validateProject(safe);
    } catch (error) {
      fail("HISTORY_INVALID_PROJECT", "Project failed canonical schema validation.", error);
    }
  }

  function creativeProjectionFromCanonical(canonical) {
    // canonical is a private clone that has already passed strict JSON and
    // Project schema validation in this call.
    const projection = Object.assign({}, canonical);
    EXCLUDED_PROJECT_FIELDS.forEach(function (field) { delete projection[field]; });
    return projection;
  }

  function creativeProjection(project) {
    return creativeProjectionFromCanonical(cloneValidatedProject(project));
  }

  function encodePointerToken(token) {
    return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
  }

  function pointer(path, token) {
    return path + "/" + encodePointerToken(token);
  }

  function diffValues(before, after, path, patch) {
    if (deepEqual(before, after)) return;
    if (isRecord(before) && isRecord(after)) {
      Object.keys(before).forEach(function (key) {
        if (!hasOwn(after, key)) patch.push({ op: "remove", path: pointer(path, key) });
      });
      Object.keys(after).forEach(function (key) {
        const childPath = pointer(path, key);
        if (!hasOwn(before, key)) patch.push({ op: "add", path: childPath, value: cloneStrictJson(after[key], childPath) });
        else diffValues(before[key], after[key], childPath, patch);
      });
      return;
    }
    // Arrays are replaced as a whole. This is intentionally conservative and
    // keeps stable IDs, order, and nested references reversible in one patch.
    patch.push({ op: "replace", path: path, value: cloneStrictJson(after, path || "$") });
  }

  // Internal callers pass private projections derived from Projects that were
  // strict-cloned and schema-validated in this command. Public makePatch keeps
  // the defensive clones; changed patch payloads still receive strict clones.
  function makePatchFromValidatedJson(from, to) {
    const patch = [];
    diffValues(from, to, "", patch);
    return patch;
  }

  function makePatch(fromValue, toValue) {
    const from = cloneStrictJson(fromValue, "$from");
    const to = cloneStrictJson(toValue, "$to");
    return makePatchFromValidatedJson(from, to);
  }

  function decodePointer(path) {
    if (typeof path !== "string") fail("HISTORY_INVALID_PATCH", "JSON Pointer path must be a string.");
    if (path === "") return [];
    if (path[0] !== "/") fail("HISTORY_INVALID_PATCH", "JSON Pointer path must start with '/'.");
    return path.slice(1).split("/").map(function (token) {
      if (/~(?:[^01]|$)/.test(token)) fail("HISTORY_INVALID_PATCH", "JSON Pointer contains an invalid escape.");
      const decoded = token.replace(/~1/g, "/").replace(/~0/g, "~");
      if (decoded === "__proto__") fail("HISTORY_UNSAFE_KEY", "JSON Pointer cannot access __proto__.");
      return decoded;
    });
  }

  function assertProjectionPatchPath(path) {
    const tokens = decodePointer(path);
    if (tokens.length === 1 && EXCLUDED_PROJECT_FIELDS.indexOf(tokens[0]) >= 0) {
      fail("HISTORY_INVALID_PATCH", "Creative history patches cannot change commit metadata or output preferences.");
    }
    return tokens;
  }

  function validatePatchOperation(operation) {
    if (!isRecord(operation) || typeof operation.op !== "string") fail("HISTORY_INVALID_PATCH", "Patch operation must be an object with an op.");
    const allowed = operation.op === "add" || operation.op === "remove" || operation.op === "replace" || operation.op === "test";
    if (!allowed) fail("HISTORY_UNSUPPORTED_PATCH", "History supports RFC 6902 add, remove, replace, and test operations only.");
    if (typeof operation.path !== "string") fail("HISTORY_INVALID_PATCH", "Patch operation path must be a string.");
    const expectedKeys = operation.op === "remove" ? ["op", "path"] : ["op", "path", "value"];
    if (Object.keys(operation).some(function (key) { return expectedKeys.indexOf(key) < 0; }) ||
        expectedKeys.some(function (key) { return !hasOwn(operation, key); })) {
      fail("HISTORY_INVALID_PATCH", "Patch operation has missing or unexpected fields.");
    }
    if (operation.op !== "remove") cloneStrictJson(operation.value, operation.path || "$root");
    return assertProjectionPatchPath(operation.path);
  }

  function arrayIndex(token, length, allowEnd) {
    if (!/^(0|[1-9]\d*)$/.test(token)) fail("HISTORY_INVALID_PATCH", "Array JSON Pointer index is invalid.");
    const index = Number(token);
    if (!Number.isSafeInteger(index) || index > length || (!allowEnd && index === length)) {
      fail("HISTORY_INVALID_PATCH", "Array JSON Pointer index is out of range.");
    }
    return index;
  }

  function readPointer(rootValue, tokens) {
    let cursor = rootValue;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (Array.isArray(cursor)) {
        const arrayPosition = arrayIndex(token, cursor.length, false);
        cursor = cursor[arrayPosition];
      } else if (isRecord(cursor) && hasOwn(cursor, token)) {
        cursor = cursor[token];
      } else {
        fail("HISTORY_INVALID_PATCH", "Patch path does not exist.");
      }
    }
    return cursor;
  }

  function applyOnePatch(target, operation, tokens) {
    if (operation.op === "test") {
      if (!deepEqual(readPointer(target, tokens), operation.value)) fail("HISTORY_PATCH_TEST_FAILED", "JSON Patch test operation did not match.");
      return target;
    }
    if (tokens.length === 0) {
      if (operation.op === "remove") fail("HISTORY_INVALID_PATCH", "A Project projection root cannot be removed.");
      if (!isRecord(operation.value)) fail("HISTORY_INVALID_PATCH", "A Project projection root must remain an object.");
      return cloneStrictJson(operation.value, "$root");
    }
    const leaf = tokens[tokens.length - 1];
    const parentTokens = tokens.slice(0, -1);
    const parent = parentTokens.length ? readPointer(target, parentTokens) : target;
    if (Array.isArray(parent)) {
      if (operation.op === "add") {
        const index = leaf === "-" ? parent.length : arrayIndex(leaf, parent.length, true);
        parent.splice(index, 0, cloneStrictJson(operation.value, operation.path));
        return target;
      }
      const index = arrayIndex(leaf, parent.length, false);
      if (operation.op === "remove") parent.splice(index, 1);
      else parent[index] = cloneStrictJson(operation.value, operation.path);
      return target;
    }
    if (!isRecord(parent)) fail("HISTORY_INVALID_PATCH", "Patch parent must be an object or array.");
    const exists = hasOwn(parent, leaf);
    if (operation.op === "remove") {
      if (!exists) fail("HISTORY_INVALID_PATCH", "Patch remove path does not exist.");
      delete parent[leaf];
      return target;
    }
    if (operation.op === "replace" && !exists) fail("HISTORY_INVALID_PATCH", "Patch replace path does not exist.");
    Object.defineProperty(parent, leaf, {
      value: cloneStrictJson(operation.value, operation.path),
      enumerable: true,
      configurable: true,
      writable: true
    });
    return target;
  }

  function applyPatchOperations(document, operations, validateOperations) {
    let result = cloneStrictJson(document, "$document");
    operations.forEach(function (operation) {
      const tokens = validateOperations ? validatePatchOperation(operation) : decodePointer(operation.path);
      result = applyOnePatch(result, operation, tokens);
    });
    if (!isRecord(result)) fail("HISTORY_INVALID_PATCH", "Creative projection must remain an object.");
    return result;
  }

  function applyPatch(document, patch) {
    if (!Array.isArray(patch)) fail("HISTORY_INVALID_PATCH", "Patch must be an array.");
    const operations = cloneStrictJson(patch, "$patch");
    return applyPatchOperations(document, operations, true);
  }

  // Only used with entry patches that validateEntry already cloned and checked
  // in this same synchronous validation pass. Keep the public applyPatch path
  // fully defensive for callers that supply their own documents or operations.
  function applyValidatedEntryPatch(document, operations) {
    return applyPatchOperations(document, operations, false);
  }

  function createEntryFromCanonical(before, after, entryId, kind) {
    if (typeof entryId !== "string" || !entryId.trim()) fail("HISTORY_INVALID_ENTRY", "entryId must be a non-empty command ID.");
    if (typeof kind !== "string" || !kind.trim()) fail("HISTORY_INVALID_ENTRY", "kind must be a non-empty command kind.");
    assertSameIdentity(before, after);
    if (after.revision !== before.revision + 1) fail("HISTORY_REVISION_MISMATCH", "Creative command must advance Project revision by exactly one.");
    if (!deepEqual(before.outputPreferences, after.outputPreferences)) {
      fail("HISTORY_PREFERENCES_CHANGED", "Creative command cannot change outputPreferences.");
    }
    const beforeProjection = creativeProjectionFromCanonical(before);
    const afterProjection = creativeProjectionFromCanonical(after);
    if (deepEqual(beforeProjection, afterProjection)) fail("HISTORY_NOOP", "A no-op creative command must not create a history entry.");
    return {
      projectId: before.projectId,
      entryId: entryId,
      kind: kind,
      baseRevision: before.revision,
      revision: after.revision,
      inversePatch: makePatchFromValidatedJson(afterProjection, beforeProjection),
      forwardPatch: makePatchFromValidatedJson(beforeProjection, afterProjection)
    };
  }

  function createEntry(beforeProject, afterProject, entryId, kind) {
    return createEntryFromCanonical(
      cloneValidatedProject(beforeProject),
      cloneValidatedProject(afterProject),
      entryId,
      kind
    );
  }

  function assertSameIdentity(before, after) {
    if (before.projectId !== after.projectId) fail("HISTORY_PROJECT_MISMATCH", "History operation cannot change projectId.");
    if (before.createdAt !== after.createdAt) fail("HISTORY_PROJECT_MISMATCH", "History operation cannot change createdAt.");
  }

  function validateEntry(entry) {
    const safe = cloneStrictJson(entry, "$entry");
    if (!isRecord(safe) || typeof safe.projectId !== "string" || !safe.projectId.trim() ||
        typeof safe.entryId !== "string" || !safe.entryId.trim() || typeof safe.kind !== "string" || !safe.kind.trim()) {
      fail("HISTORY_INVALID_ENTRY", "History entry identity is invalid.");
    }
    if (!Number.isInteger(safe.baseRevision) || safe.baseRevision < 0 || safe.revision !== safe.baseRevision + 1) {
      fail("HISTORY_INVALID_ENTRY", "History entry revisions are invalid.");
    }
    if (!Array.isArray(safe.inversePatch) || !Array.isArray(safe.forwardPatch)) fail("HISTORY_INVALID_ENTRY", "History entry patches must be arrays.");
    const entryFields = ["projectId", "entryId", "kind", "baseRevision", "revision", "inversePatch", "forwardPatch"];
    if (Object.keys(safe).some(function (key) { return entryFields.indexOf(key) < 0; }) ||
        entryFields.some(function (key) { return !hasOwn(safe, key); })) {
      fail("HISTORY_INVALID_ENTRY", "History entry contains missing or unexpected fields.");
    }
    safe.inversePatch.forEach(validatePatchOperation);
    safe.forwardPatch.forEach(validatePatchOperation);
    return safe;
  }

  function createBaseline(project) {
    const canonical = cloneValidatedProject(project);
    return {
      projectId: canonical.projectId,
      schemaVersion: HISTORY_SCHEMA_VERSION,
      projectRevision: canonical.revision,
      undoEntryIds: [],
      redoEntryIds: []
    };
  }

  function validateStateForCanonical(state, canonical) {
    const safe = cloneStrictJson(state, "$historyState");
    if (!isRecord(safe) || safe.schemaVersion !== HISTORY_SCHEMA_VERSION ||
        typeof safe.projectId !== "string" || !safe.projectId.trim() || !Number.isInteger(safe.projectRevision) || safe.projectRevision < 0 ||
        !Array.isArray(safe.undoEntryIds) || !Array.isArray(safe.redoEntryIds)) {
      fail("HISTORY_INVALID_STATE", "History cursor has an invalid shape.");
    }
    const stateFields = ["projectId", "schemaVersion", "projectRevision", "undoEntryIds", "redoEntryIds"];
    if (Object.keys(safe).some(function (key) { return stateFields.indexOf(key) < 0; }) ||
        stateFields.some(function (key) { return !hasOwn(safe, key); })) {
      fail("HISTORY_INVALID_STATE", "History cursor contains missing or unexpected fields.");
    }
    const allIds = safe.undoEntryIds.concat(safe.redoEntryIds);
    if (allIds.length > HISTORY_LIMIT || allIds.some(function (id) { return typeof id !== "string" || !id.trim(); }) || new Set(allIds).size !== allIds.length) {
      fail("HISTORY_INVALID_STATE", "History cursor has duplicate, invalid, or over-limit entry IDs.");
    }
    if (canonical) {
      if (safe.projectId !== canonical.projectId || safe.projectRevision !== canonical.revision) {
        fail("HISTORY_STATE_STALE", "History cursor project identity or revision does not match the canonical Project.");
      }
    }
    return safe;
  }

  function validateState(state, project) {
    return validateStateForCanonical(state, project ? cloneValidatedProject(project) : null);
  }

  function rowsById(entries, projectId) {
    if (!Array.isArray(entries)) fail("HISTORY_INVALID_ENTRIES", "History entries must be an array.");
    const map = new Map();
    entries.forEach(function (entry) {
      const safe = validateEntry(entry);
      if (safe.projectId !== projectId) fail("HISTORY_PROJECT_MISMATCH", "History entry belongs to another Project.");
      if (map.has(safe.entryId)) fail("HISTORY_DUPLICATE_ENTRY", "History entry IDs must be unique.");
      map.set(safe.entryId, safe);
    });
    return map;
  }

  function validateBundleForCanonical(canonical, state, entries) {
    // Internal callers pass a private, freshly validated Project clone. This
    // keeps the public entry points defensive without validating that same
    // Project a second time during one command preparation.
    const cursor = validateStateForCanonical(state, canonical);
    const map = rowsById(entries, canonical.projectId);
    const reachable = new Set(cursor.undoEntryIds.concat(cursor.redoEntryIds));
    if (map.size !== reachable.size || Array.from(map.keys()).some(function (id) { return !reachable.has(id); })) {
      fail("HISTORY_ENTRY_SET_MISMATCH", "Stored entries must match the cursor's reachable undo/redo IDs exactly.");
    }
    reachable.forEach(function (id) {
      const entry = map.get(id);
      if (!entry || entry.revision > cursor.projectRevision) fail("HISTORY_ENTRY_MISSING", "History cursor references a missing or future entry.");
    });
    const bundle = { project: canonical, state: cursor, entriesById: map };
    validatePatchChains(bundle);
    return bundle;
  }

  function validateBundle(project, state, entries) {
    return validateBundleForCanonical(cloneValidatedProject(project), state, entries);
  }

  function validateProjectionForProject(projection, template) {
    if (!isRecord(projection) || projection.projectId !== template.projectId || projection.createdAt !== template.createdAt) {
      fail("HISTORY_PROJECT_MISMATCH", "History projection changed projectId or createdAt.");
    }
    const preferences = cloneStrictJson(template.outputPreferences, "$outputPreferences");
    const schedule = preferences.schedule;
    if (schedule && Object.prototype.hasOwnProperty.call(schedule, "selectedDayId") && schedule.selectedDayId !== null &&
        Array.isArray(projection.shootingDays) &&
        !projection.shootingDays.some(function (day) { return isRecord(day) && day.id === schedule.selectedDayId; })) {
      // outputPreferences are excluded from creative patches. For a historical
      // projection only, don't validate today's selected day as if it existed
      // at every point in the undo/redo chain.
      schedule.selectedDayId = null;
    }
    const candidate = Object.assign({}, projection, {
      outputPreferences: preferences,
      revision: template.revision,
      updatedAt: template.updatedAt
    });
    try {
      const canonical = schema.validateProject(candidate);
      EXCLUDED_PROJECT_FIELDS.forEach(function (field) { delete canonical[field]; });
      return canonical;
    } catch (error) {
      fail("HISTORY_INVALID_PROJECT", "History projection failed canonical schema validation.", error);
    }
  }

  function validatePatchStep(projection, entry, direction, template) {
    const patch = direction === "undo" ? entry.inversePatch : entry.forwardPatch;
    const reversePatch = direction === "undo" ? entry.forwardPatch : entry.inversePatch;
    const next = applyValidatedEntryPatch(projection, patch);
    if (!deepEqual(applyValidatedEntryPatch(next, reversePatch), projection)) {
      fail("HISTORY_PATCH_NOT_REVERSIBLE", "Reachable history patch pair failed its round-trip check.");
    }
    return validateProjectionForProject(next, template);
  }

  function validatePatchChains(bundle) {
    const currentProjection = creativeProjectionFromCanonical(bundle.project);
    let undoProjection = currentProjection;
    // The undo stack is oldest-to-newest, so validate from the top toward its floor.
    for (let index = bundle.state.undoEntryIds.length - 1; index >= 0; index -= 1) {
      undoProjection = validatePatchStep(undoProjection, bundle.entriesById.get(bundle.state.undoEntryIds[index]), "undo", bundle.project);
    }
    // Redo's next entry is last, so validate its future branch in reverse array order.
    let redoProjection = currentProjection;
    for (let index = bundle.state.redoEntryIds.length - 1; index >= 0; index -= 1) {
      redoProjection = validatePatchStep(redoProjection, bundle.entriesById.get(bundle.state.redoEntryIds[index]), "redo", bundle.project);
    }
  }

  function cloneRows(map) {
    return Array.from(map.values()).map(function (entry) { return cloneStrictJson(entry, "$entry"); });
  }

  function recordCreativeCommand(options) {
    const opts = options || {};
    const before = cloneValidatedProject(opts.beforeProject);
    const after = cloneValidatedProject(opts.afterProject);
    const bundle = validateBundleForCanonical(before, opts.state, opts.entries === undefined ? [] : opts.entries);
    if (after.revision === before.revision && deepEqual(before, after)) {
      return { noOp: true, project: after, state: bundle.state, entries: cloneRows(bundle.entriesById), entryWrites: [], entryDeletes: [] };
    }
    if (bundle.state.projectRevision !== before.revision) fail("HISTORY_STATE_STALE", "History state is not at the command base revision.");
    const entry = createEntryFromCanonical(before, after, opts.entryId, opts.kind);
    const nextMap = new Map(bundle.entriesById);
    const deletedIds = bundle.state.redoEntryIds.slice();
    deletedIds.forEach(function (id) { nextMap.delete(id); });
    if (nextMap.has(entry.entryId)) fail("HISTORY_DUPLICATE_ENTRY", "Command ID already exists in reachable history.");
    nextMap.set(entry.entryId, entry);
    const nextUndo = bundle.state.undoEntryIds.concat(entry.entryId);
    if (nextUndo.length + bundle.state.redoEntryIds.length > HISTORY_LIMIT) {
      const floorId = nextUndo.shift();
      deletedIds.push(floorId);
      nextMap.delete(floorId);
    }
    const nextState = {
      projectId: before.projectId,
      schemaVersion: HISTORY_SCHEMA_VERSION,
      projectRevision: after.revision,
      undoEntryIds: nextUndo,
      redoEntryIds: []
    };
    return {
      noOp: false,
      project: after,
      state: nextState,
      entries: cloneRows(nextMap),
      entryWrites: [cloneStrictJson(entry, "$entry")],
      entryDeletes: Array.from(new Set(deletedIds))
    };
  }

  function recordPreferenceCommand(options) {
    const opts = options || {};
    const before = cloneValidatedProject(opts.beforeProject);
    const after = cloneValidatedProject(opts.afterProject);
    const bundle = validateBundleForCanonical(before, opts.state, opts.entries === undefined ? [] : opts.entries);
    assertSameIdentity(before, after);
    if (after.revision === before.revision && deepEqual(before, after)) {
      return { noOp: true, project: after, state: bundle.state, entries: cloneRows(bundle.entriesById), entryWrites: [], entryDeletes: [] };
    }
    if (after.revision !== before.revision + 1 || !deepEqual(creativeProjectionFromCanonical(before), creativeProjectionFromCanonical(after)) ||
        after.outputPreferences.revision !== before.outputPreferences.revision + 1) {
      fail("HISTORY_INVALID_PREFERENCE_COMMAND", "Preference command must change only outputPreferences and advance both revisions by one.");
    }
    const nextState = Object.assign({}, bundle.state, { projectRevision: after.revision });
    return {
      noOp: false,
      project: after,
      state: nextState,
      entries: cloneRows(bundle.entriesById),
      entryWrites: [],
      entryDeletes: []
    };
  }

  function advanceCursor(options, direction) {
    const opts = options || {};
    const bundle = validateBundle(opts.project, opts.state, opts.entries === undefined ? [] : opts.entries);
    const current = bundle.project;
    const sourceStack = direction === "undo" ? bundle.state.undoEntryIds : bundle.state.redoEntryIds;
    const otherStack = direction === "undo" ? bundle.state.redoEntryIds : bundle.state.undoEntryIds;
    if (!sourceStack.length) fail(direction === "undo" ? "HISTORY_CANNOT_UNDO" : "HISTORY_CANNOT_REDO", "There is no reachable history entry at this cursor.");
    const entryId = sourceStack[sourceStack.length - 1];
    const entry = bundle.entriesById.get(entryId);
    if (!entry) fail("HISTORY_ENTRY_MISSING", "History cursor target entry is missing.");
    const sourceProjection = creativeProjection(current);
    const patch = direction === "undo" ? entry.inversePatch : entry.forwardPatch;
    const reversePatch = direction === "undo" ? entry.forwardPatch : entry.inversePatch;
    const targetProjection = applyPatch(sourceProjection, patch);
    const roundTripProjection = applyPatch(targetProjection, reversePatch);
    if (!deepEqual(roundTripProjection, sourceProjection)) fail("HISTORY_PATCH_NOT_REVERSIBLE", "History patch pair failed its round-trip check.");
    if (targetProjection.projectId !== current.projectId || targetProjection.createdAt !== current.createdAt) {
      fail("HISTORY_PROJECT_MISMATCH", "History patch changed projectId or createdAt.");
    }
    const outputPreferences = cloneStrictJson(current.outputPreferences, "$outputPreferences");
    const schedulePreferences = outputPreferences.schedule;
    if (schedulePreferences && Object.prototype.hasOwnProperty.call(schedulePreferences, "selectedDayId") &&
        schedulePreferences.selectedDayId !== null && Array.isArray(targetProjection.shootingDays) &&
        !targetProjection.shootingDays.some(function (day) { return isRecord(day) && day.id === schedulePreferences.selectedDayId; })) {
      schedulePreferences.selectedDayId = null;
      outputPreferences.revision += 1;
    }
    const candidate = Object.assign({}, targetProjection, {
      outputPreferences: outputPreferences,
      revision: current.revision + 1,
      updatedAt: opts.updatedAt
    });
    const nextProject = cloneValidatedProject(candidate);
    assertSameIdentity(current, nextProject);
    const nextSource = sourceStack.slice(0, -1);
    const nextOther = otherStack.concat(entryId);
    const nextState = Object.assign({}, bundle.state);
    if (direction === "undo") {
      nextState.undoEntryIds = nextSource;
      nextState.redoEntryIds = nextOther;
    } else {
      nextState.redoEntryIds = nextSource;
      nextState.undoEntryIds = nextOther;
    }
    nextState.projectRevision = nextProject.revision;
    return {
      project: nextProject,
      state: nextState,
      entries: cloneRows(bundle.entriesById),
      entryWrites: [],
      entryDeletes: [],
      entryId: entryId
    };
  }

  function undo(options) { return advanceCursor(options, "undo"); }
  function redo(options) { return advanceCursor(options, "redo"); }

  function validateHistory(options) {
    try {
      const bundle = validateBundle(options.project, options.state, options.entries === undefined ? [] : options.entries);
      return {
        valid: true,
        canUndo: bundle.state.undoEntryIds.length > 0,
        canRedo: bundle.state.redoEntryIds.length > 0,
        undoDepth: bundle.state.undoEntryIds.length,
        redoDepth: bundle.state.redoEntryIds.length,
        state: bundle.state,
        entries: cloneRows(bundle.entriesById)
      };
    } catch (error) {
      return {
        valid: false,
        canUndo: false,
        canRedo: false,
        undoDepth: 0,
        redoDepth: 0,
        error: { code: error && error.code ? error.code : "HISTORY_INVALID", message: error && error.message ? error.message : "History is invalid." }
      };
    }
  }

  return Object.freeze({
    HISTORY_SCHEMA_VERSION: HISTORY_SCHEMA_VERSION,
    HISTORY_LIMIT: HISTORY_LIMIT,
    EXCLUDED_PROJECT_FIELDS: EXCLUDED_PROJECT_FIELDS,
    // No package manifest or RFC 6902 dependency is present in this workspace.
    // This safe subset supports add/remove/replace/test; move/copy are rejected.
    RFC6902_SUBSET: Object.freeze(["add", "remove", "replace", "test"]),
    HistoryEngineError: HistoryEngineError,
    cloneStrictJson: cloneStrictJson,
    deepEqual: deepEqual,
    creativeProjection: creativeProjection,
    makePatch: makePatch,
    applyPatch: applyPatch,
    createEntry: createEntry,
    validateEntry: validateEntry,
    createBaseline: createBaseline,
    validateState: validateState,
    validateHistory: validateHistory,
    recordCreativeCommand: recordCreativeCommand,
    recordPreferenceCommand: recordPreferenceCommand,
    undo: undo,
    redo: redo
  });
});
