// md-issues set <id> key=value ...: change frontmatter values of one issue.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, updateFrontmatter } from "../frontmatter.js";
import { UsageError } from "../errors.js";
import { scanIssues } from "../issues.js";
import { openProject } from "../project.js";
import { loadIssues, sync } from "../sync.js";
import { toValue } from "./fields.js";

export function setIssue({ args, base, log, warn }) {
  const [id, ...assignments] = args.positionals;
  if (!id) throw new UsageError("usage.missingId");
  if (!assignments.length) throw new UsageError("usage.missingAssignment");

  const ctx = openProject(base);
  const target = findIssue(scanIssues(ctx).issues, id);
  if (!target) throw new UsageError("usage.unknownId", { id });

  const changes = {};
  for (const arg of assignments) {
    const eq = arg.indexOf("=");
    if (eq <= 0) throw new UsageError("usage.badAssignment", { arg });
    const key = arg.slice(0, eq);
    if (key === "id") throw new UsageError("usage.cannotSetId");
    changes[key] = toValue(key, arg.slice(eq + 1), { list: Array.isArray(target.data[key]) });
  }

  const text = updateFrontmatter(target.text, changes);
  const data = parseFrontmatter(text).data;

  // Validate the whole set with the change applied; write nothing if it fails.
  loadIssues(ctx, (issues) => issues.map((it) => (it.path === target.path ? { ...it, data, text } : it)));

  if (text !== target.text) {
    writeFileSync(join(ctx.root, target.path), text);
    log("result.updated", { path: target.path });
  }
  sync(ctx, { log, warn });
  return 0;
}

/** Find by exact id, or by number ("31" finds "0031"). */
export function findIssue(issues, id) {
  return (
    issues.find((it) => it.data.id === id) ??
    (/^\d+$/.test(id) ? issues.find((it) => /^\d+$/.test(it.data.id ?? "") && Number(it.data.id) === Number(id)) : undefined)
  );
}
