/* highlights scene — bulleted list of the release's notable changes.
   data: { items: [{ type: "feat|fix|perf|removed|docs|tests|build|changed", text: "..." }, ...] } */
window.SCENES.highlights = {
  build({ tl, scene, start, dur }) {
    const d = scene.data || {};
    const items = Array.isArray(d.items) ? d.items.slice(0, 8) : [];
    const { el, content } = window.__sceneKit(scene);
    content.insertAdjacentHTML(
      "beforeend",
      `
      <div class="g2v-hl-head g2v-check" style="position:absolute;left:0;top:9%">
        <div style="font-size:.30rem;letter-spacing:.05em;color:var(--fg-dim);font-variant:small-caps;text-transform:uppercase">what's new</div>
        <div style="height:.05rem;width:6rem;margin-top:.12rem;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:.03rem;transform-origin:left center"></div>
      </div>
      <div class="g2v-hl-list g2v-check" style="position:absolute;left:0;right:1%;top:22%"></div>`
    );
    const list = el.querySelector(".g2v-hl-list");
    const chipColor = {
      feat: "var(--add)", fix: "var(--accent2)", perf: "var(--accent2)", removed: "var(--del)",
      docs: "var(--fg-dim)", tests: "var(--accent)", build: "var(--fg-dim)", changed: "var(--fg-dim)",
    };
    for (const it of items) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:.22rem;align-items:baseline;margin-bottom:.24rem";
      const chip = document.createElement("span");
      chip.style.cssText = `flex:0 0 auto;font-family:var(--mono);font-size:.17rem;padding:.03rem .14rem;border-radius:.06rem;color:${chipColor[it.type] || "var(--fg-dim)"};background:color-mix(in srgb, ${chipColor[it.type] || "var(--fg-dim)"} 14%, transparent);border:1px solid color-mix(in srgb, ${chipColor[it.type] || "var(--fg-dim)"} 40%, transparent)`;
      chip.textContent = it.type || "changed";
      const txt = document.createElement("span");
      txt.style.cssText = "font-size:.30rem;line-height:1.35;font-weight:500";
      txt.textContent = String(it.text || "");
      row.append(chip, txt);
      list.appendChild(row);
    }
    tl.from(el.querySelector(".g2v-hl-head"), { autoAlpha: 0, y: "-0.35rem", duration: 0.5, ease: "power2.out" }, start + 0.12);
    const step = Math.max(0.06, Math.min(0.16, (Math.max(dur - 1.1, 0.4)) / Math.max(items.length, 1)));
    [...list.children].forEach((row, i) => {
      tl.from(row, { autoAlpha: 0, x: "0.6rem", duration: 0.45, ease: "power2.out" }, start + 0.5 + i * step);
    });
    return { node: el };
  },
};
