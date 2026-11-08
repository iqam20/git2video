/* title scene — version + repo name + date, animated gradient background.
   scene.data: { label: "v1.4.0", repo: "acme/widget", tagline?: "...", date?: "YYYY-MM-DD" } */
window.SCENES.title = {
  minDuration: 1.6,
  build({ tl, scene, start, dur }) {
    const d = scene.data || {};
    const { el, content } = window.__sceneKit(scene);
    content.insertAdjacentHTML(
      "beforeend",
      `
      <div class="g2v-blob-a" style="position:absolute;width:130%;height:130%;left:-38%;top:-55%;background:radial-gradient(closest-side, color-mix(in srgb, var(--accent) 60%, transparent), color-mix(in srgb, var(--accent) 14%, transparent) 55%, transparent 85%)"></div>
      <div class="g2v-blob-b" style="position:absolute;width:110%;height:110%;right:-35%;bottom:-50%;background:radial-gradient(closest-side, color-mix(in srgb, var(--accent2) 46%, transparent), color-mix(in srgb, var(--accent2) 11%, transparent) 55%, transparent 85%)"></div>
      <div style="position:absolute;inset:0">
        <div class="g2v-title-kicker" style="position:absolute;left:0;top:24%;font-size:.30rem;letter-spacing:.045em;color:var(--fg-dim);font-variant:small-caps;text-transform:uppercase"></div>
        <div class="g2v-title-label g2v-check" style="position:absolute;left:0;top:32%;width:100%;font-weight:800;font-size:1.30rem;line-height:1.04;letter-spacing:-0.015em;white-space:nowrap"></div>
        <div class="g2v-title-under" style="position:absolute;left:0;top:51%;height:.055rem;width:10rem;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:.03rem;transform-origin:left center"></div>
        <div class="g2v-title-tagline g2v-check" style="position:absolute;left:0;top:54.5%;font-size:.42rem;font-weight:500;color:var(--fg-dim);max-width:92%"></div>
        <div class="g2v-title-date" style="position:absolute;left:0;bottom:10%;font-size:.26rem;color:var(--muted);font-family:var(--mono)"></div>
      </div>`
    );

    const q = (c) => el.querySelector(c);
    q(".g2v-title-kicker").textContent = d.repo || "release";
    q(".g2v-title-label").textContent = d.label || "What's new";
    q(".g2v-title-tagline").textContent = d.tagline || "";
    q(".g2v-title-date").textContent = d.date || "";

    tl.from(el.querySelector(".g2v-blob-a"), { x: "+6rem", y: "+4rem", duration: Math.min(3.4, dur), ease: "none" }, start);
    tl.from(el.querySelector(".g2v-blob-b"), { x: "-7rem", y: "-3rem", duration: Math.min(3.4, dur), ease: "none" }, start);
    tl.from(q(".g2v-title-kicker"), { autoAlpha: 0, y: "0.5rem", duration: 0.4, ease: "power2.out" }, start + 0.10);
    tl.from(q(".g2v-title-label"), { autoAlpha: 0, scale: 0.92, duration: 0.55, ease: "power3.out" }, start + 0.22);
    tl.from(q(".g2v-title-under"), { scaleX: 0, duration: 0.5, ease: "power2.inOut" }, start + 0.42);
    tl.from(q(".g2v-title-tagline"), { autoAlpha: 0, y: "0.35rem", duration: 0.42, ease: "power2.out" }, start + 0.62);
    tl.from(q(".g2v-title-date"), { autoAlpha: 0, duration: 0.4, ease: "none" }, start + 0.85);
    return { node: el, min: window.SCENES.title.minDuration };
  },
};
