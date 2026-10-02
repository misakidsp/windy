import { createEmptySftpForm } from "../forms";
import type {
  ActiveSftpSession,
  LocalFavoriteProfile,
  LocationDialogMode,
  LocationOption,
  PendingKnownHost,
  SearchProfile,
  SftpConnectionForm,
  SftpConnectionProfile,
  SftpConnectionTestResult,
} from "../types";

export function createLocationsState() {
  let sftpDialogOpen = $state.raw(false);
  let locationDialogMode: LocationDialogMode = $state.raw("manager");
  let locationCursorIndex = $state.raw(0);
  let locationProfilesLoading = $state.raw(false);
  let locationProfilesLoaded = $state.raw(false);
  let locationProfilesLoadPromise: Promise<void> | null = $state.raw(null);
  let locationProfilesError = $state.raw("");
  let pendingDeleteProfile: SftpConnectionProfile | null = $state.raw(null);
  let pendingDeleteLocalFavorite: LocalFavoriteProfile | null = $state.raw(null);
  let pendingDeleteSearchProfile: SearchProfile | null = $state.raw(null);
  let homePath = $state.raw("");
  let localRoots: string[] = $state.raw([]);
  let localFavorites: LocalFavoriteProfile[] = $state.raw([]);
  let searchProfiles: SearchProfile[] = $state.raw([]);
  let sftpProfiles: SftpConnectionProfile[] = $state.raw([]);
  let activeSftpSessions: ActiveSftpSession[] = $state.raw([]);
  let sftpConnecting = $state.raw(false);
  let sftpConnectionResult: SftpConnectionTestResult | null = $state.raw(null);
  let sftpConnectionError = $state.raw("");
  let pendingKnownHost: PendingKnownHost | null = $state.raw(null);
  let sftpHostInputElement: HTMLInputElement | null = $state.raw(null);
  let sftpPasswordInputElement: HTMLInputElement | null = $state.raw(null);
  let sftpForm: SftpConnectionForm = $state.raw(createEmptySftpForm());
  let locationOptionItems: LocationOption[] = $state.raw([]);

  return {
    get sftpDialogOpen() { return sftpDialogOpen; },
    set sftpDialogOpen(value) { sftpDialogOpen = value; },
    get locationDialogMode() { return locationDialogMode; },
    set locationDialogMode(value: LocationDialogMode) { locationDialogMode = value; },
    get locationCursorIndex() { return locationCursorIndex; },
    set locationCursorIndex(value) { locationCursorIndex = value; },
    get locationProfilesLoading() { return locationProfilesLoading; },
    set locationProfilesLoading(value) { locationProfilesLoading = value; },
    get locationProfilesLoaded() { return locationProfilesLoaded; },
    set locationProfilesLoaded(value) { locationProfilesLoaded = value; },
    get locationProfilesLoadPromise() { return locationProfilesLoadPromise; },
    set locationProfilesLoadPromise(value: Promise<void> | null) { locationProfilesLoadPromise = value; },
    get locationProfilesError() { return locationProfilesError; },
    set locationProfilesError(value) { locationProfilesError = value; },
    get pendingDeleteProfile() { return pendingDeleteProfile; },
    set pendingDeleteProfile(value: SftpConnectionProfile | null) { pendingDeleteProfile = value; },
    get pendingDeleteLocalFavorite() { return pendingDeleteLocalFavorite; },
    set pendingDeleteLocalFavorite(value: LocalFavoriteProfile | null) { pendingDeleteLocalFavorite = value; },
    get pendingDeleteSearchProfile() { return pendingDeleteSearchProfile; },
    set pendingDeleteSearchProfile(value: SearchProfile | null) { pendingDeleteSearchProfile = value; },
    get homePath() { return homePath; },
    set homePath(value) { homePath = value; },
    get localRoots() { return localRoots; },
    set localRoots(value: string[]) { localRoots = value; },
    get localFavorites() { return localFavorites; },
    set localFavorites(value: LocalFavoriteProfile[]) { localFavorites = value; },
    get searchProfiles() { return searchProfiles; },
    set searchProfiles(value: SearchProfile[]) { searchProfiles = value; },
    get sftpProfiles() { return sftpProfiles; },
    set sftpProfiles(value: SftpConnectionProfile[]) { sftpProfiles = value; },
    get activeSftpSessions() { return activeSftpSessions; },
    set activeSftpSessions(value: ActiveSftpSession[]) { activeSftpSessions = value; },
    get sftpConnecting() { return sftpConnecting; },
    set sftpConnecting(value) { sftpConnecting = value; },
    get sftpConnectionResult() { return sftpConnectionResult; },
    set sftpConnectionResult(value: SftpConnectionTestResult | null) { sftpConnectionResult = value; },
    get sftpConnectionError() { return sftpConnectionError; },
    set sftpConnectionError(value) { sftpConnectionError = value; },
    get pendingKnownHost() { return pendingKnownHost; },
    set pendingKnownHost(value: PendingKnownHost | null) { pendingKnownHost = value; },
    get sftpHostInputElement() { return sftpHostInputElement; },
    set sftpHostInputElement(value: HTMLInputElement | null) { sftpHostInputElement = value; },
    get sftpPasswordInputElement() { return sftpPasswordInputElement; },
    set sftpPasswordInputElement(value: HTMLInputElement | null) { sftpPasswordInputElement = value; },
    get sftpForm() { return sftpForm; },
    set sftpForm(value: SftpConnectionForm) { sftpForm = value; },
    get locationOptionItems() { return locationOptionItems; },
    set locationOptionItems(value: LocationOption[]) { locationOptionItems = value; },
  };
}
