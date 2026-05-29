import assert from "node:assert/strict";
import {
  createFilePropertySnapshot,
  formatPropertyBoolean,
  formatPropertyMode,
  propertyEntriesForPane,
} from "../src/routes/propertyModel";
import type { FileEntry, PaneState } from "../src/routes/types";

function entry(partial: Partial<FileEntry> & Pick<FileEntry, "name" | "path">): FileEntry {
  return {
    key: partial.key ?? partial.path,
    name: partial.name,
    path: partial.path,
    kind: partial.kind ?? "file",
    size: partial.size === undefined ? 10 : partial.size,
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
    source: partial.source ?? {
      kind: "local",
      location: "/src",
      displayName: "/src",
    },
    currentPath: partial.currentPath ?? "/src",
    entries: partial.entries ?? [],
    cursorKey: partial.cursorKey ?? null,
    cursorIndex: partial.cursorIndex ?? 0,
    selectedKeys: partial.selectedKeys ?? new Set(),
    quickFilterQuery: partial.quickFilterQuery ?? "",
    quickFilterInputActive: partial.quickFilterInputActive ?? false,
    showHiddenFiles: partial.showHiddenFiles ?? false,
    sortMode: partial.sortMode ?? "name",
    loading: partial.loading ?? false,
    error: partial.error ?? null,
  };
}

const entries = [
  entry({ name: "a.txt", path: "/src/a.txt", size: 12, mode: 0o100644 }),
  entry({ name: "dir", path: "/src/dir", kind: "directory", size: null, readonly: true }),
  entry({ name: "b.bin", path: "/src/b.bin", size: 20, hidden: true }),
];

const focusedPane = pane({ entries, cursorIndex: 0 });
assert.deepEqual(propertyEntriesForPane(focusedPane, entries), [entries[0]]);

const selectedPane = pane({
  entries,
  cursorIndex: 0,
  selectedKeys: new Set([entries[1].key, entries[2].key]),
});
assert.deepEqual(propertyEntriesForPane(selectedPane, [entries[0]]), [entries[1], entries[2]]);

const singleSnapshot = createFilePropertySnapshot(focusedPane, entries, "Local:/src");
assert(singleSnapshot);
assert.equal(singleSnapshot.totalCount, 1);
assert.equal(singleSnapshot.knownSizeBytes, 12);
assert.equal(singleSnapshot.unknownSizeCount, 0);
assert.equal(singleSnapshot.items[0].mode, 0o100644);

const multiSnapshot = createFilePropertySnapshot(selectedPane, entries, "Local:/src");
assert(multiSnapshot);
assert.equal(multiSnapshot.totalCount, 2);
assert.equal(multiSnapshot.knownSizeBytes, 20);
assert.equal(multiSnapshot.unknownSizeCount, 1);
assert.equal(multiSnapshot.kindCounts.directory, 1);
assert.equal(multiSnapshot.kindCounts.file, 1);

assert.equal(formatPropertyMode(0o100755), "755");
assert.equal(formatPropertyMode(null), "-");
assert.equal(formatPropertyBoolean(true), "yes");
assert.equal(formatPropertyBoolean(false), "no");
