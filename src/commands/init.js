// md-issues --init: create the issue directory and its starter files.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { CONFIG_FILE } from "../config.js";
import { UsageError } from "../errors.js";
import { LANGS, t } from "../i18n.js";
import { GUIDE_FILE, INDEX_FILE, TEMPLATE_FILE } from "../issues.js";
import { openProject } from "../project.js";
import { defaultGuide } from "../render.js";
import { DEFAULT_DIR, findRoot, resolveDir, saveDirToPackageJson } from "../root.js";
import { sync } from "../sync.js";

export function init({ args, base, log, warn }) {
  const lang = args.options.lang ?? "en";
  if (!LANGS.includes(lang)) throw new UsageError("usage.badLang", { langs: LANGS.join(", ") });

  const root = findRoot(base);
  const dirRel = resolveDir(root, base.dir);
  const dirAbs = join(root, dirRel);
  mkdirSync(dirAbs, { recursive: true });

  const created = [];
  const create = (name, content) => {
    const path = `${dirRel}/${name}`;
    if (existsSync(join(dirAbs, name))) {
      log("result.skipped", { path });
      return false;
    }
    writeFileSync(join(dirAbs, name), content());
    created.push(path);
    return true;
  };

  create(CONFIG_FILE, () => {
    const schema = relative(dirAbs, join(root, "node_modules", "md-issues", "schema", "config.schema.json")).split(sep).join("/");
    return JSON.stringify({ $schema: schema, lang }, null, 2) + "\n";
  });

  // Everything below is written in the language of the (possibly existing) config.json.
  const ctx = openProject({ ...base, root, dir: dirRel });
  create(GUIDE_FILE, () => defaultGuide(ctx) + "\n");
  create(TEMPLATE_FILE, () => template(ctx.config));
  for (const path of created) log("result.created", { path });

  if (existsSync(join(dirAbs, INDEX_FILE))) {
    log("result.skipped", { path: ctx.indexRel });
  } else {
    sync(ctx, { log, warn });
  }

  // Remember a non-default directory so that later runs do not need --dir.
  if (base.dir !== undefined && dirRel !== DEFAULT_DIR) {
    if (saveDirToPackageJson(root, dirRel)) log("result.savedDir", { dir: dirRel });
    else log("result.noPackageJson", { dir: dirRel });
  }
  return 0;
}

/** Starter content for new issues: empty id and title, the first status. */
export function template(config) {
  const lines = ["---", "id: ", "title: ", `status: ${Object.keys(config.status)[0]}`];
  const skip = new Set(["id", "title", "status", "commits", "related"]);
  for (const key of [...(config.severity ? ["severity"] : []), ...Object.keys(config.fields), ...config.required]) {
    if (!skip.has(key)) {
      skip.add(key);
      lines.push(`${key}: `);
    }
  }
  lines.push("commits: []", "related: []", "---", "", t("template"));
  return lines.join("\n");
}
