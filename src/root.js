// Locating the project root and the issue directory.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { ConfigError } from "./errors.js";

export const DEFAULT_DIR = "docs/issues";
export const DEFAULT_SPECS_DIR = "docs/specs";
export const DEFAULT_DOCS_DIR = "docs";

// Keys of "issues" in package.json.
const PACKAGE_KEYS = ["dir", "specsDir", "docsDir"];

/**
 * Find the project root.
 *
 *   1. --root
 *   2. the nearest ancestor whose package.json has an "issues" entry
 *      (checked first so that a workspace package inside a monorepo does not win)
 *   3. the nearest ancestor with a package.json
 *   4. the Git work tree root
 */
export function findRoot({ cwd, root }) {
  if (root) {
    const abs = resolve(cwd, root);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      throw new ConfigError("root.notDirectory", { path: root });
    }
    return abs;
  }

  let nearest = null;
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const pkg = readPackageJson(dir);
    if (pkg) {
      if (pkg.json.issues !== undefined) return dir;
      nearest ??= dir;
    }
    if (dirname(dir) === dir) break;
  }
  if (nearest) return nearest;

  const top = gitTopLevel(cwd);
  if (top) return top;
  throw new ConfigError("root.notFound", { cwd });
}

function gitTopLevel(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Read package.json in `dir`. Returns null when there is none. */
export function readPackageJson(dir) {
  const file = join(dir, "package.json");
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  try {
    return { file, text, json: JSON.parse(text) };
  } catch (e) {
    throw new ConfigError("pkg.invalidJson", { file, message: e.message });
  }
}

/**
 * Decide the issue directory, relative to the root (POSIX separators, no trailing slash).
 *
 *   1. --dir
 *   2. "issues": { "dir": "..." } in the root package.json
 *   3. issues/
 */
export function resolveDir(root, dirOption) {
  return normalizeDir(root, dirOption ?? packageEntry(root).dir ?? DEFAULT_DIR);
}

/** The specifications directory: "issues": { "specsDir" } in package.json, then docs/specs/. */
export function resolveSpecsDir(root) {
  return normalizeDir(root, packageEntry(root).specsDir ?? DEFAULT_SPECS_DIR);
}

/** The documents directory: "issues": { "docsDir" } in package.json, then docs/. */
export function resolveDocsDir(root) {
  return normalizeDir(root, packageEntry(root).docsDir ?? DEFAULT_DOCS_DIR);
}

/** The "issues" entry of the root package.json, validated. {} when there is none. */
function packageEntry(root) {
  const entry = readPackageJson(root)?.json.issues;
  if (entry === undefined) return {};
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new ConfigError("pkg.issuesType", { file: "package.json" });
  }
  for (const [key, value] of Object.entries(entry)) {
    if (!PACKAGE_KEYS.includes(key)) {
      throw new ConfigError("pkg.issuesKey", { file: "package.json", key, known: PACKAGE_KEYS.join(", ") });
    }
    if (typeof value !== "string") throw new ConfigError("pkg.issuesType", { file: "package.json" });
  }
  return entry;
}

function normalizeDir(root, dir) {
  const abs = resolve(root, dir);
  const rel = relative(root, abs);
  if (!rel) throw new ConfigError("dir.isRoot", { dir });
  if (rel.startsWith("..") || isAbsolute(rel)) throw new ConfigError("dir.outside", { dir });
  return rel.split(sep).join("/");
}

/**
 * Save the issue directory to the root package.json, keeping its indentation.
 * Returns false when there is no package.json.
 */
export function saveDirToPackageJson(root, dir) {
  const pkg = readPackageJson(root);
  if (!pkg) return false;
  const indent = pkg.text.match(/^[ \t]+(?=")/m)?.[0] ?? "  ";
  const eol = pkg.text.includes("\r\n") ? "\r\n" : "\n";
  const issues = typeof pkg.json.issues === "object" && pkg.json.issues !== null ? pkg.json.issues : {};
  pkg.json.issues = { ...issues, dir };
  const out = JSON.stringify(pkg.json, null, indent).replace(/\n/g, eol) + eol;
  writeFileSync(pkg.file, out);
  return true;
}
