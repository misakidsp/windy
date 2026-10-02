import { createEmptySearchForm } from "../searchModel";
import type { PendingLargeSearchResult, SearchDialogForm } from "../types";

export function createSearchState() {
  let searchDialogOpen = $state.raw(false);
  let searchRunning = $state.raw(false);
  let searchError = $state.raw("");
  let searchRegexInputElement: HTMLInputElement | null = $state.raw(null);
  let searchForm: SearchDialogForm = $state.raw(createEmptySearchForm());
  let pendingLargeSearchResult: PendingLargeSearchResult | null = $state.raw(null);

  return {
    get searchDialogOpen() { return searchDialogOpen; },
    set searchDialogOpen(value) { searchDialogOpen = value; },
    get searchRunning() { return searchRunning; },
    set searchRunning(value) { searchRunning = value; },
    get searchError() { return searchError; },
    set searchError(value) { searchError = value; },
    get searchRegexInputElement() { return searchRegexInputElement; },
    set searchRegexInputElement(value: HTMLInputElement | null) { searchRegexInputElement = value; },
    get searchForm() { return searchForm; },
    set searchForm(value: SearchDialogForm) { searchForm = value; },
    get pendingLargeSearchResult() { return pendingLargeSearchResult; },
    set pendingLargeSearchResult(value: PendingLargeSearchResult | null) { pendingLargeSearchResult = value; },
  };
}
