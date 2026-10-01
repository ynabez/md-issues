// md-issues set <id> key=value ...: change frontmatter values of one issue.

import { getValue, parseFrontmatter, updateFrontmatter } from "../frontmatter.js";
import { UsageError } from "../errors.js";
import { findIssue, scanIssues } from "../issues.js";
import { openProject } from "../project.js";
import { sync } from "../sync.js";
import { toValue } from "./fields.js";

export function setIssue({ args, base, log, warn }) {
  const [id, ...assignments] = args.positionals;
  if (!id) throw new UsageError("usage.missingId");
  if (!assignments.length) throw new UsageError("usage.missingAssignment");

  const ctx = openProject(base);
  const target = findIssue(scanIssues(ctx).issues, id);
  if (!target) throw new UsageError("usage.unknownId", { id });

  const changes = Object.create(null);
  for (const arg of assignments) {
    const eq = arg.indexOf("=");
    if (eq <= 0) throw new UsageError("usage.badAssignment", { arg });
    const key = arg.slice(0, eq);
    if (key === "id") throw new UsageError("usage.cannotSetId");
    changes[key] = toValue(key, arg.slice(eq + 1), { list: Array.isArray(getValue(target.data, key)) });
  }

  const text = updateFrontmatter(target.text, changes);
  const data = parseFrontmatter(text).data;

  // Validated as a whole with the change applied; written only if everything passes.
  const changed = text !== target.text;
  const path = target.path;
  sync(ctx, {
    log,
    warn,
    transform: (issues) => issues.map((it) => (it.path === path ? { ...it, data, text } : it)),
    writes: changed ? [{ path, text }] : [],
    onCommit: () => changed && log("result.updated", { path }),
  });
  return 0;
}
