import type { FileOperationKind, KeybindSettings, PrefixKey } from "./types";
import keybindingDefaults from "./keybindingDefaults.json" with { type: "json" };

export type KeyLike = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

export type PrefixKeyAction =
  | { type: "cancel" }
  | { type: "goFirst" }
  | { type: "goLast" }
  | { type: "mkdir" }
  | { type: "createFile" }
  | { type: "createArchive" }
  | { type: "openCommandDialog" }
  | { type: "openPaneDiff" }
  | { type: "openDetailedPaneDiff" }
  | { type: "openGitStatus" }
  | { type: "copySelectedPaths" }
  | { type: "copyCurrentDirectory" }
  | { type: "copySelectedNames" }
  | { type: "noMatch"; prefix: PrefixKey; key: string };

export type PaneKeyAction =
  | { type: "toggleTerminalFullscreen" }
  | { type: "toggleConsoleVisibility" }
  | { type: "openSearchDialog" }
  | { type: "startQuickFilter" }
  | { type: "toggleKeyHelp" }
  | { type: "undoLastOperation" }
  | { type: "redoLastOperation" }
  | { type: "focusConsole" }
  | { type: "focusOtherByTab"; reverse: boolean }
  | { type: "goRoot" }
  | { type: "goHome" }
  | { type: "openOtherPanePathHere" }
  | { type: "openCurrentPathInOtherPane" }
  | { type: "clearQuickFilter" }
  | { type: "closeOperationPreview" }
  | { type: "extendSelection"; delta: -1 | 1 }
  | { type: "moveCursor"; delta: -1 | 1 }
  | { type: "moveCursorByPage"; direction: -1 | 1 }
  | { type: "goFirst" }
  | { type: "goLast" }
  | { type: "horizontalRight" }
  | { type: "horizontalLeft" }
  | { type: "goParent" }
  | { type: "openFocusedWithDefaultApp" }
  | { type: "editFocused" }
  | { type: "openFocused" }
  | { type: "openProperties" }
  | { type: "toggleFocusedSelection" }
  | { type: "selectAllVisible" }
  | { type: "refreshActivePane" }
  | { type: "openLocationManager" }
  | { type: "startPrefix"; prefix: PrefixKey }
  | { type: "openExternalCommandDialog" }
  | { type: "cycleSortMode" }
  | { type: "toggleHiddenFiles" }
  | { type: "delete"; permanent: boolean }
  | { type: "operation"; kind: FileOperationKind };

export type PaneKeyContext = {
  hasQuickFilterQuery: boolean;
  hasOperationJob: boolean;
};

export const defaultKeybindSettings: KeybindSettings = keybindingDefaults;

const commandActions: Record<string, PaneKeyAction | ((event: KeyLike) => PaneKeyAction)> = {
  "terminal.toggleFullscreen": { type: "toggleTerminalFullscreen" },
  "terminal.toggleVisible": { type: "toggleConsoleVisibility" },
  "search.openDialog": { type: "openSearchDialog" },
  "filter.startInline": { type: "startQuickFilter" },
  "help.toggle": { type: "toggleKeyHelp" },
  "app.undo": { type: "undoLastOperation" },
  "app.redo": { type: "redoLastOperation" },
  "pane.focusNextByTab": { type: "focusOtherByTab", reverse: false },
  "pane.focusPreviousByTab": { type: "focusOtherByTab", reverse: true },
  "pane.focusTerminal": { type: "focusConsole" },
  "pane.goRoot": { type: "goRoot" },
  "pane.goHome": { type: "goHome" },
  "pane.openOtherPathHere": { type: "openOtherPanePathHere" },
  "pane.openCurrentPathInOther": { type: "openCurrentPathInOtherPane" },
  "pane.moveUpAlternative": { type: "moveCursor", delta: -1 },
  "pane.moveDownAlternative": { type: "moveCursor", delta: 1 },
  "pane.moveUp": { type: "moveCursor", delta: -1 },
  "pane.moveDown": { type: "moveCursor", delta: 1 },
  "pane.leftAlternative": { type: "horizontalLeft" },
  "pane.rightAlternative": { type: "horizontalRight" },
  "pane.leftOrParent": { type: "horizontalLeft" },
  "pane.rightOrParent": { type: "horizontalRight" },
  "entry.openDefaultApp": { type: "openFocusedWithDefaultApp" },
  "file.edit": { type: "editFocused" },
  "entry.open": { type: "openFocused" },
  "entry.goParent": { type: "goParent" },
  "selection.selectAll": { type: "selectAllVisible" },
  "selection.toggleFocused": { type: "toggleFocusedSelection" },
  "selection.extendUp": { type: "extendSelection", delta: -1 },
  "selection.extendDown": { type: "extendSelection", delta: 1 },
  "cursor.pageUp": { type: "moveCursorByPage", direction: -1 },
  "cursor.pageDown": { type: "moveCursorByPage", direction: 1 },
  "cursor.goFirst": { type: "goFirst" },
  "cursor.goLast": { type: "goLast" },
  "app.refresh": { type: "refreshActivePane" },
  "location.openManager": { type: "openLocationManager" },
  "externalCommand.open": { type: "openExternalCommandDialog" },
  "view.cycleSort": { type: "cycleSortMode" },
  "view.toggleHidden": { type: "toggleHiddenFiles" },
  "file.copy": { type: "operation", kind: "copy" },
  "file.move": { type: "operation", kind: "move" },
  "file.rename": { type: "operation", kind: "rename" },
  "file.properties": { type: "openProperties" },
  "file.chmod": { type: "operation", kind: "chmod" },
  "archive.unpack": { type: "operation", kind: "extractArchive" },
  "file.delete": (event) => ({ type: "delete", permanent: event.shiftKey }),
  "file.deletePermanently": { type: "delete", permanent: true },
};

const prefixActions: Record<string, PrefixKeyAction> = {
  "cursor.goFirst": { type: "goFirst" },
  "cursor.goLast": { type: "goLast" },
  "file.mkdir": { type: "mkdir" },
  "file.createFile": { type: "createFile" },
  "archive.create": { type: "createArchive" },
  "externalCommand.open": { type: "openCommandDialog" },
  "diff.openPaneDiff": { type: "openPaneDiff" },
  "diff.openDetailedPaneDiff": { type: "openDetailedPaneDiff" },
  "git.openStatus": { type: "openGitStatus" },
  "clipboard.copyPaths": { type: "copySelectedPaths" },
  "clipboard.copyCurrentDirectory": { type: "copyCurrentDirectory" },
  "clipboard.copyNames": { type: "copySelectedNames" },
};

const implicitPrefixBindings: Record<string, string[]> = {};

function allBindings(settings: KeybindSettings): Record<string, string[]> {
  return {
    ...implicitPrefixBindings,
    ...defaultKeybindSettings.lockedBindings,
    ...defaultKeybindSettings.bindings,
    ...settings.lockedBindings,
    ...settings.bindings,
  };
}

function normalizeKeyName(key: string): string {
  if (key === " ") return "space";
  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight") return "right";
  if (key === "PageUp") return "pageup";
  if (key === "PageDown") return "pagedown";
  if (key === "Escape") return "esc";
  return key.toLowerCase();
}

export function keyTokenForEvent(event: KeyLike): string {
  const base = normalizeKeyName(event.key);
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey && (base.length > 1 || /^[a-z]$/i.test(base))) parts.push("shift");
  parts.push(base);
  return parts.join("+");
}

function normalizedSequence(binding: string): string[] {
  return binding
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function commandMatchesSingleKey(settings: KeybindSettings, commandId: string, event: KeyLike): boolean {
  const token = keyTokenForEvent(event);
  return (allBindings(settings)[commandId] ?? []).some((binding) => {
    const sequence = normalizedSequence(binding);
    return sequence.length === 1 && sequence[0] === token;
  });
}

function matchingPrefix(settings: KeybindSettings, event: KeyLike): PrefixKey | null {
  const token = keyTokenForEvent(event);
  for (const bindings of Object.values(allBindings(settings))) {
    for (const binding of bindings) {
      const sequence = normalizedSequence(binding);
      if (sequence.length > 1 && sequence[0] === token) return token;
    }
  }
  return null;
}

export function classifyPrefixKey(prefix: PrefixKey, event: KeyLike, settings: KeybindSettings = defaultKeybindSettings): PrefixKeyAction {
  if (event.key === "Escape" || event.key === "Backspace") return { type: "cancel" };
  const secondToken = keyTokenForEvent(event);
  for (const [commandId, bindings] of Object.entries(allBindings(settings))) {
    for (const binding of bindings) {
      const sequence = normalizedSequence(binding);
      if (sequence.length === 2 && sequence[0] === prefix && sequence[1] === secondToken) {
        return prefixActions[commandId] ?? { type: "noMatch", prefix, key: event.key };
      }
    }
  }
  return { type: "noMatch", prefix, key: event.key };
}

export function classifyPaneKey(
  event: KeyLike,
  context: PaneKeyContext,
  settings: KeybindSettings = defaultKeybindSettings,
): PaneKeyAction | null {
  // Escape keeps context-specific behavior fixed so dialogs/previews remain
  // recoverable even if editable bindings are customized.
  if (event.key === "Escape" && context.hasQuickFilterQuery) return { type: "clearQuickFilter" };
  if (event.key === "Escape" && context.hasOperationJob) return { type: "closeOperationPreview" };

  const prefix = matchingPrefix(settings, event);
  if (prefix) return { type: "startPrefix", prefix };

  for (const [commandId, action] of Object.entries(commandActions)) {
    if (!commandMatchesSingleKey(settings, commandId, event)) continue;
    return typeof action === "function" ? action(event) : action;
  }
  return null;
}
