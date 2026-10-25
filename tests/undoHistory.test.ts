import assert from "node:assert/strict";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { createWorkspaceState } from "../src/routes/workspace/workspaceState.svelte";
import { createOperationsController } from "../src/routes/workspace/operationsController";
import type { FileEntry, FileOperationResult } from "../src/routes/types";

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
const state = createWorkspaceState();
state.settings.appSettings.operationResult.saveFailureLog = false;
const entry = (name: string, size = 10): FileEntry => ({ key: `/work/${name}`, path: `/work/${name}`, name, kind: "file", size, modifiedAt: 100, mode: null, readonly: false, hidden: false });
const show = (name: string, size = 10) => {
  state.panes.panes.left = { ...state.panes.panes.left, currentPath: "/work", source: { kind: "local", location: "/work", displayName: "Local" }, entries: [entry(name, size)], cursorIndex: 0, cursorKey: `/work/${name}` };
};
state.panes.panes.right = { ...state.panes.panes.right, currentPath: "/dest", source: { kind: "local", location: "/dest", displayName: "Local" }, entries: [] };
const actions = createOperationsController(state, {
  focusActivePaneAfterDialog() {},
  localizedBackendError: String,
  queueCursorScroll() {},
  async reloadPanesAfterOperation() {},
  updatePane(id, patch) { state.panes.panes[id] = { ...state.panes.panes[id], ...patch }; },
  visibleEntries: pane => pane.entries,
  visibleLoadedEntries: (_id, entries) => entries,
});
const success: FileOperationResult = { succeeded: [{ path: "/work/old.txt", message: "done" }], failed: [] };
let result = success;
let invocationFailure = false;
mockIPC(command => {
  assert.equal(command, "execute_file_operation_job");
  if (invocationFailure) throw new Error("unavailable");
  return result;
});

try {
  show("old.txt");
  actions.previewOperation("rename");
  actions.updateOperationName("new.txt");
  await actions.confirmOperationExecution();
  const snapshot = state.operations.undoStack[0];
  assert.ok(snapshot);
  show("new.txt");
  actions.previewUndoOperation();
  actions.updateOperationName("unexpected.txt");
  assert.equal(state.operations.operationJob?.requestedName, "old.txt", "recorded undo destination is immutable");
  actions.closeOperationPreview();
  assert.equal(state.operations.activeUndoSnapshot, null);
  assert.equal(state.operations.undoStack.length, 1, "closing preview preserves history");

  actions.previewUndoOperation();
  result = { succeeded: [], failed: [{ path: "/work/new.txt", message: "changed" }] };
  await actions.confirmOperationExecution();
  assert.equal(state.operations.undoStack.length, 1, "failed Undo preserves history");
  assert.equal(state.operations.redoStack.length, 0);
  assert.equal(state.activity.records.at(-1)?.label.id, "undo.label.rename");
  assert.equal(state.activity.records.at(-1)?.status, "failed");
  actions.previewUndoOperation();
  result = success;
  await actions.confirmOperationExecution();
  assert.equal(state.operations.undoStack.length, 0);
  assert.equal(state.operations.redoStack.length, 1);
  show("old.txt", 99);
  actions.previewRedoOperation();
  assert.ok(actions.operationSafetyMessages(state.operations.operationJob!).some(message => message.includes("size changed")));
  actions.updateOperationName("unexpected.txt");
  assert.equal(state.operations.operationJob?.requestedName, "new.txt", "recorded redo destination is immutable");
  result = { succeeded: [], failed: [], canceled: true };
  await actions.confirmOperationExecution();
  assert.equal(state.operations.redoStack.length, 1, "canceled Redo preserves history");
  show("old.txt");
  actions.previewRedoOperation();
  result = success;
  await actions.confirmOperationExecution();
  assert.equal(state.operations.redoStack.length, 0);
  assert.equal(state.operations.undoStack.length, 1);
  assert.equal(state.activity.records.at(-1)?.label.id, "undo.label.redoRename");

  for (const [outcome, keepRedo] of [
    [success, false],
    [{ ...success, failed: [{ path: "/work/other", message: "failed" }] }, false],
    [{ ...success, canceled: true }, false],
    [{ succeeded: [], failed: [{ path: "/work/old.txt", message: "failed" }] }, true],
    [{ succeeded: [], failed: [], canceled: true }, true],
  ] as [FileOperationResult, boolean][]) {
    state.operations.redoStack = [snapshot];
    actions.previewOperation("copy");
    result = outcome;
    await actions.confirmOperationExecution();
    assert.equal(state.operations.redoStack.length, keepRedo ? 1 : 0, "Redo tracks whether any normal operation changed files");
  }
  state.operations.redoStack = [snapshot];
  actions.previewOperation("refresh");
  result = success;
  await actions.confirmOperationExecution();
  assert.equal(state.operations.redoStack.length, 1, "refresh is not a file mutation");
  actions.previewOperation("copy");
  invocationFailure = true;
  await actions.confirmOperationExecution();
  assert.equal(state.operations.redoStack.length, 1, "invocation failure preserves history");
} finally {
  clearMocks();
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
}
