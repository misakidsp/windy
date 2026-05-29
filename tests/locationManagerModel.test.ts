import assert from "node:assert/strict";
import { buildLocationOptions } from "../src/routes/locationManagerModel";
import type { PaneState } from "../src/routes/types";

function pane(path: string): PaneState {
  return {
    id: "left",
    title: "left",
    source: { kind: "local", location: path, displayName: path },
    currentPath: path,
    entries: [],
    cursorKey: null,
    cursorIndex: 0,
    selectedKeys: new Set(),
    quickFilterQuery: "",
    quickFilterInputActive: false,
    showHiddenFiles: false,
    sortMode: "name",
    loading: false,
    error: null,
  };
}

const unixOptions = buildLocationOptions({
  activePane: pane("/work"),
  homePath: "/home/windy",
  localRoots: ["/"],
  localFavorites: [],
  searchProfiles: [],
  activeSftpSessions: [],
  sftpProfiles: [],
});
assert.deepEqual(unixOptions.slice(0, 3).map((option) => [option.label, option.path ?? ""]), [
  ["<Local>", ""],
  ["<Root>", "/"],
  ["<Home>", "/home/windy"],
]);

const windowsOptions = buildLocationOptions({
  activePane: pane("C:\\Users\\windy"),
  homePath: "C:\\Users\\windy",
  localRoots: ["C:\\", "D:\\"],
  localFavorites: [],
  searchProfiles: [],
  activeSftpSessions: [],
  sftpProfiles: [],
});
assert.deepEqual(windowsOptions.slice(0, 4).map((option) => [option.label, option.path ?? ""]), [
  ["<Local>", ""],
  ["<C:>", "C:\\"],
  ["<D:>", "D:\\"],
  ["<Home>", "C:\\Users\\windy"],
]);
