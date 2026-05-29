import assert from "node:assert/strict";
import {
  disconnectSftpSession,
  loadLocationProfiles,
  parseKnownHostPrompt,
  saveLocalFavoriteProfile,
  saveSearchProfile,
  saveSftpConnectionProfile,
  searchProfileSaveRequestFromSource,
  sftpConnectionTestRequestFromForm,
  sftpProfileSaveRequestFromForm,
  testSftpConnection,
  type TauriInvoke,
} from "../src/routes/locationSideEffects";
import type { SearchPaneSource, SftpConnectionForm } from "../src/routes/types";

const form: SftpConnectionForm = {
  profileId: "profile-1",
  name: "dev",
  host: "example.test",
  port: "2222",
  username: "windy",
  authKind: "privateKey",
  password: "secret",
  privateKeyPath: "/home/windy/.ssh/id_ed25519",
  passphrase: "phrase",
  remotePath: "/srv",
  saveProfile: true,
};

assert.deepEqual(sftpConnectionTestRequestFromForm(form, true), {
  name: "dev",
  host: "example.test",
  port: 2222,
  username: "windy",
  authKind: "privateKey",
  password: "secret",
  privateKeyPath: "/home/windy/.ssh/id_ed25519",
  passphrase: "phrase",
  remotePath: "/srv",
  trustHostKey: true,
});

assert.deepEqual(sftpProfileSaveRequestFromForm(form), {
  id: "profile-1",
  name: "dev",
  host: "example.test",
  port: 2222,
  username: "windy",
  authKind: "privateKey",
  privateKeyPath: "/home/windy/.ssh/id_ed25519",
  remotePath: "/srv",
});

assert.deepEqual(
  parseKnownHostPrompt("WINDY_UNKNOWN_HOST_KEY\texample.test\t22\tSHA256:abc\t/home/user/.ssh/known_hosts"),
  {
    host: "example.test",
    port: 22,
    fingerprint: "SHA256:abc",
    knownHostsPath: "/home/user/.ssh/known_hosts",
  },
);
assert.equal(parseKnownHostPrompt("plain error"), null);
assert.equal(parseKnownHostPrompt("WINDY_UNKNOWN_HOST_KEY\texample.test\tbad\tSHA256:abc\tknown_hosts"), null);

const source: SearchPaneSource = {
  kind: "search",
  location: "search:/work",
  displayName: "search",
  rootPath: "/work",
  returnPath: "/",
  nameRegex: ".*\\.rs",
  recursive: true,
  minSizeBytes: 1,
  maxSizeBytes: 1024,
  modifiedAfter: 100,
  modifiedBefore: 200,
  searchKind: "file",
  hiddenMode: "include",
  readonlyMode: "any",
  truncated: false,
};

assert.deepEqual(searchProfileSaveRequestFromSource(source), {
  id: null,
  name: "work .*\\.rs",
  rootPath: "/work",
  nameRegex: ".*\\.rs",
  recursive: true,
  minSizeBytes: 1,
  maxSizeBytes: 1024,
  modifiedAfter: 100,
  modifiedBefore: 200,
  kind: "file",
  hiddenMode: "include",
  readonlyMode: "any",
});

const calls: { command: string; args?: Record<string, unknown> }[] = [];
const invoke: TauriInvoke = async (command, args) => {
  calls.push({ command, args });
  if (command === "list_local_favorite_profiles") return [{ id: "fav-1", name: "Work", path: "/work" }] as never;
  if (command === "list_search_profiles") return [{ id: "search-1", name: "Rust", rootPath: "/work" }] as never;
  if (command === "list_sftp_connection_profiles") return [{ id: "sftp-1", name: "Dev", host: "host" }] as never;
  if (command === "save_sftp_connection_profile") return { id: "sftp-2", name: "dev", remotePath: "/srv", authKind: "privateKey" } as never;
  if (command === "save_local_favorite_profile") return { id: "fav-2", name: "src", path: "/work/src" } as never;
  if (command === "save_search_profile") return { id: "search-2", name: "work .*\\.rs" } as never;
  if (command === "test_sftp_connection") return { connectionId: "conn-1", displayName: "dev", remotePath: "/srv", message: "ok" } as never;
  return undefined as never;
};

async function run(): Promise<void> {
  const profiles = await loadLocationProfiles(invoke);
  assert.equal(profiles.localFavorites.length, 1);
  assert.equal(profiles.searchProfiles.length, 1);
  assert.equal(profiles.sftpProfiles.length, 1);

  await saveSftpConnectionProfile(invoke, form);
  await saveLocalFavoriteProfile(invoke, "/work/src");
  await saveSearchProfile(invoke, source);
  await testSftpConnection(invoke, form, false);
  await disconnectSftpSession(invoke, "conn-1");

  assert.deepEqual(
    calls.map((call) => call.command),
    [
      "list_local_favorite_profiles",
      "list_search_profiles",
      "list_sftp_connection_profiles",
      "save_sftp_connection_profile",
      "save_local_favorite_profile",
      "save_search_profile",
      "test_sftp_connection",
      "disconnect_sftp_connection",
    ],
  );
  assert.deepEqual(calls.at(-1), {
    command: "disconnect_sftp_connection",
    args: { connectionId: "conn-1" },
  });
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
