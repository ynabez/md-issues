// Markdown helpers: relative links and heading anchors.
//
// Code (fenced blocks and inline code spans) is ignored, so examples in documentation are
// neither rewritten nor checked.

const LINK = /\]\((?<target>[^()\s#]*)(?<anchor>#[^()\s]*)?(?:\s+"[^"]*")?\)/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/)/i;

/** Replace code with spaces, keeping every offset (and line break) in place. */
export function maskCode(text, { inline = true } = {}) {
  const lines = text.split("\n");
  let fence = null;
  const out = lines.map((line) => {
    const open = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length && !line.slice(open[0].length).trim()) fence = null;
      return blank(line);
    }
    if (open) {
      fence = open[1];
      return blank(line);
    }
    return inline ? line.replace(/(`+)(?!`).*?(?<!`)\1(?!`)/g, blank) : line;
  });
  return out.join("\n");
}

function blank(s) {
  return s.replace(/[^\r]/g, " ");
}

/**
 * Relative links in `text`.
 * Each link: { target, anchor, start, end } where [start, end) covers target + anchor.
 * Links with an empty target and no anchor are reported with `empty: true`.
 */
export function findLinks(text) {
  const masked = maskCode(text);
  const links = [];
  for (const m of masked.matchAll(LINK)) {
    const { target, anchor = "" } = m.groups;
    const start = m.index + 2;
    const end = start + target.length + anchor.length;
    if (!target && !anchor) {
      links.push({ empty: true, target: "", anchor: "", start, end });
      continue;
    }
    if (EXTERNAL.test(target)) continue;
    links.push({ target, anchor, start, end });
  }
  return links;
}

/** Replace link targets. `replace(link)` returns the new target (without anchor) or null. */
export function rewriteLinks(text, replace) {
  let out = "";
  let pos = 0;
  for (const link of findLinks(text)) {
    if (link.empty) continue;
    const next = replace(link);
    if (next === null || next === link.target) continue;
    out += text.slice(pos, link.start) + next + link.anchor;
    pos = link.end;
  }
  return pos === 0 ? text : out + text.slice(pos);
}

/** GitHub-style anchor for a heading text. */
export function slugify(heading) {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/** Every anchor a document defines: headings (GitHub rules) and <a id/name>. */
export function anchors(text) {
  // Inline code stays: its text is part of the heading's anchor.
  const lines = maskCode(stripFrontmatter(text), { inline: false }).split("\n");
  const found = new Set();
  const counts = new Map();
  const add = (heading) => {
    const base = slugify(heading);
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    found.add(n ? `${base}-${n}` : base);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const atx = line.match(/^ {0,3}#{1,6}(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/);
    if (atx) {
      add(atx[1] ?? "");
      continue;
    }
    const prev = lines[i - 1];
    if (/^ {0,3}(?:=+|-+)[ \t]*$/.test(line) && prev?.trim() && !/^\s*(?:[-*+>|#]|\d+[.)])/.test(prev)) {
      add(prev.trim());
    }
  }
  for (const m of text.matchAll(/<a\s[^>]*\b(?:id|name)=["']([^"']+)["']/gi)) found.add(m[1]);
  return found;
}

/** Whether `anchor` ("#..." or "") is defined in `text`. */
export function hasAnchor(text, anchor) {
  if (!anchor || anchor === "#") return true;
  let id = anchor.slice(1);
  try { id = decodeURIComponent(id); } catch { /* keep as is */ }
  const set = anchors(text);
  return set.has(id) || set.has(id.toLowerCase());
}

function stripFrontmatter(text) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  return m ? "\n".repeat(m[0].split("\n").length - 1) + text.slice(m[0].length) : text;
}
