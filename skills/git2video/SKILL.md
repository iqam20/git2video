---
name: git2video
description: Turn a git repo's real history (tags, commits, diffs) into a polished release video — MP4/WebM/GIF, fully offline, free, with a scripted QA loop. Use when the user asks for a release video, changelog video, announcement clip, or "video for this release" from a repository.
---

# git2video — release video from real git history

Reads a repo's actual git history and produces an accurate, polished release
video: **collect → storyboard → validate → render → qa → deliver**. Runs 100%
locally (Node ≥ 22, ffmpeg, Playwright Chromium — check with `doctor` first).
No network at render time; secrets are scrubbed from diff hunks; emails never
appear in output.

```
skills/git2video/scripts/doctor.mjs     # check the environment, fix MISSING rows
scripts/collect.mjs                     # git -> story.json (grouped commits, breaking, stats, sanitized hunks)
scripts/validate.mjs                    # audio-less storyboard must pass before render
scripts/render.mjs                      # storyboard -> video.mp4 (+ webm/gif), layout-audit.json
scripts/qa.mjs                          # scripted gate: report.json + report.md in out/qa/
references/storyboard-guide.md          # scene types, data shapes, writing rules — read before authoring
references/faq.md                       # troubleshooting
```

## Workflow

**1. Collect the history.**

```bash
node skills/git2video/scripts/collect.mjs --repo <repo-dir> --out /tmp/g2v/story.json \
  [--from <tag|sha|YYYY-MM-DD>] [--to HEAD] [--max-commits 400] [--include-contributors] [--gh]
```
Defaults: last tag → HEAD; no tag: last 30 days. Read /tmp/g2v/story.json after.

**2. Author storyboard.json** (you, the agent — read references/storyboard-guide.md
first). Rule of thumb for a 30–45s release video:

```
title (3–4s) → highlights (5–8s) → diff (5–8s) → stats (4–5s) →
timeline (optional 4–6s) → breaking (3–5s, only if any) →
contributors (3–5s, only with --include-contributors) → outro (3–4s)
```
Every scene carries: `id`, `type`, `duration` (0.8–15s), `narration`
(≤ 2 sentences; readable in the slot at 0.35s/word), `source` (commit shas that
back the claims), `data` (type-specific — shapes in the guide). Claims must trace
to story.json — invent nothing.

**3. Validate.**

```bash
node skills/git2video/scripts/validate.mjs --storyboard /tmp/g2v/storyboard.json \
  --story /tmp/g2v/story.json
```
Fix every error before rendering. Widen the total-duration window for a demo with
`--min/--max` only when the user asked for a short test clip.

**4. Render.**

```bash
node skills/git2video/scripts/render.mjs --storyboard /tmp/g2v/storyboard.json \
  --out /tmp/g2v --preset 16:9 --fps 30 --theme dark [--formats mp4,webm,gif]
```
Presets: 16:9@1920, 9:16@1080, 1:1@1080. Themes: dark (default), light, neon.
Renders are deterministic on a machine; ~2–4 min for a 40s 30fps video. v0.1 is
silent: narration is burned as captions automatically.

**5. QA (scripted, not vibes).**

```bash
node skills/git2video/scripts/qa.mjs --storyboard /tmp/g2v/storyboard.json --out /tmp/g2v
```
Read out/qa/report.md. PASS → deliver. FAIL → look at report.json details, fix
the storyboard, re-render, re-run qa. **Maximum 3 fix loops.** After that, report
honestly what still fails and why.

**6. Deliver.** Tell the user: the absolute path of video.mp4 (+webm/gif), the QA
verdict in one line, any 3rd-loop leftovers, and offer: other preset (vertical),
theme variants (light/neon), or a GIF for README embedding (`--formats gif`).

## Hard rules

- Never invent commits, stats, or diffs: every scene's `source` names real shas
  from story.json. If history doesn't support a scene type, skip the scene.
- Never put contributor emails in output; names only with --include-contributors.
- Don't edit files under skills/git2video/templates/ or scripts/ mid-render; the
  deterministic engine + QA assume them. Scenes/themes/assets styling changes
  only as separate, declared work.
- Prefer fewer, accurate scenes over filler; keep narration ≤ 2 sentences.
