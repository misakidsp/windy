import type { TerminalCopyModeKeyAction, TerminalShortcutAction } from "./terminalKeyHandling";

export type TerminalShortcutRunner = {
  enterCopyMode: () => void;
  scrollPage: (delta: -1 | 1) => void;
  scrollLine: (delta: -1 | 1) => void;
  insertActiveSelection: () => Promise<void> | void;
  toggleVisible: () => void;
  toggleFullscreen: () => Promise<void> | void;
  returnFromConsole: () => void;
};

export async function runTerminalShortcutActionWith(
  action: TerminalShortcutAction,
  runner: TerminalShortcutRunner,
): Promise<void> {
  if (action === "copyMode") {
    runner.enterCopyMode();
  } else if (action === "scrollPageUp") {
    runner.scrollPage(-1);
  } else if (action === "scrollPageDown") {
    runner.scrollPage(1);
  } else if (action === "scrollLineUp") {
    runner.scrollLine(-1);
  } else if (action === "scrollLineDown") {
    runner.scrollLine(1);
  } else if (action === "insertActiveSelection") {
    await runner.insertActiveSelection();
  } else if (action === "toggleVisible") {
    runner.toggleVisible();
  } else if (action === "toggleFullscreen") {
    await runner.toggleFullscreen();
  } else if (action === "returnFromConsole") {
    runner.returnFromConsole();
  }
}

export type TerminalCopyModeRunner = {
  cancel: () => void;
  copy: () => Promise<void> | void;
  moveCursor: (rowDelta: number, columnDelta: number) => void;
  pageRows: () => number;
  home: () => void;
  end: () => void;
};

export async function runTerminalCopyModeKeyActionWith(
  action: TerminalCopyModeKeyAction,
  runner: TerminalCopyModeRunner,
): Promise<void> {
  if (action === "cancel") {
    runner.cancel();
  } else if (action === "copy") {
    await runner.copy();
  } else if (action === "left") {
    runner.moveCursor(0, -1);
  } else if (action === "right") {
    runner.moveCursor(0, 1);
  } else if (action === "up") {
    runner.moveCursor(-1, 0);
  } else if (action === "down") {
    runner.moveCursor(1, 0);
  } else if (action === "pageUp") {
    runner.moveCursor(-runner.pageRows(), 0);
  } else if (action === "pageDown") {
    runner.moveCursor(runner.pageRows(), 0);
  } else if (action === "home") {
    runner.home();
  } else if (action === "end") {
    runner.end();
  }
}
