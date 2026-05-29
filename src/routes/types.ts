// Shared Svelte-side data shapes for the main Windy screen.

export type PaneId = "left" | "right";
export type EntryKind = "file" | "directory" | "symlink" | "other";

export type VirtualEntryWindow = {
  start: number;
  end: number;
  topPadding: number;
  bottomPadding: number;
  entries: FileEntry[];
};

export type FileEntry = {
  key: string;
  name: string;
  path: string;
  kind: EntryKind;
  size: number | null;
  modifiedAt: number | null;
  hidden: boolean;
  readonly: boolean;
  mode: number | null;
};

export type AppSettings = {
  useTrash: boolean;
  operationResult: OperationResultSettings;
  operationCancel: OperationCancelSettings;
  sftpSession: SftpSessionSettings;
  sftpTransfer: SftpTransferSettings;
};

export type OperationResultSettings = {
  showStatus: boolean;
  showFailureDialog: boolean;
  printToTerminal: boolean;
  saveFailureLog: boolean;
};

export type OperationCancelSettings = {
  doubleEscEnabled: boolean;
  doubleEscWindowMs: number;
};

export type SftpSessionLifecycle = "disconnectOnLeave" | "keepRecent" | "manual";

export type SftpSessionSettings = {
  lifecycle: SftpSessionLifecycle;
  maxSessions: number;
  idleDisconnectMinutes: number;
};

export type SftpTransferSettings = {
  partFileThresholdBytes: number;
};

export type AppearanceSettings = {
  schemaVersion: number;
  fonts: AppearanceFontSettings;
  colors: Record<string, string>;
  extensionColors: Record<string, string>;
};

export type AppearanceFontSettings = {
  uiFamily: string;
  terminalFamily: string;
  uiSize: number;
  terminalSize: number;
  viewerSize: number;
};

export type KeybindSettings = {
  schemaVersion: number;
  bindings: Record<string, string[]>;
  lockedBindings: Record<string, string[]>;
};

export type VisibleEntriesCache = {
  entriesRef: FileEntry[];
  selectedKeysRef: Set<string>;
  quickFilterQuery: string;
  showHiddenFiles: boolean;
  sortMode: SortMode;
  result: FileEntry[];
};

export type DirectoryListing = {
  path: string;
  entries: FileEntry[];
};

export type ArchiveDirectoryListing = {
  archivePath: string;
  innerPath: string;
  displayPath: string;
  entries: FileEntry[];
};

export type SftpDirectoryListing = {
  connectionId: string;
  displayName: string;
  remotePath: string;
  displayPath: string;
  entries: FileEntry[];
};

export type SearchKind = "all" | "file" | "directory" | "symlink" | "other";
export type SearchHiddenMode = "exclude" | "include" | "only";
export type SearchReadonlyMode = "any" | "readonly" | "writable";

export type SearchDirectoryRequest = {
  rootPath: string;
  nameRegex: string;
  recursive: boolean;
  minSizeBytes?: number | null;
  maxSizeBytes?: number | null;
  modifiedAfter?: number | null;
  modifiedBefore?: number | null;
  kind: SearchKind;
  hiddenMode: SearchHiddenMode;
  readonlyMode: SearchReadonlyMode;
};

export type SearchDialogForm = {
  rootPath: string;
  nameRegex: string;
  recursive: boolean;
  minSizeBytes: string;
  maxSizeBytes: string;
  modifiedAfter: string;
  modifiedBefore: string;
  kind: SearchKind;
  hiddenMode: SearchHiddenMode;
  readonlyMode: SearchReadonlyMode;
};

export type SearchDirectoryListing = {
  rootPath: string;
  displayPath: string;
  queryLabel: string;
  entries: FileEntry[];
};

export type GitStatusListing = {
  rootPath: string;
  displayPath: string;
  entries: FileEntry[];
};

export type PendingLargeSearchResult = {
  paneId: PaneId;
  listing: SearchDirectoryListing;
  request: SearchDirectoryRequest;
  returnPath: string;
};

export type PaneSourceKind = "local" | "archive" | "sftp" | "search" | "diff" | "operationResult" | "gitStatus";

export type LocalPaneSource = {
  kind: "local";
  location: string;
  displayName: string;
};

export type ArchivePaneSource = {
  kind: "archive";
  location: string;
  displayName: string;
  archivePath: string;
  innerPath: string;
};

export type SftpPaneSource = {
  kind: "sftp";
  location: string;
  displayName: string;
  connectionId: string;
  remotePath: string;
  returnPath: string;
};

export type SearchPaneSource = {
  kind: "search";
  location: string;
  displayName: string;
  rootPath: string;
  returnPath: string;
  nameRegex: string;
  recursive: boolean;
  minSizeBytes: number | null;
  maxSizeBytes: number | null;
  modifiedAfter: number | null;
  modifiedBefore: number | null;
  searchKind: SearchKind;
  hiddenMode: SearchHiddenMode;
  readonlyMode: SearchReadonlyMode;
};

export type DiffPaneSource = {
  kind: "diff";
  location: string;
  displayName: string;
  baseKind: PaneSourceKind;
  basePath: string;
  returnPath: string;
  side: PaneId;
  mode: "leftOnly" | "rightOnly" | "changed" | "allChanged";
};

export type OperationResultPaneSource = {
  kind: "operationResult";
  location: string;
  displayName: string;
  returnPath: string;
  operationLabel: string;
};

export type GitStatusPaneSource = {
  kind: "gitStatus";
  location: string;
  displayName: string;
  rootPath: string;
  returnPath: string;
};

export type PaneSource =
  | LocalPaneSource
  | ArchivePaneSource
  | SftpPaneSource
  | SearchPaneSource
  | DiffPaneSource
  | OperationResultPaneSource
  | GitStatusPaneSource;

export type SortMode = "name" | "modified" | "size" | "kind";

export type PaneState = {
  id: PaneId;
  title: string;
  source: PaneSource;
  currentPath: string;
  entries: FileEntry[];
  cursorKey: string | null;
  cursorIndex: number;
  selectedKeys: Set<string>;
  quickFilterQuery: string;
  quickFilterInputActive: boolean;
  showHiddenFiles: boolean;
  sortMode: SortMode;
  loading: boolean;
  error: string | null;
};

export type FileOperationKind =
  | "copy"
  | "move"
  | "rename"
  | "chmod"
  | "windowsAttributes"
  | "trash"
  | "delete"
  | "mkdir"
  | "createFile"
  | "removeEmptyDirectory"
  | "removeEmptyFile"
  | "refresh"
  | "extractArchive"
  | "createArchive";
export type JobRisk = "safe" | "warning" | "danger";
export type PrefixKey = string;

export type FileOperationTarget = {
  key: string;
  name: string;
  path: string;
  kind: EntryKind;
  size?: number | null;
  modifiedAt?: number | null;
  hidden?: boolean;
  readonly?: boolean;
  mode: number | null;
};

export type CommandTarget = FileOperationTarget & {
  sourceKind: PaneSourceKind;
};

export type FileOperationJob = {
  id: string;
  kind: FileOperationKind;
  commandId: string;
  label: string;
  status: "preview" | "running" | "cancelRequested";
  risk: JobRisk;
  sourcePaneId: PaneId;
  destinationPaneId: PaneId | null;
  sourcePath: string;
  destinationPath: string | null;
  targets: FileOperationTarget[];
  plannedActions: string[];
  confirmationMessage: string;
  requestedName: string | null;
  sftpSafeTransferPartThresholdBytes?: number;
  executable: boolean;
  createdAt: string;
};

export type FileOperationResultItem = {
  path: string;
  message: string;
};

export type FileOperationResult = {
  succeeded: FileOperationResultItem[];
  failed: FileOperationResultItem[];
  canceled?: boolean;
};

export type OperationResultSnapshot = {
  label: string;
  result: FileOperationResult;
  logPath: string | null;
  failedEntries: FileEntry[];
  returnPath: string;
};

export type UndoSnapshot = {
  label: string;
  job: FileOperationJob;
  redoLabel: string;
  redoJob: FileOperationJob;
};

export type TextFileContent = {
  path: string;
  content: string;
  encoding: string;
  truncated: boolean;
};

export type ImageFileContent = {
  path: string;
  dataUrl: string;
  mimeType: string;
};

export type TerminalOutput = {
  sessionId: number;
  bytes: number[];
};

export type TerminalExit = {
  sessionId: number;
  exitCode: number | null;
};

export type TerminalCopyPosition = {
  row: number;
  column: number;
};

export type TerminalRepeatState = {
  code: string;
  input: string;
  delayTimer: number | null;
  intervalTimer: number | null;
};

export type ExternalCommandDefinition = {
  id: string;
  name: string;
  description: string;
  template: string;
  argumentMode?: "args" | "repeat" | "join";
  itemTemplate?: string;
  itemSeparator?: string;
  returnFocus?: boolean;
};

export type SftpConnectionForm = {
  profileId: string | null;
  name: string;
  host: string;
  port: string;
  username: string;
  authKind: "password" | "privateKey";
  password: string;
  privateKeyPath: string;
  passphrase: string;
  remotePath: string;
  saveProfile: boolean;
};

export type SftpConnectionTestResult = {
  connectionId: string;
  displayName: string;
  remotePath: string;
  message: string;
};

export type PendingKnownHost = {
  host: string;
  port: number;
  fingerprint: string;
  knownHostsPath: string;
};

export type ActiveSftpSession = {
  connectionId: string;
  displayName: string;
  remotePath: string;
  createdAt: number;
  lastUsedAt: number;
};

export type SftpConnectionProfile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  remotePath: string;
  authKind: "password" | "privateKey";
  privateKeyPath: string | null;
};

export type LocalFavoriteProfile = {
  id: string;
  name: string;
  path: string;
};

export type SearchProfile = {
  id: string;
  name: string;
  rootPath: string;
  nameRegex: string;
  recursive: boolean;
  minSizeBytes: number | null;
  maxSizeBytes: number | null;
  modifiedAfter: number | null;
  modifiedBefore: number | null;
  kind: SearchKind | null;
  hiddenMode: SearchHiddenMode | null;
  readonlyMode: SearchReadonlyMode | null;
};

export type LocationDialogMode = "manager" | "sftpForm";

export type LocationOption = {
  kind: "local" | "localPath" | "localFavorite" | "searchProfile" | "activeSftpSession" | "newSftp" | "sftpProfile";
  label: string;
  detail: string;
  path?: string;
  localFavorite?: LocalFavoriteProfile;
  searchProfile?: SearchProfile;
  activeSession?: ActiveSftpSession;
  profile?: SftpConnectionProfile;
};

export type TextViewerState = {
  kind: "text";
  path: string;
  title: string;
  lines: string[];
  topLine: number;
  encoding: string;
  truncated: boolean;
  searchQuery: string;
  searchMode: boolean;
  searchMessage: string;
};

export type ImageViewerState = {
  kind: "image";
  path: string;
  title: string;
  src: string;
  zoom: number;
  fitToWindow: boolean;
  offsetX: number;
  offsetY: number;
  naturalWidth: number | null;
  naturalHeight: number | null;
};

export type ViewerState = TextViewerState | ImageViewerState;
