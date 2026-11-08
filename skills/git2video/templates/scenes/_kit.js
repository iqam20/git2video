/* shared scene kit: full-bleed scene node + safe content wrapper.
   Scene DOM tree:  #stage > .g2v-scene (inset:0, full bleed) > .safe (5% margins) > content */
window.__sceneKit = function __sceneKit(scene) {
  const stage = document.getElementById("stage");
  const el = document.createElement("div");
  el.className = "g2v-scene";
  el.setAttribute("data-scene", scene.id || scene.type);
  const content = document.createElement("div");
  content.className = "safe";
  el.appendChild(content);
  stage.appendChild(el);
  return { el, content };
};
