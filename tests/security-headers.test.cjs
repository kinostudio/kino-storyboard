"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const headersPath = path.resolve(__dirname, "../dist/_headers");
const source = fs.readFileSync(headersPath, "utf8");
const rootBlock = source.match(/^\/\*\s*\n((?:[ \t]+[^\n]*\n?)+)/m);
assert.ok(rootBlock, "a root rule should cover all static app assets");
const headers = new Map(rootBlock[1].trim().split(/\r?\n/).map((line) => {
  const divider = line.indexOf(":");
  return [line.slice(0, divider).trim().toLowerCase(), line.slice(divider + 1).trim()];
}));

test("baseline response protections are active", () => {
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("permissions-policy"), "camera=(), geolocation=(), microphone=()");
});

test("HSTS begins with a short host-only observation period", () => {
  assert.equal(headers.get("strict-transport-security"), "max-age=86400");
  assert.doesNotMatch(headers.get("strict-transport-security"), /includeSubDomains|preload/i);
});

test("CSP stays in report-only while external Google flows are reviewed", () => {
  const policy = headers.get("content-security-policy-report-only");
  assert.ok(policy);
  assert.equal(headers.has("content-security-policy"), false);
  assert.match(policy, /script-src[^;]*https:\/\/accounts\.google\.com/);
  assert.match(policy, /frame-src[^;]*https:\/\/accounts\.google\.com/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'self'/);
  assert.match(policy, /frame-ancestors 'none'/);
});
