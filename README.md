# git2video

**Point your agent (or CI) at any git repo and get a polished release video in one
prompt — accurate to the history, fully offline, free, MIT.**

`git history → story.json → storyboard.json → video.mp4 (+ webm/gif)`

✨ **v0.1.0** ships as its own announcement: [`examples/git2video/video.mp4`](examples/git2video/video.mp4)
— rendered from this repo's actual git history following [SKILL.md](skills/git2video/SKILL.md) literally.

## What it does

| Script | Role |
|---|---|
| `scripts/doctor.mjs` | Environment check (Node 22+, ffmpeg/ffprobe, Playwright Chromium; optional gh/piper/espeak) |
| `scripts/collect.mjs` | Real git history → `story.json`: grouped Conventional Commits, breaking changes, PRs (optional `--gh`), stats, notable diff hunks — **regex secret-scrub**, contributor emails never enter output |
| `scripts/validate.mjs` | Storyboard gate against `references/storyboard.schema.json`: scene order, durations, reading-time rule, and **every claim must trace to real commit SHAs in story.json** |
| `scripts/render.mjs` | Deterministic engine: inline HTML + paused GSAP timeline + Playwright → jpeg frames → ffmpeg `image2pipe` → H.264 (yuv420p, faststart). WebM/GIF from the MP4. Network requests are blocked and fail the render. Layout audit written to `out/layout-audit.json` |
| `scripts/qa.mjs` | Scripted gate: duration/resolution/codec, per-scene frame variance (blank detection), in-page safe-area/overflow audit → `out/qa/report.json` + `report.md` |

Scenes: **title, highlights, diff, stats, timeline, breaking, contributors, outro**.
Themes: **dark, light, neon** (CSS variables). Presets: **16:9@1920, 9:16@1080, 1:1@1080**, 30/60 fps.

## The differentiators

1. **Real history, traceable claims.** Validates every scene `source` against story.json
   commit SHAs. If the repo's history doesn't support a scene, skip it — invent nothing.
2. **Deterministic, local.** Seeded easing, no `Date.now()`, no remote assets, network
   blocked; two renders of the same storyboard are byte-identical (tested).
3. **Privacy-safe.** Secret-looking diff content (aws keys, `ghp_`/`sk-`/`bearer`, PEM
   headers) is scrubbed per hunk (tested); emails never in output (tested).
4. **Free.** MIT engine, no Remotion, no license keys, no CDN, no cloud.

## Honest comparison

| Tool | Reads | License/limits |
|---|---|---|
| [FavioVazquez/showtime](https://github.com/FavioVazquez/showtime) | release notes / PR text via gh | closest local rival; no git-only fallback, no storyboard contract, advisory QA |
| oxygenframe/oxframe | release notes → template video | notes-driven, no diff/stats scenes |
| Remotion skill ecosystem | agent-authored React | needs a Remotion project; licensing |
| videogit / git-story | commits → code typing / DAG animation | single visual style, not a release story |

SaaS (release.show, DevReel): accounts, uploads, your code leaving your machine.
git2video is the git-first, offline, scripted-QA option. We don't *render* audio yet —
v0.1 is silent with narration burned as captions (see [ROADMAP](ROADMAP.md)).

## Install

```bash
# as an agent skill (Agent Skills format: skills/git2video/SKILL.md)
npx skills add iqam20/git2video       # or clone and copy skills/git2video into your agents dir

# standalone CLI
npm install -g iqam20/git2video      # node cli.mjs doctor|collect|validate|render|qa
```

Requirements: Node ≥ 22, ffmpeg + ffprobe, `npm install` and `npx playwright install chromium`.
Run `node skills/git2video/scripts/doctor.mjs` first — it prints per-OS install hints.

## Usage (agent flow)

```
1 doctor → 2 collect --repo <dir> → 3 (agent authors storyboard.json per
references/storyboard-guide.md) → 4 validate → 5 render → 6 qa
PASS → deliver · FAIL → fix storyboard, max 3 loops
```

## Status

Phases 0–7 done (plan, scaffold+doctor+CI, collect, render engine+scenes+themes+formats,
captions, QA+SKILL.md, dogfood). Not yet: voiceover/music (v0.1 silent), release video
GitHub Action, `launch/`. See [ROADMAP.md](ROADMAP.md) and [PLAN.md](PLAN.md).

## Development

```bash
npm install && npx playwright install chromium
npm test        # 10 tests: collect/scrub fixtures + golden deterministic render
```
