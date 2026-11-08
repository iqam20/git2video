#!/usr/bin/env node
// Fixture git repo for tests: known commits with spaced dates (deterministic),
// a secret-looking diff (must be scrubbed), a breaking footer, a "feat!" commit,
// a merge PR, a lockfile blob, and a large file chosen as notable diff.

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function makeFixtureRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "g2v-fixture-"));
  const run = (args) => {
    const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`fixture git ${args.join(" ")}: ${r.stderr || r.stdout}`);
    return r.stdout.trim();
  };
  const at = (day) => `2026-11-${String(day).padStart(2, "0")}T10:00:00 +0000`;
  const commit = (msg, day, body = "") => {
    const r = spawnSync("git", ["-C", dir, "commit", "-m", msg, ...(body ? ["-m", body] : []), "--allow-empty"], {
      encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_DATE: at(day), GIT_COMMITTER_DATE: at(day) },
    });
    if (r.status !== 0) throw new Error("fixture commit failed: " + r.stderr + r.stdout);
  };
  const stage = (file, content) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
    run(["add", "-A"]);
  };

  run(["init", "-b", "main"]);
  run(["config", "user.name", "Ada Fixture"]);
  run(["config", "user.email", "ada@example.test"]);
  run(["config", "commit.gpgsign", "false"]);
  run(["config", "tag.gpgsign", "false"]);

  // v1.0.0 baseline
  stage("README.md", "# fixture\n");
  commit("init", 1);
  run(["tag", "v1.0.0"]);
  run(["checkout", "-b", "feature/pr"]);
  stage("src/feature.js", "export const feat = true;\n");
  commit("feat(pr): add feature module", 2);
  run(["checkout", "main"]);
  stage("src/index.js", "console.log('hello');\n");
  commit("feat: add hello world", 2);
  stage("src/index.js", "console.log('hello v2');\n");
  commit("fix(engine): correct startup crash\n\nBREAKING CHANGE: CLI flag --hello is now --greet", 3);
  stage("docs/README.md", "# fixture\ndocs\n");
  commit("docs: update readme", 3);
  stage("src/perf.js", "export const f = () => 42;\n");
  commit("perf: speed up engine 2x", 3);
  stage("config.js", "const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';\nconst key = 'sk-abc123def456ghi789jklmn';\n");
  commit("feat: add config", 4);
  stage("src/index.js", "console.log('hello v3');\n");
  commit("whatever subject with no convention", 4);
  stage("package-lock.json", '{\n  "lockfile": true,\n  "blob": "a' + "b".repeat(5000) + '"\n}\n');
  commit("build: update lockfile", 5);
  stage("src/other.js", "export const other = 1;\n");
  commit("feat: other on main", 6);
  run(["merge", "feature/pr", "--no-ff", "-m", "Merge pull request #42 from fixture/feature-pr\n\nfeat(pr): add feature module"]);
  let big = "";
  for (let i = 0; i < 120; i++) big += `export const line${i} = ${i};\n`;
  stage("src/big.js", big);
  commit("feat: add big module with many lines", 7);
  stage("src/legacy.js", "export const dead = 0;\n");
  commit("feat!: remove legacy flag", 8);

  return { dir, run, commit, stage };
}

export function cleanup(dir) {
  spawnSync("rm", ["-rf", dir]);
}
