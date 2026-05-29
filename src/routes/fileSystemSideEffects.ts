import { invokeCommand, type TauriInvoke } from "./tauriInvoke";
import type { DirectoryListing, GitStatusListing } from "./types";
import type { DetailedDiffResult } from "./diffModel";

export function listLocalDirectory(invoke: TauriInvoke, path: string): Promise<DirectoryListing> {
  return invokeCommand<DirectoryListing>(invoke, "list_directory", { path });
}

export function listGitStatusDirectory(invoke: TauriInvoke, path: string): Promise<GitStatusListing> {
  return invokeCommand<GitStatusListing>(invoke, "list_git_status_directory", { path });
}

export function parentDirectory(invoke: TauriInvoke, path: string): Promise<string | null> {
  return invokeCommand<string | null>(invoke, "parent_directory", { path });
}

export function rootDirectory(invoke: TauriInvoke, path: string): Promise<string> {
  return invokeCommand<string>(invoke, "root_directory", { path });
}

export function homeDirectory(invoke: TauriInvoke): Promise<string> {
  return invokeCommand<string>(invoke, "home_directory");
}

export function listLocalRoots(invoke: TauriInvoke): Promise<string[]> {
  return invokeCommand<string[]>(invoke, "list_local_roots");
}

export function openPathWithDefaultApp(invoke: TauriInvoke, path: string): Promise<void> {
  return invokeCommand<void>(invoke, "open_path", { path });
}

export function compareLocalDirectoriesDetailed(
  invoke: TauriInvoke,
  jobId: string,
  leftPath: string,
  rightPath: string,
  recursive: boolean,
  hashFiles: boolean,
): Promise<DetailedDiffResult> {
  return invokeCommand<DetailedDiffResult>(invoke, "compare_local_directories_detailed", {
    jobId,
    leftPath,
    rightPath,
    recursive,
    hashFiles,
  });
}

export function cancelDetailedDiff(invoke: TauriInvoke, jobId: string): Promise<boolean> {
  return invokeCommand<boolean>(invoke, "cancel_detailed_diff", { jobId });
}
