# md-issues

[English](README.md)

課題をリポジトリの中の Markdown ファイルとして管理します。`md-issues` は frontmatter を検証し、
手が離れた課題を下の階層へ移し、相対リンクを保ったまま一覧を生成します。

- 1 課題 = 1 ファイル: `issues/0001-slug.md`
- 未対応の課題だけが `issues/` の直下に残り、`done` は `issues/done/`、`wontfix` は `issues/wontfix/` へ移ります
- 移動した課題への相対リンクは自動で張りなおします
- `issues/README.md` は frontmatter から生成するので、実体とずれません
- CI や pre-commit 向けの `md-issues check`
- 実行時の依存パッケージはありません

## 導入

devDependencies に入れ、`package.json` の scripts から呼びます。`md-issues check` は生成結果を
バイト単位で比べるため、全員が同じ版を使う必要があります。

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

Node.js 18 以上が必要です。

## はじめかた

```bash
npx md-issues init --lang ja               # issues/ と config.json・GUIDE.md・TEMPLATE.md・README.md を作る
npx md-issues new "Fix the login redirect" # issues/0001-fix-the-login-redirect.md を作る
npx md-issues set 1 status=done            # frontmatter を書きかえ、issues/done/ へ移す
npx md-issues list --status open           # 未対応の課題を表示する
npm run issues                             # 検証・移動・リンクの張りなおし・一覧の生成
npm run check:issues                       # 同じ検証を、何も書きかえずに行う
```

## 課題ファイル

ファイル名は `NNNN-slug.md` です（4 桁以上の数字のあとに、英小文字・数字・ハイフン）。
課題ディレクトリの `README.md`・`GUIDE.md`・`TEMPLATE.md` は課題として扱いません。

```markdown
---
id: 0001
title: ログイン後のリダイレクトを直す
status: open          # open | doing | deferred | done | wontfix
severity: 高
commits: [4505e41]
related: [0002, 0005]
---

## 何が問題か
...
```

- `id`・`title`・`status` は常に必須です。`id` はファイル名と一致させます
- `related` には他の課題の id を並べます。実在しなければエラーです
- `commits` にはコミットのハッシュを並べます（`checkCommits` で実在を確かめられます）

### frontmatter の書式

frontmatter は **YAML ではありません**。YAML として読むと `id: 0031` が数値の 31 に、
`commits: [4505e41]` が浮動小数になるため、次の規則だけを持つ小さなパーサーで読みます。

- ファイルの先頭を `---` にし、次の `---` の行で閉じます
- 1 行 1 項目。`キー: 値` か `キー: [a, b]`（カンマ区切りの配列）だけです
- **値はすべて文字列です。** 型の変換はしません
- 値の後ろの ` # ...` はコメントです。空白の後ろの `#` はコメントの始まりになるため、
  `title: Fix #12` は `Fix` と読まれます。`new` と `set` はこうした値を受けつけません
- 引用符・複数行・ネスト・アンカーは使えません（引用符は値の一部として残ります）
- 空行は無視します。`:` の無い行はエラーです

## コマンド

| コマンド | 動作 |
| --- | --- |
| `md-issues` | 検証し、status が示す置き場所へ移し、リンクを張りなおして検証し、一覧を生成する |
| `md-issues check` | 検証だけ行う。置き場所がずれている・一覧が古いときも失敗する |
| `md-issues init` | 課題ディレクトリと `config.json`・`GUIDE.md`・`TEMPLATE.md`・`README.md` を作る。既存のファイルは上書きしない。`--lang ja` で日本語のファイルを作る |
| `md-issues new "<タイトル>"` | `TEMPLATE.md` から次の番号の課題を作る |
| `md-issues set <id> <キー>=<値> ...` | 1 件の課題の frontmatter を書きかえ、移動と一覧の生成まで行う |
| `md-issues list` | 課題を表示する。何も書きかえない |

共通のオプション:

| オプション | 意味 |
| --- | --- |
| `--dir`, `-d <パス>` | 課題ディレクトリ（root からの相対） |
| `--root <パス>` | プロジェクトの root |
| `--help`, `-h` | 使いかたを表示する |
| `--version`, `-v` | 版を表示する |

### `new`

- 番号は、すべての置き場所にある課題の最大の id + 1 です。4 桁でゼロ埋めします
- slug はタイトルの英数字から作ります。英数字を含まないタイトル（日本語だけなど）では
  `--slug <slug>` で指定します
- 中身は `TEMPLATE.md`（無ければ組み込みの雛形）を写し、`id` と `title` を埋めます
- `--<キー> <値>` で初期値を指定できます: `--status doing --severity 高 --related 0001,0002`
- 書き出す前に、既存の課題とあわせて検証します

### `set`

```bash
md-issues set 0012 status=done commits=4505e41,9f0c2aa
md-issues set 12 severity=           # 値を空にするとキーを消す
```

- `12` で `0012` を指定できます。id そのものは変えられません
- `related` と `commits` は配列です。`キー=[a, b]` と書いても配列になります
- 書きかえるのは frontmatter の該当行だけです。値の後ろのコメントと本文は残ります
- 書きかえる前に全体を検証し、失敗したら何も変えません

### `list`

```bash
md-issues list --status open --status doing --severity 高
md-issues list --related 0006        # related に 0006 を書いている課題
md-issues list --json
```

- 同じキーを複数指定したら OR、違うキーは AND で絞りこみます
- 配列の項目（`related`・`commits`）は、その値を含んでいれば一致します。そのため
  `list --related <id>` で、`related` に `<id>` を書いている課題が分かります（削除する前の確認など）
- `--json` は各課題の frontmatter に `group` と `path` を足して出力します

## 場所の決まりかた

### プロジェクトの root

1. `--root`
2. 上へたどって、`"issues"` の項目を持つ `package.json` があるディレクトリ
   （monorepo で各パッケージの `package.json` に止まらないよう、先に見ます）
3. 上へたどって、最初に見つかった `package.json` のディレクトリ
4. Git の作業ツリーの root

### 課題ディレクトリ

1. `--dir`
2. root の `package.json` の `"issues": { "dir": "..." }`
3. `issues/`

`md-issues init --dir docs/tasks` はディレクトリを `package.json` に書きこむので、
以後は `--dir` なしで使えます。課題ディレクトリは root の中に置きます。

## 設定

`<dir>/config.json` は無くても動きます。未知のキーや型の誤りはエラーです。
`md-issues init` は `"$schema"` を書くので、エディタで補完と検証が効きます
（[schema/config.schema.json](schema/config.schema.json)）。

| キー | 既定 | 意味 |
| --- | --- | --- |
| `lang` | `"en"` | `"en"` か `"ja"`。メッセージと生成する一覧の言語。環境変数では切り替えないので、どの環境でも同じ結果になります |
| `status` | 下記 | 使える status: `{ "<名前>": { "group", "dir", "label"? } }`。書くと既定を置きかえます |
| `groups` | 下記 | 一覧の節とその順番: `[{ "id", "label"?, "summary"? }]` |
| `required` | `[]` | `id`・`title`・`status` のほかに必須にするキー |
| `severity` | なし | 使える深刻度（高い順）。一覧の並び順にもなります |
| `fields` | `{}` | 語彙: `{ "<キー>": ["a", "b"] }` か `{ "<キー>": "<正規表現>" }` |
| `columns` | `id, title, severity, status` | 一覧の列: 項目名か `{ "label", "fields": [...] }`（値を空白でつなぐ） |
| `linkFiles` | `[]` | リンクを張りなおして検証するほかのファイル。`*`・`**`・`?` が使えます |
| `checkCommits` | `false` | `md-issues check` のとき、`commits` の各ハッシュを Git で確かめます |
| `openTasks` | `[]` | 未完了の項目（`- [ ]`）を残してはいけない status（`["done"]` など）。残件を残したまま閉じた課題を拾えます。コードブロックの中は数えません |
| `keys` | なし | 課題で使ってよい追加のキー。書くと、それ以外のキーをエラーにします（`relatd` のような打ち間違いを拾えます）。上の設定で使っているキーと `related`・`commits` は書かなくても使えます |

既定の status とグループ:

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

- `dir` は課題ディレクトリからの相対です。`""` は直下です。課題ディレクトリの外は指定できません
- 表示名を省くと、上の名前の翻訳（`lang: "ja"` なら 未対応・対応中・保留・完了・対応しない）、
  無ければ名前そのものになります
- `"summary": true` のグループは、件数の要約に深刻度ごとの内訳を出します
- どの status も使っていないサブディレクトリに Markdown があれば警告します

もう少し書いた例:

```json
{
  "$schema": "../node_modules/md-issues/schema/config.schema.json",
  "lang": "ja",
  "severity": ["高", "中", "低"],
  "required": ["severity", "scope"],
  "fields": {
    "scope": ["テンプレート", "このプロジェクト"],
    "origin": "^(T\\d+|新規|利用者)$"
  },
  "columns": ["id", "title", "severity", "status", "scope", { "label": "由来", "fields": ["origin", "commits"] }],
  "linkFiles": ["README.md", "AGENTS.md", "docs/**/*.md"],
  "checkCommits": true
}
```

## リンク

課題が移動すると、課題ファイル・`GUIDE.md`・`TEMPLATE.md`・`linkFiles` の中の
Markdown の相対リンクを張りなおします。

- リンクは、そのファイルの**移動前の位置**を基準に解決し、**移動後の位置**から書きなおします。
  「リンク先が動いた」場合と「自分が動いた」場合を同じ処理で扱えます
- 課題ディレクトリの中の課題ファイルへのリンクは、ファイル名で引きあてます。書き手は
  課題がもう `done/` にあるかを気にしなくてよく、**書いた時点のパスで構いません**
- 張りなおしは毎回行うので、`done/` を書きもらした手書きのリンクも直ります
- コードブロックとインラインコードの中のリンクには触れません
- `linkFiles` に書いたファイルが無い、またはパターンが 1 件も当たらなければエラーです
  （打ち間違いを見つけるため）。`node_modules/` と `.git/` は対象外です

そのあと、これらのファイルと生成する一覧を検証します。

- 空のリンク `[..]()`
- 存在しない `.md` への相対リンク
- 存在しない見出しへのアンカー（`file.md#section`・`#section`）。GitHub と同じ規則で見出しから作ります

## 生成する一覧

`<dir>/README.md` には、件数の要約、グループごとの表（深刻度、次に id の順）、
その後ろに `<dir>/GUIDE.md`（無ければ、設定した status と項目を反映した既定の説明）が入ります。
手で編集しないでください。冒頭の注記には、md-issues を呼ぶ `package.json` の
スクリプト名（`npm run issues` など）が入ります。無ければ `md-issues` です。

## 終了コード

| コード | 意味 |
| --- | --- |
| 0 | 成功 |
| 1 | 検証エラー（課題・リンク・置き場所・古い一覧・存在しないコミット） |
| 2 | 設定エラー・使いかたの誤り（`config.json`・`package.json`・引数・root が見つからない） |

## CI とフックで使う

GitHub Actions:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm ci
- run: npm run check:issues
```

Git の pre-commit フック（`.git/hooks/pre-commit`）:

```sh
#!/bin/sh
exec npx --no-install md-issues check
```

husky なら同じコマンドを `.husky/pre-commit` に書きます。lint-staged では、ファイルごとでなく
1 回だけ走るよう関数で書きます。

```js
// lint-staged.config.js
export default {
  "issues/**/*.md": () => "md-issues check",
};
```

## ライセンス

[MIT](LICENSE)
