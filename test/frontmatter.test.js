import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, updateFrontmatter, isRepresentable } from "../src/frontmatter.js";

test("parses strings and arrays without type conversion", () => {
  const fm = parseFrontmatter("---\nid: 0031\ncommits: [4505e41, abc]\nrelated: []\n---\nbody\n");
  assert.deepEqual(fm.data, { id: "0031", commits: ["4505e41", "abc"], related: [] });
  assert.equal(fm.errors.length, 0);
});

test("strips trailing comments", () => {
  const fm = parseFrontmatter("---\nstatus: open   # open | done\nrelated: [0007]  # ids\n---\n");
  assert.deepEqual(fm.data, { status: "open", related: ["0007"] });
});

test("keeps # without leading whitespace", () => {
  const fm = parseFrontmatter("---\ntitle: C# and #1\n---\n");
  assert.equal(fm.data.title, "C# and");
  const fm2 = parseFrontmatter("---\ntitle: fix#1\n---\n");
  assert.equal(fm2.data.title, "fix#1");
});

test("keeps colons in values", () => {
  const fm = parseFrontmatter("---\ntitle: a: b\n---\n");
  assert.equal(fm.data.title, "a: b");
});

test("reports missing, unclosed and malformed frontmatter", () => {
  assert.equal(parseFrontmatter("# no\n").errors[0].code, "fm.missing");
  assert.equal(parseFrontmatter("---\nid: 1\n").errors[0].code, "fm.unclosed");
  assert.equal(parseFrontmatter("---\nnot a pair\n---\n").errors[0].code, "fm.noColon");
  assert.equal(parseFrontmatter("---\nid: 1\nid: 2\n---\n").errors[0].code, "fm.duplicate");
});

test("handles CRLF", () => {
  const text = "---\r\nid: 0001\r\n---\r\nbody\r\n";
  assert.equal(parseFrontmatter(text).data.id, "0001");
  assert.equal(updateFrontmatter(text, { status: "done" }), "---\r\nid: 0001\r\nstatus: done\r\n---\r\nbody\r\n");
});

test("updates in place, keeps comments, appends and removes keys", () => {
  const text = "---\nid: 0001\nstatus: open  # note\nseverity: low\n---\n\n## Body\n";
  const out = updateFrontmatter(text, { status: "done", severity: undefined, related: ["0002", "0003"] });
  assert.equal(out, "---\nid: 0001\nstatus: done  # note\nrelated: [0002, 0003]\n---\n\n## Body\n");
});

test("detects values that do not round-trip", () => {
  assert.equal(isRepresentable("plain title"), true);
  assert.equal(isRepresentable("issue #12"), false);
  assert.equal(isRepresentable("[x]"), false);
  assert.equal(isRepresentable("line\nbreak"), false);
  assert.equal(isRepresentable(" padded"), false);
  assert.equal(isRepresentable(["a", "b"]), true);
  assert.equal(isRepresentable(["a,b"]), false);
});

test("a value starting with # is a value, and may still have a comment", () => {
  const fm = parseFrontmatter("---\ntitle: #k7-10s gap\nanchor: #top   # the page top\nhint:   # only\n---\n");
  assert.deepEqual(fm.data, { title: "#k7-10s gap", anchor: "#top", hint: "# only" });
  assert.equal(isRepresentable("#k7-10s gap"), true);
  assert.equal(isRepresentable("#a #b"), false);
  assert.equal(
    updateFrontmatter("---\nanchor: #top   # the page top\n---\n", { anchor: "#bottom" }),
    "---\nanchor: #bottom   # the page top\n---\n",
  );
});
