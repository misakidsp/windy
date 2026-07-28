import type { EntryKind, FileEntry, PaneId, PaneState } from "./types";

export type DiffStatus =
  | "leftOnly"
  | "rightOnly"
  | "kindDifferent"
  | "sizeDifferent"
  | "modifiedDifferent"
  | "hashDifferent"
  | "readError"
  | "identical";

export type DetailedDiffSide = {
  kind: EntryKind;
  size: number | null;
  modifiedAt: number | null;
  md5: string | null;
  error: string | null;
};

export type DiffEntryPair = {
  name: string;
  relativePath: string;
  status: DiffStatus;
  left: FileEntry | DetailedDiffSide | null;
  right: FileEntry | DetailedDiffSide | null;
};

export type PaneDiffSnapshot = {
  leftLabel: string;
  rightLabel: string;
  leftRootPath: string;
  rightRootPath: string;
  mode: "summary" | "detailed";
  recursive: boolean;
  hashFiles: boolean;
  entries: DiffEntryPair[];
  counts: Record<DiffStatus, number>;
  highlightedKeys: Record<PaneId, Map<string, DiffStatus>>;
};

export type DetailedDiffEntry = {
  relativePath: string;
  name: string;
  status: DiffStatus;
  left: DetailedDiffSide | null;
  right: DetailedDiffSide | null;
};

export type DetailedDiffResult = {
  leftPath: string;
  rightPath: string;
  recursive: boolean;
  hashFiles: boolean;
  entries: DetailedDiffEntry[];
  counts: Record<DiffStatus, number>;
};

const statusOrder: Record<DiffStatus, number> = {
  leftOnly: 0,
  rightOnly: 1,
  kindDifferent: 2,
  sizeDifferent: 3,
  hashDifferent: 4,
  modifiedDifferent: 5,
  readError: 6,
  identical: 7,
};

export function comparePaneEntries(
  leftPane: PaneState,
  rightPane: PaneState,
  leftLabel: string,
  rightLabel: string,
): PaneDiffSnapshot {
  const leftByName = entriesByName(leftPane.entries);
  const rightByName = entriesByName(rightPane.entries);
  const names = [...new Set([...leftByName.keys(), ...rightByName.keys()])].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
  );

  const highlightedKeys: Record<PaneId, Map<string, DiffStatus>> = {
    left: new Map(),
    right: new Map(),
  };
  const entries = names.map((name) => {
    const left = leftByName.get(name) ?? null;
    const right = rightByName.get(name) ?? null;
    const status = diffStatusFor(left, right);
    if (left && status !== "identical") highlightedKeys.left.set(left.key, status);
    if (right && status !== "identical") highlightedKeys.right.set(right.key, status);
    return { name, relativePath: name, status, left, right };
  });

  return {
    leftLabel,
    rightLabel,
    leftRootPath: leftPane.currentPath,
    rightRootPath: rightPane.currentPath,
    mode: "summary",
    recursive: false,
    hashFiles: false,
    entries: entries.sort(compareDiffEntryPairs),
    counts: entries.reduce<Record<DiffStatus, number>>((counts, entry) => {
      counts[entry.status] += 1;
      return counts;
    }, emptyDiffCounts()),
    highlightedKeys,
  };
}

export function detailedDiffSnapshot(
  result: DetailedDiffResult,
  leftPane: PaneState,
  rightPane: PaneState,
  leftLabel: string,
  rightLabel: string,
): PaneDiffSnapshot {
  return {
    leftLabel,
    rightLabel,
    leftRootPath: result.leftPath,
    rightRootPath: result.rightPath,
    mode: "detailed",
    recursive: result.recursive,
    hashFiles: result.hashFiles,
    entries: result.entries
      .map((entry) => ({
        name: entry.relativePath,
        relativePath: entry.relativePath,
        status: entry.status,
        left: entry.left,
        right: entry.right,
      }))
      .sort(compareDiffEntryPairs),
    counts: result.counts,
    highlightedKeys: highlightedKeysForDetailedDiff(result.entries, leftPane, rightPane),
  };
}

export function diffEntriesForSide(snapshot: PaneDiffSnapshot, side: PaneId): FileEntry[] {
  return snapshot.entries
    .filter((entry) => entry.status !== "identical")
    .filter((entry) => (side === "left" ? entry.status !== "rightOnly" : entry.status !== "leftOnly"))
    .map((entry) => fileEntryForDiffSide(snapshot, entry, side))
    .filter((entry): entry is FileEntry => entry !== null);
}

function entriesByName(entries: FileEntry[]): Map<string, FileEntry> {
  const map = new Map<string, FileEntry>();
  for (const entry of entries) {
    if (!map.has(entry.name)) map.set(entry.name, entry);
  }
  return map;
}

function diffStatusFor(left: FileEntry | null, right: FileEntry | null): DiffStatus {
  if (!left) return "rightOnly";
  if (!right) return "leftOnly";
  if (left.kind !== right.kind) return "kindDifferent";
  if (left.size !== right.size) return "sizeDifferent";
  if (left.modifiedAt !== right.modifiedAt) return "modifiedDifferent";
  return "identical";
}

function fileEntryForDiffSide(snapshot: PaneDiffSnapshot, entry: DiffEntryPair, side: PaneId): FileEntry | null {
  const source = side === "left" ? entry.left : entry.right;
  if (!source) return null;
  if (isFileEntry(source)) return source;

  const rootPath = side === "left" ? snapshot.leftRootPath : snapshot.rightRootPath;
  const path = joinLocalPath(rootPath, entry.relativePath);
  return {
    key: path,
    name: entry.name.split("/").at(-1) ?? entry.name,
    path,
    kind: source.kind,
    size: source.size,
    modifiedAt: source.modifiedAt,
    hidden: entry.name.split("/").at(-1)?.startsWith(".") ?? false,
    readonly: false,
    mode: null,
  };
}

function isFileEntry(entry: FileEntry | DetailedDiffSide): entry is FileEntry {
  return "path" in entry;
}

function joinLocalPath(rootPath: string, relativePath: string): string {
  const separator = rootPath.includes("\\") ? "\\" : "/";
  return `${rootPath.replace(/[\\/]+$/, "")}${separator}${relativePath.split("/").join(separator)}`;
}

function compareDiffEntryPairs(left: DiffEntryPair, right: DiffEntryPair): number {
  const statusCompare = statusOrder[left.status] - statusOrder[right.status];
  if (statusCompare !== 0) return statusCompare;
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
}

function highlightedKeysForDetailedDiff(
  entries: DetailedDiffEntry[],
  leftPane: PaneState,
  rightPane: PaneState,
): Record<PaneId, Map<string, DiffStatus>> {
  const leftByName = entriesByName(leftPane.entries);
  const rightByName = entriesByName(rightPane.entries);
  const highlightedKeys: Record<PaneId, Map<string, DiffStatus>> = {
    left: new Map(),
    right: new Map(),
  };

  for (const entry of entries) {
    if (entry.status === "identical") continue;
    const topLevelName = entry.relativePath.split("/")[0];
    const left = leftByName.get(topLevelName);
    const right = rightByName.get(topLevelName);
    if (left) highlightedKeys.left.set(left.key, entry.status);
    if (right) highlightedKeys.right.set(right.key, entry.status);
  }

  return highlightedKeys;
}

function emptyDiffCounts(): Record<DiffStatus, number> {
  return {
    leftOnly: 0,
    rightOnly: 0,
    kindDifferent: 0,
    sizeDifferent: 0,
    modifiedDifferent: 0,
    hashDifferent: 0,
    readError: 0,
    identical: 0,
  };
}
