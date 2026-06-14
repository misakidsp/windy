<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import "@xterm/xterm/css/xterm.css";
  import { onMount, tick } from "svelte";

  import ExternalCommandDialog from "./ExternalCommandDialog.svelte";
  import FilePropertiesDialog from "./FilePropertiesDialog.svelte";
  import FilePane from "./FilePane.svelte";
  import InternalViewer from "./InternalViewer.svelte";
  import KeyHelpOverlay from "./KeyHelpOverlay.svelte";
  import LargeSearchResultDialog from "./LargeSearchResultDialog.svelte";
  import LocationManagerDialog from "./LocationManagerDialog.svelte";
  import OperationConfirmationDialog from "./OperationConfirmationDialog.svelte";
  import OperationFailureDialog from "./OperationFailureDialog.svelte";
  import PaneDiffDialog from "./PaneDiffDialog.svelte";
  import PreferencesDialog from "./PreferencesDialog.svelte";
  import SearchDialog from "./SearchDialog.svelte";
  import StatusBar from "./StatusBar.svelte";
  import TerminalPane from "./TerminalPane.svelte";
  import {
    archiveExtensions,
    defaultConsoleHeightRatio,
    defaultPageSize,
    imageViewerExtensions,
    largeSearchResultWarningThreshold,
    moveCursorAfterSelection,
    showParentEntry,
    textViewerExtensions,
    virtualListOverscan,
  } from "./constants";
  import {
    getAppearanceSettings,
    getAppSettings,
    getKeybindSettings,
    getLanguageSettings,
    getSafeModeStatus,
    enterSafeMode,
    listLanguagePresets,
    listExternalCommands,
    openConfigDirectory,
    applyLanguagePreset,
    resetAppearanceSettings,
    resetAppSettings,
    resetKeybindSettings,
    resetLanguageSettings,
    saveAppearanceSettings,
    saveAppSettings,
    saveKeybindSettings,
    saveOperationFailureLog as saveOperationFailureLogEffect,
  } from "./appSideEffects";
  import { applyAppearanceToRoot, defaultAppearanceSettings, fileRowHeightSetting, fontFamilySetting, normalizedExtensionColorMap } from "./appearanceModel";
  import {
    filteredCursorPatch,
    visibleEntriesFor,
  } from "./fileListModel";
  import {
    failedEntriesPatch,
    isStaleLoad,
    loadedEntriesPatch,
    nextLoadGeneration,
  } from "./directoryLoadingModel";
  import {
    homeDirectory,
    listLocalRoots,
    listGitStatusDirectory,
    listLocalDirectory,
    cancelDetailedDiff,
    compareLocalDirectoriesDetailed,
    openPathWithDefaultApp,
    openPathWithTextEditor,
    parentDirectory,
    rootDirectory,
  } from "./fileSystemSideEffects";
  import { entryClass, entryExtensionColor, focusedEntryPath, formatDate, formatSize, paneMeta } from "./displayModel";
  import {
    clampExternalCommandCursor,
    clipboardNameTextForCommandTargets,
    clipboardTextForCommandTargets,
    externalCommandLines,
    localCommandTargets,
    markedCommandTargetsForPane,
    shellQuotePath,
    selectedCommandTargetsForPane,
    type ExternalCommandContext,
  } from "./externalCommandModel";
  import {
    classifyConfirmationDialogKey,
    classifyExternalCommandDialogKey,
    classifyFilePropertiesDialogKey,
    classifyLargeSearchResultDialogKey,
    classifyLocationDialogKey,
    classifyOperationFailureDialogKey,
    classifyPaneDiffDialogKey,
    classifySearchDialogKey,
    type ConfirmationDialogKeyAction,
    type ExternalCommandDialogKeyAction,
    type FilePropertiesDialogKeyAction,
    type LargeSearchResultDialogKeyAction,
    type LocationDialogKeyAction,
    type OperationFailureDialogKeyAction,
    type PaneDiffDialogKeyAction,
    type SearchDialogKeyAction,
  } from "./dialogKeyboardModel";
  import { createEmptySftpForm } from "./forms";
  import {
    baseName,
    createArchiveSource,
    createDiffSource,
    createGitStatusSource,
    createLocalSource,
    createOperationResultSource,
    createPane,
    createSearchSource,
    createSftpSource,
    otherPaneId,
    paneHeaderLabel,
  } from "./paneModel";
  import {
    buildLocationOptions as buildLocationOptionsModel,
    clampLocationCursor,
    localFavoriteNameFromPath,
    locationOptionKey,
    locationProfileIndex as findLocationProfileIndex,
    validateSftpConnectionForm,
    validateSftpProfileForm,
  } from "./locationManagerModel";
  import {
    focusedLocationOption,
    locationSelectionAction,
    locationSelectionRequiresLeavingSftp,
  } from "./locationSelectionModel";
  import {
    defaultAppOpenAction,
    focusedEntry,
    focusedOpenAction,
    viewerOpenAction,
  } from "./fileOpenModel";
  import {
    acceptKnownHostPromptState,
    acceptSftpConnectSuccessState,
    armDeleteLocalFavoriteState,
    armDeleteSearchProfileState,
    armDeleteSftpProfileState,
    beginSftpConnectState,
    cancelKnownHostState,
    clearPendingDeletesState,
    closeManagerState,
    finishSftpConnectState,
    openManagerState,
    openNewSftpFormState,
    openSftpProfileFormState,
    patchSftpAuthKindState,
    patchSftpFormState,
    rejectSftpConnectState,
    returnToManagerState,
    type LocationDialogStatePatch,
  } from "./locationDialogState";
  import {
    deleteLocalFavoriteProfile,
    deleteSearchProfile,
    deleteSftpConnectionProfile,
    disconnectSftpSession,
    listActiveSftpSessions,
    loadLocationProfiles,
    parseKnownHostPrompt,
    saveLocalFavoriteProfile,
    saveSearchProfile,
    saveSftpConnectionProfile,
    testSftpConnection,
  } from "./locationSideEffects";
  import {
    createEmptySearchForm,
    searchFormFromRequest,
    searchProfileMatchesSource,
    searchProfileNameFromSource,
    searchRequestFromForm,
    searchRequestFromProfile,
    searchRequestFromSource,
    searchReturnPathForPane,
    searchRootPathForPane,
  } from "./searchModel";
  import { listArchiveDirectory, listSftpDirectory, searchDirectory } from "./virtualDirectorySideEffects";
  import {
    classifyPaneKey,
    classifyPrefixKey,
    commandMatchesSingleKey,
    defaultKeybindSettings,
    type PaneKeyAction,
    type PrefixKeyAction,
  } from "./keyboardModel";
  import { runPaneKeyActionWith, runPrefixKeyActionWith } from "./keyActionRunners";
  import { keyHelpGroups } from "./keyHelpModel";
  import { comparePaneEntries, detailedDiffSnapshot, diffEntriesForSide, type PaneDiffSnapshot } from "./diffModel";
  import { paneSourcesSupportDetailedDiff } from "./sourceCapabilityModel";
  import {
    createFileOperationJob as createFileOperationJobModel,
    executionConfirmationMessage as operationExecutionConfirmationMessage,
    operationBlockingMessages as operationBlockingMessagesForEntries,
    operationConflictMessages as operationConflictMessagesForEntries,
    failedOperationEntries,
    operationNameRequired,
    operationSupportedForPaneSources,
    operationTargetPreviewLimit,
    archiveOperationEntries,
    focusedOperationEntries,
    paneOperationPath,
    selectedOperationEntries,
    shouldShowOperationPaths,
    targetSummary,
  } from "./operationJobModel";
  import { operationResultStatus, operationResultTerminalLines } from "./operationResultModel";
  import { cancelFileOperationJob, executeFileOperationJob } from "./operationSideEffects";
  import {
    createFilePropertySnapshot,
    type FilePropertySnapshot,
  } from "./propertyModel";
  import { createUndoSnapshot, undoSafetyMessages } from "./undoModel";
  import {
    archiveEntryPath,
    archiveParentInnerPath,
    fileExtension,
    normalizeSftpRemotePath,
    parentDirectoryFromArchivePath,
    sftpParentRemotePath,
  } from "./pathUtils";
  import { createTerminalInstance, type XtermFitAddon, type XtermTerminal } from "./terminalFactory";
  import { runTerminalCopyModeKeyActionWith, runTerminalShortcutActionWith } from "./terminalActionRunners";
  import {
    handleTerminalKeyRepeatState,
    stopTerminalKeyRepeatState,
    terminalCopyModeKeyAction,
    terminalShortcutAction,
    type TerminalShortcutAction,
  } from "./terminalKeyHandling";
  import { terminalInputForKeyboardEvent } from "./terminalKeys";
  import {
    resizeTerminal,
    startLocalTerminal,
    startSftpTerminal,
    stopTerminal,
    writeTerminalInput,
  } from "./terminalSideEffects";
  import {
    acceptTerminalExit,
    acceptTerminalOutput,
    beginTerminalCopyMode,
    beginTerminalStart,
    completeTerminalStart,
    consumeSuppressedTerminalData as consumeTerminalSuppressedData,
    createTerminalCopyModeState,
    createTerminalSessionState,
    exitTerminalCopyMode as createExitedTerminalCopyMode,
    failTerminalStart,
    markTerminalStopping,
    moveTerminalCopyCursor as moveTerminalCopyCursorState,
    resetTerminalSession,
    setTerminalCopyCursorColumn,
    suppressTerminalDataEcho,
    terminalCopySelectionRange,
    type TerminalCopyModeState,
    type TerminalSessionState,
  } from "./terminalState";
  import { readViewerImageFile, readViewerTextFile } from "./viewerSideEffects";
  import { handleViewerKey, recordImageNaturalSize, viewerPageSizeForElement } from "./viewerActions";
  import type {
    ActiveSftpSession,
    AppearanceSettings,
    AppSettings,
    CommandTarget,
    EntryKind,
    ExternalCommandDefinition,
    FileEntry,
    FileOperationJob,
    FileOperationKind,
    FileOperationResult,
    FileOperationResultItem,
    KeybindSettings,
    LanguagePresetInfo,
    LanguageSettings,
    LocalFavoriteProfile,
    LocationDialogMode,
    LocationOption,
    OperationResultSettings,
    OperationResultSnapshot,
    PaneId,
    PaneSource,
    PaneSourceKind,
    PaneState,
    PendingKnownHost,
    PendingLargeSearchResult,
    PrefixKey,
    SearchDialogForm,
    SearchDirectoryListing,
    SearchDirectoryRequest,
    SearchProfile,
    SftpConnectionForm,
    SftpConnectionProfile,
    SftpConnectionTestResult,
    SftpPaneSource,
    SftpSessionLifecycle,
    SftpSessionSettings,
    SortMode,
    TerminalExit,
    TerminalOutput,
    TerminalRepeatState,
    UndoSnapshot,
    ViewerState,
    VirtualEntryWindow,
    VisibleEntriesCache,
  } from "./types";

  let activePaneId: PaneId = "left";
  let appSettings: AppSettings = {
    useTrash: true,
    operationResult: {
      showStatus: true,
      showFailureDialog: true,
      printToTerminal: false,
      saveFailureLog: true,
    },
    operationCancel: {
      doubleEscEnabled: true,
      doubleEscWindowMs: 700,
    },
    externalEditor: {
      command: "",
      args: [],
    },
    sftpSession: {
      lifecycle: "keepRecent",
      maxSessions: 2,
      idleDisconnectMinutes: 0,
    },
    sftpTransfer: {
      partFileThresholdBytes: 1024 * 1024,
    },
  };
  let appearanceSettings: AppearanceSettings = defaultAppearanceSettings;
  let keybindSettings: KeybindSettings = defaultKeybindSettings;
  let languageSettings: LanguageSettings = {
    schemaVersion: 1,
    locale: "en",
    messages: {},
  };
  let languagePresets: LanguagePresetInfo[] = [];
  let preferencesDialogOpen = false;
  let preferencesLoading = false;
  let preferencesError = "";
  let keyHelpVisible = false;
  let lastCommandId = "app.start";
  let lastKey = "";
  let statusMessage = "Ready.";
  let prefixMode: PrefixKey | null = null;
  let operationJob: FileOperationJob | null = null;
  let operationResult: FileOperationResult | null = null;
  let operationFailureDialog: OperationResultSnapshot | null = null;
  let filePropertiesDialog: FilePropertySnapshot | null = null;
  let paneDiffDialog: PaneDiffSnapshot | null = null;
  let paneDiffListElement: HTMLDivElement | null = null;
  let detailedDiffRunning = false;
  let detailedDiffJobId: string | null = null;
  let detailedDiffCancelRequested = false;
  let undoStack: UndoSnapshot[] = [];
  let redoStack: UndoSnapshot[] = [];
  let activeUndoSnapshot: UndoSnapshot | null = null;
  let activeRedoSnapshot: UndoSnapshot | null = null;
  let confirmationDialogOpen = false;
  let operationRunning = false;
  let operationCancelRequested = false;
  let operationCancelConfirmOpen = false;
  let operationCancelConfirmOpenedAt = 0;
  let operationNameInputElement: HTMLInputElement | null = null;
  let appShellElement: HTMLElement | null = null;
  let searchDialogOpen = false;
  let searchRunning = false;
  let searchError = "";
  let searchRegexInputElement: HTMLInputElement | null = null;
  let searchForm: SearchDialogForm = createEmptySearchForm();
  let pendingLargeSearchResult: PendingLargeSearchResult | null = null;
  let sftpDialogOpen = false;
  let locationDialogMode: LocationDialogMode = "manager";
  let locationCursorIndex = 0;
  let locationProfilesLoading = false;
  let locationProfilesLoaded = false;
  let locationProfilesLoadPromise: Promise<void> | null = null;
  let locationProfilesError = "";
  let pendingDeleteProfile: SftpConnectionProfile | null = null;
  let pendingDeleteLocalFavorite: LocalFavoriteProfile | null = null;
  let pendingDeleteSearchProfile: SearchProfile | null = null;
  let homePath = "";
  let localRoots: string[] = [];
  let localFavorites: LocalFavoriteProfile[] = [];
  let searchProfiles: SearchProfile[] = [];
  let sftpProfiles: SftpConnectionProfile[] = [];
  let activeSftpSessions: ActiveSftpSession[] = [];
  let sftpConnecting = false;
  let sftpConnectionResult: SftpConnectionTestResult | null = null;
  let sftpConnectionError = "";
  let pendingKnownHost: PendingKnownHost | null = null;
  let sftpHostInputElement: HTMLInputElement | null = null;
  let sftpPasswordInputElement: HTMLInputElement | null = null;
  let sftpForm: SftpConnectionForm = createEmptySftpForm();
  let imeComposing = false;
  let viewer: ViewerState | null = null;
  let viewerElement: HTMLElement | null = null;
  let consoleVisible = true;
  let consoleFocused = false;
  let consoleCwd = "";
  let terminalFullscreen = false;
  let terminalElement: HTMLElement | null = null;
  let terminal: XtermTerminal | null = null;
  let terminalFit: XtermFitAddon | null = null;
  let terminalUnlisten: UnlistenFn | null = null;
  let terminalExitUnlisten: UnlistenFn | null = null;
  let preferencesUnlisten: UnlistenFn | null = null;
  let terminalSession: TerminalSessionState = createTerminalSessionState();
  let terminalCopyMode: TerminalCopyModeState = createTerminalCopyModeState();
  let terminalRepeatState: TerminalRepeatState | null = null;
  let commandDialogOpen = false;
  let externalCommands: ExternalCommandDefinition[] = [];
  let externalCommandCursorIndex = 0;
  let externalCommandsLoading = false;
  let externalCommandError = "";
  let loadGenerations: Record<PaneId, number> = { left: 0, right: 0 };
  let listElements: Record<PaneId, HTMLElement | null> = {
    left: null,
    right: null,
  };
  let paneScrollTops: Record<PaneId, number> = {
    left: 0,
    right: 0,
  };
  let visibleEntriesCache: Partial<Record<PaneId, VisibleEntriesCache>> = {};
  let filterInputElements: Record<PaneId, HTMLInputElement | null> = {
    left: null,
    right: null,
  };
  let panes: Record<PaneId, PaneState> = {
    left: createPane("left", "左ペイン"),
    right: createPane("right", "右ペイン"),
  };
  let locationOptionItems: LocationOption[] = [];

  function applyLocationDialogStatePatch(patch: LocationDialogStatePatch): void {
    if (patch.sftpDialogOpen !== undefined) sftpDialogOpen = patch.sftpDialogOpen;
    if (patch.locationDialogMode !== undefined) locationDialogMode = patch.locationDialogMode;
    if (patch.locationCursorIndex !== undefined) locationCursorIndex = patch.locationCursorIndex;
    if (patch.sftpConnecting !== undefined) sftpConnecting = patch.sftpConnecting;
    if (patch.sftpConnectionError !== undefined) sftpConnectionError = patch.sftpConnectionError;
    if (patch.sftpConnectionResult !== undefined) sftpConnectionResult = patch.sftpConnectionResult;
    if (patch.pendingKnownHost !== undefined) pendingKnownHost = patch.pendingKnownHost;
    if (patch.pendingDeleteProfile !== undefined) pendingDeleteProfile = patch.pendingDeleteProfile;
    if (patch.pendingDeleteLocalFavorite !== undefined) pendingDeleteLocalFavorite = patch.pendingDeleteLocalFavorite;
    if (patch.pendingDeleteSearchProfile !== undefined) pendingDeleteSearchProfile = patch.pendingDeleteSearchProfile;
    if (patch.sftpForm !== undefined) sftpForm = patch.sftpForm;
    if (patch.imeComposing !== undefined) imeComposing = patch.imeComposing;
  }

  function paneConsolePath(pane: PaneState): string {
    if (pane.source.kind === "local") return pane.currentPath;
    if (pane.source.kind === "archive") return parentDirectoryFromArchivePath(pane.source.archivePath);
    if (pane.source.kind === "search") return pane.source.returnPath;
    if (pane.source.kind === "diff") return pane.source.returnPath;
    if (pane.source.kind === "operationResult") return pane.source.returnPath;
    if (pane.source.kind === "gitStatus") return pane.source.returnPath || pane.source.rootPath;
    return consoleCwd;
  }

  function sftpReturnPathForPane(pane: PaneState): string {
    if (pane.source.kind === "sftp") return pane.source.returnPath;
    if (pane.source.kind === "search") return pane.source.returnPath;
    if (pane.source.kind === "diff") return pane.source.returnPath;
    if (pane.source.kind === "operationResult") return pane.source.returnPath;
    if (pane.source.kind === "gitStatus") return pane.source.returnPath || pane.source.rootPath;
    if (pane.source.kind === "local" && pane.currentPath) return pane.currentPath;
    if (pane.source.kind === "archive") return parentDirectoryFromArchivePath(pane.source.archivePath);
    return consoleCwd;
  }

  async function loadDirectory(paneId: PaneId, path: string, preferredCursorKey: string | null = null): Promise<void> {
    const load = nextLoadGeneration(loadGenerations, paneId);
    loadGenerations = load.generations;
    updatePane(paneId, { loading: true, error: null });

    try {
      const listing = await listLocalDirectory(invoke, path);
      if (isStaleLoad(loadGenerations, paneId, load.generation)) return;

      updatePane(
        paneId,
        loadedEntriesPatch(
          createLocalSource(listing.path),
          listing.path,
          listing.entries,
          preferredCursorKey,
          visibleLoadedEntries(paneId, listing.entries),
        ),
      );
      if (paneId === activePaneId && !consoleFocused) consoleCwd = listing.path;
      queueCursorScroll(paneId);
    } catch (error) {
      if (isStaleLoad(loadGenerations, paneId, load.generation)) return;

      updatePane(paneId, failedEntriesPatch(createLocalSource(path), path, error));
    }
  }

  async function loadGitStatusDirectory(paneId: PaneId, path: string, returnPath: string): Promise<boolean> {
    const load = nextLoadGeneration(loadGenerations, paneId);
    loadGenerations = load.generations;
    updatePane(paneId, { loading: true, error: null });

    try {
      const listing = await listGitStatusDirectory(invoke, path);
      if (isStaleLoad(loadGenerations, paneId, load.generation)) return false;

      updatePane(
        paneId,
        loadedEntriesPatch(
          createGitStatusSource(listing, returnPath),
          listing.displayPath,
          listing.entries,
          null,
          visibleLoadedEntries(paneId, listing.entries),
        ),
      );
      if (paneId === activePaneId && !consoleFocused) consoleCwd = returnPath;
      queueCursorScroll(paneId);
      return true;
    } catch (error) {
      if (isStaleLoad(loadGenerations, paneId, load.generation)) return false;

      updatePane(
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
    const load = nextLoadGeneration(loadGenerations, paneId);
    loadGenerations = load.generations;
    updatePane(paneId, { loading: true, error: null });

    try {
      const listing = await listArchiveDirectory(invoke, archivePath, innerPath);
      if (isStaleLoad(loadGenerations, paneId, load.generation)) return;

      updatePane(
        paneId,
        loadedEntriesPatch(
          createArchiveSource(listing),
          listing.displayPath,
          listing.entries,
          preferredCursorKey,
          visibleLoadedEntries(paneId, listing.entries),
        ),
      );
      if (paneId === activePaneId && !consoleFocused) consoleCwd = parentDirectoryFromArchivePath(archivePath);
      queueCursorScroll(paneId);
    } catch (error) {
      if (isStaleLoad(loadGenerations, paneId, load.generation)) return;

      updatePane(
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
    const load = nextLoadGeneration(loadGenerations, paneId);
    loadGenerations = load.generations;
    updatePane(paneId, { loading: true, error: null });

    try {
      const listing = await searchDirectory(invoke, request);
      if (isStaleLoad(loadGenerations, paneId, load.generation)) return false;

      if (listing.truncated) {
        statusMessage = `Search stopped at ${listing.entries.length} item(s). Narrow the query to inspect more.`;
        lastCommandId = "search.truncated";
      }

      if (!forceLargeResult && listing.entries.length >= largeSearchResultWarningThreshold) {
        pendingLargeSearchResult = { paneId, listing, request, returnPath };
        updatePane(paneId, { loading: false, error: null });
        statusMessage = listing.truncated
          ? `Search stopped at ${listing.entries.length} item(s). Press Enter to display or Esc to cancel.`
          : `Search found ${listing.entries.length} item(s). Press Enter to display or Esc to cancel.`;
        lastCommandId = "search.largeResultWarning";
        focusActivePaneAfterDialog();
        return false;
      }

      applySearchListing(paneId, listing, request, returnPath);
      return true;
    } catch (error) {
      if (isStaleLoad(loadGenerations, paneId, load.generation)) return false;

      updatePane(
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
    updatePane(
      paneId,
      loadedEntriesPatch(
        createSearchSource(listing, request, returnPath),
        listing.displayPath,
        listing.entries,
        null,
        visibleLoadedEntries(paneId, listing.entries),
      ),
    );
    if (paneId === activePaneId && !consoleFocused) consoleCwd = returnPath;
    queueCursorScroll(paneId);
  }

  async function loadSftpDirectory(
    paneId: PaneId,
    connectionId: string,
    remotePath: string,
    returnPath?: string,
    preferredCursorKey: string | null = null,
  ): Promise<void> {
    const load = nextLoadGeneration(loadGenerations, paneId);
    loadGenerations = load.generations;
    updatePane(paneId, { loading: true, error: null });

    try {
      const listing = await listSftpDirectory(invoke, connectionId, remotePath);
      if (isStaleLoad(loadGenerations, paneId, load.generation)) return;
      const nextReturnPath = returnPath ?? sftpReturnPathForPane(panes[paneId]);

      updatePane(
        paneId,
        loadedEntriesPatch(
          createSftpSource(listing, nextReturnPath),
          listing.displayPath,
          listing.entries,
          preferredCursorKey,
          visibleLoadedEntries(paneId, listing.entries),
        ),
      );
      queueCursorScroll(paneId);
    } catch (error) {
      if (isStaleLoad(loadGenerations, paneId, load.generation)) return;

      const normalizedPath = normalizeSftpRemotePath(remotePath);
      const nextReturnPath = returnPath ?? sftpReturnPathForPane(panes[paneId]);
      updatePane(
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

  function updatePane(paneId: PaneId, patch: Partial<PaneState>): void {
    const previous = panes[paneId];
    const selectedKeys = patch.selectedKeys ? new Set(patch.selectedKeys) : new Set(previous.selectedKeys);

    panes = {
      ...panes,
      [paneId]: {
        ...previous,
        ...patch,
        selectedKeys,
      },
    };
  }

  function registerList(node: HTMLElement, initialPaneId: PaneId) {
    let paneId = initialPaneId;
    listElements[paneId] = node;

    return {
      update(nextPaneId: PaneId) {
        if (listElements[paneId] === node) listElements[paneId] = null;
        paneId = nextPaneId;
        listElements[paneId] = node;
      },
      destroy() {
        if (listElements[paneId] === node) listElements[paneId] = null;
      },
    };
  }

  function registerFilterInput(node: HTMLInputElement, paneId: PaneId) {
    filterInputElements[paneId] = node;

    return {
      destroy() {
        if (filterInputElements[paneId] === node) filterInputElements[paneId] = null;
      },
    };
  }

  function queueCursorScroll(paneId: PaneId): void {
    void tick().then(() => {
      scrollCursorIntoView(paneId);
    });
  }

  function scrollCursorIntoView(paneId: PaneId): void {
    const list = listElements[paneId];
    const index = panes[paneId].cursorIndex;
    if (!list || index < 0) return;

    const nextScrollTop = scrollTopForCursorIndex(paneId, index);
    list.scrollTop = nextScrollTop;
    paneScrollTops = {
      ...paneScrollTops,
      [paneId]: nextScrollTop,
    };
  }

  function scrollTopForCursorIndex(paneId: PaneId, index: number): number {
    const fileRowHeight = fileRowHeightSetting(appearanceSettings);
    const viewportHeight = listElements[paneId]?.clientHeight ?? defaultPageSize * fileRowHeight;
    const currentScrollTop = paneScrollTops[paneId] ?? 0;
    const rowTop = index * fileRowHeight;
    const rowBottom = rowTop + fileRowHeight;
    const visibleBottom = currentScrollTop + viewportHeight;

    if (rowTop < currentScrollTop) return rowTop;
    if (rowBottom > visibleBottom) return Math.max(0, rowBottom - viewportHeight);
    return currentScrollTop;
  }

  function syncVirtualScrollToCursor(paneId: PaneId, index: number): void {
    if (index < 0) return;
    const nextScrollTop = scrollTopForCursorIndex(paneId, index);
    listElements[paneId]?.scrollTo({ top: nextScrollTop });
    paneScrollTops = {
      ...paneScrollTops,
      [paneId]: nextScrollTop,
    };
  }

  function handleFileListScroll(paneId: PaneId): void {
    paneScrollTops = {
      ...paneScrollTops,
      [paneId]: listElements[paneId]?.scrollTop ?? 0,
    };
  }

  function visibleEntries(pane: PaneState): FileEntry[] {
    const cached = visibleEntriesCache[pane.id];
    if (
      cached &&
      cached.entriesRef === pane.entries &&
      cached.selectedKeysRef === pane.selectedKeys &&
      cached.quickFilterQuery === pane.quickFilterQuery &&
      cached.showHiddenFiles === pane.showHiddenFiles &&
      cached.sortMode === pane.sortMode
    ) {
      return cached.result;
    }

    const result = visibleEntriesFor(pane.entries, pane.selectedKeys, pane.quickFilterQuery, pane.showHiddenFiles, pane.sortMode);
    visibleEntriesCache[pane.id] = {
      entriesRef: pane.entries,
      selectedKeysRef: pane.selectedKeys,
      quickFilterQuery: pane.quickFilterQuery,
      showHiddenFiles: pane.showHiddenFiles,
      sortMode: pane.sortMode,
      result,
    };
    return result;
  }

  function visibleLoadedEntries(paneId: PaneId, entries: FileEntry[]): FileEntry[] {
    const pane = panes[paneId];
    return visibleEntriesFor(entries, new Set(), "", pane.showHiddenFiles, pane.sortMode);
  }

  function virtualEntryWindow(paneId: PaneId, entries: FileEntry[]): VirtualEntryWindow {
    const list = listElements[paneId];
    const fileRowHeight = fileRowHeightSetting(appearanceSettings);
    const viewportHeight = list?.clientHeight ?? defaultPageSize * fileRowHeight;
    const scrollTop = paneScrollTops[paneId] ?? 0;
    const firstVisible = Math.floor(scrollTop / fileRowHeight);
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / fileRowHeight));
    const start = Math.max(0, firstVisible - virtualListOverscan);
    const end = Math.min(entries.length, firstVisible + visibleCount + virtualListOverscan);

    return {
      start,
      end,
      topPadding: start * fileRowHeight,
      bottomPadding: Math.max(0, (entries.length - end) * fileRowHeight),
      entries: entries.slice(start, end),
    };
  }

  function enterQuickFilterInput(paneId: PaneId): void {
    updatePane(paneId, { quickFilterInputActive: true });
    lastCommandId = "filter.startInline";
    void tick().then(() => {
      filterInputElements[paneId]?.focus();
      filterInputElements[paneId]?.select();
    });
  }

  function leaveQuickFilterInput(paneId: PaneId): void {
    updatePane(paneId, { quickFilterInputActive: false });
    lastCommandId = "filter.acceptInline";
    focusActivePaneAfterDialog();
  }

  function clearQuickFilter(paneId: PaneId): void {
    const pane = panes[paneId];
    const entries = visibleEntriesFor(pane.entries, pane.selectedKeys, "", pane.showHiddenFiles, pane.sortMode);
    updatePane(paneId, {
      quickFilterQuery: "",
      quickFilterInputActive: false,
      ...filteredCursorPatch(pane, entries),
    });
    lastCommandId = "filter.cancelInline";
    focusActivePaneAfterDialog();
  }

  function updateQuickFilterQuery(paneId: PaneId, query: string): void {
    const pane = panes[paneId];
    const entries = visibleEntriesFor(pane.entries, pane.selectedKeys, query, pane.showHiddenFiles, pane.sortMode);
    updatePane(paneId, {
      quickFilterQuery: query,
      ...filteredCursorPatch(pane, entries),
    });
    lastCommandId = "filter.updateInlineQuery";
    queueCursorScroll(paneId);
  }

  function handleQuickFilterInputKeydown(event: KeyboardEvent, paneId: PaneId): void {
    if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      leaveQuickFilterInput(paneId);
    } else if (event.key === "Escape") {
      event.preventDefault();
      clearQuickFilter(paneId);
    }
  }

  function moveCursor(delta: number): void {
    const pane = panes[activePaneId];
    if (delta < 0 && pane.cursorIndex <= 0) {
      enterQuickFilterInput(activePaneId);
      return;
    }
    const entries = visibleEntries(pane);
    if (entries.length === 0) return;

    const currentIndex = pane.cursorIndex;
    const nextIndex = Math.min(Math.max((currentIndex < 0 ? 0 : currentIndex) + delta, 0), entries.length - 1);
    updatePane(activePaneId, {
      cursorKey: entries[nextIndex].key,
      cursorIndex: nextIndex,
    });
    syncVirtualScrollToCursor(activePaneId, nextIndex);
    queueCursorScroll(activePaneId);
    lastCommandId = delta < 0 ? "cursor.moveUp" : "cursor.moveDown";
  }

  function moveCursorTo(index: number, commandId: string): void {
    const pane = panes[activePaneId];
    const entries = visibleEntries(pane);
    if (entries.length === 0) return;

    const nextIndex = Math.min(Math.max(index, 0), entries.length - 1);
    updatePane(activePaneId, {
      cursorKey: entries[nextIndex].key,
      cursorIndex: nextIndex,
    });
    syncVirtualScrollToCursor(activePaneId, nextIndex);
    queueCursorScroll(activePaneId);
    lastCommandId = commandId;
  }

  function moveCursorByPage(direction: -1 | 1): void {
    const pane = panes[activePaneId];
    const pageSize = visiblePageSize(activePaneId);
    moveCursorTo(pane.cursorIndex + pageSize * direction, direction < 0 ? "cursor.pageUp" : "cursor.pageDown");
  }

  function startPrefixMode(prefix: PrefixKey): void {
    prefixMode = prefix;
    statusMessage = `prefix: ${prefix}`;
    lastCommandId = `prefix.${prefix}`;
  }

  function handlePrefixKey(event: KeyboardEvent): boolean {
    if (!prefixMode) return false;

    event.preventDefault();
    const action = classifyPrefixKey(prefixMode, event, keybindSettings);
    prefixMode = null;
    void runPrefixKeyAction(action);
    return true;
  }

  async function runPrefixKeyAction(action: PrefixKeyAction): Promise<void> {
    await runPrefixKeyActionWith(action, {
      setStatus(message, commandId) {
        statusMessage = message;
        lastCommandId = commandId;
      },
      goFirst() {
        moveCursorTo(0, "cursor.goFirst");
      },
      goLast() {
        moveCursorTo(visibleEntries(panes[activePaneId]).length - 1, "cursor.goLast");
      },
      previewOperation,
      openExternalCommandDialog,
      openPaneDiffDialog,
      openDetailedPaneDiffDialog,
      openGitStatusSource,
      copySelectedPathsToClipboard,
      copyCurrentDirectoryToClipboard,
      copySelectedNamesToClipboard,
    });
  }

  async function runPaneKeyAction(action: PaneKeyAction): Promise<void> {
    await runPaneKeyActionWith(action, {
      activePaneId: () => activePaneId,
      isRightPaneActive: () => activePaneId === "right",
      toggleTerminalFullscreen,
      toggleConsoleVisibility,
      previewUndoOperation,
      previewRedoOperation,
      openSearchDialog,
      startQuickFilter: enterQuickFilterInput,
      toggleKeyHelp() {
        keyHelpVisible = !keyHelpVisible;
        lastCommandId = keyHelpVisible ? "help.show" : "help.close";
      },
      focusConsole,
      focusOtherPane,
      setLastCommand(commandId) {
        lastCommandId = commandId;
      },
      goRoot,
      goHome,
      openOtherPanePathHere,
      openCurrentPathInOtherPane,
      clearQuickFilter,
      closeOperationPreview,
      extendSelection,
      moveCursor,
      moveCursorByPage,
      goFirst() {
        moveCursorTo(0, "cursor.goFirst");
      },
      goLast() {
        moveCursorTo(visibleEntries(panes[activePaneId]).length - 1, "cursor.goLast");
      },
      goParent,
      openFocusedWithDefaultApp,
      editFocused,
      openFocused,
      openFilePropertiesDialog,
      toggleFocusedSelection,
      selectAllVisible,
      refreshActivePane,
      openLocationManager: openSftpConnectionDialog,
      startPrefixMode,
      openExternalCommandDialog,
      cycleSortMode,
      toggleHiddenFiles,
      previewDeleteOperation,
      previewOperation,
    });
  }

  function visiblePageSize(paneId: PaneId): number {
    const list = listElements[paneId];
    if (!list) return defaultPageSize;

    const fileRowHeight = fileRowHeightSetting(appearanceSettings);
    return Math.max(1, Math.floor(list.clientHeight / fileRowHeight) - 1);
  }

  function focusOtherPane(): void {
    activePaneId = otherPaneId(activePaneId);
    if (!consoleFocused) consoleCwd = paneConsolePath(panes[activePaneId]);
    queueCursorScroll(activePaneId);
    lastCommandId = "pane.focusOther";
  }

  async function goParent(): Promise<void> {
    const paneId = activePaneId;
    const pane = panes[paneId];
    if (pane.source.kind === "search") {
      lastCommandId = "search.returnToRoot";
      await loadDirectory(paneId, pane.source.returnPath || pane.source.rootPath);
      return;
    }

    if (pane.source.kind === "diff") {
      lastCommandId = "diff.returnToRoot";
      await loadDirectory(paneId, pane.source.returnPath || pane.source.basePath);
      return;
    }

    if (pane.source.kind === "operationResult") {
      lastCommandId = "operationResult.returnToRoot";
      await loadDirectory(paneId, pane.source.returnPath);
      return;
    }

    if (pane.source.kind === "gitStatus") {
      lastCommandId = "git.returnToRoot";
      await loadDirectory(paneId, pane.source.returnPath || pane.source.rootPath);
      return;
    }

    if (pane.source.kind === "archive") {
      const parentInnerPath = archiveParentInnerPath(pane.source.innerPath);
      if (parentInnerPath === null) {
        await loadDirectory(paneId, parentDirectoryFromArchivePath(pane.source.archivePath), pane.source.archivePath);
      } else {
        lastCommandId = "entry.goParent";
        await loadArchiveDirectory(
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
        lastCommandId = "remote.goParent";
        await loadSftpDirectory(
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
      lastCommandId = "entry.goParent";
      await loadDirectory(paneId, parent, currentPath);
    }
  }

  async function goRoot(): Promise<void> {
    const pane = panes[activePaneId];
    if (pane.source.kind === "search") {
      lastCommandId = "entry.goRoot";
      await loadDirectory(activePaneId, pane.source.rootPath);
      return;
    }

    if (pane.source.kind === "gitStatus") {
      lastCommandId = "entry.goRoot";
      await loadDirectory(activePaneId, pane.source.rootPath);
      return;
    }

    if (pane.source.kind !== "local") {
      statusMessage = "Root navigation is only available for local panes.";
      lastCommandId = "entry.goRoot.unsupportedSource";
      return;
    }

    const root = await rootDirectory(invoke, pane.currentPath);
    lastCommandId = "entry.goRoot";
    await loadDirectory(activePaneId, root);
  }

  async function goHome(): Promise<void> {
    if (!homePath) {
      statusMessage = "Home directory is not available.";
      lastCommandId = "entry.goHome.unavailable";
      return;
    }

    if (panes[activePaneId].source.kind === "search") {
      lastCommandId = "entry.goHome";
      await loadDirectory(activePaneId, homePath);
      return;
    }

    if (panes[activePaneId].source.kind === "gitStatus") {
      lastCommandId = "entry.goHome";
      await loadDirectory(activePaneId, homePath);
      return;
    }

    if (panes[activePaneId].source.kind !== "local") {
      statusMessage = "Home navigation is only available for local panes.";
      lastCommandId = "entry.goHome.unsupportedSource";
      return;
    }

    lastCommandId = "entry.goHome";
    await loadDirectory(activePaneId, homePath);
  }

  async function openOtherPanePathHere(): Promise<void> {
    const sourcePane = panes[otherPaneId(activePaneId)];
    if (
      sourcePane.source.kind !== "local" &&
      sourcePane.source.kind !== "search" &&
      sourcePane.source.kind !== "operationResult" &&
      sourcePane.source.kind !== "gitStatus"
    ) {
      statusMessage = "Opening the other pane path here is only available for local panes.";
      lastCommandId = "pane.openOtherPathHere.unsupportedSource";
      return;
    }

    lastCommandId = "pane.openOtherPathHere";
    await loadDirectory(
      activePaneId,
      sourcePane.source.kind === "search" || sourcePane.source.kind === "operationResult" || sourcePane.source.kind === "gitStatus"
        ? sourcePane.source.returnPath
        : sourcePane.currentPath,
    );
  }

  async function openCurrentPathInOtherPane(): Promise<void> {
    const sourcePane = panes[activePaneId];
    if (
      sourcePane.source.kind !== "local" &&
      sourcePane.source.kind !== "search" &&
      sourcePane.source.kind !== "operationResult" &&
      sourcePane.source.kind !== "gitStatus"
    ) {
      statusMessage = "Opening the current path in the other pane is only available for local panes.";
      lastCommandId = "pane.openCurrentPathInOther.unsupportedSource";
      return;
    }

    const destinationPaneId = otherPaneId(activePaneId);
    lastCommandId = "pane.openCurrentPathInOther";
    await loadDirectory(
      destinationPaneId,
      sourcePane.source.kind === "search" || sourcePane.source.kind === "operationResult" || sourcePane.source.kind === "gitStatus"
        ? sourcePane.source.returnPath
        : sourcePane.currentPath,
    );
  }

  async function openFocused(): Promise<void> {
    const paneId = activePaneId;
    const pane = panes[paneId];
    const entries = visibleEntries(pane);
    const entry = focusedEntry(pane, entries);
    if (!entry) return;

    lastCommandId = "entry.openFocused";
    const action = focusedOpenAction(pane, entry, isSupportedArchiveName);
    if (action.type === "openArchiveDirectory") {
      await loadArchiveDirectory(paneId, action.archivePath, action.innerPath);
    } else if (action.type === "openSftpDirectory") {
      await loadSftpDirectory(paneId, action.connectionId, action.remotePath, action.returnPath);
    } else if (action.type === "openLocalDirectory") {
      await loadDirectory(paneId, action.path);
    } else if (action.type === "openArchiveFile") {
      await loadArchiveDirectory(paneId, action.path);
    } else {
      await openViewer(action.entry);
    }
  }

  async function openFocusedWithDefaultApp(): Promise<void> {
    const pane = panes[activePaneId];
    const entry = focusedEntry(pane, visibleEntries(pane));
    if (!entry) return;

    const action = defaultAppOpenAction(pane, entry);
    if (action.type === "unsupported") {
      statusMessage = action.message;
      lastCommandId = action.commandId;
      return;
    }

    await openWithDefaultApp(action.entry);
  }

  async function editFocused(): Promise<void> {
    const pane = panes[activePaneId];
    if (pane.source.kind === "archive" || pane.source.kind === "sftp") {
      statusMessage = "Editing is available for local files only.";
      lastCommandId = "file.edit.unsupportedSource";
      return;
    }

    const entry = focusedEntry(pane, visibleEntries(pane));
    if (!entry) return;
    if (entry.kind !== "file") {
      statusMessage = "Editing is available for files only.";
      lastCommandId = "file.edit.unsupportedEntry";
      return;
    }

    await openEditorForPath(entry.path, entry.name);
  }

  async function openViewer(entry: FileEntry): Promise<void> {
    const extension = fileExtension(entry.name);
    const action = viewerOpenAction(panes[activePaneId], entry, extension, imageViewerExtensions, textViewerExtensions);
    if (action.type === "unsupported") {
      statusMessage = action.message;
      lastCommandId = action.commandId;
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
      viewer = {
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
      statusMessage = `Opened internal text viewer: ${action.entry.name}`;
      lastCommandId = "viewer.openText";
      await tick();
      viewerElement?.focus();
    } catch (error) {
      statusMessage = `Viewer failed: ${String(error)}`;
      lastCommandId = "viewer.openFailed";
    }
  }

  async function openImageViewer(entry: FileEntry): Promise<void> {
    try {
      const file = await readViewerImageFile(invoke, entry.path);
      viewer = {
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
      statusMessage = `Opened internal image viewer: ${entry.name}`;
      lastCommandId = "viewer.openImage";
      await tick();
      viewerElement?.focus();
    } catch (error) {
      statusMessage = `Image viewer failed: ${String(error)}`;
      lastCommandId = "viewer.openImageFailed";
    }
  }

  async function openWithDefaultApp(entry: FileEntry): Promise<void> {
    try {
      await openPathWithDefaultApp(invoke, entry.path);
      statusMessage = `Opened with OS default app: ${entry.name}`;
      lastCommandId = "entry.openDefaultApp";
    } catch (error) {
      statusMessage = `Open failed: ${String(error)}`;
      lastCommandId = "entry.openDefaultAppFailed";
    }
  }

  async function openEditorForPath(path: string, label: string): Promise<void> {
    try {
      await openPathWithTextEditor(invoke, path);
      statusMessage = `Opened text editor: ${label}`;
      lastCommandId = "file.edit";
    } catch (error) {
      statusMessage = `Edit failed: ${String(error)}`;
      lastCommandId = "file.editFailed";
    }
  }

  function toggleFocusedSelection(): void {
    const pane = panes[activePaneId];
    const key = pane.cursorKey;
    if (!key) return;

    const previousEntries = visibleEntries(pane);
    const currentIndex = pane.cursorIndex;
    const nextSelected = new Set(pane.selectedKeys);
    if (nextSelected.has(key)) {
      nextSelected.delete(key);
    } else {
      nextSelected.add(key);
    }

    const preferredKey =
      moveCursorAfterSelection && currentIndex >= 0 && currentIndex < previousEntries.length - 1
        ? previousEntries[currentIndex + 1].key
        : pane.cursorKey;
    const nextEntries = visibleEntriesFor(
      pane.entries,
      nextSelected,
      pane.quickFilterQuery,
      pane.showHiddenFiles,
      pane.sortMode,
    );

    updatePane(activePaneId, {
      selectedKeys: nextSelected,
      ...filteredCursorPatch(pane, nextEntries, preferredKey, currentIndex),
    });
    queueCursorScroll(activePaneId);
    lastCommandId = moveCursorAfterSelection ? "selection.toggleFocusedAndMoveDown" : "selection.toggleFocused";
  }

  function selectAllVisible(): void {
    const pane = panes[activePaneId];
    const entries = visibleEntries(pane);
    const allKeys = entries.map((entry) => entry.key);
    const allSelected = allKeys.length > 0 && allKeys.every((key) => pane.selectedKeys.has(key));

    updatePane(activePaneId, {
      selectedKeys: allSelected ? new Set() : new Set(allKeys),
    });
    lastCommandId = allSelected ? "selection.clearAll" : "selection.selectAll";
  }

  function cycleSortMode(): void {
    const pane = panes[activePaneId];
    const modes: SortMode[] = ["name", "modified", "size", "kind"];
    const nextMode = modes[(modes.indexOf(pane.sortMode) + 1) % modes.length];
    const entries = visibleEntriesFor(
      pane.entries,
      pane.selectedKeys,
      pane.quickFilterQuery,
      pane.showHiddenFiles,
      nextMode,
    );

    updatePane(activePaneId, {
      sortMode: nextMode,
      ...filteredCursorPatch(pane, entries),
    });
    queueCursorScroll(activePaneId);
    lastCommandId = "view.sortCycle";
  }

  function toggleHiddenFiles(): void {
    const pane = panes[activePaneId];
    const showHiddenFiles = !pane.showHiddenFiles;
    const entries = visibleEntriesFor(
      pane.entries,
      pane.selectedKeys,
      pane.quickFilterQuery,
      showHiddenFiles,
      pane.sortMode,
    );

    updatePane(activePaneId, {
      showHiddenFiles,
      ...filteredCursorPatch(pane, entries),
    });
    queueCursorScroll(activePaneId);
    lastCommandId = "view.toggleHiddenFiles";
  }

  function extendSelection(delta: -1 | 1): void {
    const pane = panes[activePaneId];
    const entries = visibleEntries(pane);
    if (entries.length === 0) return;

    const currentIndex = pane.cursorIndex < 0 ? 0 : pane.cursorIndex;
    const nextIndex = Math.min(Math.max(currentIndex + delta, 0), entries.length - 1);
    const nextSelected = new Set(pane.selectedKeys);

    nextSelected.add(entries[currentIndex].key);
    nextSelected.add(entries[nextIndex].key);

    updatePane(activePaneId, {
      cursorKey: entries[nextIndex].key,
      cursorIndex: nextIndex,
      selectedKeys: nextSelected,
    });
    queueCursorScroll(activePaneId);
    lastCommandId = delta < 0 ? "selection.extendUp" : "selection.extendDown";
  }

  function selectedOperationTargets(pane: PaneState): FileEntry[] {
    return selectedOperationEntries(pane, visibleEntries(pane));
  }

  function markedCommandTargets(pane: PaneState): CommandTarget[] {
    return markedCommandTargetsForPane(pane);
  }

  function isWindowsPlatform(): boolean {
    return navigator.userAgent.toLocaleLowerCase().includes("windows");
  }

  function selectedLocalCommandTargets(): CommandTarget[] {
    const pane = panes[activePaneId];
    if (pane.source.kind !== "local") return [];
    return selectedCommandTargets(pane);
  }

  function localMarkedCommandTargets(pane: PaneState): CommandTarget[] {
    return localCommandTargets(markedCommandTargets(pane), pane);
  }

  function externalCommandContext(): ExternalCommandContext {
    const activePane = panes[activePaneId];
    const otherPane = panes[otherPaneId(activePaneId)];
    return {
      activePane,
      otherPane,
      activeMarked: localMarkedCommandTargets(activePane),
      otherMarked: localMarkedCommandTargets(otherPane),
      isWindows: isWindowsPlatform(),
    };
  }

  async function writeClipboardText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();

    try {
      if (!document.execCommand("copy")) throw new Error("Clipboard copy command was rejected.");
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async function copySelectedPathsToClipboard(): Promise<void> {
    const pane = panes[activePaneId];
    if (pane.source.kind !== "local") {
      statusMessage = "Clipboard path copy is available for local sources only.";
      lastCommandId = "clipboard.sourceUnsupported";
      return;
    }

    const targets = selectedCommandTargets(pane);
    if (targets.length === 0) {
      statusMessage = "No local path is available to copy.";
      lastCommandId = "clipboard.noTargets";
      return;
    }

    const text = clipboardTextForCommandTargets(targets, isWindowsPlatform());
    try {
      await writeClipboardText(text);
      statusMessage = `Copied ${targets.length} path(s) to clipboard.`;
      lastCommandId = "clipboard.copySelectedPaths";
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : "Clipboard copy failed.";
      lastCommandId = "clipboard.copyFailed";
    }
  }

  async function copyCurrentDirectoryToClipboard(): Promise<void> {
    const pane = panes[activePaneId];
    if (pane.source.kind !== "local") {
      statusMessage = "Current directory copy is available for local sources only.";
      lastCommandId = "clipboard.copyCurrentDirectory.sourceUnsupported";
      return;
    }

    if (!pane.currentPath) {
      statusMessage = "No current directory is available to copy.";
      lastCommandId = "clipboard.copyCurrentDirectory.noPath";
      return;
    }

    try {
      await writeClipboardText(shellQuotePath(pane.currentPath, isWindowsPlatform()));
      statusMessage = "Copied current directory to clipboard.";
      lastCommandId = "clipboard.copyCurrentDirectory";
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : "Clipboard copy failed.";
      lastCommandId = "clipboard.copyFailed";
    }
  }

  async function copySelectedNamesToClipboard(): Promise<void> {
    const pane = panes[activePaneId];
    if (pane.source.kind !== "local") {
      statusMessage = "Clipboard name copy is available for local sources only.";
      lastCommandId = "clipboard.copySelectedNames.sourceUnsupported";
      return;
    }

    const targets = selectedCommandTargets(pane);
    if (targets.length === 0) {
      statusMessage = "No local filename is available to copy.";
      lastCommandId = "clipboard.copySelectedNames.noTargets";
      return;
    }

    try {
      await writeClipboardText(clipboardNameTextForCommandTargets(targets, isWindowsPlatform()));
      statusMessage = `Copied ${targets.length} filename(s) to clipboard.`;
      lastCommandId = "clipboard.copySelectedNames";
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : "Clipboard copy failed.";
      lastCommandId = "clipboard.copyFailed";
    }
  }

  async function insertActiveSelectionIntoTerminal(): Promise<void> {
    const pane = panes[activePaneId];
    if (pane.source.kind !== "local") {
      statusMessage = "Terminal insertion is available for local sources only.";
      lastCommandId = "terminal.insertActiveSelection.sourceUnsupported";
      return;
    }

    const targets = selectedCommandTargets(pane);
    if (targets.length === 0) {
      statusMessage = "No local path is available to insert.";
      lastCommandId = "terminal.insertActiveSelection.noTargets";
      return;
    }

    await writeTerminal(clipboardTextForCommandTargets(targets, isWindowsPlatform()));
    statusMessage = `Inserted ${targets.length} path(s) into terminal.`;
    lastCommandId = "terminal.insertActiveSelection";
  }

  async function loadExternalCommands(): Promise<void> {
    externalCommandsLoading = true;
    externalCommandError = "";
    try {
      externalCommands = await listExternalCommands(invoke);
      externalCommandCursorIndex = clampExternalCommandCursor(externalCommandCursorIndex, externalCommands.length);
    } catch (error) {
      externalCommandError = String(error);
      externalCommands = [];
    } finally {
      externalCommandsLoading = false;
    }
  }

  async function openExternalCommandDialog(): Promise<void> {
    commandDialogOpen = true;
    externalCommandCursorIndex = 0;
    lastCommandId = "command.openCommandList";
    await loadExternalCommands();
  }

  function closeExternalCommandDialog(): void {
    commandDialogOpen = false;
    externalCommandError = "";
    lastCommandId = "command.closeCommandList";
    focusActivePaneAfterDialog();
  }

  function moveExternalCommandCursor(delta: number): void {
    if (externalCommands.length === 0) return;
    externalCommandCursorIndex = clampExternalCommandCursor(externalCommandCursorIndex + delta, externalCommands.length);
    lastCommandId = "command.moveCommandCursor";
  }

  async function runFocusedExternalCommand(): Promise<void> {
    const command = externalCommands[externalCommandCursorIndex];
    if (!command || externalCommandsLoading) return;

    const targets = selectedLocalCommandTargets();
    if (targets.length === 0) {
      externalCommandError = "External commands are available for local selected paths only.";
      lastCommandId = "command.noTargets";
      return;
    }

    const commandLines = externalCommandLines(command, targets, externalCommandContext());
    commandDialogOpen = false;
    externalCommandError = "";
    await focusConsoleAndStart();
    await writeTerminal(`${commandLines.join("\r")}\r`);
    lastCommandId = "command.runWithSelection";
    if (command.returnFocus) returnFromConsole();
  }

  function selectedCommandTargets(pane: PaneState): CommandTarget[] {
    return selectedCommandTargetsForPane(pane, visibleEntries(pane));
  }

  function isSupportedArchiveName(name: string): boolean {
    const lowerName = name.toLocaleLowerCase();
    return lowerName.endsWith(".tar.gz") || archiveExtensions.has(fileExtension(lowerName));
  }

  function useWindowsAttributesOperation(sourcePane: PaneState): boolean {
    return sourcePane.source.kind !== "sftp" && navigator.userAgent.toLocaleLowerCase().includes("windows");
  }

  function createFileOperationJob(kind: FileOperationKind): FileOperationJob {
    const sourcePaneId = activePaneId;
    const sourcePane = panes[sourcePaneId];
    const destinationPaneId =
      kind === "createArchive"
        ? archiveCreationDestinationPaneId(sourcePaneId)
        : kind === "copy" || kind === "move" || kind === "extractArchive"
          ? otherPaneId(sourcePaneId)
          : null;
    const destinationPane = destinationPaneId ? panes[destinationPaneId] : null;
    const targetEntries =
      kind === "mkdir" || kind === "createFile" || kind === "refresh"
        ? []
        : kind === "rename"
          ? focusedOperationEntries(sourcePane, visibleEntries(sourcePane))
          : kind === "extractArchive"
            ? archiveOperationEntries(sourcePane, visibleEntries(sourcePane), isSupportedArchiveName)
            : [...selectedOperationTargets(sourcePane)];

    return createFileOperationJobModel({
      kind,
      sourcePaneId,
      sourcePane,
      destinationPaneId,
      destinationPane,
      targetEntries,
      windowsAttributesMode: kind === "chmod" && useWindowsAttributesOperation(sourcePane),
    });
  }

  function previewOperation(kind: FileOperationKind): void {
    const sourcePane = panes[activePaneId];
    const destinationPaneId =
      kind === "createArchive"
        ? archiveCreationDestinationPaneId(activePaneId)
        : kind === "copy" || kind === "move" || kind === "extractArchive"
          ? otherPaneId(activePaneId)
          : null;
    const destinationPane = destinationPaneId ? panes[destinationPaneId] : null;
    if (!operationSupportedForPaneSources(kind, sourcePane, destinationPane)) {
      statusMessage = "This source/destination file operation is not implemented yet.";
      lastCommandId = "operation.sourceUnsupported";
      return;
    }

    const job = createFileOperationJob(kind);
    operationJob = job;
    operationResult = null;
    operationCancelRequested = false;
    operationCancelConfirmOpen = false;
    operationCancelConfirmOpenedAt = 0;
    confirmationDialogOpen = true;
    lastCommandId = job.commandId;
    if (operationNameRequired(job)) focusOperationNameInput();
  }

  function archiveCreationDestinationPaneId(sourcePaneId: PaneId): PaneId | null {
    const destinationPaneId = otherPaneId(sourcePaneId);
    if (panes[destinationPaneId].source.kind === "local") return destinationPaneId;
    return panes[sourcePaneId].source.kind === "local" ? sourcePaneId : null;
  }

  function previewDeleteOperation(permanent: boolean): void {
    const sourceKind = panes[activePaneId].source.kind;
    previewOperation(permanent || !appSettings.useTrash || sourceKind === "sftp" ? "delete" : "trash");
  }

  function closeOperationPreview(): void {
    operationJob = null;
    operationResult = null;
    operationCancelRequested = false;
    operationCancelConfirmOpen = false;
    operationCancelConfirmOpenedAt = 0;
    confirmationDialogOpen = false;
    lastCommandId = "operationPreview.close";
    focusActivePaneAfterDialog();
  }

  function updateSearchForm(patch: Partial<SearchDialogForm>): void {
    searchForm = {
      ...searchForm,
      ...patch,
    };
  }

  function openSearchDialog(): void {
    const pane = panes[activePaneId];
    if (pane.source.kind === "sftp") {
      statusMessage = "Search source is available for local/archive/search panes in this phase.";
      lastCommandId = "search.openUnsupportedSource";
      return;
    }

    const rootPath = searchRootPathForPane(pane);
    if (!rootPath) {
      statusMessage = "No local search root is available.";
      lastCommandId = "search.openNoRoot";
      return;
    }

    searchForm =
      pane.source.kind === "search"
        ? searchFormFromRequest(searchRequestFromSource(pane.source))
        : { ...createEmptySearchForm(), rootPath };
    searchDialogOpen = true;
    searchRunning = false;
    searchError = "";
    lastCommandId = "search.openDialog";
    void tick().then(() => {
      searchRegexInputElement?.focus();
      searchRegexInputElement?.select();
    });
  }

  function closeSearchDialog(): void {
    searchDialogOpen = false;
    searchRunning = false;
    searchError = "";
    resetSftpCompositionState();
    lastCommandId = "search.closeDialog";
    focusActivePaneAfterDialog();
  }

  function cancelLargeSearchResult(): void {
    pendingLargeSearchResult = null;
    statusMessage = "Large search result display canceled.";
    lastCommandId = "search.largeResultCancel";
    focusActivePaneAfterDialog();
  }

  function confirmLargeSearchResult(): void {
    if (!pendingLargeSearchResult) return;
    const pending = pendingLargeSearchResult;
    pendingLargeSearchResult = null;
    applySearchListing(pending.paneId, pending.listing, pending.request, pending.returnPath);
        statusMessage = pending.listing.truncated
          ? `Search stopped at ${pending.listing.entries.length} item(s).`
          : `Search completed: ${pending.listing.entries.length} item(s).`;
    lastCommandId = "search.largeResultDisplay";
    focusActivePaneAfterDialog();
  }

  async function runSearchFromDialog(): Promise<void> {
    if (searchRunning) return;
    if (!searchForm.rootPath.trim()) {
      searchError = "root path is required";
      lastCommandId = "search.invalid";
      return;
    }

    let request: SearchDirectoryRequest;
    try {
      request = searchRequestFromForm(searchForm);
    } catch (error) {
      searchError = String(error);
      lastCommandId = "search.invalid";
      return;
    }

    searchRunning = true;
    searchError = "";
    lastCommandId = "search.run";
    try {
      const returnPath = searchReturnPathForPane(panes[activePaneId], consoleCwd);
      searchDialogOpen = false;
      const applied = await loadSearchDirectory(activePaneId, request, returnPath);
      if (applied) {
        const source = panes[activePaneId].source;
        statusMessage = source.kind === "search" && source.truncated
          ? `Search stopped at ${panes[activePaneId].entries.length} item(s).`
          : `Search completed: ${panes[activePaneId].entries.length} item(s).`;
        lastCommandId = "search.resultSource";
      }
      focusActivePaneAfterDialog();
    } catch (error) {
      searchError = String(error);
      statusMessage = `Search failed: ${String(error)}`;
      lastCommandId = "search.failed";
    } finally {
      searchRunning = false;
    }
  }

  async function openGitStatusSource(): Promise<void> {
    const pane = panes[activePaneId];
    const path = searchRootPathForPane(pane);
    if (!path) {
      statusMessage = "Git status is available for local-like panes only.";
      lastCommandId = "git.openStatus.unsupportedSource";
      return;
    }

    const applied = await loadGitStatusDirectory(activePaneId, path, searchReturnPathForPane(pane, consoleCwd));
    if (applied) {
      statusMessage = `Git changed files: ${panes[activePaneId].entries.length} item(s).`;
      lastCommandId = "git.openStatus";
    } else {
      statusMessage = panes[activePaneId].error ? `Git status failed: ${panes[activePaneId].error}` : "Git status canceled.";
      lastCommandId = "git.openStatus.failed";
    }
    focusActivePaneAfterDialog();
  }

  function updateOperationName(name: string): void {
    if (!operationJob) return;

    operationJob = {
      ...operationJob,
      requestedName: name,
    };
  }

  function focusOperationNameInput(): void {
    void tick().then(() => {
      operationNameInputElement?.focus();
      operationNameInputElement?.select();
    });
  }

  function operationConflictMessages(job: FileOperationJob): string[] {
    return operationConflictMessagesForEntries(job, panes[job.destinationPaneId ?? job.sourcePaneId].entries);
  }

  function operationBlockingMessages(job: FileOperationJob): string[] {
    return operationBlockingMessagesForEntries(job, panes[job.destinationPaneId ?? job.sourcePaneId].entries);
  }

  function executionConfirmationMessage(job: FileOperationJob): string {
    return operationExecutionConfirmationMessage(job, panes[job.destinationPaneId ?? job.sourcePaneId].entries);
  }

  async function writeOperationResultToTerminal(label: string, result: FileOperationResult): Promise<void> {
    if (!appSettings.operationResult.printToTerminal || !terminalElement) return;
    if (!terminal) await initializeTerminal();
    for (const line of operationResultTerminalLines(label, result)) {
      terminal?.writeln(line);
    }
  }

  async function saveOperationFailureLog(label: string, result: FileOperationResult): Promise<string | null> {
    if (!appSettings.operationResult.saveFailureLog || result.failed.length === 0) return null;
    try {
      return await saveOperationFailureLogEffect(invoke, label, result.failed);
    } catch (error) {
      statusMessage = `Operation failure log save failed: ${String(error)}`;
      return null;
    }
  }

  async function handleOperationResult(job: FileOperationJob, result: FileOperationResult): Promise<void> {
    operationResult = result;
    const logPath = await saveOperationFailureLog(job.label, result);
    await writeOperationResultToTerminal(job.label, result);
    if (appSettings.operationResult.showStatus) {
      statusMessage = operationResultStatus(job.label, result);
      if (logPath && result.failed.length > 0) statusMessage += ` / log: ${logPath}`;
    }
    if (appSettings.operationResult.showFailureDialog && result.failed.length > 0) {
      operationFailureDialog = {
        label: job.label,
        result,
        logPath,
        failedEntries: failedOperationEntries(job, result),
        returnPath: job.sourcePath,
      };
    }
  }

  function closeOperationFailureDialog(): void {
    operationFailureDialog = null;
    lastCommandId = "operationResult.close";
    focusActivePaneAfterDialog();
  }

  async function confirmOperationExecution(): Promise<void> {
    if (!operationJob || operationRunning || !confirmationDialogOpen) return;

    if (!operationJob.executable) {
      operationResult = {
        succeeded: [],
        failed: [{ path: "", message: "This job is not executable." }],
      };
      return;
    }
    if ((operationJob.kind === "rename" || operationJob.kind === "mkdir" || operationJob.kind === "createFile" || operationJob.kind === "createArchive" || operationJob.kind === "chmod" || operationJob.kind === "windowsAttributes") && !operationJob.requestedName?.trim()) {
      operationResult = {
        succeeded: [],
        failed: [{ path: "", message: operationJob.kind === "chmod" ? "Mode is required before execution." : operationJob.kind === "windowsAttributes" ? "Attribute expression is required before execution." : "Name is required before execution." }],
      };
      focusOperationNameInput();
      return;
    }
    const blockingMessages = operationBlockingMessages(operationJob);
    if (blockingMessages.length > 0) {
      operationResult = {
        succeeded: [],
        failed: blockingMessages.map((message) => ({ path: "", message })),
      };
      return;
    }

    const executedJob = operationJob;
    const executableJob: FileOperationJob = {
      ...executedJob,
      sftpSafeTransferPartThresholdBytes: appSettings.sftpTransfer.partFileThresholdBytes,
    };
    const executingUndo = executedJob.commandId.startsWith("undo.");
    operationJob = {
      ...operationJob,
      status: "running",
    };
    operationRunning = true;
    operationCancelRequested = false;
    operationCancelConfirmOpen = false;
    operationCancelConfirmOpenedAt = 0;
    lastCommandId = `${executedJob.commandId}.execute`;

    try {
      const result = await executeFileOperationJob(invoke, executableJob);
      await handleOperationResult(executedJob, result);
      const executingRedo = executedJob.commandId.startsWith("redo.");
      if (executingUndo && result.succeeded.length > 0 && result.failed.length === 0 && !result.canceled) {
        commitUndoHistory();
      } else if (executingRedo && result.succeeded.length > 0 && result.failed.length === 0 && !result.canceled) {
        commitRedoHistory(executedJob);
      } else if (!executingUndo && !executingRedo && result.succeeded.length > 0 && result.failed.length === 0 && !result.canceled) {
        pushUndoSnapshot(createUndoSnapshot(executedJob), true);
      }
      await reloadPanesAfterOperation(executableJob);
    } catch (error) {
      const result = {
        succeeded: [],
        failed: [{ path: "", message: String(error) }],
      };
      await handleOperationResult(executedJob, result);
    } finally {
      operationJob = null;
      activeUndoSnapshot = null;
      activeRedoSnapshot = null;
      operationRunning = false;
      operationCancelRequested = false;
      operationCancelConfirmOpen = false;
      operationCancelConfirmOpenedAt = 0;
      confirmationDialogOpen = false;
      if (!operationFailureDialog) focusActivePaneAfterDialog();
    }
  }

  async function cancelOperationConfirmation(): Promise<void> {
    if (operationRunning && operationJob) {
      if (operationCancelRequested) {
        statusMessage = "Cancel already requested. Waiting for current item to finish.";
        lastCommandId = "operation.cancelAlreadyRequested";
        return;
      }

      if (!operationCancelConfirmOpen) {
        operationCancelConfirmOpen = true;
        operationCancelConfirmOpenedAt = Date.now();
        statusMessage = "Cancel operation? Enter stops after current item; Esc keeps running.";
        lastCommandId = "operation.cancelConfirm";
        return;
      }

      const elapsed = Date.now() - operationCancelConfirmOpenedAt;
      const doubleEscEnabled = appSettings.operationCancel.doubleEscEnabled;
      const doubleEscWindowMs = Math.max(0, appSettings.operationCancel.doubleEscWindowMs || 0);
      if (doubleEscEnabled && elapsed <= doubleEscWindowMs) {
        await requestOperationCancel();
        return;
      }

      operationCancelConfirmOpen = false;
      operationCancelConfirmOpenedAt = 0;
      statusMessage = "Operation continues.";
      lastCommandId = "operation.cancelConfirmClose";
      return;
    }
    confirmationDialogOpen = false;
    lastCommandId = "operationPreview.confirmCancel";
    focusActivePaneAfterDialog();
  }

  async function confirmOperationCancel(): Promise<void> {
    if (!operationRunning || !operationJob || operationCancelRequested) return;
    await requestOperationCancel();
  }

  async function requestOperationCancel(): Promise<void> {
    if (!operationJob) return;
    operationCancelRequested = true;
    operationCancelConfirmOpen = false;
    operationCancelConfirmOpenedAt = 0;
    operationJob = {
      ...operationJob,
      status: "cancelRequested",
    };
    lastCommandId = "operation.cancelRequested";
    try {
      const accepted = await cancelFileOperationJob(invoke, operationJob.id);
      statusMessage = accepted ? "Cancel requested. Waiting for current item to finish." : "Cancel request was not accepted.";
    } catch (error) {
      statusMessage = `Cancel request failed: ${String(error)}`;
    }
  }

  function previewUndoOperation(): void {
    const snapshot = undoStack.at(-1) ?? null;
    if (!snapshot) {
      statusMessage = "No undoable operation.";
      lastCommandId = "app.undo.empty";
      return;
    }

    activeUndoSnapshot = snapshot;
    activeRedoSnapshot = null;
    operationJob = snapshot.job;
    operationResult = null;
    operationCancelRequested = false;
    operationCancelConfirmOpen = false;
    operationCancelConfirmOpenedAt = 0;
    confirmationDialogOpen = true;
    statusMessage = `${snapshot.label} (${undoStack.length} undo / ${redoStack.length} redo)`;
    lastCommandId = "app.undo";
  }

  function previewRedoOperation(): void {
    const snapshot = redoStack.at(-1) ?? null;
    if (!snapshot) {
      statusMessage = "No redoable operation.";
      lastCommandId = "app.redo.empty";
      return;
    }

    activeRedoSnapshot = snapshot;
    activeUndoSnapshot = null;
    operationJob = snapshot.redoJob;
    operationResult = null;
    operationCancelRequested = false;
    operationCancelConfirmOpen = false;
    operationCancelConfirmOpenedAt = 0;
    confirmationDialogOpen = true;
    statusMessage = `${snapshot.redoLabel} (${undoStack.length} undo / ${redoStack.length} redo)`;
    lastCommandId = "app.redo";
  }

  function operationSafetyMessages(job: FileOperationJob): string[] {
    if (activeUndoSnapshot && job.id === activeUndoSnapshot.job.id) {
      return undoSafetyMessages(activeUndoSnapshot, panes[job.sourcePaneId]);
    }
    return [];
  }

  function pushUndoSnapshot(snapshot: UndoSnapshot | null, clearRedo: boolean): void {
    if (!snapshot) return;
    undoStack = [...undoStack, snapshot].slice(-20);
    if (clearRedo) redoStack = [];
  }

  function commitUndoHistory(): void {
    if (!activeUndoSnapshot) return;
    const snapshot = activeUndoSnapshot;
    undoStack = undoStack.at(-1)?.job.id === snapshot.job.id ? undoStack.slice(0, -1) : undoStack.filter((item) => item.job.id !== snapshot.job.id);
    redoStack = [...redoStack, snapshot].slice(-20);
  }

  function commitRedoHistory(executedJob: FileOperationJob): void {
    if (!activeRedoSnapshot) return;
    const snapshot = activeRedoSnapshot;
    redoStack = redoStack.at(-1)?.redoJob.id === snapshot.redoJob.id ? redoStack.slice(0, -1) : redoStack.filter((item) => item.redoJob.id !== snapshot.redoJob.id);
    pushUndoSnapshot(createUndoSnapshot(executedJob), false);
  }

  function refreshLocationOptions(): void {
    locationOptionItems = buildLocationOptionsModel({
      activePane: panes[activePaneId],
      homePath,
      localRoots,
      localFavorites,
      searchProfiles,
      activeSftpSessions,
      sftpProfiles,
    });
    locationCursorIndex = clampLocationCursor(locationCursorIndex, locationOptionItems);
  }

  function locationProfileIndex(profileId: string): number {
    return findLocationProfileIndex(locationOptionItems, profileId);
  }

  async function refreshActiveSftpSessions(): Promise<void> {
    try {
      activeSftpSessions = await listActiveSftpSessions(invoke);
      refreshLocationOptions();
    } catch (error) {
      statusMessage = `Active SFTP session load failed: ${String(error)}`;
    }
  }

  function paneUsesSftpConnection(paneId: PaneId, connectionId: string): boolean {
    return panes[paneId].source.kind === "sftp" && panes[paneId].source.connectionId === connectionId;
  }

  function sftpConnectionInUseByOtherPane(connectionId: string, paneId: PaneId): boolean {
    const otherPaneId = paneId === "left" ? "right" : "left";
    return paneUsesSftpConnection(otherPaneId, connectionId);
  }

  async function disconnectSftpConnection(connectionId: string): Promise<void> {
    await disconnectSftpSession(invoke, connectionId);
    activeSftpSessions = activeSftpSessions.filter((session) => session.connectionId !== connectionId);
    refreshLocationOptions();
  }

  async function disconnectSftpIfUnused(connectionId: string, leavingPaneId: PaneId): Promise<void> {
    if (sftpConnectionInUseByOtherPane(connectionId, leavingPaneId)) return;
    try {
      await disconnectSftpConnection(connectionId);
      statusMessage = `SFTP session disconnected: ${connectionId}`;
      lastCommandId = "remote.disconnectAuto";
    } catch (error) {
      statusMessage = `SFTP session disconnect failed: ${String(error)}`;
    }
  }

  async function maybeDisconnectLeavingSftpPane(paneId: PaneId): Promise<void> {
    const source = panes[paneId].source;
    if (source.kind !== "sftp") return;
    if (appSettings.sftpSession.lifecycle !== "disconnectOnLeave") return;
    await disconnectSftpIfUnused(source.connectionId, paneId);
  }

  async function enforceSftpSessionLimit(): Promise<void> {
    if (appSettings.sftpSession.lifecycle !== "keepRecent") return;
    const maxSessions = Math.max(0, appSettings.sftpSession.maxSessions || 0);
    if (maxSessions === 0) return;
    await refreshActiveSftpSessions();
    const protectedConnectionIds = new Set(
      (["left", "right"] as PaneId[])
        .map((paneId) => panes[paneId].source)
        .filter((source): source is SftpPaneSource => source.kind === "sftp")
        .map((source) => source.connectionId),
    );
    const removable = [...activeSftpSessions]
      .filter((session) => !protectedConnectionIds.has(session.connectionId))
      .sort((left, right) => left.lastUsedAt - right.lastUsedAt);
    while (activeSftpSessions.length > maxSessions && removable.length > 0) {
      const session = removable.shift();
      if (!session) break;
      try {
        await disconnectSftpConnection(session.connectionId);
      } catch {
        break;
      }
    }
  }

  async function openSftpConnectionDialog(): Promise<void> {
    await ensureSftpProfilesLoaded(true);
    await refreshActiveSftpSessions();
    applyLocationDialogStatePatch(openManagerState());
    refreshLocationOptions();
    lastCommandId = "location.openManager";
  }

  function closeSftpConnectionDialog(): void {
    applyLocationDialogStatePatch(closeManagerState(sftpForm));
    lastCommandId = "remote.connectionDialog.close";
    focusActivePaneAfterDialog();
  }

  function openSftpFormFromLocationManager(): void {
    applyLocationDialogStatePatch(openNewSftpFormState());
    lastCommandId = "location.newSftp";
    void tick().then(() => {
      sftpHostInputElement?.focus();
      sftpHostInputElement?.select();
    });
  }

  function openSftpProfileFromLocationManager(profile: SftpConnectionProfile): void {
    applyLocationDialogStatePatch(openSftpProfileFormState(profile));
    lastCommandId = "location.openSftpProfile";
    void tick().then(() => {
      sftpPasswordInputElement?.focus();
    });
  }

  async function chooseLocationOption(option: LocationOption): Promise<void> {
    const action = locationSelectionAction(option, panes[activePaneId]);
    if (action.type === "openNewSftpForm") {
      openSftpFormFromLocationManager();
      return;
    }

    if (action.type === "openSftpProfileForm") {
      openSftpProfileFromLocationManager(action.profile);
      return;
    }

    if (action.type === "openActiveSftpSession") {
      closeSftpConnectionDialog();
      lastCommandId = "location.openActiveSftpSession";
      await loadSftpDirectory(activePaneId, action.connectionId, action.remotePath, sftpReturnPathForPane(panes[activePaneId]));
      return;
    }

    if (locationSelectionRequiresLeavingSftp(action)) {
      await maybeDisconnectLeavingSftpPane(activePaneId);
    }

    if (action.type === "openSearchProfile") {
      closeSftpConnectionDialog();
      lastCommandId = "location.openSearchProfile";
      await loadSearchDirectory(activePaneId, searchRequestFromProfile(action.profile), action.profile.rootPath);
      return;
    }

    if (action.type === "openLocalPath") {
      closeSftpConnectionDialog();
      lastCommandId = action.commandId;
      await loadDirectory(activePaneId, action.path);
      return;
    }

    if (action.type === "switchLocal") {
      closeSftpConnectionDialog();
      lastCommandId = "location.switchLocal";
      await loadDirectory(activePaneId, action.path);
      return;
    }

    closeSftpConnectionDialog();
    statusMessage = "Already on a local source.";
    lastCommandId = "location.switchLocalNoop";
  }

  async function chooseFocusedLocationOption(): Promise<void> {
    const option = focusedLocationOption(locationOptionItems, locationCursorIndex);
    if (option) await chooseLocationOption(option);
  }

  function moveLocationCursor(delta: -1 | 1): void {
    locationCursorIndex = clampLocationCursor(locationCursorIndex + delta, locationOptionItems);
    lastCommandId = "location.moveCursor";
  }

  async function ensureSftpProfilesLoaded(force = false): Promise<void> {
    if (locationProfilesLoaded && !force) return;
    if (locationProfilesLoadPromise && !force) {
      await locationProfilesLoadPromise;
      return;
    }

    locationProfilesLoadPromise = loadSftpProfiles();
    try {
      await locationProfilesLoadPromise;
    } finally {
      locationProfilesLoadPromise = null;
    }
  }

  async function loadSftpProfiles(): Promise<void> {
    locationProfilesLoading = true;
    locationProfilesError = "";
    try {
      const profiles = await loadLocationProfiles(invoke);
      localFavorites = profiles.localFavorites;
      searchProfiles = profiles.searchProfiles;
      sftpProfiles = profiles.sftpProfiles;
      locationProfilesLoaded = true;
      refreshLocationOptions();
      lastCommandId = "location.loadProfiles";
    } catch (error) {
      locationProfilesError = String(error);
      lastCommandId = "location.loadProfilesFailed";
    } finally {
      locationProfilesLoading = false;
    }
  }

  function updateSftpForm(patch: Partial<SftpConnectionForm>): void {
    applyLocationDialogStatePatch(patchSftpFormState(sftpForm, patch));
  }

  function updateSftpAuthKind(authKind: SftpConnectionForm["authKind"]): void {
    applyLocationDialogStatePatch(patchSftpAuthKindState(sftpForm, authKind));
  }

  function resetSftpCompositionState(): void {
    imeComposing = false;
  }

  function returnToLocationManager(): void {
    applyLocationDialogStatePatch(returnToManagerState(sftpForm));
    lastCommandId = "location.backToManager";
  }

  async function addCurrentSearchToProfiles(): Promise<void> {
    const source = panes[activePaneId].source;
    if (source.kind !== "search") {
      statusMessage = "Only search sources can be saved as search profiles.";
      lastCommandId = "location.addSearchUnsupportedSource";
      return;
    }

    if (searchProfiles.some((profile) => searchProfileMatchesSource(profile, source))) {
      statusMessage = `Search profile already exists: ${searchProfileNameFromSource(source)}`;
      lastCommandId = "location.addSearchProfileDuplicate";
      return;
    }

    locationProfilesError = "";
    try {
      const profile = await saveSearchProfile(invoke, source);
      await ensureSftpProfilesLoaded(true);
      if (!searchProfiles.some((existing) => existing.id === profile.id)) {
        searchProfiles = [...searchProfiles, profile].sort((left, right) =>
          left.name.localeCompare(right.name, "ja-JP"),
        );
      }
      refreshLocationOptions();
      const searchIndex = locationOptionItems.findIndex(
        (option) => option.kind === "searchProfile" && option.searchProfile?.id === profile.id,
      );
      if (searchIndex >= 0) locationCursorIndex = searchIndex;
      statusMessage = `Search profile added: ${profile.name}`;
      lastCommandId = "location.addSearchProfile";
    } catch (error) {
      locationProfilesError = String(error);
      statusMessage = `Search profile add failed: ${String(error)}`;
      lastCommandId = "location.addSearchProfileFailed";
    }
  }

  async function addCurrentLocalPathToFavorites(): Promise<void> {
    const pane = panes[activePaneId];
    const path = pane.source.kind === "local" ? pane.currentPath : paneConsolePath(pane);
    if (!path || pane.source.kind !== "local") {
      statusMessage = "Only local paths can be added to favorites.";
      lastCommandId = "location.addFavoriteUnsupportedSource";
      return;
    }

    if (localFavorites.some((favorite) => favorite.path === path)) {
      statusMessage = `Local favorite already exists: ${path}`;
      lastCommandId = "location.addFavoriteDuplicate";
      return;
    }

    locationProfilesError = "";
    try {
      const favorite = await saveLocalFavoriteProfile(invoke, path);
      await ensureSftpProfilesLoaded(true);
      if (!localFavorites.some((existing) => existing.id === favorite.id)) {
        localFavorites = [...localFavorites, favorite].sort((left, right) =>
          left.name.localeCompare(right.name, "ja-JP"),
        );
      }
      refreshLocationOptions();
      const favoriteIndex = locationOptionItems.findIndex(
        (option) => option.kind === "localFavorite" && option.localFavorite?.id === favorite.id,
      );
      if (favoriteIndex >= 0) locationCursorIndex = favoriteIndex;
      statusMessage = `Local favorite added: ${favorite.name}`;
      lastCommandId = "location.addFavorite";
    } catch (error) {
      locationProfilesError = String(error);
      statusMessage = `Local favorite add failed: ${String(error)}`;
      lastCommandId = "location.addFavoriteFailed";
    }
  }

  async function addCurrentSourceToLocationManager(): Promise<void> {
    const source = panes[activePaneId].source;
    if (source.kind === "search") {
      await addCurrentSearchToProfiles();
      return;
    }
    await addCurrentLocalPathToFavorites();
  }

  async function saveSftpProfileFromForm(): Promise<void> {
    const savedProfile = await saveSftpConnectionProfile(invoke, sftpForm);
    sftpForm = {
      ...sftpForm,
      profileId: savedProfile.id,
      name: savedProfile.name,
      remotePath: savedProfile.remotePath,
      authKind: savedProfile.authKind,
      privateKeyPath: savedProfile.privateKeyPath ?? "",
    };
    await ensureSftpProfilesLoaded(true);
    if (!sftpProfiles.some((profile) => profile.id === savedProfile.id)) {
      sftpProfiles = [...sftpProfiles, savedProfile].sort((left, right) =>
        left.name.localeCompare(right.name, "ja-JP"),
      );
    }
    statusMessage = `SFTP profile saved: ${savedProfile.name} (${sftpProfiles.length} profile(s))`;
  }

  async function saveSftpProfileOnlyFromForm(): Promise<void> {
    if (sftpConnecting) return;
    const validationMessage = validateSftpProfileForm(sftpForm);
    if (validationMessage) {
      sftpConnectionError = validationMessage;
      lastCommandId = "location.saveProfile.invalid";
      return;
    }

    sftpConnectionError = "";
    sftpConnectionResult = null;
    try {
      await saveSftpProfileFromForm();
      statusMessage = `SFTP profile saved: ${sftpForm.name}`;
      applyLocationDialogStatePatch(returnToManagerState(sftpForm));
      await tick();
      refreshLocationOptions();
      const savedIndex = sftpForm.profileId ? locationProfileIndex(sftpForm.profileId) : -1;
      if (savedIndex >= 0) locationCursorIndex = savedIndex;
      lastCommandId = "location.saveProfile";
    } catch (error) {
      sftpConnectionError = String(error);
      statusMessage = `SFTP profile save failed: ${String(error)}`;
      lastCommandId = "location.saveProfileFailed";
    }
  }

  async function deleteFocusedSftpProfile(): Promise<void> {
    const options = locationOptionItems;
    const option = options[Math.min(locationCursorIndex, options.length - 1)];
    if (option?.kind === "localFavorite" && option.localFavorite) {
      await deleteFocusedLocalFavorite(option.localFavorite);
      return;
    }
    if (option?.kind === "searchProfile" && option.searchProfile) {
      await deleteFocusedSearchProfile(option.searchProfile);
      return;
    }
    if (option?.kind !== "sftpProfile" || !option.profile || locationProfilesLoading) {
      applyLocationDialogStatePatch(clearPendingDeletesState());
      statusMessage = "Select an SFTP profile before deleting.";
      lastCommandId = "location.deleteProfileNoTarget";
      return;
    }
    const profile = option.profile;

    if (pendingDeleteProfile?.id !== profile.id) {
      applyLocationDialogStatePatch(armDeleteSftpProfileState(profile));
      statusMessage = `Press D again or Enter to delete SFTP profile: ${profile.name}`;
      lastCommandId = "location.deleteProfileArm";
      return;
    }

    locationProfilesError = "";
    try {
      await deleteSftpConnectionProfile(invoke, profile.id);
      sftpProfiles = sftpProfiles.filter((existingProfile) => existingProfile.id !== profile.id);
      applyLocationDialogStatePatch(clearPendingDeletesState());
      await tick();
      refreshLocationOptions();
      statusMessage = `SFTP profile deleted: ${profile.name}`;
      lastCommandId = "location.deleteProfile";
    } catch (error) {
      locationProfilesError = String(error);
      statusMessage = `SFTP profile delete failed: ${String(error)}`;
      lastCommandId = "location.deleteProfileFailed";
    }
  }

  async function disconnectFocusedActiveSftpSession(): Promise<void> {
    const option = locationOptionItems[Math.min(locationCursorIndex, locationOptionItems.length - 1)];
    if (option?.kind !== "activeSftpSession" || !option.activeSession) {
      statusMessage = "Select an active SFTP session before disconnecting.";
      lastCommandId = "remote.disconnectNoTarget";
      return;
    }

    const { connectionId } = option.activeSession;
    for (const paneId of ["left", "right"] as PaneId[]) {
      const source = panes[paneId].source;
      if (source.kind === "sftp" && source.connectionId === connectionId) {
        await loadDirectory(paneId, source.returnPath || homePath);
      }
    }

    try {
      await disconnectSftpConnection(connectionId);
      statusMessage = `SFTP session disconnected: ${connectionId}`;
      lastCommandId = "remote.disconnect";
    } catch (error) {
      statusMessage = `SFTP session disconnect failed: ${String(error)}`;
      lastCommandId = "remote.disconnectFailed";
    }
  }

  async function deleteFocusedLocalFavorite(favorite: LocalFavoriteProfile): Promise<void> {
    if (locationProfilesLoading) return;

    if (pendingDeleteLocalFavorite?.id !== favorite.id) {
      applyLocationDialogStatePatch(armDeleteLocalFavoriteState(favorite));
      statusMessage = `Press D again or Enter to delete local favorite: ${favorite.name}`;
      lastCommandId = "location.deleteLocalFavoriteArm";
      return;
    }

    locationProfilesError = "";
    try {
      await deleteLocalFavoriteProfile(invoke, favorite.id);
      localFavorites = localFavorites.filter((existingFavorite) => existingFavorite.id !== favorite.id);
      applyLocationDialogStatePatch(clearPendingDeletesState());
      await tick();
      refreshLocationOptions();
      statusMessage = `Local favorite deleted: ${favorite.name}`;
      lastCommandId = "location.deleteLocalFavorite";
    } catch (error) {
      locationProfilesError = String(error);
      statusMessage = `Local favorite delete failed: ${String(error)}`;
      lastCommandId = "location.deleteLocalFavoriteFailed";
    }
  }

  async function deleteFocusedSearchProfile(profile: SearchProfile): Promise<void> {
    if (locationProfilesLoading) return;

    if (pendingDeleteSearchProfile?.id !== profile.id) {
      applyLocationDialogStatePatch(armDeleteSearchProfileState(profile));
      statusMessage = `Press D again or Enter to delete search profile: ${profile.name}`;
      lastCommandId = "location.deleteSearchProfileArm";
      return;
    }

    locationProfilesError = "";
    try {
      await deleteSearchProfile(invoke, profile.id);
      searchProfiles = searchProfiles.filter((existingProfile) => existingProfile.id !== profile.id);
      applyLocationDialogStatePatch(clearPendingDeletesState());
      await tick();
      refreshLocationOptions();
      statusMessage = `Search profile deleted: ${profile.name}`;
      lastCommandId = "location.deleteSearchProfile";
    } catch (error) {
      locationProfilesError = String(error);
      statusMessage = `Search profile delete failed: ${String(error)}`;
      lastCommandId = "location.deleteSearchProfileFailed";
    }
  }

  async function testSftpConnectionFromDialog(trustHostKey = false): Promise<void> {
    if (sftpConnecting) return;
    const validationMessage = validateSftpConnectionForm(sftpForm);
    if (validationMessage) {
      sftpConnectionError = validationMessage;
      lastCommandId = "remote.connectSftp.invalid";
      return;
    }

    applyLocationDialogStatePatch(beginSftpConnectState(trustHostKey));
    lastCommandId = "remote.connectSftp";
    try {
      const result = await testSftpConnection(invoke, sftpForm, trustHostKey);
      applyLocationDialogStatePatch({
        sftpConnectionResult: result,
        pendingKnownHost: null,
      });
      statusMessage = result.message;
      if (sftpForm.saveProfile) {
        try {
          await saveSftpProfileFromForm();
          statusMessage = `${result.message} Profile saved.`;
        } catch (error) {
          statusMessage = `${result.message} Profile save failed: ${String(error)}`;
          sftpConnectionError = `Profile save failed: ${String(error)}`;
          lastCommandId = "remote.connectSftp.temporaryAfterSaveFailed";
        }
      }
      applyLocationDialogStatePatch(acceptSftpConnectSuccessState(sftpForm, result));
      if (lastCommandId !== "remote.connectSftp.temporaryAfterSaveFailed") {
        lastCommandId = "remote.connectSftp.success";
      }
      await loadSftpDirectory(activePaneId, result.connectionId, result.remotePath, sftpReturnPathForPane(panes[activePaneId]));
      await enforceSftpSessionLimit();
      focusActivePaneAfterDialog();
    } catch (error) {
      const knownHostPrompt = parseKnownHostPrompt(error);
      if (knownHostPrompt && !trustHostKey) {
        applyLocationDialogStatePatch(acceptKnownHostPromptState(knownHostPrompt));
        statusMessage = `SFTP host key is unknown: ${knownHostPrompt.host}:${knownHostPrompt.port}`;
        lastCommandId = "remote.connectSftp.unknownHostKey";
      } else {
        applyLocationDialogStatePatch(rejectSftpConnectState(sftpForm, String(error)));
        statusMessage = `SFTP connection failed: ${String(error)}`;
        lastCommandId = "remote.connectSftp.failed";
      }
    } finally {
      applyLocationDialogStatePatch(finishSftpConnectState());
    }
  }

  function focusActivePaneAfterDialog(): void {
    void tick().then(() => {
      scrollCursorIntoView(activePaneId);
      appShellElement?.focus({ preventScroll: true });
    });
  }

  function desiredTerminalSourceKey(): string {
    const source = panes[activePaneId].source;
    return source.kind === "sftp" ? `sftp:${source.connectionId}` : "local";
  }

  async function stopTerminalSession(): Promise<void> {
    stopTerminalKeyRepeat();
    terminalSession = markTerminalStopping(terminalSession);
    try {
      await stopTerminal(invoke);
    } catch {
      // A failed stop should not strand focus handling on the file panes.
    }
    terminalSession = resetTerminalSession(terminalSession);
  }

  async function focusConsoleAndStart(): Promise<void> {
    if (!consoleVisible) consoleVisible = true;
    const activePath = paneConsolePath(panes[activePaneId]);
    if (activePath) consoleCwd = activePath;
    consoleFocused = true;
    lastCommandId = "terminal.focus";
    await tick();
    await initializeTerminal();
    terminal?.focus();
    if (terminalSession.starting) {
      for (let retry = 0; retry < 50 && terminalSession.starting; retry += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    const sourceKey = desiredTerminalSourceKey();
    if (terminalSession.started && terminalSession.sourceKey !== sourceKey) {
      await stopTerminalSession();
      terminal?.clear();
    }
    if (!terminalSession.started) await startTerminal();
    await tick();
    terminal?.focus();
  }

  function focusConsole(): void {
    void focusConsoleAndStart();
  }

  function returnFromConsole(): void {
    stopTerminalKeyRepeat();
    terminal?.blur();
    terminalSession = { ...terminalSession, suppressedData: [] };
    terminalFullscreen = false;
    consoleFocused = false;
    lastCommandId = "terminal.focusPreviousPane";
    focusActivePaneAfterDialog();
  }

  function terminalHasDomFocus(): boolean {
    const activeElement = document.activeElement;
    return !!(terminalElement && activeElement instanceof Node && terminalElement.contains(activeElement));
  }

  function toggleConsoleVisibility(): void {
    consoleVisible = !consoleVisible;
    if (!consoleVisible && consoleFocused) {
      stopTerminalKeyRepeat();
      terminalFullscreen = false;
      consoleFocused = false;
      focusActivePaneAfterDialog();
    }
    if (consoleVisible) {
      void tick().then(() => {
        terminalFit?.fit();
        if (consoleFocused) terminal?.focus();
      });
    }
    lastCommandId = "terminal.toggleVisible";
  }

  async function toggleTerminalFullscreen(): Promise<void> {
    if (!consoleVisible) consoleVisible = true;
    terminalFullscreen = !terminalFullscreen;
    const commandId = terminalFullscreen ? "terminal.fullscreen" : "terminal.fullscreenExit";
    lastCommandId = commandId;
    await tick();
    await initializeTerminal();
    terminalFit?.fit();
    if (!consoleFocused) {
      await focusConsoleAndStart();
    } else {
      terminal?.focus();
    }
    lastCommandId = commandId;
  }

  async function startTerminal(): Promise<void> {
    if (!terminalElement || terminalSession.starting) return;
    const source = panes[activePaneId].source;
    const sourceKey = desiredTerminalSourceKey();
    const cwd = consoleCwd || paneConsolePath(panes[activePaneId]);
    terminalSession = beginTerminalStart(terminalSession);
    try {
      if (!terminal) await initializeTerminal();
      terminalFit?.fit();
      const size = {
        cols: terminalCols(),
        rows: terminalRows(),
      };
      await resizeTerminal(invoke, size);
      const sessionId =
        source.kind === "sftp"
          ? await startSftpTerminal(invoke, source.connectionId, size)
          : await startLocalTerminal(invoke, cwd, size);
      terminalSession = completeTerminalStart(terminalSession, sessionId, sourceKey);
      terminal?.clear();
      lastCommandId = source.kind === "sftp" ? "terminal.startSsh" : "terminal.start";
    } catch (error) {
      terminal?.writeln(`[terminal start failed] ${String(error)}`);
      lastCommandId = "terminal.startFailed";
    } finally {
      terminalSession = failTerminalStart(terminalSession);
    }
  }

  function appendTerminalBytes(bytes: number[]): void {
    terminal?.write(new Uint8Array(bytes));
  }

  function handleTerminalOutput(output: TerminalOutput): void {
    const result = acceptTerminalOutput(terminalSession, output);
    terminalSession = result.state;
    if (!result.accepted) return;

    appendTerminalBytes(output.bytes);
  }

  function handleTerminalExit(exit: TerminalExit): void {
    const result = acceptTerminalExit(terminalSession, exit);
    terminalSession = result.state;
    if (!result.accepted) return;

    terminal?.writeln("");
    terminal?.writeln(`[shell exited: ${result.code}] Press x to restart.`);
    if (consoleFocused) returnFromConsole();
    lastCommandId = "terminal.exit";
  }

  async function writeTerminal(input: string): Promise<void> {
    if (!terminalSession.started) await startTerminal();
    if (!terminalSession.started) return;

    try {
      await writeTerminalInput(invoke, input);
    } catch (error) {
      terminalSession = resetTerminalSession(terminalSession);
      terminal?.writeln(`[terminal unavailable] ${String(error)}`);
      lastCommandId = "terminal.writeFailed";
    }
  }

  async function writeTerminalFromKeyHandler(input: string, suppressEcho = true): Promise<void> {
    if (suppressEcho) terminalSession = suppressTerminalDataEcho(terminalSession, input);
    await writeTerminal(input);
  }

  function consumeSuppressedTerminalData(data: string): boolean {
    const result = consumeTerminalSuppressedData(terminalSession, data);
    terminalSession = result.state;
    return result.consumed;
  }

  function terminalCols(): number {
    return Math.max(40, terminal?.cols ?? 80);
  }

  function terminalRows(): number {
    return Math.max(6, terminal?.rows ?? 12);
  }

  function updateTerminalCopySelection(): void {
    const range = terminalCopySelectionRange(terminal, terminalCopyMode);
    if (!range) return;
    terminal?.select(range.column, range.row, range.length);
  }

  function ensureTerminalCopyCursorVisible(): void {
    if (!terminal || !terminalCopyMode.cursor) return;
    const buffer = terminal.buffer.active;
    if (terminalCopyMode.cursor.row < buffer.viewportY) {
      terminal.scrollLines(terminalCopyMode.cursor.row - buffer.viewportY);
    } else if (terminalCopyMode.cursor.row >= buffer.viewportY + terminal.rows) {
      terminal.scrollLines(terminalCopyMode.cursor.row - (buffer.viewportY + terminal.rows) + 1);
    }
  }

  function enterTerminalCopyMode(): void {
    if (!terminal) return;
    stopTerminalKeyRepeat();
    terminalCopyMode = beginTerminalCopyMode(terminal);
    terminal.clearSelection();
    updateTerminalCopySelection();
    statusMessage = "Terminal copy mode: move to select, Enter copies, Esc cancels.";
    lastCommandId = "terminal.copyMode";
  }

  function exitTerminalCopyMode(clearSelection = false): void {
    terminalCopyMode = createExitedTerminalCopyMode();
    if (clearSelection) terminal?.clearSelection();
  }

  function moveTerminalCopyCursor(rowDelta: number, columnDelta: number): void {
    if (!terminalCopyMode.active || !terminalCopyMode.cursor) return;
    terminalCopyMode = moveTerminalCopyCursorState(terminal, terminalCopyMode, rowDelta, columnDelta);
    ensureTerminalCopyCursorVisible();
    updateTerminalCopySelection();
    lastCommandId = "terminal.copyModeMove";
  }

  async function copyTerminalSelection(): Promise<void> {
    if (!terminal) return;
    const text = terminal.getSelection();
    if (!text) {
      statusMessage = "No terminal text is selected.";
      lastCommandId = "terminal.copyModeEmpty";
      return;
    }

    try {
      await writeClipboardText(text);
      statusMessage = "Copied terminal selection.";
      lastCommandId = "terminal.copyModeCopy";
      exitTerminalCopyMode();
    } catch (error) {
      statusMessage = error instanceof Error ? error.message : "Terminal text copy failed.";
      lastCommandId = "terminal.copyModeCopyFailed";
    }
  }

  function scrollTerminalByPage(delta: -1 | 1): void {
    terminal?.scrollPages(delta);
    lastCommandId = delta < 0 ? "terminal.scrollPageUp" : "terminal.scrollPageDown";
  }

  function scrollTerminalByLine(delta: -1 | 1): void {
    terminal?.scrollLines(delta);
    lastCommandId = delta < 0 ? "terminal.scrollLineUp" : "terminal.scrollLineDown";
  }

  function stopTerminalKeyRepeat(code?: string): void {
    terminalRepeatState = stopTerminalKeyRepeatState(terminalRepeatState, code);
  }

  function handleTerminalKeyRepeat(event: KeyboardEvent): boolean {
    const result = handleTerminalKeyRepeatState(event, terminalRepeatState, consoleFocused && !terminalCopyMode.active, (input, suppressEcho) => {
      void writeTerminalFromKeyHandler(input, suppressEcho);
    });
    terminalRepeatState = result.state;
    return result.handled;
  }

  function handleTerminalCopyModeKeydown(event: KeyboardEvent): boolean {
    if (!terminalCopyMode.active) return false;
    const action = terminalCopyModeKeyAction(event);
    if (!action) return false;

    void runTerminalCopyModeKeyActionWith(action, {
      cancel() {
        exitTerminalCopyMode(true);
        statusMessage = "Terminal copy mode cancelled.";
        lastCommandId = "terminal.copyModeCancel";
      },
      copy: copyTerminalSelection,
      moveCursor: moveTerminalCopyCursor,
      pageRows: terminalRows,
      home() {
        if (terminalCopyMode.cursor) {
          terminalCopyMode = setTerminalCopyCursorColumn(terminal, terminalCopyMode, 0);
          updateTerminalCopySelection();
          lastCommandId = "terminal.copyModeHome";
        }
      },
      end() {
        if (terminalCopyMode.cursor && terminal) {
          terminalCopyMode = setTerminalCopyCursorColumn(terminal, terminalCopyMode, Math.max(0, terminal.cols - 1));
          updateTerminalCopySelection();
          lastCommandId = "terminal.copyModeEnd";
        }
      },
    });
    return true;
  }

  async function runTerminalShortcutAction(action: TerminalShortcutAction): Promise<void> {
    await runTerminalShortcutActionWith(action, {
      enterCopyMode: enterTerminalCopyMode,
      scrollPage: scrollTerminalByPage,
      scrollLine: scrollTerminalByLine,
      insertActiveSelection: insertActiveSelectionIntoTerminal,
      toggleVisible: toggleConsoleVisibility,
      toggleFullscreen: toggleTerminalFullscreen,
      returnFromConsole,
    });
  }

  async function handleConsoleFallbackKeydown(event: KeyboardEvent): Promise<void> {
    lastKey = event.key;

    if (handleTerminalCopyModeKeydown(event)) {
      event.preventDefault();
      return;
    }

    const shortcutAction = terminalShortcutAction(event, keybindSettings);
    if (shortcutAction) {
      event.preventDefault();
      await runTerminalShortcutAction(shortcutAction);
      return;
    }

    terminal?.focus();
    const input = terminalInputForKeyboardEvent(event);
    if (input !== null) {
      event.preventDefault();
      await writeTerminalFromKeyHandler(input, false);
    }
  }

  async function initializeTerminal(): Promise<void> {
    if (!terminalElement || terminal) return;

    const created = await createTerminalInstance({
      element: terminalElement,
      onData(data) {
        if (consumeSuppressedTerminalData(data)) return;
        if (consoleFocused) void writeTerminal(data);
      },
      customKeyHandler: handleXtermKeyEvent,
      appearance: appearanceSettings,
    });
    terminal = created.terminal;
    terminalFit = created.fit;
  }

  function handleXtermKeyEvent(event: KeyboardEvent): boolean {
    if (!consoleFocused) {
      if (event.type === "keydown") focusActivePaneAfterDialog();
      return false;
    }

    if (consoleFocused && handleTerminalCopyModeKeydown(event)) {
      return false;
    }

    const shortcutAction = terminalShortcutAction(event, keybindSettings);
    if (shortcutAction) {
      void runTerminalShortcutAction(shortcutAction);
      return false;
    }

    if (handleTerminalKeyRepeat(event)) {
      return false;
    }

    return true;
  }

  function viewerPageSize(): number {
    return viewerPageSizeForElement(viewerElement);
  }

  function handleViewerImageLoad(event: Event): void {
    if (!(event.currentTarget instanceof HTMLImageElement)) return;
    viewer = recordImageNaturalSize(viewer, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
  }

  async function handleViewerKeydown(event: KeyboardEvent): Promise<void> {
    if (!viewer) return;
    event.preventDefault();

    if (event.key === "e" && !(viewer.kind === "text" && viewer.searchMode)) {
      await openEditorForPath(viewer.path, viewer.title);
      return;
    }

    const result = handleViewerKey(viewer, event.key, viewerPageSize());
    viewer = result.viewer;
    if (result.commandId) lastCommandId = result.commandId;
    if (!viewer) {
      focusActivePaneAfterDialog();
      return;
    }
  }

  function runOperationFailureDialogKeyAction(action: OperationFailureDialogKeyAction): void {
    if (action.type === "close") {
      closeOperationFailureDialog();
    } else if (action.type === "showSide") {
      applyOperationFailureSide(action.side);
    }
  }

  function applyOperationFailureSide(side: PaneId): void {
    const snapshot = operationFailureDialog;
    if (!snapshot || snapshot.failedEntries.length === 0) return;
    const entries = snapshot.failedEntries;
    const source = createOperationResultSource(entries, snapshot.returnPath, snapshot.label);
    operationFailureDialog = null;
    updatePane(side, loadedEntriesPatch(source, source.location, entries, null, visibleLoadedEntries(side, entries)));
    activePaneId = side;
    if (!consoleFocused) consoleCwd = source.returnPath;
    queueCursorScroll(side);
    statusMessage = `Operation failure virtual folder: ${entries.length} item(s).`;
    lastCommandId = side === "left" ? "operationResult.showLeft" : "operationResult.showRight";
    focusActivePaneAfterDialog();
  }

  function runFilePropertiesDialogKeyAction(action: FilePropertiesDialogKeyAction): void {
    if (action === "close") closeFilePropertiesDialog();
  }

  function runPaneDiffDialogKeyAction(action: PaneDiffDialogKeyAction): void {
    if (action.type === "close") {
      closePaneDiffDialog();
    } else if (action.type === "showSide") {
      applyPaneDiffSide(action.side);
    } else if (action.type === "scroll") {
      scrollPaneDiffDialog(action.amount);
    }
  }

  function applyPaneDiffSide(side: PaneId): void {
    const snapshot = paneDiffDialog;
    if (!snapshot) return;
    const sourcePane = panes[side];
    if (
      sourcePane.source.kind !== "local" &&
      sourcePane.source.kind !== "search" &&
      sourcePane.source.kind !== "diff" &&
      sourcePane.source.kind !== "operationResult" &&
      sourcePane.source.kind !== "gitStatus"
    ) {
      statusMessage = "Diff virtual folder is available for local/search/diff panes only.";
      lastCommandId = "diff.showSide.unsupported";
      return;
    }

    const entries = diffEntriesForSide(snapshot, side);
    const basePath = side === "left" ? snapshot.leftRootPath : snapshot.rightRootPath;
    const source = createDiffSource(side, entries, sourcePane.source.kind, basePath, snapshot.mode);
    paneDiffDialog = null;
    paneDiffListElement = null;
    updatePane(side, loadedEntriesPatch(source, source.location, entries, null, visibleLoadedEntries(side, entries)));
    activePaneId = side;
    if (!consoleFocused) consoleCwd = source.returnPath;
    queueCursorScroll(side);
    statusMessage = `Diff virtual folder: ${side} pane, ${entries.length} item(s).`;
    lastCommandId = side === "left" ? "diff.showLeft" : "diff.showRight";
    focusActivePaneAfterDialog();
  }

  function scrollPaneDiffDialog(amount: "lineUp" | "lineDown" | "pageUp" | "pageDown" | "top" | "bottom"): void {
    const list = paneDiffListElement;
    if (!list) return;
    const line = 24;
    const page = Math.max(line, list.clientHeight - line);
    if (amount === "lineUp") list.scrollTop -= line;
    if (amount === "lineDown") list.scrollTop += line;
    if (amount === "pageUp") list.scrollTop -= page;
    if (amount === "pageDown") list.scrollTop += page;
    if (amount === "top") list.scrollTop = 0;
    if (amount === "bottom") list.scrollTop = list.scrollHeight;
  }

  async function runConfirmationDialogKeyAction(action: ConfirmationDialogKeyAction): Promise<void> {
    if (action === "cancel") {
      await cancelOperationConfirmation();
    } else if (action === "confirm") {
      if (operationRunning && operationCancelConfirmOpen) {
        await confirmOperationCancel();
        return;
      }
      await confirmOperationExecution();
    }
  }

  function runLargeSearchResultDialogKeyAction(action: LargeSearchResultDialogKeyAction): void {
    if (action === "cancel") {
      cancelLargeSearchResult();
    } else if (action === "confirm") {
      confirmLargeSearchResult();
    }
  }

  function openFilePropertiesDialog(): void {
    const pane = panes[activePaneId];
    const snapshot = createFilePropertySnapshot(pane, visibleEntries(pane), paneHeaderLabel(pane));
    if (!snapshot) {
      statusMessage = "No entry for properties.";
      lastCommandId = "file.properties";
      return;
    }

    filePropertiesDialog = snapshot;
    statusMessage = `Properties: ${snapshot.totalCount} item(s).`;
    lastCommandId = "file.properties";
  }

  function closeFilePropertiesDialog(): void {
    filePropertiesDialog = null;
    focusActivePaneAfterDialog();
  }

  function openPaneDiffDialog(): void {
    const snapshot = comparePaneEntries(panes.left, panes.right, paneHeaderLabel(panes.left), paneHeaderLabel(panes.right));
    paneDiffDialog = snapshot;
    const changed = changedDiffCount(snapshot);
    statusMessage = `Pane diff: ${changed} changed / ${snapshot.counts.identical} identical.`;
    lastCommandId = "diff.openPaneDiff";
  }

  function changedDiffCount(snapshot: PaneDiffSnapshot): number {
    return (
      snapshot.counts.leftOnly +
      snapshot.counts.rightOnly +
      snapshot.counts.kindDifferent +
      snapshot.counts.sizeDifferent +
      snapshot.counts.modifiedDifferent +
      snapshot.counts.hashDifferent +
      snapshot.counts.readError
    );
  }

  async function openDetailedPaneDiffDialog(): Promise<void> {
    if (detailedDiffRunning) {
      statusMessage = "Detailed diff is already running. Press Esc to cancel.";
      lastCommandId = "diff.openDetailedPaneDiff.alreadyRunning";
      return;
    }
    const leftPane = panes.left;
    const rightPane = panes.right;
    if (!paneSourcesSupportDetailedDiff(leftPane, rightPane)) {
      statusMessage = "Detailed diff is available for local panes only.";
      lastCommandId = "diff.openDetailedPaneDiff.unsupported";
      return;
    }

    const leftPath = leftPane.currentPath;
    const rightPath = rightPane.currentPath;
    if (!leftPath || !rightPath) {
      statusMessage = "Detailed diff requires both pane paths.";
      lastCommandId = "diff.openDetailedPaneDiff.noPath";
      return;
    }

    const jobId = `detailed-diff-${Date.now().toString(36)}`;
    detailedDiffRunning = true;
    detailedDiffJobId = jobId;
    detailedDiffCancelRequested = false;
    statusMessage = "Detailed diff: scanning recursively and calculating MD5... Press Esc to cancel.";
    lastCommandId = "diff.openDetailedPaneDiff";
    try {
      const result = await compareLocalDirectoriesDetailed(invoke, jobId, leftPath, rightPath, true, true);
      const snapshot = detailedDiffSnapshot(result, leftPane, rightPane, paneHeaderLabel(leftPane), paneHeaderLabel(rightPane));
      paneDiffDialog = snapshot;
      const changed = changedDiffCount(snapshot);
      statusMessage = `Detailed diff: ${changed} changed / ${snapshot.counts.identical} identical.`;
    } catch (error) {
      const message = String(error);
      if (message.includes("Detailed diff canceled")) {
        statusMessage = "Detailed diff canceled.";
        lastCommandId = "diff.openDetailedPaneDiff.canceled";
      } else {
        statusMessage = `Detailed diff failed: ${message}`;
        lastCommandId = "diff.openDetailedPaneDiff.failed";
      }
    } finally {
      detailedDiffRunning = false;
      detailedDiffJobId = null;
      detailedDiffCancelRequested = false;
    }
  }

  async function cancelRunningDetailedDiff(): Promise<void> {
    if (!detailedDiffRunning || !detailedDiffJobId || detailedDiffCancelRequested) return;
    detailedDiffCancelRequested = true;
    statusMessage = "Detailed diff cancel requested...";
    lastCommandId = "diff.cancelDetailedPaneDiff";
    try {
      const accepted = await cancelDetailedDiff(invoke, detailedDiffJobId);
      if (!accepted) {
        statusMessage = "Detailed diff cancel request was not accepted.";
        lastCommandId = "diff.cancelDetailedPaneDiff.missing";
      }
    } catch (error) {
      statusMessage = `Detailed diff cancel failed: ${String(error)}`;
      lastCommandId = "diff.cancelDetailedPaneDiff.failed";
    }
  }

  function closePaneDiffDialog(): void {
    paneDiffDialog = null;
    paneDiffListElement = null;
    focusActivePaneAfterDialog();
  }

  function entryClassWithDiff(pane: PaneState, entry: FileEntry): string {
    const classes = [entryClass(pane, entry)];
    const status = paneDiffDialog?.highlightedKeys[pane.id].get(entry.key);
    if (status) {
      classes.push(`diff-${status.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}`);
    }
    return classes.filter(Boolean).join(" ");
  }

  function entryNameStyleWithAppearance(pane: PaneState, entry: FileEntry): string | null {
    const diffStatus = paneDiffDialog?.highlightedKeys[pane.id].get(entry.key);
    if (diffStatus) return null;
    const color = entryExtensionColor(pane, entry, normalizedExtensionColorMap(appearanceSettings));
    return color ? `color: ${color}` : null;
  }

  async function runExternalCommandDialogKeyAction(action: ExternalCommandDialogKeyAction): Promise<void> {
    if (action === "close") {
      closeExternalCommandDialog();
    } else if (action === "moveDown") {
      moveExternalCommandCursor(1);
    } else if (action === "moveUp") {
      moveExternalCommandCursor(-1);
    } else if (action === "run") {
      await runFocusedExternalCommand();
    }
  }

  async function runSearchDialogKeyAction(action: SearchDialogKeyAction): Promise<void> {
    if (action === "close") {
      closeSearchDialog();
    } else if (action === "run") {
      await runSearchFromDialog();
    }
  }

  async function runLocationDialogKeyAction(action: LocationDialogKeyAction): Promise<void> {
    if (action.type === "escapeCancelDelete") {
      applyLocationDialogStatePatch(clearPendingDeletesState());
      lastCommandId = "location.deleteCancel";
    } else if (action.type === "escapeCancelKnownHost") {
      applyLocationDialogStatePatch(cancelKnownHostState());
      lastCommandId = "remote.connectSftp.knownHostCancel";
    } else if (action.type === "backToManager") {
      returnToLocationManager();
    } else if (action.type === "close") {
      closeSftpConnectionDialog();
    } else if (action.type === "confirmDelete") {
      await deleteFocusedSftpProfile();
    } else if (action.type === "chooseLocation") {
      await chooseFocusedLocationOption();
    } else if (action.type === "trustKnownHost") {
      await testSftpConnectionFromDialog(true);
    } else if (action.type === "connect") {
      await testSftpConnectionFromDialog();
    } else if (action.type === "saveProfile") {
      await saveSftpProfileOnlyFromForm();
    } else if (action.type === "moveCursor") {
      moveLocationCursor(action.delta);
    } else if (action.type === "addCurrentSource") {
      await addCurrentSourceToLocationManager();
    } else if (action.type === "disconnectSession") {
      await disconnectFocusedActiveSftpSession();
    } else if (action.type === "deleteSaved") {
      await deleteFocusedSftpProfile();
    }
  }

  async function reloadPanesAfterOperation(job: FileOperationJob): Promise<void> {
    const paneIds = new Set<PaneId>([job.sourcePaneId]);
    if (job.destinationPaneId) paneIds.add(job.destinationPaneId);

    await Promise.all(
      [...paneIds].map((paneId) => {
        const pane = panes[paneId];
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
    const paneId = activePaneId;
    const pane = panes[paneId];
    if (pane.source.kind === "archive") {
      await loadArchiveDirectory(paneId, pane.source.archivePath, pane.source.innerPath);
      previewOperation("refresh");
      return;
    }

    if (pane.source.kind === "sftp") {
      await loadSftpDirectory(paneId, pane.source.connectionId, pane.source.remotePath, pane.source.returnPath);
      previewOperation("refresh");
      return;
    }

    if (pane.source.kind === "search") {
      await loadSearchDirectory(paneId, searchRequestFromSource(pane.source), pane.source.returnPath);
      previewOperation("refresh");
      return;
    }

    if (pane.source.kind === "diff") {
      await loadDirectory(paneId, pane.source.returnPath || pane.source.basePath);
      previewOperation("refresh");
      return;
    }

    if (pane.source.kind === "operationResult") {
      await loadDirectory(paneId, pane.source.returnPath);
      previewOperation("refresh");
      return;
    }

    if (pane.source.kind === "gitStatus") {
      await loadGitStatusDirectory(paneId, pane.source.rootPath, pane.source.returnPath);
      previewOperation("refresh");
      return;
    }

    const currentPath = pane.currentPath;
    if (!currentPath) return;

    await loadDirectory(paneId, currentPath);
    previewOperation("refresh");
  }

  function isEditableEventTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable
    );
  }

  function eventIsComposing(event: KeyboardEvent): boolean {
    return imeComposing || event.isComposing || event.key === "Process" || event.keyCode === 229;
  }

  async function handleKeydown(event: KeyboardEvent): Promise<void> {
    if (preferencesDialogOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        preferencesDialogOpen = false;
        lastCommandId = "preferences.close";
      }
      return;
    }

    if (consoleFocused) {
      // xterm owns focused terminal keystrokes. If DOM focus was lost while
      // Windy still considers the console active, recover the terminal focus
      // and keep console escape shortcuts available.
      if (!terminalHasDomFocus()) {
        await handleConsoleFallbackKeydown(event);
      }
      return;
    }

    lastKey = event.key;

    if (keyHelpVisible) {
      if (event.key === "Escape" || commandMatchesSingleKey(keybindSettings, "help.toggle", event)) {
        event.preventDefault();
        keyHelpVisible = false;
        lastCommandId = "help.close";
      }
      return;
    }

    if (detailedDiffRunning && event.key === "Escape") {
      event.preventDefault();
      await cancelRunningDetailedDiff();
      return;
    }

    if (viewer) {
      await handleViewerKeydown(event);
      return;
    }

    if (operationFailureDialog) {
      const action = classifyOperationFailureDialogKey(event);
      if (action) {
        event.preventDefault();
        runOperationFailureDialogKeyAction(action);
      }
      return;
    }

    if (filePropertiesDialog) {
      const action = classifyFilePropertiesDialogKey(event);
      if (action) {
        event.preventDefault();
        runFilePropertiesDialogKeyAction(action);
      }
      return;
    }

    if (paneDiffDialog) {
      const action = classifyPaneDiffDialogKey(event);
      if (action) {
        event.preventDefault();
        runPaneDiffDialogKeyAction(action);
      }
      return;
    }

    if (confirmationDialogOpen) {
      const action = classifyConfirmationDialogKey(event);
      if (action) {
        event.preventDefault();
        await runConfirmationDialogKeyAction(action);
      }
      return;
    }

    if (pendingLargeSearchResult) {
      const action = classifyLargeSearchResultDialogKey(event);
      if (action) {
        event.preventDefault();
        runLargeSearchResultDialogKeyAction(action);
      }
      return;
    }

    if (commandDialogOpen) {
      const action = classifyExternalCommandDialogKey(event);
      if (action) {
        event.preventDefault();
        await runExternalCommandDialogKeyAction(action);
      }
      return;
    }

    if (searchDialogOpen) {
      const action = classifySearchDialogKey(event, eventIsComposing(event));
      if (action) {
        event.preventDefault();
        await runSearchDialogKeyAction(action);
      }
      return;
    }

    if (sftpDialogOpen) {
      const action = classifyLocationDialogKey(event, {
        mode: locationDialogMode,
        hasPendingDelete: Boolean(pendingDeleteProfile || pendingDeleteLocalFavorite || pendingDeleteSearchProfile),
        hasPendingKnownHost: Boolean(pendingKnownHost),
        composing: eventIsComposing(event),
      });
      if (action) {
        event.preventDefault();
        await runLocationDialogKeyAction(action);
      }
      return;
    }

    if (isEditableEventTarget(event.target)) {
      if (event.key === "Escape" && operationJob) {
        event.preventDefault();
        closeOperationPreview();
      }
      return;
    }

    if (handlePrefixKey(event)) return;

    const paneAction = classifyPaneKey(event, {
      hasQuickFilterQuery: Boolean(panes[activePaneId].quickFilterQuery),
      hasOperationJob: Boolean(operationJob),
    }, keybindSettings);
    if (paneAction) {
      event.preventDefault();
      await runPaneKeyAction(paneAction);
    }
  }

  function activeFocusedEntryPath(): string {
    const pane = panes[activePaneId];
    return focusedEntryPath(pane, visibleEntries(pane));
  }

  function applyLoadedAppearanceSettings(settings: AppearanceSettings): void {
    appearanceSettings = settings;
    applyAppearanceToRoot(document.documentElement, appearanceSettings);
    if (terminal) {
      terminal.options.fontFamily = fontFamilySetting(appearanceSettings.fonts.terminalFamily);
      terminal.options.fontSize = appearanceSettings.fonts.terminalSize;
      terminal.options.theme = {
        ...terminal.options.theme,
        background: appearanceSettings.colors["terminal.background"],
        foreground: appearanceSettings.colors["terminal.foreground"],
        cursor: appearanceSettings.colors["terminal.cursor"],
        selectionBackground: appearanceSettings.colors["terminal.selectionBackground"],
      };
      terminalFit?.fit();
    }
  }

  async function loadAppSettings(): Promise<void> {
    try {
      appSettings = await getAppSettings(invoke);
      lastCommandId = "settings.load";
    } catch (error) {
      statusMessage = `Settings load failed: ${String(error)}`;
      lastCommandId = "settings.loadFailed";
    }
  }

  async function loadAppearanceSettings(): Promise<void> {
    try {
      applyLoadedAppearanceSettings(await getAppearanceSettings(invoke));
      lastCommandId = "appearance.load";
    } catch (error) {
      statusMessage = `Appearance settings load failed: ${String(error)}`;
      lastCommandId = "appearance.loadFailed";
    }
  }

  async function loadKeybindSettings(): Promise<void> {
    try {
      keybindSettings = await getKeybindSettings(invoke);
      lastCommandId = "keybind.load";
    } catch (error) {
      statusMessage = `Keybind settings load failed: ${String(error)}`;
      lastCommandId = "keybind.loadFailed";
    }
  }

  async function openPreferencesDialog(): Promise<void> {
    preferencesDialogOpen = true;
    preferencesLoading = true;
    preferencesError = "";
    try {
      const [loadedApp, loadedAppearance, loadedKeybind, loadedLanguage, loadedPresets] = await Promise.all([
        getAppSettings(invoke),
        getAppearanceSettings(invoke),
        getKeybindSettings(invoke),
        getLanguageSettings(invoke),
        listLanguagePresets(invoke),
      ]);
      appSettings = loadedApp;
      applyLoadedAppearanceSettings(loadedAppearance);
      keybindSettings = loadedKeybind;
      languageSettings = loadedLanguage;
      languagePresets = loadedPresets;
      statusMessage = "Preferences opened.";
      lastCommandId = "preferences.open";
    } catch (error) {
      preferencesError = String(error);
      statusMessage = `Preferences load failed: ${String(error)}`;
      lastCommandId = "preferences.loadFailed";
    } finally {
      preferencesLoading = false;
    }
  }

  async function savePreferencesAppSettings(settings: AppSettings): Promise<void> {
    preferencesLoading = true;
    preferencesError = "";
    try {
      appSettings = await saveAppSettings(invoke, settings);
      statusMessage = "General settings saved.";
      lastCommandId = "preferences.saveGeneral";
    } catch (error) {
      preferencesError = String(error);
      statusMessage = `General settings save failed: ${String(error)}`;
      lastCommandId = "preferences.saveGeneralFailed";
    } finally {
      preferencesLoading = false;
    }
  }

  async function savePreferencesAppearanceSettings(settings: AppearanceSettings): Promise<void> {
    preferencesLoading = true;
    preferencesError = "";
    try {
      applyLoadedAppearanceSettings(await saveAppearanceSettings(invoke, settings));
      statusMessage = "Appearance settings saved.";
      lastCommandId = "preferences.saveAppearance";
    } catch (error) {
      preferencesError = String(error);
      statusMessage = `Appearance settings save failed: ${String(error)}`;
      lastCommandId = "preferences.saveAppearanceFailed";
    } finally {
      preferencesLoading = false;
    }
  }

  async function savePreferencesKeybindSettings(settings: KeybindSettings): Promise<void> {
    preferencesLoading = true;
    preferencesError = "";
    try {
      keybindSettings = await saveKeybindSettings(invoke, settings);
      statusMessage = "Keybinding settings saved.";
      lastCommandId = "preferences.saveKeybindings";
    } catch (error) {
      preferencesError = String(error);
      statusMessage = `Keybinding settings save failed: ${String(error)}`;
      lastCommandId = "preferences.saveKeybindingsFailed";
    } finally {
      preferencesLoading = false;
    }
  }

  async function applyPreferencesLanguagePreset(locale: string): Promise<void> {
    preferencesLoading = true;
    preferencesError = "";
    try {
      languageSettings = await applyLanguagePreset(invoke, locale);
      statusMessage = `Language file applied: ${languageSettings.locale}`;
      lastCommandId = "preferences.applyLanguage";
    } catch (error) {
      preferencesError = String(error);
      statusMessage = `Language file apply failed: ${String(error)}`;
      lastCommandId = "preferences.applyLanguageFailed";
    } finally {
      preferencesLoading = false;
    }
  }

  async function openPreferencesConfigDirectory(): Promise<void> {
    preferencesLoading = true;
    preferencesError = "";
    try {
      await openConfigDirectory(invoke);
      statusMessage = "Config directory opened.";
      lastCommandId = "preferences.openConfigDirectory";
    } catch (error) {
      preferencesError = String(error);
      statusMessage = `Open config directory failed: ${String(error)}`;
      lastCommandId = "preferences.openConfigDirectoryFailed";
    } finally {
      preferencesLoading = false;
    }
  }

  async function resetPreferencesSettings(target: "app" | "appearance" | "keybind" | "language"): Promise<void> {
    preferencesLoading = true;
    preferencesError = "";
    try {
      if (target === "app") {
        appSettings = await resetAppSettings(invoke);
      } else if (target === "appearance") {
        applyLoadedAppearanceSettings(await resetAppearanceSettings(invoke));
      } else if (target === "keybind") {
        keybindSettings = await resetKeybindSettings(invoke);
      } else {
        languageSettings = await resetLanguageSettings(invoke);
      }
      statusMessage = "Settings reset. Previous config files were backed up.";
      lastCommandId = `preferences.reset.${target}`;
    } catch (error) {
      preferencesError = String(error);
      statusMessage = `Settings reset failed: ${String(error)}`;
      lastCommandId = "preferences.resetFailed";
    } finally {
      preferencesLoading = false;
    }
  }

  async function enterPreferencesSafeMode(): Promise<void> {
    preferencesLoading = true;
    preferencesError = "";
    try {
      const status = await enterSafeMode(invoke);
      appSettings = await getAppSettings(invoke);
      applyLoadedAppearanceSettings(await getAppearanceSettings(invoke));
      keybindSettings = await getKeybindSettings(invoke);
      languageSettings = await getLanguageSettings(invoke);
      statusMessage = `${status.message} Backups: ${status.backupPaths.length}`;
      lastCommandId = "preferences.safeMode";
    } catch (error) {
      preferencesError = String(error);
      statusMessage = `Safe Mode failed: ${String(error)}`;
      lastCommandId = "preferences.safeModeFailed";
    } finally {
      preferencesLoading = false;
    }
  }

  async function loadSafeModeStatus(): Promise<void> {
    try {
      const status = await getSafeModeStatus(invoke);
      if (!status.active) return;
      statusMessage = `${status.message} Backups: ${status.backupPaths.length}`;
      lastCommandId = "safeMode.startup";
    } catch (error) {
      statusMessage = `Safe Mode status failed: ${String(error)}`;
      lastCommandId = "safeMode.statusFailed";
    }
  }

  onMount(() => {
    const stopTerminalRepeatOnBlur = () => stopTerminalKeyRepeat();
    const blockMouseEvent = (event: MouseEvent) => {
      if (
        preferencesDialogOpen ||
        (event.target instanceof HTMLElement && event.target.closest("[data-windy-interactive]"))
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("blur", stopTerminalRepeatOnBlur);
    window.addEventListener("contextmenu", blockMouseEvent, { capture: true });
    window.addEventListener("mousedown", blockMouseEvent, { capture: true });
    window.addEventListener("mouseup", blockMouseEvent, { capture: true });
    window.addEventListener("auxclick", blockMouseEvent, { capture: true });
    void listen<TerminalOutput>("terminal-output", (event) => {
      handleTerminalOutput(event.payload);
    }).then((unlisten) => {
      terminalUnlisten = unlisten;
    });
    void listen<TerminalExit>("terminal-exit", (event) => {
      handleTerminalExit(event.payload);
    }).then((unlisten) => {
      terminalExitUnlisten = unlisten;
    });
    void listen("preferences-open", () => {
      void openPreferencesDialog();
    }).then((unlisten) => {
      preferencesUnlisten = unlisten;
    });
    applyAppearanceToRoot(document.documentElement, appearanceSettings);
    void loadAppSettings();
    void loadAppearanceSettings();
    void loadKeybindSettings();
    void loadSafeModeStatus();
    void ensureSftpProfilesLoaded();
    void initializePanes();

    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("blur", stopTerminalRepeatOnBlur);
      window.removeEventListener("contextmenu", blockMouseEvent, { capture: true });
      window.removeEventListener("mousedown", blockMouseEvent, { capture: true });
      window.removeEventListener("mouseup", blockMouseEvent, { capture: true });
      window.removeEventListener("auxclick", blockMouseEvent, { capture: true });
      stopTerminalKeyRepeat();
      terminalUnlisten?.();
      terminalExitUnlisten?.();
      preferencesUnlisten?.();
      void stopTerminal(invoke);
      listElements.left = null;
      listElements.right = null;
    };
  });

  async function initializePanes(): Promise<void> {
    try {
      const home = await homeDirectory(invoke);
      try {
        localRoots = await listLocalRoots(invoke);
      } catch {
        localRoots = ["/"];
      }
      homePath = home;
      consoleCwd = home;
      await Promise.all([loadDirectory("left", home), loadDirectory("right", home)]);
    } catch (error) {
      const message = `Initialization failed: ${String(error)}`;
      updatePane("left", { loading: false, error: message });
      updatePane("right", { loading: false, error: message });
      statusMessage = message;
      lastCommandId = "app.initializeFailed";
    }
  }
</script>

<svelte:head>
  <title>Windy</title>
</svelte:head>

<main
  bind:this={appShellElement}
  class:console-hidden={!consoleVisible}
  class:terminal-fullscreen={terminalFullscreen}
  class="app-shell"
  tabindex="-1"
  style={`--console-height: ${consoleVisible ? defaultConsoleHeightRatio * 100 : 0}%`}
>
  <section class="pane-grid" aria-label="File panes">
    {#each (["left", "right"] as PaneId[]) as paneId}
      {@const pane = panes[paneId]}
      {@const visible = visibleEntries(pane)}
      <FilePane
        {pane}
        active={activePaneId === paneId}
        visibleEntries={visible}
        virtualWindow={virtualEntryWindow(paneId, visible)}
        rowHeight={fileRowHeightSetting(appearanceSettings)}
        headerLabel={paneHeaderLabel(pane)}
        meta={paneMeta(pane, visible)}
        {showParentEntry}
        {registerList}
        {registerFilterInput}
        onListScroll={handleFileListScroll}
        onQuickFilterInput={updateQuickFilterQuery}
        onQuickFilterKeydown={handleQuickFilterInputKeydown}
        entryClass={entryClassWithDiff}
        entryNameStyle={entryNameStyleWithAppearance}
        {formatSize}
        {formatDate}
      />
    {/each}
  </section>

  <TerminalPane
    focused={consoleFocused}
    fullscreen={terminalFullscreen}
    visible={consoleVisible}
    bind:terminalElement
  />

  <StatusBar
    activePath={activeFocusedEntryPath()}
    {statusMessage}
    {activePaneId}
    {consoleFocused}
    {consoleVisible}
    {terminalFullscreen}
    terminalStarting={terminalSession.starting}
    terminalStarted={terminalSession.started}
    {lastCommandId}
    {lastKey}
    {moveCursorAfterSelection}
  />

  {#if viewer}
    <InternalViewer
      viewer={viewer}
      bind:surface={viewerElement}
      pageSize={viewerPageSize()}
      onImageLoad={handleViewerImageLoad}
    />
  {/if}

  {#if keyHelpVisible}
    <KeyHelpOverlay groups={keyHelpGroups(keybindSettings)} />
  {/if}

  {#if pendingLargeSearchResult}
    <LargeSearchResultDialog pending={pendingLargeSearchResult} />
  {/if}

  {#if searchDialogOpen}
    <SearchDialog
      form={searchForm}
      running={searchRunning}
      error={searchError}
      bind:regexInputElement={searchRegexInputElement}
      onFormPatch={updateSearchForm}
      onCompositionStart={() => (imeComposing = true)}
      onCompositionEnd={() => (imeComposing = false)}
    />
  {/if}

  {#if sftpDialogOpen}
    <LocationManagerDialog
      mode={locationDialogMode}
      {locationProfilesLoading}
      {locationProfilesError}
      locationOptions={locationOptionItems}
      {locationCursorIndex}
      {pendingDeleteProfile}
      {pendingDeleteLocalFavorite}
      {pendingDeleteSearchProfile}
      {sftpForm}
      {sftpConnecting}
      {sftpConnectionResult}
      {sftpConnectionError}
      {pendingKnownHost}
      bind:hostInputElement={sftpHostInputElement}
      bind:passwordInputElement={sftpPasswordInputElement}
      optionKey={locationOptionKey}
      onSftpFormPatch={updateSftpForm}
      onAuthKindChange={updateSftpAuthKind}
      onCompositionStart={() => (imeComposing = true)}
      onCompositionEnd={() => (imeComposing = false)}
    />
  {/if}

  {#if commandDialogOpen}
    <ExternalCommandDialog
      commands={externalCommands}
      loading={externalCommandsLoading}
      error={externalCommandError}
      cursorIndex={externalCommandCursorIndex}
      sourceKind={panes[activePaneId].source.kind}
      targetCount={selectedLocalCommandTargets().length}
    />
  {/if}

  {#if operationFailureDialog}
    <OperationFailureDialog snapshot={operationFailureDialog} />
  {/if}

  {#if filePropertiesDialog}
    <FilePropertiesDialog snapshot={filePropertiesDialog} />
  {/if}

  {#if paneDiffDialog}
    <PaneDiffDialog snapshot={paneDiffDialog} bind:listElement={paneDiffListElement} />
  {/if}

  {#if preferencesDialogOpen}
    <PreferencesDialog
      {appSettings}
      {appearanceSettings}
      {keybindSettings}
      {languageSettings}
      {languagePresets}
      loading={preferencesLoading}
      error={preferencesError}
      onClose={() => {
        preferencesDialogOpen = false;
        lastCommandId = "preferences.close";
      }}
      onOpenConfigDirectory={openPreferencesConfigDirectory}
      onSaveAppSettings={savePreferencesAppSettings}
      onSaveAppearanceSettings={savePreferencesAppearanceSettings}
      onSaveKeybindSettings={savePreferencesKeybindSettings}
      onApplyLanguagePreset={applyPreferencesLanguagePreset}
      onReset={resetPreferencesSettings}
      onEnterSafeMode={enterPreferencesSafeMode}
    />
  {/if}

  {#if operationJob && confirmationDialogOpen}
    <OperationConfirmationDialog
      job={operationJob}
      result={operationResult}
      running={operationRunning}
      cancelRequested={operationCancelRequested}
      cancelConfirmOpen={operationCancelConfirmOpen}
      doubleEscEnabled={appSettings.operationCancel.doubleEscEnabled}
      bind:nameInputElement={operationNameInputElement}
      executionMessage={executionConfirmationMessage(operationJob)}
      targetSummary={targetSummary(operationJob)}
      showPaths={shouldShowOperationPaths(operationJob)}
      nameRequired={operationNameRequired(operationJob)}
      previewLimit={operationTargetPreviewLimit(operationJob)}
      conflictMessages={operationConflictMessages(operationJob)}
      safetyMessages={operationSafetyMessages(operationJob)}
      onNameInput={updateOperationName}
    />
  {/if}
</main>

<style>
  @font-face {
    font-family: "UDEV Gothic";
    src: url("/fonts/UDEVGothic-Regular.ttf") format("truetype");
    font-style: normal;
    font-weight: 400;
    font-display: block;
  }

  @font-face {
    font-family: "UDEV Gothic";
    src: url("/fonts/UDEVGothic-Bold.ttf") format("truetype");
    font-style: normal;
    font-weight: 700;
    font-display: block;
  }

  @font-face {
    font-family: "UDEV Gothic";
    src: url("/fonts/UDEVGothic-Italic.ttf") format("truetype");
    font-style: italic;
    font-weight: 400;
    font-display: block;
  }

  @font-face {
    font-family: "UDEV Gothic";
    src: url("/fonts/UDEVGothic-BoldItalic.ttf") format("truetype");
    font-style: italic;
    font-weight: 700;
    font-display: block;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(html),
  :global(body) {
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: var(--windy-app-background, #181a1f);
    color: var(--windy-app-foreground, #e8e8e8);
    font-family: var(--windy-font-family, "UDEV Gothic", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace);
    font-size: var(--windy-ui-font-size, 12px);
  }

  :global(body) {
    user-select: none;
  }

  .app-shell {
    display: grid;
    grid-template-rows: minmax(0, 1fr) var(--console-height) 26px;
    height: 100vh;
    min-width: 760px;
    background: var(--windy-app-background, #1b1d22);
  }

  .app-shell,
  .app-shell * {
    pointer-events: none;
  }

  .app-shell.console-hidden .pane-grid {
    border-bottom: none;
  }

  .app-shell.terminal-fullscreen {
    grid-template-rows: minmax(0, 1fr) 26px;
  }

  .app-shell.terminal-fullscreen .pane-grid {
    display: none;
  }

  .pane-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    min-height: 0;
    border-bottom: 1px solid var(--windy-pane-border, #6b7280);
  }

</style>
