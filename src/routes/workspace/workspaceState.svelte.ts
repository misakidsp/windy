import { createActivityState } from "./activityState.svelte";
import { createSettingsState } from "./settingsState.svelte";
import { createAppState } from "./appState.svelte";
import { createOperationsState } from "./operationsState.svelte";
import { createInspectionState } from "./inspectionState.svelte";
import { createSearchState } from "./searchState.svelte";
import { createLocationsState } from "./locationsState.svelte";
import { createViewerState } from "./viewerState.svelte";
import { createTerminalState } from "./terminalState.svelte";
import { createCommandsState } from "./commandsState.svelte";
import { createPanesState } from "./panesState.svelte";

// Each workspace owns its state; nothing is shared between page mounts.
export function createWorkspaceState() {
  const settings = createSettingsState();
  const activity = createActivityState();
  return {
    settings,
    activity,
    app: createAppState(() => settings.t, activity),
    operations: createOperationsState(),
    inspection: createInspectionState(),
    search: createSearchState(),
    locations: createLocationsState(),
    viewer: createViewerState(),
    terminal: createTerminalState(),
    commands: createCommandsState(),
    panes: createPanesState(),
  };
}

export type WorkspaceState = ReturnType<typeof createWorkspaceState>;
