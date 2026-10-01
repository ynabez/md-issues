import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { project, read, exists, run, write, issue } from "./helpers.js";

test("creates the starter files", () => {
  const root = project();
  const r = run(root, "init");
  assert.equal(r.code, 0, r.stderr);
  for (const f of ["config.json", "GUIDE.md", "TEMPLATE.md", "README.md"]) assert.ok(exists(root, `issues/${f}`), f);
  assert.deepEqual(JSON.parse(read(root, "issues/config.json")), { $schema: "../node_modules/md-issues/schema/config.schema.json", lang: "en" });
  assert.doesNotMatch(read(root, "issues/GUIDE.md"), /replaces this section/);
  assert.equal(JSON.parse(read(root, "package.json")).issues, undefined);
  assert.equal(run(root, "check").code, 0);
});

test("--dir is saved to package.json and used afterwards", () => {
  const root = project({ "package.json": '{\n  "name": "x"\n}\n', "src/.keep": "" });
  const r = run(root, "init", "-d", "docs/tasks", "--lang", "ja");
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /package\.json に "issues": \{"dir": "docs\/tasks"\} を書きこみました/);
  assert.deepEqual(JSON.parse(read(root, "package.json")).issues, { dir: "docs/tasks" });
  assert.match(read(root, "docs/tasks/README.md"), /# 課題一覧/);

  write(root, "docs/tasks/0001-a.md", issue({ id: "0001", title: "A", status: "done" }));
  const again = run(join(root, "src"));
  assert.equal(again.code, 0, again.stderr);
  assert.ok(exists(root, "docs/tasks/done/0001-a.md"));
});

test("keeps existing files", () => {
  const root = project({ "issues/GUIDE.md": "mine\n", "issues/README.md": "old\n" });
  const r = run(root, "init");
  assert.match(r.stdout, /Skipped issues\/GUIDE\.md/);
  assert.match(r.stdout, /Skipped issues\/README\.md/);
  assert.equal(read(root, "issues/GUIDE.md"), "mine\n");
  assert.equal(read(root, "issues/README.md"), "old\n");
});

test("without package.json the directory cannot be saved", () => {
  const root = project({ "package.json": null });
  const r = run(root, "init", "--dir", "tasks", "--root", ".");
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /pass --dir tasks every time/);
});

test("option errors", () => {
  const root = project();
  assert.equal(run(root, "init", "check").code, 2);
  assert.equal(run(root, "--lang", "ja").code, 2);
  assert.equal(run(root, "check", "--lang", "ja").code, 2);
  assert.equal(run(root, "init", "--lang", "fr").code, 2);
});
