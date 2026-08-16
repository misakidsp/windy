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

assert.equal(viewerPageSizeForHeight(360), 14);
assert.equal(viewerPageSizeForHeight(800), 36);
assert.equal(viewerPageSizeForHeight(600), 26);

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
