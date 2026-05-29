import assert from "node:assert/strict";
import { classifyPaneKey, classifyPrefixKey, type KeyLike } from "../src/routes/keyboardModel";

function key(partial: Partial<KeyLike> & Pick<KeyLike, "key">): KeyLike {
  return {
    key: partial.key,
    code: partial.code ?? "",
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    altKey: partial.altKey ?? false,
    shiftKey: partial.shiftKey ?? false,
  };
}

const baseContext = { hasQuickFilterQuery: false, hasOperationJob: false };

assert.deepEqual(classifyPrefixKey("g", key({ key: "g" })), { type: "goFirst" });
assert.deepEqual(classifyPrefixKey("g", key({ key: "e" })), { type: "goLast" });
assert.deepEqual(classifyPrefixKey("n", key({ key: "d" })), { type: "mkdir" });
assert.deepEqual(classifyPrefixKey("n", key({ key: "f" })), { type: "createFile" });
assert.deepEqual(classifyPrefixKey(",", key({ key: "x" })), { type: "openCommandDialog" });
assert.deepEqual(classifyPrefixKey(",", key({ key: "d" })), { type: "openPaneDiff" });
assert.deepEqual(classifyPrefixKey(",", key({ key: "g" })), { type: "openGitStatus" });
assert.deepEqual(classifyPrefixKey(",", key({ key: "p" })), { type: "createArchive" });
assert.deepEqual(classifyPrefixKey("y", key({ key: "y" })), { type: "copySelectedPaths" });
assert.deepEqual(classifyPrefixKey("y", key({ key: "p" })), { type: "copyCurrentDirectory" });
assert.deepEqual(classifyPrefixKey("y", key({ key: "n" })), { type: "copySelectedNames" });
assert.deepEqual(classifyPrefixKey("y", key({ key: "Escape" })), { type: "cancel" });
assert.deepEqual(classifyPrefixKey("y", key({ key: "z" })), { type: "noMatch", prefix: "y", key: "z" });

assert.deepEqual(classifyPaneKey(key({ key: "x" }), baseContext), { type: "focusConsole" });
assert.deepEqual(classifyPaneKey(key({ key: "x", ctrlKey: true, shiftKey: true }), baseContext), {
  type: "toggleConsoleVisibility",
});
assert.deepEqual(classifyPaneKey(key({ key: "f", altKey: true }), baseContext), { type: "toggleTerminalFullscreen" });
assert.deepEqual(classifyPaneKey(key({ key: "f", ctrlKey: true }), baseContext), { type: "openSearchDialog" });
assert.deepEqual(classifyPaneKey(key({ key: "Tab", shiftKey: true }), baseContext), {
  type: "focusOtherByTab",
  reverse: true,
});
assert.deepEqual(classifyPaneKey(key({ key: "\\" }), baseContext), { type: "goRoot" });
assert.deepEqual(classifyPaneKey(key({ key: "~", code: "Backquote", shiftKey: true }), baseContext), { type: "goHome" });
assert.deepEqual(classifyPaneKey(key({ key: "Escape" }), { ...baseContext, hasQuickFilterQuery: true }), {
  type: "clearQuickFilter",
});
assert.deepEqual(classifyPaneKey(key({ key: "Escape" }), { ...baseContext, hasOperationJob: true }), {
  type: "closeOperationPreview",
});
assert.deepEqual(classifyPaneKey(key({ key: "ArrowUp", shiftKey: true }), baseContext), {
  type: "extendSelection",
  delta: -1,
});
assert.deepEqual(classifyPaneKey(key({ key: "j" }), baseContext), { type: "moveCursor", delta: 1 });
assert.deepEqual(classifyPaneKey(key({ key: "l" }), baseContext), { type: "horizontalRight" });
assert.deepEqual(classifyPaneKey(key({ key: "h" }), baseContext), { type: "horizontalLeft" });
assert.deepEqual(classifyPaneKey(key({ key: "Enter", shiftKey: true }), baseContext), {
  type: "openFocusedWithDefaultApp",
});
assert.deepEqual(classifyPaneKey(key({ key: "a", ctrlKey: true }), baseContext), { type: "selectAllVisible" });
assert.deepEqual(classifyPaneKey(key({ key: "r", ctrlKey: true }), baseContext), { type: "refreshActivePane" });
assert.deepEqual(classifyPaneKey(key({ key: "z", ctrlKey: true }), baseContext), { type: "undoLastOperation" });
assert.deepEqual(classifyPaneKey(key({ key: "Z", ctrlKey: true, shiftKey: true }), baseContext), { type: "redoLastOperation" });
assert.deepEqual(classifyPaneKey(key({ key: "n", ctrlKey: true }), baseContext), { type: "openLocationManager" });
assert.deepEqual(classifyPaneKey(key({ key: "g" }), baseContext), { type: "startPrefix", prefix: "g" });
assert.deepEqual(classifyPaneKey(key({ key: "s" }), baseContext), { type: "cycleSortMode" });
assert.deepEqual(classifyPaneKey(key({ key: "p" }), baseContext), { type: "openProperties" });
assert.deepEqual(classifyPaneKey(key({ key: "Delete", shiftKey: true }), baseContext), {
  type: "delete",
  permanent: true,
});
assert.deepEqual(classifyPaneKey(key({ key: "c" }), baseContext), { type: "operation", kind: "copy" });
assert.equal(classifyPaneKey(key({ key: "C", shiftKey: true }), baseContext), null);
