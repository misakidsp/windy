import assert from "node:assert/strict";
import {
  focusedLocationOption,
  locationSelectionAction,
  locationSelectionRequiresLeavingSftp,
} from "../src/routes/locationSelectionModel";
import type { ActiveSftpSession, LocationOption, PaneState, SearchProfile, SftpConnectionProfile } from "../src/routes/types";

function pane(source: PaneState["source"]): PaneState {
  return {
    id: "left",
    title: "left",
    source,
    currentPath: source.kind === "local" ? source.location : "",
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
}

const localPane = pane({ kind: "local", location: "/work", displayName: "/work" });
const sftpPane = pane({
  kind: "sftp",
  location: "sftp://conn-1/srv",
  displayName: "remote",
  connectionId: "conn-1",
  remotePath: "/srv",
  returnPath: "/work",
});
const profile: SftpConnectionProfile = {
  id: "sftp-profile-1",
  name: "dev",
  host: "example.test",
  port: 22,
  username: "windy",
  remotePath: "/srv",
  authKind: "password",
  privateKeyPath: null,
};
const searchProfile: SearchProfile = {
  id: "search-1",
  name: "Rust",
  rootPath: "/work",
  nameRegex: ".*\\.rs",
  recursive: true,
  minSizeBytes: null,
  maxSizeBytes: null,
  modifiedAfter: null,
  modifiedBefore: null,
  kind: "file",
  hiddenMode: "exclude",
  readonlyMode: "any",
};
const activeSession: ActiveSftpSession = {
  connectionId: "conn-2",
  displayName: "remote",
  remotePath: "/home",
  createdAt: 1,
  lastUsedAt: 2,
};

assert.deepEqual(locationSelectionAction({ kind: "newSftp", label: "new", detail: "" }, localPane), {
  type: "openNewSftpForm",
});
assert.deepEqual(locationSelectionAction({ kind: "sftpProfile", label: "dev", detail: "", profile }, localPane), {
  type: "openSftpProfileForm",
  profile,
});
assert.deepEqual(
  locationSelectionAction({ kind: "activeSftpSession", label: "@ remote", detail: "", activeSession }, localPane),
  {
    type: "openActiveSftpSession",
    connectionId: "conn-2",
    remotePath: "/home",
  },
);
assert.deepEqual(locationSelectionAction({ kind: "searchProfile", label: "Rust", detail: "", searchProfile }, localPane), {
  type: "openSearchProfile",
  profile: searchProfile,
});
assert.deepEqual(locationSelectionAction({ kind: "localPath", label: "root", detail: "/", path: "/" }, localPane), {
  type: "openLocalPath",
  path: "/",
  commandId: "location.openLocalPath",
});
assert.deepEqual(locationSelectionAction({ kind: "localFavorite", label: "work", detail: "/work", path: "/work" }, localPane), {
  type: "openLocalPath",
  path: "/work",
  commandId: "location.openLocalFavorite",
});
assert.deepEqual(locationSelectionAction({ kind: "local", label: "<Local>", detail: "" }, sftpPane), {
  type: "switchLocal",
  path: "/work",
});
assert.deepEqual(locationSelectionAction({ kind: "local", label: "<Local>", detail: "" }, localPane), {
  type: "switchLocalNoop",
});

assert.equal(locationSelectionRequiresLeavingSftp({ type: "openNewSftpForm" }), false);
assert.equal(locationSelectionRequiresLeavingSftp({ type: "openActiveSftpSession", connectionId: "conn-1", remotePath: "/" }), false);
assert.equal(locationSelectionRequiresLeavingSftp({ type: "switchLocal", path: "/work" }), true);
assert.equal(locationSelectionRequiresLeavingSftp({ type: "switchLocalNoop" }), true);

const options: LocationOption[] = [
  { kind: "local", label: "<Local>", detail: "" },
  { kind: "localPath", label: "<Root>", detail: "/", path: "/" },
];
assert.equal(focusedLocationOption(options, 0), options[0]);
assert.equal(focusedLocationOption(options, 20), options[1]);
assert.equal(focusedLocationOption([], 0), null);
