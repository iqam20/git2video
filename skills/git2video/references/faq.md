# faq.md — troubleshooting git2video

**doctor says MISS** — install hints printed next to each row. Chromium:
`npx playwright install chromium` (after `npm install`). ffmpeg: brew/apt/winget.

**render.Page boot failed / __duration missing** — a scene threw at build; check
the storyboard's `data` against references/storyboard-guide.md shapes and rerun
validate.mjs first.

**render: remote assets are not allowed** — a scene inlined an http(s) asset.
All styling must come from the theme files; fix the scene, never add http asset.

**qa: layout violation "outside safe area"** — text too big/long for the slot.
Shorten the copy, reduce the duration, or trim the item list; re-run render+qa.
Violation entries in qa/report.json include the offending text and rect.

**qa: near-blank frame** — the sampled time fell inside a scene's hold with no
motion and no content (very short scene in a long slot?). Lengthen the scene's
content beat or reduce its duration.

**Two renders of the same storyboard differ** — determinism is asserted by
tests (same machine). Causes seen in the wild: theme file edited mid-run,
remote asset sneaked in (blocked + fails loudly), or a scene used
`Math.random`/`Date.now` (forbidden; see motion-rules.md).

**Windows**: all scripted steps are Node (.mjs) — no bash required; PATH needs
git/ffmpeg/ffprobe/node resolvable in the same shell.

**Can I use my own logo/branding?** Not in v0.1 (asset inlining together with
the network ban is a roadmap item; theming via the three CSS themes is today's
branding story).
