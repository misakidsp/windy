import assert from "node:assert/strict";

import { handleViewerKey, viewerPageSizeForHeight } from "../src/routes/viewerActions";
import type { TextViewerState } from "../src/routes/types";

function textViewer(patch: Partial<TextViewerState> = {}): TextViewerState {
  return {
    kind: "text",
    path: "/tmp/example.txt",
    title: "example.txt",
    lines: ["alpha", "beta"],
    topLine: 0,
    encoding: "utf-8",
    truncated: false,
    searchQuery: "",
    searchMode: false,
    searchMessage: "",
    ...patch,
  };
}

assert.equal(viewerPageSizeForHeight(326, 20), 16);
assert.equal(viewerPageSizeForHeight(766, 20), 38);
assert.equal(viewerPageSizeForHeight(566, 20), 28);
assert.equal(viewerPageSizeForHeight(566, 30), 18);
assert.equal(viewerPageSizeForHeight(566, 22.5), 25);
assert.equal(viewerPageSizeForHeight(0, 20), 1);
assert.equal(viewerPageSizeForHeight(-8, 20), 1);
assert.equal(viewerPageSizeForHeight(566, 0), 1);
assert.equal(viewerPageSizeForHeight(566, NaN), 1);

const longViewer = textViewer({ lines: Array.from({ length: 100 }, (_, i) => String(i)) });
for (const lineHeight of [20, 30]) {
  const pageSize = viewerPageSizeForHeight(566, lineHeight);
  const down = handleViewerKey(longViewer, "PageDown", pageSize).viewer as TextViewerState;
  assert.equal(down.topLine, pageSize);
  const up = handleViewerKey(down, "PageUp", pageSize).viewer as TextViewerState;
  assert.equal(up.topLine, 0);
  const bottom = handleViewerKey(longViewer, "G", pageSize).viewer as TextViewerState;
  assert.equal(bottom.topLine, 100 - pageSize);
}

const entered = handleViewerKey(textViewer(), "/", 10).viewer as TextViewerState;
const typed = handleViewerKey(entered, "z", 10).viewer as TextViewerState;
const notFound = handleViewerKey(typed, "Enter", 10).viewer as TextViewerState;
assert.equal(notFound.searchMessage, "");
assert.equal(notFound.searchMessageId, "viewer.searchNotFound");
assert.deepEqual(notFound.searchMessageValues, { query: "z" });

const foundEntered = handleViewerKey(textViewer(), "/", 10).viewer as TextViewerState;
const foundTyped = handleViewerKey(foundEntered, "b", 10).viewer as TextViewerState;
const found = handleViewerKey(foundTyped, "Enter", 10).viewer as TextViewerState;
assert.equal(found.searchMessage, "");
assert.equal(found.searchMessageId, "viewer.searchFound");
assert.deepEqual(found.searchMessageValues, { query: "b" });

const emptyEntered = handleViewerKey(textViewer(), "/", 10).viewer as TextViewerState;
const empty = handleViewerKey(emptyEntered, "Enter", 10).viewer as TextViewerState;
assert.equal(empty.searchMessageId, "viewer.searchEmpty");
