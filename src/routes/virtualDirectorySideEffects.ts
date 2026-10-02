import { invokeCommand, type TauriInvoke } from "./tauriInvoke";
import type {
  ArchiveDirectoryListing,
  SearchDirectoryListing,
  SearchDirectoryRequest,
  SftpDirectoryListing,
} from "./types";

export function listArchiveDirectory(
  invoke: TauriInvoke,
  archivePath: string,
  innerPath: string,
): Promise<ArchiveDirectoryListing> {
  return invokeCommand<ArchiveDirectoryListing>(invoke, "list_archive_directory", { archivePath, innerPath });
}

export function searchDirectory(invoke: TauriInvoke, request: SearchDirectoryRequest, jobId?: string): Promise<SearchDirectoryListing> {
  return invokeCommand<SearchDirectoryListing>(invoke, "search_directory", { request, ...(jobId ? { jobId } : {}) });
}

export function listSftpDirectory(
  invoke: TauriInvoke,
  connectionId: string,
  remotePath: string,
): Promise<SftpDirectoryListing> {
  return invokeCommand<SftpDirectoryListing>(invoke, "list_sftp_directory", { connectionId, remotePath });
}
