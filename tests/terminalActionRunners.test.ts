import assert from "node:assert/strict";
import {
  runTerminalCopyModeKeyActionWith,
  runTerminalShortcutActionWith,
  type TerminalCopyModeRunner,
  type TerminalShortcutRunner,
} from "../src/routes/terminalActionRunners";

const shortcutCalls: string[] = [];
const shortcutRunner: TerminalShortcutRunner = {
  enterCopyMode: () => {
    shortcutCalls.push("copyMode");
  },
  scrollPage: (delta) => {
    shortcutCalls.push(`scrollPage:${delta}`);
  },
  scrollLine: (delta) => {
    shortcutCalls.push(`scrollLine:${delta}`);
  },
  insertActiveSelection: () => {
    shortcutCalls.push("insertActiveSelection");
  },
  toggleVisible: () => {
    shortcutCalls.push("toggleVisible");
  },
  toggleFullscreen: () => {
    shortcutCalls.push("toggleFullscreen");
  },
  returnFromConsole: () => {
    shortcutCalls.push("returnFromConsole");
  },
};

await runTerminalShortcutActionWith("copyMode", shortcutRunner);
await runTerminalShortcutActionWith("scrollPageUp", shortcutRunner);
await runTerminalShortcutActionWith("scrollPageDown", shortcutRunner);
await runTerminalShortcutActionWith("scrollLineUp", shortcutRunner);
await runTerminalShortcutActionWith("scrollLineDown", shortcutRunner);
await runTerminalShortcutActionWith("insertActiveSelection", shortcutRunner);
await runTerminalShortcutActionWith("toggleVisible", shortcutRunner);
await runTerminalShortcutActionWith("toggleFullscreen", shortcutRunner);
await runTerminalShortcutActionWith("returnFromConsole", shortcutRunner);

assert.deepEqual(shortcutCalls, [
  "copyMode",
  "scrollPage:-1",
  "scrollPage:1",
  "scrollLine:-1",
  "scrollLine:1",
  "insertActiveSelection",
  "toggleVisible",
  "toggleFullscreen",
  "returnFromConsole",
]);

const copyModeCalls: string[] = [];
const copyModeRunner: TerminalCopyModeRunner = {
  cancel: () => {
    copyModeCalls.push("cancel");
  },
  copy: () => {
    copyModeCalls.push("copy");
  },
  moveCursor: (rowDelta, columnDelta) => {
    copyModeCalls.push(`move:${rowDelta}:${columnDelta}`);
  },
  pageRows: () => 24,
  home: () => {
    copyModeCalls.push("home");
  },
  end: () => {
    copyModeCalls.push("end");
  },
};

await runTerminalCopyModeKeyActionWith("cancel", copyModeRunner);
await runTerminalCopyModeKeyActionWith("copy", copyModeRunner);
await runTerminalCopyModeKeyActionWith("left", copyModeRunner);
await runTerminalCopyModeKeyActionWith("right", copyModeRunner);
await runTerminalCopyModeKeyActionWith("up", copyModeRunner);
await runTerminalCopyModeKeyActionWith("down", copyModeRunner);
await runTerminalCopyModeKeyActionWith("pageUp", copyModeRunner);
await runTerminalCopyModeKeyActionWith("pageDown", copyModeRunner);
await runTerminalCopyModeKeyActionWith("home", copyModeRunner);
await runTerminalCopyModeKeyActionWith("end", copyModeRunner);
await runTerminalCopyModeKeyActionWith("consume", copyModeRunner);

assert.deepEqual(copyModeCalls, [
  "cancel",
  "copy",
  "move:0:-1",
  "move:0:1",
  "move:-1:0",
  "move:1:0",
  "move:-24:0",
  "move:24:0",
  "home",
  "end",
]);
