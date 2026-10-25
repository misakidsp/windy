import assert from "node:assert/strict";
import { createUndoSnapshot, undoSafetyMessages, redoSafetyMessages, localizedUndoSnapshot, historyOperationLabelId } from "../src/routes/undoModel";
import type { FileEntry, FileOperationJob, PaneState } from "../src/routes/types";

function baseJob(partial: Partial<FileOperationJob>): FileOperationJob {
  return {
    id: "job-1",
    kind: "rename",
    commandId: "file.rename",
    label: "Rename focused entry",
    status: "preview",
    risk: "warning",
    sourcePaneId: "left",
    destinationPaneId: null,
    sourcePath: "/work",
    destinationPath: "/work",
    targets: [{ key: "/work/old.txt", name: "old.txt", path: "/work/old.txt", kind: "file", size: 10, modifiedAt: 100, mode: null }],
    plannedActions: [],
    confirmationMessage: "",
    requestedName: "new.txt",
    executable: true,
    createdAt: "2026-05-25T00:00:00.000Z",
    ...partial,
  };
}

function entry(partial: Partial<FileEntry>): FileEntry {
  return {
    key: partial.path ?? partial.name ?? "entry",
    name: "entry",
    path: "/work/entry",
    kind: "file",
    size: null,
    modifiedAt: null,
    hidden: false,
    readonly: false,
    mode: null,
    ...partial,
  };
}

function pane(entries: FileEntry[], partial: Partial<PaneState> = {}): PaneState {
  return {
    id: "left",
    title: "left",
    source: { kind: "local", location: "/work", displayName: "Local" },
    currentPath: "/work",
    entries,
    cursorKey: null,
    cursorIndex: 0,
    selectedKeys: new Set(),
    quickFilterQuery: "",
    quickFilterInputActive: false,
    showHiddenFiles: false,
    sortMode: "name",
    loading: false,
    error: null,
    ...partial,
  };
}

const renameUndo = createUndoSnapshot(baseJob({}));
assert(renameUndo);
assert.equal(renameUndo.job.kind, "rename");
assert.equal(renameUndo.job.commandId, "undo.rename");
assert.equal(renameUndo.job.targets[0].path, "/work/new.txt");
assert.equal(renameUndo.job.requestedName, "old.txt");
assert.equal(renameUndo.redoJob.commandId, "redo.rename");
assert.equal(renameUndo.redoJob.requestedName, "new.txt");
assert.deepEqual(renameUndo.job.targets[0].expectedState, { kind: "file", size: 10, modifiedAt: 100 });
assert.deepEqual(renameUndo.redoJob.targets[0].expectedState, renameUndo.job.targets[0].expectedState);
assert.notEqual(createUndoSnapshot(baseJob({}))?.job.id, createUndoSnapshot(baseJob({}))?.job.id);
assert.equal(historyOperationLabelId(renameUndo.job), "undo.label.rename");
assert.equal(historyOperationLabelId(renameUndo.redoJob), "undo.label.redoRename");
const localized = localizedUndoSnapshot(renameUndo, id => `translated:${id}`);
assert.equal(localized.job.id, renameUndo.job.id);
assert.equal(localized.redoJob.id, renameUndo.redoJob.id);
assert.equal(localized.job.label, "translated:undo.label.rename");
assert.equal(localized.redoJob.label, "translated:undo.label.redoRename");
assert.ok(redoSafetyMessages(renameUndo, pane([entry({ path: "/work/old.txt", kind: "directory" })])).some(message => message.includes("entry type")));

const mkdirUndo = createUndoSnapshot(
  baseJob({
    kind: "mkdir",
    commandId: "file.mkdir",
    label: "Create directory",
    risk: "safe",
    targets: [],
    requestedName: "created",
  }),
);
assert(mkdirUndo);
assert.equal(mkdirUndo.job.kind, "removeEmptyDirectory");
assert.equal(mkdirUndo.job.targets[0].path, "/work/created");
assert.equal(mkdirUndo.redoJob.kind, "mkdir");
assert.equal(mkdirUndo.redoJob.commandId, "redo.createDirectory");

const createFileUndo = createUndoSnapshot(
  baseJob({
    kind: "createFile",
    commandId: "file.createFile",
    label: "Create file",
    risk: "safe",
    targets: [],
    requestedName: "empty.txt",
  }),
);
assert(createFileUndo);
assert.equal(createFileUndo.job.kind, "removeEmptyFile");
assert.equal(createFileUndo.job.targets[0].path, "/work/empty.txt");
assert.equal(createFileUndo.redoJob.kind, "createFile");
assert.equal(createFileUndo.redoJob.commandId, "redo.createFile");

assert.equal(createUndoSnapshot(baseJob({ commandId: "undo.rename" })), null);
assert.equal(createUndoSnapshot(baseJob({ kind: "delete", commandId: "file.deletePermanently" })), null);

assert.deepEqual(
  undoSafetyMessages(
    renameUndo,
    pane([entry({ name: "new.txt", path: "/work/new.txt", size: 10, modifiedAt: 100 })]),
  ),
  [],
);

assert.deepEqual(
  undoSafetyMessages(
    renameUndo,
    pane([entry({ name: "new.txt", path: "/work/new.txt", size: 20, modifiedAt: 100 })]),
  ),
  ["new.txt size changed after the original operation."],
);

assert.deepEqual(
  undoSafetyMessages(
    renameUndo,
    pane([
      entry({ name: "new.txt", path: "/work/new.txt", size: 10, modifiedAt: 100 }),
      entry({ name: "old.txt", path: "/work/old.txt", size: 3, modifiedAt: 90 }),
    ]),
  ),
  ["old.txt already exists; the recorded rename may conflict."],
);

assert.deepEqual(
  undoSafetyMessages(createFileUndo, pane([entry({ name: "empty.txt", path: "/work/empty.txt", size: 1 })])),
  ["/work/empty.txt is no longer empty; Undo will not remove it."],
);

assert.deepEqual(
  undoSafetyMessages(mkdirUndo, pane([entry({ name: "created", path: "/work/created", kind: "file" })])),
  ["/work/created is no longer a directory."],
);

const translatedRedo = localizedUndoSnapshot(renameUndo, (id) => `translated:${id}`);
assert.equal(translatedRedo.redoJob.confirmationMessage, "translated:operation.confirm.rename");
assert.deepEqual(translatedRedo.redoJob.plannedActions, ["translated:operation.planned.rename"]);

assert.equal(createUndoSnapshot(baseJob({ sourcePath: "sftp://server/work" })), null, "unprotected SFTP operations must not create local Undo snapshots");
