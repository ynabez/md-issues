// md-issues check specs: requirement ids, their contents and the references to them.
//
// A specification is one Markdown file in the specifications directory:
//
//   ---
//   prefix: NEWS              2–12 uppercase letters and digits, starting with a letter
//   retired: [NEWS-004]       ids no longer used; never reused
//   ---
//   ## <requirements>
//   ### NEWS-001 <title>
//   - <the requirement>
//   - **<acceptance>**: ...
//   - **<verification>**: ...
//
// The section heading and the two labels come from the language, or from
// <specs>/config.json. Nothing here is specific to one project.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ConfigError, ValidationError } from "../errors.js";
import { getValue, parseFrontmatter } from "../frontmatter.js";
import { LANGS, setLang, t } from "../i18n.js";

const CONFIG_KEYS = ["$schema", "lang", "requirements", "acceptance", "verification"];
const PREFIX = /^[A-Z][A-Z0-9]{1,11}$/;

const DEFAULTS = {
  en: { requirements: "Requirements", acceptance: "Acceptance", verification: "Verification" },
  ja: { requirements: "要件", acceptance: "受け入れ条件", verification: "検証" },
};

/** Read and validate <specs>/config.json. */
export function loadSpecsConfig(ctx) {
  const file = `${ctx.specsDir}/config.json`;
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
  for (const key of ["requirements", "acceptance", "verification"]) {
    if (raw[key] !== undefined && (typeof raw[key] !== "string" || !raw[key].trim())) {
      throw new ConfigError("config.type", { file, key, expected: "a non-empty string" });
    }
  }
  const lang = raw.lang ?? ctx.lang;
  return { lang, ...DEFAULTS[lang], ...raw };
}

/**
 * Check the specifications. Returns { files, requirements } on success and throws
 * ValidationError with every problem otherwise. A missing directory is not an error.
 */
export function checkSpecs(ctx, { log }) {
  const config = loadSpecsConfig(ctx);
  setLang(config.lang);
  const dirAbs = join(ctx.root, ctx.specsDir);
  if (!existsSync(dirAbs)) {
    log("result.specsNone", { dir: ctx.specsDir });
    return { files: 0, requirements: 0 };
  }

  const problems = [];
  const add = (where, code, params = {}) => problems.push({ code, params: { where, file: where, ...params } });

  const names = readdirSync(dirAbs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "README.md")
    .map((e) => e.name)
    .sort();
  const prefixes = new Map(); // prefix → file
  const defined = new Map(); // id → where
  const retired = new Map(); // id → file

  for (const name of names) {
    const file = `${ctx.specsDir}/${name}`;
    const text = readFileSync(join(dirAbs, name), "utf8");
    const fm = parseFrontmatter(text);
    for (const e of fm.errors) {
      if (e.code === "fm.missing" || e.code === "fm.unclosed") continue;
      add(file, e.code, e.params);
    }
    if (!fm.data) {
      add(file, "spec.noFrontmatter");
      continue;
    }
    const prefix = getValue(fm.data, "prefix");
    if (typeof prefix !== "string" || !PREFIX.test(prefix)) {
      add(file, "spec.badPrefix", { prefix: typeof prefix === "string" ? prefix : "" });
      continue;
    }
    if (prefixes.has(prefix)) {
      add(file, "spec.duplicatePrefix", { prefix, other: prefixes.get(prefix) });
      continue;
    }
    prefixes.set(prefix, file);

    const idPattern = new RegExp(`^${prefix}-\\d{3}$`);
    const retiredList = getValue(fm.data, "retired") ?? [];
    if (!Array.isArray(retiredList)) add(file, "spec.retiredNotList");
    for (const id of Array.isArray(retiredList) ? retiredList : []) {
      if (!idPattern.test(id)) add(file, "spec.badRetired", { id, prefix });
      retired.set(id, file);
    }

    const lines = text.split(/\r?\n/);
    let fence = false;
    let section = "";
    let hasRequirements = false;
    let current = null;

    const finish = () => {
      if (!current) return;
      const { id, where, body } = current;
      if (!body.some((l) => /^- (?!\*\*)\S/.test(l))) add(where, "spec.noSentence", { id });
      for (const label of [config.acceptance, config.verification]) {
        const line = body.find((l) => l.startsWith(`- **${label}**`));
        if (!line) add(where, "spec.noLabel", { id, label });
        else if (!line.slice(`- **${label}**`.length).replace(/^[:：]/, "").trim()) add(where, "spec.emptyLabel", { id, label });
      }
      current = null;
    };

    for (let i = fm.end + 1; i < lines.length; i++) {
      const line = lines[i];
      const where = `${file}:${i + 1}`;
      if (/^\s*```/.test(line)) fence = !fence;
      if (fence) {
        current?.body.push(line);
        continue;
      }
      const h2 = line.match(/^##\s+(.*?)\s*$/);
      if (h2) {
        finish();
        section = h2[1];
        if (section === config.requirements) hasRequirements = true;
        continue;
      }
      const h3 = line.match(/^###\s+(\S+)(?:\s+(.*?))?\s*$/);
      if (h3 && section === config.requirements) {
        finish();
        const [, id, title] = h3;
        if (!idPattern.test(id)) {
          add(where, "spec.badHeading", { id, prefix });
          continue;
        }
        if (!title) add(where, "spec.noTitle", { id });
        if (defined.has(id)) add(where, "spec.duplicateId", { id, other: defined.get(id) });
        if (retired.has(id)) add(where, "spec.reusedId", { id });
        defined.set(id, where);
        current = { id, where, body: [] };
        continue;
      }
      current?.body.push(line.trim());
    }
    finish();
    if (!hasRequirements) add(file, "spec.noSection", { section: config.requirements });
  }

  // References: ids with a known prefix written in documents must exist (or be retired).
  if (prefixes.size) {
    const ref = new RegExp(`(?<![A-Za-z0-9_-])(?:${[...prefixes.keys()].join("|")})-\\d+(?![0-9])`, "g");
    for (const file of ctx.documents) {
      let fence = false;
      readFileSync(join(ctx.root, file), "utf8").split(/\r?\n/).forEach((line, i) => {
        if (/^\s*```/.test(line)) fence = !fence;
        if (fence || /^###\s/.test(line)) return;
        for (const m of line.matchAll(ref)) {
          if (!defined.has(m[0]) && !retired.has(m[0])) add(`${file}:${i + 1}`, "spec.unknownRef", { id: m[0] });
        }
      });
    }
  }

  if (problems.length) throw new ValidationError(problems);
  log("result.specsOk", { dir: ctx.specsDir, files: names.length, n: defined.size });
  return { files: names.length, requirements: defined.size };
}


