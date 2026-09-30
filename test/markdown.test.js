import { test } from "node:test";
import assert from "node:assert/strict";
import { findLinks, rewriteLinks, slugify, anchors, hasAnchor } from "../src/markdown.js";
import { globToRegExp } from "../src/glob.js";

test("finds relative links and skips URLs and code", () => {
  const text = [
    "[a](a.md) [b](../b.md#sec) [c](https://x.test/c.md) [d](/abs.md) [e](#local)",
    "`[f](f.md)` [g](g.md \"title\")",
    "```",
    "[h](h.md)",
    "```",
    "[i]()",
  ].join("\n");
  const links = findLinks(text).map((l) => (l.empty ? "EMPTY" : l.target + l.anchor));
  assert.deepEqual(links, ["a.md", "../b.md#sec", "#local", "g.md", "EMPTY"]);
});

test("rewrites targets and keeps anchors", () => {
  const out = rewriteLinks("see [x](0001-a.md#why) and `[y](0001-a.md)`", (l) => (l.target === "0001-a.md" ? "done/0001-a.md" : null));
  assert.equal(out, "see [x](done/0001-a.md#why) and `[y](0001-a.md)`");
});

test("slugs follow GitHub", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  assert.equal(slugify("`npm run check:init` で確認する"), "npm-run-checkinit-で確認する");
  assert.equal(slugify("**強調** と [リンク](x.md)"), "強調-と-リンク");
  assert.equal(slugify("snake_case  two"), "snake_case--two");
});

test("collects anchors with duplicates, setext headings and html", () => {
  const text = "---\ntitle: x\n---\n# A\n## A\nSetext\n------\n<a id=\"custom\"></a>\n```\n# not\n```\n";
  assert.deepEqual([...anchors(text)].sort(), ["a", "a-1", "custom", "setext"]);
  assert.equal(hasAnchor(text, "#A"), true);
  assert.equal(hasAnchor(text, "#not"), false);
  assert.equal(hasAnchor("## 書きかた\n", "#%E6%9B%B8%E3%81%8D%E3%81%8B%E3%81%9F"), true);
});

test("globs", () => {
  assert.equal(globToRegExp("docs/**/*.md").test("docs/a.md"), true);
  assert.equal(globToRegExp("docs/**/*.md").test("docs/x/y/a.md"), true);
  assert.equal(globToRegExp("docs/*.md").test("docs/x/a.md"), false);
  assert.equal(globToRegExp("?.md").test("a.md"), true);
});

test("inline code in headings is part of the anchor", () => {
  assert.equal(hasAnchor("## `.env` の値と URL\n", "#env-の値と-url"), true);
});
