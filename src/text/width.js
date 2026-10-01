// Display width of terminal text.

/** East Asian wide and fullwidth characters take two columns. */
export function width(s) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    w += (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3fffd)
      ? 2 : 1;
  }
  return w;
}

/** Pad `s` with spaces to `columns` display columns. */
export function padEnd(s, columns) {
  return s + " ".repeat(Math.max(0, columns - width(s)));
}
