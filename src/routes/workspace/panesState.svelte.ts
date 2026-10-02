import { createPane } from "../paneModel";
import type { PaneId, PaneState, VisibleEntriesCache } from "../types";

export function createPanesState() {
  let activePaneId: PaneId = $state.raw("left");
  let loadGenerations: Record<PaneId, number> = $state.raw({ left: 0, right: 0 });
  let listElements: Record<PaneId, HTMLElement | null> = $state({
    left: null,
    right: null,
  });
  let paneScrollTops: Record<PaneId, number> = $state.raw({
    left: 0,
    right: 0,
  });
  let visibleEntriesCache: Partial<Record<PaneId, VisibleEntriesCache>> = {};
  let filterInputElements: Record<PaneId, HTMLInputElement | null> = $state.raw({
    left: null,
    right: null,
  });
  let panes: Record<PaneId, PaneState> = $state.raw({
    left: createPane("left", "左ペイン"),
    right: createPane("right", "右ペイン"),
  });

  return {
    get activePaneId() { return activePaneId; },
    set activePaneId(value: PaneId) { activePaneId = value; },
    get loadGenerations() { return loadGenerations; },
    set loadGenerations(value: Record<PaneId, number>) { loadGenerations = value; },
    get listElements() { return listElements; },
    set listElements(value: Record<PaneId, HTMLElement | null>) { listElements = value; },
    get paneScrollTops() { return paneScrollTops; },
    set paneScrollTops(value: Record<PaneId, number>) { paneScrollTops = value; },
    get visibleEntriesCache() { return visibleEntriesCache; },
    set visibleEntriesCache(value: Partial<Record<PaneId, VisibleEntriesCache>>) { visibleEntriesCache = value; },
    get filterInputElements() { return filterInputElements; },
    set filterInputElements(value: Record<PaneId, HTMLInputElement | null>) { filterInputElements = value; },
    get panes() { return panes; },
    set panes(value: Record<PaneId, PaneState>) { panes = value; },
  };
}
