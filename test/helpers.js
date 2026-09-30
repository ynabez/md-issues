import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "md-issues.js");

/** Create a temporary project from { "relative/path": "content" }. */
export function project(files = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "md-issues-")));
  for (const [path, content] of Object.entries(files)) write(root, path, content);
  return root;
}

export function write(root, path, content) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content, null, 2) + "\n");
}

export function read(root, path) {
  return readFileSync(join(root, path), "utf8");
}

export function exists(root, path) {
  return existsSync(join(root, path));
}

/** Run the CLI. Returns { code, stdout, stderr }. */
export function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Frontmatter + body for an issue file. */
export function issue(fields, body = "\n## Body\n") {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(", ")}]` : v}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}
