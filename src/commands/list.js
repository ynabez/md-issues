// md-issues list: print issues, optionally filtered. Changes nothing.

import { UsageError } from "../errors.js";
import { getValue } from "../frontmatter.js";
import { defaultColumnLabel, t } from "../i18n.js";
import { asList, compareIssues, scanIssues, validateIssues } from "../issues.js";
import { openProject } from "../project.js";
import { padEnd, width } from "../text/width.js";

export function listIssues({ args, base, out, warn }) {
  if (args.positionals.length) throw new UsageError("usage.extraArgs", { arg: args.positionals[0] });
  const ctx = openProject(base);
  const { config } = ctx;
  const scan = scanIssues(ctx);

  // Listing is read-only: report problems but still show what could be read.
  for (const p of [...scan.problems, ...validateIssues(scan.issues, config), ...scan.warnings]) warn(p.code, p.params);

  const known = new Set([
    "status", "severity", "related", "commits", ...Object.keys(config.fields), ...config.required,
    ...(config.allowedKeys ?? []),
  ]);
  for (const it of scan.issues) for (const k of Object.keys(it.data)) known.add(k);

  // Same key: any of the values. Different keys: all of them.
  const filters = new Map();
  for (const f of args.fields) {
    if (!known.has(f.key)) throw new UsageError("usage.unknownField", { field: f.key, known: [...known].sort().join(", ") });
    filters.set(f.key, [...(filters.get(f.key) ?? []), f.value]);
  }
  const issues = scan.issues
    .filter((it) => [...filters].every(([k, values]) => asList(getValue(it.data, k)).some((v) => values.includes(v))))
    .sort(compareIssues(config));

  if (args.options.json) {
    const rows = issues.map((it) => ({ ...it.data, group: config.status[it.data.status]?.group ?? null, path: it.path }));
    out(JSON.stringify(rows, null, 2));
    return 0;
  }
  if (!issues.length) {
    out(t("result.noIssues"));
    return 0;
  }

  const fields = ["id", "status", ...(config.severity ? ["severity"] : []), "title"];
  const rows = [
    fields.map((f) => defaultColumnLabel(config.lang, f)),
    ...issues.map((it) => fields.map((f) =>
      f === "status" ? config.status[it.data.status]?.label ?? it.data.status : asList(getValue(it.data, f)).join(", "))),
  ];
  const widths = fields.map((_, i) => Math.max(...rows.map((r) => width(r[i]))));
  for (const r of rows) {
    out(r.map((c, i) => (i === r.length - 1 ? c : padEnd(c, widths[i]))).join("  ").trimEnd());
  }
  return 0;
}
