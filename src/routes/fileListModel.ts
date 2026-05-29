import type { FileEntry, PaneState, SortMode } from "./types";

export function quickFilterNeedle(pane: PaneState): string {
  return pane.quickFilterQuery.toLocaleLowerCase();
}

export function entryMatchesQuickFilter(pane: PaneState, entry: FileEntry): boolean {
  const needle = quickFilterNeedle(pane);
  return !needle || entry.name.toLocaleLowerCase().includes(needle);
}

export function entryVisibleBecauseSelected(pane: PaneState, entry: FileEntry): boolean {
  return Boolean(quickFilterNeedle(pane)) && pane.selectedKeys.has(entry.key) && !entryMatchesQuickFilter(pane, entry);
}

export function entryVisibleByHiddenSetting(pane: PaneState, entry: FileEntry): boolean {
  return pane.showHiddenFiles || !entry.hidden || pane.selectedKeys.has(entry.key);
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left - right;
}

export function compareEntries(left: FileEntry, right: FileEntry, sortMode: SortMode): number {
  if (left.kind === "directory" && right.kind !== "directory") return -1;
  if (left.kind !== "directory" && right.kind === "directory") return 1;

  if (sortMode === "modified") {
    const result = compareNullableNumber(left.modifiedAt, right.modifiedAt);
    if (result !== 0) return result;
  } else if (sortMode === "size") {
    const result = compareNullableNumber(left.size, right.size);
    if (result !== 0) return result;
  } else if (sortMode === "kind") {
    const result = left.kind.localeCompare(right.kind);
    if (result !== 0) return result;
  }

  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
}

export function sortedEntries(entries: FileEntry[], sortMode: SortMode): FileEntry[] {
  return [...entries].sort((left, right) => compareEntries(left, right, sortMode));
}

export function visibleEntriesFor(
  entries: FileEntry[],
  selectedKeys: Set<string>,
  quickFilterQuery: string,
  showHiddenFiles: boolean,
  sortMode: SortMode,
): FileEntry[] {
  const needle = quickFilterQuery.toLocaleLowerCase();
  const filtered = entries.filter((entry) => {
    if (!showHiddenFiles && entry.hidden && !selectedKeys.has(entry.key)) return false;
    return !needle || entry.name.toLocaleLowerCase().includes(needle) || selectedKeys.has(entry.key);
  });

  return sortedEntries(filtered, sortMode);
}

export function filteredCursorPatch(
  pane: PaneState,
  entries: FileEntry[],
  preferredKey: string | null = pane.cursorKey,
  preferredIndex = pane.cursorIndex,
): Pick<PaneState, "cursorKey" | "cursorIndex"> {
  if (entries.length === 0) return { cursorKey: null, cursorIndex: -1 };

  const keyIndex = preferredKey ? entries.findIndex((entry) => entry.key === preferredKey) : -1;
  const cursorIndex = keyIndex >= 0 ? keyIndex : Math.min(Math.max(preferredIndex, 0), entries.length - 1);
  return {
    cursorKey: entries[cursorIndex].key,
    cursorIndex,
  };
}
