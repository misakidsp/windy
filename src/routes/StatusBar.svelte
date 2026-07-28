<script lang="ts">
  import type { PaneId } from "./types";
  import type { Translate } from "./localization";

  export let activePath = "";
  export let statusMessage = "";
  export let activePaneId: PaneId = "left";
  export let consoleFocused = false;
  export let consoleVisible = true;
  export let terminalFullscreen = false;
  export let terminalStarting = false;
  export let terminalStarted = false;
  export let lastCommandId = "";
  export let lastKey = "";
  export let moveCursorAfterSelection = false;
  export let t: Translate = (id) => id;

  $: consoleState = consoleVisible
    ? terminalFullscreen
      ? "fullscreen"
      : terminalStarting
        ? "starting"
        : terminalStarted
          ? "running"
          : "ready"
    : "hidden";
</script>

<footer class="status-bar">
  <span class="status-path" title={activePath}>{activePath || "-"}</span>
  <span class="status-message" title={statusMessage}>{statusMessage}</span>
  <span>{t("statusBar.active")}: {activePaneId}</span>
  <span>{t("statusBar.focus")}: {consoleFocused ? t("statusBar.focusConsole") : t("statusBar.focusPane")}</span>
  <span>{t("statusBar.console")}: {t(`statusBar.console.${consoleState}`)}</span>
  <span>{t("statusBar.command")}: {lastCommandId}</span>
  <span>{t("statusBar.key")}: {lastKey || "-"}</span>
  <span>{t("statusBar.selectMove")}: {moveCursorAfterSelection ? t("common.on") : t("common.off")}</span>
  <span>Windy</span>
</footer>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    gap: 14px;
    overflow: hidden;
    padding: 0 10px;
    border-top: 1px solid var(--windy-pane-border, #2f3540);
    background: var(--windy-pane-header-background, #252a33);
    color: var(--windy-app-foreground, #cbd5e1);
    font-size: 11px;
    white-space: nowrap;
  }

  .status-path {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--windy-app-foreground, #f8fafc);
    text-overflow: ellipsis;
  }

  .status-message {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--windy-terminal-foreground, #d1d5db);
    text-overflow: ellipsis;
  }

  .status-bar span:not(.status-path, .status-message) {
    flex: 0 0 auto;
  }
</style>
