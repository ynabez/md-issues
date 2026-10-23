// Command line parsing and dispatch.

import { readFileSync } from "node:fs";
import { ConfigError, UsageError, ValidationError } from "./errors.js";
import { t } from "./i18n.js";
import { openDocuments, openProject } from "./project.js";
import { checkSpecs } from "./checks/specs.js";
import { sync } from "./sync.js";
import { init } from "./commands/init.js";
import { newIssue } from "./commands/new.js";
import { setIssue } from "./commands/set.js";
import { listIssues } from "./commands/list.js";
import { refsCommand } from "./commands/refs.js";

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const HELP = `Usage: md-issues [command] [options]

Commands:
  (none)                        Validate, move issues, rewrite links and generate the index
  check [issues|specs]          Check issues and specifications (or one of them);
                                change nothing (for CI and pre-commit)
  init                          Create the issue directory with config.json, GUIDE.md,
                                TEMPLATE.md and README.md (existing files are kept).
                                With --dir, the directory is saved to package.json
    --lang <en|ja>              Language of the created files and messages (default: en)
  new "<title>"                 Create an issue with the next id from TEMPLATE.md
    --slug <slug>               File name part (required when the title has no ASCII
                                letters or digits)
    --<key> <value>             Initial frontmatter value, e.g. --status doing
                                (lists: --related 0001,0002)
  set <id> <key>=<value> ...    Change frontmatter values, then move and re-index
                                (lists: related=0001,0002; empty value removes a key)
  list                          Print issues; changes nothing
    --<key> <value>             Filter, e.g. --status open --status doing --severity high
                                (same key: any value matches; different keys: all must)
    --json                      Print JSON instead of a table
  refs <id>                     Show what refers to an issue: "related" in other issues and
                                relative links (for example before deleting it)
    --json                      Print JSON

Options:
  --dir, -d <path>              Issue directory, relative to the root
                                (default: "issues" in package.json, then docs/issues/)
  --root <path>                 Project root (default: found from package.json or Git)
  --help, -h                    Show this help
  --version, -v                 Show the version
`;

const FLAGS = {
  "--help": "help", "-h": "help",
  "--version": "version", "-v": "version",
  "--json": "json",
};
const VALUES = { "--dir": "dir", "-d": "dir", "--root": "root", "--lang": "lang", "--slug": "slug" };

// Options replaced by subcommands in 0.2.0, reported with a hint instead of "unknown option".
const RENAMED = { "--check": "check", "-c": "check", "--init": "init", "-i": "init" };

/** Subcommands. `fields`: accepts --<key> <value> frontmatter options. */
const COMMANDS = {
  check: { run: check },
  init: { run: init },
  new: { run: newIssue, fields: true },
  set: { run: setIssue },
  list: { run: listIssues, fields: true },
  refs: { run: refsCommand },
};

/** Parse argv into { command, positionals, options, fields }. */
export function parseArgs(argv) {
  const options = {};
  const fields = [];
  const positionals = [];
  const seen = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      positionals.push(arg);
      continue;
    }
    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    const takeValue = () => {
      if (inline !== undefined) return inline;
      if (i + 1 >= argv.length) throw new UsageError("usage.missingValue", { option: name });
      return argv[++i];
    };

    if (RENAMED[arg]) {
      throw new UsageError("usage.renamed", { option: arg, command: `md-issues ${RENAMED[arg]}` });
    } else if (FLAGS[name]) {
      if (inline !== undefined) throw new UsageError("usage.unknownOption", { option: arg });
      options[FLAGS[name]] = true;
      seen.push(name);
    } else if (VALUES[name]) {
      options[VALUES[name]] = takeValue();
      seen.push(name);
    } else if (name.startsWith("--") && name.length > 2) {
      // Unknown long options are frontmatter fields for commands that accept them.
      // The value is checked after the command is known, so that an unknown option is
      // reported as such for commands without fields.
      const value = inline ?? (i + 1 < argv.length && !argv[i + 1].startsWith("--") ? argv[++i] : undefined);
      fields.push({ option: name, key: name.slice(2), value });
    } else {
      throw new UsageError("usage.unknownOption", { option: arg });
    }
  }

  let command = "sync";
  if (options.help) command = "help";
  else if (options.version) command = "version";
  else if (positionals.length) {
    const word = positionals.shift();
    if (!COMMANDS[word]) throw new UsageError("usage.unknownCommand", { command: word });
    command = word;
  }
  if (options.json && command !== "list" && command !== "refs" && command !== "help") {
    throw new UsageError("usage.optionNotAllowed", { option: "--json", with: "list / refs" });
  }
  if (options.slug !== undefined && command !== "new" && command !== "help") {
    throw new UsageError("usage.optionNotAllowed", { option: "--slug", with: "new" });
  }
  if (options.lang !== undefined && command !== "init" && command !== "help") {
    throw new UsageError("usage.optionNotAllowed", { option: "--lang", with: "init" });
  }

  const accepts = COMMANDS[command]?.fields ?? false;
  if (!accepts && fields.length) throw new UsageError("usage.unknownOption", { option: fields[0].option });
  const noValue = fields.find((f) => f.value === undefined);
  if (noValue) throw new UsageError("usage.missingValue", { option: noValue.option });
  return { command, positionals, options, fields, seen };
}

/** md-issues check: the full pipeline without writing anything. */
const CHECKS = ["issues", "specs"];

/**
 * md-issues check [issues|specs]: run the checks without writing anything.
 * Every part runs even when an earlier one fails, so that one run shows everything.
 * A configuration error still stops at once.
 */
function check({ args, base, log, warn }) {
  const [part, ...extra] = args.positionals;
  if (extra.length) throw new UsageError("usage.extraArgs", { arg: extra[0] });
  if (part !== undefined && !CHECKS.includes(part)) throw new UsageError("usage.unknownCheck", { part, known: CHECKS.join(" | ") });

  const problems = [];
  const seen = new Set();
  const collect = (fn) => {
    try {
      fn();
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      for (const p of e.problems) {
        // The same problem may be found by more than one check; report it once.
        const key = JSON.stringify([p.code, String(p.params?.file ?? "").replace(/:\d+$/, ""), p.params?.target ?? p.params]);
        if (!seen.has(key)) {
          seen.add(key);
          problems.push(p);
        }
      }
    }
  };
  for (const name of part ? [part] : CHECKS) {
    if (name === "issues") {
      collect(() => sync(openProject(base), { check: true, log, warn }));
    } else {
      const ctx = openDocuments(base);
      collect(() => checkSpecs(ctx, { log }));
    }
  }
  if (problems.length) throw new ValidationError(problems);
  return 0;
}

/**
 * Run the CLI. Returns the exit code.
 * @param {string[]} argv
 * @param {{ cwd: string, stdout: NodeJS.WritableStream, stderr: NodeJS.WritableStream }} io
 */
export async function main(argv, io) {
  const out = (line) => io.stdout.write(`${line}\n`);
  const err = (line) => io.stderr.write(`${line}\n`);
  const log = (code, params) => out(t(code, params));
  const warn = (code, params) => err(`${t("prefix.warning")}: ${t(code, params)}`);

  try {
    const args = parseArgs(argv);
    const base = { cwd: io.cwd, root: args.options.root, dir: args.options.dir };

    switch (args.command) {
      case "help":
        out(HELP.trimEnd());
        return 0;
      case "version":
        out(VERSION);
        return 0;
      case "sync":
        if (args.positionals.length) throw new UsageError("usage.extraArgs", { arg: args.positionals[0] });
        sync(openProject(base), { log, warn });
        return 0;
      default:
        return await COMMANDS[args.command].run({ args, base, log, warn, out, err });
    }
  } catch (e) {
    if (e instanceof ValidationError) {
      err(t("prefix.validation"));
      for (const p of e.problems) err(`  - ${t(p.code, p.params)}`);
      return e.exitCode;
    }
    if (e instanceof UsageError) {
      err(`${t("prefix.usage")}: ${t(e.code, e.params)}`);
      err(t("hint.help"));
      return e.exitCode;
    }
    if (e instanceof ConfigError) {
      err(`${t("prefix.config")}: ${t(e.code, e.params)}`);
      return e.exitCode;
    }
    throw e;
  }
}
