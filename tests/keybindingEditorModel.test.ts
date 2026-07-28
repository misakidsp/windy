import assert from "node:assert/strict";
import {
  keybindingEditorText,
  parseKeybindingEditorText,
  validateKeybindingScopes,
} from "../src/routes/keybindingEditorModel";

assert.equal(keybindingEditorText([", c", "ctrl+c"]), ", c\nctrl+c");
assert.deepEqual(parseKeybindingEditorText(", c\nCTRL+C\n, c"), [", c", "ctrl+c"]);

const lockedBindings = {
  "entry.open": ["enter"],
  "dialog.confirm": ["enter"],
};

assert.equal(
  validateKeybindingScopes(
    { "file.copy": ["c"], "diff.openDetailedPaneDiff": [", c"] },
    lockedBindings,
    [["file.copy", "diff.openDetailedPaneDiff", "entry.open"]],
  ),
  null,
);

assert.deepEqual(
  validateKeybindingScopes(
    { "file.copy": ["enter"] },
    lockedBindings,
    [["file.copy", "entry.open"]],
  ),
  {
    kind: "duplicate",
    binding: "enter",
    firstCommand: "entry.open",
    secondCommand: "file.copy",
  },
);

assert.deepEqual(
  validateKeybindingScopes(
    { "file.copy": [","], "diff.openDetailedPaneDiff": [", c"] },
    {},
    [["file.copy", "diff.openDetailedPaneDiff"]],
  ),
  {
    kind: "prefixConflict",
    binding: ",",
    firstCommand: "file.copy",
    secondCommand: "diff.openDetailedPaneDiff",
  },
);

assert.deepEqual(
  validateKeybindingScopes(
    { "file.copy": ["g g g"] },
    {},
    [["file.copy"]],
  ),
  {
    kind: "unsupportedSequence",
    binding: "g g g",
    command: "file.copy",
  },
);
