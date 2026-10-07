import { test } from "node:test";
import assert from "node:assert/strict";
import { project, read, exists, run, issue, write } from "./helpers.js";
import { slugify } from "../src/commands/new.js";

const withIssues = () =>
  project({
    "issues/0001-a.md": issue({ id: "0001", title: "A", status: "open" }),
    "issues/done/0007-b.md": issue({ id: "0007", title: "B", status: "done" }),
    "issues/config.json": { severity: ["high", "low"] },
  });

test("slugify", () => {
  assert.equal(slugify("Fix the Login bug!"), "fix-the-login-bug");
  assert.equal(slugify("Café au lait"), "cafe-au-lait");
  assert.equal(slugify("ログインを直す"), "");
  assert.equal(slugify("a".repeat(30) + " " + "b".repeat(30)), "a".repeat(30));
});

test("new uses the next id across status directories and TEMPLATE.md", () => {
  const root = withIssues();
  write(root, "issues/TEMPLATE.md", "---\nid: \ntitle: \nstatus: open\nseverity: low   # high | low\nrelated: []\n---\n\n## Problem\n");
  const r = run(root, "new", "Add dark mode", "--severity", "high", "--related", "0001,0007");
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Created issues\/0008-add-dark-mode\.md/);
  assert.equal(
    read(root, "issues/0008-add-dark-mode.md"),
    "---\nid: 0008\ntitle: Add dark mode\nstatus: open\nseverity: high   # high | low\nrelated: [0001, 0007]\n---\n\n## Problem\n",
  );
  assert.match(read(root, "issues/README.md"), /\[0008\]\(0008-add-dark-mode\.md\)/);
});

test("new places the issue by status and validates before writing", () => {
  const root = withIssues();
  assert.equal(run(root, "new", "Old thing", "--status", "done").code, 0);
  assert.ok(exists(root, "issues/done/0008-old-thing.md"));

  const bad = run(root, "new", "Bad", "--severity", "medium");
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /invalid severity \(medium\)/);
  assert.ok(!exists(root, "issues/0009-bad.md"));
});

test("new needs a slug for non-ASCII titles and rejects unknown fields", () => {
  const root = withIssues();
  const r = run(root, "new", "ログインを直す");
  assert.equal(r.code, 2);
  assert.match(r.stderr, /--slug/);
  assert.equal(run(root, "new", "ログインを直す", "--slug", "fix-login").code, 0);
  assert.ok(exists(root, "issues/0008-fix-login.md"));
  assert.equal(run(root, "new", "x", "--slug", "Bad_Slug").code, 2);
  const u = run(root, "new", "x", "--stauts", "done");
  assert.equal(u.code, 2);
  assert.match(u.stderr, /unknown field --stauts/);
  assert.equal(run(root, "new", "Issue #3").code, 2);
});

test("set changes values, moves the issue and keeps the body", () => {
  const root = withIssues();
  const r = run(root, "set", "1", "status=done", "commits=abc1234,def5678", "severity=low");
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Updated issues\/0001-a\.md/);
  assert.match(r.stdout, /Moved: issues\/0001-a\.md → issues\/done\/0001-a\.md/);
  assert.equal(
    read(root, "issues/done/0001-a.md"),
    "---\nid: 0001\ntitle: A\nstatus: done\ncommits: [abc1234, def5678]\nseverity: low\n---\n\n## Body\n",
  );

  assert.equal(run(root, "set", "0001", "severity=").code, 0);
  assert.doesNotMatch(read(root, "issues/done/0001-a.md"), /severity/);
});

test("set validates before writing", () => {
  const root = withIssues();
  const before = read(root, "issues/0001-a.md");
  const r = run(root, "set", "0001", "status=closed");
  assert.equal(r.code, 1);
  assert.match(r.stderr, /invalid status \(closed\)/);
  assert.equal(read(root, "issues/0001-a.md"), before);

  assert.equal(run(root, "set", "0099", "status=done").code, 2);
  assert.equal(run(root, "set", "0001", "id=0002").code, 2);
  assert.equal(run(root, "set", "0001", "oops").code, 2);
  assert.equal(run(root, "set", "0001").code, 2);
});

test("new names the options for missing required values from config.json", () => {
  const root = project({
    "issues/config.json": {
      severity: ["high", "low"],
      required: ["severity", "area", "origin", "owner"],
      fields: { area: ["api", "ui"], origin: "^T\\d+$" },
    },
    "issues/TEMPLATE.md": "---\nid: \ntitle: \nstatus: open\nseverity: \narea: \norigin: \nowner: \n---\n",
  });
  const r = run(root, "new", "Thing", "--area", "ui");
  assert.equal(r.code, 2);
  assert.match(r.stderr, /required values are missing\. Add these options:\n  --severity <high \| low>\n  --origin <value matching \/\^T\\d\+\$\/>\n  --owner <value>\n/);
  assert.doesNotMatch(r.stderr, /--area/);
  assert.ok(!exists(root, "issues/0001-thing.md"));

  const ok = run(root, "new", "Thing", "--area", "ui", "--severity", "low", "--origin", "T1", "--owner", "me");
  assert.equal(ok.code, 0, ok.stderr);
  assert.ok(exists(root, "issues/0001-thing.md"));
});
