import assert from "node:assert/strict";
import { getAppearanceSettings, getAppSettings, getKeybindSettings, listExternalCommands, saveOperationFailureLog } from "../src/routes/appSideEffects";
import type { TauriInvoke } from "../src/routes/locationSideEffects";

const calls: { command: string; args?: Record<string, unknown> }[] = [];
const invoke: TauriInvoke = async (command, args) => {
  calls.push({ command, args });
  if (command === "get_app_settings") {
    return {
      useTrash: true,
      operationResult: {
        showStatus: true,
        showFailureDialog: true,
        printToTerminal: false,
        saveFailureLog: true,
      },
      sftpSession: {
        lifecycle: "keepRecent",
        maxSessions: 2,
        idleDisconnectMinutes: 0,
      },
    } as never;
  }
  if (command === "list_external_commands") {
    return [{ id: "pwd", name: "pwd", description: "print path", template: "pwd" }] as never;
  }
  if (command === "get_appearance_settings") {
    return {
      schemaVersion: 1,
      fonts: { uiFamily: "UDEV Gothic", terminalFamily: "UDEV Gothic", uiSize: 12, terminalSize: 12, viewerSize: 12 },
      colors: { "terminal.background": "#111318" },
    } as never;
  }
  if (command === "get_keybind_settings") {
    return {
      schemaVersion: 1,
      bindings: { "pane.focusTerminal": ["x"] },
      lockedBindings: { "dialog.confirm": ["enter"] },
    } as never;
  }
  if (command === "save_operation_failure_log") return "/tmp/windy-failures.log" as never;
  return undefined as never;
};

async function run(): Promise<void> {
  assert.equal((await getAppSettings(invoke)).sftpSession.maxSessions, 2);
  assert.equal((await getAppearanceSettings(invoke)).fonts.uiFamily, "UDEV Gothic");
  assert.deepEqual((await getKeybindSettings(invoke)).bindings["pane.focusTerminal"], ["x"]);
  assert.equal((await listExternalCommands(invoke))[0]?.id, "pwd");
  assert.equal(
    await saveOperationFailureLog(invoke, "Copy", [{ path: "/work/a.txt", message: "failed" }]),
    "/tmp/windy-failures.log",
  );

  assert.deepEqual(calls, [
    { command: "get_app_settings", args: undefined },
    { command: "get_appearance_settings", args: undefined },
    { command: "get_keybind_settings", args: undefined },
    { command: "list_external_commands", args: undefined },
    {
      command: "save_operation_failure_log",
      args: { label: "Copy", failed: [{ path: "/work/a.txt", message: "failed" }] },
    },
  ]);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
