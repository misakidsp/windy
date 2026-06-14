import { defaultKeybindSettings } from "./keyboardModel";
import type { KeybindSettings } from "./types";

export type KeyHelpItem = {
  commandId: string;
  label: string;
  keys: string[];
  locked: boolean;
};

export type KeyHelpGroup = {
  id: string;
  title: string;
  items: KeyHelpItem[];
};

const commandLabels: Record<string, string> = {
  "pane.moveUp": "Move cursor up",
  "pane.moveDown": "Move cursor down",
  "pane.leftOrParent": "Left pane: parent / Right pane: focus left",
  "pane.rightOrParent": "Left pane: focus right / Right pane: parent",
  "pane.moveUpAlternative": "Move cursor up",
  "pane.moveDownAlternative": "Move cursor down",
  "pane.leftAlternative": "Left / parent alternative",
  "pane.rightAlternative": "Right / parent alternative",
  "pane.focusTerminal": "Focus terminal",
  "pane.goRoot": "Go to filesystem root",
  "pane.goHome": "Go to home directory",
  "pane.openOtherPathHere": "Open other pane path here",
  "pane.openCurrentPathInOther": "Open current path in other pane",
  "pane.focusNextByTab": "Focus next pane",
  "pane.focusPreviousByTab": "Focus previous pane",
  "terminal.focusPreviousPane": "Return from terminal",
  "terminal.toggleVisible": "Show/hide terminal",
  "terminal.toggleFullscreen": "Toggle terminal fullscreen",
  "terminal.copyMode": "Terminal copy mode",
  "terminal.insertActiveSelection": "Insert selected file path(s)",
  "terminal.scrollPageUp": "Scroll terminal one page up",
  "terminal.scrollPageDown": "Scroll terminal one page down",
  "terminal.scrollLineUp": "Scroll terminal one line up",
  "terminal.scrollLineDown": "Scroll terminal one line down",
  "terminal.break": "Send break to terminal",
  "location.openManager": "Open Location Manager",
  "search.openDialog": "Open search",
  "filter.startInline": "Start quick filter",
  "help.toggle": "Show key help",
  "app.refresh": "Refresh active pane",
  "app.undo": "Undo last supported operation",
  "app.redo": "Redo last undone operation",
  "selection.selectAll": "Select all visible entries",
  "selection.toggleFocused": "Toggle focused selection",
  "selection.extendUp": "Extend selection up",
  "selection.extendDown": "Extend selection down",
  "file.copy": "Copy to other pane",
  "file.move": "Move to other pane",
  "file.edit": "Edit focused file",
  "file.rename": "Rename focused entry",
  "file.delete": "Delete / move to Trash",
  "file.deletePermanently": "Delete permanently",
  "file.mkdir": "Create directory",
  "file.createFile": "Create empty file",
  "file.properties": "Show properties",
  "file.chmod": "Change permissions/attributes",
  "archive.unpack": "Unpack archive",
  "archive.create": "Create archive",
  "view.cycleSort": "Cycle sort mode",
  "view.toggleHidden": "Show/hide hidden files",
  "diff.openPaneDiff": "Compare left/right panes",
  "diff.openDetailedPaneDiff": "Compare local panes recursively with MD5",
  "git.openStatus": "Show Git changed files",
  "externalCommand.open": "Open external command list",
  "clipboard.copyPaths": "Copy selected path(s)",
  "clipboard.copyCurrentDirectory": "Copy current directory",
  "clipboard.copyNames": "Copy selected name(s)",
  "dialog.confirm": "Confirm dialog",
  "dialog.cancel": "Cancel dialog",
  "entry.open": "Open directory / viewer",
  "entry.openDefaultApp": "Open with OS default app",
  "entry.goParent": "Go to parent directory",
  "cursor.goFirst": "Go to first entry",
  "cursor.goLast": "Go to last entry",
  "cursor.pageUp": "Move cursor one page up",
  "cursor.pageDown": "Move cursor one page down",
};

const groupOrder = ["pane", "entry", "file", "view", "filter", "diff", "git", "clipboard", "terminal", "location", "search", "external", "dialog", "help", "app", "archive", "selection", "cursor"];

const groupTitles: Record<string, string> = {
  pane: "Pane",
  entry: "Entry",
  file: "File",
  view: "View",
  filter: "Filter",
  diff: "Diff",
  git: "Git",
  clipboard: "Clipboard",
  terminal: "Terminal",
  location: "Location",
  search: "Search",
  external: "Command",
  dialog: "Dialog",
  help: "Help",
  app: "App",
  archive: "Archive",
  selection: "Selection",
  cursor: "Cursor",
};

const implicitHelpBindings: Record<string, string[]> = {};

function commandGroup(commandId: string): string {
  return commandId.split(".")[0] ?? "app";
}

function displayKey(key: string): string {
  return key.toLowerCase();
}

export function keyHelpGroups(settings: KeybindSettings = defaultKeybindSettings): KeyHelpGroup[] {
  const grouped = new Map<string, KeyHelpItem[]>();
  const pushItem = (commandId: string, keys: string[], locked: boolean) => {
    if (keys.length === 0) return;
    const group = commandGroup(commandId);
    const items = grouped.get(group) ?? [];
    items.push({
      commandId,
      label: commandLabels[commandId] ?? commandId,
      keys: keys.map(displayKey),
      locked,
    });
    grouped.set(group, items);
  };

  for (const [commandId, keys] of Object.entries(implicitHelpBindings)) pushItem(commandId, keys, true);
  for (const [commandId, keys] of Object.entries({ ...defaultKeybindSettings.lockedBindings, ...settings.lockedBindings })) {
    pushItem(commandId, keys, true);
  }
  for (const [commandId, keys] of Object.entries({ ...defaultKeybindSettings.bindings, ...settings.bindings })) {
    pushItem(commandId, keys, false);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => groupOrder.indexOf(a) - groupOrder.indexOf(b))
    .map(([id, items]) => ({
      id,
      title: groupTitles[id] ?? id,
      items: items.sort((a, b) => a.commandId.localeCompare(b.commandId)),
    }));
}
