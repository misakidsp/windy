import type {
  ActiveSftpSession,
  LocalFavoriteProfile,
  LocationOption,
  PaneState,
  SearchProfile,
  SftpConnectionForm,
  SftpConnectionProfile,
} from "./types";
import { translateMessage, type Translate } from "./localization";

const fallbackTranslate: Translate = (id, values) => translateMessage(undefined, id, values);

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
}: BuildLocationOptionsInput, t: Translate = fallbackTranslate): LocationOption[] {
  const localDetail =
    activePane.source.kind === "sftp" ||
    activePane.source.kind === "diff" ||
    activePane.source.kind === "operationResult" ||
    activePane.source.kind === "gitStatus"
      ? t("location.option.returnToLocal", { path: activePane.source.returnPath || t("location.option.local") })
      : t("location.option.localCurrent");
  const rootOptions = normalizedLocalRoots(localRoots).map((path) => ({
    kind: "localPath" as const,
    label: localRootLabel(path, t),
    detail: path,
    path,
  }));

  return [
    { kind: "local", label: t("location.option.local"), detail: localDetail },
    ...rootOptions,
    {
      kind: "localPath",
      label: t("location.option.home"),
      detail: homePath || t("location.option.homeUnresolved"),
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
      detail: t("location.option.searchDetail", {
        rootPath: profile.rootPath,
        query: profile.nameRegex || "*",
        recursiveSuffix: profile.recursive ? t("location.option.searchRecursiveSuffix") : "",
      }),
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
      detail: t("location.option.sftpProfileDetail", {
        username: profile.username,
        host: profile.host,
        port: profile.port,
        remotePath: profile.remotePath,
        authKind: t(profile.authKind === "privateKey" ? "location.auth.privateKey" : "location.auth.password"),
      }),
      profile,
    })),
    { kind: "newSftp", label: t("location.option.newSftp"), detail: t("location.option.newSftpDetail") },
  ];
}

function normalizedLocalRoots(localRoots: string[]): string[] {
  const roots = localRoots.map((path) => path.trim()).filter(Boolean);
  return roots.length > 0 ? Array.from(new Set(roots)) : ["/"];
}

function localRootLabel(path: string, t: Translate): string {
  const driveMatch = path.match(/^([A-Za-z]):[\\/]?$/);
  return driveMatch ? `<${driveMatch[1].toUpperCase()}:>` : t("location.option.root");
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

export function validateSftpConnectionForm(form: SftpConnectionForm, t: Translate = fallbackTranslate): string {
  if (!form.host.trim()) return t("location.validation.hostRequired");
  const port = Number(form.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return t("location.validation.portRange");
  if (!form.username.trim()) return t("location.validation.usernameRequired");
  if (form.authKind === "password" && !form.password) return t("location.validation.passwordRequired");
  if (form.authKind === "privateKey" && !form.privateKeyPath.trim()) return t("location.validation.privateKeyPathRequired");
  if (form.saveProfile && !form.name.trim()) return t("location.validation.profileNameRequiredWhenSaving");
  return "";
}

export function validateSftpProfileForm(form: SftpConnectionForm, t: Translate = fallbackTranslate): string {
  if (!form.name.trim()) return t("location.validation.profileNameRequired");
  if (!form.host.trim()) return t("location.validation.hostRequired");
  const port = Number(form.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return t("location.validation.portRange");
  if (!form.username.trim()) return t("location.validation.usernameRequired");
  if (form.authKind === "privateKey" && !form.privateKeyPath.trim()) return t("location.validation.privateKeyPathRequired");
  return "";
}

export function localFavoriteNameFromPath(path: string, t: Translate = fallbackTranslate): string {
  const normalized = path.replace(/\/+$/, "");
  if (!normalized || normalized === "/") return t("location.rootLabel");
  return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}
