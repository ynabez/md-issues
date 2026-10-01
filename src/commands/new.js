// md-issues new "<title>": create an issue file with the next id.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getValue, parseFrontmatter, updateFrontmatter } from "../frontmatter.js";
import { ConfigError, UsageError } from "../errors.js";
import { FILE_NAME, TEMPLATE_FILE, statusDirs } from "../issues.js";
import { openProject } from "../project.js";
import { loadIssues, sync } from "../sync.js";
import { template } from "./init.js";
import { LIST_KEYS, toValue } from "./fields.js";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function newIssue({ args, base, log, warn }) {
  const [title, ...extra] = args.positionals;
  if (extra.length) throw new UsageError("usage.extraArgs", { arg: extra[0] });
  if (!title?.trim()) throw new UsageError("usage.missingTitle");

  const ctx = openProject(base);
  const slug = args.options.slug ?? slugify(title);
  if (!slug) throw new UsageError("usage.missingSlug", { title });
  if (!SLUG.test(slug)) throw new UsageError("usage.badSlug", { slug });

  const source = loadTemplate(ctx);
  const known = new Set([
    "status", "severity", ...LIST_KEYS, ...Object.keys(ctx.config.fields),
    ...ctx.config.required, ...Object.keys(source.data), ...(ctx.config.allowedKeys ?? []),
  ]);
  known.delete("id");
  known.delete("title");

  const id = nextId(ctx);
  const changes = Object.assign(Object.create(null), { id, title: toValue("title", title) });
  for (const f of args.fields) {
    if (!known.has(f.key)) throw new UsageError("usage.unknownField", { field: f.key, known: [...known].sort().join(", ") });
    changes[f.key] = toValue(f.key, f.value, { list: Array.isArray(getValue(source.data, f.key)) });
  }

  const text = updateFrontmatter(source.text, changes);
  const data = parseFrontmatter(text).data;
  const dir = ctx.config.status[data.status]?.dir ?? "";
  const name = `${id}-${slug}.md`;
  const issue = { id, name, dir, file: dir + name, path: `${ctx.dirRel}/${dir}${name}`, data, text };

  // Validate together with the existing issues before writing anything.
  loadIssues(ctx, (issues) => [...issues, issue]);

  mkdirSync(join(ctx.dirAbs, dir), { recursive: true });
  writeFileSync(join(ctx.dirAbs, dir, name), text);
  log("result.created", { path: issue.path });
  sync(ctx, { log, warn });
  return 0;
}

/** File name part from a title: ASCII letters and digits joined by hyphens. */
export function slugify(title, max = 50) {
  let slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > max) slug = slug.slice(0, max).replace(/-[^-]*$/, "") || slug.slice(0, max);
  return slug;
}

/** Highest id among issue file names in every status directory, plus one, zero-padded. */
function nextId(ctx) {
  let max = 0;
  let width = 4;
  for (const dir of statusDirs(ctx.config)) {
    const abs = join(ctx.dirAbs, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      const m = name.match(FILE_NAME);
      if (!m) continue;
      max = Math.max(max, Number(m[1]));
      width = Math.max(width, m[1].length);
    }
  }
  return String(max + 1).padStart(width, "0");
}

function loadTemplate(ctx) {
  const path = join(ctx.dirAbs, TEMPLATE_FILE);
  const text = existsSync(path) ? readFileSync(path, "utf8") : template(ctx.config);
  const fm = parseFrontmatter(text);
  if (!fm.data) throw new ConfigError("template.invalid", { file: `${ctx.dirRel}/${TEMPLATE_FILE}` });
  return { text, data: fm.data };
}
