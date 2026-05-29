import { invokeCommand, type TauriInvoke } from "./tauriInvoke";
import type { AppearanceSettings, AppSettings, ExternalCommandDefinition, FileOperationResultItem, KeybindSettings } from "./types";

export function getAppSettings(invoke: TauriInvoke): Promise<AppSettings> {
  return invokeCommand<AppSettings>(invoke, "get_app_settings");
}

export function getAppearanceSettings(invoke: TauriInvoke): Promise<AppearanceSettings> {
  return invokeCommand<AppearanceSettings>(invoke, "get_appearance_settings");
}

export function getKeybindSettings(invoke: TauriInvoke): Promise<KeybindSettings> {
  return invokeCommand<KeybindSettings>(invoke, "get_keybind_settings");
}

export function listExternalCommands(invoke: TauriInvoke): Promise<ExternalCommandDefinition[]> {
  return invokeCommand<ExternalCommandDefinition[]>(invoke, "list_external_commands");
}

export function saveOperationFailureLog(
  invoke: TauriInvoke,
  label: string,
  failed: FileOperationResultItem[],
): Promise<string> {
  return invokeCommand<string>(invoke, "save_operation_failure_log", { label, failed });
}
