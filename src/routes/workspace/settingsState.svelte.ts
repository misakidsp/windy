import { createTranslator } from "../localization";
import { defaultAppearanceSettings } from "../appearanceModel";
import { defaultKeybindSettings } from "../keyboardModel";
import type {
  AppearanceSettings,
  AppSettings,
  KeybindSettings,
  LanguagePresetInfo,
  LanguageSettings,
} from "../types";

export function createSettingsState() {
  let appSettings: AppSettings = $state.raw({
    useTrash: true,
    operationResult: {
      notificationDisplay: "details",
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
      command: "",
      args: [],
    },
    sftpSession: {
      lifecycle: "keepRecent",
      maxSessions: 2,
      idleDisconnectMinutes: 0,
    },
    sftpTransfer: {
      partFileThresholdBytes: 1024 * 1024,
    },
  });
  let appearanceSettings: AppearanceSettings = $state.raw(defaultAppearanceSettings);
  let keybindSettings: KeybindSettings = $state.raw(defaultKeybindSettings);
  let languageSettings: LanguageSettings = $state.raw({
    schemaVersion: 1,
    locale: "en",
    messages: {},
  });
  let t = $derived(createTranslator(languageSettings));
  let languagePresets: LanguagePresetInfo[] = $state.raw([]);
  let preferencesDialogOpen = $state.raw(false);
  let preferencesLoading = $state.raw(false);
  let preferencesError = $state.raw("");

  return {
    get appSettings() { return appSettings; },
    set appSettings(value: AppSettings) { appSettings = value; },
    get appearanceSettings() { return appearanceSettings; },
    set appearanceSettings(value: AppearanceSettings) { appearanceSettings = value; },
    get keybindSettings() { return keybindSettings; },
    set keybindSettings(value: KeybindSettings) { keybindSettings = value; },
    get languageSettings() { return languageSettings; },
    set languageSettings(value: LanguageSettings) { languageSettings = value; },
    get t() { return t; },
    get languagePresets() { return languagePresets; },
    set languagePresets(value: LanguagePresetInfo[]) { languagePresets = value; },
    get preferencesDialogOpen() { return preferencesDialogOpen; },
    set preferencesDialogOpen(value) { preferencesDialogOpen = value; },
    get preferencesLoading() { return preferencesLoading; },
    set preferencesLoading(value) { preferencesLoading = value; },
    get preferencesError() { return preferencesError; },
    set preferencesError(value) { preferencesError = value; },
  };
}
