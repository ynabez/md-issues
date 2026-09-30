import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig } from "../src/config.js";

const code = (fn) => {
  try { fn(); } catch (e) { return e.code; }
  return null;
};

test("defaults", () => {
  const c = normalizeConfig({});
  assert.equal(c.lang, "en");
  assert.deepEqual(Object.keys(c.status), ["open", "doing", "deferred", "done", "wontfix"]);
  assert.equal(c.status.done.dir, "done/");
  assert.equal(c.status.open.label, "Open");
  assert.deepEqual(c.required, ["id", "title", "status"]);
  assert.deepEqual(c.columns.map((col) => col.fields[0]), ["id", "title", "status"]);
});

test("Japanese labels and severity column", () => {
  const c = normalizeConfig({ lang: "ja", severity: ["高", "低"], required: ["severity"] });
  assert.equal(c.status.wontfix.label, "対応しない");
  assert.equal(c.groups[0].label, "未対応");
  assert.deepEqual(c.required, ["id", "title", "status", "severity"]);
  assert.deepEqual(c.columns.map((col) => col.label), ["#", "項目", "深刻度", "状態"]);
});

test("custom statuses, groups and columns", () => {
  const c = normalizeConfig({
    status: { todo: { group: "a", dir: "" }, closed: { group: "b", dir: "archive" } },
    groups: [{ id: "a", label: "Todo" }, { id: "b" }],
    columns: ["id", { label: "Where", fields: ["origin", "commits"] }],
  });
  assert.equal(c.status.closed.dir, "archive/");
  assert.equal(c.status.todo.label, "todo");
  assert.deepEqual(c.columns[1], { label: "Where", fields: ["origin", "commits"] });
});

test("rejects invalid configuration", () => {
  assert.equal(code(() => normalizeConfig({ scope: ["a"] })), "config.unknownKey");
  assert.equal(code(() => normalizeConfig({ lang: "fr" })), "config.type");
  assert.equal(code(() => normalizeConfig({ status: { x: { group: "nope" } } })), "config.unknownGroup");
  assert.equal(code(() => normalizeConfig({ status: { x: { group: "active", dir: "../out" } } })), "config.statusDir");
  assert.equal(code(() => normalizeConfig({ status: { x: { group: "active", dir: "/abs" } } })), "config.statusDir");
  assert.equal(code(() => normalizeConfig({ fields: { scope: "(" } })), "config.badRegex");
  assert.equal(code(() => normalizeConfig({ fields: { status: ["a"] } })), "config.reservedField");
  assert.equal(code(() => normalizeConfig({ groups: [{ id: "a" }, { id: "a" }], status: { x: { group: "a" } } })), "config.duplicateGroup");
});
