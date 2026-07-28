import assert from "node:assert/strict";

import { createDiffSource, createLocalSource, paneHeaderLabel } from "../src/routes/paneModel";
import type { FileEntry, PaneState } from "../src/routes/types";

const t = (id: string, values: Record<string, string | number> = {}) => {
  if (id === "diff.sourceSide.left") return "左";
  if (id === "diff.sourceCount") return `${values.count} 件`;
  if (id === "diff.sourceLabel") return `${values.side}差分: ${values.label} (${values.countLabel})`;
  if (id === "pane.source.localFallback") return "ローカル";
  if (id === "pane.header.local") return `ローカル: ${values.label}`;
  return id;
};

const entry: FileEntry = {
  key: "/work/a.txt",
  name: "a.txt",
  path: "/work/a.txt",
  kind: "file",
  size: 1,
  modifiedAt: null,
  readonly: false,
  hidden: false,
  mode: null,
};

const diffSource = createDiffSource("left", [entry], "local", "/work", "allChanged", t);
assert.equal(diffSource.displayName, "左差分: allChanged (1 件)");

const localPane: PaneState = {
  id: "left",
  title: "left",
  source: createLocalSource(""),
  currentPath: "",
  entries: [],
  cursorKey: null,
  cursorIndex: -1,
  selectedKeys: new Set(),
  quickFilterQuery: "",
  quickFilterInputActive: false,
  showHiddenFiles: false,
  sortMode: "name",
  loading: false,
  error: null,
};
assert.equal(paneHeaderLabel(localPane, t), "ローカル: ローカル");
