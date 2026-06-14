import assert from "node:assert/strict";
import {
  homeDirectory,
  listGitStatusDirectory,
  listLocalDirectory,
  listLocalRoots,
  openPathWithDefaultApp,
  openPathWithTextEditor,
  parentDirectory,
  rootDirectory,
} from "../src/routes/fileSystemSideEffects";
import { createTauriInvokeMock, type InvokeCall } from "./tauriInvokeMock";

const calls: InvokeCall[] = [];
const invoke = createTauriInvokeMock(calls, (command) => {
  if (command === "list_directory") return { path: "/work", entries: [] };
  if (command === "list_git_status_directory") return { rootPath: "/work", displayPath: "git:/work [1 changed]", entries: [] };
  if (command === "parent_directory") return "/work";
  if (command === "root_directory") return "/";
  if (command === "home_directory") return "/home/windy";
  if (command === "list_local_roots") return ["/"];
  return undefined;
});

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
  await openPathWithTextEditor(invoke, "/work/readme.txt");

  assert.deepEqual(calls, [
    { command: "list_directory", args: { path: "/work" } },
    { command: "list_git_status_directory", args: { path: "/work" } },
    { command: "parent_directory", args: { path: "/work/src" } },
    { command: "root_directory", args: { path: "/work/src" } },
    { command: "home_directory", args: undefined },
    { command: "list_local_roots", args: undefined },
    { command: "open_path", args: { path: "/work/readme.txt" } },
    { command: "open_text_editor", args: { path: "/work/readme.txt" } },
  ]);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
