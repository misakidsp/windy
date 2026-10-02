import { invoke } from "@tauri-apps/api/core";
import { tick } from "svelte";
import { invokeErrorMessage } from "../tauriInvoke";
import { createTerminalInstance } from "../terminalFactory";
import { runTerminalCopyModeKeyActionWith, runTerminalShortcutActionWith } from "../terminalActionRunners";
import {
  handleTerminalKeyRepeatState,
  stopTerminalKeyRepeatState,
  terminalCopyModeKeyAction,
  terminalShortcutAction,
  type TerminalShortcutAction,
} from "../terminalKeyHandling";
import { terminalInputForKeyboardEvent } from "../terminalKeys";
import {
  getTerminalShellKind,
  resizeTerminal,
  startLocalTerminal,
  startSftpTerminal,
  stopTerminal,
  writeTerminalInput,
} from "../terminalSideEffects";
import {
  acceptTerminalExit,
  acceptTerminalOutput,
  beginTerminalCopyMode,
  beginTerminalStart,
  completeTerminalStart,
  consumeSuppressedTerminalData as consumeTerminalSuppressedData,
  exitTerminalCopyMode as createExitedTerminalCopyMode,
  failTerminalStart,
  markTerminalStopping,
  moveTerminalCopyCursor as moveTerminalCopyCursorState,
  resetTerminalSession,
  setTerminalCopyCursorColumn,
  suppressTerminalDataEcho,
  terminalCopySelectionRange,
} from "../terminalState";
import type { TerminalExit, TerminalOutput } from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

type Dependencies = Pick<WorkspaceActions,
  | "focusActivePaneAfterDialog"
  | "insertActiveSelectionIntoTerminal"
  | "isWindowsPlatform"
  | "localizedBackendError"
  | "paneConsolePath"
  | "writeClipboardText"
>;

export function createTerminalController(state: Pick<WorkspaceState, "activity" | "app" | "panes" | "settings" | "terminal">, actions: Dependencies) {
  function desiredTerminalSourceKey(): string {
    const source = state.panes.panes[state.panes.activePaneId].source;
    return source.kind === "sftp" ? `sftp:${source.connectionId}` : "local";
  }

  async function stopTerminalSession(): Promise<void> {
    stopTerminalKeyRepeat();
    state.terminal.terminalSession = markTerminalStopping(state.terminal.terminalSession);
    try {
      await stopTerminal(invoke);
    } catch {
      // A failed stop should not strand focus handling on the file panes.
    }
    state.terminal.terminalSession = resetTerminalSession(state.terminal.terminalSession);
  }

  async function focusConsoleAndStart(): Promise<void> {
    state.activity.view = "terminal";
    if (!state.terminal.consoleVisible) state.terminal.consoleVisible = true;
    const activePath = actions.paneConsolePath(state.panes.panes[state.panes.activePaneId]);
    if (activePath) state.terminal.consoleCwd = activePath;
    state.terminal.consoleFocused = true;
    state.app.lastCommandId = "terminal.focus";
    await tick();
    await initializeTerminal();
    state.terminal.terminalFit?.fit();
    state.terminal.terminal?.focus();
    if (state.terminal.terminalSession.starting) {
      for (let retry = 0; retry < 50 && state.terminal.terminalSession.starting; retry += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    const sourceKey = desiredTerminalSourceKey();
    if (state.terminal.terminalSession.started && state.terminal.terminalSession.sourceKey !== sourceKey) {
      await stopTerminalSession();
      state.terminal.terminal?.clear();
    }
    if (!state.terminal.terminalSession.started) await startTerminal();
    await tick();
    state.terminal.terminal?.focus();
  }

  function focusConsole(): void {
    void focusConsoleAndStart();
  }

  function returnFromConsole(): void {
    stopTerminalKeyRepeat();
    state.terminal.terminal?.blur();
    state.terminal.terminalSession = { ...state.terminal.terminalSession, suppressedData: [] };
    state.terminal.terminalFullscreen = false;
    state.terminal.consoleFocused = false;
    state.app.lastCommandId = "terminal.focusPreviousPane";
    actions.focusActivePaneAfterDialog();
  }

  function terminalHasDomFocus(): boolean {
    const activeElement = document.activeElement;
    return !!(state.terminal.terminalElement && activeElement instanceof Node && state.terminal.terminalElement.contains(activeElement));
  }

  function toggleConsoleVisibility(): void {
    state.terminal.consoleVisible = !state.terminal.consoleVisible;
    if (!state.terminal.consoleVisible && state.terminal.consoleFocused) {
      stopTerminalKeyRepeat();
      state.terminal.terminalFullscreen = false;
      state.terminal.consoleFocused = false;
      actions.focusActivePaneAfterDialog();
    }
    if (state.terminal.consoleVisible) {
      void tick().then(() => {
        state.terminal.terminalFit?.fit();
        if (state.terminal.consoleFocused) state.terminal.terminal?.focus();
      });
    }
    state.app.lastCommandId = "terminal.toggleVisible";
  }

  async function toggleTerminalFullscreen(): Promise<void> {
    state.activity.view = "terminal";
    if (!state.terminal.consoleVisible) state.terminal.consoleVisible = true;
    state.terminal.terminalFullscreen = !state.terminal.terminalFullscreen;
    const commandId = state.terminal.terminalFullscreen ? "terminal.fullscreen" : "terminal.fullscreenExit";
    state.app.lastCommandId = commandId;
    await tick();
    await initializeTerminal();
    state.terminal.terminalFit?.fit();
    if (!state.terminal.consoleFocused) {
      await focusConsoleAndStart();
    } else {
      state.terminal.terminal?.focus();
    }
    state.app.lastCommandId = commandId;
  }

  async function startTerminal(): Promise<void> {
    if (!state.terminal.terminalElement || state.terminal.terminalSession.starting) return;
    const source = state.panes.panes[state.panes.activePaneId].source;
    const sourceKey = desiredTerminalSourceKey();
    const cwd = state.terminal.consoleCwd || actions.paneConsolePath(state.panes.panes[state.panes.activePaneId]);
    state.terminal.terminalSession = beginTerminalStart(state.terminal.terminalSession);
    try {
      if (!state.terminal.terminal) await initializeTerminal();
      state.terminal.terminalFit?.fit();
      const size = {
        cols: terminalCols(),
        rows: terminalRows(),
      };
      await resizeTerminal(invoke, size);
      const sessionId =
        source.kind === "sftp"
          ? await startSftpTerminal(invoke, source.connectionId, size)
          : await startLocalTerminal(invoke, cwd, size);
      state.terminal.terminalSession = completeTerminalStart(state.terminal.terminalSession, sessionId, sourceKey);
      state.terminal.terminal?.clear();
      state.app.lastCommandId = source.kind === "sftp" ? "terminal.startSsh" : "terminal.start";
    } catch (error) {
      state.terminal.terminal?.writeln(state.settings.t("terminal.startFailed", { error: actions.localizedBackendError(error) }));
      state.app.lastCommandId = "terminal.startFailed";
    } finally {
      state.terminal.terminalSession = failTerminalStart(state.terminal.terminalSession);
    }
  }

  function appendTerminalBytes(bytes: number[]): void {
    state.terminal.terminal?.write(new Uint8Array(bytes));
  }

  function handleTerminalOutput(output: TerminalOutput): void {
    const result = acceptTerminalOutput(state.terminal.terminalSession, output);
    state.terminal.terminalSession = result.state;
    if (!result.accepted) return;

    appendTerminalBytes(output.bytes);
  }

  function handleTerminalExit(exit: TerminalExit): void {
    const result = acceptTerminalExit(state.terminal.terminalSession, exit);
    state.terminal.terminalSession = result.state;
    if (!result.accepted) return;

    state.terminal.terminal?.writeln("");
    state.terminal.terminal?.writeln(state.settings.t("terminal.shellExited", { code: result.code }));
    if (state.terminal.consoleFocused) returnFromConsole();
    state.app.lastCommandId = "terminal.exit";
  }

  async function writeTerminal(input: string): Promise<void> {
    if (!state.terminal.terminalSession.started) await startTerminal();
    if (!state.terminal.terminalSession.started) return;

    try {
      await writeTerminalInput(invoke, input);
    } catch (error) {
      state.terminal.terminalSession = resetTerminalSession(state.terminal.terminalSession);
      state.terminal.terminal?.writeln(state.settings.t("terminal.unavailable", { error: actions.localizedBackendError(error) }));
      state.app.lastCommandId = "terminal.writeFailed";
    }
  }

  async function writeTerminalFromKeyHandler(input: string, suppressEcho = true): Promise<void> {
    if (suppressEcho) state.terminal.terminalSession = suppressTerminalDataEcho(state.terminal.terminalSession, input);
    await writeTerminal(input);
  }

  function consumeSuppressedTerminalData(data: string): boolean {
    const result = consumeTerminalSuppressedData(state.terminal.terminalSession, data);
    state.terminal.terminalSession = result.state;
    return result.consumed;
  }

  function terminalCols(): number {
    return Math.max(40, state.terminal.terminal?.cols ?? 80);
  }

  function terminalRows(): number {
    return Math.max(6, state.terminal.terminal?.rows ?? 12);
  }

  function updateTerminalCopySelection(): void {
    const range = terminalCopySelectionRange(state.terminal.terminal, state.terminal.terminalCopyMode);
    if (!range) return;
    state.terminal.terminal?.select(range.column, range.row, range.length);
  }

  function ensureTerminalCopyCursorVisible(): void {
    if (!state.terminal.terminal || !state.terminal.terminalCopyMode.cursor) return;
    const buffer = state.terminal.terminal.buffer.active;
    if (state.terminal.terminalCopyMode.cursor.row < buffer.viewportY) {
      state.terminal.terminal.scrollLines(state.terminal.terminalCopyMode.cursor.row - buffer.viewportY);
    } else if (state.terminal.terminalCopyMode.cursor.row >= buffer.viewportY + state.terminal.terminal.rows) {
      state.terminal.terminal.scrollLines(state.terminal.terminalCopyMode.cursor.row - (buffer.viewportY + state.terminal.terminal.rows) + 1);
    }
  }

  function enterTerminalCopyMode(): void {
    if (!state.terminal.terminal) return;
    stopTerminalKeyRepeat();
    state.terminal.terminalCopyMode = beginTerminalCopyMode(state.terminal.terminal);
    state.terminal.terminal.clearSelection();
    updateTerminalCopySelection();
    state.app.notify("terminal.copyModeStatus", undefined, "completed", false);
    state.app.lastCommandId = "terminal.copyMode";
  }

  function exitTerminalCopyMode(clearSelection = false): void {
    state.terminal.terminalCopyMode = createExitedTerminalCopyMode();
    if (clearSelection) state.terminal.terminal?.clearSelection();
  }

  function moveTerminalCopyCursor(rowDelta: number, columnDelta: number): void {
    if (!state.terminal.terminalCopyMode.active || !state.terminal.terminalCopyMode.cursor) return;
    state.terminal.terminalCopyMode = moveTerminalCopyCursorState(state.terminal.terminal, state.terminal.terminalCopyMode, rowDelta, columnDelta);
    ensureTerminalCopyCursorVisible();
    updateTerminalCopySelection();
    state.app.lastCommandId = "terminal.copyModeMove";
  }

  async function copyTerminalSelection(): Promise<void> {
    if (!state.terminal.terminal) return;
    const text = state.terminal.terminal.getSelection();
    if (!text) {
      state.app.notify("terminal.copyModeNoSelection", undefined, "completed", true);
      state.app.lastCommandId = "terminal.copyModeEmpty";
      return;
    }

    try {
      await actions.writeClipboardText(text);
      state.app.notify("terminal.copyModeCopied", undefined, "completed", true);
      state.app.lastCommandId = "terminal.copyModeCopy";
      exitTerminalCopyMode();
    } catch (error) {
      state.app.notify("terminal.copyModeCopyFailedWithError", { error: invokeErrorMessage(error) }, "failed", true);
      state.app.lastCommandId = "terminal.copyModeCopyFailed";
    }
  }

  function scrollTerminalByPage(delta: -1 | 1): void {
    state.terminal.terminal?.scrollPages(delta);
    state.app.lastCommandId = delta < 0 ? "terminal.scrollPageUp" : "terminal.scrollPageDown";
  }

  function scrollTerminalByLine(delta: -1 | 1): void {
    state.terminal.terminal?.scrollLines(delta);
    state.app.lastCommandId = delta < 0 ? "terminal.scrollLineUp" : "terminal.scrollLineDown";
  }

  function stopTerminalKeyRepeat(code?: string): void {
    state.terminal.terminalRepeatState = stopTerminalKeyRepeatState(state.terminal.terminalRepeatState, code);
  }

  function handleTerminalKeyRepeat(event: KeyboardEvent): boolean {
    const result = handleTerminalKeyRepeatState(event, state.terminal.terminalRepeatState, state.terminal.consoleFocused && !state.terminal.terminalCopyMode.active, (input, suppressEcho) => {
      void writeTerminalFromKeyHandler(input, suppressEcho);
    });
    state.terminal.terminalRepeatState = result.state;
    return result.handled;
  }

  function handleTerminalCopyModeKeydown(event: KeyboardEvent): boolean {
    if (!state.terminal.terminalCopyMode.active) return false;
    const action = terminalCopyModeKeyAction(event);
    if (!action) return false;

    void runTerminalCopyModeKeyActionWith(action, {
      cancel() {
        exitTerminalCopyMode(true);
        state.app.notify("terminal.copyModeCancelled", undefined, "completed", false);
        state.app.lastCommandId = "terminal.copyModeCancel";
      },
      copy: copyTerminalSelection,
      moveCursor: moveTerminalCopyCursor,
      pageRows: terminalRows,
      home() {
        if (state.terminal.terminalCopyMode.cursor) {
          state.terminal.terminalCopyMode = setTerminalCopyCursorColumn(state.terminal.terminal, state.terminal.terminalCopyMode, 0);
          updateTerminalCopySelection();
          state.app.lastCommandId = "terminal.copyModeHome";
        }
      },
      end() {
        if (state.terminal.terminalCopyMode.cursor && state.terminal.terminal) {
          state.terminal.terminalCopyMode = setTerminalCopyCursorColumn(state.terminal.terminal, state.terminal.terminalCopyMode, Math.max(0, state.terminal.terminal.cols - 1));
          updateTerminalCopySelection();
          state.app.lastCommandId = "terminal.copyModeEnd";
        }
      },
    });
    return true;
  }

  async function runTerminalShortcutAction(action: TerminalShortcutAction): Promise<void> {
    await runTerminalShortcutActionWith(action, {
      enterCopyMode: enterTerminalCopyMode,
      scrollPage: scrollTerminalByPage,
      scrollLine: scrollTerminalByLine,
      insertActiveSelection: actions.insertActiveSelectionIntoTerminal,
      toggleVisible: toggleConsoleVisibility,
      toggleFullscreen: toggleTerminalFullscreen,
      returnFromConsole,
    });
  }

  async function handleConsoleFallbackKeydown(event: KeyboardEvent): Promise<void> {
    state.app.lastKey = event.key;

    if (handleTerminalCopyModeKeydown(event)) {
      event.preventDefault();
      return;
    }

    const shortcutAction = terminalShortcutAction(event, state.settings.keybindSettings);
    if (shortcutAction) {
      event.preventDefault();
      await runTerminalShortcutAction(shortcutAction);
      return;
    }

    state.terminal.terminal?.focus();
    const input = terminalInputForKeyboardEvent(event);
    if (input !== null) {
      event.preventDefault();
      await writeTerminalFromKeyHandler(input, false);
    }
  }

  async function initializeTerminal(): Promise<void> {
    if (!state.terminal.terminalElement || state.terminal.terminal) return;

    const created = await createTerminalInstance({
      element: state.terminal.terminalElement,
      onData(data) {
        if (consumeSuppressedTerminalData(data)) return;
        if (state.terminal.consoleFocused) void writeTerminal(data);
      },
      customKeyHandler: handleXtermKeyEvent,
      appearance: state.settings.appearanceSettings,
      initialPrompt: state.settings.t("terminal.initialPrompt"),
    });
    state.terminal.terminal = created.terminal;
    state.terminal.terminalFit = created.fit;
  }

  function handleXtermKeyEvent(event: KeyboardEvent): boolean {
    if (!state.terminal.consoleFocused) {
      if (event.type === "keydown") actions.focusActivePaneAfterDialog();
      return false;
    }

    if (state.terminal.consoleFocused && handleTerminalCopyModeKeydown(event)) {
      return false;
    }

    const shortcutAction = terminalShortcutAction(event, state.settings.keybindSettings);
    if (shortcutAction) {
      void runTerminalShortcutAction(shortcutAction);
      return false;
    }

    if (handleTerminalKeyRepeat(event)) {
      return false;
    }

    return true;
  }

  async function loadTerminalShellKind(): Promise<void> {
    try {
      state.terminal.terminalShellKind = await getTerminalShellKind(invoke);
    } catch {
      state.terminal.terminalShellKind = actions.isWindowsPlatform() ? "unknown" : "posix";
    }
  }

  return {
    desiredTerminalSourceKey,
    stopTerminalSession,
    focusConsoleAndStart,
    focusConsole,
    returnFromConsole,
    terminalHasDomFocus,
    toggleConsoleVisibility,
    toggleTerminalFullscreen,
    startTerminal,
    appendTerminalBytes,
    handleTerminalOutput,
    handleTerminalExit,
    writeTerminal,
    writeTerminalFromKeyHandler,
    consumeSuppressedTerminalData,
    terminalCols,
    terminalRows,
    updateTerminalCopySelection,
    ensureTerminalCopyCursorVisible,
    enterTerminalCopyMode,
    exitTerminalCopyMode,
    moveTerminalCopyCursor,
    copyTerminalSelection,
    scrollTerminalByPage,
    scrollTerminalByLine,
    stopTerminalKeyRepeat,
    handleTerminalKeyRepeat,
    handleTerminalCopyModeKeydown,
    runTerminalShortcutAction,
    handleConsoleFallbackKeydown,
    initializeTerminal,
    handleXtermKeyEvent,
    loadTerminalShellKind,
  };
}
