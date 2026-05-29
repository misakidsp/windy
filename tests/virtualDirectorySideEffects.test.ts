import assert from "node:assert/strict";
import {
  listArchiveDirectory,
  listSftpDirectory,
  searchDirectory,
} from "../src/routes/virtualDirectorySideEffects";
import type { TauriInvoke } from "../src/routes/locationSideEffects";
import type { SearchDirectoryRequest } from "../src/routes/types";

const calls: { command: string; args?: Record<string, unknown> }[] = [];
const invoke: TauriInvoke = async (command, args) => {
  calls.push({ command, args });
  if (command === "list_archive_directory") {
    return { archivePath: "/tmp/a.zip", innerPath: "docs", displayPath: "a.zip::/docs", entries: [] } as never;
  }
  if (command === "search_directory") {
    return { rootPath: "/work", displayPath: "search:/work", queryLabel: "*", entries: [], truncated: false } as never;
  }
  if (command === "list_sftp_directory") {
    return { connectionId: "conn-1", displayName: "remote", remotePath: "/srv", displayPath: "sftp:/srv", entries: [] } as never;
  }
  return undefined as never;
};

const request: SearchDirectoryRequest = {
  rootPath: "/work",
  nameRegex: "",
  recursive: true,
  minSizeBytes: null,
  maxSizeBytes: null,
  modifiedAfter: null,
  modifiedBefore: null,
  kind: "all",
  hiddenMode: "exclude",
  readonlyMode: "any",
};

async function run(): Promise<void> {
  assert.equal((await listArchiveDirectory(invoke, "/tmp/a.zip", "docs")).displayPath, "a.zip::/docs");
  assert.equal((await searchDirectory(invoke, request)).displayPath, "search:/work");
  assert.equal((await listSftpDirectory(invoke, "conn-1", "/srv")).displayPath, "sftp:/srv");

  assert.deepEqual(calls, [
    { command: "list_archive_directory", args: { archivePath: "/tmp/a.zip", innerPath: "docs" } },
    { command: "search_directory", args: { request } },
    { command: "list_sftp_directory", args: { connectionId: "conn-1", remotePath: "/srv" } },
  ]);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
