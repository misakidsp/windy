import { tick } from "svelte";
import { type LargeSearchResultDialogKeyAction, type SearchDialogKeyAction } from "../dialogKeyboardModel";
import {
  createEmptySearchForm,
  searchFormFromRequest,
  searchRequestFromForm,
  searchRequestFromSource,
  searchReturnPathForPane,
  searchRootPathForPane,
} from "../searchModel";
import type { SearchDialogForm, SearchDirectoryRequest } from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

type Dependencies = Pick<WorkspaceActions,
  | "applySearchListing"
  | "focusActivePaneAfterDialog"
  | "loadSearchDirectory"
  | "localizedBackendError"
  | "resetSftpCompositionState"
>;

export function createSearchController(state: Pick<WorkspaceState, "app" | "panes" | "search" | "settings" | "terminal">, actions: Dependencies) {
  function updateSearchForm(patch: Partial<SearchDialogForm>): void {
    state.search.searchForm = {
      ...state.search.searchForm,
      ...patch,
    };
  }

  function openSearchDialog(): void {
    const pane = state.panes.panes[state.panes.activePaneId];
    if (pane.source.kind === "sftp") {
      state.app.notify("search.sourceUnsupported", undefined, "warning", false);
      state.app.lastCommandId = "search.openUnsupportedSource";
      return;
    }

    const rootPath = searchRootPathForPane(pane);
    if (!rootPath) {
      state.app.notify("search.noRoot", undefined, "warning", false);
      state.app.lastCommandId = "search.openNoRoot";
      return;
    }

    state.search.searchForm =
      pane.source.kind === "search"
        ? searchFormFromRequest(searchRequestFromSource(pane.source))
        : { ...createEmptySearchForm(), rootPath };
    state.search.searchDialogOpen = true;
    state.search.searchRunning = false;
    state.search.searchError = "";
    state.app.lastCommandId = "search.openDialog";
    void tick().then(() => {
      state.search.searchRegexInputElement?.focus();
      state.search.searchRegexInputElement?.select();
    });
  }

  function closeSearchDialog(): void {
    state.search.searchDialogOpen = false;
    state.search.searchRunning = false;
    state.search.searchError = "";
    actions.resetSftpCompositionState();
    state.app.lastCommandId = "search.closeDialog";
    actions.focusActivePaneAfterDialog();
  }

  function cancelLargeSearchResult(): void {
    state.search.pendingLargeSearchResult = null;
    state.app.notify("search.largeCanceled", undefined, "completed", false);
    state.app.lastCommandId = "search.largeResultCancel";
    actions.focusActivePaneAfterDialog();
  }

  function confirmLargeSearchResult(): void {
    if (!state.search.pendingLargeSearchResult) return;
    const pending = state.search.pendingLargeSearchResult;
    state.search.pendingLargeSearchResult = null;
    actions.applySearchListing(pending.paneId, pending.listing, pending.request, pending.returnPath);
        state.app.statusMessage = pending.listing.truncated
          ? state.settings.t("search.truncated", { count: pending.listing.entries.length })
          : state.settings.t("search.completed", { count: pending.listing.entries.length });
    state.app.lastCommandId = "search.largeResultDisplay";
    actions.focusActivePaneAfterDialog();
  }

  async function runSearchFromDialog(): Promise<void> {
    if (state.search.searchRunning) return;
    if (!state.search.searchForm.rootPath.trim()) {
      state.search.searchError = state.settings.t("search.rootRequired");
      state.app.lastCommandId = "search.invalid";
      return;
    }

    let request: SearchDirectoryRequest;
    try {
      request = searchRequestFromForm(state.search.searchForm, state.settings.t);
    } catch (error) {
      state.search.searchError = actions.localizedBackendError(error);
      state.app.lastCommandId = "search.invalid";
      return;
    }

    state.search.searchRunning = true;
    state.search.searchError = "";
    state.app.lastCommandId = "search.run";
    try {
      const returnPath = searchReturnPathForPane(state.panes.panes[state.panes.activePaneId], state.terminal.consoleCwd);
      state.search.searchDialogOpen = false;
      const applied = await actions.loadSearchDirectory(state.panes.activePaneId, request, returnPath);
      if (applied) {
        const source = state.panes.panes[state.panes.activePaneId].source;
        state.app.statusMessage = source.kind === "search" && source.truncated
          ? state.settings.t("search.truncated", { count: state.panes.panes[state.panes.activePaneId].entries.length })
          : state.settings.t("search.completed", { count: state.panes.panes[state.panes.activePaneId].entries.length });
        state.app.lastCommandId = "search.resultSource";
      }
      actions.focusActivePaneAfterDialog();
    } catch (error) {
      state.search.searchError = actions.localizedBackendError(error);
      state.app.notify("search.failed", { error: actions.localizedBackendError(error) }, "failed", false);
      state.app.lastCommandId = "search.failed";
    } finally {
      state.search.searchRunning = false;
    }
  }

  function runLargeSearchResultDialogKeyAction(action: LargeSearchResultDialogKeyAction): void {
    if (action === "cancel") {
      cancelLargeSearchResult();
    } else if (action === "confirm") {
      confirmLargeSearchResult();
    }
  }

  async function runSearchDialogKeyAction(action: SearchDialogKeyAction): Promise<void> {
    if (action === "close") {
      closeSearchDialog();
    } else if (action === "run") {
      await runSearchFromDialog();
    }
  }

  return {
    updateSearchForm,
    openSearchDialog,
    closeSearchDialog,
    cancelLargeSearchResult,
    confirmLargeSearchResult,
    runSearchFromDialog,
    runLargeSearchResultDialogKeyAction,
    runSearchDialogKeyAction,
  };
}
