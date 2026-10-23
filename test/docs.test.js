import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { project, run, issue } from "./helpers.js";

test("links, anchors and links that leave the root", () => {
  const root = project({
    "README.md": "# Root\n\n[guide](docs/guide.md#install) [img](docs/a.png) [dir](docs/issues/)\n",
    "docs/guide.md": "# Guide\n\n## Install\n\n[up](../README.md) [missing](nope.md) [bad](#nowhere) [far](../../x.md) [none]()\n\n`[code](gone.md)`\n",
    "docs/a.png": "x",
    "docs/issues/0001-a.md": issue({ id: "0001", title: "A", status: "open" }),
  });
  const r = run(root, "check", "docs");
  assert.equal(r.code, 1);
  assert.equal(r.stderr, [
    "Validation errors:",
    "  - docs/guide.md:5: link target does not exist → nope.md",
    "  - docs/guide.md:5: heading not found → #nowhere",
    "  - docs/guide.md:5: link leaves the project root → ../../x.md",
    "  - docs/guide.md:5: empty link target [..]()",
    "",
  ].join("\n"));
});

test("forbidden words outside the ignored files", () => {
  const root = project({
    "docs/config.json": { forbid: ["acme"], forbidIgnore: ["docs/issues/**"] },
    "docs/guide.md": "# Guide\n\nBuilt for acme.\n",
    "src/a.js": "// acme\n",
    "docs/issues/0001-a.md": issue({ id: "0001", title: "Seen at acme", status: "open" }),
  });
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  const r = run(root, "check", "docs");
  assert.equal(r.code, 1);
  assert.match(r.stderr, /docs\/guide\.md:3: forbidden word "acme"/);
  assert.match(r.stderr, /src\/a\.js:1: forbidden word "acme"/);
  assert.doesNotMatch(r.stderr, /0001-a\.md|config\.json/);
});

test("in a Git repository only tracked files are read", () => {
  const root = project({
    "docs/guide.md": "# Guide\n",
    "Notes.md": "# Local\n\n[broken](nope.md)\n",
  });
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "docs/guide.md", "package.json"], { cwd: root });
  const r = run(root, "check", "docs");
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, "docs/: documents OK (1 Markdown file)\n");
});

test("check runs every part and reports a broken link once", () => {
  const root = project({
    "docs/issues/config.json": { linkFiles: ["docs/*.md"] },
    "docs/issues/0001-a.md": issue({ id: "0001", title: "A", status: "open" }),
    "docs/guide.md": "# Guide\n\n[x](missing.md)\n",
  });
  run(root);
  const r = run(root, "check");
  assert.equal(r.code, 1);
  assert.equal(r.stderr.match(/missing\.md/g).length, 1, r.stderr);
  assert.match(r.stdout, /docs\/specs\/ does not exist/);
  assert.equal(run(root, "check", "nope").code, 2);
});
