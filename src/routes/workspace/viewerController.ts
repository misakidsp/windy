import { invoke } from "@tauri-apps/api/core";
import { tick } from "svelte";
import { imageViewerExtensions, textViewerExtensions } from "../constants";
import { openPathWithDefaultApp, openPathWithTextEditor } from "../fileSystemSideEffects";
import { viewerOpenAction } from "../fileOpenModel";
import { fileExtension } from "../pathUtils";
import { readViewerImageFile, readViewerTextFile } from "../viewerSideEffects";
import { handleViewerKey, recordImageNaturalSize } from "../viewerActions";
import type { FileEntry } from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

type Dependencies = Pick<WorkspaceActions,
  | "focusActivePaneAfterDialog"
  | "localizedBackendError"
>;

export function createViewerController(state: Pick<WorkspaceState, "app" | "panes" | "settings" | "viewer">, actions: Dependencies) {
  async function openViewer(entry: FileEntry): Promise<void> {
    const extension = fileExtension(entry.name);
    const action = viewerOpenAction(state.panes.panes[state.panes.activePaneId], entry, extension, imageViewerExtensions, textViewerExtensions);
    if (action.type === "unsupported") {
      state.app.notify("viewer.sftpUnsupported", undefined, "warning", true);
      state.app.lastCommandId = action.commandId;
      return;
    }
    if (action.type === "openImageViewer") {
      await openImageViewer(action.entry);
      return;
    }
    if (action.type === "openDefaultApp") {
      await openWithDefaultApp(action.entry);
      return;
    }

    try {
      const file = await readViewerTextFile(invoke, action.entry.path);
      state.viewer.viewer = {
        kind: "text",
        path: file.path,
        title: action.entry.name,
        lines: file.content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n"),
        topLine: 0,
        encoding: file.encoding,
        truncated: file.truncated,
        searchQuery: "",
        searchMode: false,
        searchMessage: "",
      };
      state.app.notify("viewer.openText", { name: action.entry.name }, "completed", false);
      state.app.lastCommandId = "viewer.openText";
      await tick();
      state.viewer.viewerElement?.focus();
    } catch (error) {
      state.app.notify("viewer.openFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "viewer.openFailed";
    }
  }

  async function openImageViewer(entry: FileEntry): Promise<void> {
    try {
      const file = await readViewerImageFile(invoke, entry.path);
      state.viewer.viewer = {
        kind: "image",
        path: file.path,
        title: entry.name,
        src: file.dataUrl,
        zoom: 1,
        fitToWindow: true,
        offsetX: 0,
        offsetY: 0,
        naturalWidth: null,
        naturalHeight: null,
      };
      state.app.notify("viewer.openImage", { name: entry.name }, "completed", false);
      state.app.lastCommandId = "viewer.openImage";
      await tick();
      state.viewer.viewerElement?.focus();
    } catch (error) {
      state.app.notify("viewer.openImageFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "viewer.openImageFailed";
    }
  }

  async function openWithDefaultApp(entry: FileEntry): Promise<void> {
    try {
      await openPathWithDefaultApp(invoke, entry.path);
      state.app.notify("open.defaultApp", { name: entry.name }, "completed", true);
      state.app.lastCommandId = "entry.openDefaultApp";
    } catch (error) {
      state.app.notify("open.failed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "entry.openDefaultAppFailed";
    }
  }

  async function openEditorForPath(path: string, label: string): Promise<void> {
    try {
      await openPathWithTextEditor(invoke, path);
      state.app.notify("edit.opened", { name: label }, "completed", true);
      state.app.lastCommandId = "file.edit";
    } catch (error) {
      state.app.notify("edit.failed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "file.editFailed";
    }
  }

  function handleViewerImageLoad(event: Event): void {
    if (!(event.currentTarget instanceof HTMLImageElement)) return;
    state.viewer.viewer = recordImageNaturalSize(state.viewer.viewer, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
  }

  async function handleViewerKeydown(event: KeyboardEvent): Promise<void> {
    if (!state.viewer.viewer) return;
    event.preventDefault();

    if (event.key === "e" && !(state.viewer.viewer.kind === "text" && state.viewer.viewer.searchMode)) {
      await openEditorForPath(state.viewer.viewer.path, state.viewer.viewer.title);
      return;
    }

    const result = handleViewerKey(state.viewer.viewer, event.key, state.viewer.viewerPageSizeValue);
    state.viewer.viewer = result.viewer;
    if (result.commandId) state.app.lastCommandId = result.commandId;
    if (!state.viewer.viewer) {
      actions.focusActivePaneAfterDialog();
      return;
    }
  }

  return {
    openViewer,
    openImageViewer,
    openWithDefaultApp,
    openEditorForPath,
    handleViewerImageLoad,
    handleViewerKeydown,
  };
}
