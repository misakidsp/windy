import assert from "node:assert/strict";
import {
  createEmptySearchForm,
  parseOptionalDate,
  parseOptionalSizeBytes,
  searchFormFromRequest,
  searchProfileMatchesSource,
  searchProfileNameFromSource,
  searchRequestFromForm,
  searchRequestFromProfile,
  searchRequestFromSource,
  searchReturnPathForPane,
  searchRootPathForPane,
} from "../src/routes/searchModel";
import type { PaneState, SearchPaneSource, SearchProfile } from "../src/routes/types";

function pane(partial: Partial<PaneState>): PaneState {
  return {
    id: partial.id ?? "left",
    title: partial.title ?? "left",
    source: partial.source ?? { kind: "local", location: "/work", displayName: "/work" },
    currentPath: partial.currentPath ?? "/work",
    entries: partial.entries ?? [],
    cursorKey: partial.cursorKey ?? null,
    cursorIndex: partial.cursorIndex ?? -1,
    selectedKeys: partial.selectedKeys ?? new Set(),
    quickFilterQuery: partial.quickFilterQuery ?? "",
    quickFilterInputActive: partial.quickFilterInputActive ?? false,
    showHiddenFiles: partial.showHiddenFiles ?? false,
    sortMode: partial.sortMode ?? "name",
    loading: partial.loading ?? false,
    error: partial.error ?? null,
  };
}

const emptyForm = createEmptySearchForm();
assert.equal(emptyForm.kind, "all");
assert.equal(emptyForm.hiddenMode, "exclude");
assert.equal(emptyForm.readonlyMode, "any");

assert.equal(parseOptionalSizeBytes("size", ""), null);
assert.equal(parseOptionalSizeBytes("size", "2k"), 2048);
assert.equal(parseOptionalSizeBytes("size", "3M"), 3 * 1024 * 1024);
assert.equal(parseOptionalSizeBytes("size", "4g"), 4 * 1024 ** 3);
assert.equal(parseOptionalSizeBytes("size", "1T"), 1024 ** 4);
assert.throws(() => parseOptionalSizeBytes("size", "1.5m"), /non-negative/);

const dayStart = Math.floor(new Date("2026-05-23T00:00:00").getTime() / 1000);
const dayEnd = Math.floor(new Date("2026-05-23T23:59:59").getTime() / 1000);
assert.equal(parseOptionalDate("modified after", "20260523", false), dayStart);
assert.equal(parseOptionalDate("modified before", "20260523", true), dayEnd);
assert.throws(() => parseOptionalDate("modified after", "2026-05-23", false), /YYYYMMDD/);

const request = searchRequestFromForm({
  ...emptyForm,
  rootPath: " /tmp/search ",
  nameRegex: " .*\\.txt ",
  recursive: true,
  minSizeBytes: "1k",
  maxSizeBytes: "2k",
  modifiedAfter: "20260523",
  modifiedBefore: "20260524",
  kind: "file",
  hiddenMode: "include",
  readonlyMode: "writable",
});
assert.deepEqual(request, {
  rootPath: "/tmp/search",
  nameRegex: ".*\\.txt",
  recursive: true,
  minSizeBytes: 1024,
  maxSizeBytes: 2048,
  modifiedAfter: dayStart,
  modifiedBefore: Math.floor(new Date("2026-05-24T23:59:59").getTime() / 1000),
  kind: "file",
  hiddenMode: "include",
  readonlyMode: "writable",
});
assert.throws(() => searchRequestFromForm({ ...emptyForm, minSizeBytes: "2k", maxSizeBytes: "1k" }), /min size/);
assert.throws(
  () => searchRequestFromForm({ ...emptyForm, modifiedAfter: "20260524", modifiedBefore: "20260523" }),
  /modified after/,
);

assert.deepEqual(searchFormFromRequest(request), {
  rootPath: "/tmp/search",
  nameRegex: ".*\\.txt",
  recursive: true,
  minSizeBytes: "1024",
  maxSizeBytes: "2048",
  modifiedAfter: "20260523",
  modifiedBefore: "20260524",
  kind: "file",
  hiddenMode: "include",
  readonlyMode: "writable",
});

const source: SearchPaneSource = {
  kind: "search",
  location: "search:/tmp/search",
  displayName: "search",
  rootPath: "/tmp/search",
  returnPath: "/tmp",
  nameRegex: ".*\\.txt",
  recursive: true,
  minSizeBytes: 1024,
  maxSizeBytes: 2048,
  modifiedAfter: dayStart,
  modifiedBefore: dayEnd,
  searchKind: "file",
  hiddenMode: "only",
  readonlyMode: "readonly",
  truncated: false,
};
assert.deepEqual(searchRequestFromSource(source), {
  rootPath: "/tmp/search",
  nameRegex: ".*\\.txt",
  recursive: true,
  minSizeBytes: 1024,
  maxSizeBytes: 2048,
  modifiedAfter: dayStart,
  modifiedBefore: dayEnd,
  kind: "file",
  hiddenMode: "only",
  readonlyMode: "readonly",
});

const profile: SearchProfile = {
  id: "search-1",
  name: "profile",
  rootPath: "/tmp/search",
  nameRegex: ".*\\.txt",
  recursive: true,
  minSizeBytes: 1024,
  maxSizeBytes: 2048,
  modifiedAfter: dayStart,
  modifiedBefore: dayEnd,
  kind: null,
  hiddenMode: null,
  readonlyMode: null,
};
assert.equal(searchRequestFromProfile(profile).kind, "all");
assert.equal(searchRequestFromProfile(profile).hiddenMode, "exclude");
assert.equal(searchRequestFromProfile(profile).readonlyMode, "any");
assert.equal(searchProfileMatchesSource({ ...profile, kind: "file", hiddenMode: "only", readonlyMode: "readonly" }, source), true);
assert.equal(searchProfileNameFromSource(source), "search .*\\.txt");

assert.equal(searchRootPathForPane(pane({ currentPath: "/work" })), "/work");
assert.equal(
  searchRootPathForPane(
    pane({ source: { kind: "archive", location: "archive", displayName: "archive", archivePath: "/tmp/a.zip", innerPath: "" } }),
  ),
  "/tmp",
);
assert.equal(searchRootPathForPane(pane({ source: { kind: "sftp", location: "sftp", displayName: "remote", connectionId: "s1", remotePath: "/", returnPath: "/home" } })), null);
assert.equal(searchReturnPathForPane(pane({ source }), "/fallback"), "/tmp");
