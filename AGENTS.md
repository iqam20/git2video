# AGENTS.md — git2video

Orientation for any agent or human resuming work in this repo. Read this first.

## What this is

An MIT agent skill (`skills/git2video/`, Agent Skills format: SKILL.md with
`name`+`description` frontmatter only) + deterministic scripts that turn a git
repo's history (tags, commits, diffs) into a polished release video:
MP4 (+ optional WebM/GIF), fully offline, free, with a scripted QA loop.
Status and phase tracking live in **PLAN.md**. Roadmap items live in **ROADMAP.md**.

## Repo layout

```
skills/git2video/          the installable skill (SKILL.md, scripts/, references/, templates/, agents/)
scripts/                   may not exist; skill scripts live under skills/git2video/scripts
tests/                     node:test suites; fixture git repos created programmatically
examples/                  dogfood renders (Phase 7+)
launch/                    HN/X/LinkedIn/Reddit drafts, pitch (Phase 8)
.github/workflows/ci.yml   CI skeleton from Phase 1
PLAN.md AGENTS.md ROADMAP.md README.md LICENSE(MIT) package.json
```

## Working rules (strict)

1. One PHASE at a time. At phase end: STOP, summarize what works/tested/not-done, wait for user "go".
2. Run it, fix it, commit it. Never leave the repo broken. Clear commit messages.
3. Never invent APIs/flags/package names — verify via `--help`, docs, or shell tests.
4. No placeholder/TODO/mock code presented as real; stretch goals → ROADMAP.md only.
5. Free & open: MIT, no paid APIs, no API keys, no network at render time.
6. Security: emails/secrets never in output; scrub env before third-party commands;
   secret-regex scrub on diff content.
7. SKILL.md stays under ~150 lines; details go in references/, logic in scripts/.
8. Cross-platform core: Node (.mjs) only in the main path; no bash-only logic.
9. Renders deterministic: seeded PRNG, no Date.now(), no remote assets, network blocked.

## Commands

```bash
npm install                                   # install deps (playwright, gsap, highlight.js)
npx playwright install chromium              # after npm install, once
node skills/git2video/scripts/doctor.mjs     # env check: node/ffmpeg/playwright (+optional)
node skills/git2video/scripts/collect.mjs --repo . --from <tag> --to HEAD
node skills/git2video/scripts/validate.mjs --storyboard out/storyboard.json
node skills/git2video/scripts/render.mjs --storyboard out/storyboard.json --out out --preset 16:9
node skills/git2video/scripts/qa.mjs --storyboard out/storyboard.json --out out
node --test tests/                           # run all tests
```

(Doctor/collect/etc. may not exist yet — check PLAN.md phase checklist.)

## Conventions

- Node >= 20, ESM (`"type":"module"`), `node:test` + `node:assert` for tests.
- Scripts: POSIX-style flags (--repo, --from, --out), JSON to files, human errors to
  stderr with exit codes ≠ 0. Print JSON machine-readable on stdout where noted.
- Story flow: collect → (agent) storyboard.json → validate → render → qa → deliver.
- 5% safe area; reading-time ≥ 0.35 s/word; presets 16:9@1920, 9:16@1080, 1:1@1080.
- Video encoding: H.264, yuv420p, `-movflags +faststart`, CRF ≈ 18.
- Themes are CSS variable files: dark, light, neon. Scenes registered as functions
  building tweens onto the master GSAP timeline, returning duration.
- Render contract in templates: `window.__duration`, `window.__seek(t)`.

## Phase map (details + status in PLAN.md §7)

0 Plan/research → 1 scaffold+doctor+CI → 2 collect → 3 render core+title →
4 scenes/themes/formats → 5 voice/captions/music → 6 QA+SKILL.md → 7 dogfood →
8 README/launch/audit.

## Closest prior art (keep comparisons honest)

FavioVazquez/showtime (release-notes/PR video), oxygenframe/oxframe, Remotion skills,
video-shotcraft, claude-motion (contact-sheet self-review), videogit, git-story.
Full table in PLAN.md §2.
