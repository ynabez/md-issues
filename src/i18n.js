// User-facing text in every supported language.
//
// The language comes only from `lang` in config.json (never from the environment), so the
// generated index is the same on every machine. Messages printed before the configuration
// is loaded use English.

export const LANGS = ["en", "ja"];

let current = "en";

export function setLang(lang) {
  current = LANGS.includes(lang) ? lang : "en";
}

export function getLang() {
  return current;
}

/** Translate a message code. */
export function t(code, params = {}, lang = current) {
  const entry = MESSAGES[lang]?.[code] ?? MESSAGES.en[code];
  if (entry === undefined) return code;
  return typeof entry === "function" ? entry(params) : format(entry, params);
}

function format(text, params) {
  return text.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k])));
}

const STATUS_LABELS = {
  en: { open: "Open", doing: "Doing", deferred: "Deferred", done: "Done", wontfix: "Won't fix" },
  ja: { open: "未対応", doing: "対応中", deferred: "保留", done: "完了", wontfix: "対応しない" },
};

const GROUP_LABELS = {
  en: { active: "Open", done: "Done", wontfix: "Won't fix" },
  ja: { active: "未対応", done: "完了", wontfix: "対応しない" },
};

const COLUMN_LABELS = {
  en: { id: "#", title: "Title", status: "Status", severity: "Severity", scope: "Scope", origin: "Origin", commits: "Commits", related: "Related" },
  ja: { id: "#", title: "項目", status: "状態", severity: "深刻度", scope: "範囲", origin: "由来", commits: "コミット", related: "関連" },
};

export const defaultStatusLabel = (lang, status) => STATUS_LABELS[lang]?.[status] ?? status;
export const defaultGroupLabel = (lang, group) => GROUP_LABELS[lang]?.[group] ?? group;
export const defaultColumnLabel = (lang, field) => COLUMN_LABELS[lang]?.[field] ?? field;

const MESSAGES = {
  en: {
    // Prefixes
    "prefix.config": "Configuration error",
    "prefix.usage": "Usage error",
    "prefix.validation": "Validation errors:",
    "prefix.warning": "Warning",
    "hint.help": "Run `md-issues --help` for usage.",

    // Root and directory
    "root.notDirectory": "--root {path} is not a directory",
    "root.notFound": "could not find the project root: no package.json or Git repository above {cwd}. Use --root.",
    "pkg.invalidJson": "{file} is not valid JSON: {message}",
    "pkg.issuesType": '{file}: "issues" must be an object like { "dir": "issues" }',
    "dir.isRoot": "the issue directory ({dir}) must not be the project root",
    "dir.outside": "the issue directory ({dir}) must be inside the project root",
    "dir.missing": "the issue directory {dir}/ does not exist. Create it with `md-issues --init`.",

    // config.json
    "config.invalidJson": "{file} is not valid JSON: {message}",
    "config.notObject": "{file} must contain a JSON object",
    "config.unknownKey": '{file}: unknown key "{key}" (known: {known})',
    "config.type": '{file}: "{key}" must be {expected}',
    "config.badRegex": '{file}: "{key}" is not a valid regular expression: {message}',
    "config.badStatusName": '{file}: status name "{status}" may only contain letters, digits, "_" and "-"',
    "config.statusDir": '{file}: status "{status}": dir "{dir}" must be a relative path inside the issue directory',
    "config.unknownGroup": '{file}: status "{status}" refers to unknown group "{group}"',
    "config.duplicateGroup": '{file}: group "{group}" is defined more than once',
    "config.reservedField": '{file}: fields.{field} is not allowed (configure it with its own key, or not at all)',
    "config.linkFileMissing": "{file}: linkFiles entry {pattern} does not exist",
    "config.linkGlobEmpty": "{file}: linkFiles pattern {pattern} matches no files",

    // Command line
    "usage.unknownOption": "unknown option {option}",
    "usage.missingValue": "{option} needs a value",
    "usage.unknownCommand": "unknown command {command}",
    "usage.extraArgs": "unexpected argument {arg}",
    "usage.conflict": "{a} cannot be combined with {b}",
    "usage.optionNotAllowed": "{option} can only be used with {with}",
    "usage.missingTitle": 'give a title: md-issues new "<title>"',
    "usage.missingSlug": 'cannot derive a slug from "{title}". Give one with --slug <slug>.',
    "usage.badSlug": "slug {slug} must contain only lowercase letters, digits and hyphens",
    "usage.missingId": "give an issue id: md-issues set <id> <key>=<value> ...",
    "usage.missingAssignment": "give at least one <key>=<value>",
    "usage.unknownId": "no issue with id {id}",
    "usage.badAssignment": "{arg} is not <key>=<value>",
    "usage.badKey": "{key} is not a valid frontmatter key",
    "usage.cannotSetId": "the id cannot be changed with set",
    "usage.unknownField": "unknown field --{field} (known: {known})",
    "usage.notRepresentable": '{key}: the value "{value}" cannot be written as frontmatter (no line breaks, no " #", no [..] around a plain value)',
    "usage.badLang": "--lang must be one of: {langs}",

    // Issues
    "fm.missing": "{file}: no frontmatter (the file must start with ---)",
    "fm.unclosed": "{file}: frontmatter is not closed with ---",
    "fm.noColon": '{file}: line is not "key: value" → {line}',
    "fm.badKey": "{file}: invalid key → {line}",
    "fm.duplicate": "{file}: key {key} appears more than once",
    "issue.badName": "{file}: file name must be NNNN-slug.md (slug: lowercase letters, digits and hyphens)",
    "issue.required": "{file}: frontmatter has no {key}",
    "issue.notString": "{file}: {key} must be a single value, not a list",
    "issue.idMismatch": "{file}: id ({id}) does not match the file name",
    "issue.badStatus": "{file}: invalid status ({value}) → {allowed}",
    "issue.badSeverity": "{file}: invalid severity ({value}) → {allowed}",
    "issue.badValue": "{file}: invalid {key} ({value}) → {allowed}",
    "issue.badPattern": "{file}: invalid {key} ({value}) → does not match /{pattern}/",
    "issue.duplicateId": "id {id} is used by more than one issue",
    "issue.relatedMissing": "{file}: related issue {id} does not exist",
    "issue.misplaced": "{from} should be at {to} (run `{cmd}`)",
    "issue.moveConflict": "cannot move {from}: {to} already exists",
    "issue.unknownDir": "{file} is not in a directory used by any status and is ignored",

    // Links and commits
    "link.empty": "{file}: empty link target [..]()",
    "link.missing": "{file}: link target does not exist → {target}",
    "link.anchor": "{file}: heading not found → {target}",
    "commit.missing": "{file}: commit {hash} does not exist",
    "commit.noGit": "cannot verify commits: {root} is not a Git repository",

    // Results
    "result.moved": "Moved: {from} → {to}",
    "result.generated": "Generated {index} ({n} issues)",
    "result.upToDate": "{index} is up to date ({n} issues)",
    "result.checkOk": "Check passed ({n} issues)",
    "result.stale": "{index} is out of date. Run `{cmd}`.",
    "result.created": "Created {path}",
    "result.skipped": "Skipped {path} (already exists)",
    "result.updated": "Updated {path}",
    "result.savedDir": 'Saved "issues": {"dir": "{dir}"} to package.json',
    "result.noPackageJson": "There is no package.json at the project root, so pass --dir {dir} every time.",
    "result.noIssues": "No issues.",

    // Generated index
    "index.title": "Issues",
    "index.notice": "**This file is generated by `{cmd}`. Do not edit it by hand.**\nTo change it, edit the frontmatter of each issue file.",
    "index.summary": ({ total, parts }) => `${total} issue${total === 1 ? "" : "s"} — ${parts}`,
    "index.breakdown": "{label} {n} ({breakdown})",
    "index.count": "{label} {n}",

    // Default guide
    "guide": ({ cmd, dir, active, moves, example, note }) => `## How to write issues

One issue per file. Name files \`NNNN-slug.md\` (slug: lowercase letters, digits and hyphens).

**Only issues still to be dealt with (${active}) stay directly in \`${dir}/\`.**
${moves ? `${moves}\n` : ""}\`${cmd}\` moves them, so **do not move files by hand.**
It also rewrites the relative links affected by the move.

\`\`\`markdown
${example}
\`\`\`

Refer to other issues with relative links. \`${cmd}\` rewrites them when the target moves,
so **the path at the time of writing is fine.**${note ? `

> This is the default text. Write project-specific conventions in \`${dir}/GUIDE.md\`;
> it replaces this section.` : ""}`,
    "guide.move": "`status: {status}` goes to `{dir}`.",
    "guide.title": "One-line summary",
    "guide.commits": "commits that address the issue",
    "guide.related": "ids of related issues",
    "guide.any": "any value",
    "template": `## Problem

## Resolution

## Verification
`,
  },

  ja: {
    "prefix.config": "設定エラー",
    "prefix.usage": "使いかたの誤り",
    "prefix.validation": "検証エラー:",
    "prefix.warning": "警告",
    "hint.help": "使いかたは `md-issues --help` で表示します。",

    "root.notDirectory": "--root {path} はディレクトリではありません",
    "root.notFound": "プロジェクトの root が見つかりません: {cwd} より上に package.json も Git リポジトリもありません。--root で指定してください。",
    "pkg.invalidJson": "{file} が JSON として読めません: {message}",
    "pkg.issuesType": '{file}: "issues" は { "dir": "issues" } のようなオブジェクトにします',
    "dir.isRoot": "課題ディレクトリ（{dir}）をプロジェクトの root にはできません",
    "dir.outside": "課題ディレクトリ（{dir}）はプロジェクトの root の中に置きます",
    "dir.missing": "課題ディレクトリ {dir}/ がありません。`md-issues --init` で作ってください。",

    "config.invalidJson": "{file} が JSON として読めません: {message}",
    "config.notObject": "{file} は JSON のオブジェクトにします",
    "config.unknownKey": '{file}: 未知のキー "{key}"（使えるもの: {known}）',
    "config.type": '{file}: "{key}" は {expected} にします',
    "config.badRegex": '{file}: "{key}" が正規表現として不正です: {message}',
    "config.badStatusName": '{file}: status の名前 "{status}" に使えるのは英数字・"_"・"-" だけです',
    "config.statusDir": '{file}: status "{status}" の dir "{dir}" は課題ディレクトリの中の相対パスにします',
    "config.unknownGroup": '{file}: status "{status}" が未定義のグループ "{group}" を参照しています',
    "config.duplicateGroup": '{file}: グループ "{group}" が重複しています',
    "config.reservedField": "{file}: fields.{field} は書けません（専用のキーで設定するか、設定しないでください）",
    "config.linkFileMissing": "{file}: linkFiles の {pattern} がありません",
    "config.linkGlobEmpty": "{file}: linkFiles の {pattern} に当たるファイルがありません",

    "usage.unknownOption": "未知のオプション {option}",
    "usage.missingValue": "{option} に値がありません",
    "usage.unknownCommand": "未知のコマンド {command}",
    "usage.extraArgs": "余分な引数 {arg}",
    "usage.conflict": "{a} と {b} は同時に使えません",
    "usage.optionNotAllowed": "{option} は {with} と一緒にだけ使えます",
    "usage.missingTitle": 'タイトルを指定してください: md-issues new "<タイトル>"',
    "usage.missingSlug": "「{title}」から slug を作れません。--slug <slug> で指定してください。",
    "usage.badSlug": "slug {slug} に使えるのは英小文字・数字・ハイフンだけです",
    "usage.missingId": "課題の id を指定してください: md-issues set <id> <キー>=<値> ...",
    "usage.missingAssignment": "<キー>=<値> を 1 つ以上指定してください",
    "usage.unknownId": "id {id} の課題はありません",
    "usage.badAssignment": "{arg} が <キー>=<値> の形になっていません",
    "usage.badKey": "{key} は frontmatter のキーとして使えません",
    "usage.cannotSetId": "id は set で変えられません",
    "usage.unknownField": "未知の項目 --{field}（使えるもの: {known}）",
    "usage.notRepresentable": '{key}: 値「{value}」は frontmatter に書けません（改行・" #"・値全体を囲む [..] は使えません）',
    "usage.badLang": "--lang は {langs} のどれかにします",

    "fm.missing": "{file}: frontmatter がありません（先頭を --- にします）",
    "fm.unclosed": "{file}: frontmatter が --- で閉じていません",
    "fm.noColon": "{file}: 「キー: 値」でない行があります → {line}",
    "fm.badKey": "{file}: キーが不正です → {line}",
    "fm.duplicate": "{file}: キー {key} が重複しています",
    "issue.badName": "{file}: ファイル名は NNNN-slug.md（slug は英小文字・数字・ハイフン）にします",
    "issue.required": "{file}: frontmatter に {key} がありません",
    "issue.notString": "{file}: {key} は配列でなく 1 つの値にします",
    "issue.idMismatch": "{file}: id ({id}) がファイル名と一致しません",
    "issue.badStatus": "{file}: status が不正です ({value}) → {allowed}",
    "issue.badSeverity": "{file}: severity が不正です ({value}) → {allowed}",
    "issue.badValue": "{file}: {key} が不正です ({value}) → {allowed}",
    "issue.badPattern": "{file}: {key} が不正です ({value}) → /{pattern}/ に合いません",
    "issue.duplicateId": "id {id} が複数の課題で使われています",
    "issue.relatedMissing": "{file}: related の {id} が存在しません",
    "issue.misplaced": "{from} は {to} に置きます（`{cmd}` を実行してください）",
    "issue.moveConflict": "{from} を移動できません: {to} がすでにあります",
    "issue.unknownDir": "{file} はどの status の置き場所でもないため、無視します",

    "link.empty": "{file}: リンク先が空の [..]() があります",
    "link.missing": "{file}: リンク先がありません → {target}",
    "link.anchor": "{file}: 見出しがありません → {target}",
    "commit.missing": "{file}: コミット {hash} がありません",
    "commit.noGit": "コミットを確かめられません: {root} は Git リポジトリではありません",

    "result.moved": "移動: {from} → {to}",
    "result.generated": "{index} を生成しました（{n} 件）",
    "result.upToDate": "{index} は最新です（{n} 件）",
    "result.checkOk": "検証 OK（{n} 件）",
    "result.stale": "{index} が古くなっています。`{cmd}` を実行してください。",
    "result.created": "作成: {path}",
    "result.skipped": "スキップ: {path}（すでにあります）",
    "result.updated": "更新: {path}",
    "result.savedDir": 'package.json に "issues": {"dir": "{dir}"} を書きこみました',
    "result.noPackageJson": "プロジェクトの root に package.json が無いため、以後も --dir {dir} を毎回指定してください。",
    "result.noIssues": "課題はありません。",

    "index.title": "課題一覧",
    "index.notice": "**このファイルは `{cmd}` で生成します。手で編集しないでください。**\n内容を変えるときは各課題ファイルの frontmatter を直します。",
    "index.summary": "全 {total} 件 — {parts}",
    "index.breakdown": "{label} {n}（{breakdown}）",
    "index.count": "{label} {n}",

    "guide": ({ cmd, dir, active, moves, example, note }) => `## 書き方

1 課題 = 1 ファイル。ファイル名は \`NNNN-slug.md\`（slug は英小文字・数字・ハイフン）。

**\`${dir}/\` の直下に置くのは、これからやること（${active}）だけです。**
${moves ? `${moves}\n` : ""}移動は \`${cmd}\` が行うので、**手で動かさないでください。**
移動に伴う相対リンクの張りなおしも同時に行います。

\`\`\`markdown
${example}
\`\`\`

他の課題を参照するときは相対リンクで書きます。リンク先が動いても
\`${cmd}\` が張りなおすので、**書いた時点のパスで構いません。**${note ? `

> この文章は既定のものです。プロジェクト固有の約束ごとは \`${dir}/GUIDE.md\` に
> 書いてください。あればここへ差しかわります。` : ""}`,
    "guide.move": "`status: {status}` は `{dir}` へ移します。",
    "guide.title": "課題を一文で",
    "guide.commits": "対応したコミット",
    "guide.related": "関連する課題の id",
    "guide.any": "任意",
    "template": `## 何が問題か

## どう対処したか

## どう検証したか
`,
  },
};
