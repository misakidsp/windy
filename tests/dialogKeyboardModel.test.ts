import assert from "node:assert/strict";
import {
  classifyConfirmationDialogKey,
  classifyExternalCommandDialogKey,
  classifyLargeSearchResultDialogKey,
  classifyLocationDialogKey,
  classifyOperationFailureDialogKey,
  classifySearchDialogKey,
} from "../src/routes/dialogKeyboardModel";
import type { KeyLike } from "../src/routes/keyboardModel";

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

assert.deepEqual(classifyOperationFailureDialogKey(key({ key: "Escape" })), { type: "close" });
assert.deepEqual(classifyOperationFailureDialogKey(key({ key: "Enter" })), { type: "close" });
assert.deepEqual(classifyOperationFailureDialogKey(key({ key: "[" })), { type: "showSide", side: "left" });
assert.deepEqual(classifyOperationFailureDialogKey(key({ key: "]" })), { type: "showSide", side: "right" });
assert.equal(classifyOperationFailureDialogKey(key({ key: "x" })), null);

assert.equal(classifyConfirmationDialogKey(key({ key: "Escape" })), "cancel");
assert.equal(classifyConfirmationDialogKey(key({ key: "Enter" })), "confirm");
assert.equal(classifyLargeSearchResultDialogKey(key({ key: "Escape" })), "cancel");
assert.equal(classifyLargeSearchResultDialogKey(key({ key: "Enter" })), "confirm");

assert.equal(classifyExternalCommandDialogKey(key({ key: "Escape" })), "close");
assert.equal(classifyExternalCommandDialogKey(key({ key: "j" })), "moveDown");
assert.equal(classifyExternalCommandDialogKey(key({ key: "ArrowUp" })), "moveUp");
assert.equal(classifyExternalCommandDialogKey(key({ key: "Enter" })), "run");

assert.equal(classifySearchDialogKey(key({ key: "Enter" }), false), "run");
assert.equal(classifySearchDialogKey(key({ key: "Enter" }), true), null);
assert.equal(classifySearchDialogKey(key({ key: "Escape" }), true), "close");

const managerContext = {
  mode: "manager" as const,
  hasPendingDelete: false,
  hasPendingKnownHost: false,
  composing: false,
};
assert.deepEqual(classifyLocationDialogKey(key({ key: "Escape" }), managerContext), { type: "close" });
assert.deepEqual(classifyLocationDialogKey(key({ key: "Escape" }), { ...managerContext, hasPendingDelete: true }), {
  type: "escapeCancelDelete",
});
assert.deepEqual(classifyLocationDialogKey(key({ key: "Enter" }), managerContext), { type: "chooseLocation" });
assert.deepEqual(classifyLocationDialogKey(key({ key: "Enter" }), { ...managerContext, hasPendingDelete: true }), {
  type: "confirmDelete",
});
assert.deepEqual(classifyLocationDialogKey(key({ key: "ArrowDown" }), managerContext), { type: "moveCursor", delta: 1 });
assert.deepEqual(classifyLocationDialogKey(key({ key: "a" }), managerContext), { type: "addCurrentSource" });
assert.deepEqual(classifyLocationDialogKey(key({ key: "q" }), managerContext), { type: "disconnectSession" });
assert.deepEqual(classifyLocationDialogKey(key({ key: "Delete" }), managerContext), { type: "deleteSaved" });

const sftpFormContext = {
  mode: "sftpForm" as const,
  hasPendingDelete: false,
  hasPendingKnownHost: false,
  composing: false,
};
assert.deepEqual(classifyLocationDialogKey(key({ key: "Escape" }), sftpFormContext), { type: "backToManager" });
assert.deepEqual(classifyLocationDialogKey(key({ key: "Escape" }), { ...sftpFormContext, hasPendingKnownHost: true }), {
  type: "escapeCancelKnownHost",
});
assert.deepEqual(classifyLocationDialogKey(key({ key: "Enter" }), sftpFormContext), { type: "connect" });
assert.equal(classifyLocationDialogKey(key({ key: "Enter" }), { ...sftpFormContext, composing: true }), null);
assert.deepEqual(classifyLocationDialogKey(key({ key: "Enter" }), { ...sftpFormContext, hasPendingKnownHost: true }), {
  type: "trustKnownHost",
});
assert.deepEqual(classifyLocationDialogKey(key({ key: "s", ctrlKey: true }), sftpFormContext), {
  type: "saveProfile",
});
