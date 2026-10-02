import type { ExternalCommandDefinition } from "../types";

export function createCommandsState() {
  let commandDialogOpen = $state.raw(false);
  let externalCommands: ExternalCommandDefinition[] = $state.raw([]);
  let externalCommandCursorIndex = $state.raw(0);
  let externalCommandsLoading = $state.raw(false);
  let externalCommandError = $state.raw("");

  return {
    get commandDialogOpen() { return commandDialogOpen; },
    set commandDialogOpen(value) { commandDialogOpen = value; },
    get externalCommands() { return externalCommands; },
    set externalCommands(value: ExternalCommandDefinition[]) { externalCommands = value; },
    get externalCommandCursorIndex() { return externalCommandCursorIndex; },
    set externalCommandCursorIndex(value) { externalCommandCursorIndex = value; },
    get externalCommandsLoading() { return externalCommandsLoading; },
    set externalCommandsLoading(value) { externalCommandsLoading = value; },
    get externalCommandError() { return externalCommandError; },
    set externalCommandError(value) { externalCommandError = value; },
  };
}
