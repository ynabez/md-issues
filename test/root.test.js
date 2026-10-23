import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { findRoot, resolveDir, resolveDocsDir, resolveSpecsDir, saveDirToPackageJson } from "../src/root.js";
import { project, read } from "./helpers.js";

test("prefers a package.json with an issues entry over the nearest one", () => {
  const root = project({
    "package.json": { name: "mono", issues: { dir: "tasks" } },
    "packages/a/package.json": { name: "a" },
  });
  assert.equal(findRoot({ cwd: join(root, "packages/a") }), root);
});

test("falls back to the nearest package.json", () => {
  const root = project({ "package.json": { name: "x" }, "src/deep/.keep": "" });
  assert.equal(findRoot({ cwd: join(root, "src/deep") }), root);
});

test("--root wins", () => {
  const root = project({ "sub/.keep": "" });
  assert.equal(findRoot({ cwd: "/", root: join(root, "sub") }), join(root, "sub"));
});

test("issue directory: option, package.json, default", () => {
  const root = project({ "package.json": { issues: { dir: "docs/tasks/" } } });
  assert.equal(resolveDir(root, undefined), "docs/tasks");
  assert.equal(resolveDir(root, "other"), "other");
  const plain = project({ "package.json": {} });
  assert.equal(resolveDir(plain, undefined), "docs/issues");
  assert.equal(resolveSpecsDir(plain), "docs/specs");
  assert.equal(resolveDocsDir(plain), "docs");
  const custom = project({ "package.json": { issues: { dir: "issues", specsDir: "specs", docsDir: "notes" } } });
  assert.equal(resolveDir(custom, undefined), "issues");
  assert.equal(resolveSpecsDir(custom), "specs");
  assert.equal(resolveDocsDir(custom), "notes");
  const typo = project({ "package.json": { issues: { specdir: "x" } } });
  assert.throws(() => resolveDir(typo, undefined), { code: "pkg.issuesKey" });
  assert.throws(() => resolveDir(plain, ".."), { code: "dir.outside" });
  assert.throws(() => resolveDir(plain, "."), { code: "dir.isRoot" });
});

test("saves the directory to package.json keeping indentation", () => {
  const root = project({ "package.json": '{\n    "name": "x"\n}\n' });
  assert.equal(saveDirToPackageJson(root, "tasks"), true);
  assert.equal(read(root, "package.json"), '{\n    "name": "x",\n    "issues": {\n        "dir": "tasks"\n    }\n}\n');
});
