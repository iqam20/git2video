/* anim.js — git2video's built-in deterministic tween engine (zero dependencies, MIT).
   Supports exactly what the scene templates need, nothing else:
     tl.from(el, { autoAlpha, x, y, scale, scale via scaleX/scaleY, rotate }, at)  vars = START values, END = natural DOM state
     tl.set(el, { ...same props }, at)                                            hard state from `at` onward
     tl.to(obj, vars, at, dur)                                                    plain-object targets only (timeline padding)
     tl.duration() / tl.time(t)
   Every seek replays all events chronologically, so the page is a pure function
   of t: same input frame -> same pixels, every run, every machine.
   Replaces gsap, whose npm package ships a "Standard 'no charge'" commercial
   license rather than MIT (see PLAN.md amendment). */
window.__Anim = (function () {
  const PROPS = ["x", "y", "scale", "scaleX", "scaleY", "rotate", "autoAlpha"];
  const UNITFUL = new Set(["x", "y", "rotate"]); // these animate in px / deg; scale props are unitless

  function remPx() {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }
  // "6rem" -> px (scaled by root font size), "+4rem"/"-0.3rem" -> relative to `base`, numbers -> raw.
  function parseVal(v, base, prop) {
    if (typeof v === "number") return v;
    const m = /^([+-])?(\d*\.?\d+)(rem|em)?$/.exec(String(v).trim());
    if (!m) return Number(v) || 0;
    let n = parseFloat(m[2]);
    if (m[3]) n *= remPx();
    if (m[1] === "+") n = (base || 0) + Math.abs(n);
    if (m[1] === "-") n = (base || 0) - Math.abs(n);
    return n;
  }
  function fmt(prop, n) {
    return UNITFUL.has(prop) ? (prop === "rotate" ? n + "deg" : n + "px") : String(n);
  }

  const EASE = {
    none: (t) => t,
    "power1.out": (t) => 1 - (1 - t) * (1 - t),
    "power2.out": (t) => 1 - Math.pow(1 - t, 3),
    "power3.out": (t) => 1 - Math.pow(1 - t, 4),
    "power2.in": (t) => t * t * t,
    "power2.inOut": (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    "power3.inOut": (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  };

  const freshState = () => ({ x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, autoAlpha: 1 });
  const transformString = (p) =>
    `translate(${fmt("x", p.x)}, ${fmt("y", p.y)}) rotate(${fmt("rotate", p.rotate)}) scale(${p.scaleX * p.scale}, ${p.scaleY * p.scale})`;

  // The element's "natural" pre-animation state (what plain CSS lays out), captured
  // at build time so seeks are pure: state(t) depends only on captured values.
  function natural(el) {
    const cs = getComputedStyle(el);
    const o = freshState();
    o.autoAlpha = cs.visibility === "hidden" ? 0 : Math.max(0, Math.min(1, parseFloat(cs.opacity)));
    if (Number.isNaN(o.autoAlpha)) o.autoAlpha = 1;
    return o;
  }

  function paint(el, st) {
    el.style.opacity = String(Math.max(0, Math.min(1, st.autoAlpha)));
    el.style.visibility = st.autoAlpha > 0.001 ? "visible" : "hidden";
    el.style.transform = transformString(st);
  }

  function Timeline() {
    const events = []; // {kind:'tween'|'set', el|null, vars, at, dur, ease, base}

    function add(kind, target, vars, at, dur, ease) {
      const isEl = target && target.nodeType === 1;
      if ((kind === "set" || kind === "from") && !isEl) {
        throw new Error("anim.js: tl." + kind + "() needs a DOM element target");
      }
      if (dur < 0) throw new Error("anim.js: negative duration");
      const base = isEl ? natural(target) : null;
      if (base && kind === "from") base.autoAlpha = 1; // fade-in landings always end fully visible
      events.push({
        kind,
        el: isEl ? target : null,
        vars: vars || {},
        at,
        dur,
        ease: EASE[ease] || EASE.none,
        base,
      });
      events.sort((a, b) => a.at - b.at || ((a.kind === "set" ? -1 : 0) - (b.kind === "set" ? -1 : 0)));
      return target;
    }

    return {
      from(target, vars, at) {
        const dur = vars && typeof vars.duration === "number" ? vars.duration : 0.5;
        return add("from", target, vars, at, dur, vars && vars.ease);
      },
      set(target, vars, at) {
        return add("set", target, vars, at, 0, "none");
      },
      // plain-object targets only (padding); element tweens go through from/set by design
      to(target, vars, at, dur) {
        if (target instanceof Element) throw new Error('anim.js: tl.to() on elements is not supported — use tl.from()/tl.set()');
        return add("pad", target, vars, at, dur, "none");
      },
      duration() {
        return events.reduce((d, e) => Math.max(d, e.at + e.dur), 0);
      },
      time(t) {
        for (const e of events) if (e.el) e.el.__g2v = freshState();
        for (const e of events) {
          if (!e.el) continue; // padding: affects duration() only
          if (e.kind === "set" && t < e.at) continue;
          const st = e.el.__g2v;
          for (const prop of PROPS) {
            if (!(prop in e.vars)) continue;
            const base = e.base[prop];
            if (e.kind === "set") {
              st[prop] = parseVal(e.vars[prop], base, prop);
            } else {
              // from(): vars hold the START values; the tween lands on the natural base.
              // Before the tween starts we HOLD the start value (no pre-flash of natural state).
              const v0 = parseVal(e.vars[prop], base, prop);
              const u = (t - e.at) / Math.max(e.dur, 0.0001);
              st[prop] =
                t <= e.at ? v0 : t >= e.at + e.dur ? base : v0 + (base - v0) * e.ease(u);
            }
          }
          if ("__text" in e.vars) e.el.textContent = String(e.vars.__text);
          paint(e.el, st);
        }
        return this.duration();
      },
    };
  }

  return {
    timeline(opts) {
      if (opts && !opts.paused) throw new Error("anim.js: always create timelines paused:true (renders seek explicitly)");
      return Timeline();
    },
    _version: "git2video/anim v1",
  };
})();
