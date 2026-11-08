import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const collect = path.join(root, "skills/git2video/scripts/collect.mjs");

// Env-based self-test triggers the scrub unit-test mode inside collect.mjs
// (single self-contained process, no fixture needed).
const SEP = "\u0001";
const samples = [
  ["", false], // empty
  ["console.log('hello')", false],
  ["const AKIAIOSFODNN7EXAMPLE = 1", true],
  ["Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456", true],
  ["token: ghp_abcdefghijklmnopqrstuvwxyz123456", true],
  ["-----BEGIN RSA PRIVATE KEY-----", true],
  ["AWS_REGION=eu-west-1", false], // no key id pattern
  ["const x = sk-boring; ", false], // too short
  ["key = AIza" + "x".repeat(35), true],
  ["key = AIza-tooshort", false],
];
test("collect scrub patterns (unit)", () => {
  const env = { ...process.env, GIT2VIDEO_SELFTEST: samples.map(([s]) => s).join(SEP) };
  const out = execFileSync(process.execPath, [collect], { encoding: "utf8", env, timeout: 20000 });
  const got = JSON.parse(out.trim());
  samples.forEach(([_, expected], i) => assert.equal(got[i], expected, `sample ${i}: ${samples[i][0]}`));
});

test("collect: refuses directory that is not a git working tree", () => {
  const outside = execFileSync("mktemp", ["-d"], { encoding: "utf8" }).trim();
  const gitInit = spawnSync("git", ["-C", outside, "init", "--bare"], { encoding: "utf8" });
  assert.equal(gitInit.status, 0);
  // a bare repo has no worktree -> --show-toplevel fails -> refusal
  const r = spawnSync(process.execPath, [collect, "--repo", outside], { encoding: "utf8" });
  spawnSync("rm", ["-rf", outside]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not (a git repository|inside a git working tree)/);
});
