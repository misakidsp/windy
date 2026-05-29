import type { FileEntry, FileOperationJob, FileOperationTarget, PaneState, UndoSnapshot } from "./types";

export function createUndoSnapshot(job: FileOperationJob): UndoSnapshot | null {
  if (job.commandId.startsWith("undo.")) return null;
  if (job.kind === "rename") return createRenameUndo(job);
  if (job.kind === "mkdir") return createCreatedEntryUndo(job, "removeEmptyDirectory", "Undo create directory");
  if (job.kind === "createFile") return createCreatedEntryUndo(job, "removeEmptyFile", "Undo create file");
  return null;
}

export function undoPaneState(pane: PaneState): Pick<PaneState, "id" | "source" | "currentPath"> {
  return {
    id: pane.id,
    source: pane.source,
    currentPath: pane.currentPath,
  };
}

export function undoSafetyMessages(snapshot: UndoSnapshot, pane: PaneState): string[] {
  const job = snapshot.job;
  const messages: string[] = [];

  if (
    pane.source.kind !== "search" &&
    pane.source.kind !== "diff" &&
    pane.source.kind !== "operationResult" &&
    pane.source.kind !== "gitStatus" &&
    pane.currentPath !== job.sourcePath
  ) {
    messages.push(`The source pane is now at ${pane.currentPath || "-"}, but this Undo was recorded for ${job.sourcePath || "-"}.`);
  }

  if (job.kind === "rename") {
    messages.push(...renameUndoSafetyMessages(job, pane.entries));
  } else if (job.kind === "removeEmptyDirectory") {
    messages.push(...removeEmptyDirectorySafetyMessages(job, pane.entries));
  } else if (job.kind === "removeEmptyFile") {
    messages.push(...removeEmptyFileSafetyMessages(job, pane.entries));
  }

  return messages;
}

function createRenameUndo(job: FileOperationJob): UndoSnapshot | null {
  const target = job.targets[0];
  const requestedName = job.requestedName?.trim();
  if (!target || !requestedName) return null;
  const renamedPath = replaceLeafName(target.path, requestedName);
  if (!renamedPath) return null;

  return {
    label: `Undo rename ${requestedName} -> ${target.name}`,
    redoLabel: `Redo rename ${target.name} -> ${requestedName}`,
    redoJob: {
      ...job,
      id: `redo-${Date.now().toString(36)}`,
      commandId: "redo.rename",
      label: "Redo rename",
      status: "preview",
      risk: "warning",
      createdAt: new Date().toISOString(),
    },
    job: {
      ...job,
      id: `undo-${Date.now().toString(36)}`,
      kind: "rename",
      commandId: "undo.rename",
      label: "Undo rename",
      status: "preview",
      risk: "warning",
      targets: [{ ...target, path: renamedPath, key: renamedPath, name: requestedName }],
      plannedActions: [`Rename ${renamedPath} back to ${target.name}.`],
      confirmationMessage: `Undo rename and restore ${target.name}?`,
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
    label: `${label}: ${requestedName}`,
    redoLabel: kind === "removeEmptyDirectory" ? `Redo create directory: ${requestedName}` : `Redo create file: ${requestedName}`,
    redoJob: {
      ...job,
      id: `redo-${Date.now().toString(36)}`,
      commandId: kind === "removeEmptyDirectory" ? "redo.createDirectory" : "redo.createFile",
      label: kind === "removeEmptyDirectory" ? "Redo create directory" : "Redo create file",
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
      plannedActions: [kind === "removeEmptyDirectory" ? `Remove empty directory ${path}.` : `Remove empty file ${path}.`],
      confirmationMessage: kind === "removeEmptyDirectory" ? `Remove empty directory ${path}?` : `Remove empty file ${path}?`,
      requestedName: null,
      executable: true,
      createdAt: new Date().toISOString(),
    },
  };
}

function renameUndoSafetyMessages(job: FileOperationJob, entries: FileEntry[]): string[] {
  const target = job.targets[0];
  const restoreName = job.requestedName?.trim();
  if (!target || !restoreName) return ["Undo rename is missing the restore name."];

  const currentEntry = findEntryByPath(entries, target.path);
  const restorePath = replaceLeafName(target.path, restoreName);
  const restoreEntry = restorePath ? findEntryByPath(entries, restorePath) : null;
  const messages: string[] = [];

  if (!currentEntry) {
    messages.push(`${target.path} is not visible in the current listing.`);
  } else {
    if (target.size !== undefined && currentEntry.size !== target.size) {
      messages.push(`${target.name} size changed after the original operation.`);
    }
    if (target.modifiedAt !== undefined && currentEntry.modifiedAt !== target.modifiedAt) {
      messages.push(`${target.name} modified time changed after the original operation.`);
    }
  }

  if (restoreEntry && restoreEntry.path !== target.path) {
    messages.push(`${restoreName} already exists; Undo rename may conflict.`);
  }

  return messages;
}

function removeEmptyDirectorySafetyMessages(job: FileOperationJob, entries: FileEntry[]): string[] {
  const target = job.targets[0];
  if (!target) return ["Undo directory removal target is missing."];
  const currentEntry = findEntryByPath(entries, target.path);
  if (!currentEntry) return [`${target.path} is not visible in the current listing.`];
  if (currentEntry.kind !== "directory") return [`${target.path} is no longer a directory.`];
  return [];
}

function removeEmptyFileSafetyMessages(job: FileOperationJob, entries: FileEntry[]): string[] {
  const target = job.targets[0];
  if (!target) return ["Undo file removal target is missing."];
  const currentEntry = findEntryByPath(entries, target.path);
  if (!currentEntry) return [`${target.path} is not visible in the current listing.`];
  if (currentEntry.kind !== "file") return [`${target.path} is no longer a file.`];
  if (currentEntry.size !== 0) return [`${target.path} is no longer empty; Undo will not remove it.`];
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
