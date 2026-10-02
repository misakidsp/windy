import { invoke } from "@tauri-apps/api/core";
import {
  getAppearanceSettings,
  getAppSettings,
  getKeybindSettings,
  getLanguageSettings,
  getSafeModeStatus,
  enterSafeMode,
  listLanguagePresets,
  openConfigDirectory,
  applyLanguagePreset,
  resetAppearanceSettings,
  resetAppSettings,
  resetKeybindSettings,
  resetLanguageSettings,
  saveAppearanceSettings,
  saveAppSettings,
  saveKeybindSettings,
} from "../appSideEffects";
import { applyAppearanceToRoot, fontFamilySetting } from "../appearanceModel";
import type { AppearanceSettings, AppSettings, KeybindSettings } from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

type Dependencies = Pick<WorkspaceActions,
  | "localizedBackendError"
  | "localizedSafeModeMessage"
>;

export function createSettingsController(state: Pick<WorkspaceState, "app" | "settings" | "terminal">, actions: Dependencies) {
  function applyLoadedAppearanceSettings(settings: AppearanceSettings): void {
    state.settings.appearanceSettings = settings;
    applyAppearanceToRoot(document.documentElement, state.settings.appearanceSettings);
    if (state.terminal.terminal) {
      state.terminal.terminal.options.fontFamily = fontFamilySetting(state.settings.appearanceSettings.fonts.terminalFamily);
      state.terminal.terminal.options.fontSize = state.settings.appearanceSettings.fonts.terminalSize;
      state.terminal.terminal.options.theme = {
        ...state.terminal.terminal.options.theme,
        background: state.settings.appearanceSettings.colors["terminal.background"],
        foreground: state.settings.appearanceSettings.colors["terminal.foreground"],
        cursor: state.settings.appearanceSettings.colors["terminal.cursor"],
        selectionBackground: state.settings.appearanceSettings.colors["terminal.selectionBackground"],
      };
      state.terminal.terminalFit?.fit();
    }
  }

  async function loadAppSettings(): Promise<void> {
    try {
      state.settings.appSettings = await getAppSettings(invoke);
      state.app.lastCommandId = "settings.load";
    } catch (error) {
      state.app.notify("settings.loadFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "settings.loadFailed";
    }
  }

  async function loadAppearanceSettings(): Promise<void> {
    try {
      applyLoadedAppearanceSettings(await getAppearanceSettings(invoke));
      state.app.lastCommandId = "appearance.load";
    } catch (error) {
      state.app.notify("settings.appearanceLoadFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "appearance.loadFailed";
    }
  }

  async function loadKeybindSettings(): Promise<void> {
    try {
      state.settings.keybindSettings = await getKeybindSettings(invoke);
      state.app.lastCommandId = "keybind.load";
    } catch (error) {
      state.app.notify("settings.keybindLoadFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "keybind.loadFailed";
    }
  }

  async function loadLanguageSettings(): Promise<void> {
    try {
      state.settings.languageSettings = await getLanguageSettings(invoke);
      state.app.lastCommandId = "language.load";
    } catch (error) {
      state.app.notify("settings.loadFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "language.loadFailed";
    }
  }

  async function openPreferencesDialog(): Promise<void> {
    state.settings.preferencesDialogOpen = true;
    state.settings.preferencesLoading = true;
    state.settings.preferencesError = "";
    try {
      const [loadedApp, loadedAppearance, loadedKeybind, loadedLanguage, loadedPresets] = await Promise.all([
        getAppSettings(invoke),
        getAppearanceSettings(invoke),
        getKeybindSettings(invoke),
        getLanguageSettings(invoke),
        listLanguagePresets(invoke),
      ]);
      state.settings.appSettings = loadedApp;
      applyLoadedAppearanceSettings(loadedAppearance);
      state.settings.keybindSettings = loadedKeybind;
      state.settings.languageSettings = loadedLanguage;
      state.settings.languagePresets = loadedPresets;
      state.app.notify("preferences.statusOpened", undefined, "completed", false);
      state.app.lastCommandId = "preferences.open";
    } catch (error) {
      state.settings.preferencesError = actions.localizedBackendError(error);
      state.app.notify("preferences.statusLoadFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "preferences.loadFailed";
    } finally {
      state.settings.preferencesLoading = false;
    }
  }

  async function savePreferencesAppSettings(settings: AppSettings): Promise<void> {
    state.settings.preferencesLoading = true;
    state.settings.preferencesError = "";
    try {
      state.settings.appSettings = await saveAppSettings(invoke, settings);
      state.app.notify("preferences.statusGeneralSaved", undefined, "completed", true);
      state.app.lastCommandId = "preferences.saveGeneral";
    } catch (error) {
      state.settings.preferencesError = actions.localizedBackendError(error);
      state.app.notify("preferences.statusGeneralSaveFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "preferences.saveGeneralFailed";
    } finally {
      state.settings.preferencesLoading = false;
    }
  }

  async function savePreferencesAppearanceSettings(settings: AppearanceSettings): Promise<void> {
    state.settings.preferencesLoading = true;
    state.settings.preferencesError = "";
    try {
      applyLoadedAppearanceSettings(await saveAppearanceSettings(invoke, settings));
      state.app.notify("preferences.statusAppearanceSaved", undefined, "completed", true);
      state.app.lastCommandId = "preferences.saveAppearance";
    } catch (error) {
      state.settings.preferencesError = actions.localizedBackendError(error);
      state.app.notify("preferences.statusAppearanceSaveFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "preferences.saveAppearanceFailed";
    } finally {
      state.settings.preferencesLoading = false;
    }
  }

  async function savePreferencesKeybindSettings(settings: KeybindSettings): Promise<void> {
    state.settings.preferencesLoading = true;
    state.settings.preferencesError = "";
    try {
      state.settings.keybindSettings = await saveKeybindSettings(invoke, settings);
      state.app.notify("preferences.statusKeybindingsSaved", undefined, "completed", true);
      state.app.lastCommandId = "preferences.saveKeybindings";
    } catch (error) {
      state.settings.preferencesError = actions.localizedBackendError(error);
      state.app.notify("preferences.statusKeybindingsSaveFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "preferences.saveKeybindingsFailed";
    } finally {
      state.settings.preferencesLoading = false;
    }
  }

  async function applyPreferencesLanguagePreset(locale: string): Promise<void> {
    state.settings.preferencesLoading = true;
    state.settings.preferencesError = "";
    try {
      state.settings.languageSettings = await applyLanguagePreset(invoke, locale);
      state.app.notify("preferences.statusLanguageApplied", { locale: state.settings.languageSettings.locale }, "completed", true);
      state.app.lastCommandId = "preferences.applyLanguage";
    } catch (error) {
      state.settings.preferencesError = actions.localizedBackendError(error);
      state.app.notify("preferences.statusLanguageApplyFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "preferences.applyLanguageFailed";
    } finally {
      state.settings.preferencesLoading = false;
    }
  }

  async function openPreferencesConfigDirectory(): Promise<void> {
    state.settings.preferencesLoading = true;
    state.settings.preferencesError = "";
    try {
      await openConfigDirectory(invoke);
      state.app.notify("preferences.statusConfigDirectoryOpened", undefined, "completed", true);
      state.app.lastCommandId = "preferences.openConfigDirectory";
    } catch (error) {
      state.settings.preferencesError = actions.localizedBackendError(error);
      state.app.notify("preferences.statusConfigDirectoryFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "preferences.openConfigDirectoryFailed";
    } finally {
      state.settings.preferencesLoading = false;
    }
  }

  async function resetPreferencesSettings(target: "app" | "appearance" | "keybind" | "language"): Promise<void> {
    state.settings.preferencesLoading = true;
    state.settings.preferencesError = "";
    try {
      if (target === "app") {
        state.settings.appSettings = await resetAppSettings(invoke);
      } else if (target === "appearance") {
        applyLoadedAppearanceSettings(await resetAppearanceSettings(invoke));
      } else if (target === "keybind") {
        state.settings.keybindSettings = await resetKeybindSettings(invoke);
      } else {
        state.settings.languageSettings = await resetLanguageSettings(invoke);
      }
      state.app.notify("preferences.statusReset", undefined, "completed", true);
      state.app.lastCommandId = `preferences.reset.${target}`;
    } catch (error) {
      state.settings.preferencesError = actions.localizedBackendError(error);
      state.app.notify("preferences.statusResetFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "preferences.resetFailed";
    } finally {
      state.settings.preferencesLoading = false;
    }
  }

  async function enterPreferencesSafeMode(): Promise<void> {
    state.settings.preferencesLoading = true;
    state.settings.preferencesError = "";
    try {
      const status = await enterSafeMode(invoke);
      state.settings.appSettings = await getAppSettings(invoke);
      applyLoadedAppearanceSettings(await getAppearanceSettings(invoke));
      state.settings.keybindSettings = await getKeybindSettings(invoke);
      state.settings.languageSettings = await getLanguageSettings(invoke);
      state.app.notify("preferences.statusSafeMode", { message: actions.localizedSafeModeMessage(status), count: status.backupPaths.length }, "completed", true);
      state.app.lastCommandId = "preferences.safeMode";
    } catch (error) {
      state.settings.preferencesError = actions.localizedBackendError(error);
      state.app.notify("preferences.statusSafeModeFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "preferences.safeModeFailed";
    } finally {
      state.settings.preferencesLoading = false;
    }
  }

  async function loadSafeModeStatus(): Promise<void> {
    try {
      const status = await getSafeModeStatus(invoke);
      if (!status.active) return;
      state.app.notify("preferences.statusSafeMode", { message: actions.localizedSafeModeMessage(status), count: status.backupPaths.length }, "completed", true);
      state.app.lastCommandId = "safeMode.startup";
    } catch (error) {
      state.app.notify("preferences.statusSafeModeStatusFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "safeMode.statusFailed";
    }
  }

  return {
    applyLoadedAppearanceSettings,
    loadAppSettings,
    loadAppearanceSettings,
    loadKeybindSettings,
    loadLanguageSettings,
    openPreferencesDialog,
    savePreferencesAppSettings,
    savePreferencesAppearanceSettings,
    savePreferencesKeybindSettings,
    applyPreferencesLanguagePreset,
    openPreferencesConfigDirectory,
    resetPreferencesSettings,
    enterPreferencesSafeMode,
    loadSafeModeStatus,
  };
}
