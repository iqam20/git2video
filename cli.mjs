#!/usr/bin/env node
// cli.mjs — thin dispatcher for the git2video scripts.
//   node cli.mjs <doctor|collect|validate|render|qa> [args...]
// All args are passed through to the underlying script unchanged.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = {
  doctor: "skills/git2video/scripts/doctor.mjs",
  collect: "skills/git2video/scripts/collect.mjs",
  validate: "skills/git2video/scripts/validate.mjs",
  render: "skills/git2video/scripts/render.mjs",
  qa: "skills/git2video/scripts/qa.mjs",
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === "--help" || cmd === "-h") {
  console.log(`git2video — git history to release video, fully offline

Usage: node cli.mjs <command> [args...]

Commands:
  doctor     environment check (node, ffmpeg, playwright chromium, ...)
  collect    git history -> story.json   (flags: --repo --from --to --max-commits --out ...)
  validate   check a storyboard.json     (flags: --storyboard --story --min --max)
  render     storyboard -> mp4/webm/gif  (flags: --storyboard --out --preset --fps --theme --formats)
  qa         scripted QA gate            (flags: --storyboard --out --preset)

Run '<command> --help' for that script's own usage.`);
  process.exit(cmd ? 0 : 2);
}
const script = SCRIPTS[cmd];
if (!script) {
  console.error(`git2video: unknown command "${cmd}" (--help for the list)`);
  process.exit(2);
}
const r = spawnSync(process.execPath, [path.join(here, script), ...rest], { stdio: "inherit" });
process.exit(r.status ?? 1);
