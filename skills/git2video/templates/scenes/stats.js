/* stats scene — animated count-up of release numbers.
   data: { commits: 14, files: 23, additions: 1820, deletions: 217, contributors?: 5 } */
window.SCENES.stats = {
  build({ tl, scene, start, dur }) {
    const d = scene.data || {};
    const { el, content } = window.__sceneKit(scene);
    content.insertAdjacentHTML(
      "beforeend",
      `<div class="g2v-stats-row g2v-check" style="position:absolute;left:0;right:0;top:34%;display:flex;justify-content:center;gap:1.1rem;flex-wrap:wrap"></div>`
    );
    const row = el.querySelector(".g2v-stats-row");
    const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const stats = [
      { n: d.commits, label: "commits", color: "var(--fg)", sign: "" },
      { n: d.files, label: "files changed", color: "var(--fg)", sign: "" },
      { n: d.additions, label: "added", color: "var(--add)", sign: "+" },
      { n: d.deletions, label: "removed", color: "var(--del)", sign: "-" },
    ];
    if (typeof d.contributors === "number" && d.contributors > 0) {
      stats.push({ n: d.contributors, label: "contributors", color: "var(--accent2)", sign: "" });
    }
    const numEls = [];
    for (const s of stats.filter((x) => typeof x.n === "number")) {
      const cell = document.createElement("div");
      cell.style.cssText = "text-align:center";
      const num = document.createElement("div");
      num.style.cssText = `font-size:.72rem;font-weight:800;letter-spacing:-0.02em;color:${s.color};font-variant-numeric:tabular-nums`;
      num.textContent = s.sign + "0";
      const cap = document.createElement("div");
      cap.style.cssText = "font-size:.20rem;color:var(--fg-dim);text-transform:uppercase;letter-spacing:.06em;margin-top:.06rem";
      cap.textContent = s.label;
      cell.append(num, cap);
      row.appendChild(cell);
      numEls.push([num, s]);
    }
    tl.from(row, { autoAlpha: 0, y: "0.4rem", duration: 0.5, ease: "power2.out" }, start + 0.15);
    // deterministic count-up: discrete text sets on the timeline, ease cubic out
    const steps = Math.max(6, Math.min(28, Math.round(dur * 6)));
    const spanT = Math.max(0.2, dur - 1.15);
    for (const [num, s] of numEls) {
      tl.set(num, { __text: s.sign + "0" }, start);
      for (let k = 1; k <= steps; k++) {
        const u = k / steps;
        const eased = 1 - Math.pow(1 - u, 3);
        tl.set(num, { __text: s.sign + fmt(s.n * eased) }, start + 0.45 + spanT * u);
      }
      tl.set(num, { __text: s.sign + fmt(s.n) }, start + 0.45 + spanT);
    }
    return { node: el };
  },
};
