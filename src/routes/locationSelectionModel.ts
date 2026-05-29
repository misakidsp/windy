import type { LocationOption, PaneState, SearchProfile, SftpConnectionProfile } from "./types";

export type LocationSelectionAction =
  | { type: "openNewSftpForm" }
  | { type: "openSftpProfileForm"; profile: SftpConnectionProfile }
  | { type: "openActiveSftpSession"; connectionId: string; remotePath: string }
  | { type: "openSearchProfile"; profile: SearchProfile }
  | { type: "openLocalPath"; path: string; commandId: "location.openLocalPath" | "location.openLocalFavorite" }
  | { type: "switchLocal"; path: string }
  | { type: "switchLocalNoop" };

export function locationSelectionAction(option: LocationOption, activePane: PaneState): LocationSelectionAction {
  if (option.kind === "newSftp") return { type: "openNewSftpForm" };

  if (option.kind === "sftpProfile" && option.profile) {
    return { type: "openSftpProfileForm", profile: option.profile };
  }

  if (option.kind === "activeSftpSession" && option.activeSession) {
    return {
      type: "openActiveSftpSession",
      connectionId: option.activeSession.connectionId,
      remotePath: option.activeSession.remotePath,
    };
  }

  if (option.kind === "searchProfile" && option.searchProfile) {
    return { type: "openSearchProfile", profile: option.searchProfile };
  }

  if ((option.kind === "localPath" || option.kind === "localFavorite") && option.path) {
    return {
      type: "openLocalPath",
      path: option.path,
      commandId: option.kind === "localFavorite" ? "location.openLocalFavorite" : "location.openLocalPath",
    };
  }

  if (activePane.source.kind === "sftp" && activePane.source.returnPath) {
    return { type: "switchLocal", path: activePane.source.returnPath };
  }
  if (activePane.source.kind === "diff" && activePane.source.returnPath) {
    return { type: "switchLocal", path: activePane.source.returnPath };
  }
  if (activePane.source.kind === "operationResult" && activePane.source.returnPath) {
    return { type: "switchLocal", path: activePane.source.returnPath };
  }
  if (activePane.source.kind === "gitStatus" && activePane.source.returnPath) {
    return { type: "switchLocal", path: activePane.source.returnPath };
  }

  return { type: "switchLocalNoop" };
}

export function locationSelectionRequiresLeavingSftp(action: LocationSelectionAction): boolean {
  return action.type === "openSearchProfile" || action.type === "openLocalPath" || action.type === "switchLocal" || action.type === "switchLocalNoop";
}

export function focusedLocationOption(options: LocationOption[], cursorIndex: number): LocationOption | null {
  return options[Math.min(cursorIndex, options.length - 1)] ?? null;
}
