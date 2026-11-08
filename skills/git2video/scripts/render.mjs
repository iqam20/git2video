#!/usr/bin/env node
// render.mjs — deterministic HTML->video renderer for git2video storyboards.
//
// Usage:
//   node render.mjs --storyboard <file.json> [--out <dir>] [--preset 16:9|9:16|1:1]
//                   [--fps 30|60] [--theme dark|light|neon] [--formats mp4,webm,gif]
//
// Pipeline: one inline HTML page (anim.js inlined from templates, theme css inlined,
// storyboard JSON + scene scripts inlined) -> Playwright Chromium -> frame loop
// window.__seek(t) -> JPEG screenshot -> ffmpeg image2pipe (stdin) -> H.264 mp4.
// --formats webm|gif re-encode from the mp4.
//
// Determinism: no remote assets; every http(s) request is blocked and fails the
// render loudly. No Math.random/Date.now in scenes. Audio: none — scenes with
// narration get burned captions instead (see templates/base.html).

import { spawnSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(here, "..");
const tplDir = path.resolve(skillDir, "templates");

const PRESETS = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
};
const THEMES = ["dark", "light", "neon"];

function parseArgs(argv) {
  const a = { storyboard: null, out: null, preset: "16:9", fps: 30, theme: "dark", formats: "mp4" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--storyboard") a.storyboard = path.resolve(argv[++i]);
    else if (k === "--out") a.out = path.resolve(argv[++i]);
    else if (k === "--preset") a.preset = argv[++i];
    else if (k === "--fps") a.fps = Number(argv[++i]);
    else if (k === "--theme") a.theme = argv[++i];
    else if (k === "--formats") a.formats = argv[++i];
    else if (k === "--voice" || k === "--music") {
      // accepted for forward-compatibility; v0.1 ships silent with burned captions
      console.error(`render: note — ${k} is accepted but audio is not implemented yet (captions are burned instead; see ROADMAP.md)`);
    } else if (k === "--help" || k === "-h") {
      console.log(`render.mjs — render a storyboard.json to MP4 (offline, deterministic)

Usage:
  node render.mjs --storyboard file.json [--out dir] [--preset 16:9|9:16|1:1]
                  [--fps 30|60] [--theme dark|light|neon] [--formats mp4,webm,gif]`);
      process.exit(0);
    } else {
      console.error(`render: unknown flag ${k}`);
      process.exit(2);
    }
  }
  return a;
}

function fail(msg, code = 2) {
  console.error(`render: ${msg}`);
  process.exit(code);
}

// ---------- args ----------
const args = parseArgs(process.argv.slice(2));
if (!args.storyboard || !existsSync(args.storyboard)) fail("--storyboard file is required and must exist");
const preset = PRESETS[args.preset];
if (!preset) fail(`unknown --preset ${args.preset}; valid: ${Object.keys(PRESETS).join(", ")}`);
if (![30, 60].includes(args.fps)) fail("--fps must be 30 or 60");
if (!THEMES.includes(args.theme)) fail(`unknown --theme ${args.theme}; valid: ${THEMES.join(", ")}`);
const formats = new Set(String(args.formats).split(",").map((s) => s.trim()).filter(Boolean));
for (const f of formats) if (!["mp4", "webm", "gif"].includes(f)) fail(`unknown format "${f}"`);
if (!formats.has("mp4")) formats.add("mp4");
const outDir = args.out || path.dirname(args.storyboard);

// ---------- gather inline sources (no server, no network) ----------
let storyboard;
try {
  storyboard = JSON.parse(readFileSync(args.storyboard, "utf8"));
} catch (e) {
  fail(`storyboard is not valid JSON: ${e.message}`);
}
if (!storyboard.meta) storyboard.meta = {};
storyboard.meta.preset = args.preset;
if (!storyboard.meta.theme) storyboard.meta.theme = args.theme;

const kitSrc = readFileSync(path.join(tplDir, "scenes", "_kit.js"), "utf8");
const animSrc = readFileSync(path.join(tplDir, "anim.js"), "utf8");
const themeCss = readFileSync(path.join(tplDir, "themes", `${args.theme}.css`), "utf8");
const baseHtml = readFileSync(path.join(tplDir, "base.html"), "utf8");

const scenesJs = [];
const seen = new Set();
for (const s of storyboard.scenes) {
  if (seen.has(s.type)) continue;
  seen.add(s.type);
  const p = path.join(tplDir, "scenes", `${s.type}.js`);
  if (!existsSync(p)) fail(`scene template missing: templates/scenes/${s.type}.js`);
  scenesJs.push(readFileSync(p, "utf8"));
}

const rootFont = Math.floor(Math.min(preset.w / 19.2, preset.h / 10.8) * 100) / 100;
const safeJson = JSON.stringify(storyboard).replace(/<\//g, "<\\/");

const html = baseHtml
  .replace("<!--@@THEME@@-->", `<style>${themeCss}</style>`)
  .replace(`<script>/* @@ANIM@@ */</script>`, `<script>${animSrc.replace(/<\//g, "<\\/")}<\/script>`)
  .replace(
    "<script>\n/* ---- scene registry",
    `<script>\nwindow.__STORYBOARD = ${safeJson};\n/* ---- scene registry`
  )
  .replace(
    "</body>",
    `<script>${kitSrc.replace(/<\//g, "<\\/")}\n${scenesJs.join("\n").replace(/<\//g, "<\\/")}<\/script>\n<script>document.documentElement.style.fontSize = ${rootFont} + "px"; window.__boot();<\/script>\n</body>`
  );

// ---------- ffmpeg ----------
function toolPath(cmd) {
  const finder = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(finder, [cmd], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout.trim()) fail(`${cmd} not found — run: node skills/git2video/scripts/doctor.mjs`);
  return r.stdout.trim().split(/\r?\n/)[0];
}
const ffmpeg = toolPath("ffmpeg");

// ---------- Playwright + frame loop -> ffmpeg image2pipe stdin ----------
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  fail("playwright npm package not found — npm install (then npx playwright install chromium)");
}
const mp4File = path.join(outDir, "video.mp4");
mkdirSync(outDir, { recursive: true });
console.log(`render: building page (${preset.w}x${preset.h}, theme ${args.theme})…`);

const browser = await chromium.launch({ args: ["--force-device-scale-factor=1", "--disable-lcd-text"] });
const context = await browser.newContext({ viewport: { width: preset.w, height: preset.h }, deviceScaleFactor: 1 });

let blocked = 0;
const firstBlocked = [];
await context.route("**/*", (route) => {
  const url = route.request().url();
  if (/^https?:/i.test(url)) {
    blocked++;
    if (firstBlocked.length < 3) firstBlocked.push(url);
    route.abort();
    return;
  }
  route.continue();
});

const page = await context.newPage();
try {
  await page.setContent(html, { waitUntil: "load" });
} catch (e) {
  await browser.close();
  fail(`page boot failed: ${e.message}`);
}
if (blocked) {
  await browser.close();
  fail(`remote assets are not allowed (blocked ${blocked} request(s): ${firstBlocked.join(", ")})`);
}
await page.evaluate(() => document.fonts.ready);
const total = await page.evaluate(() => window.__duration);
if (!total) {
  await browser.close();
  fail("__duration missing after boot — bad page build");
}
const framesTotal = Math.round(total * args.fps);
console.log(`render: timeline ${total.toFixed(2)}s — ${framesTotal} frames @${args.fps}fps -> ${mp4File}`);

// layout audit sample times: three spots inside each scene slot, snapped to the fps grid
const spots = [];
{
  let cursor = 0;
  const seen2 = new Set();
  for (const s of storyboard.scenes) {
    const d = s.duration || 3;
    for (const f of [0.08, 0.45, 0.88]) {
      const tf = Math.min(total - 1 / args.fps, cursor + d * f);
      const t = Math.round(tf * args.fps) / args.fps;
      const key = t.toFixed(4);
      if (!seen2.has(key)) {
        seen2.add(key);
        spots.push({ scene: s.id, t });
      }
    }
    cursor += d;
  }
}

const ff = spawn(
  ffmpeg,
  [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(args.fps), "-i", "-",
    "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-vf", "scale=in_range=jpeg:out_range=mpeg,format=yuv420p",
    "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    mp4File,
  ],
  { stdio: ["pipe", "ignore", "pipe"] }
);
let ffErr = "";
ff.stderr.on("data", (d) => (ffErr += d.toString()));

const audit = [];
const t0 = Date.now();
try {
  for (let n = 0; n < framesTotal; n++) {
    const t = n / args.fps;
    await page.evaluate((tt) => window.__seek(tt), t);
    const spot = spots.find((sp) => sp.t === t);
    if (spot) audit.push({ scene: spot.scene, t, elements: await page.evaluate(() => window.__layoutReport()) });
    const jpeg = await page.screenshot({ type: "jpeg", quality: 92, clip: { x: 0, y: 0, width: preset.w, height: preset.h } });
    if (!ff.stdin.write(jpeg)) await new Promise((r) => ff.stdin.once("drain", r));
  }
} finally {
  ff.stdin.end();
  await new Promise((resolve) => ff.on("close", resolve));
  await browser.close();
}
writeFileSync(
  path.join(outDir, "layout-audit.json"),
  JSON.stringify({ preset: args.preset, fps: args.fps, total, spots, audits: audit }, null, 2)
);
if (ff.exitCode !== 0) fail(`ffmpeg encode failed:\n${ffErr}`);
console.log(`render: mp4 done in ${((Date.now() - t0) / 1000).toFixed(1)}s (${audit.length} layout audits)`);

// ---------- optional re-encodes: webm, gif ----------
function runFfmpeg(fargs, label) {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...fargs], { encoding: "utf8", timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) fail(`ffmpeg ${label} failed:\n${r.stderr}`);
}

if (formats.has("webm")) {
  console.log("render: webm (vp9)…");
  runFfmpeg(
    ["-i", mp4File, "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "5", "-crf", "32", "-b:v", "0", "-pix_fmt", "yuv420p", path.join(outDir, "video.webm")],
    "webm"
  );
  console.log(`render: webm -> ${path.join(outDir, "video.webm")}`);
}

if (formats.has("gif")) {
  console.log("render: gif (palettegen)…");
  const gifPath = path.join(outDir, "video.gif");
  const TARGET = 8 * 1024 * 1024;
  const tries = [
    { fps: 12, scale: 0.30 },
    { fps: 10, scale: 0.22 },
    { fps: 8, scale: 0.16 },
  ];
  let done = false;
  for (const tr of tries) {
    const w = Math.max(160, Math.round(preset.w * tr.scale) & ~1);
    runFfmpeg(
      [
        "-i", mp4File,
        "-vf", `fps=${tr.fps},scale=${w}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
        "-loop", "0", "-an", gifPath,
      ],
      "gif"
    );
    if (statSync(gifPath).size <= TARGET) {
      console.log(`render: gif -> ${gifPath} (${(statSync(gifPath).size / 1024 / 1024).toFixed(1)} MB, ${w}px @${tr.fps}fps)`);
      done = true;
      break;
    }
    console.log(`render: gif ${(statSync(gifPath).size / 1024 / 1024).toFixed(1)} MB over target, shrinking…`);
  }
  if (!done) console.error(`render: warning — gif still over target after shrink loop; keeping last attempt (mp4 remains first-class)`);
}
console.log("render: done");
