import {
  classifyConfirmationDialogKey,
  classifyExternalCommandDialogKey,
  classifyFilePropertiesDialogKey,
  classifyLargeSearchResultDialogKey,
  classifyLocationDialogKey,
  classifyOperationFailureDialogKey,
  classifyPaneDiffDialogKey,
  classifySearchDialogKey,
} from "../dialogKeyboardModel";
import {
  classifyPaneKey,
  classifyPrefixKey,
  commandMatchesSingleKey,
  type PaneKeyAction,
  type PrefixKeyAction,
} from "../keyboardModel";
import { runPaneKeyActionWith, runPrefixKeyActionWith } from "../keyActionRunners";
import type { PrefixKey } from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

type Dependencies = Pick<WorkspaceActions,
  | "handleActivityKey"
  | "cancelRunningDetailedDiff"
  | "clearQuickFilter"
  | "closeOperationPreview"
  | "copyCurrentDirectoryToClipboard"
  | "copySelectedNamesToClipboard"
  | "copySelectedPathsToClipboard"
  | "cycleSortMode"
  | "editFocused"
  | "enterQuickFilterInput"
  | "extendSelection"
  | "focusConsole"
  | "focusOtherPane"
  | "goHome"
  | "goParent"
  | "goRoot"
  | "handleConsoleFallbackKeydown"
  | "handleViewerKeydown"
  | "moveCursor"
  | "moveCursorByPage"
  | "moveCursorTo"
  | "openCurrentPathInOtherPane"
  | "openDetailedPaneDiffDialog"
  | "openExternalCommandDialog"
  | "openFilePropertiesDialog"
  | "openFocused"
  | "openFocusedWithDefaultApp"
  | "openGitStatusSource"
  | "openOtherPanePathHere"
  | "openPaneDiffDialog"
  | "openSearchDialog"
  | "openSftpConnectionDialog"
  | "previewDeleteOperation"
  | "previewOperation"
  | "previewRedoOperation"
  | "previewUndoOperation"
  | "refreshActivePane"
  | "runConfirmationDialogKeyAction"
  | "runExternalCommandDialogKeyAction"
  | "runFilePropertiesDialogKeyAction"
  | "runLargeSearchResultDialogKeyAction"
  | "runLocationDialogKeyAction"
  | "runOperationFailureDialogKeyAction"
  | "runPaneDiffDialogKeyAction"
  | "runSearchDialogKeyAction"
  | "selectAllVisible"
  | "terminalHasDomFocus"
  | "toggleConsoleVisibility"
  | "toggleFocusedSelection"
  | "toggleHiddenFiles"
  | "toggleTerminalFullscreen"
  | "visibleEntries"
>;

export function createKeyboardController(state: Pick<WorkspaceState, "activity" | "app" | "commands" | "inspection" | "locations" | "operations" | "panes" | "search" | "settings" | "terminal" | "viewer">, actions: Dependencies) {
  function startPrefixMode(prefix: PrefixKey): void {
    state.app.prefixMode = prefix;
    state.app.notify("status.prefix", { prefix }, "completed", false);
    state.app.lastCommandId = `prefix.${prefix}`;
  }

  function handlePrefixKey(event: KeyboardEvent): boolean {
    if (!state.app.prefixMode) return false;

    event.preventDefault();
    const action = classifyPrefixKey(state.app.prefixMode, event, state.settings.keybindSettings);
    state.app.prefixMode = null;
    void runPrefixKeyAction(action);
    return true;
  }

  async function runPrefixKeyAction(action: PrefixKeyAction): Promise<void> {
    await runPrefixKeyActionWith(action, {
      translateStatus: state.settings.t,
      setStatus(message, commandId) {
        state.app.statusMessage = message;
        state.app.lastCommandId = commandId;
      },
      goFirst() {
        actions.moveCursorTo(0, "cursor.goFirst");
      },
      goLast() {
        actions.moveCursorTo(actions.visibleEntries(state.panes.panes[state.panes.activePaneId]).length - 1, "cursor.goLast");
      },
      previewOperation: actions.previewOperation,
      openExternalCommandDialog: actions.openExternalCommandDialog,
      openPaneDiffDialog: actions.openPaneDiffDialog,
      openDetailedPaneDiffDialog: actions.openDetailedPaneDiffDialog,
      openGitStatusSource: actions.openGitStatusSource,
      copySelectedPathsToClipboard: actions.copySelectedPathsToClipboard,
      copyCurrentDirectoryToClipboard: actions.copyCurrentDirectoryToClipboard,
      copySelectedNamesToClipboard: actions.copySelectedNamesToClipboard,
    });
  }

  async function runPaneKeyAction(action: PaneKeyAction): Promise<void> {
    await runPaneKeyActionWith(action, {
      activePaneId: () => state.panes.activePaneId,
      isRightPaneActive: () => state.panes.activePaneId === "right",
      toggleTerminalFullscreen: actions.toggleTerminalFullscreen,
      toggleConsoleVisibility: actions.toggleConsoleVisibility,
      previewUndoOperation: actions.previewUndoOperation,
      previewRedoOperation: actions.previewRedoOperation,
      openSearchDialog: actions.openSearchDialog,
      startQuickFilter: actions.enterQuickFilterInput,
      toggleKeyHelp() {
        state.app.keyHelpVisible = !state.app.keyHelpVisible;
        state.app.lastCommandId = state.app.keyHelpVisible ? "help.show" : "help.close";
      },
      focusConsole: actions.focusConsole,
      focusOtherPane: actions.focusOtherPane,
      setLastCommand(commandId) {
        state.app.lastCommandId = commandId;
      },
      goRoot: actions.goRoot,
      goHome: actions.goHome,
      openOtherPanePathHere: actions.openOtherPanePathHere,
      openCurrentPathInOtherPane: actions.openCurrentPathInOtherPane,
      clearQuickFilter: actions.clearQuickFilter,
      closeOperationPreview: actions.closeOperationPreview,
      extendSelection: actions.extendSelection,
      moveCursor: actions.moveCursor,
      moveCursorByPage: actions.moveCursorByPage,
      goFirst() {
        actions.moveCursorTo(0, "cursor.goFirst");
      },
      goLast() {
        actions.moveCursorTo(actions.visibleEntries(state.panes.panes[state.panes.activePaneId]).length - 1, "cursor.goLast");
      },
      goParent: actions.goParent,
      openFocusedWithDefaultApp: actions.openFocusedWithDefaultApp,
      editFocused: actions.editFocused,
      openFocused: actions.openFocused,
      openFilePropertiesDialog: actions.openFilePropertiesDialog,
      toggleFocusedSelection: actions.toggleFocusedSelection,
      selectAllVisible: actions.selectAllVisible,
      refreshActivePane: actions.refreshActivePane,
      openLocationManager: actions.openSftpConnectionDialog,
      startPrefixMode,
      openExternalCommandDialog: actions.openExternalCommandDialog,
      cycleSortMode: actions.cycleSortMode,
      toggleHiddenFiles: actions.toggleHiddenFiles,
      previewDeleteOperation: actions.previewDeleteOperation,
      previewOperation: actions.previewOperation,
    });
  }

  function isEditableEventTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable
    );
  }

  function eventIsComposing(event: KeyboardEvent): boolean {
    return state.app.imeComposing || event.isComposing || event.key === "Process" || event.keyCode === 229;
  }

  async function handleKeydown(event: KeyboardEvent): Promise<void> {
    if (state.settings.preferencesDialogOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        state.settings.preferencesDialogOpen = false;
        state.app.lastCommandId = "preferences.close";
      }
      return;
    }

    if (state.terminal.consoleFocused) {
      // xterm owns focused terminal keystrokes. If DOM focus was lost while
      // Windy still considers the console active, recover the terminal focus
      // and keep console escape shortcuts available.
      if (!actions.terminalHasDomFocus()) {
        await actions.handleConsoleFallbackKeydown(event);
      }
      return;
    }

    if (state.activity.detailsId) {
      const record = state.activity.records.find(record => record.id === state.activity.detailsId);
      const element = state.activity.detailsElement;
      const step = event.key === "ArrowUp" ? -40 : event.key === "ArrowDown" ? 40 : event.key === "PageUp" ? -(element?.clientHeight ?? 200) : event.key === "PageDown" ? (element?.clientHeight ?? 200) : 0;
      if (element && (step || event.key === "Home" || event.key === "End")) { event.preventDefault(); element.scrollTop = event.key === "Home" ? 0 : event.key === "End" ? element.scrollHeight : element.scrollTop + step; }
      if ((event.key === "[" || event.key === "]") && record?.result?.kind === "operation" && record.result.snapshot.failedEntries.length) {
        event.preventDefault();
        state.operations.operationFailureDialog = { ...record.result.snapshot, label: state.settings.t(record.label.id, record.label.values) };
        state.activity.detailsId = null;
        actions.runOperationFailureDialogKeyAction({ type: "showSide", side: event.key === "[" ? "left" : "right" });
      }
      if (event.key === "Escape" || event.key === "Enter") { event.preventDefault(); state.activity.detailsId = null; }
      return;
    }
    if (!state.app.keyHelpVisible && !state.operations.operationFailureDialog && !state.search.pendingLargeSearchResult && !state.viewer.viewer && !state.search.searchDialogOpen && !state.locations.sftpDialogOpen && !state.commands.commandDialogOpen && !state.inspection.paneDiffDialog && !state.inspection.filePropertiesDialog && (!state.operations.confirmationDialogOpen || state.operations.operationRunning) && !isEditableEventTarget(event.target)) {
      if (await actions.handleActivityKey(event)) return;
    }
    state.app.lastKey = event.key;

    if (state.app.keyHelpVisible) {
      if (event.key === "Escape" || commandMatchesSingleKey(state.settings.keybindSettings, "help.toggle", event)) {
        event.preventDefault();
        state.app.keyHelpVisible = false;
        state.app.lastCommandId = "help.close";
      }
      return;
    }

    if (state.inspection.detailedDiffRunning && event.key === "Escape") {
      event.preventDefault();
      await actions.cancelRunningDetailedDiff();
      return;
    }

    if (state.viewer.viewer) {
      await actions.handleViewerKeydown(event);
      return;
    }

    if (state.operations.operationFailureDialog) {
      const action = classifyOperationFailureDialogKey(event);
      if (action) {
        event.preventDefault();
        actions.runOperationFailureDialogKeyAction(action);
      }
      return;
    }

    if (state.inspection.filePropertiesDialog) {
      const action = classifyFilePropertiesDialogKey(event);
      if (action) {
        event.preventDefault();
        actions.runFilePropertiesDialogKeyAction(action);
      }
      return;
    }

    if (state.inspection.paneDiffDialog) {
      const action = classifyPaneDiffDialogKey(event);
      if (action) {
        event.preventDefault();
        actions.runPaneDiffDialogKeyAction(action);
      }
      return;
    }

    if (state.operations.confirmationDialogOpen) {
      const action = classifyConfirmationDialogKey(event);
      if (action) {
        event.preventDefault();
        await actions.runConfirmationDialogKeyAction(action);
      }
      return;
    }

    if (state.search.pendingLargeSearchResult) {
      const action = classifyLargeSearchResultDialogKey(event);
      if (action) {
        event.preventDefault();
        actions.runLargeSearchResultDialogKeyAction(action);
      }
      return;
    }

    if (state.commands.commandDialogOpen) {
      const action = classifyExternalCommandDialogKey(event);
      if (action) {
        event.preventDefault();
        await actions.runExternalCommandDialogKeyAction(action);
      }
      return;
    }

    if (state.search.searchDialogOpen) {
      const action = classifySearchDialogKey(event, eventIsComposing(event));
      if (action) {
        event.preventDefault();
        await actions.runSearchDialogKeyAction(action);
      }
      return;
    }

    if (state.locations.sftpDialogOpen) {
      const action = classifyLocationDialogKey(event, {
        mode: state.locations.locationDialogMode,
        hasPendingDelete: Boolean(state.locations.pendingDeleteProfile || state.locations.pendingDeleteLocalFavorite || state.locations.pendingDeleteSearchProfile),
        hasPendingKnownHost: Boolean(state.locations.pendingKnownHost),
        composing: eventIsComposing(event),
      });
      if (action) {
        event.preventDefault();
        await actions.runLocationDialogKeyAction(action);
      }
      return;
    }

    if (isEditableEventTarget(event.target)) {
      if (event.key === "Escape" && state.operations.operationJob) {
        event.preventDefault();
        actions.closeOperationPreview();
      }
      return;
    }

    if (handlePrefixKey(event)) return;

    const paneAction = classifyPaneKey(event, {
      hasQuickFilterQuery: Boolean(state.panes.panes[state.panes.activePaneId].quickFilterQuery),
      hasOperationJob: Boolean(state.operations.operationJob),
    }, state.settings.keybindSettings);
    if (paneAction) {
      event.preventDefault();
      await runPaneKeyAction(paneAction);
    }
  }

  return {
    startPrefixMode,
    handlePrefixKey,
    runPrefixKeyAction,
    runPaneKeyAction,
    isEditableEventTarget,
    eventIsComposing,
    handleKeydown,
  };
}
