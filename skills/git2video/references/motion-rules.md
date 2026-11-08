# motion-rules.md — how scenes may move

The renderer plays ONE master timeline (built by `templates/anim.js`, a small
MIT tween engine — gsap dependency was dropped, see PLAN.md amendment). Scenes
register `window.SCENES.<type>.build({ tl, scene, start, dur, preset })` and may
only use:

```js
tl.from(el, { autoAlpha: 0, y: "0.4rem", duration: 0.5, ease: "power2.out" }, start + offset);
tl.set(el, { autoAlpha: 0 }, start + offset);      // hard state (also '__text' for count-ups)
tl.to(dummyObj, vars, start + offset, padDuration); // padding objects only, never elements
```

## Allowed props

`x, y` (px, or rem strings like `"+0.6rem"` = relative to natural),
`scale, scaleX, scaleY` (unitless), `rotate` (deg), `autoAlpha` (opacity +
visibility). `from()` semantically: the values you pass are the START; the tween
lands on the element's natural CSS state; before the tween's start time the
element HOLDS the start value (no natural-state flash). `autoAlpha` landings
always end fully visible.

## Eases (fully enumeratable; deterministic)

`none, power1.out, power2.out, power3.out, power2.in, power2.inOut, power3.inOut`.

## Timing rules (why videos feel right)

- One idea per scene; first motion within 0.15s of scene start.
- Stagger steps 0.04–0.2s, scaled to fit `dur` (scenes clamp their last tween to
  end ≥ 0.15s before the slot's end — the engine throws on slot overflow).
- Fade-ins 0.3–0.55s; underlines scaleX 0.5s `power2.inOut`.
- No springy/back eases (they overshoot the safe area); no random values; no
  `Date.now()` anywhere in scenes — same storyboard in = same movie out.
- Narrative pacing: counts-up for stats; pops-in for people; zoom-settle (scale
  1.05→1.0, `power2.out`, 0.55s) for code.
