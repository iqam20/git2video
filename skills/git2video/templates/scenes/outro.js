/* outro scene — closing CTA: headline + copy-paste command + repository url.
   data: { headline?: "...", cmd?: "npm i -g git2video", url?: "github.com/you/git2video" } */
window.SCENES.outro = {
  build({ tl, scene, start, dur }) {
    const d = scene.data || {};
    const { el, content } = window.__sceneKit(scene);
    content.insertAdjacentHTML(
      "beforeend",
      `
      <div style="position:absolute;left:0;right:0;top:26%">
        <div class="g2v-ou-head g2v-check" style="text-align:center;font-size:.52rem;font-weight:800;letter-spacing:-0.015em;line-height:1.15"></div>
        <div class="g2v-ou-cmd g2v-check" style="margin:.5rem auto 0;width:max-content;max-width:100%;display:flex;align-items:center;gap:.16rem;padding:.2rem .3rem;border-radius:.1rem;background:color-mix(in srgb, var(--fg) 5%, transparent);border:1px solid color-mix(in srgb, var(--fg) 10%, transparent)">
          <span style="color:var(--accent);font-family:var(--mono);font-size:.24rem">$</span>
          <span class="g2v-ou-cmdtext" style="font-family:var(--mono);font-size:.24rem;white-space:pre-wrap;overflow-wrap:anywhere"></span>
        </div>
        <div class="g2v-ou-url g2v-check" style="margin-top:.28rem;text-align:center;font-family:var(--mono);font-size:.20rem;color:var(--fg-dim);overflow-wrap:anywhere"></div>
      </div>`
    );
    el.querySelector(".g2v-ou-head").textContent = d.headline || "Ship your next release with git2video";
    el.querySelector(".g2v-ou-cmdtext").textContent = d.cmd || "";
    el.querySelector(".g2v-ou-url").textContent = d.url || "";
    // hide the command box entirely when no cmd given
    const cmdBox = el.querySelector(".g2v-ou-cmd");
    if (!d.cmd) cmdBox.style.display = "none";
    const q = (c) => el.querySelector(c);
    tl.from(q(".g2v-ou-head"), { autoAlpha: 0, scale: 0.94, duration: 0.55, ease: "power3.out" }, start + 0.15);
    if (d.cmd) tl.from(cmdBox, { autoAlpha: 0, y: "0.3rem", duration: 0.45, ease: "power2.out" }, start + 0.55);
    tl.from(q(".g2v-ou-url"), { autoAlpha: 0, duration: 0.4, ease: "none" }, start + (d.cmd ? 0.85 : 0.55));
    return { node: el };
  },
};
