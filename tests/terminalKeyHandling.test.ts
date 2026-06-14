import assert from "node:assert/strict";
import { defaultKeybindSettings, type KeyLike } from "../src/routes/keyboardModel";
import { terminalCopyModeKeyAction, terminalShortcutAction } from "../src/routes/terminalKeyHandling";

type TerminalShortcutKey = KeyLike & { type: string };

function key(partial: Partial<TerminalShortcutKey> & Pick<TerminalShortcutKey, "key">): TerminalShortcutKey {
  return {
    type: partial.type ?? "keydown",
    key: partial.key,
    code: partial.code ?? "",
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    altKey: partial.altKey ?? false,
    shiftKey: partial.shiftKey ?? false,
  };
}

assert.equal(terminalShortcutAction(key({ key: "x", ctrlKey: true })), "returnFromConsole");
assert.equal(terminalShortcutAction(key({ key: "x", ctrlKey: true, shiftKey: true })), "toggleVisible");
assert.equal(terminalShortcutAction(key({ key: "ArrowUp", ctrlKey: true, shiftKey: true })), "scrollLineUp");
assert.equal(terminalShortcutAction(key({ key: "PageDown", shiftKey: true })), "scrollPageDown");
assert.equal(terminalShortcutAction(key({ key: "x", ctrlKey: true, type: "keyup" })), null);

const remappedSettings = {
  ...defaultKeybindSettings,
  bindings: {
    ...defaultKeybindSettings.bindings,
    "terminal.focusPreviousPane": ["ctrl+q"],
  },
};

assert.equal(terminalShortcutAction(key({ key: "x", ctrlKey: true }), remappedSettings), null);
assert.equal(terminalShortcutAction(key({ key: "q", ctrlKey: true }), remappedSettings), "returnFromConsole");

assert.equal(terminalCopyModeKeyAction({ type: "keydown", key: "Escape" }), "cancel");
assert.equal(terminalCopyModeKeyAction({ type: "keydown", key: "Enter" }), "copy");
assert.equal(terminalCopyModeKeyAction({ type: "keydown", key: "h" }), "left");
assert.equal(terminalCopyModeKeyAction({ type: "keydown", key: "ArrowRight" }), "right");
assert.equal(terminalCopyModeKeyAction({ type: "keydown", key: "PageUp" }), "pageUp");
assert.equal(terminalCopyModeKeyAction({ type: "keyup", key: "Escape" }), null);
assert.equal(terminalCopyModeKeyAction({ type: "keydown", key: "a" }), "consume");
