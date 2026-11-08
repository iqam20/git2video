#!/usr/bin/env node
// validate.mjs — validate a storyboard.json before rendering.
//
// Usage:
//   node validate.mjs --storyboard <file.json> [--story <story.json>] [--min 15] [--max 75]
//
// Implements the rules documented in references/storyboard-guide.md and, schemewise,
// references/storyboard.schema.json:
//   - meta { repo, label } present
//   - scenes: unique ids, known types, duration 0.8..15s, first=title, last=outro
//   - total duration within [--min..--max] (default 15..75s)
//   - narration: <= 2 sentences, reading-time rule 0.35 s/word + 0.5s slack
//   - per-type data constraints (see checkers below)
//   - every scene has a `source` string; with --story, every sha token in `source`
//     must exist in story.json (traceable claims)
// Exit 0 = ok; otherwise errors on stderr, exit 1.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const TYPES = ["title", "highlights", "diff", "stats", "timeline", "breaking", "contributors", "outro"];
const CHANGE_TYPES = ["feat", "fix", "perf", "removed", "docs", "tests", "build", "changed"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(msg, code = 2) {
  console.error(`validate: ${msg}`);
  process.exit(code);
}
function usage() {
  console.log(`validate.mjs — check a storyboard.json before rendering

Usage:
  node validate.mjs --storyboard <file.json> [--story <story.json>] [--min 15] [--max 75]`);
  process.exit(0);
}

const argv = process.argv.slice(2);
let sbPath = null, storyPath = null, minTotal = 15, maxTotal = 75;
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === "--storyboard") sbPath = path.resolve(argv[++i]);
  else if (k === "--story") storyPath = path.resolve(argv[++i]);
  else if (k === "--min") minTotal = Number(argv[++i]);
  else if (k === "--max") maxTotal = Number(argv[++i]);
  else if (k === "--help" || k === "-h") usage();
  else fail(`unknown flag: ${k} (--help for usage)`);
}
if (!sbPath || !existsSync(sbPath)) fail("--storyboard file is required and must exist");

let sb;
try {
  sb = JSON.parse(readFileSync(sbPath, "utf8"));
} catch (e) {
  fail(`storyboard is not valid JSON: ${e.message}`, 1);
}

const errors = [];
const warn = (cond, msg) => { if (!cond) errors.push(msg); };
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// ---- meta ----
if (!sb.meta || typeof sb.meta !== "object") errors.push("meta object missing");
if (!sb.meta || !isStr(sb.meta.repo)) errors.push("meta.repo is required (e.g. the repo slug or name)");
if (!sb.meta || !isStr(sb.meta.label)) errors.push("meta.label is required (release label, e.g. v1.4.0)");

// ---- scene-level ----
const scenes = Array.isArray(sb.scenes) ? sb.scenes : null;
if (!scenes || !scenes.length) {
  errors.push("scenes must be a non-empty array");
} else {
  const ids = new Set();
  scenes.forEach((s, i) => {
    const tag = `scenes[${i}] ${isStr(s?.id) ? `"${s.id}"` : `(no id)`}`;
    if (!isStr(s.id)) errors.push(`${tag}: id is required`);
    else if (ids.has(s.id)) errors.push(`${tag}: duplicate id "${s.id}"`);
    ids.add(s.id);
    if (!TYPES.includes(s.type)) errors.push(`${tag}: unknown type "${s.type}" (valid: ${TYPES.join(", ")})`);
    if (!isNum(s.duration) || s.duration < 0.8 || s.duration > 15)
      errors.push(`${tag}: duration must be a number between 0.8 and 15 seconds (got ${JSON.stringify(s.duration)})`);
    const narr = typeof s.narration === "string" ? s.narration.trim() : "";
    if (narr) {
      const sentences = narr.split(/[.!?]+\s|$/).filter((x) => x.trim().length).length;
      if (sentences > 2) errors.push(`${tag}: narration must be at most 2 sentences (got ${sentences})`);
      const words = narr.split(/\s+/).filter(Boolean).length;
      if (isNum(s.duration) && s.duration < 0.35 * words + 0.5)
        errors.push(`${tag}: narration too long for its slot — reading-time rule 0.35s/word needs ${((0.35 * words + 0.5) / 1).toFixed(2)}s, scene gives ${s.duration}s (rule: narration <= 2 sentences, >= 0.35s/word + 0.5s)`);
    }
    if (!isStr(s.source)) errors.push(`${tag}: source is required (commit shas that back this scene)`);
    if (s.data === undefined || s.data === null || typeof s.data !== "object")
      errors.push(`${tag}: data object is required`);
  });

  if (scenes[0]?.type !== "title") errors.push(`scene order: the first scene must be a title (got ${scenes[0]?.type ?? "none"})`);
  if (scenes[scenes.length - 1]?.type !== "outro") errors.push(`scene order: the last scene must be an outro (got ${scenes[scenes.length - 1]?.type ?? "none"})`);

  const total = scenes.reduce((a, s) => a + (isNum(s?.duration) ? s.duration : 0), 0);
  if (total < minTotal || total > maxTotal)
    errors.push(`total duration ${Number(total.toFixed(2))}s outside the allowed window ${minTotal}..${maxTotal}s (use --min/--max to widen for tests/demos)`);
}

// ---- per-type data ----
if (Array.isArray(scenes)) {
  for (const s of scenes) {
    const tag = `scenes["${s.id}"]`;
    const d = s.data || {};
    switch (s.type) {
      case "title":
        warn(isStr(d.label), `${tag}: data.label required (release label shown big)`);
        warn(!d.label || (isStr(d.label) && d.label.length <= 40), `${tag}: data.label too long (<=40 chars)`);
        warn(!d.repo || (isStr(d.repo) && d.repo.length <= 80), `${tag}: data.repo must be a string <=80 chars`);
        warn(!d.tagline || (isStr(d.tagline) && d.tagline.length <= 120), `${tag}: data.tagline must be a string <=120 chars`);
        warn(!d.date || DATE_RE.test(String(d.date)), `${tag}: data.date must be YYYY-MM-DD`);
        break;
      case "highlights": {
        warn(Array.isArray(d.items) && d.items.length >= 1 && d.items.length <= 8, `${tag}: data.items must be an array of 1..8 items`);
        for (const it of Array.isArray(d.items) ? d.items : [])
          warn(it && CHANGE_TYPES.includes(it.type) && isStr(it.text) && it.text.length <= 160,
            `${tag}: each item needs type in (${CHANGE_TYPES.join("/")}) and text <=160 chars`);
        break;
      }
      case "diff": {
        warn(isStr(d.file) && d.file.length <= 200, `${tag}: data.file required (path shown, <=200 chars)`);
        warn(isStr(d.sha), `${tag}: data.sha required (the commit that produced this hunk)`);
        if (isStr(d.code)) {
          const lines = d.code.split("\n");
          warn(lines.length <= 18, `${tag}: data.code must be <=18 lines (got ${lines.length})`);
          warn(lines.every((l) => l.length <= 72), `${tag}: every data.code line must be <=72 chars (wrap before rendering)`);
          warn(lines.every((l) => !l.startsWith("---") && !l.startsWith("+++")), `${tag}: data.code must contain content lines only (no ---/+++ headers)`);
        } else warn(false, `${tag}: data.code required (sanitized hunk text)`);
        break;
      }
      case "stats": {
        warn(isNum(d.commits) && d.commits >= 0, `${tag}: data.commits must be a number >= 0`);
        warn(!isNum(d.files) || d.files >= 0, `${tag}: data.files must be >= 0`);
        warn(!isNum(d.additions) || d.additions >= 0, `${tag}: data.additions must be >= 0`);
        warn(!isNum(d.deletions) || d.deletions >= 0, `${tag}: data.deletions must be >= 0`);
        warn(!isNum(d.contributors) || d.contributors >= 0, `${tag}: data.contributors must be >= 0`);
        break;
      }
      case "timeline": {
        const okArr = Array.isArray(d.points) && d.points.length >= 2 && d.points.length <= 6;
        warn(okArr, `${tag}: data.points must be an array of 2..6 points`);
        for (const p of Array.isArray(d.points) ? d.points : [])
          warn(p && DATE_RE.test(String(p.date || "")) && isStr(p.label) && p.label.length <= 60,
            `${tag}: each point needs date (YYYY-MM-DD) and label <=60 chars`);
        break;
      }
      case "breaking": {
        warn(Array.isArray(d.items) && d.items.length >= 1 && d.items.length <= 3, `${tag}: data.items must be an array of 1..3 items`);
        for (const it of Array.isArray(d.items) ? d.items : [])
          warn(it && isStr(it.summary) && it.summary.length <= 120, `${tag}: each item needs summary <=120 chars`);
        break;
      }
      case "contributors": {
        const okArr = Array.isArray(d.names) && d.names.length >= 1 && d.names.length <= 12;
        warn(okArr, `${tag}: data.names must be an array of 1..12 names`);
        for (const n of Array.isArray(d.names) ? d.names : [])
          warn(typeof n === "string" && n.length >= 1 && n.length <= 60, `${tag}: names must be strings <=60 chars`);
        break;
      }
      case "outro": {
        warn(!d.cmd || (isStr(d.cmd) && d.cmd.length <= 80), `${tag}: data.cmd must be a string <=80 chars`);
        warn(!d.url || (isStr(d.url) && d.url.length <= 80), `${tag}: data.url must be a string <=80 chars`);
        warn(!d.headline || (isStr(d.headline) && d.headline.length <= 80), `${tag}: data.headline must be a string <=80 chars`);
        break;
      }
      default:
        break;
    }
  }
}

// ---- source traceability: every sha token must exist in story.json ----
let story = null;
if (storyPath) {
  if (!existsSync(storyPath)) fail(`--story file not found: ${storyPath}`);
  try {
    story = JSON.parse(readFileSync(storyPath, "utf8"));
  } catch (e) {
    fail(`--story file is not valid JSON: ${e.message}`, 1);
  }
}
if (story && Array.isArray(scenes)) {
  const shas = new Set();
  (function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if ((k === "sha" || k === "shortSha") && typeof v === "string") shas.add(v.toLowerCase());
        else walk(v);
      }
    }
  })(story);
  for (const s of scenes) {
    const tokens = String(s.source || "").toLowerCase().match(/[0-9a-f]{7,40}/g) || [];
    for (const tok of tokens) {
      const ok = [...shas].some((h) => h === tok || h.startsWith(tok) || h.includes(tok));
      if (!ok) errors.push(`scenes["${s.id}"]: source references sha ${tok.slice(0, 7)}… which is absent from story.json — every claim must trace to a real commit`);
    }
  }
}

if (errors.length) {
  console.error(`validate: ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const total = Array.isArray(scenes) ? scenes.reduce((a, s) => a + (isNum(s?.duration) ? s.duration : 0), 0) : 0;
console.log(`validate: OK — ${scenes.length} scenes, ${Number(total.toFixed(2))}s${story ? ", sources traced to story.json" : ""}`);
