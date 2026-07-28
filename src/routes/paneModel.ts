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
import { translateMessage, type Translate } from "./localization";

const fallbackTranslate: Translate = (id, values) => translateMessage(undefined, id, values);

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
    displayName: path,
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
    truncated: listing.truncated,
  };
}

export function createDiffSource(
  side: PaneId,
  entries: FileEntry[],
  baseSourceKind: PaneSourceKind,
  basePath: string,
  label: string,
  t: Translate = fallbackTranslate,
): DiffPaneSource {
  const sideLabel = t(side === "left" ? "diff.sourceSide.left" : "diff.sourceSide.right");
  const countLabel = t("diff.sourceCount", { count: entries.length });
  return {
    kind: "diff",
    location: `diff:${sideLabel}:${label}`,
    displayName: t("diff.sourceLabel", { side: sideLabel, label, countLabel }),
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
  t: Translate = fallbackTranslate,
): OperationResultPaneSource {
  const countLabel = t("operationResult.sourceCount", { count: entries.length });
  return {
    kind: "operationResult",
    location: `operation-result:${operationLabel}`,
    displayName: t("operationResult.sourceLabel", { label: operationLabel, countLabel }),
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

export function paneSourceLabel(pane: PaneState, t: Translate = fallbackTranslate): string {
  if (pane.source.kind === "local") return pane.source.displayName || pane.currentPath || t("pane.source.localFallback");
  return pane.source.displayName || pane.currentPath;
}

export function paneHeaderLabel(pane: PaneState, t: Translate = fallbackTranslate): string {
  const label = paneSourceLabel(pane, t) || t("pane.source.loading");
  if (pane.source.kind === "local") return t("pane.header.local", { label });
  if (pane.source.kind === "sftp") return t("pane.header.sftp", { label });
  if (pane.source.kind === "search") return t("pane.header.search", { label });
  if (pane.source.kind === "diff") return t("pane.header.diff", { label });
  if (pane.source.kind === "operationResult") return t("pane.header.operationResult", { label });
  if (pane.source.kind === "gitStatus") return t("pane.header.gitStatus", { label });
  if (pane.source.kind === "archive") return t("pane.header.archive", { label: baseName(pane.source.archivePath) || label });
  return label;
}

export function baseName(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
