import { test } from "node:test";
import assert from "node:assert/strict";
import { project, read, run, issue } from "./helpers.js";

const root = () =>
  project({
    "docs/issues/config.json": { lang: "ja", severity: ["高", "低"] },
    "docs/issues/0001-a.md": issue({ id: "0001", title: "ログイン", status: "open", severity: "低", related: ["0002"] }),
    "docs/issues/0002-b.md": issue({ id: "0002", title: "B", status: "doing", severity: "高" }),
    "docs/issues/done/0003-c.md": issue({ id: "0003", title: "C", status: "done", severity: "高" }),
  });

test("prints an aligned table sorted like the index", () => {
  const r = run(root(), "list");
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, [
    "#     状態    深刻度  項目",
    "0002  対応中  高      B",
    "0001  未対応  低      ログイン",
    "0003  完了    高      C",
    "",
  ].join("\n"));
});

test("filters: same key is OR, different keys are AND", () => {
  const dir = root();
  const ids = (...args) => JSON.parse(run(dir, "list", "--json", ...args).stdout).map((i) => i.id);
  assert.deepEqual(ids("--status", "open", "--status", "doing"), ["0002", "0001"]);
  assert.deepEqual(ids("--status", "open", "--status", "done", "--severity", "高"), ["0003"]);
  assert.deepEqual(ids("--related", "0002"), ["0001"]);
  const json = JSON.parse(run(dir, "list", "--json", "--status", "done").stdout);
  assert.deepEqual(json, [{ id: "0003", title: "C", status: "done", severity: "高", group: "done", path: "docs/issues/done/0003-c.md" }]);
});

test("changes nothing and rejects unknown fields", () => {
  const dir = root();
  run(dir, "list");
  assert.equal(read(dir, "docs/issues/done/0003-c.md").includes("status: done"), true);
  const r = run(dir, "list", "--stauts", "open");
  assert.equal(r.code, 2);
  assert.equal(run(dir, "--json").code, 2);
});
