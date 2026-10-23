# md-issues

[English](README.md)

課題・仕様・そのほかの文書を、リポジトリの中の Markdown ファイルとして管理します。
`md-issues` は課題の frontmatter を検証し、手が離れた課題を下の階層へ移し、相対リンクを
保ったまま一覧を生成します。仕様と文書も検査します。

- 1 課題 = 1 ファイル: `docs/issues/0001-slug.md`
- 未対応の課題だけが `docs/issues/` の直下に残り、`done` は `docs/issues/done/`、`wontfix` は `docs/issues/wontfix/` へ移ります
- 移動した課題への相対リンクは自動で張りなおします
- `docs/issues/README.md` は frontmatter から生成するので、実体とずれません
- `docs/specs/` の仕様: 要件の ID・受け入れ条件・ID への参照を検査します
- `docs/` の文書: リンク・見出しへのアンカー・禁止する語を検査します
- CI や pre-commit 向けの `md-issues check`
- 実行時の依存パッケージはありません

```text
docs/
  config.json        文書の検査の設定（無くてよい）
  issues/            課題（config.json・GUIDE.md・TEMPLATE.md。README.md は生成物）
  specs/             仕様（config.json は無くてよい）
  plans/ など        そのほかの文書。文書として検査する
```

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
npx md-issues init --lang ja               # docs/issues/ と config.json・GUIDE.md・TEMPLATE.md・README.md を作る
npx md-issues new "Fix the login redirect" # docs/issues/0001-fix-the-login-redirect.md を作る
npx md-issues set 1 status=done            # frontmatter を書きかえ、docs/issues/done/ へ移す
npx md-issues list --status open           # 未対応の課題を表示する
npm run issues                             # 検証・移動・リンクの張りなおし・一覧の生成
npm run check:issues                       # 課題・仕様・文書を、何も書きかえずに検査する
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
**課題・仕様のほか、md-issues が読む文書はすべて同じ規則で読みます。**

- ファイルの先頭を `---` にし、次の `---` の行で閉じます
- 1 行 1 項目。`キー: 値` か `キー: [a, b]`（カンマ区切りの配列）だけです
- **値はすべて文字列です。** 型の変換はしません
- 値の後ろの ` # ...` はコメントです。空白の後ろの `#` はコメントの始まりになるため、
  `title: Fix #12` は `Fix` と読まれます。`new` と `set` はこうした値を受けつけません
- 値が `#` で始まるときは、コメントではなく値として読みます。`title: #k7-10s の余白` は
  `#k7-10s の余白` です。そのため、値を空にしてコメントだけを書くことはできません
  （`キー:  # 説明` は `# 説明` という値になります）
- 引用符・複数行・ネスト・アンカーは使えません（引用符は値の一部として残ります）
- 空行は無視します。`:` の無い行はエラーです

## コマンド

| コマンド | 動作 |
| --- | --- |
| `md-issues` | 検証し、status が示す置き場所へ移し、リンクを張りなおして検証し、一覧を生成する |
| `md-issues check` | 課題・仕様・文書を検査する。何も書きかえない。置き場所がずれている・一覧が古いときも失敗する |
| `md-issues check issues` / `specs` / `docs` | 3 つの検査のうち 1 つだけを行う |
| `md-issues init` | 課題ディレクトリと `config.json`・`GUIDE.md`・`TEMPLATE.md`・`README.md` を作る。既存のファイルは上書きしない。`--lang ja` で日本語のファイルを作る |
| `md-issues new "<タイトル>"` | `TEMPLATE.md` から次の番号の課題を作る |
| `md-issues set <id> <キー>=<値> ...` | 1 件の課題の frontmatter を書きかえ、移動と一覧の生成まで行う |
| `md-issues list` | 課題を表示する。何も書きかえない |
| `md-issues refs <id>` | 課題を参照しているもの（`related` とリンク）を表示する。何も書きかえない |

共通のオプション:

| オプション | 意味 |
| --- | --- |
| `--dir`, `-d <パス>` | 課題ディレクトリ（root からの相対。課題のコマンドだけ） |
| `--root <パス>` | プロジェクトの root |
| `--help`, `-h` | 使いかたを表示する |
| `--version`, `-v` | 版を表示する |

### `new`

- 番号は、すべての置き場所にある課題の最大の id + 1 です。4 桁でゼロ埋めします
- slug はタイトルの英数字から作ります。英数字を含まないタイトル（日本語だけなど）では
  `--slug <slug>` で指定します
- 中身は `TEMPLATE.md`（無ければ組み込みの雛形）を写し、`id` と `title` を埋めます
- `--<キー> <値>` で初期値を指定できます: `--status doing --severity 高 --related 0001,0002`
- 必須のキーに値が無いときは何も書き出さず、付けるべきオプションを `config.json` の
  使える値とあわせて示します（終了コード 2）
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

### `refs`

```bash
md-issues refs 0006
# related  docs/issues/0009-x.md
# リンク   docs/notes.md:12
md-issues refs 6 --json
```

- `related` にその id を書いている課題と、課題ファイル・`GUIDE.md`・`TEMPLATE.md`・`linkFiles` の中の
  その課題への相対リンク（行番号つき）を一覧します。コードの中のリンクは数えません
- 課題を消す前に使います。参照元を直してから、`git rm` でファイルを消してください

## 場所の決まりかた

### プロジェクトの root

1. `--root`
2. 上へたどって、`"issues"` の項目を持つ `package.json` があるディレクトリ
   （monorepo で各パッケージの `package.json` に止まらないよう、先に見ます）
3. 上へたどって、最初に見つかった `package.json` のディレクトリ
4. Git の作業ツリーの root

### ディレクトリ

| ディレクトリ | 既定 | root の `package.json` での指定 |
| --- | --- | --- |
| 課題 | `docs/issues/` | `"issues": { "dir": "..." }`（または `--dir`） |
| 仕様 | `docs/specs/` | `"issues": { "specsDir": "..." }` |
| 文書 | `docs/` | `"issues": { "docsDir": "..." }` |

`md-issues init --dir tasks` は課題ディレクトリを `package.json` に書きこむので、
以後は `--dir` なしで使えます。ディレクトリは root の中に置きます。仕様や文書の
ディレクトリが無いのはエラーではなく、その検査はすることがありません。

**0.2 からの移行:** 課題ディレクトリの既定は `issues/` でした。そのまま使うなら
`package.json` に `"issues": { "dir": "issues" }` を足し、そうでなければ `docs/issues/` へ移します。

## 設定

ディレクトリごとに `config.json` を置けます。課題は `docs/issues/config.json`、仕様は
`docs/specs/config.json`、文書は `docs/config.json` です。ここでは課題の設定を書きます。
ほかは[仕様](#仕様)と[文書](#文書)にあります。

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
- 課題のファイルは、課題ディレクトリの下のどこにあっても読みます。設定から外れたディレクトリに
  残った課題も、一覧から黙って消えることはなく、正しい置き場所へ移されます（status が設定に無ければ
  エラーになります）。そうしたディレクトリにある課題でない Markdown は警告します

もう少し書いた例:

```json
{
  "$schema": "../../node_modules/md-issues/schema/config.schema.json",
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

## 仕様

仕様は、仕様のディレクトリの Markdown ファイル 1 つです（そこの `README.md` は仕様では
ありません）。frontmatter に要件の ID の接頭辞を書きます。

```markdown
---
prefix: NEWS              # 大文字英数字 2〜12 文字（先頭は英字）
retired: [NEWS-004]       # 使わなくなった ID（任意）。使いまわさないために残す
---

## 要件

### NEWS-001 トップに最新のお知らせを出す
- トップを表示したとき、システムは最新の投稿を 3 件並べなければならない
- **受け入れ条件**: 新しい順に 3 件、それぞれ日付つき
- **検証**: 投稿を 4 件足してからトップを開く
```

`md-issues check specs` は次を見ます。

- 接頭辞の形が正しく、ほかのファイルと重複しない
- 要件の節の下の見出し（`### <接頭辞>-<3 桁> <見出し>`）が重複せず、retired の ID を使いまわさない
- どの要件にも、要件の文（箇条書き）・受け入れ条件・検証がそろい、どれも空でない
- **参照:** 文書のディレクトリと root の Markdown（`README.md`・`AGENTS.md` など）に書いた、
  既知の接頭辞の ID が、定義済みか retired の要件である。コードブロックと `###` の見出しは見ない

`docs/specs/config.json`（無くてよい）:

| キー | 既定（`en` / `ja`） | 意味 |
| --- | --- | --- |
| `lang` | 課題の `lang`、無ければ `"en"` | メッセージと、下のラベルの既定 |
| `requirements` | `"Requirements"` / `"要件"` | 要件の節の見出し |
| `acceptance` | `"Acceptance"` / `"受け入れ条件"` | 受け入れ条件のラベル（`- **<ラベル>**: ...`） |
| `verification` | `"Verification"` / `"検証"` | 検証のラベル（`- **<ラベル>**: ...`） |

## 文書

`md-issues check docs` は、文書のディレクトリにある Markdown（課題と仕様を含む）と、root の
Markdown を検査します。Git のリポジトリでは、追跡しているファイルだけを読みます（Git が
無視する手元のメモには触れません）。

- **リンク:** 存在しないファイルへの相対リンク、空のリンク、存在しない見出しへのアンカー
  （`file.md#section`・`#section`）。アンカーは GitHub と同じ規則で作ります。コードの中は見ない
- **root の外へのリンク**はエラーです。書いた人の手元でしか開けないため
- **禁止する語**（下の `forbid`）が、`forbidIgnore` を除く Git の追跡ファイルに無いこと。
  共有するリポジトリに、特定のプロジェクトの名前を持ちこまないために使います

`docs/config.json`（無くてよい）:

| キー | 既定 | 意味 |
| --- | --- | --- |
| `lang` | 課題の `lang`、無ければ `"en"` | メッセージ |
| `forbid` | `[]` | 追跡ファイルに書いてはいけない語 |
| `forbidIgnore` | 課題のディレクトリ | 禁止する語を許すファイル（`*`・`**`・`?`）。課題は由来を記録する場所なので、名前が入って構わない。`docs/config.json` 自身は常に除く |

## 生成する一覧

`<dir>/README.md` には、件数の要約、グループごとの表（深刻度、次に id の順）、
その後ろに `<dir>/GUIDE.md`（無ければ、設定した status と項目を反映した既定の説明）が入ります。
手で編集しないでください。冒頭の注記には、md-issues を呼ぶ `package.json` の
スクリプト名（`npm run issues` など）が入ります。無ければ `md-issues` です。

## 終了コード

| コード | 意味 |
| --- | --- |
| 0 | 成功 |
| 1 | 検証エラー（課題・仕様・リンク・禁止する語・置き場所・古い一覧・存在しないコミット） |
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
  "docs/**/*.md": () => "md-issues check",
};
```

## ライセンス

[MIT](LICENSE)
