import { invokeCommand, type TauriInvoke } from "./tauriInvoke";
import type { AppearanceSettings, AppSettings, ExternalCommandDefinition, FileOperationResultItem, KeybindSettings, LanguagePresetInfo, LanguageSettings, SafeModeStatus } from "./types";

export function getAppSettings(invoke: TauriInvoke): Promise<AppSettings> {
  return invokeCommand<AppSettings>(invoke, "get_app_settings");
}

export function getAppearanceSettings(invoke: TauriInvoke): Promise<AppearanceSettings> {
  return invokeCommand<AppearanceSettings>(invoke, "get_appearance_settings");
}

export function getKeybindSettings(invoke: TauriInvoke): Promise<KeybindSettings> {
  return invokeCommand<KeybindSettings>(invoke, "get_keybind_settings");
}

export function getLanguageSettings(invoke: TauriInvoke): Promise<LanguageSettings> {
  return invokeCommand<LanguageSettings>(invoke, "get_language_settings");
}

export function saveAppSettings(invoke: TauriInvoke, settings: AppSettings): Promise<AppSettings> {
  return invokeCommand<AppSettings>(invoke, "save_app_settings", { settings });
}

export function saveAppearanceSettings(invoke: TauriInvoke, settings: AppearanceSettings): Promise<AppearanceSettings> {
  return invokeCommand<AppearanceSettings>(invoke, "save_appearance_settings", { settings });
}

export function saveKeybindSettings(invoke: TauriInvoke, settings: KeybindSettings): Promise<KeybindSettings> {
  return invokeCommand<KeybindSettings>(invoke, "save_keybind_settings", { settings });
}

export function resetAppSettings(invoke: TauriInvoke): Promise<AppSettings> {
  return invokeCommand<AppSettings>(invoke, "reset_app_settings");
}

export function resetAppearanceSettings(invoke: TauriInvoke): Promise<AppearanceSettings> {
  return invokeCommand<AppearanceSettings>(invoke, "reset_appearance_settings");
}

export function resetKeybindSettings(invoke: TauriInvoke): Promise<KeybindSettings> {
  return invokeCommand<KeybindSettings>(invoke, "reset_keybind_settings");
}

export function resetLanguageSettings(invoke: TauriInvoke): Promise<LanguageSettings> {
  return invokeCommand<LanguageSettings>(invoke, "reset_language_settings");
}

export function enterSafeMode(invoke: TauriInvoke): Promise<SafeModeStatus> {
  return invokeCommand<SafeModeStatus>(invoke, "enter_safe_mode");
}

export function getSafeModeStatus(invoke: TauriInvoke): Promise<SafeModeStatus> {
  return invokeCommand<SafeModeStatus>(invoke, "get_safe_mode_status");
}

export function openConfigDirectory(invoke: TauriInvoke): Promise<void> {
  return invokeCommand<void>(invoke, "open_config_directory");
}

export function listLanguagePresets(invoke: TauriInvoke): Promise<LanguagePresetInfo[]> {
  return invokeCommand<LanguagePresetInfo[]>(invoke, "list_language_presets");
}

export function applyLanguagePreset(invoke: TauriInvoke, locale: string): Promise<LanguageSettings> {
  return invokeCommand<LanguageSettings>(invoke, "apply_language_preset", { locale });
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
