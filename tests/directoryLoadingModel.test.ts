import assert from "node:assert/strict";
import {
  failedEntriesPatch,
  isStaleLoad,
  loadedEntriesPatch,
  nextLoadGeneration,
} from "../src/routes/directoryLoadingModel";
import type { FileEntry } from "../src/routes/types";

const generations = { left: 0, right: 2 } as const;
const nextLeft = nextLoadGeneration(generations, "left");
assert.equal(nextLeft.generation, 1);
assert.deepEqual(nextLeft.generations, { left: 1, right: 2 });
assert.equal(isStaleLoad(nextLeft.generations, "left", 1), false);
assert.equal(isStaleLoad(nextLeft.generations, "left", 0), true);

const entry: FileEntry = {
  key: "/work/a.txt",
  name: "a.txt",
  path: "/work/a.txt",
  kind: "file",
  size: 12,
  modifiedAt: null,
  hidden: false,
  readonly: false,
  mode: null,
};
const directoryEntry: FileEntry = {
  key: "/work/child",
  name: "child",
  path: "/work/child",
  kind: "directory",
  size: null,
  modifiedAt: null,
  hidden: false,
  readonly: false,
  mode: null,
};
const source = { kind: "local" as const, location: "/work", displayName: "/work" };
const loaded = loadedEntriesPatch(source, "/work", [entry]);
assert.equal(loaded.source, source);
assert.equal(loaded.currentPath, "/work");
assert.deepEqual(loaded.entries, [entry]);
assert.equal(loaded.cursorKey, "/work/a.txt");
assert.equal(loaded.cursorIndex, 0);
assert.equal(loaded.loading, false);
assert.equal(loaded.error, null);
assert.deepEqual([...(loaded.selectedKeys ?? [])], []);

const emptyLoaded = loadedEntriesPatch(source, "/work", []);
assert.equal(emptyLoaded.cursorKey, null);
assert.equal(emptyLoaded.cursorIndex, -1);

const preferredLoaded = loadedEntriesPatch(
  source,
  "/work",
  [entry, directoryEntry],
  "/work/child/",
  [directoryEntry, entry],
);
assert.equal(preferredLoaded.cursorKey, "/work/child");
assert.equal(preferredLoaded.cursorIndex, 0);

const missingPreferredLoaded = loadedEntriesPatch(
  source,
  "/work",
  [entry, directoryEntry],
  "/work/missing",
  [directoryEntry, entry],
);
assert.equal(missingPreferredLoaded.cursorKey, "/work/child");
assert.equal(missingPreferredLoaded.cursorIndex, 0);

const failed = failedEntriesPatch(source, "/missing", new Error("not found"));
assert.equal(failed.source, source);
assert.equal(failed.currentPath, "/missing");
assert.deepEqual(failed.entries, []);
assert.equal(failed.cursorKey, null);
assert.equal(failed.cursorIndex, -1);
assert.equal(failed.loading, false);
assert.equal(failed.error, "Error: not found");
