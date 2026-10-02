import type { ActivityProgress } from "../activityModel";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { applyAppearanceToRoot } from "../appearanceModel";
import { stopTerminal } from "../terminalSideEffects";
import type { TerminalExit, TerminalOutput } from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

export function mountWorkspace(state: WorkspaceState, actions: WorkspaceActions) {
  let disposed = false;
  const listeners: UnlistenFn[] = [];
  const retainListener = (unlisten: UnlistenFn) => {
    if (disposed) unlisten();
    else listeners.push(unlisten);
  };
  const stopTerminalRepeatOnBlur = () => actions.stopTerminalKeyRepeat();
  const blockMouseEvent = (event: MouseEvent) => {
    if (
      state.settings.preferencesDialogOpen ||
      (event.target instanceof HTMLElement && event.target.closest("[data-windy-interactive]"))
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  window.addEventListener("keydown", actions.handleKeydown);
  window.addEventListener("blur", stopTerminalRepeatOnBlur);
  window.addEventListener("contextmenu", blockMouseEvent, { capture: true });
  window.addEventListener("mousedown", blockMouseEvent, { capture: true });
  window.addEventListener("mouseup", blockMouseEvent, { capture: true });
  window.addEventListener("auxclick", blockMouseEvent, { capture: true });
  void listen<ActivityProgress>("activity-progress", event => state.activity.progress(event.payload)).then(retainListener);
  void listen<TerminalOutput>("terminal-output", (event) => {
    actions.handleTerminalOutput(event.payload);
  }).then(retainListener);
  void listen<TerminalExit>("terminal-exit", (event) => {
    actions.handleTerminalExit(event.payload);
  }).then(retainListener);
  void listen("preferences-open", () => {
    void actions.openPreferencesDialog();
  }).then(retainListener);
  applyAppearanceToRoot(document.documentElement, state.settings.appearanceSettings);
  void actions.loadAppSettings();
  void actions.loadAppearanceSettings();
  void actions.loadKeybindSettings();
  void actions.loadLanguageSettings();
  void actions.loadSafeModeStatus();
  void actions.loadTerminalShellKind();
  void actions.ensureSftpProfilesLoaded();
  void actions.initializePanes();

  return () => {
    disposed = true;
    window.removeEventListener("keydown", actions.handleKeydown);
    window.removeEventListener("blur", stopTerminalRepeatOnBlur);
    window.removeEventListener("contextmenu", blockMouseEvent, { capture: true });
    window.removeEventListener("mousedown", blockMouseEvent, { capture: true });
    window.removeEventListener("mouseup", blockMouseEvent, { capture: true });
    window.removeEventListener("auxclick", blockMouseEvent, { capture: true });
    actions.stopTerminalKeyRepeat();
    for (const unlisten of listeners) unlisten();
    void stopTerminal(invoke);
    state.panes.listElements.left = null;
    state.panes.listElements.right = null;
  };
}
