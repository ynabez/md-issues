// The main pipeline: validate, move issues, rewrite and check links, generate the index.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, posix } from "node:path";
import { CONFIG_FILE } from "./config.js";
import { ConfigError, ValidationError } from "./errors.js";
import { expandGlob, hasGlob } from "./glob.js";
import { GUIDE_FILE, TEMPLATE_FILE, asList, scanIssues, validateIssues } from "./issues.js";
import { findLinks, hasAnchor, rewriteLinks } from "./markdown.js";
import { buildIndex } from "./render.js";
import { Workspace } from "./workspace.js";

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
 *   transform(issues) → issues: in-memory changes to validate (new / set)
 *   writes: [{ path, text }] files to write with them (root-relative)
 *   onCommit(): called right after the changes have been written
 * `log(code, params)` receives progress messages, `warn(code, params)` warnings.
 *
 * Nothing is written unless every check passes.
 */
export function sync(ctx, { check = false, log, warn, transform, writes = [], onCommit } = {}) {
  const ws = new Workspace(ctx.root);
  for (const w of writes) ws.write(w.path, w.text);

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

  // Maps a pending file and link back to what is on disk, for messages.
  let origin = (file, target) => ({ file, target });

  if (check && moves.length) {
    throw new ValidationError(moves.map((m) => ({ code: "issue.misplaced", params: { from: m.from, to: m.to, cmd: ctx.cmd } })));
  }

  if (!check) {
    const conflicts = moves.filter((m) => ws.exists(m.to));
    if (conflicts.length) {
      throw new ValidationError(conflicts.map((m) => ({ code: "issue.moveConflict", params: { from: m.from, to: m.to } })));
    }
    for (const m of moves) {
      ws.move(m.from, m.to);
      Object.assign(m.it, { dir: m.want, file: m.want + m.it.name, path: m.to });
    }
    // Always run, so that hand-written links that miss done/ are fixed too.
    origin = relink(ctx, ws, issues, linkFiles, new Map(moves.map((m) => [m.from, m.to])));
  }

  // Checked against the pending state: moved files, rewritten links, the new index.
  const index = buildIndex(ctx, issues);
  const problems = [
    ...checkLinks(ws, linkTargets(ctx, issues, linkFiles), { origin }),
    ...checkLinks(ws, [ctx.indexRel], { contents: { [ctx.indexRel]: index } }),
    ...(check && ctx.config.checkCommits ? checkCommits(ctx, issues) : []),
  ];
  if (problems.length) throw new ValidationError(problems);

  const current = ws.exists(ctx.indexRel) ? ws.read(ctx.indexRel) : null;
  if (check) {
    if (current !== index) throw new ValidationError([{ code: "result.stale", params: { index: ctx.indexRel, cmd: ctx.cmd } }]);
    log("result.checkOk", { n: issues.length });
    return issues;
  }

  if (current !== index) ws.write(ctx.indexRel, index);
  ws.commit();
  onCommit?.();
  for (const m of moves) log("result.moved", { from: m.from, to: m.to });
  log(current !== index ? "result.generated" : "result.upToDate", { index: ctx.indexRel, n: issues.length });
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
function relink(ctx, ws, issues, linkFiles, moved) {
  const back = new Map([...moved].map(([from, to]) => [to, from]));
  const original = new Map(); // rel → Map(new target → target on disk)
  const byName = new Map(issues.map((it) => [it.name, it.path]));
  const inDir = (p) => p.startsWith(`${ctx.dirRel}/`);

  for (const rel of linkTargets(ctx, issues, linkFiles)) {
    const text = ws.read(rel);
    const base = posix.dirname(back.get(rel) ?? rel);
    const out = rewriteLinks(text, ({ target }) => {
      if (!target) return null;
      const joined = posix.join(base, decode(target));
      const byIssue = inDir(joined) ? byName.get(posix.basename(joined)) : undefined;
      const dest = byIssue ?? moved.get(joined) ?? joined;
      const next = posix.relative(posix.dirname(rel), dest);
      if (!next || posix.join(posix.dirname(rel), decode(target)) === dest) return null;
      const result = /%[0-9a-f]{2}/i.test(target) ? encodeURI(next) : next;
      if (!original.has(rel)) original.set(rel, new Map());
      if (!original.get(rel).has(result)) original.get(rel).set(result, target);
      return result;
    });
    if (out !== text) ws.write(rel, out);
  }

  // Problems are found in the pending state but reported as the user wrote them: the file
  // where it is now and the link as it reads on disk, since nothing has been written yet.
  return (file, target) => ({
    file: back.get(file) ?? file,
    target: original.get(file)?.get(target) ?? target,
  });
}

/**
 * Check relative links in `files`: empty links, missing .md targets and missing heading
 * anchors. `contents` supplies text for files not in the workspace (the index), and
 * `origin(file, target)` maps locations back to the files on disk for messages.
 */
function checkLinks(ws, files, { contents = {}, origin = (file, target) => ({ file, target }) } = {}) {
  const problems = [];
  const readText = (rel) => (contents[rel] !== undefined ? contents[rel] : ws.read(rel));
  const report = (code, rel, link) => {
    const where = origin(rel, link.target);
    problems.push({ code, params: { file: where.file, target: where.target + link.anchor } });
  };

  for (const rel of files) {
    const text = readText(rel);
    for (const link of findLinks(text)) {
      if (link.empty) {
        report("link.empty", rel, link);
        continue;
      }
      if (!link.target) {
        if (!hasAnchor(text, link.anchor)) report("link.anchor", rel, link);
        continue;
      }
      if (!link.target.endsWith(".md")) continue;
      const dest = posix.join(posix.dirname(rel), decode(link.target));
      if (!ws.exists(dest)) {
        report("link.missing", rel, link);
      } else if (link.anchor && !hasAnchor(readText(dest), link.anchor)) {
        report("link.anchor", rel, link);
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
