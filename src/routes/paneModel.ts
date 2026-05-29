import type {
  ArchiveDirectoryListing,
  PaneId,
  PaneSource,
  PaneState,
  SearchDirectoryListing,
  SearchDirectoryRequest,
  SftpDirectoryListing,
  DiffPaneSource,
  GitStatusListing,
  GitStatusPaneSource,
  OperationResultPaneSource,
  FileEntry,
  PaneSourceKind,
} from "./types";

export function createPane(id: PaneId, title: string): PaneState {
  return {
    id,
    title,
    source: createLocalSource(""),
    currentPath: "",
    entries: [],
    cursorKey: null,
    cursorIndex: -1,
    selectedKeys: new Set(),
    quickFilterQuery: "",
    quickFilterInputActive: false,
    showHiddenFiles: false,
    sortMode: "name",
    loading: true,
    error: null,
  };
}

export function otherPaneId(id: PaneId): PaneId {
  return id === "left" ? "right" : "left";
}

export function createLocalSource(path: string): PaneSource {
  return {
    kind: "local",
    location: path,
    displayName: path || "Local",
  };
}

export function createArchiveSource(listing: ArchiveDirectoryListing): PaneSource {
  return {
    kind: "archive",
    location: listing.displayPath,
    displayName: listing.displayPath,
    archivePath: listing.archivePath,
    innerPath: listing.innerPath,
  };
}

export function createSearchSource(
  listing: SearchDirectoryListing,
  request: SearchDirectoryRequest,
  returnPath: string,
): PaneSource {
  return {
    kind: "search",
    location: listing.displayPath,
    displayName: listing.displayPath,
    rootPath: listing.rootPath,
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
  };
}

export function createDiffSource(
  side: PaneId,
  entries: FileEntry[],
  baseSourceKind: PaneSourceKind,
  basePath: string,
  label: string,
): DiffPaneSource {
  const sideLabel = side === "left" ? "left" : "right";
  const countLabel = `${entries.length} item${entries.length === 1 ? "" : "s"}`;
  return {
    kind: "diff",
    location: `diff:${sideLabel}:${label}`,
    displayName: `${sideLabel} diff: ${label} (${countLabel})`,
    baseKind: baseSourceKind,
    basePath,
    returnPath: basePath,
    side,
    mode: "allChanged",
  };
}

export function createOperationResultSource(
  entries: FileEntry[],
  returnPath: string,
  operationLabel: string,
): OperationResultPaneSource {
  const countLabel = `${entries.length} failed item${entries.length === 1 ? "" : "s"}`;
  return {
    kind: "operationResult",
    location: `operation-result:${operationLabel}`,
    displayName: `operation failed: ${operationLabel} (${countLabel})`,
    returnPath,
    operationLabel,
  };
}

export function createGitStatusSource(listing: GitStatusListing, returnPath: string): GitStatusPaneSource {
  return {
    kind: "gitStatus",
    location: listing.displayPath,
    displayName: listing.displayPath,
    rootPath: listing.rootPath,
    returnPath,
  };
}

export function createSftpSource(listing: SftpDirectoryListing, returnPath: string): PaneSource {
  return {
    kind: "sftp",
    location: `sftp://${listing.connectionId}${listing.remotePath}`,
    displayName: listing.displayName,
    connectionId: listing.connectionId,
    remotePath: listing.remotePath,
    returnPath,
  };
}

export function paneSourceLabel(pane: PaneState): string {
  if (pane.source.kind === "local") return pane.source.displayName || pane.currentPath || "Local";
  return pane.source.displayName || pane.currentPath;
}

export function paneHeaderLabel(pane: PaneState): string {
  const label = paneSourceLabel(pane) || "Loading...";
  if (pane.source.kind === "local") return `Local: ${label}`;
  if (pane.source.kind === "sftp") return `SFTP: ${label}`;
  if (pane.source.kind === "search") return `Search: ${label}`;
  if (pane.source.kind === "diff") return `Diff: ${label}`;
  if (pane.source.kind === "operationResult") return `Result: ${label}`;
  if (pane.source.kind === "gitStatus") return `Git: ${label}`;
  if (pane.source.kind === "archive") return `Archive: ${baseName(pane.source.archivePath) || label}`;
  return label;
}

export function baseName(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
