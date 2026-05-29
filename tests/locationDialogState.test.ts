import assert from "node:assert/strict";
import {
  acceptKnownHostPromptState,
  acceptSftpConnectSuccessState,
  armDeleteLocalFavoriteState,
  armDeleteSearchProfileState,
  armDeleteSftpProfileState,
  beginSftpConnectState,
  cancelKnownHostState,
  clearPendingDeletesState,
  clearSftpSecrets,
  closeManagerState,
  openManagerState,
  openNewSftpFormState,
  openSftpProfileFormState,
  patchSftpAuthKindState,
  patchSftpFormState,
  rejectSftpConnectState,
  returnToManagerState,
} from "../src/routes/locationDialogState";
import type {
  LocalFavoriteProfile,
  PendingKnownHost,
  SearchProfile,
  SftpConnectionForm,
  SftpConnectionProfile,
  SftpConnectionTestResult,
} from "../src/routes/types";

const form: SftpConnectionForm = {
  profileId: "profile-1",
  name: "dev",
  host: "example.test",
  port: "2222",
  username: "windy",
  authKind: "password",
  password: "secret",
  privateKeyPath: "",
  passphrase: "phrase",
  remotePath: "/srv",
  saveProfile: true,
};

const profile: SftpConnectionProfile = {
  id: "profile-1",
  name: "dev",
  host: "example.test",
  port: 2222,
  username: "windy",
  remotePath: "/srv",
  authKind: "privateKey",
  privateKeyPath: "/home/windy/.ssh/id_ed25519",
};

const favorite: LocalFavoriteProfile = { id: "fav-1", name: "Work", path: "/work" };
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
const knownHost: PendingKnownHost = {
  host: "example.test",
  port: 22,
  fingerprint: "SHA256:abc",
  knownHostsPath: "/home/user/.ssh/known_hosts",
};
const result: SftpConnectionTestResult = {
  connectionId: "conn-1",
  displayName: "dev",
  remotePath: "/srv",
  message: "ok",
};

assert.deepEqual(openManagerState(), {
  sftpDialogOpen: true,
  locationDialogMode: "manager",
  locationCursorIndex: 0,
  sftpConnecting: false,
  sftpConnectionError: "",
  sftpConnectionResult: null,
  pendingKnownHost: null,
  pendingDeleteProfile: null,
  pendingDeleteLocalFavorite: null,
  pendingDeleteSearchProfile: null,
});

assert.equal(closeManagerState(form).sftpDialogOpen, false);
assert.equal(closeManagerState(form).sftpForm?.password, "");
assert.equal(closeManagerState(form).imeComposing, false);

assert.equal(openNewSftpFormState().locationDialogMode, "sftpForm");
assert.equal(openNewSftpFormState().sftpForm?.port, "22");
assert.equal(openSftpProfileFormState(profile).sftpForm?.privateKeyPath, "/home/windy/.ssh/id_ed25519");
assert.equal(returnToManagerState(form).locationDialogMode, "manager");
assert.equal(returnToManagerState(form).sftpForm?.password, "");

assert.deepEqual(patchSftpFormState(form, { host: "other.test" }), {
  sftpForm: { ...form, host: "other.test" },
  pendingKnownHost: null,
});
assert.deepEqual(patchSftpAuthKindState(form, "privateKey"), {
  sftpForm: { ...form, authKind: "privateKey", password: "", passphrase: "" },
  pendingKnownHost: null,
  imeComposing: false,
});
assert.equal(clearSftpSecrets(form).password, "");
assert.equal(clearSftpSecrets(form).passphrase, "");

assert.deepEqual(clearPendingDeletesState(), {
  pendingDeleteProfile: null,
  pendingDeleteLocalFavorite: null,
  pendingDeleteSearchProfile: null,
});
assert.deepEqual(armDeleteSftpProfileState(profile), {
  pendingDeleteProfile: profile,
  pendingDeleteLocalFavorite: null,
  pendingDeleteSearchProfile: null,
});
assert.deepEqual(armDeleteLocalFavoriteState(favorite), {
  pendingDeleteLocalFavorite: favorite,
  pendingDeleteProfile: null,
  pendingDeleteSearchProfile: null,
});
assert.deepEqual(armDeleteSearchProfileState(searchProfile), {
  pendingDeleteSearchProfile: searchProfile,
  pendingDeleteProfile: null,
  pendingDeleteLocalFavorite: null,
});

assert.deepEqual(beginSftpConnectState(false), {
  sftpConnecting: true,
  sftpConnectionError: "",
  sftpConnectionResult: null,
  pendingKnownHost: null,
});
assert.equal(beginSftpConnectState(true).sftpConnectionError, "trusting host key...");
assert.equal(beginSftpConnectState(true).pendingKnownHost, undefined);

assert.equal(acceptSftpConnectSuccessState(form, result).sftpDialogOpen, false);
assert.deepEqual(acceptSftpConnectSuccessState(form, result).sftpConnectionResult, result);
assert.equal(acceptSftpConnectSuccessState(form, result).sftpForm?.password, "");
assert.deepEqual(acceptKnownHostPromptState(knownHost), {
  pendingKnownHost: knownHost,
  sftpConnectionError: "host key is not registered",
  imeComposing: false,
});
assert.deepEqual(rejectSftpConnectState(form, "auth failed"), {
  sftpForm: { ...form, password: "", passphrase: "" },
  pendingKnownHost: null,
  sftpConnectionError: "auth failed",
  imeComposing: false,
});
assert.deepEqual(cancelKnownHostState(), {
  pendingKnownHost: null,
  sftpConnectionError: "host key trust canceled",
});
