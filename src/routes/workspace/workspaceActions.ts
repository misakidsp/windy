import { ShellQuoteError, type ExternalCommandContext } from "../externalCommandModel";
import {
  type ConfirmationDialogKeyAction,
  type ExternalCommandDialogKeyAction,
  type FilePropertiesDialogKeyAction,
  type LargeSearchResultDialogKeyAction,
  type LocationDialogKeyAction,
  type OperationFailureDialogKeyAction,
  type PaneDiffDialogKeyAction,
  type SearchDialogKeyAction,
} from "../dialogKeyboardModel";
import { type LocationDialogStatePatch } from "../locationDialogState";
import { type PaneKeyAction, type PrefixKeyAction } from "../keyboardModel";
import { type PaneDiffSnapshot } from "../diffModel";
import { type TerminalShortcutAction } from "../terminalKeyHandling";
import type {
  AppearanceSettings,
  AppSettings,
  CommandTarget,
  FileEntry,
  FileOperationJob,
  FileOperationKind,
  FileOperationResult,
  KeybindSettings,
  LocalFavoriteProfile,
  LocationOption,
  PaneId,
  PaneState,
  PrefixKey,
  SearchDialogForm,
  SearchDirectoryListing,
  SearchDirectoryRequest,
  SearchProfile,
  SafeModeStatus,
  SftpConnectionForm,
  SftpConnectionProfile,
  SftpConnectionTestResult,
  TerminalExit,
  TerminalOutput,
  UndoSnapshot,
  VirtualEntryWindow,
} from "../types";

export interface WorkspaceActions {
  handleActivityKey(event: KeyboardEvent): Promise<boolean>;
  localizedSftpConnectionMessage(result: SftpConnectionTestResult): string;
  localizedSafeModeMessage(status: SafeModeStatus): string;
  localizedBackendError(error: unknown): string;
  localizedClipboardError(error: unknown): string;
  localizedShellQuoteError(error: ShellQuoteError): string;
  applyLocationDialogStatePatch(patch: LocationDialogStatePatch): void;
  paneConsolePath(pane: PaneState): string;
  sftpReturnPathForPane(pane: PaneState): string;
  loadDirectory(paneId: PaneId, path: string, preferredCursorKey?: string | null): Promise<void>;
  loadGitStatusDirectory(paneId: PaneId, path: string, returnPath: string): Promise<boolean>;
  loadArchiveDirectory(paneId: PaneId, archivePath: string, innerPath?: string, preferredCursorKey?: string | null): Promise<void>;
  loadSearchDirectory(paneId: PaneId, request: SearchDirectoryRequest, returnPath: string, forceLargeResult?: boolean): Promise<boolean>;
  applySearchListing(paneId: PaneId, listing: SearchDirectoryListing, request: SearchDirectoryRequest, returnPath: string): void;
  loadSftpDirectory(paneId: PaneId, connectionId: string, remotePath: string, returnPath?: string, preferredCursorKey?: string | null): Promise<void>;
  updatePane(paneId: PaneId, patch: Partial<PaneState>): void;
  registerList(node: HTMLElement, initialPaneId: PaneId): { update(nextPaneId: PaneId): void; destroy(): void };
  registerFilterInput(node: HTMLInputElement, paneId: PaneId): { destroy(): void };
  queueCursorScroll(paneId: PaneId): void;
  scrollCursorIntoView(paneId: PaneId): void;
  scrollTopForCursorIndex(paneId: PaneId, index: number): number;
  syncVirtualScrollToCursor(paneId: PaneId, index: number): void;
  handleFileListScroll(paneId: PaneId): void;
  visibleEntries(pane: PaneState): FileEntry[];
  visibleLoadedEntries(paneId: PaneId, entries: FileEntry[]): FileEntry[];
  virtualEntryWindow(paneId: PaneId, entries: FileEntry[]): VirtualEntryWindow;
  enterQuickFilterInput(paneId: PaneId): void;
  leaveQuickFilterInput(paneId: PaneId): void;
  clearQuickFilter(paneId: PaneId): void;
  updateQuickFilterQuery(paneId: PaneId, query: string): void;
  handleQuickFilterInputKeydown(event: KeyboardEvent, paneId: PaneId): void;
  moveCursor(delta: number): void;
  moveCursorTo(index: number, commandId: string): void;
  moveCursorByPage(direction: -1 | 1): void;
  startPrefixMode(prefix: PrefixKey): void;
  handlePrefixKey(event: KeyboardEvent): boolean;
  runPrefixKeyAction(action: PrefixKeyAction): Promise<void>;
  runPaneKeyAction(action: PaneKeyAction): Promise<void>;
  visiblePageSize(paneId: PaneId): number;
  focusOtherPane(): void;
  goParent(): Promise<void>;
  goRoot(): Promise<void>;
  goHome(): Promise<void>;
  openOtherPanePathHere(): Promise<void>;
  openCurrentPathInOtherPane(): Promise<void>;
  openFocused(): Promise<void>;
  openFocusedWithDefaultApp(): Promise<void>;
  editFocused(): Promise<void>;
  openViewer(entry: FileEntry): Promise<void>;
  openImageViewer(entry: FileEntry): Promise<void>;
  openWithDefaultApp(entry: FileEntry): Promise<void>;
  openEditorForPath(path: string, label: string): Promise<void>;
  toggleFocusedSelection(): void;
  selectAllVisible(): void;
  cycleSortMode(): void;
  toggleHiddenFiles(): void;
  extendSelection(delta: -1 | 1): void;
  selectedOperationTargets(pane: PaneState): FileEntry[];
  markedCommandTargets(pane: PaneState): CommandTarget[];
  isWindowsPlatform(): boolean;
  selectedLocalCommandTargets(): CommandTarget[];
  localMarkedCommandTargets(pane: PaneState): CommandTarget[];
  externalCommandContext(): ExternalCommandContext;
  writeClipboardText(text: string): Promise<void>;
  copySelectedPathsToClipboard(): Promise<void>;
  copyCurrentDirectoryToClipboard(): Promise<void>;
  copySelectedNamesToClipboard(): Promise<void>;
  insertActiveSelectionIntoTerminal(): Promise<void>;
  loadExternalCommands(): Promise<void>;
  openExternalCommandDialog(): Promise<void>;
  closeExternalCommandDialog(): void;
  moveExternalCommandCursor(delta: number): void;
  runFocusedExternalCommand(): Promise<void>;
  selectedCommandTargets(pane: PaneState): CommandTarget[];
  isSupportedArchiveName(name: string): boolean;
  useWindowsAttributesOperation(sourcePane: PaneState): boolean;
  createFileOperationJob(kind: FileOperationKind): FileOperationJob;
  previewOperation(kind: FileOperationKind): void;
  archiveCreationDestinationPaneId(sourcePaneId: PaneId): PaneId | null;
  previewDeleteOperation(permanent: boolean): void;
  closeOperationPreview(): void;
  updateSearchForm(patch: Partial<SearchDialogForm>): void;
  openSearchDialog(): void;
  closeSearchDialog(): void;
  cancelLargeSearchResult(): void;
  confirmLargeSearchResult(): void;
  runSearchFromDialog(): Promise<void>;
  openGitStatusSource(): Promise<void>;
  updateOperationName(name: string): void;
  focusOperationNameInput(): void;
  operationConflictMessages(job: FileOperationJob): string[];
  operationBlockingMessages(job: FileOperationJob): string[];
  executionConfirmationMessage(job: FileOperationJob): string;
  saveOperationFailureLog(label: string, result: FileOperationResult): Promise<string | null>;
  handleOperationResult(job: FileOperationJob, result: FileOperationResult): Promise<void>;
  closeOperationFailureDialog(): void;
  confirmOperationExecution(): Promise<void>;
  cancelOperationConfirmation(): Promise<void>;
  confirmOperationCancel(): Promise<void>;
  requestOperationCancel(): Promise<void>;
  previewUndoOperation(): void;
  previewRedoOperation(): void;
  operationSafetyMessages(job: FileOperationJob): string[];
  pushUndoSnapshot(snapshot: UndoSnapshot | null, clearRedo: boolean): void;
  commitUndoHistory(): void;
  commitRedoHistory(executedJob: FileOperationJob): void;
  refreshLocationOptions(): void;
  locationProfileIndex(profileId: string): number;
  refreshActiveSftpSessions(): Promise<void>;
  paneUsesSftpConnection(paneId: PaneId, connectionId: string): boolean;
  sftpConnectionInUseByOtherPane(connectionId: string, paneId: PaneId): boolean;
  disconnectSftpConnection(connectionId: string): Promise<void>;
  disconnectSftpIfUnused(connectionId: string, leavingPaneId: PaneId): Promise<void>;
  maybeDisconnectLeavingSftpPane(paneId: PaneId): Promise<void>;
  enforceSftpSessionLimit(): Promise<void>;
  openSftpConnectionDialog(): Promise<void>;
  closeSftpConnectionDialog(): void;
  openSftpFormFromLocationManager(): void;
  openSftpProfileFromLocationManager(profile: SftpConnectionProfile): void;
  chooseLocationOption(option: LocationOption): Promise<void>;
  chooseFocusedLocationOption(): Promise<void>;
  moveLocationCursor(delta: -1 | 1): void;
  ensureSftpProfilesLoaded(force?: boolean): Promise<void>;
  loadSftpProfiles(): Promise<void>;
  updateSftpForm(patch: Partial<SftpConnectionForm>): void;
  updateSftpAuthKind(authKind: SftpConnectionForm["authKind"]): void;
  resetSftpCompositionState(): void;
  returnToLocationManager(): void;
  addCurrentSearchToProfiles(): Promise<void>;
  addCurrentLocalPathToFavorites(): Promise<void>;
  addCurrentSourceToLocationManager(): Promise<void>;
  saveSftpProfileFromForm(): Promise<void>;
  saveSftpProfileOnlyFromForm(): Promise<void>;
  deleteFocusedSftpProfile(): Promise<void>;
  disconnectFocusedActiveSftpSession(): Promise<void>;
  deleteFocusedLocalFavorite(favorite: LocalFavoriteProfile): Promise<void>;
  deleteFocusedSearchProfile(profile: SearchProfile): Promise<void>;
  testSftpConnectionFromDialog(trustHostKey?: boolean): Promise<void>;
  focusActivePaneAfterDialog(): void;
  desiredTerminalSourceKey(): string;
  stopTerminalSession(): Promise<void>;
  focusConsoleAndStart(): Promise<void>;
  focusConsole(): void;
  returnFromConsole(): void;
  terminalHasDomFocus(): boolean;
  toggleConsoleVisibility(): void;
  toggleTerminalFullscreen(): Promise<void>;
  startTerminal(): Promise<void>;
  appendTerminalBytes(bytes: number[]): void;
  handleTerminalOutput(output: TerminalOutput): void;
  handleTerminalExit(exit: TerminalExit): void;
  writeTerminal(input: string): Promise<void>;
  writeTerminalFromKeyHandler(input: string, suppressEcho?: boolean): Promise<void>;
  consumeSuppressedTerminalData(data: string): boolean;
  terminalCols(): number;
  terminalRows(): number;
  updateTerminalCopySelection(): void;
  ensureTerminalCopyCursorVisible(): void;
  enterTerminalCopyMode(): void;
  exitTerminalCopyMode(clearSelection?: boolean): void;
  moveTerminalCopyCursor(rowDelta: number, columnDelta: number): void;
  copyTerminalSelection(): Promise<void>;
  scrollTerminalByPage(delta: -1 | 1): void;
  scrollTerminalByLine(delta: -1 | 1): void;
  stopTerminalKeyRepeat(code?: string): void;
  handleTerminalKeyRepeat(event: KeyboardEvent): boolean;
  handleTerminalCopyModeKeydown(event: KeyboardEvent): boolean;
  runTerminalShortcutAction(action: TerminalShortcutAction): Promise<void>;
  handleConsoleFallbackKeydown(event: KeyboardEvent): Promise<void>;
  initializeTerminal(): Promise<void>;
  handleXtermKeyEvent(event: KeyboardEvent): boolean;
  handleViewerImageLoad(event: Event): void;
  handleViewerKeydown(event: KeyboardEvent): Promise<void>;
  runOperationFailureDialogKeyAction(action: OperationFailureDialogKeyAction): void;
  applyOperationFailureSide(side: PaneId): void;
  runFilePropertiesDialogKeyAction(action: FilePropertiesDialogKeyAction): void;
  runPaneDiffDialogKeyAction(action: PaneDiffDialogKeyAction): void;
  applyPaneDiffSide(side: PaneId): void;
  scrollPaneDiffDialog(amount: "lineUp" | "lineDown" | "pageUp" | "pageDown" | "top" | "bottom"): void;
  runConfirmationDialogKeyAction(action: ConfirmationDialogKeyAction): Promise<void>;
  runLargeSearchResultDialogKeyAction(action: LargeSearchResultDialogKeyAction): void;
  openFilePropertiesDialog(): void;
  closeFilePropertiesDialog(): void;
  openPaneDiffDialog(): void;
  changedDiffCount(snapshot: PaneDiffSnapshot): number;
  openDetailedPaneDiffDialog(): Promise<void>;
  cancelRunningDetailedDiff(): Promise<void>;
  closePaneDiffDialog(): void;
  entryClassWithDiff(pane: PaneState, entry: FileEntry): string;
  entryNameStyleWithAppearance(pane: PaneState, entry: FileEntry): string | null;
  runExternalCommandDialogKeyAction(action: ExternalCommandDialogKeyAction): Promise<void>;
  runSearchDialogKeyAction(action: SearchDialogKeyAction): Promise<void>;
  runLocationDialogKeyAction(action: LocationDialogKeyAction): Promise<void>;
  reloadPanesAfterOperation(job: FileOperationJob): Promise<void>;
  refreshActivePane(): Promise<void>;
  isEditableEventTarget(target: EventTarget | null): boolean;
  eventIsComposing(event: KeyboardEvent): boolean;
  handleKeydown(event: KeyboardEvent): Promise<void>;
  activeFocusedEntryPath(): string;
  applyLoadedAppearanceSettings(settings: AppearanceSettings): void;
  loadAppSettings(): Promise<void>;
  loadAppearanceSettings(): Promise<void>;
  loadKeybindSettings(): Promise<void>;
  loadLanguageSettings(): Promise<void>;
  openPreferencesDialog(): Promise<void>;
  savePreferencesAppSettings(settings: AppSettings): Promise<void>;
  savePreferencesAppearanceSettings(settings: AppearanceSettings): Promise<void>;
  savePreferencesKeybindSettings(settings: KeybindSettings): Promise<void>;
  applyPreferencesLanguagePreset(locale: string): Promise<void>;
  openPreferencesConfigDirectory(): Promise<void>;
  resetPreferencesSettings(target: "app" | "appearance" | "keybind" | "language"): Promise<void>;
  enterPreferencesSafeMode(): Promise<void>;
  loadSafeModeStatus(): Promise<void>;
  loadTerminalShellKind(): Promise<void>;
  initializePanes(): Promise<void>;
}
