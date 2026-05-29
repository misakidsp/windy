import { localFavoriteNameFromPath } from "./locationManagerModel";
import { searchProfileNameFromSource } from "./searchModel";
import { invokeCommand, invokeErrorMessage, type TauriInvoke } from "./tauriInvoke";
import type {
  ActiveSftpSession,
  LocalFavoriteProfile,
  PendingKnownHost,
  SearchPaneSource,
  SearchProfile,
  SftpConnectionForm,
  SftpConnectionProfile,
  SftpConnectionTestResult,
} from "./types";

export type { TauriInvoke } from "./tauriInvoke";

export type LocationProfilesSnapshot = {
  localFavorites: LocalFavoriteProfile[];
  searchProfiles: SearchProfile[];
  sftpProfiles: SftpConnectionProfile[];
};

export async function loadLocationProfiles(invoke: TauriInvoke): Promise<LocationProfilesSnapshot> {
  const [localFavorites, searchProfiles, sftpProfiles] = await Promise.all([
    invokeCommand<LocalFavoriteProfile[]>(invoke, "list_local_favorite_profiles"),
    invokeCommand<SearchProfile[]>(invoke, "list_search_profiles"),
    invokeCommand<SftpConnectionProfile[]>(invoke, "list_sftp_connection_profiles"),
  ]);
  return { localFavorites, searchProfiles, sftpProfiles };
}

export function listActiveSftpSessions(invoke: TauriInvoke): Promise<ActiveSftpSession[]> {
  return invokeCommand<ActiveSftpSession[]>(invoke, "list_active_sftp_sessions");
}

export function disconnectSftpSession(invoke: TauriInvoke, connectionId: string): Promise<void> {
  return invokeCommand<void>(invoke, "disconnect_sftp_connection", { connectionId });
}

export function saveSftpConnectionProfile(
  invoke: TauriInvoke,
  form: SftpConnectionForm,
): Promise<SftpConnectionProfile> {
  return invokeCommand<SftpConnectionProfile>(invoke, "save_sftp_connection_profile", {
    request: sftpProfileSaveRequestFromForm(form),
  });
}

export function saveLocalFavoriteProfile(invoke: TauriInvoke, path: string): Promise<LocalFavoriteProfile> {
  return invokeCommand<LocalFavoriteProfile>(invoke, "save_local_favorite_profile", {
    request: {
      id: null,
      name: localFavoriteNameFromPath(path),
      path,
    },
  });
}

export function saveSearchProfile(invoke: TauriInvoke, source: SearchPaneSource): Promise<SearchProfile> {
  return invokeCommand<SearchProfile>(invoke, "save_search_profile", {
    request: searchProfileSaveRequestFromSource(source),
  });
}

export function deleteSftpConnectionProfile(invoke: TauriInvoke, id: string): Promise<void> {
  return invokeCommand<void>(invoke, "delete_sftp_connection_profile", { id });
}

export function deleteLocalFavoriteProfile(invoke: TauriInvoke, id: string): Promise<void> {
  return invokeCommand<void>(invoke, "delete_local_favorite_profile", { id });
}

export function deleteSearchProfile(invoke: TauriInvoke, id: string): Promise<void> {
  return invokeCommand<void>(invoke, "delete_search_profile", { id });
}

export function testSftpConnection(
  invoke: TauriInvoke,
  form: SftpConnectionForm,
  trustHostKey: boolean,
): Promise<SftpConnectionTestResult> {
  return invokeCommand<SftpConnectionTestResult>(invoke, "test_sftp_connection", {
    request: sftpConnectionTestRequestFromForm(form, trustHostKey),
  });
}

export function parseKnownHostPrompt(error: unknown): PendingKnownHost | null {
  const text = invokeErrorMessage(error);
  const parts = text.split("\t");
  if (parts.length < 5 || parts[0] !== "WINDY_UNKNOWN_HOST_KEY") return null;
  const port = Number(parts[2]);
  if (!Number.isFinite(port)) return null;
  return {
    host: parts[1],
    port,
    fingerprint: parts[3],
    knownHostsPath: parts.slice(4).join("\t"),
  };
}

export function sftpConnectionTestRequestFromForm(form: SftpConnectionForm, trustHostKey: boolean) {
  return {
    name: form.name,
    host: form.host,
    port: Number(form.port),
    username: form.username,
    authKind: form.authKind,
    password: form.password,
    privateKeyPath: form.privateKeyPath,
    passphrase: form.passphrase,
    remotePath: form.remotePath,
    trustHostKey,
  };
}

export function sftpProfileSaveRequestFromForm(form: SftpConnectionForm) {
  return {
    id: form.profileId,
    name: form.name,
    host: form.host,
    port: Number(form.port),
    username: form.username,
    authKind: form.authKind,
    privateKeyPath: form.privateKeyPath,
    remotePath: form.remotePath,
  };
}

export function searchProfileSaveRequestFromSource(source: SearchPaneSource) {
  return {
    id: null,
    name: searchProfileNameFromSource(source),
    rootPath: source.rootPath,
    nameRegex: source.nameRegex,
    recursive: source.recursive,
    minSizeBytes: source.minSizeBytes,
    maxSizeBytes: source.maxSizeBytes,
    modifiedAfter: source.modifiedAfter,
    modifiedBefore: source.modifiedBefore,
    kind: source.searchKind,
    hiddenMode: source.hiddenMode,
    readonlyMode: source.readonlyMode,
  };
}
