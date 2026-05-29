import assert from "node:assert/strict";
import {
  defaultAppOpenAction,
  focusedEntry,
  focusedOpenAction,
  viewerOpenAction,
} from "../src/routes/fileOpenModel";
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
    id: "left",
    title: "left",
    source: partial.source ?? { kind: "local", location: "/work", displayName: "/work" },
    currentPath: partial.currentPath ?? "/work",
    entries: partial.entries ?? [],
    cursorKey: partial.cursorKey ?? null,
    cursorIndex: partial.cursorIndex ?? 0,
    selectedKeys: partial.selectedKeys ?? new Set(),
    quickFilterQuery: partial.quickFilterQuery ?? "",
    quickFilterInputActive: partial.quickFilterInputActive ?? false,
    showHiddenFiles: partial.showHiddenFiles ?? false,
    sortMode: partial.sortMode ?? "name",
    loading: false,
    error: null,
  };
}

const localPane = pane({});
const archivePane = pane({
  source: { kind: "archive", location: "/work/a.zip::/", displayName: "a.zip", archivePath: "/work/a.zip", innerPath: "" },
});
const sftpPane = pane({
  source: {
    kind: "sftp",
    location: "sftp://conn-1/srv",
    displayName: "remote",
    connectionId: "conn-1",
    remotePath: "/srv",
    returnPath: "/work",
  },
});

const file = entry({ name: "readme.md", path: "/work/readme.md" });
const dir = entry({ name: "docs", path: "/work/docs", kind: "directory" });
const archiveDir = entry({ name: "docs", path: "/work/a.zip::/docs", kind: "directory" });
const sftpDir = entry({ name: "docs", path: "sftp://conn-1/srv/docs", kind: "directory" });

assert.equal(focusedEntry(pane({ cursorIndex: -1 }), [file]), null);
assert.equal(focusedEntry(pane({ cursorIndex: 10 }), [file]), null);
assert.equal(focusedEntry(pane({ cursorIndex: 0 }), [file]), file);

assert.deepEqual(focusedOpenAction(localPane, dir, () => false), { type: "openLocalDirectory", path: "/work/docs" });
assert.deepEqual(focusedOpenAction(archivePane, archiveDir, () => false), {
  type: "openArchiveDirectory",
  archivePath: "/work/a.zip",
  innerPath: "docs",
});
assert.deepEqual(focusedOpenAction(sftpPane, sftpDir, () => false), {
  type: "openSftpDirectory",
  connectionId: "conn-1",
  remotePath: "/srv/docs",
  returnPath: "/work",
});
assert.deepEqual(focusedOpenAction(localPane, entry({ name: "a.zip", path: "/work/a.zip" }), () => true), {
  type: "openArchiveFile",
  path: "/work/a.zip",
});
assert.deepEqual(focusedOpenAction(localPane, file, () => false), { type: "openViewer", entry: file });

assert.deepEqual(defaultAppOpenAction(localPane, file), { type: "openDefaultApp", entry: file });
assert.equal(defaultAppOpenAction(archivePane, file).type, "unsupported");
assert.equal(defaultAppOpenAction(sftpPane, file).type, "unsupported");

assert.equal(viewerOpenAction(sftpPane, file, "md", new Set(["png"]), new Set(["md"])).type, "unsupported");
assert.deepEqual(viewerOpenAction(localPane, file, "png", new Set(["png"]), new Set(["md"])), {
  type: "openImageViewer",
  entry: file,
});
assert.deepEqual(viewerOpenAction(localPane, file, "bin", new Set(["png"]), new Set(["md"])), {
  type: "openDefaultApp",
  entry: file,
});
assert.deepEqual(viewerOpenAction(localPane, file, "md", new Set(["png"]), new Set(["md"])), {
  type: "openTextViewer",
  entry: file,
});
