import { translateMessage, type Translate } from "./localization";
import type { EntryKind, FileEntry, PaneId, PaneSourceKind, PaneState } from "./types";

const fallbackTranslate: Translate = (id, values) => translateMessage(undefined, id, values);

export type FilePropertyItem = {
  key: string;
  name: string;
  path: string;
  kind: EntryKind;
  size: number | null;
  modifiedAt: number | null;
  hidden: boolean;
  readonly: boolean;
  mode: number | null;
};

export type FilePropertySnapshot = {
  paneId: PaneId;
  sourceKind: PaneSourceKind;
  sourceLabel: string;
  items: FilePropertyItem[];
  totalCount: number;
  knownSizeBytes: number;
  unknownSizeCount: number;
  kindCounts: Record<EntryKind, number>;
};

export function propertyEntriesForPane(pane: PaneState, visibleEntries: FileEntry[]): FileEntry[] {
  if (pane.selectedKeys.size > 0) {
    return pane.entries.filter((entry) => pane.selectedKeys.has(entry.key));
  }

  const focused = visibleEntries[pane.cursorIndex];
  return focused ? [focused] : [];
}

export function createFilePropertySnapshot(
  pane: PaneState,
  visibleEntries: FileEntry[],
  sourceLabel: string,
): FilePropertySnapshot | null {
  const entries = propertyEntriesForPane(pane, visibleEntries);
  if (entries.length === 0) return null;

  const items = entries.map((entry) => ({
    key: entry.key,
    name: entry.name,
    path: entry.path,
    kind: entry.kind,
    size: entry.size,
    modifiedAt: entry.modifiedAt,
    hidden: entry.hidden,
    readonly: entry.readonly,
    mode: entry.mode,
  }));

  return {
    paneId: pane.id,
    sourceKind: pane.source.kind,
    sourceLabel,
    items,
    totalCount: items.length,
    knownSizeBytes: items.reduce((total, item) => total + (item.size ?? 0), 0),
    unknownSizeCount: items.filter((item) => item.size === null).length,
    kindCounts: items.reduce<Record<EntryKind, number>>(
      (counts, item) => {
        counts[item.kind] += 1;
        return counts;
      },
      { file: 0, directory: 0, symlink: 0, other: 0 },
    ),
  };
}

export function formatPropertyMode(mode: number | null): string {
  if (mode === null) return "-";
  return (mode & 0o777).toString(8).padStart(3, "0");
}

export function formatPropertyBoolean(value: boolean, t: Translate = fallbackTranslate): string {
  return value ? t("common.yes") : t("common.no");
}

export function formatPropertyEntryKind(kind: EntryKind, t: Translate = fallbackTranslate): string {
  return t(`properties.kind.${kind}`);
}

export function formatPropertySourceKind(kind: PaneSourceKind, t: Translate = fallbackTranslate): string {
  return t(`properties.sourceKind.${kind}`);
}
