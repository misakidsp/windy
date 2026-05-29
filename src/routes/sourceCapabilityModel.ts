import type { FileOperationKind, PaneSource, PaneSourceKind, PaneState } from "./types";

export type SourceCapability = {
  canList: boolean;
  canRead: boolean;
  canCopyFrom: boolean;
  canCopyTo: boolean;
  canMoveTo: boolean;
  canRename: boolean;
  canDelete: boolean;
  canTrash: boolean;
  canMkdir: boolean;
  canCreateFile: boolean;
  canChmod: boolean;
  canOpenDefaultApp: boolean;
  canUseAsTerminalCwd: boolean;
  canOpenRemoteTerminal: boolean;
  canDetailedDiff: boolean;
};

export function sourceCapabilities(source: PaneSource): SourceCapability {
  if (source.kind === "local") return localCapabilities();
  if (source.kind === "archive") return archiveCapabilities();
  if (source.kind === "sftp") return sftpCapabilities();
  if (source.kind === "diff") return diffCapabilities();
  if (source.kind === "operationResult") return operationResultCapabilities();
  if (source.kind === "gitStatus") return gitStatusCapabilities();
  return searchCapabilities();
}

export function sourceSupports(source: PaneSource, capability: keyof SourceCapability): boolean {
  return sourceCapabilities(source)[capability];
}

export function sourceKindSupports(kind: PaneSourceKind, capability: keyof SourceCapability): boolean {
  return sourceCapabilities(sourceStub(kind))[capability];
}

export function paneSourcesSupportDetailedDiff(leftPane: PaneState, rightPane: PaneState): boolean {
  return sourceSupports(leftPane.source, "canDetailedDiff") && sourceSupports(rightPane.source, "canDetailedDiff");
}

export function operationSupportedByCapabilities(
  kind: FileOperationKind,
  sourcePane: PaneState,
  destinationPane: PaneState | null,
): boolean {
  const source = sourceCapabilities(sourcePane.source);
  const destination = destinationPane ? sourceCapabilities(destinationPane.source) : null;

  if (kind === "refresh") return true;
  if (
    destinationPane?.source.kind === "search" ||
    destinationPane?.source.kind === "diff" ||
    destinationPane?.source.kind === "operationResult" ||
    destinationPane?.source.kind === "gitStatus"
  ) {
    return false;
  }
  if (kind === "copy") {
    if (!destinationPane || !source.canCopyFrom || !destination?.canCopyTo) return false;
    if (destinationPane.source.kind === "sftp") return sourcePane.source.kind === "local";
    return destinationPane.source.kind === "local";
  }
  if (kind === "move") return source.canMoveTo && Boolean(destination?.canMoveTo);
  if (kind === "createArchive") {
    return (sourcePane.source.kind === "local" || sourcePane.source.kind === "search") && destinationPane?.source.kind === "local";
  }
  if (kind === "extractArchive") return sourcePane.source.kind === "local" && destinationPane?.source.kind === "local";
  if (kind === "trash") return source.canTrash;
  if (kind === "delete") return source.canDelete;
  if (kind === "rename") return source.canRename;
  if (kind === "mkdir" || kind === "removeEmptyDirectory") return source.canMkdir;
  if (kind === "createFile" || kind === "removeEmptyFile") return source.canCreateFile;
  if (kind === "chmod" || kind === "windowsAttributes") return source.canChmod;
  return false;
}

function localCapabilities(): SourceCapability {
  return {
    canList: true,
    canRead: true,
    canCopyFrom: true,
    canCopyTo: true,
    canMoveTo: false,
    canRename: true,
    canDelete: true,
    canTrash: true,
    canMkdir: true,
    canCreateFile: true,
    canChmod: true,
    canOpenDefaultApp: true,
    canUseAsTerminalCwd: true,
    canOpenRemoteTerminal: false,
    canDetailedDiff: true,
  };
}

function archiveCapabilities(): SourceCapability {
  return {
    canList: true,
    canRead: true,
    canCopyFrom: true,
    canCopyTo: false,
    canMoveTo: false,
    canRename: false,
    canDelete: false,
    canTrash: false,
    canMkdir: false,
    canCreateFile: false,
    canChmod: false,
    canOpenDefaultApp: false,
    canUseAsTerminalCwd: false,
    canOpenRemoteTerminal: false,
    canDetailedDiff: false,
  };
}

function sftpCapabilities(): SourceCapability {
  return {
    canList: true,
    canRead: true,
    canCopyFrom: true,
    canCopyTo: true,
    canMoveTo: false,
    canRename: true,
    canDelete: true,
    canTrash: false,
    canMkdir: true,
    canCreateFile: true,
    canChmod: true,
    canOpenDefaultApp: false,
    canUseAsTerminalCwd: false,
    canOpenRemoteTerminal: true,
    canDetailedDiff: false,
  };
}

function searchCapabilities(): SourceCapability {
  return {
    canList: true,
    canRead: true,
    canCopyFrom: true,
    canCopyTo: false,
    canMoveTo: true,
    canRename: true,
    canDelete: true,
    canTrash: true,
    canMkdir: false,
    canCreateFile: false,
    canChmod: true,
    canOpenDefaultApp: true,
    canUseAsTerminalCwd: false,
    canOpenRemoteTerminal: false,
    canDetailedDiff: false,
  };
}

function diffCapabilities(): SourceCapability {
  return {
    canList: true,
    canRead: true,
    canCopyFrom: true,
    canCopyTo: false,
    canMoveTo: true,
    canRename: true,
    canDelete: true,
    canTrash: true,
    canMkdir: false,
    canCreateFile: false,
    canChmod: true,
    canOpenDefaultApp: true,
    canUseAsTerminalCwd: false,
    canOpenRemoteTerminal: false,
    canDetailedDiff: false,
  };
}

function operationResultCapabilities(): SourceCapability {
  return {
    canList: true,
    canRead: true,
    canCopyFrom: true,
    canCopyTo: false,
    canMoveTo: true,
    canRename: true,
    canDelete: true,
    canTrash: true,
    canMkdir: false,
    canCreateFile: false,
    canChmod: true,
    canOpenDefaultApp: true,
    canUseAsTerminalCwd: false,
    canOpenRemoteTerminal: false,
    canDetailedDiff: false,
  };
}

function gitStatusCapabilities(): SourceCapability {
  return {
    canList: true,
    canRead: true,
    canCopyFrom: true,
    canCopyTo: false,
    canMoveTo: true,
    canRename: true,
    canDelete: true,
    canTrash: true,
    canMkdir: false,
    canCreateFile: false,
    canChmod: true,
    canOpenDefaultApp: true,
    canUseAsTerminalCwd: false,
    canOpenRemoteTerminal: false,
    canDetailedDiff: false,
  };
}

function sourceStub(kind: PaneSourceKind): PaneSource {
  if (kind === "local") return { kind, location: "", displayName: "" };
  if (kind === "archive") return { kind, location: "", displayName: "", archivePath: "", innerPath: "" };
  if (kind === "sftp") return { kind, location: "", displayName: "", connectionId: "", remotePath: "", returnPath: "" };
  if (kind === "diff") {
    return {
      kind,
      location: "",
      displayName: "",
      baseKind: "local",
      basePath: "",
      returnPath: "",
      side: "left",
      mode: "allChanged",
    };
  }
  if (kind === "operationResult") {
    return { kind, location: "", displayName: "", returnPath: "", operationLabel: "" };
  }
  if (kind === "gitStatus") {
    return { kind, location: "", displayName: "", rootPath: "", returnPath: "" };
  }
  return {
    kind,
    location: "",
    displayName: "",
    rootPath: "",
    returnPath: "",
    nameRegex: "",
    recursive: false,
    minSizeBytes: null,
    maxSizeBytes: null,
    modifiedAfter: null,
    modifiedBefore: null,
    searchKind: "all",
    hiddenMode: "exclude",
    readonlyMode: "any",
  };
}
