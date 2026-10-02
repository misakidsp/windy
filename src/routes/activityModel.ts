import type { PaneDiffSnapshot } from "./diffModel";
import type { FileOperationResult, SearchDirectoryListing, SearchDirectoryRequest, PaneId, OperationResultSnapshot } from "./types";

export type ActivityMessage = { id: string; values?: Record<string, string | number> };
export type ActivityStatus = "running" | "canceling" | "completed" | "warning" | "failed" | "canceled";
export type ActivityProgress = {
  jobId: string;
  phase: "processing" | "scanning" | "hashing";
  current: string;
  items: number;
  total: number | null;
  bytes: number;
};
export type ActivityResult =
  | { kind: "operation"; result: FileOperationResult; snapshot: OperationResultSnapshot }
  | { kind: "diff"; snapshot: PaneDiffSnapshot }
  | { kind: "search"; paneId: PaneId; listing: SearchDirectoryListing; request: SearchDirectoryRequest; returnPath: string };
export type ActivityRecord = {
  id: string;
  label: ActivityMessage;
  message: ActivityMessage;
  status: ActivityStatus;
  startedAt: number;
  finishedAt?: number;
  unread: boolean;
  progress?: ActivityProgress;
  result?: ActivityResult;
};
export const activityRunning = (record: ActivityRecord) => record.status === "running" || record.status === "canceling";

export function retainActivities(records: ActivityRecord[], limit = 200): ActivityRecord[] {
  let excess = Math.max(0, records.length - limit);
  return records.filter(record => {
    if (excess > 0 && !activityRunning(record)) { excess--; return false; }
    return true;
  });
}
export function activityCounts(records: ActivityRecord[]) {
  return {
    running: records.filter(activityRunning).length,
    attention: records.filter(record => record.unread && (record.status === "failed" || record.status === "warning")).length,
    unread: records.filter(record => record.unread).length,
  };
}
