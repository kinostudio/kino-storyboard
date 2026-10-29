"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function usage() {
  console.log("Usage: node tools/check-static-dependencies.cjs [--tracked] [--root PATH]");
  console.log("Checks local dist/index.html and known runtime-loaded CSS/Worker dependencies.");
  console.log("--tracked also requires every dependency to be present in git ls-files.");
}

function parseArguments(argv) {
  let tracked = false;
  let root = path.resolve(__dirname, "..");
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tracked") tracked = true;
    else if (arg === "--root" && argv[index + 1]) {
      root = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      return null;
    } else {
      throw new Error("Unknown or incomplete option: " + arg);
    }
  }
  return { tracked: tracked, root: root };
}

function readText(root, relativePath, problems) {
  const absolutePath = path.join(root, ...relativePath.split("/"));
  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch (error) {
    problems.push("MISSING SOURCE | " + relativePath);
    return "";
  }
}

function attribute(tag, name) {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*([\\\"'])(.*?)\\1", "i"));
  return match ? match[2] : "";
}

function localPathFromReference(reference) {
  const value = String(reference || "").trim();
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return { external: true };
  if (value.startsWith("/")) return { error: "site-root path is not safe for a GitHub Pages project site: " + value };

  let pathname = value.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  try { pathname = decodeURIComponent(pathname); }
  catch (error) { return { error: "invalid URL encoding in reference: " + value }; }
  const relativePath = path.posix.normalize(path.posix.join("dist", pathname));
  if (!relativePath.startsWith("dist/") || relativePath.includes("/../")) {
    return { error: "reference escapes dist/: " + value };
  }
  return { relativePath: relativePath };
}

function run() {
  const options = parseArguments(process.argv.slice(2));
  if (!options) return 0;

  const problems = [];
  const dependencies = new Map();
  const addReference = function (reference, source) {
    const resolved = localPathFromReference(reference);
    if (resolved.external) return;
    if (resolved.error) {
      problems.push("INVALID REFERENCE | " + source + " | " + resolved.error);
      return;
    }
    const origins = dependencies.get(resolved.relativePath) || new Set();
    origins.add(source);
    dependencies.set(resolved.relativePath, origins);
  };

  const indexPath = path.join(options.root, "dist", "index.html");
  let html = "";
  try { html = fs.readFileSync(indexPath, "utf8"); }
  catch (error) { problems.push("MISSING SOURCE | dist/index.html"); }

  for (const match of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const tag = match[0];
    if (match[1].toLowerCase() === "script") {
      const src = attribute(tag, "src");
      if (src) addReference(src, "dist/index.html");
    } else {
      const href = attribute(tag, "href");
      if (href) addReference(href, "dist/index.html");
    }
  }

  const appSource = readText(options.root, "dist/app.js", problems);
  const dynamicCss = Array.from(appSource.matchAll(/new\s+URL\s*\(\s*["']([^"']+\.css(?:[?#][^"']*)?)["']\s*,\s*currentScriptUrl\b/g));
  if (!dynamicCss.length) problems.push("NOT FOUND | expected runtime CSS reference in dist/app.js");
  dynamicCss.forEach((match) => addReference(match[1], "dist/app.js runtime CSS"));

  const packageSource = readText(options.root, "dist/project-package.js", problems);
  const workerRefs = Array.from(packageSource.matchAll(/new\s+URL\s*\(\s*["']([^"']+\.js(?:[?#][^"']*)?)["']\s*,\s*packageScriptBase\b/g));
  if (!workerRefs.length) problems.push("NOT FOUND | expected runtime Worker reference in dist/project-package.js");
  workerRefs.forEach((match) => addReference(match[1], "dist/project-package.js runtime Worker"));

  const workerSource = readText(options.root, "dist/package-worker.js", problems);
  const importScripts = workerSource.match(/\bimportScripts\s*\(([\s\S]*?)\);/);
  if (!importScripts) {
    problems.push("NOT FOUND | expected importScripts block in dist/package-worker.js");
  } else {
    const imports = Array.from(importScripts[1].matchAll(/new\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*base\s*\)\s*\.href/g));
    if (!imports.length) problems.push("NOT FOUND | expected URL imports in dist/package-worker.js");
    imports.forEach((match) => addReference(match[1], "dist/package-worker.js importScripts"));
  }

  let trackedFiles = null;
  if (options.tracked) {
    try {
      trackedFiles = new Set(execFileSync("git", ["ls-files", "-z"], { cwd: options.root, encoding: "utf8" })
        .split("\0").filter(Boolean).map((file) => file.replace(/\\/g, "/")));
    } catch (error) {
      problems.push("GIT ERROR | --tracked requires a Git work tree: " + (error.message || String(error)));
    }
  }

  let missingCount = 0;
  let untrackedCount = 0;
  for (const [relativePath, origins] of dependencies) {
    const absolutePath = path.join(options.root, ...relativePath.split("/"));
    const exists = fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
    const tracked = trackedFiles ? trackedFiles.has(relativePath) : null;
    const originText = Array.from(origins).join(", ");
    if (!exists) {
      missingCount += 1;
      console.error("MISSING | " + relativePath + " | referenced by " + originText);
    } else if (trackedFiles && !tracked) {
      untrackedCount += 1;
      console.error("UNTRACKED | " + relativePath + " | referenced by " + originText);
    } else {
      console.log("OK | " + relativePath + " | referenced by " + originText);
    }
  }

  problems.forEach((problem) => console.error(problem));
  if (missingCount || untrackedCount || problems.length) {
    console.error("Static dependency check failed: " + missingCount + " missing, " + untrackedCount + " untracked, " + problems.length + " source/reference issue(s).");
    return 1;
  }
  console.log("Static dependency check passed: " + dependencies.size + " local files exist" + (options.tracked ? " and are tracked." : " in the working tree."));
  return 0;
}

try {
  process.exitCode = run();
} catch (error) {
  console.error(error.message || String(error));
  usage();
  process.exitCode = 2;
}
