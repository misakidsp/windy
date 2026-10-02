import { invoke } from "@tauri-apps/api/core";
import { tick } from "svelte";
import { type LocationDialogKeyAction } from "../dialogKeyboardModel";
import {
  buildLocationOptions as buildLocationOptionsModel,
  clampLocationCursor,
  locationProfileIndex as findLocationProfileIndex,
  validateSftpConnectionForm,
  validateSftpProfileForm,
} from "../locationManagerModel";
import {
  focusedLocationOption,
  locationSelectionAction,
  locationSelectionRequiresLeavingSftp,
} from "../locationSelectionModel";
import {
  acceptKnownHostPromptState,
  acceptSftpConnectSuccessState,
  armDeleteLocalFavoriteState,
  armDeleteSearchProfileState,
  armDeleteSftpProfileState,
  beginSftpConnectState,
  cancelKnownHostState,
  clearPendingDeletesState,
  closeManagerState,
  finishSftpConnectState,
  openManagerState,
  openNewSftpFormState,
  openSftpProfileFormState,
  patchSftpAuthKindState,
  patchSftpFormState,
  rejectSftpConnectState,
  returnToManagerState,
  type LocationDialogStatePatch,
} from "../locationDialogState";
import {
  deleteLocalFavoriteProfile,
  deleteSearchProfile,
  deleteSftpConnectionProfile,
  disconnectSftpSession,
  listActiveSftpSessions,
  loadLocationProfiles,
  parseKnownHostPrompt,
  saveLocalFavoriteProfile,
  saveSearchProfile,
  saveSftpConnectionProfile,
  testSftpConnection,
} from "../locationSideEffects";
import {
  searchProfileMatchesSource,
  searchProfileNameFromSource,
  searchRequestFromProfile,
} from "../searchModel";
import type {
  LocalFavoriteProfile,
  LocationOption,
  PaneId,
  SearchProfile,
  SftpConnectionForm,
  SftpConnectionProfile,
  SftpPaneSource,
} from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

type Dependencies = Pick<WorkspaceActions,
  | "focusActivePaneAfterDialog"
  | "loadDirectory"
  | "loadSearchDirectory"
  | "loadSftpDirectory"
  | "localizedBackendError"
  | "localizedSftpConnectionMessage"
  | "paneConsolePath"
  | "sftpReturnPathForPane"
>;

export function createLocationsController(state: Pick<WorkspaceState, "activity" | "app" | "locations" | "panes" | "settings">, actions: Dependencies) {
  function applyLocationDialogStatePatch(patch: LocationDialogStatePatch): void {
    if (patch.sftpDialogOpen !== undefined) state.locations.sftpDialogOpen = patch.sftpDialogOpen;
    if (patch.locationDialogMode !== undefined) state.locations.locationDialogMode = patch.locationDialogMode;
    if (patch.locationCursorIndex !== undefined) state.locations.locationCursorIndex = patch.locationCursorIndex;
    if (patch.sftpConnecting !== undefined) state.locations.sftpConnecting = patch.sftpConnecting;
    if (patch.sftpConnectionError !== undefined) state.locations.sftpConnectionError = patch.sftpConnectionError;
    if (patch.sftpConnectionResult !== undefined) state.locations.sftpConnectionResult = patch.sftpConnectionResult;
    if (patch.pendingKnownHost !== undefined) state.locations.pendingKnownHost = patch.pendingKnownHost;
    if (patch.pendingDeleteProfile !== undefined) state.locations.pendingDeleteProfile = patch.pendingDeleteProfile;
    if (patch.pendingDeleteLocalFavorite !== undefined) state.locations.pendingDeleteLocalFavorite = patch.pendingDeleteLocalFavorite;
    if (patch.pendingDeleteSearchProfile !== undefined) state.locations.pendingDeleteSearchProfile = patch.pendingDeleteSearchProfile;
    if (patch.sftpForm !== undefined) state.locations.sftpForm = patch.sftpForm;
    if (patch.imeComposing !== undefined) state.app.imeComposing = patch.imeComposing;
  }

  function refreshLocationOptions(): void {
    state.locations.locationOptionItems = buildLocationOptionsModel({
      activePane: state.panes.panes[state.panes.activePaneId],
      homePath: state.locations.homePath,
      localRoots: state.locations.localRoots,
      localFavorites: state.locations.localFavorites,
      searchProfiles: state.locations.searchProfiles,
      activeSftpSessions: state.locations.activeSftpSessions,
      sftpProfiles: state.locations.sftpProfiles,
    }, state.settings.t);
    state.locations.locationCursorIndex = clampLocationCursor(state.locations.locationCursorIndex, state.locations.locationOptionItems);
  }

  function locationProfileIndex(profileId: string): number {
    return findLocationProfileIndex(state.locations.locationOptionItems, profileId);
  }

  async function refreshActiveSftpSessions(): Promise<void> {
    try {
      state.locations.activeSftpSessions = await listActiveSftpSessions(invoke);
      refreshLocationOptions();
    } catch (error) {
      state.app.notify("location.activeSftpLoadFailed", { error: actions.localizedBackendError(error) }, "failed", true);
    }
  }

  function paneUsesSftpConnection(paneId: PaneId, connectionId: string): boolean {
    return state.panes.panes[paneId].source.kind === "sftp" && state.panes.panes[paneId].source.connectionId === connectionId;
  }

  function sftpConnectionInUseByOtherPane(connectionId: string, paneId: PaneId): boolean {
    const otherPaneId = paneId === "left" ? "right" : "left";
    return paneUsesSftpConnection(otherPaneId, connectionId);
  }

  async function disconnectSftpConnection(connectionId: string): Promise<void> {
    await disconnectSftpSession(invoke, connectionId);
    state.locations.activeSftpSessions = state.locations.activeSftpSessions.filter((session) => session.connectionId !== connectionId);
    refreshLocationOptions();
  }

  async function disconnectSftpIfUnused(connectionId: string, leavingPaneId: PaneId): Promise<void> {
    if (sftpConnectionInUseByOtherPane(connectionId, leavingPaneId)) return;
    try {
      await disconnectSftpConnection(connectionId);
      state.app.notify("location.sftpSessionDisconnected", { connectionId }, "completed", true);
      state.app.lastCommandId = "remote.disconnectAuto";
    } catch (error) {
      state.app.notify("location.sftpSessionDisconnectFailed", { error: actions.localizedBackendError(error) }, "failed", true);
    }
  }

  async function maybeDisconnectLeavingSftpPane(paneId: PaneId): Promise<void> {
    const source = state.panes.panes[paneId].source;
    if (source.kind !== "sftp") return;
    if (state.settings.appSettings.sftpSession.lifecycle !== "disconnectOnLeave") return;
    await disconnectSftpIfUnused(source.connectionId, paneId);
  }

  async function enforceSftpSessionLimit(): Promise<void> {
    if (state.settings.appSettings.sftpSession.lifecycle !== "keepRecent") return;
    const maxSessions = Math.max(0, state.settings.appSettings.sftpSession.maxSessions || 0);
    if (maxSessions === 0) return;
    await refreshActiveSftpSessions();
    const protectedConnectionIds = new Set(
      (["left", "right"] as PaneId[])
        .map((paneId) => state.panes.panes[paneId].source)
        .filter((source): source is SftpPaneSource => source.kind === "sftp")
        .map((source) => source.connectionId),
    );
    const removable = [...state.locations.activeSftpSessions]
      .filter((session) => !protectedConnectionIds.has(session.connectionId))
      .sort((left, right) => left.lastUsedAt - right.lastUsedAt);
    while (state.locations.activeSftpSessions.length > maxSessions && removable.length > 0) {
      const session = removable.shift();
      if (!session) break;
      try {
        await disconnectSftpConnection(session.connectionId);
      } catch {
        break;
      }
    }
  }

  async function openSftpConnectionDialog(): Promise<void> {
    await ensureSftpProfilesLoaded(true);
    await refreshActiveSftpSessions();
    applyLocationDialogStatePatch(openManagerState());
    refreshLocationOptions();
    state.app.lastCommandId = "location.openManager";
  }

  function closeSftpConnectionDialog(): void {
    applyLocationDialogStatePatch(closeManagerState(state.locations.sftpForm));
    state.app.lastCommandId = "remote.connectionDialog.close";
    actions.focusActivePaneAfterDialog();
  }

  function openSftpFormFromLocationManager(): void {
    applyLocationDialogStatePatch(openNewSftpFormState());
    state.app.lastCommandId = "location.newSftp";
    void tick().then(() => {
      state.locations.sftpHostInputElement?.focus();
      state.locations.sftpHostInputElement?.select();
    });
  }

  function openSftpProfileFromLocationManager(profile: SftpConnectionProfile): void {
    applyLocationDialogStatePatch(openSftpProfileFormState(profile));
    state.app.lastCommandId = "location.openSftpProfile";
    void tick().then(() => {
      state.locations.sftpPasswordInputElement?.focus();
    });
  }

  async function chooseLocationOption(option: LocationOption): Promise<void> {
    const action = locationSelectionAction(option, state.panes.panes[state.panes.activePaneId]);
    if (action.type === "openNewSftpForm") {
      openSftpFormFromLocationManager();
      return;
    }

    if (action.type === "openSftpProfileForm") {
      openSftpProfileFromLocationManager(action.profile);
      return;
    }

    if (action.type === "openActiveSftpSession") {
      closeSftpConnectionDialog();
      state.app.lastCommandId = "location.openActiveSftpSession";
      await actions.loadSftpDirectory(state.panes.activePaneId, action.connectionId, action.remotePath, actions.sftpReturnPathForPane(state.panes.panes[state.panes.activePaneId]));
      return;
    }

    if (locationSelectionRequiresLeavingSftp(action)) {
      await maybeDisconnectLeavingSftpPane(state.panes.activePaneId);
    }

    if (action.type === "openSearchProfile") {
      closeSftpConnectionDialog();
      state.app.lastCommandId = "location.openSearchProfile";
      await actions.loadSearchDirectory(state.panes.activePaneId, searchRequestFromProfile(action.profile), action.profile.rootPath);
      return;
    }

    if (action.type === "openLocalPath") {
      closeSftpConnectionDialog();
      state.app.lastCommandId = action.commandId;
      await actions.loadDirectory(state.panes.activePaneId, action.path);
      return;
    }

    if (action.type === "switchLocal") {
      closeSftpConnectionDialog();
      state.app.lastCommandId = "location.switchLocal";
      await actions.loadDirectory(state.panes.activePaneId, action.path);
      return;
    }

    closeSftpConnectionDialog();
    state.app.notify("location.alreadyLocal", undefined, "completed", false);
    state.app.lastCommandId = "location.switchLocalNoop";
  }

  async function chooseFocusedLocationOption(): Promise<void> {
    const option = focusedLocationOption(state.locations.locationOptionItems, state.locations.locationCursorIndex);
    if (option) await chooseLocationOption(option);
  }

  function moveLocationCursor(delta: -1 | 1): void {
    state.locations.locationCursorIndex = clampLocationCursor(state.locations.locationCursorIndex + delta, state.locations.locationOptionItems);
    state.app.lastCommandId = "location.moveCursor";
  }

  async function ensureSftpProfilesLoaded(force = false): Promise<void> {
    if (state.locations.locationProfilesLoaded && !force) return;
    if (state.locations.locationProfilesLoadPromise && !force) {
      await state.locations.locationProfilesLoadPromise;
      return;
    }

    state.locations.locationProfilesLoadPromise = loadSftpProfiles();
    try {
      await state.locations.locationProfilesLoadPromise;
    } finally {
      state.locations.locationProfilesLoadPromise = null;
    }
  }

  async function loadSftpProfiles(): Promise<void> {
    state.locations.locationProfilesLoading = true;
    state.locations.locationProfilesError = "";
    try {
      const profiles = await loadLocationProfiles(invoke);
      state.locations.localFavorites = profiles.localFavorites;
      state.locations.searchProfiles = profiles.searchProfiles;
      state.locations.sftpProfiles = profiles.sftpProfiles;
      state.locations.locationProfilesLoaded = true;
      refreshLocationOptions();
      state.app.lastCommandId = "location.loadProfiles";
    } catch (error) {
      state.locations.locationProfilesError = actions.localizedBackendError(error);
      state.app.lastCommandId = "location.loadProfilesFailed";
    } finally {
      state.locations.locationProfilesLoading = false;
    }
  }

  function updateSftpForm(patch: Partial<SftpConnectionForm>): void {
    applyLocationDialogStatePatch(patchSftpFormState(state.locations.sftpForm, patch));
  }

  function updateSftpAuthKind(authKind: SftpConnectionForm["authKind"]): void {
    applyLocationDialogStatePatch(patchSftpAuthKindState(state.locations.sftpForm, authKind));
  }

  function resetSftpCompositionState(): void {
    state.app.imeComposing = false;
  }

  function returnToLocationManager(): void {
    applyLocationDialogStatePatch(returnToManagerState(state.locations.sftpForm));
    state.app.lastCommandId = "location.backToManager";
  }

  async function addCurrentSearchToProfiles(): Promise<void> {
    const source = state.panes.panes[state.panes.activePaneId].source;
    if (source.kind !== "search") {
      state.app.notify("location.searchProfileOnly", undefined, "warning", true);
      state.app.lastCommandId = "location.addSearchUnsupportedSource";
      return;
    }

    if (state.locations.searchProfiles.some((profile) => searchProfileMatchesSource(profile, source))) {
      state.app.notify("location.searchProfileDuplicate", { name: searchProfileNameFromSource(source, state.settings.t) }, "warning", true);
      state.app.lastCommandId = "location.addSearchProfileDuplicate";
      return;
    }

    state.locations.locationProfilesError = "";
    try {
      const profile = await saveSearchProfile(invoke, source, state.settings.t);
      await ensureSftpProfilesLoaded(true);
      if (!state.locations.searchProfiles.some((existing) => existing.id === profile.id)) {
        state.locations.searchProfiles = [...state.locations.searchProfiles, profile].sort((left, right) =>
          left.name.localeCompare(right.name, "ja-JP"),
        );
      }
      refreshLocationOptions();
      const searchIndex = state.locations.locationOptionItems.findIndex(
        (option) => option.kind === "searchProfile" && option.searchProfile?.id === profile.id,
      );
      if (searchIndex >= 0) state.locations.locationCursorIndex = searchIndex;
      state.app.notify("location.searchProfileAdded", { name: profile.name }, "completed", true);
      state.app.lastCommandId = "location.addSearchProfile";
    } catch (error) {
      state.locations.locationProfilesError = actions.localizedBackendError(error);
      state.app.notify("location.searchProfileAddFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "location.addSearchProfileFailed";
    }
  }

  async function addCurrentLocalPathToFavorites(): Promise<void> {
    const pane = state.panes.panes[state.panes.activePaneId];
    const path = pane.source.kind === "local" ? pane.currentPath : actions.paneConsolePath(pane);
    if (!path || pane.source.kind !== "local") {
      state.app.notify("location.localFavoriteOnly", undefined, "warning", true);
      state.app.lastCommandId = "location.addFavoriteUnsupportedSource";
      return;
    }

    if (state.locations.localFavorites.some((favorite) => favorite.path === path)) {
      state.app.notify("location.localFavoriteDuplicate", { path }, "warning", true);
      state.app.lastCommandId = "location.addFavoriteDuplicate";
      return;
    }

    state.locations.locationProfilesError = "";
    try {
      const favorite = await saveLocalFavoriteProfile(invoke, path, state.settings.t);
      await ensureSftpProfilesLoaded(true);
      if (!state.locations.localFavorites.some((existing) => existing.id === favorite.id)) {
        state.locations.localFavorites = [...state.locations.localFavorites, favorite].sort((left, right) =>
          left.name.localeCompare(right.name, "ja-JP"),
        );
      }
      refreshLocationOptions();
      const favoriteIndex = state.locations.locationOptionItems.findIndex(
        (option) => option.kind === "localFavorite" && option.localFavorite?.id === favorite.id,
      );
      if (favoriteIndex >= 0) state.locations.locationCursorIndex = favoriteIndex;
      state.app.notify("location.localFavoriteAdded", { name: favorite.name }, "completed", true);
      state.app.lastCommandId = "location.addFavorite";
    } catch (error) {
      state.locations.locationProfilesError = actions.localizedBackendError(error);
      state.app.notify("location.localFavoriteAddFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "location.addFavoriteFailed";
    }
  }

  async function addCurrentSourceToLocationManager(): Promise<void> {
    const source = state.panes.panes[state.panes.activePaneId].source;
    if (source.kind === "search") {
      await addCurrentSearchToProfiles();
      return;
    }
    await addCurrentLocalPathToFavorites();
  }

  async function saveSftpProfileFromForm(): Promise<void> {
    const savedProfile = await saveSftpConnectionProfile(invoke, state.locations.sftpForm);
    state.locations.sftpForm = {
      ...state.locations.sftpForm,
      profileId: savedProfile.id,
      name: savedProfile.name,
      remotePath: savedProfile.remotePath,
      authKind: savedProfile.authKind,
      privateKeyPath: savedProfile.privateKeyPath ?? "",
    };
    await ensureSftpProfilesLoaded(true);
    if (!state.locations.sftpProfiles.some((profile) => profile.id === savedProfile.id)) {
      state.locations.sftpProfiles = [...state.locations.sftpProfiles, savedProfile].sort((left, right) =>
        left.name.localeCompare(right.name, "ja-JP"),
      );
    }
    state.app.notify("location.sftpProfileSavedWithCount", { name: savedProfile.name, count: state.locations.sftpProfiles.length }, "completed", true);
  }

  async function saveSftpProfileOnlyFromForm(): Promise<void> {
    if (state.locations.sftpConnecting) return;
    const validationMessage = validateSftpProfileForm(state.locations.sftpForm, state.settings.t);
    if (validationMessage) {
      state.locations.sftpConnectionError = validationMessage;
      state.app.lastCommandId = "location.saveProfile.invalid";
      return;
    }

    state.locations.sftpConnectionError = "";
    state.locations.sftpConnectionResult = null;
    try {
      await saveSftpProfileFromForm();
      state.app.notify("location.sftpProfileSaved", { name: state.locations.sftpForm.name }, "completed", true);
      applyLocationDialogStatePatch(returnToManagerState(state.locations.sftpForm));
      await tick();
      refreshLocationOptions();
      const savedIndex = state.locations.sftpForm.profileId ? locationProfileIndex(state.locations.sftpForm.profileId) : -1;
      if (savedIndex >= 0) state.locations.locationCursorIndex = savedIndex;
      state.app.lastCommandId = "location.saveProfile";
    } catch (error) {
      state.locations.sftpConnectionError = actions.localizedBackendError(error);
      state.app.notify("location.sftpProfileSaveFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "location.saveProfileFailed";
    }
  }

  async function deleteFocusedSftpProfile(): Promise<void> {
    const options = state.locations.locationOptionItems;
    const option = options[Math.min(state.locations.locationCursorIndex, options.length - 1)];
    if (option?.kind === "localFavorite" && option.localFavorite) {
      await deleteFocusedLocalFavorite(option.localFavorite);
      return;
    }
    if (option?.kind === "searchProfile" && option.searchProfile) {
      await deleteFocusedSearchProfile(option.searchProfile);
      return;
    }
    if (option?.kind !== "sftpProfile" || !option.profile || state.locations.locationProfilesLoading) {
      applyLocationDialogStatePatch(clearPendingDeletesState());
      state.app.notify("location.selectSftpProfileBeforeDelete", undefined, "completed", true);
      state.app.lastCommandId = "location.deleteProfileNoTarget";
      return;
    }
    const profile = option.profile;

    if (state.locations.pendingDeleteProfile?.id !== profile.id) {
      applyLocationDialogStatePatch(armDeleteSftpProfileState(profile));
      state.app.notify("location.confirmDeleteSftpProfileStatus", { name: profile.name }, "completed", false);
      state.app.lastCommandId = "location.deleteProfileArm";
      return;
    }

    state.locations.locationProfilesError = "";
    try {
      await deleteSftpConnectionProfile(invoke, profile.id);
      state.locations.sftpProfiles = state.locations.sftpProfiles.filter((existingProfile) => existingProfile.id !== profile.id);
      applyLocationDialogStatePatch(clearPendingDeletesState());
      await tick();
      refreshLocationOptions();
      state.app.notify("location.sftpProfileDeleted", { name: profile.name }, "completed", true);
      state.app.lastCommandId = "location.deleteProfile";
    } catch (error) {
      state.locations.locationProfilesError = actions.localizedBackendError(error);
      state.app.notify("location.sftpProfileDeleteFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "location.deleteProfileFailed";
    }
  }

  async function disconnectFocusedActiveSftpSession(): Promise<void> {
    const option = state.locations.locationOptionItems[Math.min(state.locations.locationCursorIndex, state.locations.locationOptionItems.length - 1)];
    if (option?.kind !== "activeSftpSession" || !option.activeSession) {
      state.app.notify("location.selectActiveSftpBeforeDisconnect", undefined, "completed", true);
      state.app.lastCommandId = "remote.disconnectNoTarget";
      return;
    }

    const { connectionId } = option.activeSession;
    for (const paneId of ["left", "right"] as PaneId[]) {
      const source = state.panes.panes[paneId].source;
      if (source.kind === "sftp" && source.connectionId === connectionId) {
        await actions.loadDirectory(paneId, source.returnPath || state.locations.homePath);
      }
    }

    try {
      await disconnectSftpConnection(connectionId);
      state.app.notify("location.sftpSessionDisconnected", { connectionId }, "completed", true);
      state.app.lastCommandId = "remote.disconnect";
    } catch (error) {
      state.app.notify("location.sftpSessionDisconnectFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "remote.disconnectFailed";
    }
  }

  async function deleteFocusedLocalFavorite(favorite: LocalFavoriteProfile): Promise<void> {
    if (state.locations.locationProfilesLoading) return;

    if (state.locations.pendingDeleteLocalFavorite?.id !== favorite.id) {
      applyLocationDialogStatePatch(armDeleteLocalFavoriteState(favorite));
      state.app.notify("location.confirmDeleteLocalFavoriteStatus", { name: favorite.name }, "completed", false);
      state.app.lastCommandId = "location.deleteLocalFavoriteArm";
      return;
    }

    state.locations.locationProfilesError = "";
    try {
      await deleteLocalFavoriteProfile(invoke, favorite.id);
      state.locations.localFavorites = state.locations.localFavorites.filter((existingFavorite) => existingFavorite.id !== favorite.id);
      applyLocationDialogStatePatch(clearPendingDeletesState());
      await tick();
      refreshLocationOptions();
      state.app.notify("location.localFavoriteDeleted", { name: favorite.name }, "completed", true);
      state.app.lastCommandId = "location.deleteLocalFavorite";
    } catch (error) {
      state.locations.locationProfilesError = actions.localizedBackendError(error);
      state.app.notify("location.localFavoriteDeleteFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "location.deleteLocalFavoriteFailed";
    }
  }

  async function deleteFocusedSearchProfile(profile: SearchProfile): Promise<void> {
    if (state.locations.locationProfilesLoading) return;

    if (state.locations.pendingDeleteSearchProfile?.id !== profile.id) {
      applyLocationDialogStatePatch(armDeleteSearchProfileState(profile));
      state.app.notify("location.confirmDeleteSearchProfileStatus", { name: profile.name }, "completed", false);
      state.app.lastCommandId = "location.deleteSearchProfileArm";
      return;
    }

    state.locations.locationProfilesError = "";
    try {
      await deleteSearchProfile(invoke, profile.id);
      state.locations.searchProfiles = state.locations.searchProfiles.filter((existingProfile) => existingProfile.id !== profile.id);
      applyLocationDialogStatePatch(clearPendingDeletesState());
      await tick();
      refreshLocationOptions();
      state.app.notify("location.searchProfileDeleted", { name: profile.name }, "completed", true);
      state.app.lastCommandId = "location.deleteSearchProfile";
    } catch (error) {
      state.locations.locationProfilesError = actions.localizedBackendError(error);
      state.app.notify("location.searchProfileDeleteFailed", { error: actions.localizedBackendError(error) }, "failed", true);
      state.app.lastCommandId = "location.deleteSearchProfileFailed";
    }
  }

  async function testSftpConnectionFromDialog(trustHostKey = false): Promise<void> {
    if (state.locations.sftpConnecting) return;
    const validationMessage = validateSftpConnectionForm(state.locations.sftpForm, state.settings.t);
    if (validationMessage) {
      state.locations.sftpConnectionError = validationMessage;
      state.app.lastCommandId = "remote.connectSftp.invalid";
      return;
    }

    const activityId = state.activity.begin({ id: "activity.connect", values: { host: state.locations.sftpForm.host } });
    applyLocationDialogStatePatch(beginSftpConnectState(trustHostKey, state.settings.t));
    state.app.lastCommandId = "remote.connectSftp";
    try {
      const result = await testSftpConnection(invoke, state.locations.sftpForm, trustHostKey);
      applyLocationDialogStatePatch({
        sftpConnectionResult: result,
        pendingKnownHost: null,
      });
      const connectionMessage = actions.localizedSftpConnectionMessage(result);
      state.app.statusMessage = connectionMessage;
      if (state.locations.sftpForm.saveProfile) {
        try {
          await saveSftpProfileFromForm();
          state.app.notify("location.profileSavedAfterConnection", { message: connectionMessage }, "completed", true);
        } catch (error) {
          state.app.notify("location.profileSaveFailedAfterConnection", { message: connectionMessage, error: actions.localizedBackendError(error) }, "failed", true);
          state.locations.sftpConnectionError = state.settings.t("location.profileSaveFailedInline", { error: actions.localizedBackendError(error) });
          state.app.lastCommandId = "remote.connectSftp.temporaryAfterSaveFailed";
        }
      }
      applyLocationDialogStatePatch(acceptSftpConnectSuccessState(state.locations.sftpForm, result));
      if (state.app.lastCommandId !== "remote.connectSftp.temporaryAfterSaveFailed") {
        state.app.lastCommandId = "remote.connectSftp.success";
      }
      await actions.loadSftpDirectory(state.panes.activePaneId, result.connectionId, result.remotePath, actions.sftpReturnPathForPane(state.panes.panes[state.panes.activePaneId]));
      await enforceSftpSessionLimit();
      state.activity.finish(activityId, state.locations.sftpConnectionError ? "warning" : "completed", { id: "activity.connected", values: { host: result.displayName } });
      actions.focusActivePaneAfterDialog();
    } catch (error) {
      const knownHostPrompt = parseKnownHostPrompt(error);
      state.activity.finish(activityId, knownHostPrompt ? "warning" : "failed", { id: knownHostPrompt ? "activity.hostConfirmation" : "location.sftpConnectionFailed", values: { error: actions.localizedBackendError(error) } });
      if (knownHostPrompt && !trustHostKey) {
        applyLocationDialogStatePatch(acceptKnownHostPromptState(knownHostPrompt, state.settings.t));
        state.app.notify("location.sftpUnknownHostKeyStatus", { host: knownHostPrompt.host, port: knownHostPrompt.port }, "warning", false);
        state.app.lastCommandId = "remote.connectSftp.unknownHostKey";
      } else {
        applyLocationDialogStatePatch(rejectSftpConnectState(state.locations.sftpForm, actions.localizedBackendError(error)));
        state.app.notify("location.sftpConnectionFailed", { error: actions.localizedBackendError(error) }, "failed", false);
        state.app.lastCommandId = "remote.connectSftp.failed";
      }
    } finally {
      applyLocationDialogStatePatch(finishSftpConnectState());
    }
  }

  async function runLocationDialogKeyAction(action: LocationDialogKeyAction): Promise<void> {
    if (action.type === "escapeCancelDelete") {
      applyLocationDialogStatePatch(clearPendingDeletesState());
      state.app.lastCommandId = "location.deleteCancel";
    } else if (action.type === "escapeCancelKnownHost") {
      applyLocationDialogStatePatch(cancelKnownHostState(state.settings.t));
      state.app.lastCommandId = "remote.connectSftp.knownHostCancel";
    } else if (action.type === "backToManager") {
      returnToLocationManager();
    } else if (action.type === "close") {
      closeSftpConnectionDialog();
    } else if (action.type === "confirmDelete") {
      await deleteFocusedSftpProfile();
    } else if (action.type === "chooseLocation") {
      await chooseFocusedLocationOption();
    } else if (action.type === "trustKnownHost") {
      await testSftpConnectionFromDialog(true);
    } else if (action.type === "connect") {
      await testSftpConnectionFromDialog();
    } else if (action.type === "saveProfile") {
      await saveSftpProfileOnlyFromForm();
    } else if (action.type === "moveCursor") {
      moveLocationCursor(action.delta);
    } else if (action.type === "addCurrentSource") {
      await addCurrentSourceToLocationManager();
    } else if (action.type === "disconnectSession") {
      await disconnectFocusedActiveSftpSession();
    } else if (action.type === "deleteSaved") {
      await deleteFocusedSftpProfile();
    }
  }

  return {
    applyLocationDialogStatePatch,
    refreshLocationOptions,
    locationProfileIndex,
    refreshActiveSftpSessions,
    paneUsesSftpConnection,
    sftpConnectionInUseByOtherPane,
    disconnectSftpConnection,
    disconnectSftpIfUnused,
    maybeDisconnectLeavingSftpPane,
    enforceSftpSessionLimit,
    openSftpConnectionDialog,
    closeSftpConnectionDialog,
    openSftpFormFromLocationManager,
    openSftpProfileFromLocationManager,
    chooseLocationOption,
    chooseFocusedLocationOption,
    moveLocationCursor,
    ensureSftpProfilesLoaded,
    loadSftpProfiles,
    updateSftpForm,
    updateSftpAuthKind,
    resetSftpCompositionState,
    returnToLocationManager,
    addCurrentSearchToProfiles,
    addCurrentLocalPathToFavorites,
    addCurrentSourceToLocationManager,
    saveSftpProfileFromForm,
    saveSftpProfileOnlyFromForm,
    deleteFocusedSftpProfile,
    disconnectFocusedActiveSftpSession,
    deleteFocusedLocalFavorite,
    deleteFocusedSearchProfile,
    testSftpConnectionFromDialog,
    runLocationDialogKeyAction,
  };
}
