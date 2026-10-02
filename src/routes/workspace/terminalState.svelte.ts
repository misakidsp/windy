import { type XtermFitAddon, type XtermTerminal } from "../terminalFactory";
import { type TerminalShellKind } from "../terminalSideEffects";
import {
  createTerminalCopyModeState,
  createTerminalSessionState,
  type TerminalCopyModeState,
  type TerminalSessionState,
} from "../terminalState";
import type { TerminalRepeatState } from "../types";

export function createTerminalState() {
  let consoleVisible = $state.raw(true);
  let consoleFocused = $state.raw(false);
  let consoleCwd = $state.raw("");
  let terminalShellKind: TerminalShellKind = $state.raw("unknown");
  let terminalFullscreen = $state.raw(false);
  let terminalElement: HTMLElement | null = $state.raw(null);
  let terminal: XtermTerminal | null = $state.raw(null);
  let terminalFit: XtermFitAddon | null = $state.raw(null);
  let terminalSession: TerminalSessionState = $state.raw(createTerminalSessionState());
  let terminalCopyMode: TerminalCopyModeState = $state.raw(createTerminalCopyModeState());
  let terminalRepeatState: TerminalRepeatState | null = $state.raw(null);

  return {
    get consoleVisible() { return consoleVisible; },
    set consoleVisible(value) { consoleVisible = value; },
    get consoleFocused() { return consoleFocused; },
    set consoleFocused(value) { consoleFocused = value; },
    get consoleCwd() { return consoleCwd; },
    set consoleCwd(value) { consoleCwd = value; },
    get terminalShellKind() { return terminalShellKind; },
    set terminalShellKind(value: TerminalShellKind) { terminalShellKind = value; },
    get terminalFullscreen() { return terminalFullscreen; },
    set terminalFullscreen(value) { terminalFullscreen = value; },
    get terminalElement() { return terminalElement; },
    set terminalElement(value: HTMLElement | null) { terminalElement = value; },
    get terminal() { return terminal; },
    set terminal(value: XtermTerminal | null) { terminal = value; },
    get terminalFit() { return terminalFit; },
    set terminalFit(value: XtermFitAddon | null) { terminalFit = value; },
    get terminalSession() { return terminalSession; },
    set terminalSession(value: TerminalSessionState) { terminalSession = value; },
    get terminalCopyMode() { return terminalCopyMode; },
    set terminalCopyMode(value: TerminalCopyModeState) { terminalCopyMode = value; },
    get terminalRepeatState() { return terminalRepeatState; },
    set terminalRepeatState(value: TerminalRepeatState | null) { terminalRepeatState = value; },
  };
}
