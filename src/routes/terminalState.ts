import type { TerminalCopyPosition, TerminalExit, TerminalOutput } from "./types";
import type { XtermTerminal } from "./terminalFactory";

export type TerminalSessionState = {
  started: boolean;
  starting: boolean;
  sessionId: number | null;
  ignoredExitSessionIds: Set<number>;
  sourceKey: string;
  suppressedData: string[];
};

export type TerminalCopyModeState = {
  active: boolean;
  anchor: TerminalCopyPosition | null;
  cursor: TerminalCopyPosition | null;
};

export type TerminalSelectionRange = {
  column: number;
  row: number;
  length: number;
};

export function createTerminalSessionState(): TerminalSessionState {
  return {
    started: false,
    starting: false,
    sessionId: null,
    ignoredExitSessionIds: new Set(),
    sourceKey: "",
    suppressedData: [],
  };
}

export function createTerminalCopyModeState(): TerminalCopyModeState {
  return {
    active: false,
    anchor: null,
    cursor: null,
  };
}

export function beginTerminalStart(state: TerminalSessionState): TerminalSessionState {
  return { ...state, starting: true, started: false };
}

export function completeTerminalStart(
  state: TerminalSessionState,
  sessionId: number,
  sourceKey: string,
): TerminalSessionState {
  return {
    ...state,
    sessionId,
    started: true,
    starting: false,
    sourceKey,
  };
}

export function failTerminalStart(state: TerminalSessionState): TerminalSessionState {
  return { ...state, starting: false };
}

export function resetTerminalSession(state: TerminalSessionState): TerminalSessionState {
  return {
    ...state,
    started: false,
    starting: false,
    sessionId: null,
    sourceKey: "",
    suppressedData: [],
  };
}

export function markTerminalStopping(state: TerminalSessionState): TerminalSessionState {
  if (state.sessionId === null) return state;
  return {
    ...state,
    ignoredExitSessionIds: new Set([...state.ignoredExitSessionIds, state.sessionId]),
  };
}

export function acceptTerminalOutput(
  state: TerminalSessionState,
  output: TerminalOutput,
): { state: TerminalSessionState; accepted: boolean } {
  if (state.sessionId === null) {
    return { state: { ...state, sessionId: output.sessionId }, accepted: true };
  }
  return { state, accepted: state.sessionId === output.sessionId };
}

export function acceptTerminalExit(
  state: TerminalSessionState,
  exit: TerminalExit,
): { state: TerminalSessionState; accepted: boolean; ignored: boolean; code: string } {
  if (state.ignoredExitSessionIds.has(exit.sessionId)) {
    return {
      state: {
        ...state,
        ignoredExitSessionIds: new Set([...state.ignoredExitSessionIds].filter((id) => id !== exit.sessionId)),
      },
      accepted: false,
      ignored: true,
      code: "",
    };
  }

  if (state.sessionId === null || state.sessionId !== exit.sessionId) {
    return { state, accepted: false, ignored: false, code: "" };
  }

  return {
    state: resetTerminalSession(state),
    accepted: true,
    ignored: false,
    code: exit.exitCode === null ? "unknown" : String(exit.exitCode),
  };
}

export function suppressTerminalDataEcho(state: TerminalSessionState, input: string): TerminalSessionState {
  return { ...state, suppressedData: [...state.suppressedData.slice(-16), input] };
}

export function consumeSuppressedTerminalData(
  state: TerminalSessionState,
  data: string,
): { state: TerminalSessionState; consumed: boolean } {
  const index = state.suppressedData.indexOf(data);
  if (index === -1) return { state, consumed: false };
  return {
    state: {
      ...state,
      suppressedData: [...state.suppressedData.slice(0, index), ...state.suppressedData.slice(index + 1)],
    },
    consumed: true,
  };
}

export function terminalCopyStartPosition(terminal: XtermTerminal | null): TerminalCopyPosition {
  if (!terminal) return { row: 0, column: 0 };
  const buffer = terminal.buffer.active;
  const row = Math.max(0, Math.min(buffer.length - 1, buffer.viewportY + terminal.rows - 1));
  return { row, column: 0 };
}

export function beginTerminalCopyMode(terminal: XtermTerminal | null): TerminalCopyModeState {
  const position = terminalCopyStartPosition(terminal);
  return {
    active: true,
    anchor: position,
    cursor: position,
  };
}

export function exitTerminalCopyMode(): TerminalCopyModeState {
  return createTerminalCopyModeState();
}

export function clampTerminalCopyPosition(
  terminal: XtermTerminal | null,
  position: TerminalCopyPosition,
): TerminalCopyPosition {
  if (!terminal) return { row: 0, column: 0 };
  const maxRow = Math.max(0, terminal.buffer.active.length - 1);
  const maxColumn = Math.max(0, terminal.cols - 1);
  return {
    row: Math.min(Math.max(position.row, 0), maxRow),
    column: Math.min(Math.max(position.column, 0), maxColumn),
  };
}

export function moveTerminalCopyCursor(
  terminal: XtermTerminal | null,
  state: TerminalCopyModeState,
  rowDelta: number,
  columnDelta: number,
): TerminalCopyModeState {
  if (!state.active || !state.cursor) return state;
  return {
    ...state,
    cursor: clampTerminalCopyPosition(terminal, {
      row: state.cursor.row + rowDelta,
      column: state.cursor.column + columnDelta,
    }),
  };
}

export function setTerminalCopyCursorColumn(
  terminal: XtermTerminal | null,
  state: TerminalCopyModeState,
  column: number,
): TerminalCopyModeState {
  if (!state.active || !state.cursor) return state;
  return {
    ...state,
    cursor: clampTerminalCopyPosition(terminal, { ...state.cursor, column }),
  };
}

export function terminalCopySelectionRange(
  terminal: XtermTerminal | null,
  state: TerminalCopyModeState,
): TerminalSelectionRange | null {
  if (!terminal || !state.anchor || !state.cursor) return null;
  const cols = Math.max(40, terminal.cols ?? 80);
  const anchorOffset = state.anchor.row * cols + state.anchor.column;
  const cursorOffset = state.cursor.row * cols + state.cursor.column;
  const startOffset = Math.min(anchorOffset, cursorOffset);
  const endOffset = Math.max(anchorOffset, cursorOffset);
  return {
    column: startOffset % terminal.cols,
    row: Math.floor(startOffset / terminal.cols),
    length: endOffset - startOffset + 1,
  };
}
