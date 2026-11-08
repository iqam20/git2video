/* breaking scene — alert cards for breaking changes.
   data: { items: [{ summary: "...", action?: "what to do" }, ...] }  (1..3 items) */
window.SCENES.breaking = {
  build({ tl, scene, start, dur }) {
    const d = scene.data || {};
    const items = Array.isArray(d.items) ? d.items.slice(0, 3) : [];
    const { el, content } = window.__sceneKit(scene);
    content.insertAdjacentHTML(
      "beforeend",
      `
      <div class="g2v-br-head g2v-check" style="position:absolute;left:0;top:12%;display:flex;align-items:center;gap:.18rem">
        <span style="display:inline-flex;width:.30rem;height:.30rem;border-radius:.06rem;background:var(--del);color:var(--bg);font-weight:800;font-size:.22rem;align-items:center;justify-content:center">!</span>
        <span style="font-size:.32rem;font-weight:700;letter-spacing:.04em;color:var(--del);text-transform:uppercase">breaking changes</span>
      </div>
      <div class="g2v-br-list g2v-check" style="position:absolute;left:0;right:2%;top:27%"></div>`
    );
    const list = el.querySelector(".g2v-br-list");
    for (const it of items) {
      const card = document.createElement("div");
      card.style.cssText = `margin-bottom:.3rem;padding:.26rem .3rem;border-left:.055rem solid var(--del);border-radius:.06rem;background:color-mix(in srgb, var(--del) 7%, transparent)`;
      const sum = document.createElement("div");
      sum.style.cssText = "font-size:.30rem;font-weight:600;line-height:1.35";
      sum.textContent = String(it.summary || "");
      card.appendChild(sum);
      if (it.action) {
        const act = document.createElement("div");
        act.style.cssText = "font-size:.21rem;color:var(--fg-dim);margin-top:.08rem";
        act.innerHTML = "&rarr; ";
        act.appendChild(document.createTextNode(String(it.action)));
        card.appendChild(act);
      }
      list.appendChild(card);
    }
    tl.from(el.querySelector(".g2v-br-head"), { autoAlpha: 0, x: "-0.4rem", duration: 0.45, ease: "power2.out" }, start + 0.12);
    [...list.children].forEach((card, i) => {
      const step = Math.max(0.1, Math.min(0.5, (dur - 1.4) / Math.max(items.length, 1)));
      tl.from(card, { autoAlpha: 0, y: "0.4rem", duration: 0.5, ease: "power2.out" }, start + 0.5 + i * step);
    });
    return { node: el };
  },
};
