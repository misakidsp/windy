import type {
  ActiveSftpSession,
  LocalFavoriteProfile,
  LocationOption,
  PaneState,
  SearchProfile,
  SftpConnectionForm,
  SftpConnectionProfile,
} from "./types";

export type BuildLocationOptionsInput = {
  activePane: PaneState;
  homePath: string;
  localRoots: string[];
  localFavorites: LocalFavoriteProfile[];
  searchProfiles: SearchProfile[];
  activeSftpSessions: ActiveSftpSession[];
  sftpProfiles: SftpConnectionProfile[];
};

export function buildLocationOptions({
  activePane,
  homePath,
  localRoots,
  localFavorites,
  searchProfiles,
  activeSftpSessions,
  sftpProfiles,
}: BuildLocationOptionsInput): LocationOption[] {
  const localDetail =
    activePane.source.kind === "sftp" ||
    activePane.source.kind === "diff" ||
    activePane.source.kind === "operationResult" ||
    activePane.source.kind === "gitStatus"
      ? `return to ${activePane.source.returnPath || "(local)"}`
      : "stay on current local source";
  const rootOptions = normalizedLocalRoots(localRoots).map((path) => ({
    kind: "localPath" as const,
    label: localRootLabel(path),
    detail: path,
    path,
  }));

  return [
    { kind: "local", label: "<Local>", detail: localDetail },
    ...rootOptions,
    {
      kind: "localPath",
      label: "<Home>",
      detail: homePath || "(home unresolved)",
      path: homePath,
    },
    ...localFavorites.map((favorite) => ({
      kind: "localFavorite" as const,
      label: favorite.name,
      detail: favorite.path,
      path: favorite.path,
      localFavorite: favorite,
    })),
    ...searchProfiles.map((profile) => ({
      kind: "searchProfile" as const,
      label: profile.name,
      detail: `search:${profile.rootPath} [${profile.nameRegex || "*"}${profile.recursive ? ", recursive" : ""}]`,
      searchProfile: profile,
    })),
    ...activeSftpSessions.map((session) => ({
      kind: "activeSftpSession" as const,
      label: `@ ${session.displayName}`,
      detail: `${session.connectionId}:${session.remotePath}`,
      activeSession: session,
    })),
    ...sftpProfiles.map((profile) => ({
      kind: "sftpProfile" as const,
      label: profile.name,
      detail: `${profile.username}@${profile.host}:${profile.port}${profile.remotePath} (${profile.authKind})`,
      profile,
    })),
    { kind: "newSftp", label: "<New SFTP Connection>", detail: "create or test an SFTP profile" },
  ];
}

function normalizedLocalRoots(localRoots: string[]): string[] {
  const roots = localRoots.map((path) => path.trim()).filter(Boolean);
  return roots.length > 0 ? Array.from(new Set(roots)) : ["/"];
}

function localRootLabel(path: string): string {
  const driveMatch = path.match(/^([A-Za-z]):[\\/]?$/);
  return driveMatch ? `<${driveMatch[1].toUpperCase()}:>` : "<Root>";
}

export function locationOptionKey(option: LocationOption): string {
  if (option.kind === "activeSftpSession") return `activeSftp:${option.activeSession?.connectionId ?? option.label}`;
  if (option.kind === "sftpProfile") return `sftp:${option.profile?.id ?? option.label}`;
  if (option.kind === "searchProfile") return `search:${option.searchProfile?.id ?? option.label}`;
  if (option.kind === "localFavorite") return `localFavorite:${option.localFavorite?.id ?? option.path ?? option.label}`;
  if (option.kind === "localPath") return `localPath:${option.path ?? option.label}`;
  return option.kind;
}

export function clampLocationCursor(index: number, options: LocationOption[]): number {
  return Math.min(Math.max(index, 0), Math.max(options.length - 1, 0));
}

export function locationProfileIndex(options: LocationOption[], profileId: string): number {
  return options.findIndex((option) => option.kind === "sftpProfile" && option.profile?.id === profileId);
}

export function sftpFormFromProfile(profile: SftpConnectionProfile): SftpConnectionForm {
  return {
    profileId: profile.id,
    name: profile.name,
    host: profile.host,
    port: String(profile.port),
    username: profile.username,
    authKind: profile.authKind,
    password: "",
    privateKeyPath: profile.privateKeyPath ?? "",
    passphrase: "",
    remotePath: profile.remotePath,
    saveProfile: true,
  };
}

export function validateSftpConnectionForm(form: SftpConnectionForm): string {
  if (!form.host.trim()) return "host is required";
  const port = Number(form.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "port must be 1-65535";
  if (!form.username.trim()) return "username is required";
  if (form.authKind === "password" && !form.password) return "password is required";
  if (form.authKind === "privateKey" && !form.privateKeyPath.trim()) return "private key path is required";
  if (form.saveProfile && !form.name.trim()) return "profile name is required when saving";
  return "";
}

export function validateSftpProfileForm(form: SftpConnectionForm): string {
  if (!form.name.trim()) return "profile name is required";
  if (!form.host.trim()) return "host is required";
  const port = Number(form.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "port must be 1-65535";
  if (!form.username.trim()) return "username is required";
  if (form.authKind === "privateKey" && !form.privateKeyPath.trim()) return "private key path is required";
  return "";
}

export function localFavoriteNameFromPath(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  if (!normalized || normalized === "/") return "Root";
  return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}
