// Locating the project root and the issue directory.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { ConfigError } from "./errors.js";

export const DEFAULT_DIR = "issues";

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
  let dir = dirOption;
  if (dir === undefined) {
    const pkg = readPackageJson(root);
    const entry = pkg?.json.issues;
    if (entry !== undefined) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry) ||
          (entry.dir !== undefined && typeof entry.dir !== "string")) {
        throw new ConfigError("pkg.issuesType", { file: "package.json" });
      }
      dir = entry.dir;
    }
  }
  return normalizeDir(root, dir ?? DEFAULT_DIR);
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
