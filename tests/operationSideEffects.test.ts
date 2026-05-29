import assert from "node:assert/strict";
import { executeFileOperationJob } from "../src/routes/operationSideEffects";
import type { TauriInvoke } from "../src/routes/locationSideEffects";
import type { FileOperationJob } from "../src/routes/types";

const job: FileOperationJob = {
  id: "job-1",
  kind: "copy",
  commandId: "operation.copy",
  label: "Copy",
  status: "preview",
  risk: "safe",
  sourcePaneId: "left",
  destinationPaneId: "right",
  sourcePath: "/work",
  destinationPath: "/tmp",
  targets: [{ key: "/work/a.txt", name: "a.txt", path: "/work/a.txt", kind: "file", mode: null }],
  plannedActions: ["copy a.txt"],
  confirmationMessage: "Copy 1 item",
  requestedName: null,
  executable: true,
  createdAt: "2026-05-23T00:00:00.000Z",
};

const calls: { command: string; args?: Record<string, unknown> }[] = [];
const invoke: TauriInvoke = async (command, args) => {
  calls.push({ command, args });
  return { succeeded: [{ path: "/tmp/a.txt", message: "copied" }], failed: [] } as never;
};

async function run(): Promise<void> {
  const result = await executeFileOperationJob(invoke, job);
  assert.equal(result.succeeded[0]?.path, "/tmp/a.txt");
  assert.deepEqual(calls, [{ command: "execute_file_operation_job", args: { job } }]);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
