import assert from "node:assert/strict";
import { entryClass, focusedEntryPath, formatDate, formatSize, paneMeta } from "../src/routes/displayModel";
import type { FileEntry, PaneState } from "../src/routes/types";

function entry(partial: Partial<FileEntry> & Pick<FileEntry, "name" | "path">): FileEntry {
  return {
    key: partial.key ?? partial.path,
    name: partial.name,
    path: partial.path,
    kind: partial.kind ?? "file",
    size: partial.size ?? null,
    modifiedAt: partial.modifiedAt ?? null,
    hidden: partial.hidden ?? false,
    readonly: partial.readonly ?? false,
    mode: partial.mode ?? null,
  };
}

function pane(partial: Partial<PaneState>): PaneState {
  return {
    id: partial.id ?? "left",
    title: partial.title ?? "left",
    source: partial.source ?? { kind: "local", location: "/tmp", displayName: "/tmp" },
    currentPath: partial.currentPath ?? "/tmp",
    entries: partial.entries ?? [],
    cursorKey: partial.cursorKey ?? null,
    cursorIndex: partial.cursorIndex ?? -1,
    selectedKeys: partial.selectedKeys ?? new Set(),
    quickFilterQuery: partial.quickFilterQuery ?? "",
    quickFilterInputActive: partial.quickFilterInputActive ?? false,
    showHiddenFiles: partial.showHiddenFiles ?? false,
    sortMode: partial.sortMode ?? "name",
    loading: partial.loading ?? false,
    error: partial.error ?? null,
  };
}

assert.equal(formatSize(entry({ name: "docs", path: "/tmp/docs", kind: "directory" })), "<DIR>");
assert.equal(formatSize(entry({ name: "empty", path: "/tmp/empty", size: null })), "");
assert.equal(formatSize(entry({ name: "tiny", path: "/tmp/tiny", size: 12 })), "12 B");
assert.equal(formatSize(entry({ name: "kb", path: "/tmp/kb", size: 2048 })), "2.0 KB");
assert.equal(formatDate(null), "");

const entries = [
  entry({ name: "alpha.txt", path: "/tmp/alpha.txt" }),
  entry({ name: "beta.txt", path: "/tmp/beta.txt", hidden: true }),
];
const selectedKeys = new Set(["/tmp/beta.txt"]);
const filteredPane = pane({
  entries,
  cursorKey: "/tmp/beta.txt",
  cursorIndex: 1,
  selectedKeys,
  quickFilterQuery: "alpha",
  showHiddenFiles: false,
  sortMode: "name",
});

assert.equal(
  paneMeta(filteredPane, entries),
  "2 shown / 1 matched / 2 items / 1 selected / 1 kept / sort:name",
);
assert.equal(focusedEntryPath(filteredPane, entries), "/tmp/beta.txt");
assert.equal(entryClass(filteredPane, entries[0]), "");
assert.equal(entryClass(filteredPane, entries[1]), "cursor selected filter-kept hidden");
