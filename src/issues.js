// Reading and validating issue files.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";

export const INDEX_FILE = "README.md";
export const GUIDE_FILE = "GUIDE.md";
export const TEMPLATE_FILE = "TEMPLATE.md";
const NOT_ISSUES = new Set([INDEX_FILE, GUIDE_FILE, TEMPLATE_FILE]);

export const FILE_NAME = /^(\d{4,})-[a-z0-9-]+\.md$/;

/** Directories (relative to the issue directory, "" or "done/") that hold issues. */
export function statusDirs(config) {
  return [...new Set(Object.values(config.status).map((s) => s.dir))].sort();
}

/**
 * Read every issue file.
 *
 * Returns { issues, problems, warnings }. Each issue:
 *   { id, name, dir, file, path, data, text }
 *   - name: file name
 *   - dir:  where it is, relative to the issue directory ("" or "done/")
 *   - file: relative to the issue directory ("done/0001-x.md")
 *   - path: relative to the root ("issues/done/0001-x.md")
 */
export function scanIssues(ctx) {
  const issues = [];
  const problems = [];
  const dirs = statusDirs(ctx.config);

  for (const dir of dirs) {
    const abs = join(ctx.dirAbs, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs, { withFileTypes: true }).sort(byName)) {
      if (!entry.isFile() || !entry.name.endsWith(".md") || NOT_ISSUES.has(entry.name)) continue;
      const file = dir + entry.name;
      const path = `${ctx.dirRel}/${file}`;
      if (!FILE_NAME.test(entry.name)) {
        problems.push({ code: "issue.badName", params: { file: path } });
        continue;
      }
      const text = readFileSync(join(abs, entry.name), "utf8");
      const fm = parseFrontmatter(text);
      for (const e of fm.errors) problems.push({ code: e.code, params: { file: path, ...e.params } });
      if (!fm.data) continue;
      issues.push({ id: fm.data.id, name: entry.name, dir, file, path, data: fm.data, text });
    }
  }

  return { issues, problems, warnings: strayFiles(ctx, dirs) };
}

/** Markdown files in subdirectories that no status uses. */
function strayFiles(ctx, dirs) {
  const known = new Set(dirs);
  const warnings = [];
  const walk = (rel) => {
    const abs = join(ctx.dirAbs, rel);
    for (const entry of readdirSync(abs, { withFileTypes: true }).sort(byName)) {
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && !entry.name.startsWith(".")) walk(`${rel}${entry.name}/`);
      } else if (!known.has(rel) && entry.name.endsWith(".md")) {
        warnings.push({ code: "issue.unknownDir", params: { file: `${ctx.dirRel}/${rel}${entry.name}` } });
      }
    }
  };
  if (existsSync(ctx.dirAbs)) walk("");
  return warnings;
}

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** Validate issue contents against the configuration. Returns problems. */
export function validateIssues(issues, config) {
  const problems = [];
  const add = (it, code, params = {}) => problems.push({ code, params: { file: it.path, ...params } });
  const single = ["id", "title", "status", "severity", ...Object.keys(config.fields)];

  for (const it of issues) {
    const d = it.data;
    for (const key of config.required) {
      if (d[key] === undefined || d[key] === "") add(it, "issue.required", { key });
    }
    for (const key of single) {
      if (Array.isArray(d[key])) add(it, "issue.notString", { key });
    }
    if (typeof d.id === "string" && d.id && !it.name.startsWith(`${d.id}-`)) {
      add(it, "issue.idMismatch", { id: d.id });
    }
    if (typeof d.status === "string" && d.status && !config.status[d.status]) {
      add(it, "issue.badStatus", { value: d.status, allowed: Object.keys(config.status).join(" / ") });
    }
    if (config.severity && typeof d.severity === "string" && d.severity && !config.severity.includes(d.severity)) {
      add(it, "issue.badSeverity", { value: d.severity, allowed: config.severity.join(" / ") });
    }
    for (const [key, vocab] of Object.entries(config.fields)) {
      const value = d[key];
      if (typeof value !== "string" || !value) continue;
      if (Array.isArray(vocab)) {
        if (!vocab.includes(value)) add(it, "issue.badValue", { key, value, allowed: vocab.join(" / ") });
      } else if (!new RegExp(vocab, "u").test(value)) {
        add(it, "issue.badPattern", { key, value, pattern: vocab });
      }
    }
  }

  const seen = new Set();
  const reported = new Set();
  for (const it of issues) {
    if (typeof it.data.id !== "string" || !it.data.id) continue;
    if (seen.has(it.data.id) && !reported.has(it.data.id)) {
      problems.push({ code: "issue.duplicateId", params: { id: it.data.id } });
      reported.add(it.data.id);
    }
    seen.add(it.data.id);
  }
  for (const it of issues) {
    for (const id of asList(it.data.related)) {
      if (!seen.has(id)) add(it, "issue.relatedMissing", { id });
    }
  }
  return problems;
}

export function asList(value) {
  if (value === undefined || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

/** Sort key: group order, severity (config order), then id. */
export function compareIssues(config) {
  const groupOrder = new Map(config.groups.map((g, i) => [g.id, i]));
  const sev = (it) => {
    const i = config.severity?.indexOf(it.data.severity) ?? -1;
    return i === -1 ? Infinity : i;
  };
  return (a, b) =>
    (groupOrder.get(config.status[a.data.status]?.group) ?? Infinity) -
      (groupOrder.get(config.status[b.data.status]?.group) ?? Infinity) ||
    (sev(a) === sev(b) ? 0 : sev(a) < sev(b) ? -1 : 1) ||
    String(a.data.id ?? "").localeCompare(String(b.data.id ?? ""));
}
