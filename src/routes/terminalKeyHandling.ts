import { terminalRepeatDelayMs, terminalRepeatIntervalMs } from "./constants";
import { commandMatchesSingleKey, defaultKeybindSettings, type KeyLike } from "./keyboardModel";
import { terminalInputForKeyboardEvent } from "./terminalKeys";
import type { KeybindSettings, TerminalRepeatState } from "./types";

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

export type TerminalCopyModeKeyAction =
  | "cancel"
  | "copy"
  | "left"
  | "right"
  | "up"
  | "down"
  | "pageUp"
  | "pageDown"
  | "home"
  | "end"
  | "consume";

export type TerminalRepeatResult = {
  state: TerminalRepeatState | null;
  handled: boolean;
};

type TerminalShortcutKeyLike = KeyLike & Pick<KeyboardEvent, "type">;

export const terminalKeybindingCommandIds = [
  "terminal.copyMode",
  "terminal.scrollPageUp",
  "terminal.scrollPageDown",
  "terminal.scrollLineUp",
  "terminal.scrollLineDown",
  "terminal.insertActiveSelection",
  "terminal.toggleVisible",
  "terminal.toggleFullscreen",
  "terminal.focusPreviousPane",
];

export function terminalShortcutAction(
  event: TerminalShortcutKeyLike,
  settings: KeybindSettings = defaultKeybindSettings,
): TerminalShortcutAction | null {
  if (event.type !== "keydown") return null;

  if (commandMatchesSingleKey(settings, "terminal.copyMode", event)) return "copyMode";
  if (commandMatchesSingleKey(settings, "terminal.scrollPageUp", event)) return "scrollPageUp";
  if (commandMatchesSingleKey(settings, "terminal.scrollPageDown", event)) return "scrollPageDown";
  if (commandMatchesSingleKey(settings, "terminal.scrollLineUp", event)) return "scrollLineUp";
  if (commandMatchesSingleKey(settings, "terminal.scrollLineDown", event)) return "scrollLineDown";
  if (commandMatchesSingleKey(settings, "terminal.insertActiveSelection", event)) return "insertActiveSelection";
  if (commandMatchesSingleKey(settings, "terminal.toggleVisible", event)) return "toggleVisible";
  if (commandMatchesSingleKey(settings, "terminal.toggleFullscreen", event)) return "toggleFullscreen";
  if (commandMatchesSingleKey(settings, "terminal.focusPreviousPane", event)) return "returnFromConsole";

  return null;
}

export function terminalCopyModeKeyAction(event: Pick<KeyboardEvent, "key" | "type">): TerminalCopyModeKeyAction | null {
  if (event.type !== "keydown") return null;
  if (event.key === "Escape") return "cancel";
  if (event.key === "Enter") return "copy";
  if (event.key === "ArrowLeft" || event.key === "h") return "left";
  if (event.key === "ArrowRight" || event.key === "l") return "right";
  if (event.key === "ArrowUp" || event.key === "k") return "up";
  if (event.key === "ArrowDown" || event.key === "j") return "down";
  if (event.key === "PageUp") return "pageUp";
  if (event.key === "PageDown") return "pageDown";
  if (event.key === "Home") return "home";
  if (event.key === "End") return "end";
  return "consume";
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
