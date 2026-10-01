// Minimal frontmatter parser.
//
// Supported syntax (one entry per line):
//
//   key: value
//   key: [a, b]
//
// Every value stays a string; nothing is converted to numbers, booleans or dates.
// ` # ...` after a value is a comment. Quotes, multi-line values, nesting and anchors
// are not supported (quotes are kept as part of the value).
//
// A YAML parser is intentionally not used: it would read `id: 0031` as 31 and some
// commit hashes (`4505e41`) as floats.

const KEY = /^[A-Za-z0-9_-]+$/;
const COMMENT = /\s+#.*$/;

/**
 * Parse the frontmatter of a Markdown document.
 *
 * Returns `{ data, lines, start, end, eol, errors }`:
 *   - data:   { key: string | string[] }
 *   - lines:  every line of the document (without line endings)
 *   - start:  index of the opening `---` line (always 0)
 *   - end:    index of the closing `---` line
 *   - errors: problems found (array of { code, params })
 *
 * When the document has no frontmatter, `data` is null and `errors` says why.
 */
export function parseFrontmatter(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const result = { data: null, lines, start: 0, end: -1, eol, errors: [] };

  if (lines[0]?.trimEnd() !== "---") {
    result.errors.push({ code: "fm.missing" });
    return result;
  }
  const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === "---");
  if (end === -1) {
    result.errors.push({ code: "fm.unclosed" });
    return result;
  }

  const data = {};
  for (let i = 1; i < end; i++) {
    const entry = parseLine(lines[i]);
    if (entry === null) continue;
    if (entry.error) {
      result.errors.push({ code: entry.error, params: { line: lines[i] } });
      continue;
    }
    if (Object.hasOwn(data, entry.key)) {
      result.errors.push({ code: "fm.duplicate", params: { key: entry.key } });
      continue;
    }
    // defineProperty, so that a key such as __proto__ becomes an ordinary entry.
    Object.defineProperty(data, entry.key, { value: entry.value, enumerable: true, writable: true, configurable: true });
  }
  result.data = data;
  result.end = end;
  return result;
}

/**
 * A frontmatter value, or undefined. Only own entries count: `data.toString` must not
 * find Object.prototype.toString when an issue has no `toString` key.
 */
export function getValue(data, key) {
  return Object.hasOwn(data, key) ? data[key] : undefined;
}

/** Parse one frontmatter line. Returns null for blank lines. */
export function parseLine(line) {
  if (!line.trim()) return null;
  const i = line.indexOf(":");
  if (i === -1) return { error: "fm.noColon" };
  const key = line.slice(0, i).trim();
  if (!KEY.test(key)) return { error: "fm.badKey" };

  const rest = line.slice(i + 1);
  const comment = rest.match(COMMENT)?.[0] ?? "";
  const raw = rest.slice(0, rest.length - comment.length).trim();
  return { key, value: parseValue(raw), comment };
}

function parseValue(raw) {
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
  }
  return raw;
}

/** Format a value so that parseValue() reads it back unchanged. */
export function formatValue(value) {
  return Array.isArray(value) ? `[${value.join(", ")}]` : value;
}

/**
 * Whether a value survives a write/read round trip.
 * Rejects values that the parser would read differently (newlines, ` #`, `[...]` strings,
 * commas or brackets inside array items, surrounding whitespace).
 */
export function isRepresentable(value) {
  const reparsed = parseLine(`k: ${formatValue(value)}`)?.value;
  if (Array.isArray(value)) {
    return (
      Array.isArray(reparsed) &&
      reparsed.length === value.length &&
      reparsed.every((v, i) => v === value[i])
    );
  }
  return typeof reparsed === "string" && reparsed === value && !/[\r\n]/.test(value);
}

export function isValidKey(key) {
  return KEY.test(key);
}

/**
 * Return a new document with frontmatter entries changed.
 *
 * `changes` maps keys to a value, or to undefined to remove the key.
 * Existing lines keep their position and trailing comment; new keys are appended at
 * the end of the frontmatter. The body is left untouched.
 */
export function updateFrontmatter(text, changes) {
  const fm = parseFrontmatter(text);
  if (!fm.data) throw new Error("document has no frontmatter");

  const lines = [...fm.lines];
  const pending = new Map(Object.entries(changes));
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > fm.start && i < fm.end) {
      const entry = parseLine(lines[i]);
      if (entry && !entry.error && pending.has(entry.key)) {
        const value = pending.get(entry.key);
        pending.delete(entry.key);
        if (value !== undefined) out.push(`${entry.key}: ${formatValue(value)}${entry.comment}`);
        continue;
      }
    }
    if (i === fm.end) {
      for (const [key, value] of pending) {
        if (value !== undefined) out.push(`${key}: ${formatValue(value)}`);
      }
    }
    out.push(lines[i]);
  }
  return out.join(fm.eol);
}
