// Minimal glob support for linkFiles: `*`, `**` and `?`. Paths use "/".

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git"]);

export function hasGlob(pattern) {
  return /[*?]/.test(pattern);
}

export function globToRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      const slash = pattern[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * Files under `root` matching `pattern`, as sorted root-relative paths.
 * Only the part of the tree below the pattern's fixed prefix is walked, and
 * node_modules/ and .git/ are skipped.
 */
export function expandGlob(root, pattern) {
  const segments = pattern.split("/");
  const fixed = [];
  for (const s of segments) {
    if (hasGlob(s)) break;
    fixed.push(s);
  }
  const base = fixed.join("/");
  const re = globToRegExp(pattern);
  const out = [];
  const walk = (rel) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path);
      } else if (re.test(path)) {
        out.push(path);
      }
    }
  };
  walk(base);
  return out.sort();
}
