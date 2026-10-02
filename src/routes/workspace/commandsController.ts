import { invokeErrorMessage } from "../tauriInvoke";
import { invoke } from "@tauri-apps/api/core";
import { listExternalCommands } from "../appSideEffects";
import {
  clampExternalCommandCursor,
  clipboardNameTextForCommandTargets,
  clipboardTextForCommandTargets,
  externalCommandLines,
  localCommandTargets,
  markedCommandTargetsForPane,
  ShellQuoteError,
  shellQuotePath,
  selectedCommandTargetsForPane,
  type ExternalCommandContext,
} from "../externalCommandModel";
import { type ExternalCommandDialogKeyAction } from "../dialogKeyboardModel";
import { otherPaneId } from "../paneModel";
import type { CommandTarget, PaneState } from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

type Dependencies = Pick<WorkspaceActions,
  | "focusActivePaneAfterDialog"
  | "focusConsoleAndStart"
  | "localizedBackendError"
  | "localizedClipboardError"
  | "localizedShellQuoteError"
  | "returnFromConsole"
  | "visibleEntries"
  | "writeTerminal"
>;

export function createCommandsController(state: Pick<WorkspaceState, "app" | "commands" | "panes" | "settings" | "terminal">, actions: Dependencies) {
  function markedCommandTargets(pane: PaneState): CommandTarget[] {
    return markedCommandTargetsForPane(pane);
  }

  function isWindowsPlatform(): boolean {
    return navigator.userAgent.toLocaleLowerCase().includes("windows");
  }

  function selectedLocalCommandTargets(): CommandTarget[] {
    const pane = state.panes.panes[state.panes.activePaneId];
    if (pane.source.kind !== "local") return [];
    return selectedCommandTargets(pane);
  }

  function localMarkedCommandTargets(pane: PaneState): CommandTarget[] {
    return localCommandTargets(markedCommandTargets(pane), pane);
  }

  function externalCommandContext(): ExternalCommandContext {
    const activePane = state.panes.panes[state.panes.activePaneId];
    const otherPane = state.panes.panes[otherPaneId(state.panes.activePaneId)];
    return {
      activePane,
      otherPane,
      activeMarked: localMarkedCommandTargets(activePane),
      otherMarked: localMarkedCommandTargets(otherPane),
      shellKind: state.terminal.terminalShellKind,
    };
  }

  async function writeClipboardText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();

    try {
      if (!document.execCommand("copy")) throw new Error(state.settings.t("clipboard.copyRejected"));
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async function copySelectedPathsToClipboard(): Promise<void> {
    const pane = state.panes.panes[state.panes.activePaneId];
    if (pane.source.kind !== "local") {
      state.app.notify("clipboard.pathsLocalOnly", undefined, "warning", true);
      state.app.lastCommandId = "clipboard.sourceUnsupported";
      return;
    }

    const targets = selectedCommandTargets(pane);
    if (targets.length === 0) {
      state.app.notify("clipboard.noLocalPath", undefined, "warning", true);
      state.app.lastCommandId = "clipboard.noTargets";
      return;
    }

    try {
      const text = clipboardTextForCommandTargets(targets, state.terminal.terminalShellKind);
      await writeClipboardText(text);
      state.app.notify("clipboard.pathsCopied", { count: targets.length }, "completed", true);
      state.app.lastCommandId = "clipboard.copySelectedPaths";
    } catch (error) {
      state.app.notify("clipboard.copyFailedWithError", { error: invokeErrorMessage(error) }, "failed");
      state.app.lastCommandId = "clipboard.copyFailed";
    }
  }

  async function copyCurrentDirectoryToClipboard(): Promise<void> {
    const pane = state.panes.panes[state.panes.activePaneId];
    if (pane.source.kind !== "local") {
      state.app.notify("clipboard.currentDirectoryLocalOnly", undefined, "warning", true);
      state.app.lastCommandId = "clipboard.copyCurrentDirectory.sourceUnsupported";
      return;
    }

    if (!pane.currentPath) {
      state.app.notify("clipboard.noCurrentDirectory", undefined, "warning", true);
      state.app.lastCommandId = "clipboard.copyCurrentDirectory.noPath";
      return;
    }

    try {
      await writeClipboardText(shellQuotePath(pane.currentPath, state.terminal.terminalShellKind));
      state.app.notify("clipboard.currentDirectoryCopied", undefined, "completed", true);
      state.app.lastCommandId = "clipboard.copyCurrentDirectory";
    } catch (error) {
      state.app.notify("clipboard.copyFailedWithError", { error: invokeErrorMessage(error) }, "failed");
      state.app.lastCommandId = "clipboard.copyFailed";
    }
  }

  async function copySelectedNamesToClipboard(): Promise<void> {
    const pane = state.panes.panes[state.panes.activePaneId];
    if (pane.source.kind !== "local") {
      state.app.notify("clipboard.namesLocalOnly", undefined, "warning", true);
      state.app.lastCommandId = "clipboard.copySelectedNames.sourceUnsupported";
      return;
    }

    const targets = selectedCommandTargets(pane);
    if (targets.length === 0) {
      state.app.notify("clipboard.noLocalFilename", undefined, "warning", true);
      state.app.lastCommandId = "clipboard.copySelectedNames.noTargets";
      return;
    }

    try {
      await writeClipboardText(clipboardNameTextForCommandTargets(targets, state.terminal.terminalShellKind));
      state.app.notify("clipboard.namesCopied", { count: targets.length }, "completed", true);
      state.app.lastCommandId = "clipboard.copySelectedNames";
    } catch (error) {
      state.app.notify("clipboard.copyFailedWithError", { error: invokeErrorMessage(error) }, "failed");
      state.app.lastCommandId = "clipboard.copyFailed";
    }
  }

  async function insertActiveSelectionIntoTerminal(): Promise<void> {
    const pane = state.panes.panes[state.panes.activePaneId];
    if (pane.source.kind !== "local") {
      state.app.notify("terminal.insertLocalOnly", undefined, "warning", true);
      state.app.lastCommandId = "terminal.insertActiveSelection.sourceUnsupported";
      return;
    }

    const targets = selectedCommandTargets(pane);
    if (targets.length === 0) {
      state.app.notify("terminal.noLocalPath", undefined, "warning", true);
      state.app.lastCommandId = "terminal.insertActiveSelection.noTargets";
      return;
    }

    try {
      await actions.writeTerminal(clipboardTextForCommandTargets(targets, state.terminal.terminalShellKind));
      state.app.notify("terminal.insertedPaths", { count: targets.length }, "completed", true);
      state.app.lastCommandId = "terminal.insertActiveSelection";
    } catch (error) {
      state.app.statusMessage = error instanceof ShellQuoteError
        ? actions.localizedShellQuoteError(error)
        : state.settings.t("terminal.unavailable", { error: actions.localizedBackendError(error) });
      state.app.lastCommandId = "terminal.insertActiveSelection.failed";
    }
  }

  async function loadExternalCommands(): Promise<void> {
    state.commands.externalCommandsLoading = true;
    state.commands.externalCommandError = "";
    try {
      state.commands.externalCommands = await listExternalCommands(invoke);
      state.commands.externalCommandCursorIndex = clampExternalCommandCursor(state.commands.externalCommandCursorIndex, state.commands.externalCommands.length);
    } catch (error) {
      state.commands.externalCommandError = actions.localizedBackendError(error);
      state.commands.externalCommands = [];
    } finally {
      state.commands.externalCommandsLoading = false;
    }
  }

  async function openExternalCommandDialog(): Promise<void> {
    state.commands.commandDialogOpen = true;
    state.commands.externalCommandCursorIndex = 0;
    state.app.lastCommandId = "command.openCommandList";
    await loadExternalCommands();
  }

  function closeExternalCommandDialog(): void {
    state.commands.commandDialogOpen = false;
    state.commands.externalCommandError = "";
    state.app.lastCommandId = "command.closeCommandList";
    actions.focusActivePaneAfterDialog();
  }

  function moveExternalCommandCursor(delta: number): void {
    if (state.commands.externalCommands.length === 0) return;
    state.commands.externalCommandCursorIndex = clampExternalCommandCursor(state.commands.externalCommandCursorIndex + delta, state.commands.externalCommands.length);
    state.app.lastCommandId = "command.moveCommandCursor";
  }

  async function runFocusedExternalCommand(): Promise<void> {
    const command = state.commands.externalCommands[state.commands.externalCommandCursorIndex];
    if (!command || state.commands.externalCommandsLoading) return;

    const targets = selectedLocalCommandTargets();
    if (targets.length === 0) {
      state.commands.externalCommandError = state.settings.t("externalCommand.localSelectionOnly");
      state.app.lastCommandId = "command.noTargets";
      return;
    }

    let commandLines: string[];
    try {
      commandLines = externalCommandLines(command, targets, externalCommandContext());
    } catch (error) {
      state.commands.externalCommandError = error instanceof ShellQuoteError
        ? actions.localizedShellQuoteError(error)
        : actions.localizedBackendError(error);
      state.app.lastCommandId = "command.quoteFailed";
      return;
    }
    state.commands.commandDialogOpen = false;
    state.commands.externalCommandError = "";
    await actions.focusConsoleAndStart();
    await actions.writeTerminal(`${commandLines.join("\r")}\r`);
    state.app.lastCommandId = "command.runWithSelection";
    if (command.returnFocus) actions.returnFromConsole();
  }

  function selectedCommandTargets(pane: PaneState): CommandTarget[] {
    return selectedCommandTargetsForPane(pane, actions.visibleEntries(pane));
  }

  async function runExternalCommandDialogKeyAction(action: ExternalCommandDialogKeyAction): Promise<void> {
    if (action === "close") {
      closeExternalCommandDialog();
    } else if (action === "moveDown") {
      moveExternalCommandCursor(1);
    } else if (action === "moveUp") {
      moveExternalCommandCursor(-1);
    } else if (action === "run") {
      await runFocusedExternalCommand();
    }
  }

  return {
    markedCommandTargets,
    isWindowsPlatform,
    selectedLocalCommandTargets,
    localMarkedCommandTargets,
    externalCommandContext,
    writeClipboardText,
    copySelectedPathsToClipboard,
    copyCurrentDirectoryToClipboard,
    copySelectedNamesToClipboard,
    insertActiveSelectionIntoTerminal,
    loadExternalCommands,
    openExternalCommandDialog,
    closeExternalCommandDialog,
    moveExternalCommandCursor,
    runFocusedExternalCommand,
    selectedCommandTargets,
    runExternalCommandDialogKeyAction,
  };
}
