import { defaultKeybindSettings } from "./keyboardModel";
import { translateMessage, type Translate } from "./localization";
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

const groupOrder = ["pane", "entry", "file", "view", "filter", "diff", "git", "clipboard", "terminal", "location", "search", "external", "dialog", "help", "app", "archive", "selection", "cursor"];

const implicitHelpBindings: Record<string, string[]> = {};

function commandGroup(commandId: string): string {
  if (commandId.startsWith("externalCommand.")) return "external";
  return commandId.split(".")[0] ?? "app";
}

function displayKey(key: string): string {
  return key.toLowerCase();
}

function defaultTranslate(id: string): string {
  return translateMessage(undefined, id);
}

export function keyHelpCommandLabel(commandId: string, t?: Translate): string {
  const key = `keyHelp.command.${commandId}`;
  const translatedLabel = (t ?? defaultTranslate)(key);
  return translatedLabel !== key ? translatedLabel : commandId;
}

export function keyHelpGroups(settings: KeybindSettings = defaultKeybindSettings, t?: Translate): KeyHelpGroup[] {
  const grouped = new Map<string, KeyHelpItem[]>();
  const pushItem = (commandId: string, keys: string[], locked: boolean) => {
    if (keys.length === 0) return;
    const group = commandGroup(commandId);
    const items = grouped.get(group) ?? [];
    items.push({
      commandId,
      label: keyHelpCommandLabel(commandId, t),
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
      title: translatedGroupTitle(id, t),
      items: items.sort((a, b) => a.commandId.localeCompare(b.commandId)),
    }));
}

function translatedGroupTitle(id: string, t?: Translate): string {
  const key = `keyHelp.group.${id}`;
  const translated = (t ?? defaultTranslate)(key);
  return translated !== key ? translated : id;
}
