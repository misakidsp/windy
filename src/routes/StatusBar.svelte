<script lang="ts">
  import type { PaneId } from "./types";

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
  <span>active: {activePaneId}</span>
  <span>focus: {consoleFocused ? "console" : "pane"}</span>
  <span>console: {consoleState}</span>
  <span>command: {lastCommandId}</span>
  <span>key: {lastKey || "-"}</span>
  <span>select move: {moveCursorAfterSelection ? "on" : "off"}</span>
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
