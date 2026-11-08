#!/usr/bin/env node
// qa.mjs — scripted QA gate for a rendered git2video storyboard.
//
// Usage:
//   node qa.mjs --storyboard <file.json> --out <render-out-dir> [--preset 16:9] [--max-audits 40]
//
// Checks (all offline, deterministic):
//   1. out/video.mp4 exists
//   2. stream + format via ffprobe: h264 in yuv420p, exact preset resolution,
//      duration within 0.15s of the storyboard total
//   3. layout audit (written by render.mjs): no element overflow and nothing
//      outside the 5% safe area in any sampled frame
//   4. sampled frames (6 evenly spaced): not near-blank (luma variance via
//      signalstats) and not inaudibly black frames (YMAX)
//   5. audio: must be silent by design in v0.1 — reported as info, never fails
// Writes out/qa/report.json + out/qa/report.md. Exit 1 if any check fails.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PRESETS = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080] };

let sbPath = null, outDir = null, presetKey = "16:9";
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === "--storyboard") sbPath = path.resolve(argv[++i]);
  else if (k === "--out") outDir = path.resolve(argv[++i]);
  else if (k === "--preset") presetKey = argv[++i];
  else if (k === "--help" || k === "-h") {
    console.log(`qa.mjs — scripted quality gate\n\nUsage: node qa.mjs --storyboard file.json --out dir [--preset 16:9|9:16|1:1]`);
    process.exit(0);
  } else {
    console.error(`qa: unknown flag ${k}`);
    process.exit(2);
  }
}
if (!sbPath || !existsSync(sbPath)) { console.error("qa: --storyboard file is required and must exist"); process.exit(2); }
if (!outDir) outDir = path.dirname(sbPath);
if (!PRESETS[presetKey]) { console.error(`qa: unknown --preset ${presetKey}`); process.exit(2); }
const [wantW, wantH] = PRESETS[presetKey];

let sb;
try { sb = JSON.parse(readFileSync(sbPath, "utf8")); } catch (e) { console.error(`qa: storyboard not valid JSON: ${e.message}`); process.exit(1); }
let sbTotal = (Array.isArray(sb?.scenes) ? sb.scenes : []).reduce((a, s) => a + (typeof s?.duration === "number" ? s.duration : 0), 0);
if (!sbTotal) { console.error("qa: storyboard has no scene durations"); process.exit(1); }

const errors = [];
const warnings = [];
const notes = [];
const report = { checks: {}, errors, warnings, notes, ok: true };
const addErr = (m) => { errors.push(`FAIL: ${m}`); report.ok = false; };
const addWarn = (m) => warnings.push(m);

const mp4 = path.join(outDir, "video.mp4");
if (!existsSync(mp4)) addErr(`missing render output ${mp4} — run render.mjs first`);

function ffprobeJson(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

let probe = null;
if (existsSync(mp4)) {
  probe = ffprobeJson(mp4);
  if (!probe) addErr("ffprobe could not parse video.mp4");
  else {
    const v = (probe.streams || []).find((s) => s.codec_type === "video");
    if (!v) addErr("no video stream in video.mp4");
    else {
      const res = { actual: `${v.width}x${v.height}`, expected: `${wantW}x${wantH}` };
      report.checks.resolution = res;
      if (v.width !== wantW || v.height !== wantH) addErr(`resolution ${res.actual} != expected ${res.expected}`);
      report.checks.codec = { actual: `${v.codec_name}/${v.pix_fmt}`, expected: "h264/yuv420p" };
      if (v.codec_name !== "h264" || v.pix_fmt !== "yuv420p") addErr(`codec/pix_fmt is ${v.codec_name}/${v.pix_fmt}, expected h264/yuv420p`);
      const dur = Number(probe.format?.duration);
      if (!Number.isFinite(dur)) addErr("could not read duration from video.mp4");
      else {
        report.checks.duration = { actual: Number(dur.toFixed(3)), expected: Number(sbTotal.toFixed(3)), delta: Number(Math.abs(dur - sbTotal).toFixed(3)) };
        if (Math.abs(dur - sbTotal) > 0.15) addErr(`video duration ${dur.toFixed(2)}s != storyboard total ${sbTotal.toFixed(2)}s (delta > 0.15s)`);
      }
      const hasAudio = (probe.streams || []).some((s) => s.codec_type === "audio");
      report.checks.audio = hasAudio ? "present" : "none (by design in v0.1; burned captions instead)";
      if (hasAudio) notes.push("audio track present — audio QA (LUFS) is a roadmap item");
    }
  }
}

// layout audit
const auditFile = path.join(outDir, "layout-audit.json");
if (existsSync(auditFile)) {
  let audit = null;
  try { audit = JSON.parse(readFileSync(auditFile, "utf8")); } catch { addErr("layout-audit.json is not valid JSON"); }
  if (audit) {
    const bad = [];
    for (const a of audit.audits || [])
      for (const el of a.elements || [])
        if (el.overflow || el.outside) bad.push({ scene: a.scene, t: a.t, text: el.text, overflow: el.overflow, outside: el.outside, rect: el.rect });
    report.checks.layout = { samples: (audit.audits || []).length, violations: bad.length };
    if (bad.length) {
      report.checks.layout.examples = bad.slice(0, 10);
      for (const b of bad.slice(0, 8)) addErr(`layout at t=${b.t} scene=${b.scene}: ${b.overflow ? "overflow" : "outside safe area"} — "${b.text}"`);
      if (bad.length > 8) addErr(`(+${bad.length - 8} more layout problems; see report.checks.layout)`);
    }
  }
} else {
  addWarn("layout-audit.json missing (older render?) — re-render to get the layout audit");
}

// sampled frames: near-blank detection
if (existsSync(mp4)) {
  const tmp = mkdtempSync(path.join(tmpdir(), "g2v-qa-"));
  const samples = 6;
  const frames = [];
  for (let i = 0; i < samples; i++) {
    const t = (0.1 + (0.8 * i) / Math.max(samples - 1, 1)) * sbTotal;
    const png = path.join(tmp, `f${i}.png`);
    const x = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", t.toFixed(3), "-i", mp4, "-frames:v", "1", png], { encoding: "utf8" });
    if (x.status !== 0) { addErr(`frame extraction failed at t=${t.toFixed(2)}s`); continue; }
    const out = spawnSync("ffmpeg", ["-hide_banner", "-i", png, "-vf", "signalstats,metadata=print", "-f", "null", "-"], { encoding: "utf8" });
    const txt = (out.stderr || "") + (out.stdout || "");
    const ymin = Number(/signalstats\.YMIN=(\d+)/.exec(txt)?.[1]);
    const ymax = Number(/signalstats\.YMAX=(\d+)/.exec(txt)?.[1]);
    const blank = !(ymax > ymin + 12);
    const black = !(ymax > 16);
    frames.push({ t: Number(t.toFixed(3)), ymin, ymax, variant: ymax - ymin, blank, black });
    if (blank) addErr(`frame at t=${t.toFixed(2)}s near-blank (luma span ${ymax - ymin}) — is the scene drawing at that moment?`);
    if (black) addErr(`frame at t=${t.toFixed(2)}s fully black (YMAX<=16)`);
  }
  report.checks.frames = frames;
  rmSync(tmp, { recursive: true, force: true });
}

// report files
const qaDir = path.join(outDir, "qa");
mkdirSync(qaDir, { recursive: true });
writeFileSync(path.join(qaDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
const lines = [
  `# QA report — ${path.basename(outDir)}`,
  "",
  `Result: **${report.ok ? "PASS" : "FAIL"}** — ${errors.length} error(s), ${warnings.length} warning(s)`,
  "",
  `| check | value |`,
  `|---|---|`,
  `| duration | ${report.checks.duration ? `${report.checks.duration.actual}s (expected ${report.checks.duration.expected}s)` : "n/a"} |`,
  `| resolution | ${report.checks.resolution ? `${report.checks.resolution.actual} (expected ${report.checks.resolution.expected})` : "n/a"} |`,
  `| codec | ${report.checks.codec ? report.checks.codec.actual : "n/a"} |`,
  `| layout samples | ${report.checks.layout ? report.checks.layout.samples : 0} |`,
  `| layout violations | ${report.checks.layout ? report.checks.layout.violations : "?"} |`,
  `| audio | ${report.checks.audio || "n/a"} |`,
  "",
];
for (const e of errors) lines.push(`- ${e}`);
for (const w of warnings) lines.push(`- warning: ${w}`);
lines.push("", `Details: qa/report.json`);
writeFileSync(path.join(qaDir, "report.md"), lines.join("\n") + "\n");

console.log(report.ok
  ? `qa: PASS — ${errors.length} errors, ${warnings.length} warnings -> ${path.join(qaDir, "report.md")}`
  : `qa: FAIL — fix the ${errors.length} error(s) in ${path.join(qaDir, "report.md")} (full detail: report.json), then re-render`);
process.exit(report.ok ? 0 : 1);
