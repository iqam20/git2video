/* timeline scene — a horizontal release line with dated milestones.
   data: { points: [{ date: "2026-10-12", label: "first feature complete" }, ...] }  (2..6 points)
   Labels are centered by fixed-width calc() positioning (not transforms: the tween
   engine owns transform on tweened nodes). */
window.SCENES.timeline = {
  build({ tl, scene, start, dur }) {
    const d = scene.data || {};
    const points = Array.isArray(d.points) ? d.points.slice(0, 6) : [];
    const { el, content } = window.__sceneKit(scene);
    content.insertAdjacentHTML(
      "beforeend",
      `<div style="position:absolute;left:4%;right:4%;top:46%;height:.04rem;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:.02rem;transform-origin:left center"></div>`
    );
    const line = content.children[content.children.length - 1];
    tl.from(line, { scaleX: 0, duration: 0.6, ease: "power2.inOut" }, start + 0.15);
    const n = Math.max(1, points.length);
    points.forEach((p, i) => {
      const at = start + 0.55 + (i + 1) * Math.max(0.05, Math.min(0.18, (dur - 1.4) / n));
      const cx = ((i + 0.5) * 100) / n;                       // % across the line
      const anchor = document.createElement("div");           // zero-height anchor on the line
      anchor.style.cssText = `position:absolute;left:calc(${cx}% - 0.05rem);right:auto;top:46%;width:.1rem;height:0`;
      const dot = document.createElement("div");
      dot.className = "g2v-check";
      dot.style.cssText = "position:absolute;top:-.075rem;left:-.075rem;width:.15rem;height:.15rem;border-radius:50%;background:var(--fg);box-shadow:0 0 0 .035rem color-mix(in srgb, var(--accent) 45%, transparent)";
      const dateEl = document.createElement("div");
      dateEl.className = "g2v-check";
      dateEl.style.cssText = `position:absolute;bottom:.3rem;left:-${1.3 - (0.05)}rem;width:2.6rem;text-align:center;font-family:var(--mono);font-size:.17rem;color:var(--muted)`;
      dateEl.textContent = String(p.date || "");
      const lab = document.createElement("div");
      lab.className = "g2v-check";
      lab.style.cssText = `position:absolute;top:.28rem;left:-${1.3 - 0.05}rem;width:2.6rem;text-align:center;font-size:.20rem;line-height:1.3;color:var(--fg-dim)`;
      lab.textContent = String(p.label || "");
      anchor.append(dot, dateEl, lab);
      content.appendChild(anchor);
      tl.from(dot, { scale: 0, duration: 0.35, ease: "power2.out" }, at);
      tl.from(dateEl, { autoAlpha: 0, duration: 0.3, ease: "none" }, at + 0.05);
      tl.from(lab, { autoAlpha: 0, y: "0.16rem", duration: 0.35, ease: "power2.out" }, at + 0.1);
    });
    return { node: el };
  },
};
