import { test } from "node:test";
import assert from "node:assert/strict";
import { project, run, write } from "./helpers.js";

const spec = (body, fm = "prefix: NEWS") => `---\n${fm}\n---\n\n${body}`;
const good = spec(`## Requirements

### NEWS-001 Show the latest news
- When the front page is shown, the system must list three posts.
- **Acceptance**: three posts, newest first.
- **Verification**: open the front page.
`, "prefix: NEWS\nretired: [NEWS-004]");

test("a valid specification passes and references are checked", () => {
  const root = project({
    "docs/specs/news.md": good,
    "docs/specs/README.md": "# Specs\n\nNEWS-999 here is not checked as a definition.\n",
    "docs/notes.md": "# Notes\n\nSee NEWS-001 and the retired NEWS-004.\n",
    "README.md": "# Site\n\n```\nNEWS-777 in code is skipped\n```\n",
  });
  const r = run(root, "check", "specs");
  assert.equal(r.stderr, "Validation errors:\n  - docs/specs/README.md:3: no requirement NEWS-999\n");
  assert.equal(r.code, 1);

  write(root, "docs/specs/README.md", "# Specs\n");
  const ok = run(root, "check", "specs");
  assert.equal(ok.code, 0, ok.stderr);
  assert.equal(ok.stdout, "docs/specs/: specifications OK (1 file, 1 requirement)\n");
});

test("problems in a specification", () => {
  const root = project({
    "docs/specs/a.md": spec(`## Requirements

### NEWS-001
- **Acceptance**:
### NEWS-1 bad id
### NEWS-004 reused
- x
- **Acceptance**: a
- **Verification**: v
`, "prefix: NEWS\nretired: [NEWS-004, OLD-1]"),
    "docs/specs/b.md": spec("## Something else\n", "prefix: NEWS"),
    "docs/specs/c.md": spec("## Requirements\n", "prefix: lower"),
    "docs/specs/d.md": "no frontmatter\n",
  });
  const r = run(root, "check", "specs");
  assert.equal(r.code, 1);
  for (const re of [
    /a\.md: retired OLD-1 is not NEWS-<3 digits>/,
    /a\.md:8: NEWS-001 has no title/,
    /a\.md:8: NEWS-001 has no requirement sentence/,
    /a\.md:8: NEWS-001: Acceptance is empty/,
    /a\.md:8: NEWS-001 has no "- \*\*Verification\*\*: "/,
    /a\.md:10: requirement headings are "### NEWS-<3 digits> <title>" \(NEWS-1\)/,
    /a\.md:11: NEWS-004 is retired/,
    /b\.md: prefix NEWS is also used by docs\/specs\/a\.md/,
    /c\.md: prefix "lower" must be/,
    /d\.md: no frontmatter with a prefix/,
  ]) assert.match(r.stderr, re);
});

test("Japanese labels follow lang, and config.json can rename them", () => {
  const ja = spec(`## 要件

### NEWS-001 お知らせ
- 最新を出さなければならない
- **受け入れ条件**: 3 件
- **検証**: 開く
`);
  const root = project({ "docs/issues/config.json": { lang: "ja" }, "docs/specs/news.md": ja });
  const r = run(root, "check", "specs");
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, "docs/specs/ の仕様の検査 OK（1 ファイル・要件 1 件）\n");

  const custom = project({
    "docs/specs/config.json": { requirements: "Must", acceptance: "Done when", verification: "How" },
    "docs/specs/news.md": spec("## Must\n\n### NEWS-001 T\n- x\n- **Done when**: a\n- **How**: b\n"),
  });
  assert.equal(run(custom, "check", "specs").code, 0);
  assert.equal(run(project({ "docs/specs/config.json": { section: "x" } }), "check", "specs").code, 2);
});

test("frontmatter is read with the same rules as issues", () => {
  // `#` without whitespace is part of the value; ` #` starts a comment.
  const root = project({ "docs/specs/news.md": good.replace("prefix: NEWS\n", "prefix: NEWS   # news\n") });
  assert.equal(run(root, "check", "specs").code, 0);
  const bad = project({ "docs/specs/news.md": good.replace("prefix: NEWS\n", "prefix: NEWS#x\n") });
  assert.match(run(bad, "check", "specs").stderr, /prefix "NEWS#x" must be/);
});

test("a missing directory has nothing to check; specsDir moves it", () => {
  const root = project();
  const r = run(root, "check", "specs");
  assert.equal(r.code, 0);
  assert.match(r.stdout, /docs\/specs\/ does not exist/);
  const moved = project({ "package.json": { issues: { specsDir: "specs" } }, "specs/news.md": good });
  assert.match(run(moved, "check", "specs").stdout, /^specs\/: specifications OK/);
});
