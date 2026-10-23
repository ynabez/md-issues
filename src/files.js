// Which files the specification and document checks read.
//
// In a Git repository only tracked files count, so local notes that Git ignores (or that a
// person keeps out with .git/info/exclude) are neither checked nor scanned. Outside Git,
// the tree is walked instead, skipping node_modules/ and hidden directories.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Root-relative paths ("/" separators) of the files in the project. */
export function projectFiles(root) {
  const tracked = gitFiles(root);
  if (tracked) return tracked;
  const out = [];
  const walk = (rel) => {
    const abs = rel ? join(root, rel) : root;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) out.push(path);
    }
  };
  walk("");
  return out.sort();
}

function gitFiles(root) {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 1 << 28,
    });
    // ls-files lists paths in deleted-but-not-staged state too; keep what exists.
    return out.split("\0").filter((f) => f && existsSync(join(root, f))).sort();
  } catch {
    return null;
  }
}

/** Markdown files under `docsDir` (recursively) and at the root. */
export function documentFiles(files, docsDir) {
  return files.filter((f) => f.endsWith(".md") && (f.startsWith(`${docsDir}/`) || !f.includes("/")));
}

/** Read lang from a JSON settings file without validating the rest. */
export function langOf(text) {
  try {
    const lang = JSON.parse(text).lang;
    return typeof lang === "string" ? lang : undefined;
  } catch {
    return undefined;
  }
}
