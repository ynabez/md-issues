// md-issues refs <id>: show what refers to an issue. Changes nothing.
//
// Meant for "before deleting or renaming an issue": both `related` entries in other
// issues and relative links in every file whose links md-issues maintains.

import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { UsageError } from "../errors.js";
import { t } from "../i18n.js";
import { asList, findIssue, scanIssues } from "../issues.js";
import { findLinks } from "../markdown.js";
import { openProject } from "../project.js";
import { decode, expandLinkFiles, linkTargets } from "../sync.js";

export function refsCommand({ args, base, out }) {
  const [id, ...extra] = args.positionals;
  if (!id) throw new UsageError("usage.missingRefsId");
  if (extra.length) throw new UsageError("usage.extraArgs", { arg: extra[0] });

  const ctx = openProject(base);
  const { issues } = scanIssues(ctx);
  const target = findIssue(issues, id);
  if (!target) throw new UsageError("usage.unknownId", { id });

  const refs = findRefs(ctx, issues, target);
  if (args.options.json) {
    out(JSON.stringify(refs, null, 2));
  } else if (!refs.length) {
    out(t("result.noRefs", { id: target.data.id }));
  } else {
    const kinds = { related: t("refs.related"), link: t("refs.link") };
    const width = Math.max(...Object.values(kinds).map((k) => k.length));
    for (const r of refs) {
      out(`${kinds[r.kind].padEnd(width)}  ${r.kind === "link" ? `${r.path}:${r.line}` : r.path}`);
    }
  }
  return 0;
}

/** References to `target`: [{ kind: "related" | "link", path, line? }] sorted by kind, then path. */
export function findRefs(ctx, issues, target) {
  const refs = issues
    .filter((it) => it !== target && asList(it.data.related).includes(target.data.id))
    .map((it) => ({ kind: "related", path: it.path }));

  const inDir = (p) => p.startsWith(`${ctx.dirRel}/`);
  for (const rel of linkTargets(ctx, issues, expandLinkFiles(ctx))) {
    if (rel === target.path) continue;
    const text = readFileSync(join(ctx.root, rel), "utf8");
    for (const link of findLinks(text)) {
      if (link.empty || !link.target) continue;
      const dest = posix.join(posix.dirname(rel), decode(link.target));
      // Same rule as relinking: links into the issue directory match by file name.
      if (dest !== target.path && !(inDir(dest) && posix.basename(dest) === target.name)) continue;
      const line = text.slice(0, link.start).split("\n").length;
      refs.push({ kind: "link", path: rel, line });
    }
  }
  const order = { related: 0, link: 1 };
  return refs.sort((a, b) => order[a.kind] - order[b.kind] || a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0));
}
