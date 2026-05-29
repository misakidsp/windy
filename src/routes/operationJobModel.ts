import type {
  FileEntry,
  FileOperationJob,
  FileOperationKind,
  FileOperationResult,
  FileOperationTarget,
  JobRisk,
  PaneId,
  PaneState,
} from "./types";
import { operationSupportedByCapabilities } from "./sourceCapabilityModel";

export type CreateFileOperationJobInput = {
  kind: FileOperationKind;
  sourcePaneId: PaneId;
  sourcePane: PaneState;
  destinationPaneId: PaneId | null;
  destinationPane: PaneState | null;
  targetEntries: FileEntry[];
  windowsAttributesMode?: boolean;
  now?: Date;
  id?: string;
};

const commandIds: Record<FileOperationKind, string> = {
  copy: "file.copyToOtherPane",
  move: "file.moveToOtherPane",
  rename: "file.renameFocused",
  chmod: "file.changePermissions",
  windowsAttributes: "file.changeWindowsAttributes",
  trash: "file.deleteSelected",
  delete: "file.deleteSelectedPermanently",
  mkdir: "file.createDirectory",
  createFile: "file.createFile",
  removeEmptyDirectory: "undo.removeEmptyDirectory",
  removeEmptyFile: "undo.removeEmptyFile",
  refresh: "app.refresh",
  extractArchive: "archive.extractSelected",
  createArchive: "archive.create",
};

const labels: Record<FileOperationKind, string> = {
  copy: "Copy to other pane",
  move: "Move to other pane",
  rename: "Rename focused entry",
  chmod: "Change permissions",
  windowsAttributes: "Change Windows attributes",
  trash: "Move selected entries to Trash",
  delete: "Delete selected entries permanently",
  mkdir: "Create directory",
  createFile: "Create file",
  removeEmptyDirectory: "Undo create directory",
  removeEmptyFile: "Undo create file",
  refresh: "Refresh active pane",
  extractArchive: "Extract archives to other pane",
  createArchive: "Create archive",
};

const risks: Record<FileOperationKind, JobRisk> = {
  copy: "safe",
  move: "warning",
  rename: "warning",
  chmod: "warning",
  windowsAttributes: "warning",
  trash: "warning",
  delete: "danger",
  mkdir: "safe",
  createFile: "safe",
  removeEmptyDirectory: "warning",
  removeEmptyFile: "warning",
  refresh: "safe",
  extractArchive: "safe",
  createArchive: "safe",
};

export function createFileOperationJob({
  kind,
  sourcePaneId,
  sourcePane,
  destinationPaneId,
  destinationPane,
  targetEntries,
  windowsAttributesMode = false,
  now = new Date(),
  id = `job-${Date.now().toString(36)}`,
}: CreateFileOperationJobInput): FileOperationJob {
  const destinationPath = destinationPane ? paneOperationPath(destinationPane) : paneOperationPath(sourcePane);
  const resolvedKind: FileOperationKind = kind === "chmod" && windowsAttributesMode ? "windowsAttributes" : kind;
  const targets = fileOperationTargetsFromEntries(targetEntries);
  const sourcePath = paneOperationPath(sourcePane);

  return {
    id,
    kind: resolvedKind,
    commandId: commandIds[resolvedKind],
    label: labels[resolvedKind],
    status: "preview",
    risk: risks[resolvedKind],
    sourcePaneId,
    destinationPaneId,
    sourcePath,
    destinationPath,
    targets,
    plannedActions: plannedActionsFor(resolvedKind, targets, sourcePath, destinationPath),
    confirmationMessage: confirmationMessageFor(resolvedKind, targets, sourcePath, destinationPath),
    requestedName: defaultRequestedNameFor(resolvedKind, targets),
    executable: isExecutableJob(resolvedKind, targets, destinationPath),
    createdAt: now.toISOString(),
  };
}

export function fileOperationTargetsFromEntries(entries: FileEntry[]): FileOperationTarget[] {
  return entries.map((entry) => ({
    key: entry.key,
    name: entry.name,
    path: entry.path,
    kind: entry.kind,
    size: entry.size,
    modifiedAt: entry.modifiedAt,
    hidden: entry.hidden,
    readonly: entry.readonly,
    mode: entry.mode,
  }));
}

export function selectedOperationEntries(pane: PaneState, visibleEntries: FileEntry[]): FileEntry[] {
  const selected = pane.entries.filter((entry) => pane.selectedKeys.has(entry.key));
  if (selected.length > 0) return selected;

  const focused = visibleEntries[pane.cursorIndex];
  return focused ? [focused] : [];
}

export function focusedOperationEntries(pane: PaneState, visibleEntries: FileEntry[]): FileEntry[] {
  const focused = visibleEntries[pane.cursorIndex];
  return focused ? [focused] : [];
}

export function archiveOperationEntries(
  pane: PaneState,
  visibleEntries: FileEntry[],
  archiveNameSupported: (name: string) => boolean,
): FileEntry[] {
  if (pane.source.kind !== "local") return [];

  const selected = pane.entries.filter((entry) => pane.selectedKeys.has(entry.key) && isArchiveEntry(entry, archiveNameSupported));
  if (selected.length > 0) return selected;

  const focused = visibleEntries[pane.cursorIndex];
  return focused && isArchiveEntry(focused, archiveNameSupported) ? [focused] : [];
}

export function isArchiveEntry(entry: FileEntry, archiveNameSupported: (name: string) => boolean): boolean {
  return entry.kind === "file" && archiveNameSupported(entry.name);
}

export function paneOperationPath(pane: PaneState): string {
  if (pane.source.kind === "sftp") return pane.source.location;
  if (pane.source.kind === "diff") return pane.source.returnPath || pane.source.basePath;
  if (pane.source.kind === "operationResult") return pane.source.returnPath;
  if (pane.source.kind === "gitStatus") return pane.source.returnPath || pane.source.rootPath;
  return pane.currentPath;
}

export function failedOperationEntries(job: FileOperationJob, result: FileOperationResult): FileEntry[] {
  const targetsByPath = new Map(job.targets.map((target) => [target.path, target]));
  const entries: FileEntry[] = [];
  const seen = new Set<string>();

  for (const item of result.failed) {
    if (!item.path || seen.has(item.path)) continue;
    const target = targetsByPath.get(item.path);
    entries.push({
      key: item.path,
      name: target?.name ?? leafName(item.path),
      path: item.path,
      kind: target?.kind ?? "file",
      size: target?.size ?? null,
      modifiedAt: target?.modifiedAt ?? null,
      hidden: (target?.name ?? leafName(item.path)).startsWith("."),
      readonly: false,
      mode: target?.mode ?? null,
    });
    seen.add(item.path);
  }

  return entries;
}

function leafName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function defaultRequestedNameFor(kind: FileOperationKind, targets: FileOperationTarget[]): string | null {
  if (kind === "rename") return targets[0]?.name ?? "";
  if (kind === "chmod") return targets.length === 1 && targets[0]?.mode !== null ? formatMode(targets[0].mode) : "";
  if (kind === "windowsAttributes") {
    const readonly = targets.length > 0 && targets.every((target) => target.readonly);
    const hidden = targets.length > 0 && targets.every((target) => target.hidden);
    return `readonly=${readonly ? "on" : "off"} hidden=${hidden ? "on" : "off"}`;
  }
  if (kind === "mkdir" || kind === "createFile" || kind === "createArchive") return "";
  return null;
}

export function formatMode(mode: number): string {
  return (mode & 0o777).toString(8).padStart(3, "0");
}

export function isExecutableJob(
  kind: FileOperationKind,
  targets: FileOperationTarget[],
  destinationPath: string | null,
): boolean {
  if (kind === "refresh") return true;
  if (kind === "mkdir" || kind === "createFile") return true;
  if (kind === "copy" || kind === "move" || kind === "extractArchive" || kind === "createArchive") {
    return targets.length > 0 && Boolean(destinationPath);
  }
  return targets.length > 0;
}

export function plannedActionsFor(
  kind: FileOperationKind,
  targets: FileOperationTarget[],
  sourcePath: string,
  destinationPath: string | null,
): string[] {
  if (kind === "mkdir") return [`Create a new directory under ${sourcePath || "(no source path)"}.`];
  if (kind === "createFile") return [`Create a new empty file under ${sourcePath || "(no source path)"}.`];
  if (kind === "removeEmptyDirectory") return targets.map((target) => `Remove empty directory ${target.path}.`);
  if (kind === "removeEmptyFile") return targets.map((target) => `Remove empty file ${target.path}.`);
  if (kind === "refresh") return [`Reload directory listing for ${sourcePath || "(no source path)"}.`];
  if (targets.length === 0) return ["No target entries were resolved."];
  if (kind === "copy") return targets.map((target) => `Copy ${target.path} to ${destinationPath || "(no destination)"}.`);
  if (kind === "move") return targets.map((target) => `Move ${target.path} to ${destinationPath || "(no destination)"}.`);
  if (kind === "extractArchive") {
    return targets.map((target) => `Extract ${target.path} under ${destinationPath || "(no destination)"}.`);
  }
  if (kind === "createArchive") return [`Create archive under ${destinationPath || "(no destination)"} from ${targets.length} item(s).`];
  if (kind === "rename") return targets.map((target) => `Rename ${target.path}.`);
  if (kind === "chmod") return targets.map((target) => `Change permissions for ${target.path}.`);
  if (kind === "windowsAttributes") return targets.map((target) => `Change Windows attributes for ${target.path}.`);
  if (kind === "trash") return targets.map((target) => `Move ${target.path} to Trash.`);
  return targets.map((target) => `Delete ${target.path} permanently.`);
}

export function confirmationMessageFor(
  kind: FileOperationKind,
  targets: FileOperationTarget[],
  sourcePath: string,
  destinationPath: string | null,
): string {
  if (kind === "mkdir") return `Create a new directory under ${sourcePath || "(no source path)"}?`;
  if (kind === "createFile") return `Create a new empty file under ${sourcePath || "(no source path)"}?`;
  if (kind === "removeEmptyDirectory") return `Undo directory creation by removing ${targets[0]?.path || "the empty directory"}?`;
  if (kind === "removeEmptyFile") return `Undo file creation by removing ${targets[0]?.path || "the empty file"}?`;
  if (kind === "refresh") return "Refresh is safe and does not mutate the file system.";
  if (targets.length === 0) return "No targets are available; this job cannot execute.";
  if (kind === "copy") return `Copy ${targets.length} item(s) to ${destinationPath || "(no destination)"}?`;
  if (kind === "move") return `Move ${targets.length} item(s) to ${destinationPath || "(no destination)"}?`;
  if (kind === "extractArchive") {
    return `Extract ${targets.length} archive(s) to ${destinationPath || "(no destination)"}?`;
  }
  if (kind === "createArchive") return `Create archive from ${targets.length} item(s) under ${destinationPath || "(no destination)"}?`;
  if (kind === "rename") return `Rename ${targets[0]?.path || "the focused item"}?`;
  if (kind === "chmod") return `Change permissions for ${targets.length} item(s)?`;
  if (kind === "windowsAttributes") return `Change Windows attributes for ${targets.length} item(s)?`;
  if (kind === "trash") return `Move ${targets.length} item(s) to Trash?`;
  return `Permanently delete ${targets.length} item(s)? This bypasses Trash and cannot be undone from Windy.`;
}

export function operationSupportedForPaneSources(
  kind: FileOperationKind,
  sourcePane: PaneState,
  destinationPane: PaneState | null,
): boolean {
  return operationSupportedByCapabilities(kind, sourcePane, destinationPane);
}

export function operationNameRequired(job: FileOperationJob): boolean {
  return job.kind === "rename" || job.kind === "mkdir" || job.kind === "createFile" || job.kind === "chmod" || job.kind === "windowsAttributes" || job.kind === "createArchive";
}

export function operationDestinationPaneId(job: FileOperationJob): PaneId {
  return job.destinationPaneId ?? job.sourcePaneId;
}

export function operationConflictMessages(job: FileOperationJob, destinationEntries: FileEntry[]): string[] {
  if (job.kind === "refresh" || job.kind === "trash" || job.kind === "delete" || job.kind === "removeEmptyDirectory" || job.kind === "removeEmptyFile") return [];

  const destinationNames = new Set(destinationEntries.map((entry) => entry.name));

  if (job.kind === "copy" || job.kind === "move") {
    return job.targets
      .filter((target) => destinationNames.has(target.name))
      .map((target) => `${target.name} already exists in ${job.destinationPath || "(no destination)"}.`);
  }

  if (job.kind === "extractArchive") {
    return job.targets
      .map((target) => archiveExtractionDirectoryName(target.name))
      .filter((name) => destinationNames.has(name))
      .map((name) => `${name} already exists in ${job.destinationPath || "(no destination)"}.`);
  }

  const requestedName = job.requestedName?.trim();
  if (!requestedName) return [];

  if (job.kind === "rename") {
    const currentName = job.targets[0]?.name;
    if (requestedName === currentName) return [`${requestedName} is the current name.`];
  }

  return destinationNames.has(requestedName)
    ? [`${requestedName} already exists in ${job.destinationPath || job.sourcePath || "(no destination)"}.`]
    : [];
}

export function operationBlockingMessages(job: FileOperationJob, destinationEntries: FileEntry[]): string[] {
  if (job.kind === "copy" || job.kind === "move") return operationSelfReferenceMessages(job);
  if (job.kind === "createArchive" && !isSupportedCreatedArchiveName(job.requestedName ?? "")) {
    return ["Archive name must end with .zip, .tar, .tar.gz, or .tgz."];
  }
  if (job.kind === "rename" || job.kind === "mkdir" || job.kind === "createFile" || job.kind === "extractArchive" || job.kind === "createArchive") {
    return operationConflictMessages(job, destinationEntries);
  }
  return [];
}

export function isSupportedCreatedArchiveName(name: string): boolean {
  const lowerName = name.trim().toLocaleLowerCase();
  return lowerName.endsWith(".zip") || lowerName.endsWith(".tar") || lowerName.endsWith(".tar.gz") || lowerName.endsWith(".tgz");
}

export function archiveExtractionDirectoryName(name: string): string {
  const lowerName = name.toLocaleLowerCase();
  if (lowerName.endsWith(".tar.gz")) return name.slice(0, -7);
  if (lowerName.endsWith(".tgz")) return name.slice(0, -4);
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(0, index) : name;
}

export function operationSelfReferenceMessages(job: FileOperationJob): string[] {
  if ((job.kind !== "copy" && job.kind !== "move") || !job.destinationPath) return [];

  return job.targets
    .filter((target) => target.kind === "directory" && pathIsSameOrDescendant(job.destinationPath ?? "", target.path))
    .map(
      (target) =>
        `Cannot ${job.kind} ${target.path} into itself or one of its descendants: ${job.destinationPath}.`,
    );
}

export function pathIsSameOrDescendant(path: string, ancestor: string): boolean {
  const separator = path.includes("\\") || ancestor.includes("\\") ? "\\" : "/";
  const normalizedPath = normalizeComparablePath(path, separator);
  const normalizedAncestor = normalizeComparablePath(ancestor, separator);

  return normalizedPath === normalizedAncestor || normalizedPath.startsWith(`${normalizedAncestor}${separator}`);
}

function normalizeComparablePath(path: string, separator: string): string {
  const normalizedSeparator = separator === "\\" ? /\/+/g : /\\+/g;
  const normalized = path.replace(normalizedSeparator, separator);
  return normalized.endsWith(separator) && normalized.length > 1 ? normalized.slice(0, -1) : normalized;
}

export function executionConfirmationMessage(job: FileOperationJob, destinationEntries: FileEntry[]): string {
  const conflicts = operationConflictMessages(job, destinationEntries);
  const conflictNote =
    conflicts.length > 0 && (job.kind === "copy" || job.kind === "move")
      ? `\n\n${conflicts.length} conflict(s) will be skipped.`
      : "";

  return `${job.confirmationMessage}${conflictNote}`;
}

export function targetSummary(job: FileOperationJob): string {
  if (job.kind === "mkdir") return "Creates one new directory.";
  if (job.kind === "createFile") return "Creates one new empty file.";
  if (job.kind === "createArchive") return `Creates one archive from ${job.targets.length} target${job.targets.length === 1 ? "" : "s"}.`;
  if (job.kind === "removeEmptyDirectory") return "Removes one empty directory.";
  if (job.kind === "removeEmptyFile") return "Removes one empty file.";
  if (job.kind === "refresh") return "Refreshes the active pane listing.";
  if (job.targets.length === 0) return "No target entries resolved.";
  return `${job.targets.length} target${job.targets.length === 1 ? "" : "s"} resolved.`;
}

export function operationTargetPreviewLimit(job: FileOperationJob): number {
  return job.targets.length <= 3 ? job.targets.length : 3;
}

export function shouldShowOperationPaths(job: FileOperationJob): boolean {
  return job.kind !== "rename";
}
