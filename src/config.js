// Loading and validating <dir>/config.json.

import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { ConfigError } from "./errors.js";
import { LANGS, defaultStatusLabel, defaultGroupLabel, defaultColumnLabel } from "./i18n.js";

export const CONFIG_FILE = "config.json";

/** Keys every issue must have, whatever `required` says. */
export const CORE_KEYS = ["id", "title", "status"];

export const CONFIG_KEYS = [
  "$schema", "lang", "status", "groups", "required", "severity",
  "fields", "columns", "linkFiles", "checkCommits",
];

// Fields whose vocabulary is configured elsewhere, so `fields` must not redefine them.
const RESERVED_FIELDS = ["id", "title", "status", "severity", "related", "commits"];

const DEFAULT_STATUS = {
  open:     { group: "active",  dir: "" },
  doing:    { group: "active",  dir: "" },
  deferred: { group: "active",  dir: "" },
  done:     { group: "done",    dir: "done/" },
  wontfix:  { group: "wontfix", dir: "wontfix/" },
};

const DEFAULT_GROUPS = [
  { id: "active", summary: true },
  { id: "done" },
  { id: "wontfix" },
];

/**
 * Read and normalize the configuration of the issue directory.
 * `dirRel` is only used in messages.
 */
export function loadConfig(dirAbs, dirRel) {
  const file = posix.join(dirRel, CONFIG_FILE);
  const path = join(dirAbs, CONFIG_FILE);
  let raw = {};
  if (existsSync(path)) {
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      throw new ConfigError("config.invalidJson", { file, message: e.message });
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new ConfigError("config.notObject", { file });
    }
  }
  return normalizeConfig(raw, file);
}

export function normalizeConfig(raw, file = CONFIG_FILE) {
  const fail = (code, params = {}) => { throw new ConfigError(code, { file, ...params }); };
  const expect = (key, ok, expected) => { if (raw[key] !== undefined && !ok(raw[key])) fail("config.type", { key, expected }); };

  for (const key of Object.keys(raw)) {
    if (!CONFIG_KEYS.includes(key)) fail("config.unknownKey", { key, known: CONFIG_KEYS.filter((k) => k !== "$schema").join(", ") });
  }

  expect("lang", (v) => LANGS.includes(v), LANGS.map((l) => `"${l}"`).join(" | "));
  const lang = raw.lang ?? "en";

  expect("status", isPlainObject, "an object");
  expect("groups", Array.isArray, "an array");
  expect("required", isStringArray, "an array of strings");
  expect("severity", isStringArray, "an array of strings");
  expect("fields", isPlainObject, "an object");
  expect("columns", Array.isArray, "an array");
  expect("linkFiles", isStringArray, "an array of strings");
  expect("checkCommits", (v) => typeof v === "boolean", "true or false");

  // Groups first: statuses refer to them.
  const groups = (raw.groups ?? DEFAULT_GROUPS).map((g, i) => {
    if (!isPlainObject(g) || typeof g.id !== "string" || !g.id) fail("config.type", { key: `groups[${i}]`, expected: '{ "id": string, "label"?: string, "summary"?: boolean }' });
    for (const k of Object.keys(g)) if (!["id", "label", "summary"].includes(k)) fail("config.unknownKey", { key: `groups[${i}].${k}`, known: "id, label, summary" });
    if (g.label !== undefined && typeof g.label !== "string") fail("config.type", { key: `groups[${i}].label`, expected: "a string" });
    if (g.summary !== undefined && typeof g.summary !== "boolean") fail("config.type", { key: `groups[${i}].summary`, expected: "true or false" });
    return { id: g.id, label: g.label ?? defaultGroupLabel(lang, g.id), summary: g.summary ?? false };
  });
  const groupIds = new Set();
  for (const g of groups) {
    if (groupIds.has(g.id)) fail("config.duplicateGroup", { group: g.id });
    groupIds.add(g.id);
  }

  const status = {};
  for (const [name, s] of Object.entries(raw.status ?? DEFAULT_STATUS)) {
    const key = `status.${name}`;
    if (!/^[A-Za-z0-9_-]+$/.test(name)) fail("config.badStatusName", { status: name });
    if (!isPlainObject(s)) fail("config.type", { key, expected: '{ "group": string, "dir": string, "label"?: string }' });
    for (const k of Object.keys(s)) if (!["label", "group", "dir"].includes(k)) fail("config.unknownKey", { key: `${key}.${k}`, known: "label, group, dir" });
    if (typeof s.group !== "string") fail("config.type", { key: `${key}.group`, expected: "a string" });
    if (!groupIds.has(s.group)) fail("config.unknownGroup", { status: name, group: s.group });
    if (s.dir !== undefined && typeof s.dir !== "string") fail("config.type", { key: `${key}.dir`, expected: "a string" });
    if (s.label !== undefined && typeof s.label !== "string") fail("config.type", { key: `${key}.label`, expected: "a string" });
    status[name] = {
      label: s.label ?? defaultStatusLabel(lang, name),
      group: s.group,
      dir: normalizeStatusDir(s.dir ?? "", () => fail("config.statusDir", { status: name, dir: s.dir })),
    };
  }
  if (!Object.keys(status).length) fail("config.type", { key: "status", expected: "a non-empty object" });

  const fields = {};
  for (const [name, vocab] of Object.entries(raw.fields ?? {})) {
    if (RESERVED_FIELDS.includes(name)) fail("config.reservedField", { field: name });
    if (typeof vocab === "string") {
      try { new RegExp(vocab, "u"); } catch (e) { fail("config.badRegex", { key: `fields.${name}`, message: e.message }); }
    } else if (!isStringArray(vocab)) {
      fail("config.type", { key: `fields.${name}`, expected: "an array of strings or a regular expression string" });
    }
    fields[name] = vocab;
  }

  const severity = raw.severity ?? null;
  const columns = normalizeColumns(raw.columns, { lang, severity, fail });

  return {
    lang,
    status,
    groups,
    required: [...new Set([...CORE_KEYS, ...(raw.required ?? [])])],
    severity,
    fields,
    columns,
    linkFiles: raw.linkFiles ?? [],
    checkCommits: raw.checkCommits ?? false,
  };
}

/** "" or "done/" style: relative, inside the issue directory, with a trailing slash. */
function normalizeStatusDir(dir, fail) {
  if (dir === "" || dir === ".") return "";
  if (dir.includes("\\") || dir.startsWith("/") || /^[A-Za-z]:/.test(dir)) fail();
  const norm = posix.normalize(dir).replace(/\/+$/, "");
  if (!norm || norm === "." || norm === ".." || norm.startsWith("../")) fail();
  return `${norm}/`;
}

/**
 * Columns of the index tables. Each column shows one or more fields joined by a space.
 *
 *   "severity"                               → one field, default label
 *   { "label": "Origin", "fields": ["origin", "commits"] }
 */
function normalizeColumns(columns, { lang, severity, fail }) {
  const list = columns ?? ["id", "title", ...(severity ? ["severity"] : []), "status"];
  return list.map((c, i) => {
    if (typeof c === "string") return { label: defaultColumnLabel(lang, c), fields: [c] };
    const key = `columns[${i}]`;
    if (!isPlainObject(c)) fail("config.type", { key, expected: 'a field name or { "fields": [...], "label"?: string }' });
    for (const k of Object.keys(c)) if (!["label", "fields"].includes(k)) fail("config.unknownKey", { key: `${key}.${k}`, known: "label, fields" });
    if (!isStringArray(c.fields) || !c.fields.length) fail("config.type", { key: `${key}.fields`, expected: "a non-empty array of strings" });
    if (c.label !== undefined && typeof c.label !== "string") fail("config.type", { key: `${key}.label`, expected: "a string" });
    return { label: c.label ?? defaultColumnLabel(lang, c.fields[0]), fields: c.fields };
  });
}

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v) {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}
