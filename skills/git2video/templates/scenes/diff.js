/* diff scene — one sanitized code hunk, diff-native coloring (no syntax library).
   data: { file: "src/app.ts", sha: "a1b2c3d...", code: "+line\n-line\n context", lang?: } */
window.SCENES.diff = {
  build({ tl, scene, start, dur }) {
    const d = scene.data || {};
    const { el, content } = window.__sceneKit(scene);
    content.insertAdjacentHTML(
      "beforeend",
      `
      <div style="position:absolute;left:0;right:0;top:10%">
        <div class="g2v-diff-file g2v-check" style="display:flex;align-items:center;gap:.2rem;margin-bottom:.22rem">
          <span class="g2v-diff-name" style="font-family:var(--mono);font-size:.24rem;color:var(--fg)"></span>
          <span class="g2v-diff-sha" style="font-family:var(--mono);font-size:.18rem;color:var(--fg-dim);padding:.02rem .12rem;border:1px solid color-mix(in srgb, var(--fg-dim) 35%, transparent);border-radius:.05rem"></span>
        </div>
        <pre class="g2v-diff-code g2v-check" style="margin:0;padding:.26rem .3rem;width:100%;box-sizing:border-box;font-family:var(--mono);font-size:.17rem;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;background:color-mix(in srgb, var(--fg) 4%, transparent);border-radius:.1rem;border:1px solid color-mix(in srgb, var(--fg) 8%, transparent)"></pre>
      </div>`
    );
    el.querySelector(".g2v-diff-name").textContent = d.file || "diff";
    el.querySelector(".g2v-diff-sha").textContent = String(d.sha || "").slice(0, 7) || "diff";
    const pre = el.querySelector(".g2v-diff-code");
    const cls = {
      "+": "c-add", "-": "c-del", "@": "c-hunk",
    };
    const css = document.createElement("style");
    css.textContent = `.g2v-diff-code .c-add{color:var(--add);background:color-mix(in srgb, var(--add) 9%, transparent);display:inline-block;width:100%}
.g2v-diff-code .c-del{color:var(--del);background:color-mix(in srgb, var(--del) 9%, transparent);display:inline-block;width:100%}
.g2v-diff-code .c-hunk{color:var(--muted)}
.g2v-diff-code .c-ctx{color:var(--fg-dim)}`;
    content.appendChild(css);
    const lines = String(d.code || "").split("\n").slice(0, 40);
    for (const raw of lines) {
      const line = document.createElement("span");
      line.className = cls[raw[0]] || "c-ctx";
      line.style.cssText = "display:block";
      line.textContent = raw.length ? raw : " ";
      pre.appendChild(line);
      pre.appendChild(document.createTextNode("\n"));
    }
    tl.from(el.querySelector(".g2v-diff-file"), { autoAlpha: 0, y: "-0.3rem", duration: 0.45, ease: "power2.out" }, start + 0.12);
    // no scale entrance: pre spans the safe area edge-to-edge, so any scale >1
    // is outside the 5% safe area during the animation. alpha + settle only.
    tl.from(pre, { autoAlpha: 0, duration: 0.55, ease: "power2.out" }, start + 0.34);
    tl.from(pre, { y: "0.25rem", duration: Math.max(0.5, dur - 0.9), ease: "none" }, start + 0.34);
    return { node: el };
  },
};
