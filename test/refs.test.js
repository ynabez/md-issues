import { test } from "node:test";
import assert from "node:assert/strict";
import { project, run, issue, write } from "./helpers.js";

const root = () =>
  project({
    "issues/config.json": { linkFiles: ["docs/*.md"] },
    "issues/0001-a.md": issue({ id: "0001", title: "A", status: "open", related: ["0006"] }, "\nSee [6](done/0006-f.md).\n"),
    "issues/0002-b.md": issue({ id: "0002", title: "B", status: "open" }, "\n`[6](0006-f.md)` is code.\n\n[stale path](0006-f.md#why)\n"),
    "issues/done/0006-f.md": issue({ id: "0006", title: "F", status: "done" }, "\n## Why\n\n[self](0006-f.md)\n"),
    "docs/notes.md": "# Notes\n\nTracked in [0006](../issues/done/0006-f.md).\n",
  });

test("lists related entries and links, skipping code and the issue itself", () => {
  const r = run(root(), "refs", "6");
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, [
    "related  issues/0001-a.md",
    "link     docs/notes.md:3",
    "link     issues/0001-a.md:8",
    "link     issues/0002-b.md:9",
    "",
  ].join("\n"));
});

test("--json and no references", () => {
  const dir = root();
  assert.deepEqual(JSON.parse(run(dir, "refs", "0002", "--json").stdout), []);
  assert.match(run(dir, "refs", "0002").stdout, /Nothing refers to 0002\./);
  assert.equal(JSON.parse(run(dir, "refs", "0006", "--json").stdout).length, 4);
});

test("errors", () => {
  const dir = root();
  assert.equal(run(dir, "refs").code, 2);
  assert.equal(run(dir, "refs", "0099").code, 2);
  assert.equal(run(dir, "refs", "1", "2").code, 2);
});

test("columns are aligned by display width in Japanese", () => {
  const dir = root();
  write(dir, "issues/config.json", { lang: "ja", linkFiles: ["docs/*.md"] });
  assert.equal(run(dir, "refs", "6").stdout.split("\n").slice(0, 2).join("\n"), [
    "related  issues/0001-a.md",
    "リンク   docs/notes.md:3",
  ].join("\n"));
});
