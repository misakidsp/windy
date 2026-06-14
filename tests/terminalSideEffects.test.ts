import assert from "node:assert/strict";
import {
  resizeTerminal,
  startLocalTerminal,
  startSftpTerminal,
  stopTerminal,
  writeTerminalInput,
} from "../src/routes/terminalSideEffects";
import { createTauriInvokeMock, type InvokeCall } from "./tauriInvokeMock";

const calls: InvokeCall[] = [];
const invoke = createTauriInvokeMock(calls, (command) => {
  if (command === "start_terminal") return 10;
  if (command === "start_sftp_ssh_terminal") return 20;
  return undefined;
});

async function run(): Promise<void> {
  await resizeTerminal(invoke, { cols: 100, rows: 24 });
  assert.equal(await startLocalTerminal(invoke, "/work", { cols: 100, rows: 24 }), 10);
  assert.equal(await startSftpTerminal(invoke, "conn-1", { cols: 80, rows: 12 }), 20);
  await writeTerminalInput(invoke, "ls\n");
  await stopTerminal(invoke);

  assert.deepEqual(calls, [
    { command: "resize_terminal", args: { cols: 100, rows: 24 } },
    { command: "start_terminal", args: { cwd: "/work", cols: 100, rows: 24 } },
    { command: "start_sftp_ssh_terminal", args: { connectionId: "conn-1", cols: 80, rows: 12 } },
    { command: "write_terminal", args: { input: "ls\n" } },
    { command: "stop_terminal", args: undefined },
  ]);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
