import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONFIG_KEYS } from "../src/config.js";

const schema = JSON.parse(readFileSync(new URL("../schema/config.schema.json", import.meta.url), "utf8"));

test("the schema lists exactly the keys config.js accepts", () => {
  assert.deepEqual(Object.keys(schema.properties).sort(), [...CONFIG_KEYS].sort());
});
