import assert from "node:assert/strict";
import {
  clampExternalCommandCursor,
  clipboardNameTextForCommandTargets,
  clipboardTextForCommandTargets,
  localCommandTargets,
  markedCommandTargetsForPane,
  externalCommandLines,
  selectedCommandTargetsForPane,
  selectedEntriesForPane,
  ShellQuoteError,
  shellQuotePath,
  type ExternalCommandContext,
} from "../src/routes/externalCommandModel";
import type { CommandTarget, ExternalCommandDefinition, FileEntry, PaneState } from "../src/routes/types";

function pane(id: "left" | "right", currentPath: string): PaneState {
  return {
    id,
    title: id,
    source: { kind: "local", location: currentPath, displayName: currentPath },
    currentPath,
    entries: [],
    cursorKey: null,
    cursorIndex: -1,
    selectedKeys: new Set(),
    quickFilterQuery: "",
    quickFilterInputActive: false,
    showHiddenFiles: false,
    sortMode: "name",
    loading: false,
    error: null,
  };
}

function target(name: string, path: string): CommandTarget {
  return {
    key: path,
    name,
    path,
    kind: "file",
    mode: null,
    sourceKind: "local",
  };
}

function entry(name: string, path: string): FileEntry {
  return {
    key: path,
    name,
    path,
    kind: "file",
    size: null,
    modifiedAt: null,
    hidden: false,
    readonly: false,
    mode: null,
  };
}

const targets = [
  target("a file.txt", "/tmp/a file.txt"),
  target("quote's.txt", "/tmp/quote's.txt"),
];
const context: ExternalCommandContext = {
  activePane: pane("left", "/tmp"),
  otherPane: pane("right", "/dest"),
  activeMarked: [target("marked.md", "/tmp/marked.md")],
  otherMarked: [target("other.log", "/dest/other.log")],
  shellKind: "posix",
};

assert.equal(shellQuotePath("/tmp/quote's.txt", "posix"), "'/tmp/quote'\\''s.txt'");
assert.equal(shellQuotePath("C:\\temp\\quote's.txt", "powershell"), "'C:\\temp\\quote''s.txt'");
assert.equal(shellQuotePath("C:\\temp\\a file.txt", "cmd"), "\"C:\\temp\\a file.txt\"");
assert.throws(
  () => shellQuotePath("C:\\temp\\%PATH%.txt", "cmd"),
  (error) => error instanceof ShellQuoteError && error.code === "cmdUnsafePath",
);
assert.equal(clipboardTextForCommandTargets(targets, "posix"), "'/tmp/a file.txt' '/tmp/quote'\\''s.txt'");
assert.equal(clipboardNameTextForCommandTargets(targets, "posix"), "'a file.txt' 'quote'\\''s.txt'");
assert.equal(clampExternalCommandCursor(-1, 3), 0);
assert.equal(clampExternalCommandCursor(9, 3), 2);
assert.equal(clampExternalCommandCursor(0, 0), 0);

const paneEntries = [entry("a.txt", "/tmp/a.txt"), entry("b.txt", "/tmp/b.txt")];
const selectedPane = {
  ...pane("left", "/tmp"),
  entries: paneEntries,
  selectedKeys: new Set(["/tmp/b.txt"]),
  cursorIndex: 0,
};
assert.deepEqual(selectedEntriesForPane(selectedPane, paneEntries), [paneEntries[1]]);
assert.deepEqual(selectedCommandTargetsForPane(selectedPane, paneEntries), [
  { key: "/tmp/b.txt", name: "b.txt", path: "/tmp/b.txt", kind: "file", mode: null, sourceKind: "local" },
]);
assert.deepEqual(markedCommandTargetsForPane(selectedPane), [
  { key: "/tmp/b.txt", name: "b.txt", path: "/tmp/b.txt", kind: "file", mode: null, sourceKind: "local" },
]);
assert.deepEqual(selectedEntriesForPane({ ...selectedPane, selectedKeys: new Set(), cursorIndex: 0 }, paneEntries), [paneEntries[0]]);
assert.deepEqual(localCommandTargets(markedCommandTargetsForPane(selectedPane), selectedPane), [
  { key: "/tmp/b.txt", name: "b.txt", path: "/tmp/b.txt", kind: "file", mode: null, sourceKind: "local" },
]);
assert.deepEqual(
  localCommandTargets(markedCommandTargetsForPane({ ...selectedPane, source: { kind: "search", location: "search", displayName: "search", rootPath: "/tmp", returnPath: "/tmp", nameRegex: "", recursive: false, minSizeBytes: null, maxSizeBytes: null, modifiedAfter: null, modifiedBefore: null, searchKind: "all", hiddenMode: "exclude", readonlyMode: "any", truncated: false } }), {
    ...selectedPane,
    source: { kind: "search", location: "search", displayName: "search", rootPath: "/tmp", returnPath: "/tmp", nameRegex: "", recursive: false, minSizeBytes: null, maxSizeBytes: null, modifiedAfter: null, modifiedBefore: null, searchKind: "all", hiddenMode: "exclude", readonlyMode: "any", truncated: false },
  }),
  [],
);

const argsCommand: ExternalCommandDefinition = {
  id: "args",
  name: "Args",
  description: "",
  template: "echo {args} {cwd} {otherCwd} {marked} {otherMarked}",
};
assert.deepEqual(externalCommandLines(argsCommand, targets, context), [
  "echo '/tmp/a file.txt' '/tmp/quote'\\''s.txt' '/tmp' '/dest' '/tmp/marked.md' '/dest/other.log'",
]);

const repeatCommand: ExternalCommandDefinition = {
  id: "repeat",
  name: "Repeat",
  description: "",
  template: "show {index}:{path}:{rawName}",
  argumentMode: "repeat",
};
assert.deepEqual(externalCommandLines(repeatCommand, targets, context), [
  "show 1:'/tmp/a file.txt':a file.txt",
  "show 2:'/tmp/quote'\\''s.txt':quote's.txt",
]);

const joinCommand: ExternalCommandDefinition = {
  id: "join",
  name: "Join",
  description: "",
  template: "printf {items}",
  argumentMode: "join",
  itemTemplate: "{zeroIndex}={name}",
  itemSeparator: "\\n",
};
assert.deepEqual(externalCommandLines(joinCommand, targets, context), [
  "printf '0='\\''a file.txt'\\''\n1='\\''quote'\\''\\'\\'''\\''s.txt'\\'''",
]);
