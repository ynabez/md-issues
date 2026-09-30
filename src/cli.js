// Command line parsing and dispatch.

import { readFileSync } from "node:fs";
import { ConfigError, UsageError, ValidationError } from "./errors.js";
import { t } from "./i18n.js";
import { openProject } from "./project.js";
import { sync } from "./sync.js";

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const HELP = `Usage: md-issues [command] [options]

Commands:
  (none)                        Validate, move issues, rewrite links and generate the index
  --check, -c                   Validate only; change nothing (for CI and pre-commit)

Options:
  --dir, -d <path>              Issue directory, relative to the root
                                (default: "issues" in package.json, then issues/)
  --root <path>                 Project root (default: found from package.json or Git)
  --help, -h                    Show this help
  --version, -v                 Show the version
`;

const FLAGS = {
  "--check": "check", "-c": "check",
  "--help": "help", "-h": "help",
  "--version": "version", "-v": "version",
};
const VALUES = { "--dir": "dir", "-d": "dir", "--root": "root" };

/** Commands that take a subcommand word. Filled in as commands are added. */
const COMMANDS = {};

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

    if (FLAGS[name]) {
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
  if (command === "sync" && options.check) command = "check";

  const accepts = COMMANDS[command]?.fields ?? false;
  if (!accepts && fields.length) throw new UsageError("usage.unknownOption", { option: fields[0].option });
  const noValue = fields.find((f) => f.value === undefined);
  if (noValue) throw new UsageError("usage.missingValue", { option: noValue.option });
  if (options.check && command !== "check" && command !== "help" && command !== "version") {
    throw new UsageError("usage.conflict", { a: "--check", b: command });
  }
  return { command, positionals, options, fields, seen };
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
      case "check": {
        if (args.positionals.length) throw new UsageError("usage.extraArgs", { arg: args.positionals[0] });
        sync(openProject(base), { check: args.command === "check", log, warn });
        return 0;
      }
      default:
        return await COMMANDS[args.command].run({ args, base, log, warn, out });
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
