import assert from "node:assert/strict";
import {
  homeDirectory,
  listGitStatusDirectory,
  listLocalDirectory,
  listLocalRoots,
  openPathWithDefaultApp,
  parentDirectory,
  rootDirectory,
} from "../src/routes/fileSystemSideEffects";
import type { TauriInvoke } from "../src/routes/locationSideEffects";

const calls: { command: string; args?: Record<string, unknown> }[] = [];
const invoke: TauriInvoke = async (command, args) => {
  calls.push({ command, args });
  if (command === "list_directory") return { path: "/work", entries: [] } as never;
  if (command === "list_git_status_directory") return { rootPath: "/work", displayPath: "git:/work [1 changed]", entries: [] } as never;
  if (command === "parent_directory") return "/work" as never;
  if (command === "root_directory") return "/" as never;
  if (command === "home_directory") return "/home/windy" as never;
  if (command === "list_local_roots") return ["/"] as never;
  return undefined as never;
};

async function run(): Promise<void> {
  assert.deepEqual(await listLocalDirectory(invoke, "/work"), { path: "/work", entries: [] });
  assert.deepEqual(await listGitStatusDirectory(invoke, "/work"), {
    rootPath: "/work",
    displayPath: "git:/work [1 changed]",
    entries: [],
  });
  assert.equal(await parentDirectory(invoke, "/work/src"), "/work");
  assert.equal(await rootDirectory(invoke, "/work/src"), "/");
  assert.equal(await homeDirectory(invoke), "/home/windy");
  assert.deepEqual(await listLocalRoots(invoke), ["/"]);
  await openPathWithDefaultApp(invoke, "/work/readme.txt");

  assert.deepEqual(calls, [
    { command: "list_directory", args: { path: "/work" } },
    { command: "list_git_status_directory", args: { path: "/work" } },
    { command: "parent_directory", args: { path: "/work/src" } },
    { command: "root_directory", args: { path: "/work/src" } },
    { command: "home_directory", args: undefined },
    { command: "list_local_roots", args: undefined },
    { command: "open_path", args: { path: "/work/readme.txt" } },
  ]);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
