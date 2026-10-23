// md-issues check docs: links, heading anchors and forbidden words in documents.
//
// Links and anchors are checked in every Markdown file under the documents directory and at
// the root. A link that leaves the root is an error: it opens only on the author's machine.
// Forbidden words (`forbid` in <docs>/config.json) are searched in every project file
// except `forbidIgnore`, which defaults to the issue directory, since issues record where
// things came from.

import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { ConfigError, ValidationError } from "../errors.js";
import { globToRegExp } from "../glob.js";
import { LANGS, setLang } from "../i18n.js";
import { findLinks, hasAnchor } from "../markdown.js";

const CONFIG_KEYS = ["$schema", "lang", "forbid", "forbidIgnore"];
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

/** Read and validate <docs>/config.json. */
export function loadDocsConfig(ctx) {
  const file = `${ctx.docsDir}/config.json`;
  const path = join(ctx.root, file);
  let raw = {};
  if (existsSync(path)) {
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      throw new ConfigError("config.invalidJson", { file, message: e.message });
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ConfigError("config.notObject", { file });
  }
  for (const key of Object.keys(raw)) {
    if (!CONFIG_KEYS.includes(key)) throw new ConfigError("config.unknownKey", { file, key, known: CONFIG_KEYS.slice(1).join(", ") });
  }
  if (raw.lang !== undefined && !LANGS.includes(raw.lang)) {
    throw new ConfigError("config.type", { file, key: "lang", expected: LANGS.map((l) => `"${l}"`).join(" | ") });
  }
  for (const key of ["forbid", "forbidIgnore"]) {
    const v = raw[key];
    if (v !== undefined && !(Array.isArray(v) && v.every((s) => typeof s === "string" && s))) {
      throw new ConfigError("config.type", { file, key, expected: "an array of non-empty strings" });
    }
  }
  return {
    file,
    lang: raw.lang ?? ctx.lang,
    forbid: raw.forbid ?? [],
    forbidIgnore: raw.forbidIgnore ?? [`${ctx.issuesDir}/**`],
  };
}

export function checkDocs(ctx, { log }) {
  const config = loadDocsConfig(ctx);
  setLang(config.lang);
  const problems = [];
  const add = (code, params) => problems.push({ code, params });
  const cache = new Map();
  const read = (rel) => {
    if (!cache.has(rel)) cache.set(rel, readFileSync(join(ctx.root, rel), "utf8"));
    return cache.get(rel);
  };

  // ---- links and anchors ----
  for (const file of ctx.documents) {
    const text = read(file);
    for (const link of findLinks(text)) {
      const where = `${file}:${text.slice(0, link.start).split("\n").length}`;
      if (link.empty) {
        add("link.empty", { file: where });
        continue;
      }
      const shown = link.target + link.anchor;
      if (EXTERNAL.test(link.target)) continue;
      if (!link.target) {
        if (!hasAnchor(text, link.anchor)) add("link.anchor", { file: where, target: shown });
        continue;
      }
      const dest = posix.normalize(posix.join(posix.dirname(file), decode(link.target)));
      if (dest === ".." || dest.startsWith("../")) {
        add("link.outside", { file: where, target: shown });
        continue;
      }
      if (!existsSync(join(ctx.root, dest))) {
        add("link.missing", { file: where, target: shown });
      } else if (link.anchor && dest.endsWith(".md") && !hasAnchor(read(dest), link.anchor)) {
        add("link.anchor", { file: where, target: shown });
      }
    }
  }

  // ---- forbidden words ----
  let scanned = 0;
  if (config.forbid.length) {
    const ignore = config.forbidIgnore.map(globToRegExp);
    for (const file of ctx.files) {
      if (file === config.file || ignore.some((re) => re.test(file))) continue;
      const buf = readFileSync(join(ctx.root, file));
      if (buf.includes(0)) continue; // binary
      scanned++;
      buf.toString("utf8").split(/\r?\n/).forEach((line, i) => {
        for (const word of config.forbid) {
          if (line.includes(word)) add("docs.forbidden", { file: `${file}:${i + 1}`, word });
        }
      });
    }
  }

  if (problems.length) throw new ValidationError(problems);
  log(config.forbid.length ? "result.docsOkForbid" : "result.docsOk", { dir: ctx.docsDir, n: ctx.documents.length, files: scanned });
}

function decode(target) {
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
}
