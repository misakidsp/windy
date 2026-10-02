<script lang="ts">
  import ActivityDetails from "./ActivityDetails.svelte";
  import { onMount } from "svelte";
  import "@xterm/xterm/css/xterm.css";
  import ExternalCommandDialog from "./ExternalCommandDialog.svelte";
  import FilePropertiesDialog from "./FilePropertiesDialog.svelte";
  import FilePane from "./FilePane.svelte";
  import InternalViewer from "./InternalViewer.svelte";
  import KeyHelpOverlay from "./KeyHelpOverlay.svelte";
  import LargeSearchResultDialog from "./LargeSearchResultDialog.svelte";
  import LocationManagerDialog from "./LocationManagerDialog.svelte";
  import OperationConfirmationDialog from "./OperationConfirmationDialog.svelte";
  import OperationFailureDialog from "./OperationFailureDialog.svelte";
  import PaneDiffDialog from "./PaneDiffDialog.svelte";
  import PreferencesDialog from "./PreferencesDialog.svelte";
  import SearchDialog from "./SearchDialog.svelte";
  import StatusBar from "./StatusBar.svelte";
  import TerminalPane from "./TerminalPane.svelte";
  import { defaultConsoleHeightRatio, moveCursorAfterSelection, showParentEntry } from "./constants";
  import { fileRowHeightSetting } from "./appearanceModel";
  import { formatDate, formatSize, paneMeta } from "./displayModel";
  import { paneHeaderLabel } from "./paneModel";
  import { locationOptionKey } from "./locationManagerModel";
  import { keyHelpGroups } from "./keyHelpModel";
  import { operationNameRequired, operationTargetPreviewLimit, shouldShowOperationPaths, targetSummary } from "./operationJobModel";
  import type { PaneId } from "./types";
  import { createWorkspace } from "./workspace/createWorkspace";
  import { mountWorkspace } from "./workspace/workspaceLifecycle";

  const { state, actions } = createWorkspace();
  onMount(() => mountWorkspace(state, actions));
</script>

<svelte:options runes={true} />

<svelte:head>
  <title>Windy</title>
</svelte:head>

<main
  bind:this={state.app.appShellElement}
  class:console-hidden={!state.terminal.consoleVisible}
  class:terminal-fullscreen={state.terminal.terminalFullscreen}
  class="app-shell"
  tabindex="-1"
  style={`--console-height: ${state.terminal.consoleVisible ? defaultConsoleHeightRatio * 100 : 0}%`}
>
  <section class="pane-grid" aria-label={state.settings.t("pane.filePanesAria")}>
    {#each (["left", "right"] as PaneId[]) as paneId}
      {@const pane = state.panes.panes[paneId]}
      {@const visible = actions.visibleEntries(pane)}
      <FilePane
        {pane}
        active={state.panes.activePaneId === paneId}
        visibleEntries={visible}
        virtualWindow={actions.virtualEntryWindow(paneId, visible)}
        rowHeight={fileRowHeightSetting(state.settings.appearanceSettings)}
        headerLabel={paneHeaderLabel(pane, state.settings.t)}
        meta={paneMeta(pane, visible, state.settings.t)}
        {showParentEntry}
        registerList={actions.registerList}
        registerFilterInput={actions.registerFilterInput}
        onListScroll={actions.handleFileListScroll}
        onQuickFilterInput={actions.updateQuickFilterQuery}
        onQuickFilterKeydown={actions.handleQuickFilterInputKeydown}
        entryClass={actions.entryClassWithDiff}
        entryNameStyle={actions.entryNameStyleWithAppearance}
        {formatSize}
        {formatDate}
        t={state.settings.t}
      />
    {/each}
  </section>

  <TerminalPane
    activity={state.activity}
    focused={state.terminal.consoleFocused}
    fullscreen={state.terminal.terminalFullscreen}
    visible={state.terminal.consoleVisible}
    bind:terminalElement={state.terminal.terminalElement}
    t={state.settings.t}
  />

  <StatusBar
    activePath={actions.activeFocusedEntryPath()}
    statusMessage={state.app.statusMessage}
    activityRecords={state.activity.records}
    activePaneId={state.panes.activePaneId}
    consoleFocused={state.terminal.consoleFocused}
    consoleVisible={state.terminal.consoleVisible}
    terminalFullscreen={state.terminal.terminalFullscreen}
    terminalStarting={state.terminal.terminalSession.starting}
    terminalStarted={state.terminal.terminalSession.started}
    lastCommandId={state.app.lastCommandId}
    lastKey={state.app.lastKey}
    {moveCursorAfterSelection}
    t={state.settings.t}
  />

  {#if state.activity.detailsId}
    {@const record = state.activity.records.find(record => record.id === state.activity.detailsId)}
    {#if record}<ActivityDetails bind:element={state.activity.detailsElement} {record} t={state.settings.t} />{/if}
  {/if}

  {#if state.viewer.viewer}
    <InternalViewer
      viewer={state.viewer.viewer}
      bind:surface={state.viewer.viewerElement}
      bind:pageSize={state.viewer.viewerPageSizeValue}
      onImageLoad={actions.handleViewerImageLoad}
      t={state.settings.t}
    />
  {/if}

  {#if state.app.keyHelpVisible}
    <KeyHelpOverlay groups={keyHelpGroups(state.settings.keybindSettings, state.settings.t)} t={state.settings.t} />
  {/if}

  {#if state.search.pendingLargeSearchResult}
    <LargeSearchResultDialog pending={state.search.pendingLargeSearchResult} t={state.settings.t} />
  {/if}

  {#if state.search.searchDialogOpen}
    <SearchDialog
      form={state.search.searchForm}
      running={state.search.searchRunning}
      error={state.search.searchError}
      bind:regexInputElement={state.search.searchRegexInputElement}
      onFormPatch={actions.updateSearchForm}
      onCompositionStart={() => (state.app.imeComposing = true)}
      onCompositionEnd={() => (state.app.imeComposing = false)}
      t={state.settings.t}
    />
  {/if}

  {#if state.locations.sftpDialogOpen}
    <LocationManagerDialog
      mode={state.locations.locationDialogMode}
      locationProfilesLoading={state.locations.locationProfilesLoading}
      locationProfilesError={state.locations.locationProfilesError}
      locationOptions={state.locations.locationOptionItems}
      locationCursorIndex={state.locations.locationCursorIndex}
      pendingDeleteProfile={state.locations.pendingDeleteProfile}
      pendingDeleteLocalFavorite={state.locations.pendingDeleteLocalFavorite}
      pendingDeleteSearchProfile={state.locations.pendingDeleteSearchProfile}
      sftpForm={state.locations.sftpForm}
      sftpConnecting={state.locations.sftpConnecting}
      sftpConnectionResult={state.locations.sftpConnectionResult}
      sftpConnectionError={state.locations.sftpConnectionError}
      pendingKnownHost={state.locations.pendingKnownHost}
      bind:hostInputElement={state.locations.sftpHostInputElement}
      bind:passwordInputElement={state.locations.sftpPasswordInputElement}
      optionKey={locationOptionKey}
      onSftpFormPatch={actions.updateSftpForm}
      onAuthKindChange={actions.updateSftpAuthKind}
      onCompositionStart={() => (state.app.imeComposing = true)}
      onCompositionEnd={() => (state.app.imeComposing = false)}
      t={state.settings.t}
    />
  {/if}

  {#if state.commands.commandDialogOpen}
    <ExternalCommandDialog
      commands={state.commands.externalCommands}
      loading={state.commands.externalCommandsLoading}
      error={state.commands.externalCommandError}
      cursorIndex={state.commands.externalCommandCursorIndex}
      sourceKind={state.panes.panes[state.panes.activePaneId].source.kind}
      targetCount={actions.selectedLocalCommandTargets().length}
      t={state.settings.t}
    />
  {/if}

  {#if state.operations.operationFailureDialog}
    <OperationFailureDialog snapshot={state.operations.operationFailureDialog} t={state.settings.t} />
  {/if}

  {#if state.inspection.filePropertiesDialog}
    <FilePropertiesDialog snapshot={state.inspection.filePropertiesDialog} t={state.settings.t} />
  {/if}

  {#if state.inspection.paneDiffDialog}
    <PaneDiffDialog snapshot={state.inspection.paneDiffDialog} bind:listElement={state.inspection.paneDiffListElement} t={state.settings.t} />
  {/if}

  {#if state.settings.preferencesDialogOpen}
    <PreferencesDialog
      appSettings={state.settings.appSettings}
      appearanceSettings={state.settings.appearanceSettings}
      keybindSettings={state.settings.keybindSettings}
      languageSettings={state.settings.languageSettings}
      languagePresets={state.settings.languagePresets}
      loading={state.settings.preferencesLoading}
      error={state.settings.preferencesError}
      onClose={() => {
        state.settings.preferencesDialogOpen = false;
        state.app.lastCommandId = "preferences.close";
      }}
      onOpenConfigDirectory={actions.openPreferencesConfigDirectory}
      onSaveAppSettings={actions.savePreferencesAppSettings}
      onSaveAppearanceSettings={actions.savePreferencesAppearanceSettings}
      onSaveKeybindSettings={actions.savePreferencesKeybindSettings}
      onApplyLanguagePreset={actions.applyPreferencesLanguagePreset}
      onReset={actions.resetPreferencesSettings}
      onEnterSafeMode={actions.enterPreferencesSafeMode}
      t={state.settings.t}
    />
  {/if}

  {#if state.operations.operationJob && state.operations.confirmationDialogOpen && (!state.operations.operationRunning || state.operations.operationCancelConfirmOpen)}
    <OperationConfirmationDialog
      job={state.operations.operationJob}
      result={state.operations.operationResult}
      running={state.operations.operationRunning}
      cancelRequested={state.operations.operationCancelRequested}
      cancelConfirmOpen={state.operations.operationCancelConfirmOpen}
      doubleEscEnabled={state.settings.appSettings.operationCancel.doubleEscEnabled}
      bind:nameInputElement={state.operations.operationNameInputElement}
      executionMessage={actions.executionConfirmationMessage(state.operations.operationJob)}
      targetSummary={targetSummary(state.operations.operationJob, state.settings.t)}
      showPaths={shouldShowOperationPaths(state.operations.operationJob)}
      nameRequired={operationNameRequired(state.operations.operationJob)}
      previewLimit={operationTargetPreviewLimit(state.operations.operationJob)}
      conflictMessages={actions.operationConflictMessages(state.operations.operationJob)}
      safetyMessages={actions.operationSafetyMessages(state.operations.operationJob)}
      onNameInput={actions.updateOperationName}
      t={state.settings.t}
    />
  {/if}
</main>

<style>
  @font-face {
    font-family: "UDEV Gothic";
    src: url("/fonts/UDEVGothic-Regular.ttf") format("truetype");
    font-style: normal;
    font-weight: 400;
    font-display: block;
  }

  @font-face {
    font-family: "UDEV Gothic";
    src: url("/fonts/UDEVGothic-Bold.ttf") format("truetype");
    font-style: normal;
    font-weight: 700;
    font-display: block;
  }

  @font-face {
    font-family: "UDEV Gothic";
    src: url("/fonts/UDEVGothic-Italic.ttf") format("truetype");
    font-style: italic;
    font-weight: 400;
    font-display: block;
  }

  @font-face {
    font-family: "UDEV Gothic";
    src: url("/fonts/UDEVGothic-BoldItalic.ttf") format("truetype");
    font-style: italic;
    font-weight: 700;
    font-display: block;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(html),
  :global(body) {
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: var(--windy-app-background, #181a1f);
    color: var(--windy-app-foreground, #e8e8e8);
    font-family: var(--windy-font-family, "UDEV Gothic", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace);
    font-size: var(--windy-ui-font-size, 12px);
  }

  :global(body) {
    user-select: none;
  }

  .app-shell {
    display: grid;
    grid-template-rows: minmax(0, 1fr) var(--console-height) 26px;
    height: 100vh;
    min-width: 760px;
    background: var(--windy-app-background, #1b1d22);
  }

  .app-shell,
  .app-shell * {
    pointer-events: none;
  }

  .app-shell.console-hidden .pane-grid {
    border-bottom: none;
  }

  .app-shell.terminal-fullscreen {
    grid-template-rows: minmax(0, 1fr) 26px;
  }

  .app-shell.terminal-fullscreen .pane-grid {
    display: none;
  }

  .pane-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    min-height: 0;
    border-bottom: 1px solid var(--windy-pane-border, #6b7280);
  }

</style>
