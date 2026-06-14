import type { FileOperationKind, PaneId, PrefixKey } from "./types";
import type { PaneKeyAction, PrefixKeyAction } from "./keyboardModel";

export type PrefixKeyActionRunner = {
  setStatus(message: string, commandId: string): void;
  goFirst(): void;
  goLast(): void;
  previewOperation(kind: FileOperationKind): void;
  openExternalCommandDialog(): Promise<void>;
  openPaneDiffDialog(): void;
  openDetailedPaneDiffDialog(): Promise<void>;
  openGitStatusSource(): Promise<void>;
  copySelectedPathsToClipboard(): Promise<void>;
  copyCurrentDirectoryToClipboard(): Promise<void>;
  copySelectedNamesToClipboard(): Promise<void>;
};

export async function runPrefixKeyActionWith(
  action: PrefixKeyAction,
  runner: PrefixKeyActionRunner,
): Promise<void> {
  if (action.type === "cancel") {
    runner.setStatus("Prefix canceled.", "prefix.cancel");
  } else if (action.type === "goFirst") {
    runner.goFirst();
  } else if (action.type === "goLast") {
    runner.goLast();
  } else if (action.type === "mkdir") {
    runner.previewOperation("mkdir");
  } else if (action.type === "createFile") {
    runner.previewOperation("createFile");
  } else if (action.type === "createArchive") {
    runner.previewOperation("createArchive");
  } else if (action.type === "openCommandDialog") {
    await runner.openExternalCommandDialog();
  } else if (action.type === "openPaneDiff") {
    runner.openPaneDiffDialog();
  } else if (action.type === "openDetailedPaneDiff") {
    await runner.openDetailedPaneDiffDialog();
  } else if (action.type === "openGitStatus") {
    await runner.openGitStatusSource();
  } else if (action.type === "copySelectedPaths") {
    await runner.copySelectedPathsToClipboard();
  } else if (action.type === "copyCurrentDirectory") {
    await runner.copyCurrentDirectoryToClipboard();
  } else if (action.type === "copySelectedNames") {
    await runner.copySelectedNamesToClipboard();
  } else {
    runner.setStatus(`No command for ${action.prefix} ${action.key}.`, "prefix.noMatch");
  }
}

export type PaneKeyActionRunner = {
  activePaneId(): PaneId;
  isRightPaneActive(): boolean;
  toggleTerminalFullscreen(): Promise<void>;
  toggleConsoleVisibility(): void;
  previewUndoOperation(): void;
  previewRedoOperation(): void;
  openSearchDialog(): void;
  startQuickFilter(paneId: PaneId): void;
  toggleKeyHelp(): void;
  focusConsole(): void;
  focusOtherPane(): void;
  setLastCommand(commandId: string): void;
  goRoot(): Promise<void>;
  goHome(): Promise<void>;
  openOtherPanePathHere(): Promise<void>;
  openCurrentPathInOtherPane(): Promise<void>;
  clearQuickFilter(paneId: PaneId): void;
  closeOperationPreview(): void;
  extendSelection(delta: -1 | 1): void;
  moveCursor(delta: number): void;
  moveCursorByPage(direction: -1 | 1): void;
  goFirst(): void;
  goLast(): void;
  goParent(): Promise<void>;
  openFocusedWithDefaultApp(): Promise<void>;
  editFocused(): Promise<void>;
  openFocused(): Promise<void>;
  openFilePropertiesDialog(): void;
  toggleFocusedSelection(): void;
  selectAllVisible(): void;
  refreshActivePane(): Promise<void>;
  openLocationManager(): Promise<void>;
  startPrefixMode(prefix: PrefixKey): void;
  openExternalCommandDialog(): Promise<void>;
  cycleSortMode(): void;
  toggleHiddenFiles(): void;
  previewDeleteOperation(permanent: boolean): void;
  previewOperation(kind: FileOperationKind): void;
};

export async function runPaneKeyActionWith(
  action: PaneKeyAction,
  runner: PaneKeyActionRunner,
): Promise<void> {
  if (action.type === "toggleTerminalFullscreen") {
    await runner.toggleTerminalFullscreen();
  } else if (action.type === "toggleConsoleVisibility") {
    runner.toggleConsoleVisibility();
  } else if (action.type === "undoLastOperation") {
    runner.previewUndoOperation();
  } else if (action.type === "redoLastOperation") {
    runner.previewRedoOperation();
  } else if (action.type === "openSearchDialog") {
    runner.openSearchDialog();
  } else if (action.type === "startQuickFilter") {
    runner.startQuickFilter(runner.activePaneId());
  } else if (action.type === "toggleKeyHelp") {
    runner.toggleKeyHelp();
  } else if (action.type === "focusConsole") {
    runner.focusConsole();
  } else if (action.type === "focusOtherByTab") {
    runner.focusOtherPane();
    runner.setLastCommand(action.reverse ? "pane.focusPreviousByTab" : "pane.focusNextByTab");
  } else if (action.type === "goRoot") {
    await runner.goRoot();
  } else if (action.type === "goHome") {
    await runner.goHome();
  } else if (action.type === "openOtherPanePathHere") {
    await runner.openOtherPanePathHere();
  } else if (action.type === "openCurrentPathInOtherPane") {
    await runner.openCurrentPathInOtherPane();
  } else if (action.type === "clearQuickFilter") {
    runner.clearQuickFilter(runner.activePaneId());
  } else if (action.type === "closeOperationPreview") {
    runner.closeOperationPreview();
  } else if (action.type === "extendSelection") {
    runner.extendSelection(action.delta);
  } else if (action.type === "moveCursor") {
    runner.moveCursor(action.delta);
  } else if (action.type === "moveCursorByPage") {
    runner.moveCursorByPage(action.direction);
  } else if (action.type === "goFirst") {
    runner.goFirst();
  } else if (action.type === "goLast") {
    runner.goLast();
  } else if (action.type === "horizontalRight") {
    if (runner.isRightPaneActive()) {
      await runner.goParent();
    } else {
      runner.focusOtherPane();
    }
  } else if (action.type === "horizontalLeft") {
    if (runner.isRightPaneActive()) {
      runner.focusOtherPane();
    } else {
      await runner.goParent();
    }
  } else if (action.type === "goParent") {
    await runner.goParent();
  } else if (action.type === "openFocusedWithDefaultApp") {
    await runner.openFocusedWithDefaultApp();
  } else if (action.type === "editFocused") {
    await runner.editFocused();
  } else if (action.type === "openFocused") {
    await runner.openFocused();
  } else if (action.type === "openProperties") {
    runner.openFilePropertiesDialog();
  } else if (action.type === "toggleFocusedSelection") {
    runner.toggleFocusedSelection();
  } else if (action.type === "selectAllVisible") {
    runner.selectAllVisible();
  } else if (action.type === "refreshActivePane") {
    await runner.refreshActivePane();
  } else if (action.type === "openLocationManager") {
    await runner.openLocationManager();
  } else if (action.type === "startPrefix") {
    runner.startPrefixMode(action.prefix);
  } else if (action.type === "openExternalCommandDialog") {
    await runner.openExternalCommandDialog();
  } else if (action.type === "cycleSortMode") {
    runner.cycleSortMode();
  } else if (action.type === "toggleHiddenFiles") {
    runner.toggleHiddenFiles();
  } else if (action.type === "delete") {
    runner.previewDeleteOperation(action.permanent);
  } else if (action.type === "operation") {
    runner.previewOperation(action.kind);
  }
}
