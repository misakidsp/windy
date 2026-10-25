import { confirmationMessageFor, plannedActionsFor } from "./operationJobModel";
import { translateMessage, type Translate } from "./localization";
import type { FileEntry, FileOperationJob, FileOperationTarget, PaneState, UndoSnapshot } from "./types";

const fallbackTranslate: Translate = (id, values) => translateMessage(undefined, id, values);

export function createUndoSnapshot(job: FileOperationJob, t: Translate = fallbackTranslate): UndoSnapshot | null {
  if (job.commandId.startsWith("undo.") || job.sourcePath.startsWith("sftp://") || job.destinationPath?.startsWith("sftp://") || job.targets.some(target => target.path.startsWith("sftp://"))) return null;
  if (job.kind === "rename") return createRenameUndo(job, t);
  if (job.kind === "mkdir") return createCreatedEntryUndo(job, "removeEmptyDirectory", t("undo.label.createDirectory"), t);
  if (job.kind === "createFile") return createCreatedEntryUndo(job, "removeEmptyFile", t("undo.label.createFile"), t);
  return null;
}

export function undoPaneState(pane: PaneState): Pick<PaneState, "id" | "source" | "currentPath"> {
  return {
    id: pane.id,
    source: pane.source,
    currentPath: pane.currentPath,
  };
}

export function undoSafetyMessages(snapshot: UndoSnapshot, pane: PaneState, t: Translate = fallbackTranslate): string[] {
  const job = snapshot.job;
  const messages: string[] = [];

  if (
    pane.source.kind !== "search" &&
    pane.source.kind !== "diff" &&
    pane.source.kind !== "operationResult" &&
    pane.source.kind !== "gitStatus" &&
    pane.currentPath !== job.sourcePath
  ) {
    messages.push(t("undo.safety.sourceMoved", { current: pane.currentPath || "-", recorded: job.sourcePath || "-" }));
  }

  if (job.kind === "rename") {
    messages.push(...renameUndoSafetyMessages(job, pane.entries, t));
  } else if (job.kind === "removeEmptyDirectory") {
    messages.push(...removeEmptyDirectorySafetyMessages(job, pane.entries, t));
  } else if (job.kind === "removeEmptyFile") {
    messages.push(...removeEmptyFileSafetyMessages(job, pane.entries, t));
  }

  return messages;
}

export function historyOperationLabelId(job: FileOperationJob): string {
  const labels: Record<string, string> = {
    "undo.recovery": "recovery.undo",
    "redo.recovery": "recovery.redo",
    "undo.rename": "undo.label.rename",
    "undo.removeEmptyDirectory": "undo.label.createDirectory",
    "undo.removeEmptyFile": "undo.label.createFile",
    "redo.rename": "undo.label.redoRename",
    "redo.createDirectory": "undo.label.redoCreateDirectory",
    "redo.createFile": "undo.label.redoCreateFile",
  };
  return labels[job.commandId] ?? `activity.operation.${job.kind}`;
}

export function localizedUndoSnapshot(snapshot: UndoSnapshot, t: Translate): UndoSnapshot {
  if (snapshot.job.recoveryId) return { ...snapshot, label: t("recovery.undo"), redoLabel: t("recovery.redo"), job: { ...snapshot.job, label: t("recovery.undo") }, redoJob: { ...snapshot.redoJob, label: t("recovery.redo") } };
  const forward = snapshot.redoJob;
  const localized = createUndoSnapshot({
    ...forward,
    plannedActions: plannedActionsFor(forward.kind, forward.targets, forward.sourcePath, forward.destinationPath, t),
    confirmationMessage: confirmationMessageFor(forward.kind, forward.targets, forward.sourcePath, forward.destinationPath, t),
  }, t);
  if (!localized) return snapshot;
  return { ...localized, historyUpdatedAt: snapshot.historyUpdatedAt, job: { ...localized.job, id: snapshot.job.id }, redoJob: { ...localized.redoJob, id: snapshot.redoJob.id } };
}

export function redoSafetyMessages(snapshot: UndoSnapshot, pane: PaneState, t: Translate = fallbackTranslate): string[] {
  const job = snapshot.redoJob;
  if (job.kind === "rename") return undoSafetyMessages({ ...snapshot, job }, pane, t);
  const name = job.requestedName?.trim();
  const path = name && job.destinationPath ? joinChildPath(job.destinationPath, name) : null;
  return path && findEntryByPath(pane.entries, path) ? [t("undo.safety.redoDestinationExists", { path })] : [];
}

function renameHistoryTarget(target: FileOperationTarget): FileOperationTarget {
  return target.path.startsWith("sftp://") ? target : {
    ...target, expectedState: { kind: target.kind, size: target.size, modifiedAt: target.modifiedAt },
  };
}

function createRenameUndo(job: FileOperationJob, t: Translate): UndoSnapshot | null {
  const target = job.targets[0];
  const requestedName = job.requestedName?.trim();
  if (!target || !requestedName) return null;
  const renamedPath = replaceLeafName(target.path, requestedName);
  if (!renamedPath) return null;

  return {
    label: t("undo.label.renameStatus", { from: requestedName, to: target.name }),
    redoLabel: t("undo.label.redoRenameStatus", { from: target.name, to: requestedName }),
    redoJob: {
      ...job,
      id: `redo-${crypto.randomUUID()}`,
      commandId: "redo.rename",
      targets: [renameHistoryTarget(target)],
      label: t("undo.label.redoRename"),
      status: "preview",
      risk: "warning",
      createdAt: new Date().toISOString(),
    },
    job: {
      ...job,
      id: `undo-${crypto.randomUUID()}`,
      kind: "rename",
      commandId: "undo.rename",
      label: t("undo.label.rename"),
      status: "preview",
      risk: "warning",
      targets: [renameHistoryTarget({ ...target, path: renamedPath, key: renamedPath, name: requestedName })],
      plannedActions: [t("undo.planned.rename", { path: renamedPath, name: target.name })],
      confirmationMessage: t("undo.confirm.rename", { name: target.name }),
      requestedName: target.name,
      executable: true,
      createdAt: new Date().toISOString(),
    },
  };
}

function createCreatedEntryUndo(
  job: FileOperationJob,
  kind: "removeEmptyDirectory" | "removeEmptyFile",
  label: string,
  t: Translate,
): UndoSnapshot | null {
  const requestedName = job.requestedName?.trim();
  if (!requestedName || !job.destinationPath) return null;
  const path = joinChildPath(job.destinationPath, requestedName);
  const target: FileOperationTarget = {
    key: path,
    name: requestedName,
    path,
    kind: kind === "removeEmptyDirectory" ? "directory" : "file",
    size: kind === "removeEmptyFile" ? 0 : null,
    modifiedAt: null,
    mode: null,
  };

  return {
    label: t("undo.label.createdEntryStatus", { label, name: requestedName }),
    redoLabel: kind === "removeEmptyDirectory" ? t("undo.label.redoCreateDirectoryStatus", { name: requestedName }) : t("undo.label.redoCreateFileStatus", { name: requestedName }),
    redoJob: {
      ...job,
      id: `redo-${crypto.randomUUID()}`,
      commandId: kind === "removeEmptyDirectory" ? "redo.createDirectory" : "redo.createFile",
      label: kind === "removeEmptyDirectory" ? t("undo.label.redoCreateDirectory") : t("undo.label.redoCreateFile"),
      status: "preview",
      risk: "safe",
      createdAt: new Date().toISOString(),
    },
    job: {
      ...job,
      id: `undo-${crypto.randomUUID()}`,
      kind,
      commandId: kind === "removeEmptyDirectory" ? "undo.removeEmptyDirectory" : "undo.removeEmptyFile",
      label,
      status: "preview",
      risk: "warning",
      targets: [target],
      plannedActions: [kind === "removeEmptyDirectory" ? t("undo.planned.removeEmptyDirectory", { path }) : t("undo.planned.removeEmptyFile", { path })],
      confirmationMessage: kind === "removeEmptyDirectory" ? t("undo.confirm.removeEmptyDirectory", { path }) : t("undo.confirm.removeEmptyFile", { path }),
      requestedName: null,
      executable: true,
      createdAt: new Date().toISOString(),
    },
  };
}

function renameUndoSafetyMessages(job: FileOperationJob, entries: FileEntry[], t: Translate): string[] {
  const target = job.targets[0];
  const restoreName = job.requestedName?.trim();
  if (!target || !restoreName) return [t("undo.safety.missingRestoreName")];

  const currentEntry = findEntryByPath(entries, target.path);
  const restorePath = replaceLeafName(target.path, restoreName);
  const restoreEntry = restorePath ? findEntryByPath(entries, restorePath) : null;
  const messages: string[] = [];

  if (!currentEntry) {
    messages.push(t("undo.safety.notVisible", { path: target.path }));
  } else {
    if (currentEntry.kind !== target.kind) messages.push(t("undo.safety.kindChanged", { name: target.name }));
    if (target.size != null && currentEntry.size !== target.size) {
      messages.push(t("undo.safety.sizeChanged", { name: target.name }));
    }
    if (target.modifiedAt != null && currentEntry.modifiedAt !== target.modifiedAt) {
      messages.push(t("undo.safety.modifiedChanged", { name: target.name }));
    }
  }

  if (restoreEntry && restoreEntry.path !== target.path) {
    messages.push(t("undo.safety.restoreExists", { name: restoreName }));
  }

  return messages;
}

function removeEmptyDirectorySafetyMessages(job: FileOperationJob, entries: FileEntry[], t: Translate): string[] {
  const target = job.targets[0];
  if (!target) return [t("undo.safety.missingDirectoryTarget")];
  const currentEntry = findEntryByPath(entries, target.path);
  if (!currentEntry) return [t("undo.safety.notVisible", { path: target.path })];
  if (currentEntry.kind !== "directory") return [t("undo.safety.notDirectory", { path: target.path })];
  return [];
}

function removeEmptyFileSafetyMessages(job: FileOperationJob, entries: FileEntry[], t: Translate): string[] {
  const target = job.targets[0];
  if (!target) return [t("undo.safety.missingFileTarget")];
  const currentEntry = findEntryByPath(entries, target.path);
  if (!currentEntry) return [t("undo.safety.notVisible", { path: target.path })];
  if (currentEntry.kind !== "file") return [t("undo.safety.notFile", { path: target.path })];
  if (currentEntry.size !== 0) return [t("undo.safety.notEmptyFile", { path: target.path })];
  return [];
}

function findEntryByPath(entries: FileEntry[], path: string): FileEntry | null {
  return entries.find((entry) => entry.path === path) ?? null;
}

function replaceLeafName(path: string, name: string): string | null {
  const separatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (separatorIndex < 0) return name;
  return `${path.slice(0, separatorIndex + 1)}${name}`;
}

function joinChildPath(parent: string, name: string): string {
  if (parent.startsWith("sftp://")) {
    return `${parent.replace(/\/$/, "")}/${name}`;
  }
  const separator = parent.includes("\\") ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/, "")}${separator}${name}`;
}
