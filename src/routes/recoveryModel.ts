import type { FileOperationJob, RecoveryRecord, UndoSnapshot } from "./types";
import type { Translate } from "./localization";

export function recoverySnapshot(record: RecoveryRecord, t: Translate): UndoSnapshot {
  const make = (direction: "undo" | "redo"): FileOperationJob => ({
    id: `${direction}-${record.id}`, kind: "move", commandId: `${direction}.recovery`,
    label: t(`recovery.${direction}`), status: "preview", risk: "warning",
    sourcePaneId: "left", destinationPaneId: null, sourcePath: "", destinationPath: null,
    targets: [], plannedActions: record.items.map(item => item.afterPath),
    confirmationMessage: t("recovery.confirm"), requestedName: null, executable: true,
    createdAt: new Date(record.updatedAt ?? record.createdAt).toISOString(), recoveryId: record.id, recoveryDirection: direction,
  });
  return { historyUpdatedAt: record.updatedAt ?? record.createdAt, label: t("recovery.undo"), redoLabel: t("recovery.redo"), job: make("undo"), redoJob: make("redo") };
}
export function historyLimit(value: number | undefined): number {
  return Number.isFinite(value) ? Math.min(1000, Math.max(1, Math.trunc(value!))) : 20;
}
