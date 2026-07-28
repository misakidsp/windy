import assert from "node:assert/strict";
import {
  createFileOperationJob,
  archiveOperationEntries,
  executionConfirmationMessage,
  failedOperationEntries,
  focusedOperationEntries,
  operationBlockingMessages,
  operationConflictMessages,
  operationCommandIds,
  operationSupportedForPaneSources,
  selectedOperationEntries,
} from "../src/routes/operationJobModel";
import { defaultKeybindSettings } from "../src/routes/keyboardModel";
import type { FileEntry, PaneState } from "../src/routes/types";

function entry(partial: Partial<FileEntry> & Pick<FileEntry, "name" | "path">): FileEntry {
  return {
    key: partial.key ?? partial.path,
    name: partial.name,
    path: partial.path,
    kind: partial.kind ?? "file",
    size: partial.size ?? 10,
    modifiedAt: partial.modifiedAt ?? null,
    hidden: partial.hidden ?? false,
    readonly: partial.readonly ?? false,
    mode: partial.mode ?? null,
  };
}

function pane(partial: Partial<PaneState> & Pick<PaneState, "id" | "currentPath">): PaneState {
  return {
    id: partial.id,
    title: partial.title ?? partial.id,
    source: partial.source ?? {
      kind: "local",
      location: partial.currentPath,
      displayName: partial.currentPath,
    },
    currentPath: partial.currentPath,
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

const left = pane({
  id: "left",
  currentPath: "/src",
  entries: [
    entry({ name: "a.txt", path: "/src/a.txt" }),
    entry({ name: "dir", path: "/src/dir", kind: "directory" }),
  ],
});
const right = pane({
  id: "right",
  currentPath: "/dest",
  entries: [entry({ name: "a.txt", path: "/dest/a.txt" })],
});

const copyJob = createFileOperationJob({
  kind: "copy",
  sourcePaneId: "left",
  sourcePane: left,
  destinationPaneId: "right",
  destinationPane: right,
  targetEntries: [left.entries[0]],
  now: new Date("2026-05-23T00:00:00.000Z"),
  id: "job-test",
});

assert.equal(copyJob.id, "job-test");
assert.equal(copyJob.commandId, "file.copy");
assert.equal(copyJob.risk, "safe");
assert.equal(copyJob.sourcePath, "/src");
assert.equal(copyJob.destinationPath, "/dest");
assert.equal(copyJob.targets.length, 1);
assert.equal(copyJob.confirmationMessage, "Copy 1 item(s) to /dest?");
assert.equal(copyJob.executable, true);
assert.deepEqual(failedOperationEntries(copyJob, { succeeded: [], failed: [{ path: "/src/a.txt", message: "denied" }] }), [
  {
    key: "/src/a.txt",
    name: "a.txt",
    path: "/src/a.txt",
    kind: "file",
    size: 10,
    modifiedAt: null,
    hidden: false,
    readonly: false,
    mode: null,
  },
]);
assert.deepEqual(operationConflictMessages(copyJob, right.entries), ["a.txt already exists in /dest."]);
assert.match(executionConfirmationMessage(copyJob, right.entries), /1 conflict\(s\) will be skipped/);

for (const kind of [
  "copy",
  "move",
  "rename",
  "chmod",
  "windowsAttributes",
  "trash",
  "delete",
  "mkdir",
  "createFile",
  "refresh",
  "extractArchive",
  "createArchive",
] as const) {
  assert.ok(
    defaultKeybindSettings.bindings[operationCommandIds[kind]],
    `${kind} operation command id must exist in keybinding defaults`,
  );
}

const renameJob = createFileOperationJob({
  kind: "rename",
  sourcePaneId: "left",
  sourcePane: left,
  destinationPaneId: null,
  destinationPane: null,
  targetEntries: [left.entries[0]],
  now: new Date("2026-05-23T00:00:00.000Z"),
  id: "rename-test",
});
assert.equal(renameJob.requestedName, "a.txt");
assert.deepEqual(operationConflictMessages(renameJob, left.entries), ["a.txt is the current name."]);

const chmodJob = createFileOperationJob({
  kind: "chmod",
  sourcePaneId: "left",
  sourcePane: left,
  destinationPaneId: null,
  destinationPane: null,
  targetEntries: [entry({ name: "script.sh", path: "/src/script.sh", mode: 0o100755 })],
});
assert.equal(chmodJob.requestedName, "755");

const windowsAttributeJob = createFileOperationJob({
  kind: "chmod",
  sourcePaneId: "left",
  sourcePane: left,
  destinationPaneId: null,
  destinationPane: null,
  targetEntries: [entry({ name: "win.txt", path: "/src/win.txt", hidden: true, readonly: false })],
  windowsAttributesMode: true,
});
assert.equal(windowsAttributeJob.kind, "windowsAttributes");
assert.equal(windowsAttributeJob.commandId, "file.chmod");
assert.equal(windowsAttributeJob.requestedName, "readonly=off hidden=on");

const multiWindowsAttributeJob = createFileOperationJob({
  kind: "chmod",
  sourcePaneId: "left",
  sourcePane: left,
  destinationPaneId: null,
  destinationPane: null,
  targetEntries: [
    entry({ name: "a.txt", path: "/src/a.txt", hidden: true, readonly: true }),
    entry({ name: "b.txt", path: "/src/b.txt", hidden: false, readonly: true }),
  ],
  windowsAttributesMode: true,
});
assert.equal(multiWindowsAttributeJob.requestedName, "readonly=on hidden=off");

const createFileJob = createFileOperationJob({
  kind: "createFile",
  sourcePaneId: "left",
  sourcePane: left,
  destinationPaneId: null,
  destinationPane: null,
  targetEntries: [],
  now: new Date("2026-05-23T00:00:00.000Z"),
  id: "create-file-test",
});
assert.equal(createFileJob.commandId, "file.createFile");
assert.equal(createFileJob.requestedName, "");
assert.equal(createFileJob.executable, true);
assert.equal(createFileJob.confirmationMessage, "Create a new empty file under /src?");
assert.equal(createFileJob.destinationPath, "/src");
assert.deepEqual(operationConflictMessages({ ...createFileJob, requestedName: "a.txt" }, left.entries), [
  "a.txt already exists in /src.",
]);

const createArchiveJob = createFileOperationJob({
  kind: "createArchive",
  sourcePaneId: "left",
  sourcePane: left,
  destinationPaneId: "right",
  destinationPane: right,
  targetEntries: [left.entries[0], left.entries[1]],
  now: new Date("2026-05-23T00:00:00.000Z"),
  id: "create-archive-test",
});
assert.equal(createArchiveJob.commandId, "archive.create");
assert.equal(createArchiveJob.requestedName, "");
assert.equal(createArchiveJob.executable, true);
assert.equal(createArchiveJob.destinationPath, "/dest");
assert.deepEqual(operationBlockingMessages({ ...createArchiveJob, requestedName: "bundle.rar" }, right.entries), [
  "Archive name must end with .zip, .tar, .tar.gz, or .tgz.",
]);
assert.deepEqual(operationConflictMessages({ ...createArchiveJob, requestedName: "a.txt" }, right.entries), [
  "a.txt already exists in /dest.",
]);

const targetPane = pane({
  id: "left",
  currentPath: "/src",
  entries: [
    entry({ name: "a.txt", path: "/src/a.txt" }),
    entry({ name: "b.zip", path: "/src/b.zip" }),
    entry({ name: "c.tar", path: "/src/c.tar" }),
  ],
  selectedKeys: new Set(["/src/c.tar"]),
  cursorIndex: 1,
});
assert.deepEqual(selectedOperationEntries(targetPane, targetPane.entries), [targetPane.entries[2]]);
assert.deepEqual(focusedOperationEntries(targetPane, targetPane.entries), [targetPane.entries[1]]);
assert.deepEqual(
  selectedOperationEntries({ ...targetPane, selectedKeys: new Set(), cursorIndex: 0 }, targetPane.entries),
  [targetPane.entries[0]],
);
assert.deepEqual(archiveOperationEntries(targetPane, targetPane.entries, (name) => name.endsWith(".zip")), [
  targetPane.entries[1],
]);
assert.deepEqual(archiveOperationEntries(targetPane, targetPane.entries, (name) => name.endsWith(".tar")), [
  targetPane.entries[2],
]);
assert.deepEqual(
  archiveOperationEntries({ ...targetPane, source: { kind: "archive", location: "a.zip::/", displayName: "a.zip::/", archivePath: "/src/a.zip", innerPath: "" } }, targetPane.entries, () => true),
  [],
);

const moveIntoSelf = createFileOperationJob({
  kind: "move",
  sourcePaneId: "left",
  sourcePane: left,
  destinationPaneId: "right",
  destinationPane: pane({ id: "right", currentPath: "/src/dir/child" }),
  targetEntries: [left.entries[1]],
});
assert.deepEqual(operationBlockingMessages(moveIntoSelf, []), [
  "Cannot move /src/dir into itself or one of its descendants: /src/dir/child.",
]);

const archivePane = pane({
  id: "left",
  currentPath: "archive.zip::/",
  source: {
    kind: "archive",
    location: "archive.zip::/",
    displayName: "archive.zip::/",
    archivePath: "/src/archive.zip",
    innerPath: "",
  },
});
assert.equal(operationSupportedForPaneSources("move", left, right), true);
assert.equal(operationSupportedForPaneSources("copy", archivePane, right), true);
assert.equal(operationSupportedForPaneSources("mkdir", archivePane, null), false);

const sftpPane = pane({
  id: "left",
  currentPath: "sftp:conn:/home",
  source: {
    kind: "sftp",
    location: "sftp://conn/home",
    displayName: "host:/home",
    connectionId: "conn",
    remotePath: "/home",
    returnPath: "/local",
  },
});
assert.equal(operationSupportedForPaneSources("delete", sftpPane, null), true);
assert.equal(operationSupportedForPaneSources("trash", sftpPane, null), false);
assert.equal(operationSupportedForPaneSources("createFile", sftpPane, null), true);
assert.equal(operationSupportedForPaneSources("copy", left, sftpPane), true);
assert.equal(operationSupportedForPaneSources("move", left, sftpPane), false);

const searchPane = pane({
  id: "left",
  currentPath: "search:/src",
  source: {
    kind: "search",
    location: "search:/src",
    displayName: "search:/src",
    rootPath: "/src",
    returnPath: "/src",
    nameRegex: "",
    recursive: true,
    minSizeBytes: null,
    maxSizeBytes: null,
    modifiedAfter: null,
    modifiedBefore: null,
    searchKind: "all",
    hiddenMode: "exclude",
    readonlyMode: "any",
    truncated: false,
  },
});
assert.equal(operationSupportedForPaneSources("mkdir", searchPane, null), false);
assert.equal(operationSupportedForPaneSources("createFile", searchPane, null), false);
assert.equal(operationSupportedForPaneSources("copy", searchPane, right), true);
assert.equal(operationSupportedForPaneSources("move", searchPane, right), false);
assert.equal(operationSupportedForPaneSources("createArchive", left, right), true);
assert.equal(operationSupportedForPaneSources("createArchive", searchPane, right), true);
assert.equal(operationSupportedForPaneSources("createArchive", sftpPane, right), false);
