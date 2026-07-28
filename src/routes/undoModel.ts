import { translateMessage, type Translate } from "./localization";
import type { FileEntry, FileOperationJob, FileOperationTarget, PaneState, UndoSnapshot } from "./types";

const fallbackTranslate: Translate = (id, values) => translateMessage(undefined, id, values);

export function createUndoSnapshot(job: FileOperationJob, t: Translate = fallbackTranslate): UndoSnapshot | null {
  if (job.commandId.startsWith("undo.")) return null;
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
      id: `redo-${Date.now().toString(36)}`,
      commandId: "redo.rename",
      label: t("undo.label.redoRename"),
      status: "preview",
      risk: "warning",
      createdAt: new Date().toISOString(),
    },
    job: {
      ...job,
      id: `undo-${Date.now().toString(36)}`,
      kind: "rename",
      commandId: "undo.rename",
      label: t("undo.label.rename"),
      status: "preview",
      risk: "warning",
      targets: [{ ...target, path: renamedPath, key: renamedPath, name: requestedName }],
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
      id: `redo-${Date.now().toString(36)}`,
      commandId: kind === "removeEmptyDirectory" ? "redo.createDirectory" : "redo.createFile",
      label: kind === "removeEmptyDirectory" ? t("undo.label.redoCreateDirectory") : t("undo.label.redoCreateFile"),
      status: "preview",
      risk: "safe",
      createdAt: new Date().toISOString(),
    },
    job: {
      ...job,
      id: `undo-${Date.now().toString(36)}`,
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
    if (target.size !== undefined && currentEntry.size !== target.size) {
      messages.push(t("undo.safety.sizeChanged", { name: target.name }));
    }
    if (target.modifiedAt !== undefined && currentEntry.modifiedAt !== target.modifiedAt) {
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
