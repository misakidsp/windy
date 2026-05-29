import { terminalRepeatDelayMs, terminalRepeatIntervalMs } from "./constants";
import { terminalInputForKeyboardEvent } from "./terminalKeys";
import type { TerminalRepeatState } from "./types";

export type TerminalShortcutAction =
  | "copyMode"
  | "scrollPageUp"
  | "scrollPageDown"
  | "scrollLineUp"
  | "scrollLineDown"
  | "insertActiveSelection"
  | "toggleVisible"
  | "toggleFullscreen"
  | "returnFromConsole";

export type TerminalRepeatResult = {
  state: TerminalRepeatState | null;
  handled: boolean;
};

export function terminalShortcutAction(event: KeyboardEvent): TerminalShortcutAction | null {
  if (event.type !== "keydown") return null;

  if (event.ctrlKey && event.shiftKey && (event.key.toLowerCase() === "c" || event.code === "KeyC")) {
    return "copyMode";
  }
  if (event.shiftKey && event.key === "PageUp") return "scrollPageUp";
  if (event.shiftKey && event.key === "PageDown") return "scrollPageDown";
  if (event.ctrlKey && event.shiftKey && event.key === "ArrowUp") return "scrollLineUp";
  if (event.ctrlKey && event.shiftKey && event.key === "ArrowDown") return "scrollLineDown";
  if (event.ctrlKey && event.shiftKey && (event.key.toLowerCase() === "y" || event.code === "KeyY")) {
    return "insertActiveSelection";
  }
  if (event.ctrlKey && event.shiftKey && (event.key.toLowerCase() === "x" || event.code === "KeyX")) {
    return "toggleVisible";
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key.toLowerCase() === "f" || event.code === "KeyF")) {
    return "toggleFullscreen";
  }
  if (event.ctrlKey && !event.shiftKey && (event.key.toLowerCase() === "x" || event.code === "KeyX")) {
    return "returnFromConsole";
  }

  return null;
}

export function stopTerminalKeyRepeatState(
  state: TerminalRepeatState | null,
  code?: string,
): TerminalRepeatState | null {
  if (!state) return null;
  if (code && state.code !== code) return state;

  if (state.delayTimer !== null) window.clearTimeout(state.delayTimer);
  if (state.intervalTimer !== null) window.clearInterval(state.intervalTimer);
  return null;
}

export function handleTerminalKeyRepeatState(
  event: KeyboardEvent,
  state: TerminalRepeatState | null,
  enabled: boolean,
  writeInput: (input: string, suppressEcho?: boolean) => void,
): TerminalRepeatResult {
  if (!enabled) {
    return { state: stopTerminalKeyRepeatState(state), handled: false };
  }

  if (event.type === "keyup") {
    return { state: stopTerminalKeyRepeatState(state, event.code), handled: true };
  }

  const input = terminalInputForKeyboardEvent(event);
  if (input === null) {
    const nextState = event.type === "keydown" && !event.repeat ? stopTerminalKeyRepeatState(state) : state;
    return { state: nextState, handled: false };
  }

  if (event.repeat) {
    if (!state) writeInput(input);
    return { state, handled: true };
  }

  stopTerminalKeyRepeatState(state);
  writeInput(input);

  const repeatState: TerminalRepeatState = {
    code: event.code || event.key,
    input,
    delayTimer: null,
    intervalTimer: null,
  };
  repeatState.delayTimer = window.setTimeout(() => {
    writeInput(repeatState.input, false);
    repeatState.intervalTimer = window.setInterval(() => {
      writeInput(repeatState.input, false);
    }, terminalRepeatIntervalMs);
  }, terminalRepeatDelayMs);

  return { state: repeatState, handled: false };
}
