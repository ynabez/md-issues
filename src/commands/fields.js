// Turning command line values into frontmatter values (shared by new and set).

import { isRepresentable, isValidKey } from "../frontmatter.js";
import { UsageError } from "../errors.js";

/** Keys whose values are always lists. */
export const LIST_KEYS = new Set(["related", "commits"]);

/**
 * Convert a command line value.
 *   "[a, b]"          → ["a", "b"]
 *   "a,b" (list key)  → ["a", "b"]
 *   ""                → undefined (remove the key), or [] for list keys
 */
export function toValue(key, raw, { list = false } = {}) {
  if (!isValidKey(key)) throw new UsageError("usage.badKey", { key });
  const bracketed = raw.startsWith("[") && raw.endsWith("]");
  let value;
  if (bracketed || list || LIST_KEYS.has(key)) {
    const inner = bracketed ? raw.slice(1, -1) : raw;
    value = inner.split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    value = raw.trim() === "" ? undefined : raw.trim();
  }
  if (value !== undefined && !isRepresentable(value)) {
    throw new UsageError("usage.notRepresentable", { key, value: raw });
  }
  return value;
}
