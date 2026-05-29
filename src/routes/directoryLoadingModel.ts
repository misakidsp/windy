import type { FileEntry, PaneId, PaneSource, PaneState } from "./types";

export function nextLoadGeneration(
  generations: Record<PaneId, number>,
  paneId: PaneId,
): { generations: Record<PaneId, number>; generation: number } {
  const generation = generations[paneId] + 1;
  return {
    generation,
    generations: {
      ...generations,
      [paneId]: generation,
    },
  };
}

export function isStaleLoad(generations: Record<PaneId, number>, paneId: PaneId, generation: number): boolean {
  return generation !== generations[paneId];
}

export function loadedEntriesPatch(source: PaneSource, currentPath: string, entries: FileEntry[]): Partial<PaneState> {
  return {
    source,
    currentPath,
    entries,
    cursorKey: entries[0]?.key ?? null,
    cursorIndex: entries.length > 0 ? 0 : -1,
    selectedKeys: new Set(),
    quickFilterQuery: "",
    quickFilterInputActive: false,
    loading: false,
    error: null,
  };
}

export function failedEntriesPatch(source: PaneSource, currentPath: string, error: unknown): Partial<PaneState> {
  return {
    loading: false,
    error: String(error),
    source,
    currentPath,
    entries: [],
    cursorKey: null,
    cursorIndex: -1,
    selectedKeys: new Set(),
    quickFilterQuery: "",
    quickFilterInputActive: false,
  };
}
