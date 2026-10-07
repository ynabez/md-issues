// md-issues new "<title>": create an issue file with the next id.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getValue, parseFrontmatter, updateFrontmatter } from "../frontmatter.js";
import { ConfigError, UsageError } from "../errors.js";
import { t } from "../i18n.js";
import { FILE_NAME, TEMPLATE_FILE, markdownFiles } from "../issues.js";
import { openProject } from "../project.js";
import { sync } from "../sync.js";
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

  // Name the options to add, instead of a validation error about the file. Everything
  // shown comes from the project's config.json.
  const missing = ctx.config.required.filter((key) => {
    const value = getValue(data, key);
    return value === undefined || value === "";
  });
  if (missing.length) {
    const options = missing.map((key) => `\n  --${key} ${valueHint(ctx.config, key)}`).join("");
    throw new UsageError("usage.newMissing", { options });
  }
  const dir = ctx.config.status[data.status]?.dir ?? "";
  const name = `${id}-${slug}.md`;
  const issue = { id, name, dir, file: dir + name, path: `${ctx.dirRel}/${dir}${name}`, data, text };

  // Validated together with the existing issues; written only if everything passes.
  sync(ctx, {
    log,
    warn,
    transform: (issues) => [...issues, issue],
    writes: [{ path: issue.path, text }],
    onCommit: () => log("result.created", { path: issue.path }),
  });
  return 0;
}

/** "<a | b>" from the configured vocabulary of `key`, or a generic placeholder. */
function valueHint(config, key) {
  const vocab = key === "severity" ? config.severity : config.fields[key];
  if (Array.isArray(vocab) && vocab.length) return `<${vocab.join(" | ")}>`;
  if (typeof vocab === "string") return t("hint.pattern", { pattern: vocab });
  return t("hint.value");
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

/** Highest id among issue file names anywhere in the issue directory, plus one, zero-padded. */
function nextId(ctx) {
  let max = 0;
  let width = 4;
  for (const { name } of markdownFiles(ctx)) {
    const m = name.match(FILE_NAME);
    if (!m) continue;
    max = Math.max(max, Number(m[1]));
    width = Math.max(width, m[1].length);
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
