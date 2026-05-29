import { invokeCommand, type TauriInvoke } from "./tauriInvoke";
import type { FileOperationJob, FileOperationResult } from "./types";

export function executeFileOperationJob(invoke: TauriInvoke, job: FileOperationJob): Promise<FileOperationResult> {
  return invokeCommand<FileOperationResult>(invoke, "execute_file_operation_job", { job });
}

export function cancelFileOperationJob(invoke: TauriInvoke, jobId: string): Promise<boolean> {
  return invokeCommand<boolean>(invoke, "cancel_file_operation_job", { jobId });
}
