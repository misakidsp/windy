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
import { translateMessage, type Translate } from "./localization";
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
  t?: Translate;
};

export const operationCommandIds: Record<FileOperationKind, string> = {
  copy: "file.copy",
  move: "file.move",
  rename: "file.rename",
  chmod: "file.chmod",
  windowsAttributes: "file.chmod",
  trash: "file.delete",
  delete: "file.deletePermanently",
  mkdir: "file.mkdir",
  createFile: "file.createFile",
  removeEmptyDirectory: "undo.removeEmptyDirectory",
  removeEmptyFile: "undo.removeEmptyFile",
  refresh: "app.refresh",
  extractArchive: "archive.unpack",
  createArchive: "archive.create",
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

const fallbackTranslate: Translate = (id, values) => translateMessage(undefined, id, values);

function operationLabel(kind: FileOperationKind, t: Translate): string {
  return t(`operation.label.${kind}`);
}

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
  t = fallbackTranslate,
}: CreateFileOperationJobInput): FileOperationJob {
  const destinationPath = destinationPane ? paneOperationPath(destinationPane) : paneOperationPath(sourcePane);
  const resolvedKind: FileOperationKind = kind === "chmod" && windowsAttributesMode ? "windowsAttributes" : kind;
  const targets = fileOperationTargetsFromEntries(targetEntries);
  const sourcePath = paneOperationPath(sourcePane);

  return {
    id,
    kind: resolvedKind,
    commandId: operationCommandIds[resolvedKind],
    label: operationLabel(resolvedKind, t),
    status: "preview",
    risk: risks[resolvedKind],
    sourcePaneId,
    destinationPaneId,
    sourcePath,
    destinationPath,
    targets,
    plannedActions: plannedActionsFor(resolvedKind, targets, sourcePath, destinationPath, t),
    confirmationMessage: confirmationMessageFor(resolvedKind, targets, sourcePath, destinationPath, t),
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
  t: Translate = fallbackTranslate,
): string[] {
  const source = sourcePath || t("operation.path.noSource");
  const destination = destinationPath || t("operation.path.noDestination");
  if (kind === "mkdir") return [t("operation.planned.mkdir", { source })];
  if (kind === "createFile") return [t("operation.planned.createFile", { source })];
  if (kind === "removeEmptyDirectory") return targets.map((target) => t("operation.planned.removeEmptyDirectory", { path: target.path }));
  if (kind === "removeEmptyFile") return targets.map((target) => t("operation.planned.removeEmptyFile", { path: target.path }));
  if (kind === "refresh") return [t("operation.planned.refresh", { source })];
  if (targets.length === 0) return [t("operation.planned.noTargets")];
  if (kind === "copy") return targets.map((target) => t("operation.planned.copy", { path: target.path, destination }));
  if (kind === "move") return targets.map((target) => t("operation.planned.move", { path: target.path, destination }));
  if (kind === "extractArchive") {
    return targets.map((target) => t("operation.planned.extractArchive", { path: target.path, destination }));
  }
  if (kind === "createArchive") return [t("operation.planned.createArchive", { destination, count: targets.length })];
  if (kind === "rename") return targets.map((target) => t("operation.planned.rename", { path: target.path }));
  if (kind === "chmod") return targets.map((target) => t("operation.planned.chmod", { path: target.path }));
  if (kind === "windowsAttributes") return targets.map((target) => t("operation.planned.windowsAttributes", { path: target.path }));
  if (kind === "trash") return targets.map((target) => t("operation.planned.trash", { path: target.path }));
  return targets.map((target) => t("operation.planned.delete", { path: target.path }));
}

export function confirmationMessageFor(
  kind: FileOperationKind,
  targets: FileOperationTarget[],
  sourcePath: string,
  destinationPath: string | null,
  t: Translate = fallbackTranslate,
): string {
  const source = sourcePath || t("operation.path.noSource");
  const destination = destinationPath || t("operation.path.noDestination");
  if (kind === "mkdir") return t("operation.confirm.mkdir", { source });
  if (kind === "createFile") return t("operation.confirm.createFile", { source });
  if (kind === "removeEmptyDirectory") return t("operation.confirm.removeEmptyDirectory", { path: targets[0]?.path || t("operation.path.emptyDirectory") });
  if (kind === "removeEmptyFile") return t("operation.confirm.removeEmptyFile", { path: targets[0]?.path || t("operation.path.emptyFile") });
  if (kind === "refresh") return t("operation.confirm.refresh");
  if (targets.length === 0) return t("operation.confirm.noTargets");
  if (kind === "copy") return t("operation.confirm.copy", { count: targets.length, destination });
  if (kind === "move") return t("operation.confirm.move", { count: targets.length, destination });
  if (kind === "extractArchive") {
    return t("operation.confirm.extractArchive", { count: targets.length, destination });
  }
  if (kind === "createArchive") return t("operation.confirm.createArchive", { count: targets.length, destination });
  if (kind === "rename") return t("operation.confirm.rename", { path: targets[0]?.path || t("operation.path.focusedItem") });
  if (kind === "chmod") return t("operation.confirm.chmod", { count: targets.length });
  if (kind === "windowsAttributes") return t("operation.confirm.windowsAttributes", { count: targets.length });
  if (kind === "trash") return t("operation.confirm.trash", { count: targets.length });
  return t("operation.confirm.delete", { count: targets.length });
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

export function operationConflictMessages(job: FileOperationJob, destinationEntries: FileEntry[], t: Translate = fallbackTranslate): string[] {
  if (job.kind === "refresh" || job.kind === "trash" || job.kind === "delete" || job.kind === "removeEmptyDirectory" || job.kind === "removeEmptyFile") return [];

  const destinationNames = new Set(destinationEntries.map((entry) => entry.name));
  const destination = job.destinationPath || t("operation.path.noDestination");

  if (job.kind === "copy" || job.kind === "move") {
    return job.targets
      .filter((target) => destinationNames.has(target.name))
      .map((target) => t("operation.conflict.exists", { name: target.name, destination }));
  }

  if (job.kind === "extractArchive") {
    return job.targets
      .map((target) => archiveExtractionDirectoryName(target.name))
      .filter((name) => destinationNames.has(name))
      .map((name) => t("operation.conflict.exists", { name, destination }));
  }

  const requestedName = job.requestedName?.trim();
  if (!requestedName) return [];

  if (job.kind === "rename") {
    const currentName = job.targets[0]?.name;
    if (requestedName === currentName) return [t("operation.conflict.currentName", { name: requestedName })];
  }

  return destinationNames.has(requestedName)
    ? [t("operation.conflict.exists", { name: requestedName, destination: job.destinationPath || job.sourcePath || t("operation.path.noDestination") })]
    : [];
}

export function operationBlockingMessages(job: FileOperationJob, destinationEntries: FileEntry[], t: Translate = fallbackTranslate): string[] {
  if (job.kind === "copy" || job.kind === "move") return operationSelfReferenceMessages(job, t);
  if (job.kind === "createArchive" && !isSupportedCreatedArchiveName(job.requestedName ?? "")) {
    return [t("operation.blocking.archiveExtension")];
  }
  if (job.kind === "rename" || job.kind === "mkdir" || job.kind === "createFile" || job.kind === "extractArchive" || job.kind === "createArchive") {
    return operationConflictMessages(job, destinationEntries, t);
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

export function operationSelfReferenceMessages(job: FileOperationJob, t: Translate = fallbackTranslate): string[] {
  if ((job.kind !== "copy" && job.kind !== "move") || !job.destinationPath) return [];

  return job.targets
    .filter((target) => target.kind === "directory" && pathIsSameOrDescendant(job.destinationPath ?? "", target.path))
    .map((target) => t("operation.blocking.selfReference", { kind: job.kind, path: target.path, destination: job.destinationPath ?? "" }));
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

export function executionConfirmationMessage(job: FileOperationJob, destinationEntries: FileEntry[], t: Translate = fallbackTranslate): string {
  const conflicts = operationConflictMessages(job, destinationEntries, t);
  const conflictNote =
    conflicts.length > 0 && (job.kind === "copy" || job.kind === "move")
      ? t("operation.conflictSkipped", { count: conflicts.length })
      : "";

  return `${job.confirmationMessage}${conflictNote}`;
}

export function targetSummary(job: FileOperationJob, t: Translate = fallbackTranslate): string {
  if (job.kind === "mkdir") return t("operation.summary.mkdir");
  if (job.kind === "createFile") return t("operation.summary.createFile");
  if (job.kind === "createArchive") return t("operation.summary.createArchive", { count: job.targets.length });
  if (job.kind === "removeEmptyDirectory") return t("operation.summary.removeEmptyDirectory");
  if (job.kind === "removeEmptyFile") return t("operation.summary.removeEmptyFile");
  if (job.kind === "refresh") return t("operation.summary.refresh");
  if (job.targets.length === 0) return t("operation.summary.noTargets");
  return t("operation.summary.targets", { count: job.targets.length });
}

export function operationTargetPreviewLimit(job: FileOperationJob): number {
  return job.targets.length <= 3 ? job.targets.length : 3;
}

export function shouldShowOperationPaths(job: FileOperationJob): boolean {
  return job.kind !== "rename";
}
