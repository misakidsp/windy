import { invoke } from "@tauri-apps/api/core";
import { tick } from "svelte";
import { archiveExtensions } from "../constants";
import { saveOperationFailureLog as saveOperationFailureLogEffect } from "../appSideEffects";
import { loadedEntriesPatch } from "../directoryLoadingModel";
import {
  type ConfirmationDialogKeyAction,
  type OperationFailureDialogKeyAction,
} from "../dialogKeyboardModel";
import { createOperationResultSource, otherPaneId } from "../paneModel";
import { invokeErrorMessage } from "../tauriInvoke";
import {
  createFileOperationJob as createFileOperationJobModel,
  executionConfirmationMessage as operationExecutionConfirmationMessage,
  operationBlockingMessages as operationBlockingMessagesForEntries,
  operationConflictMessages as operationConflictMessagesForEntries,
  failedOperationEntries,
  operationNameRequired,
  operationSupportedForPaneSources,
  archiveOperationEntries,
  focusedOperationEntries,
  selectedOperationEntries,
} from "../operationJobModel";
import {
  operationResultItemMessage,
} from "../operationResultModel";
import { cancelFileOperationJob, executeFileOperationJob } from "../operationSideEffects";
import { createUndoSnapshot, undoSafetyMessages } from "../undoModel";
import { fileExtension } from "../pathUtils";
import type {
  FileEntry,
  FileOperationJob,
  FileOperationKind,
  FileOperationResult,
  PaneId,
  PaneState,
  UndoSnapshot,
} from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

type Dependencies = Pick<WorkspaceActions,
  | "focusActivePaneAfterDialog"
  | "localizedBackendError"
  | "queueCursorScroll"
  | "reloadPanesAfterOperation"
  | "updatePane"
  | "visibleEntries"
  | "visibleLoadedEntries"
>;

export function createOperationsController(state: Pick<WorkspaceState, "activity" | "app" | "operations" | "panes" | "settings" | "terminal">, actions: Dependencies) {
  function selectedOperationTargets(pane: PaneState): FileEntry[] {
    return selectedOperationEntries(pane, actions.visibleEntries(pane));
  }

  function isSupportedArchiveName(name: string): boolean {
    const lowerName = name.toLocaleLowerCase();
    return lowerName.endsWith(".tar.gz") || archiveExtensions.has(fileExtension(lowerName));
  }

  function useWindowsAttributesOperation(sourcePane: PaneState): boolean {
    return sourcePane.source.kind !== "sftp" && navigator.userAgent.toLocaleLowerCase().includes("windows");
  }

  function createFileOperationJob(kind: FileOperationKind): FileOperationJob {
    const sourcePaneId = state.panes.activePaneId;
    const sourcePane = state.panes.panes[sourcePaneId];
    const destinationPaneId =
      kind === "createArchive"
        ? archiveCreationDestinationPaneId(sourcePaneId)
        : kind === "copy" || kind === "move" || kind === "extractArchive"
          ? otherPaneId(sourcePaneId)
          : null;
    const destinationPane = destinationPaneId ? state.panes.panes[destinationPaneId] : null;
    const targetEntries =
      kind === "mkdir" || kind === "createFile" || kind === "refresh"
        ? []
        : kind === "rename"
          ? focusedOperationEntries(sourcePane, actions.visibleEntries(sourcePane))
          : kind === "extractArchive"
            ? archiveOperationEntries(sourcePane, actions.visibleEntries(sourcePane), isSupportedArchiveName)
            : [...selectedOperationTargets(sourcePane)];

    return createFileOperationJobModel({
      kind,
      sourcePaneId,
      sourcePane,
      destinationPaneId,
      destinationPane,
      targetEntries,
      windowsAttributesMode: kind === "chmod" && useWindowsAttributesOperation(sourcePane),
      t: state.settings.t,
    });
  }

  function previewOperation(kind: FileOperationKind): void {
    const sourcePane = state.panes.panes[state.panes.activePaneId];
    const destinationPaneId =
      kind === "createArchive"
        ? archiveCreationDestinationPaneId(state.panes.activePaneId)
        : kind === "copy" || kind === "move" || kind === "extractArchive"
          ? otherPaneId(state.panes.activePaneId)
          : null;
    const destinationPane = destinationPaneId ? state.panes.panes[destinationPaneId] : null;
    if (!operationSupportedForPaneSources(kind, sourcePane, destinationPane)) {
      state.app.notify("operation.sourceUnsupported", undefined, "warning", false);
      state.app.lastCommandId = "operation.sourceUnsupported";
      return;
    }

    const job = createFileOperationJob(kind);
    state.operations.operationJob = job;
    state.operations.operationResult = null;
    state.operations.operationCancelRequested = false;
    state.operations.operationCancelConfirmOpen = false;
    state.operations.operationCancelConfirmOpenedAt = 0;
    state.operations.confirmationDialogOpen = true;
    state.app.lastCommandId = job.commandId;
    if (operationNameRequired(job)) focusOperationNameInput();
  }

  function archiveCreationDestinationPaneId(sourcePaneId: PaneId): PaneId | null {
    const destinationPaneId = otherPaneId(sourcePaneId);
    if (state.panes.panes[destinationPaneId].source.kind === "local") return destinationPaneId;
    return state.panes.panes[sourcePaneId].source.kind === "local" ? sourcePaneId : null;
  }

  function previewDeleteOperation(permanent: boolean): void {
    const sourceKind = state.panes.panes[state.panes.activePaneId].source.kind;
    previewOperation(permanent || !state.settings.appSettings.useTrash || sourceKind === "sftp" ? "delete" : "trash");
  }

  function closeOperationPreview(): void {
    state.operations.operationJob = null;
    state.operations.operationResult = null;
    state.operations.operationCancelRequested = false;
    state.operations.operationCancelConfirmOpen = false;
    state.operations.operationCancelConfirmOpenedAt = 0;
    state.operations.confirmationDialogOpen = false;
    state.app.lastCommandId = "operationPreview.close";
    actions.focusActivePaneAfterDialog();
  }

  function updateOperationName(name: string): void {
    if (!state.operations.operationJob) return;

    state.operations.operationJob = {
      ...state.operations.operationJob,
      requestedName: name,
    };
  }

  function focusOperationNameInput(): void {
    void tick().then(() => {
      state.operations.operationNameInputElement?.focus();
      state.operations.operationNameInputElement?.select();
    });
  }

  function operationConflictMessages(job: FileOperationJob): string[] {
    return operationConflictMessagesForEntries(job, state.panes.panes[job.destinationPaneId ?? job.sourcePaneId].entries, state.settings.t);
  }

  function operationBlockingMessages(job: FileOperationJob): string[] {
    return operationBlockingMessagesForEntries(job, state.panes.panes[job.destinationPaneId ?? job.sourcePaneId].entries, state.settings.t);
  }

  function executionConfirmationMessage(job: FileOperationJob): string {
    return operationExecutionConfirmationMessage(job, state.panes.panes[job.destinationPaneId ?? job.sourcePaneId].entries, state.settings.t);
  }

  async function saveOperationFailureLog(label: string, result: FileOperationResult): Promise<string | null> {
    if (!state.settings.appSettings.operationResult.saveFailureLog || result.failed.length === 0) return null;
    try {
      const localizedFailed = result.failed.map((item) => ({
        ...item,
        message: operationResultItemMessage(item, state.settings.t),
      }));
      return await saveOperationFailureLogEffect(invoke, label, localizedFailed);
    } catch (error) {
      state.app.notify("operation.failureLogSaveFailed", { error: actions.localizedBackendError(error) }, "failed");
      return null;
    }
  }

  async function handleOperationResult(job: FileOperationJob, result: FileOperationResult): Promise<void> {
    state.operations.operationResult = result;
    const logPath = await saveOperationFailureLog(job.label, result);
    const status = result.canceled ? "canceled" : result.failed.length ? (result.succeeded.length ? "warning" : "failed") : "completed";
    const message = { id: result.canceled ? "activity.operationCanceled" : "activity.operationResult", values: { succeeded: result.succeeded.length, failed: result.failed.length } };
    state.activity.finish(job.id, status, message, { kind: "operation", result, snapshot: { label: job.label, result, logPath, failedEntries: failedOperationEntries(job, result), returnPath: job.sourcePath } });
    state.app.notify(message.id, message.values, status, false);
  }

  function closeOperationFailureDialog(): void {
    state.operations.operationFailureDialog = null;
    state.app.lastCommandId = "operationResult.close";
    actions.focusActivePaneAfterDialog();
  }

  async function confirmOperationExecution(): Promise<void> {
    if (!state.operations.operationJob || state.operations.operationRunning || !state.operations.confirmationDialogOpen) return;

    if (!state.operations.operationJob.executable) {
      state.operations.operationResult = {
        succeeded: [],
        failed: [{ path: "", message: state.settings.t("operation.jobNotExecutable") }],
      };
      return;
    }
    if ((state.operations.operationJob.kind === "rename" || state.operations.operationJob.kind === "mkdir" || state.operations.operationJob.kind === "createFile" || state.operations.operationJob.kind === "createArchive" || state.operations.operationJob.kind === "chmod" || state.operations.operationJob.kind === "windowsAttributes") && !state.operations.operationJob.requestedName?.trim()) {
      state.operations.operationResult = {
        succeeded: [],
        failed: [{ path: "", message: state.operations.operationJob.kind === "chmod" ? state.settings.t("operation.modeRequired") : state.operations.operationJob.kind === "windowsAttributes" ? state.settings.t("operation.attributesRequired") : state.settings.t("operation.nameRequired") }],
      };
      focusOperationNameInput();
      return;
    }
    const blockingMessages = operationBlockingMessages(state.operations.operationJob);
    if (blockingMessages.length > 0) {
      state.operations.operationResult = {
        succeeded: [],
        failed: blockingMessages.map((message) => ({ path: "", message })),
      };
      return;
    }

    const executedJob = { ...state.operations.operationJob, id: crypto.randomUUID() };
    state.activity.begin({ id: `activity.operation.${executedJob.kind}` }, executedJob.id);
    const executableJob: FileOperationJob = {
      ...executedJob,
      sftpSafeTransferPartThresholdBytes: state.settings.appSettings.sftpTransfer.partFileThresholdBytes,
    };
    const executingUndo = executedJob.commandId.startsWith("undo.");
    state.operations.operationJob = {
      ...executedJob,
      status: "running",
    };
    state.operations.operationRunning = true;
    state.operations.operationCancelRequested = false;
    state.operations.operationCancelConfirmOpen = false;
    state.operations.operationCancelConfirmOpenedAt = 0;
    state.app.lastCommandId = `${executedJob.commandId}.execute`;
    actions.focusActivePaneAfterDialog();

    try {
      const result = await executeFileOperationJob(invoke, executableJob);
      await handleOperationResult(executedJob, result);
      const executingRedo = executedJob.commandId.startsWith("redo.");
      if (executingUndo && result.succeeded.length > 0 && result.failed.length === 0 && !result.canceled) {
        commitUndoHistory();
      } else if (executingRedo && result.succeeded.length > 0 && result.failed.length === 0 && !result.canceled) {
        commitRedoHistory(executedJob);
      } else if (!executingUndo && !executingRedo && result.succeeded.length > 0 && result.failed.length === 0 && !result.canceled) {
        pushUndoSnapshot(createUndoSnapshot(executedJob, state.settings.t), true);
      }
      await actions.reloadPanesAfterOperation(executableJob);
    } catch (error) {
      const result = {
        succeeded: [],
        failed: [{ path: "", message: invokeErrorMessage(error) }],
      };
      await handleOperationResult(executedJob, result);
    } finally {
      state.operations.operationJob = null;
      state.operations.activeUndoSnapshot = null;
      state.operations.activeRedoSnapshot = null;
      state.operations.operationRunning = false;
      state.operations.operationCancelRequested = false;
      state.operations.operationCancelConfirmOpen = false;
      state.operations.operationCancelConfirmOpenedAt = 0;
      state.operations.confirmationDialogOpen = false;

    }
  }

  async function cancelOperationConfirmation(): Promise<void> {
    if (state.operations.operationRunning && state.operations.operationJob) {
      if (state.operations.operationCancelRequested) {
        state.app.notify("operation.cancelAlreadyRequested", undefined, "completed", false);
        state.app.lastCommandId = "operation.cancelAlreadyRequested";
        return;
      }

      if (!state.operations.operationCancelConfirmOpen) {
        state.operations.operationCancelConfirmOpen = true;
        state.operations.operationCancelConfirmOpenedAt = Date.now();
        state.app.notify("operation.cancelConfirmStatus", undefined, "completed", false);
        state.app.lastCommandId = "operation.cancelConfirm";
        return;
      }

      const elapsed = Date.now() - state.operations.operationCancelConfirmOpenedAt;
      const doubleEscEnabled = state.settings.appSettings.operationCancel.doubleEscEnabled;
      const doubleEscWindowMs = Math.max(0, state.settings.appSettings.operationCancel.doubleEscWindowMs || 0);
      if (doubleEscEnabled && elapsed <= doubleEscWindowMs) {
        await requestOperationCancel();
        return;
      }

      state.operations.operationCancelConfirmOpen = false;
      state.operations.operationCancelConfirmOpenedAt = 0;
      state.app.notify("operation.continues", undefined, "completed", false);
      state.app.lastCommandId = "operation.cancelConfirmClose";
      return;
    }
    state.operations.confirmationDialogOpen = false;
    state.app.lastCommandId = "operationPreview.confirmCancel";
    actions.focusActivePaneAfterDialog();
  }

  async function confirmOperationCancel(): Promise<void> {
    if (!state.operations.operationRunning || !state.operations.operationJob || state.operations.operationCancelRequested) return;
    await requestOperationCancel();
  }

  async function requestOperationCancel(): Promise<void> {
    if (!state.operations.operationJob) return;
    const jobId = state.operations.operationJob.id;
    const resetRequest = () => {
      state.activity.resume(jobId);
      if (state.operations.operationJob?.id === jobId) { state.operations.operationCancelRequested = false; state.operations.operationJob = { ...state.operations.operationJob, status: "running" }; }
    };
    state.operations.operationCancelRequested = true;
    state.operations.operationCancelConfirmOpen = false;
    state.operations.operationCancelConfirmOpenedAt = 0;
    state.operations.operationJob = {
      ...state.operations.operationJob,
      status: "cancelRequested",
    };
    state.app.lastCommandId = "operation.cancelRequested";
    try {
      state.activity.canceling(jobId);
      const accepted = await cancelFileOperationJob(invoke, jobId);
      if (!accepted) resetRequest();
      state.app.notify(accepted ? "operation.cancelRequestedStatus" : "operation.cancelNotAccepted", undefined, "warning", false);
    } catch (error) {
      resetRequest();
      state.app.notify("operation.cancelFailed", { error: actions.localizedBackendError(error) }, "failed", false);
    }
  }

  function previewUndoOperation(): void {
    const snapshot = state.operations.undoStack.at(-1) ?? null;
    if (!snapshot) {
      state.app.notify("operation.noUndo", undefined, "warning", false);
      state.app.lastCommandId = "app.undo.empty";
      return;
    }

    state.operations.activeUndoSnapshot = snapshot;
    state.operations.activeRedoSnapshot = null;
    state.operations.operationJob = snapshot.job;
    state.operations.operationResult = null;
    state.operations.operationCancelRequested = false;
    state.operations.operationCancelConfirmOpen = false;
    state.operations.operationCancelConfirmOpenedAt = 0;
    state.operations.confirmationDialogOpen = true;
    state.app.notify("operation.undoStatus", { label: snapshot.label, undo: state.operations.undoStack.length, redo: state.operations.redoStack.length }, "completed", false);
    state.app.lastCommandId = "app.undo";
  }

  function previewRedoOperation(): void {
    const snapshot = state.operations.redoStack.at(-1) ?? null;
    if (!snapshot) {
      state.app.notify("operation.noRedo", undefined, "warning", false);
      state.app.lastCommandId = "app.redo.empty";
      return;
    }

    state.operations.activeRedoSnapshot = snapshot;
    state.operations.activeUndoSnapshot = null;
    state.operations.operationJob = snapshot.redoJob;
    state.operations.operationResult = null;
    state.operations.operationCancelRequested = false;
    state.operations.operationCancelConfirmOpen = false;
    state.operations.operationCancelConfirmOpenedAt = 0;
    state.operations.confirmationDialogOpen = true;
    state.app.notify("operation.redoStatus", { label: snapshot.redoLabel, undo: state.operations.undoStack.length, redo: state.operations.redoStack.length }, "completed", false);
    state.app.lastCommandId = "app.redo";
  }

  function operationSafetyMessages(job: FileOperationJob): string[] {
    if (state.operations.activeUndoSnapshot && job.id === state.operations.activeUndoSnapshot.job.id) {
      return undoSafetyMessages(state.operations.activeUndoSnapshot, state.panes.panes[job.sourcePaneId], state.settings.t);
    }
    return [];
  }

  function pushUndoSnapshot(snapshot: UndoSnapshot | null, clearRedo: boolean): void {
    if (!snapshot) return;
    state.operations.undoStack = [...state.operations.undoStack, snapshot].slice(-20);
    if (clearRedo) state.operations.redoStack = [];
  }

  function commitUndoHistory(): void {
    if (!state.operations.activeUndoSnapshot) return;
    const snapshot = state.operations.activeUndoSnapshot;
    state.operations.undoStack = state.operations.undoStack.at(-1)?.job.id === snapshot.job.id ? state.operations.undoStack.slice(0, -1) : state.operations.undoStack.filter((item) => item.job.id !== snapshot.job.id);
    state.operations.redoStack = [...state.operations.redoStack, snapshot].slice(-20);
  }

  function commitRedoHistory(executedJob: FileOperationJob): void {
    if (!state.operations.activeRedoSnapshot) return;
    const snapshot = state.operations.activeRedoSnapshot;
    state.operations.redoStack = state.operations.redoStack.at(-1)?.redoJob.id === snapshot.redoJob.id ? state.operations.redoStack.slice(0, -1) : state.operations.redoStack.filter((item) => item.redoJob.id !== snapshot.redoJob.id);
    pushUndoSnapshot(createUndoSnapshot(executedJob, state.settings.t), false);
  }

  function runOperationFailureDialogKeyAction(action: OperationFailureDialogKeyAction): void {
    if (action.type === "close") {
      closeOperationFailureDialog();
    } else if (action.type === "showSide") {
      applyOperationFailureSide(action.side);
    }
  }

  function applyOperationFailureSide(side: PaneId): void {
    const snapshot = state.operations.operationFailureDialog;
    if (!snapshot || snapshot.failedEntries.length === 0) return;
    const entries = snapshot.failedEntries;
    const source = createOperationResultSource(entries, snapshot.returnPath, snapshot.label, state.settings.t);
    state.operations.operationFailureDialog = null;
    actions.updatePane(side, loadedEntriesPatch(source, source.location, entries, null, actions.visibleLoadedEntries(side, entries)));
    state.panes.activePaneId = side;
    if (!state.terminal.consoleFocused) state.terminal.consoleCwd = source.returnPath;
    actions.queueCursorScroll(side);
    state.app.notify("operation.failureVirtualFolder", { count: entries.length }, "completed", false);
    state.app.lastCommandId = side === "left" ? "operationResult.showLeft" : "operationResult.showRight";
    actions.focusActivePaneAfterDialog();
  }

  async function runConfirmationDialogKeyAction(action: ConfirmationDialogKeyAction): Promise<void> {
    if (action === "cancel") {
      await cancelOperationConfirmation();
    } else if (action === "confirm") {
      if (state.operations.operationRunning && state.operations.operationCancelConfirmOpen) {
        await confirmOperationCancel();
        return;
      }
      await confirmOperationExecution();
    }
  }

  return {
    selectedOperationTargets,
    isSupportedArchiveName,
    useWindowsAttributesOperation,
    createFileOperationJob,
    previewOperation,
    archiveCreationDestinationPaneId,
    previewDeleteOperation,
    closeOperationPreview,
    updateOperationName,
    focusOperationNameInput,
    operationConflictMessages,
    operationBlockingMessages,
    executionConfirmationMessage,
    saveOperationFailureLog,
    handleOperationResult,
    closeOperationFailureDialog,
    confirmOperationExecution,
    cancelOperationConfirmation,
    confirmOperationCancel,
    requestOperationCancel,
    previewUndoOperation,
    previewRedoOperation,
    operationSafetyMessages,
    pushUndoSnapshot,
    commitUndoHistory,
    commitRedoHistory,
    runOperationFailureDialogKeyAction,
    applyOperationFailureSide,
    runConfirmationDialogKeyAction,
  };
}
