import type { FileOperationJob, FileOperationResult, OperationResultSnapshot, UndoSnapshot } from "../types";

export function createOperationsState() {
  let operationJob: FileOperationJob | null = $state.raw(null);
  let operationResult: FileOperationResult | null = $state.raw(null);
  let operationFailureDialog: OperationResultSnapshot | null = $state.raw(null);
  let undoStack: UndoSnapshot[] = $state.raw([]);
  let redoStack: UndoSnapshot[] = $state.raw([]);
  let activeUndoSnapshot: UndoSnapshot | null = $state.raw(null);
  let activeRedoSnapshot: UndoSnapshot | null = $state.raw(null);
  let confirmationDialogOpen = $state.raw(false);
  let operationRunning = $state.raw(false);
  let operationCancelRequested = $state.raw(false);
  let operationCancelConfirmOpen = $state.raw(false);
  let operationCancelConfirmOpenedAt = $state.raw(0);
  let operationNameInputElement: HTMLInputElement | null = $state.raw(null);

  return {
    get operationJob() { return operationJob; },
    set operationJob(value: FileOperationJob | null) { operationJob = value; },
    get operationResult() { return operationResult; },
    set operationResult(value: FileOperationResult | null) { operationResult = value; },
    get operationFailureDialog() { return operationFailureDialog; },
    set operationFailureDialog(value: OperationResultSnapshot | null) { operationFailureDialog = value; },
    get undoStack() { return undoStack; },
    set undoStack(value: UndoSnapshot[]) { undoStack = value; },
    get redoStack() { return redoStack; },
    set redoStack(value: UndoSnapshot[]) { redoStack = value; },
    get activeUndoSnapshot() { return activeUndoSnapshot; },
    set activeUndoSnapshot(value: UndoSnapshot | null) { activeUndoSnapshot = value; },
    get activeRedoSnapshot() { return activeRedoSnapshot; },
    set activeRedoSnapshot(value: UndoSnapshot | null) { activeRedoSnapshot = value; },
    get confirmationDialogOpen() { return confirmationDialogOpen; },
    set confirmationDialogOpen(value) { confirmationDialogOpen = value; },
    get operationRunning() { return operationRunning; },
    set operationRunning(value) { operationRunning = value; },
    get operationCancelRequested() { return operationCancelRequested; },
    set operationCancelRequested(value) { operationCancelRequested = value; },
    get operationCancelConfirmOpen() { return operationCancelConfirmOpen; },
    set operationCancelConfirmOpen(value) { operationCancelConfirmOpen = value; },
    get operationCancelConfirmOpenedAt() { return operationCancelConfirmOpenedAt; },
    set operationCancelConfirmOpenedAt(value) { operationCancelConfirmOpenedAt = value; },
    get operationNameInputElement() { return operationNameInputElement; },
    set operationNameInputElement(value: HTMLInputElement | null) { operationNameInputElement = value; },
  };
}
