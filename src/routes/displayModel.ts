import { entryVisibleBecauseSelected, entryVisibleByHiddenSetting, quickFilterNeedle } from "./fileListModel";
import type { FileEntry, PaneState } from "./types";

export function formatSize(entry: FileEntry): string {
  if (entry.kind === "directory") return "<DIR>";
  return formatByteCount(entry.size);
}

export function formatByteCount(size: number | null): string {
  if (size === null) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size < 1024 * 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${(size / 1024 / 1024 / 1024 / 1024).toFixed(1)} TB`;
}

export function formatDate(seconds: number | null): string {
  if (seconds === null) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(seconds * 1000));
}

export function quickFilterMatchCount(pane: PaneState): number {
  const needle = quickFilterNeedle(pane);
  const entries = pane.entries.filter((entry) => entryVisibleByHiddenSetting(pane, entry));
  if (!needle) return entries.length;
  return entries.filter((entry) => entry.name.toLocaleLowerCase().includes(needle)).length;
}

export function selectedKeptByFilterCount(pane: PaneState, visibleEntries: FileEntry[]): number {
  return visibleEntries.filter((entry) => entryVisibleBecauseSelected(pane, entry)).length;
}

export function paneMeta(pane: PaneState, visibleEntries: FileEntry[]): string {
  const visibleCount = visibleEntries.length;
  const hiddenLabel = pane.showHiddenFiles ? " / hidden:on" : "";
  const sortLabel = ` / sort:${pane.sortMode}`;
  if (!pane.quickFilterQuery) {
    return `${visibleCount}/${pane.entries.length} items / ${pane.selectedKeys.size} selected${sortLabel}${hiddenLabel}`;
  }

  const keptSelected = selectedKeptByFilterCount(pane, visibleEntries);
  const keptLabel = keptSelected > 0 ? ` / ${keptSelected} kept` : "";
  return `${visibleCount} shown / ${quickFilterMatchCount(pane)} matched / ${pane.entries.length} items / ${pane.selectedKeys.size} selected${keptLabel}${sortLabel}${hiddenLabel}`;
}

export function focusedEntryPath(pane: PaneState, visibleEntries: FileEntry[]): string {
  const entry = visibleEntries[pane.cursorIndex];
  return entry?.path ?? pane.currentPath ?? "";
}

export function entryClass(pane: PaneState, entry: FileEntry): string {
  const classes = [];
  if (pane.cursorKey === entry.key) classes.push("cursor");
  if (pane.selectedKeys.has(entry.key)) classes.push("selected");
  if (entryVisibleBecauseSelected(pane, entry)) classes.push("filter-kept");
  if (entry.hidden) classes.push("hidden");
  if (entry.kind === "directory") classes.push("directory");
  return classes.join(" ");
}

export function fileNameExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) return "";
  return name.slice(lastDot).toLocaleLowerCase();
}

export function entryExtensionColor(pane: PaneState, entry: FileEntry, extensionColors: Record<string, string>): string | null {
  if (entry.kind !== "file") return null;
  if (pane.cursorKey === entry.key) return null;
  if (pane.selectedKeys.has(entry.key)) return null;
  if (entry.hidden) return null;
  if (entryVisibleBecauseSelected(pane, entry)) return null;
  return extensionColors[fileNameExtension(entry.name)] ?? null;
}
