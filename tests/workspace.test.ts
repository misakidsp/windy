import assert from "node:assert/strict";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { createWorkspace } from "../src/routes/workspace/createWorkspace";
import { mountWorkspace } from "../src/routes/workspace/workspaceLifecycle";
import type { DirectoryListing, FileEntry, TextViewerState } from "../src/routes/types";
import type { XtermTerminal } from "../src/routes/terminalFactory";

function entry(name: string, directory = "/home/test"): FileEntry {
  return { key: `${directory}/${name}`, path: `${directory}/${name}`, name, kind: "file", size: 12,
    modifiedAt: null, hidden: false, readonly: false, mode: null };
}

function key(key: string): KeyboardEvent {
  return { key, code: key, target: null, preventDefault() {}, stopPropagation() {},
    altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false,
    isComposing: false } as unknown as KeyboardEvent;
}

const savedGlobals = new Map<string, PropertyDescriptor | undefined>();
function mockGlobal(name: string, value: unknown) {
  savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

mockGlobal("window", Object.assign(new EventTarget(), { crypto: globalThis.crypto }));
mockGlobal("HTMLElement", class {});
const css = new Map<string, string>();
mockGlobal("document", { documentElement: { style: { setProperty: (name: string, value: string) => css.set(name, value) } } });

try {
  const { state, actions } = createWorkspace();
  const separate = createWorkspace();
  assert.notEqual(state.panes.panes, separate.state.panes.panes);
  assert.notEqual(state.operations.undoStack, separate.state.operations.undoStack);
  state.settings.languageSettings = { schemaVersion: 1, locale: "en", messages: { "status.ready": "Custom ready" } };
  assert.equal(state.settings.t("status.ready"), "Custom ready");
  assert.equal(separate.state.settings.t("status.ready"), "Ready.");

  const calls: string[] = [];
  let finishOldLoad: (listing: DirectoryListing) => void = () => assert.fail("Old load was not started");
  mockIPC((command, payload) => {
    calls.push(command);
    const args = payload as Record<string, unknown>;
    switch (command) {
      case "home_directory": return "/home/test";
      case "list_local_roots": return ["/"];
      case "list_directory":
        if (args.path === "/slow") return new Promise<DirectoryListing>((resolve) => { finishOldLoad = resolve; });
        return { path: args.path, entries: [entry("alpha.txt", String(args.path)), entry("beta.txt", String(args.path))] };
      case "read_text_file": return { path: args.path, content: Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\r\n"), encoding: "utf-8", truncated: false };
      case "search_directory": return { rootPath: "/home/test", displayPath: "search:/home/test", queryLabel: "beta", entries: [entry("beta.txt")], truncated: false };
      case "list_local_favorite_profiles": return [{ id: "fav", name: "Favorite", path: "/favorite" }];
      case "list_search_profiles":
      case "list_sftp_connection_profiles":
      case "list_active_sftp_sessions": return [];
      case "save_appearance_settings": return args.settings;
      case "execute_file_operation_job": return { succeeded: [{ path: "/home/test/beta.txt", message: "Copied" }], failed: [] };
      case "resize_terminal":
      case "stop_terminal": return;
      case "start_terminal": return 42;
      default: throw new Error(`Unexpected backend command: ${command}`);
    }
  });

  // Loading and navigation share the same live state, including stale-result guards.
  await actions.initializePanes();
  assert.equal(state.panes.panes.left.currentPath, "/home/test");
  assert.equal(state.panes.panes.right.entries.length, 2);
  const pendingLoad = actions.loadDirectory("left", "/slow");
  await actions.loadDirectory("left", "/new");
  finishOldLoad({ path: "/slow", entries: [] });
  await pendingLoad;
  assert.equal(state.panes.panes.left.currentPath, "/new");
  assert.equal(state.terminal.consoleCwd, "/new");
  await actions.loadDirectory("left", "/home/test");

  // Keyboard dispatch crosses feature boundaries and follows the active pane.
  await actions.handleKeydown(key("ArrowDown"));
  assert.equal(state.panes.panes.left.cursorIndex, 1);
  await actions.handleKeydown(key("Tab"));
  assert.equal(state.panes.activePaneId, "right");
  await actions.handleKeydown(key("ArrowDown"));
  assert.equal(state.panes.panes.right.cursorIndex, 1);
  actions.updateQuickFilterQuery("right", "alpha");
  assert.deepEqual(actions.visibleEntries(state.panes.panes.right).map(e => e.name), ["alpha.txt"]);
  actions.clearQuickFilter("right");
  state.panes.activePaneId = "left";

  // Viewer paging uses the component's current measured size, without moving the file cursor.
  await actions.openViewer(entry("alpha.txt"));
  state.viewer.viewerPageSizeValue = 18;
  await actions.handleKeydown(key("PageDown"));
  assert.equal((state.viewer.viewer as TextViewerState).topLine, 18);
  assert.equal(state.panes.panes.left.cursorIndex, 1);
  await actions.handleKeydown(key("Escape"));
  assert.equal(state.viewer.viewer, null);

  // Settings take priority over other modal key handlers.
  state.settings.preferencesDialogOpen = true;
  state.search.searchDialogOpen = true;
  await actions.handleKeydown(key("Escape"));
  assert.equal(state.settings.preferencesDialogOpen, false);
  assert.equal(state.search.searchDialogOpen, true);
  await actions.handleKeydown(key("Escape"));
  assert.equal(state.search.searchDialogOpen, false);

  actions.openSearchDialog();
  actions.updateSearchForm({ nameRegex: "beta" });
  await actions.runSearchFromDialog();
  assert.equal(state.panes.panes.left.source.kind, "search");
  assert.deepEqual(state.panes.panes.left.entries.map(e => e.name), ["beta.txt"]);
  assert.equal(state.search.searchRunning, false);

  await actions.openSftpConnectionDialog();
  assert.equal(state.locations.sftpDialogOpen, true);
  assert.ok(state.locations.locationOptionItems.some(option => option.localFavorite?.id === "fav"));
  await actions.chooseLocationOption({ kind: "localPath", label: "Favorite", detail: "", path: "/favorite" });
  assert.equal(state.panes.panes.left.currentPath, "/favorite");
  assert.equal(state.locations.sftpDialogOpen, false);

  // Preview stays inert until confirmed; execution updates history and refreshes both panes.
  actions.previewOperation("copy");
  assert.equal(state.operations.confirmationDialogOpen, true);
  assert.equal(calls.includes("execute_file_operation_job"), false);
  await actions.confirmOperationExecution();
  assert.equal(calls.filter(c => c === "execute_file_operation_job").length, 1);
  assert.equal(state.operations.confirmationDialogOpen, false);
  assert.equal(state.operations.operationRunning, false);
  assert.equal(state.operations.undoStack.length, 0);
  actions.previewOperation("rename");
  actions.updateOperationName("renamed.txt");
  await actions.confirmOperationExecution();
  assert.equal(state.operations.undoStack.length, 1);

  const appearance = { ...state.settings.appearanceSettings, fonts: { ...state.settings.appearanceSettings.fonts, viewerSize: 24 } };
  await actions.savePreferencesAppearanceSettings(appearance);
  assert.equal(state.settings.appearanceSettings.fonts.viewerSize, 24);
  assert.equal(css.get("--windy-viewer-font-size"), "24px");
  assert.equal(state.settings.preferencesError, "");

  // Terminal output must still be isolated by backend session id.
  const output: number[][] = [];
  state.terminal.terminal = { cols: 80, rows: 24, clear() {}, writeln() {}, write(bytes: Uint8Array) { output.push([...bytes]); } } as unknown as XtermTerminal;
  state.terminal.terminalElement = {} as HTMLElement;
  await actions.startTerminal();
  assert.equal(state.terminal.terminalSession.started, true);
  actions.handleTerminalOutput({ sessionId: 41, bytes: [1] });
  actions.handleTerminalOutput({ sessionId: 42, bytes: [2] });
  assert.deepEqual(output, [[2]]);
  await actions.stopTerminalSession();
  assert.equal(state.terminal.terminalSession.started, false);

  // Unmount can happen before Tauri resolves listener registration. Late handles
  // must be released too, so remounting cannot leak handlers into the old page.
  const resolveListeners: (() => void)[] = [];
  const unregistered: number[] = [];
  mockIPC((command, payload) => {
    const args = payload as Record<string, unknown>;
    if (command === "plugin:event|listen") {
      return new Promise<number>(resolve => {
        const id = resolveListeners.length + 1;
        resolveListeners.push(() => resolve(id));
      });
    }
    if (command === "plugin:event|unlisten") unregistered.push(Number(args.eventId));
    else if (command !== "stop_terminal") throw new Error(`Unexpected lifecycle command: ${command}`);
  });
  const noStartup = async () => {};
  const dispose = mountWorkspace(state, {
    ...actions,
    loadAppSettings: noStartup,
    loadAppearanceSettings: noStartup,
    loadKeybindSettings: noStartup,
    loadLanguageSettings: noStartup,
    loadSafeModeStatus: noStartup,
    loadTerminalShellKind: noStartup,
    ensureSftpProfilesLoaded: noStartup,
    initializePanes: noStartup,
  });
  assert.equal(resolveListeners.length, 4);
  dispose();
  for (const resolve of resolveListeners) resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(unregistered.sort(), [1, 2, 3, 4]);
  await Promise.resolve();
} finally {
  clearMocks();
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
}
