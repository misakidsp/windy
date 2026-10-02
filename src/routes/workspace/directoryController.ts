import { invokeErrorMessage } from "../tauriInvoke";
import { invoke } from "@tauri-apps/api/core";
import { largeSearchResultWarningThreshold } from "../constants";
import {
  failedEntriesPatch,
  isStaleLoad,
  loadedEntriesPatch,
  nextLoadGeneration,
} from "../directoryLoadingModel";
import {
  homeDirectory,
  listLocalRoots,
  listGitStatusDirectory,
  listLocalDirectory,
} from "../fileSystemSideEffects";
import {
  createArchiveSource,
  createGitStatusSource,
  createLocalSource,
  createSearchSource,
  createSftpSource,
} from "../paneModel";
import { searchRequestFromSource } from "../searchModel";
import { listArchiveDirectory, listSftpDirectory, searchDirectory } from "../virtualDirectorySideEffects";
import { normalizeSftpRemotePath, parentDirectoryFromArchivePath } from "../pathUtils";
import type { FileOperationJob, PaneId, SearchDirectoryListing, SearchDirectoryRequest } from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

type Dependencies = Pick<WorkspaceActions,
  | "focusActivePaneAfterDialog"
  | "localizedBackendError"
  | "previewOperation"
  | "queueCursorScroll"
  | "sftpReturnPathForPane"
  | "updatePane"
  | "visibleLoadedEntries"
>;

export function createDirectoryController(state: Pick<WorkspaceState, "activity" | "app" | "locations" | "panes" | "search" | "settings" | "terminal">, actions: Dependencies) {
  async function loadDirectory(paneId: PaneId, path: string, preferredCursorKey: string | null = null): Promise<void> {
    const load = nextLoadGeneration(state.panes.loadGenerations, paneId);
    state.panes.loadGenerations = load.generations;
    actions.updatePane(paneId, { loading: true, error: null });

    try {
      const listing = await listLocalDirectory(invoke, path);
      if (isStaleLoad(state.panes.loadGenerations, paneId, load.generation)) return;

      actions.updatePane(
        paneId,
        loadedEntriesPatch(
          createLocalSource(listing.path),
          listing.path,
          listing.entries,
          preferredCursorKey,
          actions.visibleLoadedEntries(paneId, listing.entries),
        ),
      );
      if (paneId === state.panes.activePaneId && !state.terminal.consoleFocused) state.terminal.consoleCwd = listing.path;
      actions.queueCursorScroll(paneId);
    } catch (error) {
      if (isStaleLoad(state.panes.loadGenerations, paneId, load.generation)) return;

      actions.updatePane(paneId, failedEntriesPatch(createLocalSource(path), path, error));
    }
  }

  async function loadGitStatusDirectory(paneId: PaneId, path: string, returnPath: string): Promise<boolean> {
    const load = nextLoadGeneration(state.panes.loadGenerations, paneId);
    state.panes.loadGenerations = load.generations;
    actions.updatePane(paneId, { loading: true, error: null });

    try {
      const listing = await listGitStatusDirectory(invoke, path);
      if (isStaleLoad(state.panes.loadGenerations, paneId, load.generation)) return false;

      actions.updatePane(
        paneId,
        loadedEntriesPatch(
          createGitStatusSource(listing, returnPath),
          listing.displayPath,
          listing.entries,
          null,
          actions.visibleLoadedEntries(paneId, listing.entries),
        ),
      );
      if (paneId === state.panes.activePaneId && !state.terminal.consoleFocused) state.terminal.consoleCwd = returnPath;
      actions.queueCursorScroll(paneId);
      return true;
    } catch (error) {
      if (isStaleLoad(state.panes.loadGenerations, paneId, load.generation)) return false;

      actions.updatePane(
        paneId,
        failedEntriesPatch(
          {
            kind: "gitStatus",
            location: `git:${path}`,
            displayName: `git:${path}`,
            rootPath: path,
            returnPath,
          },
          `git:${path}`,
          error,
        ),
      );
      return false;
    }
  }

  async function loadArchiveDirectory(
    paneId: PaneId,
    archivePath: string,
    innerPath = "",
    preferredCursorKey: string | null = null,
  ): Promise<void> {
    const load = nextLoadGeneration(state.panes.loadGenerations, paneId);
    state.panes.loadGenerations = load.generations;
    actions.updatePane(paneId, { loading: true, error: null });

    try {
      const listing = await listArchiveDirectory(invoke, archivePath, innerPath);
      if (isStaleLoad(state.panes.loadGenerations, paneId, load.generation)) return;

      actions.updatePane(
        paneId,
        loadedEntriesPatch(
          createArchiveSource(listing),
          listing.displayPath,
          listing.entries,
          preferredCursorKey,
          actions.visibleLoadedEntries(paneId, listing.entries),
        ),
      );
      if (paneId === state.panes.activePaneId && !state.terminal.consoleFocused) state.terminal.consoleCwd = parentDirectoryFromArchivePath(archivePath);
      actions.queueCursorScroll(paneId);
    } catch (error) {
      if (isStaleLoad(state.panes.loadGenerations, paneId, load.generation)) return;

      actions.updatePane(
        paneId,
        failedEntriesPatch(
          {
            kind: "archive",
            location: `${archivePath}::/${innerPath}`,
            displayName: `${archivePath}::/${innerPath}`,
            archivePath,
            innerPath,
          },
          `${archivePath}::/${innerPath}`,
          error,
        ),
      );
    }
  }

  async function loadSearchDirectory(
    paneId: PaneId,
    request: SearchDirectoryRequest,
    returnPath: string,
    forceLargeResult = false,
  ): Promise<boolean> {
    const activityId = state.activity.begin({ id: "activity.search", values: { path: request.rootPath } });
    const load = nextLoadGeneration(state.panes.loadGenerations, paneId);
    state.panes.loadGenerations = load.generations;
    actions.updatePane(paneId, { loading: true, error: null });

    try {
      const listing = await searchDirectory(invoke, request, activityId);
      if (isStaleLoad(state.panes.loadGenerations, paneId, load.generation)) { state.activity.finish(activityId, "canceled", { id: "activity.superseded" }); return false; }

      state.activity.finish(activityId, listing.truncated ? "warning" : "completed", { id: listing.truncated ? "search.truncated" : "search.completed", values: { count: listing.entries.length } }, { kind: "search", paneId, listing, request, returnPath });
      if (listing.truncated) {
        state.app.notify("search.truncated", { count: listing.entries.length }, "completed", false);
        state.app.lastCommandId = "search.truncated";
      }

      if (!forceLargeResult && listing.entries.length >= largeSearchResultWarningThreshold) {
        state.search.pendingLargeSearchResult = { paneId, listing, request, returnPath };
        actions.updatePane(paneId, { loading: false, error: null });
        state.app.statusMessage = listing.truncated
          ? state.settings.t("search.truncatedPrompt", { count: listing.entries.length })
          : state.settings.t("search.largePrompt", { count: listing.entries.length });
        state.app.lastCommandId = "search.largeResultWarning";
        actions.focusActivePaneAfterDialog();
        return false;
      }

      applySearchListing(paneId, listing, request, returnPath);
      return true;
    } catch (error) {
      if (isStaleLoad(state.panes.loadGenerations, paneId, load.generation)) { state.activity.finish(activityId, "canceled", { id: "activity.superseded" }); return false; }
      state.activity.finish(activityId, "failed", { id: "search.failed", values: { error: invokeErrorMessage(error) } });

      actions.updatePane(
        paneId,
        failedEntriesPatch(
          {
            kind: "search",
            location: `search:${request.rootPath}`,
            displayName: `search:${request.rootPath}`,
            rootPath: request.rootPath,
            returnPath,
            nameRegex: request.nameRegex,
            recursive: request.recursive,
            minSizeBytes: request.minSizeBytes ?? null,
            maxSizeBytes: request.maxSizeBytes ?? null,
            modifiedAfter: request.modifiedAfter ?? null,
            modifiedBefore: request.modifiedBefore ?? null,
            searchKind: request.kind,
            hiddenMode: request.hiddenMode,
            readonlyMode: request.readonlyMode,
            truncated: false,
          },
          `search:${request.rootPath}`,
          error,
        ),
      );
      return false;
    }
  }

  function applySearchListing(
    paneId: PaneId,
    listing: SearchDirectoryListing,
    request: SearchDirectoryRequest,
    returnPath: string,
  ): void {
    actions.updatePane(
      paneId,
      loadedEntriesPatch(
        createSearchSource(listing, request, returnPath),
        listing.displayPath,
        listing.entries,
        null,
        actions.visibleLoadedEntries(paneId, listing.entries),
      ),
    );
    if (paneId === state.panes.activePaneId && !state.terminal.consoleFocused) state.terminal.consoleCwd = returnPath;
    actions.queueCursorScroll(paneId);
  }

  async function loadSftpDirectory(
    paneId: PaneId,
    connectionId: string,
    remotePath: string,
    returnPath?: string,
    preferredCursorKey: string | null = null,
  ): Promise<void> {
    const load = nextLoadGeneration(state.panes.loadGenerations, paneId);
    state.panes.loadGenerations = load.generations;
    actions.updatePane(paneId, { loading: true, error: null });

    try {
      const listing = await listSftpDirectory(invoke, connectionId, remotePath);
      if (isStaleLoad(state.panes.loadGenerations, paneId, load.generation)) return;
      const nextReturnPath = returnPath ?? actions.sftpReturnPathForPane(state.panes.panes[paneId]);

      actions.updatePane(
        paneId,
        loadedEntriesPatch(
          createSftpSource(listing, nextReturnPath),
          listing.displayPath,
          listing.entries,
          preferredCursorKey,
          actions.visibleLoadedEntries(paneId, listing.entries),
        ),
      );
      actions.queueCursorScroll(paneId);
    } catch (error) {
      if (isStaleLoad(state.panes.loadGenerations, paneId, load.generation)) return;

      const normalizedPath = normalizeSftpRemotePath(remotePath);
      const nextReturnPath = returnPath ?? actions.sftpReturnPathForPane(state.panes.panes[paneId]);
      actions.updatePane(
        paneId,
        failedEntriesPatch(
          {
            kind: "sftp",
            location: `sftp://${connectionId}${normalizedPath}`,
            displayName: `sftp:${connectionId}:${normalizedPath}`,
            connectionId,
            remotePath: normalizedPath,
            returnPath: nextReturnPath,
          },
          `sftp:${connectionId}:${normalizedPath}`,
          error,
        ),
      );
    }
  }

  async function reloadPanesAfterOperation(job: FileOperationJob): Promise<void> {
    const paneIds = new Set<PaneId>([job.sourcePaneId]);
    if (job.destinationPaneId) paneIds.add(job.destinationPaneId);

    await Promise.all(
      [...paneIds].map((paneId) => {
        const pane = state.panes.panes[paneId];
        if (pane.source.kind === "archive") {
          return loadArchiveDirectory(paneId, pane.source.archivePath, pane.source.innerPath);
        }
        if (pane.source.kind === "sftp") {
          return loadSftpDirectory(paneId, pane.source.connectionId, pane.source.remotePath, pane.source.returnPath);
        }
        if (pane.source.kind === "search") {
          return loadSearchDirectory(paneId, searchRequestFromSource(pane.source), pane.source.returnPath);
        }
        if (pane.source.kind === "diff") {
          return loadDirectory(paneId, pane.source.returnPath || pane.source.basePath);
        }
        if (pane.source.kind === "operationResult") {
          return loadDirectory(paneId, pane.source.returnPath);
        }
        if (pane.source.kind === "gitStatus") {
          return loadGitStatusDirectory(paneId, pane.source.rootPath, pane.source.returnPath);
        }
        return pane.currentPath ? loadDirectory(paneId, pane.currentPath) : Promise.resolve();
      }),
    );
  }

  async function refreshActivePane(): Promise<void> {
    const paneId = state.panes.activePaneId;
    const pane = state.panes.panes[paneId];
    if (pane.source.kind === "archive") {
      await loadArchiveDirectory(paneId, pane.source.archivePath, pane.source.innerPath);
      actions.previewOperation("refresh");
      return;
    }

    if (pane.source.kind === "sftp") {
      await loadSftpDirectory(paneId, pane.source.connectionId, pane.source.remotePath, pane.source.returnPath);
      actions.previewOperation("refresh");
      return;
    }

    if (pane.source.kind === "search") {
      await loadSearchDirectory(paneId, searchRequestFromSource(pane.source), pane.source.returnPath);
      actions.previewOperation("refresh");
      return;
    }

    if (pane.source.kind === "diff") {
      await loadDirectory(paneId, pane.source.returnPath || pane.source.basePath);
      actions.previewOperation("refresh");
      return;
    }

    if (pane.source.kind === "operationResult") {
      await loadDirectory(paneId, pane.source.returnPath);
      actions.previewOperation("refresh");
      return;
    }

    if (pane.source.kind === "gitStatus") {
      await loadGitStatusDirectory(paneId, pane.source.rootPath, pane.source.returnPath);
      actions.previewOperation("refresh");
      return;
    }

    const currentPath = pane.currentPath;
    if (!currentPath) return;

    await loadDirectory(paneId, currentPath);
    actions.previewOperation("refresh");
  }

  async function initializePanes(): Promise<void> {
    try {
      const home = await homeDirectory(invoke);
      try {
        state.locations.localRoots = await listLocalRoots(invoke);
      } catch {
        state.locations.localRoots = ["/"];
      }
      state.locations.homePath = home;
      state.terminal.consoleCwd = home;
      await Promise.all([loadDirectory("left", home), loadDirectory("right", home)]);
    } catch (error) {
      const message = state.settings.t("status.initializationFailed", { error: actions.localizedBackendError(error) });
      actions.updatePane("left", { loading: false, error: message });
      actions.updatePane("right", { loading: false, error: message });
      state.app.statusMessage = message;
      state.app.lastCommandId = "app.initializeFailed";
    }
  }

  return {
    loadDirectory,
    loadGitStatusDirectory,
    loadArchiveDirectory,
    loadSearchDirectory,
    applySearchListing,
    loadSftpDirectory,
    reloadPanesAfterOperation,
    refreshActivePane,
    initializePanes,
  };
}
