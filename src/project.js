// The context every command works on: root, issue directory and configuration.

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { ConfigError } from "./errors.js";
import { setLang } from "./i18n.js";
import { INDEX_FILE } from "./issues.js";
import { findRoot, readPackageJson, resolveDir } from "./root.js";

/**
 * @param {{ cwd: string, root?: string, dir?: string, mustExist?: boolean }} options
 */
export function openProject({ cwd, root: rootOption, dir: dirOption, mustExist = true }) {
  const root = findRoot({ cwd, root: rootOption });
  const dirRel = resolveDir(root, dirOption);
  const dirAbs = join(root, dirRel);
  if (mustExist && !(existsSync(dirAbs) && statSync(dirAbs).isDirectory())) {
    throw new ConfigError("dir.missing", { dir: dirRel });
  }
  const config = loadConfig(dirAbs, dirRel);
  setLang(config.lang);
  return {
    root,
    dirRel,
    dirAbs,
    config,
    indexRel: `${dirRel}/${INDEX_FILE}`,
    cmd: commandName(root),
  };
}

/**
 * How users run the tool here, for messages and the generated index.
 * "npm run <script>" when package.json has a script that runs md-issues without a
 * subcommand, otherwise "md-issues". Depends only on package.json, so the output is
 * the same on every machine.
 */
export function commandName(root) {
  const scripts = readPackageJson(root)?.json.scripts ?? {};
  const plain = /^(?:npx\s+)?md-issues(?:\s+(?:(?:-d|--dir|--root)\s+\S+|(?:--dir|--root)=\S+))*$/;
  for (const [name, value] of Object.entries(scripts)) {
    if (typeof value === "string" && plain.test(value.trim())) return `npm run ${name}`;
  }
  return "md-issues";
}
