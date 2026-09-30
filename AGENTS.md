# AGENTS.md

Guidance for coding agents working in this repository.

## Language

- Write code comments, documentation, CLI messages and commit messages in **English**.
- The only exception is `README.ja.md`, which is the Japanese translation of `README.md`.
  When you change `README.md`, update `README.ja.md` in the same commit.
- Japanese CLI messages exist only as translations in `src/i18n.js` (selected by `lang` in
  the user's `config.json`). Add every new message to both `en` and `ja`.

## Commits

- Follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:` ...).
- Keep commits focused: one concern per commit.

## Design constraints

- **No runtime dependencies.** The package is installed as a devDependency in other
  repositories; keep it to the Node.js standard library.
- **No YAML parser.** Frontmatter is parsed by `src/frontmatter.js`, which only supports
  `key: value` and `key: [a, b]`, and keeps every value as a string. A YAML parser would turn
  `id: 0031` into `31` and some commit hashes (`4505e41`) into floats.
- **Output must be deterministic.** `--check` compares the generated index byte for byte, so
  nothing may depend on the environment (locale, `LANG`, time, OS path separator).
  The language comes only from `lang` in `config.json`.
- Exit codes: `0` success, `1` validation error, `2` configuration or usage error.

## Layout

| Path | Role |
| --- | --- |
| `bin/md-issues.js` | Entry point |
| `src/cli.js` | Argument parsing and dispatch |
| `src/` | Implementation (one module per concern) |
| `schema/config.schema.json` | JSON Schema for `config.json` |
| `test/` | Tests (`node --test`) |

## Checks

```bash
npm test
```
