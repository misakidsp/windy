import assert from "node:assert/strict";
import { runPaneKeyActionWith, runPrefixKeyActionWith, type PaneKeyActionRunner, type PrefixKeyActionRunner } from "../src/routes/keyActionRunners";
import type { FileOperationKind, PaneId, PrefixKey } from "../src/routes/types";

const calls: string[] = [];

const prefixRunner: PrefixKeyActionRunner = {
  setStatus(message, commandId) {
    calls.push(`status:${commandId}:${message}`);
  },
  goFirst() {
    calls.push("goFirst");
  },
  goLast() {
    calls.push("goLast");
  },
  previewOperation(kind: FileOperationKind) {
    calls.push(`preview:${kind}`);
  },
  async openExternalCommandDialog() {
    calls.push("external");
  },
  openPaneDiffDialog() {
    calls.push("diff");
  },
  async openDetailedPaneDiffDialog() {
    calls.push("detailedDiff");
  },
  async openGitStatusSource() {
    calls.push("git");
  },
  async copySelectedPathsToClipboard() {
    calls.push("copyPaths");
  },
  async copyCurrentDirectoryToClipboard() {
    calls.push("copyDirectory");
  },
  async copySelectedNamesToClipboard() {
    calls.push("copyNames");
  },
};

await runPrefixKeyActionWith({ type: "createArchive" }, prefixRunner);
await runPrefixKeyActionWith({ type: "openGitStatus" }, prefixRunner);
await runPrefixKeyActionWith({ type: "noMatch", prefix: "y", key: "z" }, prefixRunner);

assert.deepEqual(calls.splice(0), [
  "preview:createArchive",
  "git",
  "status:prefix.noMatch:No command for y z.",
]);

let activePane: PaneId = "left";

const paneRunner: PaneKeyActionRunner = {
  activePaneId: () => activePane,
  isRightPaneActive: () => activePane === "right",
  async toggleTerminalFullscreen() {
    calls.push("terminalFullscreen");
  },
  toggleConsoleVisibility() {
    calls.push("consoleVisible");
  },
  previewUndoOperation() {
    calls.push("undo");
  },
  previewRedoOperation() {
    calls.push("redo");
  },
  openSearchDialog() {
    calls.push("search");
  },
  startQuickFilter(paneId: PaneId) {
    calls.push(`filter:${paneId}`);
  },
  toggleKeyHelp() {
    calls.push("help");
  },
  focusConsole() {
    calls.push("console");
  },
  focusOtherPane() {
    activePane = activePane === "left" ? "right" : "left";
    calls.push(`focus:${activePane}`);
  },
  setLastCommand(commandId) {
    calls.push(`command:${commandId}`);
  },
  async goRoot() {
    calls.push("root");
  },
  async goHome() {
    calls.push("home");
  },
  async openOtherPanePathHere() {
    calls.push("otherHere");
  },
  async openCurrentPathInOtherPane() {
    calls.push("currentOther");
  },
  clearQuickFilter(paneId: PaneId) {
    calls.push(`clear:${paneId}`);
  },
  closeOperationPreview() {
    calls.push("closePreview");
  },
  extendSelection(delta) {
    calls.push(`extend:${delta}`);
  },
  moveCursor(delta) {
    calls.push(`move:${delta}`);
  },
  moveCursorByPage(direction) {
    calls.push(`page:${direction}`);
  },
  goFirst() {
    calls.push("first");
  },
  goLast() {
    calls.push("last");
  },
  async goParent() {
    calls.push("parent");
  },
  async openFocusedWithDefaultApp() {
    calls.push("openDefault");
  },
  async editFocused() {
    calls.push("edit");
  },
  async openFocused() {
    calls.push("open");
  },
  openFilePropertiesDialog() {
    calls.push("props");
  },
  toggleFocusedSelection() {
    calls.push("toggleSelection");
  },
  selectAllVisible() {
    calls.push("selectAll");
  },
  async refreshActivePane() {
    calls.push("refresh");
  },
  async openLocationManager() {
    calls.push("location");
  },
  startPrefixMode(prefix: PrefixKey) {
    calls.push(`prefix:${prefix}`);
  },
  async openExternalCommandDialog() {
    calls.push("external");
  },
  cycleSortMode() {
    calls.push("sort");
  },
  toggleHiddenFiles() {
    calls.push("hidden");
  },
  previewDeleteOperation(permanent) {
    calls.push(`delete:${permanent}`);
  },
  previewOperation(kind) {
    calls.push(`preview:${kind}`);
  },
};

await runPaneKeyActionWith({ type: "focusOtherByTab", reverse: false }, paneRunner);
await runPaneKeyActionWith({ type: "horizontalRight" }, paneRunner);
await runPaneKeyActionWith({ type: "startQuickFilter" }, paneRunner);
await runPaneKeyActionWith({ type: "operation", kind: "move" }, paneRunner);

assert.deepEqual(calls, [
  "focus:right",
  "command:pane.focusNextByTab",
  "parent",
  "filter:right",
  "preview:move",
]);
