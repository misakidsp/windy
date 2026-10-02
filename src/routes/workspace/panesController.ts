import { tick } from "svelte";
import { defaultPageSize, moveCursorAfterSelection, virtualListOverscan } from "../constants";
import { fileRowHeightSetting } from "../appearanceModel";
import { filteredCursorPatch, visibleEntriesFor } from "../fileListModel";
import { focusedEntryPath } from "../displayModel";
import type { FileEntry, PaneId, PaneState, SortMode, VirtualEntryWindow } from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";


export function createPanesController(state: Pick<WorkspaceState, "app" | "panes" | "settings">) {
  function updatePane(paneId: PaneId, patch: Partial<PaneState>): void {
    const previous = state.panes.panes[paneId];
    const selectedKeys = patch.selectedKeys ? new Set(patch.selectedKeys) : new Set(previous.selectedKeys);

    state.panes.panes = {
      ...state.panes.panes,
      [paneId]: {
        ...previous,
        ...patch,
        selectedKeys,
      },
    };
  }

  function registerList(node: HTMLElement, initialPaneId: PaneId) {
    let paneId = initialPaneId;
    state.panes.listElements[paneId] = node;

    return {
      update(nextPaneId: PaneId) {
        if (state.panes.listElements[paneId] === node) state.panes.listElements[paneId] = null;
        paneId = nextPaneId;
        state.panes.listElements[paneId] = node;
      },
      destroy() {
        if (state.panes.listElements[paneId] === node) state.panes.listElements[paneId] = null;
      },
    };
  }

  function registerFilterInput(node: HTMLInputElement, paneId: PaneId) {
    state.panes.filterInputElements[paneId] = node;

    return {
      destroy() {
        if (state.panes.filterInputElements[paneId] === node) state.panes.filterInputElements[paneId] = null;
      },
    };
  }

  function queueCursorScroll(paneId: PaneId): void {
    void tick().then(() => {
      scrollCursorIntoView(paneId);
    });
  }

  function scrollCursorIntoView(paneId: PaneId): void {
    const list = state.panes.listElements[paneId];
    const index = state.panes.panes[paneId].cursorIndex;
    if (!list || index < 0) return;

    const nextScrollTop = scrollTopForCursorIndex(paneId, index);
    list.scrollTop = nextScrollTop;
    state.panes.paneScrollTops = {
      ...state.panes.paneScrollTops,
      [paneId]: nextScrollTop,
    };
  }

  function scrollTopForCursorIndex(paneId: PaneId, index: number): number {
    const fileRowHeight = fileRowHeightSetting(state.settings.appearanceSettings);
    const viewportHeight = state.panes.listElements[paneId]?.clientHeight ?? defaultPageSize * fileRowHeight;
    const currentScrollTop = state.panes.paneScrollTops[paneId] ?? 0;
    const rowTop = index * fileRowHeight;
    const rowBottom = rowTop + fileRowHeight;
    const visibleBottom = currentScrollTop + viewportHeight;

    if (rowTop < currentScrollTop) return rowTop;
    if (rowBottom > visibleBottom) return Math.max(0, rowBottom - viewportHeight);
    return currentScrollTop;
  }

  function syncVirtualScrollToCursor(paneId: PaneId, index: number): void {
    if (index < 0) return;
    const nextScrollTop = scrollTopForCursorIndex(paneId, index);
    state.panes.listElements[paneId]?.scrollTo({ top: nextScrollTop });
    state.panes.paneScrollTops = {
      ...state.panes.paneScrollTops,
      [paneId]: nextScrollTop,
    };
  }

  function handleFileListScroll(paneId: PaneId): void {
    state.panes.paneScrollTops = {
      ...state.panes.paneScrollTops,
      [paneId]: state.panes.listElements[paneId]?.scrollTop ?? 0,
    };
  }

  function visibleEntries(pane: PaneState): FileEntry[] {
    const cached = state.panes.visibleEntriesCache[pane.id];
    if (
      cached &&
      cached.entriesRef === pane.entries &&
      cached.selectedKeysRef === pane.selectedKeys &&
      cached.quickFilterQuery === pane.quickFilterQuery &&
      cached.showHiddenFiles === pane.showHiddenFiles &&
      cached.sortMode === pane.sortMode
    ) {
      return cached.result;
    }

    const result = visibleEntriesFor(pane.entries, pane.selectedKeys, pane.quickFilterQuery, pane.showHiddenFiles, pane.sortMode);
    state.panes.visibleEntriesCache[pane.id] = {
      entriesRef: pane.entries,
      selectedKeysRef: pane.selectedKeys,
      quickFilterQuery: pane.quickFilterQuery,
      showHiddenFiles: pane.showHiddenFiles,
      sortMode: pane.sortMode,
      result,
    };
    return result;
  }

  function visibleLoadedEntries(paneId: PaneId, entries: FileEntry[]): FileEntry[] {
    const pane = state.panes.panes[paneId];
    return visibleEntriesFor(entries, new Set(), "", pane.showHiddenFiles, pane.sortMode);
  }

  function virtualEntryWindow(paneId: PaneId, entries: FileEntry[]): VirtualEntryWindow {
    const list = state.panes.listElements[paneId];
    const fileRowHeight = fileRowHeightSetting(state.settings.appearanceSettings);
    const viewportHeight = list?.clientHeight ?? defaultPageSize * fileRowHeight;
    const scrollTop = state.panes.paneScrollTops[paneId] ?? 0;
    const firstVisible = Math.floor(scrollTop / fileRowHeight);
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / fileRowHeight));
    const start = Math.max(0, firstVisible - virtualListOverscan);
    const end = Math.min(entries.length, firstVisible + visibleCount + virtualListOverscan);

    return {
      start,
      end,
      topPadding: start * fileRowHeight,
      bottomPadding: Math.max(0, (entries.length - end) * fileRowHeight),
      entries: entries.slice(start, end),
    };
  }

  function enterQuickFilterInput(paneId: PaneId): void {
    updatePane(paneId, { quickFilterInputActive: true });
    state.app.lastCommandId = "filter.startInline";
    void tick().then(() => {
      state.panes.filterInputElements[paneId]?.focus();
      state.panes.filterInputElements[paneId]?.select();
    });
  }

  function leaveQuickFilterInput(paneId: PaneId): void {
    updatePane(paneId, { quickFilterInputActive: false });
    state.app.lastCommandId = "filter.acceptInline";
    focusActivePaneAfterDialog();
  }

  function clearQuickFilter(paneId: PaneId): void {
    const pane = state.panes.panes[paneId];
    const entries = visibleEntriesFor(pane.entries, pane.selectedKeys, "", pane.showHiddenFiles, pane.sortMode);
    updatePane(paneId, {
      quickFilterQuery: "",
      quickFilterInputActive: false,
      ...filteredCursorPatch(pane, entries),
    });
    state.app.lastCommandId = "filter.cancelInline";
    focusActivePaneAfterDialog();
  }

  function updateQuickFilterQuery(paneId: PaneId, query: string): void {
    const pane = state.panes.panes[paneId];
    const entries = visibleEntriesFor(pane.entries, pane.selectedKeys, query, pane.showHiddenFiles, pane.sortMode);
    updatePane(paneId, {
      quickFilterQuery: query,
      ...filteredCursorPatch(pane, entries),
    });
    state.app.lastCommandId = "filter.updateInlineQuery";
    queueCursorScroll(paneId);
  }

  function handleQuickFilterInputKeydown(event: KeyboardEvent, paneId: PaneId): void {
    if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      leaveQuickFilterInput(paneId);
    } else if (event.key === "Escape") {
      event.preventDefault();
      clearQuickFilter(paneId);
    }
  }

  function moveCursor(delta: number): void {
    const pane = state.panes.panes[state.panes.activePaneId];
    if (delta < 0 && pane.cursorIndex <= 0) {
      enterQuickFilterInput(state.panes.activePaneId);
      return;
    }
    const entries = visibleEntries(pane);
    if (entries.length === 0) return;

    const currentIndex = pane.cursorIndex;
    const nextIndex = Math.min(Math.max((currentIndex < 0 ? 0 : currentIndex) + delta, 0), entries.length - 1);
    updatePane(state.panes.activePaneId, {
      cursorKey: entries[nextIndex].key,
      cursorIndex: nextIndex,
    });
    syncVirtualScrollToCursor(state.panes.activePaneId, nextIndex);
    queueCursorScroll(state.panes.activePaneId);
    state.app.lastCommandId = delta < 0 ? "cursor.moveUp" : "cursor.moveDown";
  }

  function moveCursorTo(index: number, commandId: string): void {
    const pane = state.panes.panes[state.panes.activePaneId];
    const entries = visibleEntries(pane);
    if (entries.length === 0) return;

    const nextIndex = Math.min(Math.max(index, 0), entries.length - 1);
    updatePane(state.panes.activePaneId, {
      cursorKey: entries[nextIndex].key,
      cursorIndex: nextIndex,
    });
    syncVirtualScrollToCursor(state.panes.activePaneId, nextIndex);
    queueCursorScroll(state.panes.activePaneId);
    state.app.lastCommandId = commandId;
  }

  function moveCursorByPage(direction: -1 | 1): void {
    const pane = state.panes.panes[state.panes.activePaneId];
    const pageSize = visiblePageSize(state.panes.activePaneId);
    moveCursorTo(pane.cursorIndex + pageSize * direction, direction < 0 ? "cursor.pageUp" : "cursor.pageDown");
  }

  function visiblePageSize(paneId: PaneId): number {
    const list = state.panes.listElements[paneId];
    if (!list) return defaultPageSize;

    const fileRowHeight = fileRowHeightSetting(state.settings.appearanceSettings);
    return Math.max(1, Math.floor(list.clientHeight / fileRowHeight) - 1);
  }

  function toggleFocusedSelection(): void {
    const pane = state.panes.panes[state.panes.activePaneId];
    const key = pane.cursorKey;
    if (!key) return;

    const previousEntries = visibleEntries(pane);
    const currentIndex = pane.cursorIndex;
    const nextSelected = new Set(pane.selectedKeys);
    if (nextSelected.has(key)) {
      nextSelected.delete(key);
    } else {
      nextSelected.add(key);
    }

    const preferredKey =
      moveCursorAfterSelection && currentIndex >= 0 && currentIndex < previousEntries.length - 1
        ? previousEntries[currentIndex + 1].key
        : pane.cursorKey;
    const nextEntries = visibleEntriesFor(
      pane.entries,
      nextSelected,
      pane.quickFilterQuery,
      pane.showHiddenFiles,
      pane.sortMode,
    );

    updatePane(state.panes.activePaneId, {
      selectedKeys: nextSelected,
      ...filteredCursorPatch(pane, nextEntries, preferredKey, currentIndex),
    });
    queueCursorScroll(state.panes.activePaneId);
    state.app.lastCommandId = moveCursorAfterSelection ? "selection.toggleFocusedAndMoveDown" : "selection.toggleFocused";
  }

  function selectAllVisible(): void {
    const pane = state.panes.panes[state.panes.activePaneId];
    const entries = visibleEntries(pane);
    const allKeys = entries.map((entry) => entry.key);
    const allSelected = allKeys.length > 0 && allKeys.every((key) => pane.selectedKeys.has(key));

    updatePane(state.panes.activePaneId, {
      selectedKeys: allSelected ? new Set() : new Set(allKeys),
    });
    state.app.lastCommandId = allSelected ? "selection.clearAll" : "selection.selectAll";
  }

  function cycleSortMode(): void {
    const pane = state.panes.panes[state.panes.activePaneId];
    const modes: SortMode[] = ["name", "modified", "size", "kind"];
    const nextMode = modes[(modes.indexOf(pane.sortMode) + 1) % modes.length];
    const entries = visibleEntriesFor(
      pane.entries,
      pane.selectedKeys,
      pane.quickFilterQuery,
      pane.showHiddenFiles,
      nextMode,
    );

    updatePane(state.panes.activePaneId, {
      sortMode: nextMode,
      ...filteredCursorPatch(pane, entries),
    });
    queueCursorScroll(state.panes.activePaneId);
    state.app.lastCommandId = "view.sortCycle";
  }

  function toggleHiddenFiles(): void {
    const pane = state.panes.panes[state.panes.activePaneId];
    const showHiddenFiles = !pane.showHiddenFiles;
    const entries = visibleEntriesFor(
      pane.entries,
      pane.selectedKeys,
      pane.quickFilterQuery,
      showHiddenFiles,
      pane.sortMode,
    );

    updatePane(state.panes.activePaneId, {
      showHiddenFiles,
      ...filteredCursorPatch(pane, entries),
    });
    queueCursorScroll(state.panes.activePaneId);
    state.app.lastCommandId = "view.toggleHiddenFiles";
  }

  function extendSelection(delta: -1 | 1): void {
    const pane = state.panes.panes[state.panes.activePaneId];
    const entries = visibleEntries(pane);
    if (entries.length === 0) return;

    const currentIndex = pane.cursorIndex < 0 ? 0 : pane.cursorIndex;
    const nextIndex = Math.min(Math.max(currentIndex + delta, 0), entries.length - 1);
    const nextSelected = new Set(pane.selectedKeys);

    nextSelected.add(entries[currentIndex].key);
    nextSelected.add(entries[nextIndex].key);

    updatePane(state.panes.activePaneId, {
      cursorKey: entries[nextIndex].key,
      cursorIndex: nextIndex,
      selectedKeys: nextSelected,
    });
    queueCursorScroll(state.panes.activePaneId);
    state.app.lastCommandId = delta < 0 ? "selection.extendUp" : "selection.extendDown";
  }

  function focusActivePaneAfterDialog(): void {
    void tick().then(() => {
      scrollCursorIntoView(state.panes.activePaneId);
      state.app.appShellElement?.focus({ preventScroll: true });
    });
  }

  function activeFocusedEntryPath(): string {
    const pane = state.panes.panes[state.panes.activePaneId];
    return focusedEntryPath(pane, visibleEntries(pane));
  }

  return {
    updatePane,
    registerList,
    registerFilterInput,
    queueCursorScroll,
    scrollCursorIntoView,
    scrollTopForCursorIndex,
    syncVirtualScrollToCursor,
    handleFileListScroll,
    visibleEntries,
    visibleLoadedEntries,
    virtualEntryWindow,
    enterQuickFilterInput,
    leaveQuickFilterInput,
    clearQuickFilter,
    updateQuickFilterQuery,
    handleQuickFilterInputKeydown,
    moveCursor,
    moveCursorTo,
    moveCursorByPage,
    visiblePageSize,
    toggleFocusedSelection,
    selectAllVisible,
    cycleSortMode,
    toggleHiddenFiles,
    extendSelection,
    focusActivePaneAfterDialog,
    activeFocusedEntryPath,
  };
}
