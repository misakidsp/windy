import { invoke } from "@tauri-apps/api/core";
import { normalizedExtensionColorMap } from "../appearanceModel";
import { loadedEntriesPatch } from "../directoryLoadingModel";
import { cancelDetailedDiff, compareLocalDirectoriesDetailed } from "../fileSystemSideEffects";
import { entryClass, entryExtensionColor } from "../displayModel";
import { type FilePropertiesDialogKeyAction, type PaneDiffDialogKeyAction } from "../dialogKeyboardModel";
import { createDiffSource, paneHeaderLabel } from "../paneModel";
import { invokeErrorMessage } from "../tauriInvoke";
import {
  comparePaneEntries,
  detailedDiffSnapshot,
  diffEntriesForSide,
  type PaneDiffSnapshot,
} from "../diffModel";
import { paneSourcesSupportDetailedDiff } from "../sourceCapabilityModel";
import { createFilePropertySnapshot } from "../propertyModel";
import type { FileEntry, PaneId, PaneState } from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

type Dependencies = Pick<WorkspaceActions,
  | "focusActivePaneAfterDialog"
  | "localizedBackendError"
  | "queueCursorScroll"
  | "updatePane"
  | "visibleEntries"
  | "visibleLoadedEntries"
>;

export function createInspectionController(state: Pick<WorkspaceState, "activity" | "app" | "inspection" | "panes" | "settings" | "terminal">, actions: Dependencies) {
  function runFilePropertiesDialogKeyAction(action: FilePropertiesDialogKeyAction): void {
    if (action === "close") closeFilePropertiesDialog();
  }

  function runPaneDiffDialogKeyAction(action: PaneDiffDialogKeyAction): void {
    if (action.type === "close") {
      closePaneDiffDialog();
    } else if (action.type === "showSide") {
      applyPaneDiffSide(action.side);
    } else if (action.type === "scroll") {
      scrollPaneDiffDialog(action.amount);
    }
  }

  function applyPaneDiffSide(side: PaneId): void {
    const snapshot = state.inspection.paneDiffDialog;
    if (!snapshot) return;
    const sourcePane = state.panes.panes[side];
    if (
      sourcePane.source.kind !== "local" &&
      sourcePane.source.kind !== "search" &&
      sourcePane.source.kind !== "diff" &&
      sourcePane.source.kind !== "operationResult" &&
      sourcePane.source.kind !== "gitStatus"
    ) {
      state.app.notify("operationResult.diffUnsupported", undefined, "warning", false);
      state.app.lastCommandId = "diff.showSide.unsupported";
      return;
    }

    const entries = diffEntriesForSide(snapshot, side);
    const basePath = side === "left" ? snapshot.leftRootPath : snapshot.rightRootPath;
    const source = createDiffSource(side, entries, sourcePane.source.kind, basePath, snapshot.mode, state.settings.t);
    state.inspection.paneDiffDialog = null;
    state.inspection.paneDiffListElement = null;
    actions.updatePane(side, loadedEntriesPatch(source, source.location, entries, null, actions.visibleLoadedEntries(side, entries)));
    state.panes.activePaneId = side;
    if (!state.terminal.consoleFocused) state.terminal.consoleCwd = source.returnPath;
    actions.queueCursorScroll(side);
    state.app.notify("operationResult.diffVirtualFolder", { side, count: entries.length }, "completed", false);
    state.app.lastCommandId = side === "left" ? "diff.showLeft" : "diff.showRight";
    actions.focusActivePaneAfterDialog();
  }

  function scrollPaneDiffDialog(amount: "lineUp" | "lineDown" | "pageUp" | "pageDown" | "top" | "bottom"): void {
    const list = state.inspection.paneDiffListElement;
    if (!list) return;
    const line = 24;
    const page = Math.max(line, list.clientHeight - line);
    if (amount === "lineUp") list.scrollTop -= line;
    if (amount === "lineDown") list.scrollTop += line;
    if (amount === "pageUp") list.scrollTop -= page;
    if (amount === "pageDown") list.scrollTop += page;
    if (amount === "top") list.scrollTop = 0;
    if (amount === "bottom") list.scrollTop = list.scrollHeight;
  }

  function openFilePropertiesDialog(): void {
    const pane = state.panes.panes[state.panes.activePaneId];
    const snapshot = createFilePropertySnapshot(pane, actions.visibleEntries(pane), paneHeaderLabel(pane, state.settings.t));
    if (!snapshot) {
      state.app.notify("properties.noEntry", undefined, "warning", false);
      state.app.lastCommandId = "file.properties";
      return;
    }

    state.inspection.filePropertiesDialog = snapshot;
    state.app.notify("properties.status", { count: snapshot.totalCount }, "completed", false);
    state.app.lastCommandId = "file.properties";
  }

  function closeFilePropertiesDialog(): void {
    state.inspection.filePropertiesDialog = null;
    actions.focusActivePaneAfterDialog();
  }

  function openPaneDiffDialog(): void {
    const snapshot = comparePaneEntries(state.panes.panes.left, state.panes.panes.right, paneHeaderLabel(state.panes.panes.left, state.settings.t), paneHeaderLabel(state.panes.panes.right, state.settings.t));
    state.inspection.paneDiffDialog = snapshot;
    const changed = changedDiffCount(snapshot);
    state.app.notify("diff.statusSummary", { changed, identical: snapshot.counts.identical }, "completed", false);
    state.app.lastCommandId = "diff.openPaneDiff";
  }

  function changedDiffCount(snapshot: PaneDiffSnapshot): number {
    return (
      snapshot.counts.leftOnly +
      snapshot.counts.rightOnly +
      snapshot.counts.kindDifferent +
      snapshot.counts.sizeDifferent +
      snapshot.counts.modifiedDifferent +
      snapshot.counts.hashDifferent +
      snapshot.counts.readError
    );
  }

  async function openDetailedPaneDiffDialog(): Promise<void> {
    if (state.inspection.detailedDiffRunning) {
      state.app.notify("diff.detailedAlreadyRunning", undefined, "completed", false);
      state.app.lastCommandId = "diff.openDetailedPaneDiff.alreadyRunning";
      return;
    }
    const leftPane = state.panes.panes.left;
    const rightPane = state.panes.panes.right;
    if (!paneSourcesSupportDetailedDiff(leftPane, rightPane)) {
      state.app.notify("diff.detailedLocalOnly", undefined, "warning", false);
      state.app.lastCommandId = "diff.openDetailedPaneDiff.unsupported";
      return;
    }

    const leftPath = leftPane.currentPath;
    const rightPath = rightPane.currentPath;
    if (!leftPath || !rightPath) {
      state.app.notify("diff.detailedRequiresBothPaths", undefined, "completed", false);
      state.app.lastCommandId = "diff.openDetailedPaneDiff.noPath";
      return;
    }

    const jobId = `detailed-diff-${Date.now().toString(36)}`;
    state.activity.begin({ id: "diff.detailedTitle" }, jobId);
    state.inspection.detailedDiffRunning = true;
    state.inspection.detailedDiffJobId = jobId;
    state.inspection.detailedDiffCancelRequested = false;
    state.app.notify("diff.detailedScanning", undefined, "completed", false);
    state.app.lastCommandId = "diff.openDetailedPaneDiff";
    try {
      const result = await compareLocalDirectoriesDetailed(invoke, jobId, leftPath, rightPath, true, true);
      const snapshot = detailedDiffSnapshot(result, leftPane, rightPane, paneHeaderLabel(leftPane, state.settings.t), paneHeaderLabel(rightPane, state.settings.t));
      state.activity.finish(jobId, snapshot.counts.readError ? "warning" : "completed", { id: "diff.detailedStatusSummary", values: { changed: changedDiffCount(snapshot), identical: snapshot.counts.identical } }, { kind: "diff", snapshot });
      // The result is available from history; do not steal focus on completion.
      const changed = changedDiffCount(snapshot);
      state.app.notify("diff.detailedStatusSummary", { changed, identical: snapshot.counts.identical }, "completed", false);
    } catch (error) {
      const message = invokeErrorMessage(error);
      state.activity.finish(jobId, message.includes("Detailed diff canceled") ? "canceled" : "failed", { id: message.includes("Detailed diff canceled") ? "diff.detailedCanceled" : "diff.detailedFailed", values: { error: message } });
      if (message.includes("Detailed diff canceled")) {
        state.app.notify("diff.detailedCanceled", undefined, "completed", false);
        state.app.lastCommandId = "diff.openDetailedPaneDiff.canceled";
      } else {
        state.app.notify("diff.detailedFailed", { error: actions.localizedBackendError(message) }, "failed", false);
        state.app.lastCommandId = "diff.openDetailedPaneDiff.failed";
      }
    } finally {
      state.inspection.detailedDiffRunning = false;
      state.inspection.detailedDiffJobId = null;
      state.inspection.detailedDiffCancelRequested = false;
    }
  }

  async function cancelRunningDetailedDiff(): Promise<void> {
    if (!state.inspection.detailedDiffRunning || !state.inspection.detailedDiffJobId || state.inspection.detailedDiffCancelRequested) return;
    const jobId = state.inspection.detailedDiffJobId;
    const resetRequest = () => {
      state.activity.resume(jobId);
      if (state.inspection.detailedDiffJobId === jobId) state.inspection.detailedDiffCancelRequested = false;
    };
    state.activity.canceling(jobId);
    state.inspection.detailedDiffCancelRequested = true;
    state.app.notify("diff.detailedCancelRequested", undefined, "completed", false);
    state.app.lastCommandId = "diff.cancelDetailedPaneDiff";
    try {
      const accepted = await cancelDetailedDiff(invoke, jobId);
      if (!accepted) {
        resetRequest();
        state.app.notify("diff.detailedCancelNotAccepted", undefined, "completed", false);
        state.app.lastCommandId = "diff.cancelDetailedPaneDiff.missing";
      }
    } catch (error) {
      resetRequest();
      state.app.notify("diff.detailedCancelFailed", { error: actions.localizedBackendError(error) }, "failed", false);
      state.app.lastCommandId = "diff.cancelDetailedPaneDiff.failed";
    }
  }

  function closePaneDiffDialog(): void {
    state.inspection.paneDiffDialog = null;
    state.inspection.paneDiffListElement = null;
    actions.focusActivePaneAfterDialog();
  }

  function entryClassWithDiff(pane: PaneState, entry: FileEntry): string {
    const classes = [entryClass(pane, entry)];
    const status = state.inspection.paneDiffDialog?.highlightedKeys[pane.id].get(entry.key);
    if (status) {
      classes.push(`diff-${status.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}`);
    }
    return classes.filter(Boolean).join(" ");
  }

  function entryNameStyleWithAppearance(pane: PaneState, entry: FileEntry): string | null {
    const diffStatus = state.inspection.paneDiffDialog?.highlightedKeys[pane.id].get(entry.key);
    if (diffStatus) return null;
    const color = entryExtensionColor(pane, entry, normalizedExtensionColorMap(state.settings.appearanceSettings));
    return color ? `color: ${color}` : null;
  }

  return {
    runFilePropertiesDialogKeyAction,
    runPaneDiffDialogKeyAction,
    applyPaneDiffSide,
    scrollPaneDiffDialog,
    openFilePropertiesDialog,
    closeFilePropertiesDialog,
    openPaneDiffDialog,
    changedDiffCount,
    openDetailedPaneDiffDialog,
    cancelRunningDetailedDiff,
    closePaneDiffDialog,
    entryClassWithDiff,
    entryNameStyleWithAppearance,
  };
}
