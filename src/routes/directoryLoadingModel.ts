import type { FileEntry, PaneId, PaneSource, PaneState } from "./types";
import { invokeErrorMessage } from "./tauriInvoke";

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

function cursorKeyMatches(entry: FileEntry, preferredCursorKey: string): boolean {
  const normalizedPreferred = preferredCursorKey.replace(/[\\/]+$/, "");
  return [entry.key, entry.path].some((value) => (
    value === preferredCursorKey || value.replace(/[\\/]+$/, "") === normalizedPreferred
  ));
}

export function loadedEntriesPatch(
  source: PaneSource,
  currentPath: string,
  entries: FileEntry[],
  preferredCursorKey: string | null = null,
  cursorEntries: FileEntry[] = entries,
): Partial<PaneState> {
  const preferredIndex = preferredCursorKey
    ? cursorEntries.findIndex((entry) => cursorKeyMatches(entry, preferredCursorKey))
    : -1;
  const cursorIndex = preferredIndex >= 0 ? preferredIndex : cursorEntries.length > 0 ? 0 : -1;
  return {
    source,
    currentPath,
    entries,
    cursorKey: cursorIndex >= 0 ? cursorEntries[cursorIndex].key : null,
    cursorIndex,
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
    error: invokeErrorMessage(error),
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
