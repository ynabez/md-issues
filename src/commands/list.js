// md-issues list: print issues, optionally filtered. Changes nothing.

import { UsageError } from "../errors.js";
import { getValue } from "../frontmatter.js";
import { defaultColumnLabel, t } from "../i18n.js";
import { asList, compareIssues, scanIssues, validateIssues } from "../issues.js";
import { openProject } from "../project.js";

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
    out(r.map((c, i) => (i === r.length - 1 ? c : c + " ".repeat(widths[i] - width(c)))).join("  ").trimEnd());
  }
  return 0;
}

/** Display width: East Asian wide and fullwidth characters take two columns. */
export function width(s) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    w += (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3fffd)
      ? 2 : 1;
  }
  return w;
}
