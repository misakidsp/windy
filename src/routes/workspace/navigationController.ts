import { invoke } from "@tauri-apps/api/core";
import { parentDirectory, rootDirectory } from "../fileSystemSideEffects";
import { otherPaneId } from "../paneModel";
import { defaultAppOpenAction, focusedEntry, focusedOpenAction } from "../fileOpenModel";
import { searchReturnPathForPane, searchRootPathForPane } from "../searchModel";
import {
  archiveParentInnerPath,
  normalizeSftpRemotePath,
  parentDirectoryFromArchivePath,
  sftpParentRemotePath,
} from "../pathUtils";
import type { PaneState } from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

type Dependencies = Pick<WorkspaceActions,
  | "focusActivePaneAfterDialog"
  | "isSupportedArchiveName"
  | "loadArchiveDirectory"
  | "loadDirectory"
  | "loadGitStatusDirectory"
  | "loadSftpDirectory"
  | "localizedBackendError"
  | "openEditorForPath"
  | "openViewer"
  | "openWithDefaultApp"
  | "queueCursorScroll"
  | "visibleEntries"
>;

export function createNavigationController(state: Pick<WorkspaceState, "app" | "locations" | "panes" | "settings" | "terminal">, actions: Dependencies) {
  function paneConsolePath(pane: PaneState): string {
    if (pane.source.kind === "local") return pane.currentPath;
    if (pane.source.kind === "archive") return parentDirectoryFromArchivePath(pane.source.archivePath);
    if (pane.source.kind === "search") return pane.source.returnPath;
    if (pane.source.kind === "diff") return pane.source.returnPath;
    if (pane.source.kind === "operationResult") return pane.source.returnPath;
    if (pane.source.kind === "gitStatus") return pane.source.returnPath || pane.source.rootPath;
    return state.terminal.consoleCwd;
  }

  function sftpReturnPathForPane(pane: PaneState): string {
    if (pane.source.kind === "sftp") return pane.source.returnPath;
    if (pane.source.kind === "search") return pane.source.returnPath;
    if (pane.source.kind === "diff") return pane.source.returnPath;
    if (pane.source.kind === "operationResult") return pane.source.returnPath;
    if (pane.source.kind === "gitStatus") return pane.source.returnPath || pane.source.rootPath;
    if (pane.source.kind === "local" && pane.currentPath) return pane.currentPath;
    if (pane.source.kind === "archive") return parentDirectoryFromArchivePath(pane.source.archivePath);
    return state.terminal.consoleCwd;
  }

  function focusOtherPane(): void {
    state.panes.activePaneId = otherPaneId(state.panes.activePaneId);
    if (!state.terminal.consoleFocused) state.terminal.consoleCwd = paneConsolePath(state.panes.panes[state.panes.activePaneId]);
    actions.queueCursorScroll(state.panes.activePaneId);
    state.app.lastCommandId = "pane.focusOther";
  }

  async function goParent(): Promise<void> {
    const paneId = state.panes.activePaneId;
    const pane = state.panes.panes[paneId];
    if (pane.source.kind === "search") {
      state.app.lastCommandId = "search.returnToRoot";
      await actions.loadDirectory(paneId, pane.source.returnPath || pane.source.rootPath);
      return;
    }

    if (pane.source.kind === "diff") {
      state.app.lastCommandId = "diff.returnToRoot";
      await actions.loadDirectory(paneId, pane.source.returnPath || pane.source.basePath);
      return;
    }

    if (pane.source.kind === "operationResult") {
      state.app.lastCommandId = "operationResult.returnToRoot";
      await actions.loadDirectory(paneId, pane.source.returnPath);
      return;
    }

    if (pane.source.kind === "gitStatus") {
      state.app.lastCommandId = "git.returnToRoot";
      await actions.loadDirectory(paneId, pane.source.returnPath || pane.source.rootPath);
      return;
    }

    if (pane.source.kind === "archive") {
      const parentInnerPath = archiveParentInnerPath(pane.source.innerPath);
      if (parentInnerPath === null) {
        await actions.loadDirectory(paneId, parentDirectoryFromArchivePath(pane.source.archivePath), pane.source.archivePath);
      } else {
        state.app.lastCommandId = "entry.goParent";
        await actions.loadArchiveDirectory(
          paneId,
          pane.source.archivePath,
          parentInnerPath,
          `${pane.source.archivePath}::/${pane.source.innerPath}`,
        );
      }
      return;
    }

    if (pane.source.kind === "sftp") {
      const parentPath = sftpParentRemotePath(pane.source.remotePath);
      if (parentPath) {
        state.app.lastCommandId = "remote.goParent";
        await actions.loadSftpDirectory(
          paneId,
          pane.source.connectionId,
          parentPath,
          pane.source.returnPath,
          `sftp://${pane.source.connectionId}${normalizeSftpRemotePath(pane.source.remotePath)}`,
        );
      }
      return;
    }

    const currentPath = pane.currentPath;
    if (!currentPath) return;

    const parent = await parentDirectory(invoke, currentPath);
    if (parent) {
      state.app.lastCommandId = "entry.goParent";
      await actions.loadDirectory(paneId, parent, currentPath);
    }
  }

  async function goRoot(): Promise<void> {
    const pane = state.panes.panes[state.panes.activePaneId];
    if (pane.source.kind === "search") {
      state.app.lastCommandId = "entry.goRoot";
      await actions.loadDirectory(state.panes.activePaneId, pane.source.rootPath);
      return;
    }

    if (pane.source.kind === "gitStatus") {
      state.app.lastCommandId = "entry.goRoot";
      await actions.loadDirectory(state.panes.activePaneId, pane.source.rootPath);
      return;
    }

    if (pane.source.kind !== "local") {
      state.app.notify("navigation.rootLocalOnly", undefined, "warning", true);
      state.app.lastCommandId = "entry.goRoot.unsupportedSource";
      return;
    }

    const root = await rootDirectory(invoke, pane.currentPath);
    state.app.lastCommandId = "entry.goRoot";
    await actions.loadDirectory(state.panes.activePaneId, root);
  }

  async function goHome(): Promise<void> {
    if (!state.locations.homePath) {
      state.app.notify("navigation.homeUnavailable", undefined, "warning", true);
      state.app.lastCommandId = "entry.goHome.unavailable";
      return;
    }

    if (state.panes.panes[state.panes.activePaneId].source.kind === "search") {
      state.app.lastCommandId = "entry.goHome";
      await actions.loadDirectory(state.panes.activePaneId, state.locations.homePath);
      return;
    }

    if (state.panes.panes[state.panes.activePaneId].source.kind === "gitStatus") {
      state.app.lastCommandId = "entry.goHome";
      await actions.loadDirectory(state.panes.activePaneId, state.locations.homePath);
      return;
    }

    if (state.panes.panes[state.panes.activePaneId].source.kind !== "local") {
      state.app.notify("navigation.homeLocalOnly", undefined, "warning", true);
      state.app.lastCommandId = "entry.goHome.unsupportedSource";
      return;
    }

    state.app.lastCommandId = "entry.goHome";
    await actions.loadDirectory(state.panes.activePaneId, state.locations.homePath);
  }

  async function openOtherPanePathHere(): Promise<void> {
    const sourcePane = state.panes.panes[otherPaneId(state.panes.activePaneId)];
    if (
      sourcePane.source.kind !== "local" &&
      sourcePane.source.kind !== "search" &&
      sourcePane.source.kind !== "operationResult" &&
      sourcePane.source.kind !== "gitStatus"
    ) {
      state.app.notify("navigation.otherPanePathLocalOnly", undefined, "warning", true);
      state.app.lastCommandId = "pane.openOtherPathHere.unsupportedSource";
      return;
    }

    state.app.lastCommandId = "pane.openOtherPathHere";
    await actions.loadDirectory(
      state.panes.activePaneId,
      sourcePane.source.kind === "search" || sourcePane.source.kind === "operationResult" || sourcePane.source.kind === "gitStatus"
        ? sourcePane.source.returnPath
        : sourcePane.currentPath,
    );
  }

  async function openCurrentPathInOtherPane(): Promise<void> {
    const sourcePane = state.panes.panes[state.panes.activePaneId];
    if (
      sourcePane.source.kind !== "local" &&
      sourcePane.source.kind !== "search" &&
      sourcePane.source.kind !== "operationResult" &&
      sourcePane.source.kind !== "gitStatus"
    ) {
      state.app.notify("navigation.currentPathOtherPaneLocalOnly", undefined, "warning", true);
      state.app.lastCommandId = "pane.openCurrentPathInOther.unsupportedSource";
      return;
    }

    const destinationPaneId = otherPaneId(state.panes.activePaneId);
    state.app.lastCommandId = "pane.openCurrentPathInOther";
    await actions.loadDirectory(
      destinationPaneId,
      sourcePane.source.kind === "search" || sourcePane.source.kind === "operationResult" || sourcePane.source.kind === "gitStatus"
        ? sourcePane.source.returnPath
        : sourcePane.currentPath,
    );
  }

  async function openFocused(): Promise<void> {
    const paneId = state.panes.activePaneId;
    const pane = state.panes.panes[paneId];
    const entries = actions.visibleEntries(pane);
    const entry = focusedEntry(pane, entries);
    if (!entry) return;

    state.app.lastCommandId = "entry.openFocused";
    const action = focusedOpenAction(pane, entry, actions.isSupportedArchiveName);
    if (action.type === "openArchiveDirectory") {
      await actions.loadArchiveDirectory(paneId, action.archivePath, action.innerPath);
    } else if (action.type === "openSftpDirectory") {
      await actions.loadSftpDirectory(paneId, action.connectionId, action.remotePath, action.returnPath);
    } else if (action.type === "openLocalDirectory") {
      await actions.loadDirectory(paneId, action.path);
    } else if (action.type === "openArchiveFile") {
      await actions.loadArchiveDirectory(paneId, action.path);
    } else {
      await actions.openViewer(action.entry);
    }
  }

  async function openFocusedWithDefaultApp(): Promise<void> {
    const pane = state.panes.panes[state.panes.activePaneId];
    const entry = focusedEntry(pane, actions.visibleEntries(pane));
    if (!entry) return;

    const action = defaultAppOpenAction(pane, entry);
    if (action.type === "unsupported") {
      state.app.notify("open.virtualDefaultUnsupported", undefined, "warning", true);
      state.app.lastCommandId = action.commandId;
      return;
    }

    await actions.openWithDefaultApp(action.entry);
  }

  async function editFocused(): Promise<void> {
    const pane = state.panes.panes[state.panes.activePaneId];
    if (pane.source.kind === "archive" || pane.source.kind === "sftp") {
      state.app.notify("edit.localFilesOnly", undefined, "warning", true);
      state.app.lastCommandId = "file.edit.unsupportedSource";
      return;
    }

    const entry = focusedEntry(pane, actions.visibleEntries(pane));
    if (!entry) return;
    if (entry.kind !== "file") {
      state.app.notify("edit.filesOnly", undefined, "warning", true);
      state.app.lastCommandId = "file.edit.unsupportedEntry";
      return;
    }

    await actions.openEditorForPath(entry.path, entry.name);
  }

  async function openGitStatusSource(): Promise<void> {
    const pane = state.panes.panes[state.panes.activePaneId];
    const path = searchRootPathForPane(pane);
    if (!path) {
      state.app.notify("git.localLikeOnly", undefined, "warning", true);
      state.app.lastCommandId = "git.openStatus.unsupportedSource";
      return;
    }

    const applied = await actions.loadGitStatusDirectory(state.panes.activePaneId, path, searchReturnPathForPane(pane, state.terminal.consoleCwd));
    if (applied) {
      state.app.notify("git.changedFiles", { count: state.panes.panes[state.panes.activePaneId].entries.length }, "completed", true);
      state.app.lastCommandId = "git.openStatus";
    } else {
      state.app.statusMessage = state.panes.panes[state.panes.activePaneId].error ? state.settings.t("git.failed", { error: actions.localizedBackendError(state.panes.panes[state.panes.activePaneId].error ?? "") }) : state.settings.t("git.canceled");
      state.app.lastCommandId = "git.openStatus.failed";
    }
    actions.focusActivePaneAfterDialog();
  }

  return {
    paneConsolePath,
    sftpReturnPathForPane,
    focusOtherPane,
    goParent,
    goRoot,
    goHome,
    openOtherPanePathHere,
    openCurrentPathInOtherPane,
    openFocused,
    openFocusedWithDefaultApp,
    editFocused,
    openGitStatusSource,
  };
}
