// Building the index (<dir>/README.md).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { t } from "./i18n.js";
import { GUIDE_FILE, asList, compareIssues } from "./issues.js";

export function buildIndex(ctx, issues) {
  const { config } = ctx;
  const sorted = [...issues].sort(compareIssues(config));
  const inGroup = (g) => sorted.filter((it) => config.status[it.data.status].group === g.id);

  const parts = config.groups.map((g) => {
    const rows = inGroup(g);
    const breakdown = g.summary && config.severity
      ? config.severity
          .map((s) => [s, rows.filter((it) => it.data.severity === s).length])
          .filter(([, n]) => n > 0)
          .map(([s, n]) => `${s} ${n}`)
          .join(" / ")
      : "";
    return breakdown
      ? t("index.breakdown", { label: g.label, n: rows.length, breakdown })
      : t("index.count", { label: g.label, n: rows.length });
  });

  const sections = config.groups
    .map((g) => [g, inGroup(g)])
    .filter(([, rows]) => rows.length)
    .map(([g, rows]) => `## ${g.label}\n\n${table(config, rows)}`);

  return [
    `# ${t("index.title")}`,
    t("index.notice", { cmd: ctx.cmd }),
    t("index.summary", { total: issues.length, parts: parts.join(" / ") }),
    ...sections,
    "---",
    guide(ctx),
  ].join("\n\n") + "\n";
}

function table(config, rows) {
  const out = [
    `| ${config.columns.map((c) => c.label).join(" | ")} |`,
    `| ${config.columns.map(() => "---").join(" | ")} |`,
  ];
  for (const it of rows) {
    const cells = config.columns.map((c) =>
      c.fields.map((f) => cell(config, it, f)).filter(Boolean).join(" ")
    );
    out.push(`| ${cells.join(" | ")} |`);
  }
  return out.join("\n");
}

function cell(config, it, field) {
  const value = it.data[field];
  switch (field) {
    case "id":
      return `[${value}](${it.file})`;
    case "status":
      return escape(config.status[value]?.label ?? value);
    case "commits":
      return asList(value).map((c) => `\`${c}\``).join(" ");
    default:
      return escape(asList(value).join(", "));
  }
}

const escape = (s) => String(s).replace(/\|/g, "\\|");

/** The text after the tables: <dir>/GUIDE.md, or the default guide. */
function guide(ctx) {
  const path = join(ctx.dirAbs, GUIDE_FILE);
  if (existsSync(path)) return readFileSync(path, "utf8").trimEnd();
  return defaultGuide(ctx, { note: true });
}

/** `note`: add the line saying that GUIDE.md replaces this text. */
export function defaultGuide(ctx, { note = false } = {}) {
  const { config } = ctx;
  const statuses = Object.entries(config.status);
  const active = statuses.filter(([, s]) => !s.dir).map(([k]) => `\`${k}\``).join(" / ");
  const moves = statuses
    .filter(([, s]) => s.dir)
    .map(([k, s]) => t("guide.move", { status: k, dir: `${ctx.dirRel}/${s.dir}` }))
    .join("\n");
  return t("guide", { cmd: ctx.cmd, dir: ctx.dirRel, active, moves, example: exampleFrontmatter(config), note });
}

/** Example frontmatter reflecting the configured vocabulary. */
export function exampleFrontmatter(config) {
  const line = (key, value, comment) => {
    const head = `${key}: ${value}`;
    return comment ? `${head.padEnd(21)} # ${comment}` : head;
  };
  const statuses = Object.keys(config.status);
  const lines = ["---", "id: 0001", `title: ${t("guide.title")}`];
  lines.push(line("status", statuses[0], statuses.join(" | ")));
  if (config.severity) {
    lines.push(line("severity", config.severity[Math.min(1, config.severity.length - 1)], config.severity.join(" | ")));
  }
  const shown = new Set(["id", "title", "status", "severity", "commits", "related"]);
  for (const [key, vocab] of Object.entries(config.fields)) {
    shown.add(key);
    lines.push(Array.isArray(vocab) ? line(key, vocab[0] ?? "", vocab.join(" | ")) : line(key, "", `/${vocab}/`));
  }
  for (const key of config.required) {
    if (!shown.has(key)) lines.push(line(key, "", t("guide.any")));
  }
  lines.push(line("commits", "[]", t("guide.commits")));
  lines.push(line("related", "[]", t("guide.related")));
  lines.push("---");
  return lines.join("\n");
}
