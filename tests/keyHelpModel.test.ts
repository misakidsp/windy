import assert from "node:assert/strict";
import { keyHelpCommandLabel, keyHelpGroups } from "../src/routes/keyHelpModel";
import { translateMessage } from "../src/routes/localization";
import type { KeybindSettings } from "../src/routes/types";

const settings: KeybindSettings = {
  schemaVersion: 1,
  bindings: {
    "pane.focusTerminal": ["z"],
    "clipboard.copyPaths": ["y y"],
  },
  lockedBindings: {
    "dialog.confirm": ["enter"],
    "cursor.goFirst": ["home", "g g"],
    "cursor.goLast": ["end", "g e"],
  },
};

const groups = keyHelpGroups(settings);
const pane = groups.find((group) => group.id === "pane");
const clipboard = groups.find((group) => group.id === "clipboard");
const filter = groups.find((group) => group.id === "filter");
const help = groups.find((group) => group.id === "help");
const dialog = groups.find((group) => group.id === "dialog");
const cursor = groups.find((group) => group.id === "cursor");
const external = groups.find((group) => group.id === "external");

assert.equal(pane?.title, "Pane");
assert.equal(pane?.items.find((item) => item.commandId === "pane.focusTerminal")?.label, "Focus terminal");
assert.deepEqual(pane?.items.find((item) => item.commandId === "pane.focusTerminal")?.keys, ["z"]);
assert.deepEqual(clipboard?.items.find((item) => item.commandId === "clipboard.copyPaths")?.keys, ["y y"]);
assert.deepEqual(filter?.items.find((item) => item.commandId === "filter.startInline")?.keys, ["/"]);
assert.deepEqual(help?.items.find((item) => item.commandId === "help.toggle")?.keys, ["?"]);
assert.equal(dialog?.items.find((item) => item.commandId === "dialog.confirm")?.locked, true);
assert.deepEqual(cursor?.items.map((item) => item.commandId).sort(), [
  "cursor.goFirst",
  "cursor.goLast",
  "cursor.pageDown",
  "cursor.pageUp",
]);
assert.deepEqual(external?.items.map((item) => item.commandId), ["externalCommand.open"]);

const t = (id: string) => {
  if (id === "keyHelp.command.pane.focusTerminal") return "コンソールへ移動";
  return translateMessage(undefined, id);
};

assert.equal(keyHelpCommandLabel("pane.focusTerminal", t), "コンソールへ移動");
assert.equal(keyHelpCommandLabel("unknown.command", t), "unknown.command");
assert.equal(
  keyHelpGroups(settings, t)
    .find((group) => group.id === "pane")
    ?.items.find((item) => item.commandId === "pane.focusTerminal")
    ?.label,
  "コンソールへ移動",
);
