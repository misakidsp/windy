import { createActivityController } from "./activityController";
import { createMessagesController } from "./messagesController";
import { createLocationsController } from "./locationsController";
import { createNavigationController } from "./navigationController";
import { createDirectoryController } from "./directoryController";
import { createPanesController } from "./panesController";
import { createKeyboardController } from "./keyboardController";
import { createViewerController } from "./viewerController";
import { createOperationsController } from "./operationsController";
import { createCommandsController } from "./commandsController";
import { createSearchController } from "./searchController";
import { createTerminalController } from "./terminalController";
import { createInspectionController } from "./inspectionController";
import { createSettingsController } from "./settingsController";
import { createWorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

export function createWorkspace() {
  const state = createWorkspaceState();
  // Controllers capture this port, but only call it after every feature is wired.
  const actions = {} as WorkspaceActions;
  state.activity.configureReveal(() => {
    if (!state.terminal.consoleFocused && (state.settings.appSettings.operationResult.notificationDisplay ?? "details") === "details") {
      state.activity.view = "activity";
      state.terminal.consoleVisible = true;
    }
  });
  const features = {
    ...createActivityController(state, actions),
    ...createMessagesController(state),
    ...createLocationsController(state, actions),
    ...createNavigationController(state, actions),
    ...createDirectoryController(state, actions),
    ...createPanesController(state),
    ...createKeyboardController(state, actions),
    ...createViewerController(state, actions),
    ...createOperationsController(state, actions),
    ...createCommandsController(state, actions),
    ...createSearchController(state, actions),
    ...createTerminalController(state, actions),
    ...createInspectionController(state, actions),
    ...createSettingsController(state, actions),
  } satisfies WorkspaceActions;
  Object.assign(actions, features);
  return { state, actions };
}
