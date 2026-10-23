# md-issues

[日本語](README.ja.md)

Keep issues, specifications and other documents as Markdown files in your repository.
`md-issues` validates issue frontmatter, moves closed issues out of the way, keeps relative links
working, generates an index, and checks specifications and documents.

- One issue per file: `docs/issues/0001-slug.md`
- Open issues stay at the top of `docs/issues/`; `done` goes to `docs/issues/done/`, `wontfix` to `docs/issues/wontfix/`
- Relative links to moved issues are rewritten automatically
- `docs/issues/README.md` is generated from the frontmatter, so it never drifts
- Specifications in `docs/specs/`: requirement ids, acceptance criteria and references to ids are checked
- Documents in `docs/`: links, heading anchors and forbidden words are checked
- `md-issues check` for CI and pre-commit hooks
- No runtime dependencies

```text
docs/
  config.json        settings for the document check (optional)
  issues/            issues (config.json, GUIDE.md, TEMPLATE.md, README.md is generated)
  specs/             specifications (config.json is optional)
  plans/ ...         anything else; checked as documents
```

## Install

Install it as a devDependency and run it from `package.json` scripts, so that everyone uses
the same version (the generated index is compared byte for byte by `md-issues check`).

```bash
npm install --save-dev md-issues
```

```json
{
  "scripts": {
    "issues": "md-issues",
    "check:issues": "md-issues check"
  }
}
```

Node.js 18 or later is required.

## Quick start

```bash
npx md-issues init                         # create docs/issues/ with config.json, GUIDE.md, TEMPLATE.md, README.md
npx md-issues new "Fix the login redirect" # create docs/issues/0001-fix-the-login-redirect.md
npx md-issues set 1 status=done            # update frontmatter; the file moves to docs/issues/done/
npx md-issues list --status open           # print open issues
npm run issues                             # validate, move, rewrite links, regenerate the index
npm run check:issues                       # issues, specs and documents, changing nothing
```

## Issue files

File names are `NNNN-slug.md`: at least four digits, then lowercase letters, digits and
hyphens. `README.md`, `GUIDE.md` and `TEMPLATE.md` in the issue directory are not issues.

```markdown
---
id: 0001
title: Fix the login redirect
status: open          # open | doing | deferred | done | wontfix
severity: high
commits: [4505e41]
related: [0002, 0005]
---

## Problem
...
```

- `id`, `title` and `status` are always required; `id` must match the file name.
- `related` lists ids of other issues; they must exist.
- `commits` lists commit hashes (verified with `checkCommits`).

### Frontmatter syntax

The frontmatter is **not YAML**. A YAML parser would read `id: 0031` as the number 31 and
`commits: [4505e41]` as a float, so md-issues uses a small parser with these rules.
**Issues, specifications and every other document read by md-issues follow the same rules.**

- The file starts with `---` and the frontmatter ends at the next `---` line.
- One entry per line: `key: value` or `key: [a, b]` (comma-separated list).
- **Every value is a string.** Nothing is converted.
- ` # ...` after a value is a comment. A `#` preceded by whitespace therefore starts a comment
  (`title: Fix #12` reads as `Fix`); `new` and `set` refuse such values.
- A value that starts with `#` is a value, not a comment: `title: #k7-10s gap` reads as
  `#k7-10s gap`. So a key cannot be left empty with only a comment after it (`key:  # hint`
  reads as `# hint`).
- Quotes, multi-line values, nesting and anchors are not supported (quotes stay in the value).
- Blank lines are ignored. A line without `:` is an error.

## Commands

| Command | What it does |
| --- | --- |
| `md-issues` | Validate, move issues to the directory their status says, rewrite links, check links, generate the index |
| `md-issues check` | Check issues, specifications and documents; change nothing. Fails when an issue is misplaced or the index is out of date |
| `md-issues check issues` / `specs` / `docs` | Run one of the three checks |
| `md-issues init` | Create the issue directory with `config.json`, `GUIDE.md`, `TEMPLATE.md` and `README.md`. Existing files are kept. `--lang ja` writes Japanese files |
| `md-issues new "<title>"` | Create an issue from `TEMPLATE.md` with the next id |
| `md-issues set <id> <key>=<value> ...` | Change frontmatter values of one issue, then move and re-index |
| `md-issues list` | Print issues. Changes nothing |
| `md-issues refs <id>` | Show what refers to an issue (`related` and links). Changes nothing |

Common options:

| Option | Meaning |
| --- | --- |
| `--dir`, `-d <path>` | Issue directory, relative to the root (only for issue commands) |
| `--root <path>` | Project root |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show the version |

### `new`

- The id is the highest id found in every status directory plus one, zero-padded to four digits.
- The slug comes from the title (ASCII letters and digits). When the title has none
  (for example a Japanese title), pass `--slug <slug>`.
- The file is copied from `TEMPLATE.md` (or a built-in template) with `id` and `title` filled in.
- `--<key> <value>` sets initial values: `--status doing --severity high --related 0001,0002`.
- When a required key has no value, nothing is written and the error lists the options to add,
  with the allowed values from `config.json` (exit code 2).
- The new issue is validated together with the others before anything is written.

### `set`

```bash
md-issues set 0012 status=done commits=4505e41,9f0c2aa
md-issues set 12 severity=           # an empty value removes the key
```

- `12` finds `0012`. The id itself cannot be changed.
- `related` and `commits` are lists; `key=[a, b]` also makes a list.
- Only the frontmatter lines change; comments after values and the body are kept.
- Everything is validated before writing; on failure nothing changes.

### `list`

```bash
md-issues list --status open --status doing --severity high
md-issues list --related 0006        # issues that list 0006 in related
md-issues list --json
```

- The same key given twice matches either value; different keys must all match.
- List fields (`related`, `commits`) match when they contain the value. `list --related <id>`
  therefore shows the issues that refer to `<id>` in `related`, for example before deleting it.
- `--json` prints the frontmatter of each issue plus `group` and `path`.

### `refs`

```bash
md-issues refs 0006
# related  docs/issues/0009-x.md
# link     docs/notes.md:12
md-issues refs 6 --json
```

- Lists issues with the id in `related`, and relative links to the issue (with line numbers)
  in issue files, `GUIDE.md`, `TEMPLATE.md` and `linkFiles`. Links in code are skipped.
- Use it before deleting an issue: fix the references, then remove the file with `git rm`.

## Where things are

### Project root

1. `--root`
2. The nearest ancestor directory whose `package.json` has an `"issues"` entry
   (checked first, so that a workspace package in a monorepo does not win)
3. The nearest ancestor directory with a `package.json`
4. The Git work tree root

### Directories

| Directory | Default | Set in the root `package.json` |
| --- | --- | --- |
| Issues | `docs/issues/` | `"issues": { "dir": "..." }` (or `--dir`) |
| Specifications | `docs/specs/` | `"issues": { "specsDir": "..." }` |
| Documents | `docs/` | `"issues": { "docsDir": "..." }` |

`md-issues init --dir tasks` saves the issue directory to `package.json`, so later commands
find it without `--dir`. Directories must be inside the root. A missing specifications or
documents directory is not an error: that check has nothing to do.

**Upgrading from 0.2:** the issue directory used to default to `issues/`. To keep it there,
add `"issues": { "dir": "issues" }` to `package.json`; otherwise move it to `docs/issues/`.

## Configuration

Each directory may have a `config.json`: `docs/issues/config.json` for issues,
`docs/specs/config.json` for specifications and `docs/config.json` for documents. The settings
for issues are below; see [Specifications](#specifications) and [Documents](#documents) for the
others.

`<dir>/config.json` is optional. Unknown keys and wrong types are errors.
`md-issues init` adds `"$schema"` so that editors can complete and validate it
([schema/config.schema.json](schema/config.schema.json)).

| Key | Default | Meaning |
| --- | --- | --- |
| `lang` | `"en"` | `"en"` or `"ja"`: messages and the generated index. Never taken from the environment, so the output is the same on every machine |
| `status` | see below | Allowed statuses: `{ "<name>": { "group", "dir", "label"? } }`. Replaces the defaults |
| `groups` | see below | Index sections in order: `[{ "id", "label"?, "summary"? }]` |
| `required` | `[]` | Keys required in addition to `id`, `title`, `status` |
| `severity` | none | Allowed severities, highest first. Also sorts the index |
| `fields` | `{}` | Vocabularies: `{ "<key>": ["a", "b"] }` or `{ "<key>": "<regular expression>" }` |
| `columns` | `id, title, severity, status` | Index columns: a field name or `{ "label", "fields": [...] }` (values joined with a space) |
| `linkFiles` | `[]` | Other files whose links are rewritten and checked. `*`, `**` and `?` are allowed |
| `checkCommits` | `false` | With `md-issues check`, verify every hash in `commits` with Git |
| `openTasks` | `[]` | Statuses (for example `["done"]`) whose issues must not contain unchecked task list items (`- [ ]`). Catches issues closed with work left. Code blocks are ignored |
| `keys` | none | Extra frontmatter keys issues may use. When given, any other key is an error (catches typos such as `relatd`). Keys already used by the settings above, plus `related` and `commits`, are always allowed |

Default statuses and groups:

```json
{
  "status": {
    "open":     { "group": "active",  "dir": "" },
    "doing":    { "group": "active",  "dir": "" },
    "deferred": { "group": "active",  "dir": "" },
    "done":     { "group": "done",    "dir": "done/" },
    "wontfix":  { "group": "wontfix", "dir": "wontfix/" }
  },
  "groups": [
    { "id": "active", "summary": true },
    { "id": "done" },
    { "id": "wontfix" }
  ]
}
```

- `dir` is relative to the issue directory; `""` keeps issues at the top. It cannot leave the issue directory.
- Labels default to translations of the names above (or to the name itself).
- A group with `"summary": true` shows a per-severity breakdown in the summary line.
- Issue files are read wherever they are under the issue directory, so an issue left in a
  directory the configuration no longer uses is moved (or, with an unknown status, reported)
  rather than dropped from the index. Other Markdown files in such directories produce a warning.

A fuller example:

```json
{
  "$schema": "../../node_modules/md-issues/schema/config.schema.json",
  "lang": "ja",
  "severity": ["高", "中", "低"],
  "required": ["severity", "scope"],
  "fields": {
    "scope": ["template", "project"],
    "origin": "^(T\\d+|new|user)$"
  },
  "columns": ["id", "title", "severity", "status", "scope", { "label": "由来", "fields": ["origin", "commits"] }],
  "linkFiles": ["README.md", "AGENTS.md", "docs/**/*.md"],
  "checkCommits": true
}
```

## Links

When an issue moves, md-issues rewrites relative Markdown links in issue files,
`GUIDE.md`, `TEMPLATE.md` and `linkFiles`:

- A link is resolved from where its file was *before* the move and rewritten from where it is
  *after*, so both "the target moved" and "the file itself moved" are handled.
- Links into the issue directory that name an issue file are matched by file name. Writers do not
  need to know whether the issue is already in `done/`; the path at the time of writing is fine.
- Rewriting runs on every invocation, so hand-written links that miss `done/` are fixed too.
- Links inside code blocks and inline code are left alone.
- `linkFiles` must exist; a pattern that matches nothing is an error (to catch typos).
  `node_modules/` and `.git/` are skipped.

Then every one of those files and the generated index are checked:

- empty links `[..]()`
- relative links to `.md` files that do not exist
- heading anchors (`file.md#section`, `#section`) that do not exist, using GitHub's rules

## Specifications

A specification is one Markdown file in the specifications directory (`README.md` there is not
a specification). Its frontmatter names a prefix for its requirement ids:

```markdown
---
prefix: NEWS              # 2–12 uppercase letters and digits, starting with a letter
retired: [NEWS-004]       # ids no longer used (optional); they are never reused
---

## Requirements

### NEWS-001 Show the latest news on the front page
- When the front page is shown, the system must list the three latest posts.
- **Acceptance**: three posts, newest first, each with its date.
- **Verification**: open the front page after adding four posts.
```

`md-issues check specs` checks:

- the prefix is well-formed and not used by another file
- requirement headings (`### <PREFIX>-<3 digits> <title>`) under the requirements section, with no
  duplicates and no reuse of retired ids
- every requirement has a sentence (a list item), an acceptance criterion and a verification,
  neither empty
- **references:** an id with a known prefix written anywhere in the documents directory or in the
  Markdown files at the root (for example `README.md`, `AGENTS.md`) must be a defined or retired
  requirement. Code blocks and `###` headings are skipped

`docs/specs/config.json` (optional):

| Key | Default (`en` / `ja`) | Meaning |
| --- | --- | --- |
| `lang` | the issues' `lang`, else `"en"` | Messages and the default labels below |
| `requirements` | `"Requirements"` / `"要件"` | Heading of the requirements section |
| `acceptance` | `"Acceptance"` / `"受け入れ条件"` | Label of the acceptance criterion (`- **<label>**: ...`) |
| `verification` | `"Verification"` / `"検証"` | Label of the verification (`- **<label>**: ...`) |

## Documents

`md-issues check docs` checks every Markdown file in the documents directory (including issues
and specifications) and the Markdown files at the root. In a Git repository only tracked files
are read, so local notes that Git ignores are left alone:

- **links:** relative links to files that do not exist, empty links, and heading anchors
  (`file.md#section`, `#section`) that do not exist, using GitHub's rules. Code is skipped
- **links that leave the root** are errors: they work only on the author's machine
- **forbidden words** (`forbid` below) in any file tracked by Git, except the files in
  `forbidIgnore`. Use it to keep names of one project out of a shared repository

`docs/config.json` (optional):

| Key | Default | Meaning |
| --- | --- | --- |
| `lang` | the issues' `lang`, else `"en"` | Messages |
| `forbid` | `[]` | Words that must not appear in tracked files |
| `forbidIgnore` | the issue directory | Files where forbidden words are allowed (`*`, `**`, `?`). Issues record where things came from, so names belong there. `docs/config.json` itself is always ignored |

## Generated index

`<dir>/README.md` contains a summary line, one table per group (sorted by severity, then id),
and then `<dir>/GUIDE.md`, or a default guide describing the configured statuses and fields.
Do not edit it by hand. The notice at the top names the `package.json` script that runs
md-issues (for example `npm run issues`), or `md-issues` when there is none.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Validation error (issues, specifications, links, forbidden words, misplaced files, stale index, unknown commits) |
| 2 | Configuration or usage error (`config.json`, `package.json`, arguments, root not found) |

## Using it in CI and hooks

GitHub Actions:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm ci
- run: npm run check:issues
```

Git pre-commit hook (`.git/hooks/pre-commit`):

```sh
#!/bin/sh
exec npx --no-install md-issues check
```

With husky, put the same command in `.husky/pre-commit`. With lint-staged, use a function so
that the checks run once for the whole directory rather than per file:

```js
// lint-staged.config.js
export default {
  "docs/**/*.md": () => "md-issues check",
};
```

## License

[MIT](LICENSE)
