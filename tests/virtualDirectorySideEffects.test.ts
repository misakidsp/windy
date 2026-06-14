import assert from "node:assert/strict";
import {
  listArchiveDirectory,
  listSftpDirectory,
  searchDirectory,
} from "../src/routes/virtualDirectorySideEffects";
import type { SearchDirectoryRequest } from "../src/routes/types";
import { createTauriInvokeMock, type InvokeCall } from "./tauriInvokeMock";

const calls: InvokeCall[] = [];
const invoke = createTauriInvokeMock(calls, (command) => {
  if (command === "list_archive_directory") {
    return { archivePath: "/tmp/a.zip", innerPath: "docs", displayPath: "a.zip::/docs", entries: [] };
  }
  if (command === "search_directory") {
    return { rootPath: "/work", displayPath: "search:/work", queryLabel: "*", entries: [], truncated: false };
  }
  if (command === "list_sftp_directory") {
    return { connectionId: "conn-1", displayName: "remote", remotePath: "/srv", displayPath: "sftp:/srv", entries: [] };
  }
  return undefined;
});

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
