import assert from "node:assert/strict";
import {
  applyLanguagePreset,
  enterSafeMode,
  getAppearanceSettings,
  getAppSettings,
  getKeybindSettings,
  getLanguageSettings,
  getSafeModeStatus,
  listExternalCommands,
  listLanguagePresets,
  openConfigDirectory,
  resetAppearanceSettings,
  resetAppSettings,
  resetKeybindSettings,
  resetLanguageSettings,
  saveAppearanceSettings,
  saveAppSettings,
  saveKeybindSettings,
  saveOperationFailureLog,
} from "../src/routes/appSideEffects";
import { createTauriInvokeMock, type InvokeCall } from "./tauriInvokeMock";

const calls: InvokeCall[] = [];
const invoke = createTauriInvokeMock(calls, (command, args) => {
  if (command === "get_app_settings") {
    return {
      useTrash: true,
      operationResult: {
        showStatus: true,
        showFailureDialog: true,
        printToTerminal: false,
        saveFailureLog: true,
      },
      operationCancel: {
        doubleEscEnabled: true,
        doubleEscWindowMs: 700,
      },
      externalEditor: {
        command: "code",
        args: ["--reuse-window", "{path}"],
      },
      sftpSession: {
        lifecycle: "keepRecent",
        maxSessions: 2,
        idleDisconnectMinutes: 0,
      },
      sftpTransfer: {
        partFileThresholdBytes: 1048576,
      },
    };
  }
  if (command === "save_app_settings") return args?.settings;
  if (command === "save_appearance_settings") return args?.settings;
  if (command === "save_keybind_settings") return args?.settings;
  if (command === "reset_app_settings") return { useTrash: true, operationResult: {}, operationCancel: {}, externalEditor: { command: "", args: [] }, sftpSession: {}, sftpTransfer: {} };
  if (command === "reset_appearance_settings") return { schemaVersion: 1, fonts: { uiFamily: "UDEV Gothic", terminalFamily: "UDEV Gothic", uiSize: 12, terminalSize: 12, viewerSize: 12 }, layout: { fileRowHeight: 20 }, colors: {}, extensionColors: {} };
  if (command === "reset_keybind_settings") return { schemaVersion: 1, bindings: {}, lockedBindings: {} };
  if (command === "reset_language_settings") return { schemaVersion: 1, locale: "en", messages: {} };
  if (command === "enter_safe_mode") return { active: true, backupPaths: ["/tmp/windy/backups/safe-mode"], message: "Safe Mode loaded default settings." };
  if (command === "get_safe_mode_status") return { active: false, backupPaths: [], message: "" };
  if (command === "open_config_directory") return undefined;
  if (command === "list_language_presets") return [{ locale: "en", name: "English" }];
  if (command === "apply_language_preset") {
    return {
      schemaVersion: 1,
      locale: String(args?.locale ?? ""),
      messages: { "dialog.ok": "OK" },
    };
  }
  if (command === "list_external_commands") {
    return [{ id: "pwd", name: "pwd", description: "print path", template: "pwd" }];
  }
  if (command === "get_appearance_settings") {
    return {
      schemaVersion: 1,
      fonts: { uiFamily: "UDEV Gothic", terminalFamily: "UDEV Gothic", uiSize: 12, terminalSize: 12, viewerSize: 12 },
      layout: { fileRowHeight: 20 },
      colors: { "terminal.background": "#111318" },
    };
  }
  if (command === "get_keybind_settings") {
    return {
      schemaVersion: 1,
      bindings: { "pane.focusTerminal": ["x"] },
      lockedBindings: { "dialog.confirm": ["enter"] },
    };
  }
  if (command === "get_language_settings") {
    return {
      schemaVersion: 1,
      locale: "en",
      messages: { "dialog.ok": "OK" },
    };
  }
  if (command === "save_operation_failure_log") return "/tmp/windy-failures.log";
  return undefined;
});

async function run(): Promise<void> {
  assert.equal((await getAppSettings(invoke)).sftpSession.maxSessions, 2);
  assert.equal(
    (await saveAppSettings(invoke, {
      useTrash: true,
      operationResult: { showStatus: true, showFailureDialog: true, printToTerminal: false, saveFailureLog: true },
      operationCancel: { doubleEscEnabled: true, doubleEscWindowMs: 700 },
      externalEditor: { command: "code", args: ["{path}"] },
      sftpSession: { lifecycle: "keepRecent", maxSessions: 2, idleDisconnectMinutes: 0 },
      sftpTransfer: { partFileThresholdBytes: 1048576 },
    })).externalEditor.command,
    "code",
  );
  assert.equal((await getAppearanceSettings(invoke)).fonts.uiFamily, "UDEV Gothic");
  assert.equal((await saveAppearanceSettings(invoke, {
    schemaVersion: 1,
    fonts: { uiFamily: "UDEV Gothic", terminalFamily: "UDEV Gothic", uiSize: 12, terminalSize: 12, viewerSize: 12 },
    layout: { fileRowHeight: 20 },
    colors: {},
    extensionColors: {},
  })).layout.fileRowHeight, 20);
  assert.deepEqual((await getKeybindSettings(invoke)).bindings["pane.focusTerminal"], ["x"]);
  assert.deepEqual((await saveKeybindSettings(invoke, { schemaVersion: 1, bindings: { "pane.focusTerminal": ["x"] }, lockedBindings: {} })).bindings["pane.focusTerminal"], ["x"]);
  assert.equal((await getLanguageSettings(invoke)).messages["dialog.ok"], "OK");
  assert.equal((await resetAppSettings(invoke)).useTrash, true);
  assert.equal((await resetAppearanceSettings(invoke)).layout.fileRowHeight, 20);
  assert.deepEqual((await resetKeybindSettings(invoke)).bindings, {});
  assert.equal((await resetLanguageSettings(invoke)).locale, "en");
  assert.equal((await enterSafeMode(invoke)).active, true);
  assert.equal((await getSafeModeStatus(invoke)).active, false);
  await openConfigDirectory(invoke);
  assert.equal((await listLanguagePresets(invoke))[0]?.locale, "en");
  assert.equal((await applyLanguagePreset(invoke, "ja")).locale, "ja");
  assert.equal((await listExternalCommands(invoke))[0]?.id, "pwd");
  assert.equal(
    await saveOperationFailureLog(invoke, "Copy", [{ path: "/work/a.txt", message: "failed" }]),
    "/tmp/windy-failures.log",
  );

  assert.deepEqual(calls, [
    { command: "get_app_settings", args: undefined },
    {
      command: "save_app_settings",
      args: {
        settings: {
          useTrash: true,
          operationResult: { showStatus: true, showFailureDialog: true, printToTerminal: false, saveFailureLog: true },
          operationCancel: { doubleEscEnabled: true, doubleEscWindowMs: 700 },
          externalEditor: { command: "code", args: ["{path}"] },
          sftpSession: { lifecycle: "keepRecent", maxSessions: 2, idleDisconnectMinutes: 0 },
          sftpTransfer: { partFileThresholdBytes: 1048576 },
        },
      },
    },
    { command: "get_appearance_settings", args: undefined },
    {
      command: "save_appearance_settings",
      args: {
        settings: {
          schemaVersion: 1,
          fonts: { uiFamily: "UDEV Gothic", terminalFamily: "UDEV Gothic", uiSize: 12, terminalSize: 12, viewerSize: 12 },
          layout: { fileRowHeight: 20 },
          colors: {},
          extensionColors: {},
        },
      },
    },
    { command: "get_keybind_settings", args: undefined },
    {
      command: "save_keybind_settings",
      args: { settings: { schemaVersion: 1, bindings: { "pane.focusTerminal": ["x"] }, lockedBindings: {} } },
    },
    { command: "get_language_settings", args: undefined },
    { command: "reset_app_settings", args: undefined },
    { command: "reset_appearance_settings", args: undefined },
    { command: "reset_keybind_settings", args: undefined },
    { command: "reset_language_settings", args: undefined },
    { command: "enter_safe_mode", args: undefined },
    { command: "get_safe_mode_status", args: undefined },
    { command: "open_config_directory", args: undefined },
    { command: "list_language_presets", args: undefined },
    { command: "apply_language_preset", args: { locale: "ja" } },
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
