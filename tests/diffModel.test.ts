import assert from "node:assert/strict";
import { comparePaneEntries } from "../src/routes/diffModel";
import type { FileEntry, PaneState } from "../src/routes/types";

function entry(partial: Partial<FileEntry> & Pick<FileEntry, "name" | "path">): FileEntry {
  return {
    key: partial.key ?? partial.path,
    name: partial.name,
    path: partial.path,
    kind: partial.kind ?? "file",
    size: partial.size ?? 1,
    modifiedAt: partial.modifiedAt ?? 1,
    hidden: partial.hidden ?? false,
    readonly: partial.readonly ?? false,
    mode: partial.mode ?? null,
  };
}

function pane(entries: FileEntry[]): PaneState {
  return {
    id: "left",
    title: "pane",
    source: { kind: "local", location: "/tmp", displayName: "/tmp" },
    currentPath: "/tmp",
    entries,
    cursorKey: null,
    cursorIndex: -1,
    selectedKeys: new Set(),
    quickFilterQuery: "",
    quickFilterInputActive: false,
    showHiddenFiles: false,
    sortMode: "name",
    loading: false,
    error: null,
  };
}

const left = pane([
  entry({ name: "left.txt", path: "/left/left.txt" }),
  entry({ name: "same.txt", path: "/left/same.txt", size: 10, modifiedAt: 100 }),
  entry({ name: "size.txt", path: "/left/size.txt", size: 10, modifiedAt: 100 }),
  entry({ name: "time.txt", path: "/left/time.txt", size: 10, modifiedAt: 100 }),
]);
const right = pane([
  entry({ name: "right.txt", path: "/right/right.txt" }),
  entry({ name: "same.txt", path: "/right/same.txt", size: 10, modifiedAt: 100 }),
  entry({ name: "size.txt", path: "/right/size.txt", size: 20, modifiedAt: 100 }),
  entry({ name: "time.txt", path: "/right/time.txt", size: 10, modifiedAt: 200 }),
]);

const diff = comparePaneEntries(left, right, "left", "right");

assert.equal(diff.counts.leftOnly, 1);
assert.equal(diff.counts.rightOnly, 1);
assert.equal(diff.counts.sizeDifferent, 1);
assert.equal(diff.counts.modifiedDifferent, 1);
assert.equal(diff.counts.identical, 1);
assert.equal(diff.highlightedKeys.left.get("/left/left.txt"), "leftOnly");
assert.equal(diff.highlightedKeys.right.get("/right/right.txt"), "rightOnly");
assert.equal(diff.highlightedKeys.left.get("/left/same.txt"), undefined);
