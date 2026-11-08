# design-tokens.md — visual contract of the git2video look

All scene styling derives from these tokens so themes stay swappable. They are
CSS custom properties defined in `templates/base.html` and overridden by
`templates/themes/{dark,light,neon}.css`.

## Color tokens

| token | dark | light | neon | used for |
|---|---|---|---|---|
| `--bg` | #0d1117 | #f7f8fa | #05060f | film background |
| `--fg` | #e6edf3 | #10151d | #f4f7ff | primary text |
| `--fg-dim` | 64% fg | 62% fg | 66% fg | secondary text |
| `--muted` | 42% fg | 42% fg | 42% fg | meta text (dates, shas) |
| `--accent` | #4ade80 | #1a7f4e | #a78bfa | headings underline, denominators of the look |
| `--accent2` | #60a5fa | #155e92 | #22d3ee | secondary emphasis, fix chips |
| `--add` | #4ade80 | #1a7f4e | #34d399 | diff added lines / feat chips |
| `--del` | #f87171 | #b91c1c | #fb7185 | diff removed lines / breaking |

Off-token color is never used in scenes; derived tones use
`color-mix(in srgb, var(--token) N%, transparent)`.

## Typography

- UI text: system stack `var(--font)` (SF/Segoe/Roboto — same-machine
  deterministic; cross-machine metrics documented in PLAN.md as a known variance).
- Code/dates/shas: `var(--mono)`.
- Sizes are in rem against a root font that scales with the preset
  (`min(w/19.2, h/10.8)` in px → 1rem = 100px on 16:9@1080p):
  kicker `.30`, label `1.30`, scene body `.30`, chip `.17`, code `.17`.

## Layout constants

- **Safe area: 5% inset on every side** (`.safe`). Nothing animated may cross it;
  the renderer samples 3 audit points per scene and `qa.mjs` fails on violations.
- Numbers use `font-variant-numeric: tabular-nums` so count-ups don't jitter.
- Scenes are absolutely positioned inside their own full-bleed layer; no global
  document flow — one scene = one `div.g2v-scene > div.safe`.
