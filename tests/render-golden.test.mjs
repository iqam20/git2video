import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const render = path.join(root, "skills/git2video/scripts/render.mjs");
const golden = path.join(root, "tests/fixtures/storyboard.golden.json");

function renderOnce(outDir, fps = 30) {
  execFileSync(
    process.execPath,
    [render, "--storyboard", golden, "--out", outDir, "--fps", String(fps), "--preset", "16:9", "--theme", "dark"],
    { encoding: "utf8", timeout: 240000, maxBuffer: 16 * 1024 * 1024 }
  );
  return {
    mp4: path.join(outDir, "video.mp4"),
    audit: JSON.parse(readFileSync(path.join(outDir, "layout-audit.json"), "utf8")),
  };
}

function ffprobeJson(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], {
    encoding: "utf8", maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(r.status, 0, "ffprobe failed");
  return JSON.parse(r.stdout);
}

function frameStats(file, t, tmp) {
  const png = path.join(tmp, `frame-${t}.png`);
  const x = spawnSync("ffmpeg", ["-y", "-ss", String(t), "-i", file, "-frames:v", "1", png], { encoding: "utf8" });
  assert.equal(x.status, 0, x.stderr);
  const out = spawnSync("ffmpeg", ["-i", png, "-vf", "signalstats,metadata=print", "-f", "null", "-"], { encoding: "utf8" });
  const txt = (out.stderr || "") + (out.stdout || "");
  return {
    ymin: Number(/lavfi\.signalstats\.YMIN=(\d+)/.exec(txt)?.[1]),
    ymax: Number(/lavfi\.signalstats\.YMAX=(\d+)/.exec(txt)?.[1]),
  };
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "g2v-golden-"));
const outA = path.join(tmp, "a");

test("golden render: resolution, duration, frame count, layout, non-blank frames", () => {
  const { mp4, audit } = renderOnce(outA, 30);
  assert.ok(existsSync(mp4));
  const probe = ffprobeJson(mp4);
  const video = probe.streams.find((s) => s.codec_type === "video");
  assert.ok(video, "video stream exists");
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.equal(video.pix_fmt, "yuv420p");

  const frameCount = execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-print_format", "json", mp4], { encoding: "utf8" });
  const nf = JSON.parse(frameCount).streams[0].nb_read_frames;
  assert.ok(Math.abs(Number(nf) - 60) <= 1, `frame count ${nf} (want ~60 = 2s @ 30fps)`);

  const dur = Number(probe.format.duration);
  assert.ok(Math.abs(dur - 2.0) < 0.1, `duration ${dur}`);

  assert.equal(audit.total, 2.0, "audit total matches storyboard");
  assert.ok(audit.audits.length >= 3, "3+ layout audit samples");
  for (const a of audit.audits) {
    for (const el of a.elements) {
      assert.equal(el.overflow, false, `overflow at t=${a.t}: ${JSON.stringify(el.text)}`);
      assert.equal(el.outside, false, `outside safe area at t=${a.t}: ${JSON.stringify(el.text)}`);
    }
  }
  for (const t of [0.4, 1.6]) {
    const v = frameStats(mp4, t, tmp);
    assert.ok(v.ymax - v.ymin > 12, `frame at ${t}s near-blank (ymin=${v.ymin} ymax=${v.ymax})`);
  }
});

test("golden render: same input -> byte-identical mp4 (local determinism)", () => {
  const outB = path.join(os.tmpdir(), "g2v-golden-b");
  renderOnce(outB, 30);
  const a = createHash("md5").update(readFileSync(path.join(outA, "video.mp4"))).digest("hex");
  const b = createHash("md5").update(readFileSync(path.join(outB, "video.mp4"))).digest("hex");
  assert.equal(a, b, "two renders of the same storyboard differ");
});
