import { invokeCommand, type TauriInvoke } from "./tauriInvoke";
import type { FileOperationJob, FileOperationResult } from "./types";

export function executeFileOperationJob(invoke: TauriInvoke, job: FileOperationJob): Promise<FileOperationResult> {
  return invokeCommand<FileOperationResult>(invoke, "execute_file_operation_job", { job });
}

export type CancelOperationStatus = "accepted" | "unsupported" | "notRunning";

export function cancelFileOperationJob(invoke: TauriInvoke, jobId: string): Promise<CancelOperationStatus> {
  return invokeCommand<CancelOperationStatus>(invoke, "cancel_file_operation_job", { jobId });
}

export function fileOperationCanCancel(job: FileOperationJob): boolean {
  const sftp = job.destinationPath?.startsWith("sftp://") || job.targets.some((target) => target.path.startsWith("sftp://"));
  if (sftp) return job.kind === "copy";
  return !!job.recoveryId || ["copy", "extractArchive", "createArchive"].includes(job.kind);
}
