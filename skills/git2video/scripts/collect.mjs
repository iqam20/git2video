#!/usr/bin/env node
// collect.mjs — read real git history and write story.json.
//
// Usage:
//   node collect.mjs [--repo <path>] [--from <tag|sha|YYYY-MM-DD>] [--to <tag|sha>]
//                    [--max-commits N] [--include-contributors] [--gh] [--out <file>]
//
// Default range: last tag -> HEAD; if the repo has no tags, last 30 days to HEAD;
// if the repo is younger than that, the entire history.
// A date --from is anchored to the last commit whose date is before/at that date.
// Uses plain `git` only. With --gh (and gh installed+authenticated), merged-PR
// titles/numbers are enriched; the tool works fully without gh.
//
// Output story.json:
//   generator, repo{name}, range{from,to}, dateRange{start,end}, versionLabel,
//   commits{total,perType}, groupedByType, breaking[], releases[],
//   stats{commits,files,additions,deletions,contributors}, topFiles[], diffs[],
//   contributors[{name}]  (only with --include-contributors; never emails)
//
// Secret hygiene: every hunk is regex-scanned; matching hunks are DROPPED.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// ---------- plumbing ----------
// git format separators: pass as literal %xNN in argv; split real chars in stdout.
const FMT_GIT = `%H%x00%h%x00%an%x00%aI%x00%s%x00%P%x00%b%x1E`;
const FS = "\u0000";
const RS = "\u001E";

function git(repo, args) {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(r.stderr || r.stdout || "").trim()}`);
  return r.stdout;
}

function gitTry(repo, args) {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.trim() : null;
}

function which(cmd) {
  const finder = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(finder, [cmd], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim().split(/\r?\n/)[0] : null;
}

// Empty-tree object id, materialized locally (works offline in any repo).
const EMPTY_TREE = spawnSync("git", ["hash-object", "-t", "tree", "/dev/null"], { encoding: "utf8" }).stdout.trim();

function failClean(msg, code = 2) {
  console.error(`collect: ${msg}`);
  process.exit(code);
}

function usage(code = 0) {
  console.log(`collect.mjs — git history -> story.json

Usage:
  collect.mjs [--repo path] [--from <tag|sha|YYYY-MM-DD>] [--to <tag|sha>]
              [--max-commits N] [--include-contributors] [--gh] [--out file]

Defaults: --repo .  --to HEAD  --from <last tag, else 30 days back>  --max-commits 400`);
  process.exit(code);
}

function parseArgs(argv) {
  const a = { repo: process.cwd(), from: null, to: "HEAD", maxCommits: 400, includeContributors: false, gh: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--repo") a.repo = path.resolve(argv[++i]);
    else if (k === "--from") a.from = argv[++i];
    else if (k === "--to") a.to = argv[++i];
    else if (k === "--max-commits") a.maxCommits = Number(argv[++i]) || 400;
    else if (k === "--include-contributors") a.includeContributors = true;
    else if (k === "--gh") a.gh = true;
    else if (k === "--out") a.out = path.resolve(argv[++i]);
    else if (k === "--help" || k === "-h") usage(0);
    else failClean(`unknown flag: ${k} (--help for usage)`);
  }
  return a;
}

// Secret scrub: at least one regex hit => drop the whole hunk.
const SECRET_PATTERNS = [
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bASIA[0-9A-Z]{14}\b/,
  /\bgh[prous]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bAIza[0-9A-Za-z\-_]{35}\b/,
  /\bxox[baprs]-[A-Za-z0-9\-]{10,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bglpat-[A-Za-z0-9\-_]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9\-_.~+/=]{20,}\b/,
];

if (process.env.GIT2VIDEO_SELFTEST) {
  const samples = process.env.GIT2VIDEO_SELFTEST.split("\u0001");
  console.log(JSON.stringify(samples.map((s) => SECRET_PATTERNS.some((re) => re.test(s)))));
  process.exit(0);
}

function hunkIsSuspicious(text) {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

// ---------- subject classification ----------
function classify(subject) {
  const s = subject.toLowerCase();
  if (/^merge pull request #\d+/i.test(s)) return null; // handled as PR
  if (/\b(fix|bug|patch|correct|resolve|crash|regression|typo)\b/.test(s)) return "fix";
  if (/\b(add|feat|feature|support|introduc|implement|new)\b/.test(s)) return "feat";
  if (/\b(remov|deprecat|delet|drop)\b/.test(s)) return "removed";
  if (/\b(perf|fast|speed|optimi[sz]|cach)\b/.test(s)) return "perf";
  if (/\b(doc|readme|comment|document)\b/.test(s)) return "docs";
  if (/\b(test|spec|coverage)\b/.test(s)) return "tests";
  if (/\b(ci|build|workflow|release|packag|chore|deps?|upgrade|bump)\b/.test(s)) return "build";
  return "changed";
}

const TYPE_ORDER = ["feat", "fix", "perf", "removed", "docs", "tests", "build", "changed"];
const ALL_TYPES = new Set(TYPE_ORDER);
const RE_CC = /^([a-z]+)(?:\([^)]*\))?:\s?(.+)$/;

// Lockfiles/generated/binaries/env files never become notable diffs.
const EXCLUDE_FILE_RE =
  /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|composer\.lock|Podfile\.lock|go\.sum|\.env|\.env\.[^/]*|\.DS_Store)$|\.(?:min\.js|min\.css|map|snap)$|(^|\/)(?:dist|build|node_modules|\.venv|vendor)\//i;

// ---------- main ----------
function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = args.repo;

  if (!gitTry(repo, ["rev-parse", "--git-dir"])) failClean(`not a git repository: ${repo}`);
  // Refuse bare/nonexistent dirs only: resolve top dir to determine "real path of git root"
  const topLevel = gitTry(repo, ["rev-parse", "--show-toplevel"]);
  if (!topLevel) failClean(`not inside a git working tree: ${repo}`);

  // ---- range resolution ----
  let fromLabel; // human-facing name of the range start
  let RANGE; // "a..b" string, or null for entire history
  let auto = "";

  if (args.from) {
    const resolved = gitTry(repo, ["rev-parse", "--quiet", "--verify", `${args.from}^{commit}`]);
    if (resolved != null) {
      // is it the root commit? then range = entire history
      const roots = git(repo, ["rev-list", "--max-parents=0", "HEAD"]).split("\n").filter(Boolean);
      if (roots.includes(resolved)) {
        fromLabel = args.from;
        RANGE = null;
        auto = `--from ${args.from} (entire history: ${args.from} is the root commit)`;
      } else {
        fromLabel = args.from;
        RANGE = `${args.from}..${args.to}`;
        auto = `--from ${args.from}`;
      }
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(args.from)) {
      const anchor = (gitTry(repo, ["rev-list", "-n", "1", `--before=${args.from}`, "HEAD"]) || "").trim();
      if (!anchor) failClean(`no commits before ${args.from}`);
      const roots = git(repo, ["rev-list", "--max-parents=0", "HEAD"]).split("\n").filter(Boolean);
      fromLabel = `${args.from} (anchored ${anchor.slice(0, 7)})`;
      if (roots.includes(anchor) || anchor === (gitTry(repo, ["rev-list", "-n", "1", "HEAD"]) || "").trim() && false) {
        RANGE = null;
        auto = `date ${args.from} -> entire history`;
      } else {
        // anchor is the last commit BEFORE the date; start strictly after it.
        const parent = gitTry(repo, ["rev-parse", "--quiet", "--verify", `${anchor}^`]);
        if (parent == null) {
          RANGE = null;
          auto = `date ${args.from} -> entire history`;
        } else {
          RANGE = `${anchor}^..${args.to}`;
          auto = `date ${args.from} -> anchored at ${anchor.slice(0, 7)}`;
        }
      }
    } else {
      failClean(`--from "${args.from}" is neither a valid ref nor YYYY-MM-DD`);
    }
  } else {
    const tags = git(repo, ["tag", "--sort=-creatordate"]).split("\n").filter(Boolean);
    if (tags.length) {
      fromLabel = tags[0];
      RANGE = `${tags[0]}..${args.to}`;
      auto = `auto: tag ${tags[0]}`;
    } else {
      const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const anchor = (gitTry(repo, ["rev-list", "-n", "1", `--before=${since}`, "HEAD"]) || "").trim();
      if (!anchor) {
        RANGE = null;
        fromLabel = "origin";
        auto = "auto: last 30 days (entire history: repo younger than 30 days)";
      } else {
        const parent = gitTry(repo, ["rev-parse", "--quiet", "--verify", `${anchor}^`]);
        if (parent == null) {
          RANGE = null;
          fromLabel = "origin";
          auto = "auto: last 30 days (entire history: no commit older than 30 days)";
        } else {
          RANGE = `${anchor}^..${args.to}`;
          fromLabel = anchor.slice(0, 7);
          auto = "auto: last 30 days";
        }
      }
    }
  }

  const logBase = ["log", `--max-count=${args.maxCommits}`];
  const mergeLogBase = ["log", `--max-count=${args.maxCommits}`];
  const countArgs = RANGE ? ["rev-list", "--count", RANGE] : ["rev-list", "--count", "HEAD"];

  const commitCount = Number(git(repo, countArgs));
  if (!commitCount) failClean(`no commits in range (${RANGE || "entire history"}, ${auto})`);

  const fmt = `--format=${FMT_GIT}`;
  const rawLog = git(repo, [...logBase, "--no-merges", fmt, ...(RANGE ? [RANGE] : [])]).split(RS).filter((x) => x.trim());
  const mergeLog = git(repo, [...mergeLogBase, "--merges", fmt, ...(RANGE ? [RANGE] : [])]).split(RS).filter((x) => x.trim());

  const commits = rawLog.map((rec) => {
    const [sha, shortSha, name, date, subject, parents, body] = rec.split(FS);
    return { sha, shortSha, name, date, subject: subject.trim(), body: body.trim(), parents };
  });
  const mergeCommits = mergeLog.map((rec) => {
    const [sha, shortSha, name, date, subject, parents, body] = rec.split(FS);
    return { sha, shortSha, name, date, subject: subject.trim(), parents, body: body.trim() };
  });

  const dates = git(repo, [...logBase, "--format=%cI", ...(RANGE ? [RANGE] : [])]).split("\n").filter(Boolean);
  const end = dates[0].slice(0, 10);
  const start = dates[dates.length - 1].slice(0, 10);
  const isTagLike = /^[A-Za-z0-9._\-/]+$/.test(fromLabel || "") &&
    gitTry(repo, ["rev-parse", "--quiet", "--verify", `refs/tags/${fromLabel}`]) != null;
  const versionLabel = isTagLike && !RANGE?.includes("(entire") ? fromLabel : `since ${start}`;

  // ---- grouping (author NAME only, never email) ----
  const groupedByType = {};
  const perType = {};
  const breaking = [];
  const releases = [];
  const push = (type, entry) => {
    (groupedByType[type] ??= []).push(entry);
    perType[type] = (perType[type] || 0) + 1;
  };
  for (const c of commits) {
    const cm = RE_CC.exec(c.subject);
    const cc = cm ? { raw: ALL_TYPES.has(cm[1]) ? cm[1] : null, rest: cm[2], breaking: c.subject.startsWith(cm[1] + "!") } : null;
    const isBreaking = (cc && cc.breaking) || c.subject.includes("!:") || /BREAKING CHANGE:/m.test(c.body);
    const type = cc?.raw || classify(c.subject) || "changed";
    push(type, {
      sha: c.sha,
      shortSha: c.shortSha,
      subject: c.subject,
      title: cc ? cc.rest : c.subject,
      ...(isBreaking ? { breaking: true } : {}),
    });
    if (isBreaking) {
      const m = /BREAKING CHANGE:[ \t]*(.+)/s.exec(c.body);
      breaking.push({ sha: c.sha, shortSha: c.shortSha, subject: c.subject, description: (m ? m[1] : c.subject).trim().split("\n")[0] });
    }
  }
  for (const m of mergeCommits) {
    const pm = /^Merge pull request #(\d+)/.exec(m.subject);
    if (pm) {
      releases.push({
        prNumber: Number(pm[1]),
        title: m.subject.replace(/^Merge pull request #\d+ (from \S+ ?)?/, "").trim(),
      });
    }
  }

  // ---- gh enrichment (opt-in; best effort; never fatal) ----
  let ghNote = null;
  if (args.gh) {
    if (!which("gh")) ghNote = "--gh requested but gh is not installed";
    else {
      const auth = spawnSync("gh", ["auth", "status"], { encoding: "utf8", timeout: 15000 });
      if (auth.status !== 0) ghNote = "--gh requested but gh is not authenticated (run: gh auth login)";
      else {
        const out = spawnSync("gh", ["pr", "list", "--state", "merged", "--limit", "20", "--json", "number,title"], {
          encoding: "utf8", timeout: 30000, cwd: repo,
        });
        if (out.status === 0) {
          try {
            const prs = JSON.parse(out.stdout || "[]");
            if (prs.length) {
              releases.length = 0;
              for (const p of prs) releases.push({ prNumber: p.number, title: p.title || "" });
              ghNote = `${releases.length} merged PRs enriched via gh`;
            } else ghNote = "gh ok, 0 merged PRs found";
          } catch {
            ghNote = "gh enrichment failed (bad json, ignored)";
          }
        } else ghNote = "gh pr list failed (ignored)";
      }
    }
  }

  // ---- stats ----
  const numstatStr = git(repo, ["diff", "--numstat", ...(RANGE ? [RANGE] : [EMPTY_TREE, "HEAD"])]);
  const numstat = numstatStr.split("\n").filter(Boolean).map((l) => {
    const m = /^(-|\d+)\t(-|\d+)\t(.+)$/.exec(l);
    if (!m) return null;
    return {
      path: m[3],
      additions: m[1] === "-" ? 0 : Number(m[1]),
      deletions: m[2] === "-" ? 0 : Number(m[2]),
      binary: m[1] === "-" || m[2] === "-",
    };
  }).filter(Boolean);

  const noteWorthy = [];
  let excludedCount = 0;
  for (const f of numstat) {
    if (f.binary || EXCLUDE_FILE_RE.test(f.path) || f.path.length > 250) {
      excludedCount++;
      continue;
    }
    noteWorthy.push(f);
  }
  const additions = noteWorthy.reduce((s, f) => s + f.additions, 0);
  const deletions = noteWorthy.reduce((s, f) => s + f.deletions, 0);
  const topFiles = [...noteWorthy].sort((x, y) => y.additions + y.deletions - (x.additions + x.deletions)).slice(0, 5);
  const contributors = [...new Set(commits.map((c) => c.name))].sort();

  // ---- notable diffs: top 3 files, largest single hunk (<=25 content lines) ----
  const diffs = [];
  for (const f of topFiles.slice(0, 3)) {
    const head = gitTry(repo, ["log", "--format=%h%x00%H", "--max-count=1", ...(RANGE ? [RANGE] : []), "--", f.path]);
    if (!head) continue;
    const [shortSha, sha] = head.split(FS);
    let patch = null;
    try {
      patch = git(repo, ["diff", "-U3", ...(RANGE ? [RANGE] : [EMPTY_TREE, "HEAD"]), "--", f.path]);
    } catch {
      continue;
    }
    const hunks = [];
    for (const line of patch.split("\n")) {
      if (line.startsWith("@@")) hunks.push([line]);
      else if (hunks.length) hunks[hunks.length - 1].push(line);
    }
    if (!hunks.length) continue;
    hunks.sort((a, b) => b.length - a.length);
    const hunkLines = hunks[0].slice(0, 26); // @@ header + up to 25 content lines
    const hunk = hunkLines.join("\n");
    if (hunkIsSuspicious(hunk)) continue;
    diffs.push({
      sha,
      shortSha,
      file: f.path,
      hunk,
      linesAdded: hunkLines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length,
      linesRemoved: hunkLines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length,
    });
  }

  const story = {
    generator: "git2video/collect v1",
    repo: { name: path.basename(topLevel === repo ? repo : repo) },
    range: { from: fromLabel || (RANGE ? RANGE.split("..")[0] : "origin"), to: args.to },
    rangeInfo: { auto, ...(RANGE ? { range: RANGE } : { range: "entire history" }) },
    dateRange: { start, end },
    versionLabel,
    commits: { total: commits.length, perType },
    groupedByType,
    breaking,
    releases,
    stats: { commits: commits.length, files: noteWorthy.length, additions, deletions, contributors: contributors.length },
    topFiles,
    diffs,
    ...(ghNote ? { ghNote } : {}),
    ...(args.includeContributors
      ? { contributors: contributors.map((name) => ({ name })) }
      : { contributorsNote: "contributor names omitted; pass --include-contributors to include" }),
    excluded: { files: excludedCount, note: "lockfiles/binaries/generated excluded from counts and diffs" },
  };

  const outFile = args.out || path.join(repo, "story.json");
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(story, null, 2) + "\n");
  console.log(
    `collect: ${commits.length} commits (${auto}); ${noteWorthy.length} files (+${additions}/-${deletions}); ` +
      `${diffs.length} notable hunks; ${breaking.length} breaking -> ${outFile}`
  );
}

main();
