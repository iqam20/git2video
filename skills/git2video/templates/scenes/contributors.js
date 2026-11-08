/* contributors scene — name chips (opt-in; contributors with --include-contributors only).
   data: { names: ["Ada", "Grace", ...] }  (1..12 names) */
window.SCENES.contributors = {
  build({ tl, scene, start, dur }) {
    const d = scene.data || {};
    const names = Array.isArray(d.names) ? d.names.slice(0, 12) : [];
    const { el, content } = window.__sceneKit(scene);
    content.insertAdjacentHTML(
      "beforeend",
      `
      <div class="g2v-cb-head g2v-check" style="position:absolute;left:0;top:16%;font-size:.30rem;color:var(--fg-dim);font-variant:small-caps;text-transform:uppercase;letter-spacing:.05em"></div>
      <div class="g2v-cb-chips g2v-check" style="position:absolute;left:0;right:0;top:34%;display:flex;flex-wrap:wrap;gap:.16rem"></div>`
    );
    el.querySelector(".g2v-cb-head").textContent = `thanks to ${names.length} contributor${names.length === 1 ? "" : "s"}`;
    const chips = el.querySelector(".g2v-cb-chips");
    for (const n of names) {
      const chip = document.createElement("span");
      chip.style.cssText = `font-size:.26rem;font-weight:600;padding:.1rem .24rem;border-radius:999px;border:1px solid color-mix(in srgb, var(--accent2) 45%, transparent);background:color-mix(in srgb, var(--accent2) 12%, transparent)`;
      chip.textContent = String(n).replace(/[<>&]/g, "");
      chips.appendChild(chip);
    }
    tl.from(el.querySelector(".g2v-cb-head"), { autoAlpha: 0, duration: 0.4, ease: "none" }, start + 0.12);
    const step = Math.max(0.04, Math.min(0.12, (dur - 1.1) / Math.max(names.length, 1)));
    [...chips.children].forEach((chip, i) => {
      tl.from(chip, { autoAlpha: 0, scale: 0.6, duration: 0.4, ease: "power2.out" }, start + 0.5 + i * step);
    });
    return { node: el };
  },
};
