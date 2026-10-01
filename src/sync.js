// The main pipeline: validate, move issues, rewrite and check links, generate the index.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { CONFIG_FILE } from "./config.js";
import { ConfigError, ValidationError } from "./errors.js";
import { expandGlob, hasGlob } from "./glob.js";
import { GUIDE_FILE, TEMPLATE_FILE, asList, scanIssues, validateIssues } from "./issues.js";
import { findLinks, hasAnchor, rewriteLinks } from "./markdown.js";
import { buildIndex } from "./render.js";

/**
 * Load and validate every issue. Throws ValidationError on problems.
 * `transform(issues)` may change issues in memory before validation (used by new / set).
 */
export function loadIssues(ctx, transform) {
  const scan = scanIssues(ctx);
  const issues = transform ? transform(scan.issues) : scan.issues;
  const problems = [...scan.problems, ...validateIssues(issues, ctx.config)];
  if (problems.length) throw new ValidationError(problems);
  return { issues, warnings: scan.warnings };
}

/**
 * Run the pipeline.
 *   check: true → change nothing; fail when something would change.
 * `log(code, params)` receives progress messages, `warn(code, params)` warnings.
 */
export function sync(ctx, { check = false, log, warn, transform } = {}) {
  const { issues, warnings } = loadIssues(ctx, transform);
  for (const w of warnings) warn(w.code, w.params);

  const linkFiles = expandLinkFiles(ctx);

  // Move issues whose status says they belong elsewhere.
  const moves = issues
    .filter((it) => ctx.config.status[it.data.status].dir !== it.dir)
    .map((it) => {
      const want = ctx.config.status[it.data.status].dir;
      return { it, want, from: it.path, to: `${ctx.dirRel}/${want}${it.name}` };
    });

  if (check && moves.length) {
    throw new ValidationError(moves.map((m) => ({ code: "issue.misplaced", params: { from: m.from, to: m.to, cmd: ctx.cmd } })));
  }

  if (!check) {
    const conflicts = moves.filter((m) => existsSync(join(ctx.root, m.to)));
    if (conflicts.length) {
      throw new ValidationError(conflicts.map((m) => ({ code: "issue.moveConflict", params: { from: m.from, to: m.to } })));
    }
    for (const m of moves) {
      mkdirSync(dirname(join(ctx.root, m.to)), { recursive: true });
      renameSync(join(ctx.root, m.from), join(ctx.root, m.to));
      Object.assign(m.it, { dir: m.want, file: m.want + m.it.name, path: m.to });
    }
    // Always run, so that hand-written links that miss done/ are fixed too.
    relink(ctx, issues, linkFiles, new Map(moves.map((m) => [m.from, m.to])));
    for (const m of moves) log("result.moved", { from: m.from, to: m.to });
  }

  const index = buildIndex(ctx, issues);
  const problems = [
    ...checkLinks(ctx, linkTargets(ctx, issues, linkFiles)),
    ...checkLinks(ctx, [ctx.indexRel], { [ctx.indexRel]: index }),
    ...(check && ctx.config.checkCommits ? checkCommits(ctx, issues) : []),
  ];
  if (problems.length) throw new ValidationError(problems);

  const indexAbs = join(ctx.root, ctx.indexRel);
  const current = existsSync(indexAbs) ? readFileSync(indexAbs, "utf8") : null;
  if (check) {
    if (current !== index) throw new ValidationError([{ code: "result.stale", params: { index: ctx.indexRel, cmd: ctx.cmd } }]);
    log("result.checkOk", { n: issues.length });
  } else if (current !== index) {
    writeFileSync(indexAbs, index);
    log("result.generated", { index: ctx.indexRel, n: issues.length });
  } else {
    log("result.upToDate", { index: ctx.indexRel, n: issues.length });
  }
  return issues;
}

/** linkFiles from config.json, expanded. Missing files and empty globs are errors. */
export function expandLinkFiles(ctx) {
  const file = `${ctx.dirRel}/${CONFIG_FILE}`;
  const out = [];
  for (const pattern of ctx.config.linkFiles) {
    if (hasGlob(pattern)) {
      const found = expandGlob(ctx.root, pattern);
      if (!found.length) throw new ConfigError("config.linkGlobEmpty", { file, pattern });
      out.push(...found);
    } else {
      const rel = posix.normalize(pattern);
      if (!existsSync(join(ctx.root, rel))) throw new ConfigError("config.linkFileMissing", { file, pattern });
      out.push(rel);
    }
  }
  return out;
}

/** Files whose links are rewritten and checked (root-relative). Never the index. */
export function linkTargets(ctx, issues, linkFiles) {
  const own = [GUIDE_FILE, TEMPLATE_FILE]
    .map((f) => `${ctx.dirRel}/${f}`)
    .filter((f) => existsSync(join(ctx.root, f)));
  return [...new Set([...linkFiles, ...own, ...issues.map((it) => it.path)])]
    .filter((f) => f !== ctx.indexRel);
}

/**
 * Rewrite relative links so that they point to where things are now.
 *
 * `moved` maps old → new root-relative paths. A link is resolved against the position
 * its file had *before* the move, then made relative to the position *after* it. This
 * handles both "the target moved" and "the file itself moved" the same way.
 *
 * Links into the issue directory that name an issue file are matched by file name, so
 * writers do not have to care whether the issue is in done/ yet.
 */
function relink(ctx, issues, linkFiles, moved) {
  const back = new Map([...moved].map(([from, to]) => [to, from]));
  const byName = new Map(issues.map((it) => [it.name, it.path]));
  const inDir = (p) => p.startsWith(`${ctx.dirRel}/`);

  for (const rel of linkTargets(ctx, issues, linkFiles)) {
    const abs = join(ctx.root, rel);
    const text = readFileSync(abs, "utf8");
    const base = posix.dirname(back.get(rel) ?? rel);
    const out = rewriteLinks(text, ({ target }) => {
      if (!target) return null;
      const joined = posix.join(base, decode(target));
      const byIssue = inDir(joined) ? byName.get(posix.basename(joined)) : undefined;
      const dest = byIssue ?? moved.get(joined) ?? joined;
      const next = posix.relative(posix.dirname(rel), dest);
      if (!next || posix.join(posix.dirname(rel), decode(target)) === dest) return null;
      return /%[0-9a-f]{2}/i.test(target) ? encodeURI(next) : next;
    });
    if (out !== text) writeFileSync(abs, out);
  }
}

/**
 * Check relative links in `files`: empty links, missing .md targets and missing heading
 * anchors. `contents` supplies text for files not written yet (the index).
 */
function checkLinks(ctx, files, contents = {}) {
  const problems = [];
  const cache = new Map();
  const readText = (rel) => {
    if (contents[rel] !== undefined) return contents[rel];
    if (!cache.has(rel)) cache.set(rel, readFileSync(join(ctx.root, rel), "utf8"));
    return cache.get(rel);
  };

  for (const rel of files) {
    const text = readText(rel);
    for (const link of findLinks(text)) {
      if (link.empty) {
        problems.push({ code: "link.empty", params: { file: rel } });
        continue;
      }
      const shown = link.target + link.anchor;
      if (!link.target) {
        if (!hasAnchor(text, link.anchor)) problems.push({ code: "link.anchor", params: { file: rel, target: shown } });
        continue;
      }
      if (!link.target.endsWith(".md")) continue;
      const dest = posix.join(posix.dirname(rel), decode(link.target));
      if (!existsSync(join(ctx.root, dest))) {
        problems.push({ code: "link.missing", params: { file: rel, target: shown } });
      } else if (link.anchor && !hasAnchor(readText(dest), link.anchor)) {
        problems.push({ code: "link.anchor", params: { file: rel, target: shown } });
      }
    }
  }
  return problems;
}

/** Check that every hash in `commits` names a commit in the repository. */
function checkCommits(ctx, issues) {
  const pairs = issues.flatMap((it) => asList(it.data.commits).map((hash) => ({ it, hash })));
  if (!pairs.length) return [];
  let output;
  try {
    output = execFileSync("git", ["cat-file", "--batch-check"], {
      cwd: ctx.root,
      input: pairs.map((p) => `${p.hash}^{commit}`).join("\n") + "\n",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch {
    return [{ code: "commit.noGit", params: { root: ctx.root } }];
  }
  const lines = output.split("\n");
  return pairs
    .filter((p, i) => !/^[0-9a-f]+ commit /.test(lines[i] ?? ""))
    .map((p) => ({ code: "commit.missing", params: { file: p.it.path, hash: p.hash } }));
}

export function decode(target) {
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
}
