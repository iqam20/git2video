import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const collect = path.join(root, "skills/git2video/scripts/collect.mjs");
const { makeFixtureRepo, cleanup } = await import("./fixtures/fixture-repo.mjs");

function runCollect(repo, extra = []) {
  execFileSync(process.execPath, [collect, "--repo", repo, "--out", path.join(repo, "story.json"), ...extra], {
    encoding: "utf8",
  });
  return JSON.parse(readFileSync(path.join(repo, "story.json"), "utf8"));
}

test("collect: default range tag..HEAD, groups, PRs, breaking", (t) => {
  const fx = makeFixtureRepo();
  t.after(() => cleanup(fx.dir));
  const story = runCollect(fx.dir);

  assert.equal(story.repo.name, path.basename(fx.dir));
  assert.equal(story.range.from, "v1.0.0"); // auto: last tag
  assert.ok(story.rangeInfo.auto.startsWith("auto: tag"));
  assert.equal(story.versionLabel, "v1.0.0");
  assert.ok(story.commits.total >= 10, `total=${story.commits.total}`);
  assert.ok(story.groupedByType.feat.length >= 3);
  assert.ok(story.groupedByType.fix.length >= 1);
  assert.ok(story.groupedByType.docs && story.groupedByType.docs.length >= 1);
  assert.ok(story.groupedByType.perf.length >= 1);
  assert.equal(story.breaking.length, 2); // BREAKING CHANGE footer + feat!' subject
  assert.ok(story.releases.some((r) => r.prNumber === 42));
  assert.ok(story.stats.files >= 5);
  assert.ok(story.stats.additions >= 120);
  assert.ok(!story.topFiles.some((f) => f.path === "package-lock.json"), "lockfile excluded");
  assert.ok(story.topFiles.some((f) => f.path === "src/big.js"));
  assert.ok(story.commits.perType["fix"] >= 1);
  // contributor count present even without names
  assert.ok(story.stats.contributors >= 1);
  assert.equal(story.contributors, undefined);
});

test("collect: secrets are scrubbed from diffs (whole hunk dropped)", (t) => {
  const fx = makeFixtureRepo();
  t.after(() => cleanup(fx.dir));
  const story = runCollect(fx.dir);
  const allHunks = story.diffs.map((d) => d.hunk).join("\n");
  assert.equal(allHunks.includes("AKIAIOSFODNN7EXAMPLE"), false, "aws key leaked");
  assert.equal(allHunks.includes("sk-abc123def456ghi789jklmn"), false, "sk- key leaked");
  assert.equal(allHunks.match(/sk-[A-Za-z0-9]{20,}/), null);
  for (const d of story.diffs) assert.equal(d.hunk.includes("BEGIN"), false);
});

test("collect: no emails anywhere in story.json", (t) => {
  const fx = makeFixtureRepo();
  t.after(() => cleanup(fx.dir));
  const story = runCollect(fx.dir);
  const raw = JSON.stringify(story, null, 2);
  assert.equal(raw.includes("ada@example.test"), false, "author email leaked");
  assert.equal(raw.includes("example.test"), false);
});

test("collect: --include-contributors adds names only", (t) => {
  const fx = makeFixtureRepo();
  t.after(() => cleanup(fx.dir));
  const story = runCollect(fx.dir, ["--include-contributors"]);
  assert.ok(Array.isArray(story.contributors) && story.contributors.length >= 1);
  for (const c of story.contributors) {
    assert.ok(c.name && typeof c.name === "string");
    assert.deepEqual(Object.keys(c), ["name"]);
  }
});

test("collect: --from date anchors to last commit before it", (t) => {
  const fx = makeFixtureRepo();
  t.after(() => cleanup(fx.dir));
  const full = runCollect(fx.dir);
  // Apr? No: dates span 2026-11-01..2026-11-08. Anchoring at 2026-11-04 excludes
  // the 11-01..11-03 commits made strictly before that date.
  const story = runCollect(fx.dir, ["--from", "2026-11-04"]);
  assert.ok(story.rangeInfo.auto.includes("2026-11-04"));
  assert.ok(story.commits.total > 0 && story.commits.total < full.commits.total,
    `from-date=${story.commits.total} full=${full.commits.total}`);
  assert.ok(story.dateRange.start >= "2026-11-02");
});

test("collect: hunks are capped at 25 content lines and largest hunk wins", (t) => {
  const fx = makeFixtureRepo();
  t.after(() => cleanup(fx.dir));
  const story = runCollect(fx.dir);
  const big = story.diffs.find((d) => d.file === "src/big.js");
  if (big) {
    const bodyLines = big.hunk.split("\n").filter((l) => !l.startsWith("@@"));
    assert.ok(bodyLines.length <= 25, `hunk too long: ${bodyLines.length}`);
  }
});
