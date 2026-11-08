# ROADMAP.md — git2video

Updated Nov 2026. Phases 0–7 done (see PLAN.md §7); everything below is future work.
Order = rough priority. Non-goals stay non-goals (PLAN.md §9): no cloud rendering,
no hosted service, no auto-posting.

## Next

1. **Release-video GitHub Action.** `.github/workflows/release-video.yml` example:
   on tag push → collect → render → attach mp4 to the GitHub Release. Auto-renders
   need a storyboard without an agent: add a `--template minimal` flag that builds a
   standards-conformant storyboard from story.json directly (title/highlights/stats/
   outro only, narration = caption text). Test with `act` if available, else document.
2. **Voiceover + music (Phase 5 full).** `--voice piper|espeak|none` with graceful
   doctor-detected fallback; narration timing table already validated (0.35s/word);
   procedural music bed (ffmpeg lavfi), loudnorm ≈ −16 LUFS, low mix. CI runs the
   silent path only; audio path skipped-with-message where deps are absent.
3. **`validate`/`qa` unit tests** on deliberately broken storyboards (overflowing
   caption caught, traces to missing sha rejected, order-order violations).
4. **agents/openai.yaml** (Codex metadata) — SKILL.md frontmatter already
   OpenAI-compatible; yaml adds install hints per Agent Skills registry.
5. **Light/neon example renders** + a 9:16 vertical cut of the dogfood reel.
6. **Font determinism.** Bundle an OFL font (Inter/JetBrains Mono subset) or document
   cross-machine byte-difference limits precisely.
7. **GIF auto-shrink target 5MB** — current loop targets 8MB; measure real-world
   sizes and tighten.
8. **Showtime/oxframe feature-parity check** — quarterly re-verify PLAN.md §2 table
   claims before each release (keep comparisons honest).

## Open questions

- `npx skills add <owner>/<repo>` exact registry contract (verify against
  vercel-labs/skills) before claiming install-path support.
- GIF palette for diff scenes (green/red lines get muddy at 16px width).
- Contributor consent: names are opt-in already; consider `--anonymize-names` alias.
