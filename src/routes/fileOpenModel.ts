import { archiveInnerPathFromEntryPath, sftpRemotePathFromEntryPath } from "./pathUtils";
import type { FileEntry, PaneState } from "./types";

export type FocusedOpenAction =
  | { type: "openArchiveDirectory"; archivePath: string; innerPath: string }
  | { type: "openSftpDirectory"; connectionId: string; remotePath: string; returnPath: string }
  | { type: "openLocalDirectory"; path: string }
  | { type: "openArchiveFile"; path: string }
  | { type: "openViewer"; entry: FileEntry };

export type DefaultAppOpenAction =
  | { type: "openDefaultApp"; entry: FileEntry }
  | { type: "unsupported"; commandId: "archive.openDefaultUnsupported" | "remote.openDefaultUnsupported" };

export type ViewerOpenAction =
  | { type: "unsupported"; commandId: "remote.viewUnsupported" }
  | { type: "openImageViewer"; entry: FileEntry }
  | { type: "openTextViewer"; entry: FileEntry }
  | { type: "openDefaultApp"; entry: FileEntry };

export function focusedEntry(pane: PaneState, entries: FileEntry[]): FileEntry | null {
  if (pane.cursorIndex < 0 || pane.cursorIndex >= entries.length) return null;
  return entries[pane.cursorIndex] ?? null;
}

export function focusedOpenAction(
  pane: PaneState,
  entry: FileEntry,
  archiveNameSupported: (name: string) => boolean,
): FocusedOpenAction {
  if (entry.kind === "directory") {
    if (pane.source.kind === "archive") {
      return {
        type: "openArchiveDirectory",
        archivePath: pane.source.archivePath,
        innerPath: archiveInnerPathFromEntryPath(entry.path),
      };
    }
    if (pane.source.kind === "sftp") {
      return {
        type: "openSftpDirectory",
        connectionId: pane.source.connectionId,
        remotePath: sftpRemotePathFromEntryPath(entry.path),
        returnPath: pane.source.returnPath,
      };
    }
    return { type: "openLocalDirectory", path: entry.path };
  }

  if (pane.source.kind === "local" && archiveNameSupported(entry.name)) {
    return { type: "openArchiveFile", path: entry.path };
  }

  return { type: "openViewer", entry };
}

export function defaultAppOpenAction(pane: PaneState, entry: FileEntry): DefaultAppOpenAction {
  if (pane.source.kind === "archive" || pane.source.kind === "sftp") {
    return {
      type: "unsupported",
      commandId: pane.source.kind === "archive" ? "archive.openDefaultUnsupported" : "remote.openDefaultUnsupported",
    };
  }

  return { type: "openDefaultApp", entry };
}

export function viewerOpenAction(
  pane: PaneState,
  entry: FileEntry,
  extension: string,
  imageExtensions: Set<string>,
  textExtensions: Set<string>,
): ViewerOpenAction {
  if (pane.source.kind === "sftp") {
    return {
      type: "unsupported",
      commandId: "remote.viewUnsupported",
    };
  }

  if (imageExtensions.has(extension)) return { type: "openImageViewer", entry };
  if (!textExtensions.has(extension)) return { type: "openDefaultApp", entry };
  return { type: "openTextViewer", entry };
}
