// Pending file changes, kept in memory until everything has been validated.
//
// Commands move issues, rewrite links and create or edit issue files. If validation fails
// afterwards (a broken link, say), nothing may have been written: the user must not have
// to undo half a run by hand. So every change goes through a Workspace, reads see the
// pending state, and commit() writes it only when the run has succeeded.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export class Workspace {
  /** @param {string} root paths given to the methods are relative to it, with "/" */
  constructor(root) {
    this.root = root;
    this.contents = new Map(); // rel → text, for every file read or written
    this.gone = new Set();     // moved away
    this.dirty = new Set();    // must be written on commit
    this.moves = [];           // [{ from, to }] in order
  }

  abs(rel) {
    return join(this.root, ...rel.split("/"));
  }

  exists(rel) {
    if (this.contents.has(rel)) return true;
    if (this.gone.has(rel)) return false;
    return existsSync(this.abs(rel));
  }

  read(rel) {
    if (!this.contents.has(rel)) {
      if (this.gone.has(rel)) throw new Error(`${rel} has been moved`);
      this.contents.set(rel, readFileSync(this.abs(rel), "utf8"));
    }
    return this.contents.get(rel);
  }

  write(rel, text) {
    this.contents.set(rel, text);
    this.gone.delete(rel);
    this.dirty.add(rel);
  }

  move(from, to) {
    const text = this.read(from);
    const dirty = this.dirty.has(from);
    this.contents.delete(from);
    this.dirty.delete(from);
    this.gone.add(from);
    this.contents.set(to, text);
    this.gone.delete(to);
    if (dirty) this.dirty.add(to);
    this.moves.push({ from, to });
  }

  /** Apply everything to disk: moves (as renames) first, then writes. */
  commit() {
    for (const { from, to } of this.moves) {
      if (!existsSync(this.abs(from))) continue; // created in this run; written below
      mkdirSync(dirname(this.abs(to)), { recursive: true });
      renameSync(this.abs(from), this.abs(to));
    }
    for (const rel of this.dirty) {
      mkdirSync(dirname(this.abs(rel)), { recursive: true });
      writeFileSync(this.abs(rel), this.contents.get(rel));
    }
  }
}
