#!/usr/bin/env node
// doctor.mjs — environment check for git2video.
// Checks required tools (node, ffmpeg, ffprobe, Playwright Chromium) and
// optional ones (gh, piper, espeak-ng/espeak, vhs, docker).
// Exit code 1 only if a REQUIRED tool is missing or too old.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, "..");

function which(cmd) {
  const finder = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(finder, [cmd], { encoding: "utf8" });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  return null;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 15000 });
  return { ok: r.status === 0, stdout: (r.stdout || "") + (r.stderr || "") };
}

function nodeMajor() {
  return Number(process.versions.node.split(".")[0]);
}

function checkChromium() {
  try {
    const { chromium } = require("playwright");
    const exe = chromium.executablePath();
    if (exe && existsSync(exe)) return { ok: true, detail: exe };
    return { ok: false, detail: "chromium not downloaded" };
  } catch (e) {
    return { ok: false, detail: String(e.message || e).split("\n")[0] };
  }
}

const rows = [];
function add(name, required, ok, detail, hint) {
  rows.push({ name, required, ok, detail, hint });
}

// Required: node >= 20
const nm = nodeMajor();
add(
  "node",
  true,
  nm >= 20,
  `v${process.versions.node}`,
  "Install Node >= 20: https://nodejs.org (mac: brew install node / win: winget install OpenJS.NodeJS / deb: nodesource)"
);

// Required: ffmpeg, ffprobe
for (const tool of ["ffmpeg", "ffprobe"]) {
  const p = which(tool);
  const v = p ? run(p, ["-version"]) : { ok: false };
  add(
    tool,
    true,
    Boolean(p) && v.ok,
    p ? (v.stdout.split("\n")[0] || "").slice(0, 60) : "not found",
    "mac: brew install ffmpeg | ubuntu: sudo apt install ffmpeg | win: winget install Gyan.FFmpeg"
  );
}

// Required: playwright + chromium
let pwFound = false;
try {
  require("playwright");
  pwFound = true;
} catch {
  /* not installed */
}
add(
  "playwright (npm)",
  true,
  pwFound,
  pwFound ? require("playwright/package.json").version : "npm package missing",
  "npm install   (run inside the skill project or repo root)"
);
const chromium = pwFound ? checkChromium() : { ok: false, detail: "playwright npm missing" };
add(
  "chromium (playwright)",
  true,
  chromium.ok,
  chromium.detail,
  "npx playwright install chromium    # mac: also `sudo xcodebuild -license` if prompted; linux: npx playwright install-deps chromium"
);

// Optional tools
const optional = [
  ["git", true, null], // still technically required by collect; we mark required
  ["gh", false, "release notes / PR enrichment (optional; collect works without it)"],
  ["piper", false, "local voiceover (optional)"],
  ["espeak-ng", false, "local voiceover fallback (optional); mac: brew install espeak-ng"],
  ["vhs", false, "terminal demos (used by readme2demo, not git2video)"],
  ["docker", false, "sandboxed command execution (used by readme2demo, not git2video)"],
];
for (const [tool, req, hint] of optional) {
  const p = which(tool);
  let detail = p || "not found";
  let ok = Boolean(p);
  if (tool === "git" && p) detail = run(p, ["--version"]).stdout.split("\n")[0];
  add(tool, req, ok, detail, hint || "");
}

// Report
const nameW = Math.max(...rows.map((r) => r.name.length), 10);
const statusW = 8;
let missingRequired = false;
console.log("");
for (const r of rows) {
  const status = r.ok ? "OK" : r.required ? "MISSING" : "optional";
  if (r.required && !r.ok) missingRequired = true;
  console.log(
    `${String(status).padEnd(statusW)} ${r.name.padEnd(nameW)} ${r.required ? "[required]" : "[optional]"}  ${r.detail}`
  );
  if (!r.ok && r.hint) console.log(`${" ".repeat(statusW)} ${" ".repeat(nameW)}  -> ${r.hint}`);
}
console.log("");

// Repo sanity: skill files present
const requiredFiles = [
  "SKILL.md",
  "scripts/collect.mjs",
  "scripts/render.mjs",
  "scripts/qa.mjs",
  path.join("references", "storyboard.schema.json"),
];
for (const f of requiredFiles) {
  const p = path.join(skillDir, f);
  const ok = existsSync(p);
  console.log(`${ok ? "OK     " : "MISSING"} ${f}${ok ? "" : `   (expected at ${p})`}`);
  if (!ok) missingRequired = true;
}
console.log("");

if (missingRequired) {
  console.error("doctor: required components missing — fix the lines marked MISSING above.");
  process.exit(1);
}
console.log("doctor: all required components present. Optional tools add features but are not needed.");
